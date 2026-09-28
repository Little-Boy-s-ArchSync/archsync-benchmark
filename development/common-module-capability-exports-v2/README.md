# Non-D3 module-capability fixture: package exports revision

Status: **candidate development fixture only**. Version `non-d3-common-capability-exports-v2` leaves the original fixture, configuration and receipt in `development/common-module-capability/` unchanged. No D3 source, label, prediction or research metric is used.

The one configuration change is `enhancedResolveOptions.exportsFields = ["exports"]` for dependency-cruiser 18.3.0. Its documented default leaves package export fields disabled. The same seven developer-authored fixtures are replayed with their existing source bytes and Guardian adapter; only the `self-package-export` expected shared outcome is revised from false to true. This revision is justified by a real tool rerun, not by a D3 observation. The four unsupported probes remain unsupported and may not be converted into true negatives or scored successes.

The capture materializes a fresh temporary overlay from the v1 files, applies only the configuration and expected-outcome revision, runs both real tools, retains stdout/stderr and process metadata for all seven cases, and verifies the raw receipt before returning. The v1 receipt remains historical evidence. Node 22.16.0, dependency-cruiser 18.3.0 and TypeScript 5.9.3 are pinned. To reproduce from a clean Benchmark checkout:

```sh
npm ci --prefix development/common-module-capability/tools --ignore-scripts --no-audit --no-fund
node development/common-module-capability-exports-v2/runner.mjs capture /absolute/new/receipt-directory
node development/common-module-capability-exports-v2/runner.mjs verify
```

The last command verifies the committed v2 receipt offline; it does not invoke either analysis tool. The capture command rejects an existing output directory. Archive the new receipt separately instead of replacing v1. The retained outputs can qualify only the narrowly declared cross-group source-file-pair task on these synthetic developer fixtures. They do not establish resolver parity for D3 repositories, occurrence-level comparator positions, a jointly frozen method, independent ground truth, or D3 accuracy.

`profile.json` pins the unchanged historical v1 manifest, the v2 configuration and overlay-fixture hashes, and the exact committed v2 manifest. A new capture is expected to have a different manifest hash because it records a new run; compare its normalized results and raw inputs, then version a new profile rather than overwriting this receipt.
