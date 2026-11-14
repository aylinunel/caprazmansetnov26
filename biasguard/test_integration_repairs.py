"""Concrete regression checks from the read-only integration audit."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from biasguard.publication import ensure_publication_allowed
from biasguard.validity import evidence_attribution
from biasguard.validation import evaluate
from biasguard.news import main as news_main


class AuditRegressionTests(unittest.TestCase):
    def test_native_guarded_root_is_never_a_public_export(self):
        with self.assertRaises(ValueError):
            ensure_publication_allowed({"status": "review_complete", "validity_gate": {"publication_status": "draft"}})

    def test_pack_rejects_native_guard_before_reading_core(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "biasguard.json").write_text(json.dumps({"status": "review_complete", "validity_gate": {}}))
            with patch("sys.argv", ["biasguard.news", "pack", "--run", str(root / "run"), "--build", str(root)]), patch("biasguard.news._load") as loader:
                with self.assertRaises(ValueError):
                    news_main()
                loader.assert_not_called()

    def test_overlong_segment_cannot_claim_other_outlet_quote(self):
        text = "[A · 09:00] Alpha headline\n[B · 09:05] Beta headline"
        item = {"text": text, "context": "", "segments": [{"start": 0, "end": len(text), "outlet": "A", "article_id": "article-A"}]}
        with self.assertRaises(ValueError):
            evidence_attribution(item, {"source": "text", "quote": "Beta headline"})

    def test_duplicate_or_partial_record_segment_rejected(self):
        text = "[A · 09:00] Alpha headline\n[B · 09:05] Beta headline"
        cut = text.index("\n")
        segments = [{"start": 0, "end": cut, "outlet": "A"}, {"start": cut + 1, "end": len(text) - 1, "outlet": "B"}]
        with self.assertRaises(ValueError):
            evidence_attribution({"text": text, "segments": segments}, {"source": "text", "quote": "Alpha headline"})

    def test_native_candidates_retained_in_routing_and_unknown_taxonomy(self):
        cases = [{"id": "e1", "family_id": "f1", "origin": "synthetic", "labels": {"authority-bias": "not_supported"}}]
        result = {"e1": {"status": "review_complete", "candidate_ids": ["authority-bias", "unknown-candidate"]}}
        report = evaluate(cases, result, catalog_ids=["authority-bias"])
        self.assertTrue(report["case_results"][0]["targets"][0]["selected"])
        self.assertEqual(report["case_results"][0]["reported_coverage"]["candidate_ids"], ["authority-bias", "unknown-candidate"])
        self.assertEqual(report["diagnostics"]["unsupported_taxonomy_targets"][0]["card_id"], "unknown-candidate")

    def test_conflicting_candidate_alias_rejected_even_when_empty(self):
        cases = [{"id": "e1", "family_id": "f1", "origin": "synthetic", "labels": {}}]
        with self.assertRaises(ValueError):
            evaluate(cases, {"e1": {"status": "review_complete", "selected": [], "candidate_ids": ["authority-bias"]}}, catalog_ids=["authority-bias"])


if __name__ == "__main__":
    unittest.main()
