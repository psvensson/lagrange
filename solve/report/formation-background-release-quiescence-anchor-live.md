# Solve report: formation-background-release-quiescence-anchor-live

**Goal:** The unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on one fresh run, and while the existing background formation-release handoff is active, authoritative topology-shaping replica work resets its maturity clock so ordinary work remains closed until the existing 60000ms admission interval plus 10000ms observation handoff has elapsed after operation drain; priority recovery stays exempt and ordinary work never rearms the fence after release.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 5

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-background-release-owner-closure
- plan: solve/epics/topology-convergence-hardening.md

## Scope Pressure
- Changed files: 7
- Change bytes: 29285
- Owner areas: examples, src/rebalancer, test/rebalancer, test/runtime
- Categories: other, runtime, test
- Action: land or separate 4 owner areas: examples, src/rebalancer, test/rebalancer, test/runtime
- Split plan:
  - src/rebalancer: 3 file(s)
  - examples: 2 file(s)
  - test/rebalancer: 1 file(s)
  - test/runtime: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-background-release-quiescence-anchor-live-main** [parked {exhausted}] rung 3, attempts 5, metric 1 -> 1 — Two source-stable live refutations prove the Quest's local background-release intervention cannot guarantee the sealed MovieLens closure while schema admission starts from a later independent observation; continuing would violate the live-refutation two-strikes rule, so ownership must pivot to the shared canonical drain-anchor boundary.

## Findings
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-18T09-27-31-414Z.json]
- **formation-background-release-quiescence-anchor-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-background-release-quiescence-anchor-live-main**: attempt 1 did not prove work appearing after priority clear [subagent:root/quiescence_anchor_verifier]
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-18T09-30-47-206Z.json]
- **formation-background-release-quiescence-anchor-live-main**: Failed live run repeatedly evaluated the production background planning gate while schema ADDs were in flight: ADD creation began at node-0.log:4467 and background stability samples continued through node-0.log:4719 before the final ADD drain at node-0.log:4876, so the active-clock reset path is engaged by the unchanged scenario. [log:data/examples/service-data-affinity-demo/node-0.log]
- **formation-background-release-quiescence-anchor-live-main**: attempt 2 can miss topology work that starts and drains between scheduled background evaluations [subagent:root/quiescence_anchor_verifier]
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/rebalancer/unified-rebalancer.test.js [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-18T09-44-04-735Z.json]
- **formation-background-release-quiescence-anchor-live-main**: independent verification passed [subagent:root/quiescence_anchor_verifier]
- **formation-background-release-quiescence-anchor-live-main**: The unchanged live symptom reproduced on the step-pinned base: background planning released only 11.481 seconds after schema operation drain and the priority metric remained 1. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **formation-background-release-quiescence-anchor-live-main**: The fresh source-stable run proves the active ordinary-release fence matured from the 14:11:29.378 topology-drain anchor and released at 14:12:39.905, while schema admission had not completed its independent quiet proof; the two maturity clocks can diverge. (rules out: a wedged package_registry_overrides repair ADD, the effective-placement serial priority planner, or split-snapshot pacing as the cause of this schema-admission miss) [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-3-live-boundary-2026-07-19.md]
- **formation-background-release-quiescence-anchor-live-main**: The report retains only the final post-release schema snapshot, so the exact real pre-release reset or delay condition is not attributable from this archive; the transient 14:11:28.720 observer repair failure alone does not prove a schema-window reset. [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-3-live-boundary-2026-07-19.md]
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/runtime/movielens-preload-admission-gate.test.js [dt:solve/changes/dt-prove/movielens-preload-admission-gate.test.js-2026-07-19T14-30-32-571Z.json]
- **formation-background-release-quiescence-anchor-live-main**: attempt 4 preserves admission behavior but introduces cyclomatic complexity 17 over the hard threshold 12 in buildSchemaAdmissionTransition; split the projection into smaller named builders before approval [subagent:root/schema_transition_verifier]
- **formation-background-release-quiescence-anchor-live-main**: DT red-on-revert proven for test/runtime/movielens-preload-admission-gate.test.js [dt:solve/changes/dt-prove/movielens-preload-admission-gate.test.js-2026-07-19T14-36-57-641Z.json]
- **formation-background-release-quiescence-anchor-live-main**: independent verification passed [subagent:root/schema_transition_verifier]
- **formation-background-release-quiescence-anchor-live-main**: The fresh ordered gate proves formation and schema admission green, then moves the live blocker to the runtime-service executor-outcome dependency handoff: both runtime replicas are durably ACTIVE but their ADD rows remain CREATING because seed/join late binding repairs replica and message-group handlers while omitting the already-created RuntimeServiceHandler, so its first rebalance never returns to schedule an affinity-policy recheck. [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-runtime-outcome-handoff-2026-07-19.md]
- **formation-background-release-quiescence-anchor-live-main**: Fresh source-stable transition history falsifies the earlier run-specific green-clock conclusion: canonical topology drain was 1784479343800, schema stability started 6673ms later, its first confirmation landed at drain+69134ms, and ordinary REPLACE creation began at drain+70030ms before the second confirmation. (rules out: Do not treat the earlier single green schema run as proof that the competing-clock boundary is permanently closed; the retained history now reproduces it with exact shared-drain lineage.) [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-schema-drain-anchor-recurrence-2026-07-19.md]
- **formation-background-release-quiescence-anchor-live-main**: Live-refutation two-strikes reached: the earlier measured clock divergence and the fresh retained-history recurrence both show the fixed 70000ms release can precede the second schema confirmation when the observer clock starts later than the canonical drain; attempt 6 was aborted and the framing must move to the shared drain-anchor boundary. (rules out: No further patch or unchanged rerun belongs in formation-background-release-quiescence-anchor-live.) [solve/changes/formation-background-release-quiescence-anchor-live/post-attempt-5-live-schema-drain-anchor-recurrence-2026-07-19.md]

## Theories
- **theory-20260719-background-release-samples-production-priority-placement** [active] system, mechanism Background release samples production priority placement and topology-operation drain into one tracker, while schema admission separately classifies authoritative snapshots and keeps its reset state only in a local polling loop; no retained transition watermark explains a cross-clock divergence., owner background-priority-spread release tracker and schema-admission quiescence observer at their shared control-plane observation boundary, modelGate npm run model:contracts
- **theory-20260718-a-scheduled-background-recheck-can-recover** [falsified] frontier, frontier formation-background-release-quiescence-anchor-live-main, layer observation, mechanism a scheduled background recheck can recover topology work missed between evaluations from a terminal coordinator-owned operation whose completion watermark is newer than the active priority-clear clock, modelGate npm run model:contracts
- **theory-20260719-the-schema-admission-loop-discards-every** [falsified] frontier, frontier formation-background-release-quiescence-anchor-live-main, layer observation, mechanism The schema-admission loop discards every poll except the last, so the exact pre-release real reset that distinguishes a production gate defect from observer-only blindness cannot be selected from preserved live evidence., owner affinity-demo schema-admission evidence builder, boundary authoritative control-plane quiescence snapshot to schema stability-window evidence, modelGate npm run model:contracts
- **theory-20260719-the-final-only-schema-report-still** [falsified] frontier, frontier formation-background-release-quiescence-anchor-live-main, layer observation, mechanism The final-only schema report still loses the pre-release reset, but attempt 4's monolithic evidence projection exceeded the static complexity contract even though its runtime behavior was correct., owner affinity-demo schema-admission evidence builder, boundary authoritative quiescence classification to bounded timeout evidence, modelGate npm run model:contracts
- **theory-20260719-schema-window-drain-anchor-handoff** [active] frontier, frontier formation-background-release-quiescence-anchor-live-main, layer observation, mechanism schema_stability_window_starts_at_late_poll_instead_of_retained_topology_drain, owner schema_admission_observer, boundary background_release_to_schema_quiescence_handoff, modelGate npm run model:contracts

## Selected Theories
- **formation-background-release-quiescence-anchor-live-main**: theory-20260719-schema-window-drain-anchor-handoff

## Theory Results
- **theory-20260718-a-scheduled-background-recheck-can-recover**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T09-04-17-360Z.report.json]
- **theory-20260718-a-scheduled-background-recheck-can-recover**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T14-13-43-444Z.report.json]
- **theory-20260719-the-schema-admission-loop-discards-every**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T14-13-43-444Z.report.json]
- **theory-20260719-the-final-only-schema-report-still**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T14-13-43-444Z.report.json]
- **theory-20260719-the-final-only-schema-report-still**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T14-57-13-589Z.report.json]
- **theory-20260719-the-final-only-schema-report-still**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T16-44-58-388Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T09:28:32.204Z | formation-background-release-quiescence-anchor-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-1.diff |
| 2026-07-18T09:30:59.131Z | formation-background-release-quiescence-anchor-live-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-2.diff |
| 2026-07-18T09:44:49.860Z | formation-background-release-quiescence-anchor-live-main | widen-scope | 1 -> 1 | flat | no_evidence | theory-20260718-a-scheduled-background-recheck-can-recover | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-3.diff |
| 2026-07-19T14:32:39.548Z | formation-background-release-quiescence-anchor-live-main | model | 1 -> 1 | flat | no_previous | theory-20260719-the-schema-admission-loop-discards-every | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-4.diff |
| 2026-07-19T14:37:05.278Z | formation-background-release-quiescence-anchor-live-main | model | 1 -> 1 | flat | no_previous | theory-20260719-the-final-only-schema-report-still | diff:solve/changes/formation-background-release-quiescence-anchor-live/attempt-5.diff |
