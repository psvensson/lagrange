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

1. [TEST-0002] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism _(see testing-guidelines/fixtures.md:35)_
2. [TEST-0011] A Quest must not report SOLVED until its required validation has passed. _(see testing-guidelines/proof-ladders.md:25)_
3. [TEST-0013] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both. _(see testing-guidelines/regression-policy.md:56)_
4. [TEST-0014] Do not close the second bug with only a local patch if the porous boundary remains unchanged. _(see testing-guidelines/regression-policy.md:110)_
5. [TEST-0015] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline. _(see testing-guidelines/regression-policy.md:166)_
6. [TEST-0016] Do not claim SOLVED on local green proof alone while the reference scenario still fails for a different named reason. _(see testing-guidelines/release-gate.md:28)_
7. [TEST-0018] Do not defer the failure. When the failure is in the touched area, or was surfaced by the runs you chose to perform, you must resolve it before closing the current task. _(see testing-guidelines/regression-policy.md:342)_
8. [TEST-0019] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop. _(see testing-guidelines/regression-policy.md:366)_
9. [TEST-0023] Work must not close while the touched area remains red. _(see testing-guidelines/regression-policy.md:347)_
10. [TEST-0025] The active Quest must define the required validation surface. _(see testing-guidelines/proof-ladders.md:22)_
11. [TEST-0027] After the Quest validation surface is green, perform the required closure deep dive across the affected area before claiming SOLVED. _(see testing-guidelines/proof-ladders.md:28)_
12. [TEST-0028] When residual closure moves to a follow-on Quest or frontier, the original Quest must stop short of SOLVED until the split is explicit in a finding or the current Quest report. _(see testing-guidelines/proof-ladders.md:37)_
13. [TEST-0032] The next regression in that area must prove the reduced boundary, not only the immediate symptom. _(see testing-guidelines/regression-policy.md:112)_

### Ownership & Authority Policies

14. [TEST-0001] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row _(see testing-guidelines/fixtures.md:23)_
15. [TEST-0012] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard. _(see testing-guidelines/proof-ladders.md:83)_
16. [TEST-0033] A scenario-driven Quest that changes runtime meaning, decision meaning, or shared reporting must prove the direct owner path and the consuming status, diagnostics, admin, harness, or report surface. _(see testing-guidelines/release-gate.md:32)_

### Timeouts & Budget Management

17. [TEST-0020] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists. _(see testing-guidelines/regression-policy.md:372)_
18. [TEST-0035] This is a powerful multi-core machine running in-memory tests. There is no valid reason for tests to take more than a couple of seconds. When a test exceeds this limit you must not accept the test as passing; instead, follow this remediation procedure in order: Identify the root cause. Look for unnecessary setTimeout() or real-time delays in tests, uncleaned timers (setTimeout, setInterval) keeping the process alive, speculative execution or background intervals not disabled in tests, or actual performance bugs in the implementation. _(see testing-guidelines/harness.md:58)_

### Testing & Harness Guidelines

19. [TEST-0003] Do not comment out tests to avoid running them _(see testing-guidelines/fixtures.md:36)_
20. [TEST-0004] If a test is failing, fix the code or the test - do not skip it _(see testing-guidelines/fixtures.md:37)_
21. [TEST-0005] It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests. _(see testing-guidelines/fixtures.md:51)_
22. [TEST-0006] It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic. _(see testing-guidelines/fixtures.md:53)_
23. [TEST-0007] It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization paths that only tests call. _(see testing-guidelines/fixtures.md:55)_
24. [TEST-0008] It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up. _(see testing-guidelines/fixtures.md:57)_
25. [TEST-0009] It is FORBIDDEN to: Export internal implementation details solely so tests can reach them. _(see testing-guidelines/fixtures.md:59)_
26. [TEST-0010] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested. _(see testing-guidelines/fixtures.md:91)_
27. [TEST-0017] Do not ignore a failing test. A failing test indicates broken functionality and must be treated as a stop-the-line signal for the touched area. _(see testing-guidelines/regression-policy.md:341)_
28. [TEST-0021] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path. _(see testing-guidelines/fixtures.md:28)_
29. [TEST-0022] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass. _(see testing-guidelines/fixtures.md:42)_
30. [TEST-0024] Tests must never be skipped. _(see testing-guidelines/fixtures.md:33)_
31. [TEST-0026] Tests added during the change must match the Quest concern rather than an unrelated umbrella scope. _(see testing-guidelines/proof-ladders.md:23)_
32. [TEST-0029] New or newly edited source-code files must finish within the per-scope thresholds owned by scripts/check-file-size-thresholds.js (currently src ≤ 800, test ≤ 1500 lines). _(see testing-guidelines/proof-ladders.md:100)_
33. [TEST-0031] The test must fail with the current code _(see testing-guidelines/regression-policy.md:22)_
34. [TEST-0034] Pressure tests MUST respect the standard duration limits (2s unit, 30s integration). Use mocked time and injected latency, not real delays. _(see testing-guidelines/regression-policy.md:318)_

### Governance & Scope Controls

35. [TEST-0030] If a Quest touches an inherited oversized source-code file, it must extract or refactor the touched file until it is within its scope threshold before closure. _(see testing-guidelines/proof-ladders.md:101)_
