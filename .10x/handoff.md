# Handoff

## Current handoff — architect → staff engineer / EM (2026-11-06)
Read `.10x/decisions/architect/scalable-architecture.md`.
- Modules: `pipeline/`, `publish/` (new), `site/` (reads `/api/v1` via `data.get`).
- Contract: §4.2; schemas in `shared/contract/`.
- Start with migration step 0 (§5), then step 1 (risky: id/URL freeze).
- Blocked on the three owner decisions in §8.

## History
(none)
