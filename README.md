# ArchSync Benchmark

Ground-truth datasets and reproducible architecture-change scenarios for ArchSync.

**Phase 1 status:** complete. **Phase 2 analyzer gate:** complete and reproducible. `ground-truth.json` is the canonical benchmark manifest.

## Order Platform lab

The baseline has exactly five components: frontend, gateway, order-service, payment-service and postgres.

`order-platform/ground-truth.json` defines ten labeled changes. Every patch is applied independently to the clean baseline and analyzed by the pinned `@archsync/guardian` package.

The expected distribution is:

- 5 no-impact cases
- 3 architecture violations
- 2 valid architecture evolutions that require approval

## Verify

```bash
pnpm install --frozen-lockfile
pnpm verify
```

Verification checks the Architecture Model through `@archsync/core`, validates the ground-truth distribution, confirms that all ten patches apply cleanly and reruns the Guardian analyzer against all cases.

Expected Phase 2 result:

```text
VALID PHASE 2 BENCHMARK EVIDENCE (10/10 cases, exact source evidence)
```

The committed [`evidence/phase-2-results.json`](evidence/phase-2-results.json) records full-graph and changed-graph node/edge precision/recall/F1, classification accuracy, exact file/line evidence and determinism for every case.

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
pnpm verify
```
