/** Turn explicit human/agent visual-review decisions into pinned provenance data. */
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const review=await read('scripts/logo-review-20260927.json');
const candidates=await read('archives/logo-coverage-20260927/candidates.json');
const registry=await read('scripts/official-logo-additions.json');
const byKey=new Map(candidates.map(r=>[r.key,r]));
const selected=review.accepted.map(key=>{const r=byKey.get(key);assert.ok(r,`Missing reviewed candidate: ${key}`);return r;});
assert.equal(new Set(selected.map(r=>r.id)).size,selected.length);
for(const r of selected){
 const original=await readFile(r.originalPath);
 assert.equal(createHash('sha256').update(original).digest('hex'),r.sourceSha256);
 const spec={sourceUrl:r.sourceUrl,sourcePage:r.sourcePage,rightsUrl:r.sourcePage,artist:r.name,
  description:`Official homepage identity for ${r.name}; reviewed against the homepage title and downloaded image.`,
  cacheFile:`${r.key}.${r.sourceSha256.slice(0,16)}.original`,sourceSha256:r.sourceSha256,
  ...(r.sourceFormat?{sourceFormat:r.sourceFormat}:r.ico?{sourceFormat:'ico'}:{}),...(review.darkBackground.includes(r.key)?{background:'#243247'}:{}),
  reviewEvidence:{pageTitle:r.pageTitle,candidateKey:r.key,reviewDate:review.reviewDate}};
 await copyFile(r.originalPath,`archives/logo-corrections-20260927/${spec.cacheFile}`);
 registry[r.id]=spec;
}
await writeFile('scripts/official-logo-additions.json',JSON.stringify(registry,null,2)+'\n');
console.log(JSON.stringify({reviewed:selected.length,pinned:Object.keys(registry).length}));
