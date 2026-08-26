# Phase 6 runtime benchmark foundation

Status: **pre-approval technical fixture — not an experimental result**

This directory replays two synthetic OTLP/JSON snapshots over the same fixed 15-minute window: the current order-service path and a Redis candidate. The pipeline validates proposed quality-goal v0.2 objects, privacy-minimizes telemetry, builds deterministic runtime graphs, creates one traceable scorecard row per goal and emits a high-risk `pending` approval record.

Run `pnpm runtime:verify` to reconstruct every normalized artifact and compare exact bytes. `pnpm runtime:update` is the explicit regeneration command after reviewed input or implementation changes. `pnpm runtime:gate` is the P6-108 closure check and intentionally fails with `P6_GATE_INCOMPLETE` while any prerequisite remains unresolved.

The fixture intentionally exposes the trade-off instead of choosing a winner: latency and availability improve; estimated cost and component complexity regress; the new Redis edge is not in the declared mapping baseline. There is no composite score and no automated acceptance.

The manifest keeps all approval and experimental claims false. The closure template requires hash-bound Phase 5 and GOV-103 completion, human ADR/quality-goal/privacy-security decisions, a real human decision on the high-risk candidate, independent non-synthetic experimental validation, and a human architecture-change decision. Phase 6 cannot close until all eight gates validate; the synthetic fixture can never satisfy the independent-experiment gate.
