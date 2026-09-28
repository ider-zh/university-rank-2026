import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]||'.');
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const {release}=await read('src/data/catalog.json');
const core=(await read(`public/data/${release}/ranking.json`)).universities;
const ids=new Set(core.map(u=>u.id));
const usIds=core.filter(u=>['US','PR','GU','VI','AS','MP'].includes(u.countryCode)).map(u=>u.id).sort();
let mapped=0,safety=0,conflicts=0;
for(const kind of ['overviews','us-data']){
 const manifest=await read(`public/${kind}/${release}/manifest.json`);
 assert.equal(manifest.release,release);
 assert.deepEqual(manifest.ids,kind==='overviews'?[...ids].sort():usIds);
 assert.deepEqual((await readdir(resolve(root,`public/${kind}/${release}`))).filter(n=>n.startsWith('Q')).sort(),manifest.ids.map(id=>id+'.json'));
 assert.equal(manifest.files.length,manifest.ids.length);
 for(const file of manifest.files){
  assert(file.path.startsWith(`/${kind}/${release}/`)&&!file.path.includes('..'));
  const bytes=await readFile(resolve(root,'public'+file.path));
  assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const data=JSON.parse(bytes);assert.equal(data.release,release);assert(ids.has(data.id));assert.equal(file.path,`/${kind}/${release}/${data.id}.json`);
  if(kind==='overviews'){
   for(const locale of ['zh','en'])assert(data.paragraphs[locale].every(p=>typeof p==='string'&&p.length>0&&!/<[^>]+>/.test(p)));
   continue;
  }
  if(data.institutions.length)mapped++;
  if(data.institutions.some(i=>i.safety.length))safety++;
  assert.equal(new Set(data.institutions.map(i=>i.unitid)).size,data.institutions.length);
  for(const institution of data.institutions){
   assert(/^\d+$/.test(institution.unitid));
   assert.deepEqual(Object.keys(institution.outcomes).sort(),['debt','median10','median6','repayment3']);
   for(const metric of Object.values(institution.outcomes)){
    assert(metric.value===null||(Number.isFinite(metric.value)&&metric.value>=0));
    if(metric.unit==='percent')assert(metric.value===null||metric.value<=100);
    if(metric.sourceFile==='Most-Recent-Cohorts-Institution.csv')assert.equal(metric.reportingYear,null);
   }
   for(const row of institution.safety){
    assert(Number.isInteger(row.year)&&row.year>=2000&&row.year<=2100);
    assert(['campus','housing','noncampus','public'].includes(row.geography));
    assert(!row.sourceFile.includes('Police'));
    assert.equal(new Set(row.metrics.map(m=>m.key)).size,row.metrics.length);
    assert(row.metrics.every(m=>m.value===null||(Number.isInteger(m.value)&&m.value>=0)));
    if(row.conflict){conflicts++;assert(row.metrics.every(m=>m.value===null));}
   }
  }
 }
}
const audit=await read(`reports/${release}/supplements.json`);
assert.equal(mapped,audit.mappedSchools);assert.equal(safety,audit.safetyUnits);assert.equal(conflicts,audit.conflicts.length);
console.log(`Supplements validated: ${ids.size} overviews, ${mapped} US mappings, ${safety} safety records, ${conflicts} flagged conflict.`);
