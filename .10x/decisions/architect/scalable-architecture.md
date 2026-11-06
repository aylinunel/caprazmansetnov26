# Scalable architecture for Çapraz Manşet — DRAFT for principal-architect review

Status: draft (pre-review) · Date: 2026-11-06 · Slug: scalable-architecture

## 1. Requirements

Functional (unchanged): collect headlines from ~37 Turkish outlets; group them into events; score, classify,
code and analyse; experimental AI review (BiasGuard); a public site with the hero, weekly splits, event and
outlet pages, four Örüntüler question pages, networks and charts; an owner-only review desk.

Non-functional (owner, 2026-11-06):
- **Live daily, growing archive**: a scheduled daily run; archive grows ≥ 1 year (≈ 1.5M headlines, ≈ 30k events, ≈ 600k ledes per year at today's rate of ~3.8k headlines/day).
- **Hosting: static-only now, full backend later.** No server short term; the design must not need a rewrite when a backend arrives.
- Efficiency first: phone readers on mobile data are the primary audience (spec §1).
- Keep the editorial gate: hand-coded/supplied material unchanged and labelled; machine output labelled; AI output labelled YZ.

## 2. Current landscape (measured)

| Area | Today | Problem at 1 year |
|---|---|---|
| Client data | every visit downloads all article packs (a-*.bin ≈ 17 MB gz, 245,935 rows) and decodes them into memory; ledes ≈ 17 MB more on demand; 23 full-array scans in app.js compute findings at page load | ≈ 100 MB+ download, hundreds of MB heap, multi-second scans: unusable on phones |
| Client code | one 941 KB HTML page, all CSS + ≈ 13.5k lines JS inline, parsed on every visit | grows with every feature; no caching of code separate from data |
| Pipeline | day-partitioned store (good); every build recomputes all stages over the full window; clustering windowed in 48 h blocks (good); event ids reconciled with the previous build | daily full rebuild grows linearly (≈ 12 min first run at 9 weeks → hours at a year) |
| Analyses | computed partly in the pipeline, partly re-derived in the browser from raw articles | duplicated logic (Python and JS), browser cost |
| BiasGuard | batch over top events, agents run by hand | fine as batch; needs a queue for daily new events |
| Publishing | `site.py` assembles one HTML + packs; artifact hosting needs base64 (+33 %) | all-or-nothing publish, no versioning or rollback |

## 3. Key trade-offs

- **Build time vs runtime**: precompute everything a page shows (static) vs query on demand (backend). Short term must be build-time.
- **File count vs request count**: one file per event (30k+ files/year; Cloudflare Pages caps a deploy at 20,000 files) vs weekly shards (≈ 52/year, fewer requests, larger downloads).
- **Simplicity vs flexibility**: plain JSON shards (zero client deps) vs Parquet + DuckDB-WASM in the browser (ad-hoc queries, but 3–6 MB WASM and HTTP range requests that artifact hosting doesn't support).
- **Incremental vs full recompute**: incremental daily runs need stable state (event ids, cluster boundaries) and a periodic full rebuild to correct drift.

## 4. Options

### A. Recommended — "Static data contract": incremental pipeline + analytical store + sharded, API-shaped static files

```
collector ─▶ ingest(day) ─▶ store (Parquet partitions by day; DuckDB file as the analytical store)
                │
     incremental stages per new day (+ 48 h overlap for clustering)
     score · classify · cluster → events (stable ids) · topics
                │
     aggregates from per-day / per-event summaries (cheap, not from raw rows)
                │
     BiasGuard queue (new events above threshold) ──▶ reviews (async, never blocks publish)
                │
     publisher: writes the PUBLIC DATA CONTRACT as files under /api/v1/… (versioned dir + manifest pointer)
                │
     static site (route-split ES modules) fetches only what the page needs
```

Public data contract (same paths a future backend will serve):

| Path | Content | Size target |
|---|---|---|
| `/api/v1/manifest.json` | build id, window, counts, shard list, hashes | < 5 KB, no-cache |
| `/api/v1/home.json` | hero split, weekly splits feed, how-it-works numbers, agenda network | < 150 KB |
| `/api/v1/outlets.json` | registry + per-outlet summary metrics | < 50 KB |
| `/api/v1/findings/{page}.json` | precomputed finding blocks: claim numbers, chart rows, table rows, how-text inputs | < 200 KB each |
| `/api/v1/events/{yyyy-ww}.json` | event list rows for one ISO week (title, outlets, p, cov, bs, topics) | ≈ 100–300 KB |
| `/api/v1/event/{yyyy-ww}.json` | event details for one week: headlines, pairs, timing, narrative coding, reviews | ≈ 0.5–1.5 MB |
| `/api/v1/outlet/{slug}.json` | outlet page: Kısaca inputs, recent splits, findings, top headlines | < 150 KB |
| `/api/v1/ledes/{yyyy-ww}.json` | ledes, only when a page asks | on demand |
| `/api/v1/search/{prefix}.json` | prefix-sharded search index (folded Turkish tokens → event ids) | small shards |

- Files are content-hashed and immutable; only `manifest.json` changes per publish → CDN-friendly, atomic, instant rollback (repoint manifest).
- The browser never loads the full archive; analyses are computed once in the pipeline (single implementation, Python), the site renders them.
- Weekly shards keep file count ≈ 3 × 52/year + 33 outlets + search shards — far under host limits.
- Front end: bundled with esbuild into route-level ES modules (home, events, event, outlet, patterns, method, notices) + shared core; CSS split per route; G6 and WebGL fog stay lazy.
- Later backend: implement the same `/api/v1` paths over DuckDB/Postgres; the client switches `API_BASE`. Search and archive queries move server-side first.

Failure modes: daily run fails → manifest still points at last good build (site unchanged), alert; clustering boundary drift → 48 h overlap re-cluster + weekly full rebuild of the last 4 weeks + monthly full rebuild; BiasGuard/LLM outage → queue backlog, publish proceeds with "not reviewed yet"; a shard fails to load → that section shows an inline error and retry, other sections render; schema change → `/api/v2` alongside v1.

### B. Static + in-browser analytics (Parquet over HTTP + DuckDB-WASM)
Ship Parquet partitions; the browser queries them with DuckDB-WASM. Pros: arbitrary queries, one data format end-to-end. Cons: 3–6 MB WASM before first chart on phones, range requests unsupported by artifact hosting, analysis logic moves into SQL in the browser (third implementation). Good for a researcher tool, wrong for everyday phone readers.

### C. Backend now (Postgres + API + server rendering)
Pros: fastest path to search and personalised features. Cons: contradicts the short-term static constraint, adds ops (DB, server, backups, uptime) for a one-person project, and the analytical workload is batch anyway.

## 5. Recommended bounded contexts (modular monolith, one repo)

| Context | Owns | Interface out |
|---|---|---|
| Collection | feeds, sitemaps, raw runs | raw run files |
| Store | day partitions (Parquet), DuckDB analytical file, ids | tables: articles, events, memberships, scores |
| Analysis | score, classify, cluster/events, topics, aggregates (incremental) | tables + summaries |
| Review | BiasGuard queue + editorial decisions (owner) | review tables, labelled YZ |
| Publishing | public data contract `/api/v1`, manifest, versions | static files (later: API) |
| Presentation | site modules, design system, charts | consumes `/api/v1` only |

Rule: Presentation never reads raw articles; Publishing is the only producer of public data.

## 6. Migration path (no big bang)

1. Publishing: add the `/api/v1` writer next to today's packs; site keeps working.
2. Presentation: move pages one by one to contract files (home first: biggest win), delete their full-archive scans; when the last page moves, stop shipping article packs.
3. Front end: introduce esbuild + route modules (mechanical split of v7/*.js, app.js last).
4. Analysis: incremental daily mode (new days + overlap), weekly/monthly rebuilds; DuckDB/Parquet store.
5. Scheduler: daily GitHub Actions run → publish → manifest swap.
6. Later: backend serving the same contract; search first.

## 7. Open questions for review
- Weekly vs daily shards for event details at 1-year scale?
- DuckDB file vs Parquet-only store?
- Where do editorial decisions (owner review desk) live in static-only mode (artifact db vs repo file)?
