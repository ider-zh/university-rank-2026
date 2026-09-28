/** Alternate cached Wikidata entity endpoint; writes discovery cache, never public assets. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),read=async p=>JSON.parse(await readFile(p,'utf8'));
const {release}=await read('src/data/catalog.json');const core=await read(`public/data/${release}/ranking.json`);const media=await read(`public/media/${release}/manifest.json`);
const base='archives/logo-staging/entity-fallback';await mkdir(base,{recursive:true});
const existing=await read('archives/logo-staging/entities.json');const missing=core.universities.filter(u=>!media.universities[u.id].logo&&!existing[u.id]);
let cursor=0,done=0,throttled=false;const proxy=process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy;
await Promise.all(Array.from({length:2},async()=>{while(cursor<missing.length&&!throttled){const u=missing[cursor++],path=`${base}/${u.id}.json`;if(existsSync(path))continue;try{const{stdout}=await exec('curl',['--silent','--show-error','--fail','--max-time','30',...(proxy?['--proxy',proxy]:[]),`https://www.wikidata.org/wiki/Special:EntityData/${u.id}.json`],{maxBuffer:5000000});const entity=JSON.parse(stdout).entities?.[u.id];if(!entity)throw Error('missing entity');await writeFile(path,JSON.stringify(entity));done++;if(done%10===0)console.log(`Entity fallback ${done}/${missing.length}`);}catch(e){const message=String(e.stderr||e.message);console.log(`Entity fallback failed ${u.id}: ${message.slice(-100)}`);if(message.includes('429'))throttled=true;}}}));
