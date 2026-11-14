"""Conservative news observability gates layered over BiasGuard's native evidence gates.

No simulation strength, political placement, verbal confidence, or reviewer-declared
``kind=behavioral`` substitutes for independently supplied documentary evidence.
This module establishes input/evidence contracts, NOT empirical detector validity.
"""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
import re
from typing import Any
from urllib.parse import urlsplit

from .publication import ensure_publication_allowed

ALGORITHM_VERSION = "news-validity-v1"
CAPABILITIES = frozenset({
    "documented_reasoning", "behavioral_history", "decision_comparison",
    "outcome_comparison", "learning_observations",
})
_CAP_LABELS = {
    "documented_reasoning": "kararın dayanağını gösteren belgelenmiş akıl yürütme",
    "behavioral_history": "zaman sıralı davranış veya karar kaydı",
    "decision_comparison": "karşılaştırılabilir kararların belgelenmiş kaydı",
    "outcome_comparison": "beklenti veya güven ile gerçek sonuçların karşılaştırması",
    "learning_observations": "öğrenme veya hatırlama sonuçlarının belgelenmiş gözlemi",
}
# These are transparent minimum engineering safeguards, not expert-approved diagnoses.
_OUTCOME_IDS = frozenset({"dunning-kruger-effect", "hard-easy-effect", "illusion-of-validity"})
_HISTORY_IDS = frozenset({"hindsight-bias", "outcome-bias", "planning-fallacy",
                          "belief-perseverance", "commitment-bias", "the-sunk-cost-fallacy"})
_COMPARISON_IDS = frozenset({"framing-effect", "base-rate-fallacy", "survivorship-bias"})
_LEARNING_IDS = frozenset({"spacing-effect", "levels-of-processing-effect", "google-effect",
                           "testing-effect", "generation-effect", "serial-position-effect"})


def _offsets(original: str, quote: str) -> list[int]:
    locations, start = [], 0
    while True:
        at = original.find(quote, start)
        if at < 0:
            return locations
        locations.append(at)
        start = at + 1


def _safe_url(value: Any) -> str | None:
    if not isinstance(value, str) or re.search(r"[\s\x00-\x1f\x7f]", value):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            return None
        return value
    except ValueError:
        return None


def _segments(item: dict[str, Any]) -> list[dict[str, Any]]:
    """Validate supplied offset records; legacy input can be attributed by its own lines."""
    text = item.get("text", "")
    supplied = item.get("segments")
    if supplied is not None:
        if not isinstance(supplied, list):
            raise ValueError("segments must be an array")
        headers = list(re.finditer(r"(?m)^\[([^\]\n]+?) · [^\]\n]+\]", text))
        boundaries = {header.start(): headers[index + 1].start() - 1 if index + 1 < len(headers) else len(text)
                      for index, header in enumerate(headers)}
        if len(supplied) != len(headers):
            raise ValueError("segments must identify every original outlet record exactly once")
        segments = []
        for segment in supplied:
            if not isinstance(segment, dict):
                raise ValueError("each segment must be an object")
            a, b = segment.get("start"), segment.get("end")
            if isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, int) or not isinstance(b, int) or not 0 <= a < b <= len(text):
                raise ValueError("segment offsets must identify the original text")
            if a not in boundaries or b != boundaries[a]:
                raise ValueError("segment must match one original outlet record, not cross another outlet header")
            outlet = segment.get("outlet")
            if not isinstance(outlet, str) or not outlet or not text[a:b].startswith(f"[{outlet} ·"):
                raise ValueError("segment outlet must agree with its original source line")
            segments.append({**segment, "url": _safe_url(segment.get("url"))})
        ordered = sorted(segments, key=lambda s: s["start"])
        if any(x["end"] > y["start"] for x, y in zip(ordered, ordered[1:])):
            raise ValueError("source segments cannot overlap")
        return ordered
    segments, start = [], 0
    for line in text.splitlines(keepends=True):
        body = line.rstrip("\r\n")
        match = re.match(r"\[([^\]\n]+?) · [^\]\n]+\]", body)
        if match:
            segments.append({"start": start, "end": start + len(body),
                             "outlet": match.group(1), "article_id": None, "url": None,
                             "timestamp": None, "lede_truncated": None})
        start += len(line)
    return segments


def evidence_attribution(item: dict[str, Any], evidence: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep EVERY exact quote occurrence, including spans crossing outlet lines.

    Offsets are Python Unicode-character indexes, half-open, in the declared original
    field. URLs are supplied provenance, not network-verified functional links.
    """
    source = evidence.get("source", evidence.get("src"))
    quote = evidence.get("quote", evidence.get("q"))
    if source not in {"text", "context"} or not isinstance(quote, str) or not quote.strip():
        return []
    original = item.get(source, "")
    if not isinstance(original, str):
        return []
    segments = _segments(item) if source == "text" else []
    occurrences = []
    for start in _offsets(original, quote):
        end = start + len(quote)
        touched = [s for s in segments if s["start"] < end and start < s["end"]]
        occurrences.append({"source": source, "start": start, "end": end,
                            "outlets": sorted({s["outlet"] for s in touched}),
                            "articles": [{"outlet": s["outlet"], "article_id": s.get("article_id"),
                                          "url": s.get("url"), "timestamp": s.get("timestamp"),
                                          "url_verification": "provided_not_network_checked" if s.get("url") else "unavailable",
                                          "lede_truncated": s.get("lede_truncated")}
                                         for s in touched]})
    return occurrences


def required_capabilities(card: dict[str, Any]) -> list[str]:
    """Transparent conservative minima; detailed semantic necessary conditions still apply."""
    cid = card["id"]
    if cid in _LEARNING_IDS or card.get("entry_type") == "memory_learning_effect":
        required = ["learning_observations"]
    elif card.get("review_policy") == "effect_context_only":
        required = ["decision_comparison"]
    else:
        required = ["documented_reasoning"]
    if cid in _OUTCOME_IDS:
        required.append("outcome_comparison")
    if cid in _HISTORY_IDS or card.get("review_policy") == "requires_behavioral_evidence":
        required.append("behavioral_history")
    if cid in _COMPARISON_IDS:
        required.append("decision_comparison")
    return list(dict.fromkeys(required))


def _capabilities(item: dict[str, Any]) -> tuple[dict[str, list[dict]], list[str]]:
    """Capability records are operator-provided, outside untrusted reviewer output.

    Exact documentary quotes establish availability, not truth, independent collection,
    legitimate consent, or causal interpretation. An editorial reviewer must verify them.
    """
    records = item.get("evidence_capabilities", [])
    if not isinstance(records, list):
        return {}, ["evidence_capabilities must be an array; no capabilities were accepted"]
    accepted: dict[str, list[dict]] = {}
    rejected = []
    for record in records:
        if not isinstance(record, dict):
            rejected.append("capability record must be an object")
            continue
        name, source, quote = record.get("capability"), record.get("source"), record.get("quote")
        if not isinstance(name, str) or name not in CAPABILITIES or source != "context" or record.get("origin") != "documentary":
            rejected.append("capability must name an allowed documentary context observation")
            continue
        if not isinstance(record.get("document_id"), str) or not record["document_id"].strip():
            rejected.append(f"{name}: document_id is required")
            continue
        if not isinstance(record.get("description"), str) or len(record["description"].strip()) < 8:
            rejected.append(f"{name}: describe the actual observation, not just a boolean")
            continue
        if not isinstance(quote, str) or len(re.sub(r"\s+", "", quote)) < 8 or not _offsets(item.get("context", ""), quote):
            rejected.append(f"{name}: quote is absent/too short in original context")
            continue
        accepted.setdefault(name, []).append(deepcopy(record))
    return accepted, rejected


def _role_cites_capability(result: dict, card_id: str, role: str, records: list[dict]) -> bool:
    for outcome in result.get("reviewer_outcomes", []):
        if outcome.get("role") != role or outcome.get("valid") is not True:
            continue
        for assessment in outcome.get("assessments", []):
            if assessment.get("card_id") != card_id or assessment.get("verdict") != "supported":
                continue
            referenced = {index for condition in assessment.get("necessary_conditions", [])
                          if condition.get("status") == "satisfied"
                          for index in condition.get("evidence_indices", [])}
            for evidence in assessment.get("verified_evidence", []):
                if evidence.get("evidence_index") in referenced and any(
                    evidence.get("source") == r["source"] and evidence.get("quote") == r["quote"]
                    for r in records
                ):
                    return True
    return False


def guard_news_result(result: dict[str, Any], item: dict[str, Any], cards=None) -> dict[str, Any]:
    """Return a copied review with unsupported observability claims downgraded.

    Missing capabilities or uncited documentary records lead to ``needs_context``.
    Execution status/coverage are NEVER repaired, and all new results are review-only.
    """
    if cards is None:
        from .catalog import load_cards
        cards = load_cards()
    if not isinstance(item.get("text"), str) or not isinstance(item.get("context", ""), str):
        raise ValueError("guarded source fields must be original strings")
    _segments(item)
    guarded = deepcopy(result)
    by_id = {c["id"]: c for c in cards}
    available, rejected = _capabilities(item)
    assessed = {a.get("card_id") for a in result.get("adjudication", [])}
    eligibility = []
    for cid in result.get("candidate_ids", []):
        card = by_id.get(cid)
        required = required_capabilities(card) if card else []
        missing = [cap for cap in required if cap not in available]
        eligibility.append({"card_id": cid, "assessed": cid in assessed,
                            "required_capabilities": required, "missing_capabilities": missing,
                            "observable": bool(card) and not missing,
                            "policy_status": "conservative_engineering_minimum_not_empirically_validated"})
    downgraded, retained = [], 0
    for collection in ("supported_findings", "contextual_effects"):
        kept = []
        for finding in guarded.get(collection, []):
            cid = finding["id"]
            card = by_id.get(cid)
            required = required_capabilities(card) if card else []
            missing = [cap for cap in required if cap not in available]
            uncited = [cap for cap in required if cap in available and not all(
                _role_cites_capability(result, cid, role, available[cap])
                for role in ("advocate", "skeptic")
            )]
            quote_failures = [e for e in finding.get("evidence", []) if not evidence_attribution(item, e)]
            reasons = []
            if result.get("status") != "review_complete":
                reasons.append("native review did not complete")
            if not card:
                reasons.append("target is not in the operationalized detector catalog")
            reasons.extend("missing documentary capability: " + cap for cap in missing)
            reasons.extend("both reviewers must cite documentary capability: " + cap for cap in uncited)
            if quote_failures:
                reasons.append("finding contains non-exact original-field evidence")
            if not finding.get("evidence"):
                reasons.append("finding has no exact original-field evidence")
            finding["validity"] = {"algorithm": ALGORITHM_VERSION, "required_capabilities": required,
                                   "missing_capabilities": missing, "uncited_capabilities": uncited,
                                   "review_required": True, "reasons": reasons}
            if reasons:
                finding["original_status"] = finding.get("status")
                finding["status"] = "needs_context"
                finding["missing_context"] = sorted(set(finding.get("missing_context", []) + [
                    "Gerekli ek kanıt: " + _CAP_LABELS[cap] for cap in missing
                ] + reasons))
                guarded.setdefault("uncertain_findings", []).append(finding)
                downgraded.append({"card_id": cid, "from": collection, "reasons": reasons})
                for adjudication in guarded.get("adjudication", []):
                    if adjudication.get("card_id") == cid:
                        adjudication["original_status"] = adjudication.get("status")
                        adjudication["status"] = "needs_context"
                        adjudication["validity_reasons"] = reasons
            else:
                kept.append(finding)
                retained += 1
        guarded[collection] = kept
    source_hashes = {field + "_sha256": sha256(item.get(field, "").encode("utf-8")).hexdigest()
                     for field in ("text", "context")}
    capability_hash = sha256(json.dumps(item.get("evidence_capabilities", []), sort_keys=True,
                                        ensure_ascii=False).encode("utf-8")).hexdigest()
    guarded["eligibility"] = eligibility
    guarded["validity_gate"] = {"algorithm": ALGORITHM_VERSION,
        "input_scope": item.get("input_scope", "legacy_headline_excerpt"),
        "publication_status": "draft", "verification_status": "needs_review", "review_required": True,
        "available_capabilities": sorted(available), "rejected_capabilities": rejected,
        "downgraded": downgraded, "retained_hypotheses": retained,
        "scope_note": "Headline/partial-lede differences, supplied political positions, collector gaps and model-declared behavioral evidence do not establish internal cognition or intent.",
        "semantic_validation": "not established by exact quotes or simulation tests",
        **source_hashes, "capabilities_sha256": capability_hash}
    guarded.setdefault("audit", {})["validity_algorithm"] = ALGORITHM_VERSION
    return guarded
