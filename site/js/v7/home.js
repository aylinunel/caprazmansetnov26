/* Homepage: what the site does, one live card per function. Each card states the function in one line
   and shows one number computed from this build's data. */
function feedCard(e) {
  var nk = NBYEV[e.i], narr = nk && narrOk(nk) ? D.N[nk] : null, sc = splitCard(e, null, { small: true, link: false });
  if (!sc) return "";
  return '<a class="v7-fc" href="#/olay?e=' + e.i + '"><h3 class="v7-fc-t">' + esc(storyLabel(e, 90)) + "</h3>" + sc +
    '<p class="v7-fc-d">' + esc(whatDiffers(e, narr)) + '</p><p class="v7-fc-n num">' + e.s.length + " kurum verdi</p></a>";
}
var FEED = { list: [], shown: 0 };
function feedMore() {
  var g = document.getElementById("feed-grid"), b = document.getElementById("feed-more");
  if (!g) return;
  /* new cards go in their own cascade (display:contents keeps them in the grid) so the mounted one is left alone */
  g.insertAdjacentHTML("beforeend", '<div class="v7-fgx" data-m="cascade">' + FEED.list.slice(FEED.shown, FEED.shown + 6).map(feedCard).join("") + "</div>");
  motionAdd(g.lastElementChild);
  FEED.shown = Math.min(FEED.list.length, FEED.shown + 6);
  if (b) b.hidden = FEED.shown >= FEED.list.length;
  dmFeedWatch(g);
}
document.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest("#feed-more")) feedMore(); });
function feedHTML(lead) {
  FEED.list = weeklySplits(D.E, DAYS[DAYS.length - 1], { exclude: [lead.i], cov: covOf }).filter(function (e) { return defaultPair(e); });
  FEED.shown = Math.min(6, FEED.list.length);
  var all = '<a class="lnk" href="#/olaylar">Tüm olaylar →</a>';
  return '<div class="wrap">' + pHead("Olaylar", "Bu hafta en farklı anlatılan olaylar") + (FEED.list.length ?
    '<div class="v7-fg" id="feed-grid" data-m="cascade">' + FEED.list.slice(0, 6).map(feedCard).join("") + "</div>" :
    '<p class="v7-fc-none">Bu hafta iki taraftan da verilen olay yok</p>') +
    '<div class="v7-fm"><button type="button" class="xbtn" id="feed-more"' + (FEED.shown >= FEED.list.length ? " hidden" : "") + ">Daha fazla göster</button>" + all + "</div></div>";
}
function pgHome7() {
  var top = weeklySplits(D.E, DAYS[DAYS.length - 1], { cov: covOf }).filter(function (e) { return defaultPair(e); });
  var lead = top[0] || leadEvent();
  var step = function (n, t, l) { return { bloc: "mid", word: String(n), title: t, text: l, outlets: [] }; }, m = D.meta.counts;
  var deep = ["/olaylar", "/anlati", "/oruntu", "/kurumlar", "/yontem"].map(function (r) {
    var nv = r === "/anlati" ? ["", "Anlatı haritası"] : NAV.filter(function (n) { return n[0] === r; })[0];
    return nv ? '<a class="v7-hc" href="#' + r + '"><b>' + esc(nv[1]) + "</b><span>" + esc(NAV_SUB[r]) + "</span></a>" : "";
  }).join("");
  var h = fogHero(lead) + '<section id="bu-hafta" class="v7-feed">' + feedHTML(lead) + '</section><div class="wrap page v7-home">';
  h += '<section class="v7-how">' + pGlass(6) + '<div class="p-ne">' + pHead("Nasıl çalışır", "Çapraz Manşet nasıl çalışır") +
    pTickets([{ n: m.articles, label: "başlık" }, { n: D.E.length, label: "olay" }, { n: D.meta.sources.length, label: "kurum" }]) + "</div>" + pSplits([
    step(1, "Karşılaştır", "Aynı olayın bütün başlıklarını yan yana koyarız."),
    step(2, "Fark et", "Kurumlar arasında ayrışan sözcükleri işaretleriz."),
    step(3, "Ölç", "Bu farkların haftalar boyunca tekrar edip etmediğini sayarız.")]) + "</section>";
  h += "<section>" + pHead("Çapraz Manşet", "Daha derine in") + '<div class="v7-hgrid">' + deep + "</div></section>";
  if (ADV && ADV.agenda) h += '<section class="v7-hnet"><div class="v7-hnet-t"><p class="eyebrow">Gündem ağı · ' + ADV.agenda.order.length + ' kurum</p><h2 class="v7-hh">Kim kiminle aynı haberleri seçiyor?</h2>' +
    '<p class="lede">Birlikte çok olay haber yapan kurumlar birbirine çekilir. Renk kayıt defterindeki yerleşim, büyüklük verilen olay sayısı. Bir kuruma ' + orTap() + ', komşuları öne çıksın.</p>' +
    '<a class="lnk" href="#/oruntu?q=secim&f=secim-gundem">Bulgunun tamamı →</a></div>' + g6Box("agenda", "", "Kurumların gündem benzerliği ağı") + "</section>";
  return h + "</div>";
}
