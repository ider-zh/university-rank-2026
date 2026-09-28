"""Stream a sample release as ZIP. Never write files or mutate remote services.

Executed by export_sample.py on the existing pipeline host with its installed environment.
All stdout is binary archive data; progress goes to stderr. Credentials stay on that host.
"""

from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile
from urllib.parse import quote, urlsplit

import boto3
from botocore.config import Config
from dotenv import dotenv_values
from PIL import Image, ImageOps
import polars as pl
import psycopg
from psycopg.rows import dict_row

SAMPLE_IDS = ["Q13371", "Q41506", "Q16955", "Q16952", "Q34433", "Q738236"]
SNAPSHOT = "20251201"
METRICS = ["reputation", "academic", "financial", "faculty", "alumnus"]
WEIGHTS = dict(zip(METRICS, [0.25, 0.5, 0.1, 0.05, 0.1]))
SEED = "university-rank-sample-v1"
LIMIT = 16
POOL = 200
NOW = datetime.now(timezone.utc)
RELEASE = "sample-" + NOW.strftime("%Y%m%dT%H%M%SZ")
files = {}
image_failures = []
download_cache = {}


def log(message):
    print(message, file=sys.stderr, flush=True)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode()


def public_url(value):
    if not value:
        return None
    value = value.strip()
    if value.startswith("//"):
        value = "https:" + value
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("invalid-public-url")
    # Existing Wikimedia source links sometimes contain literal spaces/non-ASCII characters.
    return quote(value, safe=":/?#[]@!$&'()*+,;=%")


def put_json(path, value):
    files[path] = encode(value)


def dataset(name):
    return pl.read_parquet(f"dist/{name}_{SNAPSHOT}.parquet")


def asset(kind, qid, data, extension):
    digest = hashlib.sha256(data).hexdigest()[:16]
    path = f"/media/{RELEASE}/{kind}/{qid}.{digest}.{extension}"
    files["public" + path] = data
    return path


def read_image(client, path):
    if path not in download_cache:
        response = client.get_object(Bucket="univ-rank", Key=path)
        with response["Body"] as body:
            data = body.read(12_000_001)
        if len(data) > 12_000_000:
            raise ValueError("image-too-large")
        download_cache[path] = data
    return download_cache[path]


def logo_bytes(client, row):
    resource = row["resources"].get("webp_resize_v1") or row["resources"].get("original")
    if not resource:
        raise ValueError("missing-resource")
    data = read_image(client, resource["path"])
    if resource["path"].lower().endswith(".svg"):
        root = ET.fromstring(data)
        if root.tag.split("}")[-1] != "svg":
            raise ValueError("invalid-svg")
        for el in root.iter():
            if el.tag.split("}")[-1] in {"script", "foreignObject", "image"}:
                raise ValueError("active-svg")
            for key, value in el.attrib.items():
                if key.split("}")[-1].startswith("on") or (key.split("}")[-1] == "href" and not value.startswith("#")):
                    raise ValueError("external-svg")
        if b"@import" in data or b"url(http" in data or b"url(\"http" in data:
            raise ValueError("external-svg-style")
        return data, "svg"
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    image.save(buffer, "WEBP", quality=90)
    return buffer.getvalue(), "webp"


def query(cursor, sql, params=()):
    cursor.execute(sql, params)
    return cursor.fetchall()


def build_audit(scores, nature, old, candidates, openalex):
    duplicate_rows = scores.filter(pl.col("entity_id").is_duplicated()).to_dicts()
    groups = []
    for qid in sorted({r["entity_id"] for r in duplicate_rows}):
        rows = [r for r in duplicate_rows if r["entity_id"] == qid]
        signatures = {tuple(r[f"{m}_score"] for m in METRICS) for r in rows}
        groups.append({
            "id": qid, "name": rows[0]["en_wiki_title"], "rows": rows,
            "classification": "conflicting-metrics" if len(signatures) > 1 else "identical-metrics-different-ranks",
            "action": "resolve-source-link-before-recompute" if len(signatures) > 1 else "deduplicate-upstream-before-recompute",
            "natureRows": nature.filter(pl.col("entity_id") == qid).to_dicts(),
        })
    new_ids = set(scores["entity_id"])
    candidate_ids = set(candidates["entity_id"])
    oa_ids = set(openalex["entity_id"])
    missing = [{**r, "inCandidateSnapshot": r["qid"] in candidate_ids,
                "inOpenAlexLinkedSet": r["qid"] in oa_ids,
                "status": "needs-source-review"} for r in old if r["qid"] not in new_ids]
    return {
        "schemaVersion": "1.0.0", "release": RELEASE, "generatedAt": NOW.isoformat(),
        "sourceSnapshot": SNAPSHOT, "publishableAsOfficialRanking": False,
        "counts": {"scoreRows": scores.height, "uniqueUniversities": len(new_ids),
                   "redundantScoreRows": scores.height-len(new_ids), "duplicateGroups": len(groups),
                   "conflictingGroups": sum(g["classification"] == "conflicting-metrics" for g in groups),
                   "missingOldUniversities": len(missing)},
        "duplicateScores": groups, "missingOldUniversities": missing,
        "policy": "No source metrics or ranks changed. Duplicate groups block official publication; missing coverage requires review.",
    }


def main():
    log("Reading snapshot metadata and ranking conflicts…")
    scores = dataset("university_final_scores")
    nature = dataset("university_link_nature_index")
    openalex = dataset("university_link_openalex")
    candidates = pl.read_parquet(f"dist/university_candidate_data_union_{SNAPSHOT}.parquet",
        columns=["entity_id", "en_label", "zh_label", "en_wiki_title", "zh_wiki_title", "en_description", "zh_description"])
    audit_sources = {}
    for name in ["university_final_scores", "university_link_nature_index", "university_link_openalex"]:
        p = Path(f"dist/{name}_{SNAPSHOT}.parquet")
        audit_sources[p.name] = hashlib.sha256(p.read_bytes()).hexdigest()
    e = dotenv_values(".env")
    s3 = boto3.client("s3", endpoint_url=e["S3_ENDPOINT_URL"], aws_access_key_id=e["S3_ACCESS_KEY_ID"],
        aws_secret_access_key=e["S3_SECRET_ACCESS_KEY"], config=Config(connect_timeout=5, read_timeout=12, retries={"max_attempts":1}))
    core = []
    sample_stats = []
    base = f"public/data/{RELEASE}"
    with psycopg.connect(e["PG_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://"),
        connect_timeout=10, options="-c default_transaction_read_only=on -c statement_timeout=45000", row_factory=dict_row) as connection:
        connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        with connection.cursor() as cursor:
            old = query(cursor, "SELECT r.qid,r.final_rank,d.title_en_wikipedia AS name,d.title_zh_wikipedia AS nameZh FROM dev.curated_university_rankings r LEFT JOIN dev.university_directory d USING(qid) ORDER BY r.final_rank,r.qid")
            audit = build_audit(scores, nature, old, candidates, openalex)
            for qid in SAMPLE_IDS:
                log(f"Exporting {qid}: profile, logo and deterministic alumni sample…")
                score_rows = scores.filter(pl.col("entity_id") == qid).to_dicts()
                if len(score_rows) != 1:
                    raise ValueError(f"Sample university must have one unambiguous score: {qid}")
                score = score_rows[0]
                oa = openalex.filter(pl.col("entity_id") == qid).row(0, named=True)
                candidate = candidates.filter(pl.col("entity_id") == qid).row(0, named=True)
                location = query(cursor, "SELECT country_code_alpha_2 AS country,region_name AS continent,lat,lon FROM dev.university_location WHERE qid=%s ORDER BY data_version DESC LIMIT 1", (qid,))
                location = location[0] if location else {}
                names = {"en": candidate["en_label"] or candidate["en_wiki_title"] or qid,
                         "zh": candidate["zh_label"] or candidate["zh_wiki_title"] or candidate["en_label"] or qid}
                image_rows = query(cursor, """SELECT filename,source_flag,url,resources FROM dev.entity_images
                    WHERE qid=%s AND (source_flag='wikidata-logo' OR filename ~* 'logo|seal|arms|emblem')
                    ORDER BY ABS(COALESCE(aspect_ratio,1)-1), CASE WHEN source_flag='wikidata-logo' THEN 0 ELSE 1 END, url_md5""", (qid,))
                logo = None
                for row in image_rows:
                    try:
                        data, extension = logo_bytes(s3, row)
                        source_url = public_url(row["url"])
                        logo = {"url": asset("logos", qid, data, extension), "sourceUrl": source_url, "sourceName": row["filename"]}
                        break
                    except Exception as error:
                        image_failures.append({"universityId":qid,"kind":"logo","error":type(error).__name__})
                metrics = {m: score[m+"_score"] for m in METRICS}
                country = oa.get("country_code") or location.get("country")
                record = {"id":qid,"names":names,"countryCode":country,"continent":location.get("continent"),
                    "metrics":metrics,"sourceScore":score["total_score"],"sourceRank":score["rank"],"logo":logo}
                core.append(record)
                for locale in ["en", "zh"]:
                    text = candidate[f"{locale}_description"] or candidate["en_description"] or ""
                    title = candidate[f"{locale}_wiki_title"]
                    coordinates = oa.get("coordinates")
                    profile = {"schemaVersion":"1.0.0","release":RELEASE,"id":qid,"locale":locale,
                        "name":names[locale],"description":text,"descriptionLanguage":locale if candidate[f"{locale}_description"] else "en",
                        "website":public_url(oa.get("websites")),"wikiUrl":f"https://{locale}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}" if title else None,
                        "coordinates":coordinates,"sourceSnapshot":SNAPSHOT}
                    put_json(f"{base}/universities/{qid}/profile.{locale}.json",profile)
                # The pool is bounded before seeded selection. Match through the existing GIN index.
                pool = query(cursor, """SELECT a.qid,a.title_en_wikidata AS name,a.title_zh_wikidata AS name_zh,
                        a.shortdesc,a.indegree_en_wikipedia,a.data_version,
                        i.resources #>> '{avatar_v1,path}' AS avatar,i.url AS image_source
                    FROM dev.university_alumnus a
                    JOIN LATERAL (SELECT resources,url FROM dev.entity_images i
                        WHERE i.qid=a.qid AND i.resources #>> '{avatar_v1,path}' IS NOT NULL
                        ORDER BY CASE i.source_flag WHEN 'wikipedia' THEN 0 ELSE 1 END,i.url_md5 LIMIT 1) i ON TRUE
                    WHERE a.educated_at @> ARRAY[%s]::text[] AND a.title_en_wikidata IS NOT NULL
                    ORDER BY a.indegree_en_wikipedia DESC NULLS LAST,a.qid,a.data_version DESC LIMIT %s""", (qid,POOL))
                unique = {}
                for person in pool:
                    unique.setdefault(person["qid"],person)
                selected = sorted(unique.values(),key=lambda p:hashlib.sha256(f"{SEED}:{qid}:{p['qid']}".encode()).hexdigest())
                people = []
                portraits = []
                for person in selected:
                    if len(people) >= LIMIT:
                        break
                    try:
                        source_url = public_url(person["image_source"])
                        data = read_image(s3,person["avatar"])
                        portrait = Image.open(io.BytesIO(data))
                        portrait = ImageOps.fit(portrait.convert("RGB"),(120,150),method=Image.Resampling.LANCZOS)
                        index = len(people)
                        portraits.append(portrait)
                        people.append({"id":person["qid"],"names":{"en":person["name"],"zh":person["name_zh"] or person["name"]},
                            "description":person["shortdesc"] or "", "descriptionLanguage":"en",
                            "imageSourceUrl":source_url,"relationshipSource":"dev.university_alumnus.educated_at",
                            "relationshipVersion":person["data_version"],"relationshipVerified":False,
                            "rect":{"x":index%4*120,"y":index//4*150,"width":120,"height":150}})
                    except Exception as error:
                        image_failures.append({"universityId":qid,"personId":person["qid"],"kind":"avatar","error":type(error).__name__})
                sprite = None
                if portraits:
                    sheet = Image.new("RGB",(480,math.ceil(len(portraits)/4)*150),(242,240,234))
                    for index,portrait in enumerate(portraits):
                        sheet.paste(portrait,(index%4*120,index//4*150))
                    buffer = io.BytesIO()
                    sheet.save(buffer,"WEBP",quality=85,method=6)
                    sprite = {"url":asset("alumni",qid,buffer.getvalue(),"webp"),"width":sheet.width,"height":sheet.height}
                alumni = {"schemaVersion":"1.0.0","release":RELEASE,"universityId":qid,
                    "sampling":{"seed":SEED,"method":"sha256-order-within-top-influence-pool","poolLimit":POOL,"poolSize":len(unique),"limit":LIMIT},
                    "sprite":sprite,"people":people}
                put_json(f"{base}/universities/{qid}/alumni.json",alumni)
                sample_stats.append({"id":qid,"name":names["en"],"logo":logo is not None,"alumniCount":len(people),"candidatePoolSize":len(unique)})
    core.sort(key=lambda r:(r["sourceRank"],r["id"]))
    put_json(f"{base}/ranking/core.json",{"schemaVersion":"1.0.0","release":RELEASE,"kind":"sample","universities":core})
    audit["imageFailures"] = image_failures
    audit["samples"] = sample_stats
    audit["sourceFileHashes"] = audit_sources
    put_json(f"reports/{RELEASE}/quality.json",audit)
    put_json(f"{base}/quality-summary.json",{"schemaVersion":"1.0.0","release":RELEASE,"publishableAsOfficialRanking":False,"counts":audit["counts"],"samples":sample_stats,"imageFailureCount":len(image_failures)})
    manifest = {"schemaVersion":"1.0.0","release":RELEASE,"kind":"sample","generatedAt":NOW.isoformat(),
        "sourceSnapshot":SNAPSHOT,"universityIds":[r["id"] for r in core],
        "scoring":{"id":"pipeline-20251201-unreviewed","status":"unreviewed","formula":"weighted-sum","weights":WEIGHTS,"rankPolicy":"source-ordinal","sourceUniverseSize":scores["entity_id"].n_unique(),"completeUniverse":False},
        "excludedModules":["campusPhotos","news"],"files":[{"path":"/"+path.removeprefix("public/"),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()} for path,data in sorted(files.items()) if path.startswith("public/")]}
    put_json(f"{base}/manifest.json",manifest)
    put_json("src/data/release.json",{"release":RELEASE})
    archive = io.BytesIO()
    with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED) as z:
        for path,data in sorted(files.items()):
            z.writestr(path,data)
    log(f"Prepared {len(core)} universities, {sum(x['alumniCount'] for x in sample_stats)} portraits, {len(image_failures)} image failures.")
    sys.stdout.buffer.write(archive.getvalue())


if __name__ == "__main__":
    main()
