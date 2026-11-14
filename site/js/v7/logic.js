/* v7 pure logic: no DOM; also require()-able in Node. */
var V7_DIMS = ["frame", "hero", "blame", "cause", "cons", "aff", "sol", "moral", "start"];

function trFold(s) {
  return String(s == null ? "" : s).replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
    .replace(/ı/g, "i").replace(/ç/g, "c").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ö/g, "o").replace(/ü/g, "u");
}
function trCmp(a, b) { return String(a).localeCompare(String(b), "tr"); }

function weekEvents(N, NW, week, ok) {
  var w = (NW || []).filter(function (x) { return x.k === week; })[0];
  if (!w) return [];
  var sc = function (k) { var v = N[k] && N[k].score; return typeof v === "number" ? v : null; };
  return w.keys.filter(function (k) { return ok(k); }).sort(function (a, b) {
    var x = sc(a), y = sc(b);
    if (x === null && y === null) return a < b ? -1 : a > b ? 1 : 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || (a < b ? -1 : a > b ? 1 : 0);
  });
}

/* Which week to show: an existing week stays selected even when empty (empty:true); unknown/v1 -> latest non-empty. */
function pickWeek(NW, N, ok, wanted) {
  var weeks = (NW || []).filter(function (w) { return w.k !== "v1"; });
  var has = function (w) { return weekEvents(N, NW, w.k, ok).length > 0; };
  var hit = weeks.filter(function (w) { return w.k === wanted; })[0];
  if (hit) return { week: hit.k, empty: !has(hit) };
  var full = weeks.filter(has);
  return full.length ? { week: full[full.length - 1].k, empty: false } : { week: null, empty: true };
}

function narrGroups(rows, dim) {
  var m = {};
  rows.forEach(function (r) {
    var v = String(r[dim] == null ? "" : r[dim]).trim();
    (m[v] = m[v] || []).push(r.s);
  });
  return Object.keys(m).map(function (v) { return { value: v, outlets: m[v] }; }).sort(function (a, b) {
    if ((a.value === "") !== (b.value === "")) return a.value === "" ? 1 : -1;
    return b.outlets.length - a.outlets.length || trCmp(a.value, b.value);
  });
}

function orderOutlets(rows, lean) {
  return rows.map(function (r) { var l = lean(r.s); return { r: r, l: typeof l === "number" ? l : null }; })
    .sort(function (a, b) {
      if (a.l === null && b.l === null) return a.r.s < b.r.s ? -1 : a.r.s > b.r.s ? 1 : 0;
      if (a.l === null) return 1;
      if (b.l === null) return -1;
      return a.l - b.l || (a.r.s < b.r.s ? -1 : a.r.s > b.r.s ? 1 : 0);
    }).map(function (x) { return x.r; });
}

function dimShares(N, keys) {
  var out = {};
  V7_DIMS.forEach(function (d) {
    var n = keys.filter(function (k) { return N[k] && (N[k].focus || []).indexOf(d) >= 0; }).length;
    out[d] = keys.length ? n / keys.length : 0;
  });
  return out;
}

function blameByBloc(N, keys, bloc) {
  var m = {};
  keys.forEach(function (k) {
    ((N[k] && N[k].rows) || []).forEach(function (r) {
      var v = String(r.blame == null ? "" : r.blame).trim();
      if (!v) return;
      var o = m[v] = m[v] || { value: v, left: 0, mid: 0, right: 0, none: 0 };
      var b = bloc(r.s);
      o[b === "left" || b === "mid" || b === "right" ? b : "none"]++;
    });
  });
  var tot = function (o) { return o.left + o.mid + o.right + o.none; };
  return Object.keys(m).map(function (v) { return m[v]; })
    .sort(function (a, b) { return tot(b) - tot(a) || trCmp(a.value, b.value); });
}

/* ---- Anlatı haritası season aggregates. Empty = "başlıkta yok" (same test as the site's UNSET). */
function anEmpty(v) { v = String(v == null ? "" : v).trim(); return !v || /belirtilmiyor|yok|^—$/i.test(v); }
function anVal(r, d) { return anEmpty(r[d]) ? "" : String(r[d]).trim(); }

/* Per outlet habits over many events, each against an event-matched expectation: in every event the outlet coded,
   the share of the OTHER outlets doing the same thing (so a heavy diet of one kind of event is not read as a habit).
   skip[d] = {k: events left empty, e: expected, v: variance}; rep[d] = same for the outlet's most-used value (used >= 3 times).
   z = (k - e) / sqrt(v): how far above the matched expectation, in units of its spread (Poisson-binomial). */
function narrHabits(N, keys, dims) {
  dims = dims || V7_DIMS;
  var by = {};
  keys.forEach(function (key) {
    var rows = (N[key] && N[key].rows) || [];
    if (rows.length < 2) return;
    rows.forEach(function (r) { (by[r.s] = by[r.s] || []).push({ r: r, rows: rows }); });
  });
  var z = function (o) { return o.v > 0 ? (o.k - o.e) / Math.sqrt(o.v) : 0; };
  var leaveOut = function (x, test) {
    var m = 0; x.rows.forEach(function (o) { if (o !== x.r && test(o)) m++; });
    return m / (x.rows.length - 1);
  };
  return Object.keys(by).sort().map(function (s) {
    var evs = by[s], skip = {}, rep = {};
    dims.forEach(function (d) {
      var sk = { k: 0, e: 0, v: 0 }, cnt = {};
      evs.forEach(function (x) {
        var p = leaveOut(x, function (o) { return !anVal(o, d); });
        if (!anVal(x.r, d)) sk.k++; else cnt[anVal(x.r, d)] = (cnt[anVal(x.r, d)] || 0) + 1;
        sk.e += p; sk.v += p * (1 - p);
      });
      sk.z = z(sk); skip[d] = sk;
      Object.keys(cnt).filter(function (v) { return cnt[v] >= 3; }).forEach(function (val) {
        var o = { val: val, k: cnt[val], e: 0, v: 0 };
        evs.forEach(function (x) { var p = leaveOut(x, function (y) { return anVal(y, d) === val; }); o.e += p; o.v += p * (1 - p); });
        o.z = z(o);
        if (!rep[d] || o.z > rep[d].z) rep[d] = o;
      });
    });
    return { s: s, n: evs.length, skip: skip, rep: rep };
  });
}

/* Ranked findings: for each outlet with >= minN events, its strongest repeat and its most unusual empty rate (more often empty: "skip",
   more often answered: "fill"), kept when clearly apart from the others in the same events (|z| >= 2 and >= 8 points). Sorted by |z|. */
function narrFindings(habits, minN) {
  minN = minN || 10;
  var out = [];
  habits.forEach(function (h) {
    if (h.n < minN) return;
    ["rep", "skip"].forEach(function (kind) {
      var best = null;
      Object.keys(h[kind]).forEach(function (d) { var o = h[kind][d]; if (!best || Math.abs(o.z) > Math.abs(best.o.z)) best = { d: d, o: o }; });
      if (!best || Math.abs(best.o.z) < 2 || Math.abs(best.o.k - best.o.e) / h.n < .08) return;
      var k = kind === "rep" ? (best.o.z > 0 ? "rep" : null) : best.o.z > 0 ? "skip" : "fill";
      if (k) out.push({ s: h.s, kind: k, d: best.d, val: best.o.val || "", n: h.n, k: best.o.k, e: best.o.e, z: best.o.z });
    });
  });
  return out.sort(function (a, b) { return Math.abs(b.z) - Math.abs(a.z) || trCmp(a.s, b.s); });
}

/* Week x side counts for one dimension: the `top` most-used values over all weeks (plus "" for empty when withEmpty).
   -> {vals, weeks: [{k, l, coded, side: {left|mid|right|none: {n: rows, c: {val: count}}}}]} */
function narrTimeline(N, weeks, dim, top, bloc, withEmpty) {
  var tot = {};
  weeks.forEach(function (w) { w.keys.forEach(function (k) { ((N[k] && N[k].rows) || []).forEach(function (r) { var v = anVal(r, dim); if (v) tot[v] = (tot[v] || 0) + 1; }); }); });
  var vals = Object.keys(tot).sort(function (a, b) { return tot[b] - tot[a] || trCmp(a, b); }).slice(0, top);
  if (withEmpty) vals.push("");
  return { vals: vals, weeks: weeks.map(function (w) {
    var side = {};
    ["left", "mid", "right", "none"].forEach(function (b) { side[b] = { n: 0, c: {} }; });
    w.keys.forEach(function (k) {
      ((N[k] && N[k].rows) || []).forEach(function (r) {
        var b = side[bloc(r.s)] || side.none, v = anVal(r, dim);
        b.n++; if (vals.indexOf(v) >= 0) b.c[v] = (b.c[v] || 0) + 1;
      });
    });
    return { k: w.k, l: w.l, coded: w.coded, side: side };
  }) };
}

/* Values of one dimension in one event: shared (>= 2 outlets) values get a colour slot by size; singletons and empties none.
   -> {val: {n, slot}} and per outlet the number of dimensions where it stands alone. */
function narrMatrix(rows, dims) {
  var cnt = {}, alone = {};
  dims.forEach(function (d) {
    var c = cnt[d] = {};
    rows.forEach(function (r) { var v = anVal(r, d); if (v) c[v] = (c[v] || 0) + 1; });
  });
  var slot = {};
  dims.forEach(function (d) {
    slot[d] = {};
    Object.keys(cnt[d]).filter(function (v) { return cnt[d][v] > 1; }).sort(function (a, b) { return cnt[d][b] - cnt[d][a] || trCmp(a, b); })
      .forEach(function (v, i) { slot[d][v] = i; });
  });
  rows.forEach(function (r) { alone[r.s] = dims.filter(function (d) { var v = anVal(r, d); return v && cnt[d][v] === 1; }).length; });
  return { cnt: cnt, slot: slot, alone: alone };
}

function firstSentence(t) { t = String(t || "").trim(); var i = t.indexOf(". "); return i < 0 ? t : t.slice(0, i + 1); }

function yzText(f, review) {
  if (review && review.status === "rejected") return null;
  if (review && review.status === "corrected") return { noticed: review.note || "", why: "", editor: true };
  if (f.explain) return { noticed: f.explain.noticed, why: f.explain.why, editor: false };
  var pick = function (list, role) { return (list || []).filter(function (x) { return x.role === role; })[0]; };
  var adv = pick(f.mechanisms, "advocate"), sk = pick(f.alternatives, "skeptic");
  return { noticed: firstSentence(adv && adv.text), why: firstSentence((sk || adv || {}).text), editor: false };
}

function ilanSearch(items, q) {
  q = q || {};
  var t = q.text ? trFold(q.text) : "";
  return items.filter(function (i) {
    return (!t || trFold(i.t).indexOf(t) >= 0) && (!q.family || i.family === q.family) && (!q.src || i.s === q.src) &&
      (!q.from || i.d >= q.from) && (!q.to || i.d <= q.to);
  }).sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
}

/* Yöntem anchors: new ids pass through; the numeric ones other pages used before 7.0 map onto them. */
var YONTEM_OLD = { "2": "veri", "3": "olay", "4": "dil", "5": "olay", "6": "anlati", "7": "dil", "8": "veri", "9": "sinir", "10": "veri",
  "11": "yz", "12": "yzicerik", "v5": "veri", "kutuphane": "kavramlar" };
function yontemAnchor(s) {
  s = s == null ? "" : String(s);
  return Object.prototype.hasOwnProperty.call(YONTEM_OLD, s) ? YONTEM_OLD[s] : s;
}

var NAV_SUB = { "/olaylar": "Bütün olaylar, anlatı haritası ve kör noktalar", "/anlati": "Kurumlar bir olayı nasıl çerçeveledi",
  "/oruntu": "Haberlerde tekrar eden farklar", "/kurumlar": "Kim nasıl yazıyor, yan yana", "/yontem": "Yöntem, sözlük ve sınırlar" };
/* Outlet page "Kısaca": up to three plain sentences. o = {name, events, total, mean, blocMean, placed, nb: [name, ...]}. */
var KU_ONES = ["ı", "i", "si", "ü", "ü", "i", "sı", "si", "i", "u"];
var KU_TENS = { 0: "ı", 10: "u", 20: "si", 30: "u", 40: "ı", 50: "si", 60: "ı", 70: "i", 80: "i", 90: "ı" };
/* "%12" + possessive as Turkish reads the number: 12 → "’si", 20 → "’si", 30 → "’u", 100 → "’ü". */
function kuPoss(n) {
  if (n === 100) return "’ü";
  if (n % 10) return "’" + KU_ONES[n % 10];
  return "’" + KU_TENS[n];
}
/* Dative after an outlet name: "Birgün’e", "Takvim’e", "Sabah’a", "Sözcü’ye", "Star’a"; acronyms and trailing digits are read
   as spoken ("NTV’ye", "Halk TV’ye", "TELE1’e"). */
/* Spoken letter names: all end in a vowel except X ("iks"); back vowels (a, ı, o, u) take ’ya, the rest ’ye. */
var KU_LET = { A: "ya", I: "ya", O: "ya", U: "ya", X: "e", Q: "ye", W: "ye" };
var KU_DONE = { 0: "a", 1: "e", 2: "ye", 3: "e", 4: "e", 5: "e", 6: "ya", 7: "ye", 8: "e", 9: "a" };
var KU_DTEN = { 1: "a", 2: "ye", 3: "a", 4: "a", 5: "ye", 6: "a", 7: "e", 8: "e", 9: "a" };
/* The last spoken word of a number decides: 24 "yirmi dört" ’e, 20 "yirmi" ’ye, 10 "on" ’a, 100 "yüz" ’e, 1000 "bin" ’e. */
function kuNumDat(n) {
  if (n === 0) return "’a";
  if (n % 10) return "’" + KU_DONE[n % 10];
  if (n % 100) return "’" + KU_DTEN[(n % 100) / 10];
  return "’e";
}
function kuDat(name) {
  var w = String(name).trim().split(/\s+/).pop(), num = w.match(/[0-9]+$/);
  if (num) return kuNumDat(parseInt(num[0], 10));
  if (/^[A-ZÇĞİÖŞÜQWX]{2,}$/.test(w)) return "’" + (KU_LET[w.charAt(w.length - 1)] || "ye");
  var low = w.toLocaleLowerCase("tr"), v = (low.match(/[aıoueiöü]/g) || ["e"]).pop();
  return "’" + (/[aıoueiöü]$/.test(low) ? "y" : "") + (/[aıou]/.test(v) ? "a" : "e");
}
function outletKisaca(o) {
  var out = [], n = o.total > 0 ? Math.round(100 * o.events / o.total) : 0;
  out.push(o.name + " bu dönemde " + o.events + " olayı verdi (olayların %" + n + kuPoss(n) + ").");
  if (o.placed && typeof o.mean === "number" && typeof o.blocMean === "number" && isFinite(o.mean) && isFinite(o.blocMean)) {
    var d = o.mean - o.blocMean;
    out.push(Math.abs(d) <= 1 + 1e-9 ? "Başlıkları kendi bloğunun ortalamasına yakın." :
      d > 0 ? "Başlıkları kendi bloğunun ortalamasından biraz daha yüklü." : "Başlıkları kendi bloğunun ortalamasından daha sakin.");
  }
  var nb = o.nb || [];
  if (nb.length) out.push("Gündemi en çok " + nb.slice(0, 2).map(function (x, i, a) { return x + (i === a.length - 1 ? kuDat(x) : ""); }).join(" ve ") + " benziyor.");
  return out;
}

/* The outlet's 5 most recent events (>= 5 outlets) where its headline load and an opposite-bloc outlet's load differ most.
   opt.load(e, s) -> number|null, opt.bloc(s) -> "left"|"mid"|"right"|"none", opt.min = least load difference to list (default 0). Mid outlets compare with either side. */
function recentSplits(events, s, opt) {
  var mine = opt.bloc(s), out = [];
  var cand = events.filter(function (e) { return e.s.indexOf(s) >= 0 && e.s.length >= 5 && e.f; })
    .sort(function (a, b) { return a.f < b.f ? 1 : a.f > b.f ? -1 : 0; });
  for (var i = 0; i < cand.length && out.length < 5; i++) {
    var e = cand[i], v = opt.load(e, s), best = null, bd = -1;
    if (v == null) continue;
    e.s.forEach(function (x) {
      var b = opt.bloc(x), w = opt.load(e, x);
      if (x === s || w == null || (b !== "left" && b !== "right") || b === mine) return;
      if (Math.abs(v - w) > bd) { bd = Math.abs(v - w); best = x; }
    });
    if (best && bd >= (opt.min || 0)) out.push({ e: e, other: best });
  }
  return out;
}

/* Homepage feed: events first reported in the 7 days ending lastDay, covered by a left- and a right-placed outlet. */
function weeklySplits(events, lastDay, opt) {
  opt = opt || {};
  var cov = opt.cov || function (e) { return e.cov || [0, 0, 0]; }, ex = opt.exclude || [];
  var end = Date.parse(lastDay + "T00:00:00Z"), from = new Date(end - 6 * 864e5).toISOString().slice(0, 10);
  return events.filter(function (e) {
    var d = e.f ? e.f.slice(0, 10) : "", c = cov(e);
    return d && d >= from && d <= lastDay && c[0] >= 1 && c[2] >= 1 && e.s.length >= 6 && ex.indexOf(e.i) < 0;
  }).sort(function (a, b) { return b.p - a.p || b.s.length - a.s.length; });
}
function whatDiffers(e, narr) {
  var seen = {}, n = 0;
  ((narr && narr.rows) || []).forEach(function (r) { if (r.blame && !seen[r.blame]) { seen[r.blame] = 1; n++; } });
  if (n > 1) return "Sorumlu tutulan farklı";
  if (e.p >= 40) return "Birinde belirgin biçimde daha sert bir dil var";
  if (e.p >= 20) return "Birinde daha yüklü bir dil var";
  return "Aynı olay, farklı sözcükler";
}
var KURUM_TABS = { liste: 1, karsilastir: 1, partiler: 1, kayit: 1 };

function redirectRoute(path, params) {
  params = params || {};
  if (path.indexOf("/bulgular") === 0) return "/oruntu?q=secim";
  if (path.indexOf("/yanlilik") === 0) return params.t === "kutuphane" ? "/yontem?s=kavramlar" : "/oruntu?q=dil";
  if (path === "/harita") return "/kurumlar?t=liste&v=harita";
  if (path === "/karsilastir") return "/kurumlar?t=karsilastir";
  if (path === "/ilan") return "/olaylar?t=ilan";
  if (path === "/olaylar") {
    if (params.t === "konular") return "/olaylar?t=liste&f=konu";
    if (params.t === "kapsama") return "/yontem?s=kapsama";
  }
  if (path === "/kurumlar" && params.t !== undefined) {
    if (params.t === "guven") return "/kurumlar?t=kayit";
    if (!Object.prototype.hasOwnProperty.call(KURUM_TABS, params.t)) return "/kurumlar?t=liste";
  }
  return null;
}

/* Glossary: one plain sentence per term; glossTerms wraps the first occurrence of each term in the text parts of an html string. */
var GLOSSARY = {
  "kör nokta": "Bir olayı bir taraftaki kurumların, kendi sayılarına göre belirgin biçimde az vermesidir.",
  "yerleşim": "Bir kurumun, elimizdeki kayda göre 0 ile 100 arasındaki siyasi konumudur; bu konumu biz doğrulamadık.",
  "yüklü dil": "Haberin olguyu aktarmakla kalmayıp yargı ya da duygu taşıyan sözcüklerle anlatılmasıdır.",
  "çerçeve": "Bir olayın hangi yönüyle öne çıkarıldığı, yani haberin neyi merkeze koyduğudur.",
  "φ": "İki kurumun aynı olayları ne ölçüde seçtiğini gösteren sayıdır; -1 ile 1 arasında değer alır.",
  "spot": "Haberin başlığının altındaki kısa özet cümlesidir.",
  "kodlama": "Her başlığın hangi çerçeveye ve hangi anlatı unsurlarına girdiğinin tek tek işaretlenmesidir."
};
function glossTerms(html) {
  var seen = {}, keys = Object.keys(GLOSSARY).sort(function (a, b) { return b.length - a.length; });
  return String(html == null ? "" : html).split(/(<[^>]*>)/).map(function (part) {
    if (part.charAt(0) === "<") return part;
    keys.forEach(function (k) {
      if (seen[k]) return;
      var i = part.indexOf(k); if (i < 0) return;
      seen[k] = 1;
      part = part.slice(0, i) + '<button type="button" class="gl" data-gl="' + k + '">' + k + "</button>" + part.slice(i + k.length);
    });
    return part;
  }).join("");
}

/* Headline-number tickets: "<n> <noun>" or "<n>'i tutuklandı", whitelist only (rejects scores, years, ordinals, decimals, ranges, ages). */
var NUM_NOUN = "kisi|supheli|gozalti|tutuklama|il|olu|yarali|kayip";
var NUM_LABEL = { kisi: "kişi", supheli: "şüpheli", gozalti: "gözaltı", tutuklama: "tutuklama", il: "il", olu: "ölü", yarali: "yaralı", kayip: "kayıp", tutuklandi: "tutuklama", "gozaltina alindi": "gözaltı" };
function pNums(text) {
  var re = new RegExp("(?<![\\d,.\\-–])(\\d+)(?:['’][a-z]*)?\\s+(?:(" + NUM_NOUN + ")(?:ler|lar)?(?:de|da|den|dan|e|a|i|in|yi|si|nin)?|(tutuklandi|gozaltina alindi))(?![a-z])", "g");
  var f = trFold(text), out = [], m;
  while ((m = re.exec(f))) out.push({ n: +m[1], label: NUM_LABEL[m[2] || m[3]] });
  return out.length < 2 ? [] : out.slice(0, 3);
}

/* Split a "differs" sentence into <= 5 panels on ';' outside parentheses; each panel lists the outlets it names. */
function pSplitPoints(text, outlets) {
  var segs = [], depth = 0, cur = "";
  String(text).split("").forEach(function (c) {
    if (c === "(") depth++; else if (c === ")" && depth) depth--;
    if (c === ";" && !depth) { segs.push(cur); cur = ""; } else cur += c;
  });
  segs.push(cur);
  var keys = (outlets || []).map(function (o) {
    return { o: o, re: [o.s, o.name].map(function (k) { return new RegExp("(?<![a-z0-9])" + trFold(k).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-z0-9])"); } ) };
  });
  var panels = segs.map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 5).map(function (seg) {
    var f = trFold(seg), hits = [];
    keys.forEach(function (k) {
      var at = k.re.map(function (r) { return f.search(r); }).filter(function (i) { return i >= 0; });
      if (at.length) hits.push([Math.min.apply(null, at), k.o]);
    });
    var q = seg.match(/[“"‘]([^”"’]+)[”"’]|(?:^|\s)'([^']+)'(?=\s|[.,;:]|$)/);
    return { text: seg, others: /(^|[^a-z])digerleri(?![a-z])/.test(f), o: hits.sort(function (a, b) { return a[0] - b[0]; }).map(function (h) { return h[1]; }), word: q ? q[1] || q[2] : "" };
  });
  if (!panels.length) panels = [{ text: String(text).trim(), others: false, o: [], word: "" }];
  var named = {};
  panels.forEach(function (p) { p.o.forEach(function (o) { named[o.s] = 1; }); });
  return panels.map(function (p) {
    var os = p.others ? (outlets || []).filter(function (o) { return !named[o.s]; }) : p.o;
    var c = { left: 0, right: 0, mid: 0 };
    os.forEach(function (o) { c[o.bloc]++; });
    var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
    return { text: p.text, outlets: os.map(function (o) { return o.s; }), bloc: os.length && c[top[0]] > c[top[1]] ? top[0] : "mid", word: p.word };
  });
}

/* ---- parti: outlet × party closeness, mentions, tone (pure) ---- */
var PARTI_AX = ["eco", "soc", "sec", "st", "nat", "cul"];

function hasAxes(e, ax) { ax = ax || PARTI_AX; return !!e && ax.every(function (a) { return typeof e[a] === "number"; }); }

/* Euclidean distance over the six axes; null when either side lacks an axis. */
function axisDist(a, b, ax) {
  ax = ax || PARTI_AX;
  if (!hasAxes(a, ax) || !hasAxes(b, ax)) return null;
  var s = 0; ax.forEach(function (k) { s += (a[k] - b[k]) * (a[k] - b[k]); });
  return Math.sqrt(s);
}

/* Parties ranked nearest first: [{p, d}]. */
function partyRank(outlet, parties, ax) {
  return (parties || []).map(function (p) { return { p: p, d: axisDist(outlet, p, ax) }; })
    .filter(function (x) { return x.d !== null; })
    /* a party flagged minor (A Parti: small, axes set at the centre) never outranks a major one as "nearest" */
    .sort(function (x, y) { return (x.p.minor ? 1 : 0) - (y.p.minor ? 1 : 0) || x.d - y.d || (x.p.s < y.p.s ? -1 : 1); });
}
function nearestParty(outlet, parties, ax) { var r = partyRank(outlet, parties, ax); return r.length ? r[0] : null; }

/* Party aliases. Folded phrases need word boundaries; every phrase may take a short Turkish suffix (partisi, CHPli);
   "cs" (case-sensitive, original text) is for short names that are also ordinary words (DEM = "dem", TİP = "tip", DEVA = "deva").
   "cx" = case-sensitive phrases (Yeni Parti is also an everyday phrase in lower case). Acronyms of 4 letters or fewer take no letter suffix (AKP does not match Akpınar), only "AKP'li".
   Demokrat Parti (also the US Democrats) is left out on purpose. */
var PARTI_ALIAS = {
  akp: { f: ["ak parti", "akp"]  }, chp: { f: ["chp"] }, mhp: { f: ["mhp"] }, iyi: { f: ["iyi parti"]  },
  dem: { f: ["dem parti"], cs: ["DEM"]  }, hdp: { f: ["hdp"] }, zafer: { f: ["zafer partisi", "zafer partili"] },
  yrp: { f: ["yeniden refah", "yrp"] }, anahtar: { f: ["a parti", "anahtar parti"]  }, tip: { f: ["turkiye isci partisi"], cs: ["TİP"] },
  tkp: { f: ["tkp"] }, hudapar: { f: ["huda par", "huda-par", "hudapar"]  }, saadet: { f: ["saadet partisi", "saadet partili"] },
  bbp: { f: ["bbp", "buyuk birlik partisi"] }, dsp: { f: ["dsp"] }, deva: { f: ["deva partisi", "deva partili"], cs: ["DEVA"] },
  gelecek: { f: ["gelecek partisi", "gelecek partili"] }, yep: { f: [], cx: ["Yeni Parti", "YENİ Parti", "YENİ PARTİ"] }
};
var ALN = "a-z0-9";

function aliasEscape(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/* Compiled matchers for the parties that have a safe alias list; .pre is one cheap prefilter on the folded text. */
function compileAliases(parties) {
  var out = [], pre = [];
  (parties || []).forEach(function (p) {
    var a = PARTI_ALIAS[p.s]; if (!a) return;
    var fold = a.f.map(function (t) {
      return new RegExp("(^|[^" + ALN + "])" + aliasEscape(t) + (t.length <= 4 ? "" : "[" + ALN + "]{0,6}") + "(?![" + ALN + "])");
    });
    var cs = (a.cs || []).map(function (t) { return new RegExp("(^|[^\\p{L}\\p{N}])" + aliasEscape(t) + "(?![\\p{L}\\p{N}])", "u"); });
    var cx = (a.cx || []).length ? [new RegExp("(^|[^\\p{L}\\p{N}])(?:" + a.cx.map(aliasEscape).join("|") + ")\\p{L}{0,6}(?![\\p{L}\\p{N}])", "u")] : [];
    a.f.concat(a.cs || [], a.cx || []).forEach(function (t) { pre.push(aliasEscape(trFold(t))); });
    out.push({ s: p.s, fold: fold, cs: cs.concat(cx) });
  });
  out.pre = pre.length ? new RegExp(pre.join("|")) : null;
  return out;
}

/* Slugs of the parties a headline names. */
function matchParties(text, compiled) {
  var f = trFold(text), raw = String(text == null ? "" : text), hit = [];
  if (compiled.pre && !compiled.pre.test(f)) return hit;
  compiled.forEach(function (c) {
    if (c.fold.some(function (r) { return r.test(f); }) || c.cs.some(function (r) { return r.test(raw); })) hit.push(c.s);
  });
  return hit;
}

/* Per outlet: n headlines, any = headlines naming at least one party, and per party {c: headlines naming it, sum: score total}. rows: [{s, t, v}]; only rows given are counted. */
function mentionStats(rows, compiled) {
  var out = {};
  rows.forEach(function (r) {
    var o = out[r.s] || (out[r.s] = { n: 0, any: 0, m: {} });
    o.n++;
    var hit = matchParties(r.t, compiled); if (hit.length) o.any++;
    hit.forEach(function (p) {
      var c = o.m[p] || (o.m[p] = { c: 0, sum: 0 }); c.c++; c.sum += r.v || 0;
    });
  });
  return out;
}

/* Share of an outlet's headlines naming a party, against the pooled rate of its bloc (outlet itself included).
   blocOf: slug -> "left"|"mid"|"right"|"none". Returns {s: {party: {rate, bloc, c, n}}}. */
function mentionShares(stats, parties, blocOf) {
  var tot = {};
  Object.keys(stats).forEach(function (s) {
    var b = blocOf(s), t = tot[b] || (tot[b] = { n: 0, m: {} });
    t.n += stats[s].n;
    Object.keys(stats[s].m).forEach(function (p) { t.m[p] = (t.m[p] || 0) + stats[s].m[p].c; });
  });
  var out = {};
  Object.keys(stats).forEach(function (s) {
    var b = tot[blocOf(s)]; out[s] = {};
    parties.forEach(function (p) {
      var c = stats[s].m[p] ? stats[s].m[p].c : 0;
      out[s][p] = { c: c, n: stats[s].n, rate: stats[s].n ? c / stats[s].n : 0, bloc: b && b.n ? (b.m[p] || 0) / b.n : 0 };
    });
  });
  return out;
}

/* Mean score of headlines naming a party; null (hidden) under min headlines. */
function toneCell(cell, min) {
  min = min == null ? 10 : min;
  if (!cell || cell.c < min) return { n: cell ? cell.c : 0, mean: null };
  return { n: cell.c, mean: cell.sum / cell.c };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { anEmpty: anEmpty, narrHabits: narrHabits, narrFindings: narrFindings, narrTimeline: narrTimeline, narrMatrix: narrMatrix, trFold: trFold, weekEvents: weekEvents, pickWeek: pickWeek, narrGroups: narrGroups, orderOutlets: orderOutlets,
    dimShares: dimShares, blameByBloc: blameByBloc, yzText: yzText, ilanSearch: ilanSearch, redirectRoute: redirectRoute, NAV_SUB: NAV_SUB, yontemAnchor: yontemAnchor, weeklySplits: weeklySplits, outletKisaca: outletKisaca, recentSplits: recentSplits, whatDiffers: whatDiffers, GLOSSARY: GLOSSARY, glossTerms: glossTerms, pNums: pNums, pSplitPoints: pSplitPoints,
    axisDist: axisDist, partyRank: partyRank, nearestParty: nearestParty, compileAliases: compileAliases, matchParties: matchParties, mentionStats: mentionStats, mentionShares: mentionShares, toneCell: toneCell, PARTI_ALIAS: PARTI_ALIAS };
}
