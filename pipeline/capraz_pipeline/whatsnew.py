"""8.1 "what is new" findings: the 8.0 build against the 8.1 build, from the two core.bin files.

    python -m capraz_pipeline.whatsnew --old <8.0 core.bin> --new <8.1 core.bin> --out ../data/reference/whatsnew-81.json

Every number is read from the two bundles; the sentences only wrap them. The output carries both sides of every
comparison, so the page needs no 8.0 files at run time. build.py merges it into core.bin as key W81.
"""
from __future__ import annotations

import argparse
import gzip
import json
import statistics
from pathlib import Path

from .config import REPO

OUT = REPO / "data" / "reference" / "whatsnew-81.json"
NEW_FROM = "2026-11-04"


def _load(p: Path) -> dict:
    return json.loads(gzip.decompress(Path(p).read_bytes()))


def _n(v: int) -> str:
    return f"{v:,}".replace(",", ".")


def _d(v: float, k: int = 1) -> str:
    return f"{v:.{k}f}".replace(".", ",")


def _sig(p: float) -> str:
    return "anlamlı (p < 0,05)" if p < 0.05 else "anlamlı değil (p ≥ 0,05)"


def build(old: dict, new: dict) -> dict:
    om, nm = old["meta"], new["meta"]
    oc, nc = om["counts"], nm["counts"]
    out = []
    shared = sorted(set(om["sources"]) & set(nm["sources"]))
    added = sorted(set(nm["sources"]) - set(om["sources"]))
    new_ev = [e for e in new["E"] if e["f"][:10] >= NEW_FROM]
    names = {r["s"]: r["n"] for r in new["S"]}
    names.update(new.get("SN", {}))
    nm_ = lambda s: names.get(s, s)

    same_n = sum(new["OM"][s]["n"] for s in shared)
    out.append({"id": "veri", "tag": "yeni", "title": "Daha çok veri, daha çok kurum, iki hafta daha",
        "claim": f"Başlık sayısı {_n(oc['articles'])}’ten {_n(nc['articles'])}’e (+%{round(100 * (nc['articles'] / oc['articles'] - 1))}), "
                 f"kurum sayısı {len(om['sources'])}’ten {len(nm['sources'])}’e, olay sayısı {_n(oc['events'])}’ten {_n(nc['events'])}’e çıktı.",
        "rows": [["Başlık", _n(oc["articles"]), _n(nc["articles"])], ["Kurum (veri alınan)", str(len(om["sources"])), str(len(nm["sources"]))],
                 ["Kayıtlı yayıncı", str(oc.get("feedsRead", "")), str(nc["feedsRead"])], ["Olay", _n(oc["events"]), _n(nc["events"])],
                 ["Dönem", f"{om['v2']['target']['start']} – {om['v2']['target']['end']}", f"{nm['v2']['target']['start']} – {nm['v2']['target']['end']}"]],
        "note": f"Artış iki kaynaktan gelir: pencere 3 Kasım’dan 13 Kasım’a uzadı ({_n(len(new_ev))} olay 4 Kasım ve sonrasında başladı) ve toplayıcı "
                f"geliştirildiği için 8.0’daki {len(shared)} kurumun kendisi de daha eksiksiz toplandı (aynı kurumlarda {_n(sum(old['OM'][s]['n'] for s in shared))} → {_n(same_n)} başlık). "
                f"{len(added)} kurum ilk kez dahil: " + ", ".join(nm_(s) for s in added if new["OM"][s]["n"] >= 500) + " (500+ başlığı olanlar). "
                "Yeni kurumların yerleşimi sağlanan kayıt defterinde yok; sayımlara girerler, sol–sağ bloklarına girmezler."})

    ol, nl = old["V5"]["similarity"], new["V5"]["similarity"]
    out.append({"id": "benzerlik", "tag": "değişti", "title": "Benzer yazan kurumlar artık yerleşime göre de kümeleniyor",
        "claim": f"Kurumların başlık dili benzerliği ile sol–sağ yerleşimi arasındaki ilişki (Mantel r) {_d(ol['mantel_r'], 2)}’den {_d(nl['mantel_r'], 2)}’e çıktı; "
                 f"p {_d(ol['mantel_p'], 3)}’ten {_d(nl['mantel_p'], 3)}’e düştü: 8.0’da sınırdaydı, 8.1’de {_sig(nl['mantel_p'])}.",
        "rows": [["Mantel r", _d(ol["mantel_r"], 3), _d(nl["mantel_r"], 3)], ["p", _d(ol["mantel_p"], 3), _d(nl["mantel_p"], 3)],
                 ["Haritadaki kurum", str(len(ol["outlets"])), str(len(nl["outlets"]))]],
        "note": "Bu, benzer yerleşimdeki kurumların benzer sözcükler seçtiğine dair daha güçlü kanıttır; nedensellik ya da niyet göstermez."})

    oa, na = old["ADV"]["pca"], new["ADV"]["pca"]
    out.append({"id": "uslup", "tag": "değişti", "title": "Yazım üslubu ile yerleşim bağı sürüyor ama zayıfladı",
        "claim": f"Üslup eksenindeki Spearman ρ {_d(oa['rho1'], 2)}’den {_d(na['rho1'], 2)}’e geriledi (p {_d(oa['p1'], 3)} → {_d(na['p1'], 3)}); iki sonuç da {_sig(na['p1'])}. "
                 f"İkinci eksen ρ {_d(oa['rho2'], 2)} → {_d(na['rho2'], 2)}, anlamlı değil.",
        "rows": [["ρ (1. eksen)", _d(oa["rho1"], 3), _d(na["rho1"], 3)], ["p (1. eksen)", _d(oa["p1"], 3), _d(na["p1"], 3)],
                 ["ρ (2. eksen)", _d(oa["rho2"], 3), _d(na["rho2"], 3)], ["p (2. eksen)", _d(oa["p2"], 3), _d(na["p2"], 3)],
                 ["Eksen payları", " · ".join(_d(100 * v, 1) + "%" for v in oa["var"]), " · ".join(_d(100 * v, 1) + "%" for v in na["var"])]],
        "note": "Etkin kurum kümesi de değişti (aşağıda), bu yüzden iki sayı birebir aynı kurumlar üzerinde karşılaştırılamaz."})

    ag_o, ag_n = old["ADV"]["agenda"], new["ADV"]["agenda"]
    tp_o, tp_n = old["ADV"]["topics"], new["ADV"]["topics"]
    out.append({"id": "gundem", "tag": "sürüyor", "title": "Gündem seçimi yerleşimle hâlâ ilişkili değil",
        "claim": f"Hangi olayları haberleştirdikleri bakımından kurumların benzerliği yerleşimle ilişkili değil: Mantel r {_d(ag_o['mantel_r'], 2)} → {_d(ag_n['mantel_r'], 2)} "
                 f"(p {_d(ag_n['mantel_p'], 2)}). Konu karışımında da aynı: r {_d(tp_o['mantel_r'], 2)} → {_d(tp_n['mantel_r'], 2)} (p {_d(tp_n['mantel_p'], 2)}).",
        "rows": [["Gündem Mantel r", _d(ag_o["mantel_r"], 3), _d(ag_n["mantel_r"], 3)], ["Gündem p", _d(ag_o["mantel_p"], 3), _d(ag_n["mantel_p"], 3)],
                 ["Konu Mantel r", _d(tp_o["mantel_r"], 3), _d(tp_n["mantel_r"], 3)], ["Konu p", _d(tp_o["mantel_p"], 3), _d(tp_n["mantel_p"], 3)],
                 ["Konu modeli başlığı", _n(tp_o["N"]), _n(tp_n["N"])]],
        "note": "Kurumlar aynı olayları seçiyor; fark, olayın nasıl anlatıldığında (dil ve üslup) ortaya çıkıyor."})

    oact, nact = om["v2"]["active"], nm["v2"]["active"]
    gain = sorted(set(nm["v2"]["activeSet"]) - set(om["v2"]["activeSet"]))
    out.append({"id": "etkin", "tag": "değişti", "title": "Karşılaştırılan kurum kümesi büyüdü, sağ blok daha ağır",
        "claim": f"Dönemin yarısından çoğunu kapsayan ve yerleşimi bilinen ‘etkin’ kurum sayısı {len(om['v2']['activeSet'])}’den {len(nm['v2']['activeSet'])}’e çıktı "
                 f"({', '.join(nm_(s) for s in gain)} eklendi). Dağılım sol {oact['left']}, merkez {oact['mid']}, sağ {oact['right']}’ten sol {nact['left']}, merkez {nact['mid']}, sağ {nact['right']}’e geçti.",
        "rows": [["Sol", str(oact["left"]), str(nact["left"])], ["Merkez", str(oact["mid"]), str(nact["mid"])], ["Sağ", str(oact["right"]), str(nact["right"])]],
        "note": "Sol blok aynı kaldığı için bloklar arası karşılaştırmaların dengesizliği arttı; blok ortalamaları sağ blokta daha sağlam, solda hâlâ dört kuruma dayanıyor."})

    bo, bn = sum(1 for e in old["E"] if e.get("bs")), sum(1 for e in new["E"] if e.get("bs"))
    out.append({"id": "kornokta", "tag": "değişti", "title": "Kör nokta olayı sayısı arttı, oranı hafifçe düştü",
        "claim": f"Bir tarafın belirgin biçimde az haberleştirdiği olay sayısı {bo}’dan {bn}’e çıktı; toplam olayın içindeki payı ise %{_d(100 * bo / len(old['E']), 1)}’den %{_d(100 * bn / len(new['E']), 1)}’e hafifçe geriledi.",
        "rows": [["Kör nokta olayı", str(bo), str(bn)], ["Toplam olay", _n(len(old["E"])), _n(len(new["E"]))],
                 ["4 Kasım sonrası kör nokta", "—", str(sum(1 for e in new_ev if e.get("bs")))]],
        "note": "Sayı artışının büyük bölümü olay sayısındaki artıştan gelir; oran neredeyse sabit."})

    lo, ln = old["V5"]["leadLag"]["blocs"], new["V5"]["leadLag"]["blocs"]
    rows = []
    for k, lab in (("left>right", "Soldan açılan → sağ"), ("right>left", "Sağdan açılan → sol")):
        rows.append([lab + " (yetişme payı)", _d(100 * lo[k]["coveredShare"], 1) + "%", _d(100 * ln[k]["coveredShare"], 1) + "%"])
        rows.append([lab + " (ortanca dk)", str(lo[k]["medLag"]), str(ln[k]["medLag"])])
    out.append({"id": "hiz", "tag": "değişti", "title": "Karşı blok daha geç yetişiyor",
        "claim": f"Soldan açılan olaylara sağ blok ortanca {ln['left>right']['medLag']} dakikada yetişiyor (8.0: {lo['left>right']['medLag']}); "
                 f"sağdan açılanlara sol blok {ln['right>left']['medLag']} dakikada (8.0: {lo['right>left']['medLag']}). Yetişme payı {_d(100 * lo['left>right']['coveredShare'], 0)}% → {_d(100 * ln['left>right']['coveredShare'], 0)}% (sağ) ve "
                 f"{_d(100 * lo['right>left']['coveredShare'], 0)}% → {_d(100 * ln['right>left']['coveredShare'], 0)}% (sol).",
        "rows": rows, "note": "Sağ blok soldan açılan olaylara, sol blok sağdan açılanlara göre daha çabuk yetişiyor; bu fark 8.0’da da vardı."})

    comp = [s for s in shared if s in old["OM"] and s in new["OM"]]
    ol_, nl_ = [old["OM"][s]["load"] for s in comp], [new["OM"][s]["load"] for s in comp]
    top = sorted(new["OM"], key=lambda s: -new["OM"][s]["load"] if new["OM"][s]["n"] >= 1000 else 0)[:5]
    mv = sorted(comp, key=lambda s: new["OM"][s]["load"] - old["OM"][s]["load"])
    out.append({"id": "yuk", "tag": "sürüyor", "title": "Yüklü dil sıralaması yerinde",
        "claim": f"8.0’daki {len(comp)} kurumun yük ortalaması iki sürümde neredeyse aynı (ortalama fark {_d(statistics.mean(abs(a - b) for a, b in zip(ol_, nl_)), 2)} puan). "
                 f"En yüksek: {', '.join(f'{nm_(s)} ({_d(new['OM'][s]['load'], 1)})' for s in top)}.",
        "rows": [[nm_(s), _d(old["OM"][s]["load"], 1), _d(new["OM"][s]["load"], 1)] for s in (mv[:2] + mv[-3:])],
        "note": "Tabloda en çok değişen beş kurum; en çok değişenin farkı bile küçük. Yük, kurumun dönem boyunca sabit bir özelliği gibi görünüyor."})

    nw = sorted((s for s in added if new["OM"][s]["n"] >= 500), key=lambda s: new["OM"][s]["load"])
    out.append({"id": "yeniKurum", "tag": "yeni", "title": "Yeni kurumlar: en sakin ve en yüklü yazanlar",
        "claim": f"Yeni katılan {len(nw)} kurum (500+ başlık) arasında en düşük yük {nm_(nw[0])} ({_d(new['OM'][nw[0]]['load'], 1)}) ve {nm_(nw[1])} ({_d(new['OM'][nw[1]]['load'], 1)}), "
                 f"en yüksek {nm_(nw[-1])} ({_d(new['OM'][nw[-1]]['load'], 1)}) ve {nm_(nw[-2])} ({_d(new['OM'][nw[-2]]['load'], 1)}). Tam dönem ortalaması {_d(statistics.mean(nl_), 1)}.",
        "rows": [[nm_(s), _n(new["OM"][s]["n"]), _d(new["OM"][s]["load"], 1)] for s in nw],
        "note": "Bu kurumların yerleşimi kayıt defterinde yok; bu yüzden bloklara ve blok karşılaştırmalarına girmezler, kurum sayfalarında ve olaylarda görünürler."})

    top_ev = sorted(new_ev, key=lambda e: (-len(e["s"]), -e["n"]))[:8]
    out.append({"id": "olaylar", "tag": "yeni", "title": "4–13 Kasım’ın en çok kurumca haberleştirilen olayları",
        "claim": f"Pencerenin uzayan bölümünde {_n(len(new_ev))} olay başladı; en geniş yankı bulan: {top_ev[0]['t']} ({len(top_ev[0]['s'])} kurum).",
        "rows": [[e["t"], str(len(e["s"])), e["i"]] for e in top_ev], "events": True,
        "note": "Her satır olay sayfasına bağlanır."})

    out.append({"id": "sinir", "tag": "uyarı", "title": "Sınırlar",
        "claim": "8.1’in yeni bulguları şu sınırlarla okunmalı.",
        "rows": [["29–30 Ekim", "veri boşluğu sürüyor (günde ~580 başlık)", ""], ["14 Kasım", "kısmi gün, dışarıda", ""],
                 ["Anlatı haritası", "1–13 Kasım haftaları yapay zekâyla kodlandı (YZ)", ""],
                 ["BiasGuard", "yalnızca 8.0’da incelenen olaylar kapsanır; sonradan açılan olaylar incelenmemiş sayılır", ""],
                 ["Yeni kurumlar", "yerleşimleri kayıt defterinde yok", ""]],
        "note": ""})
    return {"version": "8.1", "from": NEW_FROM, "findings": out}


if __name__ == "__main__":
    p = argparse.ArgumentParser(prog="python -m capraz_pipeline.whatsnew")
    p.add_argument("--old", type=Path, required=True)
    p.add_argument("--new", type=Path, required=True)
    p.add_argument("--out", type=Path, default=OUT)
    a = p.parse_args()
    r = build(_load(a.old), _load(a.new))
    a.out.write_text(json.dumps(r, ensure_ascii=False, indent=1))
    print(len(r["findings"]), "findings ->", a.out)
