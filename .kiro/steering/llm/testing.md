---
scope: testing
status: compiled
always_load: false
source_of_truth: .kiro/steering/ (see llm-pack.config.json sources for testing)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `.kiro/steering/`.

# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

## Rules

### General Guidelines

1. [TEST-0011] A package must not be renamed to done-... until its required validation has passed. _(see testing-guidelines/proof-ladders.md:25)_
2. [TEST-0013] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both. _(see testing-guidelines/regression-policy.md:56)_
3. [TEST-0014] Do not close the second bug with only a local patch if the porous boundary remains unchanged. _(see testing-guidelines/regression-policy.md:110)_
4. [TEST-0015] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline. _(see testing-guidelines/regression-policy.md:166)_
5. [TEST-0019] Do not defer the failure. When the failure is in the touched area, or was surfaced by the runs you chose to perform, you must resolve it before closing the current task. _(see testing-guidelines/regression-policy.md:342)_
6. [TEST-0020] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop. _(see testing-guidelines/regression-policy.md:366)_
7. [TEST-0024] Work must not close while the touched area remains red. _(see testing-guidelines/regression-policy.md:347)_
8. [TEST-0026] The active work package must define the required validation surface. _(see testing-guidelines/proof-ladders.md:22)_
9. [TEST-0028] After the package validation surface is green, perform the required package-closure deep dive across the affected area before closing the package. _(see testing-guidelines/proof-ladders.md:29)_
10. [TEST-0030] When residual closures are split into a follow-on package, the original package must stop short of done-... until the split is explicit in work/ and the original package file names the exact handoff. _(see testing-guidelines/proof-ladders.md:40)_
11. [TEST-0034] The next regression in that area must prove the reduced boundary, not only the immediate symptom. _(see testing-guidelines/regression-policy.md:112)_

### Ownership & Authority Policies

12. [TEST-0001] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row _(see testing-guidelines/fixtures.md:23)_
13. [TEST-0012] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard. _(see testing-guidelines/proof-ladders.md:85)_
14. [TEST-0016] A second analysis step may map the owner path, focused fixture, or affected presentation surface, but must not broaden beyond the current snapshot. _(see testing-guidelines/release-gate.md:211)_
15. [TEST-0029] If a package changes a shared contract, validation must prove not only the runtime owner path, but also the direct status, diagnostics, admin, harness, or reporting surfaces that consume that contract. _(see testing-guidelines/proof-ladders.md:35)_
16. [TEST-0035] If the representative scenario still fails after the fixture and focused tests pass, the package must record whether the fixture contract was correct and what new owner boundary now dominates. _(see testing-guidelines/release-gate.md:47)_
17. [TEST-0036] When the same owner boundary still dominates, validation must update the active package and sprint current blocker snapshot instead of forcing a new package split. _(see testing-guidelines/release-gate.md:54)_
18. [TEST-0037] Repeated crossings of the same owner boundary must escalate to a causal analysis package or autonomous architecture experiment unless the package includes a focused probe for the missing causal edge. _(see testing-guidelines/release-gate.md:81)_
19. [TEST-0038] The evidence block must name the canonical blocker, owner boundary, source artifact paths, prior blocker status, subordinate evidence, and next focused proof surface. _(see testing-guidelines/release-gate.md:147)_
20. [TEST-0040] The final validation note must state whether the representative scenario passed, stayed on the same owner boundary, or migrated to a new named owner boundary. _(see testing-guidelines/release-gate.md:217)_

### Timeouts & Budget Management

21. [TEST-0021] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists. _(see testing-guidelines/regression-policy.md:372)_

### Testing & Harness Guidelines

22. [TEST-0005] It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests. _(see testing-guidelines/fixtures.md:51)_
23. [TEST-0006] It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic. _(see testing-guidelines/fixtures.md:53)_
24. [TEST-0007] It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization paths that only tests call. _(see testing-guidelines/fixtures.md:55)_
25. [TEST-0008] It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up. _(see testing-guidelines/fixtures.md:57)_
26. [TEST-0009] It is FORBIDDEN to: Export internal implementation details solely so tests can reach them. _(see testing-guidelines/fixtures.md:59)_
27. [TEST-0010] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested. _(see testing-guidelines/fixtures.md:91)_
28. [TEST-0018] Do not ignore a failing test. A failing test indicates broken functionality and must be treated as a stop-the-line signal for the touched area. _(see testing-guidelines/regression-policy.md:341)_
29. [TEST-0022] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path. _(see testing-guidelines/fixtures.md:28)_
30. [TEST-0023] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass. _(see testing-guidelines/fixtures.md:42)_
31. [TEST-0025] Tests must never be skipped. _(see testing-guidelines/fixtures.md:33)_
32. [TEST-0027] Tests added during the change must match the package concern rather than an unrelated umbrella scope. _(see testing-guidelines/proof-ladders.md:23)_
33. [TEST-0033] The test must fail with the current code _(see testing-guidelines/regression-policy.md:22)_
34. [TEST-0039] The first delegated or local analysis step must extract the canonical evidence from the latest artifact and compare it with the sprint current blocker snapshot. _(see testing-guidelines/release-gate.md:195)_

### Governance & Scope Controls

35. [TEST-0017] If several real sub-agents are used, give each one a disjoint question or file scope. Do not ask several workers to independently fix the same blocker. _(see testing-guidelines/release-gate.md:215)_
