# D3 selected file-side source preparation

This packet is **source metadata only**, not a review, truth inventory,
method freeze, prediction or D3 result. It mechanically expands the accepted
56-case raw bundle into one row per selected primary path at both base and
head. It preserves missing files as `absent-at-side`; it does not convert an
unread file into a zero-import observation. Context-only paths remain outside
the 56-case review coverage and are not counted as true negatives.

The input must be the original `cases.json` raw bytes with SHA-256
`44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35`.
For every present primary file-side, the builder verifies citable text against
the packet's byte count, SHA-256 and Git blob identity. It emits no source
text, import, label, reviewer identity or AI-generated conclusion. A source
hash proves byte consistency within this transfer, not independent
corroboration of upstream content. The retained source-packet validation and
separate upstream-commit audit provide additional provenance checks; neither
turns this metadata inventory into a source review.

From the Benchmark repository:

```sh
node scripts/d3-review/file-side-preparation.mjs build /absolute/path/to/cases.json /absolute/new/file-side-preparation.json
node scripts/d3-review/file-side-preparation.mjs verify /absolute/path/to/cases.json /absolute/new/file-side-preparation.json
```

`build` refuses to overwrite a destination. The retained inventory is a
starting checklist for Hiếu and Hoàng, who must still agree on the full
resolver/source policy, independently inventory source-bound occurrences and
edges with actual exposure/AI declarations, preserve their original reviews,
and reconcile differences before any D3 tool run or metric. No acceptance or
scientific completeness is inferred from a passing preparation check.

The retained `inventory.json` was generated from that pinned input and
verified against it locally. Its SHA-256 is
`c629044a356c2a83a1a28eb85078f813b227862a088e64476674e1c54f06f68a`.
It records 56 selected cases, 150 primary paths and 300 base/head file-sides:
281 present regular files, 19 absent sides and no primary-path symlinks.
These are source-packet metadata counts, not architecture findings, study
labels or performance results. Because the raw bundle is not committed to
this repository, hosted CI can check the retained inventory's structure and
provenance pins but cannot independently rerun this source-byte derivation.
