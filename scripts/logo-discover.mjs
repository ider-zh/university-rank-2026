/** Discover missing, explicitly reusable university marks into an unpublished staging bundle. */
import {readFile, writeFile, mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {commonsTitle,reusableMetadata} from './media-policy.mjs';
import {currentLogoMetadata,currentClaim} from './logo-policy.mjs';
const exec=promisify(execFile), json=async p=>JSON.parse(await readFile(p,'utf8'));
const {release}=await json('src/data/catalog.json');
const core=await json(`public/data/${release}/ranking.json`);
const manifest=await json(`public/media/${release}/manifest.json`);
const missing=core.universities.filter(u=>!manifest.universities[u.id]?.logo);
const base=resolve('archives/logo-staging'); await mkdir(base,{recursive:true}); await mkdir(`${base}/logos`,{recursive:true});
const proxy=process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy;
async function request(url,binary=false){try{const {stdout}=await exec('curl',['--silent','--show-error','--fail','--location','--max-time','55','--max-filesize','15000000',...(proxy?['--proxy',proxy]:[]),'--user-agent','UniversityRankStaticMedia/1.0 (source attribution retained)',url],{encoding:binary?'buffer':'utf8',maxBuffer:15000001});return binary?stdout:JSON.parse(stdout);}catch(e){throw Error(String(e.stderr||e.message).slice(-250));}}
async function api(host,params){return request(`https://${host}/w/api.php?${new URLSearchParams({format:'json',...params})}`);}
async function pool(items,fn,n=4){let cursor=0;await Promise.all(Array.from({length:n},async()=>{while(cursor<items.length){const item=items[cursor++];await fn(item);}}));}
const entitiesPath=`${base}/entities.json`, entities=existsSync(entitiesPath)?await json(entitiesPath):{};
if(existsSync(`${base}/entity-fallback`))for(const file of await readdir(`${base}/entity-fallback`)){const entity=await json(`${base}/entity-fallback/${file}`);entities[entity.id]=entity;}
const failures=[];
const batches=[];const ids=process.argv.includes('--skip-entities')?[]:missing.filter(u=>!entities[u.id]).map(u=>u.id);for(let i=0;i<ids.length;i+=10)batches.push(ids.slice(i,i+10));
await pool(batches,async ids=>{try{const result=await api('www.wikidata.org',{action:'wbgetentities',ids:ids.join('|'),props:'claims|sitelinks'});Object.assign(entities,result.entities);console.log(`Wikidata ${Object.keys(entities).length}/${missing.length}`);}catch(e){failures.push({stage:'wikidata',ids,error:e.message.slice(0,140)});}},1);
await writeFile(entitiesPath,JSON.stringify(entities));
const sourceMap=new Map();
for(const file of (await readdir('archives/media-cache')).filter(f=>f.endsWith('.sources.json')).sort())for(const row of await json(`archives/media-cache/${file}`))sourceMap.set(`${row.qid}:${row.url}`,row);
const sourceRows=[...sourceMap.values()];
const candidates=[];
for(const u of missing){
 for(const property of ['P154','P94'])for(const claim of entities[u.id]?.claims?.[property]||[]){if(!currentClaim(claim))continue;const value=claim.mainsnak?.datavalue?.value;if(typeof value==='string')candidates.push({id:u.id,title:`File:${value.replaceAll('_',' ')}`,method:`Wikidata ${property}`,identitySource:`https://www.wikidata.org/wiki/${u.id}`});}
 for(const row of sourceRows.filter(r=>r.qid===u.id&&r.source_flag!=='wikidata-image')){const title=commonsTitle(row);if(title)candidates.push({id:u.id,title,method:'Existing school image association',identitySource:`https://www.wikidata.org/wiki/${u.id}`,s3Source:row.url});}
}
const mdPath=`${base}/metadata.json`, metadata=existsSync(mdPath)?await json(mdPath):await json('archives/media-cache/commons-metadata.json');
const titles=[...new Set(candidates.map(c=>c.title))].filter(t=>!(t in metadata));const titleBatches=[];for(let i=0;i<titles.length;i+=40)titleBatches.push(titles.slice(i,i+40));
await pool(titleBatches,async titles=>{try{const result=await api('commons.wikimedia.org',{action:'query',prop:'imageinfo',iiprop:'url|size|mime|extmetadata|canonicaltitle',iiurlwidth:'320',titles:titles.join('|'),redirects:'1'});const aliases=new Map([...(result.query?.normalized||[]),...(result.query?.redirects||[])].map(x=>[x.from,x.to]));for(const title of titles){let name=title;for(let i=0;i<5&&aliases.has(name);i++)name=aliases.get(name);metadata[title]=Object.values(result.query?.pages||{}).find(p=>p.title===name)?.imageinfo?.[0]||null;}console.log(`Commons batch ${titles.length}`);}catch(e){failures.push({stage:'metadata',count:titles.length,error:e.message.slice(0,140)});}},1);
await writeFile(mdPath,JSON.stringify(metadata));
// Some Commons heraldry templates do not expose their artist as machine-readable metadata.
// Recover only an explicit artist field, retaining derivative-element credit and source revision.
const authorTitles=[...new Set(candidates.map(c=>c.title))].filter(t=>metadata[t]?.extmetadata?.LicenseShortName?.value&&!metadata[t].extmetadata.Artist?.value);
for(let authorOffset=0;authorOffset<authorTitles.length;authorOffset+=10)try{
 const result=await api('commons.wikimedia.org',{action:'query',prop:'revisions',rvprop:'ids|content',rvslots:'main',titles:authorTitles.slice(authorOffset,authorOffset+10).join('|'),redirects:'1'});
 for(const page of Object.values(result.query?.pages||{})){
 const title=page.title;if(!metadata[title])continue;
 const revision=page?.revisions?.[0], wikitext=revision?.slots?.main?.['*']||'';
 const artist=wikitext.match(/^\s*\|\s*(?:artist|author)\s*=\s*(.+)$/mi)?.[1];
 if(!artist||!/\[\[(?:User|user):/.test(artist))continue;
 const clean=text=>text.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g,'$1').replace(/\{\{|\}\}/g,'').trim();
 const derivatives=[...wikitext.matchAll(/\{\{AttribSVG\|([^|}]+)\|([^}]+)\}\}/g)].map(x=>`${clean(x[2])} (element: ${clean(x[1])})`);
 const author=[clean(artist),...derivatives].join('; ');
 metadata[title].extmetadata.Artist={value:author,source:'explicit Commons source wikitext artist field'};
 metadata[title].authorEvidence={revisionId:revision.revid,sourcePage:`https://commons.wikimedia.org/w/index.php?oldid=${revision.revid}`,field:artist,derivativeCredits:derivatives};
 console.log(`Recovered attribution ${title}`);
 }
}catch(e){failures.push({stage:'attribution',count:authorTitles.length,error:e.message.slice(0,140)});}
await writeFile(mdPath,JSON.stringify(metadata));
const accepted=candidates.filter(c=>currentLogoMetadata(metadata[c.title]));
const thumbTitles=[...new Set(accepted.map(c=>c.title))].filter(t=>!metadata[t].thumburl);
for(let thumbOffset=0;thumbOffset<thumbTitles.length;thumbOffset+=40)try{const result=await api('commons.wikimedia.org',{action:'query',prop:'imageinfo',iiprop:'url',iiurlwidth:'320',titles:thumbTitles.slice(thumbOffset,thumbOffset+40).join('|'),redirects:'1'});for(const page of Object.values(result.query?.pages||{})){const info=page.imageinfo?.[0];if(info?.thumburl&&metadata[page.title])metadata[page.title].thumburl=info.thumburl;}}catch(e){failures.push({stage:'thumbnail',count:thumbTitles.length,error:e.message});}
await writeFile(mdPath,JSON.stringify(metadata));
const reportPath=`${base}/manifest.json`, report=existsSync(reportPath)?await json(reportPath):{schemaVersion:'1.0.0',sourceRelease:release,universities:{}};
for(const[id,entry]of Object.entries(report.universities))if(!accepted.some(c=>c.id===id&&(metadata[c.title]?.canonicaltitle||c.title)===entry.logo.commonsTitle))delete report.universities[id];
report.failures=failures;report.generatedAt=new Date().toISOString();
await pool(missing,async u=>{
 if(report.universities[u.id]?.logo)return;
 for(const c of accepted.filter(c=>c.id===u.id)){
  try{
   const info=metadata[c.title];if(!info.url.startsWith('https://upload.wikimedia.org/wikipedia/commons/'))throw Error('Not a Commons original');
   const downloadUrl=info.thumburl||info.url;
   const download=new URL(downloadUrl);
   if(!['upload.wikimedia.org','thumb.wikimedia.org'].includes(download.hostname)||!download.pathname.startsWith('/wikipedia/commons/'))throw Error('Invalid thumbnail host');
   const original=await request(downloadUrl,true);
   if(original.subarray(0,1000).toString().includes('<svg')&&/<script|<foreignObject|<image|\bon\w+\s*=|(?:href\s*=\s*["'](?!#))|@import|url\(\s*["']?https?:/i.test(original.toString()))throw Error('unsafe-svg');
   const {data,info:raster}=await sharp(original,{limitInputPixels:40000000}).rotate().resize({width:160,height:160,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer({resolveWithObject:true});
   if(raster.width<20||raster.height<15)throw Error('Too small');
   const hash=createHash('sha256').update(data).digest('hex'), filename=`${u.id}.${hash.slice(0,16)}.webp`;await writeFile(`${base}/logos/${filename}`,data);
   report.universities[u.id]={logo:{url:`/media/${release}/logos/${filename}`,width:raster.width,height:raster.height,bytes:data.length,sha256:hash,sourceUrl:info.url,...reusableMetadata(info),transform:'Resized and converted to WebP; displayed crop may vary.',acquisition:{method:c.method,identitySource:c.identitySource,...(info.authorEvidence?{authorEvidence:info.authorEvidence}:{})}},name:u.names.en,siteRank:u.siteRank};console.log(`Logo ${u.id} ${u.names.en}`);break;
  }catch(e){failures.push({stage:'download',id:u.id,title:c.title,error:e.message.slice(0,180)});}
 }
},5);
report.counts={missingInitially:missing.length,candidates:candidates.length,reusableCandidates:accepted.length,added:Object.keys(report.universities).length};
report.unresolved=missing.filter(u=>!report.universities[u.id]).map(u=>({id:u.id,name:u.names.en,siteRank:u.siteRank,candidates:candidates.filter(c=>c.id===u.id).map(c=>({title:c.title,method:c.method,license:metadata[c.title]?.extmetadata?.LicenseShortName?.value||null,hasAuthor:!!metadata[c.title]?.extmetadata?.Artist?.value}))}));
await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.counts));
