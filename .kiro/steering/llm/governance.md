# Governance Steering Pack

Load for roadmap and edition-scope checks.

Generated rules: 31
Estimated tokens: 987
Domains: governance

## Rules

1. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item.
2. [GOV-0002] Sprint files do not replace work packages.
3. [GOV-0003] Internal planning, work-package execution, and sprint tracking must not live there.
4. [GOV-0004] The row must be in scope for this repository under ../../edition-matrix.md.
5. [GOV-0005] Broad rows must gain a linked spec or architecture document before active implementation starts.
6. [GOV-0006] Non-trivial implementation changes must be driven by an active work package under work/packages/, unless the immediate work is the roadmap-sharpening step itself.
7. [GOV-0007] Direct work packages must cite the roadmap row they belong to, or the already-approved maintenance/refactor scope that makes them valid without a roadmap change.
8. [GOV-0008] If a package discovers that a completed roadmap row still has an active representative blocker, the package must classify the mismatch as one of:
9. [GOV-0009] If a broad row is marked complete but still has known guardrail failures in the owner path it claims to close, the row must either name the remaining guardrail package or be downgraded to a capability-only status.
10. [GOV-0010] Such examples must not define implementation tasks in this repository unless the active package explicitly limits the work to AGPL-owned substrate and excludes paid-only behavior, operator flows, and control surfaces.
11. [GOV-0011] All non-trivial implementation work must start from a human idea and then follow one of two paths:
12. [GOV-0012] Roadmap status must be reconciled with current work-tracker and representative scenario evidence.
13. [GOV-0013] Active implementation work begins only from work/packages/active-YYYYMMDD-slug.md or from explicit roadmap-sharpening work that is creating such a package.
14. [GOV-0014] The implementation home remains AGPL repo, or the user explicitly asks for AGPL-scoped preparatory work only.
15. [GOV-0015] The work does not implement paid-only behavior, paid-only operator flows, or paid-only control surfaces in this repository.
16. [GOV-0016] A row may move to active implementation only when the intended behavior is sharp enough to produce tasks without inventing scope locally.
17. [GOV-0017] A roadmap row may be treated as complete only when no active package or active sprint is still fixing the same declared exit criterion.
18. [GOV-0018] For resilience, topology, failure-simulation, production-guarantee, or distributed-harness rows, completion requires named representative evidence, not only focused unit or integration proof.
19. [GOV-0019] A sprint may not close while ../../roadmap.md says a relevant exit criterion is complete and the sprint's current package says that same criterion still fails.
20. [GOV-0020] Use work/sprints/ only to group multiple active packages.
21. [GOV-0021] Shared substrate work may happen in this repository only when all of the following are true:
22. [GOV-0022] idea -> roadmap sharpening -> work package
23. [GOV-0023] Capture the idea in work/ideas/ as idea-YYYYMMDD-slug.md.
24. [GOV-0024] If the idea changes scope, product direction, or starts a broad new implementation track, sharpen ../../roadmap.md first.
25. [GOV-0025] If the idea is already within approved scope and is bounded enough to execute directly, create a work package in work/packages/.
26. [GOV-0026] Completed work packages are renamed to done-... in the filename.
27. [GOV-0027] The work remains consistent with ../../roadmap.md and ../../edition-matrix.md.
28. [GOV-0028] status-overstated and requiring roadmap correction
29. [GOV-0029] new maintenance concern outside the original row
30. [GOV-0030] idea -> direct work package
31. [GOV-0031] Architecture documents may mention Pro or Enterprise services only as examples of external consumers of AGPL substrate.
