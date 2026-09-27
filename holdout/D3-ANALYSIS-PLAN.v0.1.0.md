# D3 descriptive analysis plan

**Preparation amendment:** Read [method packet v0.1.0](D3-METHOD-PACKET.v0.1.0.md) before labeling. It proposes the module occurrence/edge endpoint, explicit Unknown/scoring scope, resolver freeze and joint acceptance. Conflicting legacy case-classification instructions are historical; no method acceptance is asserted.

Version: 0.1.0. Status: proposed; tool outputs have not been inspected by this preparation workflow.

## Populations and estimands

- Keep a source-capture inventory, an eligibility/exclusion log, an annotation population and an execution population as separate artifacts. Record all eligibility decisions before tool runs. Preparation counts are not performance measurements.
- Change-case classification is one result per frozen base/head pair, not one result per changed path or repeated run. Report counts per repository and labels, original agreement, final Unknown and exclusion reasons.
- Component/relationship recovery needs its own exhaustive scoped observation inventory and matching policy. Case labels alone cannot yield node/edge precision or recall. Do not invent such metrics when that inventory is absent.
- Baseline scores require a frozen common-capability mapping. Module-import rules are not automatically comparable to HTTP/data/cache/message relations. Unsupported capabilities stay separate from comparable failures.

## Reporting

- Report attempted cases, completed runs, failures, resolvable truth, Unknown, unsupported cases and scored cases with explicit denominators. Do not remove failures from the overall attempted population.
- For classification report the multiclass confusion table and conditional accuracy on resolvable cases with valid output, alongside execution coverage and conservative success over all resolvable attempted cases (failures count as not successful). Label these different denominators visibly. Do not score Unknown truth as correct merely because the tool also says Unknown.
- For a valid exhaustive edge/node census, define exact participant/type matching and deduplication before execution. Publish TP/FP/FN and denominators; a zero denominator produces null/not estimable, not 100%.
- Report original reviewer agreement and Cohen's kappa descriptively. Degenerate marginals produce undefined kappa with a reason. Reconciliation must not change those original statistics. Neither agreement nor a checksum proves scientific truth.
- Report per-repository results before any pooled result. Case overlap in files/revisions violates a naive independence assumption. The current three repositories do not support strong population-level generalization or confident cluster-based inference. This descriptive plan makes no universal accuracy, significance or causal superiority claim.
- If inferential intervals/tests are later required, approve an appropriate dependency-aware method and estimand before predictions. Do not add post-hoc tests merely to obtain significance; do not pass this descriptive plan off as the complete STAT-101 inferential protocol.
- Retain raw commands, exact package/configuration/source/metric hashes, UTC run times, stdout/stderr, exit status and all failures. Two deterministic reruns remain repeatability observations, not twice the number of independent cases. Runtime on one machine is not a universal speed claim.

## Stopping and reporting boundaries

Run the frozen population with the predeclared repeat count; keep errors and negative findings. Any necessary fix after inspecting D3 outputs is recorded as a post-hoc amendment with the original failed result preserved. Do not tune on D3 and continue calling the rerun an untouched holdout.

The paper must state that both annotators are associated with development, describe remaining bias and distinguish this evaluation from independent external replication. The proposed analysis has no measured ArchSync/baseline outcome yet and does not authorize execution.
