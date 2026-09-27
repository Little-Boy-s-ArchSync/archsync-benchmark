# D3 preflight response and coauthor decision

This folder records the received response 0.2.0 and Hoàng's later approval of
its working choices as a coauthor. The original response is retained under
`response-v0.2.0/`; its `RESPONSE-MANIFEST.json` binds the seven response files.
`COAUTHOR-APPROVAL-20260928.md` records the subsequent conversational decision
with the reviewed document and scope proposal hashes. It is not an approval by
Hiếu or a claim that the D3 execution gate is open.
`EXPOSURE-UPDATE-20260928.md` records Hoàng's subsequent confirmation that he
has seen D3 source and prediction/trace/output. His worksheet cannot serve as
a blind review. `LEAD-DECISIONS-REQUEST.md` lists the exact decisions still
required from Hiếu before official annotation and freeze.

The response proposes 322 primary snapshot files from an inventory of 434,
and 56 primary change cases from an inventory of 60. Four test-only cases
remain context. Etherpad H019 retains `tar.json` as required context. The
exact path and case rows, including context rows, remain in
`response-v0.2.0/scope-proposal.json`.

`first-pass-blank/A-Hieu.csv` and `B-Hoang.csv` are separate, unfilled forms
for the same 56 candidate cases. Every label, confidence, rule and evidence
field is blank; the B form does not establish blind reviewer eligibility.
`build-two-author-worksheets.py` regenerates them from the
manifest-pinned response. The development-only `module-group-normalizer.mjs` checks an
explicit file-to-group map for complete `archsync-static-esm` 0.1.1 graphs; its
synthetic tests do not use D3 source or output.

The response itself identifies work still needed before official labels or
predictions: Lead decisions and factual reviewer declarations, a service-level
expected runtime model and applicable rules, module semantic alignment and
group mapping, and an accepted input bridge for the Reactive Resume Git-object
packet. No D3 ArchSync or baseline execution is included in this PR.

Local checks:

```sh
python3 holdout/d3-preflight/build-two-author-worksheets.py
node --test holdout/d3-preflight/module-group-normalizer.checks.mjs
```

The response packet is source-free. Its scope index contains case IDs, paths
and source hashes; handle future raw annotations and predictions separately.
