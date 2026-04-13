# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Generated rules: 120
Estimated tokens: 3581
Domains: testing

## Rules

1. [TEST-0001] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
2. [TEST-0002] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
3. [TEST-0003] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
4. [TEST-0004] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
5. [TEST-0005] STOP - Do not accept the test as passing
6. [TEST-0006] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism
7. [TEST-0007] Do not comment out tests to avoid running them
8. [TEST-0008] If a test is failing, fix the code or the test - do not skip it
9. [TEST-0009] DO NOT IGNORE - Failing tests indicate broken functionality
10. [TEST-0010] DO NOT DEFER - Resolve the failure before closing the current task when it is in the touched area or surfaced by the runs you chose to perform
11. [TEST-0011] later transitions preserve owner boundaries and do not recreate or replace the row
12. [TEST-0012] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop.
13. [TEST-0013] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists.
14. [TEST-0014] // ❌ WRONG - Timer never cleared const timeoutPromise = new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), 30000); });
15. [TEST-0015] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass.
16. [TEST-0016] Work must not close while the touched area remains red.
17. [TEST-0017] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path.
18. [TEST-0018] The test must fail with the current code
19. [TEST-0019] The next regression in that area must prove the reduced boundary, not only the immediate symptom.
20. [TEST-0020] Tests must never be skipped.
21. [TEST-0021] They MUST respect the standard duration limits (2s unit, 30s integration). Use mocked time and injected latency, not real delays.
22. [TEST-0022] All bug fixes MUST be preceded by a failing test that reproduces the bug.
23. [TEST-0023] When the second correctness bug appears at the same architectural boundary in one work cycle, the response must escalate from a local patch to boundary consolidation.
24. [TEST-0024] When a bug involves component ownership, lifecycle persistence, or system-table row mutation, tests must prove that the canonical owner is actually used.
25. [TEST-0025] When adding new tests or changing existing tests for production code, you must also audit the code under test for System Guidelines violations and fix them as part of the same change.
26. [TEST-0026] When a change touches shared metadata reads or writes, tests and CI checks must prove the canonical gateway boundary is still the only runtime ingress.
27. [TEST-0027] When a change touches control-plane progression (dispatch, rebalance, split, admission progression, operation timeout handling), tests must prove deterministic owner-path behavior rather than only eventual convergence.
28. [TEST-0028] When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, queues, or phase-to-runtime handoff, tests must prove continuity and bounded lifetime, not just eventual correctness.
29. [TEST-0029] Timeouts in control-plane logic are hard correctness bugs and must be tested as typed outcomes, not generic strings.
30. [TEST-0030] Every test that exists must run and pass.
31. [TEST-0031] Tests must exercise the real production code paths.
32. [TEST-0032] The test suite must prove that production code works — not that a test-friendly fork of it works.
33. [TEST-0033] Failures discovered in the touched area, or discovered by the test runs chosen for the current change, must be resolved before the task closes.
34. [TEST-0034] Tests MUST verify this property at the unit and integration layers, not only in the distributed harness.
35. [TEST-0035] Required workflow:
36. [TEST-0036] Required coverage:
37. [TEST-0037] Required behavior:
38. [TEST-0038] Slow-dependency resilience — inject artificial latency into a dependency (mock that resolves after a delay) and prove the component does not fail, corrupt state, or drop work. It may be slower, but it must remain correct.
39. [TEST-0039] The test should capture the exact failure scenario from the bug report
40. [TEST-0040] The failure message should match the reported error
41. [TEST-0041] The fix should make the failing test pass
42. [TEST-0042] Is the current problem a repeated pattern? If so, is there a shared abstraction that should exist but does not?
43. [TEST-0043] No other tests should break
44. [TEST-0044] These tests should be small and targeted.
45. [TEST-0045] FIX - Only after the test fails, implement the fix
46. [TEST-0046] Are multiple recent bugs clustering around the same boundary or component? That may indicate a design-level issue worth addressing instead of patching each symptom individually.
47. [TEST-0047] Missing-row behavior - Add a test proving a missing authoritative row is handled only by the canonical creation owner, not by a local fallback inside an updater.
48. [TEST-0048] Single in-flight reconcile - Add a regression proving only one progression execution can run for a given owner key at a time.
49. [TEST-0049] Acknowledgement-before-advance - For executor-owned boundaries, add a regression proving the owner advances only after durable participant acknowledgement rather than cache timing or elapsed time.
50. [TEST-0050] Add tests that assert timeout classification payloads, not only error text.
51. [TEST-0051] Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic.
52. [TEST-0052] Create alternate constructors, factory methods, or initialization paths that only tests call.
53. [TEST-0053] Run targeted tests only - Don't run the full test suite except at checkpoints
54. [TEST-0054] Focus on relevant tests - Only run tests related to the feature/file being modified
55. [TEST-0055] Run failing tests first - When fixing issues, run only the specific failing test(s)
56. [TEST-0056] Distributed baseline runs are allowed to discover bugs, but they are not allowed to be the only place those bugs remain reproducible.
57. [TEST-0057] Only run the complete test suite (npm test) at:
58. [TEST-0058] REPRODUCE - Create a test that demonstrates the bug
59. [TEST-0059] Use minimal setup to isolate the bug
60. [TEST-0060] VERIFY - Run the test to confirm it fails as expected
61. [TEST-0061] Document the root cause in test comments if known
62. [TEST-0062] CONFIRM - Run the test again to verify the fix works
63. [TEST-0063] Bugs are properly understood before fixing
64. [TEST-0064] Fixes are verified to actually solve the problem
65. [TEST-0065] Regressions are prevented by the new test
66. [TEST-0066] The test suite grows to cover real-world failure scenarios
67. [TEST-0067] Search for existing owners - Does a component already own this behavior? Extend or correct it rather than adding a parallel path.
68. [TEST-0068] Search for existing abstractions - Is there a helper, base class, shared utility, or state machine that already handles the general case? Wire into it instead of building a one-off solution.
69. [TEST-0069] Reuse existing test fixtures and helpers - Check the test suite for setup utilities, factory functions, or shared harnesses that already construct the scenario you need.
70. [TEST-0070] Extend existing test files - If a test file already covers the component under test, add the new case there rather than creating a new file.
71. [TEST-0071] Leverage existing assertion patterns - Follow the conventions already established in nearby tests for asserting ownership, lifecycle, and state.
72. [TEST-0072] Would a small refactor at a higher level eliminate the need for the current fix entirely?
73. [TEST-0073] Name the shared boundary explicitly in the failing test or task notes.
74. [TEST-0074] Add a targeted regression for the current symptom.
75. [TEST-0075] Add or update an architectural task/spec that reduces the number of runtime paths across that boundary.
76. [TEST-0076] Injected owner usage - If setup injects an owner such as replicaStateMachine, serviceLifecycleManager, or similar, add a test that fails if the consumer bypasses that owner.
77. [TEST-0077] Create-vs-update separation - Add coverage proving that the initial row creation path uses insert/full-shape semantics and later lifecycle changes use update/partial-shape semantics.
78. [TEST-0078] Primary-key mutation path - For CDC-propagated system tables, add a regression that lifecycle updates are executed with primary-key-addressed writes (query rows, then update by PK) rather than broad predicate updates.
79. [TEST-0079] Identify the production files touched by the new or modified test and their direct owner collaborators.
80. [TEST-0080] Check those files against .kiro/steering/system guidelines.md with special focus on:
81. [TEST-0081] duplicate logic and fallback paths
82. [TEST-0082] single source of truth for state and row-field ownership
83. [TEST-0083] If you find a violation, add a failing regression that captures it and fix the production code before closing the test task.
84. [TEST-0084] For CDC-replicated system-table lifecycle changes, include at least one regression that fails when writes are keyed by non-primary predicates instead of canonical primary key.
85. [TEST-0085] Add or update a regression proving the caller routes through the canonical metadata read or mutation gateway rather than raw helper access.
86. [TEST-0086] If a semantic owner exists above the gateway, add coverage that the caller goes through that owner rather than invoking the gateway directly.
87. [TEST-0087] Add or update a structural guard that fails when non-owner runtime code imports raw system-table mutation helpers or ad-hoc metadata read helpers.
88. [TEST-0088] Prefer import-boundary or API-boundary guards over table-by-table allowlists. The goal is to enforce one path structurally.
89. [TEST-0089] No dual mutation paths - If polling/recovery exists, prove it feeds the same owner queue instead of mutating state via a second direct path.
90. [TEST-0090] Monotonic workflow transitions - Add a regression proving no backward step transitions except explicit terminal recovery transitions.
91. [TEST-0091] Stale-fence rejection - Add a regression proving stale owner claims or stale events cannot overwrite newer transitions.
92. [TEST-0092] Readiness-dimension verification - For topology changes, assert that internal consumers use repairEligible and that routing/benchmark paths use serveEligible.
93. [TEST-0093] Cache observation boundary - Add a regression proving cache divergence emits typed diagnostics/invariant input and that recovery re-enters the same owner queue rather than a direct mutation fallback.
94. [TEST-0094] Phase completion continuity - Prove the needed runtime path still exists after bootstrap, join, or recovery phase completion.
95. [TEST-0095] Restart continuity - Prove subscriptions, watches, or reconnect owners re-establish without requiring manual repair or broad fallback reads.
96. [TEST-0096] Failover continuity - Prove leadership or transport failover does not leave the dissemination path detached or waiting on a dead phase owner.
97. [TEST-0097] Bounded lifetime - Prove listener counts, queue depth, retry registries, and deferred-work maps plateau under repeated cycles.
98. [TEST-0098] Typed handoff diagnostics - If continuity breaks, assert typed owner or handoff diagnostics rather than generic timeout failure.
99. [TEST-0099] Add a deterministic unit or integration regression for the owning component that repeats the triggering cycle enough times to expose accumulation.
100. [TEST-0100] Assert owned resource metrics such as queue depth, subscriber count, in-flight map size, or buffered-event count return to a bounded plateau.
101. [TEST-0101] If the distributed harness reported heap growth, add or refine diagnostics that map the growth to an owning subsystem before rerunning the broad scenario.
102. [TEST-0102] ANALYZE - Identify the root cause:
103. [TEST-0103] Unnecessary setTimeout() or real-time delays in tests
104. [TEST-0104] Uncleaned timers (setTimeout, setInterval) keeping the process alive
105. [TEST-0105] Speculative execution or background intervals not disabled in tests
106. [TEST-0106] Actual performance bugs in the implementation
107. [TEST-0107] FIX - Resolve the issue before proceeding:
108. [TEST-0108] Mock time-based behavior instead of waiting for real time
109. [TEST-0109] Ensure all timers are cleared in finally blocks
110. [TEST-0110] Disable background features (speculative execution, intervals) in unit tests
111. [TEST-0111] Use Promise.resolve() or immediate callbacks instead of delays
112. [TEST-0112] Add tests that assert remaining-budget derivation for nested operations rather than fresh full-budget resets.
113. [TEST-0113] Include timeout class and budget context in integration or harness failure artifacts used for diagnosis.
114. [TEST-0114] If a test is no longer relevant, remove it entirely rather than skipping
115. [TEST-0115] Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests.
116. [TEST-0116] Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up.
117. [TEST-0117] Export internal implementation details solely so tests can reach them.
118. [TEST-0118] Extract and inject - Break the hard-to-test dependency out and inject it so tests can supply a controlled substitute.
119. [TEST-0119] Narrow the interface - If a component does too much, split it so each piece is independently testable through its public contract.
120. [TEST-0120] Use the real path - Set up the test to exercise the same code path that production uses, even if setup is more involved.
