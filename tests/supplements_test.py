import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('rules',Path(__file__).parents[1]/'scripts/supplement_rules.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
class SupplementTests(unittest.TestCase):
 def test_missing_suppressed_values_are_not_zero(self):
  for value in ['',None,'NA','PrivacySuppressed','-1','nan']:
   self.assertIsNone(r.number(value))
  self.assertEqual(r.number('0'),0)
 def test_rate_unit_conversion(self):
  self.assertEqual(r.number('0.7',rate=True),70)
  self.assertIsNone(r.number('70',rate=True))
 def test_geography_preserved_police_not_double_counted(self):
  self.assertEqual(r.parse_safety_file('Criminal_Offenses_On_campus.csv'),('Criminal_Offenses','campus'))
  self.assertEqual(r.parse_safety_file('Criminal_Offenses_On_campus_Student_Housing_Facilities.csv'),('Criminal_Offenses','housing'))
  self.assertIsNone(r.parse_safety_file('Criminal_Offenses_Reported_by_Local_State_Police.csv'))
 def test_hate_offense_totals_do_not_add_bias_breakdowns(self):
  metrics=r.safety_metrics({'Rape':'2','Rape - Race':'2','Arson':'0'},'Hate_Crimes')
  self.assertEqual(next(m['value'] for m in metrics if m['key']=='Rape'),2)
  self.assertFalse(any('Race' in m['key'] for m in metrics))
  self.assertIsNone(next(m['value'] for m in metrics if m['key']=='Robbery'))
 def test_overviews_are_bounded_plain_text_not_generated_filler(self):
  self.assertEqual(r.extract_overview(''),[])
  self.assertEqual(r.extract_overview('<b>A university</b> with a long sourced description and campus history.'),['A university with a long sourced description and campus history.'])
if __name__=='__main__':unittest.main()
