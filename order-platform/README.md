# Order Platform Benchmark

This lab starts with exactly five architectural components:

1. frontend
2. gateway
3. order-service
4. payment-service
5. postgres

`ground-truth.json` defines 20 labeled changes. Phase 1 validates their declared deltas; Phase 2 applies every patch independently and runs the TypeScript Code Analyzer against the resulting repository.

Each case includes an owner, explicit graph delta, acceptance criteria, expected classification/finding and source evidence location. The verifier checks that each evidence location falls inside the corresponding patch hunk.

The expected distribution is:

- 9 no-impact cases
- 7 architecture violations
- 4 valid architecture evolutions that require approval

HTTP, PostgreSQL, Redis and AMQP dependencies are represented by parseable client usage rather than descriptive comments, so file/line evidence comes from concrete AST nodes. Cases 15–20 additionally exercise `allow`, `require-path`, aliased package imports and valid topology evolution.

See [`../EVIDENCE.md`](../EVIDENCE.md) and [`../evidence/phase-2-results.json`](../evidence/phase-2-results.json) for the complete case matrix, measured metrics and reproducibility gates.
