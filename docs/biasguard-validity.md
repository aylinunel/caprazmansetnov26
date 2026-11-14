# Evidence-gated behavioral review for Çapraz Manşet

`news-validity-v1` extends this repository's existing BiasGuard event pipeline. It preserves the selector/advocate/skeptic design, adds documentary-evidence and source-attribution safeguards, and supplies an offline evaluation layer. The previously delivered 138-mechanism Mesa extension is included as an optional behavioral laboratory. It is not substituted for the production detector.

The implementation is opt-in through `python -m biasguard.news apply --guarded`. Existing commands, saved public data and the static site remain compatible. New guarded outputs are drafts for review. Both public export paths refuse them. This change does not create a hosted service, run the collector, generate new model judgments, deploy the site or alter the supplied political-position registry.

## What the algorithm can and cannot conclude

The repository reviews one event at a time: each participating outlet's first headline and a lede excerpt of up to 280 characters. That is evidence of published wording within the collected sample. It is not a full article, a record of the editor's reasoning, a reader-response experiment or a time series of decision outcomes.

A difference in wording can be an observable framing difference without establishing a cognitive error. A publisher not appearing in the collected event may reflect collection, event matching or timing limitations. A supplied left/right placement is not evidence of the psychological mechanism of an article. A model declaring an exact quote `kind: behavioral` does not make a one-off headline a measured behavioral history.

The new algorithm therefore keeps language observations and cognitive hypotheses separate. It requires additional documentary context before retaining a supported cognitive hypothesis. It still cannot prove intent, internal mental state, causality, truthfulness or partisan affiliation. Even retained hypotheses are pending editorial review. The guard can reduce unsupported assertions by construction; whether it improves real-world precision, recall or validity must be measured on independent references.

## The processing sequence

1. **Construct immutable event evidence.** `event_inputs()` reads the existing monthly packs and records actual article IDs, outlet IDs, timestamps, URLs, truncation and original-field character ranges. It adds an explicit caveat that registry placement is supplied/unverified and collector gaps are not behavioral evidence. It invents no capabilities.
2. **Choose review scope.** The existing semantic selector plus lexical retrieval selects at most six cards for each event. The catalog still has 116 operationalized concepts. Unselected cards are unassessed, not negative.
3. **Run separate reviews.** The existing advocate and skeptic outputs are schema-checked independently. They do not see one another's results. Separate calls, particularly from the same model, do not imply statistically independent errors.
4. **Apply native evidence gates.** The existing engine verifies exact quotes, minimum quote length, condition references and reviewer agreement. A missing/invalid file is incomplete or not attempted, never silently a negative.
5. **Apply the new observability gate.** `guard_news_result()` checks independently supplied documentary capability records. Both reviewers must cite the corresponding exact context quote through a satisfied necessary condition. A boolean flag, ideological position, collection gap or model-written capability is insufficient.
6. **Downgrade unsupported scope.** Missing capabilities, uncited records, invalid original-field quotations, unknown target IDs or incomplete reviews prevent retained support. Affected hypotheses become `needs_context` in the uncertain collection, preserving the original status, required capabilities and reasons. Learning/contextual effects are not promoted into harmful bias findings.
7. **Retain audit and coverage.** Exported results preserve explicit per-card adjudications, selected/assessed/unassessed counts, retrieval/completion limits, source hashes, capability hashes, policy and entry type. Exact evidence retains every original occurrence, including repeated phrases and quotes spanning multiple outlet records.
8. **Keep output review-only.** The new envelope is `publication_status: draft`, `verification_status: needs_review`, `review_required: true`. The guard's native root marker is also blocked at publication. Neither `news pack` nor `capraz_pipeline.build` may embed these artifacts in `core.bin`.

These are sequential eligibility gates, not a weighted score. There is no product of model confidences, invented posterior probability or composite cognitive-bias percentage. The site's independent linguistic 0–100 metric and its supplied political 0–100 scale are not calibration inputs. Political placement remains 0 extreme left, 50 center, 100 extreme right; missing placement is not replaced with an inferred center.

## Documentary evidence capabilities

Capabilities are supplied by the operator or legitimate editorial ingestion layer, outside the selector/reviewer response schema. They are documentary context observations, not hidden simulated states. They must be copied into `context` so both reviewers can actually examine and cite them.

Allowed capabilities are `documented_reasoning`, `behavioral_history`, `decision_comparison`, `outcome_comparison` and `learning_observations`. Each requires a document identifier, a description of the actual observation, `origin: documentary`, `source: context` and a sufficiently long exact quotation present in the original context. They establish availability of supplied documentation, not its authenticity, truth, lawful collection or semantic adequacy.

For example, an educational fixture could append the following decision note to its context and supply its corresponding capability:

```json
{
  "context": "Karar kaydı: kurul yalnızca unvanı gerekçe gösterdi, karşı kanıtları okumadı.",
  "evidence_capabilities": [
    {
      "capability": "documented_reasoning",
      "source": "context",
      "quote": "Karar kaydı: kurul yalnızca unvanı gerekçe gösterdi, karşı kanıtları okumadı.",
      "origin": "documentary",
      "document_id": "synthetic-record-1",
      "description": "Karar gerekçesinin belgede açıkça kaydedilmesi"
    }
  ]
}
```

This is a synthetic contract example, not a real news event or verified decision note. A real integration needs evidence provenance, lawful access and expert interpretation. Do not extract or invent a publisher's internal reasoning from its headline to fill this field. A quotation may concern a politician or source rather than the outlet; its occurrence is not automatic attribution of the quoted person's reasoning to the publisher.

`required_capabilities()` provides transparent conservative engineering minima. Cognitive-error cards generally require documented reasoning. Behavioral-policy and selected historical mechanisms additionally require behavior history. Framing/base-rate/survivorship comparisons require comparable decisions; calibration-related mechanisms require outcomes; memory/learning effects require learning observations. Other contextual-effect hypotheses require a decision comparison. The original concept-specific necessary conditions still apply. This minimum policy is not an expert-approved, complete psychological measurement instrument; review it with domain specialists before treating it as one.

Crucially, possession of a capability does not automatically support a claim. The native engine must complete, evidence must be exact, both reviewers must reference that capability in satisfied conditions, and human review remains required. Missing evidence can increase abstention and reduce recall. Measure that tradeoff rather than describing every downgrade as a corrected false positive.

## Integrating with the existing event pipeline

Install the detector's explicit schema dependency from the repository root:

```bash
python -m pip install -r biasguard/requirements.txt
```

For an existing unchanged run with saved reviewer outputs, generate a private guarded replay without touching the existing public build:

```bash
python -m biasguard.news apply \
  --run runs/bg \
  --guarded \
  --out /tmp/biasguard-guarded-draft.json
```

No model API is called by `apply`. Missing reviewer files remain missing/incomplete. The validity layer does not silently fall back to retrieval or fabricate replacement decisions.

For new event evidence, use a **new run directory**, not one containing old selector/reviewer files:

```bash
python -m biasguard.news inputs \
  --build /path/to/existing/build \
  --run /path/to/new-private-run \
  --top 150
python -m biasguard.news tasks --run /path/to/new-private-run --stage select
# Run the existing isolated selector agents on the emitted tasks.
python -m biasguard.news tasks --run /path/to/new-private-run --stage review
# Run advocate and skeptic independently on the emitted tasks.
python -m biasguard.news apply \
  --run /path/to/new-private-run \
  --guarded \
  --out /path/to/private-review/draft.json
```

Do not edit `inputs.jsonl` and reuse old reviewer outputs. Rebuild a new immutable run with its inputs, task files, taxonomy/prompt versions, output files and hashes. Existing outputs do not carry a cryptographic proof that reviewers saw the current input; exact quote checks are not a substitute for version-bound review provenance.

To integrate at the Python API level:

```python
from biasguard.engine import BiasGuard
from biasguard.validity import guard_news_result

# item comes from event_inputs() or a provenance-preserving editorial adapter.
# reviewer exposes the repository's existing select()/review() contract.
raw = BiasGuard(reviewer=reviewer).analyze(
    item["text"], item["context"], mode="ai", max_candidates=6
)
review_draft = guard_news_result(raw, item)
# Persist in protected review storage, not public/ or a public data pack.
```

The raw detector remains compatible with existing consumers. The guarded result is a new pending-review contract. This static repository does not contain the authenticated editorial administration system implied by a `/yonetim` workflow. The change does not pretend that a JSON approval flag authenticates a reviewer. To publish later, an authorized editorial application must review the actual source, preserve evidence/attribution and limitations, record actor/date/reason and issue a separately reviewed public projection. Changing the draft metadata or running `pack` is not that approval process.

## Exact evidence and source attribution

Evidence retains its original `text` or `context` field. Spans use zero-based Python Unicode-character indexes, with an exclusive end. They are not byte offsets or JavaScript UTF-16 indexes. Browser highlighting must convert them or verify the exact substring in a compatible representation.

Each supplied segment must agree with an actual outlet-record boundary. It cannot start at A's header and swallow B's record. Repeated quotes retain multiple occurrences; cross-record comparisons retain every touched source rather than being arbitrarily assigned to one outlet. Context records are not assigned to an outlet just because an outlet's name occurs in them. An evidence quote's provenance does not by itself prove the semantics of a cognitive label.

Monthly packs encode URL host and path rather than original scheme. Their existing decoder convention reconstructs HTTPS; uncompressed absolute URLs are preserved as supplied. Missing URLs remain null. Exported links are labelled `provided_not_network_checked`, not falsely described as independently verified or guaranteed functional. Retain original collector URLs separately if exact original scheme is required. Do not turn taxonomy-source URLs into article citations.

## Using the 138-mechanism Mesa laboratory

```bash
python -m pip install -r tools/mesa/requirements.txt
python -m biasguard.simulation list
python -m biasguard.simulation validate --output /tmp/mesa-contracts.json
python -m biasguard.simulation sweep \
  --agents 12 --replicates 3 --output /tmp/mesa-sweep
python -m biasguard.simulation crosswalk --output /tmp/mesa-crosswalk.json
```

The bundled source is the unchanged standalone export with its SHA-256 manifest. The wrapper validates provenance before loading that trusted bundled code. Custom scenario JSON remains data; it is not interpreted as Python code.

Matched strength-zero/intervention simulations control exogenous inputs and activation. Outputs expose task-specific metric units, agent/seed/family identity and traces. Some mechanisms change learned recall, some change numerical choice, some model social interaction; they cannot be pooled as one score. Synthetic agents within the same seeded run are not independent human subjects.

The crosswalk is explicitly unapproved. It proposes a detector ID only for a spelling match after replacing `_` with `-`; it does not judge semantic equivalence. All 138 rows remain `needs_domain_review`, `approved_detector_id: null`, `automatically_activated: false`. Do not merge this source vocabulary into the production 116-card taxonomy just to claim greater coverage.

A defensible future test adapter maps each approved construct to an evidence-adequacy question, renders only information available to the detector and keeps simulated truth/strength/private traits out of prompts. Split by event/scenario family and seed before tuning. Use synthetic tests to find failure modes, then test the fix on independently reviewed Turkish-news cases.

## Evaluating baseline versus guarded results

```bash
python -m biasguard.validation \
  --cases /path/to/independent-cases.jsonl \
  --results /path/to/guarded-results.json \
  --baseline /path/to/baseline-results.json \
  --out /tmp/detector-evaluation.json
```

Each reference line has `id`, `family_id`, `origin`, `labels` and preferably `label_version`. Use actual detector IDs such as `confirmation-bias`, not the simulator's underscored IDs. Classes are `supported`, `not_supported`, `uncertain`, `contextual` or `ineligible`. Optional `evidence_adequacy` contains independently reviewed true/false/null annotations; original `text`/`context` enable exact-quotation checks.

The evaluator accepts the repository's event export and native results, preserves explicit suppressed negatives and separates failed, missing, unassessed, abstaining and unsupported-taxonomy targets. Selected IDs or aggregate assessed counts never manufacture per-target negatives. Unknown result IDs remain diagnostics rather than extra negative controls. Human/synthetic origin is a supplied annotation, not authenticated proof of an expert panel.

Reports are separated by origin. Binary precision and conditional recall use completed decisive predictions against resolved references. End-to-end recall uses every known positive reference, retaining failure/abstention/unassessed misses. Contextual effects, ineligible references and uncertain references are outside binary confusion counts; harmful overassertions against those classes are reported separately. Zero denominators produce null, not perfect performance.

Evidence-supported positive precision is unavailable unless every known labeled assertion has a non-null independent adequacy annotation. Exact quotes do not supply that annotation. This completeness rule makes a statistic computable; it does not establish a sufficiently large sample, unbiased reference labels or empirical validity. Family repetition is reported, and the baseline comparison is descriptive by family. No invented confidence intervals, p-values or causal superiority claims are produced.

For a real improvement claim, freeze both algorithms and thresholds; obtain independent blinded ratings, adequate controls and adjudication; compare the same held-out event families; review false positives, missed positives, abstention, completion and source/topic/time slices. If calibration is needed, obtain a defined score and separate calibration data rather than translating reviewer agreement into probability. This implementation deliberately emits no purported calibrated confidence.

## Executed checks and remaining boundaries

The accompanying `biasguard-validity-checks.json` records actual local tests, simulation counts and the saved-output replay. Tests cover native and news draft publication rejection, source-boundary attribution, documentary capability availability/citation, exact spans, missingness, unsupported targets, contextual effects, evaluator input validation and legacy compatibility. CI runs offline tests and all 138 simulation contracts with read-only permissions; it has no collector, provider credentials, publication or database target.

The full 138-mechanism sweep used 12 agents and three seeded replications. All declared scenario-direction/boundary checks passed. These are executable model-assumption checks, not real detector measurements.

A local replay of all 150 archived event reviews completed without new model calls. Both legacy and guarded replay contained zero supported findings and 439 uncertain findings. Those archived outputs were already cautious. No independent reference labels were provided for that replay, and it demonstrates no accuracy gain. The new unit fixtures establish that unsupported claims are downgraded when they occur; they do not establish that every downgraded real claim is false.

Public packs, article content, the generated site and political placements were not rewritten. The remaining work for deployment is legitimate editorial review/storage integration, approved construct mapping, version-bound fresh reviewer runs and independent real-domain evaluation. Keep the new mode experimental until that evidence exists.

## Relevant code

`biasguard/validity.py` contains the evidence/observability algorithm. `biasguard/publication.py` contains the shared public-export refusal. `biasguard/news.py` supplies event provenance and guarded replay. `biasguard/validation.py` implements reference-led evaluation. `biasguard/simulation.py` wraps the optional laboratory. `tools/mesa/README.md` documents its limits. `pipeline/capraz_pipeline/build.py` performs publication preflight before processing. `.github/workflows/checks.yml` includes the new offline checks.
