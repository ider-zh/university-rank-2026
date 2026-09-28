"""Export catalog into staging, validate, then switch the local immutable-release pointer."""
import io
import json
import re
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = b"\n".join((ROOT / path).read_bytes() for path in [
        "scripts/infobox_normalize.py", "scripts/institution_eligibility.py", "scripts/remote_catalog.py"
    ])
    pointer_path = ROOT / "src/data/catalog.json"
    previous = json.loads(pointer_path.read_text())["release"] if pointer_path.exists() else None
    if previous and not re.fullmatch(r"catalog-\d{8}T\d{6}Z", previous):
        raise ValueError("Invalid previous catalog release")
    result = subprocess.run(["ssh","-o","BatchMode=yes","-o","ConnectTimeout=10","ider@192.168.1.229",
        "cd /home/ider/workspace/UniDataPipeline && .venv/bin/python -"],input=source,stdout=subprocess.PIPE,check=True,timeout=600)
    with tempfile.TemporaryDirectory(prefix=".export-staging-",dir=ROOT) as tmp:
        staging = Path(tmp)
        with zipfile.ZipFile(io.BytesIO(result.stdout)) as archive:
            for name in archive.namelist():
                path = PurePosixPath(name)
                if path.is_absolute() or ".." in path.parts or path.parts[0] not in {"public","reports","src"}:
                    raise ValueError("Unexpected archive path")
            archive.extractall(staging)
        subprocess.run(["node",str(ROOT / "scripts/simplify-zh.mjs"),str(staging)],check=True)
        subprocess.run(["node",str(ROOT / "scripts/validate-catalog.mjs"),str(staging)],check=True)
        release = json.loads((staging / "src/data/catalog.json").read_text())["release"]
        for name in [f"public/data/{release}",f"reports/{release}"]:
            if (ROOT/name).exists():
                raise FileExistsError(name)
        if previous and previous != release:
            for kind in ["data", "media", "content", "overviews", "us-data"]:
                if (ROOT / "public" / kind / previous).exists() and (ROOT / "archives" / previous / kind).exists():
                    raise FileExistsError(ROOT / "archives" / previous / kind)
        for name in [f"public/data/{release}",f"reports/{release}"]:
            (ROOT/name).parent.mkdir(parents=True,exist_ok=True)
            shutil.move(str(staging/name),ROOT/name)
        (staging / "src/data/catalog.json").replace(ROOT / "src/data/catalog.json")
        # Superseded catalogs must not continue exposing rejected institutions via
        # public URLs. Keep a recoverable offline archive; never delete source data.
        if previous and previous != release:
            for kind in ["data", "media", "content", "overviews", "us-data"]:
                old = ROOT / "public" / kind / previous
                destination = ROOT / "archives" / previous / kind
                if old.exists():
                    if destination.exists():
                        raise FileExistsError(destination)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(old), destination)
        print(f"Published local catalog {release}")


if __name__ == "__main__":
    main()
