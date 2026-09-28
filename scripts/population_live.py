"""Bounded, cached Wikimedia requests. No API credentials are sent to Wikimedia."""
import concurrent.futures,json,os,subprocess,time,threading
from datetime import datetime,timezone
from urllib.parse import urlencode
from content_generate import ROOT,atomic_json
from population_rules import InfoboxHTML

def fetch_json(host,params):
 url=f'https://{host}/w/api.php?'+urlencode({'format':'json',**params})
 proxy=os.environ.get('https_proxy') or os.environ.get('HTTPS_PROXY') or os.environ.get('http_proxy')
 command=['curl','--fail','--silent','--show-error','--location','--max-time','45','--max-filesize','15000000','--user-agent','UniversityPopulationAudit/1.0 (source provenance retained)']
 if proxy:command+=['--proxy',proxy]
 result=subprocess.run(command+['--write-out','\n%{http_code}',url],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=50)
 body,_,status=result.stdout.rpartition(b'\n')
 if result.returncode:raise ValueError('Wikimedia HTTP '+status.decode(errors='replace')+'; curl code '+str(result.returncode)+'; no automatic retry')
 value=json.loads(body)
 if 'error' in value:raise ValueError('Wikimedia API error '+str(value['error'].get('code')))
 return value

def harvest(source,ids,directory):
 directory.mkdir(parents=True,exist_ok=True)
 entities={}
 for path in [ROOT/'archives/media-discovery/entities.json',ROOT/'archives/logo-staging/entities.json',directory/'wikidata.json']:
  if path.exists():
   data=json.loads(path.read_text());entities.update(data.get('entities',data))
 failures=[];rate_limited=threading.Event()
 missing=[id for id in ids if id not in entities]
 for offset in range(0,len(missing),10):
  batch=missing[offset:offset+10]
  try:
   result=fetch_json('www.wikidata.org',{'action':'wbgetentities','ids':'|'.join(batch),'props':'claims|sitelinks|info'})
   entities.update(result.get('entities',{}));atomic_json(directory/'wikidata.json',{id:entities[id] for id in ids if id in entities})
  except Exception as error:
   failures.append({'stage':'wikidata','ids':batch,'error':str(error)})
   if 'HTTP 429' in str(error):rate_limited.set()
   break
  time.sleep(.3)
 def page(id):
  path=directory/f'{id}.json'
  if path.exists():return
  if rate_limited.is_set():
   failures.append({'stage':'wikipedia','id':id,'error':'Skipped after rate limit; retry in a later run'})
   return
  wiki=source['universities'][id]['sources']['wiki']
  wiki=wiki[0] if len(wiki)==1 else {}
  title=wiki.get('en_wiki_title');lang='en'
  if not title:title=wiki.get('zh_wiki_title');lang='zh'
  if not title:return
  try:
   time.sleep(1)
   response=fetch_json(f'{lang}.wikipedia.org',{'action':'query','prop':'pageprops|revisions','rvprop':'ids|timestamp','titles':title,'redirects':'1'})
   pages=list(response.get('query',{}).get('pages',{}).values())
   if len(pages)!=1 or pages[0].get('pageprops',{}).get('wikibase_item')!=id:raise ValueError('Wikipedia identity mismatch or no QID')
   meta=pages[0];revision=meta['revisions'][0]
   parsed=fetch_json(f'{lang}.wikipedia.org',{'action':'parse','oldid':revision['revid'],'prop':'text'})['parse']
   if parsed.get('revid')!=revision['revid']:raise ValueError('Wikipedia revision mismatch')
   html=parsed['text']['*'];parser=InfoboxHTML();parser.feed(html)
   atomic_json(path,{'id':id,'lang':lang,'title':meta['title'],'revision':revision['revid'],'revisionTime':revision['timestamp'],'retrievedAt':datetime.now(timezone.utc).isoformat(),'sourceUrl':f'https://{lang}.wikipedia.org/w/index.php?oldid={revision["revid"]}','rows':parser.rows})
   print(f'Wikipedia {id}: {len(parser.rows)} infobox fields',flush=True)
  except Exception as error:
   failures.append({'stage':'wikipedia','id':id,'error':str(error)[:200]})
   if 'HTTP 429' in str(error):rate_limited.set()
 # Avoid the high parallelism that previously triggered Wikimedia rate limiting.
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:list(pool.map(page,ids))
 atomic_json(directory/'wikidata.json',{id:entities[id] for id in ids if id in entities})
 atomic_json(directory/'failures.json',failures)
 return entities
