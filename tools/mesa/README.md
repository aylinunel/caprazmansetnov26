# Offline behavioral laboratory

`expanded_mesa_biases.py` is the unchanged, self-contained export of the previously delivered 138-mechanism Mesa extension. `source-manifest.json` records its SHA-256, scope and provenance. The source contains one task-specific mechanism per missing entry from the supplied vocabulary, positive and boundary scenarios, matched strength-zero reference runs, synchronous propose/commit activation, and trace logging. Some entries are useful heuristics, learning effects, media patterns or interaction concepts rather than harmful cognitive errors.

This is not a production article classifier. A simulation parameter does not measure a publisher's bias or a reader's mental state. Passing executable contracts is not empirical validation, and heterogeneous task metrics must not be averaged into one bias score. The source manifest checksum is a reproducibility check, not an authentication or licensing guarantee.

From the repository root:

```bash
python -m pip install -r biasguard/requirements.txt -r tools/mesa/requirements.txt
python -m biasguard.simulation list
python -m biasguard.simulation describe base_rate_fallacy
python -m biasguard.simulation validate --output /tmp/mesa-contracts.json
python -m biasguard.simulation run base_rate_fallacy --agents 12 --replicates 3 --output /tmp/mesa-example
python -m biasguard.simulation sweep --agents 12 --replicates 3 --output /tmp/mesa-sweep
python -m biasguard.simulation crosswalk --output /tmp/mesa-crosswalk.json
```

The crosswalk only normalizes identifier spelling (`_` to `-`) and suggests an existing detector ID when an exact spelling match exists. Every row remains `needs_domain_review`, has `approved_detector_id: null`, and is never automatically activated. Its 138 educational entries are not 138 validated detector categories. The production detector retains its 116-card operational catalog.

If a domain reviewer later maps a mechanism into a detector test, retain the definition, necessary conditions, input assumptions, what the detector can actually observe, reference-label rationale, reviewer/date and mapping version. Render only observable evidence. Never place hidden simulated traits, target labels, task strength, private beliefs, correctness labels or calibration outcomes into detector prompts unless the test explicitly makes the corresponding external evidence available. Keep family/seed identities in the private evaluation layer.

Generated CSV/JSON/JSONL files are temporary research outputs. Do not copy them into public article packs or use them to change the supplied 0–100 political-position registry. Simulation source descriptions come from user-supplied materials; the project does not assert a redistribution license or third-party endorsement for those materials. Dependency licenses remain their own.
