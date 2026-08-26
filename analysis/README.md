# ANALYSIS-101 reproducible pipeline

Status: **synthetic preparatory dry run only — no research result**.

`analysis-101.ipynb` is the tracker-requested notebook surface, but deliberately contains no analysis implementation or result. It is a three-cell, unexecuted, output-free index to the governed Node pipeline, its exact inputs, watermarked preparatory outputs, verification command, and publication gate. `pnpm analysis:notebook:verify` pins the notebook structure and rejects metadata/command/path drift, added cells, execution counts, outputs, embedded results, or changed watermarking. Python and Jupyter are not required because `scripts/analysis-pipeline.mjs` remains the canonical executor.

`pnpm analysis:verify` deterministically transforms the hash-bound synthetic fixture into a normalized `results.csv`, Markdown table, accessible SVG figure, and output-hash manifest under `analysis/preparatory/`. Every generated surface is visibly marked “SYNTHETIC … NOT RESEARCH RESULTS”; failed and inconclusive rows remain in the CSV/table. `pnpm analysis:update` is the explicit regeneration command.

The library rejects empty datasets, row/hash mismatches, duplicate run/outcome keys, malformed numerator/denominator/value triples, silent loss of failed rows, approval attached to provisional data, or synthetic data presented as frozen. The publishable path additionally requires a non-synthetic frozen dataset, frozen statistical plan, hash-bound human dataset approval, and a hash-bound reproduction record from an independent human auditor.

`pnpm analysis:gate` intentionally fails with `ANALYSIS_GATE_INCOMPLETE` because `input.template.json` has no frozen data or independent audit. The committed preparatory CSV/table/figure exercise rendering and reproducibility only; their numbers must never appear as experimental estimates or paper results.
