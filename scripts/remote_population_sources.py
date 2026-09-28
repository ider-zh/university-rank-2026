"""Read-only population source export, run inside UniDataPipeline's existing environment."""
import json,hashlib
from pathlib import Path
import polars as pl

def main(ids):
    snapshot='20251201'
    names={'wiki':'university_candidate_data_union','llm':'llm_extract_wiki','times':'university_link_times_higher_education','nces':'university_link_us_nces','gaokao':'gaokao_cn_stats'}
    sources={};hashes={}
    for key,name in names.items():
        path=Path(f'dist/{name}_{snapshot}.parquet')
        hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
        frame=pl.scan_parquet(path).filter(pl.col('entity_id').is_in(ids))
        if key=='wiki':frame=frame.select('entity_id','en_wiki_title','zh_wiki_title','en_infoboxes','zh_infoboxes')
        elif key=='llm':frame=frame.select('entity_id','student_count','faculty_count')
        elif key=='nces':frame=frame.select('entity_id','UGDS',pl.col('academics').struct.field('student_faculty_ratio'))
        elif key=='gaokao':frame=frame.select('entity_id','enroll_count')
        rows={}
        for row in frame.collect().to_dicts():
            group=rows.setdefault(row['entity_id'],[])
            if row not in group:group.append(row)
        sources[key]=rows
    result={}
    def first(value):return next((v for v in value if v is not None),None)
    for id in ids:
        groups={k:v.get(id,[]) for k,v in sources.items()}
        # Preserve conflicting source rows instead of silently selecting an arbitrary row.
        single={k:v[0] if len(v)==1 else {} for k,v in groups.items()}
        w,t,n,g=(single[k] for k in ['llm','times','nces','gaokao'])
        try:times_students=float(t.get('stats_number_students','').replace(',',''))
        except (ValueError,AttributeError):times_students=None
        nr=n.get('student_faculty_ratio');ug=n.get('UGDS')
        baseline={'students':first([w.get('student_count'),times_students,ug,g.get('enroll_count')]),'faculty':first([w.get('faculty_count'),ug/nr if ug is not None and nr else None])}
        result[id]={'baseline':baseline,'sources':groups}
    return {'snapshot':snapshot,'sourceHashes':hashes,'universities':result}
