# D3 author-annotation amendment

Version: 0.2.0. Status: proposed, not an accepted execution protocol.
This is additive to PROTOCOL.md. No previous manifest, approval or evidence is rewritten.

The user accepted the 56-primary/4-context case disposition and the module-only evaluation unit in the current Codex conversation on 2026-09-28. See `D3-SCOPE-ACCEPTANCE-20260928.md` and `D3-EVALUATION-UNIT-DECISION-20260928.md`. Those narrow decisions do not approve this complete method or its individual architecture rules.

## Requested team arrangement

The user identifies Hieu and Hoang as the two primary contributors and the remaining people as support. The proposed D3 design uses these two authors as annotators with separately retained review records. It does not require support to serve as an additional annotator by default. Author-list and GitHub-permission changes are outside this amendment.

The earlier relayed statement that neither author had seen D3 output is superseded by their later declarations. Hoang disclosed in Benchmark PR #16 that he had seen D3 source and ArchSync or baseline prediction/trace/output; exact scope and timing remain unknown. Hieu stated in the current task conversation that he had seen D3 output, cannot remember the exact tool/repository/cases, and had helped modify analyzer/rules. Both are development-associated and prediction-exposed for the purposes of this proposed design. It is an author-associated, **nonblind exploratory** evaluation, not an independent holdout. Preserve each person's own declaration and unresolved details; do not infer that every case or both tools were seen.

## Proposed procedure

- Approve the exact source population, rubric, architecture contract, tool/configuration pins and analysis plan before official annotation. Source preparation already occurred; do not backdate approval of repository selection.
- Work on the same cases with separate records where feasible. Keep original files and their byte hashes before reconciliation. A hash binds bytes, not review identity or chronology. If the reviewers share AI output or each other's proposal, disclose that dependence rather than claiming independent first passes.
- **AI assistance is permitted for the full review workflow:** reading source and diffs, finding context, proposing or pre-filling labels, Unknown reasons, rule applicability, file/line evidence, discrepancy notes, and metric calculations. A human may ask AI to review all cases, not just navigate files. Record the AI tool/model if known, input scope, whether ArchSync/baseline predictions were visible, raw AI suggestion or retained hash, what each author verified, and any corrections. A shared AI-produced answer may be reused, but two copies of it are not two independent human labels; report agreement only with the actual dependency disclosed. AI output alone is not source evidence: verify cited bytes, commit, path and line before using them as evidence. If predictions influenced a proposed truth label, mark the row prediction-exposed and do not use it as an independent oracle for that tool.
- Compute agreement from original labels before discussing disagreements. Preserve those original labels. Under the proposed policy, jointly agree a final label with evidence; if unresolved, retain Unknown, its reason and its impact on coverage. Do not modify the original agreement to meet a target.
- A violation needs a source-backed, predeclared rule. A study-defined contract must be identified as such, not presented as an upstream maintainer's accepted architecture. No matching rule means no defensible violation label.
- The changed-file dossiers support change-case annotation, not an exhaustive node/edge ground-truth census. Review unchanged context where needed; retain it through a versioned source-bound extension before citing it. A single case label cannot supply relationship-level recall denominators.
- Freeze actual originals, AI suggestions/provenance, reconciliation, final truth, source scope, method and run configuration before any **new official** inference. Earlier output exposure remains a disclosed historical limitation; it cannot be undone by a later freeze. Keep run failures and Unknowns. Report author-associated annotation bias, prediction exposure, AI assistance and case/repository dependence in the paper.

## Implementation boundary

The new d3-review commands prepare or mechanically inspect reviews only. They do not authenticate referenced approvals, establish label truth, verify complete architecture coverage, prove blinding or turn the old scaffold gate into an approved experiment. The existing holdout execution scaffold stays closed. Joint reconciliation enforcement, semantic contract review, the final source-compatible execution runner, frozen scoring and fair baseline comparison still require completion before D3 results exist.

This proposed method can support a real-world exploratory evaluation with disclosed author and AI-assisted annotation. It cannot support a claim of blind or developer-independent ground truth, nor guarantee publication acceptance.
