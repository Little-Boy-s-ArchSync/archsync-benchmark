# D3 ground-truth handbook and tooling

The protocol is proposed, not approved. Do not select final repositories, annotate final truth, run ArchSync, or freeze D3 until EXP-102 and the Lead gates in `PROTOCOL.md` are complete.

## Reviewer rules

- A component is an independently meaningful runtime/deployment unit with a stable repository anchor. A folder alone is not enough.
- A relationship requires observable evidence for source, target, and type. Imports that stay inside a component are negative examples.
- A violation requires an applicable frozen rule and exact evidence; suspicious code without a matching rule is not automatically a violation.
- An evolution is a real topology change that is not forbidden and therefore requires review.
- No-impact means no architecture node/edge/rule change in the scoped case.
- Use Unknown when dynamic construction, wrapper indirection, generated code, missing context, or ambiguous ownership prevents a defensible label. Do not guess.

Positive example: a bound `pg.Pool` call from `frontend/src/database.ts:4` to the approved database is a data relationship; it is a violation only if the frozen rule forbids that edge. Negative example: a local object exposing a `query()` method is not PostgreSQL evidence. Unknown example: a framework wrapper resolves a target solely from runtime dependency injection and the frozen source scope has no binding.

Each item must have exactly two distinct blind reviewer rows, source file/line, confidence 0–1, and `saw_prediction=false`. Use immutable raw JSONL files. Adjudication appends a final row; it never overwrites either reviewer.

The `holdout` validation library provides manifest, URL/commit/scope/tree/license pin materialization, dual-review, immutable adjudication, freeze, exact two-pass replay, metric, error-taxonomy, and scalability/oracle checks at 100% line/branch/function coverage. The materialization API requires separately injected clone and inspect adapters; it never substitutes a mutable branch for the full commit. Templates are intentionally incomplete so they cannot be mistaken for frozen evidence.

`pnpm holdout:verify` verifies this proposed scaffold. `pnpm holdout:gate` is the execution closure gate and intentionally exits non-zero with `HOLDOUT_GATE_INCOMPLETE` until the manifest is human-approved and frozen, contains 2–3 complete non-tuning repository pins, binds adjudicated ground truth, and is accompanied by exact Core/Guardian package pins. The double-run harness independently revalidates every repository pin and frozen artifact before calling the analyzer exactly twice; mismatch, invalid output, or nondeterminism is retained and blocks a deterministic result.

Metric rows carry repository and node/edge/rule units. Pooled and per-repository precision/recall/F1, classification, rule matching, and exact file/line evidence expose numerator and denominator. Root-cause analysis accepts only wrapper, dynamic endpoint, alias, dependency injection, monorepo, generated code, unsupported library, or mapping ambiguity with evidence and an explicit fix/limitation/out-of-scope action. Scalability summaries require 2–3 repositories, at least two environments, and both full and incremental samples per repository; CPU, memory, file/parsed scope, component count, oracle agreement, and failures remain visible.
