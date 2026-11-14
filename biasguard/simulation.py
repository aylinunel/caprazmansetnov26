"""Offline Mesa laboratory, NEVER a text detector or public analysis source.

    pip install -r tools/mesa/requirements.txt
    python -m biasguard.simulation list
    python -m biasguard.simulation validate --output /tmp/mesa-contracts.json
    python -m biasguard.simulation run base_rate_fallacy --output /tmp/mesa-demo
    python -m biasguard.simulation crosswalk --output /tmp/mesa-crosswalk.json

The crosswalk is a mechanically generated proposal, not an approved semantic mapping.
"""
from __future__ import annotations

import argparse
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import sys

SOURCE = Path(__file__).resolve().parents[1] / "tools" / "mesa" / "expanded_mesa_biases.py"
# Source integrity is checked against the adjacent versioned provenance manifest.


def load_simulator():
    manifest = json.loads((SOURCE.parent / "source-manifest.json").read_text(encoding="utf-8"))
    actual = sha256(SOURCE.read_bytes()).hexdigest()
    if actual != manifest["sha256"]:
        raise ValueError("Bundled simulator source does not match its recorded SHA-256")
    spec = importlib.util.spec_from_file_location("_capraz_mesa_simulator", SOURCE)
    if spec is None or spec.loader is None:
        raise ValueError("Cannot load bundled simulator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except ModuleNotFoundError as exc:
        raise ValueError("Install optional offline dependencies with pip install -r tools/mesa/requirements.txt") from exc
    return module


def proposed_crosswalk(simulator) -> dict:
    from .catalog import load_cards
    detector_ids = {c["id"] for c in load_cards()}
    entries = []
    for entry in simulator.manifest():
        candidate = entry["id"].replace("_", "-")
        plugin = simulator.load_plugin(entry["id"])
        entries.append({"simulation_id": entry["id"], "source_name": entry["name"],
                        "source_layer": entry["layer"], "simulation_kind": plugin.METADATA["kind"],
                        "candidate_detector_id": candidate if candidate in detector_ids else None,
                        "approved_detector_id": None, "mapping_status": "needs_domain_review",
                        "candidate_method": "identifier spelling only, not semantic equivalence",
                        "automatically_activated": False, "empirically_validated": False})
    return {"algorithm": "mesa-crosswalk-proposal-v1", "synthetic_only": True,
            "detector_catalog_size": len(detector_ids), "simulation_entries": len(entries),
            "approved_mappings": 0, "entries": entries,
            "note": "Review definitions, necessary conditions, evidence access and policy before approving any mapping. These entries do not expand production detection coverage."}


def main(argv=None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    try:
        simulator = load_simulator()
        if args and args[0] == "crosswalk":
            parser = argparse.ArgumentParser(description="Unapproved simulation/detector crosswalk proposal")
            parser.add_argument("command", choices=["crosswalk"])
            parser.add_argument("--output", type=Path, required=True)
            parsed = parser.parse_args(args)
            result = proposed_crosswalk(simulator)
            parsed.output.parent.mkdir(parents=True, exist_ok=True)
            parsed.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"{result['simulation_entries']} proposals; 0 approved detector mappings. {parsed.output}")
            return 0
        return simulator.main(args)
    except (ValueError, OSError) as exc:
        print(f"Offline simulation error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
