import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from population_rules import count_value,select_observation,times_pair,InfoboxHTML
from population_overlay import validate_overlay

class PopulationTests(unittest.TestCase):
 def test_count_and_period_are_separate(self):
  result=count_value('8,005 (2024/25)[10]')
  self.assertEqual(result['value'],8005);self.assertEqual(result['period'],'2024/25')
 def test_fte_inside_date_parentheses_stays_fte(self):
  self.assertEqual(count_value('5,000 (2024 FTE)')['basis'],'fte')
  self.assertIsNone(count_value('-500'))
  self.assertIsNone(count_value('5,000 (2024 full-time)'))
 def test_overlay_rejects_employee_counts_and_existing_baselines(self):
  import copy
  value={'schemaVersion':'1.0.0','policy':'only-fill-missing-direct-counts-no-estimates-no-ranking-change','universities':{'Q1':{'id':'Q1','baseline':{'faculty':None},'replacements':{'faculty':{'field':'faculty','value':100,'basis':'headcount-unspecified','source':'wikipedia-live','sourceUrl':'https://en.wikipedia.org/wiki/Test'}}}}}
  self.assertIs(validate_overlay(value),value)
  wrong=copy.deepcopy(value);wrong['universities']['Q1']['replacements']['faculty']['source']='wikidata'
  with self.assertRaises(AssertionError):validate_overlay(wrong)
  wrong=copy.deepcopy(value);wrong['universities']['Q1']['baseline']['faculty']=12
  with self.assertRaises(AssertionError):validate_overlay(wrong)
 def test_missing_and_ambiguous_are_not_zero_or_first_number(self):
  for text in ['', 'FTE','0','12,000–13,000','40,025 (2024/25) 34,790 FTE (2024/25)','over 5,000','12 faculties']:
   self.assertIsNone(count_value(text),text)
 def test_staff_and_estimates_never_become_observed_faculty(self):
  self.assertIsNone(select_observation([{'field':'employees','value':10000,'source':'wikidata'}],'faculty'))
  self.assertIsNone(select_observation([{'field':'faculty','value':100,'source':'wikipedia-live','basis':'fte'}],'faculty'))
 def test_same_year_conflicting_observations_are_quarantined(self):
  rows=[{'field':'faculty','value':n,'source':'wikipedia-snapshot','period':None,'basis':'headcount-unspecified'} for n in [100,200]]
  self.assertIsNone(select_observation(rows,'faculty'))
 def test_closed_institution_not_current(self):
  self.assertIsNone(select_observation([{'field':'faculty','value':100,'source':'wikipedia-live','historicalOnly':True}],'faculty'))
 def test_ratio_estimate_uses_same_row_and_marks_estimate(self):
  pair=times_pair({'stats_number_students':'22,095','stats_student_staff_ratio':'10.8'})
  self.assertEqual(pair['estimatedAcademicStaff'],2045.83);self.assertTrue(pair['estimated'])
  self.assertIsNone(times_pair({'stats_number_students':'22,095','stats_student_staff_ratio':'0'}))
 def test_rendered_infobox_fields(self):
  parser=InfoboxHTML();parser.feed('<table class="infobox vcard"><tr><th>Academic staff</th><td>8,005 (2024/25)<sup>[10]</sup></td></tr></table>')
  self.assertEqual(parser.rows,[('Academic staff','8,005 (2024/25)[10]')])
 def test_rate_limit_stops_following_requests(self):
  import tempfile,json
  from unittest.mock import patch
  from population_live import harvest
  ids=['Q999999999991','Q999999999992']
  source={'universities':{q:{'sources':{'wiki':[{'en_wiki_title':'Example'}]}} for q in ids}}
  with tempfile.TemporaryDirectory() as temporary:
   directory=Path(temporary)
   with patch('population_live.fetch_json',side_effect=[{'entities':{q:{} for q in ids}},ValueError('Wikimedia HTTP 429')]) as fetch,patch('population_live.time.sleep'):
    harvest(source,ids,directory)
   self.assertEqual(fetch.call_count,2)
   failures=json.loads((directory/'failures.json').read_text())
   self.assertIn('Skipped after rate limit',failures[-1]['error'])

if __name__=='__main__':unittest.main()
