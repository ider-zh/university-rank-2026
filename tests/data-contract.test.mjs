import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateRelease } from '../scripts/validate-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { release } = JSON.parse(await readFile(resolve(root, 'src/data/release.json'), 'utf8'));
const base = `public/data/${release}`;

async function fixture(t) {
  const dir = await mkdtemp(resolve(tmpdir(), 'university-contract-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const path of ['src/data', base, `public/media/${release}`, `reports/${release}`]) {
    await cp(resolve(root, path), resolve(dir, path), { recursive: true });
  }
  return dir;
}

async function mutate(dir, path, change, updateHash = true) {
  const value = JSON.parse(await readFile(resolve(dir, path), 'utf8'));
  change(value);
  const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(resolve(dir, path), bytes);
  if (updateHash && path !== `${base}/manifest.json`) {
    const manifestPath = resolve(dir, `${base}/manifest.json`);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const entry = manifest.files.find(f => `public${f.path}` === path);
    entry.bytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
    await writeFile(manifestPath, JSON.stringify(manifest));
  }
}

test('real release contains six bilingual universities and bounded alumni samples', async () => {
  const result = await validateRelease(root);
  assert.equal(result.universities, 6);
  assert.equal(result.portraits, 96);
});

test('a partial sample cannot claim to be the complete ranking universe', async t => {
  const dir = await fixture(t);
  await mutate(dir, `${base}/manifest.json`, m => { m.scoring.completeUniverse = true; });
  await assert.rejects(validateRelease(dir), /completeUniverse/);
});

test('reject changed bytes even when the JSON remains valid', async t => {
  const dir = await fixture(t);
  await mutate(dir, `${base}/ranking/core.json`, c => { c.universities[0].names.en = 'tampered'; }, false);
  await assert.rejects(validateRelease(dir), /Size mismatch|Hash mismatch/);
});

test('reject duplicate university IDs with otherwise valid hashes', async t => {
  const dir = await fixture(t);
  await mutate(dir, `${base}/ranking/core.json`, c => { c.universities.push(c.universities[0]); });
  await assert.rejects(validateRelease(dir), /Duplicate university IDs/);
});

test('reject scores inconsistent with the five source metrics', async t => {
  const dir = await fixture(t);
  await mutate(dir, `${base}/ranking/core.json`, c => { c.universities[0].sourceScore = 0.123; });
  await assert.rejects(validateRelease(dir), /Source score does not match/);
});

test('reject stale sprite dimensions even with a valid manifest hash', async t => {
  const dir = await fixture(t);
  await mutate(dir, `${base}/universities/Q13371/alumni.json`, a => { a.sprite.width += 120; });
  await assert.rejects(validateRelease(dir), /Sprite width mismatch/);
});

test('reject mismatched person order and sprite coordinates', async t => {
  const dir = await fixture(t);
  await mutate(dir, `${base}/universities/Q13371/alumni.json`, a => { a.people.reverse(); });
  await assert.rejects(validateRelease(dir), /Sprite column\/order mismatch|Sprite row\/order mismatch/);
});

test('reject mixed-version profile references', async t => {
  const dir = await fixture(t);
  await mutate(dir, `${base}/universities/Q13371/profile.zh.json`, p => { p.release = 'sample-20000101T000000Z'; });
  await assert.rejects(validateRelease(dir));
});
