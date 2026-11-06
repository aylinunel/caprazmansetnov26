// node smoke.cjs <siteDir> <outDir> [routes...]  — exits 1 on console error, h-scroll at 390px, or .v7-empty-bug
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const argv = process.argv.slice(2), ni = argv.indexOf("--expect-nav");
const expectNav = ni >= 0 ? argv.splice(ni, 2)[1] : null;
const evals = [];
for (let ei = argv.indexOf("--eval"); ei >= 0; ei = argv.indexOf("--eval")) { const v = argv.splice(ei, 2)[1], k = v.indexOf("|"); evals.push([v.slice(0, k), v.slice(k + 1)]); }
const clicks = [];
for (let ci = argv.indexOf("--click"); ci >= 0; ci = argv.indexOf("--click")) { const v = argv.splice(ci, 2)[1], k = v.indexOf(":"); clicks.push([v.slice(0, k), v.slice(k + 1)]); }
const [siteDir, outDir, ...argRoutes] = argv;
if (!siteDir || !outDir) { console.log("usage: node smoke.cjs <siteDir> <outDir> [routes...]"); process.exit(0); }
const ROUTES = argRoutes.length ? argRoutes : ["#/", "#/olaylar", "#/olay?e=s4374", "#/oruntu?q=secim", "#/oruntu?q=dil",
  "#/oruntu?q=anlati", "#/oruntu?q=hiz", "#/kurumlar", "#/kurum?s=takvim", "#/kurum?s=aa", "#/kurumlar?t=karsilastir&a=takvim&b=birgun", "#/karsilastir", "#/yontem", "#/ilan", "#/benim", "#/yonetim?t=bilissel"];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".bin": "application/octet-stream", ".json": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const root = path.resolve(siteDir);
  const srv = http.createServer((q, s) => {
    const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"));
    if (!f.startsWith(root) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); s.end(fs.readFileSync(f));
  }).listen(0);
  const port = srv.address().port, browser = await chromium.launch(), fails = [];
  let first = true;
  for (const route of ROUTES) for (const w of [1280, 390]) for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w === 390 ? 844 : 800 } });
    await ctx.addInitScript((t) => { try { localStorage.setItem("yh-theme", t); } catch (e) {} }, theme);
    const page = await ctx.newPage(), tag = `${route} ${w} ${theme}`;
    page.on("pageerror", (e) => fails.push(`${tag}: pageerror ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") fails.push(`${tag}: console ${m.text()}`); if (/Too many active WebGL contexts/.test(m.text())) fails.push(`${tag}: WebGL context leak: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${port}/index.html${route}`);
    await sleep(first ? 9000 : 2500); first = false;
    await page.waitForFunction(() => !document.getElementById("app").classList.contains("intro"), null, { timeout: 6000 }).catch(() => {}); /* measure after the intro zoom */
    if (w === 390 && await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fails.push(`${tag}: horizontal scroll`);
    if (w === 390) {
      /* Touch targets: every a/button/[role=link]/summary in #view is >= 44x44, unless inline text in a paragraph (.lnk, .gl always allowed). */
      const small = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("#view a, #view button, #view [role=link], #view summary")) {
          if (el.closest(".lnk, .gl, [hidden]") && (el.matches(".lnk, .gl") || el.closest("[hidden]"))) continue;
          /* EXEMPT: a.xstretch's ::after covers its whole card, so the card is the hit area */
          const r = (el.matches("a.xstretch") ? el.closest(".xcard, .v7-fc") || el : el).getBoundingClientRect();
          if (!r.width || !r.height || el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue;
          if (r.width >= 43.5 && r.height >= 43.5) continue;
          const p = el.closest("p, li, dd, figcaption, .sub, .lede");
          if (p && p !== el && getComputedStyle(el).display === "inline" && p.textContent.replace(el.textContent, "").trim().length > 12) continue; // inline text link
          /* EXEMPT_SMALL: add selectors here only with a comment saying why 44px is impossible */
          out.push((el.tagName + "." + (el.className || "").toString().split(" ")[0] + " " + el.textContent.trim().slice(0, 24) + " " + Math.round(r.width) + "x" + Math.round(r.height)));
        }
        return out;
      });
      /* EXEMPT: #/yonetim is the dense admin review table, out of scope for the phone pass (spec section 7); it still gets the no-overflow rule below */
      if (small.length && !route.startsWith("#/yonetim")) fails.push(`${tag}: ${small.length} touch target(s) < 44px: ${[...new Set(small)].slice(0, 6).join(" | ")}`);
      const wide = await page.evaluate(() => [...document.querySelectorAll("#view *")].filter((e) => {
        const r = e.getBoundingClientRect(); if (!(r.width && (r.right > innerWidth + 1 || r.left < -1)) || getComputedStyle(e).position === "fixed") return false;
        /* wide content is fine inside its own scrolling or clipping box */
        for (let a = e.parentElement; a && a.id !== "view"; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return false;
        return true;
      }).slice(0, 3).map((e) => e.tagName + "." + e.className));
      if (wide.length) fails.push(`${tag}: element wider than viewport: ${wide.join(" | ")}`);
    }
    if (expectNav && w === 1280) {
      const got = (await page.$$eval(".xnav-l a", (as) => as.map((a) => a.textContent.trim()))).join(",");
      if (got !== expectNav) fails.push(`${tag}: nav "${got}" != "${expectNav}"`);
    }
    if (route.startsWith("#/olaylar?t=liste&f=konu") && w === 1280) {
      const n0 = await page.$eval("#fcount", (e) => e.textContent);
      await page.click(".v7-tchips .chip"); await sleep(800);
      const n1 = await page.$eval("#fcount", (e) => e.textContent);
      if (n0 === n1) fails.push(`${tag}: topic chip did not change event count (${n0})`);
    }
    if (route.startsWith("#/olay?e=")) {
      const ok = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const seq = [q(".xstory .xh1") || q(".phead"), q(".v7-kisaca"), q(".xspwrap"), q("#alist"), q(".v7-time")]
          .concat([...document.querySelectorAll("details.v7-deep")], [q(".v7-outsec")]);
        const nm = ["header", ".v7-kisaca", ".xspwrap", "#alist", ".v7-time", "deep", "deep", "deep", "deep", ".v7-outsec"];
        let prev = null;
        for (let i = 0; i < seq.length; i++) {
          if (!seq[i]) { if (i < 5 || i === seq.length - 1) return "missing " + nm[i]; continue; }
          if (prev && !(prev.compareDocumentPosition(seq[i]) & 4)) return "order wrong at " + nm[i];
          prev = seq[i];
        }
        if (document.querySelectorAll("details.v7-deep").length > 3) return "more than 3 deep rows";
        for (const i of document.querySelectorAll(".xbar.big i")) {
          const sp = i.querySelector("span"); if (!sp || sp.offsetParent === null) continue;
          const a = sp.getBoundingClientRect(), b = i.getBoundingClientRect();
          if (a.left < b.left - 0.5 || a.right > b.right + 0.5) return "coverage bar label clipped: " + sp.textContent;
        }
        const sh = q(".xspwrap h2"); if (!sh || sh.textContent.trim() !== "En farklı iki başlık") return "split block title";
        if (!/Başka iki kurumu karşılaştır/.test(q(".xspwrap").textContent)) return "picker label";
        if (!q("#asort") || q("#asort").value !== "lean") return "headline sort not lean";
        if (!/kurum verdi · \d+ sol, \d+ merkez, \d+ sağ/.test(q(".xstory").textContent)) return "header count line";
        for (const el of document.querySelectorAll("[data-cm3], .cm3-voices, .cm3-counter, .xvoices"))
          if (el.compareDocumentPosition(q(".v7-kisaca")) & 4) return "v3 block before kisaca: " + el.className;
        const yz = [].map.call(document.querySelectorAll(".yz"), (x) => x.textContent).join(" ");
        return /bağlam gerekli|desteklendi|inceleyiciler ayrıştı/.test(yz) ? "status label in .yz" : "ok";
      });
      if (ok !== "ok") fails.push(`${tag}: ${ok}`);
    }
    if (route.startsWith("#/oruntu?q=")) {
      const bad = await page.evaluate(() => {
        const fs = [...document.querySelectorAll(".v7-find")];
        if (fs.length < 3) return `only ${fs.length} .v7-find`;
        if (fs.some((f) => !((f.querySelector(".v7-means") || {}).textContent || "").replace("Bu ne anlama geliyor.", "").trim())) return "empty .v7-means";
        const v = document.querySelector(".v7-viz");
        if (!v || !v.querySelector("[data-go],[data-tip],[data-vtip],.vz-dp,.vz-lp")) return "first .v7-viz has no interactive mark";
        if (/bağlam gerekli/i.test(document.body.innerText)) return "text 'bağlam gerekli'";
        const stat = /φ|ρ| r = | p = |%95|güven aralığı|PCA|Mantel|binom|Wilson|permütasyon/;
        for (const f of fs) {
          const c = (f.querySelector(".v7-claim") || {}).textContent || "";
          if (stat.test(c)) return `#${f.id} claim has a statistical term: ${c.slice(0, 90)}`;
          if (/NaN|undefined/.test(c)) return `#${f.id} claim has NaN/undefined`;
          if (!f.querySelector(".v7-read")) return `#${f.id} has no .v7-read caption`;
          if (f.querySelector(".v7-viz").querySelector(".vz-r,.vz-dp,.vz-lp,.g6-box,.fig-body,.or-sc,.or-bar") && !f.querySelector(".v7-tbl table")) return `#${f.id} chart has no .v7-tbl table`;
        }
        return "";
      });
      if (bad) fails.push(`${tag}: oruntu ${bad}`);
    }
    if (route === "#/kurum?s=takvim" && w === 1280 && theme === "light") {
      for (const key of ["arts", "evs"]) {
        const sel = `details[data-lazy="${key}"]`;
        if (!(await page.$(sel))) { fails.push(`${tag}: missing ${key} row`); continue; }
        if (await page.$eval(sel + " .v7-lz", (e) => e.childElementCount)) fails.push(`${tag}: ${key} built before open`);
        await page.click(sel + " summary"); await sleep(600);
        if (!(await page.$eval(sel + " .v7-lz", (e) => e.childElementCount))) fails.push(`${tag}: ${key} row empty after open`);
      }
    }
    if (route.startsWith("#/kurum?s=")) {
      const bad = await page.evaluate(() => {
        const n = document.querySelectorAll('.v7-kurum-lines a[href^="#/oruntu"]').length;
        if (n < 4) return `only ${n} oruntu links`;
        if (document.querySelectorAll(".v7-kurum-lines .yz").length !== 1) return "need exactly one .yz";
        if (/bağlam gerekli|desteklendi/i.test(document.querySelector(".v7-kurum-lines").textContent)) return "status word in lines";
        return "";
      });
      if (bad) fails.push(`${tag}: kurum ${bad}`);
    }
    if (route.startsWith("#/yontem")) {
      const bad = await page.evaluate((r) => {
        const ids = ["veri", "olay", "dil", "anlati", "yz", "yzicerik", "turkiye", "kavramlar", "sinir", "kaynak"];
        const miss = ids.filter((i) => !document.getElementById(i));
        if (miss.length) return "missing section ids " + miss.join(",");
        const yz = [].map.call(document.querySelectorAll(".yz"), (x) => x.textContent).join(" ");
        if (/bağlam gerekli|desteklendi|inceleyiciler ayrıştı/i.test(yz + " " + document.querySelector(".xpaper").textContent)) return "status label on page";
        const tb = [...document.querySelectorAll(".v7-tr-block")];
        if (tb.length < 9) return `only ${tb.length} .v7-tr-block`;
        if (tb.some((b) => [...b.querySelectorAll("dt")].map((d) => d.textContent).join("|") !== "Sorun|Ne yaptık|Sınır" || [...b.querySelectorAll("dd")].some((d) => d.textContent.trim().length < 20))) return "tr-block parts incomplete";
        if (/NaN|undefined|\[object/.test(document.querySelector(".v7-tr").textContent)) return "NaN/undefined in tr blocks";
        const cs = document.querySelectorAll(".v7-concept").length;
        if (cs < 129) return `only ${cs} .v7-concept`;
        if (document.querySelectorAll(".v7-concept .yz-badge").length < 1) return "no yz badge in concepts";
        return "";
      }, route);
      if (bad) fails.push(`${tag}: yontem ${bad}`);
      if (route === "#/yontem?s=kavramlar") {
        await page.fill("#cq", "kisiye saldiri"); await sleep(300);
        const n = await page.evaluate(() => [...document.querySelectorAll(".v7-concept")].filter((c) => !c.hidden).length);
        if (n < 1 || n > 20) fails.push(`${tag}: folded search 'kisiye saldiri' shows ${n}`);
        await page.fill("#cq", ""); await page.click('.v7-cl-chips [data-tier="detected"]'); await sleep(200);
        const d = await page.evaluate(() => [...document.querySelectorAll(".v7-concept")].filter((c) => !c.hidden).every((c) => c.dataset.tier === "detected") && [...document.querySelectorAll(".v7-concept")].filter((c) => !c.hidden).length);
        if (!d) fails.push(`${tag}: tier chip filter wrong`);
        await page.click('.v7-cl-chips [data-tier="all"]');
      }
    }
    if (route === "#/ilan") {
      const ov = await page.evaluate(() => ({ line: !!document.querySelector(".vz-line"), rows: !!document.querySelector(".vz .vz-r"), cv: [...document.querySelectorAll("canvas.vz-cv")].map((c) => c.width > 0 && !!c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v)) }));
      if (!ov.line || !ov.rows || !ov.cv.length || !ov.cv.every(Boolean)) fails.push(`${tag}: ilan overview missing .vz-line / .vz lollipop / painted canvas.vz-cv ${JSON.stringify(ov)}`);
      const rows = async (t) => { await page.fill("#ilanq", t); await sleep(400); return page.evaluate(() => [document.querySelectorAll(".v7-ilan-row").length, (document.querySelector("#ilanres") || {}).textContent || ""]); };
      const [n] = await rows("icra");
      if (n < 1) fails.push(`${tag}: ilan 'icra' gives no .v7-ilan-row`);
      const [, txt] = await rows("zzzz");
      if (!txt.includes("Bu aramayla eşleşen ilan bizim derlemimizde yok. Resmî ilanların tamamı için ilan.gov.tr adresine bakabilirsiniz.")) fails.push(`${tag}: ilan empty-state text missing`);
      await rows("");
      if (w === 390 && await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fails.push(`${tag}: ilan horizontal scroll after typing`);
    }
    /* Broadsheet components each page must carry (spec §5), by route prefix */
    const KINDS = { "#/": "head cascade splits tickets glass", "#/kurum?s=": "head lead tickets scene cascade", "#/oruntu?q=": "head scene", "#/yontem": "head lead splits cascade" };
    const want = Object.keys(KINDS).find((p) => p.endsWith("=") ? route.startsWith(p) : route === p);
    if (want) {
      const miss = await page.evaluate((ks) => ks.split(" ").filter((k) => !document.querySelector(`#view [data-m=${k}]`)), KINDS[want]);
      if (miss.length) fails.push(`${tag}: missing [data-m] ${miss.join(",")}`);
    }
    if (await page.$(".xtick")) fails.push(`${tag}: .xtick present`);
    if (route === "#/") {
      const g = await page.evaluate(() => { const b = [...document.querySelectorAll(".fh [role=group] button")]; return [b.length, b.filter((x) => x.getAttribute("aria-pressed") === "true").length, (document.querySelector(".fh-cta") || {}).textContent, document.querySelector(".fh-cta") && document.querySelector(".fh-cta").getAttribute("href"), !!document.getElementById("bu-hafta")]; });
      if (g[0] !== 2) fails.push(`${tag}: .fh toggle has ${g[0]} buttons`);
      /* Hero: both headlines visible, neutral at load (none pressed, --k .5), a click tints toward the clicked outlet's bloc
         (Sol 0, Sağ 1 — by bloc, not position), the other label swaps, clicking the pressed one returns to neutral; the card ends above the dock. */
      const hero = async (lbl) => {
        const st = () => page.evaluate(() => {
          const sets = [...document.querySelectorAll(".fh-set")], bs = [...document.querySelectorAll(".fh [role=group] button")], box = (q) => document.querySelector(q).getBoundingClientRect();
          return { vis: sets.map((x) => { const r = x.getBoundingClientRect(), c = getComputedStyle(x); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && c.visibility === "visible" && +c.opacity >= .5; }),
            on: sets.map((x) => x.classList.contains("is-on")), pressed: bs.map((b) => b.getAttribute("aria-pressed")),
            side: bs.map((b) => /· Sol/.test(b.textContent) ? 0 : /· Sağ/.test(b.textContent) ? 1 : .5),
            k: +getComputedStyle(document.querySelector(".fh")).getPropertyValue("--k"), card: box(".fh-card").bottom, dock: box(".fh-dock").top };
        });
        const check = (s, want, what) => {
          if (s.vis.length !== 2 || !s.vis.every(Boolean)) fails.push(`${lbl} ${what}: both .fh-set not visible in the hero: ${s.vis}`);
          if (!(s.card <= s.dock)) fails.push(`${lbl} ${what}: .fh-card bottom ${s.card} below .fh-dock top ${s.dock}`);
          const k = want < 0 ? .5 : s.side[want];
          if (s.pressed.join() !== [0, 1].map((i) => i === want ? "true" : "false").join() || s.on.join() !== [0, 1].map((i) => i === want).join() || Math.abs(s.k - k) > .01)
            fails.push(`${lbl} ${what}: pressed ${s.pressed} is-on ${s.on} --k ${s.k}, want button ${want} and --k ${k}`);
          return s;
        };
        const click = async (n) => { await page.click(`.fh [role=group] button:nth-child(${n})`); await sleep(1500); return st(); };
        const s0 = check(await st(), -1, "load");
        check(await click(1), 0, "click 1"); check(await click(2), 1, "click 2"); check(await click(2), -1, "click 2 again");
        return s0;
      };
      if (g[0] === 2) await hero(tag);
      if (g[2] !== "Bu haftanın ayrışmalarını gör ↓" || g[3] !== "#bu-hafta" || !g[4]) fails.push(`${tag}: .fh-cta / #bu-hafta wrong: ${g}`);
      const fd = await page.evaluate(() => [document.querySelectorAll("#bu-hafta .v7-fc").length, !!document.querySelector("#bu-hafta h2"), !!document.querySelector(".v7-how [data-m=splits]"), document.querySelectorAll(".v7-hgrid .v7-hc").length, document.documentElement.scrollWidth > innerWidth]);
      if (fd[0] > 6 || !fd[1] || !fd[2] || fd[3] !== 5) fails.push(`${tag}: homepage feed/steps/links wrong: ${fd}`);
      if (w === 390 && fd[4]) fails.push(`${tag}: home horizontal scroll`);
      const bt = await page.evaluate(() => document.body.innerText);
      if (/orTap\(\)/.test(bt) || bt.indexOf('" + ') >= 0) fails.push(`${tag}: homepage text shows leaked code`);
      const hid = await page.evaluate(() => { const E = {}; CM.data.E.forEach((e) => { E[e.i] = e; }); const fh = document.querySelector(".fh"), h = fh && E[fh.getAttribute("data-e")], cards = [...document.querySelectorAll("#bu-hafta .v7-fc")].map((c) => E[c.getAttribute("href").split("e=")[1]]);
        return [h ? h.i : null, cards.some((c) => c && h && c.i === h.i), cards[0] && h ? h.p >= cards[0].p : true, h ? h.s.length >= 6 : false]; });
      if (!hid[0] || hid[1] || !hid[2] || !hid[3]) fails.push(`${tag}: hero event is not the week's biggest split (repeated in feed ${hid[1]}, p >= first card ${hid[2]}, >=6 outlets ${hid[3]}): ${hid[0]}`);
      if (w === 1280 && theme === "light") {
        for (let i = 0; i < 10; i++) { await page.evaluate(() => { location.hash = "#/olaylar"; }); await sleep(250); await page.evaluate(() => { location.hash = "#/"; }); await sleep(350); }
        const nc = await page.evaluate(() => document.querySelectorAll(".fh canvas").length);
        if (nc !== 1) fails.push(`${tag}: ${nc} .fh canvas after 10 revisits`);
      }
      if (fd[0] && w >= 1280) {
        await page.hover("#bu-hafta .v7-fc"); await sleep(250);
        if (!await page.$("#bu-hafta .v7-fc canvas.dm-word")) fails.push(`${tag}: hover adds no canvas.dm-word`);
        await sleep(1300);
        if (await page.$("canvas.dm-word")) fails.push(`${tag}: canvas.dm-word left after effect`);
      }
      if (fd[0]) {
        await page.evaluate(() => { for (let i = 0; i < 400 && !document.getElementById("feed-more").hidden; i++) document.getElementById("feed-more").click(); });
        if (await page.isVisible("#feed-more")) fails.push(`${tag}: #feed-more still visible after all cards shown`);
      }
      await page.evaluate(() => { window.__E = CM.data.E; CM.data.E = window.__E.slice(0, 1); location.hash = "#/olaylar"; });
      await sleep(600); await page.evaluate(() => { location.hash = "#/"; }); await sleep(1500);
      const zero = await page.evaluate(() => { CM.data.E = window.__E; return [document.querySelectorAll("#bu-hafta .v7-fc").length, (document.querySelector("#bu-hafta .v7-fc-none") || {}).textContent, (document.querySelector("#bu-hafta .lnk") || {}).textContent, !document.querySelector("#feed-more") || document.querySelector("#feed-more").hidden]; });
      if (zero[0] !== 0 || zero[1] !== "Bu hafta iki taraftan da verilen olay yok" || zero[2] !== "Tüm olaylar →" || !zero[3]) fails.push(`${tag}: zero-event feed wrong: ${zero}`);
      /* Longest headline pair among hero-eligible events (s3522, 288 chars, found over CM.data on 2026-11-06), staged as the week's lead. */
      const LONG = "s3522";
      await page.evaluate(([L0, h]) => { const E = window.__E, L = E.find((e) => e.i === L0), H = E.find((e) => e.i === h); window.__L = [L.f, L.p]; L.f = H.f; L.p = H.p + 1; CM.data.E = [L]; location.hash = "#/olaylar"; }, [LONG, hid[0]]);
      await sleep(600); await page.evaluate(() => { location.hash = "#/"; }); await sleep(1500);
      const staged = await page.evaluate(() => (document.querySelector(".fh") || {}).getAttribute && document.querySelector(".fh").getAttribute("data-e"));
      if (staged !== LONG) fails.push(`${tag}: could not stage ${LONG} as the hero (got ${staged})`);
      else { await hero(`${tag} ${LONG}`); await page.screenshot({ path: path.join(outDir, `hero-long-${w}-${theme}.png`) }); }
      await page.evaluate(([L0]) => { const L = window.__E.find((e) => e.i === L0); [L.f, L.p] = window.__L; CM.data.E = window.__E; }, [LONG]);
      if (w === 390 && await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fails.push(`${tag}: horizontal scroll after hero clicks`);
      if (w === 1280 && theme === "light") {
        /* The reader's pair on the event page, swapped so the right-bloc outlet comes first: the tint still follows the bloc. */
        await page.evaluate((h) => { location.hash = "#/olay?e=" + h; }, hid[0]); await sleep(1500);
        await page.evaluate(() => { const a = document.getElementById("spA"), b = document.getElementById("spB"), v = a.value; a.value = b.value; b.value = v; a.dispatchEvent(new Event("change")); });
        await page.evaluate(() => { location.hash = "#/"; }); await sleep(1500);
        const s0 = await hero(`${tag} swapped pair`);
        if (s0.side.join() !== "1,0") fails.push(`${tag} swapped pair: hero buttons are not right bloc first: ${s0.side}`);
        /* The CTA glides to #bu-hafta (Lenis when loaded) without touching the #/ route. */
        await page.click(".fh-cta"); await sleep(2200);
        const cta = await page.evaluate(() => [Math.round(document.getElementById("bu-hafta").getBoundingClientRect().top), location.hash, document.documentElement.classList.contains("lenis")]);
        if (Math.abs(cta[0]) > 80 || cta[1] !== "#/" || !cta[2]) fails.push(`${tag}: .fh-cta did not glide to #bu-hafta with Lenis (top, hash, lenis): ${cta}`);
      }
    }
    for (const [er, js] of evals) if (er === route && !(await page.evaluate(js))) fails.push(`${tag}: eval false: ${js}`);
    if (await page.$(".v7-empty-bug")) fails.push(`${tag}: .v7-empty-bug present`);
    await page.screenshot({ path: path.join(outDir, `${route.replace(/[^a-z0-9]+/gi, "_")}-${w}-${theme}.png`) });
    for (const [cr, sel] of clicks) if (cr === route) {
      const el = await page.$(sel);
      if (!el) { fails.push(`${tag}: click target ${sel} missing`); continue; }
      await el.click(); await sleep(300);
      if (sel.includes("data-vtip") && !(await page.$eval("#tip", (t) => t.classList.contains("on")))) fails.push(`${tag}: after click ${sel} #tip is not .on`);
      const want = sel.includes("th[data-dim]") ? ".v7-group" : sel.includes(".v7-out") ? ".v7-hl" : sel.startsWith(".gl") ? ".gl-pop" : null;
      if (want) {
        const n = await page.$$eval(want, (xs) => xs.filter((x) => x.offsetParent !== null).length);
        if (n < 1) fails.push(`${tag}: after click ${sel} no visible ${want}`);
      }
      if (w === 390 && await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) fails.push(`${tag}: horizontal scroll after click ${sel}`);
      await page.screenshot({ path: path.join(outDir, `${route.replace(/[^a-z0-9]+/gi, "_")}-click-${w}-${theme}.png`) });
    }
    if (route === "#/oruntu?q=secim" && w === 1280 && theme === "light") {
      await page.$eval(".gl", (e) => e.focus()); await page.keyboard.press("Tab"); await sleep(200);
      if (!(await page.evaluate(() => { const a = document.activeElement; return !!(a && a.closest(".gl-pop") && a.tagName === "A"); }))) fails.push(`${tag}: Tab from .gl does not reach popover link`);
      if (!(await page.$(".gl-pop"))) fails.push(`${tag}: .gl-pop missing after Tab`);
      await page.keyboard.press("Escape"); await sleep(200);
      if (await page.$(".gl-pop") || !(await page.evaluate(() => document.activeElement.classList.contains("gl")))) fails.push(`${tag}: Escape did not close popover and refocus .gl`);
      await page.keyboard.press("Tab"); await sleep(100); await page.keyboard.press("Shift+Tab"); await sleep(200);
      if (!(await page.$(".gl-pop"))) fails.push(`${tag}: .gl-pop missing before navigation`);
      await page.evaluate(() => { location.hash = "#/kurumlar"; }); await sleep(800);
      if (await page.$(".gl-pop")) fails.push(`${tag}: .gl-pop survives navigation`);
    }
    await ctx.close();
  }
  /* Touch: a tap on a chart row pins its tooltip; a tap elsewhere closes it. */
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fails.push(`touch: pageerror ${e.message}`));
    await page.goto(`http://127.0.0.1:${port}/index.html#/oruntu?q=secim`); await sleep(2500);
    const row = await page.$(".vz-r[data-vtip]");
    if (!row) fails.push("touch: no .vz-r[data-vtip] on #/oruntu?q=secim");
    else {
      await row.scrollIntoViewIfNeeded(); await row.tap(); await sleep(500);
      const on = () => page.$eval("#tip", (t) => t.classList.contains("on"));
      if (!(await on())) fails.push("touch: tap on .vz-r did not show #tip.on");
      else {
        await sleep(1500);
        if (!(await on())) fails.push("touch: pinned tooltip vanished by itself");
        await page.evaluate(() => { const h = document.querySelector("#view h1, #view h2"); h.scrollIntoView({ block: "start" }); });
        await sleep(300);
        const pt = await page.evaluate(() => { const h = document.querySelector("#view h1, #view h2").getBoundingClientRect(); return [h.left + 4, h.top + h.height / 2]; });
        await page.touchscreen.tap(pt[0], pt[1]); await sleep(400);
        if (await on()) fails.push("touch: tap elsewhere did not hide the pinned tooltip");
      }
      /* a non-navigating mark pins without changing the hash */
      const nav = await page.$(".vz-r[data-vtip]:not([data-go])");
      if (nav) { const h0 = await page.evaluate(() => location.hash); await nav.scrollIntoViewIfNeeded(); await nav.tap(); await sleep(400);
        if (!(await on()) || (await page.evaluate(() => location.hash)) !== h0) fails.push("touch: non-navigating .vz-r tap must pin #tip and keep the hash"); }
      const hint = await page.evaluate(() => [...document.querySelectorAll("#view .or-hint, #view .v7-read")].map((e) => e.textContent).join(" "));
      if (/\bgelin\b/.test(hint)) fails.push("touch: hint text still says 'gelin' under (hover:none)");
    }
    /* anything that navigates does so on the FIRST tap */
    await page.evaluate(() => { location.hash = "#/oruntu?q=hiz"; }); await sleep(2500);
    /* dots overlap and the sticky nav can cover them: tap the centre of the first dot that is really on top there */
    const pos = await page.evaluate(() => {
      for (const d of document.querySelectorAll(".or-dot")) {
        d.scrollIntoView({ block: "center" });
        const r = d.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, h = document.elementFromPoint(x, y);
        if (h && h.closest(".or-dot") === d) return [x, y];
      }
      return null;
    });
    if (!pos) fails.push("touch: no tappable .or-dot on #/oruntu?q=hiz");
    else { await page.touchscreen.tap(pos[0], pos[1]); await sleep(800);
      if (!/^#\/kurum\?s=/.test(await page.evaluate(() => location.hash))) fails.push("touch: first tap on .or-dot did not navigate to #/kurum?s=..."); }
    await ctx.close();
  }
  /* Motion runtime (GSAP, ScrollTrigger, Lenis): lifecycle, races, offline fallback, scroll boxes. */
  {
    const url = (r) => `http://127.0.0.1:${port}/index.html${r}`;
    const open = async (tag, vh, offline) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: vh || 800 } }), page = await ctx.newPage();
      /* offline: the browser itself logs each aborted script as "Failed to load resource"; only app errors count */
      if (offline) await page.route(/\/vendor\/(gsap|ScrollTrigger|lenis)|cdnjs\.cloudflare\.com|unpkg\.com/, (r) => r.abort());
      page.on("pageerror", (e) => fails.push(`${tag}: pageerror ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error" && !(offline && /Failed to load resource/.test(m.text()))) fails.push(`${tag}: console ${m.text()}`); });
      return [ctx, page];
    };
    const nST = (page) => page.evaluate(() => typeof ScrollTrigger === "undefined" ? -1 : ScrollTrigger.getAll().length);
    /* (a) home -> event -> outlet -> home leaves as many ScrollTriggers as a fresh home load */
    let [ctx, page] = await open("motion a");
    await page.goto(url("#/")); await sleep(3000);
    const fresh = await nST(page);
    for (const h of ["#/olay?e=s4374", "#/kurum?s=takvim", "#/"]) { await page.evaluate((x) => { location.hash = x; }, h); await sleep(1500); }
    const after = await nST(page);
    if (fresh < 0 || after !== fresh) fails.push(`motion a: ScrollTrigger count fresh ${fresh}, after round trip ${after}`);
    /* the event page really registers ScrollTriggers, so the round-trip count above is a real leak check */
    await page.evaluate(() => { location.hash = "#/olay?e=s4374"; }); await sleep(1500);
    await page.mouse.wheel(0, 1500); await sleep(1200);
    const onEvent = await nST(page);
    if (!(onEvent > 0)) fails.push(`motion a: ScrollTrigger count on the event page is ${onEvent}`);
    await ctx.close();
    /* Broadsheet Kısaca: components present, readable fallback without a coded narrative, no transformed pin ancestor */
    for (const w of [1280, 390]) {
      [ctx, page] = await open(`kisaca ${w}`);
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 800 });
      await page.goto(url("#/olay?e=s4374")); await sleep(3000);
      const tfProbe = async () => { await page.waitForFunction(() => !document.getElementById("app").classList.contains("intro"), null, { timeout: 6000 }).catch(() => {}); return page.evaluate(() => ["app", "view"].map((i) => document.getElementById(i)).concat([document.querySelector("main")]).filter(Boolean)
        .map((e) => { const s = getComputedStyle(e); return [s.transform, s.filter, s.willChange].join(" "); })
        .filter((s) => s !== "none none auto")); };
      const k = await page.evaluate(() => ({
        lead: document.querySelectorAll(".v7-kisaca [data-m=lead]").length,
        panels: document.querySelectorAll("[data-m=splits] .panel").length,
        hs: document.documentElement.scrollWidth > innerWidth }));
      k.tf = await tfProbe();
      if (k.lead !== 1) fails.push(`kisaca ${w}: ${k.lead} [data-m=lead] in .v7-kisaca`);
      if (k.panels < 2) fails.push(`kisaca ${w}: ${k.panels} split panels`);
      if (k.tf.length) fails.push(`kisaca ${w}: transformed ancestor ${k.tf.join(" | ")}`);
      if (k.hs) fails.push(`kisaca ${w}: horizontal scroll`);
      await page.evaluate(() => { location.hash = "#/olay?e=s5316"; }); await sleep(1500);
      const t = await page.evaluate(() => document.querySelectorAll("[data-m=tickets] .tix").length);
      if (t !== 3) fails.push(`kisaca ${w}: s5316 has ${t} tickets, want 3`);
      const tf2 = await tfProbe();
      if (tf2.length) fails.push(`kisaca ${w}: transformed ancestor after navigation ${tf2.join(" | ")}`);
      /* scroll in steps past the ticket block: every counter ends on its exact figure */
      for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 350); await sleep(250); }
      await sleep(2500);
      const cnt = await page.evaluate(() => [...document.querySelectorAll(".tix-n")].filter((b) => b.textContent !== (+b.dataset.n).toLocaleString("tr")).map((b) => b.textContent + "≠" + b.dataset.n));
      if (cnt.length) fails.push(`kisaca ${w}: counters past the block ${cnt.join(" ")}`);
      /* and back above the block: no reversed "0" left behind */
      for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, -350); await sleep(250); }
      await sleep(2500);
      const back = await page.evaluate(() => [scrollY, ...[...document.querySelectorAll(".tix-n")].filter((b) => b.textContent !== (+b.dataset.n).toLocaleString("tr")).map((b) => b.textContent + "≠" + b.dataset.n)]);
      if (back.length > 1) fails.push(`kisaca ${w}: counters back above the block (scrollY ${back[0]}) ${back.slice(1).join(" ")}`);
      await page.evaluate(() => { location.hash = "#/olay?e=s5450"; }); await sleep(1500);
      const n = await page.evaluate(() => [".v7-kisaca [data-m=lead]", "[data-m=tickets]", "[data-m=splits]"].map((s) => document.querySelectorAll(s).length).join(","));
      if (n !== "1,0,0") fails.push(`kisaca ${w}: uncoded event s5450 lead,tickets,splits = ${n}, want 1,0,0`);
      await ctx.close();
    }
    /* cold load straight onto the event: the ticket block still pins */
    [ctx, page] = await open("kisaca cold");
    await page.goto(url("#/olay?e=s5316")); await sleep(3000);
    if (!await page.evaluate(() => typeof ScrollTrigger !== "undefined" && ScrollTrigger.getAll().some((t) => t.pin))) fails.push("kisaca cold: no pinned ScrollTrigger on #/olay?e=s5316");
    /* cold load: the first ready-path mount must not slide the page in */
    [ctx, page] = await open("cold no slide");
    await page.goto(url("#/olay?e=s5316")); await page.waitForFunction(() => window.ScrollTrigger && ScrollTrigger.getAll().length, null, { timeout: 15000 }); await sleep(100);
    const ns = await page.evaluate(() => { const s = getComputedStyle(document.getElementById("view")); return s.opacity + " " + s.transform; });
    if (ns !== "1 none") fails.push(`cold #/olay?e=s5316 ~100 ms after motion starts: #view ${ns}, want "1 none"`);
    await ctx.close();
    /* intro: class on #app at first paint of a cold #/ (empty sessionStorage), gone after ~2 s with no transform/filter left;
       a reload in the same session has no intro; home -> event still pins */
    [ctx, page] = await open("intro");
    const introState = () => page.evaluate(() => ({ cls: document.getElementById("app").classList.contains("intro"),
      tf: ["app", "view"].map((i) => document.getElementById(i)).concat([document.querySelector("main")]).filter(Boolean).map((e) => { const s = getComputedStyle(e); return s.transform + " " + s.filter; }).filter((s) => s !== "none none") }));
    await page.goto(url("#/"), { waitUntil: "commit" }); await page.waitForSelector("#app.intro", { timeout: 3000 }).catch(() => {});
    if (!(await introState()).cls) fails.push("intro: #app.intro missing at first paint of a cold #/");
    await sleep(2200);
    const i1 = await introState();
    if (i1.cls || i1.tf.length) fails.push(`intro: after 2.2 s class ${i1.cls}, transform/filter ${i1.tf.join(" | ")}`);
    const h1Lines = () => page.evaluate(() => new Set([...document.querySelectorAll(".fh h1 .iw")].map((e) => Math.round(e.getBoundingClientRect().top))).size);
    const l1 = await h1Lines(); if (l1 !== 2) fails.push(`intro: h1 renders on ${l1} lines after the intro, want 2`);
    await page.reload(); await sleep(300);
    if ((await introState()).cls) fails.push("intro: second load in the same session got the intro");
    await sleep(2000);
    const l2 = await h1Lines(); if (l2 !== 2) fails.push(`intro: h1 renders on ${l2} lines on a same-session reload, want 2`);
    await page.evaluate(() => { location.hash = "#/olay?e=s5316"; }); await sleep(2500);
    const i2 = await page.evaluate(() => [document.querySelectorAll(".pin-spacer").length, getComputedStyle(document.getElementById("view")).transform]);
    if (!i2[0] || i2[1] !== "none") fails.push(`intro: home -> event pin-spacers ${i2[0]}, #view transform ${i2[1]}`);
    await ctx.close();
    /* (b) three hash changes within 300 ms of a cold load: one Lenis, no errors */
    [ctx, page] = await open("motion b");
    await page.goto(url("#/")); await page.waitForSelector("#view");
    for (const h of ["#/olaylar", "#/olay?e=s4374", "#/"]) { await page.evaluate((x) => { location.hash = x; }, h); await sleep(100); }
    await sleep(3000);
    if (await page.evaluate(() => document.querySelectorAll("html.lenis").length) !== 1) fails.push("motion b: html.lenis missing after quick hash changes");
    await ctx.close();
    /* (c) libraries blocked: the page still reads, without console errors */
    [ctx, page] = await open("motion c", 800, true);
    await page.goto(url("#/olay?e=s4374")); await sleep(3000);
    const len = await page.evaluate(() => (document.getElementById("view") || {}).innerText.length || 0);
    if (len <= 500) fails.push(`motion c: #view text ${len} chars with libraries blocked`);
    await ctx.close();
    /* (d) the wheel inside a dialog scrolls the dialog, not the page */
    [ctx, page] = await open("motion d", 400);
    await page.goto(url("#/olay?e=s4374")); await sleep(3000);
    await page.click("[data-fix]"); await sleep(300);
    const box = await page.$(".xfix-f"), bb = box && await box.boundingBox();
    if (!bb) fails.push("motion d: .xfix-f did not open");
    else {
      const y0 = await page.evaluate(() => scrollY);
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.wheel(0, 300); await sleep(800);
      const [st, y1] = await page.evaluate(() => [document.querySelector(".xfix-f").scrollTop, scrollY]);
      if (!(st > 0) || y1 !== y0) fails.push(`motion d: wheel in .xfix-f scrolled box ${st}, page ${y0}->${y1}`);
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  fails.forEach((f) => console.error("FAIL", f));
  console.log(fails.length ? `${fails.length} failure(s)` : "smoke ok");
  process.exit(fails.length ? 1 : 0);
})();
