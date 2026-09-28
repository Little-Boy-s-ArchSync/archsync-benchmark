# D3 historical project-configuration candidate inventory

Status: pinned source metadata, **not** an effective project-configuration
decision, resolver qualification, architecture label, prediction or D3 result.

`inventory.json` was generated from the accepted 56-case raw bundle (SHA-256
`44cc064a3555c90cc20d2a38ab61d67c6af598c1825bf5290cca2269ec801d35`)
and the verified 5,495-file private source transfer (manifest SHA-256
`0cb702b6df6e684b587f97cc39d64dc1cb7d535c92aff2896962b2d55c26f341`).
The retained output SHA-256 is
`fc2911d7357f547400551547c3fd4dc4fe40aaff3818a5b60db2e12677444709`.
The builder rehashed each selected historical commit and every candidate
configuration blob from the retained Git object packet; it never checked out,
executed or followed upstream source.

The inventory has 112 case-sides across 93 unique commit identities, with
2,946 **commit/config rows** (repeated across commits, not 2,946 unique
configurations). Each case-side lists ancestor-directory candidates for its
primary changed source paths; all 112 have at least one candidate. These
counts describe possible configuration files only. A nearby `tsconfig.json`
does not prove it governed the build, and no `extends`, package export map,
workspace resolution, compiler mode, or target dependency has been accepted.
`effective_project_config` remains `null` on every case-side.

## Source-backed review priorities

The retained blobs show one variant of each nearest `tsconfig.json` across
the selected sides for a given repository, but they do not establish that the
same file governed every upstream build or either study tool. Review these
source chains before accepting a resolver policy:

| Repository | Case-sides | Source configuration chain observed in the pinned Git objects | Capability question |
| --- | ---: | --- | --- |
| HyperDX | 38 | `packages/api/tsconfig.json` extends `tsconfig.base.json`; the base declares `module` and `moduleResolution` as `NodeNext`. | Confirm which of the API `tsconfig`, build and Vercel variants governs each tool invocation. |
| Reactive Resume | 34 | `apps/server/tsconfig.json` extends `@reactive-resume/config/tsconfig.base.json`; `packages/config/package.json` names that workspace package and its base config declares `moduleResolution: bundler` and `verbatimModuleSyntax: true`. | Qualify both tools on this compiler mode without D3 source before treating the current fixture (which used `verbatimModuleSyntax: false`) as transferable. Confirm package/workspace resolution. |
| Etherpad | 40 | `src/tsconfig.json` declares `module: CommonJS`. | Qualify the runtime-value and `require` interpretation under this mode before scoring. |

These are source observations and questions, not accepted effective-config
decisions. The corresponding Git blob hashes and commit-to-commit variants are
in `inventory.json`; no source file was executed. In Reactive Resume, the
referenced workspace base config and package manifest occur in all 32 selected
commit identities with one byte variant each. The listed ancestor-config
candidate paths do not themselves resolve `extends`.

The exact filename filter is `tsconfig*.json`, `jsconfig*.json`,
`package.json`, `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, and `turbo.json`.
It is an initial candidate census, not a complete discovery of arbitrary
custom build configuration. Symlink objects would be recorded without
traversal; this selected candidate set contained none.

With the same private packet and raw case bundle, rerun the source-byte check:

```sh
node scripts/d3-review/project-config-preparation.mjs verify /absolute/path/to/cases.json /absolute/path/to/transfer-root holdout/d3-project-config-preparation/inventory.json
```

CI can check the retained inventory's structure and hash but cannot re-read
the private source transfer. Hiếu and Hoàng must separately inspect the
historical configuration content and freeze the applicable project file,
`extends` chain, package/workspace maps and unsupported cases before D3 tool
execution. No absence of a candidate may be treated as a zero-import result.
