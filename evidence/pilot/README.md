# PILOT-101 evidence workspace

Status: **pending — no pilot execution or result is present**.

The future pilot must run at least one PR/instrumentation sequence that is permanently excluded from the final sample. It checks non-empty logging, instruction clarity, annotation comprehension, approval-delay capture, false-block burden and failure recovery. Every missing field or ambiguity becomes a reviewable issue; protocol corrections reference those issues and advance the protocol version before any freeze.

Issue references must identify a recorded run, and each protocol correction must identify a recorded valid issue. An unexercised recovery has outcome `not-triggered`; an exercised recovery has `passed` or `failed`. Contradictory flags and orphan references fail validation without removing the original observation or replacing the missing human/operator evidence.

`report.template.json` deliberately contains no operator, sequence, issue, timing or report hash. `pnpm pilot:verify` validates this honest empty state. `pnpm pilot:gate` intentionally fails with `PILOT_GATE_INCOMPLETE` until EVAL-107 and the human/provider prerequisites permit a real pilot. Pilot observations can improve the protocol but can never support final study claims.
