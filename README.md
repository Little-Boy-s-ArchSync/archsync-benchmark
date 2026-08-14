# ArchSync Benchmark

Ground-truth datasets and reproducible architecture-change scenarios for ArchSync.

**Phase 1 foundation:** model, graph and conformance contracts are executable. **Phase 2 analyzer gate:** strengthened and reproducible as v0.2. `ground-truth.json` is the canonical end-to-end benchmark manifest.

## Order Platform lab

The baseline has exactly five components: frontend, gateway, order-service, payment-service and postgres.

`order-platform/ground-truth.json` defines 20 labeled changes. Every patch is applied independently to the clean baseline and analyzed by the pinned `@archsync/guardian` package.

The expected distribution is:

- 9 no-impact cases
- 7 architecture violations
- 4 valid architecture evolutions that require approval

The separate `typescript-patterns` corpus contains 40 annotated source signals: 20 positives and 20 hard negatives across `fetch`, PostgreSQL, Redis, AMQP publishing and AMQP consumption. It is a development/regression corpus, not an independent external holdout.

Measured on that same frozen corpus, the pinned analyzer versions produce:

| Analyzer | TP | FP | FN | TN | Precision | Recall | F1 | Specificity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| v0.1 baseline | 18 | 4 | 2 | 16 | 0.818182 | 0.900000 | 0.857143 | 0.800000 |
| v0.2 provenance-aware | 20 | 0 | 0 | 20 | 1.000000 | 1.000000 | 1.000000 | 1.000000 |

These are corpus-bound regression results, not a claim of perfect accuracy on arbitrary TypeScript repositories.

## Verify

```bash
pnpm install --frozen-lockfile
pnpm verify
```

Verification checks the SHA-256 of the vendored packages built from pinned Core and Guardian revisions, validates both datasets, confirms that all 20 patches apply cleanly and reruns the Guardian analyzer against every case and annotated signal. The vendored packages allow the complete gate to run from a clean checkout without access tokens for the private source repositories.

Expected Phase 2 result:

```text
VALID PHASE 2 BENCHMARK EVIDENCE (20/20 cases, exact source evidence)
VALID TYPESCRIPT PATTERN EVIDENCE (20/20 positive, 20/20 hard-negative signals)
```

The committed [`evidence/phase-2-results.json`](evidence/phase-2-results.json) records full-graph and changed-graph node/edge precision/recall/F1, classification agreement (`20/20`), violation rule-set agreement (`7/7`), exact file/line evidence agreement (`11/11` finding-bearing cases), and deterministic replay (`20/20`). [`evidence/typescript-pattern-baseline-v0.1.json`](evidence/typescript-pattern-baseline-v0.1.json) freezes the v0.1 analyzer result on the later challenge corpus; the v0.2 result is stored separately in `evidence/typescript-pattern-results.json`. SHA-256 provenance binds results to their manifests, sources and runtime artifacts. GitHub Actions reruns the complete gate on both `ubuntu-latest` and `windows-latest`.

## Demo from source code

```bash
# Forbidden frontend -> payment-service call with ARCH-001 and file/line evidence
pnpm demo:case06

# Redis topology evolution requiring review
pnpm demo:case09
```

Each command copies the clean baseline to a temporary directory, applies one real patch, scans the resulting TypeScript source and checks the predicted classification against ground truth. The temporary directory is removed afterward.

Every case also carries explicit acceptance criteria and an expected source location. SHA-256 integrity fields bind `ground-truth.json` to the architecture model, baseline source tree and complete patch set. Intentional fixture changes require:

```bash
pnpm integrity:update
pnpm phase2:update
pnpm patterns:update
pnpm verify
```
