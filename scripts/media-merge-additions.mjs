/** Explicitly merge a reviewed incremental bundle into the selected project/staging release. */
import {readFile,writeFile,copyFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=resolve(arg('--root','.')),bundle=arg('--bundle',''),kind=arg('--kind','hero');
assert.ok(bundle,'--bundle is required');assert.ok(['hero','logo'].includes(kind));
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const {release}=await read(resolve(root,'src/data/catalog.json'));
const base=resolve(root,`public/media/${release}`),manifest=await read(resolve(base,'manifest.json'));
const additions=await read(resolve(bundle,'additions.json')),ready=[];
// Validate the entire increment before touching a published record; never replace existing assets.
for(const [id,asset] of Object.entries(additions.universities)){
  assert.ok(manifest.universities[id],`Unknown school ${id}`);
  if(manifest.universities[id][kind])continue;
  assert.match(asset.filename,new RegExp(`^${id}\\.[a-f0-9]{16}\\.webp$`));
  assert.match(asset.sourcePage,/^https:\/\/commons\.wikimedia\.org\//);
  assert.match(asset.license,/^(CC BY(?:-SA)? (?:[1-4]\.0|2\.5)|CC0|Public domain|Copyrighted free use)$/);
  assert.ok(asset.artist&&!/<[^>]+>/.test(asset.artist));assert.match(asset.licenseUrl,/^https?:\/\//);
  if(asset.license==='Copyrighted free use'){
    assert.equal(asset.licenseUrl,'https://commons.wikimedia.org/wiki/Template:Copyrighted_free_use');
    assert.deepEqual(asset.permissionEvidence,{template:'Copyrighted free use',credit:'Own work',attributionRequired:false});
    assert.ok(asset.categories.split('|').includes('Copyrighted free use'));
  }
  const original=resolve(bundle,`${kind==='hero'?'heroes':'logos'}/${asset.filename}`),data=await readFile(original);
  assert.equal(data.length,asset.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);
  const image=await sharp(data).metadata();assert.equal(image.format,'webp');assert.equal(image.width,asset.width);assert.equal(image.height,asset.height);
  assert.ok(image.width<=(kind==='hero'?1440:160)&&image.height<=(kind==='hero'?960:160));
  const {filename,...metadata}=asset;ready.push({id,original,filename,metadata});
}
for(const {id,original,filename,metadata} of ready){
  const target=resolve(base,`${kind}s/${filename}`);await mkdir(dirname(target),{recursive:true});await copyFile(original,target);
  manifest.universities[id][kind]={url:`/media/${release}/${kind}s/${filename}`,...metadata};
}
const entries=Object.values(manifest.universities);
manifest.counts={...manifest.counts,logos:entries.filter(e=>e.logo).length,heroes:entries.filter(e=>e.hero).length,
  bytes:entries.reduce((sum,e)=>sum+(e.logo?.bytes||0)+(e.hero?.bytes||0),0)};
manifest.generatedAt=new Date().toISOString();
for(const {id} of ready)await writeFile(resolve(base,`universities/${id}.json`),JSON.stringify({release,id,...manifest.universities[id]})+'\n');
await writeFile(resolve(base,'manifest.json.tmp'),JSON.stringify(manifest)+'\n');await rename(resolve(base,'manifest.json.tmp'),resolve(base,'manifest.json'));
console.log(JSON.stringify({release,kind,added:ready.length,...manifest.counts}));
