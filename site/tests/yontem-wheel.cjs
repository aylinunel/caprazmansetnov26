// node yontem-wheel.cjs <siteDir> — after a chapter switch with smooth scroll (Lenis) active, the next wheel step must move on from the chapter start.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(process.argv[2] || "public"), TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".bin": "application/octet-stream" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html")); if (!f.startsWith(root) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); s.end(fs.readFileSync(f)); }).listen(0);
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1280, height: 800 } }), fails = [];
  await p.goto(`http://127.0.0.1:${srv.address().port}/index.html#/yontem`); await sleep(10000);
  await p.mouse.move(640, 400);
  for (const ch of ["kavramlar", "olay"]) {
    await p.mouse.wheel(0, 6000); await sleep(2500);
    await p.locator(`.ym-toc a[href$="s=${ch}"]`).click(); await sleep(700);
    const at = await p.evaluate(() => Math.round(scrollY));
    await p.mouse.wheel(0, 100); await sleep(1500);
    const after = await p.evaluate(() => Math.round(scrollY));
    console.log(ch, { at, after });
    if (after < at + 60) fails.push(`${ch}: wheel after chapter switch went ${at} → ${after}`);
  }
  await b.close(); srv.close();
  if (fails.length) { console.log("FAIL\n" + fails.join("\n")); process.exit(1); }
  console.log("yontem wheel ok");
})();
