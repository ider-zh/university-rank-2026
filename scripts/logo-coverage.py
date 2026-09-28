"""Audit all admitted universities; optionally discover official homepage marks.

Discovery is staging-only. Images must be visually and identity reviewed before use.
"""
import argparse,concurrent.futures,json,os,re,subprocess
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin,urlparse
ROOT=Path(__file__).resolve().parents[1]

class Images(HTMLParser):
 def __init__(self):super().__init__();self.items=[];self.title='';self.in_title=False
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='title':self.in_title=True
  if tag in ['img','image']:
   src=a.get('src') or a.get('data-src') or a.get('xlink:href') or a.get('href') or ''
   label=' '.join(a.get(k) or '' for k in ['alt','class','id'])
   if re.search(r'logo|校徽|校标',src+' '+label,re.I):self.items.append({'path':src,'label':label,'kind':'logo'})
  if tag=='link' and 'icon' in a.get('rel','').lower():self.items.append({'path':a.get('href',''),'label':a.get('sizes',''),'kind':'icon'})
 def handle_endtag(self,tag):
  if tag=='title':self.in_title=False
 def handle_data(self,data):
  if self.in_title:self.title+=data

def main():
 p=argparse.ArgumentParser();p.add_argument('--discover',action='store_true');p.add_argument('--limit',type=int,default=294);args=p.parse_args()
 release=json.loads((ROOT/'src/data/catalog.json').read_text())['release']
 schools=json.loads((ROOT/f'public/data/{release}/ranking.json').read_text())['universities']
 media=json.loads((ROOT/f'public/media/{release}/manifest.json').read_text())
 missing=[u for u in schools if not media['universities'][u['id']].get('logo')]
 base=ROOT/'archives/logo-coverage-20260927';base.mkdir(parents=True,exist_ok=True)
 def discover(u):
  target=base/(u['id']+'.json')
  if target.exists() and 'sequence item' not in json.loads(target.read_text()).get('error',''):return
  detail=json.loads((ROOT/f'public/data/{release}/universities/{u["id"]}.json').read_text())
  url=detail['profiles']['en'].get('website') or detail['profiles']['zh'].get('website')
  result={'id':u['id'],'names':u['names'],'rank':u['siteRank'],'website':url}
  try:
   if not url or urlparse(url).scheme not in ['https','http']:raise ValueError('No HTTP official website')
   if url.startswith('http:'):url='https:'+url[5:]
   proxy=os.environ.get('https_proxy') or os.environ.get('HTTPS_PROXY') or os.environ.get('http_proxy')
   proc=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','18','--max-filesize','3000000',*(['--proxy',proxy] if proxy else []),'--write-out','\n%{url_effective}',url],capture_output=True,timeout=22)
   if proc.returncode:raise ValueError(proc.stderr.decode(errors='replace')[-180:])
   raw,_,effective=proc.stdout.rpartition(b'\n');final=effective.decode();parser=Images();parser.feed(raw.decode('utf-8',errors='replace'))
   result.update({'finalUrl':final,'pageTitle':parser.title,'candidates':list({urljoin(final,x['path']):{**x,'url':urljoin(final,x['path'])} for x in parser.items if x['path'] and not x['path'].startswith('data:')}.values())})
   (base/(u['id']+'.html')).write_bytes(raw)
  except Exception as e:result['error']=str(e)
  target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(u['id'],len(result.get('candidates',[])),result.get('error',''),flush=True)
 if args.discover:
  with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(discover,missing[:args.limit]))
 report={'release':release,'total':len(schools),'covered':len(schools)-len(missing),'missing':len(missing),'tiers':{},'unresolved':[]}
 review_path=ROOT/'scripts/logo-review-20260927.json'
 rejected=json.loads(review_path.read_text()).get('rejected',{}) if review_path.exists() else {}
 for n in [50,100,200,500,1000]:
  group=schools[:n];covered=sum(bool(media['universities'][u['id']].get('logo')) for u in group)
  report['tiers'][str(n)]={'covered':covered,'total':len(group),'percent':round(100*covered/len(group),1)}
 for u in missing:
  path=base/(u['id']+'.json');found=json.loads(path.read_text()) if path.exists() else {}
  report['unresolved'].append({'id':u['id'],'name':u['names']['zh'],'rank':u['siteRank'],'candidateCount':len(found.get('candidates',[])),'status':'rejected-on-review' if u['id'] in rejected else 'discovery-error' if found.get('error') else 'pending-review' if found.get('candidates') else 'no-candidates' if found else 'not-attempted','error':found.get('error'),'reviewReason':rejected.get(u['id'])})
 dest=ROOT/f'reports/{release}/logo-coverage-20260927.json';dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in report.items() if k!='unresolved'},ensure_ascii=False))
if __name__=='__main__':main()
