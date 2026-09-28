"""Pure parsing rules shared by the read-only remote exporter and tests."""
import math
import re

FIELDS = {
    'median6': ('MD_EARN_WNE_P6', 'usd'),
    'median10': ('MD_EARN_WNE_P10', 'usd'),
    'debt': ('GRAD_DEBT_MDN', 'usd'),
    'repayment3': ('RPY_3YR_RT', 'percent'),
}
CRIMES = ['Murder/Non-negligent manslaughter','Negligent manslaughter','Rape','Fondling','Incest','Statutory rape','Robbery','Aggravated assault','Burglary','Motor vehicle theft','Arson']
CATEGORIES = {
    'Criminal_Offenses': CRIMES,
    'VAWA_Offenses': ['Domestic violence','Dating violence','Stalking'],
    'Disciplinary_Actions': ['Illegal weapons possession','Drug law violations','Liquor law violations'],
    # Keep offense totals, never add bias-category breakdown columns to those totals.
    'Hate_Crimes': CRIMES + ['Simple assault','Larceny-theft','Intimidation','Destruction/damage/ vandalism of property'],
}
GEOGRAPHIES = {
    'On_campus': 'campus',
    'On_campus_Student_Housing_Facilities':'housing',
    'Student_Housing_Facilities':'housing',
    'Noncampus':'noncampus',
    'Public_Property':'public',
}
def number(value, rate=False):
    try: result=float(value)
    except (ValueError,TypeError):return None
    if not math.isfinite(result) or result<0 or (rate and result>1):return None
    return round(result*100,4) if rate else result

def parse_safety_file(filename):
    for category in CATEGORIES:
        prefix=category+'_'
        if filename.startswith(prefix) and filename.endswith('.csv'):
            geography=GEOGRAPHIES.get(filename[len(prefix):-4])
            return (category,geography) if geography else None
    if filename=='Total_Fires_On_campus_Student_Housing_Facilities.csv':return ('Fires','housing')
    return None

def safety_metrics(row,category):
    keys=CATEGORIES.get(category,['Total Fires'])
    result=[]
    for key in keys:
        count=number(row.get(key))
        if count is not None and not count.is_integer():count=None
        result.append({'key':key,'value':int(count) if count is not None else None})
    return result

def extract_overview(text):
    paragraphs=[]
    for part in re.split(r'\n\s*\n',text or ''):
        part=re.sub(r'<[^>]*>',' ',part)
        part=re.sub(r'\s+',' ',part).strip()
        if len(part)<35:continue
        # Keep complete paragraphs; bound page size without cutting words mid-sentence.
        if len(part)>4500:part=part[:4500].rsplit('。',1)[0]+'。' if '。' in part[:4500] else part[:4500].rsplit('. ',1)[0]+'.'
        paragraphs.append(part)
        if len(paragraphs)>=5 or sum(map(len,paragraphs))>=6500:break
    return paragraphs
