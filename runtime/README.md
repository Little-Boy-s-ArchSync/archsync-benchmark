# Phase 6 runtime benchmark foundation

Status: **pre-approval technical fixture — not an experimental result**

This directory replays two synthetic OTLP/JSON snapshots over the same fixed
15-minute window: the current order-service path and a Redis candidate. The
pipeline validates proposed quality-goal v0.2 objects, privacy-minimizes
telemetry, builds deterministic runtime graphs, creates one traceable scorecard
row per goal and emits a high-risk `pending` approval record.

Run `pnpm runtime:verify` to reconstruct every normalized artifact and compare
exact bytes. `pnpm runtime:update` is the explicit regeneration command after a
reviewed input or implementation change. `pnpm runtime:gate` always stops with
`P6_AUTHORITATIVE_SOURCE_IMPORTS_REQUIRED` in this preparatory version.

The fixture intentionally exposes the trade-off instead of choosing a winner:
latency and availability improve; estimated cost and component complexity
regress; the new Redis edge is not in the declared mapping baseline. There is
no composite score and no automated acceptance.

## Deliberately impossible-to-close boundary

The committed manifest and closure template are preparation artifacts. Every
manifest claim and authoritative-source-import flag is `false`; every template
gate is `null`. The evaluator returns `PREPARATORY` on every current code path.
Syntactically complete hashes, HTTPS URLs, claimed human decisions, arbitrary
files, local Git repositories, remote-tracking refs or caller-created objects
cannot turn any of the eight gates into an authoritative result.

This is intentional. The benchmark repository does not currently contain
reviewed imports of the authoritative Core/governance validators or their
source artifacts. Treating a local `origin` string or
`refs/remotes/origin/main` as proof of protected remote provenance would create
a trust channel that a caller can reproduce in a disposable repository.

The eight explicit blockers are:

- authoritative Phase 5 verification unavailable;
- authoritative ADR verification unavailable;
- authoritative quality-goal verification unavailable;
- authoritative privacy/security verification unavailable;
- authoritative Core GOV-103 source not imported;
- authoritative high-risk-decision verification unavailable;
- authoritative independent-experiment verification unavailable; and
- authoritative architecture-change verification unavailable.

## Exact Core GOV-103 contract mirror

The non-authoritative shape diagnostic mirrors only Core's flat schema-v1
`GOV-103-r1` contract. The closure record must name `Hiếu` exactly as the human
approver, use accountable role `Repository Lead`, bind exact policy and evidence
commits/digests, use an approved UTC-second decision, point at an immutable
GitHub blob URL for earlier evidence and carry the deterministic
`acceptance_record_sha256` over the ordered flat fields.

The separate approval-evidence shape must bind the same policy and decision,
list `policy_authors`, include the approver's authorization reference and retain
a mandatory `non_author_review` with its own named human, role, authorization,
timestamp and matching policy digest. The non-author reviewer must differ from
the approver and every declared policy author. A shape match and self-digest are
reported only as `record_well_formed`/`approval_evidence_well_formed`;
`acceptance_verified` remains `false` because authoritative Core sources and
bytes are not imported.

There is no nested benchmark GOV-103 record version and no parallel benchmark
authorization registry.

## Non-circular P → E → C sequence for later source import

1. **P — policy:** review and merge the immutable Core policy to protected
   `main`; only the post-merge protected commit and exact policy bytes may be
   referenced.
2. **E — evidence:** in a separate later reviewed change based on P, preserve
   the accountable approval, authorization reference, policy authors and
   independent non-author review; merge E to protected `main` before closure
   work starts.
3. **C — closure:** in a third reviewed change based on P and E, import and
   rehash Core's flat closure record pointing backward to the exact E artifact.
   C cannot authenticate itself and never supplies a future self-reference.

Because squash, rebase and merge commits may all be used, temporary feature
branch hashes are not P or E. A later, separately reviewed source-import pull
request must add authoritative success validators that establish protected
remote provenance and locally preserved Core bytes. Until that work is merged,
Phase 6 cannot close even when all submitted data is syntactically complete.
