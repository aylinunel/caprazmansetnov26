# Edit batch 2026-11-07 (team lead: senior engineer)

Owner requests 1–8, split into three parallel workstreams (sonnet, isolated worktrees), each with a senior review → fix round → combined scoped re-review; merged onto main, full smoke + 32 logic tests green.

| # | Request | Where | Decision |
|---|---|---|---|
| 1 | Anlatı haritası under Olaylar | core.js NAV, app.js SUB | Sub-tab after "Tüm olaylar"; /anlati route kept; Olaylar highlighted |
| 2 | Explain Anlatı haritası | v7/anlati.js v7Intro | Lead + "Veri nereden geliyor? / Nasıl okunur / Neyi göstermez?" — every limit sourced from existing yöntem text (app.js 4491, 4538–4542, 6518) |
| 3 | Smaller dotted header | v7/dots.js | Wordmark min(H*.45, W*.085), ≈28% smaller |
| 4 | Border on dotted charts | styles.css .vz-dist/.vz-line | 1px --line2 border, radius, padding |
| 5 | Parties ↔ outlets page | v7/parti.js, logic.js | Kurumlar → Partiler: closeness (6-axis distance + heatmap), mentions, tone (n≥10), ownership (descriptive, no verified links). Matching ≈99% precision on real sample; Yeni Parti added; ≤4-letter acronyms take no letter suffix |
| 6 | Explain PCA axes | app.js advScatter, oruntu.js | Short in-SVG axis labels with % variance; loading names as HTML under the chart |
| 7 | Six-axis line chart | parallelCoords() options | Back on the Partiler tab, outlets + parties (dashed) |
| 8 | Sober Nasıl çalışır | v7/yontem.js, .ym-plain | One column, numbered sections, TOC (13), no motion/decoration; dotted header kept (site-wide) |

Rulings: keep the dotted header on /yontem (site-wide structure the owner just resized); /anlati header holds only eyebrow + title so dots never sit behind text.
Deferred minors: ptMent throw leaves skeleton busy; "CHPli" (no apostrophe) no longer matches; cm3method TOC link depends on the v3 add-on being on (it is by default); 240px skeleton layout shift.
