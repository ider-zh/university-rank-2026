/** Read-only discovery of identity-linked campus image candidates. Does not publish media. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const {release}=await read('src/data/catalog.json');
const core=await read(`public/data/${release}/ranking.json`);
const manifest=await read(`public/media/${release}/manifest.json`);
const missing=core.universities.filter(u=>!manifest.universities[u.id]?.hero);
const dir='archives/media-discovery'; await mkdir(dir,{recursive:true});
const proxy=process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy;
async function api(host,args){
  const url=`https://${host}/w/api.php?${new URLSearchParams({...args,format:'json'})}`;
  const {stdout}=await exec('curl',['--silent','--show-error','--fail','--max-time','25','--retry','1',...(proxy?['--proxy',proxy]:[]),'--user-agent','UniversityRankMediaDiscovery/1.0',url],{maxBuffer:30_000_000});
  const data=JSON.parse(stdout); if(data.error) throw new Error(JSON.stringify(data.error)); return data;
}
const candidates=[]; const entities=process.argv.includes('--wiki-only')?await read(`${dir}/entities.json`):{}; const errors=[];
let cursor=0,done=0;
await Promise.all(Array.from({length:5},async()=>{
  while(!process.argv.includes('--wiki-only')&&cursor<missing.length){const u=missing[cursor++];
    try {const {stdout}=await exec('curl',['--silent','--show-error','--fail','--max-time','18',...(proxy?['--proxy',proxy]:[]),`https://www.wikidata.org/wiki/Special:EntityData/${u.id}.json`],{maxBuffer:3_000_000});Object.assign(entities,JSON.parse(stdout).entities);}
    catch(e){errors.push({step:'wikidata',ids:[u.id],error:(e.stderr||`exit-${e.code}`).slice(0,160)});}
    done++;if(done%10===0)console.log(`Wikidata ${done}/${missing.length}`);
  }
}));
await writeFile(`${dir}/entities.json`,JSON.stringify(entities));
for(const u of missing){
  const e=entities[u.id];if(!e)continue;
  for(const claim of e.claims?.P18||[]){const title=claim.mainsnak?.datavalue?.value;if(typeof title==='string'&&claim.rank!=='deprecated')candidates.push({id:u.id,title:`File:${title}`,evidence:{method:'wikidata-P18',sourcePage:`https://www.wikidata.org/wiki/${u.id}`,claimId:claim.id,rank:claim.rank}});}
}
const pages={};
for(let offset=0;offset<missing.length;offset+=25){
  const batch=missing.slice(offset,offset+25);
  if(!batch.length)continue;
  try {let continuation={};do{const data=await api('en.wikipedia.org',{action:'query',titles:batch.map(u=>entities[u.id]?.sitelinks?.enwiki?.title||u.names.en.replaceAll('\u00a0',' ')).join('|'),prop:'pageimages|pageprops|images',piprop:'name|original',pilicense:'free',imlimit:'500',redirects:'1',...continuation});
    for(const p of Object.values(data.query?.pages||{})){const id=p.pageprops?.wikibase_item||Object.keys(pages).find(k=>pages[k].pageid===p.pageid);if(!batch.some(u=>u.id===id))continue;pages[id]={...pages[id],...p,images:[...(pages[id]?.images||[]),...(p.images||[])]};
      if(p.pageimage)candidates.push({id,title:`File:${p.pageimage}`,evidence:{method:'wikipedia-free-pageimage-qid-match',sourcePage:`https://en.wikipedia.org/?curid=${p.pageid}`,wikibaseItem:id}});
      for(const img of p.images||[])candidates.push({id,title:img.title,evidence:{method:'wikipedia-article-image-qid-match',sourcePage:`https://en.wikipedia.org/?curid=${p.pageid}`,wikibaseItem:id,requiresCampusIdentityReview:true}});
    }
    continuation=data.continue;
  }while(continuation);
  }catch(e){errors.push({step:'wikipedia',ids:batch.map(u=>u.id),error:(e.stderr||`exit-${e.code}`).slice(0,160)});}
  console.log(`Wikipedia ${Math.min(offset+25,missing.length)}/${missing.length}`);
}
const seen=new Set();const unique=candidates.filter(c=>{const k=c.id+'|'+c.title;if(seen.has(k))return false;seen.add(k);return true;});
await writeFile(`${dir}/pages.json`,JSON.stringify(pages));
await writeFile(`${dir}/candidates.json`,JSON.stringify(unique,null,2));
await writeFile(`${dir}/report.json`,JSON.stringify({release,missing:missing.map(u=>({id:u.id,name:u.names.en,rank:u.siteRank})),candidates:unique.length,errors},null,2));
console.log(JSON.stringify({missing:missing.length,candidates:unique.length,errors:errors.length}));
