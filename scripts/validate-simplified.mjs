import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { simplifyDisplay } from './simplify-zh.mjs';
const root=resolve(process.argv[2]||'.');
let count=0;
async function visit(dir){
  let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
  for(const entry of entries){
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())await visit(path);
    else if(entry.name.endsWith('.json')){
      const value=JSON.parse(await readFile(path,'utf8'));
      assert.deepEqual(simplifyDisplay(value),value,`Traditional text in display resource: ${path}`);
      count++;
    }
  }
}
for(const kind of ['data','media','content','overviews','us-data'])await visit(resolve(root,'public',kind));
console.log(`Simplified Chinese validated in ${count} display JSON files; source URLs exempt.`);
