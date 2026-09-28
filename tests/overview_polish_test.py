import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from overview_polish import validate_candidate,number_in_evidence

class PolishTests(unittest.TestCase):
 def test_equivalent_written_numbers_are_not_false_missing_evidence(self):
  for text in ['十八世纪','eighteenth century','18th century']:
   self.assertTrue(number_in_evidence('18',text))
  self.assertTrue(number_in_evidence('3','three campuses'))
  self.assertTrue(number_in_evidence('3','三个校区'))
  self.assertFalse(number_in_evidence('18','founded in 1817'))
 def candidate(self):
  text='这所大学位于来源所述城市，是一所提供多个学科教学的高等教育机构。学校的历史与办学信息均以所提供的百科快照为依据。'
  return {'issues':[],'summary':{'text':text,'sources':['zh.1']},'paragraphs':[{'text':text,'sources':['zh.1']}]}
 def test_requires_evidence(self):
  with self.assertRaises(ValueError):validate_candidate(self.candidate(),{})
 def test_accepts_sourced_structure(self):
  c=self.candidate();self.assertIs(validate_candidate(c,{'zh.1':c['summary']['text']}),c)
 def test_rejects_broken_turin_parentheses(self):
  c=self.candidate();c['summary']['text']='都灵大学（，缩写：UNITO），'+c['summary']['text']
  with self.assertRaises(ValueError):validate_candidate(c,{'zh.1':c['summary']['text']})
 def test_rejects_invented_number(self):
  c=self.candidate();c['summary']['text']+='学校成立于1404年。'
  with self.assertRaises(ValueError):validate_candidate(c,{'zh.1':'学校成立于1701年。'})
 def test_chinese_digit_years_cannot_bypass_numeric_evidence_check(self):
  c=self.candidate();c['summary']['text']+='学校成立于一四〇四年。'
  with self.assertRaises(ValueError):validate_candidate(c,{'zh.1':'学校成立于1701年。'})
  c=self.candidate();c['summary']['text']+='学校成立于一四〇四年。'
  validate_candidate(c,{'zh.1':'学校成立于1404年。'})
  self.assertIn('1404年',c['summary']['text'])

if __name__=='__main__':unittest.main()
