"""Fork current static releases in staging, normalize display text, validate, then publish."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import argparse
from datetime import datetime, timezone
from content_generate import ROOT, digest

def rewrite(value, replacements):
    if isinstance(value,str):
        for old,new in replacements.items():value=value.replace(old,new)
        return value
    if isinstance(value,list):return [rewrite(v,replacements) for v in value]
    if isinstance(value,dict):return {k:rewrite(v,replacements) for k,v in value.items()}
    return value

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--polish-run',type=Path)
    args=parser.parse_args()
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    pointers={name:json.loads((ROOT/'src/data'/f'{name}.json').read_text())['release'] for name in ['catalog','release']}
    replacements={old:old.split('-')[0]+'-'+stamp for old in pointers.values()}
    with tempfile.TemporaryDirectory(prefix='.export-staging-',dir=ROOT) as tmp:
        stage=Path(tmp)
        targets=[]
        for old,new in replacements.items():
            for kind in ['data','media','content','overviews','us-data']:
                source=ROOT/'public'/kind/old
                if source.exists():
                    target=stage/'public'/kind/new
                    shutil.copytree(source,target)
                    targets.append(target.relative_to(stage))
            shutil.copytree(ROOT/'reports'/old,stage/'reports'/new)
            targets.append(Path('reports')/new)
        for file in stage.rglob('*.json'):
            file.write_text(json.dumps(rewrite(json.loads(file.read_text()),replacements),ensure_ascii=False)+'\n')
        (stage/'src/data').mkdir(parents=True)
        for name,old in pointers.items():
            (stage/'src/data'/f'{name}.json').write_text(json.dumps({'release':replacements[old]}))
        if args.polish_run:
            from overview_polish import validate_candidate, EDITOR, REVIEWER, VERSION
            catalog=replacements[pointers['catalog']]
            ids=[u['id'] for u in json.loads((stage/'public/data'/catalog/'ranking.json').read_text())['universities']]
            for id in ids:
                frozen=json.loads((args.polish_run/'sources'/f'{id}.json').read_text())
                approved=json.loads((args.polish_run/'approved'/f'{id}.json').read_text())
                assert approved['id']==id and approved['review']=={'approved':True,'issues':[]}
                assert approved['fingerprint']==digest({'sources':frozen['sources'],'editor':EDITOR,'reviewer':REVIEWER,'model':approved['model']})
                value=validate_candidate(approved['candidate'],frozen['sources'])
                target=stage/'public/overviews'/catalog/f'{id}.json'
                overview=json.loads(target.read_text())
                assert overview['paragraphs']==frozen['overview']['paragraphs'], 'Source changed since review'
                overview['paragraphs']['zh']=[p['text'] for p in value['paragraphs']]
                profile=json.loads((stage/'public/data'/catalog/'universities'/f'{id}.json').read_text())
                overview['polish']={'summary':value['summary']['text'],'model':approved['model'],'version':VERSION,'status':'model-reviewed-not-human-verified','sourceHash':digest(frozen['sources']),'sourceUrls':list(dict.fromkeys(p['wikiUrl'] for p in profile['profiles'].values() if p['wikiUrl']))}
                target.write_text(json.dumps(overview,ensure_ascii=False)+'\n')
                report=stage/'reports'/catalog/'overview-polish'/f'{id}.json'
                report.parent.mkdir(parents=True,exist_ok=True)
                report.write_text(json.dumps({'sources':frozen['sources'],**approved},ensure_ascii=False)+'\n')
            (stage/'reports'/catalog/'overview-polish/summary.json').write_text(json.dumps({'checked':len(ids),'approved':len(ids),'model':'qwen3.8-27b','humanVerified':False}))
            progress_file=stage/'reports'/catalog/'overview-polish/progress.json'
            if progress_file.exists():
                progress=json.loads(progress_file.read_text())
                progress.update({'published':True,'release':catalog})
                progress_file.write_text(json.dumps(progress)+'\n')
        subprocess.run(['node',str(ROOT/'scripts/simplify-zh.mjs'),str(stage)],check=True)
        catalog=replacements[pointers['catalog']]
        # The model's original input is preserved in the source report. Record the
        # original profile fingerprint separately from the normalized display data.
        for file in (stage/'public/content'/catalog).glob('Q*.json'):
            value=json.loads(file.read_text())
            profile=json.loads((stage/'public/data'/catalog/'universities'/file.name).read_text())
            value.setdefault('generationProfileHash',value['profileHash'])
            value['profileHash']=digest(profile)
            value['displayNormalization']='OpenCC t-to-cn 1.4.2'
            file.write_text(json.dumps(value,ensure_ascii=False)+'\n')
        for script in ['validate-data.mjs','validate-catalog.mjs','media-validate.mjs','validate-supplements.mjs']:
            subprocess.run(['node',str(ROOT/'scripts'/script),str(stage)],check=True)
        subprocess.run(['python3',str(ROOT/'scripts/content_validate.py'),str(stage)],check=True)
        subprocess.run(['python3',str(ROOT/'scripts/overview_validate.py'),str(stage)],check=True)
        for target in targets:
            if (ROOT/target).exists():raise FileExistsError(target)
        for old in replacements:
            for kind in ['data','media','content','overviews','us-data']:
                if (ROOT/'public'/kind/old).exists() and (ROOT/'archives'/old/kind).exists():raise FileExistsError(old)
        for target in targets:
            (ROOT/target).parent.mkdir(parents=True,exist_ok=True)
            shutil.move(str(stage/target),ROOT/target)
        for name in pointers:
            (stage/'src/data'/f'{name}.json').replace(ROOT/'src/data'/f'{name}.json')
        for old in replacements:
            for kind in ['data','media','content','overviews','us-data']:
                source=ROOT/'public'/kind/old
                if source.exists():
                    target=ROOT/'archives'/old/kind
                    target.parent.mkdir(parents=True,exist_ok=True)
                    shutil.move(str(source),target)
        print('Published simplified display releases:',replacements)

if __name__=='__main__':main()
