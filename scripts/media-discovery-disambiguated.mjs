// Resolve known ambiguous labels using Wikipedia's returned Wikidata ID, never label alone.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';import{promisify}from'node:util';
const exec=promisify(execFile),path='archives/media-discovery/candidates.json';
const candidates=JSON.parse(await readFile(path,'utf8'));
const titles={Q10994963:'Hemwati Nandan Bahuguna Garhwal University',Q1814435:'University of New England (Australia)',Q1927705:'Trinity College (Connecticut)',Q2495841:'University of Colorado Colorado Springs'};
for(const [id,title] of Object.entries(titles)){
  try{const params=new URLSearchParams({action:'query',format:'json',titles:title,prop:'pageprops|pageimages|images',piprop:'name',imlimit:'500',redirects:'1'});
    const {stdout}=await exec('curl',['--proxy',process.env.https_proxy||process.env.HTTPS_PROXY||process.env.http_proxy,'--silent','--show-error','--fail','--max-time','25',`https://en.wikipedia.org/w/api.php?${params}`],{maxBuffer:3_000_000});
    for(const p of Object.values(JSON.parse(stdout).query?.pages||{})){
      if(p.pageprops?.wikibase_item!==id){console.log(id,'identity-mismatch-rejected');continue;}
      for(const img of p.images||[]){if(candidates.some(c=>c.id===id&&c.title===img.title))continue;candidates.push({id,title:img.title,evidence:{method:'wikipedia-article-image-qid-match',sourcePage:`https://en.wikipedia.org/?curid=${p.pageid}`,wikibaseItem:id,disambiguatedTitle:p.title,requiresCampusIdentityReview:true}});}
      console.log(id,p.title,(p.images||[]).length);
    }
  }catch(e){console.log(id,'network-failure');}
}
await writeFile(path,JSON.stringify(candidates,null,2));
