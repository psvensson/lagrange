# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Generated rules: 120
Estimated tokens: 4364
Domains: testing

## Rules

1. [TEST-0001] A package must not be renamed to done-... until its required validation has passed.
2. [TEST-0002] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard.
3. [TEST-0003] The default ratchet must not increase the inherited count of production JavaScript files over 800 lines or test JavaScript files over 1200 lines.
4. [TEST-0004] Do not close the package on local green proof alone while the reference scenario still fails for a different named reason.
5. [TEST-0005] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both.
6. [TEST-0006] Do not close the second bug with only a local patch if the porous boundary remains unchanged.
7. [TEST-0007] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested.
8. [TEST-0008] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline.
9. [TEST-0009] STOP - Do not accept the test as passing
10. [TEST-0010] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism
11. [TEST-0011] Do not comment out tests to avoid running them
12. [TEST-0012] If a test is failing, fix the code or the test - do not skip it
13. [TEST-0013] DO NOT IGNORE - Failing tests indicate broken functionality
14. [TEST-0014] DO NOT DEFER - Resolve the failure before closing the current task when it is in the touched area or surfaced by the runs you chose to perform
15. [TEST-0015] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row
16. [TEST-0016] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop.
17. [TEST-0017] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists.
18. [TEST-0018] A second analysis step may map the owner path, focused fixture, or affected presentation surface, but must not broaden beyond the current snapshot.
19. [TEST-0019] If several sub-agents are used, give each one a disjoint question or file scope. Do not ask several workers to independently fix the same blocker.
20. [TEST-0020] // ❌ WRONG - Timer never cleared const timeoutPromise = new Promise((_, reject) => { setTimeout(() => reject(new Error('timeout')), 30000); });
21. [TEST-0021] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass.
22. [TEST-0022] Work must not close while the touched area remains red.
23. [TEST-0023] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path.
24. [TEST-0024] The active work package must define the required validation surface.
25. [TEST-0025] Tests added during the change must match the package concern rather than an unrelated umbrella scope.
26. [TEST-0026] After the package validation surface is green, perform the required package-closure deep dive across the affected area before closing the package.
27. [TEST-0027] If a package changes a shared contract, validation must prove not only the runtime owner path, but also the direct status, diagnostics, admin, harness, or reporting surfaces that consume that contract.
28. [TEST-0028] When residual closures are split into a follow-on package, the original package must stop short of done-... until the split is explicit in work/ and the original package file names the exact handoff.
29. [TEST-0029] If a package deliberately creates a new oversized file, it must name the follow-on extraction package before closure.
30. [TEST-0030] If the representative scenario still fails after the fixture and focused tests pass, the package must record whether the fixture contract was correct and what new owner boundary now dominates.
31. [TEST-0031] When the same owner boundary still dominates, validation must update the active package and sprint current blocker snapshot instead of forcing a new package split.
32. [TEST-0032] The test must fail with the current code
33. [TEST-0033] The next regression in that area must prove the reduced boundary, not only the immediate symptom.
34. [TEST-0034] Tests must never be skipped.
35. [TEST-0035] The evidence block must name the canonical blocker, owner boundary, source artifact paths, prior blocker status, subordinate evidence, and next focused proof surface.
36. [TEST-0036] Manual evidence summaries are allowed only when no extractor exists, and must preserve the normalized owner fields from the artifact rather than reclassifying from raw logs.
37. [TEST-0037] The first delegated or local analysis step must extract the canonical evidence from the latest artifact and compare it with the sprint current blocker snapshot.
38. [TEST-0038] The final validation note must state whether the representative scenario passed, stayed on the same owner boundary, or migrated to a new named owner boundary.
39. [TEST-0039] They MUST respect the standard duration limits (2s unit, 30s integration). Use mocked time and injected latency, not real delays.
40. [TEST-0040] Test closure and package closure both require the final affected-area deep dive required by .kiro/steering/system guidelines.md.
41. [TEST-0041] Every non-trivial package must prove that it did not increase architecture drift while fixing behavior.
42. [TEST-0042] When a package exists because a distributed, integration, load, or scenario failure exposed a blocker, validation must prove not only the local fix but also what the original scenario does next.
43. [TEST-0043] All bug fixes MUST be preceded by a failing test that reproduces the bug.
44. [TEST-0044] When the second correctness bug appears at the same architectural boundary in one work cycle, the response must escalate from a local patch to boundary consolidation.
45. [TEST-0045] When a bug involves component ownership, lifecycle persistence, or system-table row mutation, tests must prove that the canonical owner is actually used.
46. [TEST-0046] When adding new tests or changing existing tests for production code, you must also audit the code under test for System Guidelines violations and fix them as part of the same change.
47. [TEST-0047] When a change touches shared metadata reads or writes, tests and CI checks must prove the canonical gateway boundary is still the only runtime ingress.
48. [TEST-0048] When a change touches control-plane progression (dispatch, rebalance, split, admission progression, operation timeout handling), tests must prove deterministic owner-path behavior rather than only eventual convergence.
49. [TEST-0049] When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, queues, or phase-to-runtime handoff, tests must prove continuity and bounded lifetime, not just eventual correctness.
50. [TEST-0050] Timeouts in control-plane logic are hard correctness bugs and must be tested as typed outcomes, not generic strings.
51. [TEST-0051] Every test that exists must run and pass.
52. [TEST-0052] Tests must exercise the real production code paths.
53. [TEST-0053] The test suite must prove that production code works — not that a test-friendly fork of it works.
54. [TEST-0054] Failures discovered in the touched area, or discovered by the test runs chosen for the current change, must be resolved before the task closes.
55. [TEST-0055] When an agent or sub-agent is used to continue a sprint, validation ownership must follow the same evidence ladder as package work.
56. [TEST-0056] When an owner path is intentionally unresolved under pressure, publication establishment, or recovery completion, tests must prove the caller receives a structured deferred outcome rather than ambiguous absence.
57. [TEST-0057] When a change touches startup, readiness, admin snapshot, service discovery, or another shared control-plane truth surface, tests must prove readers observe and schedule repair instead of repairing inline.
58. [TEST-0058] Tests MUST verify this property at the unit and integration layers, not only in the distributed harness.
59. [TEST-0059] Existing violations in touched files must be fixed when they are part of the same semantic boundary. If they are genuinely outside scope, the package must name the excluded boundary and link a follow-on package before closure.
60. [TEST-0060] If the package has already recorded two material blocker migrations, the next validation cycle must start from a replayable owner-decision fixture or the narrowest blocker probe that represents the current dominant owner.
61. [TEST-0061] A scenario-driven package that changes runtime meaning, decision meaning, or presentation meaning must prove the current blocker in this order: owner-decision fixture or blocker probe, focused owner tests, affected presentation tests, then the representative scenario.
62. [TEST-0062] Presentation tests are required when failure bundles, triage summaries, admin summaries, active gates, or report writers consume the changed contract. A green owner test alone is not sufficient if presentation can still classify the same evidence under a different blocker.
63. [TEST-0063] A fresh artifact with different counts, node ids, epochs, or timing does not by itself prove blocker migration. Treat it as the same blocker until the normalized evidence shows a different semantic owner, owner boundary, or next required action.
64. [TEST-0064] The review must check package closure evidence, residual inventory, guardrail ledger, blocker migration notes, sprint snapshot consistency, and whether the last package's stated next action still matches current artifact evidence.
65. [TEST-0065] Slow-dependency resilience — inject artificial latency into a dependency (mock that resolves after a delay) and prove the component does not fail, corrupt state, or drop work. It may be slower, but it must remain correct.
66. [TEST-0066] A representative rerun should not be the next debugging step while the current owner-decision fixture or narrow blocker probe is missing.
67. [TEST-0067] The test should capture the exact failure scenario from the bug report
68. [TEST-0068] The failure message should match the reported error
69. [TEST-0069] The fix should make the failing test pass
70. [TEST-0070] Is the current problem a repeated pattern? If so, is there a shared abstraction that should exist but does not?
71. [TEST-0071] When a bug depends on stale cache truth, stale routing, delayed authoritative visibility, no-handler witnesses, or other cross-time evidence races, the regression must replay the witness order that triggered the bug rather than asserting only the final steady state.
72. [TEST-0072] Implementation work should start only after the current owner boundary and smallest proof surface are named.
73. [TEST-0073] For control-plane, readiness, topology, and other shared distributed-boundary work, the normal debugging loop must follow one validation ladder instead of jumping straight from unit failures to repeated full distributed reruns.
74. [TEST-0074] No other tests should break
75. [TEST-0075] All non-trivial implementation work should have validation owned by its active work package.
76. [TEST-0076] Runtime packages that touch already oversized files should record whether they are adding local size debt or extracting a smaller owner/helper boundary.
77. [TEST-0077] These tests should be small and targeted.
78. [TEST-0078] Work packages should list their targeted owner tests, the relevant boundary-transition scenarios, and the final distributed checkpoint command in that same order.
79. [TEST-0079] Use npm run audit:file-size:strict only for packages that explicitly own file-size cleanup, because the repository still has inherited oversize files.
80. [TEST-0080] Only return to suite-local fixes after the shared runner boundary is shown stable.
81. [TEST-0081] Prefer lowering the shared TAP jobs budget or other runner-wide worker concurrency settings before chasing late aggregate-only assertions.
82. [TEST-0082] Only restore higher parallelism after the aggregate gate is proven stable at the new boundary.
83. [TEST-0083] FIX - Only after the test fails, implement the fix
84. [TEST-0084] Are multiple recent bugs clustering around the same boundary or component? That may indicate a design-level issue worth addressing instead of patching each symptom individually.
85. [TEST-0085] Missing-row behavior - Add a test proving a missing authoritative row is handled only by the canonical creation owner, not by a local fallback inside an updater.
86. [TEST-0086] Single in-flight reconcile - Add a regression proving only one progression execution can run for a given owner key at a time.
87. [TEST-0087] Acknowledgement-before-advance - For executor-owned boundaries, add a regression proving the owner advances only after durable participant acknowledgement rather than cache timing or elapsed time.
88. [TEST-0088] Prefer focused unit or integration replays over broad scenario-only proof, but keep the original scenario or representative blocker probe in the validation surface.
89. [TEST-0089] Add tests that assert timeout classification payloads, not only error text.
90. [TEST-0090] Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic.
91. [TEST-0091] Create alternate constructors, factory methods, or initialization paths that only tests call.
92. [TEST-0092] Run targeted tests only - Don't run the full test suite except at checkpoints
93. [TEST-0093] Focus on relevant tests - Only run tests related to the feature/file being modified
94. [TEST-0094] Run failing tests first - When fixing issues, run only the specific failing test(s)
95. [TEST-0095] If the package or runner boundary requires it, run the shared unit-only gate before any checkpoint distributed rerun.
96. [TEST-0096] Run a full 5node or 7node harness scenario only after the earlier stages are green.
97. [TEST-0097] Only after the artifact summaries have been read may raw container or node logs become the primary debugging surface.
98. [TEST-0098] A separate implementation sub-agent may start the current work package only after the previous-package review is clean or the review findings have been fixed.
99. [TEST-0099] Assert that callers preserve or consume that contract instead of silently converting it into: - []; - null; - timeout-only failure text; - generic fallback success
100. [TEST-0100] When isolated subsystem or shard runs pass, but the aggregate TAP gate fails only when all suites run together, treat the problem as a shared runner parallelism-budget concern until proven otherwise.
101. [TEST-0101] Distributed baseline runs are allowed to discover bugs, but they are not allowed to be the only place those bugs remain reproducible.
102. [TEST-0102] Local execution may use scripts/run-distributed-validation-ladder.js to make this order explicit.
103. [TEST-0103] If validation reveals a second concern, split that concern into a new idea or work package instead of silently widening the current one.
104. [TEST-0104] If that deep dive finds mistakes, irregularities, or doctrine/system guideline violations in the affected area, fix them before renaming the package to done-....
105. [TEST-0105] A package is not validation-complete while tail-consumer proof is still missing, even if the main owner tests are green.
106. [TEST-0106] Before editing production code, record the relevant static guardrail status in the active package's static drift ledger.
107. [TEST-0107] After implementation and focused tests, rerun the same guardrails and record the after state.
108. [TEST-0108] Run npm run audit:file-size for broad runtime, control-plane, transport, harness, and test-infrastructure packages.
109. [TEST-0109] Keep one named reference scenario or blocker probe for the package.
110. [TEST-0110] After targeted regression and owner-path proof is green, rerun that scenario or probe before treating the analysis as closed.
111. [TEST-0111] If the scenario still fails, record whether the dominant blocker is the same or has migrated.
112. [TEST-0112] If the blocker migrated, update the active package or split a follow-on package in the same work cycle instead of burying the new blocker in commentary or memory.
113. [TEST-0113] If artifact-derived evidence tooling exists for the scenario, use it to produce the validation handoff block before writing manual analysis.
114. [TEST-0114] Confirm whether the failing files are unrelated in domain behavior.
115. [TEST-0115] Prefer a shared runner or bootstrap fix before editing individual suites.
116. [TEST-0116] If the crash traces point to Node/V8 startup or worker initialization, harden the shared TAP worker configuration first.
117. [TEST-0117] Confirm that the same suites pass in smaller grouped or isolated bail runs.
118. [TEST-0118] Check shared machine budget signals such as available RAM, swap pressure, and TAP worker count before editing individual suites.
119. [TEST-0119] REPRODUCE - Create a test that demonstrates the bug
120. [TEST-0120] Use minimal setup to isolate the bug
