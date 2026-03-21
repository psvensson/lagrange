# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Generated rules: 120
Estimated tokens: 3549
Domains: testing

## Rules

1. [TEST-0001] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
2. [TEST-0002] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
3. [TEST-0003] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
4. [TEST-0004] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
5. [TEST-0005] STOP - Do not accept the test as passing
6. [TEST-0006] Do not use higher values like numRuns: 100 or the default
7. [TEST-0007] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism
8. [TEST-0008] Do not comment out tests to avoid running them
9. [TEST-0009] If a test is failing, fix the code or the test - do not skip it
10. [TEST-0010] DO NOT IGNORE - Failing tests indicate broken functionality
11. [TEST-0011] DO NOT DEFER - Fix the issue immediately, even if it appears to be pre-existing
12. [TEST-0012] later transitions preserve owner boundaries and do not recreate or replace the row
13. [TEST-0013] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop.
14. [TEST-0014] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists.
15. [TEST-0015] // ❌ WRONG - Timer never cleared const timeoutPromise = new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), 30000); });
16. [TEST-0016] Do not introduce raw policy-update SQL in other scenario files.
17. [TEST-0017] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass.
18. [TEST-0018] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path.
19. [TEST-0019] The test must fail with the current code
20. [TEST-0020] The next regression in that area must prove the reduced boundary, not only the immediate symptom.
21. [TEST-0021] Tests must never be skipped.
22. [TEST-0022] Settle within fixed window - Cluster must settle before a strict timeout
23. [TEST-0023] Bounded leadership churn - Leader-election events must stay below a partition-count-scaled cap
24. [TEST-0024] No sustained over-target voters - Any partition with voter count above target must return within a bounded duration
25. [TEST-0025] They MUST respect the standard duration limits (2s unit, 30s integration). Use mocked time and injected latency, not real delays.
26. [TEST-0026] All bug fixes MUST be preceded by a failing test that reproduces the bug.
27. [TEST-0027] When the second correctness bug appears at the same architectural boundary in one work cycle, the response must escalate from a local patch to boundary consolidation.
28. [TEST-0028] When a bug involves component ownership, lifecycle persistence, or system-table row mutation, tests must prove that the canonical owner is actually used.
29. [TEST-0029] When adding new tests or changing existing tests for production code, you must also audit the code under test for System Guidelines violations and fix them as part of the same change.
30. [TEST-0030] When a change touches shared metadata reads or writes, tests and CI checks must prove the canonical gateway boundary is still the only runtime ingress.
31. [TEST-0031] When a change touches control-plane progression (dispatch, rebalance, split, admission progression, operation timeout handling), tests must prove deterministic owner-path behavior rather than only eventual convergence.
32. [TEST-0032] When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, queues, or phase-to-runtime handoff, tests must prove continuity and bounded lifetime, not just eventual correctness.
33. [TEST-0033] Timeouts in control-plane logic are hard correctness bugs and must be tested as typed outcomes, not generic strings.
34. [TEST-0034] Distributed scenario code must route tables.table_policies mutations through the canonical owner helper in test/distributed/scenarios/table-distribution-helpers.js.
35. [TEST-0035] Property-based tests using fast-check must limit iterations to keep test runs fast:
36. [TEST-0036] Every test that exists must run and pass.
37. [TEST-0037] Tests must exercise the real production code paths.
38. [TEST-0038] The test suite must prove that production code works — not that a test-friendly fork of it works.
39. [TEST-0039] All test failures and timeouts must be fixed when discovered, even if pre-existing.
40. [TEST-0040] Every test must pass, every time.
41. [TEST-0041] All cluster join changes must include or update a convergence SLO integration test.
42. [TEST-0042] Tests MUST verify this property at the unit and integration layers, not only in the distributed harness.
43. [TEST-0043] Required workflow:
44. [TEST-0044] Required coverage:
45. [TEST-0045] Required behavior:
46. [TEST-0046] Slow-dependency resilience — inject artificial latency into a dependency (mock that resolves after a delay) and prove the component does not fail, corrupt state, or drop work. It may be slower, but it must remain correct.
47. [TEST-0047] The test should capture the exact failure scenario from the bug report
48. [TEST-0048] The failure message should match the reported error
49. [TEST-0049] The fix should make the failing test pass
50. [TEST-0050] Is the current problem a repeated pattern? If so, is there a shared abstraction that should exist but does not?
51. [TEST-0051] This is required so every failure investigation starts from the same structured signal set (phase reason counts, channel metrics, load metrics, consistency mismatches, and cluster-stage timing) instead of ad hoc log sampling.
52. [TEST-0052] No other tests should break
53. [TEST-0053] These tests should be small and targeted.
54. [TEST-0054] npm test -- --grep "should insert"
55. [TEST-0055] FIX - Only after the test fails, implement the fix
56. [TEST-0056] Are multiple recent bugs clustering around the same boundary or component? That may indicate a design-level issue worth addressing instead of patching each symptom individually.
57. [TEST-0057] Missing-row behavior - Add a test proving a missing authoritative row is handled only by the canonical creation owner, not by a local fallback inside an updater.
58. [TEST-0058] Single in-flight reconcile - Add a regression proving only one progression execution can run for a given owner key at a time.
59. [TEST-0059] Acknowledgement-before-advance - For executor-owned boundaries, add a regression proving the owner advances only after durable participant acknowledgement rather than cache timing or elapsed time.
60. [TEST-0060] Add tests that assert timeout classification payloads, not only error text.
61. [TEST-0061] Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic.
62. [TEST-0062] Create alternate constructors, factory methods, or initialization paths that only tests call.
63. [TEST-0063] Run targeted tests only - Don't run the full test suite except at checkpoints
64. [TEST-0064] Focus on relevant tests - Only run tests related to the feature/file being modified
65. [TEST-0065] Run failing tests first - When fixing issues, run only the specific failing test(s)
66. [TEST-0066] Final state converged - No partition may remain above target voter count at the end of the test
67. [TEST-0067] Count only voter-ready partition replicas:
68. [TEST-0068] Distributed baseline runs are allowed to discover bugs, but they are not allowed to be the only place those bugs remain reproducible.
69. [TEST-0069] Only run the complete test suite (npm test) at:
70. [TEST-0070] REPRODUCE - Create a test that demonstrates the bug
71. [TEST-0071] Use minimal setup to isolate the bug
72. [TEST-0072] VERIFY - Run the test to confirm it fails as expected
73. [TEST-0073] Document the root cause in test comments if known
74. [TEST-0074] CONFIRM - Run the test again to verify the fix works
75. [TEST-0075] Bugs are properly understood before fixing
76. [TEST-0076] Fixes are verified to actually solve the problem
77. [TEST-0077] Regressions are prevented by the new test
78. [TEST-0078] The test suite grows to cover real-world failure scenarios
79. [TEST-0079] Search for existing owners - Does a component already own this behavior? Extend or correct it rather than adding a parallel path.
80. [TEST-0080] Search for existing abstractions - Is there a helper, base class, shared utility, or state machine that already handles the general case? Wire into it instead of building a one-off solution.
81. [TEST-0081] Reuse existing test fixtures and helpers - Check the test suite for setup utilities, factory functions, or shared harnesses that already construct the scenario you need.
82. [TEST-0082] Extend existing test files - If a test file already covers the component under test, add the new case there rather than creating a new file.
83. [TEST-0083] Leverage existing assertion patterns - Follow the conventions already established in nearby tests for asserting ownership, lifecycle, and state.
84. [TEST-0084] Would a small refactor at a higher level eliminate the need for the current fix entirely?
85. [TEST-0085] Name the shared boundary explicitly in the failing test or task notes.
86. [TEST-0086] Add a targeted regression for the current symptom.
87. [TEST-0087] Add or update an architectural task/spec that reduces the number of runtime paths across that boundary.
88. [TEST-0088] Injected owner usage - If setup injects an owner such as replicaStateMachine, serviceLifecycleManager, or similar, add a test that fails if the consumer bypasses that owner.
89. [TEST-0089] Create-vs-update separation - Add coverage proving that the initial row creation path uses insert/full-shape semantics and later lifecycle changes use update/partial-shape semantics.
90. [TEST-0090] Primary-key mutation path - For CDC-propagated system tables, add a regression that lifecycle updates are executed with primary-key-addressed writes (query rows, then update by PK) rather than broad predicate updates.
91. [TEST-0091] Identify the production files touched by the new or modified test and their direct owner collaborators.
92. [TEST-0092] Check those files against .kiro/steering/system guidelines.md with special focus on:
93. [TEST-0093] duplicate logic and fallback paths
94. [TEST-0094] single source of truth for state and row-field ownership
95. [TEST-0095] If you find a violation, add a failing regression that captures it and fix the production code before closing the test task.
96. [TEST-0096] For CDC-replicated system-table lifecycle changes, include at least one regression that fails when writes are keyed by non-primary predicates instead of canonical primary key.
97. [TEST-0097] Add or update a regression proving the caller routes through the canonical metadata read or mutation gateway rather than raw helper access.
98. [TEST-0098] If a semantic owner exists above the gateway, add coverage that the caller goes through that owner rather than invoking the gateway directly.
99. [TEST-0099] Add or update a structural guard that fails when non-owner runtime code imports raw system-table mutation helpers or ad-hoc metadata read helpers.
100. [TEST-0100] Prefer import-boundary or API-boundary guards over table-by-table allowlists. The goal is to enforce one path structurally.
101. [TEST-0101] No dual mutation paths - If polling/recovery exists, prove it feeds the same owner queue instead of mutating state via a second direct path.
102. [TEST-0102] Monotonic workflow transitions - Add a regression proving no backward step transitions except explicit terminal recovery transitions.
103. [TEST-0103] Stale-fence rejection - Add a regression proving stale owner claims or stale events cannot overwrite newer transitions.
104. [TEST-0104] Readiness-dimension verification - For topology changes, assert that internal consumers use repairEligible and that routing/benchmark paths use serveEligible.
105. [TEST-0105] Cache observation boundary - Add a regression proving cache divergence emits typed diagnostics/invariant input and that recovery re-enters the same owner queue rather than a direct mutation fallback.
106. [TEST-0106] Phase completion continuity - Prove the needed runtime path still exists after bootstrap, join, or recovery phase completion.
107. [TEST-0107] Restart continuity - Prove subscriptions, watches, or reconnect owners re-establish without requiring manual repair or broad fallback reads.
108. [TEST-0108] Failover continuity - Prove leadership or transport failover does not leave the dissemination path detached or waiting on a dead phase owner.
109. [TEST-0109] Bounded lifetime - Prove listener counts, queue depth, retry registries, and deferred-work maps plateau under repeated cycles.
110. [TEST-0110] Typed handoff diagnostics - If continuity breaks, assert typed owner or handoff diagnostics rather than generic timeout failure.
111. [TEST-0111] Add a deterministic unit or integration regression for the owning component that repeats the triggering cycle enough times to expose accumulation.
112. [TEST-0112] Assert owned resource metrics such as queue depth, subscriber count, in-flight map size, or buffered-event count return to a bounded plateau.
113. [TEST-0113] If the distributed harness reported heap growth, add or refine diagnostics that map the growth to an owning subsystem before rerunning the broad scenario.
114. [TEST-0114] ANALYZE - Identify the root cause:
115. [TEST-0115] Unnecessary setTimeout() or real-time delays in tests
116. [TEST-0116] Uncleaned timers (setTimeout, setInterval) keeping the process alive
117. [TEST-0117] Speculative execution or background intervals not disabled in tests
118. [TEST-0118] Actual performance bugs in the implementation
119. [TEST-0119] FIX - Resolve the issue before proceeding:
120. [TEST-0120] Mock time-based behavior instead of waiting for real time
