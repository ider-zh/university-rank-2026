import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from infobox_normalize import normalize_infobox, external_rankings


class InfoboxTests(unittest.TestCase):
    def test_multiple_boxes_and_chinese_aliases(self):
        raw=json.dumps([{"qs_w":{"text":"17"}},{"建校":{"text":"1911年"},"校训":{"text":"自强不息"},"面积":{"text":"482.84公顷"}}])
        result=normalize_infobox(None,raw,"zh")
        self.assertEqual([x["key"] for x in result],["established","motto","campusSize"])
        self.assertEqual(result[-1]["value"],"482.84公顷")

    def test_malformed_establishment_uses_structured_year(self):
        result=normalize_infobox([{"established":{"text":"29"}}],None,"en",1911)
        self.assertEqual(result[0]["value"],"1911")

    def test_fallback_records_actual_language_and_preserves_years(self):
        result=normalize_infobox([{"students":{"text":"10,000 (2024)"}}],None,"zh")
        self.assertEqual(result[0]["language"],"en")
        self.assertEqual(result[0]["value"],"10,000 (2024)")

    def test_ignored_media_and_html_never_become_rendered_markup(self):
        result=normalize_infobox([{"image":{"text":"campus.jpg"},"motto":{"text":"<b>Truth</b> &amp; knowledge"}}],None,"en")
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]["value"],"Truth & knowledge")

    def test_external_rankings_keep_source_year(self):
        result=external_rankings([{"qs_w":{"text":"=17"},"qs_w_year":{"text":"2026"}}],None,"zh")
        self.assertEqual(result,[{"publisher":"QS","rank":"=17","year":"2026"}])

    def test_invalid_json_is_an_explicit_empty_infobox(self):
        self.assertEqual(normalize_infobox("not-json",None,"en"),[])


if __name__ == '__main__':
    unittest.main()
