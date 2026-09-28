// Runs only against the unpublished staging directory, never an existing release.
import sharp from 'sharp';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(process.argv[2]);
if (!root.split('/').at(-1).startsWith('.export-staging-')) throw new Error('Expected unpublished export staging directory');
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const { release } = await readJson('src/data/release.json');
const base = `public/data/${release}`;
const core = await readJson(`${base}/ranking/core.json`);
const manifest = await readJson(`${base}/manifest.json`);
let saved = 0;
for (const university of core.universities) {
  if (!university.logo) continue;
  const oldPath = university.logo.url;
  const original = await readFile(resolve(root, `public${oldPath}`));
  const data = await sharp(original, { density: 144 }).resize(256, 256, { fit: 'inside' }).webp({ quality: 90 }).toBuffer();
  const url = `/media/${release}/logos/${university.id}.${hash(data).slice(0,16)}.webp`;
  await writeFile(resolve(root, `public${url}`), data);
  const entry = manifest.files.find(file => file.path === oldPath);
  Object.assign(entry, { path: url, bytes: data.length, sha256: hash(data) });
  university.logo.url = url;
  if (oldPath !== url) await unlink(resolve(root, `public${oldPath}`));
  saved += original.length - data.length;
}
const encodedCore = Buffer.from(JSON.stringify(core) + '\n');
await writeFile(resolve(root, `${base}/ranking/core.json`), encodedCore);
Object.assign(manifest.files.find(file => file.path === `/data/${release}/ranking/core.json`), { bytes: encodedCore.length, sha256: hash(encodedCore) });
manifest.files.sort((a,b) => a.path.localeCompare(b.path));
await writeFile(resolve(root, `${base}/manifest.json`), JSON.stringify(manifest) + '\n');
console.log(`Optimized logos; saved ${saved.toLocaleString()} bytes.`);
