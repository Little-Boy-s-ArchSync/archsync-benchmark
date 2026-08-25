# Phase 1-3 benchmark evidence

This evidence pack proves the benchmark properties required by the ArchSync Phase 1, Phase 2 and Phase 3 exit gates. The canonical machine-readable records are [`order-platform/ground-truth.json`](order-platform/ground-truth.json), [`evidence/phase-2-results.json`](evidence/phase-2-results.json), [`evidence/phase-3-results.json`](evidence/phase-3-results.json), and the detector-corpus results under [`evidence/`](evidence/).

## Case matrix

| Case | Owner | Classification | Expected graph delta | Finding | Expected source evidence |
| --- | --- | --- | --- | --- | --- |
| case-01 | order-team | no-impact | none | none | `order-service/src/pricing.ts:2` |
| case-02 | order-team | no-impact | none | none | `order-service/src/validation.ts:2` |
| case-03 | frontend-team | no-impact | none | none | `frontend/src/format.ts:2` |
| case-04 | payment-team | no-impact | none | none | `payment-service/src/retry.ts:1` |
| case-05 | platform-team | no-impact | none | none | `gateway/src/logger.ts:1` |
| case-06 | frontend-team | violation | relationship added | ARCH-001 | `frontend/src/app.ts:14` |
| case-07 | frontend-team | violation | relationship added | ARCH-002 | `frontend/src/app.ts:7` |
| case-08 | order-team | violation | relationship removed | ARCH-004 | `order-service/src/service.ts:8` |
| case-09 | order-team | evolution | component + relationship added | EVOLUTION-001 | `order-service/src/cache.ts:8` |
| case-10 | platform-team | evolution | components + relationships added | EVOLUTION-002 | `order-service/src/events.ts:8` |
| case-11 | frontend-team | no-impact | none | none | `frontend/src/notes.ts:1` |
| case-12 | order-team | no-impact | none | none | `order-service/src/db-types.ts:3` |
| case-13 | order-team | no-impact | none | none | `order-service/src/local-cache.ts:7` |
| case-14 | platform-team | no-impact | none | none | `gateway/src/events-log.ts:7` |
| case-15 | platform-team | violation | relationship added | ARCH-003, ARCH-005 | `gateway/src/server.ts:7` |
| case-16 | platform-team | violation | relationship added | ARCH-005 | `gateway/src/server.ts:5` |
| case-17 | frontend-team | violation | relationship removed | ARCH-006 | `frontend/src/app.ts:2` |
| case-18 | frontend-team | violation | relationship added | ARCH-002 | `frontend/src/app.ts:7` |
| case-19 | order-team | evolution | component + relationship added | EVOLUTION-001 | `order-service/src/fraud.ts:4` |
| case-20 | payment-team | evolution | component + relationship added | EVOLUTION-001 | `payment-service/src/risk-cache.ts:6` |

Every row also has a non-empty acceptance criterion. Violation findings are checked against rules in `architecture.yaml`; evidence locations must belong to a declared changed file and fall inside a hunk of the corresponding patch.

## Reproducibility gates

Run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm verify
```

The gate proves:

- the architecture model is valid through the pinned `@archsync/core` CLI;
- the complete benchmark manifest is semantically valid;
- the distribution is exactly 9 no-impact / 7 violation / 4 evolution;
- all 20 patch files exactly match their declared changed files;
- every evidence location falls inside its patch hunk;
- all 20 patches apply independently to the clean baseline;
- SHA-256 integrity binds the model, 9-file baseline tree and 20-file patch set;
- 55 detailed tests reject corrupted ground truth, integrity and pattern-corpus inputs;
- deterministic benchmark validation libraries enforce 100% line, branch and function coverage, bound in `evidence/unit-coverage.json`;
- the vendored Core and Guardian package bytes match their declared SHA-256 hashes and source commit pins;
- Guardian reconstructs the five-node/five-edge baseline from TypeScript source;
- all 20 patches are analyzed independently through the pinned Guardian package;
- full-graph and changed-graph node/edge precision, recall and F1 are recorded;
- classification, rule ID, evidence file, exact evidence line and determinism gates are enforced;
- the 40-signal detector corpus validates both positive signals and hard negatives;
- the frozen v0.1 result is provenance-bound and checked without being rewritten.
- the same 20 patches run as isolated Git diffs with cold and cache-hit baseline graph checks;
- all Git-diff decisions, changed-file sets, architecture deltas, violation rule sets and finding evidence match ground truth;
- each repeated Git-diff result is structurally identical and uses component-incremental analysis;
- every incremental head result is equivalent to a separate full scan of the same patched repository.

## Phase 2 measured result

The canonical result is [`evidence/phase-2-results.json`](evidence/phase-2-results.json):

- full-graph node precision/recall/F1: `1.000 / 1.000 / 1.000`;
- full-graph edge precision/recall/F1: `1.000 / 1.000 / 1.000`;
- changed-node precision/recall/F1: `1.000 / 1.000 / 1.000`;
- changed-edge precision/recall/F1: `1.000 / 1.000 / 1.000`;
- classification accuracy: `1.000`;
- classification agreement: `20/20` cases;
- exact violation rule-set agreement: `7/7` violation cases;
- expected evidence file and exact-line agreement: `11/11` finding-bearing cases for each measure;
- deterministic replay: `20/20` cases.

The evidence artifact records the denominators above rather than presenting a bare
`1.000`. It also binds the result to the exact manifest, architecture, baseline tree,
patch set, pinned Core and Guardian revisions, and the two executions performed for
the baseline and for every case (`42` analyzer executions in one D1 evaluation).

## Phase 3 measured result

The canonical Git-diff result is [`evidence/phase-3-results.json`](evidence/phase-3-results.json):

- classification agreement: `20/20` cases;
- merge-decision agreement: `20/20` cases;
- changed-file agreement: `20/20` cases;
- architecture-delta agreement: `20/20` cases;
- incremental/full-scan equivalence: `20/20` cases;
- exact violation rule-set agreement: `7/7` violation cases;
- expected evidence file and exact-line agreement: `11/11` finding-bearing cases;
- deterministic cold/warm replay: `20/20` cases;
- baseline-cache hits on the repeated run: `20/20` cases;
- component-incremental parsing: `57/189` TypeScript file instances (`0.3016`).

The protocol executes two Git-diff checks plus one independent full-scan oracle per case. This produces 40 pull-request checks and 80 analyzer calls: the cold check performs baseline and incremental analysis, the warm check performs incremental analysis with a cached baseline, and the oracle performs a full head scan. The committed performance samples were measured on the environment recorded in the artifact. Cold median/p95 was `171.83/195.45 ms`; warm median/p95 was `78.04/88.20 ms` across 20 cases per mode. These numbers include Git diff discovery, cache load or reconstruction, incremental AST analysis and conformance evaluation. They are evidence for this controlled machine and corpus only; the full-scan oracle is outside the timed PR-check samples.

## Detector challenge result

The controlled TypeScript detector corpus contains five detector groups with four
positive and four hard-negative signals per group: 20 positives and 20 negatives in
total. The frozen v0.1 artifact produced `TP=18`, `FP=4`, `FN=2`, `TN=16`
(`precision=0.818182`, `recall=0.900000`, `F1=0.857143`,
`specificity=0.800000`). On the same annotated source lines, provenance-aware v0.2
produced `TP=20`, `FP=0`, `FN=0`, `TN=20`, with all four metrics equal to
`1.000000`. Each version was executed twice and produced byte-identical normalized
JSON. These are controlled regression results, not an estimate over arbitrary
TypeScript repositories.

Regenerate and verify after an intentional analyzer, fixture or ground-truth change:

```bash
pnpm phase2:update
pnpm phase3:update
pnpm verify
```

The current complete gate performs `42` D1 executions and two v0.2 detector-corpus
executions (`44` current-analyzer executions), while verifying the frozen v0.1
package, hashes, metrics, and result. It runs from clean checkouts on both
`ubuntu-latest` and `windows-latest` in [GitHub Actions](.github/workflows/evidence.yml).
The workflow installs SHA-256-verified package artifacts built from the pinned Core
and Guardian revisions, so it requires no cross-repository credentials.
