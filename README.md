# ArchSync Benchmark

Ground-truth datasets and reproducible architecture-change scenarios for ArchSync.

**Phase 1 status:** complete. `ground-truth.json` is the canonical benchmark manifest.

## Order Platform lab

The baseline has exactly five components: frontend, gateway, order-service, payment-service and postgres.

`order-platform/ground-truth.json` defines ten labeled changes. Every patch must apply independently to the clean baseline repository and is reserved as evidence for the Phase 2 Code Analyzer.

The expected distribution is:

- 5 no-impact cases
- 3 architecture violations
- 2 valid architecture evolutions that require approval

## Verify

```bash
pnpm install --frozen-lockfile
pnpm verify
```

Verification checks the Architecture Model through `@archsync/core`, validates the ground-truth distribution and confirms that all ten patches apply to the baseline without `--recount` or fuzzy repair.
