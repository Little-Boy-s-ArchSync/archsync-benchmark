# D3 file-edge scoring preflight

Status: **development-only metric implementation candidate**. This code and
its tests use invented fixture paths in `fixture/repo`; they do not load the
selected D3 cases, create truth, run ArchSync or dependency-cruiser on D3, or
report empirical performance. It is not a frozen analysis implementation until
both authors accept an exact method and artifact hash.

`scripts/d3-review/paired-edge-metrics.mjs` computes exact source-file edge
matches on one repository/case/side. It never collapses different file paths
merely because their source and target groups match, and it rejects inconsistent
group annotations for an otherwise matching file edge. Precision, recall and F1
are `null` with reasons when the relevant denominator is zero. A case-pair
result requires complete base and head truth and completed output on both sides
for the named tool. A failure or unsupported output stays attempted but
unscored; truth Unknown remains unscored for both tools. The paired comparison
flag is true only when both tools are scored on that same case. An exact match
with zero truth edges is explicitly marked `empty_truth_case`, not evidence of
positive-class detection.

The function does not decide source eligibility, historical rule applicability,
tool capability, or validity of a submitted review. Those inputs must come from
the separately accepted source and method gates. It also does not aggregate
per-repository results or silently choose a scored subset; those policies must
be frozen and tested before use on D3.

Run the non-D3 regression tests with:

```sh
node --test test/d3-paired-edge-metrics.test.mjs
```
