# TV3 deterministic technical-preparation matrix

Status: **technical preparation only**. This record does not claim a real repository/provider/participant run, human approval, Security approval, final freeze, independent audit, experimental result or completed research gate.

| Task | Deterministic artifact/check | Current state and external boundary |
| --- | --- | --- |
| EVAL-103 | Repository URL/full commit/scope/tree/license/environment validator plus injected clone/inspect materialization adapter | Implemented and unit-tested; no final repository selected or cloned |
| EVAL-106 | Two-review annotation and adjudication validator preserves original IDs/labels, agreement and human rationale/time | Implemented; templates intentionally incomplete and no human adjudication claimed |
| EVAL-108 | Frozen artifact, repository-pin and Core/Guardian package-bound full replay exactly twice, retaining failures and normalized hashes | Implemented; real D3 execution blocked by freeze and approval |
| EVAL-109 | Pooled and per-repository node/edge/rule precision/recall/F1, classification, rule-match and exact file/line metrics | Implemented with explicit numerator/denominator/value records; no D3 metrics exist |
| EVAL-110 | Required wrapper, dynamic-endpoint, alias, dependency-injection, monorepo, generated-code, unsupported-library and mapping-ambiguity taxonomy | Implemented with evidence and fix/limitation/out-of-scope action; no external errors classified |
| EVAL-112 | Resource/scope scalability schema requires 2–3 repositories, two environments and full+incremental samples; PR-history schema binds repository/commit/tree, non-empty PR range and environment, then replays extraction/analysis twice | Synthetic fixtures exercise the runner; real inputs without human approval fail |
| P4-123 | Blind manual/grounded/LLM rubric includes correctness, completeness, actionability, citation quality, unsupported status and exact timing | Template and validator implemented; no rating or manual baseline claimed |
| Phase 4 closure | Canonical Guardian `RunManifest` root plus nested Benchmark extension, exact prepared-artifact inventory, separated config hashes, citation/repair metrics and eight closure validators | `ai-eval:verify` passes; `ai-eval:gate` fails on provider/freeze/human/Security/statistics/reproduction prerequisites |
| STUDY-104 | Non-empty event payloads, assigned/analyzed n, status counts, explicit estimand denominators, Wilson intervals, observed duration IQR and exact proposed STAT-101 source link | Synthetic logging dry run only; proposed plan is not frozen |
| PILOT-101 | Outside-final-sample report schema captures logging, instructions, annotation comprehension, approval delay, false blocks, recovery, issues and versioned protocol fixes | Empty pending workspace passes; `pilot:gate` fails until a real EVAL-107-gated pilot |
| ABL-101 | Exact five-condition design/config matrix, same frozen design per case, result/code hashes, identical metric replay and no post-outcome changes | Empty pending workspace passes; `ablation:gate` fails until STUDY-103/freeze/execution |
| P6-108 | Eight-gate runtime closure for Phase 5, ADR, quality goals, privacy/Security, GOV-103, high-risk human decision, independent non-synthetic validation and architecture acceptance | Synthetic runtime replay passes; `runtime:gate` fails closed |
| ANALYSIS-101 | Hash-bound raw rows deterministically render normalized CSV, Markdown table, SVG figure and manifest | Committed outputs are visibly synthetic/watermarked; publishable gate rejects empty, unapproved, synthetic or unaudited input |
| REPL-101 | Clean-checkout runbook and exact independent-human audit schema covering install, full verify, negative gates and artifact hashes | Pending template contains no audit; `repl:gate` fails until external reproduction evidence exists |

Normal preparation checks are part of `pnpm verify`. The negative closure commands are `pnpm holdout:gate`, `pnpm pr-history:gate`, `pnpm ai-eval:gate`, `pnpm pilot:gate`, `pnpm ablation:gate`, `pnpm runtime:gate`, `pnpm iac:gate`, `pnpm analysis:gate` and `pnpm repl:gate`; each is expected to exit non-zero in this branch.
