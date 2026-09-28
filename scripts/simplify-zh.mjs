// Build/preprocessing only. OpenCC dictionaries are never imported by browser code.
import { Converter } from 'opencc-js';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const convert = Converter({from:'t',to:'cn'});
export function simplifyDisplay(value) {
  if (typeof value === 'string') {
    if (/^(?:https?:\/\/|\/)/.test(value)) return value;
    // Plaintext extraction can leave empty pronunciation/translation brackets.
    // Remove only empty or punctuation-only pairs; retain names, dates and facts.
    let cleaned=value.replace(/（[\s\u200b\uFEFF，,；;：:、]*）|\([\s\u200b\uFEFF，,；;：:、]*\)/g,'');
    while(cleaned!==value){
      value=cleaned;
      cleaned=value.replace(/（[\s\u200b\uFEFF，,；;：:、]*）|\([\s\u200b\uFEFF，,；;：:、]*\)/g,'');
    }
    // Phrase conversion can expose a character requiring a second pass (位於).
    for (let pass=0;pass<5;pass++) {
      const next=convert(value);
      if(next===value)return value;
      value=next;
    }
    throw new Error('Chinese normalization did not converge');
  }
  if (Array.isArray(value)) return value.map(simplifyDisplay);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,child])=>{
    const normalized=simplifyDisplay(child);
    // A fact consisting solely of extraction debris is missing, not a fact.
    return [key,key==='infobox'&&Array.isArray(normalized)?normalized.filter(field=>typeof field.value==='string'&&field.value.trim().length>0):normalized];
  }));
  return value;
}
async function jsonFiles(dir) {
  let entries;
  try { entries = await readdir(dir,{withFileTypes:true}); } catch(error) {if(error.code==='ENOENT')return [];throw error;}
  return (await Promise.all(entries.map(e=>e.isDirectory()?jsonFiles(resolve(dir,e.name)):e.name.endsWith('.json')?[resolve(dir,e.name)]:[]))).flat();
}
export async function simplifyStaging(root) {
  if (!root.split('/').at(-1).startsWith('.export-staging-')) throw new Error('Only unpublished staging can be normalized');
  const files = await jsonFiles(resolve(root,'public'));
  let changed = 0;
  for (const file of files) {
    const old = JSON.parse(await readFile(file,'utf8'));
    const value = simplifyDisplay(old);
    if (JSON.stringify(old)!==JSON.stringify(value))changed++;
    await writeFile(file,JSON.stringify(value)+'\n');
  }
  // Refresh inventory hashes after text conversion; image bytes are unchanged.
  for (const file of files.filter(f=>f.endsWith('/manifest.json'))) {
    const manifest=JSON.parse(await readFile(file,'utf8'));
    if(!Array.isArray(manifest.files))continue;
    for(const entry of manifest.files){
      const data=await readFile(resolve(root,`public${entry.path}`));
      entry.bytes=data.length;entry.sha256=createHash('sha256').update(data).digest('hex');
    }
    await writeFile(file,JSON.stringify(manifest)+'\n');
  }
  console.log(`Simplified Chinese normalized in ${changed} JSON files; sources and URLs retained.`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='--stdin') {
    let input='';for await(const chunk of process.stdin)input+=chunk;
    process.stdout.write(JSON.stringify(simplifyDisplay(JSON.parse(input))));
  } else await simplifyStaging(resolve(process.argv[2]));
}
