# D3 candidate package preflight

This is a technical receipt for two **candidate** archives, not a D3 tool/configuration freeze, author acceptance, independent validation, or experimental result. Neither archive was run on D3 source. The selected D3 bundle hash is recorded only to connect this preflight to the separately accepted source scope; it is not input to the package verifier.

The local operator packed a clean Guardian source checkout at the commit in `receipt.json` with Node 22.16.0 and pnpm 11.16.0: `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm build`, then `pnpm pack`. A second pack from that clean checkout produced the same archive SHA-256. An isolated installation from the archive (with lifecycle scripts disabled) exported `analyzeModuleDependencies` and `moduleDependencyAnalyzerVersion = 0.1.0-development`. The archive contains `dist/module-dependencies.js`; its `dist/provenance.json` pins the source commit and content hash. This does not show that Guardian and dependency-cruiser resolve D3 modules equivalently.

The comparator archive is the npm registry tarball for `dependency-cruiser@18.3.0`. Its SHA-512 matches `development/common-module-capability/tools/package-lock.json`; its package metadata declares MIT and the archive retains `package/LICENSE`. Redistributing that archive requires retaining its license. The tarballs themselves are **not** committed here; a hash without an available artifact or an independently repeated pack is not complete provenance.

To check retained archives without executing their contents:

```text
node scripts/verify-d3-package-preflight.mjs <absolute Guardian .tgz path> <absolute dependency-cruiser .tgz path>
```

The verifier checks raw size and SHA-256 of both archives, comparator SHA-512 against the committed development lockfile, Guardian's embedded package/provenance identity and module adapter entry, and comparator package/license identity. A reviewer can reproduce the Guardian pack from the pinned source commit and download the comparator from the registry, then compare archives with this command. Reproduction may depend on the stated toolchain and pack format; a mismatch must be retained and investigated, not overwritten.

Before any D3 tool execution, the two authors still need to accept a versioned method: exact tool archives, source-tree construction, eligible resolver subset, group mapping, configuration hashes, handling of unsupported/unresolved/symlink cases, evaluation unit, and metric denominators. The historical `pnpm holdout:gate` is not a valid gate for this nonblind module-only study. The seven-case development fixture has only two shared successful cases, one failed package-export candidate, and four unsupported probes; it is an engineering compatibility check, not D3 accuracy. Do not infer a complete head-to-head comparison or modify D3 labels from this receipt.
