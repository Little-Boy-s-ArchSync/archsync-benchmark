# Order Platform Benchmark

This lab starts with exactly five architectural components:

1. frontend
2. gateway
3. order-service
4. payment-service
5. postgres

`ground-truth.yaml` defines ten labeled changes. Patch files are evidence fixtures for the Phase 2 Code Analyzer and are not applied during Phase 1 validation.

The expected distribution is:

- 5 no-impact cases
- 3 architecture violations
- 2 valid architecture evolutions that require approval

