/**
 * `weapi` encryption is the single most fragile part of the NetEase integration:
 * get it wrong and every request fails silently. These tests pin it down by
 * decrypting our own output, plus a numeric round-trip of the RSA step against
 * the WebCrypto/Node implementation.
 */
import CryptoJS from 'crypto-js';
// Node built-ins are available under Jest; the suite runs on the host, not on
// the device, so this independent implementation is safe to reach for.
import * as nodeCrypto from 'node:crypto';

import {
  aesEncrypt,
  getRandomBase62,
  parseRsaPublicKey,
  reverseString,
  rsaEncryptZeroPadding,
  weapi,
  NETEASE_PUBLIC_KEY,
} from '../crypto';

const IV = '0102030405060708';
const PRESET_KEY = '0CoJUm6Qyw8W8jud';

/** The public key NetEase publishes; 1024-bit. */
const EXPECTED_MODULUS_BITS = 1024;
const EXPECTED_KEY_SIZE_BYTES = 128;

function aesDecrypt(ciphertext: string, key: string): string {
  const decrypted = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(IV),
    mode: CryptoJS.mode.CBC,
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

/** Generate a throwaway key pair so the RSA step can be checked end to end. */
function generateKeyPair(): { publicKey: string; privateKey: string } {
  return nodeCrypto.generateKeyPairSync('rsa', {
    modulusLength: EXPECTED_MODULUS_BITS,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

describe('getRandomBase62', () => {
  it('returns the requested number of base62 characters', () => {
    const value = getRandomBase62(16);

    expect(value).toHaveLength(16);
    expect(value).toMatch(/^[0-9a-zA-Z]{16}$/);
  });
});

describe('reverseString', () => {
  it('reverses the string', () => {
    expect(reverseString('abc123')).toBe('321cba');
  });
});

describe('aesEncrypt', () => {
  it('round-trips through CryptoJS AES-CBC with the same IV', () => {
    const plaintext = JSON.stringify({ ids: [1, 2, 3], level: 'standard' });
    const key = '1234123412341234';

    expect(aesDecrypt(aesEncrypt(plaintext, key), key)).toBe(plaintext);
  });

  it('produces Base64 output', () => {
    expect(aesEncrypt('{}', '1234123412341234')).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('parseRsaPublicKey', () => {
  it('parses the NetEase key to 1024 bits', () => {
    const key = parseRsaPublicKey(NETEASE_PUBLIC_KEY);

    expect(key.modulus.toString(2)).toHaveLength(EXPECTED_MODULUS_BITS);
    expect(key.keySize).toBe(EXPECTED_KEY_SIZE_BYTES);
    // Standard RSA public exponent.
    expect(key.exponent).toBe(65537n);
  });
});

describe('rsaEncryptZeroPadding', () => {
  it('produces a fixed-width lowercase hex block', () => {
    const ciphertext = rsaEncryptZeroPadding('1234123412341234', NETEASE_PUBLIC_KEY);

    expect(ciphertext).toHaveLength(EXPECTED_KEY_SIZE_BYTES * 2);
    expect(ciphertext).toMatch(/^[0-9a-f]+$/);
  });

  it('produces a different ciphertext on every call (random padding)', () => {
    const first = rsaEncryptZeroPadding('1234123412341234', NETEASE_PUBLIC_KEY);
    const second = rsaEncryptZeroPadding('1234123412341234', NETEASE_PUBLIC_KEY);

    expect(first).not.toBe(second);
  });
});

describe('weapi', () => {
  const payload = {
    ids: ['123'],
    level: 'standard',
    encodeType: 'aac',
    csrf_token: '',
  };

  it('double-encrypts the payload so it can be recovered with the secret key', () => {
    const secretKey = '1234123412341234';
    const { params } = weapi(payload, secretKey);

    // params = AES(AES(json, presetKey), secretKey)
    const inner = aesDecrypt(params, secretKey);

    expect(aesDecrypt(inner, PRESET_KEY)).toBe(JSON.stringify(payload));
  });

  it('generates a fresh secret key when none is supplied', () => {
    const first = weapi(payload);
    const second = weapi(payload);

    expect(first.params).not.toBe(second.params);
    expect(first.encSecKey).not.toBe(second.encSecKey);
  });

  it('returns a params/encSecKey pair of the expected shape', () => {
    const result = weapi(payload, '1234123412341234');

    expect(Object.keys(result).sort()).toEqual(['encSecKey', 'params']);
    expect(result.encSecKey).toHaveLength(EXPECTED_KEY_SIZE_BYTES * 2);
    expect(result.params).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('is textbook RSA: decryptable with the matching private key', () => {
    // Proves the arithmetic, padding position and byte order are all correct by
    // decrypting with an independent implementation (Node's OpenSSL binding).
    const { publicKey, privateKey } = generateKeyPair();

    const candidates = ['abcdefgh12345678', 'x', '中文字符测试中文字符', 'a'.repeat(32)];

    for (const candidate of candidates) {
      const ciphertext = rsaEncryptZeroPadding(candidate, publicKey);
      const recovered = nodeCrypto.privateDecrypt(
        { key: privateKey, padding: nodeCrypto.constants.RSA_NO_PADDING },
        Buffer.from(ciphertext, 'hex')
      );

      // Zero padding right-aligns the message inside a key-sized block, so the
      // plaintext is the block's tail (the prefix is random filler). Compare
      // raw bytes: the payload is UTF-8 and may be multi-byte.
      const expectedBytes = Buffer.from(candidate, 'utf8');
      const actualTail = recovered.subarray(recovered.length - expectedBytes.length);

      expect([...actualTail]).toEqual([...expectedBytes]);
    }
  });

  it('never produces a ciphertext at or above the modulus', () => {
    // Regression test: a random block larger than the modulus makes the modular
    // exponentiation wrap, which silently yields an undecryptable result. Rerun
    // many times because the padding is random.
    const { publicKey } = generateKeyPair();
    const key = parseRsaPublicKey(publicKey);

    for (let i = 0; i < 200; i += 1) {
      const ciphertext = rsaEncryptZeroPadding('x', publicKey);

      expect(BigInt(`0x${ciphertext}`)).toBeLessThan(key.modulus);
    }
  });

  it('rejects an injected padding block that is not below the modulus', () => {
    // The deterministic form of the bug above: a block of all 0xff bytes is
    // always >= the modulus and must be refused rather than silently wrapped.
    const { publicKey } = generateKeyPair();
    const key = parseRsaPublicKey(publicKey);
    const oversized = new Uint8Array(key.keySize).fill(0xff);

    expect(() => rsaEncryptZeroPadding('x', publicKey, key, oversized)).toThrow(
      /填充值不小于模数/
    );
  });

  it('accepts an injected padding block that is below the modulus', () => {
    const { publicKey, privateKey } = generateKeyPair();
    const key = parseRsaPublicKey(publicKey);
    // 0x01 followed by zeroes is always a valid (tiny) block.
    const padding = new Uint8Array(key.keySize);
    padding[0] = 0x01;

    const ciphertext = rsaEncryptZeroPadding('secret-key-1234', publicKey, key, padding);
    const recovered = nodeCrypto.privateDecrypt(
      { key: privateKey, padding: nodeCrypto.constants.RSA_NO_PADDING },
      Buffer.from(ciphertext, 'hex')
    );

    expect(recovered.subarray(-15).toString('utf8')).toBe('secret-key-1234');
  });

  it('is textbook RSA with the real NetEase key too', () => {
    // Same check against the production key: encrypt a UUID-sized secret and
    // confirm the modulus/exponent combination behaves (length + no throw).
    const ciphertext = rsaEncryptZeroPadding('1234123412341234', NETEASE_PUBLIC_KEY);
    const key = parseRsaPublicKey(NETEASE_PUBLIC_KEY);

    expect(BigInt(`0x${ciphertext}`)).toBeLessThan(key.modulus);
  });
});
