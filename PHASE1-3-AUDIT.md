# Phase 1--3 completion audit

Audit date: 2026-08-14

This audit maps every Phase 1--3 roadmap requirement to executable evidence. A feature is marked complete only when its implementation, controlled input and expected result are covered by a reproducible gate. Diagrams and narrative text are supporting views, not primary evidence.

## Completion summary

| Phase | Roadmap outcome | Decision |
| --- | --- | --- |
| Phase 1 | Machine-readable architecture contract, deterministic graph/conformance foundation and controlled benchmark lab | Complete |
| Phase 2 | TypeScript source-derived Observed Graph, deterministic rules and evidence-rich findings | Complete for the declared TypeScript/Node.js scope |
| Phase 3 | Git-diff CI gate, cache, incremental analysis, reports, demo and performance baseline | Technically complete; repository-plan enforcement limitation remains |

## Phase 1 requirement audit

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| `architecture.yaml` is the source of truth | Core schema, parser and examples; generated Mermaid/draw.io views are deterministic derivatives | Proven |
| Schema v0.1 covers components, relationships, rules and quality goals | Core `specs/architecture.schema.json` and bound Phase 1 evidence | Proven |
| Invalid input is rejected with actionable paths | Invalid-schema and unknown-component fixtures plus CLI smoke checks | Proven |
| Graph domain model and graph diff | Core graph/diff implementation, unit tests and JSON CLI smoke check | Proven |
| Mermaid view is generated from the model | Core deterministic renderer, tests and evidence hash | Proven |
| One-stack, five-component benchmark | Order Platform baseline with frontend, gateway, order-service, payment-service and postgres | Proven |
| Initial ten cases preserve the planned 5/3/2 distribution | Cases 01--10 contain 5 no-impact, 3 violation and 2 evolution cases | Proven |
| Every benchmark case has an owner and expected delta | Ground-truth verifier covers all 20 contiguous cases and all patches apply independently | Proven |
| Reproducible Core quality gate | 100/100 tests, 13/13 built-CLI smoke checks and 100% statement/branch/function/line coverage | Proven |
| Evidence is tied to the implementation and inputs | Core Phase 1 manifest binds source, tests, fixture tree, verifier configuration and lockfile by SHA-256 | Proven |

Roadmap Phase 1 seed: 5 no-impact / 3 violation / 2 evolution in cases 01--10. The expanded research dataset contains 20 cases with a 9/7/4 distribution; this expansion does not replace or relabel the original seed.

## Phase 2 requirement audit

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Expected Graph from model and Observed Graph from source | Pinned Core plus Guardian TypeScript analyzer | Proven |
| One supported stack and declared detectors | TypeScript/Node.js with fetch, PostgreSQL, Redis and AMQP producer/consumer detectors | Proven |
| Deterministic deny, allow, require and require-path rules | Core conformance tests and 20-case end-to-end benchmark | Proven |
| Human and JSON CLI reports | Guardian `check` and `check-json` contracts plus CLI smoke checks | Proven |
| Every violation maps to rule and model/source evidence | 7/7 violation rule sets and 11/11 exact file/line evidence matches | Proven on D1 |
| Evolution is separate from violation | Exact 20/20 classification agreement and distinct exit 3/review decision | Proven on D1 |
| Precision and recall are at least 0.85 | D1 full and changed graph node/edge precision and recall are 1.0 | Proven on D1 |
| Detector challenge regression | v0.2 has 20 TP, 0 FP, 0 FN and 20 TN on D2 | Proven on D2 |
| Determinism | 20/20 D1 replays plus repeated D2 analysis | Proven |
| Reproducible Guardian quality gate | 58/58 tests, 22/22 built-CLI smoke checks and 100% statement/branch/function/line coverage for deterministic engine, doctor and model-command modules | Proven |
| Evidence is tied to the implementation and inputs | Guardian Phase 2 manifest binds source, complete fixture tree, verifier configuration, lockfile and vendored Core artifact by SHA-256 | Proven |
| Reproducible benchmark validation gate | 55/55 tests and 100% line/branch/function coverage for deterministic benchmark validation libraries, plus real 20-case and 40-signal integration runs | Proven |

The roadmap name for the initial analyzer milestone is v0.1. The benchmark keeps that frozen baseline. The strengthened provenance-aware analyzer is v0.2, while Guardian package v0.3 adds the Phase 3 Git/CI layer without replacing the deterministic Phase 2 semantics.

## Phase 3 requirement audit

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| `check --diff` for working trees and branches | Guardian Phase 3 implementation, feature-branch merge-base test and CLI smoke checks | Proven |
| PR annotations and severity-based exit codes | GitHub annotation formatter and exits 0, 1 and 3 in tests/demo | Proven |
| Cached baseline graph with safe rebuild | Cold-miss, warm-hit and corrupt-cache tests | Proven |
| Component-incremental update | 57/189 parsed TypeScript file instances and 20/20 incremental/full-scan equivalence | Proven on D1 |
| Regression suite of at least ten cases | 20 independently applied and integrity-bound patches | Proven |
| Diff report and CI workflow | Human, JSON, Markdown and GitHub step-summary outputs plus repository workflows | Proven as technical artifacts |
| PASS/BLOCK/REVIEW MVP demo | Cases 01, 06 and 09 run through `pnpm demo:phase3` | Proven |
| Performance baseline | Raw timing samples with recomputed summary and recorded environment | Proven for one Windows machine |
| User guide and 15-minute quickstart | Clean-checkout commands and clean Ubuntu/Windows CI jobs | Proven for recorded runs |
| No automatic contract update | Architecture changes require review; the tool never rewrites or self-approves the baseline | Proven in implementation scope |

Phase 3 benchmark: 20/20 merge decisions, 20/20 changed-file sets, 20/20 architecture deltas, 20/20 incremental/full-scan equivalence checks, 20/20 repeated cache hits, 7/7 violation rule sets and 11/11 exact evidence locations.

## Evidence chain

1. Core Phase 1 evidence binds the contract implementation, tests, fixtures, verifier and dependencies.
2. Guardian Phase 2 and Phase 3 evidence bind the analyzers, controlled fixtures, verifier and pinned Core artifact.
3. Benchmark integrity binds the model, baseline source tree and all 20 patches.
4. Phase 2, detector-pattern and Phase 3 results bind the datasets and pinned runtime packages to normalized results.
5. CI reruns the same repository gates on Windows, Ubuntu and macOS; the paper reports only fields recoverable from these JSON artifacts or the corresponding coverage summaries.

## Paper claim audit

The paper may claim only the following within the evaluated scope:

- deterministic results for the bound D1 and D2 datasets;
- exact D1 graph, classification, rule and evidence measurements recorded in `evidence/phase-2-results.json`;
- exact D2 detector counts recorded in the baseline and v0.2 pattern result files;
- exact Git-diff decisions, cache behavior, incremental/full-scan equivalence and recorded timings in `evidence/phase-3-results.json`;
- Core, Guardian and benchmark validation test/coverage results reproduced by their repository gates.

It must not generalize corpus-bound 1.0 scores to arbitrary TypeScript repositories, describe the timing sample as universal performance, claim an independent external holdout, claim multi-language support, or claim enforced merge protection on the current private repository plan.

## Remaining operational boundary

The private GitHub organization plan currently rejects branch-protection and repository-ruleset APIs. Workflows, annotations, exit decisions and CODEOWNERS are present, but a maintainer with merge authority can bypass a failed check until required-check enforcement becomes available. This does not invalidate the deterministic technical Phase 3 result, but it prevents a claim of deployed, non-bypassable governance.

## Final decision

Phase 1, Phase 2 and the deterministic technical Phase 3 MVP are complete against the declared roadmap scope and reproducible evidence gates. The paper is valid only when it preserves the dataset, language, timing and repository-governance boundaries above.
