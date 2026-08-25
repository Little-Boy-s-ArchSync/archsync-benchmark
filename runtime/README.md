# Phase 6 runtime benchmark foundation

Status: **pre-approval technical fixture — not an experimental result**

This directory replays two synthetic OTLP/JSON snapshots over the same fixed 15-minute window: the current order-service path and a Redis candidate. The pipeline validates proposed quality-goal v0.2 objects, privacy-minimizes telemetry, builds deterministic runtime graphs, creates one traceable scorecard row per goal and emits a high-risk `pending` approval record.

Run `pnpm runtime:verify` to reconstruct every normalized artifact and compare exact bytes. `pnpm runtime:update` is the explicit regeneration command after reviewed input or implementation changes.

The fixture intentionally exposes the trade-off instead of choosing a winner: latency and availability improve; estimated cost and component complexity regress; the new Redis edge is not in the declared mapping baseline. There is no composite score and no automated acceptance.

The manifest keeps all approval and experimental claims false. Phase 6 cannot close until Phase 5 is closed, ADR/goal/privacy reviews occur, GOV-103 is satisfied, an actual high-risk decision has a human approver, and an independent experiment replaces this synthetic fixture evidence.
