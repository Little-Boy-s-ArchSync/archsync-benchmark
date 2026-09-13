# EVAL-103 repository capture: technical validation receipt

Preparation only. EVAL-103 remains open pending approved real selection, reviewed source/license/environment pins and independent repeat clone/hash. No final candidate checkout, annotation, analyzer run, approval or research result was produced.

Baseline: `47a3fd12840838cf246a4ceb5c9df7bb064c241f` (Benchmark PR #10 study-event consistency). The baseline contained an injectable materialization interface with only synthetic clone/inspect stubs in its tests. It had no Git capture implementation. A direct baseline/current comparison additionally confirmed that missing observation retrieval/environment evidence and a `.git/config` scope were accepted by the baseline and rejected by this change.

The implementation fetches only the requested full commit, reads its raw tracked blobs, and produces a source directory without checkout filters, hooks, submodules or repository execution. It binds all tracked bytes and paths, exact license bytes, Git blob IDs/modes, actual retrieval UTC and measured Node/package-manager versions. Inspection rejects unsafe paths, aliases, links, unknown checkouts, missing/extra files and mutated content. The documented Windows mode exception preserves Git mode provenance because Windows lacks POSIX executable bits. The 64 MiB/100,000-file ceiling fails closed.

Validation on macOS with Node `22.16.0` and pnpm `11.16.0`:

| Check | Result |
| --- | --- |
| Focused holdout/capture tests | 20 passed; 100% line/branch/function coverage for both affected libraries |
| Complete unit coverage gate | 136 passed; 100% line/branch/function coverage across every validation library |
| `pnpm verify` | Passed all normal benchmark verification scripts |
| `pnpm demo` | PASS, BLOCK and REVIEW scenarios passed |
| `holdout:gate` | Expected rejection with all six original prerequisite blockers |
| `git diff --check` | Passed |

The integration fixtures create local Git repositories in temporary directories and substitute only the fetch transport. They verify repeated capture of a historical commit after its branch moves, exact binary/CRLF license preservation, scope boundaries, symlink/gitlink rejection, filesystem drift, malformed transport output, byte/file ceilings, environment probing and partial-capture cleanup. No remote candidate repository is contacted. The default subprocess path is checked with an absent local executable, and the default clock is exercised through the local transport. The tests resolve host Git dynamically and use Node for the fixture package-manager probe. Linux and Windows hosted execution remains for CI; local checks do not claim those runs.

Dependency provenance: the attempted frozen offline install lacked `fast-deep-equal@3.1.3` in its store. The adjacent exact-baseline study checkout's `pnpm-lock.yaml` was byte-identical, so its installed dependencies were copied for verification. Relocated pnpm metadata triggered automatic reinstall; `pnpm_config_verify_deps_before_run=false` disabled only that automatic dependency reinstall for `pnpm verify` and `pnpm demo`. All gate scripts ran unchanged. This is not a fresh-install or independent-environment reproduction claim. Package metadata, lockfile, vendor pins, candidate inventory, proposed manifest and proposed statistical source linkage were not changed.

The committed `evidence/unit-coverage.json` binds source/test hashes and measured totals. The coordinating integration pass must regenerate that receipt after combining other benchmark changes and run the normal full gate before publication.
