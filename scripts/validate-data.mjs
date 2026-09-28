import Ajv from 'ajv';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(await readFile(resolve(project, 'schemas/release.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addSchema(schema);
const validators = Object.fromEntries(['manifest', 'core', 'profile', 'alumni'].map(name =>
  [name, ajv.compile({ $ref: `${schema.$id}#/definitions/${name}` })]));

function checkSchema(name, data) {
  assert(validators[name](data), `${name}: ${ajv.errorsText(validators[name].errors)}`);
}

async function listFiles(dir) {
  const items = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(items.map(item => item.isDirectory() ? listFiles(resolve(dir, item.name)) : [resolve(dir, item.name)]))).flat();
}

export async function validateRelease(root = project) {
  const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const { release } = await json('src/data/release.json');
  assert(/^sample-\d{8}T\d{6}Z$/.test(release), 'Invalid release pointer');
  const base = `public/data/${release}`;
  const manifest = await json(`${base}/manifest.json`);
  checkSchema('manifest', manifest);
  assert.equal(manifest.release, release);
  assert(Math.abs(Object.values(manifest.scoring.weights).reduce((a,b) => a+b,0)-1) < 1e-12, 'Weights must sum to one');
  const inventory = new Set();
  for (const file of manifest.files) {
    assert(!file.path.split('/').includes('..'), 'Unsafe file path');
    assert(file.path.startsWith(`/data/${release}/`) || file.path.startsWith(`/media/${release}/`), 'Mixed release paths');
    assert(!inventory.has(file.path), 'Duplicate manifest file');
    inventory.add(file.path);
    const bytes = await readFile(resolve(root, `public${file.path}`));
    assert.equal(bytes.length, file.bytes, `Size mismatch: ${file.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Hash mismatch: ${file.path}`);
  }
  const actual = (await Promise.all([listFiles(resolve(root, base)), listFiles(resolve(root, `public/media/${release}`))])).flat()
    .map(p => '/' + relative(resolve(root, 'public'), p).split('\\').join('/'))
    .filter(p => p !== `/data/${release}/manifest.json`);
  assert.deepEqual([...inventory].sort(), actual.sort(), 'Manifest inventory must cover every public release file');
  const core = await json(`${base}/ranking/core.json`);
  checkSchema('core', core);
  assert.equal(core.release, release);
  const ids = core.universities.map(u => u.id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate university IDs');
  assert.deepEqual(ids, manifest.universityIds, 'Manifest/core ID mismatch');
  const registered = path => assert(inventory.has(path), `Unregistered asset: ${path}`);
  let portraits = 0;
  for (const university of core.universities) {
    const score = Object.entries(manifest.scoring.weights).reduce((sum,[name,weight]) => sum + university.metrics[name]*weight,0);
    assert(Math.abs(score-university.sourceScore) < 1e-10, `Source score does not match metrics: ${university.id}`);
    if (university.logo) {
      registered(university.logo.url);
      const logo = await sharp(resolve(root, `public${university.logo.url}`)).metadata();
      assert.equal(logo.format, 'webp', 'Logo must be optimized WebP');
      assert(logo.width > 0 && logo.width <= 256 && logo.height > 0 && logo.height <= 256, 'Logo exceeds display size budget');
    }
    for (const locale of ['en','zh']) {
      const path = `${base}/universities/${university.id}/profile.${locale}.json`;
      const profile = await json(path);
      checkSchema('profile', profile);
      assert.equal(profile.id, university.id);
      assert.equal(profile.release, release);
      assert.equal(profile.locale, locale);
      assert.equal(profile.sourceSnapshot, manifest.sourceSnapshot);
      assert.equal(profile.name, university.names[locale]);
    }
    const alumni = await json(`${base}/universities/${university.id}/alumni.json`);
    checkSchema('alumni', alumni);
    assert.equal(alumni.universityId, university.id);
    assert.equal(alumni.release, release);
    assert(alumni.people.length <= alumni.sampling.limit && alumni.people.length <= alumni.sampling.poolSize, 'Alumni sample exceeds pool or limit');
    assert(alumni.sampling.poolSize <= alumni.sampling.poolLimit, 'Alumni pool exceeds limit');
    assert.equal(new Set(alumni.people.map(p => p.id)).size, alumni.people.length, 'Duplicate alumni');
    assert.equal(Boolean(alumni.sprite), alumni.people.length > 0, 'Sprite/sample mismatch');
    if (alumni.sprite) {
      registered(alumni.sprite.url);
      const data = await readFile(resolve(root, `public${alumni.sprite.url}`));
      const metadata = await sharp(data).metadata();
      assert.equal(metadata.format, 'webp', 'Expected WebP sprite');
      assert.equal(metadata.width, alumni.sprite.width, 'Sprite width mismatch');
      assert.equal(metadata.height, alumni.sprite.height, 'Sprite height mismatch');
      for (const [index, person] of alumni.people.entries()) {
        const r = person.rect;
        assert.equal(r.x, index % 4 * 120, 'Sprite column/order mismatch');
        assert.equal(r.y, Math.floor(index / 4) * 150, 'Sprite row/order mismatch');
        assert(r.x + r.width <= alumni.sprite.width && r.y + r.height <= alumni.sprite.height, 'Sprite rectangle out of bounds');
      }
    }
    portraits += alumni.people.length;
  }
  const quality = await json(`${base}/quality-summary.json`);
  assert.equal(quality.release, release);
  assert.equal(quality.publishableAsOfficialRanking, false);
  const report = await json(`reports/${release}/quality.json`);
  assert.equal(report.release, release);
  assert.equal(manifest.scoring.sourceUniverseSize, report.counts.uniqueUniversities);
  assert.deepEqual(quality.counts, report.counts, 'Public and audit quality counts mismatch');
  assert.equal(report.duplicateScores.length, report.counts.duplicateGroups);
  assert.equal(report.missingOldUniversities.length, report.counts.missingOldUniversities);
  assert.equal(report.duplicateScores.reduce((n,g) => n+g.rows.length-1,0), report.counts.redundantScoreRows);
  const sampleConflicts = new Set(report.duplicateScores.map(g => g.id));
  assert(ids.every(id => !sampleConflicts.has(id)), 'Ambiguous source university in sample');
  return { release, universities: ids.length, portraits, files: inventory.size, bytes: manifest.files.reduce((n,f) => n+f.bytes,0) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await validateRelease(process.argv[2] ? resolve(process.argv[2]) : project), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
