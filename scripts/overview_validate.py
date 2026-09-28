"""Verify model-reviewed public text against its immutable local audit records."""
import json,sys
from pathlib import Path
from content_generate import ROOT as PROJECT,digest
from overview_polish import validate_candidate
def main():
 root=Path(sys.argv[1]) if len(sys.argv)>1 else PROJECT
 release=json.loads((root/'src/data/catalog.json').read_text())['release']
 count=0
 for file in (root/'public/overviews'/release).glob('Q*.json'):
  value=json.loads(file.read_text())
  if not value.get('polish'):continue
  audit=json.loads((root/'reports'/release/'overview-polish'/file.name).read_text())
  candidate=validate_candidate(audit['candidate'],audit['sources'])
  assert audit['id']==value['id'] and audit['review']=={'approved':True,'issues':[]}
  assert value['polish']['sourceHash']==digest(audit['sources'])
  assert value['polish']['status']=='model-reviewed-not-human-verified'
  assert value['polish']['model']==audit['model']=='qwen3.8-27b'
  assert value['polish']['summary']==candidate['summary']['text']
  assert value['paragraphs']['zh']==[p['text'] for p in candidate['paragraphs']]
  count+=1
 print(f'Polished Chinese introductions verified against source and review records: {count}')
if __name__=='__main__':main()
