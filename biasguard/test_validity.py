"""Offline validity contracts: no APIs, network, collector or public writes."""
from copy import deepcopy
import unittest

from biasguard.catalog import load_cards
from biasguard.engine import BiasGuard
from biasguard.validity import (evidence_attribution, guard_news_result,
                                required_capabilities, ensure_publication_allowed)

TEXT = "[A · 09:00] Uzman söylediği için diğer kanıtları değerlendirmedik\n[B · 09:05] Aynı olay başka bir açıklamayla verildi"
CONTEXT = "Karar kaydı: kurul yalnızca unvanı gerekçe gösterdi, karşı kanıtları okumadı."
QUOTE = "Uzman söylediği için diğer kanıtları değerlendirmedik"


class FixtureReviewer:
    def __init__(self, context_roles=("advocate", "skeptic"), kind="statement"):
        self.context_roles = context_roles
        self.kind = kind

    def review(self, text, context, cards, role):
        evidence = [{"source": "text", "quote": QUOTE, "kind": self.kind}]
        if role in self.context_roles:
            evidence.append({"source": "context", "quote": CONTEXT, "kind": "behavioral"})
        return {"role": role, "assessments": [{
            "card_id": c["id"], "verdict": "supported", "evidence": evidence,
            "necessary_conditions": [{"condition_index": i, "status": "satisfied",
                                      "evidence_indices": list(range(len(evidence)))}
                                     for i in range(len(c["necessary_conditions"]))],
            "mechanism": "Synthetic fixture reasoning", "alternative_explanation": "A relevant expert might be justified",
            "missing_context": []} for c in cards]}


def cap(name="documented_reasoning", quote=CONTEXT):
    return {"capability": name, "source": "context", "quote": quote,
            "origin": "documentary", "document_id": "synthetic-record-1",
            "description": "Karar gerekçesinin belirtilen belgede açıkça kaydedilmesi"}


class ValidityTests(unittest.TestCase):
    def setUp(self):
        self.card = next(c for c in load_cards() if c["id"] == "authority-bias")
        self.item = {"text": TEXT, "context": CONTEXT, "input_scope": "headline_and_partial_lede"}
        self.raw = BiasGuard(cards=[self.card], reviewer=FixtureReviewer()).analyze(TEXT, CONTEXT, mode="ai")
        self.assertEqual(self.raw["status"], "review_complete")
        self.assertEqual(len(self.raw["supported_findings"]), 1)

    def test_headline_alone_downgrades_unsupported_cognitive_inference(self):
        guarded = guard_news_result(self.raw, self.item, [self.card])
        self.assertEqual(guarded["supported_findings"], [])
        self.assertEqual(guarded["uncertain_findings"][0]["status"], "needs_context")
        self.assertFalse(guarded["eligibility"][0]["observable"])

    def test_behavioral_label_is_not_documentary_capability(self):
        raw = BiasGuard(cards=[self.card], reviewer=FixtureReviewer(kind="behavioral")).analyze(TEXT, CONTEXT, mode="ai")
        self.assertEqual(guard_news_result(raw, self.item, [self.card])["supported_findings"], [])

    def test_documented_cited_context_retains_review_only_hypothesis(self):
        item = {**self.item, "evidence_capabilities": [cap()]}
        guarded = guard_news_result(self.raw, item, [self.card])
        self.assertEqual(len(guarded["supported_findings"]), 1)
        self.assertTrue(guarded["validity_gate"]["review_required"])
        self.assertEqual(guarded["validity_gate"]["verification_status"], "needs_review")

    def test_one_role_not_citing_capability_prevents_support(self):
        raw = BiasGuard(cards=[self.card], reviewer=FixtureReviewer(context_roles=("advocate",))).analyze(TEXT, CONTEXT, mode="ai")
        guarded = guard_news_result(raw, {**self.item, "evidence_capabilities": [cap()]}, [self.card])
        self.assertEqual(guarded["supported_findings"], [])
        self.assertIn("documented_reasoning", guarded["uncertain_findings"][0]["validity"]["uncited_capabilities"])

    def test_present_but_not_cited_capability_does_not_count(self):
        raw = BiasGuard(cards=[self.card], reviewer=FixtureReviewer(context_roles=())).analyze(TEXT, CONTEXT, mode="ai")
        self.assertFalse(guard_news_result(raw, {**self.item, "evidence_capabilities": [cap()]}, [self.card])["supported_findings"])

    def test_fabricated_capability_quote_rejected(self):
        result = guard_news_result(self.raw, {**self.item, "evidence_capabilities": [cap(quote="Bu kayıt kaynakta gerçekten bulunmuyor")]}, [self.card])
        self.assertTrue(result["validity_gate"]["rejected_capabilities"])
        self.assertFalse(result["supported_findings"])

    def test_boolean_and_unhashable_capabilities_rejected_safely(self):
        for value in [True, {"documented_reasoning": True}, [{**cap(), "capability": []}]]:
            result = guard_news_result(self.raw, {**self.item, "evidence_capabilities": value}, [self.card])
            self.assertFalse(result["supported_findings"])
            self.assertTrue(result["validity_gate"]["rejected_capabilities"])

    def test_ideology_and_collector_metadata_are_not_reasoning(self):
        result = guard_news_result(self.raw, {**self.item, "lean": 100, "absent_outlets": ["C"], "behavioral": True}, [self.card])
        self.assertFalse(result["supported_findings"])

    def test_native_status_and_assessed_coverage_not_repaired(self):
        raw = {**self.raw, "status": "analysis_incomplete", "assessed_card_count": 0}
        guarded = guard_news_result(raw, {**self.item, "evidence_capabilities": [cap()]}, [self.card])
        self.assertEqual(guarded["status"], "analysis_incomplete")
        self.assertEqual(guarded["assessed_card_count"], 0)
        self.assertFalse(guarded["supported_findings"])

    def test_original_inputs_and_results_remain_unchanged(self):
        before_raw, before_item = deepcopy(self.raw), deepcopy(self.item)
        guard_news_result(self.raw, self.item, [self.card])
        self.assertEqual(self.raw, before_raw)
        self.assertEqual(self.item, before_item)

    def test_learning_effects_need_learning_outcomes_not_harm(self):
        card = next(c for c in load_cards() if c["id"] == "spacing-effect")
        raw = BiasGuard(cards=[card], reviewer=FixtureReviewer()).analyze(TEXT, CONTEXT, mode="ai")
        result = guard_news_result(raw, {**self.item, "evidence_capabilities": [cap("learning_observations")]}, [card])
        self.assertEqual(result["supported_findings"], [])
        self.assertEqual(len(result["contextual_effects"]), 1)
        self.assertTrue(result["contextual_effects"][0]["not_necessarily_an_error"])

    def test_rare_or_unknown_cards_not_implicitly_supported(self):
        raw = deepcopy(self.raw)
        raw["supported_findings"][0]["id"] = "unsupported-new-media-technique"
        self.assertFalse(guard_news_result(raw, self.item, [self.card])["supported_findings"])

    def test_outcome_hypotheses_require_outcomes(self):
        card = next(c for c in load_cards() if c["id"] == "illusion-of-validity")
        self.assertIn("outcome_comparison", required_capabilities(card))

    def test_history_hypotheses_require_real_history(self):
        card = next(c for c in load_cards() if c["id"] == "hindsight-bias")
        self.assertIn("behavioral_history", required_capabilities(card))


class AttributionTests(unittest.TestCase):
    def test_repeated_quotes_keep_all_unicode_spans(self):
        quote = "İĞDIR için yeni açıklama"
        item = {"text": f"[A · 09:00] {quote}\n[B · 09:05] {quote}", "context": ""}
        result = evidence_attribution(item, {"source": "text", "quote": quote})
        self.assertEqual(len(result), 2)
        self.assertEqual([r["outlets"] for r in result], [["A"], ["B"]])
        for row in result:
            self.assertEqual(item["text"][row["start"]:row["end"]], quote)

    def test_comparison_crossing_lines_attributed_to_both(self):
        result = evidence_attribution({"text": TEXT, "context": ""}, {"source": "text", "quote": TEXT})
        self.assertEqual(result[0]["outlets"], ["A", "B"])

    def test_context_not_attached_to_outlet_or_article_url(self):
        result = evidence_attribution({"text": TEXT, "context": CONTEXT}, {"source": "context", "quote": CONTEXT})
        self.assertEqual(result[0]["outlets"], [])
        self.assertEqual(result[0]["articles"], [])

    def test_wrong_field_quote_is_rejected(self):
        self.assertEqual(evidence_attribution({"text": TEXT, "context": CONTEXT}, {"source": "context", "quote": QUOTE}), [])

    def test_invalid_segments_rejected(self):
        item = {"text": TEXT, "context": "", "segments": [{"start": 0, "end": 10, "outlet": "WRONG"}]}
        with self.assertRaises(ValueError):
            evidence_attribution(item, {"source": "text", "quote": QUOTE})


class PublicationTests(unittest.TestCase):
    def test_guarded_draft_never_public_even_if_approval_boolean_flipped(self):
        for metadata in [{"algorithm": "news-validity-v1", "review_required": False}, {"publication_status": "draft"}]:
            with self.assertRaises(ValueError):
                ensure_publication_allowed({"metadata": metadata, "events": []})

    def test_event_marker_survives_stripped_top_metadata(self):
        with self.assertRaises(ValueError):
            ensure_publication_allowed({"events": [{"validity_gate": {}}]})

    def test_legacy_payload_compatible(self):
        ensure_publication_allowed({"summary": {}, "events": []})

    def test_malformed_payload_fails_closed(self):
        for payload in [[], {"metadata": []}, {"events": None}]:
            with self.assertRaises(ValueError):
                ensure_publication_allowed(payload)


if __name__ == "__main__":
    unittest.main()
