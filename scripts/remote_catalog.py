"""Runs after infobox_normalize.py is prepended. Emits an immutable ZIP on stdout."""
import hashlib
import io
import math
import sys
import zipfile
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit
import polars as pl
import psycopg
from psycopg.rows import dict_row
from dotenv import dotenv_values

SNAPSHOT = "20251201"
RELEASE = "catalog-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
METRICS = ["reputation", "academic", "financial", "faculty", "alumnus"]


def web_url(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    try:
        parsed = urlsplit(value)
        if parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password:
            return quote(value, safe=":/?#[]@!$&'()*+,;=%")
    except ValueError:
        pass
    return None


def main():
    print("Reading full ranking universe and infobox snapshots…", file=sys.stderr, flush=True)
    scores = pl.read_parquet(f"dist/university_final_scores_{SNAPSHOT}.parquet")
    oa = {r["entity_id"]: r for r in pl.read_parquet(f"dist/university_link_openalex_{SNAPSHOT}.parquet").to_dicts()}
    candidates = {r["entity_id"]: r for r in pl.read_parquet(f"dist/university_candidate_data_union_{SNAPSHOT}.parquet",
        columns=["entity_id", "en_label", "zh_label", "en_wiki_title", "zh_wiki_title", "en_description", "zh_description", "en_infoboxes", "zh_infoboxes"]).to_dicts()}
    groups = {}
    for row in scores.to_dicts():
        groups.setdefault(row["entity_id"], []).append(row)
    excluded, collapsed, eligible = [], [], []
    admission_decisions, quality_failures = [], []
    eligibility_by_id = {}
    for qid, rows in groups.items():
        signatures = {tuple(r[m + "_score"] for m in METRICS) + (r["total_score"],) for r in rows}
        if len(signatures) != 1 or any(not math.isfinite(v) or not 0 <= v <= 1 for v in next(iter(signatures))):
            excluded.append({"id": qid, "reason": "conflicting-or-invalid-scores", "rows": rows})
            continue
        chosen = min(rows, key=lambda r:r["rank"])
        if len(rows) > 1:
            collapsed.append({"id":qid, "sourceRanks":[r["rank"] for r in rows], "retainedSourceRank":chosen["rank"]})
        source = {**oa.get(qid, {}), **{k:v for k,v in candidates.get(qid, {}).items() if v is not None}}
        decision = institution_eligibility(source)
        admission_decisions.append({"id":qid,"name":source.get("en_label"),"sourceRank":chosen["rank"],**decision})
        if decision["status"] != "eligible":
            continue
        quality = institution_quality(source)
        if not all(quality.values()):
            quality_failures.append({"id":qid,"sourceRank":chosen["rank"],"reason":"minimum-profile-quality","quality":quality})
            continue
        eligibility_by_id[qid] = {**decision,"quality":quality}
        eligible.append(chosen)
    selected = assign_site_ranks(eligible)
    selection = {"policy":"positive-higher-education-top-1000","ruleVersion":ELIGIBILITY_RULE_VERSION,"limit":SITE_LIMIT,
        "eligibleCount":sum(d["status"] == "eligible" for d in admission_decisions),"qualityPassedCount":len(eligible),
        "rejectedCount":sum(d["status"] == "rejected" for d in admission_decisions),
        "quarantinedCount":sum(d["status"] == "quarantined" for d in admission_decisions),
        "qualityFailedCount":len(quality_failures),"belowCutoffCount":max(0,len(eligible)-SITE_LIMIT)}
    e = dotenv_values(".env")
    with psycopg.connect(e["PG_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://"),
        options="-c default_transaction_read_only=on -c statement_timeout=30000", connect_timeout=10, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT ON(qid) qid,country_code_alpha_2 AS country,region_name AS continent FROM dev.university_location ORDER BY qid,data_version DESC")
            locations = {r["qid"]:r for r in cur.fetchall()}
            cur.execute("SELECT qid,ranks->'discipline' AS ranks,scores->'discipline' AS scores FROM dev.university_statistics_and_scores WHERE jsonb_typeof(ranks->'discipline')='object'")
            discipline_rows = cur.fetchall()
    country_continents = {r["country"]:r["continent"] for r in locations.values() if r["country"] and r["continent"]}
    archive = io.BytesIO()
    entries, universities = [], []
    prefix = f"public/data/{RELEASE}"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as out:
        def write(path, data, inventory=True):
            raw = (json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(",", ":")) + "\n").encode()
            out.writestr(path, raw)
            if inventory:
                entries.append({"path":"/"+path.removeprefix("public/"),"bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest()})
        for score in selected:
            qid = score["entity_id"]
            c, a, loc = candidates.get(qid, {}), oa.get(qid, {}), locations.get(qid, {})
            en = c.get("en_label") or c.get("en_wiki_title") or score.get("en_wiki_title") or qid
            zh = c.get("zh_label") or c.get("zh_wiki_title") or en
            country = a.get("country_code") or loc.get("country")
            university = {"id":qid,"names":{"en":en,"zh":zh},"countryCode":country,
                "continent":loc.get("continent") or country_continents.get(country),
                "metrics":{m:score[m+"_score"] for m in METRICS},"sourceScore":score["total_score"],"sourceRank":score["rank"],
                "siteRank":score["siteRank"],"eligibility":eligibility_by_id[qid]}
            universities.append(university)
            profiles = {}
            for locale in ["en", "zh"]:
                desc = c.get(locale+"_description") or c.get("en_description") or ""
                title = c.get(locale+"_wiki_title")
                profiles[locale] = {"name":university["names"][locale],"description":desc,
                    "descriptionLanguage":locale if c.get(locale+"_description") else "en", "website":web_url(a.get("websites")),
                    "wikiUrl":f"https://{locale}.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}" if title else None,
                    "infobox":normalize_infobox(c.get("en_infoboxes"),c.get("zh_infoboxes"),locale,a.get("inception")),
                    "externalRankings":external_rankings(c.get("en_infoboxes"),c.get("zh_infoboxes"),locale)}
            write(f"{prefix}/universities/{qid}.json", {"schemaVersion":"1.0.0","release":RELEASE,"sourceSnapshot":SNAPSHOT,
                "university":university,"profiles":profiles})
        available = {u["id"] for u in universities}
        subjects = {}
        for row in discipline_rows:
            if row["qid"] not in available:
                continue
            for name, rank in (row["ranks"] or {}).items():
                score = (row["scores"] or {}).get(name)
                try:
                    rank, score = float(rank), float(score)
                    if not (math.isfinite(rank) and math.isfinite(score) and 0 < rank <= 2000 and 0 <= score <= 100):
                        continue
                except (TypeError, ValueError):
                    continue
                subjects.setdefault(name,[]).append({"id":row["qid"],"rank":int(rank),"score":score})
        subject_manifest = []
        for index, (name, rows) in enumerate(sorted(subjects.items())):
            slug = f"subject-{index+1}"
            # Retain the best source rank if multiple historical versions are present.
            unique = {}
            for row in sorted(rows,key=lambda r:(r["rank"],r["id"])):
                unique.setdefault(row["id"],row)
            path = f"{prefix}/subjects/{slug}.json"
            write(path,{"release":RELEASE,"name":name,"source":"legacy-2025","scope":"mapped-universities-top-2000","rows":list(unique.values())})
            subject_manifest.append({"id":slug,"name":name,"count":len(unique),"url":"/"+path.removeprefix("public/")})
        write(f"{prefix}/ranking.json",{"schemaVersion":"1.0.0","release":RELEASE,"universities":universities})
        audit = {"release":RELEASE,"sourceSnapshot":SNAPSHOT,"sourceRows":scores.height,
            "sourceUniversities":len(groups),"includedUniversities":len(universities),"excluded":excluded,"collapsedDuplicates":collapsed,
            "selection":selection,"admissionDecisions":admission_decisions,"qualityFailures":quality_failures,
            "selectedIds":[u["id"] for u in universities],
            "siteRankPolicy":"eligible-quality-passed-source-score-rounded-12-competition-top-1000-stable-id-cutoff",
            "sourceRankPolicy":"preserve-minimum-source-rank-for-identical-metrics",
            "customRankPolicy":"weighted-sum-competition-ties-rounded-to-12-decimals-before-ranking"}
        write(f"reports/{RELEASE}/quality.json",audit,False)
        write(f"{prefix}/manifest.json",{"schemaVersion":"1.0.0","release":RELEASE,"sourceSnapshot":SNAPSHOT,"status":"provisional",
            "universityCount":len(universities),"excludedCount":len(excluded),"collapsedDuplicateGroups":len(collapsed),
            "selection":selection,"subjects":subject_manifest,"files":entries},False)
        write("src/data/catalog.json",{"release":RELEASE},False)
    print(f"Exported {len(universities)} profiles, {len(subject_manifest)} subjects; excluded {len(excluded)} conflicting universities.",file=sys.stderr,flush=True)
    sys.stdout.buffer.write(archive.getvalue())


if __name__ == "__main__":
    main()
