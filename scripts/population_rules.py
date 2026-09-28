"""Population semantics: unknown is not zero; employees are not academic staff."""
import html,math,re
from html.parser import HTMLParser

ALIASES={
 'students':{'students','number of students','student body','学生','學生','在校生','学生人数','學生人數','学生总数','學生總數'},
 'faculty':{'academic_staff','academic staff','academic staff (fte)','faculty','faculty members','teaching staff','教师','教師','教师人数','教師人數','专任教师','專任教師'},
 'employees':{'staff','employees','total_staff','total staff','administrative_staff','administrative staff','教职工','教職工','职工','職工'},
}

def count_value(raw):
 if not isinstance(raw,(str,int,float)):return None
 text=html.unescape(re.sub(r'<[^>]+>',' ',str(raw))).strip()
 if re.search(r'(?<!\d)[-−]\s*\d',text):return None
 original=text
 if re.search(r'\b(?:over|more than|at least|faculties|departments)\b|超过|超過|余名|餘名|余人|餘人',text,re.I):return None
 years=[]
 def remove_year(m):
  dates=re.findall(r'(?:19|20)\d{2}(?:\s*[/–-]\s*(?:\d{4}|\d{2}))?',m[0])
  if dates:years.extend(dates);return ''
  return m[0]
 text=re.sub(r'\([^)]*\)|（[^）]*）',remove_year,text)
 text=re.sub(r'\[[\d\s,–-]+\]','',text)
 text=re.sub(r'\b(?:as of|in)\s+((?:19|20)\d{2})',lambda m:(years.append(m[1]) or ''),text,flags=re.I)
 text=re.sub(r'(?<=\d)[,，\u00a0\u202f](?=\d{3}(?:\D|$))','',text)
 numbers=re.findall(r'\d+(?:\.\d+)?',text)
 if len(numbers)!=1:return None
 value=float(numbers[0])
 if re.search(r'\d\s*万',text):value*=10000
 if not math.isfinite(value) or value<=0 or value>10000000:return None
 if re.search(r'\b(?:part.time|full.time)\b',original,re.I) and not re.search(r'\b(?:FTE|equivalent)\b',original,re.I):return None
 basis='fte' if re.search(r'\bFTE\b|full.time equivalent|全时当量|全時當量',original,re.I) else 'headcount-unspecified'
 if basis!='fte' and not value.is_integer():return None
 return {'value':value,'period':years[-1] if years else None,'basis':basis,'approximate':bool(re.search(r'about|approx|approximately|~|约|約',text,re.I))}

def select_observation(observations,field):
 valid=[r for r in observations if r['field']==field and not r.get('historicalOnly') and r.get('value',0)>0 and not r.get('scopeUncertain') and r.get('basis')!='fte']
 if not valid:return None
 # Only exact field-specific observations. Never fill a faculty gap with P1128 employees.
 priority={'official':0,'wikipedia-live':1,'wikipedia-snapshot':2,'wikidata':3,'times-snapshot':4}
 valid.sort(key=lambda r:(priority.get(r['source'],9),-int((r.get('period') or '0000')[:4])))
 best=valid[0]
 peers=[r for r in valid if r['source']==best['source'] and r.get('period')==best.get('period') and r.get('basis')==best.get('basis')]
 if len({r['value'] for r in peers})>1:return None
 return best

def times_pair(row):
 students=count_value(row.get('stats_number_students'))
 try:ratio=float(row.get('stats_student_staff_ratio'))
 except (TypeError,ValueError):return None
 if not students or not math.isfinite(ratio) or not .5<=ratio<=200:return None
 return {'students':students['value'],'studentsPerAcademicStaff':ratio,'estimatedAcademicStaff':round(students['value']/ratio,2),'basis':'THE-reported-student-staff-basis','period':None,'estimated':True}

class InfoboxHTML(HTMLParser):
 def __init__(self):
  super().__init__();self.depth=0;self.box_depth=None;self.row=None;self.cell=None;self.rows=[];self.refdepth=0
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if tag=='table':
   self.depth+=1
   if self.box_depth is None and 'infobox' in attrs.get('class','').split():self.box_depth=self.depth
  if self.box_depth==self.depth:
   if tag=='tr':self.row={'th':'','td':''}
   if tag in {'th','td'} and self.row is not None:self.cell=tag
  if tag=='br' and self.row is not None and self.cell:self.row[self.cell]+=' '
 def handle_data(self,data):
  if self.box_depth is not None and self.row is not None and self.cell:self.row[self.cell]+=data
 def handle_endtag(self,tag):
  if self.box_depth==self.depth:
   if tag in {'th','td'}:self.cell=None
   if tag=='tr' and self.row is not None:
    if self.row['th'].strip() and self.row['td'].strip():self.rows.append((self.row['th'].strip(),self.row['td'].strip()))
    self.row=None
  if tag=='table':
   if self.box_depth==self.depth:self.box_depth=None
   self.depth-=1
