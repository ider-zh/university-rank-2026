"""Opt-in UniDataPipeline adapter. Does not recompute rankings or mutate source files."""
import json
from pathlib import Path

def validate_overlay(value):
    assert value['schemaVersion']=='1.0.0'
    assert value['policy']=='only-fill-missing-direct-counts-no-estimates-no-ranking-change'
    for id,row in value['universities'].items():
        assert id==row['id'] and id.startswith('Q')
        for field,observation in row['replacements'].items():
            assert field in {'faculty','students'} and observation['field']==field
            assert observation['value']>0 and observation['value']<=10000000
            assert observation['basis']=='headcount-unspecified'
            assert not observation.get('historicalOnly') and not observation.get('scopeUncertain')
            assert observation['sourceUrl'].startswith('https://')
            assert observation['source'] in {'wikipedia-live','wikipedia-snapshot','wikidata','official','times-snapshot'}
            assert row['baseline'][field] is None or row['baseline'][field]<=0
            if observation['source']=='wikidata':assert field=='students'
    return value

def apply_population_backfill(frame,overlay_path):
    """Call after merge/coalesce and BEFORE legacy zero-to-one coercion.

    Only missing direct counts are filled. Existing positive data is not overwritten.
    THE estimates remain separate audit fields and never enter faculty_count.
    """
    import polars as pl
    value=validate_overlay(json.loads(Path(overlay_path).read_text()))
    rows=[]
    for id,record in value['universities'].items():
        rows.append({'entity_id':id,'_population_students':record['replacements'].get('students',{}).get('value'),'_population_faculty':record['replacements'].get('faculty',{}).get('value')})
    if not rows:return frame
    patch=pl.DataFrame(rows,schema={'entity_id':pl.String,'_population_students':pl.Float64,'_population_faculty':pl.Float64})
    result=frame.join(patch,on='entity_id',how='left')
    for column,patch_column in [('student_count','_population_students'),('faculty_count','_population_faculty')]:
        result=result.with_columns(pl.when((pl.col(column).is_null()|(pl.col(column)<=0)) & pl.col(patch_column).is_not_null()).then(pl.col(patch_column)).otherwise(pl.col(column)).alias(column))
    return result.drop('_population_students','_population_faculty')

def export_parquet(overlay_path,output_path):
    import polars as pl
    value=validate_overlay(json.loads(Path(overlay_path).read_text()))
    rows=[]
    for id,record in value['universities'].items():
        row={'entity_id':id,'source_snapshot':value['sourceSnapshot'],'source_release':value['sourceRelease']}
        for field in ['students','faculty']:
            observation=record['replacements'].get(field,{})
            for key in ['value','period','source','sourceUrl']:row[field+'_'+key]=observation.get(key)
        estimate=record.get('estimatedFaculty') or {}
        row['estimated_academic_staff']=estimate.get('estimatedAcademicStaff')
        row['reported_students_per_academic_staff']=estimate.get('studentsPerAcademicStaff')
        row['estimate_source_url']=estimate.get('sourceUrl')
        rows.append(row)
    target=Path(output_path)
    if target.exists():raise FileExistsError(target)
    pl.DataFrame(rows,infer_schema_length=None).write_parquet(target)
    print(f'Exported {len(rows)} population correction/estimate rows to {target.name}; original data unchanged.')

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('overlay');parser.add_argument('parquet');args=parser.parse_args()
    export_parquet(args.overlay,args.parquet)
