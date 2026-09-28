/** Reproducible, narrowly reviewed corrections. Keeps previous records for rollback.
 * node scripts/logo-correct-official.mjs [root]
 */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {officialLogos,isReviewedOfficialLogo} from './official-logo-policy.mjs';
import {embeddedPng} from './logo-image-safety.mjs';
const exec=promisify(execFile),hash=data=>createHash('sha256').update(data).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));

export async function applyReviewedOfficialLogos(root,release,manifest) {
  const base=resolve(root,'archives/logo-corrections-20260927');
  await mkdir(base,{recursive:true});
  const ready=[];
  for(const [id,spec] of Object.entries(officialLogos)) {
    if(!manifest.universities[id])continue;
    const previous=manifest.universities[id].logo;
    if(previous && isReviewedOfficialLogo(id,'logo',previous)) {
      try { if(hash(await readFile(resolve(root,`public${previous.url}`)))===previous.sha256)continue; } catch {}
    }
    const cache=resolve(base,spec.cacheFile);
    let original;
    try { original=await readFile(cache); } catch(error) {
      if(error.code!=='ENOENT')throw error;
      const proxy=process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy;
      const result=await exec('curl',['--fail','--silent','--show-error','--location','--max-time','45','--max-filesize','30000000',...(proxy?['--proxy',proxy]:[]),spec.sourceUrl],{encoding:'buffer',maxBuffer:30000000});
      original=result.stdout;
    }
    assert.equal(hash(original),spec.sourceSha256,`Official source changed; re-review required: ${id}`);
    await writeFile(cache,original);
    if(spec.archiveMember)original=(await exec('bsdtar',['-xOf',cache,spec.archiveMember],{encoding:'buffer',maxBuffer:5000000})).stdout;
    if(spec.sourceFormat==='ico')original=(await exec('python3',['-c','from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.save(sys.stdout.buffer,format="PNG")',cache],{encoding:'buffer',maxBuffer:5000000})).stdout;
    if(spec.sourceFormat==='embedded-png')original=embeddedPng(original);
    // No redrawing, recoloring, or cropping: preserve the complete official image.
    let pipeline=sharp(original,{limitInputPixels:40000000});
    if(spec.background)pipeline=pipeline.flatten({background:spec.background});
    const {data,info}=await pipeline.resize({width:160,height:160,fit:'inside',withoutEnlargement:true}).webp({lossless:true}).toBuffer({resolveWithObject:true});
    const digest=hash(data),url=`/media/${release}/logos/${id}.${digest.slice(0,16)}.webp`;
    const asset={url,width:info.width,height:info.height,bytes:data.length,sha256:digest,
      sourceUrl:spec.sourceUrl,sourcePage:spec.sourcePage,artist:spec.artist,
      license:'All rights reserved',licenseUrl:spec.rightsUrl,
      attribution:`${spec.artist} — official university identity; rights retained by the university`,
      description:spec.description,transform:'Complete official image resized and converted to WebP; no crop or redraw.'+(spec.background?' Transparent white mark displayed on a contrasting solid background.':''),
      usage:'University identification in development preview; no open-license or endorsement claim',
      identityEvidence:{method:'Official website identity; visually reviewed against official branding',reviewDate:'2026-09-27',sourceSha256:spec.sourceSha256,...(spec.background?{background:spec.background}:{}),...(spec.archiveMember?{archiveMember:spec.archiveMember}:{})}};
    assert.ok(isReviewedOfficialLogo(id,'logo',asset));
    ready.push({id,asset,data,previous});
  }
  for(const {id,asset,data,previous} of ready) {
    const target=resolve(root,`public${asset.url}`);await mkdir(dirname(target),{recursive:true});await writeFile(target,data);
    const backup=resolve(base,`${release}-${id}-previous.json`);
    try {await writeFile(backup,JSON.stringify(previous,null,2)+'\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
    manifest.universities[id].logo=asset;
  }
  manifest.officialLogoPolicy='Individually reviewed official university identities retained for development preview. All rights reserved; public availability is not an open license. Recheck rights before public distribution.';
  return ready.map(r=>r.id);
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const root=resolve(process.argv[2]||'.'),{release}=await read(resolve(root,'src/data/catalog.json'));
  const base=resolve(root,`public/media/${release}`),manifest=await read(resolve(base,'manifest.json'));
  const changed=await applyReviewedOfficialLogos(root,release,manifest);
  const entries=Object.values(manifest.universities);
  manifest.counts={...manifest.counts,logos:entries.filter(e=>e.logo).length,bytes:entries.reduce((s,e)=>s+(e.logo?.bytes||0)+(e.hero?.bytes||0),0)};
  manifest.generatedAt=new Date().toISOString();
  for(const id of changed)await writeFile(resolve(base,`universities/${id}.json`),JSON.stringify({release,id,...manifest.universities[id]})+'\n');
  await writeFile(resolve(base,'manifest.json.tmp'),JSON.stringify(manifest)+'\n');await rename(resolve(base,'manifest.json.tmp'),resolve(base,'manifest.json'));
  console.log(JSON.stringify({release,changed,logos:manifest.counts.logos}));
}
