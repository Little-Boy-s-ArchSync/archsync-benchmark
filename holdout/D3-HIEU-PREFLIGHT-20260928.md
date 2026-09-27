# D3 Repository Lead preflight: source coverage and scoring boundary

**Preparation amendment:** Read [method packet v0.1.0](D3-METHOD-PACKET.v0.1.0.md) before labeling. It proposes the module occurrence/edge endpoint, explicit Unknown/scoring scope, resolver freeze and joint acceptance. Conflicting legacy case-classification instructions are historical; no method acceptance is asserted.

Date: 2026-09-28 (Asia/Bangkok). Status: source-backed preflight and method proposal, **not** a completed D3 evaluation or a declaration that Hiếu personally verified each case.

## Decisions already made by Hiếu

The retained conversation records accept the exact 56 primary cases and four context-only cases, a module-only evaluation, two development-associated nonblind author reviews, and four study-defined module rules **conditionally**. See `D3-SCOPE-ACCEPTANCE-20260928.md`, `D3-EVALUATION-UNIT-DECISION-20260928.md`, and `D3-RULE-DECISION-20260928.md`. The latest direction permits choosing a defensible method that strengthens the paper and avoids self-validating claims. It does not supply source labels, an independent reviewer, an accepted full protocol, or tool results.

Source bundle: `cases.json` SHA-256 `44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35`. The original transfer SHA-256 is `0cb702b6df6e684b587f97cc39d64dc1cb7d535c92aff2896962b2d55c26f341`. Do not edit either source.

## Feasibility finding before any official tool run

The table counts **changed paths**, not rule violations, architecture labels, detector predictions, or accuracy. It was derived by checking the 56 accepted cases' `repository` and `changed_paths` against the *source* component prefixes/exact path in `holdout/contracts/v0.1.0/proposal.json`. Tests are included in the raw prefix count and must be excluded before executable-edge scoring.

| Repository | Primary cases | Cases with changed path in a rule's source group | Consequence |
| --- | ---: | ---: | --- |
| HyperDX | 19 | 2 | Only H003 and H009 touch `packages/api/src/models/`; both also touch tests. Most cases cannot introduce a new direct model-to-router import through a changed model file. |
| Reactive Resume | 17 | 17 | All primary changes are in the scoped `apps/server/src` group; source-level import analysis remains possible, but no violation count is known. |
| Etherpad | 20 | 0 | Neither rule's exact source module `src/node/db/DB.ts` is a changed path. Other `src/node/db/*` modules are **not** `DB.ts` under the accepted mapping. |

The zero in Etherpad does not prove zero conformance findings: a resolution or target change outside the file could still affect a resolved edge. It does show that these two rules have weak leverage for measuring **introduced** violations in the chosen change cases. Do not select an easier positive subset after seeing tool outputs, relabel unchanged `DB.ts` as a changed source, or report perfect performance from an all-negative sample.

## Recommended primary question and truth unit

For this D3 population, use a *capability-matched direct module-dependency change* question as the primary comparison, rather than four-way whole-architecture PASS/BLOCK/REVIEW/no-impact accuracy. The truth unit should be a source-bound direct import/re-export occurrence in a production changed file at a pinned base or head commit, resolved to a mapped source module or explicitly classified as unresolved/unsupported. Deduplicate an architectural edge separately by `(side, source group, dependency type, target group)`; retain both occurrence-level and edge-level inventories and do not substitute a single case label for them. A direct module import is not an HTTP/data/cache/message runtime relation.

The operational source-reading and matching proposal is `D3-MODULE-EDGE-TRUTH-RUBRIC.v0.1.0.md`. It remains a candidate until the final method and tool package/configuration are byte-pinned.

Only compare ArchSync and dependency-cruiser for the same frozen constructs: value imports/re-exports and literal `require`/dynamic imports in the same production source set, common module mapping, identical case-side trees, declared TypeScript path/package-export resolution, and the same treatment of type-only/test/generated/unresolved imports. The present Guardian package pinned by Benchmark cannot emit these edges. The opt-in development adapter is **not** an evaluated D3 tool until its behavior, package and config are frozen and its development after authors' D3 exposure is disclosed. If comparable implementation is unavailable, report a capability gap instead of a head-to-head score.

Keep introduced violations of the four conditionally accepted rules as **secondary descriptive findings**, only where historical applicability and the affected base/head edge are source-verified. An unchanged pre-existing violation is not introduced. Without a separately reviewed expected/observed topology census, do not claim architecture evolution or whole-system no-impact. Any four-class labels in the existing worksheet are therefore a provisional legacy form; they must not be scored as the primary module-only endpoint without a versioned rubric/schema amendment.

## Denominators fixed before predictions

1. Preserve all 60 captured cases in the disposition log: 56 primary attempts and four context-only exclusions. Do not turn context-only cases into true negatives. Report the three repositories separately before any pooled total.
2. At case level report captured, eligible, attempted, tool-completed, unsupported, failed, truth-Unknown, and scored. A tool crash or unsupported resolver stays in the attempted denominator. Missing truth never becomes a correct prediction.
3. At occurrence/edge level report the number of source-reviewed truth units, unresolved truth units, predicted units, TP, FP and FN using a frozen exact matching policy. Precision is `TP/(TP+FP)` and recall is `TP/(TP+FN)` only when their denominators are positive; otherwise report `not estimable`, not 100%. Report F1 only when both are estimable.
4. For paired comparison, predeclare the common-capability subset from source/config features **before reading either tool's D3 outputs**. Report both common-subset scores and all-attempted coverage/failures. Do not silently discard cases one tool fails.
5. For secondary rule findings report the number of historically applicable case-sides, introduced positives, no-new-violation cases, Unknown and unsupported. If introduced positives are zero, positive-class recall is not estimable. Do not claim a detector correctly catches violations on the strength of negatives alone.
6. Preserve original Hiếu and Hoàng reviews and hashes before reconciliation; report original agreement with any shared-AI dependence disclosed. This is not an external independent ground truth. No significance test or general population superiority claim is justified by this purposive three-repository, correlated-case preflight alone.

## Historical applicability source audit

The 152 blank rule/case/side rows have 13 distinct anchor byte versions. Twelve versions are present in the retained local transfer's blob files or captured source tree and match their recorded SHA-256. The remaining Reactive Resume historical `docs/contributing/architecture.mdx` version has Git blob `176a933c65f35a0be5d1074a891ebc3640a3282b` and expected SHA-256 `4b8e4bceccfa0cf94dbccfc44bcaae79057155904d0150b751d9e9d41eb5620c`. It is not a raw file in the original transfer. A **separate** source extension was retained at `outputs/D3-Historical-Source-Extension-20260928/`: `source.bytes` matched both pinned Git blob and SHA-256, and `receipt.json` has SHA-256 `36df67ea24f94817816ded6a2892b80fff14478df7959973e241d93d16a095ab`. The source came from [the pinned upstream commit](https://github.com/reactive-resume/reactive-resume/blob/04100aa9efd3ef4332fec9ed9052686fdf3bbeb6/docs/contributing/architecture.mdx). This retrieval is **supplementary**, not a retroactive claim that the original packet contained the bytes, and it does not decide historical rule applicability.

The changed-source-group counts above are reproducible without labels or predictions by running `node scripts/d3-review/coverage.mjs` with six arguments: absolute selected `cases.json` path and SHA-256, absolute original contract JSON path and SHA-256, then absolute conditional selection JSON path and SHA-256. The command verifies the three input hashes and reports exact affected case IDs; its output is `source-feasibility-not-truth`.

The old and new Reactive Resume architecture documents both say to use package exports rather than another workspace's private `src` (line 8) and prohibit cross-workspace private source imports (older file line 71; reference file line 71). The accepted ADR's status/decision is source context, not proof that a study-defined rule was already accepted by upstream on every historical commit. The HyperDX model/router and Etherpad DB/server anchors likewise establish code roles, not automatic rule applicability. Every historical row still needs an explicit applicability decision with commit/path/line evidence; 0/152 decisions are final at this preflight.

## Completion gate owned by the two authors

First, Hiếu and Hoàng must settle a versioned, source-verifiable 152-row applicability ledger and freeze the revised module-edge rubric, matching policy, tool/source/config hashes and descriptive analysis plan. Then they can create two separate 56-case author-associated reviews, preserve the original hashes and AI provenance, reconcile disagreements, run both frozen tools on the same eligible base/head pairs, retain raw outputs, and compute per-repository results. Only the measured and auditable results may enter the manuscript. A source-capture/test pass is not a D3 result.
