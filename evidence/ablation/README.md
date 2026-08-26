# ABL-101 evidence workspace

Status: **pending — no ablation run or result is present**.

The frozen design must compare code-only, code+IaC, code+IaC+runtime, evidence-grounded and LLM-only on the identical STUDY-103 subset. It binds truth, task set, scoring, exclusions, parser, prompt and one version/hash per condition before outcomes are visible. Every case must have each condition exactly once; failures stay in the matrix.

Completed evidence must bind the frozen design and STUDY-103 dataset, result/metric hashes and analysis-code commit. Two clean metric replays must produce the same hash, and `post_outcome_changes` must remain empty. `pnpm ablation:verify` validates the honest pending template. `pnpm ablation:gate` intentionally fails with `ABLATION_GATE_INCOMPLETE`; no condition result or approval is fabricated here.
