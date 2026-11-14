/* 8.1 "Yeni": what the added data changed, from D.W81 (pipeline/capraz_pipeline/whatsnew.py compares the 8.0 and 8.1 builds). */
var YN_TAG = { yeni: "Yeni", "değişti": "Değişti", "sürüyor": "Sürüyor", "uyarı": "Sınır" };
function ynCard(f, i) {
  var rows = f.rows || [], three = rows.length && rows[0].length === 3 && !f.events, ev = f.events;
  var head = three ? "<tr><th></th><th class=\"r\">8.0</th><th class=\"r\">8.1</th></tr>" : ev ? "<tr><th>Olay</th><th class=\"r\">Kurum</th></tr>" : "";
  var body = rows.map(function (r) {
    if (ev) return '<tr><td><a href="#/olay?e=' + encodeURIComponent(r[2]) + '">' + esc(r[0]) + '</a></td><td class="r num">' + esc(r[1]) + "</td></tr>";
    return "<tr><td>" + esc(r[0]) + '</td><td class="r num">' + esc(r[1]) + "</td>" + (r[2] !== "" ? '<td class="r num">' + esc(r[2]) + "</td>" : "") + "</tr>";
  }).join("");
  return '<article class="yn-card yn-' + (f.tag === "uyarı" ? "warn" : f.tag === "yeni" ? "new" : f.tag === "değişti" ? "chg" : "same") + '" id="yn-' + esc(f.id) + '">' +
    '<p class="yn-tag"><span class="yn-chip">' + esc(YN_TAG[f.tag] || f.tag) + '</span><span class="yn-n">' + (i + 1) + "</span></p>" +
    "<h2>" + esc(f.title) + "</h2><p class=\"yn-claim\">" + esc(f.claim) + "</p>" +
    (rows.length ? '<div class="scroller panel"><table class="yn-t"><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>" : "") +
    (f.note ? '<p class="xsmall yn-note">' + esc(f.note) + "</p>" : "") + "</article>";
}
function pgYenilikler() {
  var W = D.W81, m = D.meta.counts;
  if (!W) return '<div class="wrap page"><div class="phead"><h1>8.1’de yeni</h1><p class="lede">Bu sürümde karşılaştırma verisi yok.</p></div></div>';
  return '<div class="wrap page v7-yn"><div class="phead"><div class="eyebrow">Çapraz Manşet 8.1</div><h1>8.1’de yeni: eklenen veri neyi değiştirdi?</h1>' +
    '<p class="lede">8.0, 1 Eylül–3 Kasım arasındaki 33 kurumun başlıklarına dayanıyordu. 8.1, toplayıcıdaki gelişmelerle ' + orN(m.articles) + ' başlığa, ' + D.meta.sources.length +
    " kuruma ve 13 Kasım’a kadar uzanan bir pencereye geçti. Aşağıda bütün analizlerin iki sürümdeki sonucu yan yana; <b>Yeni</b> yalnızca 8.1’de olabilen bulgu, <b>Değişti</b> sonucu kayan, " +
    "<b>Sürüyor</b> aynı kalan bulgudur. Her sayı iki veri paketinden hesaplanır.</p></div>" +
    '<div class="yn-grid">' + W.findings.map(ynCard).join("") + "</div>" +
    '<p class="xsmall">Yöntem ve sınırlar: <a href="#/yontem">Nasıl çalışır</a>. Örüntüler sayfalarındaki bütün grafikler 8.1 verisiyle yeniden hesaplandı.</p></div>';
}
SECTIONS.push({ p: "/yenilikler", label: "8.1’de yeni", fn: pgYenilikler });
DETAIL["/yenilikler"] = { fn: pgYenilikler, of: "/yenilikler" };
