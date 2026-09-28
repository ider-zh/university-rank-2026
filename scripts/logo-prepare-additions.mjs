/** Run only after reviewing every contact-sheet entry and removing unsuitable identities. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {simplifyDisplay} from './simplify-zh.mjs';
import {currentLogoMetadata} from './logo-policy.mjs';
const base='archives/logo-staging',read=async p=>JSON.parse(await readFile(p,'utf8'));
const report=await read(`${base}/manifest.json`),metadata=await read(`${base}/metadata.json`),universities={};
for(const[id,entry]of Object.entries(report.universities)){
 const {url,...asset}=entry.logo,filename=url.split('/').at(-1);
 const info=Object.values(metadata).find(m=>m?.canonicaltitle===asset.commonsTitle);
 assert.ok(currentLogoMetadata(info),`Unlicensed or historical logo ${id}`);
 const data=await readFile(`${base}/logos/${filename}`);assert.equal(createHash('sha256').update(data).digest('hex'),asset.sha256);assert.equal(data.length,asset.bytes);
 const actual=await sharp(data).metadata();assert.equal(actual.format,'webp');assert.equal(actual.width,asset.width);assert.equal(actual.height,asset.height);
 universities[id]={filename,...asset,identityEvidence:{...asset.acquisition,review:'Visual contact-sheet review; school association and available historic-use metadata checked',reviewDate:'2026-09-13'}};
}
const output=simplifyDisplay({sourceRelease:report.sourceRelease,generatedAt:new Date().toISOString(),universities,failures:report.failures,
 review:{accepted:Object.keys(universities).length,rejected:[{id:'Q178972',title:'File:National Sun Yat-sen University Canton.jpg',reason:'Source describes 1932–1949 historic emblem, not the current university logo'}]}});
await writeFile(`${base}/additions.json`,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({accepted:Object.keys(universities).length,unresolved:report.unresolved.length,bytes:Object.values(universities).reduce((sum,a)=>sum+a.bytes,0)}));
