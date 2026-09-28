# Retained D3 candidate tool archives

These exact package bytes are available for audit and candidate method design.
They do **not** establish a frozen D3 method, independent person-level
reproduction, comparable behavior on historical source, or a research result.

| Archive | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `archsync-guardian-0.3.3.tgz` | 602166 | `7e87d932b0da6b930de9da229f3da439ca1b9ee826d40566fb320692c03b217f` |
| `dependency-cruiser-18.3.0.tgz` | 210709 | `268d21e1e4060717289db373a7f9fcc2c912e6ef9720d8b34575fe1cd965da93` |

Codex, operating in the Hiếu workspace on Windows with Node 22.16.0 and
Corepack pnpm 11.16.0, rebuilt Guardian from a fresh local clone detached at
`e32ef53eeb07bc8c904b6a1e6a8b897d16def820` using frozen-lockfile install
with scripts disabled, build, then `pnpm pack`. The output was byte-identical
to the earlier candidate receipt. The dependency-cruiser archive was freshly
retrieved with `npm pack dependency-cruiser@18.3.0 --ignore-scripts` and matched
the earlier receipt and committed npm lockfile integrity. The existing package
preflight verifier passed over both retained archives. This is a repeated
technical reproduction on this Windows workspace; independence from the
earlier operator or machine is **not established**, and it is not an
independent review by Hoàng or another person. The earlier preflight receipt is retained unchanged
as historical evidence of its original state without archive bytes.

From this repository, verify package size, hashes, embedded Guardian
provenance, entry point, comparator package identity, license, and SHA-512
lockfile integrity without executing either archive:

```sh
node scripts/verify-d3-package-preflight.mjs holdout/d3-package-archives/archsync-guardian-0.3.3.tgz holdout/d3-package-archives/dependency-cruiser-18.3.0.tgz
```

The comparator is MIT-licensed and its archive contains `package/LICENSE`.
The two authors must still accept exact configuration hashes, historical
source-tree construction and a common supported resolver subset before any
D3 tool execution. Every failure or unsupported case must be retained.
