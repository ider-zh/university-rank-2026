"""Run the read-only exporter remotely; validate in staging before local publication."""

import argparse
import io
import json
from pathlib import Path, PurePosixPath
import shlex
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="ider@192.168.1.229")
    parser.add_argument("--pipeline", default="/home/ider/workspace/UniDataPipeline")
    args = parser.parse_args()
    command = f"cd {shlex.quote(args.pipeline)} && .venv/bin/python -"
    with (ROOT / "scripts/remote_export.py").open("rb") as source:
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", args.host, command],
            stdin=source, stdout=subprocess.PIPE, check=True, timeout=600,
        )
    with tempfile.TemporaryDirectory(prefix=".export-staging-", dir=ROOT) as tmp:
        staging = Path(tmp)
        with zipfile.ZipFile(io.BytesIO(result.stdout)) as archive:
            for name in archive.namelist():
                p = PurePosixPath(name)
                if p.is_absolute() or ".." in p.parts or p.parts[0] not in {"public", "reports", "src"}:
                    raise ValueError(f"Unexpected archive path: {name}")
            archive.extractall(staging)
        subprocess.run(["node", str(ROOT / "scripts/optimize-assets.mjs"), str(staging)], check=True)
        subprocess.run(["node", str(ROOT / "scripts/simplify-zh.mjs"), str(staging)], check=True)
        subprocess.run(["node", str(ROOT / "scripts/validate-data.mjs"), str(staging)], check=True)
        pointer = json.loads((staging / "src/data/release.json").read_text())
        release = pointer["release"]
        targets = [f"public/data/{release}", f"public/media/{release}", f"reports/{release}"]
        for path in targets:
            if (ROOT / path).exists():
                raise FileExistsError(f"Release already exists: {path}")
        for path in targets:
            (ROOT / path).parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(staging / path), ROOT / path)
        (ROOT / "src/data").mkdir(parents=True, exist_ok=True)
        # The generated pointer changes only after the complete release is validated and copied.
        (staging / "src/data/release.json").replace(ROOT / "src/data/release.json")
        print(f"Export complete: {release}")


if __name__ == "__main__":
    main()
