import io,json,shutil,subprocess,tempfile,zipfile,hashlib
from pathlib import Path
from content_generate import ROOT,atomic_json

def main():
    release=json.loads((ROOT/'src/data/catalog.json').read_text())['release']
    for file in (ROOT/'public/overviews'/release).glob('Q*.json'):
        if json.loads(file.read_text()).get('polish'):
            raise ValueError('Refusing to overwrite reviewed introductions with raw extraction. Export a new catalog release, then rerun data:polish.')
    core=json.loads((ROOT/'public/data'/release/'ranking.json').read_text())['universities']
    ids=[u['id'] for u in core]
    request={'release':release,'ids':ids,'usIds':[u['id'] for u in core if u['countryCode'] in {'US','PR','GU','VI','AS','MP'}]}
    code=(ROOT/'scripts/supplement_rules.py').read_text()+'\n'+(ROOT/'scripts/remote_supplements.py').read_text()+f'\nimport sys\nsys.stdout.buffer.write(main({request!r}))\n'
    result=subprocess.run(['ssh','-o','BatchMode=yes','ider@192.168.1.229','cd /home/ider/workspace/UniDataPipeline && .venv/bin/python -'],input=code.encode(),stdout=subprocess.PIPE,check=True,timeout=240)
    with tempfile.TemporaryDirectory(prefix='.export-staging-',dir=ROOT) as tmp:
        stage=Path(tmp)
        with zipfile.ZipFile(io.BytesIO(result.stdout)) as z:
            for name in z.namelist():
                if '..' in Path(name).parts or Path(name).is_absolute():raise ValueError('Unsafe archive path')
                if name=='audit.json':atomic_json(stage/'audit.json',json.loads(z.read(name)));continue
                kind,idfile=name.split('/')
                atomic_json(stage/'public'/kind/release/idfile,json.loads(z.read(name)))
        subprocess.run(['node',str(ROOT/'scripts/simplify-zh.mjs'),str(stage)],check=True)
        for kind in ['overviews','us-data']:
            folder=stage/'public'/kind/release
            files=[{'path':f'/{kind}/{release}/{p.name}','bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(folder.glob('Q*.json'))]
            atomic_json(folder/'manifest.json',{'release':release,'ids':sorted(p.stem for p in folder.glob('Q*.json')),'files':files})
        atomic_json(stage/'src/data/catalog.json',{'release':release})
        atomic_json(stage/'public/data'/release/'ranking.json',{'universities':core})
        atomic_json(stage/'reports'/release/'supplements.json',json.loads((stage/'audit.json').read_text()))
        subprocess.run(['node',str(ROOT/'scripts/validate-supplements.mjs'),str(stage)],check=True)
        for kind in ['overviews','us-data']:
            folder=stage/'public'/kind/release
            target=ROOT/'public'/kind/release
            if target.exists():
                backup=ROOT/'archives'/release/(kind+'-before-refresh-'+__import__('datetime').datetime.now().strftime('%Y%m%dT%H%M%S'))
                if backup.exists():raise FileExistsError(backup)
                backup.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(target),backup)
            target.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(folder),target)
        atomic_json(ROOT/'reports'/release/'supplements.json',json.loads((stage/'audit.json').read_text()))
    print(json.loads((ROOT/'reports'/release/'supplements.json').read_text()))

if __name__=='__main__':main()
