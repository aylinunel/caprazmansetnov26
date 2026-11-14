"""Offline validation tests; tiny injected detector IDs, no model/provider calls.

Run from the repository root::

    /home/ubuntu/mesa_bias_sample/.venv/bin/python -m unittest biasguard.test_validation -v
"""
from __future__ import annotations

from copy import deepcopy
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from .validation import ALGORITHM_VERSION, _load_cases, _parse_json, evaluate, main

CATALOG = ("bias_a", "bias_b", "effect_a")


def case(cid="c1", labels=None, *, origin="human_reviewed", family=None, **extra):
    return {"id": cid, "family_id": family or cid, "origin": origin,
            "labels": {"bias_a": "supported"} if labels is None else labels, **extra}


def native(cid="c1", *, status="review_complete", supported=(), uncertain=(), effects=(), suppressed=(), **extra):
    def finding(value):
        return {"id": value, "evidence": []} if isinstance(value, str) else value
    payload = {
        "case_id": cid, "status": status,
        "supported_findings": [finding(x) for x in supported],
        "uncertain_findings": [finding(x) for x in uncertain],
        "contextual_effects": [finding(x) for x in effects],
        "adjudication": [{"card_id": x, "status": "suppressed"} for x in suppressed],
    }
    payload.update(extra)
    return payload


def run(cases, results, **kwargs):
    return evaluate(cases, results, catalog_ids=CATALOG, **kwargs)


def human(report):
    return report["reports_by_origin"]["human_reviewed"]


class ValidationTests(unittest.TestCase):
    def test_explicit_native_confusion_counts(self):
        cases = [case("tp"), case("fn"), case("fp", {"bias_a": "not_supported"}),
                 case("tn", {"bias_a": "not_supported"})]
        results = [native("tp", supported=["bias_a"]), native("fn", suppressed=["bias_a"]),
                   native("fp", supported=["bias_a"]), native("tn", suppressed=["bias_a"])]
        report = run(cases, results)
        micro = human(report)["micro"]
        self.assertEqual(micro["binary_confusion"], {"tp": 1, "fp": 1, "tn": 1, "fn": 1})
        self.assertEqual(micro["precision"], 0.5)
        self.assertEqual(micro["conditional_recall"], 0.5)
        self.assertEqual(micro["end_to_end_recall"], 0.5)
        self.assertEqual(human(report)["execution"]["completion_rate"], 1.0)

    def test_execution_errors_never_become_true_negatives(self):
        cases, results = [], []
        for status in ("analysis_incomplete", "input_rejected", "error", "failed"):
            for label in ("supported", "not_supported"):
                cid = status + label
                cases.append(case(cid, {"bias_a": label}))
                # Even contradictory fail payloads cannot become scored TP/TN.
                results.append(native(cid, status=status, supported=["bias_a"]))
        report = run(cases, results)
        micro, execution = human(report)["micro"], human(report)["execution"]
        self.assertEqual(micro["binary_confusion"], {"tp": 0, "fp": 0, "tn": 0, "fn": 0})
        self.assertIsNone(micro["conditional_recall"])
        self.assertEqual(micro["end_to_end_recall"], 0.0)
        self.assertEqual(micro["missed_positives_by_prediction"], {"error": 4})
        self.assertEqual(execution["execution_failures"], 8)
        self.assertEqual(execution["completion_denominator"], 8)
        self.assertEqual(execution["completion_rate"], 0.0)
        self.assertEqual(execution["status_counts"]["analysis_incomplete"], 2)

    def test_missing_unassessed_abstentions_are_end_to_end_misses(self):
        cases = [case(cid) for cid in ("hit", "missing", "unassessed", "abstain", "context", "not", "offline")]
        results = [native("hit", supported=["bias_a"]), native("unassessed"),
                   native("abstain", uncertain=["bias_a"]), native("context", effects=["bias_a"]),
                   native("not", status="not_attempted"), native("offline", status="offline_candidates_only")]
        report = run(cases, results)
        micro, execution = human(report)["micro"], human(report)["execution"]
        self.assertEqual(micro["conditional_recall"], 1.0)
        self.assertEqual(micro["end_to_end_recall"], 1 / 7)
        self.assertEqual(micro["end_to_end_missed_positives"], 6)
        self.assertEqual(micro["missed_positives_by_prediction"], {
            "missing": 1, "unassessed": 2, "uncertain": 1, "contextual": 1, "not_attempted": 1})
        self.assertEqual(execution["completion_denominator"], 7)
        self.assertEqual(execution["completed"], 4)
        self.assertEqual(execution["missing_results"], 1)
        self.assertEqual(execution["not_attempted"], 1)

    def test_selected_and_aggregate_assessed_counts_do_not_create_negatives(self):
        c = case(labels={"bias_a": "not_supported", "bias_b": "supported"})
        result = native(selected_card_count=2, assessed_card_count=2, unassessed_card_count=1,
                        catalog_card_count=3, selection={"selected_card_ids": ["bias_a", "bias_b"]})
        report = run([c], [result])
        self.assertEqual([t["prediction"] for t in report["case_results"][0]["targets"]], ["unassessed", "unassessed"])
        self.assertTrue(all(t["selected"] for t in report["case_results"][0]["targets"]))
        self.assertEqual(report["case_results"][0]["reported_coverage"]["assessed_card_count"], 2)
        self.assertEqual(human(report)["micro"]["binary_scored_target_rows"], 0)
        self.assertEqual(human(report)["micro"]["end_to_end_missed_positives"], 1)

    def test_news_slim_export_suppression_is_explicit(self):
        c = case(labels={"bias_a": "supported", "bias_b": "not_supported", "effect_a": "contextual"})
        event = {"event": "c1", "status": "review_complete", "supported": [{"id": "bias_a"}],
                 "uncertain": [], "effects": [{"id": "effect_a"}], "selected": list(CATALOG),
                 "assessed_card_count": 3,
                 "adjudication": [{"card_id": "bias_b", "status": "suppressed"}]}
        report = run([c], {"summary": {"completed": 1}, "events": [event]})
        self.assertEqual(human(report)["micro"]["binary_confusion"], {"tp": 1, "fp": 0, "tn": 1, "fn": 0})
        del event["adjudication"]
        report = run([c], {"events": [event]})
        self.assertEqual(human(report)["micro"]["binary_confusion"]["tn"], 0)
        self.assertEqual(report["case_results"][0]["targets"][1]["prediction"], "unassessed")

    def test_unknown_taxonomy_is_not_a_false_negative_or_true_negative(self):
        c = case(labels={"source_index_only": "supported", "simulation_138": "not_supported"})
        report = run([c], [native(supported=["source_index_only"], suppressed=["simulation_138"])])
        micro = human(report)["micro"]
        self.assertEqual(micro["unsupported_taxonomy_target_rows"], 2)
        self.assertEqual(micro["prediction_counts"], {"unsupported": 2})
        self.assertEqual(micro["end_to_end_missed_positives"], 0)
        self.assertIsNone(micro["end_to_end_recall"])
        self.assertEqual(micro["binary_scored_target_rows"], 0)

    def test_unknown_result_ids_not_negative_controls(self):
        report = run([case()], [native(supported=["bias_a"]), native("extra", suppressed=["bias_a"])])
        self.assertEqual(report["diagnostics"]["unknown_result_ids"], ["extra"])
        self.assertFalse(report["diagnostics"]["unknown_results_scored_as_controls"])
        self.assertEqual(report["diagnostics"]["submitted_result_records"], 2)
        self.assertEqual(human(report)["execution"]["case_attempt_rows"], 1)
        self.assertEqual(human(report)["micro"]["binary_confusion"]["tn"], 0)

    def test_empty_denominators_are_null(self):
        report = run([], [])
        for origin in ("human_reviewed", "synthetic"):
            section = report["reports_by_origin"][origin]
            self.assertIsNone(section["execution"]["completion_rate"])
            for metric in ("precision", "conditional_recall", "end_to_end_recall", "evidence_supported_positive_precision"):
                self.assertIsNone(section["micro"][metric])
                self.assertIsNone(section["macro"][metric]["value"])
        negative = run([case(labels={"bias_a": "not_supported"})], [native(suppressed=["bias_a"])])
        self.assertIsNone(human(negative)["micro"]["precision"])
        self.assertIsNone(human(negative)["micro"]["conditional_recall"])
        self.assertIsNone(human(negative)["micro"]["end_to_end_recall"])

    def test_contextual_effects_do_not_become_harmful_bias_gold(self):
        cases = [case("ok", {"effect_a": "contextual"}), case("harm", {"effect_a": "contextual"})]
        report = run(cases, [native("ok", effects=["effect_a"]), native("harm", supported=["effect_a"])])
        micro = human(report)["micro"]
        self.assertEqual(micro["binary_scored_target_rows"], 0)
        self.assertEqual(micro["contextual_effect_harm_routing_failures"], 1)
        self.assertEqual(micro["overassertions_outside_binary"]["contextual"], 1)
        self.assertIsNone(micro["precision"])
        self.assertEqual(micro["predictions_by_reference"]["contextual"], {"contextual": 1, "supported": 1})

    def test_ineligible_unresolved_overassertions_outside_binary(self):
        c = case(labels={"bias_a": "ineligible", "bias_b": "uncertain"})
        report = run([c], [native(supported=["bias_a", "bias_b"])])
        micro = human(report)["micro"]
        self.assertEqual(micro["binary_scored_target_rows"], 0)
        self.assertEqual(micro["overassertions_outside_binary_total"], 2)
        self.assertEqual(micro["overassertions_outside_binary"], {"uncertain": 1, "contextual": 0, "ineligible": 1})
        self.assertIsNone(micro["precision"])

    def test_mixed_origins_are_never_pooled(self):
        cases = [case("h", family="same"), case("s", origin="synthetic", family="same")]
        report = run(cases, [native("h", supported=["bias_a"]), native("s", suppressed=["bias_a"])])
        self.assertEqual(human(report)["micro"]["end_to_end_recall"], 1.0)
        self.assertEqual(report["reports_by_origin"]["synthetic"]["micro"]["end_to_end_recall"], 0.0)
        self.assertEqual(report["dataset"]["mixed_origin_family_ids"], ["same"])
        self.assertNotIn("accuracy", report)
        self.assertNotIn("micro", report)

    def test_repeated_families_are_visible(self):
        cases = [case("a", family="fam"), case("b", family="fam"), case("c", family="other")]
        report = run(cases, [native(cid, supported=["bias_a"]) for cid in ("a", "b", "c")])
        self.assertEqual(report["dataset"]["family_count"], 2)
        self.assertEqual(report["dataset"]["repeated_family_rows"], 1)
        execution = human(report)["execution"]
        self.assertEqual(execution["case_attempt_rows"], 3)
        self.assertEqual(execution["family_count"], 2)
        self.assertEqual(execution["rows_per_family"], {"fam": 2, "other": 1})

    def test_exact_quote_and_offsets_are_not_independent_adequacy(self):
        finding = {"id": "bias_a", "evidence": [{"source": "text", "quote": "quote", "start_offsets": [0, 6], "end_offsets": [5, 11]}]}
        c = case(text="quote quote")
        report = run([c], [native(supported=[finding])])
        micro = human(report)["micro"]
        self.assertEqual(micro["exact_evidence_integrity"]["valid"], 1)
        self.assertIsNone(micro["evidence_supported_positive_precision"])
        self.assertEqual(micro["independent_evidence_annotations_on_assertions"]["missing"], 1)
        c["evidence_adequacy"] = {"bias_a": False}
        report = run([c], [native(supported=[finding])])
        self.assertEqual(human(report)["micro"]["evidence_supported_positive_precision"], 0.0)
        self.assertEqual(human(report)["micro"]["precision"], 1.0)

    def test_inadequate_and_adequate_evidence_annotations(self):
        cases = [case("adequate", evidence_adequacy={"bias_a": True}),
                 case("inadequate", evidence_adequacy={"bias_a": False})]
        report = run(cases, [native("adequate", supported=["bias_a"]), native("inadequate", supported=["bias_a"])])
        micro = human(report)["micro"]
        self.assertEqual(micro["evidence_supported_positive_precision"], 0.5)
        self.assertEqual(micro["evidence_supported_positive_precision_denominator"], 2)
        self.assertEqual(micro["evidence_supported_positive_precision_numerator"], 1)
        self.assertTrue(micro["evidence_supported_positive_precision_computable"])

    def test_partial_or_null_adequacy_disables_evidence_precision(self):
        for missing_extra, expected in (({}, "missing"), ({"evidence_adequacy": {"bias_a": None}}, "unresolved")):
            with self.subTest(annotation=expected):
                cases = [case("yes", evidence_adequacy={"bias_a": True}), case("unknown", **missing_extra)]
                report = run(cases, [native("yes", supported=["bias_a"]), native("unknown", supported=["bias_a"])])
                micro = human(report)["micro"]
                self.assertIsNone(micro["evidence_supported_positive_precision"])
                self.assertEqual(micro["independent_evidence_annotations_on_assertions"][expected], 1)
                self.assertFalse(micro["evidence_supported_positive_precision_computable"])

    def test_evidence_precision_requires_correct_reference_and_adequacy(self):
        c = case(labels={"bias_a": "not_supported", "effect_a": "contextual"},
                 evidence_adequacy={"bias_a": True, "effect_a": True})
        report = run([c], [native(supported=["bias_a", "effect_a"])])
        micro = human(report)["micro"]
        self.assertEqual(micro["evidence_supported_positive_precision"], 0.0)
        self.assertEqual(micro["evidence_supported_positive_precision_denominator"], 2)

    def test_invalid_quotes_offsets_and_missing_sources(self):
        finding = {"id": "bias_a", "evidence": [
            {"source": "text", "quote": "invented"},
            {"source": "text", "quote": "quote", "start_offsets": [1], "end_offsets": [6]},
            {"src": "context", "q": "missing original"},
            {"src": "text", "q": "quote", "start": 0, "end": 5},
            {"source": "text", "quote": "quote", "start_offsets": [False], "end_offsets": [5]},
        ]}
        report = run([case(text="quote quote")], [native(supported=[finding])])
        exact = report["case_results"][0]["targets"][0]["exact_evidence"]
        self.assertEqual((exact["valid"], exact["invalid"], exact["unavailable"]), (1, 3, 1))
        self.assertEqual(len(exact["checks"]), 5)
        self.assertIsNone(human(report)["micro"]["evidence_supported_positive_precision"])

    def test_duplicate_case_and_result_ids_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate case id"):
            run([case(), case()], [])
        with self.assertRaisesRegex(ValueError, "duplicate result ID"):
            run([case()], [native(), native()])
        with self.assertRaisesRegex(ValueError, "duplicate catalog"):
            evaluate([case()], [], catalog_ids=["bias_a", "bias_a"])

    def test_missing_ids_invalid_origins_and_reference_schema(self):
        invalid_cases = [
            {"family_id": "f", "origin": "synthetic", "labels": {}},
            {"id": "c", "origin": "synthetic", "labels": {}},
            case(origin="model_labeled"), case(labels={"bias_a": "positive"}),
            case(labels={"bias_a": ["supported", "contextual"]}), case(labels=[]),
            case(evidence_adequacy={"bias_a": 1}), case(evidence_adequacy={"other": True}),
            case(text=None), case(label_version=""),
        ]
        for item in invalid_cases:
            with self.subTest(item=item), self.assertRaises(ValueError):
                run([item], [])
        with self.assertRaisesRegex(ValueError, "missing case_id"):
            run([case()], [{"status": "review_complete"}])
        with self.assertRaises(ValueError):
            run([case()], [{"case_id": "c1"}])

    def test_json_duplicate_classes_and_nonfinite_values_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            _parse_json('{"labels":{"bias_a":"supported","bias_a":"not_supported"}}')
        with self.assertRaisesRegex(ValueError, "duplicate JSON key"):
            _parse_json('{"c1":{},"c1":{}}')
        for constant in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(constant=constant), self.assertRaises(ValueError):
                _parse_json('{"x":' + constant + '}')

    def test_map_envelope_and_single_record_formats(self):
        c = case()
        payload = native(supported=["bias_a"])
        without_id = {key: value for key, value in payload.items() if key != "case_id"}
        formats = [payload, {"c1": without_id}, {"results": {"c1": without_id}},
                   {"results": [payload]}, [{"case_id": "c1", "result": without_id}],
                   {"c1": {"result": without_id}}]
        for results in formats:
            with self.subTest(results=results):
                self.assertEqual(human(run([c], results))["micro"]["binary_confusion"]["tp"], 1)
        with self.assertRaisesRegex(ValueError, "conflicting result IDs"):
            run([c], {"other": payload})
        with self.assertRaisesRegex(ValueError, "conflicting result IDs"):
            run([c], [{"case_id": "c1", "event": "other", "result": without_id}])

    def test_conflicting_predictions_and_duplicate_adjudications_rejected(self):
        bad = [native(supported=["bias_a"], suppressed=["bias_a"]),
               native(supported=["bias_a"], uncertain=["bias_a"]),
               native(supported=["bias_a", "bias_a"]),
               native(suppressed=["bias_a", "bias_a"]),
               native(supported=["bias_a"], supported_findings=[{"id": "bias_a"}])]
        # Last item is created separately because aliases need to disagree.
        bad[-1]["supported"] = []
        for result in bad:
            with self.subTest(result=result), self.assertRaises(ValueError):
                run([case()], [result])

    def test_unknown_execution_and_adjudication_statuses_are_not_negatives(self):
        report = run([case()], [native(status="provider_timeout")])
        self.assertEqual(report["case_results"][0]["targets"][0]["prediction"], "error")
        self.assertEqual(human(report)["execution"]["execution_failures"], 1)
        self.assertEqual(report["case_results"][0]["normalization_warnings"], [{"unknown_execution_status": "provider_timeout"}])
        report = run([case()], [native(adjudication=[{"card_id": "bias_a", "status": "not_observed"}])])
        self.assertEqual(report["case_results"][0]["targets"][0]["prediction"], "unassessed")
        self.assertEqual(human(report)["micro"]["binary_scored_target_rows"], 0)

    def test_macro_uses_only_defined_per_card_metrics(self):
        cases = [case("a1"), case("a2"), case("b", {"bias_b": "not_supported"}),
                 case("e", {"effect_a": "contextual"})]
        report = run(cases, [native("a1", supported=["bias_a"]), native("a2", suppressed=["bias_a"]),
                             native("b", suppressed=["bias_b"]), native("e", effects=["effect_a"])])
        macro = human(report)["macro"]
        self.assertEqual(macro["end_to_end_recall"], {"value": 0.5, "contributing_card_count": 1, "total_labeled_card_count": 3})
        self.assertEqual(macro["precision"]["contributing_card_count"], 1)
        self.assertEqual(human(report)["per_card"]["bias_b"]["reference_counts"]["not_supported"], 1)

    def test_unlabeled_findings_do_not_become_false_positives(self):
        report = run([case()], [native(supported=["bias_a", "bias_b", "unknown_card"])])
        self.assertEqual(human(report)["micro"]["binary_confusion"]["fp"], 0)
        self.assertEqual(human(report)["unlabeled_output_count"], 2)
        self.assertEqual(report["case_results"][0]["unlabeled_outputs"], [
            {"card_id": "bias_b", "prediction": "supported", "emitted_prediction": "supported", "taxonomy_supported": True},
            {"card_id": "unknown_card", "prediction": "unsupported", "emitted_prediction": "supported", "taxonomy_supported": False}])
        self.assertEqual(report["diagnostics"]["unsupported_taxonomy_targets"], [{
            "case_id": "c1", "card_id": "unknown_card", "prediction": "unsupported",
            "in_reference": False, "in_output": True, "selected": False}])

    def test_conflicting_evidence_aliases_and_null_offsets_are_invalid(self):
        finding = {"id": "bias_a", "evidence": [
            {"source": "text", "src": "context", "quote": "quote"},
            {"source": "text", "quote": "quote", "q": "other"},
            {"source": "text", "quote": "quote", "start_offsets": None, "end_offsets": None},
            {"source": "text", "quote": "quote", "start_offsets": [0], "end_offsets": [5], "start": 1, "end": 6},
        ]}
        report = run([case(text="quote")], [native(supported=[finding])])
        exact = report["case_results"][0]["targets"][0]["exact_evidence"]
        self.assertEqual(exact["invalid"], 4)
        self.assertEqual(exact["valid"], 0)

    def test_paired_family_comparison_is_descriptive_and_keeps_missing_baseline(self):
        cases = [case("a", family="fam"), case("b", family="fam"),
                 case("s", origin="synthetic", family="synthetic_family")]
        current = [native("a", supported=["bias_a"]), native("b", supported=["bias_a"]),
                   native("s", suppressed=["bias_a"])]
        baseline = [native("a", suppressed=["bias_a"]), native("s", supported=["bias_a"])]
        report = run(cases, current, baseline=baseline)
        comparison = report["paired_comparison"]
        fam = next(row for row in comparison["families"] if row["family_id"] == "fam")
        self.assertEqual(fam["case_rows"], 2)
        self.assertEqual(fam["baseline"]["end_to_end_recall"], 0.0)
        self.assertEqual(fam["current_minus_baseline"]["end_to_end_recall"], 1.0)
        self.assertEqual(fam["current_minus_baseline"]["completion_rate"], 0.5)
        self.assertEqual(fam["prediction_transitions"], {"missing -> supported": 1, "not_supported -> supported": 1})
        self.assertFalse(comparison["bootstrap_performed"])
        self.assertIsNone(comparison["p_values"])
        self.assertEqual(len(comparison["families"]), 2)

    def test_input_objects_are_not_mutated(self):
        cases = [case(evidence_adequacy={"bias_a": True})]
        results = {"c1": native(supported=[{"id": "bias_a", "evidence": [{"source": "text", "quote": "quote"}]}])}
        before = deepcopy((cases, results))
        report = run(cases, results, baseline=results)
        self.assertEqual((cases, results), before)
        self.assertEqual(report["algorithm_version"], ALGORITHM_VERSION)
        self.assertIn("Not", report["intended_claim"])
        self.assertIn("NIST certification", report["intended_claim"])
        json.dumps(report, allow_nan=False)

    def test_cli_writes_only_requested_report_with_baseline(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases_path, results_path, baseline_path, out = [root / name for name in ("cases.jsonl", "results.json", "baseline.json", "report.json")]
            cases_path.write_text(json.dumps(case(label_version="v1")) + "\n\n", encoding="utf-8")
            results_path.write_text(json.dumps([native(supported=["bias_a"])]), encoding="utf-8")
            baseline_path.write_text("[]", encoding="utf-8")
            original_files = {p: p.read_bytes() for p in (cases_path, results_path, baseline_path)}
            with patch("biasguard.validation._catalog", return_value=set(CATALOG)):
                self.assertEqual(main(["--cases", str(cases_path), "--results", str(results_path), "--out", str(out), "--baseline", str(baseline_path)]), 0)
            report = json.loads(out.read_text())
            self.assertEqual(human(report)["micro"]["end_to_end_recall"], 1.0)
            self.assertIn("paired_comparison", report)
            self.assertEqual(report["dataset"]["label_versions"], ["v1"])
            self.assertEqual(set(root.iterdir()), {cases_path, results_path, baseline_path, out})
            for path, content in original_files.items():
                self.assertEqual(path.read_bytes(), content)

    def test_cli_rejects_duplicate_json_and_input_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases_path, results_path, out = root / "cases.jsonl", root / "results.json", root / "report.json"
            cases_path.write_text('{"id":"c","family_id":"f","origin":"synthetic","labels":{"bias_a":"supported","bias_a":"not_supported"}}\n')
            results_path.write_text("[]")
            with self.assertRaisesRegex(ValueError, ":1:.*duplicate JSON key"):
                _load_cases(cases_path)
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                main(["--cases", str(cases_path), "--results", str(results_path), "--out", str(out)])
            self.assertEqual(error.exception.code, 2)
            self.assertFalse(out.exists())
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                main(["--cases", str(cases_path), "--results", str(results_path), "--out", str(cases_path)])


if __name__ == "__main__":
    unittest.main()
