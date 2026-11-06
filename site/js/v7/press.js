/* v7 press: broadsheet component markup. Every helper takes plain text and escapes it; data-m="<kind>" hooks the
   matching MOTION_K timeline in motion.js. Without the motion libraries each component already reads in its final state. */

function pHead(kicker, title) {
  return '<header class="p-head" data-m="head"><i class="p-rule" aria-hidden="true"></i><p class="p-kick">' + esc(kicker) + '</p><h2 class="p-title">' + esc(title) + "</h2></header>";
}

/* Lead paragraph; the first letter (with any opening quote) becomes a 3-line drop cap. */
function pLead(text) {
  var t = String(text == null ? "" : text).trim(), m = t.match(/^[\s"'“‘(]*./u) || [""];
  return '<p class="p-lead" data-m="lead"><span class="p-cap">' + esc(m[0]) + "</span>" + esc(t.slice(m[0].length)) + "</p>";
}

function pTickets(nums) {
  if (!nums || !nums.length) return "";
  return '<div class="p-tix" data-m="tickets">' + nums.map(function (x) {
    var t = (+x.n).toLocaleString("tr");
    return '<div class="tix"><b class="tix-n" data-n="' + (+x.n) + '" style="--d:' + t.length + '">' + t + '</b><span class="tix-l">' + esc(x.label) + "</span></div>";
  }).join("") + "</div>";
}

/* Left sentence · frosted shared band · right sentence; empty sides are left out. */
function pCommon(leftText, sharedText, rightText) {
  var side = function (t, c) { return t ? '<p class="pc-side ' + c + '">' + esc(t) + "</p>" : ""; };
  return '<div class="p-common" data-m="common">' + side(leftText, "pc-l") + '<p class="pc-band">' + esc(sharedText) + "</p>" + side(rightText, "pc-r") + "</div>";
}

/* Split accordion from pSplitPoints output (or steps: {bloc, word, title, text, outlets:[]}): one panel per point; giant key word
   (first quoted phrase, else none) in the side colour; an optional bold title leads the text. */
function pSplits(points) {
  return '<div class="p-splits" data-m="splits">' + (points || []).map(function (p, i) {
    var no = (i < 9 ? "0" : "") + (i + 1);
    return '<button type="button" class="panel ' + p.bloc + (i ? "" : " on") + '"><span class="p-no">' + no + "</span>" + (p.word ? '<span class="p-giant" aria-hidden="true">' + esc(p.word) + "</span>" : "") +
      '<span class="p-body">' + (p.title ? '<b class="p-ttl">' + esc(p.title) + "</b>" : "") + '<span class="p-txt">' + esc(p.text) + "</span>" + (p.outlets.length ? '<span class="p-chips">' + p.outlets.map(function (s) {
        return '<span class="p-chip"><i class="v7-ld ' + bloc(s) + '"></i>' + esc(srcName(s)) + "</span>";
      }).join("") + "</span>" : "") + "</span></button>";
  }).join("") + "</div>";
}

/* n frosted squares, side-tinted, at fixed spots (decorative). */
function pGlass(n) {
  var c = ["left", "right"], h = "";
  for (var i = 0; i < n; i++) h += '<i style="--x:' + (i * 37 % 100) + "%;--y:" + (i * 53 % 90) + "%;--s:" + (16 + i * 13 % 34) + "px;--c:var(--" + c[i % 2] + ')"></i>';
  return '<div class="p-glass" data-m="glass" aria-hidden="true">' + h + "</div>";
}
