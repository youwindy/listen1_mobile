// Analyse APK contents: total size per top-level group and the biggest entries.
// An APK is a zip; reading the central directory is enough (no unzip needed).
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('usage: node .tmp-apk-size.mjs <apk>');

const buf = readFileSync(file);

// Locate the End Of Central Directory record by scanning backwards.
let eocd = -1;
for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i -= 1) {
  if (buf.readUInt32LE(i) === 0x06054b50) {
    eocd = i;
    break;
  }
}
if (eocd === -1) throw new Error('EOCD not found');

const entryCount = buf.readUInt16LE(eocd + 10);
let offset = buf.readUInt32LE(eocd + 16);

const entries = [];
for (let i = 0; i < entryCount; i += 1) {
  if (buf.readUInt32LE(offset) !== 0x02014b50) break;
  const compressed = buf.readUInt32LE(offset + 20);
  const uncompressed = buf.readUInt32LE(offset + 24);
  const nameLen = buf.readUInt16LE(offset + 28);
  const extraLen = buf.readUInt16LE(offset + 30);
  const commentLen = buf.readUInt16LE(offset + 32);
  const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');

  entries.push({ name, compressed, uncompressed });
  offset += 46 + nameLen + extraLen + commentLen;
}

const totalCompressed = entries.reduce((sum, e) => sum + e.compressed, 0);

function group(name) {
  if (name.startsWith('lib/')) {
    const abi = name.split('/')[1];
    return `lib/${abi}`;
  }
  if (name.startsWith('assets/')) return 'assets';
  if (name.startsWith('res/')) return 'res';
  if (name === 'resources.arsc') return 'resources.arsc';
  if (name === 'classes.dex' || /^classes\d*\.dex$/.test(name)) return 'dex';
  if (name.startsWith('META-INF/')) return 'META-INF';
  return name.includes('/') ? name.split('/')[0] : '(root files)';
}

const byGroup = new Map();
for (const e of entries) {
  const key = group(e.name);
  const acc = byGroup.get(key) ?? { count: 0, compressed: 0 };
  acc.count += 1;
  acc.compressed += e.compressed;
  byGroup.set(key, acc);
}

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
console.log(`file            : ${file}`);
console.log(`zip entries     : ${entries.length}`);
console.log(`payload         : ${mb(totalCompressed)}`);
console.log(`file on disk    : ${mb(buf.length)}`);
console.log('');
console.log('--- by group (compressed) ---');
for (const [key, acc] of [...byGroup].sort((a, b) => b[1].compressed - a[1].compressed)) {
  console.log(
    `${mb(acc.compressed).padStart(10)}  ${String(((acc.compressed / totalCompressed) * 100).toFixed(1)).padStart(5)}%  ${String(acc.count).padStart(5)} files  ${key}`
  );
}

console.log('');
console.log('--- 25 largest entries (uncompressed) ---');
for (const e of [...entries].sort((a, b) => b.uncompressed - a.uncompressed).slice(0, 25)) {
  console.log(`${mb(e.uncompressed).padStart(10)}  ${e.name}`);
}

// The bundled JS is often the single biggest asset; report it explicitly.
const bundle = entries.find((e) => e.name === 'assets/index.android.bundle');
if (bundle) {
  console.log('');
  console.log(`assets/index.android.bundle: ${mb(bundle.uncompressed)} uncompressed, ${mb(bundle.compressed)} compressed`);
}
