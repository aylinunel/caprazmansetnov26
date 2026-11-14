"""Stdlib-only boundary for experimental review artifacts, not an auth system."""
from __future__ import annotations

from typing import Any


def ensure_publication_allowed(payload: Any) -> None:
    """Legacy machine packs remain compatible; new guarded drafts stay private.

    No approval flag is invented here. Approval must happen in a separate legitimate
    editorial workflow, with its own reviewed export, roles and audit trail.
    """
    if not isinstance(payload, dict):
        raise ValueError("BiasGuard publication payload must be an object")
    metadata = payload.get("metadata", {})
    if not isinstance(metadata, dict):
        raise ValueError("BiasGuard publication metadata must be an object")
    events = payload.get("events", [])
    if not isinstance(events, list):
        raise ValueError("BiasGuard publication events must be an array")
    guarded = (
        "validity_gate" in payload
        or metadata.get("algorithm") == "news-validity-v1"
        or metadata.get("review_required") is True
        or metadata.get("publication_status") in {"draft", "needs_review"}
        or any(isinstance(event, dict) and "validity_gate" in event
               for event in events)
    )
    if guarded:
        raise ValueError(
            "Guarded BiasGuard output is a draft for editorial review; do not publish "
            "it in core.bin. Use an authenticated editorial workflow and a separately "
            "reviewed export. Changing a JSON approval flag does not approve this artifact."
        )
