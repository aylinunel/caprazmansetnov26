# Repository-specific validity algorithm plan

The change extends the existing Python BiasGuard/event-review pipeline. It does not migrate or redesign the static website, operate collector jobs, run provider APIs, rebuild public data, or infer political placement from cognitive-bias scores.

## Implementation boundaries

- `biasguard/validity.py`: parent-owned deterministic observability and evidence gates. The existing review engine remains compatible. `guard_news_result(result, item, cards=None)` returns a copied native result with supported findings downgraded when requisite external evidence capabilities are absent. `evidence_attribution(item, evidence)` resolves exact original-field occurrences to source segments, preserving every repeated/cross-line span. `ensure_publication_allowed(payload)` raises `ValueError` for new guarded review-only artifacts; legacy artifacts remain compatible.
- `biasguard/news.py`: integrate an opt-in `apply(..., guarded=False)` and `--guarded` CLI. Build richer local-only provenance segments from actual monthly packs. Maintain existing slim keys and add assessed/selected/unassessed coverage and validity details. New guarded output is a draft/review artifact, never silently a public pack.
- `tools/mesa/expanded_mesa_biases.py`: include the previously executed standalone 138-module simulation unchanged. Offline optional requirements stay separate from the production pipeline. `biasguard/simulation.py` supplies a repository-native local CLI. Simulator internals never enter real article model prompts.
- `biasguard/validation.py`: offline normalized evaluation of replayed/approved results against versioned case labels. Keep execution failures, abstentions, ineligible/unknown categories and unassessed targets distinct. Separate synthetic metrics from independent expert-reviewed data. No calibrated confidence or combined bias score is invented.
- `docs/biasguard-validity.md`: algorithm, rationale, exact commands, input capability contract, output interpretation, evaluation boundary and review-only publication policy.

## Safety and compatibility

No main-branch push, public-data replacement, live model calls, deployment, or live database actions. Deliver a reviewable feature branch and pull request if repository access permits. Workflows and tests must remain offline and least-privilege. All 138 simulation entries remain educational task models; importing them does not add 138 trustworthy production detector categories. The site’s supplied 0–100 political positions remain unchanged and separately disclosed.

The new core uses capability evidence supplied independently of model review: original-field exact quotes and explicit capability metadata. These verify the existence of supplied documentary context, not its truth or psychological interpretation. Missing evidence downgrades conclusions; a reviewer’s declared `kind=behavioral`, supplied ideological placement, collector coverage gap, or repeated headline does not create a capability. All guarded results remain `needs_review` until a separate legitimate editorial workflow reviews them. No pretend approval/authentication system will be added.
