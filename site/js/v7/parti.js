/* v7 Partiler (Kurumlar › Partiler): outlet × party closeness, who names whom, tone, ownership. Pure maths lives in logic.js.
   Both sides carry lean + six axes (eco soc sec st nat cul). Party positions come from ideological descriptions, not votes;
   outlet positions come from the supplied register. Closeness is not affiliation. */
var PT = null, PT_SEL = null, PT_MIN = 10;
var PT_NOTE = "<b>Parti yerleşimleri</b> ideolojik tanımlardan türetilmiştir, oy davranışından değil. <b>Yayın yerleşimleri</b> sağlanan kayıt defterinden gelir. " +
  "İkisi ayrı kaynaklardır ve bu sitede bağımsız olarak doğrulanmamıştır. Bir yayının bir partiye yakın düşmesi, ona ait olduğunu ya da onun sözcülüğünü yaptığını göstermez; " +
  "yalnızca iki ayrı kaynağın onları altı eksende benzer yerlere koyduğunu gösterir. " +
  "<b>A Parti</b> küçük bir partidir ve altı eksendeki konumu merkeze yakın tanımlanmıştır; bu yüzden ‘en yakın parti’ sıralamasında her zaman büyük partilerin arkasına konur (ısı haritasında, anma ve ton bölümlerinde yine görünür).";

function ptPc(x) { return "%" + dec(100 * x, 1); }
function ptName(s) { var p = (D.P || []).filter(function (x) { return x.s === s; })[0]; return p ? p.n : s; }
function ptHow(lines) { return '<ul class="or-how">' + lines.map(function (l) { return "<li>" + l + "</li>"; }).join("") + "</ul>"; }
function ptLeanSort(a, b) { return a.lean - b.lean || (a.n < b.n ? -1 : 1); }

/* Cheap part (distances), cached; the headline scan is separate (ptMent) so the tab can paint first. */
function ptData() {
  if (PT) return PT;
  var parties = D.P.filter(function (p) { return hasAxes(p); }).sort(ptLeanSort);
  var outs = orderOutlets(LIVE.filter(function (s) { return SRC[s] && hasAxes(SRC[s]); }).map(function (s) { return { s: s }; }), function (s) { return SRC[s].lean; })
    .map(function (r) { return SRC[r.s]; });
  var dist = {}, near = {};
  outs.forEach(function (o) {
    var rk = partyRank(o, parties); near[o.s] = rk;
    dist[o.s] = {}; rk.forEach(function (x) { dist[o.s][x.p.s] = x.d; });
  });
  PT = { parties: parties, outs: outs, dist: dist, near: near };
  return PT;
}
/* Headline scan over ~190k political headlines (prefiltered); adds mention fields to the same object. */
function ptMent() {
  var d = ptData(); if (d.stats) return d;
  var parties = d.parties, comp = compileAliases(parties), mp = comp.map(function (c) { return c.s; });
  var mOuts = d.outs.filter(function (o) { return polOf(o.s).length >= 20; });
  var rows = []; mOuts.forEach(function (o) { polOf(o.s).forEach(function (a) { rows.push({ s: a.s, t: a.t, v: a.v }); }); });
  var stats = mentionStats(rows, comp), shares = mentionShares(stats, mp, bloc);
  var tot = {}, ps = 0, pn = 0, any = 0;
  mp.forEach(function (p) { tot[p] = { c: 0, sum: 0 }; });
  mOuts.forEach(function (o) {
    var st = stats[o.s]; if (!st) return;
    pn += st.n; any += st.any;
    mp.forEach(function (p) { if (st.m[p]) { tot[p].c += st.m[p].c; tot[p].sum += st.m[p].sum; } });
  });
  rows.forEach(function (r) { ps += r.v || 0; });
  var mparties = parties.filter(function (p) { return tot[p.s]; });
  d.mOuts = mOuts; d.mparties = mparties; d.stats = stats; d.shares = shares; d.tot = tot; d.pn = pn; d.any = any; d.mean = pn ? ps / pn : 0;
  d.top = mparties.slice().sort(function (a, b) { return tot[b.s].c - tot[a.s].c; });
  return d;
}

/* Outlet × party grid as an SVG string. o: {rows:[{label, lean}], cols:[{label, lean}], cell(ri, ci) -> {txt, t (0..1), tip, ring} | null, label}. */
function ptHeat(o) {
  var cw = 40, rh = 22, lw = 140, top = 100, W = lw + o.cols.length * cw + 70, H = top + o.rows.length * rh + 8, g = "";
  o.cols.forEach(function (c, i) {
    g += '<g transform="translate(' + (lw + i * cw + cw / 2) + "," + (top - 8) + ') rotate(-45)"><circle cx="-8" cy="-3.5" r="3" fill="' + lean(c.lean) + '"/>' +
      '<text x="0" y="0" font-size="11" fill="var(--ink2)" font-family="var(--ff-m)">' + esc(c.label) + "</text></g>";
  });
  o.rows.forEach(function (r, ri) {
    var y = top + ri * rh;
    g += '<text x="' + (lw - 16) + '" y="' + (y + rh / 2 + 4) + '" text-anchor="end" font-size="11.5" fill="var(--ink)">' + esc(r.label) + "</text>" +
      '<circle cx="' + (lw - 7) + '" cy="' + (y + rh / 2) + '" r="3.2" fill="' + lean(r.lean) + '"/>';
    o.cols.forEach(function (c, ci) {
      var x = lw + ci * cw, cell = o.cell(ri, ci);
      if (!cell) { g += '<rect x="' + x + '" y="' + y + '" width="' + (cw - 2) + '" height="' + (rh - 2) + '" rx="2" fill="var(--line)" fill-opacity=".35"/>'; return; }
      g += '<g' + vzTipAttr(cell.tip) + '><rect x="' + x + '" y="' + y + '" width="' + (cw - 2) + '" height="' + (rh - 2) + '" rx="2" fill="var(--seq4)" fill-opacity="' +
        (.1 + .85 * cell.t).toFixed(2) + '"' + (cell.ring ? ' stroke="var(--ink)" stroke-width="2"' : "") + "/>" +
        '<text x="' + (x + (cw - 2) / 2) + '" y="' + (y + rh / 2 + 3.5) + '" text-anchor="middle" font-size="10.5" font-family="var(--ff-m)" fill="var(--ink)" stroke="var(--paper)" stroke-width="2.4" paint-order="stroke">' + esc(cell.txt) + "</text></g>";
    });
  });
  return '<div class="pt-scroll" tabindex="0" role="region" aria-label="' + esc(o.label) + '"><svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.label) + '">' + g + "</svg></div>" +
    '<p class="pt-hint">Tablo yatay kaydırılır →</p>';
}

/* ------------------------------------------------ 1. closeness */
function ptClose(d) {
  var cnt = {}, best = null;
  d.outs.forEach(function (o) { var n = d.near[o.s][0]; if (!n) return; cnt[n.p.s] = (cnt[n.p.s] || 0) + 1; if (!best || n.d < best.d) best = { o: o, p: n.p, d: n.d }; });
  var order = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }), top = order[0];
  var all = []; d.outs.forEach(function (o) { d.parties.forEach(function (p) { all.push(d.dist[o.s][p.s]); }); });
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  var rows = d.outs.map(function (o) {
    var rk = d.near[o.s], n = rk[0];
    return { k: o.s, label: o.n, sw: lean(o.lean), go: "#/kurum?s=" + o.s, span: "pts", val: esc(n.p.n) + " · " + dec(n.d, 0),
      pts: [{ v: o.lean, c: lean(o.lean) }, { v: n.p.lean, c: lean(n.p.lean), hollow: true }],
      tip: "<span class='k'>" + esc(o.n) + "</span>En yakın partiler (altı eksende mesafe):<br>" + rk.slice(0, 3).map(function (x, i) { return (i + 1) + ". " + esc(x.p.n) + " · " + dec(x.d, 1); }).join("<br>") };
  });
  var heat = ptHeat({ label: "Kurum ve parti arasındaki altı eksenli mesafe; koyu hücre yakın demektir", rows: d.outs.map(function (o) { return { label: o.n, lean: o.lean }; }),
    cols: d.parties.map(function (p) { return { label: p.n, lean: p.lean }; }),
    cell: function (ri, ci) {
      var o = d.outs[ri], p = d.parties[ci], v = d.dist[o.s][p.s], nr = d.near[o.s][0];
      return { txt: dec(v, 0), t: 1 - (v - lo) / (hi - lo), ring: nr.p.s === p.s,
        tip: "<span class='k'>" + esc(o.n) + " · " + esc(p.n) + "</span>Mesafe " + dec(v, 1) + (nr.p.s === p.s ? "<br>Bu kurumun en yakın partisi" : "") };
    } });
  var viz = '<div class="pt-sub">En yakın parti · kurumlar sol–sağ sırasıyla</div>' + vzKey([{ c: "var(--ink)", t: "kurum (kayıt defterindeki sol–sağ yerleşim)" }, { c: "var(--ink)", kind: "o", t: "en yakın parti (kendi sol–sağ yerleşimi)" }]) +
    vzRows(rows, { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: function (v) { return v; }, lw: 150, vw: 150, axis: "Yatay eksen 0 (sol) – 100 (sağ). En yakın parti altı eksendeki toplam mesafeyle bulunur; bu yüzden sol–sağ çizgide uzak görünebilir." }) +
    '<div class="pt-sub">Kurum × parti mesafesi · hücredeki sayı altı eksendeki Öklid mesafesi</div>' + heat +
    '<div class="fig-legend"><span class="lb">Ölçek</span>' + scaleHTML("uzak " + dec(hi, 0), "yakın " + dec(lo, 0), "mesafe") + '<span class="k"><em style="background:none;box-shadow:inset 0 0 0 2px var(--ink)"></em>çerçeveli: en yakın parti</span></div>';
  var tbl = vzTable(["Kurum", "Yerleşim", "En yakın parti", "Mesafe", "2. yakın", "3. yakın"], d.outs.map(function (o) {
    var r = d.near[o.s]; return [o.n, o.lean, r[0].p.n, dec(r[0].d, 1), r[1].p.n + " (" + dec(r[1].d, 1) + ")", r[2].p.n + " (" + dec(r[2].d, 1) + ")"];
  })) + vzTable(["Kurum"].concat(d.parties.map(function (p) { return p.n; })), d.outs.map(function (o) {
    return [o.n].concat(d.parties.map(function (p) { return dec(d.dist[o.s][p.s], 1); }));
  }));
  return { top: top, cnt: cnt, best: best, find: findingBlock({ id: "parti-yakin",
    claim: "Altı eksende " + d.outs.length + " kurumun " + cnt[top] + " tanesine en yakın parti " + esc(ptName(top)) + "; en yakın kurum–parti çifti " + esc(best.o.n) + " ile " + esc(best.p.n) + " (mesafe " + dec(best.d, 1) + ").",
    viz: viz,
    read: "<b>Nasıl okunur.</b> Mesafe, bir kurumun ve bir partinin altı eksendeki (ekonomik, toplumsal, laik–dindar, devlet rolü, milliyetçi–çoğulcu, gelenek–kozmopolit) konumları arasındaki düz çizgi uzaklığıdır; küçük sayı benzer profil demektir. Satırlar sola yerleşikten sağa yerleşiğe, sütunlar sol partiden sağ partiye dizilir.",
    how: ptHow(["Mesafe = √(Σ (kurum − parti)²), altı eksen, her eksen 0–100. Mümkün en büyük değer 245.", "Parti konumları ideolojik tanımlardan türetilmiştir, oy davranışından değil; kurum konumları sağlanan kayıt defterinden gelir. Hiçbiri bu sitede bağımsız doğrulanmadı.",
      "<b>Yakınlık bağlılık değildir:</b> bir kurumun bir partiye yakın düşmesi ona ait olduğu ya da onun sözcülüğünü yaptığı anlamına gelmez.", "Kayıt defterinde altı ekseni olmayan kurumlar (" + (D.S.length - d.outs.length) + " kayıt) bu bölümde yer almaz."]) +
      '<p class="pt-sub">Tablo</p>', table: tbl }) };
}

/* ------------------------------------------------ 2. six axes */
function ptAxes(d) {
  var spread = function (list) {
    return PCAX.map(function (a) { var v = list.map(function (m) { return m[a[0]]; }); return { a: a, r: Math.max.apply(null, v) - Math.min.apply(null, v) }; }).sort(function (x, y) { return y.r - x.r; });
  };
  var so = spread(d.outs), sp = spread(d.parties), L = function (x) { return x.a[1] + " (" + x.r + " puan)"; };
  var all = d.outs.concat(d.parties.map(function (p) { return Object.assign({ isP: 1 }, p); }));
  var tbl = vzTable(["", "Tür", "Yerleşim"].concat(PCAX.map(function (a) { return a[1]; })), all.map(function (m) {
    return [m.n, m.isP ? "parti" : "kurum", m.lean].concat(PCAX.map(function (a) { return m[a[0]]; }));
  }));
  return findingBlock({ id: "parti-eksen",
    claim: "Kurumlar altı eksenden en çok " + L(so[0]) + " ekseninde dağılıyor, en az " + L(so[so.length - 1]) + " ekseninde; partilerde en geniş aralık " + L(sp[0]) + " ekseninde.",
    viz: '<div class="pt-pc" id="pt-pc" tabindex="0" role="region" aria-label="Altı eksenli çizgi grafiği; kurumlar ve partiler"></div><p class="pt-hint">Grafik yatay kaydırılır →</p>' +
      vzKey([{ c: "var(--left)", t: "sola yerleşik" }, { c: "var(--mid)", t: "merkez" }, { c: "var(--right)", t: "sağa yerleşik" }]),
    read: "<b>Nasıl okunur.</b> Her çizgi, bir kurumun (ince, düz) ya da partinin (kalın, kesikli, sağ uçta adı yazılı) altı eksendeki yerini birleştirir. Çizgileri üst üste binen kurumlar ve partiler o eksenlerde benzer konumdadır; çizginin bir eksende ani kırılması, tek bir sol–sağ çizgisinin gizlediği ayrımdır. Bir çizginin üzerine gelince o öne çıkar; kurum çizgisine tıklayınca kurum sayfası açılır.",
    how: ptHow(["Eksenler: " + PCAX.map(function (a) { return a[1]; }).join(", ") + "; hepsi 0–100.", "Aralık = o eksendeki en büyük ile en küçük konum arasındaki fark.", "Parti konumları ideolojik tanımlardan, kurum konumları sağlanan kayıt defterinden gelir; oy ya da içerik ölçümü değildir. Yakınlık bağlılık değildir."]) +
      '<p class="pt-sub">Tablo</p>', table: tbl });
}

/* ------------------------------------------------ 3. who names whom */
function ptMRows(d, slug) {
  var rows = d.mOuts.map(function (o) {
    var c = d.shares[o.s][slug], st = d.stats[o.s];
    return { k: o.s, label: o.n, sw: lean(o.lean), go: "#/kurum?s=" + o.s, ref: 100 * c.bloc, span: "ref", val: ptPc(c.rate) + " <small>(" + orN(c.c) + ")</small>",
      pts: [{ v: 100 * c.rate, c: lean(o.lean) }],
      tip: "<span class='k'>" + esc(o.n) + "</span>" + orN(c.c) + " / " + orN(c.n) + " siyasi başlık " + esc(ptName(slug)) + " adını içeriyor (" + ptPc(c.rate) + ")<br>Kendi bloğunun ortalaması " + ptPc(c.bloc) };
  });
  var mx = Math.max.apply(null, rows.map(function (r) { return Math.max(r.pts[0].v, r.ref); }));
  return vzRows(rows, { min: 0, max: Math.max(1, Math.ceil(mx * 1.1)), fmt: function (v) { return dec(v, v < 10 ? 1 : 0); }, lw: 150, vw: 96,
    axis: "Yatay eksen: kurumun siyasi başlıklarının yüzde kaçı bu partiyi adıyla anıyor. Dikey çizgi kurumun kendi bloğunun toplu oranı." });
}
function ptMention(d) {
  var top = d.top[0], bl = { left: [0, 0], mid: [0, 0], right: [0, 0] };
  d.mOuts.forEach(function (o) { var b = bloc(o.s); if (!bl[b]) return; bl[b][0] += d.stats[o.s].m[top.s] ? d.stats[o.s].m[top.s].c : 0; bl[b][1] += d.stats[o.s].n; });
  var rate = function (b) { return bl[b][1] ? bl[b][0] / bl[b][1] : 0; };
  var chips = d.top.filter(function (p) { return d.tot[p.s].c >= 20; });
  PT_SEL = PT_SEL && chips.some(function (p) { return p.s === PT_SEL; }) ? PT_SEL : top.s;
  var ctl = '<div class="or-ctl pt-chips" role="group" aria-label="Parti seçin"><span class="or-cl">Parti</span>' + chips.map(function (p) {
    return '<button type="button" class="chip" data-pm="' + p.s + '" aria-pressed="' + (p.s === PT_SEL) + '">' + esc(p.n) + "</button>"; }).join("") + "</div>";
  var tcols = chips;
  var tbl = vzTable(["Kurum", "Siyasi başlık"].concat(tcols.map(function (p) { return p.n; })), d.mOuts.map(function (o) {
    return [o.n, orN(d.stats[o.s].n)].concat(tcols.map(function (p) { var c = d.shares[o.s][p.s]; return orN(c.c) + " (" + ptPc(c.rate) + ")"; }));
  }));
  var excl = D.P.filter(function (p) { return !PARTI_ALIAS[p.s]; }).map(function (p) { return p.n; });
  return findingBlock({ id: "parti-anma",
    claim: "Siyasi başlıkların " + ptPc(d.any / d.pn) + " kadarı (" + orN(d.any) + " / " + orN(d.pn) + ") bir partiyi adıyla anıyor; en sık anılan " + esc(top.n) + " (" + orN(d.tot[top.s].c) + " başlık). Siyasi başlıklardaki payı: sola yerleşik kurumlarda " + ptPc(rate("left")) + ", sağa yerleşiklerde " + ptPc(rate("right")) + ".",
    viz: ctl + '<div id="pt-mrows">' + ptMRows(d, PT_SEL) + "</div>" + vzKey([{ c: "var(--ink)", t: "kurum" }, { kind: "t", t: "kendi bloğunun toplu oranı" }]),
    read: "<b>Nasıl okunur.</b> Bir parti seçin; her satır bir kurum, nokta o kurumun siyasi başlıklarında partinin adının geçme oranıdır. Dikey çizgi kurumun kendi bloğunun (sol, merkez, sağ) toplu oranıdır: nokta çizginin sağındaysa kurum bu partiyi bloğundan daha sık anıyor. Anmak ne olumlu ne olumsuz bir tutumdur; yalnızca adın başlıkta geçtiğini gösterir.",
    how: ptHow(["Payda: siyasi başlıklar (sitenin siyasi bayrağı taşıyan haberleri), en az 20 siyasi başlığı olan " + d.mOuts.length + " kurum, " + orN(d.pn) + " başlık.", "Eşleştirme: partinin adı ve kısaltması, harf duyarsız ve Türkçe karakterden bağımsız, sözcük sınırlarıyla; ‘CHP’li’ gibi ekler kabul edilir, ama kısaltma sözcüğün içinde kalıyorsa (Akpınar) sayılmaz. ‘DEM’, ‘TİP’, ‘DEVA’ ve ‘Yeni Parti’ gibi sıradan sözcüklerle çakışan adlar yalnızca büyük harfle yazıldığında sayılır.",
      "Bilerek dışarıda bırakılanlar: " + excl.map(esc).join(", ") + " (başka bir ülkenin partisiyle karışıyor). Lider adları sayılmadı; yalnızca parti adı geçen başlıklar sayıldı. Bu nedenle sayılar alt sınırdır.",
      "Bir başlık birden çok partiyi anıyorsa her birine sayılır."]) + '<p class="pt-sub">Tablo</p>', table: tbl });
}

/* ------------------------------------------------ 4. tone */
function ptTone(d) {
  var cols = d.mparties.filter(function (p) { return d.mOuts.filter(function (o) { return toneCell(d.stats[o.s].m[p.s], PT_MIN).mean !== null; }).length >= 3; });
  var rows = d.mOuts.filter(function (o) { return cols.some(function (p) { return toneCell(d.stats[o.s].m[p.s], PT_MIN).mean !== null; }); });
  var vals = [], hid = 0, cells = 0;
  d.mOuts.forEach(function (o) { cols.forEach(function (p) { var c = d.stats[o.s].m[p.s]; if (!c) return; cells++; var t = toneCell(c, PT_MIN); if (t.mean === null) hid++; else vals.push(t.mean); }); });
  if (!vals.length) return findingBlock({ id: "parti-ton", claim: "Her hücrede en az " + PT_MIN + " başlık gerektiği için bu dönemde gösterilecek ton verisi yok.", viz: "" });
  var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
  var pooled = cols.map(function (p) { var t = toneCell(d.tot[p.s], 30); return { p: p, m: t.mean, n: t.n }; }).filter(function (x) { return x.m !== null; }).sort(function (a, b) { return b.m - a.m; });
  var heat = ptHeat({ label: "Parti adı geçen başlıklarda ortalama yüklü dil puanı, kurum ve parti başına", rows: rows.map(function (o) { return { label: o.n, lean: o.lean }; }),
    cols: cols.map(function (p) { return { label: p.n, lean: p.lean }; }),
    cell: function (ri, ci) {
      var o = rows[ri], p = cols[ci], t = toneCell(d.stats[o.s].m[p.s], PT_MIN);
      if (t.mean === null) return null;
      return { txt: dec(t.mean, 0), t: Math.max(0, (t.mean - mn) / ((mx - mn) || 1)), tip: "<span class='k'>" + esc(o.n) + " · " + esc(p.n) + "</span>Ortalama yüklü dil puanı " + dec(t.mean, 1) + "<br>" + orN(t.n) + " başlık" };
    } });
  var viz = heat + '<div class="fig-legend"><span class="lb">Ölçek</span>' + scaleHTML("sakin " + dec(mn, 0), "yüklü " + dec(mx, 0), "ortalama puan") + '<span class="k"><em style="background:var(--line);opacity:.5"></em>boş: ' + PT_MIN + "’dan az başlık, gösterilmedi</span></div>";
  var tbl = vzTable(["Kurum"].concat(cols.map(function (p) { return p.n; })), rows.map(function (o) {
    return [o.n].concat(cols.map(function (p) { var c = d.stats[o.s].m[p.s], t = toneCell(c, PT_MIN); return t.mean === null ? (c ? "— (n=" + c.c + ")" : "—") : dec(t.mean, 1) + " (n=" + t.n + ")"; }));
  })) + vzTable(["Parti", "Ortalama puan", "Başlık"], pooled.map(function (x) { return [x.p.n, dec(x.m, 1), orN(x.n)]; }));
  if (!pooled.length) return findingBlock({ id: "parti-ton", claim: "Hiçbir parti için yeterli başlık (en az 30) yok; ton karşılaştırması gösterilmiyor.", viz: viz, table: tbl });
  var hi = pooled[0], lo2 = pooled[pooled.length - 1];
  return findingBlock({ id: "parti-ton",
    claim: "Parti adı geçen siyasi başlıklarda ortalama yüklü dil puanı " + esc(hi.p.n) + " için en yüksek (" + dec(hi.m, 1) + "), " + esc(lo2.p.n) + " için en düşük (" + dec(lo2.m, 1) + "); tüm siyasi başlıkların ortalaması " + dec(d.mean, 1) + " (kurum karışımına bağlı).",
    viz: viz,
    read: "<b>Nasıl okunur.</b> Her hücre, bir kurumun o partinin adını içeren siyasi başlıklarının ortalama yüklü dil puanıdır (0–100; koyu hücre daha yüklü). Aynı sütunda koyu ve açık hücreler varsa kurumlar aynı partiden farklı bir dille söz ediyor demektir. Boş hücre ‘az haber’ demektir, ‘sakin’ değil.",
    how: ptHow(["Puan: sitenin kural tabanlı yüklü dil puanı (başlık başına 0–100); her başlığın puanı o başlıkta adı geçen her partiye yazılır.", "<b>" + PT_MIN + "’dan az başlıklı hücreler gösterilmez</b>: " + orN(cells) + " dolu hücrenin " + orN(hid) + " tanesi bu yüzden boş. Partiler için genel ortalama en az 30 başlık ister; sütun gösterimi için en az 3 kurumda görünür hücre gerekir.",
      "Puan başlığın konusundan da etkilenir (bir yolsuzluk iddiası sakin sözcüklerle yazılsa da yüksek çıkabilir). Bu bir ‘partiye karşı tutum’ ölçüsü değildir; başlığın olumlu ya da olumsuz olduğunu söylemez.", "Eşleştirme sınırları için bir önceki bölüme bakın."]) + '<p class="pt-sub">Tablo</p>', table: tbl });
}

/* ------------------------------------------------ 5. ownership */
function ptOwn(d) {
  var grp = {};
  d.outs.forEach(function (o) { var g = o.own && o.own.grp ? o.own.grp : "Kayıt yok"; (grp[g] = grp[g] || []).push(o); });
  var names = Object.keys(grp).sort(function (a, b) { return trCmp(a, b); });
  var multi = names.filter(function (g) { return grp[g].length > 1; }), same = multi.filter(function (g) { return grp[g].every(function (o) { return d.near[o.s][0].p.s === d.near[grp[g][0].s][0].p.s; }); });
  var rows = [], tr = [];
  names.forEach(function (g) {
    grp[g].forEach(function (o) {
      var n = d.near[o.s][0], st = d.stats[o.s], mp = d.mparties.filter(function (p) { return st && st.m[p.s]; }).sort(function (a, b) { return st.m[b.s].c - st.m[a.s].c; })[0];
      var prof = mp ? mp.n + " (" + ptPc(st.m[mp.s].c / st.n) + ")" : "—";
      rows.push({ k: o.s, label: o.n, sub: g, sw: lean(o.lean), go: "#/kurum?s=" + o.s, span: "pts", val: esc(n.p.n),
        pts: [{ v: o.lean, c: lean(o.lean) }, { v: n.p.lean, c: lean(n.p.lean), hollow: true }],
        tip: "<span class='k'>" + esc(o.n) + "</span>Sahiplik (kayıt defteri): " + esc(g) + "<br>En yakın parti: " + esc(n.p.n) + " · mesafe " + dec(n.d, 1) + "<br>En çok andığı parti: " + esc(prof) });
      tr.push([o.n, g, o.lean, n.p.n + " (" + dec(n.d, 1) + ")", prof]);
    });
  });
  var viz = vzKey([{ c: "var(--ink)", t: "kurum (sol–sağ yerleşim)" }, { c: "var(--ink)", kind: "o", t: "en yakın parti" }]) +
    vzRows(rows, { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], fmt: function (v) { return v; }, lw: 230, vw: 130, axis: "Satırlar sahiplik grubuna göre gruplanır; yatay eksen 0 (sol) – 100 (sağ). Sağdaki ad, altı eksende en yakın partidir." }) +
    '<div class="note pt-note"><b>Doğrulanmış bir sahip–parti bağı yoktur.</b> Veride bir kurumun sahibinin bir partiyle ilişkisine dair doğrulanmış bir kayıt bulunmuyor; sahiplik bilgisi sağlanan kayıt defterinden olduğu gibi aktarılır. Bu bölüm yalnızca yan yana koyar, bir bağ iddia etmez.</div>';
  return findingBlock({ id: "parti-sahip",
    claim: "Kayıt defterinde " + names.length + " sahiplik etiketi var; birden çok kurumu olan " + multi.length + " grubun " + same.length + " tanesinde bütün kurumların en yakın partisi aynı. Bu yan yana koymadır: verilerde doğrulanmış bir sahip–parti bağı yok.",
    viz: viz,
    read: "<b>Nasıl okunur.</b> Her satır bir kurum; altındaki küçük yazı kayıt defterindeki sahiplik etiketi, dolu nokta kurumun sol–sağ yerleşimi, boş nokta altı eksendeki en yakın partinin yerleşimidir. Aynı grubun kurumları aynı partiye yakınsa satırlar benzer görünür; bu bir bağın değil, yalnızca benzer konumun işaretidir. Fareyle üzerine gelince kurumun en çok andığı parti de görünür.",
    how: ptHow(["Sahiplik etiketi kayıt defterinden olduğu gibi alınır (" + D.S.filter(function (s) { return s.own && s.own.grp; }).length + " kurumda var); ‘Kayıt yok’ etiketi yalnızca bilginin eksik olduğunu gösterir. Etiketler ‘bağımsız’, ‘çevresi’ gibi serbest ifadeler içerir ve doğrulanmadı.", "En yakın parti ve ‘en çok andığı parti’ önceki bölümlerin hesabıdır; sınırları orada.", "<b>Yakınlık bağlılık değildir</b> ve sahiplik bir partiyle ilişkiyi göstermez."]) + '<p class="pt-sub">Tablo</p>',
    table: vzTable(["Kurum", "Sahiplik (kayıt defteri)", "Yerleşim", "En yakın parti (mesafe)", "En çok andığı parti (siyasi başlıklardaki pay)"], tr) });
}

/* ------------------------------------------------ page */
function ptLate(d) {
  /* own wrapper: the tickets pin their parent, which must never be the whole page or the late block */
  return '<div class="pt-sec">' + pTickets([{ n: d.pn, label: "incelenen siyasi başlık" }, { n: d.any, label: "parti adı geçen başlık" }]) + "</div>" +
    pHead("3 · Kim kimi anıyor", "Başlıklarda parti adları", "parti-3") + ptMention(d) +
    pHead("4 · Ton", "Hangi partiden hangi dille söz ediliyor", "parti-4") + ptTone(d) +
    pHead("5 · Sahiplik", "Sahiplik ve en yakın parti", "parti-5") + ptOwn(d) +
    '<div class="note pt-note">' + PT_NOTE + "</div>";
}
function pgParti() {
  var d = ptData(), c = ptClose(d);
  var h = '<div class="wrap page or"><div class="phead"><div class="eyebrow">Kurumlar › Partiler</div><h1>Kurumlar ve partiler: yakınlık, anma, ton</h1>' +
    '<p class="lede">Kurumların ve ' + d.parties.length + ' partinin aynı altı eksendeki yerleşimlerini yan yana koyuyor, sonra siyasi başlıklarda hangi partinin ne sıklıkla ve hangi dille anıldığına bakıyoruz.</p></div>';
  h += '<div class="pt-sec">' + pLead("Hiçbiri bir kurumun bir partiyle bağlantılı olduğunu göstermez: parti konumları ideolojik tanımlardan, kurum konumları sağlanan kayıt defterinden gelir ve ikisi de bu sitede doğrulanmadı. Yakın olmak, bağlı olmak değildir.") +
    pTickets([{ n: d.outs.length, label: "kurum, altı eksende yerleşik" }, { n: d.parties.length, label: "parti" }]) + "</div>";
  h += pHead("1 · Yakınlık", "Hangi kurum hangi partiye yakın", "parti-1") + c.find;
  h += pHead("2 · Altı eksen", "Kurumlar ve partiler altı eksende", "parti-2") + ptAxes(d);
  h += '<div id="pt-late" aria-busy="true"><p class="pt-skel">Başlıklar taranıyor…</p></div></div>';
  return h;
}

function wireParti() {
  var root = document.getElementById("view"); if (!root) return;
  var box = document.getElementById("pt-pc");
  if (box && !box.firstChild) {
    var s = parallelCoords({ parties: true, liveOnly: true });
    s.setAttribute("aria-label", "Altı eksenli çizgi grafiği: kurumlar ve partiler"); box.appendChild(s);
  }
  wireGo(root);
  var late = document.getElementById("pt-late");
  if (late && late.getAttribute("aria-busy")) setTimeout(function () {
    var box2 = document.getElementById("pt-late"); if (!box2 || !box2.getAttribute("aria-busy")) return;
    box2.innerHTML = ptLate(ptMent()); box2.removeAttribute("aria-busy"); wireGo(box2);
    if (typeof motionAdd === "function") motionAdd(box2);
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }, 0);
  if (!root._pt) {
    root._pt = 1;
    root.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-pm]"); if (!b) return;
      PT_SEL = b.getAttribute("data-pm");
      [].forEach.call(root.querySelectorAll("[data-pm]"), function (x) { x.setAttribute("aria-pressed", x === b); });
      var t = document.getElementById("pt-mrows"); if (t) { vzSwap(t, ptMRows(ptData(), PT_SEL)); wireGo(t); }
    });
  }
}
