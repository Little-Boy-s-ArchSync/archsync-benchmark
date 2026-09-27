# D3 change-case rubric

Historical proposal only: the blind-review and AI-scope wording below is superseded for Hiếu/Hoàng by `D3-CASE-RUBRIC.v0.2.0.md`. Do not apply its restriction on AI assistance to the current nonblind exploratory workflow.

Version: 0.1.0. Status: proposed for review before annotation, not accepted ground truth.

## Unit and prerequisites

One case is one exact repository/base/head/scope tuple from the source packet. Use the approved component mapping and expected architecture contract for that repository. A file or directory is not automatically a deployment component. Record source/target/type for any claimed architectural relationship and the location supporting it.

Read the scoped diff, both sides of each changed path, and necessary unchanged context. The provided dossiers contain changed-file source; add source-bound context when needed instead of guessing. Commit messages, function names and a tool's output do not substitute for source evidence.

## Decision order

1. If the source, mapping, endpoint, relevant runtime configuration or expected rule needed for a decision cannot be resolved, record `unknown` and the specific missing evidence. Do not interpret lack of detection as no impact.
2. If a documented architecture change violates at least one applicable predeclared rule, record `violation`; supply rule ID and exact evidence. If other changes are also present, retain them in the rationale rather than losing them under the dominant label.
3. Otherwise, if a defensible topology or architecture-relevant component change exists under the approved contract, record `evolution` with the observed base/head difference. It means a non-forbidden change requiring review under the study contract, not necessarily a defect in upstream software.
4. Otherwise, record `no-impact` only when review supports no architecture-relevant change in the declared scope. Refactoring, local control-flow changes and test changes are not automatically no-impact; inspect whether dependencies or runtime behavior relevant to the architecture change.

An existing violation that is unchanged is not an introduced violation. Record it separately in the rationale. Final scoring must distinguish snapshot conformance from introduced-change classification; do not compare unlike labels.

## Evidence and Unknown

For each decision record exact repository, base/head SHAs, side, path, physical line, literal short quote and source-based rationale. Relationships need identifiable participants and a type, not just a keyword. A negative or no-impact label needs a reviewed scope/coverage record; one positive quote alone cannot establish absence across a system.

Use Unknown for unresolved wrappers, computed endpoints, dependency injection, generated code, missing external configuration, unsupported source representation, ambiguous component mapping or missing contract. This is a substantive uncertainty category, not an incorrect tool prediction. If two reviewers cannot agree after inspecting evidence, preserve the original labels and use an unresolved final Unknown under the adopted consensus policy.

Cases lacking any regular citable source or requiring evidence outside the dossier need a versioned source-bound extension. Do not cite a fabricated line 1 or silently drop them.

## Author review procedure

Hiếu and Hoàng each review the same complete selected population separately. Both are development-associated authors. Keep decisions private until both initial files are sealed; do not copy AI-produced decisions into two nominally independent reviews. Disclose permitted source-navigation or explanation assistance accurately. Neither reviewer sees ArchSync/baseline predictions before the ground-truth freeze.

Confidence is a reviewer assessment from 0 to 1, not an empirical probability of correctness. Low confidence remains visible; no confidence cutoff may be selected after seeing tool outcomes. Agreement is computed on the original labels, before any reconciliation. This document supplies no human approval or actual case decision.
