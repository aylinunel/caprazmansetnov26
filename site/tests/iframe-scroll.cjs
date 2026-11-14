// node iframe-scroll.cjs <siteDir>  — Nasıl çalışır chapters must open at their start when the page sits in an
// iframe that is as tall as its content (how the claude.ai artifact embeds it): only the OUTER page scrolls there.
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(process.argv[2] || "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".bin": "application/octet-stream" };
const OUTER = `<!doctype html><body style="margin:0"><div style="height:120px">host chrome</div>
<iframe id="f" src="/index.html#/yontem" style="width:1280px;border:0;display:block" scrolling="no"></iframe>
<script>setInterval(function(){var f=document.getElementById("f"),d=f.contentDocument;if(d&&d.documentElement)f.style.height=d.documentElement.scrollHeight+"px";},100)</script></body>`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const srv = http.createServer((q, s) => {
    const u = decodeURIComponent(q.url.split("?")[0]);
    if (u === "/outer.html") { s.writeHead(200, { "content-type": TYPES[".html"] }); return s.end(OUTER); }
    const f = path.join(root, u);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); s.end(fs.readFileSync(f));
  }).listen(0);
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1280, height: 800 } }), fails = [];
  await page.goto(`http://127.0.0.1:${srv.address().port}/outer.html`);
  await sleep(10000);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  for (const ch of ["kavramlar", "olay", "sinir"]) {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(600);
    await frame.locator(`.ym-toc a[href$="s=${ch}"]`).click(); await sleep(1200);
    const r = await page.evaluate(() => {
      const f = document.getElementById("f"), lay = f.contentDocument.querySelector(".ym-lay");
      return { sy: Math.round(scrollY), want: Math.round(f.offsetTop + lay.getBoundingClientRect().top - 72), H: document.documentElement.scrollHeight };
    });
    console.log(ch, JSON.stringify(r));
    if (Math.abs(r.sy - r.want) > 24) fails.push(`${ch}: outer scrollY ${r.sy}, chapter start at ${r.want}`);
  }
  /* phone width: the chapter <select> replaces the contents list */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.getElementById("f").style.width = "390px"; }); await sleep(1500);
  const f2 = page.frames().find((f) => f !== page.mainFrame());
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(600);
  await f2.locator(".ym-sel select").selectOption("olay"); await sleep(1200);
  const m = await page.evaluate(() => { const f = document.getElementById("f"); return { sy: Math.round(scrollY), want: Math.round(f.offsetTop + f.contentDocument.querySelector(".ym-lay").getBoundingClientRect().top - 72) }; });
  console.log("select olay", JSON.stringify(m));
  if (Math.abs(m.sy - m.want) > 24) fails.push(`select: outer scrollY ${m.sy}, chapter start at ${m.want}`);
  await browser.close(); srv.close();
  if (fails.length) { console.log("FAIL\n" + fails.join("\n")); process.exit(1); }
  console.log("iframe scroll ok");
})();
