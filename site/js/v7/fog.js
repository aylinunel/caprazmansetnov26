/* v7 fog hero: the lead event's two headlines side by side with the shared words between them. It loads neutral (K = .5); clicking an
   outlet sinks the card into a WebGL2 fog with a slight turn and tints sky, fog and band toward that outlet's bloc (left 0, right 1);
   clicking it again returns to neutral.
   fogHero(e) builds the markup; fogMount(root) starts the clock on .fh. State lives in CSS variables on the .fh element (--k --k2 --kt --turn --dip --sink). */
var FOG_SINK = 240, FOG_RISE = 820, FOG_DEPTH = .27;
var FOG_FS = "#version 300 es\nprecision highp float;\n" +
  "uniform vec2 R;uniform float T,S,K,D;out vec4 O;\n" +
  "float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n" +
  "float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}\n" +
  "float fbm(vec2 p){float a=.5,s=0.;mat2 m=mat2(1.6,1.2,-1.2,1.6);p=mat2(.8,.6,-.6,.8)*p+5.3;for(int i=0;i<5;i++){s+=a*n(p);p=m*p;a*=.5;}return s;}\n" +
  "void main(){\n" +
  "  vec2 uv=gl_FragCoord.xy/R;uv.y=1.-uv.y;\n" +
  "  float asp=R.x/R.y;vec2 p=vec2(uv.x*asp,uv.y);\n" +
  "  float t=T*.05;\n" +
  "  vec2 w=vec2(fbm(p*1.3+vec2(t,-t*.6)),fbm(p*1.3+vec2(-t*.8,t)+7.));\n" +
  "  float d=fbm(p*1.9+w*1.7+vec2(t*1.6,-t*1.1+S*.5));\n" +
  "  float e=fbm(p*.9-w+vec2(-t,t*.5)+3.);\n" +
  "  float low=smoothstep(.70,1.04,uv.y+(d-.5)*.34);\n" +
  "  float side=smoothstep(.2,.0,uv.x+(e-.5)*.28)+smoothstep(.8,1.,uv.x+(e-.5)*.28);\n" +
  "  side*=smoothstep(.25,.6,uv.y)*.2;\n" +
  "  float wisps=smoothstep(.5,.78,d)*smoothstep(.22,.5,uv.y)*smoothstep(.86,.6,uv.y)*.18;\n" +
  "  float rest=clamp(low+side+wisps,0.,1.);\n" +
  "  float front=1.02-S*.68;\n" +
  "  float rise=smoothstep(front-.02,front+.26,uv.y+(d-.5)*.5);\n" +
  "  float haze=S*(.3+.46*d);\n" +
  "  float a=clamp(max(rest,max(rise*.97,haze)),0.,1.);\n" +
  "  vec3 lA=mix(vec3(.96,.90,.88),vec3(.30,.20,.21),D),lB=mix(vec3(.80,.72,.71),vec3(.14,.09,.10),D);\n" +
  "  vec3 rA=mix(vec3(.88,.91,.97),vec3(.20,.25,.36),D),rB=mix(vec3(.70,.75,.85),vec3(.08,.11,.18),D);\n" +
  "  vec3 c=mix(mix(lB,lA,d*1.15),mix(rB,rA,d*1.1),K);\n" +
  "  O=vec4(c*a,a);\n" +
  "}";

var FOG_LIVE = null;
function fogDark() {
  var t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
}
function fogSmooth(a, b, x) { x = Math.min(1, Math.max(0, (x - a) / (b - a))); return x * x * (3 - 2 * x); }

function fogHero(e) {
  var pair = e && (SPLITPAIR[e.i] || defaultPair(e)), a = pair && artOf(e, pair[0]), b = pair && artOf(e, pair[1]);
  var sets = "", btns = "", band = "";
  if (a && b) {
    var cmp = compareHeads(a, b), shared = cmp.shared.join(" ");
    var one = function (art, marks, cls) {
      var bl = bloc(art.s), w = SIDE[bl], c = bl === "left" ? "var(--left)" : bl === "right" ? "var(--right)" : "var(--mid)", ln = SRC[art.s] && SRC[art.s].lean;
      return '<div class="fh-set ' + cls + '" style="--lean:' + c + '"><p class="fh-lab">' + esc(srcName(art.s).toLocaleUpperCase("tr")) + " · " +
        esc(w.toLocaleUpperCase("tr")) + (ln != null ? " " + ln : "") + '</p><p class="fh-h">' + markText(art.t, marks) + "</p></div>";
    };
    var btn = function (art) {
      var ln = SRC[art.s] && SRC[art.s].lean, bl = bloc(art.s);
      /* K target by bloc, not position: SPLITPAIR can put the right-bloc outlet first */
      return '<button type="button" aria-pressed="false" data-k="' + (bl === "left" ? 0 : bl === "right" ? 1 : .5) + '"><b>' + esc(srcName(art.s)) + " · " + esc(SIDE[bl]) + "</b><small>yerleşim " + (ln != null ? ln : "—") + "</small></button>";
    };
    band = '<div class="fh-band"><span class="fh-bl">ORTAK OLAN</span><span class="fh-bw">' + (shared ? esc(shared) : "ortak kelime yok") + "</span></div>";
    sets = one(a, cmp.markA, "l") + band + one(b, cmp.markB, "r");
    btns = '<div class="fh-toggle" role="group" aria-label="Hangi kurumun başlığı">' + btn(a) + btn(b) + "</div>";
  }
  return '<section class="fh' + (sets ? "" : " empty") + '"' + (e ? ' data-e="' + esc(e.i) + '"' : "") + ' aria-label="Çapraz Manşet">' +
    '<div class="fh-sky" aria-hidden="true"><i class="fh-sk l"></i><i class="fh-sk r"></i></div>' +
    (sets ? '<div class="fh-home"><div class="fh-card' + (a.t.length + b.t.length > 180 ? " fh-long" : "") + '">' + sets + "</div></div>" : "") +
    '<div class="fh-tilt" aria-hidden="true"></div><canvas class="fh-fog" aria-hidden="true"></canvas>' +
    '<div class="fh-ui"><h1><span class="l1"><span class="iw">Aynı</span> <span class="iw">olay,</span></span> <span class="y"><span class="iw">farklı</span> <span class="iw">manşet.</span></span></h1>' +
    "<p class=\"fh-sub\">Türk medyasının aynı olayı nasıl farklı anlattığını yan yana koyuyoruz. Hüküm vermiyoruz; farkı ölçüyoruz.</p>" +
    '<div class="fh-dock">' + btns + '<a class="fh-cta" href="#bu-hafta">Bu haftanın ayrışmalarını gör ↓</a></div></div></section>';
}

function fogMount(root) {
  var el = (root || document).querySelector(".fh");
  if (FOG_LIVE && FOG_LIVE !== el) { FOG_LIVE._down && FOG_LIVE._down(); FOG_LIVE = null; }
  if (!el || el._fh) return;
  FOG_LIVE = el;
  var cv = el.querySelector(".fh-fog"), bt = [].slice.call(el.querySelectorAll(".fh-toggle button")), sets = [el.querySelector(".fh-set.l"), el.querySelector(".fh-set.r")];
  var S = el._fh = { k: .5, target: .5, from: .5, start: 0, on: -1, queued: null, animating: false, vis: true, last: 0, raf: 0, dark: fogDark() ? 1 : 0, still: 0 };
  var gl = null, U = {};
  try { gl = cv.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (x) { gl = null; }
  if (gl) {
    var sh = function (t, src) { var o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { gl = null; } return o; };
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}"));
    if (gl) gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FOG_FS));
    if (gl) { gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) gl = null; }
    if (gl) { gl.useProgram(pr); ["R", "T", "S", "K", "D"].forEach(function (u) { U[u] = gl.getUniformLocation(pr, u); }); }
  }
  if (!gl) cv.classList.add("fh-fog-css");
  var size = function () {
    if (!gl) return;
    var cw = el.clientWidth || 1, ch = el.clientHeight || 1, w = Math.round(Math.min(cw, 960)), h = Math.max(1, Math.round(w * ch / cw));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
  };
  var set = function (n, v) { el.style.setProperty(n, v); };
  var draw = function (now, s) {
    if (!gl) return;
    gl.uniform2f(U.R, cv.width, cv.height); gl.uniform1f(U.T, now / 1000); gl.uniform1f(U.S, s); gl.uniform1f(U.K, S.k); gl.uniform1f(U.D, S.dark);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  /* The turn clock: sink, rise; k (sky, fog, band) and k2 (type) follow on smoothsteps. */
  var frame = function (now) {
    var d = now - S.start, y = 0, s = 0, dip = 0, k2 = S.k;
    if (S.animating) {
      if (d < FOG_SINK) { var x0 = d / FOG_SINK; y = x0 * x0 * (3 - 2 * x0) * FOG_DEPTH; }
      else {
        var x1 = Math.min(1, Math.max(0, (d - FOG_SINK) / FOG_RISE)); y = Math.pow(1 - x1, 3.4) * FOG_DEPTH;
      }
      s = fogSmooth(0, FOG_SINK * .92, d) * (1 - fogSmooth(FOG_SINK + 70, FOG_SINK + FOG_RISE * .92, d));
      dip = fogSmooth(30, 190, d) * (1 - fogSmooth(330, 720, d));
      S.k = S.from + (S.target - S.from) * fogSmooth(120, 520, d);
      k2 = S.from + (S.target - S.from) * fogSmooth(340, 760, d);
      if (d >= FOG_SINK + FOG_RISE) {
        S.animating = false; S.k = k2 = S.target; y = s = dip = 0;
        if (S.queued !== null && S.queued !== S.target) { var q = S.queued; S.queued = null; begin(q, now); } else S.queued = null;
      }
    }
    set("--sink", (y * innerHeight).toFixed(1) + "px"); set("--k", S.k.toFixed(3)); set("--k2", k2.toFixed(3)); set("--dip", dip.toFixed(3)); set("--surge", s.toFixed(3)); set("--kt", (Math.abs(S.k - .5) * 2).toFixed(3));
    draw(now, s);
  };
  var begin = function (n, now) { S.target = n; S.from = S.k; S.start = now; S.animating = true; set("--turn", (n - S.k).toFixed(2)); };
  var offs = [], down = function () {
    if (S.dead) return; S.dead = true; S.vis = false;
    if (S.raf) cancelAnimationFrame(S.raf);
    offs.forEach(function (f) { f(); }); offs = [];
    try { var x = gl && gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); } catch (e) {}
    el._down = null; if (FOG_LIVE === el) FOG_LIVE = null;
  };
  el._down = down;
  var alive = function () { if (S.dead) return false; if (document.body.contains(el)) return true; down(); return false; };
  var loop = function () {
    if (S.raf || !S.vis || !alive()) return;
    S.raf = requestAnimationFrame(function (now) {
      S.raf = 0; if (!alive()) return;
      if (now - S.last >= 32) { S.last = now; frame(now); }
      loop();
    });
  };
  var still = function () { S.dark = fogDark() ? 1 : 0; size(); frame(performance.now()); };
  /* Click a label: it comes forward and tints toward its bloc; click it again: back to neutral. */
  var pick = function (i) {
    var on = S.on = S.on === i ? -1 : i, t = on < 0 ? .5 : +bt[on].getAttribute("data-k");
    bt.forEach(function (b, j) { b.setAttribute("aria-pressed", j === on ? "true" : "false"); });
    sets.forEach(function (x, j) { if (x) { x.classList.toggle("is-on", j === on); x.classList.toggle("is-off", on >= 0 && j !== on); } });
    if (S.animating) S.queued = t; else if (t !== S.k) begin(t, performance.now());
    loop();
  };
  bt.forEach(function (b, i) { b.addEventListener("click", function () { pick(i); }); });
  var cta = el.querySelector(".fh-cta");
  if (cta) cta.addEventListener("click", function (ev) {
    var t = document.getElementById("bu-hafta"); if (!t) return;
    ev.preventDefault(); if (MOTION.lenis) MOTION.lenis.scrollTo("#bu-hafta"); else t.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  /* Off-screen: stop. Theme change: re-read the colours (the CSS side follows the tokens by itself). */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { if (!alive()) return; S.vis = es[0].isIntersecting; if (S.vis) loop(); }); io.observe(el);
    offs.push(function () { io.disconnect(); });
  }
  var retheme = function () { if (!alive()) return; S.dark = fogDark() ? 1 : 0; if (!S.vis) still(); };
  var mo = new MutationObserver(retheme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  offs.push(function () { mo.disconnect(); });
  var mq = matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) { mq.addEventListener("change", retheme); offs.push(function () { mq.removeEventListener("change", retheme); }); }
  var rz = function () { if (alive()) size(); };
  addEventListener("resize", rz); offs.push(function () { removeEventListener("resize", rz); });
  set("--k", ".5"); set("--k2", ".5"); set("--kt", "0"); set("--turn", "0"); set("--dip", "0"); set("--sink", "0px"); set("--surge", "0");
  size(); frame(performance.now()); loop();
}
