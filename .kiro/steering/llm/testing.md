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
Estimated tokens: 1188
Domains: testing

## Rules

### General Guidelines

1. [TEST-0002] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism
2. [TEST-0012] A package must not be renamed to done-... until its required validation has passed.
3. [TEST-0014] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
4. [TEST-0015] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
5. [TEST-0016] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
6. [TEST-0020] DO NOT DEFER - Resolve the failure before closing the current task when it is in the touched area or surfaced by the runs you chose to perform
7. [TEST-0021] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop.
8. [TEST-0025] Work must not close while the touched area remains red.
9. [TEST-0027] The active work package must define the required validation surface.
10. [TEST-0029] After the package validation surface is green, perform the required package-closure deep dive across the affected area before closing the package.
11. [TEST-0031] When residual closures are split into a follow-on package, the original package must stop short of done-... until the split is explicit in work/ and the original package file names the exact handoff.
12. [TEST-0035] The next regression in that area must prove the reduced boundary, not only the immediate symptom.

### Ownership & Authority Policies

13. [TEST-0001] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row
14. [TEST-0013] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard.
15. [TEST-0017] A second analysis step may map the owner path, focused fixture, or affected presentation surface, but must not broaden beyond the current snapshot.
16. [TEST-0030] If a package changes a shared contract, validation must prove not only the runtime owner path, but also the direct status, diagnostics, admin, harness, or reporting surfaces that consume that contract.

### Timeouts & Budget Management

17. [TEST-0022] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists.

### Testing & Harness Guidelines

18. [TEST-0003] Do not comment out tests to avoid running them
19. [TEST-0004] If a test is failing, fix the code or the test - do not skip it
20. [TEST-0005] It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests.
21. [TEST-0006] It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic.
22. [TEST-0007] It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization paths that only tests call.
23. [TEST-0008] It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up.
24. [TEST-0009] It is FORBIDDEN to: Export internal implementation details solely so tests can reach them.
25. [TEST-0010] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
26. [TEST-0011] STOP - Do not accept the test as passing
27. [TEST-0019] DO NOT IGNORE - Failing tests indicate broken functionality
28. [TEST-0023] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path.
29. [TEST-0024] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass.
30. [TEST-0026] Tests must never be skipped.
31. [TEST-0028] Tests added during the change must match the package concern rather than an unrelated umbrella scope.
32. [TEST-0032] New or newly edited source-code files must finish within the per-scope thresholds owned by scripts/check-file-size-thresholds.js (currently src ≤ 800, test ≤ 1500 lines).
33. [TEST-0034] The test must fail with the current code

### Governance & Scope Controls

34. [TEST-0018] If several real sub-agents are used, give each one a disjoint question or file scope. Do not ask several workers to independently fix the same blocker.
35. [TEST-0033] If a package touches an inherited oversized source-code file, it must extract or refactor the touched file until it is within its scope threshold before closure.
