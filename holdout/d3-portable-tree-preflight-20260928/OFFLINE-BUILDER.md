# Offline D3 source-tree builder preflight

This is a preparation utility, not a frozen D3 execution method or a study result. It was tested on a synthetic Git fixture. No D3 source tree was materialized by the retained test, and neither ArchSync nor dependency-cruiser was run on D3.

`scripts/d3-review/offline-tree-builder.mjs` accepts one repository/commit pair that appears exactly once in the pinned 93-commit upstream receipt, a complete **bare** Git object store, and a new output directory. It verifies the raw commit SHA-256, Git commit object ID, root tree and ordered parents; checks tree path portability; rehashes each regular Git blob; writes exact bytes; then writes a per-file SHA-256 receipt. Symlinks are listed by blob identity but are not created or followed. Submodules and unsupported tree modes fail closed. The output directory must not exist; on failure, any partial output is retained **without a completed receipt** for inspection rather than being silently reused.

A separate `verify` mode requires the receipt's SHA-256 recorded **outside** the output tree. It rejects a changed receipt, altered/missing/extra source files, extra directories, symlinks and hardlinks. A receipt stored only inside its own output tree is not an independent provenance pin. The verifier checks the prepared bytes; it does not endorse project-specific resolver settings or guarantee a safe runtime checkout.

Example after an approved, versioned source-construction policy and explicit local storage allocation:

```text
node scripts/d3-review/offline-tree-builder.mjs REPOSITORY COMMIT BARE_GIT_DIR NEW_OUTPUT_DIR
node scripts/d3-review/offline-tree-builder.mjs verify OUTPUT_DIR EXTERNALLY_RECORDED_RECEIPT_SHA256
```

Do not run this on the D3 source set merely because the builder passes its fixture test. Both authors still need to accept historical rule activation, case/side applicability, effective per-side project configurations and resolver policy, paired tool version/hashes, annotation protocol, and analysis plan. The builder does not install project dependencies, execute upstream code, invoke a study tool, create labels or infer architecture violations. It does not establish that the output is a runnable repository checkout.
