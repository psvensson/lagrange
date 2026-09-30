# GCP baseline re-profile at e9774db2e (2026-09-04 04:31–04:41Z) — A3 distributed effect + formation classification

Run identity: image `distributed-db:test` label `ddb.git-hash = e9774db2e22f`
(== origin/main == local); five hosts `ddb-test-vm-{0..4}` (europe-central2-a,
created 04:33Z), none remaining after the run; node logs pulled to
`data/examples/service-data-affinity-demo/node-{0..4}.log` (copies in the
session scratchpad `runs/gcp-e9774db2e/`). Command:
`LAGRANGE_LOOP_GAP_PROFILE=1 LAGRANGE_AFFINITY_DEMO_GCP=1 npm run demo:movielens`
(operator-run). Result: cluster formed (joiners start 04:35:00; admission
transitions begin 04:35:59); schema admission oscillated 04:35:59–04:39:00
and timed out: `control_plane_pressure=Timed out opening admin websocket`.
Reports: `test-output/reports/movielens-*-2026-09-04T04-41-33-*.report.json`.

## A3 distributed effect (seed node-0, whole log 04:34:43–04:39:04, 5 windows)

| metric | inert v3 (15:13Z, 92 s) | v4 (17:03Z, 92 s) | e9774db2e |
| --- | --- | --- | --- |
| evaluations (build+reuse+unowned) | 4,396 (2,867/min) | 2,721 (1,775/min) | 30,679 (**7,135/min**) — caller cadence higher, formation progressed further |
| owner builds | 4,396 | 1,606 (1,047/min) | 7,498 (1,744/min) |
| builds / evaluation | 1.00 | 0.59 | **0.24** |
| owner reuse | 0 | 1,115 (41.0%) | **23,181 (75.6%)** |
| unowned / unkeyed builds | 0 | 0 | 0 |
| build causes | n/a | n/a | nodeEvidence (own heartbeat/transport) 5,041 = 67%; priorityControlPlaneRecovery 1,708 = 23%; runtimeAuthority 298; dimensions 102; membershipPublication 89; initial 260; **cluster-wide segments 0** |
| owner build CPU (tagged) | 2,641 ms/92 s | 1,959 ms/92 s (1,277/min) | 5,020 ms/258 s (1,167/min) |
| joiner reuse | ~0 | 36–61% | 46 / 59 / 77 / 79% |
| GC self (V8 sampled) | 2,950 ms (2 windows) | 3,356 ms (2 windows) | 16,736 ms (8 windows, 243 s) — top self frame; not attributable per subsystem |
| normalize/copy/freeze self | — | — | copyStrictOwnDataRecord 10,680 ms + appendOwnArrayValue 1,786 ms (callers: readiness-planning token records `appendArrayValue`/`freezeTokenRecord` 8,518 ms self, plus owner builds 5,020 ms tagged); `canonicalRecordDigest` (new key) 814 ms |
| seed event loop | 28.5 s blocked / 92 s (33%), 11 gaps | 55.6 s / 92 s (71.5%), 16 gaps | **37.4 s / 258 s (15.5% of wall, 5.8% of log span), 17 gaps** |
| largest gap | 4,412 ms | 6,720 ms | **4,095 ms** |
| ELU in gaps | — | 1.0 | min 0.72 / mean 0.98 / max 1.0 |
| host-scheduling validity | (run continued) | no verdict (died pre-evidence) | **PASS** (`exceeded=false`: max 4.1 s < 10 s, total 37.4 s < 60 s, blocked 5.8% < 20%) |

Verdict: the distributed invariant holds — cluster writes no longer rebuild
every node; builds track only semantically affected node generations (67% the
node's own evidence, 23% its recovery verdict, 0% cluster-wide), while the
caller cadence is 4× higher than in the v4 run because formation now reaches a
far busier phase. A3 is closed architecturally on GCP.

## Gap attribution (seed)

- Formation window 04:34:53–04:35:24: 7 gaps 1.1–4.1 s with the unexplained
  share (`publication_recovery_gate_snapshot_build`,
  `priority_recovery_planning_projection_build`, owner builds, raft apply).
- After 04:35:32: every gap fully tagged, led by **`storage_reservation_reconcile`**
  (47 calls, 34,527 ms total; gaps of 1.1–2.9 s), then
  `raft_follower_commit_apply_slice` (47,474 calls / 13.3 s),
  `publication_recovery_gate_snapshot_build` (147,458 / 8.9 s),
  `priority_recovery_planning_projection_build` (184,365 / 4.7 s), owner
  builds 5.0 s. Each `control_plane_pressure` admission observation (12×,
  every ~10–20 s) coincides with one of those storage-reconcile gaps: the
  demo's admin snapshot websocket open times out while the seed is blocked.

## Formation classification

Five nodes ACTIVE, join complete, host validity PASS ⇒ event-loop starvation
is no longer the formation blocker. The run then stalls in schema admission
for a LOGICAL reason (Outcome C shape, downstream of formation):

1. Admission transitions alternate `operation_drain_progressing`
   (`replica_operations_in_flight`, `critical_system_spread_open`),
   `critical_spread_open`, and `control_plane_pressure`; never stable.
2. The seed's critical-system rebalancing planner logged **601×**
   "Waiting for transitional cluster membership to settle"
   (`planningState: topology_settling_blocked`,
   `blockerReason: node_ready_lease_incomplete`) from 04:34:59 to 04:38:58, with
   the unready set oscillating between 4 (the joiners) and **5 (the seed
   itself)** — so critical rebalancing never planned; plus 173 "Deferring
   spread-driven count-increasing ADD ... at/over target replica count" for the
   six critical system partitions.
3. The gate's readiness input (`isCriticalNodeReady` →
   `getNodeReadinessSync(nodeId, {allowStaleOnCacheChange:false})`, dimension
   `controlPlaneRecoveryEligible`/`repairEligible`) is served the planning
   owner's DEFERRED contract: `reasonCodes: ["planning_snapshot_refresh_pending"]`,
   `lifecycleState: null`, **all 12 dimensions false** — 47 routing denials
   logged 04:35:16–04:38:36, 35 of them for the SEED's own node id, and the
   routing snapshot shows `all_services_filtered_by_readiness`
   (`routableServiceCount: 0`). Evidence-absence is read as "unready" by both
   the settling gate and routing, for four minutes.

FIRST REMAINING RELEASE BLOCKER: ReadinessPlanningSnapshotOwner completed-
snapshot admission under post-formation churn — the seed's own owner key
(and joiners') stays `planning_snapshot_refresh_pending` (deferred contract)
instead of being admitted, so the critical topology settling gate reports
`node_ready_lease_incomplete`, critical rebalancing never plans,
`critical_system_spread_open` persists and schema admission cannot stabilize.
Co-factor: `storage_reservation_reconcile` 1–3 s synchronous gaps turn the
admin snapshot lane into `control_plane_pressure` observations. Phase: schema
admission (04:35:59–04:39:00). Prime hypothesis for the deferral (untested): the
planning derivation key flap under mixed clocks (~14 rotations/s/node, see the
v1 measurement finding) keeps the planning token/floored generation rotating
faster than completed snapshots can be admitted — the exact liveness the
`readiness-freshness-macrotask-bound` pair contract governs.

NOT meaningful yet: the frozen five-owner critical-placement A/B — the
baseline reaches the critical-placement phase but the critical planner never
plans (settling gate blocked), so candidate-vs-baseline critical convergence
would be confounded by the upstream readiness deferral.
