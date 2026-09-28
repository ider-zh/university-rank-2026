import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("content_generate", Path(__file__).parents[1] / "scripts/content_generate.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ContentTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"sources":{"en.description":"A public university in Beijing, China, founded in 1911."}}
        self.result = {
            "zh":{"text":"这所公立大学位于中国北京市，其历史可以追溯至1911年，学校资料来自已有百科记录。","sources":["en.description"]},
            "en":{"text":"This public university is located in Beijing, China. Its history dates back to 1911 according to the supplied source records.","sources":["en.description"]}}
    def test_bilingual_source_references(self):
        self.assertEqual(module.validate_result(self.result,self.payload),self.result)
    def test_rejects_unknown_evidence_and_invented_dates(self):
        bad=copy.deepcopy(self.result);bad["zh"]["sources"]=["invented"]
        with self.assertRaises(ValueError):module.validate_result(bad,self.payload)
        bad=copy.deepcopy(self.result);bad["en"]["text"]=bad["en"]["text"].replace("1911","1900")
        with self.assertRaises(ValueError):module.validate_result(bad,self.payload)
    def test_rejects_html_and_promotional_claims(self):
        for suffix in ["<script>alert(1)</script>"," world-class institution"," oldest university"]:
            bad=copy.deepcopy(self.result);bad["en"]["text"]+=suffix
            with self.assertRaises(ValueError):module.validate_result(bad,self.payload)
    def test_hash_is_order_independent_and_tracks_sources(self):
        self.assertEqual(module.digest({"a":1,"b":2}),module.digest({"b":2,"a":1}))
        self.assertNotEqual(module.digest(self.payload),module.digest({"sources":{}}))

if __name__ == "__main__":unittest.main()
