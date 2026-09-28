"""Conservative student/academic-staff backfill with source-level audit trails."""
import argparse,json,subprocess,re,hashlib
from datetime import datetime,timezone
from urllib.parse import quote
from pathlib import Path
from content_generate import ROOT,atomic_json
from infobox_normalize import boxes
from population_rules import ALIASES,count_value,select_observation,times_pair
from population_live import harvest
from population_overlay import validate_overlay

def observations_for(id,row,live_dir,entity):
    observations=[];rejected=[]
    closed=False
    for wiki in row['sources']['wiki']:
        for lang in ['en','zh']:
            values=boxes(wiki.get(lang+'_infoboxes'))
            if any(values.get(k) for k in ['closed','dissolved','停办','停辦']):closed=True
    for claim in entity.get('claims',{}).get('P576',[]):
        if claim.get('rank')!='deprecated' and claim.get('mainsnak',{}).get('datavalue'):closed=True
    live=json.loads((live_dir/f'{id}.json').read_text()) if (live_dir/f'{id}.json').exists() else None
    if live and any(label.lower() in ['closed','dissolved','停办','停辦'] for label,value in live['rows']):closed=True
    def add_fields(fields,source,url,**meta):
        for key,raw in fields.items():
            normalized=re.sub(r'\s+',' ',re.sub(r'\[[^]]+\]','',key)).lower().strip()
            field=next((f for f,aliases in ALIASES.items() if normalized in aliases),None)
            if not field:continue
            value=count_value(raw)
            if value and re.search(r'\bfte\b',normalized):value['basis']='fte'
            if value:
                observations.append({'field':field,**value,'raw':raw,'source':source,'sourceUrl':url,'historicalOnly':closed,**meta})
            elif raw:rejected.append({'field':field,'raw':raw,'source':source,'sourceUrl':url,'reason':'ambiguous-or-nonnumeric-count'})
    for wiki in row['sources']['wiki']:
        for lang in ['en','zh']:
            title=wiki.get(lang+'_wiki_title')
            if title:add_fields(boxes(wiki.get(lang+'_infoboxes')),'wikipedia-snapshot',f'https://{lang}.wikipedia.org/wiki/'+quote(title.replace(' ','_')),snapshot='20251201',language=lang)
    if live:add_fields(dict(live['rows']),'wikipedia-live',live['sourceUrl'],revision=live['revision'],retrievedAt=live['retrievedAt'],language=live['lang'])
    for prop,field in [('P2196','students'),('P1128','employees')]:
        for claim in entity.get('claims',{}).get(prop,[]):
            if claim.get('rank')=='deprecated':continue
            raw=claim.get('mainsnak',{}).get('datavalue',{}).get('value')
            if not isinstance(raw,dict) or raw.get('unit')!='1':continue
            value=count_value(raw.get('amount','').lstrip('+'))
            if not value:continue
            quals=claim.get('qualifiers',{})
            dates=[q.get('datavalue',{}).get('value',{}).get('time','') for q in quals.get('P585',[])]
            value['period']=next((d[1:5] for d in dates if re.match(r'^\+\d{4}-',d)),None)
            refinements=[q.get('datavalue',{}).get('value',{}).get('id') for q in quals.get('P4241',[])]
            if value['period'] and refinements==['Q40720568']:value['period']+=' autumn (northern hemisphere)'
            observations.append({'field':field,**value,'raw':raw,'source':'wikidata','sourceUrl':f'https://www.wikidata.org/wiki/{id}#{prop}','statementId':claim.get('id'),'references':claim.get('references',[]),'qualifiers':quals,'scopeUncertain':any(k not in {'P585','P580','P582','P4241'} for k in quals),'historicalOnly':closed})
    pairs=[]
    for t in row['sources']['times']:
        pair=times_pair(t)
        if pair:
            url='https://www.timeshighereducation.com/world-university-rankings/'+t['id']
            pairs.append({**pair,'source':'times-snapshot','sourceUrl':url,'snapshot':'20251201','historicalOnly':closed})
    return observations,rejected,pairs,closed

def snapshot(release,ids):
    cache=ROOT/'archives/population-backfill'/release/'sources.json'
    if not cache.exists():
        code=(ROOT/'scripts/remote_population_sources.py').read_text()+f'\nprint(json.dumps(main({ids!r}),ensure_ascii=False))\n'
        result=subprocess.run(['ssh','-o','BatchMode=yes','ider@192.168.1.229','cd /home/ider/workspace/UniDataPipeline && .venv/bin/python -'],input=code.encode(),stdout=subprocess.PIPE,check=True,timeout=240)
        atomic_json(cache,json.loads(result.stdout))
    return json.loads(cache.read_text())

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--snapshot-only',action='store_true');parser.add_argument('--live',action='store_true');args=parser.parse_args()
    release=json.loads((ROOT/'src/data/catalog.json').read_text())['release']
    schools=json.loads((ROOT/'public/data'/release/'ranking.json').read_text())['universities']
    source=snapshot(release,[u['id'] for u in schools])
    missing={k:[id for id,r in source['universities'].items() if not r['baseline'][k] or r['baseline'][k]<0] for k in ['students','faculty']}
    print(json.dumps({'release':release,'missingCounts':{k:len(v) for k,v in missing.items()}},ensure_ascii=False))
    if args.snapshot_only:return
    target_ids=list(dict.fromkeys(missing['faculty']+missing['students']))
    live_dir=ROOT/'archives/population-backfill'/release/'live'
    if args.live:entities=harvest(source,target_ids,live_dir)
    else:
        entities={}
        for path in [ROOT/'archives/media-discovery/entities.json',ROOT/'archives/logo-staging/entities.json',live_dir/'wikidata.json']:
            if path.exists():
                value=json.loads(path.read_text());entities.update(value.get('entities',value))
    names={u['id']:u['names'] for u in schools};records={};unresolved=[]
    counts={'schools':len(schools),'initialMissing':{k:len(v) for k,v in missing.items()},'directFilled':{'students':0,'faculty':0},'facultyMissingWithTHEEstimate':0,'historicalInstitutionsAmongMissing':0}
    for id,row in source['universities'].items():
        observations,rejected,pairs,closed=observations_for(id,row,live_dir,entities.get(id,{}))
        selected={k:select_observation(observations,k) for k in ['students','faculty']}
        for key in selected:
            if id in missing[key] and selected[key]:counts['directFilled'][key]+=1
        active_pairs=[p for p in pairs if not p['historicalOnly']]
        signatures={(p['students'],p['studentsPerAcademicStaff']) for p in active_pairs}
        estimate=active_pairs[0] if len(signatures)==1 else None
        if id in missing['faculty'] and not selected['faculty'] and estimate:counts['facultyMissingWithTHEEstimate']+=1
        if id in target_ids and closed:counts['historicalInstitutionsAmongMissing']+=1
        replacements={k:selected[k] for k in selected if id in missing[k] and selected[k]}
        record={'id':id,'names':names[id],'baseline':row['baseline'],'closedOrMergedSourceFlag':closed,'replacements':replacements,'observations':observations,'rejectedObservations':rejected,'timesPairs':pairs,'estimatedFaculty':estimate if id in missing['faculty'] and not selected['faculty'] else None}
        records[id]=record
        gaps=[k for k in ['students','faculty'] if id in missing[k] and k not in replacements]
        if gaps:unresolved.append({'id':id,'name':names[id]['en'],'fields':gaps,'reason':'historical-institution-needs-admission-review' if closed else 'no-unambiguous-direct-count','hasSameSourceTHEEstimate':bool(record['estimatedFaculty'])})
    report=ROOT/'reports'/release/'population-backfill'
    atomic_json(report/'observations.json',{'release':release,'snapshot':source['snapshot'],'sourceHashes':source['sourceHashes'],'universities':records})
    overlay={'schemaVersion':'1.0.0','sourceRelease':release,'sourceSnapshot':source['snapshot'],'generatedAt':datetime.now(timezone.utc).isoformat(),'policy':'only-fill-missing-direct-counts-no-estimates-no-ranking-change','universities':{id:r for id,r in records.items() if r['replacements'] or r['estimatedFaculty']}}
    validate_overlay(overlay)
    atomic_json(report/'overlay.json',overlay)
    atomic_json(report/'unresolved.json',unresolved)
    counts['remainingDirectMissing']={k:counts['initialMissing'][k]-counts['directFilled'][k] for k in missing}
    counts['rankingChanged']=False
    atomic_json(report/'summary.json',counts)
    print(json.dumps(counts,ensure_ascii=False))

if __name__=='__main__':main()
