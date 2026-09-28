# D3 historical applicability: Hiếu-side candidate v0.2.1

Status: **AI-assisted proposal for joint author review, not a method freeze or
Hiếu's personal source-review declaration**. No D3 tool has been run and no
truth label or final applicability decision is supplied here.

The four conditional D3 restrictions are **study-defined warning-level rules**.
They are an analytic lens chosen by this research group, not assertions that
upstream maintainers approved a rule or that an observed match is an upstream
defect. A historical rule can be studied only if its named source and target
groups retain the intended roles at the exact case-side commit. The same
versioned study rule must be applied to base and head. The current public-Git
role census finds regular mapped paths on both sides of all 152 proposed
rule/case/side rows. This is necessary source context, not sufficient proof
of semantic role continuity or applicability.

## Proposed decision procedure, before predictions

1. For each pinned case-side and rule, verify the exact commit/tree, the
   contract's source and target path mapping, and the relevant source or
   documentation excerpts. Do not substitute the later reference snapshot.
2. Record `applicable` only if both components exist, their historical roles
   match the intended study-defined boundary, the mapping is unambiguous,
   and no documented exception changes that boundary at this commit. Record
   the evidence path, blob, SHA-256 and physical quotation. This does **not**
   require an upstream policy statement for HyperDX or Etherpad: those two
   restrictions were explicitly chosen by the study, and must be reported as
   such. For Reactive Resume, report separately whether the pinned historical
   architecture documentation supports the study adaptation.
3. Record `not-applicable` only when source review establishes that the named
   role or mapping does not exist at this commit, or an accepted exception
   removes this rule from the study scope. A case with no matching import is
   **not** thereby inapplicable; it may be an applicable negative.
4. Record `unresolved` when the role, mapping, exception, or source bytes
   cannot be established. Preserve the reason and attempted evidence.
   Unknown is not a negative or a correct tool prediction.
5. Keep the original source-review records of Hiếu and Hoàng, including their
   actual prior tool-output exposure and shared AI use. Reconcile differences
   without altering originals; unresolved differences remain Unknown. Only a
   later jointly accepted, versioned ledger may replace the null decisions.

Applicability is **separate** from the module-edge truth inventory. An
applicable deny rule may have zero forbidden dependencies. A direct resolved
source-file dependency matching a study rule is a *study-rule finding*, not
automatically a service edge, security vulnerability, `BLOCK`, or upstream
bug. D3's primary capability-matched comparison remains direct module
source-file edges. Rule findings are secondary and descriptive. Report all
attempted case-sides, Unknown and unsupported resolution, zero-denominator
metrics, and per-repository results; never turn the 152/152 role-presence
census into 152 positives or a performance denominator.

This proposal leaves exact resolver/project configuration, package/workspace
semantics, complete source-file coverage, two author reviews, final joint
acceptance, and tool runs open. Hoàng should challenge any criterion that
would overreach a historical commit before the pair signs one byte-pinned
method revision.
