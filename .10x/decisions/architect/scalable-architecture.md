# Scalable architecture for Çapraz Manşet

Status: **approved by council and owner** · Date: 2026-11-06 · Slug: `scalable-architecture`

Decision council: Principal Architect (chair), Design Critic 1 (phone reader), Design Critic 2 (system & contract).
Process: draft → three independent reviews → one voting round on ten contested points → this record.
Dissent is recorded where a vote was not unanimous.

## 1. Requirements

**Functional (unchanged).** The system:
- collects headlines from about 37 Turkish outlets;
- groups them into events;
- scores, classifies, codes and analyses them;
- runs the experimental AI review (BiasGuard);
- publishes the site (hero, weekly splits, event pages, outlet pages, Örüntüler, networks);
- serves the owner-only review desk.

**Non-functional (set by the owner):**
- **Runs daily and the archive keeps growing.** One year is about 1.5M headlines and 30k events (about 3.9k headlines a day).
- **Static hosting now, a full back end later.** The back end must not force a rewrite of the site.
- **Efficiency comes first.** Phone readers on mobile data are the main audience.
- **The editorial gate stays.** Hand-coded material is unchanged and labelled; machine output is labelled *otomatik*; AI output is labelled *YZ*.

**Reader budgets (CI gates):**

| Gate | Limit |
|---|---|
| Cold home page (HTML, CSS, home JS and `home.json`) | ≤ 120 KB gz |
| Hero split visible on slow 4G | ≤ 2.5 s |
| One event page | ≤ 150 KB gz after the manifest |

All sizes in this record are gzip transfer sizes.

## 2. Measured landscape (verified against the code)

- **Client data.** `loader.js` downloads every `a-*.bin` pack before the first render: about 17 MB gz and 245,935 rows. `core.bin` also carries every event's member list, which would be about 10 MB at 30k events. `app.js` and v7 scan the full `D.A` array about 27 times. A year's archive would mean 100 MB or more, which no phone can handle.
- **Client code.** One 941 KB HTML file with all the JS and CSS inline. Nothing is cached separately from the data.
- **Pipeline.** Score and classify are already cached per day (`DayCache`, ADR-0002). These stages still cost more as the window grows:
  - `classify.train`
  - global `cluster.cluster` and its TF-IDF fit over every title
  - wording TF-IDF and GSDMM topics
  - PCA, plus Mantel and Spearman tests at 9,999 permutations
  - `store.homes()`, which reads the whole archive on every ingest
- **Correctness gap.** Several event fields depend on the whole window:
  - `bs` and `ns` use an `active` value computed over the whole window;
  - keywords and the clustering weights also come from the whole window.

  So old events change as the archive grows, which defeats immutable files and stable ids.
- **State gap.** Event-id state (`events-members.json`) is written to `out/`, so a fresh CI checkout resets the ids. There is also no scheduled job and no persistent store in CI.
- **BiasGuard coupling.** `biasguard/news.py` reads the packs and `core.E`. Reviews carry no membership hash, so a review that no longer matches its event goes unnoticed.

## 3. Options considered

**A: static data contract (chosen).**
- The pipeline computes every number the site shows.
- It publishes small, versioned JSON files at the paths a future back end will serve.
- Pages fetch only what they display.

**B: static files plus in-browser analytics (rejected).**
- Parquet files queried in the browser with DuckDB-WASM.
- Rejected because it downloads 3–6 MB of WASM before the first chart, needs range requests (the artifact host can't serve them), and adds a third copy of the analysis logic.

**C: back end now (rejected).**
- Breaks the owner's static-hosting constraint.
- Adds database and server operations for a one-person project, while the workload is batch anyway.

## 4. Decision

### 4.1 Modules: three (unanimous)

| Module | Owns | Produces |
|---|---|---|
| `pipeline/` | the day store, analysis, run state, the BiasGuard queue | tables and per-event summaries in `state/` and the store |
| `publish/` | the public data contract, manifest, checks and budgets | static files under `/api/v1/` |
| `site/` | pages, design system and charts | reads `/api/v1/` only, through one `data.get(kind, key)` module |

Collection stays in its own repo. The collector's files are the input.

**Rules:**
- The site never reads raw articles.
- `publish/` is the only thing that writes public data.
- The scorer stays as shared JS in `shared/analysis/rules.cjs` (ADR-0002).
- Findings and aggregates move to Python.
- `logic.js` keeps view logic only.
- Adding an outlet is a data-only change.

### 4.2 Public data contract (`/api/v1`)

| Path | Contents | Budget |
|---|---|---|
| `manifest.json` (no-cache) | `build` id; window; frozen-vocabulary version; the 72-hour cutoff; file names with their hashes | < 5 KB |
| `home.json` | everything the hero and the first six feed cards draw (precomputed `compareHeads`, `splitCard`, `whatDiffers`); how-it-works numbers; the agenda network | < 100 KB |
| `outlets.json` | outlet registry and summary metrics | < 50 KB |
| `findings/{page}.json` | finding blocks: claim, chart rows, table rows, how-text inputs, date range covered | < 200 KB |
| `events/{yyyy-ww}.json` | event list rows for one ISO week | about 100 KB |
| `event/{yyyy-mm-dd}.json` | detail for events first published that day (about 80) | ≤ 150 KB, hard gate |
| `event-deep/{yyyy-mm-dd}.json` | created only when a day's file fails its budget: the publisher moves narrative, pairs, timing and reviews here, and the page fetches it when a `<details>` opens | on demand |
| `outlet/{slug}.json` | outlet page | < 150 KB |
| `ledes/{yyyy-mm-dd}.json` | ledes, only when a page asks | on demand |
| `aliases.json` | old event id → new id after merges and splits | small |
| `reviews-overlay.json` (no-cache) | YZ rejections and corrections | small |
| `status.json` | stage times, counts, freshness, LLM calls and cost | small |

**How every file is built:**
- Each file carries `build` and a JSON Schema version.
- Each block carries `src` from the existing labels (`el` / `otomatik` / `YZ`).
- YZ blocks also carry a `review` status.
- File names are content-hashed. Unchanged data keeps its name, because writers produce identical bytes for identical data (`mtime=0`, sorted output).
- The schemas live in `shared/contract/*.schema.json`. Python validates every file against them before publishing.
- Generated JSDoc `@typedef`s plus `// @ts-check` give the plain-JS site types without a build step.
- A Node CI test validates fixture files.

### 4.3 Event identity and URLs (one-way door)

- **Ids:** `s<n>` ids are kept and never reused.
- **Day:** each event gets the day it was first published, and that day never moves.
- **URL:** `#/olay/2026-11-06/s1234`. A cold deep link costs one fetch after the manifest.
- **Old links:** old `#/olay?e=` links resolve through a small redirect index during migration.
- **Merges and splits:** these write `aliases.json` and a map from old ids to new ones.
- **Id registry:** lives in a persisted `state/` folder, not in `out/`.

### 4.4 Incremental daily run

- **Clustering:**
  - The TF-IDF vocabulary and weights are frozen on a reference period and refitted monthly.
  - Only the last 72 hours are re-clustered; older events are closed.
- **Late articles:** a late article joins a closed event when it is similar enough to the event's most typical headline. Otherwise it waits for the monthly rebuild. Both cases are counted.
- **Frozen values:**
  - Each event's `active`, `bs` and `ns` are frozen using the 28 days ending on the event's day.
  - The numbers shown on the hero and feed cards are frozen too, so a reader who returns the next day sees the same counts.
- **Training:** `classify.train` runs again only when the labels or the model version change.
- **Aggregates are built from a per-event summary table (about 30k rows), never from raw headlines:**

  | Aggregate | How it is computed |
  |---|---|
  | φ correlations | additive 2×2 counts, updated daily |
  | Medians, PCA, permutation tests | weekly, over fixed windows (12 weeks and all time); each finding shows its date range |
  | GSDMM topics | fitted monthly; new headlines assigned daily |

- **Ingest:** `store.homes()` becomes an incremental index.
- **Recorded every run:** the frozen-vocabulary version, the 72-hour cutoff and the 28-day window, in `manifest.json` and `runs/<date>.json`.

### 4.5 Run state and the daily job

- **Where state lives:** the store, `state/`, models and the DayCache live on a `data` branch, the same pattern the collector's `backfill-data` branch already uses. GitHub release assets hold only large model files.
- **Daily GitHub Actions run:**
  1. restore
  2. ingest
  3. incremental build
  4. check against the schemas
  5. publish checks
  6. publish
  7. save state
- **Publish checks.** Publishing is blocked unless all of these pass:
  - every file matches its schema;
  - the headline count is within ±40 % of the 7-day median;
  - every active outlet is present;
  - fewer than 2 % of event ids changed;
  - the size budgets pass;
  - the deploy stays under the host's file limit.

  If a check fails, the live site stays on the last good build.
- **Overlapping runs:** a `concurrency` group stops two runs from overlapping.
- **Failures:** a failed run sends an email, and the job fails when the data is more than 36 hours old.
- **Freshness note:** the site shows a plain date line, "Son güncelleme: 5 Kasım", not a warning.

### 4.6 Rollback and caching

- **Pages or Cloudflare:**
  - Keep the hashed files of the last 7 manifests, so readers on an older manifest don't hit 404s.
  - Unchanged files keep their names, so the extra file count stays small.
  - Rollback means pointing at the previous manifest, or using the host's own rollback.
- **Artifact edition (511-file limit):**
  - It holds a rolling 90 days.
  - Rollback means republishing the previous Actions artifact.
- **Browser:**
  - Files fetched during a session are cached in memory, so back and forward cost nothing.
  - Routes become async, with a skeleton for each section and an inline error with retry.

### 4.7 Editorial decisions and BiasGuard

- **Decisions file.** `data/reference/decisions.jsonl` is append-only and is the source of truth.
  - The daily run reads it.
  - A rejection made on the desk triggers a `workflow_dispatch` job that republishes only `reviews-overlay.json`, so rejected YZ output leaves public pages within minutes.
  - The browser never holds a token.
- **BiasGuard:**
  - reads the store, not the packs;
  - takes new events above the threshold from a queue;
  - has a daily LLM cost cap recorded in `status.json`;
  - stores an event membership hash with each review, so a review that no longer matches its event is caught;
  - never blocks a publish: pages show "henüz incelenmedi" (not reviewed yet).

### 4.8 Front end

- **Now:**
  - Move the inline JS and CSS into cacheable external files.
  - Add a `<noscript>` line and the hero headline pair as static text in the HTML shell.
  - Fog, G6 and ledes load after the first paint.
  - Fog, G6 and ledes are skipped when the reader has data saving (`saveData`) or reduced motion on.
- **Deferred, with a trigger:**
  - Split the code per route once home JS goes over 60 KB gz after the data move.
  - Add a full prerendered `index.html`, built in Node from the existing v7 render functions, only if the 2.5-second gate fails.
- **Search:** no index in v1. `/ara` filters the week lists and outlets already loaded, and says plainly which weeks it searched. Full-archive search arrives with the back end.

### 4.9 Back end later

- It serves the same `/api/v1` paths from DuckDB or Postgres, reading the store, and the site switches only its API base URL.
- Search and full-archive queries move there first.
- DuckDB is added as a query engine over the store files, not as a new store.

## 5. Migration order (no big bang)

| Step | Change | Notes |
|---|---|---|
| 0 | Move the id state out of `out/`, persist the store on the `data` branch, and add the scheduled daily full rebuild | Gives about 2 months of headroom: full rebuilds stay workable to about 500k headlines |
| 1 | Freeze the event fields, the day keys and the new URL scheme, with `aliases.json` | **Risky** |
| 2 | Add the schemas and the `/api/v1` writer alongside the packs, with tests that the Python findings match the JS findings | |
| 3 | Move pages over (home first, then events, event, outlet, findings), point BiasGuard at the store, add the overlay, and stop shipping packs | |
| 4 | Incremental clustering and aggregates, with the weekly and monthly rebuilds | **Risky** |
| 5 | External JS and CSS files now; per-route split when its trigger fires | |
| 6 | Back end behind the same contract | |

**One-way doors:**
- the event URL and id scheme;
- the contract schemas, once anything links to or reads them.

The store format, hashing, bundling and DuckDB can all be undone.

## 6. Vote record

| # | Point | Architect | Critic 1 | Critic 2 | Result |
|---|---|---|---|---|---|
| 1 | Day in the URL | adopt | adopt | adopt | unanimous |
| 2 | Keep 7 manifests' files | amend: keep 1 | adopt | adopt (artifact edition: redeploy) | majority: 7 on Pages; redeploy for the artifact edition |
| 3 | Event detail | one daily file with a budget gate | one daily file with a gate | always two tiers | majority: one file; automatic split to `event-deep` over budget |
| 4 | Corrections | JSONL plus overlay | both | both, one source | unanimous |
| 5 | Prerender and budget | budget plus noscript; defer prerender | same | budget; prerender via Node or defer | unanimous: budget gate, prerender deferred |
| 6 | Search | none | one `search.json` | none (filter on the client) | majority: none in v1. **Dissent (Critic 1):** a silent miss on an old event is worse than no box, so `/ara` must say which weeks it searched |
| 7 | Three modules | adopt | adopt | adopt | unanimous |
| 8 | Shared JS scorer; findings in Python | adopt | adopt | adopt | unanimous |
| 9 | Types | JSON Schema plus JSDoc | TS (for the gate) | JSON Schema plus generated JSDoc | majority: JSDoc; Critic 1's gate concern is met by schema checks before publish |
| 10 | Provenance, `status.json`, LLM cap, 36 h | adopt | adopt (plain date line) | adopt (reuse existing labels) | unanimous, with both amendments |

**Correction during the council.** Critic 2 caught that step 0's headroom is about 2 months, not the 4 the architect first estimated (245,935 headlines after 9 weeks, about 3.9k a day).

## 7. Risks

1. Event fields that depend on the window, and drifting TF-IDF weights, silently change old events. Mitigation: step 1, plus the publish check that blocks when 2 % or more of ids change.
2. Ids get lost if state stays in `out/`. Mitigation: step 0.
3. Dropping the packs breaks BiasGuard and any finding not yet moved. Mitigation: drop the packs last (step 3), with parity tests.
4. The artifact edition's 511-file limit. Mitigation: a rolling 90 days.
5. `homes()` and the 9,999-permutation tests dominate daily runtime. Mitigation: an incremental index and weekly fixed-window runs.
6. Unattended runs publish partial data. Mitigation: the publish checks, `status.json`, alerts and the freshness line.
7. Over-building delays the change readers actually feel. Mitigation: steps 0–3 come first; the deferred items each have a trigger.

## 8. Owner decisions (2026-11-06)

- **Findings window: all data compiled.** Every finding covers the whole archive. This supersedes the "12 weeks and all time" windows in §4.4.
  - Medians and p75 lead-lag come from per event × outlet rows; φ from additive 2×2 counts; PCA from per-outlet aggregates. All are recomputed daily.
  - Mantel and Spearman tests run on outlet × outlet matrices, so their cost does not grow with the archive.
  - Wording similarity is stored as outlet-pair sums when each event closes.
  - GSDMM and TF-IDF are refitted monthly. New headlines are assigned to topics daily. The topic-id map lives in `state/`, with aliases.
  - On phones each claim shows "n olay · <date>'ten beri"; `computedAt` and per-outlet n sit in the how-text fold. The stamp fields are in the schema.
  - Effect sizes come first, in plain Turkish. `findings-history.json` is append-only and loads only on request.
  - The monthly refit passes the same publish checks as the daily run.
- **Event URL `#/olay/{day}/s<n>`: approved.**
- **BiasGuard budget (council recommendation): $50–100 a month on a mid-tier model, with a $5 daily cap.**
  - One event costs about 54k tokens in and 4k out. About 300 events a month, which comes to roughly $80 a month (about $55 with the catalog cached) at an assumed $3/$15 per MTok.
  - A top-tier model would need $300–450 a month.
  - Review rule: once, at close (72 h); 12 or more outlets with both blocs covered; top 10 a day, at most 15; re-review if membership changes by more than 20 %.
  - When the cap is hit, events queue and show "henüz incelenmedi" (event page only). Events dropped after 7 days show "incelenmedi".
  - The queue and review keys live in `state/`. Measured token usage is logged per call, and the cap is checked before each call. The catalog goes first in the prompt so caching applies.
  - Kill switch: if the measured month yields about 0 supported findings, spending pauses and the owner gets a report.

Plan page: https://claude.ai/artifact/LJr9GicPyfhJuRuotwN4tq
