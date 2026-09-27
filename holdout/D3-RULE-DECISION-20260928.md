# D3 conditional module-rule decision (conversation record)

**Preparation amendment:** Read [method packet v0.1.0](D3-METHOD-PACKET.v0.1.0.md) before labeling. It proposes the module occurrence/edge endpoint, explicit Unknown/scoring scope, resolver freeze and joint acceptance. Conflicting legacy case-classification instructions are historical; no method acceptance is asserted.

Date: 2026-09-28, Asia/Bangkok. The user selected "Chấp nhận 4 rule có điều kiện (đề xuất)" after being shown the specific four study-defined module restrictions, the two out-of-scope Reactive Resume context rules, and the requirement to check historical applicability for every base/head pair. This is a conversation record, not a signature or an upstream maintainer's policy.

Source-backed contract proposal: the retained D3 contract packet's `contract.json`, SHA-256 `efff60a655ebc2eaf9819ddf1e15646c7cfe7f82f0cf8bb44d54464354fe3b8a`. The repository also retains `holdout/contracts/v0.1.0/proposal.json`, SHA-256 `ace17e11043efbf4bcff9728f2702b0d39725fcd8cda80d6cd1d99eae47c4ca6`. These source artifacts remain unchanged and historically marked proposed. Exact accepted-conditional IDs:

| Repository | Candidate rule | Restriction | Status |
| --- | --- | --- | --- |
| HyperDX | `D3-HDX-MOD-001` | API models must not directly depend on API routers | Conditional; per-case historical applicability pending |
| Reactive Resume | `D3-RR-MOD-001` | Server source must not directly depend on private web source | Conditional; per-case historical applicability pending |
| Etherpad | `D3-EP-MOD-001` | `DB.ts` must not directly depend on message handlers | Conditional; per-case historical applicability pending |
| Etherpad | `D3-EP-MOD-002` | `DB.ts` must not directly depend on HTTP hooks | Conditional; per-case historical applicability pending |

`D3-RR-MOD-002` and `D3-RR-MOD-003` remain context only because their `api-package` source modules are outside the selected server changed-file scope. They may not be counted as tested rules or as absence evidence. The four candidate rules are study-defined warning-level restrictions, not upstream defect claims or automatic `BLOCK` decisions. Apply the same versioned rule to base and head, recording `applicable`, `not-applicable` or `unresolved` for every rule/case with source evidence. An unresolved applicability yields Unknown for rule-based violation claims. No rule is retroactively asserted to be upstream policy at a historical revision.

This decision does not accept the entire D3 method, certify the source resolver, create a label, authorize tool execution or support accuracy claims. The module detector gap remains documented in `D3-MODULE-CAPABILITY-AUDIT-20260928.md`.
