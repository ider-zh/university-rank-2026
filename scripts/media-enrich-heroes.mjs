/** Incremental, non-publishing campus-photo enrichment. Candidate evidence is retained. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {reusableMetadata,isCampusCandidate} from './media-policy.mjs';
import {simplifyDisplay} from './simplify-zh.mjs';

const exec=promisify(execFile), args=process.argv.slice(2);
const arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const root=resolve(arg('--root','.')), out=resolve(arg('--out','archives/hero-staging'));
const {release}=await read(resolve(root,'src/data/catalog.json'));
const current=await read(resolve(root,`public/media/${release}/manifest.json`));
const candidates=await read(resolve(arg('--candidates','archives/media-discovery/candidates.json')));
const rejected=await read(new URL('./media-hero-review.json',import.meta.url));
await mkdir(resolve(out,'heroes'),{recursive:true});
const cachePath=resolve(out,'metadata.json');
const cache=existsSync(cachePath)?await read(cachePath):{};
const proxy=process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy;
const curl=async(url,binary=false)=>{
  const {stdout}=await exec('curl',['--silent','--show-error','--fail','--max-time','25','--max-filesize','15000000',
    ...(proxy?['--proxy',proxy]:[]),'--user-agent','UniversityRankStaticMedia/1.0 (source attribution retained)',url],
    {encoding:binary?'buffer':'utf8',maxBuffer:15_000_001});return stdout;
};
const allowed=(args.includes('--review-only')?[]:candidates).filter(c=>current.universities[c.id]&&!current.universities[c.id].hero
  && !rejected[c.title]
  && /^File:.+\.(jpe?g|png|webp|tiff?)$/i.test(c.title)
  && (!c.evidence?.requiresCampusIdentityReview||c.evidence?.reviewedCampusIdentity));
const titles=[...new Set(allowed.map(c=>c.title))];
for(let offset=0;offset<titles.length;offset+=40){
  const batch=titles.slice(offset,offset+40).filter(t=>!(t in cache));if(!batch.length)continue;
  const query=new URLSearchParams({action:'query',format:'json',prop:'imageinfo',iiprop:'url|size|mime|extmetadata|canonicaltitle',iiurlwidth:'1440',titles:batch.join('|'),redirects:'1'});
  try{
    const data=JSON.parse(await curl(`https://commons.wikimedia.org/w/api.php?${query}`));
    if(!data.query)throw new Error('missing-query');
    const aliases=new Map([...(data.query.normalized||[]),...(data.query.redirects||[])].map(x=>[x.from,x.to]));
    for(const title of batch){let canonical=title;for(let i=0;i<5&&aliases.has(canonical);i++)canonical=aliases.get(canonical);
      cache[title]=Object.values(data.query.pages).find(p=>p.title===canonical)?.imageinfo?.[0]||null;}
    await writeFile(cachePath,JSON.stringify(cache));
  }catch(error){console.log(`Metadata batch failed: ${error.code || error.name}`);}
  console.log(`Campus metadata ${Math.min(offset+40,titles.length)}/${titles.length}`);
}
const manifestPath=resolve(out,'additions.json');
const previous=existsSync(manifestPath)?await read(manifestPath):{universities:{}};
const additions={sourceRelease:release,createdAt:new Date().toISOString(),
  universities:Object.fromEntries(Object.entries(previous.universities).filter(([,asset])=>!rejected[asset.commonsTitle])),
  visualRejections:rejected,failures:previous.failures||[]};
const priorFailures=new Set((previous.failures||[]).map(f=>f.id+'|'+f.title));
const grouped=Map.groupBy(allowed,c=>c.id);
let done=0;const entries=[...grouped];
async function worker(){
  for(;;){const entry=entries.shift();if(!entry)return;const [id,choices]=entry;
    if(additions.universities[id])continue;
    for(const candidate of choices){
      if(!args.includes('--retry-failed')&&priorFailures.has(id+'|'+candidate.title))continue;
      const info=cache[candidate.title],metadata=reusableMetadata(info);
      if(!metadata||!isCampusCandidate({source_flag:'wikidata-image',filename:candidate.title},info))continue;
      try{
        const downloadUrl=info.thumburl||info.url;
        if(!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(downloadUrl))throw new Error('unsupported-download-host');
        const original=await curl(downloadUrl,true);
        const {data,info:dimensions}=await sharp(original,{limitInputPixels:40_000_000}).rotate()
          .resize({width:1440,height:960,fit:'inside',withoutEnlargement:true}).webp({quality:78}).toBuffer({resolveWithObject:true});
        const sha256=createHash('sha256').update(data).digest('hex'),filename=`${id}.${sha256.slice(0,16)}.webp`;
        await writeFile(resolve(out,'heroes',filename),data);
        additions.universities[id]=simplifyDisplay({filename,width:dimensions.width,height:dimensions.height,bytes:data.length,sha256,
          sourceUrl:info.url,...metadata,identityEvidence:candidate.evidence,
          transform:'Resized and converted to WebP; displayed crop may vary.'});
        break;
      }catch(error){additions.failures.push({id,title:candidate.title,error:error.code ? String(error.code) : error.message.slice(0,160)});}
    }
    done++;if(done%10===0){await writeFile(manifestPath,JSON.stringify(additions)+'\n');console.log(`Campus attempts ${done}/${grouped.size}; additions ${Object.keys(additions.universities).length}`);}
  }
}
await Promise.all(Array.from({length:3},worker));
await writeFile(manifestPath,JSON.stringify(additions)+'\n');
console.log(JSON.stringify({sourceRelease:release,missingBefore:Object.values(current.universities).filter(x=>!x.hero).length,
  candidates:allowed.length,schools:grouped.size,additions:Object.keys(additions.universities).length,failures:additions.failures.length,out}));
