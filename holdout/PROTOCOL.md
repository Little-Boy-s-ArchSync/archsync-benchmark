# D3 independent holdout protocol

Status: **PROPOSED — blocked by EXP-102 and Lead approval**

## Objective and unit of analysis

D3 estimates out-of-sample component/relationship recovery, architecture-change classification, rule matching, and exact source-evidence accuracy on 2–3 permissively licensed TypeScript systems that were never used to tune ArchSync. The primary unit is one frozen, independently annotated architecture observation or change case. Repository-level summaries are secondary and must not replace case-level denominators.

## Selection and leakage control

Before cloning candidates, record inclusion criteria: OSI-approved license, TypeScript/Node, accessible immutable commit, medium analyzable scope, and at least two of HTTP/data/cache/message patterns. Exclude repositories, forks, copied fixtures, or commits used for detector, rule, prompt, or benchmark tuning. Candidate rationale, exclusions, size, stack, retrieval time, exact scope, commit, license, Node/package-manager versions, and source-tree hash are recorded before annotation.

The Lead must approve this protocol before repository selection and again before analyzer execution. No ArchSync prediction, prompt output, detector trace, or existing benchmark label may be visible to reviewers during ground truth. Pilot repositories and cases are permanently excluded from the final sample.

## Ground truth

Two reviewers independently label component, relationship, violation, evolution, no-impact, or Unknown; attach file/line evidence and confidence; and attest `saw_prediction=false`. The handbook governs positive, negative, wrapper/dynamic, and Unknown cases. Original rows are immutable. Disagreements retain both labels, agreement statistics, final adjudication, rationale, and named human sign-off.

## Freeze and inference

Only after adjudication, hash the source snapshot, scope, exclusions, raw annotations, adjudication, final truth, environment, and manifest with `createFrozenManifest`. A frozen manifest requires a human Lead approval identity/time and 2–3 complete repositories. Each repository binds exact URL, full commit, safe scope, tracked-tree hash, license path/hash and tool environment; the clone/inspect adapter rejects any observation mismatch. Any changed byte invalidates the verifier. Package exact Core/Guardian versions, commits and artifact hashes, run full scan exactly twice, retain failures, and never tune after seeing D3 output. `pnpm holdout:gate` remains closed until these prerequisites exist.

## Analysis

Report n and explicit numerator/denominator for precision, recall, F1, classification accuracy, rule matching, and exact file/line evidence. Failed runs stay in n and cannot count as success. Report per-repository and pooled values, uncertainty from the frozen statistical plan, false-positive/false-negative evidence and action, environment, raw timing samples, and full-scan oracle agreement. A limitation or failed target is reported honestly; D3 is not reused for remediation tuning before the result freeze.
