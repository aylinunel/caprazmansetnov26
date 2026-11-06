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
    MOTION.ready = true;
    var r = motionPend; motionPend = null;
    if (r && r.isConnected) motionRun(r, true);
    return true;
  }, function () {
    console.warn("motion: GSAP/Lenis unavailable, page stays static");
    return false;
  });
  return motionP;
}

function motionMount(root) {
  if (!MOTION.ready) { motionPend = root; motionLoad(); return; }
  motionRun(root, false);
}

function motionRun(root, first) {
  MOTION.ctx = gsap.context(function () {
    [].forEach.call(root.querySelectorAll("[data-m]"), function (el) { var k = MOTION_K[el.dataset.m]; if (k) k(el, first); });
  }, root);
  var t = 0;
  motionRO = new ResizeObserver(function () { clearTimeout(t); t = setTimeout(function () { ScrollTrigger.refresh(); }, 150); });
  motionRO.observe(document.getElementById("view"));
}

function motionUnmount() {
  motionPend = null;
  if (MOTION.ctx) MOTION.ctx.revert();
  if (motionRO) motionRO.disconnect();
  MOTION.ctx = motionRO = null;
}
