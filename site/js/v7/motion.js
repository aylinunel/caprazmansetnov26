/* v7 motion: GSAP + ScrollTrigger + Lenis, loaded on the first mount (local vendor/ copy first, CDN fallback).
   route() calls motionUnmount() before it replaces the page and motionMount(view) after the last render pass.
   A component puts data-m="kind" on its element and registers MOTION_K[kind] = function (el, first) {...};
   first is true on the mount that runs when the libraries arrive (skip elements already in view then).
   Until the libraries load, or if they never do, components stay in their final readable state. */
var MOTION = { lenis: null, ctx: null, ready: false }, MOTION_K = {};
var MOTION_SRC = [
  ["vendor/gsap.min.js", "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"],
  ["vendor/ScrollTrigger.min.js", "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"],
  ["vendor/lenis.min.js", "https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"]];
var motionP = null, motionPend = null, motionRO = null;

function motionLoad() {
  if (motionP) return motionP;
  var one = function (src, i) {
    return new Promise(function (ok, no) {
      var s = document.createElement("script");
      s.src = src[i];
      s.onload = ok;
      s.onerror = function () { s.remove(); if (i + 1 < src.length) one(src, i + 1).then(ok, no); else no(); };
      document.head.appendChild(s);
    });
  };
  motionP = MOTION_SRC.reduce(function (p, src) { return p.then(function () { return one(src, 0); }); }, Promise.resolve()).then(function () {
    gsap.registerPlugin(ScrollTrigger);
    var l = MOTION.lenis = new Lenis({ duration: 1.25, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true, anchors: false });
    l.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (t) { l.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    var r = motionPend; motionPend = null;
    if (r && r.isConnected) motionRun(r, true);
    MOTION.ready = true;
    return true;
  }, function () {
    console.warn("motion: GSAP/Lenis unavailable, page stays static");
    return false;
  });
  return motionP;
}

function motionMount(root) {
  if (!MOTION.ready) { motionPend = root; MOTION.at = location.hash; motionLoad(); return; }
  /* Incoming page: slides in on a real navigation (hash changed), not on the first render (that has the intro) or an in-page re-render. */
  if (MOTION.at !== location.hash) gsap.from(root, { x: 40, opacity: 0, duration: .6, clearProps: "transform,opacity" });
  MOTION.at = location.hash;
  motionRun(root, false);
}

/* Runs MOTION_K for every [data-m] in root; one broken component only warns. */
function motionEach(root, first) {
  [].forEach.call(root.querySelectorAll("[data-m]"), function (el) {
    var k = MOTION_K[el.dataset.m];
    try { if (k) k(el, first); } catch (err) { console.warn("motion:", el.dataset.m, err); }
  });
}

function motionRun(root, first) {
  MOTION.ctx = gsap.context(function () { motionEach(root, first); }, root);
  var t = 0;
  motionRO = new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { ScrollTrigger.refresh(); }, 150); });
  motionRO.observe(document.getElementById("view"));
}

/* New [data-m] nodes written after the mount (feed "more"): animate them inside the current route's context. */
function motionAdd(el) {
  if (MOTION.ctx) MOTION.ctx.add(function () { motionEach(el, false); });
}

function motionUnmount() {
  motionPend = null;
  if (MOTION.ctx) MOTION.ctx.revert();
  if (motionRO) motionRO.disconnect();
  MOTION.ctx = motionRO = null;
}

/* ---- Broadsheet timelines (markup in press.js) ---- */
function motionInView(el) { var r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }
/* Wraps each word of el's text nodes in span.pw (DOM walk, so buttons and marks inside survive); skips the drop cap. */
function motionWords(el) {
  var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), ts = [], out = [], t;
  while ((t = w.nextNode())) if (!t.parentNode.closest(".p-cap")) ts.push(t);
  ts.forEach(function (t) {
    var f = document.createDocumentFragment();
    t.nodeValue.split(/(\s+)/).forEach(function (s) {
      if (!s) return;
      if (/^\s+$/.test(s)) return f.appendChild(document.createTextNode(s));
      var sp = document.createElement("span"); sp.className = "pw"; sp.textContent = s; f.appendChild(sp); out.push(sp);
    });
    t.parentNode.replaceChild(f, t);
  });
  return out;
}
MOTION_K.head = function (el, first) {
  if (first && motionInView(el)) return;
  var k = el.querySelector(".p-kick"), ch = Array.from(k.textContent).map(function (c) { var s = document.createElement("span"); s.textContent = c; return s; });
  k.textContent = ""; ch.forEach(function (s) { k.appendChild(s); });
  gsap.timeline({ scrollTrigger: { trigger: el, start: "top 88%" } })
    .from(el.querySelector(".p-rule"), { scaleX: 0, transformOrigin: "0 50%", duration: 1, ease: "power3.inOut" })
    .from(ch, { opacity: 0, duration: .01, stagger: .045 }, .25)
    .from(motionWords(el.querySelector(".p-title")), { y: "0.6em", opacity: 0, filter: "blur(8px)", duration: .9, stagger: .06, ease: "power3.out" }, .35);
};
MOTION_K.lead = function (el, first) {
  if (first && motionInView(el)) return;
  gsap.from(el.querySelector(".p-cap"), { scale: 0, rotate: -12, transformOrigin: "40% 80%", duration: 1.2, ease: "back.out(1.7)", scrollTrigger: { trigger: el, start: "top 85%" } });
  gsap.fromTo(motionWords(el), { opacity: .5 }, { opacity: 1, stagger: .1, ease: "none", scrollTrigger: { trigger: el, start: "top 82%", end: "bottom 40%", scrub: .6 } });
};
/* Desktop pins the tickets' block (their parent: head, lead, tickets) just under the sticky nav while the counters scrub;
   phone counts once on enter. Counters count only inside the range: at progress 0 and 1 they show their exact value. */
MOTION_K.tickets = function (el, first) {
  var sec = el.parentNode, wide = innerWidth >= 901, ns = [].slice.call(el.querySelectorAll(".tix-n")), os = ns.map(function () { return { v: 0 }; });
  var tl, show = function () { if (!tl) return; var p = tl.progress(); ns.forEach(function (b, i) { b.textContent = p > 0 && p < 1 ? Math.round(os[i].v) : b.dataset.n; }); };
  var top = function () { var n = document.querySelector(".navbar"); return "top " + ((n ? n.offsetHeight : 64) + 24) + "px"; };
  tl = gsap.timeline({ onUpdate: show, onComplete: show, onReverseComplete: show,
    scrollTrigger: wide ? { trigger: sec, start: top, end: "+=100%", pin: sec, scrub: .8, onLeave: show, onLeaveBack: show } : { trigger: el, start: "top 85%" } });
  if (!(first && motionInView(el))) tl.from(el.querySelectorAll(".tix"), { y: 90, rotateX: -55, transformPerspective: 900, transformOrigin: "50% 100%", opacity: 0, duration: .5, stagger: .12, ease: "power3.out" }, 0);
  ns.forEach(function (b, i) { tl.to(os[i], { v: +b.dataset.n, duration: wide ? 1 : 2, ease: wide ? "none" : "power2.out" }, wide ? .15 : 0); });
  show();
};
MOTION_K.common = function (el, first) {
  if (first && motionInView(el)) return;
  var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 80%" } }), l = el.querySelector(".pc-l"), r = el.querySelector(".pc-r");
  if (l) tl.from(l, { x: -80, rotateY: 12, transformPerspective: 900, opacity: 0, duration: 1.1, ease: "power3.out" }, 0);
  if (r) tl.from(r, { x: 80, rotateY: -12, transformPerspective: 900, opacity: 0, duration: 1.1, ease: "power3.out" }, 0);
  tl.from(el.querySelector(".pc-band"), { opacity: 0, scale: .94, duration: 1, ease: "power2.out" }, .4);
};
MOTION_K.splits = function (el, first) {
  var ps = [].slice.call(el.querySelectorAll(".panel")), on = function (p) {
    if (p.classList.contains("on") || innerWidth < 901) return;
    ps.forEach(function (x) { x.classList.toggle("on", x === p); });
    gsap.fromTo(p.querySelector(".p-body"), { y: 16, filter: "blur(10px)" }, { y: 0, filter: "blur(0px)", duration: .8, delay: .2, ease: "power3.out", clearProps: "transform,filter" });
  };
  ps.forEach(function (p) { ["mouseenter", "focus", "click"].forEach(function (t) { p.addEventListener(t, function () { on(p); }); }); });
  if (!(first && motionInView(el))) gsap.from(ps, { yPercent: 14, opacity: 0, duration: 1, stagger: .09, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
};
MOTION_K.glass = function (el) {
  [].forEach.call(el.children, function (g, i) {
    gsap.to(g, { opacity: .15, duration: .6 + Math.random() * 1.4, delay: Math.random() * 2, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(g, { y: -(30 + i * 22), ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
  });
};
