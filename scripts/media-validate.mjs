import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {isReviewedOfficialLogo} from './official-logo-policy.mjs';
import {isStandaloneMotto} from './logo-policy.mjs';

const root = resolve(process.argv[2] || '.');
const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const {release} = await read('src/data/catalog.json');
const core = await read(`public/data/${release}/ranking.json`);
const manifest = await read(`public/media/${release}/manifest.json`);
assert.equal(manifest.release, release);
assert.equal(manifest.schemaVersion, '1.0.0');
assert.deepEqual(Object.keys(manifest.universities).sort(), core.universities.map(row => row.id).sort());
let bytes = 0, logos = 0, heroes = 0;
for (const [id, entry] of Object.entries(manifest.universities)) {
  const detail = await read(`public/media/${release}/universities/${id}.json`);
  assert.deepEqual(detail, {release,id,...entry});
  for (const kind of ['logo','hero']) {
    const asset = entry[kind];
    if (!asset) continue;
    assert.match(asset.url, new RegExp(`^/media/${release}/${kind}s/${id}\\.[a-f0-9]{16}\\.webp$`));
    if(kind==='logo')assert.equal(isStandaloneMotto(asset.commonsTitle || ''),false,`Standalone motto is not a logo: ${id}`);
    if(!isReviewedOfficialLogo(id,kind,asset)) {
      assert.match(asset.sourcePage, /^https:\/\/commons\.wikimedia\.org\//);
      assert.match(asset.license, /^(CC BY(?:-SA)? (?:[1-4]\.0|2\.5)|CC0|Public domain|Copyrighted free use)$/);
    }
    assert.ok(asset.artist && !/<[^>]+>/.test(asset.artist));
    assert.match(asset.licenseUrl, /^https?:\/\//);
    if (asset.license === 'Copyrighted free use') {
      assert.equal(asset.licenseUrl,'https://commons.wikimedia.org/wiki/Template:Copyrighted_free_use');
      assert.deepEqual(asset.permissionEvidence,{template:'Copyrighted free use',credit:'Own work',attributionRequired:false});
      assert.ok(asset.categories.split('|').includes('Copyrighted free use'));
    }
    const data = await readFile(resolve(root, `public${asset.url}`));
    assert.equal(data.length, asset.bytes);
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256);
    const metadata = await sharp(data).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, asset.width);
    assert.equal(metadata.height, asset.height);
    assert.ok(asset.width <= (kind === 'logo' ? 160 : 1440));
    assert.ok(asset.height <= (kind === 'logo' ? 160 : 960));
    bytes += data.length;
    if (kind === 'logo') logos++; else heroes++;
  }
}
assert.deepEqual({universities:core.universities.length,logos,heroes,bytes}, {
  universities:manifest.counts.universities,logos:manifest.counts.logos,heroes:manifest.counts.heroes,bytes:manifest.counts.bytes,
});
console.log(`Media validated: ${logos} logos, ${heroes} campus photos, ${bytes.toLocaleString()} bytes.`);
