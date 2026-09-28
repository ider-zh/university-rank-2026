import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("eligibility", Path(__file__).parents[1] / "scripts/institution_eligibility.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EligibilityTests(unittest.TestCase):
    def decision(self, **record):
        return module.institution_eligibility(record)["status"]

    def test_netflix_is_not_admitted_by_openalex_or_ror(self):
        self.assertEqual(self.decision(en_label="Netflix", en_description="American subscription streaming service",
                                      openalex_id="I869089601", ror_id="0197qw696"), "rejected")

    def test_holding_company_cannot_borrow_university_name(self):
        self.assertEqual(self.decision(en_label="Tsinghua Holdings", en_description="holding company of Tsinghua University",
                                      instance_of=["Q3918"]), "rejected")

    def test_high_school_and_disambiguation_are_rejected(self):
        self.assertEqual(self.decision(en_description="high school in London", qs_university_id=["wrong-link"]), "rejected")
        self.assertEqual(self.decision(instance_of=["Q4167410"], arwu_university_id=["queens-university"]), "rejected")

    def test_explicit_type_and_corroborated_ranking_admission(self):
        self.assertEqual(self.decision(instance_of=["Q3918"]), "eligible")
        self.assertEqual(self.decision(en_description="French university", qs_university_id=["example"]), "eligible")

    def test_names_or_ranking_ids_alone_are_not_evidence(self):
        self.assertEqual(self.decision(en_label="University Research Company"), "quarantined")
        self.assertEqual(self.decision(qs_university_id=["wrong-link"]), "quarantined")
        self.assertEqual(self.decision(en_description="laboratory of the University College London"), "rejected")

    def test_former_university_is_quarantined(self):
        self.assertEqual(self.decision(instance_of=["Q3918"], en_description="former university in France"), "quarantined")

    def test_membership_description_does_not_turn_university_into_system(self):
        self.assertEqual(self.decision(en_description="national university in Taipei, Taiwan",
                                      zh_description="國立臺灣大學系統成員校之一",
                                      qs_university_id=["national-taiwan-normal-university"]), "eligible")
        self.assertEqual(self.decision(en_description="French university system, in Lyon, France",
                                      qs_university_id=["bad-link"]), "quarantined")
        self.assertEqual(self.decision(en_description="public university system in Colorado, USA",
                                      instance_of=["Q3918"]), "quarantined")
        self.assertEqual(self.decision(en_description="public university in Boulder, Colorado, USA and flagship of the University of Colorado System",
                                      instance_of=["Q3918"]), "eligible")
        self.assertEqual(self.decision(en_description="public research university located in Bloomington (flagship campus of the Indiana University system)",
                                      instance_of=["Q62078547"]), "eligible")

    def test_quality_does_not_require_logos_or_finance(self):
        quality = module.institution_quality(dict(en_label="School", en_description="University", websites="https://example.edu",
                                                  country_code="CN", works_count=1, cited_by_count=1))
        self.assertTrue(all(quality.values()))
        self.assertFalse(module.institution_quality({})["hasWebsite"])

    def test_site_rank_recomputed_with_ties_and_source_provenance(self):
        rows = [{"entity_id":"Q3","rank":88,"total_score":.4}, {"entity_id":"Q2","rank":54,"total_score":.5},
                {"entity_id":"Q1","rank":31,"total_score":.5}]
        ranked = module.assign_site_ranks(rows)
        self.assertEqual([r["siteRank"] for r in ranked], [1, 1, 3])
        self.assertEqual([r["rank"] for r in ranked], [31, 54, 88])
        self.assertEqual(len(module.assign_site_ranks(rows, 2)), 2)


if __name__ == "__main__":
    unittest.main()
