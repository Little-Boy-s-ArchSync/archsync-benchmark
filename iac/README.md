# Phase 5 IaC benchmark (pre-freeze)

This corpus is the deterministic technical preparation for P5-109 and P5-110.
It is intentionally **not** the frozen Phase 5 research dataset. The ground
truth remains provisional until the Phase 5 Lead and an independent Security
reviewer approve the exact commit, and until the upstream P4-120 gate is met.

The corpus exercises the exact `InfrastructureAnalysisInput` contract exported
by Guardian commit `de11e48a8f69fbe5cd32f052489a323e1c81eab3`. A package built from that
commit is vendored as `vendor/archsync-guardian-0.3.3.tgz`; its source commit,
package-content hash, and tarball hash are checked before every run.

## Corpus design

The 20 cases cover a clean baseline, valid changes, violations, evolutions, and
hard negatives across Terraform, Kubernetes, cross-source identity, evidence
claims, and all four Phase 5 security rules. Terraform is parsed as a bounded,
non-executing literal subset: this benchmark never initializes providers,
accesses state, contacts cloud accounts, or applies infrastructure. Kubernetes
documents are parsed but never submitted to a cluster.

`sources.json` is a compact fixture representation. The harness expands each
record into the exact Guardian observation/reference contract and verifies that
every evidence path and line exists in the case directory. Terraform and
Kubernetes paths passed to Guardian are repository-relative portable paths.

## Commands

```bash
pnpm iac:update       # intentionally refresh committed preparatory evidence
pnpm iac:verify       # read-only replay and exact evidence comparison
pnpm iac:gate         # fail closed until every human/freeze gate is satisfied
```

`iac:verify` runs the full corpus twice, requires byte-identical normalized
results, checks exact findings and required source locations, validates expected
conflicts and identity outcomes, computes per-rule and public-exposure metrics,
and proves that corpus hashes did not change during execution. It may report a
valid **preparatory** bundle while `iac:gate` remains closed.

Intentional fixture changes must be reviewed before running `iac:update`.
Neither command writes to `iac/`; only the explicitly requested update command
writes `evidence/iac/phase-5-preparatory.json`.
