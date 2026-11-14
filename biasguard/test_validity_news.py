"""Offline news-validity adapter checks; all writes are temporary fixtures.

    python -m unittest biasguard.test_news biasguard.test_validity_news -v

Guard integration cases require the parent-owned biasguard.validity module. They
skip explicitly while that module is not yet present; no provider/network calls
are made. Native reviewer results are injected at the adapter boundary.
"""
from __future__ import annotations

from copy import deepcopy
import gzip
import importlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

from biasguard import news
from biasguard.engine import BiasGuard


HEADLINE = "İstanbul için aynı başlık"
REVIEW_METADATA = {"algorithm": "news-validity-v1", "publication_status": "draft",
                   "verification_status": "needs_review", "review_required": True}


def _pack(path: Path, value: dict) -> None:
    path.write_bytes(gzip.compress(json.dumps(value, ensure_ascii=False).encode("utf-8")))


def _fixture(build: Path, lede: str | None = "  Spot\nsatırı  ") -> tuple[dict, dict, dict]:
    """A later A article must not replace A's actual first headline/URL."""
    core = {
        "meta": {"packs": {"months": ["2026-11"], "sources": ["A", "B", "C"]},
                 "v2": {"activeSet": ["A", "B", "C"]}},
        "S": [{"s": "A", "lean": 30}, {"s": "B", "lean": 70}],
        "E": [{"i": "e0", "t": "Olay başlığı", "f": "2026-11-01T09:00", "l": "2026-11-01T10:00",
               "s": ["A", "B"], "n": 3, "a": ["ha-later", "ha-first", "hb"]}],
    }
    articles = {
        "i": ["ha-later", "ha-first", "hb"], "s": [0, 0, 1],
        "t": ["Geç başlık", HEADLINE, HEADLINE],
        "d": ["2026-11-01T10:00", "2026-11-01T09:00", "2026-11-01T09:05"],
        "hosts": ["a.example", "b.example"], "h": [0, 0, 1],
        "u": ["actual-later", "actual-first?x=1&y=%C4%B0", "real-story"],
    }
    ledes = {"i": ["ha-first"], "l": [lede]}
    _pack(build / "core.bin", core)
    _pack(build / "a-2026-11.bin", articles)
    _pack(build / "l-2026-11.bin", ledes)
    return core, articles, ledes


def _native_result(item: dict, evidence: list[dict] | None = None, *, incomplete: bool = False) -> dict:
    """A local native-result fixture, never an API response or live run."""
    bg = BiasGuard()
    card = bg.cards[0]
    result = bg._base_output(item["text"], item["context"], "medium", [], news.MAX_CANDIDATES)
    result.update({
        "status": "analysis_incomplete" if incomplete else "review_complete",
        "candidate_ids": [c["id"] for c in bg.cards[:2]], "selected_card_count": 2,
        "assessed_card_count": 1 if incomplete else 2,
        "unassessed_card_count": len(bg.cards) - (1 if incomplete else 2),
        "retrieval_limited": True, "completion_limited": incomplete,
        "reviewer_outcomes": [], "adjudication": [], "rejected_evidence": [],
    })
    result["uncertain_findings"] = [{
        "id": card["id"], "name": card["name"], "status": "needs_context",
        "definition": card["definition"], "source_url": card["source_url"],
        "entry_type": card.get("entry_type", "bias"),
        "review_policy": card.get("review_policy", "bias_error_review"),
        "not_necessarily_an_error": card.get("review_policy") == "effect_context_only",
        "evidence": evidence or [{"source": "text", "quote": HEADLINE, "kind": "statement"}],
        "mechanisms": [], "alternative_explanations": [], "missing_context": [],
    }]
    return result


def _run_fixture(run: Path, item: dict, *, present: bool = True) -> None:
    (run / "inputs.jsonl").write_text(json.dumps(item, ensure_ascii=False) + "\n", encoding="utf-8")
    if present:
        (run / "selections").mkdir()
        (run / "selections" / "e0.json").write_text("{}", encoding="utf-8")


class SegmentTests(unittest.TestCase):
    def test_original_python_character_offsets_and_first_article_metadata(self):
        with tempfile.TemporaryDirectory() as d:
            build = Path(d)
            _fixture(build)
            item = news.event_inputs(build, 1)[0]
        expected = f"[A · 09:00] {HEADLINE} — Spot satırı\n[B · 09:05] {HEADLINE}"
        self.assertEqual(item["text"], expected)
        self.assertEqual(item["input_scope"], "headline_and_partial_lede")
        self.assertNotIn("full_article", item)
        self.assertNotIn("state", item)
        self.assertNotIn("evidence_capabilities", item)
        a, b = item["segments"]
        for segment, line in zip(item["segments"], expected.splitlines()):
            self.assertEqual(expected[segment["start"]:segment["end"]], line)
            self.assertEqual(expected[segment["headline_start"]:segment["headline_end"]], HEADLINE)
        self.assertEqual(a["start"], 0)
        self.assertEqual(a["headline_start"], len("[A · 09:00] "))
        self.assertEqual(expected[a["lede_start"]:a["lede_end"]], "Spot satırı")
        self.assertEqual(a["original_lede_length"], len("  Spot\nsatırı  "))
        self.assertFalse(a["lede_truncated"])
        self.assertEqual(b["start"], a["end"] + 1)
        self.assertIsNone(b["lede_start"])
        self.assertIsNone(b["lede_end"])
        self.assertEqual(a["article_id"], "ha-first")
        self.assertEqual(a["outlet"], "A")
        self.assertEqual(a["timestamp"], "2026-11-01T09:00")
        self.assertEqual(b["article_id"], "hb")

    def test_real_columnar_url_is_preserved_for_selected_article(self):
        with tempfile.TemporaryDirectory() as d:
            build = Path(d)
            _fixture(build)
            item = news.event_inputs(build, 1)[0]
        self.assertEqual(item["segments"][0]["url"], "https://a.example/actual-first?x=1&y=%C4%B0")
        self.assertEqual(item["segments"][1]["url"], "https://b.example/real-story")

    def test_absolute_url_field_is_retained_verbatim(self):
        with tempfile.TemporaryDirectory() as d:
            build = Path(d)
            _, articles, _ = _fixture(build)
            articles["u"][1] = "http://publisher.example/actual/path?exact=1#fragment"
            articles.pop("h")
            articles.pop("hosts")
            _pack(build / "a-2026-11.bin", articles)
            item = news.event_inputs(build, 1)[0]
        self.assertEqual(item["segments"][0]["url"], "http://publisher.example/actual/path?exact=1#fragment")
        self.assertIsNone(item["segments"][1]["url"])

    def test_missing_url_never_invents_one(self):
        for missing in ("u", "hosts", "h", "null"):
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as d:
                build = Path(d)
                _, articles, _ = _fixture(build)
                if missing == "null":
                    articles["u"] = [None, None, None]
                else:
                    articles.pop(missing)
                _pack(build / "a-2026-11.bin", articles)
                item = news.event_inputs(build, 1)[0]
                self.assertTrue(all(segment["url"] is None for segment in item["segments"]))

    def test_truncation_detects_boundary_and_original_length(self):
        for length in (news.LEDE_CHARS, news.LEDE_CHARS + 1):
            with self.subTest(length=length), tempfile.TemporaryDirectory() as d:
                build = Path(d)
                lede = "x" * length
                _fixture(build, lede)
                item = news.event_inputs(build, 1)[0]
                segment = item["segments"][0]
                displayed = item["text"][segment["lede_start"]:segment["lede_end"]]
                self.assertEqual(segment["original_lede_length"], length)
                self.assertEqual(segment["lede_truncated"], length > news.LEDE_CHARS)
                self.assertEqual(displayed, lede if length == news.LEDE_CHARS else "x" * news.LEDE_CHARS + " …")

    def test_missing_lede_pack_null_and_empty_have_absent_boundaries(self):
        for mode in ("missing", "null", "empty", "whitespace"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as d:
                build = Path(d)
                lede = {"missing": None, "null": None, "empty": "", "whitespace": " \n "}[mode]
                _fixture(build, lede)
                if mode == "missing":
                    (build / "l-2026-11.bin").unlink()
                item = news.event_inputs(build, 1)[0]
                for segment in item["segments"]:
                    self.assertIsNone(segment["lede_start"])
                    self.assertIsNone(segment["lede_end"])
                    self.assertFalse(segment["lede_truncated"])
                self.assertNotIn(" — ", item["text"])

    def test_malformed_top_rejected_before_reading_any_pack(self):
        for top in (0, -1, True, 1.5, "1", None):
            with self.subTest(top=top), mock.patch.object(news, "_load") as load:
                with self.assertRaises(ValueError):
                    news.event_inputs(Path("/not/a/real/build"), top)
                load.assert_not_called()

    def test_misaligned_lede_columns_rejected_not_silently_zipped(self):
        with tempfile.TemporaryDirectory() as d:
            build = Path(d)
            _fixture(build)
            _pack(build / "l-2026-11.bin", {"i": ["ha-first", "hb"], "l": ["one lede"]})
            with self.assertRaisesRegex(ValueError, "aligned"):
                news.event_inputs(build, 1)

    def test_malformed_article_columns_and_negative_source_index_rejected(self):
        for malformed in ("short_title", "negative_source"):
            with self.subTest(malformed=malformed), tempfile.TemporaryDirectory() as d:
                build = Path(d)
                _, articles, _ = _fixture(build)
                if malformed == "short_title":
                    articles["t"].pop()
                else:
                    articles["s"][0] = -1
                _pack(build / "a-2026-11.bin", articles)
                with self.assertRaises(ValueError):
                    news.event_inputs(build, 1)

    def test_context_preserves_format_and_discloses_collector_placement_limitations(self):
        with tempfile.TemporaryDirectory() as d:
            build = Path(d)
            _fixture(build)
            item = news.event_inputs(build, 1)[0]
        self.assertTrue(item["context"].startswith(
            "Olay: Olay başlığı\nİlk başlık: 2026-11-01T09:00 · son başlık: 2026-11-01T10:00 (Türkiye saati)\n"
            "Kurumlar ve verilen yerleşimler: A: sol (30); B: sağ (70)\nOlayı vermeyen etkin kurumlar: C\n"))
        self.assertIn("bağımsız olarak doğrulanmamıştır", item["context"])
        self.assertIn("davranış kanıtı değildir", item["context"])
        self.assertIn("Toplayıcı kaydındaki boşluklar", item["context"])
        self.assertIn("yayımlamadığının kanıtı değildir", item["context"])

    def test_cli_guard_flag_is_forwarded_to_apply(self):
        with tempfile.TemporaryDirectory() as d:
            run = Path(d)
            payload = {"summary": {}, "events": [], **REVIEW_METADATA}
            with mock.patch.object(sys, "argv", ["biasguard.news", "apply", "--run", d, "--guarded"]), \
                    mock.patch.object(news, "apply", return_value=payload) as apply, \
                    mock.patch("sys.stdout", new=io.StringIO()):
                news.main()
            apply.assert_called_once_with(run, guarded=True)
            self.assertEqual(json.loads((run / "biasguard.json").read_text()), payload)

    def test_cli_bad_top_rejected_without_creating_run(self):
        with tempfile.TemporaryDirectory() as d:
            run = Path(d) / "should-not-exist"
            with mock.patch.object(sys, "argv", ["biasguard.news", "inputs", "--run", str(run), "--top", "0"]), \
                    mock.patch("sys.stderr", new=io.StringIO()):
                with self.assertRaises(SystemExit):
                    news.main()
            self.assertFalse(run.exists())


class GuardedExportTests(unittest.TestCase):
    def setUp(self):
        try:
            self.validity = importlib.import_module("biasguard.validity")
        except ModuleNotFoundError as exc:
            if exc.name != "biasguard.validity":
                raise
            self.skipTest("parent-owned biasguard.validity is not yet available")

    def _export(self, *, evidence: list[dict] | None = None, incomplete: bool = False) -> tuple[dict, dict, dict]:
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            build = root / "build"
            run = root / "run"
            build.mkdir()
            run.mkdir()
            _fixture(build)
            item = news.event_inputs(build, 1)[0]
            native = _native_result(item, evidence, incomplete=incomplete)
            original = deepcopy(native)
            _run_fixture(run, item)
            with mock.patch.object(news.BiasGuard, "analyze", return_value=native), \
                    mock.patch.object(self.validity, "guard_news_result", wraps=self.validity.guard_news_result) as guard:
                payload = news.apply(run, guarded=True)
            guard.assert_called_once()
            self.assertEqual(guard.call_args.args[1], item)
            self.assertEqual(len(guard.call_args.args[2]), native["catalog_card_count"])
            self.assertEqual(native, original, "the guard must not mutate the original review result")
        return payload, item, native

    def test_guarded_coverage_pending_marker_audit_and_card_policy_retained(self):
        payload, _, native = self._export()
        for key, value in REVIEW_METADATA.items():
            self.assertEqual(payload["metadata"][key], value)
        event = payload["events"][0]
        for key in news._COVERAGE_FIELDS:
            self.assertEqual(event[key], native[key])
            self.assertEqual(event["coverage"][key], native[key])
        self.assertEqual(payload["summary"]["coverage"]["unassessed_card_count"], native["unassessed_card_count"])
        self.assertIn("validity_gate", event)
        self.assertEqual(len(event["eligibility"]), native["selected_card_count"])
        self.assertTrue(all(not card["observable"] for card in event["eligibility"]))
        self.assertEqual(event["validity_gate"]["available_capabilities"], [])
        self.assertEqual(event["audit"]["validity_algorithm"], "news-validity-v1")
        for key in ("text_sha256", "context_sha256", "card_hash_sha256", "prompts_version"):
            self.assertEqual(event["audit"][key], native["audit"][key])
        self.assertEqual(event["input_scope"], "headline_and_partial_lede")
        finding = event["uncertain"][0]
        for key in ("entry_type", "review_policy", "not_necessarily_an_error"):
            self.assertEqual(finding[key], native["uncertain_findings"][0][key])
        self.assertEqual(payload["summary"]["completed"], 1)

    def test_incomplete_export_keeps_completion_and_unassessed_distinct(self):
        payload, _, native = self._export(incomplete=True)
        event = payload["events"][0]
        self.assertEqual(event["status"], "analysis_incomplete")
        self.assertTrue(event["completion_limited"])
        self.assertEqual(event["assessed_card_count"], native["assessed_card_count"])
        self.assertEqual(payload["summary"]["completed"], 0)
        self.assertEqual(payload["summary"]["incomplete"], 1)

    def test_repeated_and_cross_line_evidence_keeps_all_attributed_occurrences(self):
        with tempfile.TemporaryDirectory() as d:
            build = Path(d)
            _fixture(build)
            item = news.event_inputs(build, 1)[0]
        cross_line = "Spot satırı\n[B · 09:05] " + HEADLINE
        evidence = [{"source": "text", "quote": HEADLINE, "kind": "statement"},
                    {"source": "text", "quote": cross_line, "kind": "statement"}]
        payload, _, _ = self._export(evidence=evidence)
        quotes = payload["events"][0]["uncertain"][0]["evidence"]
        repeated, cross = quotes
        self.assertEqual(repeated["q"], HEADLINE)
        self.assertEqual(repeated["src"], "text")
        self.assertEqual(repeated["kind"], "statement")
        self.assertEqual(repeated["o"], ["A", "B"])
        self.assertEqual(len(repeated["occurrences"]), 2)
        self.assertEqual(cross["q"], cross_line)
        self.assertEqual(cross["o"], ["A", "B"])
        self.assertEqual(len(cross["occurrences"]), 1)
        for exported in quotes:
            for occurrence in exported["occurrences"]:
                self.assertEqual(item["text"][occurrence["start"]:occurrence["end"]], exported["q"])
                for article in occurrence["articles"]:
                    self.assertEqual(article["url_verification"], "provided_not_network_checked")
        self.assertEqual(cross["occurrences"][0]["articles"][0]["article_id"], "ha-first")
        self.assertEqual(cross["occurrences"][0]["articles"][1]["url"], "https://b.example/real-story")

    def test_guard_downgrades_supported_fixture_and_preserves_validity_details(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _fixture(root)
            item = news.event_inputs(root, 1)[0]
            native = _native_result(item)
            finding = native["uncertain_findings"].pop()
            finding["status"] = "pattern_supported"
            native["supported_findings"].append(finding)
            _run_fixture(root, item)
            with mock.patch.object(news.BiasGuard, "analyze", return_value=native):
                payload = news.apply(root, guarded=True)
        event = payload["events"][0]
        self.assertEqual(event["supported"], [])
        guarded_finding = event["uncertain"][0]
        self.assertEqual(guarded_finding["status"], "needs_context")
        self.assertEqual(guarded_finding["original_status"], "pattern_supported")
        self.assertEqual(guarded_finding["validity"]["algorithm"], "news-validity-v1")
        self.assertTrue(guarded_finding["validity"]["missing_capabilities"])
        self.assertEqual(len(event["validity_gate"]["downgraded"]), 1)
        self.assertEqual(payload["summary"]["supported"], 0)

    def test_not_attempted_is_guarded_with_zero_assessment_and_full_unassessed_count(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _fixture(root)
            item = news.event_inputs(root, 1)[0]
            _run_fixture(root, item, present=False)
            with mock.patch.object(news.BiasGuard, "analyze") as analyze:
                payload = news.apply(root, guarded=True)
            analyze.assert_not_called()
        event = payload["events"][0]
        self.assertEqual(event["status"], "not_attempted")
        self.assertEqual(event["selected_card_count"], 0)
        self.assertEqual(event["assessed_card_count"], 0)
        self.assertEqual(event["unassessed_card_count"], event["catalog_card_count"])
        self.assertTrue(event["completion_limited"])
        self.assertIn("validity_gate", event)
        self.assertEqual(payload["summary"]["notAttempted"], 1)

    def test_default_apply_does_not_call_guard_or_change_legacy_export(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            _fixture(root)
            item = news.event_inputs(root, 1)[0]
            _run_fixture(root, item)
            with mock.patch.object(news.BiasGuard, "analyze", return_value=_native_result(item)), \
                    mock.patch.object(self.validity, "guard_news_result") as guard:
                payload = news.apply(root)
            guard.assert_not_called()
        self.assertEqual(set(payload), {"summary", "events"})
        self.assertNotIn("coverage", payload["summary"])
        self.assertNotIn("validity_gate", payload["events"][0])
        self.assertNotIn("occurrences", payload["events"][0]["uncertain"][0]["evidence"][0])
        self.assertNotIn("entry_type", payload["events"][0]["uncertain"][0])

    def test_pack_rejects_guarded_payload_before_core_is_read_or_written(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "biasguard.json").write_text(json.dumps({"events": [], "summary": {}, "metadata": REVIEW_METADATA}))
            core_path = root / "core.bin"
            sentinel = b"not-a-real-public-pack: must remain untouched"
            core_path.write_bytes(sentinel)
            with mock.patch.object(sys, "argv", ["biasguard.news", "pack", "--run", d, "--build", d]), \
                    mock.patch.object(news, "_load") as load, \
                    mock.patch.object(news, "merge_explain") as merge:
                with self.assertRaises(ValueError):
                    news.main()
            load.assert_not_called()
            merge.assert_not_called()
            self.assertEqual(core_path.read_bytes(), sentinel)

    def test_legacy_publication_payload_remains_allowed(self):
        self.validity.ensure_publication_allowed({"summary": {"completed": 1}, "events": []})


if __name__ == "__main__":
    unittest.main()
