"""Çapraz Manşet 7.0: BiasGuard review of news events.

One event = one review. ``text`` holds one line per outlet (its first headline in the event and
its lede); ``context`` holds the event's date, outlet placements and which active outlets did not
cover it. Reviewer outputs come from files (written by Claude Code reviewer agents, or by any
other reviewer that follows ``prompts()``); the engine's own quote, condition and evidence-type
gates decide every verdict.

    python -m biasguard.news inputs  --build dist/capraz-8/build --run runs/2026-11-04 --top 150
    python -m biasguard.news tasks   --run runs/2026-11-04 --stage select|review --batch 10
    python -m biasguard.news apply   --run runs/2026-11-04 --out dist/capraz-8/build/biasguard.json

A missing or invalid reviewer file never counts as a negative: the event is
``analysis_incomplete`` (some output present) or ``not_attempted`` (none).
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
from pathlib import Path
from typing import Any

from .engine import BiasGuard
from .providers import ProviderCallError, _selector_system_prompt, _system_prompt, _selector_schema
from .schemas import build_reviewer_schema

MAX_CANDIDATES = 6  # one reviewer batch per role; the 2026-10-28 run lost a case to finish_reason=length
LEDE_CHARS = 280
BREAKER = 5  # consecutive failed batches before the dispatcher stops (see AGENT_REVIEW.md)


def _load(path: Path) -> Any:
    return json.loads(gzip.decompress(path.read_bytes()))


def _pack_columns(pack: dict, required: tuple[str, ...], optional: tuple[str, ...] = ()) -> int:
    """Reject misaligned columns instead of silently dropping source provenance."""
    ids = pack.get("i")
    if not isinstance(ids, list):
        raise ValueError("pack i must be an array")
    for key in required + tuple(k for k in optional if k in pack):
        if not isinstance(pack.get(key), list) or len(pack[key]) != len(ids):
            raise ValueError(f"pack {key} must be an array aligned with i")
    return len(ids)


def _article_url(pack: dict, index: int) -> str | None:
    """Decode the pack's URL, never substitute a guessed outlet/article URL.

    Monthly packs retain host + path, not the original scheme; their public
    decoder uses HTTPS. Uncompressed absolute URL fields are retained verbatim.
    """
    paths = pack.get("u")
    if paths is None or paths[index] is None:
        return None
    path = paths[index]
    if not isinstance(path, str):
        raise ValueError("pack URL must be a string or null")
    if path.startswith(("https://", "http://")):
        return path
    hosts, indices = pack.get("hosts"), pack.get("h")
    if hosts is None or indices is None:
        return None
    host_index = indices[index]
    if (not isinstance(hosts, list) or isinstance(host_index, bool)
            or not isinstance(host_index, int) or not 0 <= host_index < len(hosts)):
        raise ValueError("pack URL host index is invalid")
    host = hosts[host_index]
    if not isinstance(host, str) or not host:
        return None
    return f"https://{host}/{path}"


def event_inputs(build: Path, top: int) -> list[dict[str, Any]]:
    if isinstance(top, bool) or not isinstance(top, int) or top < 1:
        raise ValueError("top must be a positive integer")
    core = _load(build / "core.bin")
    packs = core["meta"]["packs"]
    arts: dict[str, dict] = {}
    for m in packs["months"]:
        a = _load(build / f"a-{m}.bin")
        _pack_columns(a, ("s", "t", "d"), ("u", "h"))
        for k, i in enumerate(a["i"]):
            source_index = a["s"][k]
            if (isinstance(source_index, bool) or not isinstance(source_index, int)
                    or not 0 <= source_index < len(packs["sources"])):
                raise ValueError("pack source index is invalid")
            if not all(isinstance(v, str) for v in (i, a["t"][k], a["d"][k])):
                raise ValueError("pack article id, title and timestamp must be strings")
            arts[i] = {"i": i, "s": packs["sources"][source_index], "t": a["t"][k], "d": a["d"][k],
                       "url": _article_url(a, k)}
        lp = build / f"l-{m}.bin"
        if lp.exists():
            l = _load(lp)
            _pack_columns(l, ("l",))
            for i, lede in zip(l["i"], l["l"]):
                if not isinstance(i, str) or (lede is not None and not isinstance(lede, str)):
                    raise ValueError("pack lede id must be a string and lede must be a string or null")
                if i in arts:
                    arts[i]["l"] = lede
    lean = {s["s"]: s.get("lean") for s in core.get("S", [])}
    active = set(core["meta"]["v2"]["activeSet"])
    events = sorted(core["E"], key=lambda e: (-len(e["s"]), -e["n"], e["i"]))[:top]
    out = []
    for e in events:
        first: dict[str, dict] = {}
        for i in e["a"]:
            a = arts.get(i)
            if a and (a["s"] not in first or a["d"] < first[a["s"]]["d"]):
                first[a["s"]] = a
        lines = []
        segments = []
        offset = 0
        for s, a in sorted(first.items(), key=lambda x: x[1]["d"]):
            original_lede = a.get("l") or ""
            lede = original_lede.strip().replace("\n", " ")
            truncated = len(lede) > LEDE_CHARS
            if truncated:
                lede = lede[:LEDE_CHARS].rsplit(" ", 1)[0] + " …"
            prefix = f"[{s} · {a['d'][11:16]}] "
            line = prefix + a["t"] + (f" — {lede}" if lede else "")
            headline_start = offset + len(prefix)
            headline_end = headline_start + len(a["t"])
            segments.append({
                "start": offset, "end": offset + len(line),
                "headline_start": headline_start, "headline_end": headline_end,
                "lede_start": headline_end + len(" — ") if lede else None,
                "lede_end": offset + len(line) if lede else None,
                "lede_truncated": truncated, "original_lede_length": len(original_lede),
                "article_id": a["i"], "url": a["url"], "outlet": s, "timestamp": a["d"],
            })
            lines.append(line)
            offset += len(line) + 1  # Python character offsets, including the inter-outlet newline
        def place(s: str) -> str:
            v = lean.get(s)
            return "yerleşim yok" if v is None else ("sol" if v < 45 else "sağ" if v > 55 else "orta") + f" ({v})"
        missing = sorted(active - set(first))
        context = (f"Olay: {e['t']}\nİlk başlık: {e['f']} · son başlık: {e['l']} (Türkiye saati)\n"
                   f"Kurumlar ve verilen yerleşimler: " + "; ".join(f"{s}: {place(s)}" for s in sorted(first)) + "\n"
                   f"Olayı vermeyen etkin kurumlar: " + (", ".join(missing) if missing else "yok") + "\n"
                   "Sınırlama: Yerleşimler kaynak kaydından verilmiştir, bağımsız olarak doğrulanmamıştır; "
                   "davranış kanıtı değildir. Toplayıcı kaydındaki boşluklar kurumun olayı yayımlamadığının "
                   "kanıtı değildir; yalnızca toplanan örneklemi gösterir.")
        out.append({"event": e["i"], "title": e["t"], "outlets": len(first), "text": "\n".join(lines),
                    "context": context, "input_scope": "headline_and_partial_lede", "segments": segments})
    return out


class FileReviewer:
    """Replays reviewer outputs for one event; anything missing raises, so the engine fails closed."""

    def __init__(self, run: Path, event: str) -> None:
        self.run, self.event = run, event
        self.last_call: dict[str, Any] | None = None

    def _read(self, rel: str) -> dict[str, Any]:
        p = self.run / rel / f"{self.event}.json"
        if not p.exists():
            self.last_call = {"role": rel, "status": "failed", "failure": "reviewer output file missing"}
            raise ProviderCallError(f"no reviewer output: {rel}/{self.event}.json")
        try:
            data = json.loads(p.read_text())
        except json.JSONDecodeError as exc:
            self.last_call = {"role": rel, "status": "failed", "failure": "reviewer output is not JSON"}
            raise ProviderCallError(f"reviewer output is not JSON: {rel}/{self.event}.json") from exc
        self.last_call = {"role": rel, "status": "completed", "content_length": p.stat().st_size}
        return data

    def select(self, text, context, cards, max_candidates):
        return self._read("selections")

    def review(self, text, context, cards, role):
        return self._read(f"reviews/{role}")

    def provider_info(self) -> dict[str, Any]:
        return {"provider": "claude_code_reviewer_agents", "catalog_validated": False,
                "note": "Selector, advocate and skeptic were separate agents that did not see one another's output."}


def _inputs(run: Path) -> list[dict[str, Any]]:
    return [json.loads(l) for l in (run / "inputs.jsonl").read_text().splitlines() if l.strip()]


def selected_cards(bg: BiasGuard, run: Path, item: dict) -> list[str] | None:
    """The card set the engine will send to both reviewers (selector ids + lexical floor)."""
    p = run / "selections" / f"{item['event']}.json"
    if not p.exists():
        return None
    try:
        sel = bg._validate_selection(json.loads(p.read_text()), MAX_CANDIDATES)
    except Exception:
        return None
    from .catalog import rank_candidates
    seeds = [c["id"] for c in rank_candidates(bg.cards, item["text"], item["context"], limit=MAX_CANDIDATES)[:min(6, MAX_CANDIDATES)]]
    ids: list[str] = []
    for cid in [*sel["candidate_ids"], *seeds]:
        if cid not in ids and len(ids) < MAX_CANDIDATES:
            ids.append(cid)
    return ids or [c["id"] for c in bg.cards[:MAX_CANDIDATES]]


def prompts(stage: str, role: str | None = None) -> str:
    if stage == "select":
        return _selector_system_prompt()
    return _system_prompt(role) + (
        "\n\nNEWS INPUT\ntext has one line per outlet: [outlet · HH:MM] headline — lede. context has the event, "
        "outlet placements and active outlets that did not cover it. A behavioral quote is a comparative observation "
        "of what an outlet actually published (e.g. its headline set against the others); quote it exactly from text. "
        "Write mechanism, alternative_explanation and missing_context in Turkish.")


def write_tasks(run: Path, stage: str, batch: int) -> list[Path]:
    bg = BiasGuard()
    items = _inputs(run)
    tdir = run / "tasks" / stage
    tdir.mkdir(parents=True, exist_ok=True)
    card_by_id = {c["id"]: c for c in bg.cards}
    todo = []
    for it in items:
        if stage == "select":
            if not (run / "selections" / f"{it['event']}.json").exists():
                todo.append({"event": it["event"], "text": it["text"], "context": it["context"]})
        else:
            ids = selected_cards(bg, run, it)
            if ids is None:
                continue
            todo.append({"event": it["event"], "text": it["text"], "context": it["context"], "card_ids": ids})
    paths = []
    for n in range(0, len(todo), batch):
        chunk = todo[n:n + batch]
        if stage == "select":
            compact = [{"id": c["id"], "name": c["name"], "definition": c["definition"],
                        "necessary_conditions": c["necessary_conditions"]} for c in bg.cards]
            task = {"stage": stage, "system_prompt": prompts("select"),
                    "output_schema": _selector_schema([c["id"] for c in bg.cards], MAX_CANDIDATES),
                    "cards": compact, "events": chunk}
        else:
            used = sorted({cid for x in chunk for cid in x["card_ids"]})
            task = {"stage": stage, "system_prompts": {r: prompts("review", r) for r in ("advocate", "skeptic")},
                    "output_schema_note": "per event: build_reviewer_schema(card_ids, role); see schema_example",
                    "schema_example": build_reviewer_schema(chunk[0]["card_ids"], "advocate"),
                    "cards": [card_by_id[c] for c in used], "events": chunk}
        p = tdir / f"batch-{n // batch:03d}.json"
        p.write_text(json.dumps(task, ensure_ascii=False, indent=1))
        paths.append(p)
    return paths


def _outlet_counts(done: list[dict]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for x in done:
        for f in x["supported"] + x["uncertain"]:
            for o in {o for e in f["evidence"] for o in e.get("o", [])}:
                out.setdefault(o, {}).setdefault(f["id"], 0)
                out[o][f["id"]] += 1
    return out


_COVERAGE_FIELDS = ("catalog_card_count", "selected_card_count", "assessed_card_count",
                    "unassessed_card_count", "retrieval_limited", "completion_limited")
_GUARDED_METADATA = {"algorithm": "news-validity-v1", "publication_status": "draft",
                     "verification_status": "needs_review", "review_required": True}


def _attribution_outlets(value: Any) -> set[str]:
    """Collect source outlets from attributed occurrences, including cross-line spans."""
    found: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "outlet" and isinstance(child, str):
                found.add(child)
            elif key in {"outlets", "o"} and isinstance(child, list):
                found.update(o for o in child if isinstance(o, str))
            else:
                found.update(_attribution_outlets(child))
    elif isinstance(value, list):
        for child in value:
            found.update(_attribution_outlets(child))
    return found


def apply(run: Path, guarded: bool = False) -> dict[str, Any]:
    """Replay local reviewer files; guarded artifacts are review-only, never public packs."""
    if guarded:
        from .validity import evidence_attribution, guard_news_result
    bg = BiasGuard()
    results = []
    tripped = (run / "BREAKER_TRIPPED").exists()  # written by the dispatcher when it stopped early
    for it in _inputs(run):
        ev = it["event"]
        present = any((run / d / f"{ev}.json").exists() for d in ("selections", "reviews/advocate", "reviews/skeptic"))
        if not present:
            if not guarded:
                results.append({"event": ev, "title": it["title"], "outlets": it["outlets"], "status": "not_attempted"})
                continue
            r = bg._base_output(it["text"], it["context"], "medium", [], MAX_CANDIDATES)
            r.update({"status": "not_attempted", "completion_limited": True, "reviewer_outcomes": [],
                      "adjudication": [], "rejected_evidence": []})
        else:
            r = BiasGuard(reviewer=FileReviewer(run, ev)).analyze(it["text"], it["context"], stakes="medium", mode="ai",
                                                                 max_candidates=MAX_CANDIDATES)
        if guarded:
            r = guard_news_result(r, it, bg.cards)
        lines = [(l[1:l.index(" ·")], l) for l in it["text"].splitlines() if l.startswith("[") and " ·" in l]
        who = lambda q: sorted({o for o, l in lines if q in l})  # outlets whose headline line holds the quote

        def slim_evidence(evidence: dict) -> dict:
            exported = {"q": evidence["quote"], "src": evidence["source"], "kind": evidence.get("kind"),
                        "o": who(evidence["quote"]) if evidence["source"] == "text" else []}
            if guarded:
                occurrences = evidence_attribution(it, evidence)
                exported["occurrences"] = occurrences
                exported["o"] = sorted(_attribution_outlets(occurrences)) if evidence["source"] == "text" else []
            return exported

        def slim(finding: dict) -> dict:
            exported = {"id": finding["id"], "name": finding["name"], "status": finding["status"],
                        "definition": finding["definition"], "source_url": finding["source_url"],
                        "evidence": [slim_evidence(x) for x in finding["evidence"]],
                        "mechanisms": finding["mechanisms"], "alternatives": finding["alternative_explanations"],
                        "missing": finding["missing_context"]}
            if guarded:
                for key in ("entry_type", "review_policy", "not_necessarily_an_error", "eligibility", "validity_gate",
                            "validity", "original_status", "validity_reasons"):
                    if key in finding:
                        exported[key] = finding[key]
            return exported

        exported = {
            "event": ev, "title": it["title"], "outlets": it["outlets"], "status": r["status"],
            "error": r.get("error"), "selected": r.get("candidate_ids"),
            "supported": [slim(f) for f in r["supported_findings"]],
            "uncertain": [slim(f) for f in r["uncertain_findings"]],
            "effects": [slim(f) for f in r["contextual_effects"]],
            "downgraded": sum(1 for o in r.get("reviewer_outcomes", []) for a in o["assessments"]
                              if a["original_verdict"] == "supported" and a["verdict"] != "supported"),
            "rejectedQuotes": len(r.get("rejected_evidence", [])),
            "quotesVerified": sum(len(a["verified_evidence"]) for o in r.get("reviewer_outcomes", []) for a in o["assessments"]),
        }
        if guarded:
            exported.update({key: r[key] for key in _COVERAGE_FIELDS})
            exported["coverage"] = {**r.get("coverage", {}), **{key: r[key] for key in _COVERAGE_FIELDS}}
            exported["audit"] = r.get("audit", {})
            exported["input_scope"] = r["validity_gate"]["input_scope"]
            exported["adjudication"] = r.get("adjudication", [])
            exported["segments"] = it.get("segments", [])
            for key in ("validity_gate", "card_eligibility", "eligibility"):
                if key in r:
                    exported[key] = r[key]
        results.append(exported)
    done = [x for x in results if x["status"] == "review_complete"]
    count = lambda k: sum(len(x[k]) for x in done)
    by_card: dict[str, dict] = {}
    for x in done:
        for k in ("supported", "uncertain"):
            for f in x[k]:
                by_card.setdefault(f["id"], {"id": f["id"], "name": f["name"], "supported": 0, "uncertain": 0})[k] += 1
    summary = {
        "planned": len(results), "completed": len(done),
        "incomplete": sum(1 for x in results if x["status"] == "analysis_incomplete"),
        "notAttempted": sum(1 for x in results if x["status"] == "not_attempted"),
        "breakerTripped": tripped, "supported": count("supported"), "uncertain": count("uncertain"),
        "effects": count("effects"), "eventsWithSupported": sum(1 for x in done if x["supported"]),
        "downgraded": sum(x.get("downgraded", 0) for x in done), "quotesVerified": sum(x.get("quotesVerified", 0) for x in done),
        "rejectedQuotes": sum(x.get("rejectedQuotes", 0) for x in done),
        "cards": sorted(by_card.values(), key=lambda c: (-c["supported"], -c["uncertain"], c["id"])),
        "catalog": len(bg.cards), "maxCandidates": MAX_CANDIDATES,
        # outlet -> card id -> events where that outlet's headline was quoted as evidence (AI output, not a verdict)
        "outlets": _outlet_counts(done),
    }
    payload = {"summary": summary, "events": results}
    if guarded:
        # Totals are event-card review opportunities, not all-catalog negative verdicts.
        summary["coverage"] = {
            "catalog_card_count": len(bg.cards),
            **{key: sum(x[key] for x in results) for key in
               ("selected_card_count", "assessed_card_count", "unassessed_card_count")},
            "retrieval_limited": any(x["retrieval_limited"] for x in results),
            "completion_limited": any(x["completion_limited"] for x in results),
        }
        payload["metadata"] = dict(_GUARDED_METADATA)
    return payload


BANNED = ("bağlam gerekli", "desteklendi", "uncertain")
_QUOTE = re.compile(r"[“\"]([^”\"]+)[”\"]")


def validate_explain(x: dict, event_text: str | None = None) -> list[str]:
    """Problems with a public explanation ({"noticed","why"}); empty list = publishable."""
    probs: list[str] = []
    for k in ("noticed", "why"):
        v = x.get(k) if isinstance(x, dict) else None
        if not isinstance(v, str):
            probs.append(f"{k}: missing")
            continue
        v = v.strip()
        if not 40 <= len(v) <= 320:
            probs.append(f"{k}: length {len(v)} not in 40-320")
        bare = re.sub(r"\d[.,]\d", "0", _QUOTE.sub("Q", v))  # quoted spans and decimals don't end sentences
        if not 1 <= len(re.findall(r"[^.!?…]+[.!?…]+(?=\s|$)|[^.!?…]+$", bare)) <= 2:
            probs.append(f"{k}: must be 1-2 sentences")
        low = v.lower()
        probs += [f"{k}: banned phrase '{b}'" for b in BANNED if b in low]
        if event_text is not None:
            probs += [f"{k}: quote not in event text: {q[:40]}" for q in _QUOTE.findall(v)
                      if len(q) > 8 and q not in event_text]
    return probs


def explain_dir(run: Path) -> Path:
    return run / "explain"


def explain_tasks(run: Path, batch: int) -> list[Path]:
    """Writer batches for live findings (supported + uncertain) that have no valid explanation yet."""
    res = json.loads((run / "biasguard.json").read_text())
    texts = {it["event"]: it["text"] for it in _inputs(run)}
    tdir = explain_dir(run) / "tasks"
    tdir.mkdir(parents=True, exist_ok=True)
    for old in tdir.glob("batch-*.json"):
        old.unlink()
    todo = []
    for ev in res["events"]:
        for f in ev.get("supported", []) + ev.get("uncertain", []):
            key = f"{ev['event']}__{f['id']}"
            p = explain_dir(run) / f"{key}.json"
            if p.exists():
                try:
                    if not validate_explain(json.loads(p.read_text()), texts.get(ev["event"], "")):
                        continue
                except Exception:
                    pass
            role = lambda ms, r: " ".join(m["text"] for m in ms if m.get("role") == r) or " ".join(m["text"] for m in ms)
            todo.append({
                "key": key, "output_file": f"runs/bg/explain/{key}.json", "event_title": ev.get("title"),
                "concept": f["name"], "definition": f["definition"],
                "quotes": [{"quote": e["q"], "outlets": e.get("o", []), "source": e["src"]} for e in f["evidence"]],
                "advocate_mechanism": role(f["mechanisms"], "advocate"),
                "skeptic_alternative": role(f["alternatives"], "skeptic"),
                "missing_context": f["missing"],
                "headlines": texts.get(ev["event"], "")})
    instr = ("Write plain Turkish for a general reader. For each item write {\"noticed\": ..., \"why\": ...} to its "
             "output_file. noticed = what the headlines show, naming the outlets. why = why that is not proof. "
             "Each field is 1-2 sentences, 40-320 characters. Use only quotes given in the item (inside “…”), "
             "exactly as given. Never use the words 'bağlam gerekli', 'desteklendi', 'uncertain'.")
    paths = []
    for n in range(0, len(todo), batch):
        p = tdir / f"batch-{n // batch:03d}.json"
        p.write_text(json.dumps({"instructions": instr, "items": todo[n:n + batch]}, ensure_ascii=False, indent=1))
        paths.append(p)
    return paths


def merge_explain(bg: dict, run: Path) -> dict[str, int]:
    """Attach valid runs/<run>/explain/<event>__<card>.json as finding['explain']; skip invalid or missing."""
    texts = {it["event"]: it["text"] for it in _inputs(run)} if (run / "inputs.jsonl").exists() else {}
    live = explained = 0
    for ev in bg.get("events", []):
        for f in ev.get("supported", []) + ev.get("uncertain", []):
            live += 1
            p = explain_dir(run) / f"{ev['event']}__{f['id']}.json"
            if not p.exists():
                continue
            try:
                x = json.loads(p.read_text())
                if validate_explain(x, texts.get(ev["event"], "")):
                    continue
            except Exception:
                continue
            f["explain"] = {"noticed": x["noticed"].strip(), "why": x["why"].strip()}
            explained += 1
    return {"explained": explained, "live": live}


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m biasguard.news")
    p.add_argument("cmd", choices=["inputs", "tasks", "apply", "pack", "explain-tasks", "explain-apply"])
    p.add_argument("--build", type=Path)
    p.add_argument("--run", type=Path, required=True)
    p.add_argument("--top", type=int, default=150)
    p.add_argument("--stage", choices=["select", "review"])
    p.add_argument("--batch", type=int, default=10)
    p.add_argument("--out", type=Path)
    p.add_argument("--guarded", action="store_true", help="apply the news validity gate; output remains a review-only draft")
    a = p.parse_args()
    if a.top < 1:
        p.error("--top must be a positive integer")
    a.run.mkdir(parents=True, exist_ok=True)
    if a.cmd == "inputs":
        items = event_inputs(a.build, a.top)
        (a.run / "inputs.jsonl").write_text("".join(json.dumps(x, ensure_ascii=False) + "\n" for x in items))
        print(json.dumps({"events": len(items), "maxChars": max((len(x["text"]) + len(x["context"]) for x in items), default=0)}))
    elif a.cmd == "tasks":
        for path in write_tasks(a.run, a.stage, a.batch):
            print(path)
    elif a.cmd == "explain-tasks":
        for path in explain_tasks(a.run, a.batch):
            print(path)
    elif a.cmd == "explain-apply":
        # merge into the run's biasguard.json (and --out, e.g. dist/.../biasguard.json); pack re-merges anyway
        res = json.loads((a.run / "biasguard.json").read_text())
        print(json.dumps(merge_explain(res, a.run)))
        for out in (a.run / "biasguard.json", a.out):
            if out:
                out.write_text(json.dumps(res, ensure_ascii=False))
    elif a.cmd == "pack":
        # Same keys build.py adds, without re-running the 20-minute pipeline.
        from .validity import ensure_publication_allowed
        data = json.loads((a.build / "biasguard.json").read_text())
        ensure_publication_allowed(data)  # Reject review-only artifacts before reading or writing core.bin.
        core_path = a.build / "core.bin"
        core = _load(core_path)
        core["BG"] = data
        print(json.dumps(merge_explain(core["BG"], a.run)))
        import sys; sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
        from capraz_pipeline.narratives import merge
        merge(core)
        core["BGS"] = json.loads((Path(__file__).resolve().parents[1] / "docs" / "biasguard-simulation" / "summary.json").read_text())
        core_path.write_bytes(gzip.compress(json.dumps(core, ensure_ascii=False, separators=(",", ":")).encode()))
        print(core_path)
    else:
        res = apply(a.run, guarded=a.guarded)
        (a.out or a.run / "biasguard.json").write_text(json.dumps(res, ensure_ascii=False))
        print(json.dumps({k: v for k, v in res["summary"].items() if k != "cards"}))


if __name__ == "__main__":
    main()
