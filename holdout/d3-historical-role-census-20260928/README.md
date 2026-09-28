# D3 historical source-role census

Status: **source metadata only; no applicability decision, truth label, tool
prediction or D3 result**.

The 152 unaccepted rule/case/side rows were matched against the exact public
Git trees of 93 selected historical commits. For each row, the verifier counts
regular files matching the source and target group mappings in the pinned
study-defined contract. Both mapped groups have at least one regular path in
all 152 rows: 38 HyperDX, 34 Reactive Resume and 80 Etherpad rule-side rows.
The retained `receipt.json` raw SHA-256 is
`369c4d5a39e021acf5424df2c51de33a736b9058d132d460fc2423a1c4e431a7`.
This is a path-presence observation, not evidence that an upstream maintainer
approved the restriction, that the rule is historically applicable, that a
dependency exists, or that either tool detects it. The contract itself is
still proposed; all 152 applicability decisions remain null.

Inputs are raw-SHA-256 pinned: the proposed applicability ledger
`b9655af035700e12ada897db9c8be3a6d803d17a8a97642a57fca776f746a095`,
upstream commit receipt
`8356a69a4bf8c5c54dbcc092b245fc8e60cfc3996d0791e1a2defcd5049f6b60`,
and study contract
`ace17e11043efbf4bcff9728f2702b0d39725fcd8cda80d6cd1d99eae47c4ca6`.
The verifier checks each commit's root tree and ordered parents against the
receipt, scans its public Git tree offline with lazy fetch disabled, ignores
symlinks, and records counts plus one exemplar file mode/blob per group.

Reproduce from the Benchmark repository with three complete public bare Git
clones (same path order as below):

```text
node scripts/d3-review/historical-role-census.mjs --check holdout/d3-historical-role-census-20260928/receipt.json "<hyperdx-bare-git>" "<reactive-resume-bare-git>" "<etherpad-bare-git>"
```

`--write` creates a new receipt and refuses to overwrite an existing file.
The research decision still requires a versioned rule-activation criterion,
source review by both authors, agreement on Unknown handling, and final method
acceptance before D3 tools are run. Do not convert `both-present` into
`applicable` automatically or use this census to claim scientific validation.
