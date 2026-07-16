# Solve report: movielens-colocated-follower-replacement-source

**Goal:** Explicit per-replica Raft roles are authoritative over a co-located partition leader-node hint when choosing count-neutral replacement sources, missing or unrecognized roles retain conservative node-level fallback, and the production five-node MovieLens milestone completes schema admission, durable ratings creation, 100000-row preload, ratings-only split convergence, and the successful three-way report.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-ready-lease-maintenance-critical-owner-lane
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-colocated-follower-replacement-source-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-20260716-partition-leader-node-id-overclassifies-explicit (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-colocated-follower-replacement-source-main

## Continuation
- Status: blocked-unrecorded-evidence
- Next action: record or select a fresh frontier theory for movielens-colocated-follower-replacement-source-main
- Blocker: fresh frontier evidence is not recorded; run node scripts/solve.js ingest-evidence --id movielens-colocated-follower-replacement-source --frontier movielens-colocated-follower-replacement-source-main --evidence test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T03-53-10-842Z.report.json

## Scope Pressure
- Changed files: 2
- Change bytes: 5652
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **movielens-colocated-follower-replacement-source-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The sealed production symptom reproduces on changed HEAD 7bd3691f: five nodes formed, but schema admission timed out on cache_stale_watermark after the unchanged 60-second stability/evaluation policy. The live report SHA-256 is 0f2a9e1d2ee3e460e3de02f45d1ae4eccd9acd876ab7e5b7e0c854b4c10332e1 and the immutable log archive SHA-256 is 9d781908c1c6d1c2dc997b9c041243ab2a2c7db0d45234215b32b2f11c70c9e8. The critical-lane change was engaged but did not close the lease gap; no unchanged rerun is authorized. (rules out: Do not rerun unchanged or continue by changing only dispatch priority; that intervention was live-engaged and insufficient.) [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T02-43-50-868Z.report.json]
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The immutable changed-live archive shows authoritative nodes-row refresh gaps above the 15-second ready lease for four peers (approximately 17-19 seconds), while heartbeats recover and continue. Source trace shows the sender stamps the expiry at attempt start, then the canonical node-state publication owner advances last_heartbeat to owner receive time but preserves the earlier sender expiry whenever it remains future. Transport, queue, write, and CDC latency therefore consume the authoritative lease before visibility. (rules out: Absence of heartbeat production, the prior logs-table topology gap, and publication-pressure lane selection are not the current blocker; discriminate authoritative lease rebasing at the publication owner with a delayed-delivery deterministic test.) [data/examples/service-data-affinity-demo-archive/wave4-live-critical-ready-lease-2026-07-16T02-43-50-868Z.tar.gz]
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The real ReplicaDispatchService.handleNodeStateUpdate owner seam reproduced the lease-shortening mechanism: with a lagged READY heartbeat and a still-future five-second sender expiry, the pre-change test stored only that shortened expiry and failed the full-lease assertion. After the owner change, the exact test passes and stores ready_lease_expires_at = owner-normalized last_heartbeat + readyLeaseMs. Eight serial adjacent suites pass 509 assertions; ESLint, runtime grammar, state-machine pressure, and the full contract/model stack pass. (rules out: The next changed-live run is justified by a red-on-current real-owner proof; do not substitute an injected gateway seam or weaken stale/non-READY semantics.) [test/control-plane/replica-dispatch-node-state-update-payload-wakeup-slow-write.test.js]
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The production command npm run demo:movielens executes run-comparison.js, which imports runAffinityDemo as a library. The Lagrange live report is currently emitted only by run-affinity-demo.js's CLI guard, so the changed failure produced a fresh movielens-three-way-affinity-demo-live report but no fresh movielens-lagrange-service-affinity-live report watched by the sealed Quest probe. The last watched report remains 2026-07-15T23:55:31.481Z. One live execution must emit both the sealed Lagrange phase report and the final three-way comparison report; manual report conversion or a second unchanged live run is forbidden. (rules out: Do not change the sealed Quest scenario, manually relabel the comparison report, or run run-affinity-demo.js separately; repair the production comparison entrypoint's success/failure reporting handoff.) [examples/service-data-affinity/run-comparison.js]
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The production runComparison entrypoint test was red on current HEAD because it supplied no phaseEvidence to runAffinityDemo and never invoked writeAffinityDemoLiveReport on success or three-way validation failure. After the change, the exact entrypoint emits one sealed live report only after successful three-way validation, emits one failed report with the same accumulated evidence on validation failure, and emits an honest not-observed failure report when PostgreSQL fails before Lagrange starts. The focused suite passes 35 assertions and five adjacent MovieLens suites pass 337 assertions; ESLint, diff, size, and scoped complexity/cognitive ratchets pass. (rules out: The single changed production run will now produce the sealed Lagrange report and final comparison report; do not relabel reports, edit the Quest probe, or execute a second Lagrange run.) [test/runtime/movielens-live-report-partial-evidence.test.js]
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The single changed live run at checkpoint 345f1787 formed five nodes and cleared the prior stale-ready/topology gap, but the fixed 180000ms schema gate ended on replica_operations_in_flight=3. The sealed Lagrange report sha256 is c54b2f416a8200d19cd07c36223794540981de6b366a3f674c15025bb0784c03, the three-way failure report sha256 is 1ef407afcf2fed80f869c42a13a2577b3cd51d396ea026a84617368d716f1f76, and the immutable archive sha256 is 1f266162a2c57215f03b6cdf1a8c39370787b45a3f25f6a0b4cee4e3d3fa354f. No unchanged rerun is authorized. (rules out: Do not widen the schema budget, weaken the 60000ms window, retry unchanged, or return to ready-lease dispatch/freshness; the lease fix engaged and the blocker moved to live replacement work.) [data/examples/service-data-affinity-demo-archive/wave4-live-owner-rebased-2026-07-16T03-24-21-216Z.tar.gz]
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The immutable authority/log witness pins a placement source-selection violation. Priority spread became steady at 03:22:34, early enough for the sealed window, but the first replica_operations and control_plane_publications REPLACEs selected r1, while boot logs prove r1 was each partition's leader and r2/r3 were followers co-located on the same seed. move-planner isLeaderRemovalCandidate treats every replica on partitionRow.leader_node_id as leader even when that replica has explicit follower raft_role, so stable ordering cannot prefer the followers. Publication leadership later moved to d82d1da8; its convergence trace regressed to publishedActiveNodeCount=2/5 and priority_spread_pending, while fresh surplus ADD/drain work kept three operations live at timeout. (rules out: This is not an irreducible elapsed tail: the leader-preservation contract has a deterministic explicit-role counterexample at the move-planner owner seam.) [data/examples/service-data-affinity-demo-archive/wave4-live-owner-rebased-2026-07-16T03-24-21-216Z.tar.gz]
- **movielens-colocated-follower-replacement-source-main**: inherited from movielens-ready-lease-maintenance-critical-owner-lane: The exact two-file move-planner source-selection patch is deterministically proven, but recording it here was rejected at the precommit boundary because the existing Quest history spans 13 files, 8 owners, and 35999 bytes. Split the colocated replica-role authority change into a linked single-owner child Quest; no source or test change is discarded and no live rerun occurs before exact verification. (rules out: Do not baseline or bypass aggregate scope pressure, widen the current Quest, or retry live without recording the source change in the bounded child.) [solve/changes/movielens-ready-lease-maintenance-critical-owner-lane/attempt-4.diff]
- **movielens-colocated-follower-replacement-source-main**: The real MovePlanner.calculateMoves owner seam reproduces the live source-selection violation: with r1 leader and r2/r3 explicit followers co-located on partition.leader_node_id, pre-change stable ordering selects r1 as the first count-neutral REPLACE source. The owner change selects r2, emits exactly one serialized REPLACE, and preserves conservative node fallback when r1 has no role. The focused suite passes 12 assertions, six serial adjacent planner/placement files pass 199 assertions, state-machine pressure and three formation/interlock scenarios pass, and the full contract/model stack passes. (rules out: The next live run is justified by a red-on-current exact owner counterexample; do not change move count, remove safety, critical serialization, time budgets, or the harness.) [test/rebalancer/surplus-drain-prefers-non-leader-source.test.js]
- **movielens-colocated-follower-replacement-source-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T03-24-21-212Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T03-24-21-212Z.report.json]
- **movielens-colocated-follower-replacement-source-main**: Independent exact-attempt verification APPROVED. Artifact/base/current scoped diff matched; isolated source-only revert failed only the three new leader-source behavior assertions while all pre-existing assertions stayed green. Focused and supplemental role cases covered leader, follower, candidate, learner, missing, and unrecognized roles; five adjacent suites, formation/interlock scenarios, state-machine pressure, full model contracts, lint, diff, size, literals, decision-boundary, boundary-mode, and runtime grammar all passed. Move count, target set, critical serialization, removed-set safety, CL-038 retention, and pending accounting are unchanged; complexity is identical to the inherited baseline. [subagent:verify_wave4_colocated_source_attempt1]
- **movielens-colocated-follower-replacement-source-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T03-53-10-842Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T03-53-10-842Z.report.json]

## Theories
- **theory-20260716-partition-leader-node-id-overclassifies-explicit** [falsified] frontier, frontier movielens-colocated-follower-replacement-source-main, layer ownership, mechanism partition leader_node_id overclassifies explicit co-located follower replicas as leaders during replacement-source ordering, owner move_planner_removal_source_owner, boundary replica raft role to count-neutral replacement source selection, modelGate npm run model:contracts

## Selected Theories
- **movielens-colocated-follower-replacement-source-main**: theory-20260716-partition-leader-node-id-overclassifies-explicit

## Theory Results
- **theory-20260716-partition-leader-node-id-overclassifies-explicit**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T03-24-21-212Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T03:41:21.345Z | movielens-colocated-follower-replacement-source-main | observe | 1 -> 1 | flat | no_evidence | theory-20260716-partition-leader-node-id-overclassifies-explicit | diff:solve/changes/movielens-colocated-follower-replacement-source/attempt-1.diff |
