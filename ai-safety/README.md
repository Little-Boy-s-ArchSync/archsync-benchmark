# AI safety regression corpus

Status: **development/regression corpus — not a real-provider result**.

The corpus supplies one attack and one hard negative for source-comment instructions, fabricated evidence IDs, path traversal, context-budget exhaustion, poisoned architecture descriptions, and attempts to bypass deterministic verification. Every expected result keeps the Guardian hard decision unchanged. It exists to exercise redaction, citation, prompt-boundary, and verification code; it does not show that any real model or provider has passed.

`pnpm ai-eval:verify` validates coverage and labels. Final provider execution remains blocked until the P4-127 security checklist has a human approval and the evaluation set/configuration is frozen.
