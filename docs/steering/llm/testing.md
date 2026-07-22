---
scope: testing
status: compiled
always_load: false
source_of_truth: docs/steering/ (see llm-pack.config.json sources for testing)
regenerate_with: npm run steering:llm:pack
---

> **Compiled pack — do not hand-edit.** Regenerate with `npm run steering:llm:pack` after editing canonical sources under `docs/steering/`.

# Testing Steering Pack

Load for test-first workflow, reliability harness work, and regression policy.

Rule count, token estimate, and domain coverage live in `manifest.json` (regenerated on each `npm run steering:llm:pack`). Do not maintain those numbers inline.

> **Complete selectively loaded pack.** All 92 testing master rules are included below (93 incl. cross-domain aliases; alias rows are marked in `rules-index.md`).

## Rules

### General Guidelines

1. [TEST-0002] Do not use .skip(), skip:, xit(), xdescribe(), or any skip mechanism _(see testing-guidelines/fixtures.md:35)_
2. [TEST-0003] Do not comment out tests to avoid running them _(see testing-guidelines/fixtures.md:36)_
3. [TEST-0005] It is FORBIDDEN to: Add if (process.env.NODE_ENV === 'test') or similar environment checks that change runtime behavior for tests. _(see testing-guidelines/fixtures.md:54)_
4. [TEST-0007] It is FORBIDDEN to: Create alternate constructors, factory methods, or initialization paths that only tests call. _(see testing-guidelines/fixtures.md:58)_
5. [TEST-0009] It is FORBIDDEN to: Export internal implementation details solely so tests can reach them. _(see testing-guidelines/fixtures.md:62)_
6. [TEST-0011] A Quest must not report SOLVED until its required validation has passed. _(see testing-guidelines/proof-ladders.md:25)_
7. [TEST-0013] Combine before creating - If two existing pieces almost solve the problem, combine them. Do not create a third piece that reimplements both. _(see testing-guidelines/regression-policy.md:56)_
8. [TEST-0014] Do not close the second bug with only a local patch if the porous boundary remains unchanged. _(see testing-guidelines/regression-policy.md:141)_
9. [TEST-0015] Enqueue-only triggers - Add coverage proving event handlers enqueue work and do not execute long-running progression inline. _(see testing-guidelines/regression-policy.md:197)_
10. [TEST-0016] Do not claim SOLVED on local green proof alone while the reference scenario still fails for a different named reason. _(see testing-guidelines/release-gate.md:32)_
11. [TEST-0017] A lever that passes its own unit DT but never moves the real observable is NOT proven; do NOT advance it to a gate. Reproduce the observable deterministically in-process first. _(see testing-guidelines/release-gate.md:92)_
12. [TEST-0018] Do not treat a baseline increase lacking both same-commit artifacts as a judgment call; it is a guideline violation. _(see testing-guidelines/release-gate.md:109)_
13. [TEST-0019] Tighten a baseline in the same change that removes violations whenever the measured count drops below the committed one. _(see testing-guidelines/release-gate.md:111)_
14. [TEST-0021] Do not defer the failure. When the failure is in the touched area, or was surfaced by the runs you chose to perform, you must resolve it before closing the current task. _(see testing-guidelines/regression-policy.md:377)_
15. [TEST-0022] Do not mark the bug closed just because the baseline rerun happens to pass. Closure requires a stable targeted regression in the normal development loop. _(see testing-guidelines/regression-policy.md:407)_
16. [TEST-0023] Treat timeouts as hard correctness failures by default. Do not raise product, harness, or scenario timeouts as a fix until a deterministic root-cause reproduction exists. _(see testing-guidelines/regression-policy.md:413)_
17. [TEST-0024] NEVER ship a change to a hot failure-handling path (retry, recovery, failure-classification, backoff) without a controlled live A/B: N≥2 runs fixed vs N≥2 reverted, comparing aggregate error counts and outcome. _(see findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:5)_
18. [TEST-0025] You MUST NOT convert a defer/backoff on a hot failure path into advance-now work (extra reads, re-inserts) without that live A/B proof — a defer during churn is often the load-shedding that lets prerequisites settle. _(see findings/2026-07-10-hotpath-failure-fix-needs-aggregate-live-validation.md:7)_
19. [TEST-0027] Production code must never contain alternate code paths, branches, or special-case logic that exist solely to make tests pass. _(see testing-guidelines/fixtures.md:45)_
20. [TEST-0031] Do NOT reach for unref() on awaited sleeps — that lets the process exit mid-await and has broken suites before. _(see testing-guidelines/harness.md:68)_
21. [TEST-0033] Work must not close while the touched area remains red. _(see testing-guidelines/regression-policy.md:388)_
22. [TEST-0034] The active Quest must define the required validation surface. _(see testing-guidelines/proof-ladders.md:22)_
23. [TEST-0036] After the Quest validation surface is green, perform the required closure deep dive across the affected area before claiming SOLVED (scope and stop condition defined under "Closure deep dive — scope" below). _(see testing-guidelines/proof-ladders.md:28)_
24. [TEST-0037] When residual closure moves to a follow-on Quest or frontier, the original Quest must stop short of SOLVED until the split is explicit in a finding or the current Quest report. _(see testing-guidelines/proof-ladders.md:38)_
25. [TEST-0041] The next regression in that area must prove the reduced boundary, not only the immediate symptom. _(see testing-guidelines/regression-policy.md:143)_
26. [TEST-0043] Pressure tests MUST respect the standard duration limits (2s unit, 30s integration). Use mocked time and injected latency, not real delays. _(see testing-guidelines/regression-policy.md:352)_
27. [TEST-0051] Tests must exercise the real production code paths. _(see testing-guidelines/fixtures.md:48)_
28. [TEST-0053] Timeouts in control-plane logic are hard correctness bugs and must be tested as typed outcomes, not generic strings. _(see testing-guidelines/harness.md:105)_
29. [TEST-0054] Every non-trivial Quest must prove that it did not increase architecture drift while fixing behavior. _(see testing-guidelines/proof-ladders.md:71)_
30. [TEST-0056] When the second correctness bug appears at the same architectural boundary in one work cycle, the response must escalate from a local patch to boundary consolidation. _(see testing-guidelines/regression-policy.md:122)_
31. [TEST-0058] When a change touches shared metadata reads or writes, tests and CI checks must prove the canonical gateway boundary is still the only runtime ingress. _(see testing-guidelines/regression-policy.md:173)_
32. [TEST-0063] A deterministic proof MUST move the real in-cluster binding observable that the doneWhen is about — not merely the internal math or return value of the mechanism the fix introduces. _(see testing-guidelines/release-gate.md:83)_
33. [TEST-0064] When a delegated worker reviews a scenario Quest, it must compare current probe evidence with the Quest's selected frontier and findings. _(see testing-guidelines/release-gate.md:114)_
34. [TEST-0069] The expensive non-deterministic statistical gate (the docker rolling-restart stat-gate and equivalent multi-run scenario reruns) is a last resort, reached only after deterministic in-process proof: a fix is validated by a deterministic reproduction that goes red on revert, not by a passing gate run, and a gate is never the iteration loop. _(see testing-guidelines/release-gate.md:67)_
35. [TEST-0072] Live-refutation two-strikes. When live/measured evidence contradicts a sealed statement or a fix claim TWICE, the framing — not the next patch — is what must change: EXHAUST and re-author, widen the class, or escalate altitude (affinity-demo runs 25/26: two live refutations of green-DT closures exposed a mechanism the framing had missed). _(see testing-guidelines/regression-policy.md:114)_
36. [TEST-0073] Slow-dependency resilience — inject artificial latency into a dependency (mock that resolves after a delay) and prove the component does not fail, corrupt state, or drop work. It may be slower, but it must remain correct. _(see testing-guidelines/regression-policy.md:332)_
37. [TEST-0076] The failure message should match the reported error _(see testing-guidelines/regression-policy.md:27)_
38. [TEST-0078] Is the current problem a repeated pattern? If so, is there a shared abstraction that should exist but does not? _(see testing-guidelines/regression-policy.md:82)_
39. [TEST-0081] No other tests should break _(see testing-guidelines/regression-policy.md:32)_
40. [TEST-0082] All non-trivial implementation work should have validation owned by its active Quest. _(see testing-guidelines/proof-ladders.md:17)_
41. [TEST-0084] These tests should be small and targeted. _(see testing-guidelines/regression-policy.md:168)_
42. [TEST-0085] The review should produce candidate findings or risks; the Solver still owns terminal status. _(see testing-guidelines/release-gate.md:115)_
43. [TEST-0086] A convergence bug MUST be reproduced deterministically in-process BEFORE changing code; the non-deterministic docker statistical gate is last-resort certification of a landed fix, and MUST NOT be used as the iteration loop. _(see findings/2026-06-17-steering-doc-clarity-deterministic-first-repro.md:5)_
44. [TEST-0088] Only return to suite-local fixes after the shared runner boundary is shown stable. _(see testing-guidelines/harness.md:27)_
45. [TEST-0089] Only restore higher parallelism after the aggregate gate is proven stable at the new boundary. _(see testing-guidelines/harness.md:46)_
46. [TEST-0090] Are multiple recent bugs clustering around the same boundary or component? That may indicate a design-level issue worth addressing instead of patching each symptom individually. _(see testing-guidelines/regression-policy.md:86)_
47. [TEST-0093] System guideline §9 (Load May Slow The System, Not Break It) requires that all subsystems remain correct under load. _(see testing-guidelines/regression-policy.md:316)_

### Ownership & Authority Policies

48. [TEST-0001] When the mutation is lifecycle-related, assert both: - the initial row exists with canonical identity fields; - later transitions preserve owner boundaries and do not recreate or replace the row _(see testing-guidelines/fixtures.md:23)_
49. [TEST-0012] Static guardrail proof is required even when focused unit and integration tests pass. Green behavior tests do not override a failed owner-path guard. _(see testing-guidelines/proof-ladders.md:115)_
50. [TEST-0042] A scenario-driven Quest that changes runtime meaning, decision meaning, or shared reporting must prove the direct owner path and the consuming status, diagnostics, admin, harness, or report surface. _(see testing-guidelines/release-gate.md:36)_
51. [TEST-0046] Identify the audit scope: the production files exercised by the new or modified test plus their direct owner collaborators — the same bounded set as the closure deep dive defined in proof-ladders.md ("Closure deep dive — scope"). Do not widen beyond that set. _(see testing-guidelines/fixtures.md:109)_
52. [TEST-0057] When a bug involves component ownership, lifecycle persistence, or system-table row mutation, tests must prove that the canonical owner is actually used. _(see testing-guidelines/regression-policy.md:148)_
53. [TEST-0059] When a change touches control-plane progression (dispatch, rebalance, split, admission progression, operation timeout handling), tests must prove deterministic owner-path behavior rather than only eventual convergence. _(see testing-guidelines/regression-policy.md:189)_
54. [TEST-0062] If the fixture contract was correct, the next attempt must target the runtime owner boundary that now dominates. _(see testing-guidelines/release-gate.md:42)_
55. [TEST-0065] When an owner path is intentionally unresolved under pressure, publication establishment, or recovery completion, tests must prove the caller receives a structured deferred outcome rather than ambiguous absence. _(see testing-guidelines/regression-policy.md:275)_
56. [TEST-0083] Runtime Quests that touch already oversized files should record whether they are adding local size debt or extracting a smaller owner/helper boundary. _(see testing-guidelines/proof-ladders.md:123)_

### Lifecycle & State Machine Rules

57. [TEST-0060] When a change touches CDC propagation, watches, subscriptions, reconnect loops, buffers, queues, or phase-to-runtime handoff, tests must prove continuity and bounded lifetime, not just eventual correctness. _(see testing-guidelines/regression-policy.md:239)_

### Readiness & Health Contracts

58. [TEST-0066] When a change touches startup, readiness, admin snapshot, service discovery, or another shared control-plane truth surface, tests must prove readers observe and schedule repair instead of repairing inline. _(see testing-guidelines/regression-policy.md:297)_
59. [TEST-0087] A convergence-bug repro MUST exercise the layer where the invariant is produced or violated (the owner write, commit edge, or election), and MUST NOT assert only a downstream projection such as a readiness snapshot or settled cache — a green repro at the wrong altitude never exercises the broken mechanism and is a primary cause of land-correct-but-recur. _(see findings/2026-06-17-steering-doc-clarity-repro-at-correct-altitude.md:5)_

### Caching & Observation Rules

60. [TEST-0080] When a bug depends on stale cache truth, stale routing, delayed authoritative visibility, no-handler witnesses, or other cross-time evidence races, the regression must replay the witness order that triggered the bug rather than asserting only the final steady state. _(see testing-guidelines/regression-policy.md:217)_

### Testing & Harness Guidelines

61. [TEST-0004] If a test is failing, fix the code or the test - do not skip it _(see testing-guidelines/fixtures.md:37)_
62. [TEST-0006] It is FORBIDDEN to: Introduce optional parameters, flags, or configuration that are only used by test harnesses to bypass real logic. _(see testing-guidelines/fixtures.md:56)_
63. [TEST-0008] It is FORBIDDEN to: Weaken validation, skip steps, or short-circuit logic to make a test scenario easier to set up. _(see testing-guidelines/fixtures.md:60)_
64. [TEST-0010] Do not land a test-only change that leaves a known System Guidelines violation in the code path being tested. _(see testing-guidelines/fixtures.md:120)_
65. [TEST-0020] Do not ignore a failing test. A failing test indicates broken functionality and must be treated as a stop-the-line signal for the touched area. _(see testing-guidelines/regression-policy.md:376)_
66. [TEST-0026] Do not rely on a broad scenario test alone when the bug is in a narrow system-table write path. _(see testing-guidelines/fixtures.md:28)_
67. [TEST-0028] Mechanical test edits (renames, import updates, timeout adjustments, formatting) do NOT trigger this gate. _(see testing-guidelines/fixtures.md:104)_
68. [TEST-0029] Do not reclassify a slow unit test as "integration" to dodge the hard error — move the file into the integration set only if it genuinely needs the integration harness. _(see testing-guidelines/harness.md:56)_
69. [TEST-0030] When a test exceeds its duration limit (2 seconds for a unit test, 30 seconds for an integration test) you must not accept it as passing; remediate before proceeding by identifying the root cause and then resolving it. _(see testing-guidelines/harness.md:64)_
70. [TEST-0032] A test that fails because behavior regressed MUST be fixed (in the code or the test), and MUST NEVER be deleted or skipped to make the suite green; deletion is reserved for behavior that was intentionally removed. _(see testing-guidelines/regression-policy.md:382)_
71. [TEST-0040] The test must fail with the current code _(see testing-guidelines/regression-policy.md:22)_
72. [TEST-0044] A test MUST assert the real, unconditional production behavior, and MUST NEVER set, branch on, or pin a feature flag to make an assertion pass. A green test that only holds while a flag is in one position proves the flag, not the behavior. _(see testing-guidelines/fixtures.md:83)_
73. [TEST-0045] Production feature flags are within-session scaffolds only — NO flag survives the session that lands it (user directive 2026-06-26, re-affirmed 2026-07-02). By the end of the session a flag MUST be either baked in unconditionally (the flag deleted and the new behavior made the only path) or removed together with the functionality it gated; a flag MUST NOT linger as a production toggle, owned or otherwise — there is no enrolled multi-session regime. Flags inherited from before this rule are recorded debt, not license (see roadmap.md "Feature Flag Lifecycle" for how they are retired). Whichever way the flag resolves, the tests assert the real production behavior — bake the chosen behavior in first, then update the test to assert that unconditional behavior; a test never pins a flag either way. _(see testing-guidelines/fixtures.md:87)_
74. [TEST-0047] Invoke targeted tests via the committed runner or tap directly - npm run test:file -- <test-file...> (the committed scripts/run-test-files.js fail-closed runner: empty TAP streams, skips, and todos all fail; --filter <substring> narrows the provided file list by path substring and fails closed when nothing matches). npx tap <test-file...> is the equivalent direct invocation (tap is the suite runner; the sharded test:* scripts shell out to it). Do NOT use npm test -- <file> or npm test -- --grep "pattern": the test script is the full sharded suite and silently ignores extra arguments, so those forms run everything while appearing filtered. _(see testing-guidelines/harness.md:125)_
75. [TEST-0050] Every test that exists must run and pass. _(see testing-guidelines/fixtures.md:33)_
76. [TEST-0052] The test suite must prove that production code works — not that a test-friendly fork of it works. _(see testing-guidelines/fixtures.md:73)_
77. [TEST-0055] All bug fixes MUST be preceded by a failing test that reproduces the bug. _(see testing-guidelines/regression-policy.md:17)_
78. [TEST-0061] When a Quest exists because a distributed, integration, load, or scenario failure must be resolved, the Quest must keep one named reference scenario or probe as its doneWhen. _(see testing-guidelines/release-gate.md:18)_
79. [TEST-0067] Tests MUST verify this property at the unit and integration layers, not only in the distributed harness. _(see testing-guidelines/regression-policy.md:318)_
80. [TEST-0068] Failures discovered in the touched area, or discovered by the test runs chosen for the current change, must be resolved before the task closes. _(see testing-guidelines/regression-policy.md:371)_
81. [TEST-0074] leftover scaffolds — a flag, test-only path, or dead branch the change should have removed. _(see testing-guidelines/proof-ladders.md:61)_
82. [TEST-0075] The test should capture the exact failure scenario from the bug report _(see testing-guidelines/regression-policy.md:23)_
83. [TEST-0077] The fix should make the failing test pass _(see testing-guidelines/regression-policy.md:31)_
84. [TEST-0079] When adding a new test file, or making a behavior-meaningful change to an existing test — new or changed assertions about production behavior — you must also audit the code under test for System Guidelines violations and fix them as part of the same change. _(see testing-guidelines/fixtures.md:101)_
85. [TEST-0091] The test-only-paths rule and this flag-coupling rule together close the loop — neither tests nor production may smuggle a flag into the proof. _(see testing-guidelines/fixtures.md:78)_
86. [TEST-0092] Only run the complete test suite (npm test) at: - Checkpoint tasks explicitly marked in the active Quest's doneWhen or frontier list; - Final integration verification; - When explicitly requested by the user _(see testing-guidelines/harness.md:143)_

### Code Style & Formatting Guidelines

87. [TEST-0048] Soft-warning two-strikes. The SAME soft warning (a load-flake, a tolerated timeout, a "known transient") appearing in two consecutive runs of the same scenario MUST be treated as a failing assertion, not background noise: before the third run, open a finding and either fix the cause, re-derive the threshold with evidence, or promote it to a hard failure — NEVER carry the same "proceeding anyway" past run 2. Strike identity is precise: the same warning CODE (a softBreaches[].reasonCode/invariantId or an assertion-policy softWarnings[].code such as insufficient_evidence) plus the same scenario id, in the two most recent consecutive runs of that scenario, regardless of which session produced them; a code absent from either of those two runs does not strike. The machine check is npm run analyze:soft-warning-strikes (optionally -- --scenario <id>): it scans the run-report corpus and exits nonzero naming each striking code+scenario. _(see testing-guidelines/regression-policy.md:99)_
88. [TEST-0049] An upward re-anchor MUST satisfy all of: the gate was silently red (never ran clean before), it happens at most once per gate, it anchors at measured reality, and the same commit records BOTH a dated in-code comment naming the measured value and the refactor target (the existing idiom) AND a decision-log entry in the owning epic. _(see testing-guidelines/release-gate.md:104)_
89. [TEST-0070] Committed static-gate baselines — the BASELINE_COUNT constants in scripts/check-complexity.js / scripts/check-cognitive-complexity.js, the file-size baselines in scripts/check-file-size-thresholds.js, and known-violations files such as .dependency-cruiser-known-violations.json — MUST NOT increase, with the single re-anchor exception below. _(see testing-guidelines/release-gate.md:98)_

### Governance & Scope Controls

90. [TEST-0035] Tests added during the change must match the Quest concern rather than an unrelated umbrella scope. _(see testing-guidelines/proof-ladders.md:23)_
91. [TEST-0039] If a Quest touches an inherited oversized source-code file, it must extract or refactor the touched file until it is within its scope threshold before closure. _(see testing-guidelines/proof-ladders.md:133)_
92. [TEST-0071] Existing violations in touched files must be fixed when they are part of the same semantic boundary (one owner / one concern, per system-guidelines §2 One Semantic Owner Per Concern). If they are genuinely outside scope, the Quest must name the excluded boundary and record a follow-on Quest/frontier before closure. _(see testing-guidelines/proof-ladders.md:110)_
