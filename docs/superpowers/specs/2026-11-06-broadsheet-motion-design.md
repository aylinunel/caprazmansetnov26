# Broadsheet in motion: dynamic page body and full çapraz manşet hero

Date: 2026-11-06 · Status: approved in conversation (sections 1–2), spec awaiting owner review
Applies to: `site/` in caprazmansetnov26 and the published "Çapraz Manşet 8.0" artifact

## 1. Intent

The body text of every page (for example the event page's Kısaca block: NE OLDU / ORTAK NOKTA /
AYRIŞAN NOKTA) reads as plain paragraphs. The owner wants a modern, newspaper-like, reactive, 3D
and dynamic body across the whole site, using the motion vocabulary of the "Petalyx" brief (smooth
scroll, word-by-word reveals, pinned scenes with counters, a hover accordion, frosted glass, an intro
zoom, an animated footer mark) without its cherry-blossom content or palette.

### Owner decisions (2026-11-06)
| Topic | Decision |
|---|---|
| Body direction | **Broadsheet in motion**: editorial type, drop caps, column rules, scroll-driven reveals, pinned numbers, side-tinted quotes |
| Hero click | **Tint the whole hero** toward the clicked side |
| Motion engine | First "native, no libraries", then superseded: **"I do not want a result that is basic; you can increase the size"** → full Petalyx stack: GSAP + ScrollTrigger + Lenis |
| Scope | **All pages, one shared system** |
| Display type | **Add a news serif** (Newsreader) for heads, leads and pull quotes; Inter stays for body, labels and data |
| Existing elements | Keep the previous 3D elements, the fog, the dot effect and the Kindred tokens **as they are** |
| Reduced motion | **No reduced-motion mode; increase dynamics instead.** Existing `prefers-reduced-motion` guards are removed. (Raised with the owner: readers with the OS setting also get full motion.) |

### Success criteria
- No page body is a run of plain paragraphs: every page uses the shared components in §4.
- The hero always shows both headlines with the shared words in the middle; clicking a label tints it.
- Motion runs at 60 fps on a mid-range phone (transform/opacity/filter only; no layout animation).
- The hero still paints before the motion libraries load (they are deferred).
- Route changes leave no orphaned ScrollTriggers, Lenis instances or animation loops.
- The smoke test passes on every route with no console errors.

## 2. Hero (section 1, approved)

Markup is built by `fogHero(e)` in `site/js/v7/fog.js`; the WebGL fog and the 3D tilt stay as they are.

- **Both headlines at once.** Desktop: three columns — left headline · ORTAK OLAN band (centre) · right
  headline. Phone (≤ 760 px): stacked — left, band, right. Differing words keep their side colour via
  the existing `compareHeads` marks; shared words stay neutral.
- **Labels below.** The two outlet buttons (`.fh-toggle`, name · side · yerleşim) stay. Initial state:
  neutral, neither pressed, both headlines equal.
- **Click a label:** fog, sky and the centre band tint to that side's hue (`--left` / `--right`) over
  ≈ 0.6 s (fog via a new tint uniform; CSS gradient fallback when WebGL is unavailable). The clicked
  headline comes forward (`translateZ`, slight scale, full saturation); the other recedes, greys and
  fades to ≈ 0.55. Clicking the pressed label again returns to neutral; clicking the other swaps with a
  slight `rotateY` turn.
- **Intro zoom (first load of a session):** `#app` starts at scale 0.92 with 28 px corners over a
  blurred, side-tinted backdrop and grows to full screen (1.4 s, expo.inOut). "Aynı olay, farklı
  manşet." reveals word by word from blur; the toggle and CTA follow.
- **Scroll:** hero title parallaxes up (yPercent −60), the card sinks slightly, glass squares flicker.

## 3. Motion engine

- **Libraries** (loaded once, after the hero has painted, from allowed CDNs, exact versions):
  `gsap@3.12.5` and `ScrollTrigger@3.12.5` from cdnjs, `lenis@1.1.13` from unpkg.
  Loader: `motionLoad()` in a new `site/js/v7/motion.js`, same pattern as `G6_SRC` in `graph.js`.
- **Smooth scroll:** one Lenis instance (duration 1.25, expo ease) driven by `gsap.ticker`;
  `lenis.on("scroll", ScrollTrigger.update)`; in-page `#` links use `lenis.scrollTo`.
- **Lifecycle:** `motionMount(root)` runs from the existing post-render hook (`app.js` ≈ line 4290,
  beside `g6Mount`/`dmMount`/`fogMount`). Each mount creates a `gsap.context(root)`; `motionUnmount()`
  reverts the previous context (kills its ScrollTriggers and tweens) before the next route renders.
- **Before libraries arrive:** components render at their final, readable state (no `opacity:0`
  waiting); the first mount after load animates from that state.
- **Page turn between routes:** outgoing view `rotateY(-8deg) translateZ(-120px)` + fade (0.45 s),
  incoming view slides in from `x: 40` (0.6 s); scroll resets via `lenis.scrollTo(0, {immediate:true})`.
- **Reduced motion:** not honoured (owner decision). Remove the guards at `app.js:134`, `app.js:5972`
  and every `@media (prefers-reduced-motion)` block in `styles.css`.

## 4. Body components (section 2, approved)

All built as string helpers in a new `site/js/v7/press.js` (same pattern as the other v7 modules) and
styled in a new "Broadsheet" block of `site/styles.css`. Each has a `data-m="<kind>"` hook read by
`motionMount`.

| Component | Markup helper | Look | Motion |
|---|---|---|---|
| Section head | `pHead(kicker, title)` | Mono all-caps kicker, Newsreader title, full-width hairline rule | Rule draws left→right (scaleX), kicker types in, title words rise from blur (stagger 0.06) |
| Lead | `pLead(text)` | Newsreader 26–34 px, drop cap (3 lines) | Drop cap scales in; words ink from `--muted` to `--ink` scrubbed with scroll |
| Number tickets | `pTickets(nums)` | Notched ticket cards (Petalyx mask), big tabular number, label, tinted by side | Section pins (desktop, `+=100%`); counters scrub 0→value; cards rise in stagger. Phone: no pin, counters run on enter |
| Ortak band | `pCommon(left, shared, right)` | Left sentence · frosted centre band · right sentence | Left slides from `x:-80, rotateY:12`, right from `x:80, rotateY:-12`, meeting the band; band glass fades in |
| Split accordion | `pSplits(points)` | Full-width row of panels, giant key word/number in side colour, outlet chips | Hover/focus/tap activates one panel (flex-grow 0.9 s); inactive panels clip the giant word; text of the active panel reveals from blur |
| Finding scene | wraps existing `findingBlock` | Claim in Newsreader, chart below | Claim pins while chart rows draw in sequence with scroll; key numbers count up |
| Card cascade | wraps feed/event/outlet cards | Existing cards + dot effect | Staggered rise; pointer-driven 3D tilt (±8°) with light glare |
| Glass field | `pGlass(n)` | Frosted squares near section heads, side-tinted | Flicker yoyo (opacity 1→0.15, random delays); parallax drift |
| Footer mark | footer in `core.js` | Three dots + Ç mark + ring | Dots bounce, merge, mark strokes in, ring draws (Petalyx footer sequence) |

### Number extraction (for tickets)
`pNums(text)` in `logic.js` (pure, testable): finds Turkish count phrases such as "72 şüpheli",
"41'i tutuklandı", "32 ilde" → `[{n:72, label:"şüpheli"}, {n:41, label:"tutuklama"}, {n:32, label:"il"}]`.
Up to 3 per block; side tint comes from which bloc's outlets stress that number in AYRIŞAN NOKTA when
known, else neutral.

### Splits parsing (for the accordion)
AYRIŞAN NOKTA text is `"<outlets> <point>; <outlets> <point>; …"`. `pSplitPoints(text, SRC)` (pure,
in `logic.js`) splits on `;`, separates leading outlet slugs from the point, and assigns each panel the
majority bloc of its outlets. Unparseable text falls back to one panel with the full sentence.

## 5. Page mapping

| Page | Components |
|---|---|
| Home | Hero (§2) · section heads · card cascade for the weekly splits feed · how-it-works steps as the split accordion · number tickets for the site totals · glass field · footer |
| Event (`#/olay`) | Section heads · Kısaca: lead (NE OLDU) + number tickets + Ortak band (ORTAK NOKTA) + split accordion (AYRIŞAN NOKTA) · headlines list as card cascade · narrative/coding blocks with section heads |
| Outlet (`#/kurum`) | Section heads · Kısaca as lead · metrics as number tickets · findings as finding scenes · recent splits as card cascade |
| Örüntüler (4 question pages) | Section heads · every finding block as a finding scene · networks keep G6 and enter with a scale-in |
| Nasıl çalışır / Sözlük | Section heads · lead · steps as split accordion · glossary terms as card cascade |
| İlan | Section heads · overview numbers as tickets · results as card cascade |

## 6. Type and tokens

- `site/head.html` font link adds `Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600` (Turkish glyphs
  supported); new token `--serif:"Newsreader",Georgia,"Times New Roman",serif`.
- No new colours: components use the Kindred tokens (`--paper`, `--ink`, `--muted`, `--line`, `--left`,
  `--right`, `--mid`). Glass uses `color-mix` of the side token with transparent.
- Type scale additions: lead 26/34 px, ticket number clamp(36px, 5vw, 64px), accordion giant word
  clamp(120px, 26vh, 300px).

## 7. Files

| File | Change |
|---|---|
| `site/js/v7/motion.js` (new) | Library loader, Lenis, `motionMount`/`motionUnmount`, page turn, intro zoom, per-component timelines |
| `site/js/v7/press.js` (new) | Component markup helpers (§4) |
| `site/js/v7/logic.js` | `pNums`, `pSplitPoints` (pure) |
| `site/js/v7/fog.js` | Hero layout (both headlines + centre band), tint state, tint uniform |
| `site/js/v7/olay.js`, `home.js`, `kurum.js`, `oruntu.js`, `yontem.js`, `ilan.js`, `core.js` | Use the components (§5); footer mark |
| `site/js/app.js` | Call `motionUnmount` before render and `motionMount` after; remove reduced-motion guards |
| `site/styles.css` | Broadsheet block; remove reduced-motion blocks |
| `site/head.html` | Newsreader |
| `pipeline/capraz_pipeline/site.py` | Add `press`, `motion` to `V7_ORDER` (after `fog`) |
| `site/tests/logic.test.cjs` | Tests for `pNums`, `pSplitPoints` |
| `site/tests/smoke.cjs` | Visit every route; assert no console errors, components present, no horizontal scroll, ScrollTrigger count resets between routes |

## 8. Error handling

- Library load fails (CDN blocked): components stay in their final readable state; Lenis is skipped;
  native scroll works. One console warning, no error.
- No WebGL: hero tint uses the CSS gradient fallback; everything else unchanged.
- Parsing fails (`pNums` finds nothing, `pSplitPoints` can't split): render the plain lead / one-panel
  accordion instead of an empty component.
- G6 networks and the fog keep their own lifecycles; `motionUnmount` does not touch them.

## 9. Testing

1. Unit (`node site/tests/logic.test.cjs`): `pNums` on the screenshot's sentence returns 72/41/32;
   `pSplitPoints` on its AYRIŞAN text returns 4 panels with correct blocs; malformed input falls back.
2. Smoke (Playwright, `site/tests/smoke.cjs`): every route renders; no console errors; no horizontal
   scroll at 390 px and 1280 px; ScrollTrigger instances after navigating home → event → outlet → home
   equal those of a fresh home load.
3. Visual (screenshots at 1280×800 and 390×844, light and dark): hero neutral, hero tinted left, event
   Kısaca mid-scroll (tickets pinned), accordion with a panel open, a finding scene mid-draw.
4. Performance: Chrome trace on the event page at 4× CPU throttle shows no long tasks > 50 ms during
   scroll.

## 10. Out of scope

- The data contract / architecture migration (`.10x/decisions/architect/scalable-architecture.md`).
  Note for that plan: motion libraries load after first paint and are excluded from the 120 KB
  cold-home gate by owner decision; the 2.5 s hero gate still applies.
- New content, copy or claims: components re-present existing text only.
