# D3 source-syntax reading aids

Status: **parser-generated hints, not human review, accepted truth, target
resolution, tool prediction or D3 result**.

The builder reads only the accepted raw 56-case source packet (SHA-256
`44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35`).
It first verifies the same 300 file-side source identities as the retained
file-side preparation packet, then parses each present regular source file
with TypeScript 5.9.3 from the already-pinned Guardian package dependency.
No production or top-level package dependency was added. It records syntactic positions of direct
`import`, `export`, `import = require`, dynamic `import()` and calls spelled
`require()`, including computed arguments and parser diagnostics. The literal
quote, line/column, source SHA-256 and Git blob make a hint easy to check
against the original source.

The retained `hints.json` is 1,726,486 bytes, SHA-256
`366a009e17be4fabd143b12963b9adb73dad31da946ca3e070ee95c578ab1c07`.
It records 2,970 syntactic hints from 281 present regular file-sides,
19 absent sides, four parsed files with no hints, and zero parser-diagnostic
files. These are workload counts, **not** dependency, violation or accuracy
counts; the four no-hint files remain unreviewed.

It does **not** determine whether a `require` is shadowed, whether syntax has
runtime effects under the historical compiler mode, which target a specifier
resolves to, or whether an architecture rule is violated. A parsed file with
no hints is **not** a reviewed zero-dependency file. Every row remains
`unreviewed`; empty hints, unsupported extensions and parse diagnostics must
be handled through source review. This parser is a development-associated
reading aid and uses the TypeScript ecosystem also used by Guardian. Both
authors must disclose this shared aid and independently verify their actual
source decisions; no agreement from this packet is independent evidence.

Build or verify with Node 22.16.0 and the frozen pnpm lockfile:

```sh
pnpm install --frozen-lockfile
node scripts/d3-review/source-syntax-hints.mjs build /absolute/path/to/cases.json /absolute/new/hints.json
node scripts/d3-review/source-syntax-hints.mjs verify /absolute/path/to/cases.json /absolute/new/hints.json
```

Hosted CI can check the retained packet and parser tests but cannot rerun
private-source derivation without the uncommitted raw case bundle. The next
scientific step is not to count hints; it is for Hiếu and Hoàng to examine all
300 file-sides, produce separate source-bound occurrence inventories with
actual exposure/AI declarations, and preserve disagreements as Unknown until
reconciled. No ArchSync or dependency-cruiser D3 output was used here.
