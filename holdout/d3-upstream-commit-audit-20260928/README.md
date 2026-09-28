# D3 upstream commit cross-check

Status: source-provenance evidence only. This does not create architecture labels, establish independent ground truth, execute either comparison tool, validate the study rules, or make the paper submission-ready.

The accepted selected-case bundle has raw SHA-256 `44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35`. The committed blank applicability checklist binds those cases and contains 152 case/rule/side rows, representing 93 distinct historical commit IDs across HyperDX, Reactive Resume and Etherpad. On 2026-09-28 UTC, each retained raw Git commit object was rehashed and its tree and ordered parent IDs were checked against the corresponding public GitHub Git-commit API response. The result was **93/93 matching commits**, with each exact response retained under `responses/` and its raw SHA-256 in `receipt.json`.

Verify the retained, offline evidence:

```sh
node scripts/d3-review/verify-upstream-commit-provenance.mjs
```

Optionally repeat all 93 read-only GitHub checks with authenticated `gh` access:

```sh
node scripts/d3-review/verify-upstream-commit-provenance.mjs --live
```

The offline verifier enforces the accepted checklist bytes and case-bundle pin, exact 93-commit set, local Git object identity, raw API response hashes, tree and parent agreement, and a closed response inventory. The live mode independently asks GitHub for the same 93 commits; it does not require the response formatting or volatile metadata to remain byte-identical. Both modes compare structural commit identity, not a maintainer's endorsement of our rules or labels. GitHub API responses are retained as observed public data, not cryptographically signed attestations from GitHub. A failed or missing response must be reported, not converted to a match.

This audit strengthens source authenticity but does not resolve the pending v0.2.0 method freeze, 152-row applicability review, two original author inventories, tool configuration, D3 execution or paper results.
