import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
const script=resolve('scripts/media-merge-additions.mjs');
async function fixture(){
  const root=await mkdtemp(resolve(tmpdir(),'university-media-test-')),release='catalog-test';
  const base=resolve(root,`public/media/${release}`),bundle=resolve(root,'increment');
  await Promise.all([mkdir(resolve(root,'src/data'),{recursive:true}),mkdir(resolve(base,'universities'),{recursive:true}),mkdir(resolve(bundle,'heroes'),{recursive:true})]);
  const logo={url:'/kept-logo.webp',bytes:12},manifest={schemaVersion:'1.0.0',release,universities:{Q1:{logo,hero:null}},counts:{universities:1,logos:1,heroes:0,bytes:12}};
  await writeFile(resolve(root,'src/data/catalog.json'),JSON.stringify({release}));
  await writeFile(resolve(base,'manifest.json'),JSON.stringify(manifest));
  const data=await sharp({create:{width:80,height:50,channels:3,background:'#123456'}}).webp().toBuffer();
  const sha256=createHash('sha256').update(data).digest('hex'),filename=`Q1.${sha256.slice(0,16)}.webp`;
  const asset={filename,sha256,bytes:data.length,width:80,height:50,sourcePage:'https://commons.wikimedia.org/wiki/File:Example.jpg',artist:'Example author',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'};
  await writeFile(resolve(bundle,'heroes',filename),data);
  await writeFile(resolve(bundle,'additions.json'),JSON.stringify({sourceRelease:'catalog-old',universities:{Q1:asset}}));
  return {root,base,bundle,manifest,asset,logo};
}
test('increment rebases hero URLs and preserves existing logos',async()=>{
  const f=await fixture();try{
    execFileSync(process.execPath,[script,'--root',f.root,'--bundle',f.bundle]);
    const m=JSON.parse(await readFile(resolve(f.base,'manifest.json'),'utf8'));
    assert.deepEqual(m.universities.Q1.logo,f.logo);assert.match(m.universities.Q1.hero.url,/^\/media\/catalog-test\/heros\//);
    assert.equal(m.counts.heroes,1);
    execFileSync(process.execPath,[script,'--root',f.root,'--bundle',f.bundle]);
    assert.deepEqual(JSON.parse(await readFile(resolve(f.base,'manifest.json'),'utf8')).universities,m.universities);
  }finally{await rm(f.root,{recursive:true,force:true});}
});
test('corrupt increment fails before published manifest changes',async()=>{
  const f=await fixture();try{
    await writeFile(resolve(f.bundle,'heroes',f.asset.filename),'bad bytes');
    assert.throws(()=>execFileSync(process.execPath,[script,'--root',f.root,'--bundle',f.bundle],{stdio:'pipe'}));
    assert.deepEqual(JSON.parse(await readFile(resolve(f.base,'manifest.json'),'utf8')),f.manifest);
  }finally{await rm(f.root,{recursive:true,force:true});}
});
