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

Generated rules: 35
Estimated tokens: 1310
Domains: testing

## Rules

### General Guidelines

1. [TEST-0012] A package must not be renamed to done-... until its required validation has passed.
2. [TEST-0014] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
3. [TEST-0015] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
4. [TEST-0016] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
5. [TEST-0020] DO NOT DEFER - Resolve the failure before closing the current task when it is in the touched area or surfaced by the runs you chose to perform
6. [TEST-0021] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop.
7. [TEST-0025] Work must not close while the touched area remains red.
8. [TEST-0027] The active work package must define the required validation surface.
9. [TEST-0029] After the package validation surface is green, perform the required package-closure deep dive across the affected area before closing the package.
10. [TEST-0031] When residual closures are split into a follow-on package, the original package must stop short of done-... until the split is explicit in work/ and the original package file names the exact handoff.
11. [TEST-0035] The next regression in that area must prove the reduced boundary, not only the immediate symptom.

### Ownership & Authority Policies

12. [TEST-0001] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row
13. [TEST-0013] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard.
14. [TEST-0017] A second analysis step may map the owner path, focused fixture, or affected presentation surface, but must not broaden beyond the current snapshot.
15. [TEST-0030] If a package changes a shared contract, validation must prove not only the runtime owner path, but also the direct status, diagnostics, admin, harness, or reporting surfaces that consume that contract.
16. [TEST-0036] If the representative scenario still fails after the fixture and focused tests pass, the package must record whether the fixture contract was correct and what new owner boundary now dominates.
17. [TEST-0037] When the same owner boundary still dominates, validation must update the active package and sprint current blocker snapshot instead of forcing a new package split.
18. [TEST-0038] Repeated crossings of the same owner boundary must escalate to a causal analysis package or autonomous architecture experiment unless the package includes a focused probe for the missing causal edge.
19. [TEST-0039] The evidence block must name the canonical blocker, owner boundary, source artifact paths, prior blocker status, subordinate evidence, and next focused proof surface.
20. [TEST-0041] The final validation note must state whether the representative scenario passed, stayed on the same owner boundary, or migrated to a new named owner boundary.

### Timeouts & Budget Management

21. [TEST-0022] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists.

### Testing & Harness Guidelines

22. [TEST-0005] It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests.
23. [TEST-0006] It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic.
24. [TEST-0007] It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization paths that only tests call.
25. [TEST-0008] It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up.
26. [TEST-0009] It is FORBIDDEN to: Export internal implementation details solely so tests can reach them.
27. [TEST-0010] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
28. [TEST-0019] DO NOT IGNORE - Failing tests indicate broken functionality
29. [TEST-0023] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path.
30. [TEST-0024] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass.
31. [TEST-0026] Tests must never be skipped.
32. [TEST-0028] Tests added during the change must match the package concern rather than an unrelated umbrella scope.
33. [TEST-0034] The test must fail with the current code
34. [TEST-0040] The first delegated or local analysis step must extract the canonical evidence from the latest artifact and compare it with the sprint current blocker snapshot.

### Governance & Scope Controls

35. [TEST-0018] If several real sub-agents are used, give each one a disjoint question or file scope. Do not ask several workers to independently fix the same blocker.
