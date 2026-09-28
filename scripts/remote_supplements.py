"""Prepended supplement_rules.py; source database/files are read-only."""
import csv
import io
import json
import hashlib
import zipfile
from pathlib import Path
from collections import defaultdict
import polars as pl
import psycopg
from psycopg.rows import dict_row
from dotenv import dotenv_values

def main(request):
    ids=request['ids']; us_ids=request['usIds']; release=request['release']
    candidates=pl.scan_parquet('dist/university_candidate_data_union_20251201.parquet').filter(pl.col('entity_id').is_in(ids)).select('entity_id','en_plaintext','zh_plaintext').collect()
    env=dotenv_values('.env')
    with psycopg.connect(env['PG_DATABASE_URL'].replace('postgresql+psycopg://','postgresql://'),options='-c default_transaction_read_only=on -c statement_timeout=60000',row_factory=dict_row) as c:
        mappings=c.execute('SELECT qid,unitid,data_version FROM dev.university_unitid_data_link WHERE qid=ANY(%s) ORDER BY data_version DESC',(us_ids,)).fetchall()
    selected={}
    for row in mappings:
        if row['qid'] not in selected:selected[row['qid']]=[]
        if any(m['unitid']==row['unitid'] for m in selected[row['qid']]):continue
        if selected[row['qid']] and row['data_version']!=selected[row['qid']][0]['data_version']:continue
        selected[row['qid']].append(row)
    units={r['unitid'] for rows in selected.values() for r in rows}
    csvs={};source_hashes={}
    for filename in ['MERGED2023_24_PP.csv','Most-Recent-Cohorts-Institution.csv']:
        path=Path('data')/filename
        source_hashes[filename]=hashlib.sha256(path.read_bytes()).hexdigest()
        with path.open(encoding='utf-8-sig') as f:csvs[filename]={r['UNITID']:r for r in csv.DictReader(f) if r['UNITID'] in units}
    archive_name='OPE CSS Custom Data 2025-07-02 093604.zip'
    path=Path('data')/archive_name
    source_hashes[archive_name]=hashlib.sha256(path.read_bytes()).hexdigest()
    safety=defaultdict(list); seen={};conflicts=[]
    with zipfile.ZipFile(path) as archive:
        for filename in archive.namelist():
            parsed=parse_safety_file(filename)
            if not parsed:continue
            category,geography=parsed
            with archive.open(filename) as f:
                for original in csv.DictReader(io.TextIOWrapper(f,encoding='utf-8-sig')):
                    row={k.strip():v for k,v in original.items() if k}
                    unit=row.get('Unitid')
                    if unit not in units:continue
                    year=row.get('Survey year','').strip()
                    if not re.fullmatch(r'20\d\d',year):continue
                    item={'year':int(year),'campusId':row.get('Campus ID','').strip(),'campusName':row.get('Campus Name','').strip(),
                        'category':category,'geography':geography,'metrics':safety_metrics(row,category),'sourceFile':filename}
                    if category=='Fires':item['facility']=row.get('Name of Facility','').strip()
                    key=(unit,year,item['campusId'],category,geography,item.get('facility',''),row.get('Street Address',''))
                    if key in seen:
                        if seen[key]!=item and not seen[key].get('conflict'):
                            conflicts.append({'unitid':unit,'key':list(key),'reason':'conflicting safety row','first':json.loads(json.dumps(seen[key])),'second':item})
                            seen[key]['conflict']=True
                            seen[key]['metrics']=[{'key':m['key'],'value':None} for m in seen[key]['metrics']]
                        continue
                    seen[key]=item;safety[unit].append(item)
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        def write(path,value):z.writestr(path,json.dumps(value,ensure_ascii=False,allow_nan=False)+'\n')
        for row in candidates.to_dicts():
            write(f'overviews/{row["entity_id"]}.json',{'id':row['entity_id'],'release':release,'sourceSnapshot':'20251201',
                'paragraphs':{l:extract_overview(row[l+'_plaintext']) for l in ['zh','en']}})
        for id in us_ids:
            institutions=[]
            for mapping in selected.get(id,[]):
                unit=mapping['unitid']; metrics={}; name=''
                for metric,(field,unit_name) in FIELDS.items():
                    chosen={'value':None,'field':field,'unit':unit_name,'sourceFile':None,'reportingYear':None}
                    for filename,rows in csvs.items():
                        row=rows.get(unit,{})
                        name=name or row.get('INSTNM','')
                        value=number(row.get(field),rate=unit_name=='percent')
                        if value is not None:
                            chosen.update(value=value,sourceFile=filename,reportingYear='2023–24' if filename.startswith('MERGED') else None);break
                    metrics[metric]=chosen
                institutions.append({'unitid':unit,'name':name,'mappingVersion':mapping['data_version'],'outcomes':metrics,
                    'safety':sorted(safety.get(unit,[]),key=lambda r:(-r['year'],r['campusId'],r['geography'],r['category'],r.get('facility','')))})
            write(f'us-data/{id}.json',{'id':id,'release':release,'institutions':institutions,
                'sources':{'scorecard':'https://collegescorecard.ed.gov/data/','safety':'https://ope.ed.gov/campussafety/','safetyArchive':archive_name},
                'status':'historical-source-records-not-live'})
        write('audit.json',{'release':release,'sourceHashes':source_hashes,'usSchools':len(us_ids),'mappedSchools':len(selected),
            'units':len(units),'safetyUnits':len(safety),'conflicts':conflicts,'overviewSchools':candidates.height})
    return out.getvalue()
