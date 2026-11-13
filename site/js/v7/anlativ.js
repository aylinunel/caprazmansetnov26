/* v7 Anlatı haritası, part two: the reading-room explainer, the season overview (repeats and skips per outlet), the narrative
   timeline, and two per-event views (frame → blame → solution ribbons, outlet × nine-dimension matrix). Aggregation is in logic.js. */
var AN_SC = { left: "var(--left)", mid: "var(--mid)", right: "var(--right)", none: "var(--mist)" };
var AN_MIN = 15; /* events an outlet needs before the season overview says anything about it */
function anPct(x) { return "%" + Math.round(100 * x); }
function anDim(d) { return NDL[d] || d; }
function anSide(s) { var b = bloc(s); return '<i class="an-sd" style="--c:' + AN_SC[b] + '" aria-hidden="true"></i>'; }

/* ---------------------------------------------------------------- reading room */
var AN_DIMTXT = {
  frame: "Olayın hangi tür hikâye olarak sunulduğu: adli süreç mi, ekonomi mi, yas mı? (Entman: sorun tanımı)",
  hero: "Başlığın öznesi; hikâyenin merkezine koyduğu kişi ya da kurum. (Anlatı Politika Çerçevesi: karakter)",
  blame: "Olaydan kimin sorumlu gösterildiği. (Entman: nedensel yorum)",
  cause: "Olayın neden olduğu söyleniyor. (Entman: nedensel yorum)",
  cons: "Başlığın öne çıkardığı sonuç: gözaltı, istifa, fiyat artışı… (Entman: sorun tanımı)",
  aff: "Olaydan kimin etkilendiği; hikâyenin kurbanı. (Anlatı Politika Çerçevesi: karakter)",
  sol: "Başlığın doğal ya da gerekli gösterdiği çözüm. (Entman: çözüm önerisi)",
  moral: "Olayın hangi değer üzerinden tartıldığı: adalet, hesap verebilirlik, kamu düzeni… (Entman: ahlaki değerlendirme)",
  start: "Hikâyenin hangi andan başlatıldığı; neyin öncesi sayıldığı. (Entman: nedensel yorum)"
};

/* A real coded event, two or three outlets side by side, with numbered callouts. */
function anExample() {
  var key = D.N.girne ? "girne" : Object.keys(D.N)[0], n = D.N[key];
  if (!n || !(n.rows || []).length) return "";
  var rows = orderOutlets(n.rows, v7Lean), pick = [], seen = {};
  ["left", "right", "mid", "none"].forEach(function (b) {
    var r = rows.filter(function (x) { return bloc(x.s) === b && !seen[anVal(x, "frame")]; })[0];
    if (r && pick.length < 3) { pick.push(r); seen[anVal(r, "frame")] = 1; }
  });
  rows.forEach(function (r) { if (pick.length < 3 && pick.indexOf(r) < 0 && !seen[anVal(r, "frame")]) { pick.push(r); seen[anVal(r, "frame")] = 1; } });
  pick = orderOutlets(pick, v7Lean);
  var gapAt = pick.map(function (r) { return !anVal(r, "blame"); }).indexOf(true), mk = function (i) { return '<b class="an-mk" aria-hidden="true">' + i + "</b>"; };
  var chip = function (r, d, i) {
    var v = anVal(r, d);
    return "<dt>" + esc(anDim(d)) + "</dt><dd>" + (v ? '<span class="an-ec">' + esc(v) + "</span>" : '<span class="an-ec an-no">başlıkta yok</span>') + (i ? mk(i) : "") + "</dd>";
  };
  var cards = pick.map(function (r, j) {
    return '<div class="an-exc" style="--c:' + AN_SC[bloc(r.s)] + '"><p class="an-exo">' + anSide(r.s) + esc(srcName(r.s)) + ' <span>' + esc(SIDE[bloc(r.s)]) + "</span></p>" +
      (r.hl ? '<p class="an-exh">“' + esc(r.hl) + "”</p>" : "") + "<dl>" + chip(r, "frame", j === 0 ? 1 : 0) +
      chip(r, "blame", j === 0 ? 2 : j === gapAt ? 3 : 0) + "</dl></div>";
  }).join("");
  var notes = "<li>" + mk(1) + "<span><b>Çerçeve</b> olayın hangi hikâyeye bağlandığıdır. Burada üç kurum aynı olayı üç ayrı tür hikâye olarak veriyor.</span></li>" +
    "<li>" + mk(2) + "<span><b>Sorumlu tutulan</b> başlığın parmakla gösterdiğidir. Aynı olgu, farklı bir adres.</span></li>" +
    (gapAt >= 0 ? "<li>" + mk(3) + "<span><b>Başlıkta yok</b>: başlık bu soruya yanıt vermiyor. Susmak da kodlanır; sezon özeti bunu sayar.</span></li>" : "");
  return '<figure class="an-ex"><figcaption><span class="an-kick">Bir örnek · elle kodlandı</span><b>' + esc(narrName(key, 90)) + "</b>" +
    (n.q && n.q.agree ? "<span>Ortak nokta: " + esc(n.q.agree) + "</span>" : "") + '</figcaption><div class="an-exg">' + cards + '</div><ol class="an-exn">' + notes + "</ol>" +
    (n.ev && EV[n.ev] ? '<p><a class="lnk" href="#/olay?e=' + encodeURIComponent(n.ev) + '">Olayın bütün başlıkları →</a></p>' : "") + "</figure>";
}

function anRoom() {
  var ag = NW.filter(function (w) { return w.coded === "agent"; }).map(function (w) { return w.l; });
  var ideas = [
    ["Olgular ortak, hikâye değil", "Kurumlar çoğu olayda ne olduğu konusunda uzlaşır. Ayrıştıkları yer, olayın hangi hikâyenin parçası yapıldığıdır: kimin suçlu, kimin kurban, neyin çözüm sayıldığı."],
    ["Dokuz soru, her başlığa aynı", "Her kurumun başlığı aynı dokuz soruyla okunur: çerçeve, merkezdeki aktör, sorumlu, neden, sonuç, etkilenen kesim, çözüm, ahlaki çerçeve ve hikâyenin başlangıcı."],
    ["Susmak da bir seçim", "“Başlıkta yok”, başlığın o soruya yanıt vermediği anlamına gelir. Bir kurumun sezon boyunca hangi soruyu sürekli boş bıraktığı da bir örüntüdür."],
    ["Sezon önce, olay sonra", "Sayfa iki ölçekte okunur: önce bütün sezon (kim neyi tekrarlıyor, hangi çerçeve ne zaman yükseliyor), sonra tek bir olay ve o olaydaki her kurum."],
    ["Renk yerleşimi gösterir", "Kırmızı sola yerleşik, mavi sağa yerleşik, gri merkez kurumlardır. Renk iyi ya da kötü demek değildir; yerleşim dışarıdan sağlanmıştır."],
    ["Karşılaştırma aynı olayda", "Bir kurumun alışkanlığı, aynı olayları veren öteki kurumlarla kıyaslanır. Böylece bir kurumun daha çok mahkeme haberi vermesi, “adli çerçeveyi seviyor” diye okunmaz."]
  ];
  var dd = function (t, body) { return '<details class="an-dd"><summary>' + esc(t) + "</summary><div>" + body + "</div></details>"; };
  var src = "<p>Her hafta en çok kurumun verdiği olaylar ve kurumlar arası farkın büyük olduğu adaylar ön elemeden geçirildi; içlerinden anlatısal ayrışma taşıyanlar kodlandı. " +
    "Her kurumun o olaydaki başlığı (ve varsa spotu) dokuz boyutta kodlanır; başlığın desteklemediği boyut boş bırakılır ve “başlıkta yok” olarak gösterilir.</p>" +
    "<p>Kimi haftalar elle, kimi haftalar yapay zekâ ile kodlanmıştır" + (ag.length ? " (yapay zekâ: " + esc(ag.join(", ")) + ")" : "") + "; hangisi olduğu her haritanın üstünde YZ rozetiyle yazar. " +
    'Boyutlar çerçeveleme kuramından türetilmiştir. <a class="lnk" href="#/yontem?s=anlati">Yöntem →</a></p>';
  var dims = '<ul class="an-dl">' + NORD.map(function (d) { return "<li><b>" + esc(anDim(d)) + "</b><span>" + esc(AN_DIMTXT[d]) + "</span></li>"; }).join("") + "</ul>";
  var how = "<ul><li><b>Sezon özeti:</b> Her kurum için en çok tekrarladığı seçim ve en sık boş bıraktığı boyut; içi dolu nokta kurumun kendisi, boş nokta aynı olaylardaki öteki kurumlar.</li>" +
    "<li><b>Zaman çizgisi:</b> Haftalar soldan sağa; her sütundaki ışıklı nokta sayısı, o hafta o tarafın başlıklarında bu seçimin payıdır.</li>" +
    "<li><b>Akış, Ağ, Tablo:</b> Seçilen olay için üç görünüm. Akışta her çizgi bir kurumdur; ağda kurumlar paylaştıkları seçimlerle birbirine bağlanır; tabloda bir sütun başlığına tıklayıp kurumları gruplayabilirsiniz.</li>" +
    "<li><b>Çerçeve → sorumlu → çözüm:</b> Şerit kalınlığı o yolu izleyen kurum sayısıdır, rengi kurumların yerleşimidir.</li>" +
    "<li><b>Dokuz boyut matrisi:</b> Aynı renk aynı seçim demektir (en az iki kurum); kesik çerçeveli hücreyi yalnız o kurum seçmiştir. Renkler boyutlar arasında anlam taşımaz.</li></ul>";
  var lim = "<ul><li>Yalnızca başlıkları ve spotları kapsar; haber metninin tamamı okunmamıştır.</li>" +
    "<li>Her kurum için tek bir başlık kodlanır; kurumun o olay hakkındaki bütün yayınını temsil etmez.</li>" +
    "<li>Anlatı kodlaması tek kodlayıcıyla yapılmıştır; yapay zekâ ile kodlanan haftalarda insan kodlayıcı yoktur ve kodlayıcılar arası uyum ölçülmemiştir. Zaman çizgisindeki bir kayma kodlama yönteminin değişmesinden de gelebilir.</li>" +
    "<li>Kurumların yerleşimi dışarıdan sağlanmıştır ve doğrulanmamıştır.</li>" +
    "<li>Harita, kurumların ayrıştığı olayları bilerek seçer; bu olaylar tipik değildir. Sezon özeti de yalnız bu olaylardan hesaplanır. Her olayın haritası yoktur ve editör incelemesinde kaldırılanlar gösterilmez.</li>" +
    "<li>Değerler serbest metindir; yalnız birebir aynı yazılan seçimler “aynı” sayılır.</li></ul>" +
    '<p><a class="lnk" href="#/yontem?s=anlati">Anlatı kodlamasının ayrıntıları →</a></p>';
  return '<section class="an-room" aria-labelledby="an-room-h"><div class="an-wrap">' +
    '<p class="an-kick">Okuma odası · nasıl okunur</p><h2 class="an-h" id="an-room-h">Bir olay, dokuz soru. Başlıklar aynı olguyu nasıl farklı hikâyelere çeviriyor?</h2>' +
    pLead("Bu harita, bir olayı veren her kurumun başlığının hangi yönünü öne çıkardığını yan yana koyar: olayı nasıl çerçeveledi, kimi sorumlu tuttu, hangi çözümü meşru gösterdi.") +
    '<ol class="an-ideas" data-m="cascade">' + ideas.map(function (x, i) {
      return '<li><b class="an-no">0' + (i + 1) + "</b><h3>" + esc(x[0]) + "</h3><p>" + esc(x[1]) + "</p></li>";
    }).join("") + "</ol>" + anExample() +
    '<div class="an-deep">' + dd("Veri nereden geliyor?", src) + dd("Dokuz boyut ne demek?", dims) + dd("Nasıl okunur", how) + dd("Neyi göstermez?", lim) + "</div>" +
    '<nav class="an-toc" aria-label="Bu sayfada"><button type="button" data-go-id="an-season">Sezon özeti</button><button type="button" data-go-id="an-time">Zaman çizgisi</button>' +
    '<button type="button" data-go-id="an-event">Olay olay</button></nav></div></section>';
}

/* ---------------------------------------------------------------- season overview */
var AN_CACHE = null;
function anSeasonData() {
  if (AN_CACHE) return AN_CACHE;
  var weeks = v7Weeks(), keys = [].concat.apply([], weeks.map(function (w) { return w.keys; }));
  var hab = narrHabits(D.N, keys);
  AN_CACHE = { weeks: weeks, keys: keys, hab: hab, find: narrFindings(hab, AN_MIN) };
  return AN_CACHE;
}
function anFindText(f) {
  var o = esc(srcName(f.s)), d = esc(anDim(f.d)), ex = esc(anPct(f.e / f.n));
  if (f.kind === "rep") return "<b>" + o + "</b>, " + d.toLocaleLowerCase("tr") + " olarak en sık <q>" + esc(f.val) + "</q> seçiyor: " + f.k + "/" + f.n + " olayda (" + anPct(f.k / f.n) + "). Aynı olaylardaki öteki kurumlarda bu oran " + ex + ".";
  if (f.kind === "skip") return "<b>" + o + "</b> başlıklarında <q>" + d + "</q> öteki kurumlardan daha sık boş kalıyor: " + f.k + "/" + f.n + " olayda (" + anPct(f.k / f.n) + ") başlıkta yok. Aynı olaylardaki öteki kurumlarda " + ex + ".";
  return "<b>" + o + "</b> başlıkları <q>" + d + "</q> sorusunu öteki kurumlardan daha sık yanıtlıyor: " + (f.n - f.k) + "/" + f.n + " olayda (" + anPct((f.n - f.k) / f.n) + "). Aynı olaylardaki öteki kurumlarda " + anPct((f.n - f.e) / f.n) + ".";
}
var AN_KIND = { rep: "tekrarlıyor", skip: "atlıyor", fill: "dolduruyor" };
function anSeason() {
  var S = anSeasonData(), hab = S.hab.filter(function (h) { return h.n >= AN_MIN; });
  if (!hab.length) return "";
  var best = function (h, kind, abs) {
    var b = null; Object.keys(h[kind]).forEach(function (d) { var o = h[kind][d], z = abs ? Math.abs(o.z) : o.z; if (!b || z > b.z) b = { d: d, o: o, z: z }; }); return b;
  };
  var keys = S.find.slice(0, 8), fRep = S.find.filter(function (f) { return f.kind === "rep"; })[0], fSkip = S.find.filter(function (f) { return f.kind !== "rep"; })[0];
  var list = keys.length ? '<ol class="an-keys">' + keys.map(function (f, i) {
    return '<li class="' + bloc(f.s) + '"><b class="an-no">' + (i + 1) + '</b><div><p class="an-kk">' + anSide(f.s) + esc(AN_KIND[f.kind]) + " · " + esc(anDim(f.d)) +
      '</p><p class="an-kt">' + anFindText(f) + "</p></div></li>";
  }).join("") + "</ol>" : '<p class="v7-note">Bu ölçütle hiçbir kurumda öteki kurumlardan belirgin biçimde ayrılan bir alışkanlık bulunmadı.</p>';
  /* chart A: each outlet's strongest repeat; chart B: each outlet's most unusual empty rate (either way) */
  var rep = hab.map(function (h) { var b = best(h, "rep"); return b && { h: h, d: b.d, o: b.o }; }).filter(Boolean)
    .sort(function (a, b) { return (b.o.k - b.o.e) / b.h.n - (a.o.k - a.o.e) / a.h.n || b.o.z - a.o.z; });
  var skp = hab.map(function (h) { var b = best(h, "skip", true); return { h: h, d: b.d, o: b.o }; })
    .sort(function (a, b) { return (b.o.k - b.o.e) / b.h.n - (a.o.k - a.o.e) / a.h.n || b.o.z - a.o.z; });
  var row = function (x, sub) {
    var p = x.o.k / x.h.n, e = x.o.e / x.h.n, c = AN_SC[bloc(x.h.s)];
    return { k: x.h.s, label: srcName(x.h.s), sub: sub, pts: [{ v: e, hollow: true, c: "var(--ink2)" }, { v: p, c: c, big: true }], span: "pts", val: anPct(p),
      tip: "<b>" + esc(srcName(x.h.s)) + "</b><br>" + esc(sub) + "<br>" + x.o.k + "/" + x.h.n + " olay (" + anPct(p) + ")<br>Aynı olaylarda öteki kurumlar: " + anPct(e) };
  };
  var axis = { min: 0, max: 1, fmt: function (v) { return anPct(v); }, lw: 230, vw: 52 };
  var key = vzKey([{ t: "kurumun kendisi (renk: yerleşim)", c: "var(--ink)" }, { t: "aynı olaylarda öteki kurumlar", kind: "o", c: "var(--ink2)" }]);
  var TOP = 12; /* chart shows the 12 clearest; the table twin lists every outlet */
  skp.sort(function (a, b) { return Math.abs(b.o.k - b.o.e) / b.h.n - Math.abs(a.o.k - a.o.e) / a.h.n; });
  var rRows = rep.slice(0, TOP).map(function (x) { return row(x, anDim(x.d) + ": " + x.o.val); });
  var sRows = skp.slice(0, TOP).map(function (x) { return row(x, anDim(x.d) + " · başlıkta yok"); });
  var tbl = function (xs, head, val) {
    return vzTable(["Kurum", "Yerleşim", "Olay", head, "Kurum", "Öteki kurumlar"], xs.map(function (x) {
      return [srcName(x.h.s), SIDE[bloc(x.h.s)], x.h.n, val(x), x.o.k + "/" + x.h.n + " (" + anPct(x.o.k / x.h.n) + ")", anPct(x.o.e / x.h.n)];
    }));
  };
  var how = "<p>Yalnız en az " + AN_MIN + " olayı kodlanan kurumlar. Her kurumun payı, <b>aynı olaylardaki</b> öteki kurumların payıyla karşılaştırılır; böylece bir kurumun daha çok belli tür olay vermesi alışkanlık sayılmaz. " +
    "Tekrar için bir değerin en az üç olayda birebir aynı yazılmış olması gerekir. Anahtar bulgular listesine, farkın en az 8 puan olduğu ve olaydan olaya oynamanın açıklayamayacağı kadar büyük olduğu (beklenen dağılımın iki katı) durumlar girer; sıralama bu güvene göredir.</p>";
  return '<section class="an-sec" id="an-season">' + pHead("Sezon özeti", "Kim neyi tekrarlıyor, neyi atlıyor?") +
    '<p class="an-sub">' + S.keys.length + " kodlanmış olay, " + S.weeks.filter(function (w) { return w.keys.length; }).length + " hafta. Her kurum kendi olaylarında, aynı olayları veren öteki kurumlarla karşılaştırıldı.</p>" +
    '<div class="an-kbox"><h3 class="an-h3">Anahtar bulgular</h3>' + list + "</div>" +
    findingBlock({ id: "an-rep", claim: fRep ? esc(srcName(fRep.s)) + " en belirgin tekrarı yapıyor: " + esc(anDim(fRep.d).toLocaleLowerCase("tr")) + " olarak “" + esc(fRep.val) + "”, " + anPct(fRep.k / fRep.n) + " (aynı olaylarda öteki kurumlarda " + anPct(fRep.e / fRep.n) + ")." : "Hiçbir kurumun tekrarı öteki kurumlardan belirgin biçimde ayrılmıyor.",
      viz: key + vzRows(rRows, axis), read: "Farkı en büyük " + Math.min(TOP, rep.length) + " kurum (hepsi tabloda). Her satır bir kurum ve en çok tekrarladığı seçim. Dolu nokta boş noktadan ne kadar sağdaysa kurum o seçimi öteki kurumlardan o kadar sık yapıyor.",
      means: "Bir kurumun aynı olay türünde hep aynı çerçeveyi ya da aynı aktörü seçmesi, okurun o tür olayları hep aynı hikâyeyle görmesi demektir.", how: how,
      table: tbl(rep, "Tekrar", function (x) { return anDim(x.d) + ": " + x.o.val; }) }) +
    findingBlock({ id: "an-skip", claim: fSkip ? esc(srcName(fSkip.s)) + " başlıklarında “" + esc(anDim(fSkip.d)) + "” öteki kurumlardan en belirgin biçimde " + (fSkip.kind === "skip" ? "daha sık boş kalıyor: " + anPct(fSkip.k / fSkip.n) + " (aynı olaylarda öteki kurumlarda " + anPct(fSkip.e / fSkip.n) + ")." : "daha sık dolu: " + anPct(1 - fSkip.k / fSkip.n) + " (aynı olaylarda öteki kurumlarda " + anPct(1 - fSkip.e / fSkip.n) + ").") : "Hiçbir kurumun boş bıraktığı boyutlar öteki kurumlardan belirgin biçimde ayrılmıyor.",
      viz: key + vzRows(sRows, axis), read: "Farkı en büyük " + Math.min(TOP, skp.length) + " kurum (hepsi tabloda). Her satır bir kurum ve öteki kurumlardan en çok ayrıldığı boyut. Dolu nokta sağdaysa kurum o soruyu daha sık boş bırakıyor; soldaysa daha sık yanıtlıyor.",
      means: "Başlıkta sorumlu ya da neden söylenmemesi okuru yorumsuz bırakır; sürekli boş kalan bir soru, kurumun o konuda konuşmamayı seçtiğini gösterebilir.", how: how,
      table: tbl(skp, "Boyut", function (x) { return anDim(x.d); }) }) + "</section>";
}

/* ---------------------------------------------------------------- timeline */
function anTimePanel(id, title, dim, top) {
  var S = anSeasonData(), T = narrTimeline(D.N, S.weeks, dim, top, bloc, false), sides = ["left", "right"], max = 0;
  T.weeks.forEach(function (w) { sides.forEach(function (b) { var s = w.side[b]; T.vals.forEach(function (v) { if (s.n) max = Math.max(max, (s.c[v] || 0) / s.n); }); }); });
  max = max || 1;
  var cols = T.weeks.length, yz = T.weeks.map(function (w) { return w.coded === "agent"; }), fy = yz.indexOf(true);
  var head = '<div class="an-tr an-th"><span></span><span class="an-tc">' + T.weeks.map(function (w, i) {
    return '<i title="' + esc(w.l) + '">' + (i + 1) + "</i>";
  }).join("") + "</span></div>";
  var body = T.vals.map(function (v) {
    return '<div class="an-tv"><p class="an-tl">' + esc(v) + "</p>" + sides.map(function (b) {
      return '<div class="an-tr"><span class="an-ts">' + '<i class="an-sd" style="--c:' + AN_SC[b] + '" aria-hidden="true"></i>' + esc(SIDE[b]) + '</span><span class="an-tc">' + T.weeks.map(function (w) {
        var s = w.side[b], c = s.c[v] || 0, p = s.n ? c / s.n : 0, k = c ? Math.max(1, Math.round(8 * p / max)) : 0;
        return '<i class="an-led" style="--k:' + k + ";--c:" + AN_SC[b] + '"' + vzTipAttr("<b>" + esc(v) + "</b><br>" + esc(w.l) + " · " + esc(SIDE[b]) + "<br>" + c + "/" + s.n + " başlık (" + anPct(p) + ")") + ' tabindex="0"></i>';
      }).join("") + "</span></div>";
    }).join("") + "</div>";
  }).join("");
  var foot = fy >= 0 ? '<div class="an-tr an-tf" aria-hidden="true"><span></span><span class="an-tc" style="--a:' + fy + '"><b>YZ ile kodlandı</b></span></div>' : "";
  var rows = [];
  T.weeks.forEach(function (w) { ["left", "mid", "right"].forEach(function (b) { var s = w.side[b]; T.vals.forEach(function (v) { rows.push([w.l, SIDE[b], v, (s.c[v] || 0) + "/" + s.n, s.n ? anPct((s.c[v] || 0) / s.n) : "—"]); }); }); });
  return { html: '<div class="an-tp" id="' + id + '" style="--n:' + cols + '"><h3 class="an-h3">' + esc(title) + '</h3><div class="an-tscroll">' + head + body + foot + "</div></div>", rows: rows, max: max };
}
function anTimeline() {
  var S = anSeasonData();
  if (S.weeks.filter(function (w) { return w.keys.length; }).length < 2) return "";
  var fr = anTimePanel("an-tfr", "Çerçeveler", "frame", 5), bl = anTimePanel("an-tbl", "Sorumlu tutulanlar", "blame", 5);
  /* claim: the biggest single-week share of a frame other than the plain-report frame on one side */
  var T = narrTimeline(D.N, S.weeks, "frame", 5, bloc, false), pk = null;
  T.weeks.forEach(function (w) { ["left", "right"].forEach(function (b) { var s = w.side[b]; T.vals.slice(1).forEach(function (v) { var p = s.n >= 10 ? (s.c[v] || 0) / s.n : 0; if (!pk || p > pk.p) pk = { p: p, v: v, w: w, b: b }; }); }); });
  var ORD = ["ilk", "ikinci", "üçüncü", "dördüncü", "beşinci", "altıncı", "yedinci", "sekizinci", "dokuzuncu", "onuncu", "on birinci", "on ikinci", "on üçüncü", "on dördüncü"];
  /* the week is named in words: a date in the claim would be counted up by the scene motion */
  var claim = pk && pk.p ? "Çerçeve olarak “" + esc(pk.v) + "” en yüksek noktasına sezonun " + (ORD[T.weeks.indexOf(pk.w)] || "") + " haftasında " + esc(SIDE[pk.b].toLocaleLowerCase("tr")) + " kurumlarda ulaştı: başlıkların " + anPct(pk.p) + "." :
    "Çerçevelerin haftadan haftaya dağılımı.";
  var tbl = '<h4 class="an-h4">Çerçeveler</h4>' + vzTable(["Hafta", "Yerleşim", "Çerçeve", "Başlık", "Pay"], fr.rows) +
    '<h4 class="an-h4">Sorumlu tutulanlar</h4>' + vzTable(["Hafta", "Yerleşim", "Sorumlu tutulan", "Başlık", "Pay"], bl.rows);
  return '<section class="an-sec" id="an-time">' + pHead("Zaman çizgisi", "Hangi çerçeve ne zaman yükseldi?") +
    findingBlock({ id: "an-timeline", claim: claim,
      viz: vzKey([{ t: "sola yerleşik", c: "var(--left)" }, { t: "sağa yerleşik", c: "var(--right)" }]) + '<div class="an-tgrid">' + fr.html + bl.html + "</div>",
      read: "Sütunlar haftalardır (1 = " + esc(S.weeks[0].l) + (pk && pk.p ? "; zirve haftası " + (T.weeks.indexOf(pk.w) + 1) + " = " + esc(pk.w.l) : "") + "). Her sütundaki ışıklı nokta sayısı, o hafta o taraftaki başlıklarda bu seçimin payıdır; en uzun sütun panelin en yüksek payıdır (çerçeveler " + anPct(fr.max) + ", sorumlular " + anPct(bl.max) + "). Bir noktaya " + orTap() + ": sayılar görünür.",
      means: "Bir çerçevenin yükselmesi çoğu zaman o hafta hangi olayların gündemde olduğunu yansıtır; iki tarafın aynı hafta farklı çerçevelere yaslanması ise aynı gündemin iki ayrı hikâyeyle anlatıldığını gösterir.",
      how: "<p>Sezonun en sık beş çerçevesi ve en sık beş sorumlusu. Her hafta, o taraftaki kurumların kodlanan bütün başlıkları paydadır; merkez kurumlar tabloda. Yapay zekâ ile kodlanan haftalarda kodlama yöntemi değiştiği için o haftalardaki kaymalar kısmen yöntemden gelebilir; değerler serbest metindir, yalnız birebir aynı yazılanlar birlikte sayılır.</p>",
      table: tbl }) + "</section>";
}

/* ---------------------------------------------------------------- event: frame → blame → solution ribbons */
function anFlowDims(n) {
  var all = function (d) { return n.rows.every(function (r) { return !anVal(r, d); }); };
  var used = ["frame", "blame", "sol"], extra = (n.focus || []).concat(NORD).filter(function (d) { return used.indexOf(d) < 0 && !all(d); }), swap = [];
  var dims = used.map(function (d) { if (!all(d) || !extra.length) return d; var to = extra.shift(); swap.push([d, to]); return to; });
  return { dims: dims, swap: swap };
}
function anSankey(key) {
  var n = D.N[key]; if (!n || n.rows.length < 2) return "";
  var F = anFlowDims(n), dims = F.dims, U = 15, G = 14, W = 900, NW_ = 10, LM = 190, RM = 190, sides = ["left", "mid", "right", "none"];
  var cols = dims.map(function (d) {
    var c = {}; n.rows.forEach(function (r) { var v = anVal(r, d); c[v] = (c[v] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return (a === "") - (b === "") || c[b] - c[a] || trCmp(a, b); }).map(function (v) { return { v: v, n: c[v] }; });
  });
  var slot = function (nd) { return Math.max(nd.n * U, 30); }, colH = function (c) { return c.reduce(function (a, nd) { return a + slot(nd) + G; }, -G); };
  var H = Math.max.apply(null, cols.map(colH)) + 48, X = function (i) { return LM + i * (W - LM - RM - NW_) / (dims.length - 1); };
  cols.forEach(function (c) { var y = 34 + (H - 42 - colH(c)) / 2; c.forEach(function (nd) { nd.y = y + (slot(nd) - nd.n * U) / 2; nd.out = nd.y; nd["in"] = nd.y; y += slot(nd) + G; }); });
  var at = function (i, v) { return cols[i].filter(function (x) { return x.v === v; })[0]; };
  var lab = function (v) { return v ? (v.length > 26 ? v.slice(0, 25) + "…" : v) : "başlıkta yok"; };
  var s = '<svg class="an-sk" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(dims.map(anDim).join(" → ") + " akışı, şerit rengi kurum yerleşimi") + '">';
  dims.forEach(function (d, i) {
    s += '<text class="an-skh" x="' + (i === 0 ? X(0) + NW_ : i === dims.length - 1 ? X(i) : X(i) + NW_ / 2) + '" y="14" text-anchor="' + (i === 0 ? "end" : i === dims.length - 1 ? "start" : "middle") + '">' + esc(anDim(d).toLocaleUpperCase("tr")) + "</text>";
  });
  for (var i = 0; i < dims.length - 1; i++) {
    var g = {};
    n.rows.forEach(function (r) { var k = anVal(r, dims[i]) + "\u0001" + anVal(r, dims[i + 1]) + "\u0001" + bloc(r.s); (g[k] = g[k] || []).push(r.s); });
    var links = Object.keys(g).map(function (k) { var p = k.split("\u0001"); return { a: at(i, p[0]), b: at(i + 1, p[1]), side: p[2], s: g[k] }; });
    var si = function (l) { return sides.indexOf(l.side); };
    links.sort(function (x, y) { return cols[i + 1].indexOf(x.b) - cols[i + 1].indexOf(y.b) || si(x) - si(y); }).forEach(function (l) { l.y0 = l.a.out; l.a.out += l.s.length * U; });
    links.sort(function (x, y) { return cols[i].indexOf(x.a) - cols[i].indexOf(y.a) || si(x) - si(y); }).forEach(function (l) { l.y1 = l.b["in"]; l.b["in"] += l.s.length * U; });
    var x0 = X(i) + NW_, x1 = X(i + 1), mx = (x0 + x1) / 2;
    links.forEach(function (l) {
      var h = l.s.length * U, a = l.y0, b = l.y1;
      s += '<path class="an-rb" d="M' + x0 + "," + a + "C" + mx + "," + a + " " + mx + "," + b + " " + x1 + "," + b + "L" + x1 + "," + (b + h) + "C" + mx + "," + (b + h) + " " + mx + "," + (a + h) + " " + x0 + "," + (a + h) + 'Z" style="--c:' + AN_SC[l.side] + '" tabindex="0"' +
        vzTipAttr("<b>" + esc(anDim(dims[i])) + ":</b> " + esc(lab(l.a.v)) + "<br><b>" + esc(anDim(dims[i + 1])) + ":</b> " + esc(lab(l.b.v)) + "<br>" + l.s.length + " kurum · " + esc(SIDE[l.side]) + "<br>" + esc(l.s.map(srcName).join(", "))) + "></path>";
    });
  }
  cols.forEach(function (c, i) {
    var last = i === dims.length - 1, mid = i > 0 && !last;
    c.forEach(function (nd) {
      var h = nd.n * U, tx = i === 0 ? X(0) - 8 : last ? X(i) + NW_ + 8 : X(i) + NW_ + 6, an = i === 0 ? "end" : "start", ty = nd.y + h / 2;
      s += '<rect class="an-nd' + (nd.v ? "" : " an-nd0") + '" x="' + X(i) + '" y="' + nd.y + '" width="' + NW_ + '" height="' + h + '" rx="2"><title>' + esc(lab(nd.v) + " · " + nd.n + " kurum") + "</title></rect>" +
        '<text class="an-nl' + (nd.v ? "" : " an-nl0") + (mid ? " an-halo" : "") + '" x="' + tx + '" y="' + (ty - 1) + '" text-anchor="' + an + '">' + esc(lab(nd.v)) + "</text>" +
        '<text class="an-nn' + (mid ? " an-halo" : "") + '" x="' + tx + '" y="' + (ty + 12) + '" text-anchor="' + an + '">' + nd.n + " kurum</text>";
    });
  });
  s += "</svg>";
  var swap = F.swap.map(function (x) { return "Bu olayda hiçbir başlık “" + esc(anDim(x[0])) + "” sorusuna yanıt vermiyor; yerine “" + esc(anDim(x[1])) + "” gösteriliyor."; }).join(" ");
  /* claim: the widest single path */
  var paths = {};
  n.rows.forEach(function (r) { var k = dims.map(function (d) { return lab(anVal(r, d)); }).join(" → "); (paths[k] = paths[k] || []).push(r.s); });
  var pk = Object.keys(paths).sort(function (a, b) { return paths[b].length - paths[a].length; }), top = pk[0];
  var claim = Object.keys(paths).length === 1 ? "Bütün kurumlar aynı yolu izliyor: " + esc(top) + "." :
    n.rows.length + " kurum " + pk.length + " ayrı yoldan anlatıyor; en kalabalık yol " + paths[top].length + " kurumla “" + esc(top) + "”.";
  var tbl = vzTable(["Kurum", "Yerleşim"].concat(dims.map(anDim)), orderOutlets(n.rows, v7Lean).map(function (r) {
    return [srcName(r.s), SIDE[bloc(r.s)]].concat(dims.map(function (d) { return lab(anVal(r, d)); }));
  }));
  return findingBlock({ id: "an-flow", nopin: true, claim: claim,
    viz: vzKey([{ t: "sola yerleşik", c: "var(--left)" }, { t: "merkez", c: "var(--mid)" }, { t: "sağa yerleşik", c: "var(--right)" }]) + '<div class="an-skbox" tabindex="0" role="region" aria-label="Akış şeması, yatay kaydırılabilir">' + s + "</div>",
    read: "Soldan sağa: " + esc(dims.map(anDim).join(" → ")) + ". Şerit kalınlığı o yolu izleyen kurum sayısı, rengi kurumların yerleşimi. Bir şeride " + orTap() + ": kurumlar görünür." + (swap ? " " + swap : ""),
    means: "Aynı çerçeveden çıkıp farklı sorumlulara giden şeritler, olayın aynı türden bir hikâye sayılsa bile başka bir adrese bağlandığını gösterir.",
    how: "<p>Her kurumun bu olaydaki tek başlığının üç boyuttaki kodu. Boş kodlar “başlıkta yok” düğümünde toplanır. Değerler serbest metindir; yalnız birebir aynı yazılanlar aynı düğüme gider.</p>", table: tbl });
}

/* ---------------------------------------------------------------- event: outlet × nine dimensions */
function anMatrix(key) {
  var n = D.N[key]; if (!n || n.rows.length < 2) return "";
  var rows = orderOutlets(n.rows, v7Lean), M = narrMatrix(rows, NORD), foc = n.focus || [];
  var head = '<tr><th scope="col" class="an-mo">Kurum</th>' + NORD.map(function (d) {
    var k = Object.keys(M.cnt[d]).length;
    return '<th scope="col"' + (foc.indexOf(d) >= 0 ? ' class="an-foc"' : "") + "><b>" + esc(anDim(d)) + "</b><span>" + (k ? k + " farklı yanıt" : "hep boş") + (foc.indexOf(d) >= 0 ? " · odak" : "") + "</span></th>";
  }).join("") + '<th scope="col" class="an-ma"><b>Yalnız</b><span>tek başına</span></th></tr>';
  var mx = Math.max.apply(null, rows.map(function (r) { return M.alone[r.s]; })) || 1;
  var body = rows.map(function (r) {
    return '<tr><th scope="row" class="an-mo">' + anSide(r.s) + esc(srcName(r.s)) + "</th>" + NORD.map(function (d) {
      var v = anVal(r, d);
      if (!v) return '<td><span class="an-cell an-no" title="başlıkta yok">—</span><span class="an-vh">başlıkta yok</span></td>';
      var sl = M.slot[d][v], lbl = srcName(r.s) + ": " + anDim(d) + " — " + v + (sl == null ? " (yalnız bu kurum)" : " (" + M.cnt[d][v] + " kurum)");
      return '<td><span class="an-cell' + (sl == null ? " an-solo" : "") + '" data-d="' + d + '" data-v="' + esc(v) + '"' + (sl == null ? "" : ' style="--c:' + NPAL[sl % NPAL.length] + '"') +
        ' title="' + esc(lbl) + '">' + esc(v.length > 42 ? v.slice(0, 41) + "…" : v) + "</span></td>";
    }).join("") + '<td class="an-ma"><span class="an-al" style="--w:' + (M.alone[r.s] / mx) + '"><i></i>' + M.alone[r.s] + "</span></td></tr>";
  }).join("");
  var far = rows.slice().sort(function (a, b) { return M.alone[b.s] - M.alone[a.s] || trCmp(srcName(a.s), srcName(b.s)); })[0];
  var claim = M.alone[far.s] ? esc(srcName(far.s)) + " bu olayı en farklı anlatan kurum: dokuz boyutun " + M.alone[far.s] + " tanesinde seçimini başka hiçbir kurum yapmadı." :
    "Bu olayda hiçbir kurum tek başına kalan bir seçim yapmadı.";
  return '<section class="v7-find an-mxf" data-m="scene" data-nopin id="an-matrix"><p class="v7-claim">' + claim + '</p><div class="v7-viz">' +
    '<p class="an-mleg"><span class="an-cell" style="--c:' + NPAL[0] + '">aynı renk</span> aynı seçim (en az iki kurum) <span class="an-cell an-solo">kesik çerçeve</span> yalnız bu kurum <span class="an-cell an-no">—</span> başlıkta yok</p>' +
    '<div class="an-mbox" tabindex="0" role="region" aria-label="Kurum ve dokuz boyut tablosu, yatay kaydırılabilir"><table class="an-mx"><caption class="an-vh">Her kurumun bu olaydaki dokuz boyut kodu</caption><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div></div>" +
    '<p class="v7-read">Satırlar yerleşim sırasında (soldan sağa), sütunlar dokuz boyut; “odak” işaretli sütunlar olayın kurumları ayıran boyutlarıdır. Bir hücreye ' + orTap() + ": aynı seçimi yapan kurumlar parlar. “Yalnız” sütunu, kurumun kimsenin paylaşmadığı seçim sayısıdır.</p></section>";
}

function anWire(root) {
  var mark = function (el) {
    [].forEach.call(root.querySelectorAll(".an-cell.an-hi"), function (x) { x.classList.remove("an-hi"); });
    if (el) [].forEach.call(root.querySelectorAll(".an-mx .an-cell[data-d]"), function (x) {
      if (x.getAttribute("data-d") === el.getAttribute("data-d") && x.getAttribute("data-v") === el.getAttribute("data-v")) x.classList.add("an-hi");
    });
  };
  root.addEventListener("mouseover", function (ev) { var c = ev.target.closest && ev.target.closest(".an-mx .an-cell[data-d]"); mark(c); });
  root.addEventListener("click", function (ev) {
    var c = ev.target.closest && ev.target.closest(".an-mx .an-cell[data-d]"); if (c) mark(c);
    var b = ev.target.closest && ev.target.closest("[data-go-id]"), t = b && document.getElementById(b.getAttribute("data-go-id"));
    if (t) t.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
}
