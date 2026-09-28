/** Build an independent versioned local media bundle for an exported catalog.
 * node scripts/media-acquire.mjs [--root /project-or-staging] [--hero-limit 20]
 * Requires SSH read access to pipeline, curl, sharp. Network only at preprocessing time.
 */
import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { commonsTitle, reusableMetadata, isCampusCandidate, plain } from './media-policy.mjs';
import { currentLogoMetadata } from './logo-policy.mjs';
import { applyReviewedOfficialLogos } from './logo-correct-official.mjs';
import { simplifyDisplay } from './simplify-zh.mjs';

const exec = promisify(execFile);
const args = process.argv.slice(2);
const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const root = resolve(argument('--root', '.'));
const heroLimit = Number(argument('--hero-limit', '20'));
const limit = Number(argument('--limit', '1000'));
if (!Number.isInteger(heroLimit) || heroLimit < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid media limits');
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const { release } = await readJSON(resolve(root, 'src/data/catalog.json'));
if (!/^catalog-[\w-]+$/.test(release)) throw new Error('Invalid release');
const core = await readJSON(resolve(root, `public/data/${release}/ranking.json`));
const universities = core.universities.slice(0, limit);
const ids = universities.map(university => university.id);
const heroes = new Set([...ids.slice(0, heroLimit), ...['Q13371', 'Q41506', 'Q16955', 'Q16952', 'Q34433', 'Q738236'].filter(id => ids.includes(id))]);
const remote = await readFile(new URL('./media-remote.py', import.meta.url), 'utf8');
const remoteCall = request => new Promise((accept, reject) => {
  const process = spawn('ssh', ['ider@192.168.1.229', 'cd /home/ider/workspace/UniDataPipeline && .venv/bin/python -'], {stdio:['pipe','pipe','inherit']});
  const chunks = [];
  process.stdout.on('data', chunk => chunks.push(chunk));
  process.on('error', reject);
  process.on('close', code => code === 0 ? accept(Buffer.concat(chunks).toString()) : reject(new Error(`Remote read failed: ${code}`)));
  process.stdin.end(`${remote}\nmain(json.loads(${JSON.stringify(JSON.stringify(request))}))\n`);
});
const cacheRoot = resolve(root, 'archives/media-cache');
await mkdir(cacheRoot, { recursive: true });
const selectionKey = createHash('sha256').update(ids.join(',')).digest('hex').slice(0,12);
const rowsPath = resolve(cacheRoot, `${release}.${selectionKey}.sources.json`);
let rows;
if (existsSync(rowsPath)) rows = await readJSON(rowsPath);
else {
  rows = JSON.parse(await remoteCall({mode:'metadata',ids}));
  await writeFile(rowsPath, JSON.stringify(rows));
}
rows = rows.filter(row => ids.includes(row.qid) && (row.source_flag !== 'wikidata-image' || heroes.has(row.qid)));
const overrides = await readJSON(new URL('./media-overrides.json', import.meta.url));
const logoOverrides = await readJSON(new URL('./logo-overrides.json', import.meta.url));
for (const [id, override] of Object.entries(logoOverrides)) {
  if (!ids.includes(id)) continue;
  rows.unshift({qid:id,filename:override.logo,source_flag:'wikidata-logo',transport:'commons',
    identityEvidence:override.evidence,url:override.sourceUrl,logoOverride:override});
}
for (const [id, override] of Object.entries(overrides)) {
  if (!heroes.has(id) || !override.hero) continue;
  const filename = override.hero.replace(/^File:/, '');
  rows.unshift({qid:id,filename,source_flag:'wikidata-image',transport:'commons',
    identityEvidence:override.evidence,
    url:override.sourceUrl || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}`});
}
const titles = [...new Set(rows.map(commonsTitle).filter(Boolean))];
const metadataPath = resolve(cacheRoot, 'commons-metadata.json');
const metadata = existsSync(metadataPath) ? await readJSON(metadataPath) : {};
const missing = titles.filter(title => !(title in metadata));
console.log(`Media: ${ids.length} universities, ${titles.length} Commons files, ${missing.length} uncached license records.`);
const failures = [];
for (let offset = 0; offset < missing.length; offset += 50) {
  const batch = missing.slice(offset, offset + 50);
  const params = new URLSearchParams({action:'query',format:'json',prop:'imageinfo',iiprop:'url|size|mime|extmetadata|canonicaltitle',iiurlwidth:'1440',titles:batch.join('|'),redirects:'1'});
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy;
  try {
    const {stdout} = await exec('curl', ['--silent','--show-error','--fail','--max-time','45','--retry','2',...(proxy ? ['--proxy',proxy] : []),
      '--user-agent','UniversityRankStaticMedia/1.0 (educational static preview; source attribution retained)', `https://commons.wikimedia.org/w/api.php?${params}`], {maxBuffer:12_000_000});
    const result = JSON.parse(stdout);
    if (result.error || !result.query) throw new Error(result.error?.code || 'Invalid API response');
    const aliases = new Map([...(result.query.normalized || []), ...(result.query.redirects || [])].map(item => [item.from,item.to]));
    const pages = Object.values(result.query.pages);
    for (const title of batch) {
      let canonical = title;
      for (let depth = 0; depth < 5 && aliases.has(canonical); depth++) canonical = aliases.get(canonical);
      metadata[title] = pages.find(page => page.title === canonical)?.imageinfo?.[0] || null;
    }
    await writeFile(metadataPath, JSON.stringify(metadata));
  } catch (error) { failures.push({kind:'metadata',count:batch.length,error:error.message.slice(0,160)}); }
  console.log(`License metadata ${Math.min(offset+50, missing.length)}/${missing.length}`);
}
const selections = [];
// Recover only previously reviewed explicit Commons authorship, never infer an author from the uploader.
for (const row of rows.filter(row => row.logoOverride?.attributionEvidence)) {
  const info = metadata[commonsTitle(row)], override = row.logoOverride;
  if (!info?.extmetadata || info.extmetadata.Artist?.value) continue;
  const license = plain(info.extmetadata.LicenseShortName?.value || '');
  const licenseUrl = plain(info.extmetadata.LicenseUrl?.value || '') || (license === 'Public domain' ? 'https://commons.wikimedia.org/wiki/Commons:Public_domain' : '');
  if (license !== override.license || licenseUrl !== override.licenseUrl) continue;
  info.extmetadata.Artist = {value:override.artist};
  row.identityEvidence = {...row.identityEvidence,authorEvidence:override.attributionEvidence};
}
for (const id of ids) {
  const candidates = rows.filter(row => row.qid === id);
  for (const kind of ['logo', 'hero']) {
    if (kind === 'hero' && !heroes.has(id)) continue;
    const candidate = candidates.find(row => {
      const info = metadata[commonsTitle(row)];
      return kind === 'hero' ? reusableMetadata(info) && isCampusCandidate(row,info)
        : currentLogoMetadata(info) && row.source_flag !== 'wikidata-image';
    });
    if (candidate) selections.push({id,kind,sourceUrl:candidate.url,transport:candidate.transport || 's3',
      downloadUrl:metadata[commonsTitle(candidate)]?.thumburl || metadata[commonsTitle(candidate)]?.url,metadata:{...reusableMetadata(metadata[commonsTitle(candidate)]),
        ...(candidate.identityEvidence ? {identityEvidence:candidate.identityEvidence} : {})}});
  }
}
const base = resolve(root, `public/media/${release}`);
await mkdir(base, {recursive:true});
const manifestPath = resolve(base, 'manifest.json');
const reuseRelease = argument('--reuse-from', '');
if (reuseRelease && !/^catalog-[\w-]+$/.test(reuseRelease)) throw new Error('Invalid reuse release');
const reusePaths = reuseRelease ? [resolve(root, `public/media/${reuseRelease}/manifest.json`),
  resolve(root, `archives/${reuseRelease}/media/manifest.json`)] : [];
const previousPath = existsSync(manifestPath) ? manifestPath : reusePaths.find(path => existsSync(path));
const previous = previousPath ? await readJSON(previousPath) : {universities:{}};
if (previousPath && previous.release !== release) {
  for (const [id, entry] of Object.entries(previous.universities)) {
    for (const kind of ['logo','hero']) {
      const asset = entry[kind];
      if (!asset || !selections.some(item => item.id === id && item.kind === kind && item.sourceUrl === asset.sourceUrl)) continue;
      const filename = asset.url.split('/').at(-1);
      if (!new RegExp(`^${id}\\.[a-f0-9]{16}\\.webp$`).test(filename)) continue;
      const original = resolve(dirname(previousPath), `${kind}s/${filename}`);
      const target = resolve(base, `${kind}s/${filename}`);
      if (!existsSync(original)) continue;
      const data = await readFile(original);
      if (createHash('sha256').update(data).digest('hex') !== asset.sha256) continue;
      await mkdir(dirname(target), {recursive:true});
      await copyFile(original,target);
      asset.url = `/media/${release}/${kind}s/${filename}`;
    }
  }
}
const manifest = {schemaVersion:'1.0.0',release,generatedAt:new Date().toISOString(),
  policy:'Explicit CC BY, CC BY-SA, CC0, public-domain, or own-work Copyrighted free use Commons metadata accepted; university marks may remain trademark-protected. No external images requested by visitors.',
  universities:Object.fromEntries(ids.map(id => [id, Object.fromEntries(['logo','hero'].map(kind => {
    const existing = previous.universities[id]?.[kind];
    const eligible = selections.find(item => item.id === id && item.kind === kind && item.sourceUrl === existing?.sourceUrl);
    return [kind, eligible && existsSync(resolve(root, `public${existing.url}`)) ? existing : null];
  }))])), counts:{},failures};
// Small chunks bound memory even when the source supplies large original SVGs/photos.
for (let offset = 0; offset < selections.length; offset += 30) {
  const batch = selections.slice(offset, offset + 30).filter(item => !manifest.universities[item.id][item.kind]);
  if (!batch.length) continue;
  const local = batch.filter(item => item.transport === 's3');
  const response = local.length ? await remoteCall({mode:'download',ids:[...new Set(local.map(item => item.id))],assets:local.map(({id,kind,sourceUrl})=>({id,kind,sourceUrl}))}) : '';
  const results = response.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  for (const item of batch.filter(item => item.transport === 'commons')) {
    try {
      if (!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(item.downloadUrl)) throw new Error('Invalid Commons download URL');
      const proxy = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy;
      const {stdout} = await exec('curl',['--silent','--show-error','--fail','--max-time','45','--retry','2','--max-filesize','15000000',
        ...(proxy ? ['--proxy',proxy] : []),item.downloadUrl],{encoding:'buffer',maxBuffer:15_000_001});
      results.push({...item,data:stdout.toString('base64')});
    } catch (error) { results.push({...item,error:error.message.slice(0,160)}); }
  }
  for (const result of results) {
    const selection = batch.find(item => item.id === result.id && item.kind === result.kind);
    try {
      if (result.error) throw new Error(result.error);
      const original = Buffer.from(result.data, 'base64');
      // Never publish SVG source; deny active/external constructs before rasterization.
      if (original.subarray(0,1000).toString().includes('<svg') && /<script|<foreignObject|<image|\bon\w+\s*=|(?:href\s*=\s*["'](?!#))|@import|url\(\s*["']?https?:/i.test(original.toString())) throw new Error('unsafe-svg');
      const { data, info } = await sharp(original, {limitInputPixels:40_000_000})
        .rotate().resize(result.kind === 'logo' ? {width:160,height:160,fit:'inside',withoutEnlargement:true} : {width:1440,height:960,fit:'inside',withoutEnlargement:true})
        .webp({quality:result.kind === 'logo' ? 88 : 78}).toBuffer({resolveWithObject:true});
      const digest = createHash('sha256').update(data).digest('hex');
      const url = `/media/${release}/${result.kind}s/${result.id}.${digest.slice(0,16)}.webp`;
      const path = resolve(root, `public${url}`);
      await mkdir(dirname(path), {recursive:true});
      await writeFile(path,data);
      manifest.universities[result.id][result.kind] = {url,width:info.width,height:info.height,bytes:data.length,sha256:digest,
        sourceUrl:result.sourceUrl,...selection.metadata,transform:'Resized and converted to WebP; displayed crop may vary.'};
    } catch (error) { failures.push({id:result.id,kind:result.kind,error:error.message}); }
  }
  console.log(`Local images ${Math.min(offset+30,selections.length)}/${selections.length}`);
}
await applyReviewedOfficialLogos(root, release, manifest);
const assets = Object.values(manifest.universities);
manifest.counts = {universities:ids.length,logos:assets.filter(item => item.logo).length,heroes:assets.filter(item => item.hero).length,
  heroRequested:heroes.size,bytes:assets.reduce((sum,item) => sum+(item.logo?.bytes||0)+(item.hero?.bytes||0),0)};
await mkdir(resolve(base, 'universities'), {recursive:true});
Object.assign(manifest, simplifyDisplay(manifest));
for (const [id, entry] of Object.entries(manifest.universities)) {
  await writeFile(resolve(base, `universities/${id}.json`),JSON.stringify({release,id,...entry})+'\n');
}
const temporary = `${manifestPath}.tmp`;
await writeFile(temporary,JSON.stringify(manifest)+'\n');
await rename(temporary,manifestPath);
console.log(JSON.stringify(manifest.counts));
