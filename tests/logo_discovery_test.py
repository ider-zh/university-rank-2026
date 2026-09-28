import unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('logo_coverage',Path(__file__).parents[1]/'scripts/logo-coverage.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class LogoDiscoveryTests(unittest.TestCase):
 def test_boolean_html_attributes_do_not_break_discovery(self):
  parser=module.Images();parser.feed('<img src="logo.png" alt class><title>University</title>')
  self.assertEqual(parser.title,'University');self.assertEqual(parser.items[0]['path'],'logo.png')
 def test_svg_image_wrapper_is_discovered(self):
  parser=module.Images();parser.feed('<svg><image xlink:href="news/images/logo.svg" /></svg>')
  self.assertEqual(parser.items[0]['path'],'news/images/logo.svg')
