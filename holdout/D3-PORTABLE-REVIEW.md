# D3 portable source review support

Status: technical preparation, not a scientific approval or a frozen D3 run.

This append-only follow-up addresses the technical findings in Hoang's
2026-09-27 review. The updated review file has SHA-256
`2d7103d43223504992a69355dcc4db6beb1791bdd0ff9acacf3d1c01f46a56e3`.
Its updated checksum statement supersedes the earlier "checksum unavailable"
statement. No historical packet, label, receipt, or approval is overwritten.

## 1. Original ZIP and a separate review copy

The original ZIP SHA-256 is
`011e74c4912f5a20c713bcfa0e77f10450916227659ba31e0566f8c1635fc91b`.
The transfer manifest SHA-256 is
`0cb702b6df6e684b587f97cc39d64dc1cb7d535c92aff2896962b2d55c26f341`.

Keep the original ZIP and extraction unchanged. This command validates every
file against the separately supplied transfer digest, refuses aliases/links,
extra or changed files, existing destinations and overlapping directories, and
creates a NEW copy. Only the capture manifests determine regular source modes.
All original bytes, including historical receipts and locations, stay identical.
The complete packet has 71 declared executables: HyperDX 18, Etherpad 53.
The copy also retains empty directories, including bare Git `refs/`, needed
by the unchanged history verifier. Directory layout is copied and compared,
not described as cryptographically bound by the file-only transfer manifest.

From the repository or supplemental kit, using a trusted Node >=22:

```sh
node scripts/d3-source-review/cli.mjs restore-copy "/absolute/original-extraction" "/absolute/new-review-copy" 0cb702b6df6e684b587f97cc39d64dc1cb7d535c92aff2896962b2d55c26f341
node "/absolute/new-review-copy/VERIFY-D3.mjs" --git "$(command -v git)"
```

On Windows replace the paths and Git argument with `(Get-Command git).Source`.
POSIX hosts explicitly check 0755/0644 after writing the new copy. Windows
records `posix_modes_verified=false`; it must not be reported as a POSIX test.
Mode restoration is not removal of the mode check. The unchanged original full
checker must still pass on the new copy. No project script or analyzer runs.

Use a private, exclusively controlled directory. This process is not a sandbox
against concurrent modification by another process. Failure may leave an
incomplete NEW copy; keep its error and retry into a different new directory.
Never repair an original by editing its manifest or replacing its hash.

## 2. Reactive Resume: source-bound object workflow

The old regular-file capture/inspect adapter remains unchanged and still rejects
Git mode 120000. It is NOT used with, or claimed to accept, the object packet.

`openObjectSource` is a separate read-only path for that representation. It
requires the independently retained object-manifest SHA-256, validates the
selection/commit/root-tree/recursive-tree/listing/blob chain and complete object
inventory, checks the bound license bytes, and snapshots verified blobs in memory.
`readRegularFile` returns copies of verified regular bytes. `inspectLink` returns
the original link mode and target bytes with `dereferenced=false`. It never
resolves, follows, executes, or converts a link into a regular source file.

```sh
node scripts/d3-source-review/cli.mjs verify-object "/absolute/new-review-copy/data/d3-reactive-resume-objects-20260927-01" 7868ba025ebf1ddca3238458fc9170b4edcde905715a1304bfa4e2c1feda6e55
```

All 1,444 regular files are read through the API; the one retained `CLAUDE.md`
link is inspected only as link metadata/bytes. No upstream instructions are
executed. This checks technical readability, not architecture interpretation.

The companion `verifyObjectAnnotationLocations(source, rows)` binds original
rows to the exact verified source handle, repository, commit, scoped regular
file, existing UTF-8 line and original row serialization hash. It rejects link
evidence, wrong commits, nonexisting/out-of-scope files and binary/invalid text.
It preserves the existing two-reviewer structural checks. As before, distinct
IDs and booleans do not authenticate people, independence, blinding or truth.
Only controlled tests use synthetic rows; no real D3 labels have been produced.

The source-bound review workflow does not itself supply an analyzer filesystem
or approve execution. A reviewed runner must explicitly use a compatible input
representation and bind its source population before any frozen D3 run. Do not
silently drop the link or claim the existing adapter compatibility problem has
been solved for official execution merely because the read-only API passes.

## 3. Retained boundaries

- Source collection, technical repeatability and scientific validity are separate.
- The 60 change candidates retain overlapping revisions/files and all failures.
- Role/exposure declarations, second reviewer, final scope/rubric/rules, Unknown
  analysis, protocol approval, frozen truth/tool pins and execution gates remain.
- Keep Hoang's development-associated role explicit; technical review is not
  independent scientific labeling.
- Local engineering tests and configured library coverage are not D3 accuracy.
- Frozen D1/D2/P3 evidence and the proposed official protocol are unchanged.

The new helpers live outside the legacy `scripts/lib/*.mjs` coverage target.
They have focused regression tests and real-packet integration checks; the
existing 100% library gate is not presented as coverage of these new helpers.
Run focused tests with `node --test test/d3-portable-review.test.mjs` and retain
exact host versions and logs. macOS-specific validation requires the reviewer
to run the supplied commands on macOS; a Linux result is not a macOS result.
