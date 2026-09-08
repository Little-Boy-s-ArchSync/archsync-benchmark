# Phase 3 completion audit

Audit date: 2026-08-14

This audit maps the Phase 3 roadmap requirements to executable evidence. A green test alone is not treated as proof unless the test covers the required behavior and the result is bound to its inputs and runtime artifacts.

## Roadmap requirements

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| `check --diff` for working trees and feature branches | Guardian `src/phase3.ts`, `src/phase3.test.ts`, and CLI smoke checks | Proven |
| PR annotations and severity-based exit codes | Guardian GitHub annotation formatter and CLI smoke checks for exits 0, 1, and 3 | Proven |
| Cached baseline graph | Guardian corrupt-cache rebuild test plus cold-miss/warm-hit evidence | Proven |
| Component-incremental update | 57/189 parsed file instances and 20/20 incremental/full-scan equivalence | Proven on D1 |
| Regression suite with at least 10 changes | 20 independently applied patches: 9 no-impact, 7 violation, 4 evolution | Proven |
| CI workflow | `.github/workflows/architecture-gate.yml` and `.github/workflows/evidence.yml` | Proven as workflow artifacts |
| Diff report | Human output, JSON output, Markdown artifact, and GitHub step summary tests | Proven |
| MVP demo | `pnpm demo:phase3` executes PASS, BLOCK, and REVIEW cases | Proven locally and in clean CI |
| Performance baseline | Raw cold/warm samples, recomputed median/p95, environment record | Proven for the recorded Windows machine |
| User guide and 15-minute quickstart | Clean-checkout commands in `README.md`; same commands run by CI | Proven for current CI runners |

## Exit gates

| Exit gate | Case and evidence | Result |
| --- | --- | --- |
| Violating PR is blocked | case-06 returns `BLOCK`, exit 1, `ARCH-001`, and `frontend/src/app.ts:14` | Proven |
| No-impact PR passes | case-01 returns `PASS`, exit 0, and no architecture delta | Proven |
| Evolution requests approval | case-09 returns `REVIEW`, exit 3, Redis topology evidence; `architecture.yaml` has a real CODEOWNER | Proven at workflow level |
| Clean-machine demo completes within 15 minutes | GitHub run 31792251158 completed in 31 seconds on Ubuntu and 2 minutes 31 seconds on Windows, including install, full verification, and all three demos | Proven for those two runs |

## Evidence inventory

- Core Phase 1: `archsync-core/evidence/phase-1-evidence.json`.
- Guardian Phase 2: `archsync-guardian/evidence/phase-2-evidence.json`.
- Guardian Phase 3: `archsync-guardian/evidence/phase-3-evidence.json`; binds source, fixtures, package metadata, lockfile, and pinned Core artifact.
- Benchmark integrity: `evidence/benchmark-integrity.json`; binds model, baseline tree, and all patches.
- End-to-end Phase 2: `evidence/phase-2-results.json` and frozen snapshot validation.
- Detector regression: `evidence/typescript-pattern-baseline-v0.1.json` and `evidence/typescript-pattern-results.json`.
- Git-diff Phase 3: `evidence/phase-3-results.json`; binds the manifest, model, source tree, patches, Guardian package, and normalized results.
- Benchmark validation coverage: `evidence/unit-coverage.json`; binds 55/55 tests and 100% line, branch and function coverage to validation-library and test hashes.

The Phase 3 benchmark now rejects all of the following: a wrong decision, wrong changed-file set, wrong architecture delta, wrong violation rule set, wrong evidence file or line, a cold/warm replay difference, a missing cache hit, or any difference between the incremental result and a separate full scan of the same patched head.

## Verified measurements

- Classification, decision, changed-file, architecture-delta, and incremental/full-scan agreement: 20/20 each.
- Violation rule-set agreement: 7/7.
- Exact evidence file and line agreement: 11/11 finding-bearing cases.
- Repeated cache hits and deterministic replay: 20/20 each.
- Incremental analysis scope: 57/189 TypeScript file instances, or 0.3016.
- Recorded Windows cold median/p95: 518.51/531.05 ms.
- Recorded Windows warm median/p95: 242.62/249.30 ms.

## Boundaries that must remain explicit

- D1 and D2 are controlled, co-developed regression datasets, not independent estimates of general accuracy.
- Performance values describe one recorded machine and are not cross-platform thresholds.
- As of 2026-08-30, the repository is public and `main` is protected. GitHub requires the three-platform `Benchmark evidence` matrix, one approval after the latest push, CODEOWNERS review for governed architecture/IaC evidence paths, resolved conversations, and applies the rule to administrators; force-push and deletion are disabled. These repository controls do not replace a protocol approval, ground-truth freeze, or independent research review.
- Phase 3 does not include automatic baseline updates, automatic repair, AI authority, IaC, runtime evidence, or multi-language validation.

## Completion decision

The deterministic Phase 3 technical MVP is complete against the roadmap artifacts and exit behaviors. Merge enforcement was enabled after the original audit and is an operational control, not additional Phase 3 research evidence.
