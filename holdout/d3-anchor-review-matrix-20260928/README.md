# D3 historical anchor review matrix

Status: a reading aid, **not** an author review, applicability ledger, truth
inventory, tool prediction, or D3 result.

The source-evidence proposal contains 152 rule/case/base-head rows but many
rows cite the same exact historical Git blobs. `matrix.json` groups rows by
repository, rule, and the full sorted set of cited anchor path/mode/Git-blob/
SHA-256 values. It joins every row to the independently retained non-test
source-path candidate receipt. The grouping reduces duplicate source reading;
it must **not** collapse the 152 individual applicability decisions. Historical
exceptions, project configuration, source roles and mapping can still differ
between commits with identical anchors. Every group and member therefore keeps
its review/decision fields unfilled.

The pinned output has 10 anchor groups covering the 152 rows and 13 distinct
historical anchor blobs. The `matrix.json` SHA-256 is
`e3d1877cc6d70c2a0bf36ca7ef0aa0e63d6788d40244bbcb7d77f698a08377ef`.

The generator is deterministic and pins the exact earlier source-evidence
ledger and production-path candidate receipt. Verify from this repository:

```text
node scripts/d3-review/anchor-review-matrix.mjs --check holdout/d3-anchor-review-matrix-20260928/matrix.json
```

Hiếu and Hoàng should independently read the cited historical source and
documentation under the proposed v0.2.1 procedure, record any case-side
exception, then retain their original per-row reviews before reconciliation.
This shared AI-prepared matrix is not blind and cannot be counted as two
independent reviewer decisions. No D3 tool is authorized to run by this file.
