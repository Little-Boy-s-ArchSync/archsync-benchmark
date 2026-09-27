# D3 change-case rubric

Version: 0.2.0. Status: proposed for nonblind, AI-assisted exploratory annotation; not accepted ground truth. Version 0.1.0 is retained as historical proposal and must not be used for the disclosed two-author design.

## Unit and prerequisites

One case is one exact repository/base/head/scope tuple from the source packet. Use the approved component mapping and expected architecture contract for that repository. A file or directory is not automatically a deployment component. Record source/target/type for any claimed architectural relationship and the location supporting it.

Read the scoped diff, both sides of each changed path, and necessary unchanged context. The provided dossiers contain changed-file source; add source-bound context when needed instead of guessing. Commit messages, function names and a tool's output do not substitute for source evidence. AI may perform this reading and propose a decision, but the cited source bytes and applicability of a frozen rule must be checked and retained.

## Decision order

1. If the source, mapping, endpoint, relevant runtime configuration or expected rule needed for a decision cannot be resolved, record `unknown` and the specific missing evidence. Do not interpret lack of detection as no impact.
2. If a documented architecture change violates at least one applicable predeclared rule, record `violation`; supply rule ID and exact evidence. If other changes are also present, retain them in the rationale rather than losing them under the dominant label.
3. Otherwise, if a defensible topology or architecture-relevant component change exists under the approved contract, record `evolution` with the observed base/head difference. It means a non-forbidden change requiring review under the study contract, not necessarily a defect in upstream software.
4. Otherwise, record `no-impact` only when review supports no architecture-relevant change in the declared scope. Refactoring, local control-flow changes and test changes are not automatically no-impact; inspect whether dependencies or runtime behavior relevant to the architecture change.

An existing violation that is unchanged is not an introduced violation. Record it separately in the rationale. Final scoring must distinguish snapshot conformance from introduced-change classification; do not compare unlike labels.

## Evidence and Unknown

For each decision record exact repository, base/head SHAs, side, path, physical line, literal short quote and source-based rationale. Relationships need identifiable participants and a type, not just a keyword. A negative or no-impact label needs a reviewed scope/coverage record; one positive quote alone cannot establish absence across a system.

Use Unknown for unresolved wrappers, computed endpoints, dependency injection, generated code, missing external configuration, unsupported source representation, ambiguous component mapping or missing contract. This is a substantive uncertainty category, not an incorrect tool prediction. If the reviewers cannot agree after inspecting evidence, preserve the original labels and use an unresolved final Unknown under the adopted consensus policy.

Cases lacking any regular citable source or requiring evidence outside the dossier need a versioned source-bound extension. Do not cite a fabricated line 1 or silently drop them.

## AI-assisted author review

Hiếu and Hoàng are development-associated authors who disclosed prior D3 output exposure. Their reviews are nonblind and exploratory. AI may read all source/diffs, gather context, propose or pre-fill labels, Unknown reasons, rule applicability and evidence, compare cases and calculate metrics. Record the tool/model if known, input scope (`source-only`, `prediction-exposed`, or `unknown`), retained output reference, whether the suggestion was shared, and human verification extent (`full`, `sampled`, or `not-checked`) for each AI-assisted row. A shared suggestion or copied label is permitted when disclosed, but cannot be counted as an independent human first-pass decision. AI-produced citations must be checked against the pinned source; AI output alone is not source evidence.

Keep both original review records and any AI suggestion before reconciliation. Compute agreement on those original records, describe dependence from shared AI, and do not claim blind or external independent ground truth. Prior exposure is recorded even if the AI prompt for a particular case contains source only. Confidence is a reviewer assessment from 0 to 1, not an empirical probability. Low confidence remains visible; no cutoff may be selected after seeing tool outcomes.

This rubric supplies no human acceptance or actual case decision. The existing blind holdout gate remains closed for this design; it must not be passed by writing `saw_prediction=false` contrary to the authors' declarations.
