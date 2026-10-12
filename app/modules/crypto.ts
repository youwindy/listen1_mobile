/**
 * NetEase `weapi` request encryption.
 *
 * The legacy app shipped two vendored files (`vendor/cryptojs_aes.js`,
 * `vendor/jsencrypt.js`) that were minified 2019 bundles. The rewrite keeps the
 * algorithm identical but builds it from supported pieces:
 *
 *   - AES-CBC and Base64/Hex/Utf8 codecs come from the `crypto-js` package.
 *   - RSA with zero padding is implemented here on top of `BigInt`, because
 *     NetEase requires textbook RSA (no PKCS#1 padding) which `jsencrypt` only
 *     offers through a non-standard `padding: 'RSA_ZERO_PADDING'` option.
 *
 * `weapi()` must produce byte-identical output to the legacy implementation;
 * `crypto.test.ts` pins this against the real NetEase public key.
 */
import CryptoJS from 'crypto-js';

/** Fixed IV and preset key used by the NetEase web client. */
const IV = '0102030405060708';
const PRESET_KEY = '0CoJUm6Qyw8W8jud';

/**
 * NetEase's 1024-bit RSA public key (SPKI/PEM).
 * Kept verbatim: changing a single byte breaks every request.
 */
export const NETEASE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDgtQn2JZ34ZC28NWYpAUd98iZ37BUrX/aKzmFbt7clFSs6sXqHauqKWqdtLkF2KexO40H1YTX8z2lSgBBOAxLsvaklV8k4cBFK9snQXE9/DDaFt6Rr7iVZMldczhC0JNgTz+SHXT6CBHuX3e9SdB1Ua44oncaTWz7OBGLbCiK45wIDAQAB
-----END PUBLIC KEY-----`;

const BASE62_CHARS =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Random base62 string used as the per-request secret key. */
export function getRandomBase62(length: number): string {
  let result = '';

  for (let i = 0; i < length; i += 1) {
    result += BASE62_CHARS[Math.floor(Math.random() * BASE62_CHARS.length)];
  }

  return result;
}

export function reverseString(str: string): string {
  return str.split('').reverse().join('');
}

/** AES-CBC encrypt and return the ciphertext as base64. */
export function aesEncrypt(text: string, key: string): string {
  const encrypted = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(IV),
    mode: CryptoJS.mode.CBC,
  });

  return encrypted.toString();
}

// --------------------------------------------------------------------------- RSA

/** Read a DER length field, returning the value and how many bytes it used. */
function readDerLength(bytes: Uint8Array, offset: number): { length: number; bytes: number } {
  const first = bytes[offset];
  if (first === undefined) throw new Error('RSA 公钥解析失败：长度字段越界');

  if ((first & 0x80) === 0) return { length: first, bytes: 1 };

  const count = first & 0x7f;
  // 0x80 is "indefinite length", which DER forbids for these keys.
  if (count === 0 || count > 4) throw new Error('RSA 公钥解析失败：不支持的长度编码');

  let length = 0;
  for (let i = 1; i <= count; i += 1) {
    const b = bytes[offset + i];
    if (b === undefined) throw new Error('RSA 公钥解析失败：长度字段越界');
    length = length * 256 + b;
  }

  return { length, bytes: 1 + count };
}

/** Read one DER tag/length/value triple starting at `offset`. */
function readDerElement(bytes: Uint8Array, offset: number) {
  const tag = bytes[offset];
  if (tag === undefined) throw new Error('RSA 公钥解析失败：数据截断');

  const { length, bytes: lengthBytes } = readDerLength(bytes, offset + 1);
  const start = offset + 1 + lengthBytes;
  const end = start + length;
  if (end > bytes.length) throw new Error('RSA 公钥解析失败：数据截断');

  return { tag, start, end, next: end };
}

/**
 * React Native provides `atob`, but the RN type definitions do not declare it,
 * so reach it through a narrow typed view of the global object.
 */
const globalScope = globalThis as typeof globalThis & {
  atob?: (data: string) => string;
  crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
};

/** Decode base64 to bytes without depending on `Buffer`. */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[\r\n\s]/g, '');
  const decode = globalScope.atob;

  if (typeof decode === 'function') {
    const binary = decode(clean);
    const out = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);

    return out;
  }

  // Manual decoder, used when atob is unavailable (e.g. under Jest on Node).
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    if (char === '=') break;
    const value = alphabet.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

/**
 * Convert a string to its UTF-8 bytes.
 *
 * `CryptoJS.enc.Utf8.parse` returns a WordArray whose final word is NOT
 * zero-padded, so reading `sigBytes` bytes straight out of `words` yields
 * `undefined` (→ 0) past the last complete word and silently corrupts any
 * payload whose length is not a multiple of four — which is exactly the case
 * for non-ASCII secret keys. Base64 round-tripping avoids that entirely.
 */
function utf8ToBytes(text: string): Uint8Array {
  return base64ToBytes(CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text)));
}

/** Exported for tests: byte-level equivalence with UTF-8 is security relevant. */
export const __test = { utf8ToBytes, base64ToBytes };

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;

  for (let i = 0; i < bytes.length; i += 1) value = (value << 8n) | BigInt(bytes[i]);

  return value;
}

export interface RsaPublicKey {
  modulus: bigint;
  exponent: bigint;
  /** Modulus length in bytes. */
  keySize: number;
}

/** Parsing walks the DER structure and builds BigInts; do it once per key. */
const keyCache = new Map<string, RsaPublicKey>();

/**
 * Parse an SPKI PEM public key.
 *
 * Structure emitted by `openssl rsa -pubout` for a 1024-bit key:
 *   SEQUENCE
 *     SEQUENCE                      -- AlgorithmIdentifier
 *       OID  rsaEncryption
 *       NULL
 *     BIT STRING                    -- subjectPublicKey
 *       SEQUENCE                    -- RSAPublicKey
 *         INTEGER modulus
 *         INTEGER publicExponent
 */
export function parseRsaPublicKey(pem: string): RsaPublicKey {
  const cached = keyCache.get(pem);
  if (cached) return cached;

  const der = base64ToBytes(
    pem
      .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '')
  );

  const outer = readDerElement(der, 0);
  if (outer.tag !== 0x30) throw new Error('RSA 公钥解析失败：缺少外层 SEQUENCE');

  let cursor = outer.start;
  const algorithm = readDerElement(der, cursor);
  if (algorithm.tag !== 0x30) throw new Error('RSA 公钥解析失败：缺少算法标识');
  cursor = algorithm.next;

  const bitString = readDerElement(der, cursor);
  if (bitString.tag !== 0x03) throw new Error('RSA 公钥解析失败：缺少 BIT STRING');

  // The BIT STRING body starts with one unused-bits byte, which must be 0 here.
  const inner = readDerElement(der, bitString.start + 1);
  if (inner.tag !== 0x30) throw new Error('RSA 公钥解析失败：缺少 RSAPublicKey');

  const modulusElement = readDerElement(der, inner.start);
  const exponentElement = readDerElement(der, modulusElement.next);
  if (modulusElement.tag !== 0x02 || exponentElement.tag !== 0x02) {
    throw new Error('RSA 公钥解析失败：缺少模数或指数');
  }

  // INTEGER contents are signed big-endian; a leading 0x00 keeps the value positive.
  const modulusBytes = der.subarray(modulusElement.start, modulusElement.end);
  const modulus =
    modulusBytes[0] === 0x00 ? bytesToBigInt(modulusBytes.subarray(1)) : bytesToBigInt(modulusBytes);
  const exponent = bytesToBigInt(der.subarray(exponentElement.start, exponentElement.end));

  const key: RsaPublicKey = {
    modulus,
    exponent,
    keySize: Math.ceil(modulus.toString(2).length / 8),
  };

  keyCache.set(pem, key);

  return key;
}

/** Modular exponentiation by square-and-multiply. */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;

  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % modulus;
    e >>= 1n;
    b = (b * b) % modulus;
  }

  return result;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  const getRandomValues = globalScope.crypto?.getRandomValues;

  if (typeof getRandomValues === 'function') {
    getRandomValues.call(globalScope.crypto, out);

    return out;
  }

  for (let i = 0; i < length; i += 1) out[i] = Math.floor(Math.random() * 256);

  return out;
}

/** Read an unsigned big-endian integer produced by `randomBytes`. */
function randomBlock(byteLength: number): { bytes: Uint8Array; value: bigint } {
  const bytes = randomBytes(byteLength);

  return { bytes, value: bytesToBigInt(bytes) };
}

/**
 * Textbook RSA ("RSA_ZERO_PADDING"): the message is right-aligned in a
 * modulus-sized buffer and encrypted without any padding scheme.
 * Returns the ciphertext as a lowercase hex string, like the legacy code did.
 *
 * `padding` is injectable so tests can pin exact ciphertext.
 */
export function rsaEncryptZeroPadding(
  text: string,
  publicKeyPem: string,
  key?: RsaPublicKey,
  padding?: Uint8Array
): string {
  const rsaKey = key ?? parseRsaPublicKey(publicKeyPem);
  const messageBytes = utf8ToBytes(text);
  const messageLength = messageBytes.length;

  if (messageLength > rsaKey.keySize) {
    throw new Error('RSA 加密失败：待加密数据超过密钥长度');
  }

  // The block must be numerically smaller than the modulus, otherwise the
  // modular exponentiation wraps and the result no longer decrypts. The top
  // bit of the modulus is always set, so a uniform 1024-bit block is too large
  // for every key whose modulus is not all-ones — re-roll until it fits.
  let block: Uint8Array;
  let blockValue: bigint;

  if (padding) {
    if (padding.length !== rsaKey.keySize) {
      throw new Error('RSA 加密失败：填充长度与密钥长度不匹配');
    }
    block = Uint8Array.from(padding);
    blockValue = bytesToBigInt(block);
    if (blockValue >= rsaKey.modulus) {
      throw new Error('RSA 加密失败：填充值不小于模数');
    }
  } else {
    let candidate = randomBlock(rsaKey.keySize);

    for (let attempt = 0; candidate.value >= rsaKey.modulus; attempt += 1) {
      if (attempt >= 1000) throw new Error('RSA 加密失败：无法生成合法的填充');
      candidate = randomBlock(rsaKey.keySize);
    }
    block = candidate.bytes;
    blockValue = candidate.value;
  }

  // Right-align the message, overwriting the tail of the padding.
  block.set(messageBytes, rsaKey.keySize - messageLength);
  blockValue = bytesToBigInt(block);

  const cipher = modPow(blockValue, rsaKey.exponent, rsaKey.modulus);
  let hex = cipher.toString(16);

  // Keep the ciphertext fixed-width, matching a full-size integer.
  const expectedHexLength = rsaKey.keySize * 2;
  if (hex.length < expectedHexLength) hex = hex.padStart(expectedHexLength, '0');

  return hex;
}

/**
 * Build the `params` / `encSecKey` pair the NetEase weapi endpoints expect.
 *
 * `secretKey` is injectable purely so tests can pin exact ciphertext.
 */
export function weapi(
  object: unknown,
  secretKey: string = getRandomBase62(16)
): { params: string; encSecKey: string } {
  const text = JSON.stringify(object);

  return {
    // The payload is AES-encrypted twice: once with the preset key, once with
    // the per-request secret key, which is itself RSA-encrypted.
    params: aesEncrypt(aesEncrypt(text, PRESET_KEY), secretKey),
    encSecKey: rsaEncryptZeroPadding(reverseString(secretKey), NETEASE_PUBLIC_KEY),
  };
}
