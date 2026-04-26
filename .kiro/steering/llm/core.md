# Core Steering Pack

Always-load compact rules for ownership, safety, scope, and quality baseline.

Generated rules: 48
Estimated tokens: 1600
Domains: architecture, governance, style, testing

## Rules

1. [ARCH-0001] Work packages MUST be one executable concern per file. Do not mix unrelated concerns into one package.
2. [ARCH-0002] Do not create a second status system in headings, directories, or sidecar trackers when the filename already carries status.
3. [ARCH-0003] Close a completed package by renaming its file from active-... to done-.... Do not create a second closure marker inside another tracker to compensate for a stale filename.
4. [ARCH-0004] If a package is not being executed yet, rename it to todo-...; do not leave dormant work in active-....
5. [ARCH-0005] Do not archive package files into a second package-status directory. Package status is carried by the filename; sprint archival is the exception used to keep the live sprint root small and readable.
6. [ARCH-0006] Do not leave known doctrine or system-guideline violations in the affected area behind as "follow-up cleanup" while still closing the package.
7. [ARCH-0007] Do not start a second active package on the same architectural boundary while the first package still has unresolved in-scope residuals.
8. [ARCH-0008] Do not close a scenario-driven package or sprint on “hot path fixed” while the original scenario still fails and the new dominant blocker is unnamed.
9. [ARCH-0009] Do not hide guardrail failures by weakening scripts, expanding allowlists, renaming files out of scan scope, or moving code into test-only paths.
10. [ARCH-0010] No inline domain scalars. Do not write raw string, number, null, or undefined values directly in domain logic, runtime/exported structures, or semantic decisions.
11. [ARCH-0011] Absence is not state. null and undefined must not encode runtime/domain state. Use an explicit named variant instead.
12. [ARCH-0012] Semantic decision boundaries must not be implemented as bags of independent if statements. When multiple signals determine one outcome, the code must:
13. [ARCH-0013] If a scalar or state has no clear owner, stop and define the owner first. Do not inline it “for now”.
14. [ARCH-0014] Do not expose semantic mode through combinable boolean or tri-state option bags. If callers are choosing between policy variants, define one explicit named mode set and make invalid combinations unrepresentable.
15. [ARCH-0015] Do not introduce a second cache, snapshot, field, or helper for the same concern unless the role boundary is explicit and non-overlapping.
16. [ARCH-0016] If it exists, use it. Do not create a second version.
17. [ARCH-0017] If it exists but needs modification, modify the original. Do not fork it.
18. [ARCH-0018] If you are unsure whether something already exists, search first. Do not guess.
19. [ARCH-0019] Callers must not assemble semantic behavior by toggling combinations of booleans that route into overlapping owner behavior.
20. [ARCH-0020] INSERT OR REPLACE or full-row replacement is FORBIDDEN for steady-state lifecycle/status mutation of existing system rows.
21. [ARCH-0021] Non-forced readers MUST NOT perform synchronous multi-table authoritative repair on the hot path.
22. [ARCH-0022] Reader-local caches MUST NOT memoize stale or deferred blocked answers as if they were fresh observations.
23. [ARCH-0023] If they share a row, field subsets must be explicitly partitioned by owner and never reused across concern boundaries.
24. [ARCH-0024] Expiry/recovery sweep logic may act only on rows/fields owned by that sweep owner; it must not rewrite terminal workflow outcomes from another owner.
25. [ARCH-0025] Any status transition to terminal success must be monotonic and must not be rewritten to failure by unrelated expiry logic.
26. [ARCH-0026] Phase completion must remove only temporary scaffolding, never the sole live dissemination, observation, or admission path.
27. [ARCH-0027] Collectors fetch evidence and diagnostics, but do not emit the final admit, ready, or select verdict.
28. [ARCH-0028] Equivalent evidence may clear only the blocker classes explicitly declared by spec. Degraded or cross-plane evidence may explain or defer, but it must not upgrade a blocked entity to admitted or ready.
29. [STYLE-0001] Do not inline domain/runtime scalars when an owner constant or explicit state variant should exist.
30. [STYLE-0002] Do not introduce synonyms for an existing concept.
31. [STYLE-0003] Do not expose semantic policy through combinable booleans when one named mode constant set should exist.
32. [STYLE-0004] Do not leak raw storage or transport field shapes into runtime model names or contracts.
33. [TEST-0001] A package must not be renamed to done-... until its required validation has passed.
34. [TEST-0002] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard.
35. [TEST-0003] Do not close the package on local green proof alone while the reference scenario still fails for a different named reason.
36. [TEST-0004] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
37. [TEST-0005] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
38. [TEST-0006] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
39. [TEST-0007] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
40. [TEST-0008] STOP - Do not accept the test as passing
41. [GOV-0001] Roadmap corrections discovered during implementation should land with the package or sprint closure that discovered them. Do not leave truth repair as an out-of-band memory item.
42. [STYLE-0005] NEVER introduce eslint override comments.
43. [STYLE-0006] Shared domain literals belong in their canonical owner module and must be imported from there.
44. [GOV-0002] Sprint files do not replace work packages.
45. [GOV-0003] Internal planning, work-package execution, and sprint tracking must not live there.
46. [GOV-0004] The row must be in scope for this repository under ../../edition-matrix.md.
47. [GOV-0005] Broad rows must gain a linked spec or architecture document before active implementation starts.
48. [GOV-0006] Non-trivial implementation changes must be driven by an active work package under work/packages/, unless the immediate work is the roadmap-sharpening step itself.
