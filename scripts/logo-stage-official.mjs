/** Staging only: download homepage identity candidates for visual review. */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {createHash} from 'node:crypto';import sharp from 'sharp';
import {embeddedPng} from './logo-image-safety.mjs';
const exec=promisify(execFile),base='archives/logo-coverage-20260927';
const rows=[];for(const file of await readdir(base))if(/^Q\d+\.json$/.test(file))rows.push(JSON.parse(await readFile(`${base}/${file}`,'utf8')));
rows.sort((a,b)=>a.rank-b.rank);
await mkdir(`${base}/assets`,{recursive:true});
const results=[],proxy=process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy;
const targets=rows.filter(r=>r.candidates?.length).slice(0,100);let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<targets.length){const row=targets[cursor++];
 const choices=row.candidates.filter(c=>/^https:\/\//.test(c.url)&&!/(?:appgallery|facebook|twitter|challenge-accepted|universities-australia|qq|weibo|instagram|youtube|footer)/i.test(c.url+' '+c.label));
 choices.sort((a,b)=>score(b)-score(a));
 for(const [index,c] of choices.slice(0,2).entries()){
  const key=`${row.id}-${index}`,path=`${base}/assets/${key}`;
  const originalPath=`${path}.${createHash('sha256').update(c.url).digest('hex').slice(0,16)}.original`;
  try{
   let original;try{original=await readFile(originalPath);}catch{
    original=(await exec('curl',['--fail','--silent','--show-error','--location','--max-time','20','--max-filesize','5000000',...(proxy?['--proxy',proxy]:[]),c.url],{encoding:'buffer',maxBuffer:5000000})).stdout;
    await writeFile(originalPath,original);
   }
   let raster=original,sourceFormat;
   if(original.subarray(0,1000).toString().includes('<svg')){
    if(/<image\b/i.test(original.toString())){raster=embeddedPng(original);sourceFormat='embedded-png';}
    else if(/<script|<foreignObject|\bon\w+\s*=|(?:href\s*=\s*["'](?!#))|@import|url\(\s*["']?https?:/i.test(original.toString()))throw Error('unsafe-svg');
   }
   if(original.readUInt32LE(0)===65536) raster=(await exec('python3',['-c','from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.save(sys.stdout.buffer,format="PNG")',originalPath],{encoding:'buffer',maxBuffer:5000000})).stdout;
   const md=await sharp(raster).metadata();
   if(md.width<48||md.height<32)throw Error('too-small');
   await sharp(raster).resize({width:160,height:160,fit:'inside'}).webp({lossless:true}).toFile(path+'.webp');
   results.push({key,id:row.id,name:row.names.en,rank:row.rank,sourcePage:row.finalUrl,pageTitle:row.pageTitle,sourceUrl:c.url,label:c.label,originalPath,width:md.width,height:md.height,sourceSha256:createHash('sha256').update(original).digest('hex'),ico:original.readUInt32LE(0)===65536,...(sourceFormat?{sourceFormat}:{})});
  }catch(e){console.log(key,String(e.stderr||e.message).slice(-100));}
 }
}}));
function score(c){return /192x192|180x180|apple-touch-icon/.test(c.url)?100:c.kind==='logo'?60:/96x96/.test(c.url)?50:10;}
results.sort((a,b)=>a.rank-b.rank||a.key.localeCompare(b.key));
await writeFile(`${base}/candidates.json`,JSON.stringify(results,null,2)+'\n');
for(let offset=0;offset<results.length;offset+=30){
 const group=results.slice(offset,offset+30),tiles=[];
 for(let i=0;i<group.length;i++){
  const r=group[i],x=i%5*220,y=Math.floor(i/5)*140;
  const img=await sharp(`${base}/assets/${r.key}.webp`).resize({width:180,height:100,fit:'contain',background:'#e6e6e6'}).png().toBuffer();
  tiles.push({input:img,left:x+20,top:y+5});
  const label=`${offset+i}: ${r.key}`;tiles.push({input:Buffer.from(`<svg width="220" height="30"><text x="5" y="20" font-size="14">${label}</text></svg>`),left:x,top:y+108});
 }
 await sharp({create:{width:1100,height:Math.ceil(group.length/5)*140,channels:3,background:'#ffffff'}}).composite(tiles).png().toFile(`${base}/sheet-${offset/30}.png`);
}
console.log(JSON.stringify({schools:targets.length,candidates:results.length}));
