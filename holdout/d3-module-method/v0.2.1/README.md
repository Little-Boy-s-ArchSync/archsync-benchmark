# D3 comparator technical pair, candidate 0.2.1

This addendum records the jointly confirmed **technical candidate** from
Hiếu's [proposal](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/pull/26#issuecomment-5866290236)
and Hoàng's [confirmation](https://github.com/Little-Boy-s-ArchSync/archsync-benchmark/pull/26#issuecomment-5866842373).
It is not a final method acceptance or permission to run either study tool on
D3. The original v0.2.0 method and the failed/unsupported diagnostic probes
remain byte-pinned and unchanged.

The candidate pairs dependency-cruiser configuration SHA-256 `422d947b...`
**only** with its modes-v3 receipt SHA-256 `adcaf0af...`. The older
`451b1ece...` configuration stays paired with its own historical diagnostic
receipt `83962338...`. The sole semantic configuration addition is
`enhancedResolveOptions.exportsFields: ["exports"]`; this is not proof that
package exports work at any D3 commit. The retained non-D3 source-file-edge
tests support three narrow shared candidates; four probes are unsupported.
Occurrence localization, whole-architecture conformance and D3 accuracy are
not supported by this addendum.

The validator hashes both configurations, both receipt manifests, the modes
profile and the parent method manifest, reruns the retained receipt checks,
and rejects wrong configuration/receipt pairings. It leaves effective
historical project configuration, package/workspace resolution, Guardian
configuration, applicability, two source reviews and final joint method
acceptance open. No D3 prediction or truth label is created.

```text
node scripts/d3-review/config-pair.mjs
```
