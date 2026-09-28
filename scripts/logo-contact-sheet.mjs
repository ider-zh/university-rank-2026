import {readFile,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
const base='archives/logo-staging',report=JSON.parse(await readFile(`${base}/manifest.json`,'utf8'));
const items=Object.entries(report.universities).sort((a,b)=>a[1].siteRank-b[1].siteRank);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
for(let offset=0;offset<items.length;offset+=48){const page=items.slice(offset,offset+48),columns=6,cellWidth=220,cellHeight=220;
const composites=[];
for(let i=0;i<page.length;i++){const[id,entry]=page[i],left=(i%columns)*cellWidth,top=Math.floor(i/columns)*cellHeight;
const text=Buffer.from(`<svg width="220" height="220"><rect width="220" height="220" fill="#eee"/><rect x="3" y="3" width="214" height="174" fill="white"/><text x="8" y="191" font-family="sans-serif" font-size="12">${escape(`${entry.siteRank}. ${id}`)}</text><text x="8" y="209" font-family="sans-serif" font-size="11">${escape(entry.name.slice(0,34))}</text></svg>`);
composites.push({input:text,left,top});const buffer=await readFile(`${base}/logos/${entry.logo.url.split('/').at(-1)}`);
composites.push({input:buffer,left:left+Math.floor((cellWidth-entry.logo.width)/2),top:top+Math.floor((175-entry.logo.height)/2)});
}
const result=await sharp({create:{width:columns*cellWidth,height:Math.ceil(page.length/columns)*cellHeight,channels:3,background:'#eee'}}).composite(composites).webp({quality:92}).toBuffer();await writeFile(`${base}/contact-${offset/48+1}.webp`,result);
}
