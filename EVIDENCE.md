# Phase 1-2 benchmark evidence

This evidence pack proves the benchmark properties required by the ArchSync Phase 1 exit gate. The canonical machine-readable record is [`order-platform/ground-truth.json`](order-platform/ground-truth.json).

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
- the distribution is exactly 5 no-impact / 3 violation / 2 evolution;
- all 10 patch files exactly match their declared changed files;
- every evidence location falls inside its patch hunk;
- all 10 patches apply independently to the clean baseline;
- SHA-256 integrity binds the model, 9-file baseline tree and 10-file patch set;
- mutation tests reject corrupted ground truth.
- the vendored Core and Guardian package bytes match their declared SHA-256 hashes and source commit pins;
- Guardian reconstructs the five-node/five-edge baseline from TypeScript source.
- all ten patches are analyzed independently through the pinned Guardian package;
- full-graph and changed-graph node/edge precision, recall and F1 are recorded;
- classification, rule ID, evidence file, exact evidence line and determinism gates are enforced.

## Phase 2 measured result

The canonical result is [`evidence/phase-2-results.json`](evidence/phase-2-results.json):

- full-graph node precision/recall/F1: `1.000 / 1.000 / 1.000`;
- full-graph edge precision/recall/F1: `1.000 / 1.000 / 1.000`;
- changed-node precision/recall/F1: `1.000 / 1.000 / 1.000`;
- changed-edge precision/recall/F1: `1.000 / 1.000 / 1.000`;
- classification accuracy: `1.000`;
- classification agreement: `10/10` cases;
- exact violation rule-set agreement: `3/3` violation cases;
- expected evidence file and exact-line agreement: `5/5` finding-bearing cases for each measure;
- deterministic replay: `10/10` cases.

The evidence artifact records the denominators above rather than presenting a bare
`1.000`. It also binds the result to the exact manifest, architecture, baseline tree,
patch set, pinned Core and Guardian revisions, and the two executions performed for
the baseline and for every case (`22` analyzer executions in one evaluation).

Regenerate and verify after an intentional analyzer, fixture or ground-truth change:

```bash
pnpm phase2:update
pnpm verify
```

The complete gate, including all `22` analyzer executions, runs from clean checkouts on both `ubuntu-latest` and `windows-latest` in [GitHub Actions](.github/workflows/evidence.yml). The workflow installs SHA-256-verified package artifacts built from the pinned private Core and Guardian revisions, so it requires no cross-repository credentials.
