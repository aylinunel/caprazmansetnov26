# Broadsheet in Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every page a dynamic broadsheet body (serif heads and leads, number tickets, ortak band, split accordion, finding scenes, card cascades, glass, footer mark) on GSAP + ScrollTrigger + Lenis, and make the hero show both headlines with a click-to-tint.

**Architecture:** Two new v7 modules: `press.js` (string markup helpers, plain text in, escaped HTML out) and `motion.js` (library loader, Lenis, per-route `gsap.context`, component timelines keyed by `data-m`). Pure parsers live in `logic.js` with node tests. `route()` in `app.js` unmounts before render and mounts after `v3After`. The hero reuses the fog's existing `K` uniform for the tint.

**Tech Stack:** Vanilla JS (ES5 style, like the other v7 modules), GSAP 3.12.5, ScrollTrigger 3.12.5, Lenis 1.1.13, CSS in `site/styles.css`, node:test, Playwright smoke.

**Spec:** `docs/superpowers/specs/2026-11-06-broadsheet-motion-design.md` (read §11 first — it overrides earlier sections where they differ).

## Global Constraints

- Keep the Kindred tokens, the WebGL fog, existing 3D tilt and the dot effect as they are; no new colours.
- No reduced-motion mode anywhere (owner decision).
- Display font: Newsreader (`opsz,wght@6..72,400;6..72,500;6..72,600`), token `--serif:"Newsreader",Georgia,"Times New Roman",serif`. Inter stays for body, labels, data.
- Library URLs, local first: `vendor/gsap.min.js`, `vendor/ScrollTrigger.min.js`, `vendor/lenis.min.js`; fallbacks `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js`, `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js`, `https://unpkg.com/lenis@1.1.13/dist/lenis.min.js`.
- Every helper escapes text with `esc()`; only `glossTerms`/`markText` output may enter a `*Html` parameter.
- Animate transform/opacity/filter only. `#app`, `#view`, `main` end with no transform/filter/will-change.
- Never edit `public/index.html` by hand. Build: `cd pipeline && python3 -c "from pathlib import Path; from capraz_pipeline import site; site.assemble(Path('../public/data'), Path('../public'))" && cd ..` (the CLI needs sklearn; `site.py` does not).
- Tests: `node --test site/tests/logic.test.cjs`; smoke `node site/tests/smoke.cjs public /tmp/smoke [routes…]`.
- Commits end with the session's Co-Authored-By / Claude-Session trailers. Each task ends with a senior-engineer review gate (10x-Team senior-engineer lens) before the next starts.
- Ponytail: smallest change that meets the spec; no options or abstractions beyond those named here.

## Review Focus

1. **Event with no coded narrative** (Kısaca falls back to the generated line): the page shows a plain lead, no empty tickets/accordion. → test in Task 4.
2. **Long headline pair in the hero at 390×844**: card ends above the dock; type shrinks rather than overflows. → test in Task 5.
3. **Fast navigation before libraries arrive** (three hash changes inside 300 ms on a cold load): no errors, one Lenis, no stacked contexts. → test in Task 3.
4. **Libraries unavailable** (vendor and CDN blocked): every page readable, one `console.warn`, no `console.error`. → test in Task 3.
5. **Dark theme**: tickets, glass, accordion and band keep readable contrast. → screenshot check in Task 8.

---

### Task 1: Remove reduced motion; add Newsreader

**Files:**
- Modify: `site/js/app.js` (≈134–176 fog `reduce`; ≈5972), `site/js/v7/dots.js` (`dmCalm` + call sites), `site/js/v7/fog.js` (5 `dmCalm` uses), `site/js/v7/graph.js` (`g6Calm`), `site/js/v7/viz.js` (`vzCalm`), `site/styles.css` (6 `prefers-reduced-motion` blocks), `site/head.html` (font link), `site/styles.css` `:root` (`--serif`)

**Interfaces:** Produces `--serif` CSS token.

- [ ] **Step 1:** Delete each `reduce`/`*Calm` variable and function, keeping the full-motion branch of every conditional.
- [ ] **Step 2:** Delete the six `@media (prefers-reduced-motion…)` blocks.
- [ ] **Step 3:** Add Newsreader to the Google Fonts link in `site/head.html`; add `--serif` to `:root`.
- [ ] **Step 4:** Verify: `grep -rnE "reduced-motion|Calm\(|\breduce\b *=" site/` → no matches. Build, then `node site/tests/smoke.cjs public /tmp/smoke "#/" "#/olay?e=s4374"` → exit 0.
- [ ] **Step 5:** Commit `chore(site): full motion everywhere; add Newsreader`.
- [ ] **Gate:** senior review — no orphaned call sites; Turkish glyphs (ı İ ş ğ) render in Newsreader (screenshot).

### Task 2: Parsers `pNums`, `pSplitPoints`

**Files:** Modify `site/js/v7/logic.js` (+ its `module.exports`); Test `site/tests/logic.test.cjs`.

**Interfaces:**
- Consumes: `trFold(s)` from logic.js.
- Produces: `pNums(text: string) -> Array<{n:number, label:string}>` (max 3, `[]` when < 2 hits); `pSplitPoints(text: string, outlets: Array<{s:string, name:string, bloc:"left"|"right"|"mid"}>) -> Array<{text:string, outlets:string[], bloc:"left"|"right"|"mid", word:string}>` (max 5; unparseable → one panel with the full text, `outlets: []`, `bloc:"mid"`, `word:""`).

- [ ] **Step 1: Failing tests** (fixtures copied verbatim from `data/reference/narratives-7.json`):

```js
test("pNums: screenshot sentence", () => {
  assert.deepEqual(L.pNums("Jandarmanın 32 ilde FETÖ'ye yönelik düzenlediği operasyonlarda 72 şüpheli yakalandı, bunlardan 41'i tutuklandı."),
    [{ n: 32, label: "il" }, { n: 72, label: "şüpheli" }, { n: 41, label: "tutuklama" }]);
});
test("pNums: rejects scores, years, ordinals, decimals, ranges, ages; needs 2 hits", () => {
  for (const s of ["4-1 kazandı ve 3 kişi", "2030'a kadar 5 kişi", "4. dönemi 2 kişi", "18,3 milyar ve 7 kişi", "57-58'i ve 9 kişi", "14 yaşındaki 3 kişi"])
    assert.deepEqual(L.pNums(s), [], s);
});
test("pSplitPoints: w10-s5316 gives 4 panels with blocs", () => { /* fixture: that event's ayrışan text; assert length 4 and each bloc */ });
test("pSplitPoints: w8-s1652 keeps ';' inside parentheses", () => { /* assert the parenthesised segment stays in one panel */ });
test("pSplitPoints: names, slugs, folded spellings, 've', 'diğerleri'", () => { /* "TRT Haber", "ahaber", "habertürk" all resolve */ });
test("pSplitPoints: no separator → one mid panel", () => {
  assert.deepEqual(L.pSplitPoints("tek cümle", []), [{ text: "tek cümle", outlets: [], bloc: "mid", word: "" }]);
});
```
The implementer fills the three commented fixtures from the real narrative records (exact strings, exact expected blocs).

- [ ] **Step 2:** Run `node --test site/tests/logic.test.cjs` → new tests FAIL (not defined).
- [ ] **Step 3:** Implement per spec §11 items 4–5: noun whitelist (kişi, şüpheli, gözaltı, tutuklama, il, ölü, yaralı, kayıp; strip case suffixes), verb map (tutuklandı→tutuklama, gözaltına alındı→gözaltı); `;` split outside parentheses; outlet match by folded slug or name; `word` = first quoted phrase.
- [ ] **Step 4:** Run tests → all PASS (21 old + new).
- [ ] **Step 5:** Commit `feat(logic): pNums and pSplitPoints with real-narrative tests`.
- [ ] **Gate:** senior review — fixtures are real, negatives cover every rejected pattern.

### Task 3: `motion.js` — loader, Lenis, lifecycle

**Files:** Create `site/js/v7/motion.js`, `public/vendor/{gsap.min.js,ScrollTrigger.min.js,lenis.min.js}` (download the exact versions above with `curl`); Modify `pipeline/capraz_pipeline/site.py` (`V7_ORDER`: insert `"press", "motion"` after `"fog"`), `site/js/app.js` (`route()` top: `motionUnmount()`; after `v3After(...)` ≈6454: `motionMount(view)`; ≈6225 scroll reset), `site/styles.css` (lenis.css rules; `data-lenis-prevent` targets listed in spec §11.3), markup of `.mdl-box`, `.xfix-f`, `.cm3-dlg`, `.kp`, 640 px box (add `data-lenis-prevent`), `site/tests/smoke.cjs`.

**Interfaces:**
- Produces: globals `motionLoad(): Promise<boolean>`, `motionMount(root: Element): void`, `motionUnmount(): void`, `MOTION = {lenis, ctx, ready:boolean}`, and `MOTION_K: {[kind:string]: (el: Element, first: boolean) => void}` — the registry Task 4/6/7 add component timelines to (`first` = first mount after libraries load; skip elements already in view per §11.8).
- Lenis options: `{duration:1.25, easing:t=>Math.min(1,1.001-Math.pow(2,-10*t)), smoothWheel:true, anchors:false}`; driven by `gsap.ticker`, `lagSmoothing(0)`; `lenis.on("scroll", ScrollTrigger.update)`.
- `motionMount` creates `gsap.context(fn, root)`, runs `MOTION_K[el.dataset.m]` for every `[data-m]`, attaches one debounced (150 ms) `ResizeObserver` on `#view` → `ScrollTrigger.refresh()`. `motionUnmount` reverts the context and disconnects the observer. Before `MOTION.ready`, mount is a no-op that re-runs once `motionLoad` resolves.

- [ ] **Step 1: Failing smoke checks** in `smoke.cjs`: (a) `--eval` that after `#/` → `#/olay?e=s4374` → `#/kurum?s=takvim` → `#/` the count `ScrollTrigger.getAll().length` equals a fresh `#/` load; (b) cold load then three `location.hash` changes within 300 ms → no errors and `document.querySelectorAll("html.lenis").length===1`; (c) with routes to `vendor/*` and the CDN hosts aborted (`page.route`), `#/olay?e=s4374` has no console error and `#view` text length > 500; (d) opening the modal and wheeling inside it scrolls the modal, not the page.
- [ ] **Step 2:** Build + run smoke → (a)/(b) FAIL (no `ScrollTrigger`).
- [ ] **Step 3:** Implement `motion.js`, wiring and `data-lenis-prevent`; loader follows the `G6_SRC` pattern (try each source in order; on total failure `console.warn` once, `MOTION.ready=false`).
- [ ] **Step 4:** Build + full smoke → exit 0.
- [ ] **Step 5:** Commit `feat(site): motion runtime (GSAP, ScrollTrigger, Lenis) with route lifecycle`.
- [ ] **Gate:** senior review — mount/unmount placement, no leaks, scroll reset uses `force:true`, offline fallback.

### Task 4: `press.js` components on the event Kısaca

**Files:** Create `site/js/v7/press.js`; Modify `site/js/v7/olay.js` (Kısaca section), `site/js/v7/motion.js` (`MOTION_K` entries), `site/styles.css` (Broadsheet block), `site/tests/smoke.cjs`.

**Interfaces:**
- Consumes: `pNums`, `pSplitPoints` (Task 2), `MOTION_K` (Task 3), `esc`, `srcName`, `bloc`, `glossTerms`.
- Produces (all return HTML strings, all text escaped inside): `pHead(kicker: string, title: string) -> string`; `pLead(text: string) -> string`; `pTickets(nums: Array<{n,label}>) -> string` (`""` for `[]`); `pCommon(leftText: string, sharedText: string, rightText: string) -> string`; `pSplits(points) -> string` (output of `pSplitPoints`); `pGlass(n: number) -> string`. `data-m` kinds: `head`, `lead`, `tickets`, `common`, `splits`, `glass`.
- Motion per kind (spec §4): head rule `scaleX 0→1`, kicker type-in, title words rise from `blur(8px)` stagger .06; lead drop-cap scale-in + words ink `--muted→--ink` scrubbed; tickets pin `+=100%` at ≥ 901 px with counters scrubbed 0→n (phone: count on enter, 2 s); common sides from `x:∓80, rotateY:±12`; splits = hover/focus/click accordion (flex-grow .9 s `cubic-bezier(.77,0,.18,1)`), phone stacked; glass flicker yoyo. Word splitting walks DOM text nodes (spec §11.6).

- [ ] **Step 1: Failing smoke checks** on `#/olay?e=s4374`: `.v7-kisaca [data-m=lead]`, `[data-m=splits] .panel` count ≥ 2; at 390 px no horizontal scroll; after load `getComputedStyle(#app/#view/main).transform === "none"`; an event without a coded narrative (pick one from `events.json` whose narrative is missing) renders `[data-m=lead]` and no `[data-m=tickets]`/`[data-m=splits]`.
- [ ] **Step 2:** Build + smoke → FAIL.
- [ ] **Step 3:** Implement `press.js`, Kısaca markup (NE OLDU → `pLead` + `pTickets(pNums(...))`; ORTAK NOKTA → `pCommon`; AYRIŞAN NOKTA → `pSplits(pSplitPoints(...))`), CSS (Newsreader heads/leads, ticket notch mask from the Petalyx brief, accordion, `overflow-x:clip` on sliding components), `MOTION_K` timelines.
- [ ] **Step 4:** Build + smoke (full) → exit 0; `node --test` → PASS.
- [ ] **Step 5:** Commit `feat(site): broadsheet components on the event Kısaca`.
- [ ] **Gate:** senior review — escaping rule, readable without libraries, no transformed pin ancestor, YZ badge kept.

### Task 5: Hero — both headlines + tint

**Files:** Modify `site/js/v7/fog.js` (`fogHero`, `fogMount`), `site/styles.css` (`.fh*`), `site/tests/smoke.cjs` (replace the old hero-toggle check).

**Interfaces:** Consumes existing `compareHeads`, `markText`, `SPLITPAIR`, `bloc`. `fogMount` state: `S.k` starts `.5`; target per click = `0` for the left-bloc outlet, `1` for right-bloc (by bloc, not position), `.5` when the pressed button is clicked again.

- [ ] **Step 1: Failing smoke checks** at 1280 and 390: both `.fh-set` visible; no `aria-pressed="true"` at load; click first button → it has `aria-pressed="true"` and `.fh` has a side class/var for that bloc; click again → neutral; `.fh-card` bottom ≤ `.fh-dock` top; repeat on the event with the longest headline pair (find via `node -e` over `events.json` heads, record the id in the test).
- [ ] **Step 2:** Build + smoke → FAIL.
- [ ] **Step 3:** Implement per spec §2 and §11.2: three-column card (stacked ≤ 760 px) with the ORTAK band centred; delete `show()`, `swapped`, `.fh-set{visibility:hidden}`; `is-on` drives forward (`translateZ`, scale 1.02) / recede (grey, opacity .55); button `--on` from `aria-pressed`; CSS gradient tint when WebGL is absent; type clamps so long pairs fit.
- [ ] **Step 4:** Build + full smoke → exit 0.
- [ ] **Step 5:** Commit `feat(hero): full çapraz manşet with click-to-tint`.
- [ ] **Gate:** senior review — state machine, bloc mapping with a swapped `SPLITPAIR`, no-WebGL fallback.

### Task 6: CSS intro + incoming page turn

**Files:** Modify `site/styles.css` (intro keyframes, backdrop), `site/js/app.js` (session flag, add/remove intro class), `site/js/v7/motion.js` (incoming slide), `site/tests/smoke.cjs`.

**Interfaces:** Intro runs once per session (`sessionStorage` key `cm-intro`, wrapped in try/catch); keyframes end at `transform:none`; class removed on `animationend`. Incoming view: `gsap.from(view, {x:40, opacity:0, duration:.6, clearProps:"transform,opacity"})`.

- [ ] **Step 1: Failing smoke checks:** 2 s after cold `#/` and 1 s after a navigation, `#app`, `#view`, `main` computed transform/filter are `none`; a ticket pin on the event page still pins after navigating home → event (its `.pin-spacer` exists).
- [ ] **Step 2:** Build + smoke → FAIL (no intro yet asserts the class lifecycle).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Build + full smoke → exit 0.
- [ ] **Step 5:** Commit `feat(site): intro zoom and page-in transition`.
- [ ] **Gate:** senior review — no leftover transform; works in fragment (artifact) mode.

### Task 7: Remaining pages + footer mark (one commit per page)

**Files:** Modify `site/js/v7/home.js`, `kurum.js`, `oruntu.js` (+ `findingBlock` in `core.js` for the finding scene), `yontem.js`, `ilan.js`, `site/js/app.js` (`footer2()` ≈5228), `site/js/v7/motion.js` (`MOTION_K`: `scene`, `cascade`, `foot`), `site/styles.css`.

**Interfaces:** Consumes Task 4 helpers. Produces `data-m` kinds `scene` (claim pins while chart rows draw), `cascade` (stagger rise + pointer tilt ±8° with glare; keeps dot effect), `foot` (three dots bounce → merge → mark stroke → ring, Petalyx footer sequence). Page mapping exactly as spec §5.

- [ ] **Step 1 (per page):** Add a smoke assertion that the page's expected `data-m` kinds exist (spec §5 table) → FAIL.
- [ ] **Step 2 (per page):** Implement with the existing helpers; build; full smoke → exit 0 (existing finding/table/touch-target checks included).
- [ ] **Step 3 (per page):** Commit `feat(<page>): broadsheet body`.
- [ ] **Gate:** senior review after the last page — every route passes; no duplicated helper logic across pages.

### Task 8: Performance, screenshots, publish

**Files:** Modify `site/tests/smoke.cjs` only if a check is missing; build the artifact fragment (`site.assemble(..., title="Çapraz Manşet 8.0", fragment=True)` into the scratchpad) and republish the 8.0 artifact.

- [ ] **Step 1:** Chrome trace (Playwright `page.tracing` with CDP CPU throttle 4×) scrolling `#/olay?e=s4374` top→bottom → no task > 50 ms. Record numbers.
- [ ] **Step 2:** Screenshots 1280×800 and 390×844, light and dark: hero neutral, hero tinted left, event Kısaca mid-scroll (tickets pinned), accordion open, finding scene mid-draw → check dark-theme contrast (Review Focus 5).
- [ ] **Step 3:** Full smoke + logic tests → pass. Commit `test: performance and visual checks`.
- [ ] **Step 4:** Republish the "Çapraz Manşet 8.0" artifact at its existing URL.
- [ ] **Gate:** final senior-engineer review of the whole diff (opus), then push.
