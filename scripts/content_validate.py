"""Validate generated introductions against admitted IDs, current source hashes and evidence."""
import json
import sys
from pathlib import Path
from content_generate import ROOT as PROJECT, digest, validate_result
ROOT = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else PROJECT

def main():
    release = json.loads((ROOT / "src/data/catalog.json").read_text())["release"]
    directory = ROOT / "public/content" / release
    if not (directory / "manifest.json").exists():
        print("No generated introductions; source descriptions remain available.")
        return
    manifest = json.loads((directory / "manifest.json").read_text())
    assert manifest["release"] == release
    assert len(set(manifest["ids"])) == manifest["count"] == len(manifest["ids"])
    ids = {u["id"] for u in json.loads((ROOT / "public/data" / release / "ranking.json").read_text())["universities"]}
    assert set(manifest["ids"]) <= ids
    assert {p.stem for p in directory.glob("Q*.json")} == set(manifest["ids"])
    for id in manifest["ids"]:
        value = json.loads((directory / f"{id}.json").read_text())
        profile = json.loads((ROOT / "public/data" / release / "universities" / f"{id}.json").read_text())
        payload = json.loads((ROOT / "reports" / release / "content-sources" / f"{id}.json").read_text())
        assert value["id"] == id and value["release"] == release
        assert value["sourceHash"] == digest(payload)
        assert value["profileHash"] == digest(profile), "Introduction source has changed; regenerate"
        assert value["sourceSnapshot"] == profile["sourceSnapshot"]
        assert value["status"] == "ai-generated-source-grounded-unreviewed"
        validate_result(value["introductions"], payload)
        assert value["sourceUrls"] == [p["wikiUrl"] for p in profile["profiles"].values() if p["wikiUrl"]]
    print(f"Content validated: {manifest['count']} bilingual, source-linked introductions.")

if __name__ == "__main__":
    main()
