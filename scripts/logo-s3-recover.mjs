/** Retry licensed bitmap download failures against the existing, scoped local S3 associations. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {currentLogoMetadata} from './logo-policy.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8')),base='archives/logo-staging';
const report=await read(`${base}/manifest.json`),metadata=await read(`${base}/metadata.json`);
const sources=[];for(const f of await readdir('archives/media-cache'))if(f.endsWith('.sources.json'))sources.push(...await read(`archives/media-cache/${f}`));
const selections=[];
for(const failure of report.failures.filter(f=>f.stage==='download')){
 if(report.universities[failure.id])continue;
 const info=metadata[failure.title];if(!currentLogoMetadata(info))continue;
 const filename=failure.title.replace(/^File:/,'').replaceAll('_',' ');
 const row=sources.find(r=>r.qid===failure.id&&r.source_flag==='wikidata-logo'&&r.filename.replace(/^File:/,'').replaceAll('_',' ')===filename);
 if(row&&!selections.some(s=>s.id===row.qid))selections.push({id:row.qid,kind:'logo',sourceUrl:row.url,title:failure.title});
}
if(selections.length){
 const remote=await readFile('scripts/media-remote.py','utf8');
 const request={mode:'download',ids:selections.map(s=>s.id),assets:selections.map(({id,kind,sourceUrl})=>({id,kind,sourceUrl}))};
 const response=await new Promise((accept,reject)=>{const child=spawn('ssh',['ider@192.168.1.229','cd /home/ider/workspace/UniDataPipeline && .venv/bin/python -'],{stdio:['pipe','pipe','inherit']});const chunks=[];child.stdout.on('data',b=>chunks.push(b));child.on('error',reject);child.on('close',code=>code===0?accept(Buffer.concat(chunks).toString()):reject(Error(`S3 read failed ${code}`)));child.stdin.end(`${remote}\nmain(json.loads(${JSON.stringify(JSON.stringify(request))}))\n`);});
 for(const line of response.trim().split('\n').filter(Boolean)){
  const result=JSON.parse(line),selection=selections.find(s=>s.id===result.id);if(result.error){console.log(result.id,result.error);continue;}
  const source=Buffer.from(result.data,'base64');const probe=await sharp(source).metadata();if(!['gif','webp','png','jpeg'].includes(probe.format))throw Error('S3 recovery accepts raster only');
  const {data,info}=await sharp(source,{limitInputPixels:40000000}).rotate().resize({width:160,height:160,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toBuffer({resolveWithObject:true});
  const hash=createHash('sha256').update(data).digest('hex'),filename=`${result.id}.${hash.slice(0,16)}.webp`;await writeFile(`${base}/logos/${filename}`,data);
  const university=report.unresolved.find(u=>u.id===result.id);
  report.universities[result.id]={name:university.name,siteRank:university.siteRank,logo:{url:`/media/${report.sourceRelease}/logos/${filename}`,width:info.width,height:info.height,bytes:data.length,sha256:hash,sourceUrl:selection.sourceUrl,...currentLogoMetadata(metadata[selection.title]),transform:'Resized and converted to WebP; displayed crop may vary.',acquisition:{method:'Existing Wikidata logo association; local S3 bitmap fallback',identitySource:`https://www.wikidata.org/wiki/${result.id}`}}};console.log(`S3 recovered ${result.id} ${university.name}`);
 }
 report.unresolved=report.unresolved.filter(u=>!report.universities[u.id]);report.counts.added=Object.keys(report.universities).length;report.generatedAt=new Date().toISOString();await writeFile(`${base}/manifest.json`,JSON.stringify(report,null,2)+'\n');
}
