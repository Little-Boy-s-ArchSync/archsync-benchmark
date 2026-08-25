# REPL-101 independent reproduction runbook

Status: **prepared — no independent audit has occurred**.

The auditor must be a human who did not author the evaluated change, records affiliation, and declares no conflict. They work from the reviewed full commit in a new clean checkout; a contributor’s existing worktree is not evidence.

1. Record repository URL, full commit, operating system, Node version and pnpm version. Confirm the checkout is clean and contains no untracked replacement artifact.
2. Run `corepack enable`, then `pnpm install --frozen-lockfile`. Preserve the command log and its SHA-256.
3. Run `pnpm validate:vendor`, then `pnpm verify`. Preserve complete logs, exit codes, and SHA-256 values. Do not remove failed or flaky attempts.
4. Confirm the closure commands fail non-zero for their documented missing external evidence: `pnpm holdout:gate`, `pnpm pr-history:gate`, `pnpm ai-eval:gate`, `pnpm iac:gate`, `pnpm runtime:gate`, `pnpm analysis:gate`, `pnpm pilot:gate`, and `pnpm ablation:gate`. A negative gate unexpectedly passing is a reproduction failure.
5. Recompute SHA-256 values for committed evidence manifests, preparatory analysis artifacts, vendor packages and `vendor/manifest.json`; compare them with the reviewed commit.
6. Create a separate audit report containing commands, environment, all attempts, deviations, hashes and conclusion. Only after every exact check passes, populate a copy of `audit.template.json` with `status: reproduced`, independent human identity, timestamps, per-check evidence hashes and the report hash.
7. Submit the report through an independently reviewable URL bound to the audited commit. Do not edit this repository’s pending template to imply that the audit already happened.

`pnpm repl:verify` validates the empty pending workspace. `pnpm repl:gate` intentionally fails with `REPL_GATE_INCOMPLETE` until an external independent auditor supplies complete evidence.
