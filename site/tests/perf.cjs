// node perf.cjs <siteDir> [route]  — scroll top→bottom under 4x CPU throttle; exits 1 if any long task > 50 ms
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const [siteDir, route = "#/olay?e=s4374"] = process.argv.slice(2);
if (!siteDir) { console.log("usage: node perf.cjs <siteDir> [route]"); process.exit(0); }
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".bin": "application/octet-stream", ".json": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const root = path.resolve(siteDir);
  const srv = http.createServer((q, s) => {
    const f = path.join(root, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); s.end(fs.readFileSync(f));
  }).listen(0);
  let browser, bad = [];
  try {
  browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html${route}`);
  await sleep(9000); /* boot is heavy and not what we measure */
  await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    window.__lt = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: "longtask" });
  });
  await page.mouse.move(640, 400);
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 300); await sleep(120); }
  await sleep(500);
  if (!((await page.evaluate(() => scrollY)) > 0)) throw new Error("scroll loop did not move the page (scrollY=0)");
  const lt = await page.evaluate(() => window.__lt);
  bad = lt.filter((d) => d > 50);
  console.log(`${route}: long tasks=${lt.length} max=${Math.max(0, ...lt)}ms over50=[${bad.join(", ")}]`);
  } finally { if (browser) await browser.close(); srv.close(); }
  if (bad.length) { console.log("perf FAIL"); process.exit(1); }
  console.log("perf ok");
})().catch((e) => { console.log("perf ERROR: " + e.message); process.exit(1); });
