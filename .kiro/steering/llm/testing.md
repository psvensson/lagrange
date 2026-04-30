# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Generated rules: 120
Estimated tokens: 4245
Domains: testing

## Rules

1. [TEST-0001] A package must not be renamed to done-... until its required validation has passed.
2. [TEST-0002] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard.
3. [TEST-0003] Do not close the package on local green proof alone while the reference scenario still fails for a different named reason.
4. [TEST-0004] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
5. [TEST-0005] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
6. [TEST-0006] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
7. [TEST-0007] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
8. [TEST-0008] STOP - Do not accept the test as passing
9. [TEST-0009] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism
10. [TEST-0010] Do not comment out tests to avoid running them
11. [TEST-0011] If a test is failing, fix the code or the test - do not skip it
12. [TEST-0012] DO NOT IGNORE - Failing tests indicate broken functionality
13. [TEST-0013] DO NOT DEFER - Resolve the failure before closing the current task when it is in the touched area or surfaced by the runs you chose to perform
14. [TEST-0014] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row
15. [TEST-0015] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop.
16. [TEST-0016] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists.
17. [TEST-0017] // ❌ WRONG - Timer never cleared const timeoutPromise = new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), 30000); });
18. [TEST-0018] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass.
19. [TEST-0019] Work must not close while the touched area remains red.
20. [TEST-0020] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path.
21. [TEST-0021] The active work package must define the required validation surface.
22. [TEST-0022] Tests added during the change must match the package concern rather than an unrelated umbrella scope.
23. [TEST-0023] After the package validation surface is green, perform the required package-closure deep dive across the affected area before closing the package.
24. [TEST-0024] If a package changes a shared contract, validation must prove not only the runtime owner path, but also the direct status, diagnostics, admin, harness, or reporting surfaces that consume that contract.
25. [TEST-0025] When residual closures are split into a follow-on package, the original package must stop short of done-... until the split is explicit in work/ and the original package file names the exact handoff.
26. [TEST-0026] If the representative scenario still fails after the fixture and focused tests pass, the package must record whether the fixture contract was correct and what new owner boundary now dominates.
27. [TEST-0027] The test must fail with the current code
28. [TEST-0028] Tests must never be skipped.
29. [TEST-0029] The next regression in that area must prove the reduced boundary, not only the immediate symptom.
30. [TEST-0030] They MUST respect the standard duration limits (2s unit, 30s integration). Use mocked time and injected latency, not real delays.
31. [TEST-0031] Test closure and package closure both require the final affected-area deep dive required by .kiro/steering/system guidelines.md.
32. [TEST-0032] Every non-trivial package must prove that it did not increase architecture drift while fixing behavior.
33. [TEST-0033] When a package exists because a distributed, integration, load, or scenario failure exposed a blocker, validation must prove not only the local fix but also what the original scenario does next.
34. [TEST-0034] All bug fixes MUST be preceded by a failing test that reproduces the bug.
35. [TEST-0035] When the second correctness bug appears at the same architectural boundary in one work cycle, the response must escalate from a local patch to boundary consolidation.
36. [TEST-0036] When a bug involves component ownership, lifecycle persistence, or system-table row mutation, tests must prove that the canonical owner is actually used.
37. [TEST-0037] When adding new tests or changing existing tests for production code, you must also audit the code under test for System Guidelines violations and fix them as part of the same change.
38. [TEST-0038] When a change touches shared metadata reads or writes, tests and CI checks must prove the canonical gateway boundary is still the only runtime ingress.
39. [TEST-0039] When a change touches control-plane progression (dispatch, rebalance, split, admission progression, operation timeout handling), tests must prove deterministic owner-path behavior rather than only eventual convergence.
40. [TEST-0040] When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, queues, or phase-to-runtime handoff, tests must prove continuity and bounded lifetime, not just eventual correctness.
41. [TEST-0041] Timeouts in control-plane logic are hard correctness bugs and must be tested as typed outcomes, not generic strings.
42. [TEST-0042] Every test that exists must run and pass.
43. [TEST-0043] Tests must exercise the real production code paths.
44. [TEST-0044] The test suite must prove that production code works — not that a test-friendly fork of it works.
45. [TEST-0045] Failures discovered in the touched area, or discovered by the test runs chosen for the current change, must be resolved before the task closes.
46. [TEST-0046] When an owner path is intentionally unresolved under pressure, publication establishment, or recovery completion, tests must prove the caller receives a structured deferred outcome rather than ambiguous absence.
47. [TEST-0047] When a change touches startup, readiness, admin snapshot, service discovery, or another shared control-plane truth surface, tests must prove readers observe and schedule repair instead of repairing inline.
48. [TEST-0048] Tests MUST verify this property at the unit and integration layers, not only in the distributed harness.
49. [TEST-0049] Existing violations in touched files must be fixed when they are part of the same semantic boundary. If they are genuinely outside scope, the package must name the excluded boundary and link a follow-on package before closure.
50. [TEST-0050] If the package has already recorded two material blocker migrations, the next validation cycle must start from a replayable owner-decision fixture or the narrowest blocker probe that represents the current dominant owner.
51. [TEST-0051] A scenario-driven package that changes runtime meaning, decision meaning, or presentation meaning must prove the current blocker in this order: owner-decision fixture or blocker probe, focused owner tests, affected presentation tests, then the representative scenario.
52. [TEST-0052] Presentation tests are required when failure bundles, triage summaries, admin summaries, active gates, or report writers consume the changed contract. A green owner test alone is not sufficient if presentation can still classify the same evidence under a different blocker.
53. [TEST-0053] Slow-dependency resilience — inject artificial latency into a dependency (mock that resolves after a delay) and prove the component does not fail, corrupt state, or drop work. It may be slower, but it must remain correct.
54. [TEST-0054] The test should capture the exact failure scenario from the bug report
55. [TEST-0055] The failure message should match the reported error
56. [TEST-0056] The fix should make the failing test pass
57. [TEST-0057] Is the current problem a repeated pattern? If so, is there a shared abstraction that should exist but does not?
58. [TEST-0058] When a bug depends on stale cache truth, stale routing, delayed authoritative visibility, no-handler witnesses, or other cross-time evidence races, the regression must replay the witness order that triggered the bug rather than asserting only the final steady state.
59. [TEST-0059] For control-plane, readiness, topology, and other shared distributed-boundary work, the normal debugging loop must follow one validation ladder instead of jumping straight from unit failures to repeated full distributed reruns.
60. [TEST-0060] No other tests should break
61. [TEST-0061] All non-trivial implementation work should have validation owned by its active work package.
62. [TEST-0062] These tests should be small and targeted.
63. [TEST-0063] Work packages should list their targeted owner tests, the relevant boundary-transition scenarios, and the final distributed checkpoint command in that same order.
64. [TEST-0064] Only return to suite-local fixes after the shared runner boundary is shown stable.
65. [TEST-0065] Prefer lowering the shared TAP jobs budget or other runner-wide worker concurrency settings before chasing late aggregate-only assertions.
66. [TEST-0066] Only restore higher parallelism after the aggregate gate is proven stable at the new boundary.
67. [TEST-0067] FIX - Only after the test fails, implement the fix
68. [TEST-0068] Are multiple recent bugs clustering around the same boundary or component? That may indicate a design-level issue worth addressing instead of patching each symptom individually.
69. [TEST-0069] Missing-row behavior - Add a test proving a missing authoritative row is handled only by the canonical creation owner, not by a local fallback inside an updater.
70. [TEST-0070] Single in-flight reconcile - Add a regression proving only one progression execution can run for a given owner key at a time.
71. [TEST-0071] Acknowledgement-before-advance - For executor-owned boundaries, add a regression proving the owner advances only after durable participant acknowledgement rather than cache timing or elapsed time.
72. [TEST-0072] Prefer focused unit or integration replays over broad scenario-only proof, but keep the original scenario or representative blocker probe in the validation surface.
73. [TEST-0073] Add tests that assert timeout classification payloads, not only error text.
74. [TEST-0074] Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic.
75. [TEST-0075] Create alternate constructors, factory methods, or initialization paths that only tests call.
76. [TEST-0076] Run targeted tests only - Don't run the full test suite except at checkpoints
77. [TEST-0077] Focus on relevant tests - Only run tests related to the feature/file being modified
78. [TEST-0078] Run failing tests first - When fixing issues, run only the specific failing test(s)
79. [TEST-0079] If the package or runner boundary requires it, run the shared unit-only gate before any checkpoint distributed rerun.
80. [TEST-0080] Run a full 5node or 7node harness scenario only after the earlier stages are green.
81. [TEST-0081] Only after the artifact summaries have been read may raw container or node logs become the primary debugging surface.
82. [TEST-0082] Assert that callers preserve or consume that contract instead of silently converting it into: - []; - null; - timeout-only failure text; - generic fallback success
83. [TEST-0083] When isolated subsystem or shard runs pass, but the aggregate TAP gate fails only when all suites run together, treat the problem as a shared runner parallelism-budget concern until proven otherwise.
84. [TEST-0084] Distributed baseline runs are allowed to discover bugs, but they are not allowed to be the only place those bugs remain reproducible.
85. [TEST-0085] Local execution may use scripts/run-distributed-validation-ladder.js to make this order explicit.
86. [TEST-0086] Only run the complete test suite (npm test) at: - Checkpoint tasks explicitly marked in the task list; - Final integration verification; - When explicitly requested by the user
87. [TEST-0087] If validation reveals a second concern, split that concern into a new idea or work package instead of silently widening the current one.
88. [TEST-0088] If that deep dive finds mistakes, irregularities, or doctrine/system guideline violations in the affected area, fix them before renaming the package to done-....
89. [TEST-0089] A package is not validation-complete while tail-consumer proof is still missing, even if the main owner tests are green.
90. [TEST-0090] Before editing production code, record the relevant static guardrail status in the active package's static drift ledger.
91. [TEST-0091] If a repo-wide guard already fails, run the narrowest file-scoped or boundary-scoped form that covers the touched files and record the inherited count before the change.
92. [TEST-0092] After implementation and focused tests, rerun the same guardrails and record the after state.
93. [TEST-0093] Keep one named reference scenario or blocker probe for the package.
94. [TEST-0094] After targeted regression and owner-path proof is green, rerun that scenario or probe before treating the analysis as closed.
95. [TEST-0095] If the scenario still fails, record whether the dominant blocker is the same or has migrated.
96. [TEST-0096] If the blocker migrated, update the active package or split a follow-on package in the same work cycle instead of burying the new blocker in commentary or memory.
97. [TEST-0097] Confirm whether the failing files are unrelated in domain behavior.
98. [TEST-0098] Prefer a shared runner or bootstrap fix before editing individual suites.
99. [TEST-0099] If the crash traces point to Node/V8 startup or worker initialization, harden the shared TAP worker configuration first.
100. [TEST-0100] Confirm that the same suites pass in smaller grouped or isolated bail runs.
101. [TEST-0101] Check shared machine budget signals such as available RAM, swap pressure, and TAP worker count before editing individual suites.
102. [TEST-0102] REPRODUCE - Create a test that demonstrates the bug
103. [TEST-0103] Use minimal setup to isolate the bug
104. [TEST-0104] VERIFY - Run the test to confirm it fails as expected
105. [TEST-0105] Document the root cause in test comments if known
106. [TEST-0106] CONFIRM - Run the test again to verify the fix works
107. [TEST-0107] Search for existing owners - Does a component already own this behavior? Extend or correct it rather than adding a parallel path.
108. [TEST-0108] Search for existing abstractions - Is there a helper, base class, shared utility, or state machine that already handles the general case? Wire into it instead of building a one-off solution.
109. [TEST-0109] Reuse existing test fixtures and helpers - Check the test suite for setup utilities, factory functions, or shared harnesses that already construct the scenario you need.
110. [TEST-0110] Extend existing test files - If a test file already covers the component under test, add the new case there rather than creating a new file.
111. [TEST-0111] Leverage existing assertion patterns - Follow the conventions already established in nearby tests for asserting ownership, lifecycle, and state.
112. [TEST-0112] Would a small refactor at a higher level eliminate the need for the current fix entirely?
113. [TEST-0113] Name the shared boundary explicitly in the failing test or task notes.
114. [TEST-0114] Add a targeted regression for the current symptom.
115. [TEST-0115] Add or update an architectural task/spec that reduces the number of runtime paths across that boundary.
116. [TEST-0116] Injected owner usage - If setup injects an owner such as replicaStateMachine, serviceLifecycleManager, or similar, add a test that fails if the consumer bypasses that owner.
117. [TEST-0117] Create-vs-update separation - Add coverage proving that the initial row creation path uses insert/full-shape semantics and later lifecycle changes use update/partial-shape semantics.
118. [TEST-0118] Primary-key mutation path - For CDC-propagated system tables, add a regression that lifecycle updates are executed with primary-key-addressed writes (query rows, then update by PK) rather than broad predicate updates.
119. [TEST-0119] Identify the production files touched by the new or modified test and their direct owner collaborators.
120. [TEST-0120] Check those files against .kiro/steering/system guidelines.md with special focus on: - owner dependency routing; - duplicate logic and fallback paths; - single source of truth for state and row-field ownership
