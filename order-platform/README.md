# Order Platform Benchmark

This lab starts with exactly five architectural components:

1. frontend
2. gateway
3. order-service
4. payment-service
5. postgres

`ground-truth.json` defines ten labeled changes. Phase 1 validates their declared deltas; Phase 2 applies every patch independently and runs the TypeScript Code Analyzer against the resulting repository.

Each case includes an owner, explicit graph delta, acceptance criteria, expected classification/finding and source evidence location. The verifier checks that each evidence location falls inside the corresponding patch hunk.

The expected distribution is:

- 5 no-impact cases
- 3 architecture violations
- 2 valid architecture evolutions that require approval

PostgreSQL, Redis and AMQP dependencies are represented by parseable client usage rather than descriptive comments, so file/line evidence comes from concrete AST nodes.

See [`../EVIDENCE.md`](../EVIDENCE.md) and [`../evidence/phase-2-results.json`](../evidence/phase-2-results.json) for the complete case matrix, measured metrics and reproducibility gates.
