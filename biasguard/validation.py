"""Offline, reference-led evaluation of BiasGuard results (standard library only).

Usage::

    python -m biasguard.validation --cases CASES.jsonl --results RESULTS.json \
        --out REPORT.json [--baseline BASELINE.json]

CASES.jsonl contains one object per nonblank line, for example::

    {"id":"event-1","family_id":"cluster-1","origin":"human_reviewed",
     "label_version":"review-1","labels":{"confirmation-bias":"supported"},
     "evidence_adequacy":{"confirmation-bias":true},"text":"Exact source text"}

Required fields: nonempty string id and family_id; origin is exactly synthetic or
human_reviewed; labels maps detector card IDs to supported, not_supported,
uncertain, contextual, or ineligible. Empty labels are allowed for execution-only
cases. Optional label_version is a nonempty string. Optional text/context are
original strings. Optional evidence_adequacy maps a subset of labeled IDs to
true/false/null, assigned by an INDEPENDENT reviewer. It is never inferred from
quotes, reviewer verdicts, routing, or execution success. Unknown detector IDs
are reported as unsupported taxonomy, not scored as negatives or misses.

RESULTS.json accepts exactly these container forms:
* {"events": [record, ...], ...}: repository news export, IDs in event;
* [record, ...]: native/slim records, IDs in case_id, id, or event;
* {"results": [record, ...]} or {"results": {case_id: record, ...}};
* {case_id: record, ...}: an ID-keyed map, whose keys supply missing record IDs;
* a single record with case_id/id/event AND status (or a result envelope).
A record may be {"case_id": "...", "result": native_result}. All present ID
aliases/map keys must agree. Each payload requires a string status. Only
review_complete is completed. analysis_incomplete, input_rejected, error, failed,
not_attempted and offline_candidates_only remain distinct; any other status is
an unrecognized execution status, never a success or true negative.

Native result lists are supported_findings, uncertain_findings, contextual_effects;
news aliases are supported, uncertain, effects. Entries are objects with id or
card_id. Optional adjudication is an array of card_id/id + status objects:
pattern_supported -> supported; suppressed -> not_supported;
reviewer_disagreement/needs_context -> uncertain;
contextual_effect_consensus -> contextual. Canonical supported/not_supported/
uncertain/contextual are also accepted as adjudication statuses. Unknown statuses
are unassessed and reported. Repeated or conflicting target classes are rejected.
Only explicit suppressed/not_supported adjudication establishes a negative.
Selected IDs and aggregate assessed counts NEVER establish per-target negatives.
Coverage fields are copied into case_results for auditing, not used to fill labels.

Evidence entries may use native source/quote or slim src/q. Optional native
start_offsets/end_offsets (paired arrays) or start/end (scalars) are checked as
zero-based, end-exclusive character positions. Checks verify supplied quotations
and positions only, not semantic truth, attribution adequacy, or bias mechanisms.

Binary confusion counts use known, resolved supported/not_supported references
and completed, decisive supported/not_supported predictions ONLY. Conditional
recall excludes abstentions/unassessed/execution failures; end-to-end recall uses
EVERY known supported reference, counting all non-supported outcomes as missed.
Contextual, uncertain and ineligible references are outside binary confusion;
assertions against them and contextual-to-harm routing failures are reported.
Precision with no eligible positive predictions and recall with no eligible gold
positives are null. Micro counts are target rows; macro averages only defined
per-card metrics and expose contributing-card counts. Repeated family rows are
not independent samples. Origins are never pooled into a real-accuracy estimate.

Evidence-supported positive precision is (supported reference AND independently
adequate evidence) / all known labeled supported assertions. It is null unless
at least one assertion exists AND every such assertion has a non-null independent
annotation. That is a computability threshold, not a sample-size validity claim.

API: evaluate(cases, results, catalog_ids=None, *, baseline=None). catalog_ids is
an explicit iterable of operational detector IDs for deterministic tests. By
default only IDs in the local data/cards.json resource are used, never the source
index or educational simulator. Duplicate JSON keys are rejected by CLI loading;
invalid schemas/duplicate IDs raise ValueError in the API. Unknown result IDs are
reported separately, never silently added as negative controls. Baseline comparison
is paired by case/family within each origin, descriptive only: no bootstrap,
invented p-values, confidence intervals, or causal superiority claims.

The evaluator makes no LLM/API calls, database actions, public updates, or NIST
certification claim. The only write is the explicitly requested report file.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
from typing import Any, Iterable

ALGORITHM_VERSION = "biasguard-offline-validation/1.0.0"
ORIGINS = ("synthetic", "human_reviewed")
LABELS = ("supported", "not_supported", "uncertain", "contextual", "ineligible")
_DECISIVE = {"supported", "not_supported"}
_STATUS_CLASSES = {
    "pattern_supported": "supported", "supported": "supported",
    "suppressed": "not_supported", "not_supported": "not_supported",
    "reviewer_disagreement": "uncertain", "needs_context": "uncertain",
    "uncertain": "uncertain", "contextual_effect_consensus": "contextual",
    "contextual": "contextual",
}
_EXECUTION_STATUSES = {
    "review_complete", "analysis_incomplete", "input_rejected", "error", "failed",
    "not_attempted", "offline_candidates_only",
}
_BUCKETS = (
    ("supported_findings", "supported", "supported"),
    ("uncertain_findings", "uncertain", "uncertain"),
    ("contextual_effects", "effects", "contextual"),
)
_COVERAGE_KEYS = (
    "selected", "selected_card_ids", "candidate_ids", "selected_card_count", "assessed_card_count",
    "unassessed_card_count", "catalog_card_count", "selected_count", "assessed_count",
    "unassessed_count", "retrieval_limited", "completion_limited", "coverage",
)
_METRICS = ("precision", "conditional_recall", "end_to_end_recall")


def _identifier(value: Any, description: str) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise ValueError(f"{description} must be a nonempty, unpadded string")
    return value


def _catalog(catalog_ids: Iterable[str] | None) -> set[str]:
    if catalog_ids is None:
        # Read only the operational resource; importing the engine is unnecessary.
        resource = Path(__file__).with_name("data") / "cards.json"
        cards = _load_json(resource)
        if not isinstance(cards, list):
            raise ValueError("local operational catalog must be an array")
        values = [card["id"] for card in cards]
    else:
        if isinstance(catalog_ids, (str, bytes, dict)):
            raise ValueError("catalog_ids must be an iterable of detector ID strings")
        values = list(catalog_ids)
    ids = [_identifier(value, "catalog ID") for value in values]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate catalog IDs")
    return set(ids)


def _validate_cases(cases: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    if isinstance(cases, (str, bytes, dict)):
        raise ValueError("cases must be an iterable of case objects")
    output = []
    seen: set[str] = set()
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            raise ValueError(f"case {index} must be an object")
        cid = _identifier(case.get("id"), f"case {index} id")
        if cid in seen:
            raise ValueError(f"duplicate case id (possibly conflicting reference classes): {cid}")
        seen.add(cid)
        _identifier(case.get("family_id"), f"case {cid} family_id")
        if case.get("origin") not in ORIGINS:
            raise ValueError(f"case {cid} has unknown origin")
        labels = case.get("labels")
        if not isinstance(labels, dict):
            raise ValueError(f"case {cid} labels must be a card-ID to class mapping")
        for card_id, label in labels.items():
            _identifier(card_id, f"case {cid} label card ID")
            if not isinstance(label, str) or label not in LABELS:
                raise ValueError(f"case {cid} has invalid/conflicting reference class for {card_id}")
        adequacy = case.get("evidence_adequacy", {})
        if not isinstance(adequacy, dict):
            raise ValueError(f"case {cid} evidence_adequacy must be a mapping")
        for card_id, value in adequacy.items():
            if card_id not in labels:
                raise ValueError(f"case {cid} adequacy has an unlabeled target: {card_id}")
            if value is not None and type(value) is not bool:
                raise ValueError(f"case {cid} adequacy for {card_id} must be true, false, or null")
        for field in ("text", "context"):
            if field in case and not isinstance(case[field], str):
                raise ValueError(f"case {cid} {field} must be a string")
        if "label_version" in case:
            _identifier(case["label_version"], f"case {cid} label_version")
        output.append(case)
    return output


def _agree_ids(record: dict[str, Any], supplied: str | None = None) -> str:
    values = [record[key] for key in ("case_id", "id", "event") if key in record]
    if supplied is not None:
        values.append(supplied)
    if not values:
        raise ValueError("result record is missing case_id/id/event")
    ids = [_identifier(value, "result ID") for value in values]
    if len(set(ids)) != 1:
        raise ValueError(f"conflicting result IDs: {ids}")
    return ids[0]


def _result_items(results: Any) -> list[tuple[str, dict[str, Any]]]:
    if isinstance(results, dict):
        if "events" in results:
            records = results["events"]
            if not isinstance(records, list):
                raise ValueError("news events must be an array")
        elif "results" in results:
            return _result_items(results["results"])
        elif ("status" in results or "result" in results) and any(
            key in results for key in ("case_id", "id", "event")
        ):
            records = [results]
        else:
            records = list(results.items())
    elif isinstance(results, list):
        records = results
    else:
        raise ValueError("results must be a result array, news export, or ID-keyed map")
    output = []
    seen: set[str] = set()
    for record in records:
        supplied = None
        if isinstance(record, tuple):
            supplied, record = record
            _identifier(supplied, "result map key")
        if not isinstance(record, dict):
            raise ValueError("each result must be an object")
        cid = _agree_ids(record, supplied)
        payload = record.get("result", record)
        if not isinstance(payload, dict):
            raise ValueError(f"result {cid} payload must be an object")
        if payload is not record and any(key in payload for key in ("case_id", "id", "event")):
            _agree_ids(payload, cid)
        if cid in seen:
            raise ValueError(f"duplicate result ID: {cid}")
        seen.add(cid)
        _identifier(payload.get("status"), f"result {cid} status")
        output.append((cid, payload))
    return output


def _target_id(item: Any, description: str) -> str:
    if not isinstance(item, dict):
        raise ValueError(f"{description} must be an object")
    ids = [item[key] for key in ("card_id", "id") if key in item]
    if not ids:
        raise ValueError(f"{description} needs card_id/id")
    for value in ids:
        _identifier(value, f"{description} card ID")
    if len(set(ids)) != 1:
        raise ValueError(f"{description} has conflicting card IDs")
    return ids[0]


def _normalize(cid: str, payload: dict[str, Any]) -> dict[str, Any]:
    states: dict[str, str] = {}
    evidence: dict[str, list[dict[str, Any]]] = {}
    finding_ids: set[str] = set()
    warnings = []
    for native, slim, state in _BUCKETS:
        if native in payload and slim in payload and payload[native] != payload[slim]:
            raise ValueError(f"result {cid} conflicts between {native} and {slim}")
        entries = payload.get(native, payload.get(slim, []))
        if not isinstance(entries, list):
            raise ValueError(f"result {cid} {native}/{slim} must be an array")
        for finding in entries:
            card_id = _target_id(finding, f"result {cid} finding")
            if card_id in finding_ids:
                raise ValueError(f"result {cid} repeats/conflicts on finding {card_id}")
            finding_ids.add(card_id)
            states[card_id] = state
            quotes = finding.get("evidence", [])
            if not isinstance(quotes, list) or not all(isinstance(q, dict) for q in quotes):
                raise ValueError(f"result {cid} evidence for {card_id} must be an object array")
            evidence[card_id] = quotes
    adjudication = payload.get("adjudication", [])
    if not isinstance(adjudication, list):
        raise ValueError(f"result {cid} adjudication must be an array")
    adjudicated: set[str] = set()
    for entry in adjudication:
        card_id = _target_id(entry, f"result {cid} adjudication")
        if card_id in adjudicated:
            raise ValueError(f"result {cid} has duplicate adjudication for {card_id}")
        adjudicated.add(card_id)
        status = entry.get("status")
        if not isinstance(status, str):
            raise ValueError(f"result {cid} adjudication status must be a string")
        state = _STATUS_CLASSES.get(status)
        if state is None:
            warnings.append({"card_id": card_id, "unknown_adjudication_status": status})
            # A positive list is itself an explicit assertion; unknown adjudication
            # cannot silently turn it into a negative or erase it.
            states.setdefault(card_id, "unassessed")
        elif card_id in states and states[card_id] != state:
            raise ValueError(f"result {cid} has conflicting prediction classes for {card_id}")
        else:
            states[card_id] = state
    aliases = [payload[key] for key in ("selected_card_ids", "selected", "candidate_ids") if key in payload]
    selected = aliases[0] if aliases else []
    if any((value or []) != (selected or []) for value in aliases):
        raise ValueError(f"result {cid} has conflicting selected IDs")
    selection = payload.get("selection")
    if isinstance(selection, dict) and "selected_card_ids" in selection:
        if aliases and (selected or []) != selection["selected_card_ids"]:
            raise ValueError(f"result {cid} has conflicting selected IDs")
        selected = selection["selected_card_ids"]
    if selected is None:
        selected = []
    if not isinstance(selected, list):
        raise ValueError(f"result {cid} selected IDs must be an array")
    selected_ids = [_identifier(value, f"result {cid} selected ID") for value in selected]
    if len(set(selected_ids)) != len(selected_ids):
        raise ValueError(f"result {cid} has duplicate selected IDs")
    status = payload["status"]
    if status not in _EXECUTION_STATUSES:
        warnings.append({"unknown_execution_status": status})
    coverage = {key: payload[key] for key in _COVERAGE_KEYS if key in payload}
    if isinstance(selection, dict):
        coverage["selection"] = selection
    return {
        "id": cid, "status": status, "completed": status == "review_complete",
        "states": states, "evidence": evidence, "selected_ids": set(selected_ids),
        "reported_coverage": coverage, "warnings": warnings,
    }


def _exact_evidence(case: dict[str, Any], quotes: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter({"valid": 0, "invalid": 0, "unavailable": 0})
    checks = []
    for index, evidence in enumerate(quotes):
        source = evidence.get("source", evidence.get("src"))
        quote = evidence.get("quote", evidence.get("q"))
        state, reason = "valid", "exact original-field quotation"
        conflicting_aliases = (
            "source" in evidence and "src" in evidence and evidence["source"] != evidence["src"]
        ) or (
            "quote" in evidence and "q" in evidence and evidence["quote"] != evidence["q"]
        )
        if conflicting_aliases:
            state, reason = "invalid", "conflicting native/slim quotation aliases"
        elif source not in ("text", "context") or not isinstance(quote, str) or not quote.strip():
            state, reason = "invalid", "missing/invalid source or quotation"
        elif source not in case:
            state, reason = "unavailable", "original source field not supplied in case"
        elif quote not in case[source]:
            state, reason = "invalid", "quotation not exact in declared original field"
        else:
            starts = evidence.get("start_offsets")
            ends = evidence.get("end_offsets")
            has_offsets = "start_offsets" in evidence or "end_offsets" in evidence
            if "start" in evidence or "end" in evidence:
                scalar_starts, scalar_ends = [evidence.get("start")], [evidence.get("end")]
                if has_offsets:
                    if starts != scalar_starts or ends != scalar_ends:
                        state, reason = "invalid", "conflicting scalar and array offsets"
                else:
                    starts, ends = scalar_starts, scalar_ends
                has_offsets = True
            if has_offsets:
                valid_pairs = (
                    isinstance(starts, list) and isinstance(ends, list)
                    and bool(starts) and len(starts) == len(ends)
                    and all(type(a) is int and type(b) is int
                            and 0 <= a < b <= len(case[source])
                            and case[source][a:b] == quote
                            for a, b in zip(starts, ends))
                )
                if not valid_pairs:
                    state, reason = "invalid", "offsets do not exactly locate quotation"
        counts[state] += 1
        checks.append({"index": index, "state": state, "reason": reason})
    return {**dict(counts), "no_quotes": not quotes, "checks": checks,
            "claim": "Exactness/positions only; not semantic truth or independent adequacy."}


def _prediction(result: dict[str, Any] | None, card_id: str, known: bool) -> str:
    if not known:
        return "unsupported"
    if result is None:
        return "missing"
    if result["status"] == "not_attempted":
        return "not_attempted"
    if result["status"] == "offline_candidates_only":
        return "unassessed"
    if not result["completed"]:
        return "error"
    return result["states"].get(card_id, "unassessed")


def _case_rows(cases: list[dict[str, Any]], results: dict[str, dict[str, Any]], catalog: set[str]) -> list[dict[str, Any]]:
    output = []
    for case in cases:
        cid = case["id"]
        result = results.get(cid)
        targets = []
        for card_id, reference in sorted(case["labels"].items()):
            known = card_id in catalog
            prediction = _prediction(result, card_id, known)
            annotation = case.get("evidence_adequacy", {})
            adequacy = annotation.get(card_id)
            targets.append({
                "card_id": card_id, "reference": reference, "taxonomy_supported": known,
                "prediction": prediction,
                "emitted_prediction": result["states"].get(card_id) if result else None,
                "selected": card_id in result["selected_ids"] if result else False,
                "independent_evidence_adequacy": adequacy,
                "adequacy_annotation": ("adequate" if adequacy is True else
                                        "inadequate" if adequacy is False else
                                        "unresolved" if card_id in annotation else "missing"),
                "exact_evidence": _exact_evidence(case, result["evidence"].get(card_id, []) if result else []),
            })
        output.append({
            "id": cid, "family_id": case["family_id"], "origin": case["origin"],
            "label_version": case.get("label_version"),
            "status": result["status"] if result else "missing_result",
            "completed": bool(result and result["completed"]), "targets": targets,
            "reported_coverage": result["reported_coverage"] if result else {},
            "normalization_warnings": result["warnings"] if result else [],
            "unlabeled_outputs": [
                {"card_id": card_id, "prediction": state if card_id in catalog else "unsupported",
                 "emitted_prediction": state, "taxonomy_supported": card_id in catalog}
                for card_id, state in sorted(result["states"].items())
                if card_id not in case["labels"]
            ] if result else [],
        })
    return output


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _target_summary(targets: list[dict[str, Any]]) -> dict[str, Any]:
    confusion = Counter({"tp": 0, "fp": 0, "tn": 0, "fn": 0})
    reference_counts = Counter({label: 0 for label in LABELS})
    predictions: Counter[str] = Counter()
    by_reference = {label: Counter() for label in LABELS}
    missed: Counter[str] = Counter()
    overassertions = Counter({label: 0 for label in ("uncertain", "contextual", "ineligible")})
    annotations = Counter({"adequate": 0, "inadequate": 0, "unresolved": 0, "missing": 0})
    integrity = Counter({"valid": 0, "invalid": 0, "unavailable": 0, "targets_without_quotes": 0})
    known_count = gold_positive_count = asserted_count = joint_evidence_tp = unsupported = 0
    for target in targets:
        ref, pred = target["reference"], target["prediction"]
        reference_counts[ref] += 1
        predictions[pred] += 1
        by_reference[ref][pred] += 1
        if not target["taxonomy_supported"]:
            unsupported += 1
            continue
        known_count += 1
        exact = target["exact_evidence"]
        for key in ("valid", "invalid", "unavailable"):
            integrity[key] += exact[key]
        integrity["targets_without_quotes"] += int(exact["no_quotes"])
        if ref in _DECISIVE and pred in _DECISIVE:
            key = ("tp" if pred == "supported" else "fn") if ref == "supported" else (
                "fp" if pred == "supported" else "tn")
            confusion[key] += 1
        if ref == "supported":
            gold_positive_count += 1
            if pred != "supported":
                missed[pred] += 1
        if pred == "supported":
            asserted_count += 1
            annotations[target["adequacy_annotation"]] += 1
            if ref == "supported" and target["independent_evidence_adequacy"] is True:
                joint_evidence_tp += 1
            if ref in overassertions:
                overassertions[ref] += 1
    precision_denominator = confusion["tp"] + confusion["fp"]
    recall_denominator = confusion["tp"] + confusion["fn"]
    complete_annotations = asserted_count > 0 and not (annotations["missing"] or annotations["unresolved"])
    return {
        "target_rows": len(targets), "known_taxonomy_target_rows": known_count,
        "unsupported_taxonomy_target_rows": unsupported,
        "reference_counts": dict(reference_counts), "prediction_counts": dict(sorted(predictions.items())),
        "predictions_by_reference": {label: dict(sorted(counts.items())) for label, counts in by_reference.items()},
        "binary_confusion": dict(confusion),
        "binary_scored_target_rows": sum(confusion.values()),
        "binary_reference_nondecisive_target_rows": sum(
            t["taxonomy_supported"] and t["reference"] in _DECISIVE and t["prediction"] not in _DECISIVE
            for t in targets),
        "precision": _ratio(confusion["tp"], precision_denominator),
        "precision_denominator": precision_denominator,
        "conditional_recall": _ratio(confusion["tp"], recall_denominator),
        "conditional_recall_denominator": recall_denominator,
        "end_to_end_recall": _ratio(confusion["tp"], gold_positive_count),
        "end_to_end_recall_denominator": gold_positive_count,
        "end_to_end_missed_positives": sum(missed.values()),
        "missed_positives_by_prediction": dict(sorted(missed.items())),
        "supported_assertions_on_known_labeled_targets": asserted_count,
        "overassertions_outside_binary": dict(overassertions),
        "overassertions_outside_binary_total": sum(overassertions.values()),
        "contextual_effect_harm_routing_failures": overassertions["contextual"],
        "independent_evidence_annotations_on_assertions": dict(annotations),
        "evidence_supported_positive_precision": _ratio(joint_evidence_tp, asserted_count) if complete_annotations else None,
        "evidence_supported_positive_precision_numerator": joint_evidence_tp,
        "evidence_supported_positive_precision_denominator": asserted_count,
        "evidence_supported_positive_precision_computable": complete_annotations,
        "evidence_annotation_requirement": "At least 1 assertion; complete non-null independent adequacy annotations for all known labeled supported assertions. Not a statistical sufficiency threshold.",
        "exact_evidence_integrity": dict(integrity),
    }


def _execution_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(row["status"] for row in rows)
    completed = sum(row["completed"] for row in rows)
    families = Counter(row["family_id"] for row in rows)
    return {
        "case_attempt_rows": len(rows), "completed": completed,
        "completion_rate": _ratio(completed, len(rows)), "completion_denominator": len(rows),
        "status_counts": dict(sorted(counts.items())),
        "execution_failures": sum(value for status, value in counts.items()
                                  if status not in {"review_complete", "missing_result", "not_attempted", "offline_candidates_only"}),
        "missing_results": counts["missing_result"], "not_attempted": counts["not_attempted"],
        "offline_retrieval_only": counts["offline_candidates_only"],
        "family_count": len(families), "repeated_family_rows": len(rows) - len(families),
        "rows_per_family": dict(sorted(families.items())),
    }


def _origin_report(rows: list[dict[str, Any]]) -> dict[str, Any]:
    targets = [target for row in rows for target in row["targets"]]
    by_card: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for target in targets:
        by_card[target["card_id"]].append(target)
    per_card = {card_id: _target_summary(items) for card_id, items in sorted(by_card.items())}
    macro = {}
    for metric in (*_METRICS, "evidence_supported_positive_precision"):
        values = [item[metric] for item in per_card.values() if item[metric] is not None]
        macro[metric] = {
            "value": sum(values) / len(values) if values else None,
            "contributing_card_count": len(values), "total_labeled_card_count": len(per_card),
        }
    return {
        "execution": _execution_summary(rows), "micro": _target_summary(targets),
        "per_card": per_card, "macro": macro,
        "unlabeled_output_count": sum(len(row["unlabeled_outputs"]) for row in rows),
        "note": "Target-row micro counts and unweighted defined per-card macro means; family repeats are not independent evidence.",
    }


def _paired_report(current: list[dict[str, Any]], baseline: list[dict[str, Any]]) -> dict[str, Any]:
    families = []
    for origin in ORIGINS:
        family_ids = sorted({row["family_id"] for row in current if row["origin"] == origin})
        for family_id in family_ids:
            now = [row for row in current if row["origin"] == origin and row["family_id"] == family_id]
            before = [row for row in baseline if row["origin"] == origin and row["family_id"] == family_id]
            now_metrics = _target_summary([t for r in now for t in r["targets"]])
            old_metrics = _target_summary([t for r in before for t in r["targets"]])
            now_exec, old_exec = _execution_summary(now), _execution_summary(before)
            transitions: Counter[str] = Counter()
            old_by_id = {row["id"]: row for row in before}
            for row in now:
                old_targets = {t["card_id"]: t for t in old_by_id[row["id"]]["targets"]}
                for target in row["targets"]:
                    transitions[f"{old_targets[target['card_id']]['prediction']} -> {target['prediction']}"] += 1
            metric_names = (*_METRICS, "end_to_end_missed_positives", "contextual_effect_harm_routing_failures")
            current_values = {name: now_metrics[name] for name in metric_names}
            baseline_values = {name: old_metrics[name] for name in metric_names}
            current_values["completion_rate"] = now_exec["completion_rate"]
            baseline_values["completion_rate"] = old_exec["completion_rate"]
            families.append({
                "origin": origin, "family_id": family_id, "case_rows": len(now),
                "case_ids": [row["id"] for row in now],
                "current": current_values, "baseline": baseline_values,
                "current_minus_baseline": {
                    name: current_values[name] - baseline_values[name]
                    if current_values[name] is not None and baseline_values[name] is not None else None
                    for name in current_values
                },
                "prediction_transitions": dict(sorted(transitions.items())),
            })
    return {
        "claim": "Observed paired per-family differences only, within each origin; not causal, inferential, or evidence of statistical superiority.",
        "pairing": "Same case IDs/references in both runs. Missing/error baseline outputs remain in denominators.",
        "unique_family_count": len({row["family_id"] for row in current}),
        "origin_family_group_count": len(families), "families": families,
        "bootstrap_performed": False, "p_values": None,
    }


def evaluate(cases: Iterable[dict[str, Any]], results: Any, catalog_ids: Iterable[str] | None = None,
             *, baseline: Any = None) -> dict[str, Any]:
    """Return a JSON-serializable offline report; raise ValueError on invalid input.

    No input object is modified. catalog_ids=None reads only local operational IDs.
    Passing baseline enables a descriptive same-case, same-family comparison.
    """
    cases = _validate_cases(cases)
    catalog = _catalog(catalog_ids)
    normalized = {cid: _normalize(cid, payload) for cid, payload in _result_items(results)}
    case_ids = {case["id"] for case in cases}
    unknown_results = [
        {"id": cid, "status": result["status"], "completed": result["completed"],
         "output_card_ids": sorted(result["states"]), "normalization_warnings": result["warnings"]}
        for cid, result in sorted(normalized.items()) if cid not in case_ids
    ]
    rows = _case_rows(cases, normalized, catalog)
    family_origins: dict[str, set[str]] = defaultdict(set)
    for case in cases:
        family_origins[case["family_id"]].add(case["origin"])
    unsupported_targets = []
    cases_by_id = {case["id"]: case for case in cases}
    for cid in sorted(case_ids | set(normalized)):
        case = cases_by_id.get(cid)
        result = normalized.get(cid)
        references = set(case["labels"]) if case else set()
        outputs = set(result["states"]) if result else set()
        selected = result["selected_ids"] if result else set()
        for card_id in sorted((references | outputs | selected) - catalog):
            unsupported_targets.append({
                "case_id": cid, "card_id": card_id, "prediction": "unsupported",
                "in_reference": card_id in references, "in_output": card_id in outputs,
                "selected": card_id in selected,
            })
    report = {
        "algorithm_version": ALGORITHM_VERSION,
        "intended_claim": "Descriptive offline agreement and execution/evidence observability on the supplied references, separated by origin. Not psychological truth, calibrated confidence, political placement, model fairness, or NIST certification.",
        "metric_contract": {
            "completion": "review_complete / every expected case row, including missing, failed and not-attempted results; case attempts, not API retries.",
            "binary": "Known supported/not_supported references AND completed supported/not_supported predictions. Only explicit suppression is negative.",
            "precision": "TP/(TP+FP) on binary-resolved references only; excluded-reference overassertions must be read alongside it.",
            "conditional_recall": "TP/(TP+FN) on decisive binary-assessed targets only; abstentions and failures excluded.",
            "end_to_end_recall": "TP/all known supported references; error, missing, not_attempted, abstention, contextual routing and unassessed outcomes are misses.",
            "micro": "Sum of labeled target rows within each origin; repeated family rows are not independent.",
            "macro": "Unweighted mean of non-null per-card metrics, separately within each origin; contributing-card counts reported.",
            "unknown_taxonomy": "Unsupported; outside binary, gold-positive/missed-positive and evidence-precision denominators.",
            "outside_binary": "Uncertain, contextual and ineligible references; supported assertions reported as overassertions, contextual assertions as harm-routing failures.",
            "exact_evidence": "Only exact original-field strings and supplied offsets, not semantic adequacy or truth.",
            "evidence_precision": "Joint supported-reference AND independently adequate evidence, divided by all known labeled supported assertions; null for zero assertions or any missing/unresolved annotation.",
            "empty_denominators": "null, never perfect performance.",
        },
        "dataset": {
            "case_rows": len(cases), "family_count": len(family_origins),
            "repeated_family_rows": len(cases) - len(family_origins),
            "mixed_origin_family_ids": sorted(fid for fid, origins in family_origins.items() if len(origins) > 1),
            "label_versions": sorted({case["label_version"] for case in cases if "label_version" in case}),
            "cases_without_label_version": sum("label_version" not in case for case in cases),
            "operational_catalog_ids": sorted(catalog),
        },
        "reports_by_origin": {origin: _origin_report([row for row in rows if row["origin"] == origin]) for origin in ORIGINS},
        "case_results": rows,
        "diagnostics": {
            "submitted_result_records": len(normalized),
            "submitted_status_counts": dict(sorted(Counter(r["status"] for r in normalized.values()).items())),
            "unknown_result_ids": [result["id"] for result in unknown_results],
            "unknown_results": unknown_results,
            "unknown_results_scored_as_controls": False,
            "unsupported_taxonomy_targets": unsupported_targets,
            "attempt_universe_count_including_unknown_results": len(cases) + len(unknown_results),
            "attempt_universe_completed_including_unknown_results": sum(r["completed"] for r in rows) + sum(r["completed"] for r in unknown_results),
            "attempt_universe_completion_rate_including_unknown_results": _ratio(
                sum(r["completed"] for r in rows) + sum(r["completed"] for r in unknown_results),
                len(cases) + len(unknown_results)),
            "note": "Unknown submitted IDs have no reference or origin; they remain diagnostics, not scored cases or negative controls. No pooled accuracy is calculated.",
        },
    }
    if baseline is not None:
        old = evaluate(cases, baseline, catalog_ids=sorted(catalog))
        report["paired_comparison"] = _paired_report(rows, old["case_results"])
        report["paired_comparison"]["baseline_diagnostics"] = old["diagnostics"]
    return report


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    output = {}
    for key, value in pairs:
        if key in output:
            raise ValueError(f"duplicate JSON key (possibly conflicting reference classes): {key}")
        output[key] = value
    return output


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON constant is not allowed: {value}")


def _parse_json(text: str) -> Any:
    return json.loads(text, object_pairs_hook=_unique_object, parse_constant=_reject_constant)


def _load_json(path: Path) -> Any:
    return _parse_json(path.read_text(encoding="utf-8"))


def _load_cases(path: Path) -> list[dict[str, Any]]:
    cases = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            cases.append(_parse_json(line))
        except ValueError as exc:
            raise ValueError(f"{path}:{number}: {exc}") from exc
    return cases


def main(argv: list[str] | None = None) -> int:
    """Evaluate explicit local files, without invoking the review engine."""
    parser = argparse.ArgumentParser(prog="python -m biasguard.validation", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--baseline", type=Path)
    args = parser.parse_args(argv)
    # Do not overwrite the references/results accidentally, including symlink aliases.
    inputs = [args.cases, args.results] + ([args.baseline] if args.baseline else [])
    if any(args.out.resolve() == source.resolve() for source in inputs):
        parser.error("--out must not overwrite an input file")
    try:
        report = evaluate(_load_cases(args.cases), _load_json(args.results),
                          baseline=_load_json(args.baseline) if args.baseline else None)
        args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    except (OSError, ValueError, TypeError, KeyError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
