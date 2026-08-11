# Order Platform Benchmark

This lab starts with exactly five architectural components:

1. frontend
2. gateway
3. order-service
4. payment-service
5. postgres

`ground-truth.json` defines ten labeled changes. Patch files are evidence fixtures for the Phase 2 Code Analyzer and are not applied during Phase 1 validation.

Each case includes an owner, explicit graph delta, acceptance criteria, expected classification/finding and source evidence location. The verifier checks that each evidence location falls inside the corresponding patch hunk.

The expected distribution is:

- 5 no-impact cases
- 3 architecture violations
- 2 valid architecture evolutions that require approval

See [`../EVIDENCE.md`](../EVIDENCE.md) for the complete case matrix and reproducibility gates.
