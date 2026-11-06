# Architect decisions

## Active features
| Slug | Description | Status |
|---|---|---|
| [scalable-architecture](scalable-architecture.md) | Static data contract (`/api/v1`), incremental daily pipeline, durable run state, reader budgets | Council-approved, awaiting owner |

## Cross-cutting principles
- Readers never download the archive: the pipeline computes, `publish/` writes the contract, the site renders.
- One source per number: findings in Python; the scorer stays shared JS (ADR-0002).
- Event ids and URLs are a one-way door: frozen day key, never reused, `aliases.json` for merges.
- Every unattended publish passes schema, volume, id-churn and size gates; the last good build stays live otherwise.
- Defer tools (DuckDB, bundler, search index, prerender) until a measured trigger fires.
