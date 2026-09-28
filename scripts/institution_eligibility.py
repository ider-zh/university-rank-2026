"""Conservative, evidence-bearing admission gate; OpenAlex/ROR membership is NOT admission.

Only a small explicit Wikidata higher-education type set is trusted. Other types
are not guessed through their names. Clear education descriptions can corroborate
an external university-ranking identifier; unresolved entities are quarantined.
This is a snapshot screening policy, not an accreditation claim.
"""
import re
from urllib.parse import urlsplit

ELIGIBILITY_RULE_VERSION = "higher-education-v2"
SITE_LIMIT = 1000
HIGHER_EDUCATION_TYPES = {
    "Q3918": "university",
    "Q875538": "public university",
    "Q902104": "private university",
    "Q15936437": "research university",
    "Q62078547": "public research university",
    "Q189004": "college",
    "Q1371037": "institute of technology",
    "Q1377182": "liberal arts college",
    "Q494230": "medical school",
}
RANKING_ID_FIELDS = ("times_university_id", "qs_university_id", "arwu_university_id")
NON_EDUCATION = re.compile(
    r"\b(compan(?:y|ies)|corporation|conglomerate|holding company|streaming (?:service|platform)|"
    r"record label|television network|social (?:networking|media) service|commercial bank|investment bank|"
    r"disambiguation|high school|secondary school|primary school|elementary school|"
    r"boarding school|preparatory school|school district|university press)\b|"
    r"公司|消歧义|消歧義|中学|中學|小学|小學|出版社", re.I)
NON_INSTITUTION = re.compile(
    r"\b(hospital|museum|library|university system|university association|"
    r"association of universities|laboratory of|department of|faculty of)\b|"
    r"医院|醫院|博物馆|博物館|大学系统|大學系統", re.I)
HISTORICAL = re.compile(r"\b(former|defunct|closed|dissolved)\b|已撤销|已撤銷|已关闭|已關閉", re.I)
UNIVERSITY_SYSTEM = re.compile(r"\buniversity system\b|大学系统|大學系統|大學體系|大学体系", re.I)
SYSTEM_MEMBER = re.compile(r"\b(flagship|campus|constituent|member|part of|branch of|within|college in the)\b|成員|成员|校区|校區", re.I)
EDUCATION_DESCRIPTION = re.compile(
    r"\b(university|universities|higher[- ]education (?:institution|facility)|"
    r"institute of higher education|liberal arts college|medical school|"
    r"institute of technology|tertiary (?:institution|education)|graduate school)\b|"
    r"business school|grande école|大学|大學|高等院校|高等教育|高等学校|高等學校", re.I)


def institution_eligibility(record):
    """Return a stable auditable decision; negative evidence takes precedence."""
    evidence = []
    descriptions = [(key, record.get(key) or "") for key in ("en_description", "zh_description")]
    types = set(record.get("instance_of") or [])
    primary_field = "en_description" if record.get("en_description") else "zh_description"
    primary_description = record.get(primary_field) or ""
    if UNIVERSITY_SYSTEM.search(primary_description) and not SYSTEM_MEMBER.search(primary_description):
        return {"status": "quarantined", "ruleVersion": ELIGIBILITY_RULE_VERSION,
                "reason": "university-system-scope-needs-review",
                "evidence": [{"field": primary_field, "value": primary_description}]}
    if "Q4167410" in types:
        return {"status": "rejected", "ruleVersion": ELIGIBILITY_RULE_VERSION,
                "reason": "wikimedia-disambiguation", "evidence": [{"field": "instance_of", "value": "Q4167410"}]}
    for field, value in descriptions:
        if NON_EDUCATION.search(value):
            return {"status": "rejected", "ruleVersion": ELIGIBILITY_RULE_VERSION,
                    "reason": "explicit-non-higher-education", "evidence": [{"field": field, "value": value}]}
        if HISTORICAL.search(value):
            return {"status": "quarantined", "ruleVersion": ELIGIBILITY_RULE_VERSION,
                    "reason": "historical-status-needs-review", "evidence": [{"field": field, "value": value}]}
    trusted_types = sorted(types.intersection(HIGHER_EDUCATION_TYPES))
    ranking_ids = [{"field": key, "value": record[key]} for key in RANKING_ID_FIELDS if record.get(key)]
    education = [{"field": key, "value": value} for key, value in descriptions if EDUCATION_DESCRIPTION.search(value)]
    for field, value in descriptions:
        # Secondary descriptions may mention membership of a university system.
        # Do not mistake that for the identity of the institution itself.
        if value == primary_description and NON_INSTITUTION.search(value) and not trusted_types:
            return {"status": "rejected", "ruleVersion": ELIGIBILITY_RULE_VERSION,
                    "reason": "non-independent-education-institution", "evidence": [{"field": field, "value": value}]}
    evidence.extend({"field": "instance_of", "value": qid, "label": HIGHER_EDUCATION_TYPES[qid]} for qid in trusted_types)
    if trusted_types or (ranking_ids and education):
        evidence.extend(education)
        evidence.extend(ranking_ids)
        return {"status": "eligible", "ruleVersion": ELIGIBILITY_RULE_VERSION,
                "reason": "explicit-higher-education-evidence", "evidence": evidence}
    return {"status": "quarantined", "ruleVersion": ELIGIBILITY_RULE_VERSION,
            "reason": "insufficient-higher-education-evidence",
            "evidence": [{"field": "instance_of", "value": sorted(types)}] +
                        [{"field": key, "value": value} for key, value in descriptions if value]}


def institution_quality(record):
    """Minimum usable profile/research coverage, not a cosmetic logo requirement."""
    try:
        website = urlsplit(record.get("websites") or "")
        has_website = website.scheme in {"http", "https"} and bool(website.hostname) and not website.username and not website.password
    except ValueError:
        has_website = False
    return {
        "hasName": bool(record.get("en_label") or record.get("zh_label")),
        "hasDescription": bool(record.get("en_description") or record.get("zh_description")),
        "hasWebsite": bool(has_website),
        "hasCountry": bool(re.fullmatch(r"[A-Z]{2}", record.get("country_code") or "")),
        "hasResearchActivity": (record.get("works_count") or 0) > 0 and (record.get("cited_by_count") or 0) > 0,
    }


def assign_site_ranks(rows, limit=SITE_LIMIT):
    """Re-rank eligible scores before capping; preserve original upstream ranks."""
    ordered = sorted(rows, key=lambda r: (-round(r["total_score"], 12), r["entity_id"]))
    previous, rank = None, 0
    result = []
    for index, row in enumerate(ordered[:limit]):
        score = round(row["total_score"], 12)
        if score != previous:
            rank = index + 1
        result.append({**row, "siteRank": rank})
        previous = score
    return result
