# External reference fitness for D3

Targeted discovery on 2026-09-27, not an official SLR search or screening run.
The searches inspect public references for reusable architecture truth; they
do not change frozen SLR evidence or claim exhaustive coverage.

## Results inspected

| Source | Evidence inspected | Fitness for the current D3 |
| --- | --- | --- |
| [Comparison of Static Analysis Architecture Recovery Tools for Microservice Applications](https://arxiv.org/html/2412.08352), later [EMSE publication](https://doi.org/10.1007/s10664-025-10686-2) | Sections 2.3-2.5 describe 17 Java/Spring applications, manually created DFD components/connections and extended endpoints, with shared tool inputs and TP/FP/FN accounting. The reference dataset is [microSecEnD](https://github.com/tuhh-softsec/microSecEnD). | Strong methodological reference. Its Java endpoint semantics and subject systems are not the TypeScript service population supported by ArchSync. Published F1 is not a directly subtractable ArchSync performance gap. |
| [ArchAgent: Scalable Legacy Software Architecture Recovery with LLMs](https://arxiv.org/html/2601.13007), preprint | Section 4.1 and the authors' [benchmark repository](https://github.com/panrusheng/arch-eval-benchmark/tree/288ed94cd8a767fdb10a486b9599e650de494e35) describe eight broad architecture-diagram subjects. The README includes Consul with some JS/TS, alongside mainly Go/Java/C++/Python subjects; diagram/document ground truth is a different abstraction. | A potential reference for diagram recovery, not a verified commit-aligned set of TypeScript HTTP/database/import edges. No ground-truth adaptation or ArchSync execution was performed. The preprint's venue/quality status is not asserted. |

No inspected source above supplies a ready-made replacement for the missing
current TypeScript labels. This is a bounded discovery finding, not proof that
no suitable dataset exists anywhere. Neither dataset is rejected based on an
ArchSync score; no ArchSync prediction was inspected.

## Fair quantitative comparison

The intended head-to-head must run both frozen tools on the same selected
source population and the same independently reviewed truth. Report paired
absolute differences in precision/recall/F1 on a nonempty supported unit, with
per-project counts, coverage and failures. Do not subtract F1 values from
different papers with different languages, truth, units and selection methods.

Service extraction and static-module extraction remain separate analyses.
Dependency-cruiser can inform the latter only; it is neither truth nor a
service-extraction baseline. Source inventory counts and software test coverage
cannot replace either study. No numerical superiority claim follows from this
reference-fit note.
