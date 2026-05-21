# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Generated rules: 97
Estimated tokens: 4099
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
12. [TEST-0012] It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests.
13. [TEST-0013] It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic.
14. [TEST-0014] It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization paths that only tests call.
15. [TEST-0015] It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up.
16. [TEST-0016] It is FORBIDDEN to: Export internal implementation details solely so tests can reach them.
17. [TEST-0017] DO NOT IGNORE - Failing tests indicate broken functionality
18. [TEST-0018] DO NOT DEFER - Resolve the failure before closing the current task when it is in the touched area or surfaced by the runs you chose to perform
19. [TEST-0019] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row
20. [TEST-0020] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop.
21. [TEST-0021] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists.
22. [TEST-0022] A second analysis step may map the owner path, focused fixture, or affected presentation surface, but must not broaden beyond the current snapshot.
23. [TEST-0023] If several sub-agents are used, give each one a disjoint question or file scope. Do not ask several workers to independently fix the same blocker.
24. [TEST-0024] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass.
25. [TEST-0025] Work must not close while the touched area remains red.
26. [TEST-0026] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path.
27. [TEST-0027] The active work package must define the required validation surface.
28. [TEST-0028] Tests added during the change must match the package concern rather than an unrelated umbrella scope.
29. [TEST-0029] After the package validation surface is green, perform the required package-closure deep dive across the affected area before closing the package.
30. [TEST-0030] If a package changes a shared contract, validation must prove not only the runtime owner path, but also the direct status, diagnostics, admin, harness, or reporting surfaces that consume that contract.
31. [TEST-0031] When residual closures are split into a follow-on package, the original package must stop short of done-... until the split is explicit in work/ and the original package file names the exact handoff.
32. [TEST-0032] New or newly edited source-code files must finish at or below 1200 lines.
33. [TEST-0033] If a package touches an inherited oversized source-code file, it must extract or refactor the touched file until it is at or below 1200 lines before closure.
34. [TEST-0034] If the representative scenario still fails after the fixture and focused tests pass, the package must record whether the fixture contract was correct and what new owner boundary now dominates.
35. [TEST-0035] When the same owner boundary still dominates, validation must update the active package and sprint current blocker snapshot instead of forcing a new package split.
36. [TEST-0036] Repeated crossings of the same owner boundary must escalate to a causal analysis package or autonomous architecture experiment unless the package includes a focused probe for the missing causal edge.
37. [TEST-0037] The test must fail with the current code
38. [TEST-0038] The next regression in that area must prove the reduced boundary, not only the immediate symptom.
39. [TEST-0039] Tests must never be skipped.
40. [TEST-0040] The evidence block must name the canonical blocker, owner boundary, source artifact paths, prior blocker status, subordinate evidence, and next focused proof surface.
41. [TEST-0041] The first delegated or local analysis step must extract the canonical evidence from the latest artifact and compare it with the sprint current blocker snapshot.
42. [TEST-0042] The final validation note must state whether the representative scenario passed, stayed on the same owner boundary, or migrated to a new named owner boundary.
43. [TEST-0043] Pressure tests MUST respect the standard duration limits (2s unit, 30s integration). Use mocked time and injected latency, not real delays.
44. [TEST-0044] Retryable or backpressure states require focused probes that prove the concrete progress mechanism: wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or bounded progress. A representative rerun may confirm that proof, but it must not replace the missing causal-edge probe.
45. [TEST-0045] Test closure and package closure both require the final affected-area deep dive required by .kiro/steering/system guidelines.md.
46. [TEST-0046] Every non-trivial package must prove that it did not increase architecture drift while fixing behavior.
47. [TEST-0047] When a package exists because a distributed, integration, load, or scenario failure exposed a blocker, validation must prove not only the local fix but also what the original scenario does next.
48. [TEST-0048] All bug fixes MUST be preceded by a failing test that reproduces the bug.
49. [TEST-0049] When the second correctness bug appears at the same architectural boundary in one work cycle, the response must escalate from a local patch to boundary consolidation.
50. [TEST-0050] When a bug involves component ownership, lifecycle persistence, or system-table row mutation, tests must prove that the canonical owner is actually used.
51. [TEST-0051] When adding new tests or changing existing tests for production code, you must also audit the code under test for System Guidelines violations and fix them as part of the same change.
52. [TEST-0052] When a change touches shared metadata reads or writes, tests and CI checks must prove the canonical gateway boundary is still the only runtime ingress.
53. [TEST-0053] When a change touches control-plane progression (dispatch, rebalance, split, admission progression, operation timeout handling), tests must prove deterministic owner-path behavior rather than only eventual convergence.
54. [TEST-0054] When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, queues, or phase-to-runtime handoff, tests must prove continuity and bounded lifetime, not just eventual correctness.
55. [TEST-0055] Timeouts in control-plane logic are hard correctness bugs and must be tested as typed outcomes, not generic strings.
56. [TEST-0056] Every test that exists must run and pass.
57. [TEST-0057] Tests must exercise the real production code paths.
58. [TEST-0058] The test suite must prove that production code works — not that a test-friendly fork of it works.
59. [TEST-0059] Failures discovered in the touched area, or discovered by the test runs chosen for the current change, must be resolved before the task closes.
60. [TEST-0060] When an agent or sub-agent is used to continue a sprint, validation ownership must follow the same evidence ladder as package work.
61. [TEST-0061] When an owner path is intentionally unresolved under pressure, publication establishment, or recovery completion, tests must prove the caller receives a structured deferred outcome rather than ambiguous absence.
62. [TEST-0062] When a change touches startup, readiness, admin snapshot, service discovery, or another shared control-plane truth surface, tests must prove readers observe and schedule repair instead of repairing inline.
63. [TEST-0063] Tests MUST verify this property at the unit and integration layers, not only in the distributed harness.
64. [TEST-0064] Existing violations in touched files must be fixed when they are part of the same semantic boundary. If they are genuinely outside scope, the package must name the excluded boundary and link a follow-on package before closure.
65. [TEST-0065] If the package has already recorded two material blocker migrations, the next validation cycle must start from a replayable owner-decision fixture or the narrowest blocker probe that represents the current dominant owner.
66. [TEST-0066] A scenario-driven package that changes runtime meaning, decision meaning, or presentation meaning must prove the current blocker in this order: owner-decision fixture or blocker probe, focused owner tests, affected presentation tests, then the representative scenario.
67. [TEST-0067] Presentation tests are required when failure bundles, triage summaries, admin summaries, active gates, or report writers consume the changed contract. A green owner test alone is not sufficient if presentation can still classify the same evidence under a different blocker.
68. [TEST-0068] A fresh artifact with different counts, node ids, epochs, or timing does not by itself prove blocker migration. Treat it as the same blocker until the normalized evidence shows a different semantic owner, owner boundary, or next required action.
69. [TEST-0069] The active scenario package owner and boundary must match the canonical current first frontier recorded in scenarioCausalClosure. If a package intentionally owns a diagnostic/support role while the first frontier stays elsewhere, it must record explicit ownerBoundaryMigrationProof metadata with from/to owner-boundary, reason, and focused evidence.
70. [TEST-0070] When a package classifies a retryable or backpressure state as bounded rather than fixing runtime code, the validation must prove why the state is not the first frontier, which downstream blockers remain, and which stop condition prevents another local patch. That classification cannot rest on prose alone: it must name the focused probe command, proof artifact path, expected observable transition, maximum progress bound, and same-frontier fallback.
71. [TEST-0071] If representative evidence oscillates between two related owner boundaries, the next validation surface must be a replayable handoff fixture or missing-edge probe that includes both boundaries. Focused owner tests for either boundary alone are insufficient. The fixture or probe must decide which owner owns progress, defer, retry, or terminal classification for the handoff before another owner-local runtime patch starts.
72. [TEST-0072] When repeated scenario runs keep failing after local fixes or classification-only reductions, the next validation package must establish a causal-analysis boundary or autonomous architecture experiment before more runtime fixes. At minimum it must validate the end-to-end phase model, cross-entity causal graph, budget/timeout accounting, invariant review, failure-class taxonomy, and architecture-level stop conditions.
73. [TEST-0073] A runtime fix that follows causal-analysis escalation must cite the causal model or artifact it uses, then prove that its local regression changes the relevant causal edge rather than only improving the immediate symptom.
74. [TEST-0074] Manual evidence summaries are allowed only when no extractor exists or the extractor output is insufficient. They must preserve the normalized owner fields from the artifact rather than reclassifying from raw logs, and the package must record why the extractor was not enough.
75. [TEST-0075] The review must check package closure evidence, residual inventory, guardrail ledger, blocker migration notes, sprint snapshot consistency, and whether the last package's stated next action still matches current artifact evidence.
76. [TEST-0076] Slow-dependency resilience — inject artificial latency into a dependency (mock that resolves after a delay) and prove the component does not fail, corrupt state, or drop work. It may be slower, but it must remain correct.
77. [TEST-0077] A representative rerun should not be the next debugging step while the current owner-decision fixture or narrow blocker probe is missing.
78. [TEST-0078] The test should capture the exact failure scenario from the bug report
79. [TEST-0079] The failure message should match the reported error
80. [TEST-0080] The fix should make the failing test pass
81. [TEST-0081] Is the current problem a repeated pattern? If so, is there a shared abstraction that should exist but does not?
82. [TEST-0082] When a bug depends on stale cache truth, stale routing, delayed authoritative visibility, no-handler witnesses, or other cross-time evidence races, the regression must replay the witness order that triggered the bug rather than asserting only the final steady state.
83. [TEST-0083] Implementation work should start only after the current owner boundary and smallest proof surface are named.
84. [TEST-0084] For control-plane, readiness, topology, and other shared distributed-boundary work, the normal debugging loop must follow one validation ladder instead of jumping straight from unit failures to repeated full distributed reruns.
85. [TEST-0085] Distributed artifact triage must start with npm run work:evidence-summary -- <artifact>, the focused extractor for the failure class such as npm run analyze:priority-recovery-residuals -- <artifact>, and npm run analyze:owner-files -- <owner> [boundary] before broad text search, raw JSON slicing, ad hoc jq, or raw logs.
86. [TEST-0086] No other tests should break
87. [TEST-0087] All non-trivial implementation work should have validation owned by its active work package.
88. [TEST-0088] Runtime packages that touch already oversized files should record whether they are adding local size debt or extracting a smaller owner/helper boundary.
89. [TEST-0089] These tests should be small and targeted.
90. [TEST-0090] Work packages should list their targeted owner tests, the relevant boundary-transition scenarios, and the final distributed checkpoint command in that same order.
91. [TEST-0091] Only return to suite-local fixes after the shared runner boundary is shown stable.
92. [TEST-0092] Only restore higher parallelism after the aggregate gate is proven stable at the new boundary.
93. [TEST-0093] Are multiple recent bugs clustering around the same boundary or component? That may indicate a design-level issue worth addressing instead of patching each symptom individually.
94. [TEST-0094] Only after the artifact summaries and relevant extractors have been read may raw container logs, node logs, raw JSON slicing, or ad hoc jq become the primary debugging surface.
95. [TEST-0095] A separate implementation sub-agent may start the current work package only after the previous-package review is clean or the review findings have been fixed.
96. [TEST-0096] Local execution may use scripts/run-distributed-validation-ladder.js to make this order explicit.
97. [TEST-0097] Only run the complete test suite (npm test) at: - Checkpoint tasks explicitly marked in the task list; - Final integration verification; - When explicitly requested by the user
