# Decisions for Hiếu as Repository Lead

## Status update — 2026-09-28

Hiếu's direct reply, relayed by Hoàng, settles the 56+4 scope, module-only
comparison, two nonblind author reviewers and four conditional rules. See
`HIEU-DECISION-UPDATE-20260928.md`. The detailed items below remain the audit
context for those decisions and the unresolved operational requirements; they
must not be read as a statement that the entire protocol still awaits a
decision.

Record a named decision, current UTC time, rationale and exact artifact hash for each accepted revision. Hoàng's coauthor approval is recorded separately. The received response 0.2.0 is SHA-256 `2d0330b0a27f79425f5071f0f3e4ed6d66f3f11c2e85bf932d00a6ac94cb59af`; its scope proposal is SHA-256 `85ddc693a8ff82064e58788ff491b90b8cf50eb03732e675ea17d0ea276d09f3`.

## 1. Protocol and reviewer design

- Accept or revise a named version of `holdout/PROTOCOL.md` for purposive D3 selection, Git-object input, two author-associated reviewers, independent first-pass handling and claim limits. The old requirement for blind reviewers cannot be asserted for Hoàng after his disclosed D3 output exposure.
- Record Hiếu's own analyzer/benchmark/prompt involvement, source and prediction exposure, and AI assistance. Decide whether an eligible unexposed reviewer will be recruited, or whether a narrower nonblind exploratory analysis replaces any independent/blind accuracy claim. Name the person and the permitted role; do not infer eligibility from a title or account.
- Decide the separation, raw-record preservation, agreement and adjudication procedure for whatever reviewer design is accepted. Any source collection before the decision remains retrospective; do not backdate it as preregistration.

## 2. Exact scope and eligibility

- Accept or revise the row-level `scope-proposal.json` by hash: three pinned repositories, 434 snapshot TS/TSX rows with 322 proposed primary and 112 context, 60 case IDs with 56 proposed primary and four test-only context, and all 214 changed-path occurrences retained. Explicitly accept or change the four context case IDs and Etherpad H019 `tar.json` as required non-TS context.
- Resolve generated/fixture paths used by production, context needed outside the initial scope, and any exception *before* labels or predictions. Preserve a reason for every changed role; version and rehash the selection if revised.
- Complete license/provenance and prior-tuning/leakage decisions for each repository and the exact source representation, including Reactive Resume's mode-120000 symlink. Approval of a row index alone does not prove runner compatibility.

## 3. Architecture contracts

- Freeze a service-level expected runtime model for each repository and relevant base/head, with component identities and supported HTTP/database/cache/message relationships. State whether absence in a model is an actual prohibited/absent relation or merely incomplete knowledge; never treat `relationships: []` as a complete oracle by default.
- Register each rule's ID/version, normative source evidence, relation and direction, repository, effective revisions, exceptions, and applicability to each case. A violation needs an applicable rule. Keep the six proposed module policies separate from service rules.
- For any module comparison, choose the exact adapter/package hash and static ESM semantics (including type-only), file-to-group map, comparator version, matching unit and failure policy. Treat the two Reactive Resume `api-package`/`apps/web/src` rules as uncovered context unless scope is explicitly expanded and pinned before output.

## 4. Unknown and reporting

- Adopt or revise the response's pre-output accounting: selected set `E`; predetermined capability-matched `C`; known truth `K` and Unknown truth `U` within `C`; valid known predictions `V`; correct predictions `X`. Fix tool statuses for valid label, Unknown abstention, failed, incomplete, unsupported and not-run. Do not change `C` based on observed tool success.
- Report `X/|V|` alongside `|V|/|K|`, and conservative `X/|K|`; null for zero denominators. Unknown truth is never a true negative or an Unknown/Unknown success. State the proposed sensitivity bounds `X/|C|` to `(X+U_valid)/|C|` as scenarios, not observed accuracy or a confidence interval.
- Report per repository before descriptive pooling; do not treat 56 cases, 214 paths or repeat runs as independent samples. Node/edge precision and recall require their own source-grounded truth census and matching policy.

These four decisions do not by themselves satisfy the remaining technical runner, exact package/config/environment pin, adjudicated truth and freeze gates. The blank worksheets are not labels or results.
