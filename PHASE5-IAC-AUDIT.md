# Phase 5 IaC benchmark audit

## Decision

P5-109 and P5-110 have a complete deterministic **technical preparation**, but
the Phase 5 evidence gate is not closed. The dataset is explicitly pre-freeze,
Guardian PR 7 is still a draft, P4-120 is not recorded as approved, ADR-0005 is
not accepted, and independent Security and ground-truth approvals are absent.

No result in this branch is a production-cloud observation, an external
holdout result, or evidence that arbitrary Terraform and Kubernetes programs
are supported.

## Requirement mapping

| Work item | Acceptance requirement | Artifact and executable check | Current state |
| --- | --- | --- | --- |
| P5-109 | Baseline, valid changes, violations, evolutions, hard negatives | `iac/ground-truth.json` contains 20 contiguous cases with a checked 1/3/7/2/7 distribution | Technically prepared; human freeze pending |
| P5-109 | Terraform, Kubernetes, identity, and security coverage | `iac/cases/` covers AWS/Azure/GCP databases, caches, brokers, Ingress routes, aliases, contradictions, missing-source claims, dynamic inputs, unresolved references, and unsupported lookalikes | 20/20 accepted by the pinned parser contract |
| P5-109 | Source/IaC evidence and expected conflicts | Every positive finding declares required source/file/line evidence; selected claims declare exact source-class values; contradiction and uncertain-identity counts are exact | 20/20 match |
| P5-109 | Cases apply/parse | The harness passes repository-relative files to Guardian's non-executing Terraform/Kubernetes parsers and rejects every error-level diagnostic | 20/20 parseable; no provider/cluster execution |
| P5-109 | Ground truth frozen before final run | Governance record and corpus status must be frozen before `iac:gate` can close | Pending human action |
| P5-110 | Run benchmark twice | `scripts/iac-evidence.mjs` executes two full independent passes | Two normalized run hashes are identical |
| P5-110 | Compute metrics | Case validity, exact finding/evidence agreement, public-exposure detection, and per-rule TP/FP/FN/TN/precision/recall/F1/specificity are committed | Controlled-corpus regression metrics recorded |
| P5-110 | Hash inputs, code, runtime, and results | Corpus tree, each corpus file, harness/test/package/lock files, vendored package, package content, and normalized run results are SHA-256-bound | Verified on every run |
| P5-110 | Detect every public exposure | Three database cases and one unexpected-Ingress case are labeled separately | 4/4 detected, 0 unexpected on this corpus |
| P5-110 | Each conflict identifies the correct sources | Claim checks compare exact `spec`, `code`, and `iac` values; required finding evidence compares source/file/line | Exact checks pass |
| P5-110 | Never auto-sync the baseline | The runner opens corpus files read-only, hashes before and after both runs, and exposes no baseline-write path | Input tree unchanged |
| P5-110 | Fail-closed verifier | `pnpm iac:gate` requires technical validity, frozen corpus metadata, P4-120, accepted ADR, independent Security review, and exact-commit Lead/Security approval records | Intentionally exits `P5_GATE_INCOMPLETE` |

## Controlled-corpus results

The following values are regression results for this provisional 20-case
corpus only:

- 20/20 cases valid and parseable;
- 20/20 exact finding sets;
- 20/20 required source-evidence checks;
- 4/4 labeled public-exposure events detected with no unexpected event;
- all four rule families have zero false positives and zero false negatives at
  the case level; and
- two complete normalized run hashes are identical.

The committed evidence is `evidence/iac/phase-5-preparatory.json`. Its status is
`PREPARATORY`, and its closure section lists every open governance gate.

## Runtime provenance

The benchmark consumes a separately aliased package built from exact Guardian
commit `de11e48a8f69fbe5cd32f052489a323e1c81eab3`, alongside the active Phase 6
Core and Guardian dependencies. `iac/guardian-source.json` pins the repository,
draft PR, full commit, contract version, tarball SHA-256, and package-content SHA-256.
The verifier compares all of them to the installed runtime provenance before
analysis begins.

## Reproduction

```bash
pnpm install --frozen-lockfile
pnpm iac:verify
pnpm verify

# Expected to fail until governed approvals and freeze are real:
pnpm iac:gate
```

The allowed Terraform surface is the literal, non-executing subset documented
by Guardian PR 7. Modules, provider/state access, dynamic expansion, Helm,
Kustomize, Jsonnet, cluster submission, deployment, and baseline synchronization
are outside this preparatory benchmark.
