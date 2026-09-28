"""Normalize parsed Wikipedia infoboxes into display-only facts (no HTML execution)."""
import html
import json
import re

FIELDS = [
    ("established", "建校时间", "Established", ["established", "建校", "建校时间", "創校", "成立时间", "創立"]),
    ("type", "学校类型", "Institution type", ["type", "类型", "類型", "性质", "性質"]),
    ("motto", "校训", "Motto", ["motto", "校训", "校訓"]),
    ("formerNames", "历史名称", "Former names", ["former_names", "former names", "老校名", "曾用名"]),
    ("founder", "创办者", "Founder", ["founder", "创办人", "創辦人"]),
    ("president", "校长", "President", ["president", "校长", "校長", "chancellor"]),
    ("provost", "教务长", "Provost", ["provost", "教务长", "教務長"]),
    ("students", "学生人数", "Students", ["students", "学生", "學生", "在校生"]),
    ("undergraduates", "本科生", "Undergraduates", ["undergrad", "undergraduates", "本科生"]),
    ("postgraduates", "研究生", "Postgraduates", ["postgrad", "postgraduates", "研究生"]),
    ("doctoral", "博士生", "Doctoral students", ["doctoral", "doctoral students", "博士生"]),
    ("faculty", "教师人数", "Academic staff", ["academic_staff", "academic staff", "faculty", "教师", "教師"]),
    ("staff", "职工人数", "Staff", ["total_staff", "administrative_staff", "administrative staff", "staff", "职工", "職工"]),
    ("location", "所在地", "Location", ["location", "地址", "所在地", "city"]),
    ("campus", "校园环境", "Campus setting", ["campus_type", "校园环境", "校園環境", "campus"]),
    ("campusSize", "校园面积", "Campus size", ["campus_size", "campus size", "面积", "面積"]),
    ("endowment", "捐赠基金", "Endowment", ["endowment", "捐赠基金", "基金"]),
    ("budget", "预算", "Budget", ["budget", "预算", "預算"]),
    ("affiliations", "所属联盟", "Affiliations", ["affiliations", "academic_affiliations", "隶属", "隸屬", "联盟"]),
    ("accreditation", "认证", "Accreditation", ["accreditation", "认证"]),
    ("mascot", "吉祥物", "Mascot", ["mascot", "吉祥物"]),
]


def boxes(raw):
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return {}
    if isinstance(raw, dict):
        raw = [raw]
    result = {}
    for box in raw or []:
        if not isinstance(box, dict):
            continue
        for key, value in box.items():
            if isinstance(value, dict):
                value = value.get("text", "")
            if isinstance(value, (str, int, float)):
                text = html.unescape(re.sub(r"<[^>]*>", "", str(value))).strip()
                if text:
                    result.setdefault(key.lower().strip(), text)
    return result


def normalize_infobox(en_raw, zh_raw, locale, inception=None):
    en, zh = boxes(en_raw), boxes(zh_raw)
    output = []
    for key, label_zh, label_en, aliases in FIELDS:
        value, language = None, locale
        for source, lang in ([(zh, "zh"), (en, "en")] if locale == "zh" else [(en, "en"), (zh, "zh")]):
            value = next((source[a] for a in aliases if source.get(a)), None)
            if value:
                language = lang
                break
        # Broken template extraction can yield e.g. "29" as the entire establishment date.
        if key == "established" and (not value or not re.search(r"\d{3,4}", value)):
            value = str(inception) if isinstance(inception, int) and 0 < inception < 2100 else None
            language = locale
        if value:
            output.append({"key": key, "label": label_zh if locale == "zh" else label_en,
                           "value": value, "language": language})
    return output


def external_rankings(en_raw, zh_raw, locale):
    source = boxes(en_raw)
    other = boxes(zh_raw)
    if locale == "zh":
        source, other = other, source
    output = []
    for label, aliases in [("QS", ["qs_w", "qsworld"]), ("THE", ["the_w", "thes_w", "theworld"]),
                           ("ARWU", ["arwu_w", "arwuworld"]), ("U.S. News", ["usnwr_w", "usnews_w", "usnwrglobal"])]:
        for box in [source, other]:
            key = next((key for key in aliases if box.get(key)), None)
            if key:
                output.append({"publisher": label, "rank": box[key], "year": box.get(key + "_year")})
                break
    return output
