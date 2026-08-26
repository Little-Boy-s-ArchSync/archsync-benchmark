# EVAL-112 PR-history preparation

No real repository, pull request, provider, performance result or scalability claim is present. The committed manifest and two PR rows are explicit synthetic fixtures used only to exercise extraction normalization and exact double replay.

The real-system template fails unless repository URL/full commit/tree hash, non-empty PR number range, expected count, OS/Node/pnpm/CPU/memory environment, and human approval are supplied. The approval SHA-256 must equal `createPrHistoryApprovalScopeSha256(manifest)`, binding it to that exact repository, PR range, and environment. Extraction rejects empty, count-mismatched, duplicate, out-of-range, unsafe-path or unpinned rows. The analyzer runs twice; any extraction or normalized-output drift becomes `BLOCKED_NONDETERMINISTIC`, and every replay sets `claims_allowed: false`.

`pnpm pr-history:verify` validates the synthetic preparatory manifest and runner without committing replay metrics. `pnpm pr-history:gate` intentionally rejects the empty real-system template.
