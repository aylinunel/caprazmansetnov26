const test = require("node:test"), assert = require("node:assert");
const L = require("../js/v7/logic.js");

test("weekEvents filters, orders by score desc, unknown week", () => {
  const N = { a: { score: 0.2 }, b: { score: 0.9 }, c: { score: 0.5 }, d: {} };
  const NW = [{ k: "w8", keys: ["a", "b", "c", "d"] }];
  assert.deepEqual(L.weekEvents(N, NW, "w8", (k) => k !== "c"), ["b", "a", "d"]);
  assert.deepEqual(L.weekEvents(N, NW, "w99", () => true), []);
});
test("narrGroups", () => {
  const rows = [["a", "Şüpheliler"], ["b", "Şüpheliler"], ["c", "Çete"], ["d", ""]].map(([s, blame]) => ({ s, blame }));
  const g = L.narrGroups(rows, "blame");
  assert.deepEqual(g.map((x) => [x.value, x.outlets.length]), [["Şüpheliler", 2], ["Çete", 1], ["", 1]]);
});
test("orderOutlets nulls last", () => {
  const r = L.orderOutlets([{ s: "x" }, { s: "y" }, { s: "z" }], (s) => ({ x: null, y: 2, z: 1 })[s]);
  assert.deepEqual(r.map((o) => o.s), ["z", "y", "x"]);
});
test("dimShares", () => {
  const N = { a: { focus: ["frame", "hero"] }, b: { focus: ["frame"] } };
  const s = L.dimShares(N, ["a", "b"]);
  assert.equal(s.frame, 1); assert.equal(s.hero, 0.5); assert.equal(s.moral, 0);
});
test("blameByBloc", () => {
  const N = { a: { rows: [{ s: "l", blame: "X" }, { s: "n", blame: "X" }, { s: "r", blame: "" }] } };
  const bloc = (s) => ({ l: "left", n: "none", r: "right" })[s];
  assert.deepEqual(L.blameByBloc(N, ["a"], bloc), [{ value: "X", left: 1, mid: 0, right: 0, none: 1 }]);
});
test("yzText", () => {
  const f = { mechanisms: [{ role: "advocate", text: "Birinci. İkinci." }], alternatives: [{ role: "skeptic", text: "Şüphe bir. Şüphe iki." }] };
  assert.equal(L.yzText(f, { status: "rejected" }), null);
  assert.deepEqual(L.yzText(f, { status: "corrected", note: "not" }), { noticed: "not", why: "", editor: true });
  assert.deepEqual(L.yzText({ ...f, explain: { noticed: "n", why: "w" } }, null), { noticed: "n", why: "w", editor: false });
  assert.deepEqual(L.yzText(f, null), { noticed: "Birinci.", why: "Şüphe bir.", editor: false });
});
test("ilanSearch", () => {
  const items = [{ t: "İSTANBUL 3. İCRA DAİRESİ", d: "2026-01-02", s: "a", family: "f" }, { t: "Başka", d: "2026-03-01", s: "b", family: "g" }];
  assert.equal(L.ilanSearch(items, { text: "icra" }).length, 1);
  assert.deepEqual(L.ilanSearch(items, {}).map((i) => i.d), ["2026-03-01", "2026-01-02"]);
  assert.equal(L.ilanSearch(items, { from: "2026-02-01" }).length, 1);
  assert.equal(L.ilanSearch(items, { family: "f" }).length, 1);
});
test("redirectRoute", () => {
  assert.equal(L.redirectRoute("/yanlilik", { t: "kutuphane" }), "/yontem?s=kavramlar");
  assert.equal(L.redirectRoute("/yanlilik", {}), "/oruntu?q=dil");
  assert.equal(L.redirectRoute("/bulgular/x", {}), "/oruntu?q=secim");
  assert.equal(L.redirectRoute("/olaylar", {}), null);
  assert.equal(L.redirectRoute("/anlati", {}), null);
});
test("redirectRoute v8 table", () => {
  const R = L.redirectRoute;
  assert.equal(R("/kurumlar", { t: "genel" }), "/kurumlar?t=liste");
  assert.equal(R("/kurumlar", { t: "siralama" }), "/kurumlar?t=liste");
  assert.equal(R("/kurumlar", { t: "guven" }), "/kurumlar?t=kayit");
  assert.equal(R("/kurumlar", { t: "xyz" }), "/kurumlar?t=liste");
  assert.equal(R("/harita", {}), "/kurumlar?t=liste&v=harita");
  assert.equal(R("/karsilastir", {}), "/kurumlar?t=karsilastir");
  assert.equal(R("/olaylar", { t: "konular" }), "/olaylar?t=liste&f=konu");
  assert.equal(R("/olaylar", { t: "kapsama" }), "/yontem?s=kapsama");
  assert.equal(R("/olaylar", { t: "kor" }), null);
  assert.equal(R("/ilan", {}), "/olaylar?t=ilan");
  assert.equal(R("/yontem", { s: "9" }), null);
  assert.equal(R("/bulgular", {}), "/oruntu?q=secim");
  assert.equal(L.NAV_SUB["/yontem"], "Yöntem, sözlük ve sınırlar");
});
test("trFold", () => assert.equal(L.trFold("İSTANBUL IŞIK çğöü"), "istanbul isik cgou"));

test("pickWeek: existing-but-empty stays; unknown and v1 fall back to latest non-empty", () => {
  const { pickWeek } = require("../js/v7/logic.js");
  const NW = [{ k: "v1", keys: ["a"] }, { k: "w1", keys: ["b"] }, { k: "w2", keys: ["c"] }, { k: "w3", keys: [] }];
  const N = { a: {}, b: {}, c: {} }, ok = () => true;
  assert.deepStrictEqual(pickWeek(NW, N, ok, "w3"), { week: "w3", empty: true });
  assert.deepStrictEqual(pickWeek(NW, N, (k) => k !== "b", "w1"), { week: "w1", empty: true });
  assert.deepStrictEqual(pickWeek(NW, N, ok, "zzz"), { week: "w2", empty: false });
  assert.deepStrictEqual(pickWeek(NW, N, ok, "v1"), { week: "w2", empty: false });
  assert.deepStrictEqual(pickWeek(NW, N, ok, "w1"), { week: "w1", empty: false });
});

test("yontemAnchor maps old numeric anchors, passes new ids through", () => {
  const m = { 2: "veri", 3: "olay", 5: "olay", 4: "dil", 6: "anlati", 7: "dil", 11: "yz", 12: "yzicerik", v5: "veri", kutuphane: "kavramlar" };
  for (const k of Object.keys(m)) assert.equal(L.yontemAnchor(k), m[k]);
  assert.equal(L.yontemAnchor("turkiye"), "turkiye");
  assert.equal(L.yontemAnchor("kayit"), "kayit");
  assert.equal(L.yontemAnchor(undefined), "");
  assert.equal(L.yontemAnchor("constructor"), "constructor");
});

test("weeklySplits: window, both sides, >=6 outlets, exclude, order, empty", () => {
  const six = ["a", "b", "c", "d", "e", "f"];
  const ev = (i, f, p, s) => ({ i, f, p, s: s || six });
  const evs = [ev(1, "2026-11-05T09:00", 30), ev(2, "2026-11-04T09:00", 50), ev(3, "2026-10-29T23:59", 90), ev(4, "2026-11-01T09:00", 50, six.concat("g")),
    ev(5, "2026-11-02T09:00", 40, ["a", "b"]), ev(6, "2026-11-03T09:00", 99), ev(7, null, 99), ev(8, "2026-11-06T00:00", 99), ev(9, "2026-10-30T00:00", 10)];
  const cov = (e) => (e.i === 6 ? [0, 3, 3] : e.i === 4 || e.i === 1 || e.i === 2 || e.i === 9 || e.i === 5 ? [1, 2, 1] : [1, 0, 1]);
  const ids = (o) => L.weeklySplits(evs, "2026-11-05", Object.assign({ cov }, o)).map((e) => e.i);
  assert.deepEqual(ids(), [4, 2, 1, 9]);
  assert.deepEqual(ids({ exclude: [2] }), [4, 1, 9]);
  assert.deepEqual(L.weeklySplits([], "2026-11-05", { cov }), []);
  assert.deepEqual(L.weeklySplits(evs, "2026-11-05", { cov: () => [0, 1, 1] }), []);
});

test("whatDiffers rules", () => {
  assert.equal(L.whatDiffers({ p: 45 }), "Birinde belirgin biçimde daha sert bir dil var");
  assert.equal(L.whatDiffers({ p: 25 }), "Birinde daha yüklü bir dil var");
  assert.equal(L.whatDiffers({ p: 5 }), "Aynı olay, farklı sözcükler");
  assert.equal(L.whatDiffers({ p: 45 }, { rows: [{ blame: "A" }, { blame: "B" }] }), "Sorumlu tutulan farklı");
  assert.equal(L.whatDiffers({ p: 45 }, { rows: [{ blame: "A" }, { blame: "A" }] }), "Birinde belirgin biçimde daha sert bir dil var");
});
test("glossTerms wraps first occurrence outside tags only", () => {
  const h = L.glossTerms("Bu bir kör nokta olayı, ikinci kör nokta.");
  assert.equal((h.match(/data-gl="kör nokta"/g) || []).length, 1);
  assert.equal(L.glossTerms('<a title="kör nokta">x</a>'), '<a title="kör nokta">x</a>');
  assert.equal(L.glossTerms("düz metin"), "düz metin");
  assert.ok(Object.keys(L.GLOSSARY).length === 7 && L.GLOSSARY["φ"]);
});

test("outletKisaca: placed, band edges, unplaced, empty nb", () => {
  const base = { name: "Takvim", events: 50, total: 200, mean: 10, blocMean: 10, placed: true, nb: ["Sabah", "Sözcü"] };
  const k = (o) => L.outletKisaca(Object.assign({}, base, o));
  assert.deepEqual(k({}), ["Takvim bu dönemde 50 olayı verdi (olayların %25’i).", "Başlıkları kendi bloğunun ortalamasına yakın.", "Gündemi en çok Sabah ve Sözcü’ye benziyor."]);
  assert.ok(k({ mean: 11 })[1].includes("yakın"));
  assert.ok(k({ mean: 9 })[1].includes("yakın"));
  assert.ok(k({ mean: 11.01 })[1].includes("biraz daha yüklü"));
  assert.ok(k({ mean: 8.99 })[1].includes("daha sakin"));
  const u = k({ placed: false, nb: [] });
  assert.equal(u.length, 1);
  assert.equal(k({ blocMean: null }).length, 2);
  assert.equal(k({ mean: null }).length, 2);
  assert.equal(k({ nb: [] }).length, 2);
  assert.ok(!k({ total: 0 }).join(" ").match(/NaN|undefined/));
  assert.ok(k({ events: 24, total: 200 })[0].includes("%12’si"));
  assert.ok(k({ events: 40, total: 200 })[0].includes("%20’si"));
  assert.ok(k({ nb: ["Birgün", "Hürriyet"] })[2].endsWith("Birgün ve Hürriyet’e benziyor."));
  assert.ok(k({ nb: ["Sabah"] })[2].includes("Sabah’a benziyor"));
});
test("recentSplits: recency, opposite bloc only, <=5, min 5 outlets", () => {
  const bl = { a: "left", b: "left", c: "right", d: "right", m: "mid", z: "none" };
  const load = (e, s) => (e.v && e.v[s] != null ? e.v[s] : null);
  const opt = { bloc: (s) => bl[s], load };
  const ss = ["a", "b", "c", "d", "m"];
  const ev = (i, f, v, s) => ({ i, f, v, s: s || ss });
  const evs = [];
  for (let i = 1; i <= 8; i++) evs.push(ev(i, "2026-11-0" + i + "T10:00", { a: 10, b: 30, c: 12, d: 20 + i, m: 50 }));
  evs.push(ev(9, "2026-11-09T10:00", { a: 10, c: 11 }, ["a", "c", "d"]));
  const r = L.recentSplits(evs, "a", opt);
  assert.deepEqual(r.map((x) => x.e.i), [8, 7, 6, 5, 4]);
  assert.ok(r.every((x) => x.other === "d"));
  const rb = L.recentSplits([ev(1, "2026-11-01T10:00", { a: 10, b: 90, c: 12, d: 15, m: 80 })], "a", opt);
  assert.equal(rb[0].other, "d");
  assert.equal(L.recentSplits(evs, "m", opt)[0].other, "a");
  assert.deepEqual(L.recentSplits([ev(1, "2026-11-01T10:00", { a: 10 })], "a", opt), []);
  assert.deepEqual(L.recentSplits(evs, "z", opt), []);
});
test("recentSplits: min difference threshold and empty case", () => {
  const bl = { a: "left", c: "right", d: "right", e: "left", f: "right" };
  const opt = { bloc: (s) => bl[s], load: (e, s) => e.v[s] ?? null, min: 20 };
  const ss = ["a", "c", "d", "e", "f"];
  const hi = { i: 1, f: "2026-11-02T10:00", s: ss, v: { a: 10, c: 12, d: 30, e: 11, f: 14 } };
  const lo = { i: 2, f: "2026-11-03T10:00", s: ss, v: { a: 10, c: 12, d: 29, e: 11, f: 14 } };
  assert.deepEqual(L.recentSplits([lo, hi], "a", opt).map((x) => x.e.i), [1]);
  assert.deepEqual(L.recentSplits([lo], "a", opt), []);
  assert.equal(L.recentSplits([lo], "a", { bloc: opt.bloc, load: opt.load }).length, 1);
});
test("glossary: kör nokta follows the site rule", () => {
  assert.ok(/az vermesi/.test(L.GLOSSARY["kör nokta"]) && !/hiç/.test(L.GLOSSARY["kör nokta"]));
});
test("kuDat reads acronyms and digits as spoken", () => {
  const k = (n) => L.outletKisaca({ name: "X", events: 1, total: 2, placed: false, nb: [n] })[1];
  assert.ok(k("NTV").endsWith("NTV’ye benziyor."));
  assert.ok(k("Halk TV").endsWith("Halk TV’ye benziyor."));
  assert.ok(k("Bloomberg HT").endsWith("Bloomberg HT’ye benziyor."));
  assert.ok(k("TELE1").endsWith("TELE1’e benziyor."));
  assert.ok(k("Star").endsWith("Star’a benziyor."));
});
test("kuDat: letter names and spoken numbers", () => {
  const k = (n) => L.outletKisaca({ name: "X", events: 1, total: 2, placed: false, nb: [n] })[1];
  for (const n of ["AF", "BŞ", "KY", "XZ", "TRT HE", "NTV"]) assert.ok(k(n).endsWith(n.split(" ").pop() + "’ye benziyor."), n);
  for (const n of ["AA", "TRO", "XU"]) assert.ok(k(n).endsWith(n + "’ya benziyor."), n);
  assert.ok(k("AX").endsWith("AX’e benziyor."));
  assert.ok(k("T20").endsWith("T20’ye benziyor."));
  assert.ok(k("T24").endsWith("T24’e benziyor."));
  assert.ok(k("T10").endsWith("T10’a benziyor."));
  assert.ok(k("T100").endsWith("T100’e benziyor."));
  assert.ok(k("T50").endsWith("T50’ye benziyor."));
  assert.ok(k("TELE1").endsWith("TELE1’e benziyor."));
});

test("pNums: screenshot sentence", () => {
  assert.deepEqual(L.pNums("Jandarmanın 32 ilde FETÖ'ye yönelik düzenlediği operasyonlarda 72 şüpheli yakalandı, bunlardan 41'i tutuklandı."),
    [{ n: 32, label: "il" }, { n: 72, label: "şüpheli" }, { n: 41, label: "tutuklama" }]);
});
test("pNums: each rejected pattern is dropped even with two valid hits beside it", () => {
  const ok = [{ n: 3, label: "kişi" }, { n: 2, label: "ölü" }];
  for (const s of ["4-1 il ve 3 kişi ve 2 ölü", "2030'a kadar 5 kişi", "4. il ve 3 kişi ve 2 ölü", "11'leri ve 3 kişi ve 2 ölü", "18,3 il ve 3 kişi ve 2 ölü", "57-58'i il ve 3 kişi ve 2 ölü", "14 yaşındaki 3 kişi ve 2 ölü"])
    assert.deepEqual(L.pNums(s), s.startsWith("2030") ? [] : ok, s);
  assert.deepEqual(L.pNums("2030'a kadar 5 kişi ve 2 ölü"), [{ n: 5, label: "kişi" }, { n: 2, label: "ölü" }]);
  assert.deepEqual(L.pNums("kazandı 3 kişi"), [], "needs 2 hits");
  assert.deepEqual(L.pNums("3,5 kişi ve 2 ölü"), [], "decimal is not a count");
  assert.deepEqual(L.pNums("5 ölü, 12 yaralı, 3 kayıp, 9 gözaltına alındı"), [{ n: 5, label: "ölü" }, { n: 12, label: "yaralı" }, { n: 3, label: "kayıp" }]);
});

const OUT = [["sondakika", "Son Dakika", "right"], ["hurriyet", "Hürriyet", "mid"], ["haberler", "Haberler.com", "mid"], ["aksam", "Akşam", "right"],
  ["yenisafak", "Yeni Şafak", "right"], ["trthaber", "TRT Haber", "right"], ["star", "Star", "right"], ["tgrt", "TGRT Haber", "right"], ["ntv", "NTV", "mid"],
  ["haberturk", "Habertürk", "right"], ["mynet", "Mynet", "right"], ["sabah", "Sabah", "right"], ["cumhuriyet", "Cumhuriyet", "left"], ["aa", "AA", "mid"],
  ["birgun", "BirGün", "left"], ["karar", "Karar", "right"], ["ahaber", "A Haber", "right"], ["diken", "Diken", "left"], ["tele1", "Tele1", "left"],
  ["dirilis", "Diriliş Postası", "right"], ["takvim", "Takvim", "right"]].map(([s, name, bloc]) => ({ s, name, bloc }));
const DIFF1 = "hurriyet, aksam, trthaber, tgrt, ntv, aa, birgun ve ahaber 41 tutuklamayı; sondakika, yenisafak, star, haberturk, mynet ve karar 72 gözaltıyı öne çıkarıyor; haberler, yenisafak, mynet ve cumhuriyet İçişleri Bakanlığı duyurusunu anıyor; sabah 'sözde yardım kuruluşlarına finans' gerekçesini, ahaber 'ağır darbe' ifadesini ekliyor.";
const DIFF2 = "Gözaltı sayısı kurumlara göre değişiyor (trthaber, diken, tele1, dirilis 36; takvim 41; sabah 53 gözaltı kararı; star 53 şüpheli); habertürk ve dirilis operasyonu Bakan Gürlek'in adıyla duyuruyor; ntv kadınların fotoğraftan seçildiği ayrıntıyı, ahaber aldatılan eşin CİMER ihbarını, takvim 2 milyon euroluk ağı öne çıkarıyor.";

test("pSplitPoints: w10-s5316 gives 4 panels with blocs", () => {
  const p = L.pSplitPoints(DIFF1, OUT);
  assert.deepEqual(p.map((x) => x.bloc), ["right", "right", "right", "right"]);
  assert.deepEqual(p.map((x) => x.outlets.length), [8, 6, 4, 2]);
  assert.deepEqual(p[0].outlets, ["hurriyet", "aksam", "trthaber", "tgrt", "ntv", "aa", "birgun", "ahaber"]);
  assert.equal(p[3].word, "sözde yardım kuruluşlarına finans");
  assert.equal(p[0].word, "");
  assert.equal(p[1].text, "sondakika, yenisafak, star, haberturk, mynet ve karar 72 gözaltıyı öne çıkarıyor");
});
test("pSplitPoints: w8-s1652 keeps ';' inside parentheses", () => {
  const p = L.pSplitPoints(DIFF2, OUT);
  assert.equal(p.length, 3);
  assert.ok(p[0].text.startsWith("Gözaltı sayısı") && p[0].text.endsWith("53 şüpheli)"));
  assert.deepEqual(p[0].outlets.sort(), ["dirilis", "diken", "sabah", "star", "takvim", "trthaber", "tele1"].sort());
  assert.deepEqual(p[1].outlets, ["haberturk", "dirilis"]);
  assert.deepEqual(p[2].outlets, ["ntv", "ahaber", "takvim"]);
  assert.deepEqual(p.map((x) => x.bloc), ["right", "right", "right"]);
});
test("pSplitPoints: names, slugs, folded spellings, 've', 'diğerleri'", () => {
  const p = L.pSplitPoints("TRT Haber, ahaber ve habertürk 5 kişi dedi; birgun ve tele1 başka dedi; diğerleri sustu", OUT);
  assert.deepEqual(p[0].outlets, ["trthaber", "ahaber", "haberturk"]);
  assert.deepEqual(p[1], { text: "birgun ve tele1 başka dedi", outlets: ["birgun", "tele1"], bloc: "left", word: "" });
  assert.equal(p[2].outlets.length, OUT.length - 5);
  assert.ok(!p[2].outlets.includes("birgun") && !p[2].outlets.includes("trthaber"));
  assert.equal(p.length, 3);
});
test("pSplitPoints: caps at 5 panels", () => {
  assert.equal(L.pSplitPoints("a; b; c; d; e; f; g", []).length, 5);
});
test("pSplitPoints: no separator → one mid panel", () => {
  assert.deepEqual(L.pSplitPoints("tek cümle", []), [{ text: "tek cümle", outlets: [], bloc: "mid", word: "" }]);
});
test("pSplitPoints: panel bloc is the majority, ties and empty are mid", () => {
  const O = [["a", "right"], ["b", "right"], ["c", "left"]].map(([s, bloc]) => ({ s, name: s, bloc }));
  assert.equal(L.pSplitPoints("a, b, c", O)[0].bloc, "right");
  assert.equal(L.pSplitPoints("a ve c", O)[0].bloc, "mid");
  assert.equal(L.pSplitPoints("hiçbiri", O)[0].bloc, "mid");
});

test("axisDist and nearestParty", () => {
  const ax = (eco, soc, sec, st, nat, cul) => ({ eco, soc, sec, st, nat, cul });
  const o = ax(50, 50, 50, 50, 50, 50);
  assert.equal(L.axisDist(o, ax(53, 54, 50, 50, 50, 50)), 5);
  assert.equal(L.axisDist(o, { eco: 1 }), null);
  const ps = [{ s: "far", ...ax(0, 0, 0, 0, 0, 0) }, { s: "near", ...ax(52, 50, 50, 50, 50, 50) }, { s: "gap", eco: 50 }];
  const n = L.nearestParty(o, ps);
  assert.equal(n.p.s, "near"); assert.equal(n.d, 2);
  assert.equal(L.partyRank(o, ps).length, 2);
  assert.equal(L.nearestParty({ eco: 1 }, ps), null);
});
test("alias matching: hits, suffixes, false positives", () => {
  const P = ["akp", "chp", "dem", "tip", "deva", "zafer", "yep", "dp", "saadet"].map((s) => ({ s }));
  const c = L.compileAliases(P);
  const m = (t) => L.matchParties(t, c).sort();
  assert.deepEqual(m("CHP'li belediye başkanı gözaltına alındı"), ["chp"]);
  assert.deepEqual(m("AK Parti ile CHP arasında gerilim"), ["akp", "chp"]);
  assert.deepEqual(m("AK PARTİ'den açıklama"), ["akp"]);
  assert.deepEqual(m("DEM Parti heyeti Bahçeli ile görüştü"), ["dem"]);
  assert.deepEqual(m("Zafer Partisi Genel Başkanı konuştu"), ["zafer"]);
  assert.deepEqual(m("TİP milletvekili önerge verdi"), ["tip"]);
  /* false positives */
  assert.deepEqual(m("Kachpa ve archpoint haberi"), []);
  assert.deepEqual(m("Milli takım büyük zafer kazandı"), []);
  assert.deepEqual(m("Çay için dem zamanı"), []);
  assert.deepEqual(m("Tıp fakültesi ve tip değişikliği"), []);
  assert.deepEqual(m("Bu deva değil, saadet zinciri"), []);
  assert.deepEqual(m("ABD'de Demokrat Parti adayı Yeni Parti kuracak"), ["yep"]);
  assert.deepEqual(m("Murat Cem Akpınar"), []);
  assert.deepEqual(m("AKPM Başkanı konuştu"), []);
  assert.deepEqual(m("AKP'li vekil istifa etti"), ["akp"]);
  assert.deepEqual(m("YENİ Partili Murat Emir"), ["yep"]);
  assert.deepEqual(m("YENİ PARTİ kuruldu"), ["yep"]);
  assert.deepEqual(m("Bakan yeni parti kurdu"), []);
});
test("mentionStats, mentionShares and n<10 suppression", () => {
  const c = L.compileAliases([{ s: "chp" }, { s: "mhp" }]);
  const rows = [{ s: "a", t: "CHP açıklama", v: 40 }, { s: "a", t: "Hava durumu", v: 0 }, { s: "b", t: "CHP ve MHP", v: 20 }, { s: "b", t: "Spor", v: 0 }];
  const st = L.mentionStats(rows, c);
  assert.deepEqual(st.a, { n: 2, any: 1, m: { chp: { c: 1, sum: 40 } } });
  assert.equal(st.b.m.mhp.c, 1);
  const sh = L.mentionShares(st, ["chp", "mhp"], () => "left");
  assert.equal(sh.a.chp.rate, 0.5); assert.equal(sh.a.chp.bloc, 0.5); assert.equal(sh.a.mhp.rate, 0);
  assert.deepEqual(L.toneCell({ c: 9, sum: 90 }), { n: 9, mean: null });
  assert.deepEqual(L.toneCell({ c: 10, sum: 100 }), { n: 10, mean: 10 });
  assert.deepEqual(L.toneCell(undefined), { n: 0, mean: null });
});
test("anEmpty", () => {
  for (const v of ["", null, "—", "Belirtilmiyor", "Başlıkta yok", "  "]) assert.equal(L.anEmpty(v), true, String(v));
  assert.equal(L.anEmpty("Şüpheliler"), false);
});
test("narrHabits: skip and repeat against the other outlets in the same events", () => {
  /* outlet a leaves blame empty in all 4 events, b/c never do; a always picks frame X, b picks X once */
  const N = {};
  for (let i = 0; i < 4; i++) N["e" + i] = { rows: [{ s: "a", frame: "X", blame: "" }, { s: "b", frame: i ? "Y" : "X", blame: "B" }, { s: "c", frame: "Z", blame: "B" }] };
  const H = L.narrHabits(N, Object.keys(N), ["frame", "blame"]), a = H.find((h) => h.s === "a"), b = H.find((h) => h.s === "b");
  assert.equal(a.n, 4);
  assert.equal(a.skip.blame.k, 4); assert.equal(a.skip.blame.e, 0); assert.equal(a.skip.blame.z, 0); /* zero variance: no z */
  assert.equal(a.rep.frame.val, "X"); assert.equal(a.rep.frame.k, 4); assert.equal(a.rep.frame.e, 0.5);
  assert.equal(b.skip.blame.k, 0); assert.equal(b.skip.blame.e, 2); /* half of the others (a) are empty in each event */
  assert.equal(b.rep.frame && b.rep.frame.val, "Y");
  assert.deepEqual(L.narrHabits({ x: { rows: [{ s: "a" }] } }, ["x"]), []); /* one-outlet events have nobody to compare with */
});
test("narrFindings thresholds, kinds and order", () => {
  const h = (s, n, rep, skip) => ({ s, n, rep, skip });
  const H = [h("a", 20, { frame: { val: "X", k: 12, e: 4, v: 4, z: 4 } }, { blame: { k: 18, e: 10, v: 4, z: 4.5 } }),
    h("b", 20, {}, { moral: { k: 2, e: 8, v: 4, z: -3 } }),
    h("c", 20, { frame: { val: "Q", k: 5, e: 4.5, v: .01, z: 5 } }, {}), /* big z but < 8 points: dropped */
    h("d", 5, { frame: { val: "X", k: 5, e: 0, v: 1, z: 9 } }, {})]; /* under minN */
  const F = L.narrFindings(H, 10);
  assert.deepEqual(F.map((f) => [f.s, f.kind, f.d]), [["a", "skip", "blame"], ["a", "rep", "frame"], ["b", "fill", "moral"]]);
});
test("narrTimeline counts per week and side", () => {
  const N = { a: { rows: [{ s: "l", frame: "X" }, { s: "r", frame: "Y" }, { s: "r", frame: "" }] }, b: { rows: [{ s: "l", frame: "Y" }] } };
  const T = L.narrTimeline(N, [{ k: "w1", l: "1", keys: ["a"] }, { k: "w2", l: "2", keys: ["b"] }], "frame", 1, (s) => (s === "l" ? "left" : "right"), true);
  assert.deepEqual(T.vals, ["Y", ""]);
  assert.equal(T.weeks[0].side.right.n, 2); assert.equal(T.weeks[0].side.right.c.Y, 1); assert.equal(T.weeks[0].side.right.c[""], 1);
  assert.equal(T.weeks[1].side.left.c.Y, 1); assert.equal(T.weeks[0].side.left.c.X, undefined);
});
test("narrMatrix shared slots and alone counts", () => {
  const M = L.narrMatrix([{ s: "a", frame: "X", blame: "P" }, { s: "b", frame: "X", blame: "Q" }, { s: "c", frame: "Z", blame: "" }], ["frame", "blame"]);
  assert.deepEqual(M.slot.frame, { X: 0 }); assert.deepEqual(M.slot.blame, {});
  assert.deepEqual(M.alone, { a: 1, b: 1, c: 1 }); /* P, Q and Z are each chosen by one outlet */
});
