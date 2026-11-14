# Anlatı topic, bias explainers, Nasıl çalışır scroll fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Anlatı haritası its own top-level topic with an explainer page and two map pages, add a short inline "what is this bias" explanation wherever the AI review names a bias, and make the Nasıl çalışır contents list open each chapter at its beginning.

**Architecture:** Plain-JS single page (`site/js/v7/*.js` concatenated into `index.html` by `site.py`). Navigation is the `NAV`/`SUB` tables; pages are functions returning HTML strings and wired after render. Pure helpers go in `logic.js` (unit-tested in Node); markup helpers in `core.js`; page code in `anlati.js`/`anlativ.js`/`olay.js`/`yontem.js`.

**Tech Stack:** Vanilla JS, CSS in `site/styles.css`, Node `--test` for logic, Playwright smoke (`site/tests/smoke.cjs`), Python `site.py` assembler.

**Spec:** The user's three requests of 2026-11-14 (no separate spec file):
1. Anlatı haritası becomes its own topic between *Olaylar* and *Örüntüler*, with 2+ pages: the first explains the map (the explainer that opens today's page), the others hold the actual maps.
2. In *Olaylar* and *Anlatı haritası*, where the AI (YZ) names a bias, show a short optional explanation without leaving the page, besides the existing link.
3. In *Nasıl çalışır*, clicking a chapter in *İçindekiler* lands at the chapter's start, not its end.

## Global Constraints

- Never hand-edit `public/index.html`; rebuild with `site.assemble` (see Task 4).
- All user-visible copy in Turkish; AI-made content keeps the `YZ` badge (`yzBadge()`).
- Touch targets ≥ 44 px at 390 px width; no horizontal page scroll; no console errors (smoke enforces).
- Existing deep links `#/anlati?w=…&n=…&v=ag|tablo` must keep working (they are used by home, event pages and `app.js`).
- A bias explanation is optional and collapsed by default; the existing link to `#/yontem?s=kavramlar&k=<key>` stays.
- Run before every commit: `node --test site/tests/logic.test.cjs` and `cd pipeline && python3 -m unittest discover -s tests`.

## Review Focus

- Old deep link `#/anlati?n=<event>` or `?w=w9` (no `t`) must open the **event map** page, not the explainer.
- Unknown `?t=` value on `/anlati` falls back to the explainer; the nav pill and sub-tab highlight must match the page shown.
- A week whose coded events were all rejected in Yönetim (`pk.empty`) still renders the event page's empty message and week bar.
- A bias whose id is only an alias (`BG7ALIAS`) or missing from `D.BR` must render the plain link without a broken expander.
- Event cards in *Tüm olaylar* use a stretched link (`.xstretch`): the explainer control must be clickable without navigating to the event.
- Nasıl çalışır chapter switch from the bottom of a long chapter (Kavram kütüphanesi) to a short one, on desktop TOC, mobile `<select>`, prev/next links, and when the page is embedded in an auto-sized iframe (the claude.ai artifact).

## File Structure

- `site/js/v7/logic.js` — add `anPage(q)` (which Anlatı page a query shows) and `biasBrief(k, reg, alias)` (short bias text or null).
- `site/js/v7/core.js` — NAV/SUB for the new topic; `biasChip(f)` markup helper.
- `site/js/v7/anlati.js` — split `pgAnlati` into three page functions behind one dispatcher.
- `site/js/v7/anlativ.js` — `anRoom()` loses its in-page TOC buttons; add links to the map pages.
- `site/js/v7/olay.js`, `site/js/app.js` (`sCard`/`bg7CardLine`, `SUB["/olaylar"]`, footer link) — use `biasChip`, drop Anlatı from Olaylar' sub-tabs.
- `site/js/v7/yontem.js` — `ymGo`, deep-link branch of `wireYontem`.
- `site/styles.css` — `.bx*` explainer styles, `.an-nav`.
- `site/tests/logic.test.cjs`, `site/tests/smoke.cjs`, new `site/tests/iframe-scroll.cjs`.

---

### Task 1: Nasıl çalışır chapters open at their start

**Files:**
- Modify: `site/js/v7/yontem.js` (`ymGo`, last lines of `wireYontem`)
- Create: `site/tests/iframe-scroll.cjs`

**Interfaces:**
- Produces: `ymScrollTo(el: Element): void` in `yontem.js` — scrolls so `el`'s top sits 72 px below the viewport top and works when the page lives in an auto-sized iframe.

Root cause (hypothesis to confirm in Step 2): `ymGo` uses `window.scrollTo(...)`. In a normal tab that works (verified with Playwright: lands at the layout top). In the claude.ai artifact the page sits in an iframe sized to its content, so `window.scrollTo` moves only the iframe's own (non-scrollable) viewport; the host keeps its old offset and, after a long chapter is replaced by a short one, rests at the bottom. `Element.scrollIntoView` scrolls ancestor browsing contexts too, and the deep-link branch already uses it.

- [ ] **Step 1: Write the harness test** `site/tests/iframe-scroll.cjs`: serve `public/`, open an outer page containing `<iframe src="/index.html#/yontem">` whose height is set to the inner `document.documentElement.scrollHeight` on every inner `ResizeObserver` tick (via `postMessage`), outer page scrolls. From the outer page: scroll to the bottom, click `.ym-toc a[href$="s=olay"]` inside the frame, then assert `Math.abs(outerScrollY - (frameTop + innerLayTop - 72)) < 24` for chapters `kavramlar → olay → sinir`.
- [ ] **Step 2: Run it** `NODE_PATH=$(npm root -g) node site/tests/iframe-scroll.cjs` → Expected: FAIL (outer offset stays near the old bottom). If it passes, stop and instrument `ymGo` with `console.log(pageYOffset)` in the real artifact before changing code; do not ship a speculative fix.
- [ ] **Step 3: Implement** `ymScrollTo(el)` as `el.style.scrollMarginTop="72px"; el.scrollIntoView({block:"start",behavior:"instant"})`, and use it in `ymGo` (target: `document.querySelector(".ym-lay")`) and in the final `tg` branch of `wireYontem` (replace the `setTimeout(...scrollIntoView...)`, keep the 30 ms delay). Keep the existing Lenis path: if `MOTION.lenis` exists call `MOTION.lenis.scrollTo(el,{immediate:true,force:true,offset:-72})` first.
- [ ] **Step 4: Re-run** the harness and `node site/tests/smoke.cjs public out "#/yontem"` → Expected: both pass. Add a 390 px case that changes chapter through `.ym-sel select` and asserts `pageYOffset` ≈ layout top − 72.
- [ ] **Step 5: Commit** `fix(yontem): chapters open at their start inside the artifact iframe`.

---

### Task 2: Short optional bias explanation

**Files:**
- Modify: `site/js/v7/logic.js`, `site/js/v7/core.js`, `site/js/v7/olay.js:83` (`olayFinding`), `site/js/app.js` (`bg7CardLine`), `site/styles.css`
- Test: `site/tests/logic.test.cjs`, `site/tests/smoke.cjs`

**Interfaces:**
- Produces: `biasBrief(k: string, reg: {[k]: {k,tr,en,df,cat,use}}, alias: (id)=>string): {name: string, en: string, text: string} | null` — `text` is `df` (the Turkish one-line definition); null when the key is absent or `df` is empty.
- Produces: `biasChip(f: {id,name}): string` — HTML: `<span class="bx"><a class="lnk" href="#/yontem?s=kavramlar&k=…">name</a><button type="button" class="bx-b" aria-expanded="false" aria-controls="bx-<id>">Kısaca ne demek?</button><span class="bx-t" id="bx-<id>" hidden>…</span></span>`; when `biasBrief` is null it returns only the link.
- Consumes: `BREG`, `bg7k` from `app.js`.

- [ ] **Step 1: Write failing tests** in `logic.test.cjs`: `biasBrief("salience-bias", {"salience-bias":{tr:"Belirginlik yanlılığı",en:"Salience Bias",df:"Göze çarpan…"}}, x=>x)` returns `{name:"Belirginlik yanlılığı", en:"Salience Bias", text:"Göze çarpan…"}`; `biasBrief("nope", {}, x=>x)` is `null`; alias `"base-rate-fallacy"→"base-rate"` resolves through the `alias` argument; empty `df` gives `null`.
- [ ] **Step 2: Run** `node --test site/tests/logic.test.cjs` → Expected: FAIL `biasBrief is not defined`.
- [ ] **Step 3: Implement** `biasBrief` in `logic.js` and export it in the `L` object at the bottom; implement `biasChip` in `core.js` (escape everything with `esc`).
- [ ] **Step 4: Wire the button**: one delegated click handler in `core.js` (like the `.gl` glossary handler) toggles `hidden` on `#bx-<id>` and `aria-expanded`; it must `stopPropagation` and `preventDefault` so it never triggers the `.xstretch` card link.
- [ ] **Step 5: Use it**: `olayFinding` renders `biasChip(f)` in the `<h4>` instead of the bare link; `bg7CardLine` renders `fs.map(biasChip)` (cards: place chips above the stretched link with `.xcard .bx{position:relative;z-index:2}`).
- [ ] **Step 6: Styles** `.bx-b` (44 px min target at ≤ 600 px, mono 12 px, underline dashed), `.bx-t` (small paper panel, `max-width:46ch`), both themes via existing tokens.
- [ ] **Step 7: Smoke assertion**: on `#/olay?e=s5450` (has a review) click `.bx-b`, assert the `.bx-t` is visible, `location.hash` unchanged, no console errors; on `#/olaylar` click a card's `.bx-b` and assert the hash did **not** change to `#/olay…`.
- [ ] **Step 8: Run** logic tests + `node site/tests/smoke.cjs public out "#/olay?e=s5450" "#/olaylar"` → Expected: pass. Commit `feat: inline short bias explanations (olaylar, olay)`.

---

### Task 3: Anlatı haritası as its own topic

**Files:**
- Modify: `site/js/v7/core.js` (NAV, SUB), `site/js/app.js` (`SUB["/olaylar"]` line ~4678, footer link ~5271, `NAV_SUB` text in `logic.js:206`), `site/js/v7/anlati.js`, `site/js/v7/anlativ.js`, `site/js/v7/home.js:34`, `site/styles.css`
- Test: `site/tests/logic.test.cjs`, `site/tests/smoke.cjs` (default route list + `--expect-nav`)

**Interfaces:**
- Produces: `anPage(q: {t?: string, n?: string, w?: string, v?: string}): "nasil" | "sezon" | "olay"` in `logic.js`. Rules: `q.t` in the three names wins; otherwise any of `n`, `w`, `v` present → `"olay"`; otherwise `"nasil"`.
- Produces: `pgAnlati(q)` stays the single route function and dispatches: `anPageNasil()`, `anPageSezon()`, `anPageOlay(q)` in `anlati.js`.
- Nav: `NAV` gets `["/anlati","Anlatı haritası",[]]` between `/olaylar` and `/oruntu`; `/olaylar` no longer lists `/anlati` as a child. `SUB["/anlati"] = [["/anlati","nasil","Nasıl okunur"],["/anlati","sezon","Sezon haritası"],["/anlati","olay","Olay haritası"]]`; the sub-tab for `nasil` must be the page with no query.

Page content (moved, not rewritten):
- **Nasıl okunur** (`?t=nasil`, default): `v7Intro()` header + `anRoom()`; replace its in-page `.an-toc` buttons with links to `#/anlati?t=sezon` and `#/anlati?t=olay`.
- **Sezon haritası** (`?t=sezon`): header + `anSeason()` + `anTimeline()`.
- **Olay haritası** (`?t=olay`, also any `n/w/v`): the current "Olay olay" section (week bar, event chips, Akış/Ağ/Tablo, `anSankey`, `anMatrix`), `v7Body`, the week strip, and `olayReview(e)` (from Task 2) so a reviewed event's bias chips appear here too. All internal links produced by `v7ViewBar`, week bar and event chips keep `#/anlati?w=…&n=…` (they imply the olay page).

- [ ] **Step 1: Write failing tests** for `anPage`: `{}`→`"nasil"`; `{t:"sezon"}`→`"sezon"`; `{n:"w9-s1"}`→`"olay"`; `{w:"w9",v:"ag"}`→`"olay"`; `{t:"bogus"}`→`"nasil"`; `{t:"nasil",n:"x"}`→`"nasil"`.
- [ ] **Step 2: Run** → Expected: FAIL `anPage is not defined`.
- [ ] **Step 3: Implement** `anPage` and export it.
- [ ] **Step 4: Navigation edits**: update `NAV`, add `SUB["/anlati"]`, remove the Anlatı entry from `SUB["/olaylar"]` and `SECTIONS`' `/olaylar` comment/children, fix `NAV_SUB["/olaylar"]` text ("Bütün olaylar, kör noktalar ve resmî ilanlar") and `NAV_SUB["/anlati"]`; in `home.js` drop the `r === "/anlati"` special case (the NAV entry now exists). `subtab` highlight for `/anlati` uses `tab` = `t`; make the no-`t` case count as `nasil` (set `tab` from `anPage(params)` in the router call that builds `navHTML`).
- [ ] **Step 5: Split `pgAnlati`** into the three functions above; `wireAnlati` stays one function (it guards on missing nodes). Keep the `pk.empty` branch inside the olay page.
- [ ] **Step 6: Smoke**: add routes `#/anlati`, `#/anlati?t=sezon`, `#/anlati?t=olay`, `#/anlati?w=w9`; add `--expect-nav "Olaylar,Anlatı haritası,Örüntüler,Kurumlar,Nasıl çalışır"` run; assert on `#/anlati?t=olay` that the `.subtab.on` text is "Olay haritası" and `.xnav-a.on` is "Anlatı haritası"; on `#/olay?e=<any>` the on-pill is still "Olaylar".
- [ ] **Step 7: Run** logic tests, pipeline tests, smoke on the routes above (1280/390, both themes) → Expected: all pass. Commit `feat(anlati): own topic with explainer, season and event map pages`.

---

### Task 4: Rebuild and publish

**Files:**
- Modify: `public/index.html` (generated), `README.md` (one line under "What is new in 8.1")

- [ ] **Step 1: Rebuild** `cd pipeline && python3 -c "from pathlib import Path; from capraz_pipeline import site; site.assemble(Path('../dist/capraz-8/build'), Path('../public'))"` (data build is unchanged).
- [ ] **Step 2: Full verification**: logic tests, pipeline tests, `node site/tests/smoke.cjs public out` (all default routes) plus the Task 1 harness → Expected: all pass.
- [ ] **Step 3: Artifact**: `python3 -m capraz_pipeline site --out ../dist/capraz-8/build --site <scratch>/art --fragment`, then republish `index.html` to the existing 8.1 artifact URL (only `index.html` changes; the `data/*.txt` files are kept).
- [ ] **Step 4: Commit and push** to `claude/sleepy-goodall-sd1d9r`.

---

## Self-Review

- **Spec coverage:** (1) Task 3 — new topic between Olaylar and Örüntüler, explainer page + two map pages; (2) Task 2, applied to Olaylar (cards, event page) and Anlatı (event map page via `olayReview`); (3) Task 1.
- **Step scan:** every code step names file, signature and the exact values; no step carries a function body.
- **Type consistency:** `anPage` (Task 3 test and dispatcher), `biasBrief`/`biasChip` (Task 2) are used under the same names in later tasks; `olayReview(e)` from `olay.js` is reused in Task 3.
- **Review Focus:** each line maps to a test — deep links and unknown `t` (Task 3 Step 1, 6), `pk.empty` (Task 3 Step 5), alias/missing bias (Task 2 Step 1), stretched card link (Task 2 Step 7), chapter switch on desktop/mobile/iframe (Task 1 Steps 1, 4).
- **Proportion:** the plan is shorter than the code it governs; layout of the three pages reuses existing functions rather than new markup.
- **Open assumption to confirm:** the "YZ names a bias" locations in *Anlatı haritası* are taken to be the reviewed-event block, which the current Anlatı page does not show; Task 3 adds it to the event map page. Task 1's cause is a hypothesis; Step 2 decides whether any code change is made.
