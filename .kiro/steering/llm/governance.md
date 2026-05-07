# Governance Steering Pack

Load for roadmap and edition-scope checks.

Generated rules: 41
Estimated tokens: 1521
Domains: governance

## Rules

1. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item.
2. [GOV-0002] Do not create a new package solely for changed artifact timestamps, epochs, node ids, counters, or presentation-only shape.
3. [GOV-0003] Sprint files do not replace work packages.
4. [GOV-0004] docs/ is reserved for end-user or operator-facing documentation. Internal planning, work-package execution, and sprint tracking must not live there.
5. [GOV-0005] The row must be in scope for this repository under ../../edition-matrix.md.
6. [GOV-0006] Broad rows must gain a linked spec or architecture document before active implementation starts.
7. [GOV-0007] Non-trivial implementation changes must be driven by an active work package under work/packages/, unless the immediate work is the roadmap-sharpening step itself.
8. [GOV-0008] Direct work packages must cite the roadmap row they belong to, or the already-approved maintenance/refactor scope that makes them valid without a roadmap change.
9. [GOV-0009] If a broad row is marked complete but still has known guardrail failures in the owner path it claims to close, the row must either name the remaining guardrail package or be downgraded to a capability-only status.
10. [GOV-0010] Keep artifact-derived evidence attached to the current package while the semantic owner, owner boundary, and next required action remain the same.
11. [GOV-0011] The main package owner must reconcile sub-agent results into one package status update rather than creating parallel status narratives.
12. [GOV-0012] Such examples must not define implementation tasks in this repository unless the active package explicitly limits the work to AGPL-owned substrate and excludes paid-only behavior, operator flows, and control surfaces.
13. [GOV-0013] It must identify the latest artifact, representative gate, current representative package, owner boundary, canonical blocker, prior blocker status, subordinate evidence, and next focused proof surface.
14. [GOV-0014] Scenario-driven sprint files must keep a compact current blocker snapshot near the top of the document.
15. [GOV-0015] Residual packages that are not currently being executed must be renamed to todo-... or superseded-... unless they are actively worked with explicitly disjoint owner and file scope.
16. [GOV-0016] Roadmap status must be reconciled with current work-tracker and representative scenario evidence.
17. [GOV-0017] If a package discovers that a completed roadmap row still has an active representative blocker, the package must classify the mismatch as one of: - capability-complete but gate-open; - status-overstated and requiring roadmap correction; - new maintenance concern outside the original row
18. [GOV-0018] Active implementation work begins only from work/packages/active-YYYYMMDD-slug.md or from explicit roadmap-sharpening work that is creating such a package.
19. [GOV-0019] The implementation home remains AGPL repo, or the user explicitly asks for AGPL-scoped preparatory work only.
20. [GOV-0020] The work does not implement paid-only behavior, paid-only operator flows, or paid-only control surfaces in this repository.
21. [GOV-0021] A row may move to active implementation only when the intended behavior is sharp enough to produce tasks without inventing scope locally.
22. [GOV-0022] A roadmap row may be treated as complete only when no active package or active sprint is still fixing the same declared exit criterion.
23. [GOV-0023] For resilience, topology, failure-simulation, production-guarantee, or distributed-harness rows, completion requires named representative evidence, not only focused unit or integration proof.
24. [GOV-0024] A sprint may not close while ../../roadmap.md says a relevant exit criterion is complete and the sprint's current package says that same criterion still fails.
25. [GOV-0025] Split or activate a new package only when the normalized evidence identifies a new owner boundary or materially different next action.
26. [GOV-0026] Assign the implementation sub-agent for the current package only after the previous-package review is clean or the review findings have been fixed.
27. [GOV-0027] Parallel sub-agents are allowed only for independent sidecar questions with disjoint owner or file scope.
28. [GOV-0028] Use work/sprints/ only to group multiple active packages.
29. [GOV-0029] At most one package in a sprint may own the current representative re-entry gate.
30. [GOV-0030] idea -> roadmap sharpening -> work package
31. [GOV-0031] Capture the idea in work/ideas/ as idea-YYYYMMDD-slug.md.
32. [GOV-0032] If the idea changes scope, product direction, or starts a broad new implementation track, sharpen ../../roadmap.md first.
33. [GOV-0033] If the idea is already within approved scope and is bounded enough to execute directly, create a work package in work/packages/.
34. [GOV-0034] Completed work packages are renamed to done-... in the filename, then committed and pushed as a focused package slice before the next slice starts.
35. [GOV-0035] The work remains consistent with ../../roadmap.md and ../../edition-matrix.md.
36. [GOV-0036] Refresh or confirm the snapshot before activating implementation work.
37. [GOV-0037] Use sub-agents in sequence across owner-boundary work: artifact evidence extraction, owner-path mapping, focused proof design, then bounded implementation.
38. [GOV-0038] When starting or continuing a work package, first assign a sub-agent to review the most recently executed package on the same sprint or owner boundary.
39. [GOV-0039] idea -> direct work package
40. [GOV-0040] Architecture documents may mention Pro or Enterprise services only as examples of external consumers of AGPL substrate.
41. [GOV-0041] If that review finds stale status, incomplete closure, missing residual split, guardrail drift, evidence mismatch, or package-snapshot inconsistency, assign the next sub-agent to fix those findings before implementation of the new package starts.
