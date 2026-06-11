# Distributed Closure Ledger

## Purpose

This ledger tracks the remaining distributed-runtime closure work for the
membership lifecycle and placement hard cutover using the grammar defined in
`closure-grammar.md`.

Each record below represents one violated invariant.

## Status Summary

| Id | Status | Concern | First Violated Invariant |
| --- | --- | --- | --- |
| CL-001 | narrowed | membership-publication | All nodes in the active gate must converge on one published membership epoch and one published active-node set before load-active can pass. |
| CL-002 | narrowed | harness-control-snapshot | The cluster-active witness path must obtain one complete control snapshot from an admin-ready node once canonical publication is queryable. |
| CL-003 | guarded | placement-priority-spread | Priority control-plane partitions must recover to required distinct-node spread before non-priority closure is considered complete. |
| CL-004 | narrowed | readiness-projection | Benchmark load-lane admission must become serve-eligible for at least one admitted writer shortly after benchmark table bootstrap and join handoff. |
| CL-005 | narrowed | readiness-projection | Partitioning pre-load bootstrap must expose the required replica-bearing quorum and at least one benchmark-ready replica-bearing node before scenario load startup begins. |
| CL-006 | guarded | membership-join-lifecycle | A retryable failure of a checkpointed join step must not regress durable join progress (destroy join infrastructure or withdraw registered membership rows); only terminal failures may run destructive cleanup. |
| CL-007 | guarded | transport-liveness | The ACK-timeout quarantine may sever a connection only on evidence the peer is dead (no inbound traffic within the liveness window) — never for a peer that is demonstrably alive but slow. |
| CL-008 | narrowed | placement-planning-feedback | Planning-side reuse of an in-flight operation must be side-effect-free: it must not re-trigger owner reads, claim writes, and remote dispatch attempts at planning cadence while the dispatch layer already has a live retry scheduled. |
| CL-009 | open | transport-replication-backpressure | Per-source outbound backpressure rejection must not convert every partition write into an unthrottled per-attempt warn + immediate sender retry against a stillborn replica. |

## CL-001 Published Membership Convergence Under Restart Churn

- Status: narrowed
- Concern: membership-publication
- Failure Class: convergence-lag
- First Violated Invariant: All nodes in the load-active gate must converge on
  one published membership epoch and one published active-node set before the
  cluster can be considered active.
- Authoritative Owner: membership lifecycle and publication owner path,
  centered on published membership artifacts consumed by the readiness gate.
- Authoritative State: published membership epoch and published active-node set.
- Allowed Evidence: authoritative publication rows, lifecycle-owner output,
  publication diagnostics, bounded transport health evidence.
- Forbidden Promotion Inputs: cache visibility alone, raw services rows,
  bootstrap or join phase state, transport connectivity as active-set truth.
- Convergence Trigger: owner-key reconcile and publication completion after
  restart or rejoin events.
- Stable Witness: per-node published membership epoch, per-node published
  active-node set, and the publication convergence reason set observed by the
  load gate.
- Entry Gate: `Cluster._waitForAllActive()` load-mode cluster-active gate.
- Current Symptom: distributed restart scenarios report nodes active by status,
  but load-active still stalls with incomplete snapshot coverage and
  publication convergence pending.
- Scope: rolling restart under load remains the smallest known scenario that
  reproduces the disagreement with current evidence.
- Next Falsification Step: extend the cluster-active progress snapshot to emit
  the per-node published epoch and active-set witness that the gate is using
  when it reports publication convergence pending.
- Required Guard: a targeted characterization or harness assertion proving the
  gate reports which node or nodes disagree on published epoch or active set.

### Evidence

1. Task 27 reruns reported `activeByStatus=true` while the cluster-active gate
   still failed on snapshot coverage and publication convergence.
2. Repo notes show rolling restart continuing to surface
   `control_plane_publication_pending` and `publishedConvergencePending`
   symptoms after durable rejoin startup classification was fixed.
3. The load-active gate in [test/distributed/harness/cluster.js](test/distributed/harness/cluster.js#L5932)
   combines active status, complete snapshot coverage, and publication
   convergence before declaring the cluster active.
4. The readiness service still emits canonical publication-pending reasons in
   [src/control-plane/control-plane-readiness-service.js](src/control-plane/control-plane-readiness-service.js#L2084).
5. Fresh rolling-restart rerun `rolling-restart-ledger-20260328T063059Z` did
  reach a stronger earlier witness with publication epoch `2`, published
  status `PUBLISHED`, selected snapshot coverage `5/5`, and zero missing
  published nodes before the scenario later timed out.
6. Stat-gate `stat-gate-20260610T155735Z` (4 runs, owner-driven flag ON, clean
  containers, srcFingerprint 85565ecae3a130c4): 2 CONVERGED / 2 STALLED by the
  gate's publication-only classifier, 0 corrupt, 0 stale-source. CORRECTED
  READING (2026-06-10, verified against stage timelines + per-node full logs):
  **all four runs failed the scenario at `scenario.load-readiness` during
  INITIAL formation — no run ever reached the rolling-restart phase**, so the
  CONVERGED/STALLED labels describe publication convergence only, and the
  earlier "rejoiner re-entry" framing of this evidence was wrong (no node ever
  restarted). The verified run-2 causal chain, all timestamps from
  `test-output/reports/.playback/stat-gate-20260610T155735Z-run{2,3}/.full-logs/`:
  (a) joiners start 16:06:12; two of four (8be8d30f, ebc4aa0b) fail their
  join SIMULTANEOUSLY at 16:08:08.8 — "Message group service registration
  returned non-success: Distributed operation failed due to participant
  failures" — the join-time registration is a multi-participant distributed
  write whose participants include the OTHER concurrently-joining nodes;
  (b) each failed joiner runs failed-join cleanup that REMOVES its node and
  service entries (the distributed deletes themselves take ~2min under
  pressure, 16:08:08→16:10:08) and then STOPS ITS ROUTER (16:10:08-19);
  (c) the simultaneous router stops detonate the peers' reconnect burst —
  15,047 "WebSocket connection closed before open" failures in one 10s
  bucket at 16:10:10 on node 11601fe0 (17,051 total; 35a891b8 similar) —
  i.e. the transport storm is a SYMPTOM of the cleanup, not a cause; the
  steady-state reconnect path has working exponential backoff (1 failure
  per 20-40s before the detonation);
  (d) the joiners resume ("Resuming join session after retryable
  control-plane failure") with external admission CLOSED again
  (`connect-websocket-phase.js:229`, opened only at the end of
  `initializeJoinInfrastructure`, `node-joining-admission-readiness.js:214`),
  re-register from scratch, and the 300s gate budget expires mid-retry.
  Run 3 shows the identical signature on a different joiner pair
  (11601fe0, 35a891b8). Throughout, the seed's owner driver was alive,
  tier0-raft-live, `missingPublishedCount=0` — CORRECT, because the failed
  joiners genuinely never completed registration (and their cleanup
  actively deleted what they had registered). Candidate first violated
  invariant (new record material, not CL-003): join-time service
  registration must either complete or be resumable WITHOUT identity
  teardown under formation concurrency — full cleanup + re-entry-from-zero
  is a formation livelock of period ~4min against a 300s budget. NOTE
  before any fix: the hard-cutover Membership_Lifecycle_Controller design
  ("restart = re-entry" into the lifecycle state machine) is the DESIGNED
  owner of exactly this; the failed-join full-cleanup path is legacy
  node-joining behavior — do not build a parallel retry/preservation
  mechanism.

### Exit Criteria

1. Rolling restart reaches one published epoch and one published active-node
   set across all expected nodes.
2. The cluster-active gate surfaces the concrete disagreement set when this
   invariant is not yet satisfied.
3. No cache-only or transport-only signal is introduced as alternate active
   membership truth.

### Notes

1. This record is the likely upstream source for several downstream startup
   timeouts and should remain primary unless a smaller earlier invariant is
   proven.
2. The 2026-03-28 rolling-restart rerun weakened this record as the primary
  blocker for that scenario specifically; the earliest strong witness in that
  run shows publication convergence satisfied before the remaining timeout.

## CL-002 Control Snapshot Coverage And Witness Selection

- Status: narrowed
- Concern: harness-control-snapshot
- Failure Class: harness-oracle-gap
- First Violated Invariant: The cluster-active witness path must obtain one
  complete control snapshot from an admin-ready node once canonical publication
  is queryable.
- Authoritative Owner: admin control snapshot read path plus the harness node
  selection policy for snapshot coverage.
- Authoritative State: control snapshot payload from an admin-ready node and
  its publication convergence fields.
- Allowed Evidence: reachability diagnostics, `adminReady`, authoritative
  control snapshot response shape, selected-node diagnostics.
- Forbidden Promotion Inputs: raw SQL fallback from non-admin-ready nodes,
  snapshot selection from bootstrap-health-only nodes, implied coverage from
  node status alone.
- Convergence Trigger: successful control snapshot query against a node that is
  both admin-ready and canonically published.
- Stable Witness: selected snapshot node id, complete coverage flag, selected
  publication convergence block, and selected error when snapshot acquisition
  fails.
- Entry Gate: `waitForClusterActive()` through `_probeControlSnapshotCoverage()`.
- Current Symptom: distributed scenarios can report `snapshotCoverage=0/N`
  even when node diagnostics say all nodes are active, leaving the gate unable
  to prove cluster-active closure.
- Scope: the current distributed harness gate is the narrowest reproducer,
  because the failure is partly in the witness collection path itself.
- Next Falsification Step: add a compact per-attempt coverage witness to the
  harness showing candidate node id, `adminReady`, query result shape, and
  selected error before any runtime change is attempted.
- Required Guard: harness coverage assertion proving snapshot candidates are
  considered queryable only when reachability diagnostics report
  `adminReady=true`.

### Evidence

1. Repo notes record that bootstrap-health-only nodes could fall back to raw
   SQL and falsely report missing published membership during rolling restart.
2. The harness now formats and evaluates snapshot coverage explicitly in
   [test/distributed/harness/cluster.js](test/distributed/harness/cluster.js#L633)
   and [test/distributed/harness/cluster.js](test/distributed/harness/cluster.js#L703).
3. The startup gate still blocks on complete coverage in
   [test/distributed/harness/cluster.js](test/distributed/harness/cluster.js#L5932).
4. Fresh rolling-restart rerun `rolling-restart-ledger-20260328T063059Z`
  captured a canonical selected snapshot witness with `selectedSnapshotNodeId`
  `7493b0ab-a054-5fad-a91b-5e331db29304`, `selectedSnapshotAdminReady=true`,
  and complete coverage while the earlier gate reason remained only
  `priority_control_plane_spread_pending`.

### Exit Criteria

1. When a node is admin-ready and canonically published, the harness can obtain
   one complete control snapshot without relying on raw SQL fallback.
2. Red runs show the exact selected node and failure reason instead of only
   `snapshotCoverage=0/N`.
3. Green runs prove complete coverage from the canonical snapshot path.

### Notes

1. This record may close with a harness-only fix, but only if CL-001 proves the
   canonical publication state is already converged.
2. The same 2026-03-28 rerun shows this record was not the earliest violated
  invariant for rolling restart once the stronger witness path was available.

## CL-003 Priority Control-Plane Spread Recovery Under Churn

- Status: guarded
- Concern: placement-priority-spread
- Failure Class: priority-invariant-breach
- First Violated Invariant: Priority control-plane partitions must recover to
  the required distinct-node spread before non-priority closure is considered
  complete.
- Authoritative Owner: placement owner path through `UnifiedRebalancer`,
  `MovePlanner`, and `RebalanceCoordinator` using the published membership
  epoch.
- Authoritative State: priority partition spread summary and authoritative
  replica placement state.
- Allowed Evidence: published membership epoch, authoritative replica rows,
  critical readiness dimensions, explicit priority recovery diagnostics.
- Forbidden Promotion Inputs: stale cache spread inference, non-priority
  progress used as proof of priority closure, startup phase heuristics.
- Convergence Trigger: priority recovery reconcile after restart churn and
  replica-operation completion.
- Stable Witness: priority partition spread summary and the corresponding
  priority recovery decision snapshot emitted to the load gate.
- Entry Gate: load-active gate and priority recovery invariant evaluation.
- Current Symptom: priority control-plane partitions can remain spread across
  too few distinct nodes under restart churn even after published membership
  epoch `2` and full selected snapshot coverage `5/5` are available, which
  keeps the load-active gate closed.
- Scope: fresh rolling restart rerun `rolling-restart-ledger-20260328T063059Z`
  is now the primary live scenario witness; seed restart under load remains a
  second scenario surface.
- Next Falsification Step: extract a targeted repro that fixes publication
  convergence at `PUBLISHED` with all expected active nodes present and then
  stresses only the missing `sql_write_operations-p1` spread recovery path.
- Required Guard: targeted regression proving priority recovery decisions read
  the published summary and refuse stale spread inference, plus a harness-level
  assertion that a converged publication witness with
  `priority_control_plane_spread_pending` maps to this record rather than to
  CL-001 or CL-002.

### Evidence

1. Repo notes identify `replica_operations`, `sql_transactions`,
   `sql_transaction_participants`, and `sql_write_operations` as partitions
   that can stay spread on only one distinct node under restart churn.
2. The load gate already evaluates priority recovery cross-service invariants
   in [test/distributed/harness/cluster.js](test/distributed/harness/cluster.js#L5951).
3. Task 27 remains red even after prior readiness-gate fixes, which suggests a
   remaining placement-side closure issue rather than only a witness problem.
4. Fresh rolling-restart rerun `rolling-restart-ledger-20260328T063059Z`
   recorded `publicationEpoch=2`, `publicationStatus=PUBLISHED`,
   `selectedPublishedActiveCount=5`, `selectedMissingPublishedNodeIds=[]`, and
   `snapshotCoverageComplete=true` while the publication gate reason remained
   only `priority_control_plane_spread_pending`.
5. The same rerun's `priorityPartitionSummary` reported
   `satisfied=false`, `blockedPartitionCount=1`, `largestSpreadGap=2`, and
   `missingPartitionIds=["sql_write_operations-p1"]`.
6. The same rerun's priority-recovery semantic-state witness kept
   `control_plane_publications-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1` in `recovering_in_flight`, while
   `replica_operations-p1` and `sql_transaction_participants-p1` stayed in
   `blocked_unclassified`.
7. Post-guard rerun `test-output/closure-cl003-rerun` now preserves the same
  witness in the real failure artifacts with `closureRecordId=CL-003`,
  `closureWitnessClass=publication_converged_priority_spread_pending`, and a
  last meaningful change string that still shows `publication=PUBLISHED`,
  `coverage=5/5#complete`, `missingPublished=0`, and only
  `gateReasons=priority_control_plane_spread_pending`.
8. Focused local guards now prove partition `REPLACE` create dispatch carries
  canonical bootstrap topology with the retiring source replica excluded, and
  that both rebalance create dispatch and durable rejoin restore planning read
  the same shared replicated-service topology helper.
9. CANDIDATE LEAD (2026-06-10, code-read verified, load-bearing status NOT yet
  proven): `MovePlanner.analyzePrioritySpread`
  (src/rebalancer/move-planner-state-methods.js:402-404) still derives
  `requiredDistinctNodeCount = min(3, readyNodes.length)` from
  ready/available nodes only — the same self-defeating ready-only
  denominator that 14bbe56a fixed in
  `getControlPlanePrioritySpreadBlocker` (cohort denominator). With
  readyNodes=1 the planner reports `satisfied=true` and plans no spread
  move. `getAvailableNodes` (unified-rebalancer-segment-2.js:332)
  additionally filters by readiness dimension AND published membership, so
  rejoined-but-not-yet-eligible nodes are excluded both as a denominator
  and as targets. Falsify by checking, in a CL-003 red run, whether the
  planner ever planned a spread move for the gap partition; if it planned
  and created one, the lead shifts to target eligibility
  (CONTROL_PLANE_RECOVERY_ELIGIBLE,
  control-plane-readiness-service-segment-2.js:440-470) / op completion.

### Exit Criteria

1. Priority control-plane partitions recover to the required spread during the
   red scenarios covered by Task 27.
2. A targeted repro exists and stays green after the fix.
3. Non-priority rebalance does not mask missing priority spread.
4. Rolling restart no longer reaches a state where publication is fully
   converged but the only remaining gate reason is
   `priority_control_plane_spread_pending`.

### Notes

1. The 2026-03-28 rolling-restart rerun promoted this record to the primary
   narrowed blocker for that scenario.
2. The final timeout surface later regressed into snapshot and publication
   collapse, but the stronger earlier witness shows those were downstream or
   end-of-budget effects rather than the first violated invariant in this run.
3. The harness-level guard for this record is now landed in the ACTIVE gate and
  failure-bundle summary path, so future reruns should preserve CL-003 even
  when later timeout-only samples are also present.
4. This record remains open at the distributed exit gate level: the witness is
  now preserved and guarded, but the priority spread invariant itself is not
  yet green in rolling restart.

## CL-004 Benchmark Load-Lane Admission Never Opens In Node-Join Under Load

- Status: narrowed
- Concern: readiness-projection
- Failure Class: convergence-lag
- First Violated Invariant: Benchmark load-lane admission must become
  serve-eligible for at least one admitted writer shortly after benchmark table
  bootstrap and join handoff.
- Authoritative Owner: admin discovery/readiness projection and load-lane
  admission owner path in [src/admin/admin-service-discovery.js](src/admin/admin-service-discovery.js) and
  [src/admin/admin-websocket-api.js](src/admin/admin-websocket-api.js).
- Authoritative State: benchmark table readiness projection for
  benchmark_events, including schema visibility and replica-operation health
  dimensions consumed by load-lane admission.
- Allowed Evidence: authoritative benchmark table metadata, load-lane
  admission reason set, publication convergence witness, priority recovery
  state.
- Forbidden Promotion Inputs: transport-only connectivity, cache-only table
  visibility, scenario-level fallback node lists as semantic readiness truth.
- Convergence Trigger: readiness projection recompute after benchmark bootstrap,
  publication, and replica-operation owner progression.
- Stable Witness: per-node load-lane admission reason set for
  benchmark_events, including benchmarkReady boolean and reason dimensions.
- Entry Gate: node-join-under-load load verification gate in
  [test/distributed/scenarios/node-join-under-load.js](test/distributed/scenarios/node-join-under-load.js).
- Current Symptom: load completes with total=0, success=0, and sustained
  nodeAdmissionBlocked while every dispatch attempt is denied by
  benchmark-not-ready and schema-table-missing reasons.
- Scope: 5-node distributed node-join-under-load scenario is currently the
  smallest confirmed reproducer.
- Next Falsification Step: rerun distributed node-join-under-load and validate
  the admission transition witness after the owner-path repair-on-cache-gap
  patch, then decide whether a dedicated 3-node harness repro is still needed.
- Required Guard: targeted admin load-lane admission characterization proving
  schema cache-gap blockers (for example schema_table_missing) trigger bounded
  authoritative discovery repair before the load lane hard-rejects.

### Evidence

1. Source-of-truth artifact selected:
  [test-output/.playback/report/node-join-under-load/failure-bundle.md](test-output/.playback/report/node-join-under-load/failure-bundle.md),
  [test-output/.playback/report/node-join-under-load/events.ndjson](test-output/.playback/report/node-join-under-load/events.ndjson),
  and per-node logs in [test-output/.playback/report/node-join-under-load](test-output/.playback/report/node-join-under-load).
2. First-fault timeline in failure bundle shows queue pressure and attempt
  errors at loadStart+1001ms with dominant reason nodeAdmissionBlocked.
3. Earliest load progress sample already reports five admission failures with
  reasons schema_table_missing, replica_operation_failed, and
  benchmark_not_ready while total operations remain zero.
4. Final load metrics in [test-output/report.json](test-output/report.json)
  show total=0, dispatchedOperations=1, undispatchedOperations=899,
  nodeAdmissionBlocked=326126.
5. Owner code that emits these reasons is in
  [src/admin/admin-service-discovery.js](src/admin/admin-service-discovery.js) and load-lane rejection text in
  [src/admin/admin-websocket-api.js](src/admin/admin-websocket-api.js).
6. New characterization test in
  [test/admin/admin-websocket-api.test.js](test/admin/admin-websocket-api.test.js)
  now proves load-lane benchmark admission recovers from local
  schema_table_missing cache gaps via authoritative discovery repair before
  query rejection.
7. Focused local guards now prove `ControlPlaneReadinessService`,
  `BootstrapReadinessOwner`, `UnifiedRebalancer`, and
  `RebalanceCoordinator` consume one shared membership-publication planning
  snapshot for published epoch binding, explicit local-node exclusion, and
  priority-spread-pending semantics.

### Exit Criteria

1. Characterization test reproduces CL-004 deterministically before fix.
2. Owner-path patch causes benchmark admission reasons to converge to
  serve-eligible in bounded time.
3. Characterization test and adjacent harness tests pass.
4. Distributed node-join-under-load rerun is green without adding forbidden
  promotion inputs.

### Notes

1. CL-004 is distinct from CL-003: this seam fails before useful load work
   begins and is dominated by readiness admission closure, not priority spread
   witness collapse.
2. Full distributed reruns should pause until the CL-004 minimal repro exists
   and is made green.
3. Owner-path patch landed in
  [src/admin/admin-websocket-api.js](src/admin/admin-websocket-api.js) now
  resolves load-lane table admission through bounded authoritative
  service-discovery repair, aligned with the new characterization guard.
4. CL-005 is distinct from CL-004: the shared partitioning helper can time out
   before `cluster.startLoad()` begins, so those reds should not be folded into
   the downstream load-lane admission record.

## CL-005 Partitioning Pre-Load Bootstrap Admission Never Opens

- Status: narrowed
- Concern: readiness-projection
- Failure Class: convergence-lag
- First Violated Invariant: Partitioning pre-load bootstrap must expose the
  required replica-bearing quorum and at least one benchmark-ready
  replica-bearing node before scenario load startup begins.
- Authoritative Owner: shared partitioning bootstrap admission gate in
  [test/distributed/scenarios/table-distribution-helpers.js](test/distributed/scenarios/table-distribution-helpers.js)
  together with the canonical benchmark-ready owner path consumed through
  `cluster.resolveBenchmarkReadyLoadNodes()`.
- Authoritative State: benchmark table replica-bearing node set and
  benchmark-ready node set for `benchmark_events` at pre-load bootstrap.
- Allowed Evidence: authoritative table distribution query results,
  benchmark-ready node selection from the canonical readiness projection,
  helper timeout counters (`lastReadyReplicaCount`,
  `lastReplicaBearingCount`, `lastReplicaSpread`), and targeted helper
  characterization output.
- Forbidden Promotion Inputs: downstream load-lane rejection counts after
  `cluster.startLoad()`, cache-only table visibility, scenario-level fallback
  node lists as semantic readiness truth, or final scenario pass/fail alone.
- Convergence Trigger: repeated partitioning bootstrap admission polling after
  benchmark table bootstrap and replica-placement convergence.
- Stable Witness: per-poll replica-bearing node count, replica spread count,
  and benchmark-ready replica-bearing node count for `benchmark_events`.
- Entry Gate: `createPartitioningBenchmarkLoadNodePlan()` pre-load bootstrap
  gate in
  [test/distributed/scenarios/table-distribution-helpers.js](test/distributed/scenarios/table-distribution-helpers.js).
- Current Symptom: shared partitioning scenarios can time out before
  `cluster.startLoad()` with `lastReadyReplicaCount`,
  `lastReplicaBearingCount`, and `lastReplicaSpread` all below the bootstrap
  gate threshold.
- Scope: the shared helper is used by
  [test/distributed/scenarios/seven-node-table-partition-distribution.js](test/distributed/scenarios/seven-node-table-partition-distribution.js),
  [test/distributed/scenarios/seven-node-load-during-partitioning.js](test/distributed/scenarios/seven-node-load-during-partitioning.js),
  and
  [test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js](test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js);
  the smallest archived exact timeout is currently
  `codex-seven-node-load-during-partitioning-20260402T133050Z`.
- Next Falsification Step: rerun
  `seven-node-table-partition-distribution` with a compact per-poll witness for
  ready replica count, replica-bearing count, and replica spread so the first
  stalled dimension is captured before any runtime change.
- Required Guard: targeted helper characterization proving the shared
  partitioning bootstrap gate preserves the per-poll readiness witness and
  never starts load before both quorum and benchmark-ready admission are
  satisfied.

### Evidence

1. The shared helper
   [test/distributed/scenarios/table-distribution-helpers.js](test/distributed/scenarios/table-distribution-helpers.js)
   throws a dedicated timeout for missing partitioning bootstrap quorum and
   benchmark-ready table-local load admission before returning the load plan.
2. The target scenario
   [test/distributed/scenarios/seven-node-table-partition-distribution.js](test/distributed/scenarios/seven-node-table-partition-distribution.js)
   invokes `createPartitioningBenchmarkLoadNodePlan()` before `cluster.startLoad()`,
   so this seam fails earlier than any downstream load-lane dispatch evidence.
3. The same pre-load gate is also used by
   [test/distributed/scenarios/seven-node-load-during-partitioning.js](test/distributed/scenarios/seven-node-load-during-partitioning.js)
   and
   [test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js](test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js),
   confirming one shared invariant across the partitioning scenario family.
4. Archived report
   `.tmp/codex-seven-node-load-during-partitioning-20260402T133050Z.report.json`
   records the exact failure text:
   `Timed out after 180000ms waiting for partitioning bootstrap quorum and benchmark-ready table-local load admission for table benchmark_events; lastReadyReplicaCount=2; lastReplicaBearingCount=2; lastReplicaSpread=2`.
5. Targeted helper coverage in
   [test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js](test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js)
   already asserts this timeout surface, which anchors the record to the shared
   pre-load gate rather than a later scenario-specific timeout.

### Exit Criteria

1. The shared partitioning bootstrap gate reaches the required replica-bearing
   quorum and at least one benchmark-ready replica-bearing node within bounded
   time.
2. The helper-level guard emits and preserves the per-poll readiness witness for
   failing and passing runs.
3. Red partitioning scenarios rerun cleanly without relying on downstream
   load-lane serve-eligibility as a substitute witness.

### Notes

1. CL-005 is distinct from CL-004 because CL-005 fails before
   `cluster.startLoad()` and before any `nodeAdmissionBlocked`,
   `benchmark_not_ready`, or `schema_table_missing` evidence exists.
2. When `seven-node-table-partition-distribution` goes red with this helper
   timeout, it should map here even if the currently archived exact reproducer
   comes from a sibling partitioning scenario.

## CL-006 Retryable Join-Step Failure Must Not Regress Durable Join Progress

- Status: open
- Concern: membership-join-lifecycle
- Failure Class: formation-livelock
- First Violated Invariant: A RETRYABLE failure of a checkpointed join step
  must not regress durable join progress — it must not destroy join
  infrastructure (router, message group, control-plane services) nor withdraw
  already-registered membership rows. Only a TERMINAL failure (resume budget
  exhausted, non-retryable error) may run the destructive cleanup.
- Authoritative Owner: join lifecycle — `JoinCoordinator` +
  `JoinSessionStore` checkpoints (src/bootstrap/join-coordinator.js,
  join-session-store.js), with `Membership_Lifecycle_Controller` intents
  (`JOIN_ADMISSION` / `RESTART_REENTRY`; `REMOVAL` is a separate deliberate
  intent, not a failure path —
  src/control-plane/membership-lifecycle-controller.js:46-51).
- Authoritative State: the durable join-session checkpoint sequence
  SESSION_CREATED → SEED_CONTACTED → JOIN_INFRASTRUCTURE_READY →
  MEMBERSHIP_WRITTEN → READY_LEASE_ASSIGNED → FINALIZED
  (join-session-store.js:8-24; CHECKPOINT_REGRESSION is already a defined
  store error).
- Allowed Evidence: join-session checkpoint records, joining-phase logs,
  registration write outcomes, failed-join cleanup step results, peer
  transport evidence bounded to the cleanup window.
- Forbidden Promotion Inputs: transport storm volume as a root cause (it is
  a downstream symptom), gate-side publication labels without scenario-phase
  context.
- Convergence Trigger: retryable-resume re-entry at the failed checkpoint
  segment with infrastructure intact.
- Stable Witness: per-attempt join checkpoint reached + whether cleanup ran +
  external-admission open/closed at resume + peer reconnect-failure rate.
- Entry Gate: `scenario.load-readiness` during initial formation.
- Current Symptom (stat-gate-20260610T155735Z runs 2+3, identical signature
  on different joiner pairs; full logs preserved): two joiners fail the
  MEMBERSHIP_WRITTEN step simultaneously at +115s ("Distributed operation
  failed due to participant failures" — already classified RETRYABLE by
  control-plane-error-classification.js:16), then `handleJoiningFailure`
  (node-joining-admission-readiness.js:450) runs the FULL destructive
  cleanup BEFORE `resolveRetryableJoinResumeDecision` is consulted:
  `cleanupFailedJoin` (join-cleanup-handler.js:104-160) withdraws node and
  service entries (~2min of pressured distributed deletes), stops the
  router (peers detonate 15k reconnect failures in 10s — symptom), and
  drives the lifecycle machine to STOPPED. The resume loop then re-enters
  with `allowResumeLatest`, but `JOIN_INFRASTRUCTURE_READY.shouldRerun =
  !hasJoinInfrastructureReady()` (node-joining-admission-readiness.js:327)
  now reruns everything from scratch with external admission closed again
  (connect-websocket-phase.js:229) — a formation livelock of period ~4min
  against a 300s gate budget.
- Scope: 5-node initial formation under the rolling-restart scenario's
  load-readiness gate; restart churn likely shares the path via
  RESTART_REENTRY.
- Next Falsification Step: prove the counteraction directly — instrument or
  unit-test that a retryable MEMBERSHIP-step failure currently destroys the
  JOIN_INFRASTRUCTURE_READY checkpoint's effects and re-opens the
  closed-admission window; then make cleanup severity-aware (retryable →
  preserve infrastructure + registered rows, resume re-enters at the failed
  segment; terminal/budget-exhausted → existing full cleanup) and show the
  targeted repro goes green.
- Required Guard: a regression test that a retryable failure injected into
  the MEMBERSHIP segment (a) leaves the router accepting connections,
  (b) leaves registered service rows in place, (c) resumes at
  MEMBERSHIP_WRITTEN without rerunning earlier segments, and (d) full
  cleanup still runs when the resume budget is exhausted
  (RETRYABLE_FAILURE_RESUME_EXHAUSTED,
  node-joining-admission-readiness.js:640).

### Evidence

1. CL-001 evidence item 6 holds the timestamped run-2 chain (16:08:08.8
   simultaneous registration failures → 16:08:08-16:10:08 entry-withdrawal
   deletes → 16:10:08-19 router stops → 16:10:10 peer reconnect burst →
   16:10:20 resume from zero with admission closed → budget expiry).
2. The error is in RETRYABLE_CONTROL_PLANE_ERROR_FRAGMENTS
   (control-plane-error-classification.js:16) and the resume loop itself
   labels it "Resuming join session after retryable control-plane failure"
   — the system already KNOWS the failure is retryable when it destroys
   the state a retry needs.
3. The checkpoint store defines CHECKPOINT_REGRESSION as an error
   (join-session-store.js:43-44) while the cleanup handler regresses the
   checkpointed reality unconditionally (join-cleanup-handler.js:104 runs
   before the resume decision at node-joining-admission-readiness.js:451-457).
4. The cutover owner model already designates removal as a deliberate
   lifecycle intent (MEMBERSHIP_LIFECYCLE_INTENT.REMOVAL) distinct from
   join/restart re-entry — failed-join entry withdrawal is the legacy
   node-joining layer acting as a second, conflicting owner of removal.
5. FIX LANDED (f18efdb7, 2026-06-10): severity-aware cleanup — resume
   decision computed before failure handling; preserveForResume skips the
   destructive cleanup + FAILED event (lifecycle still driven to STOPPED
   for the existing reset path). Includes the two verification findings:
   lifecycle catch-up CONNECTING→JOINING when the skipped infrastructure
   segment owned those transitions, and CDC handler dedupe across resumes.
   Guarded by test/bootstrap/node-joining-retryable-resume-preserves-state.test.js
   (red before fix, red on either partial revert — independently verified).
6. GATE VALIDATION ROUND 1 (stat-gate-20260610T172830Z, 4 runs):
   2 CONVERGED / 1 SLOW / 1 STALLED, 0 corrupt — stallRate 0.5→0.25,
   healthyRate 0.75. Where the preserve path ENGAGED (runs 1-2: 3
   preserved resumes each, all on the participant-failure registration
   class) reconnect failures collapsed from ~15-17k to ~100-150 and the
   runs ended SLOW/CONVERGED. The remaining destructive-path failures
   exposed a CLASSIFICATION GAP: httpPost's abort path threw a bare
   "Request timeout after Xms" (no retryable fragment match, no marker) —
   querying_state failures in runs 1/3/4 (5×), driving run 3's 22,662
   reconnect storm + STALL; plus one join_readiness_timeout (run 4).
   Both throw sites now carry deferRetry (da8a5d53), which
   isRetryableControlPlaneError already honors — the phase classifiers
   had always treated the same message as retryable in-phase; the verdict
   was dropped at the phase boundary. Gate round 2 pending.
7. GATE VALIDATION ROUND 2 (stat-gate-20260610T180803Z, 4 runs, post
   da8a5d53): 1 SLOW / 3 STALLED by the publication classifier, 0 corrupt.
   MECHANISM-LEVEL VERDICT: the join-failure cascade is CLOSED — across
   all 8 post-fix runs the reconnect storms are gone (max ~150 failures
   vs 15-22k pre-fix), preserved resumes engage on the marked error
   classes, destructive cleanup is reserved for terminal failures, and
   the resume budgets fire correctly (run 2: 6 preserved, 4 terminal,
   2 budget-exhausted). The deferRetry widening was checked for resume-
   loop pathology and exonerated: round-2 runs 1 and 4 stalled with ZERO
   join failures of any kind (no resumes, no cleanups, no storms) — a
   DIFFERENT, pre-existing stall mode: joins alive but creeping, single
   registration steps in-flight for 4.5+ min under explicit control-plane
   pressure (run-1 witness: node 11601fe0 stuck at "Registering node
   endpoint in cluster" from 18:11:03 to run end while all nodes kept
   ticking; seed busy with partition/CDC work). Topline classifier rates
   at N=4 sample a MIXTURE of stall modes and bounce accordingly
   (round 1: 2C/1S/1St; round 2: 1S/3St) — no topline regression or
   improvement claim is statistically honest; the mechanism claims are.
   The no-failure pressure-creep mode is the next first-violated
   invariant and belongs to CL-001 (publication/registration progress
   under pressure), not this record.

### Exit Criteria

1. A retryable MEMBERSHIP-step failure resumes at the failed segment with
   infrastructure and registered rows intact (targeted repro green).
2. Peer reconnect-failure bursts during formation drop to backoff-bounded
   rates (no 10s detonations) in the stat-gate runs.
3. The formation load-readiness gate passes within budget in the
   rolling-restart scenario so the restart phase is actually exercised.
4. Terminal failures still withdraw entries exactly once (no zombie rows).

### Notes

1. Opened 2026-06-10 from stat-gate-20260610T155735Z artifact verification.
   The transport storm and seed probe timeouts previously attributed to
   rejoin overload are downstream symptoms of this record's invariant.
2. Do NOT build a new retry/preservation layer: the checkpointed resume
   (JoinCoordinator/JoinSessionStore), the retryable classification, and
   the lifecycle-controller intents already exist — the fix is to stop the
   legacy cleanup from counteracting them.

## CL-007 Transport Quarantine Must Not Sever An Alive Critical Path

- Status: guarded
- Concern: transport-liveness
- Failure Class: formation-livelock
- First Violated Invariant: The ACK-timeout quarantine may sever a connection
  only on evidence the peer is DEAD (no inbound traffic within the liveness
  window) — never for a peer that is demonstrably alive but slow. Severing an
  alive path converts slow into broken ("never break, only slow") and, during
  formation, simultaneously cuts every joiner off from the saturated seed.
- Authoritative Owner: message router connection lifecycle
  (src/transport/message-router-reconnect-behaviors.js
  quarantineConnectionAfterAckTimeout).
- Authoritative State: per-connection ackTimeoutStreak/lastAckAt + per-node
  inbound-activity timestamps (router.nodeInboundActivityAt).
- Allowed Evidence: transport logs (quarantine/skip warns with
  lastInboundAgoMs), per-node reconnect-failure rates, join-step timelines.
- Forbidden Promotion Inputs: ACK latency alone as death evidence; reconnect
  storms as a root cause (they are this record's symptom).
- Convergence Trigger: inbound traffic from the peer within the liveness
  window resets the death verdict; ws close/error events still tear down
  truly closed sockets.
- Stable Witness: count of quarantines vs liveness-skips per run; join-step
  durations; ROUTER_CONNECTION_CLOSED occurrence rate during formation.
- Entry Gate: scenario.load-readiness during initial formation.
- Current Symptom (stat-gate-20260610T180803Z-run1, zero join failures, 4
  creeping joiners): ALL FOUR joiners quarantined their connection TO THE
  SEED within one second (~18:08:25), ~1s after starting registration
  writes — ACK_TIMEOUT_QUARANTINE_THRESHOLD=2 at MESSAGE_TIMEOUT_MS=5000
  under formation load (the seed's event loop measurably stalls 20-80s; no
  ACK leaves within 5s regardless of priority — join writes are CRITICAL
  end-to-end and the outbound queue schedules CRITICAL first, verified, so
  priority starvation is REFUTED as the cause). Downstream of the
  quarantine: registration sub-steps fail at 85-88s with
  ROUTER_CONNECTION_CLOSED/participant-failures, snapshot queries storm
  (435 pressure deferrals on the worst joiner), the seed's replica-op
  dispatches to "reconnecting" joiners die at PENDING with shed budgets
  exhausted, and the quarantine repeats after each reconnect (streak resets
  on the replacement connection — churn loop acknowledged in code comments).
- Scope: 5-node formation; the same hair-trigger applies to any
  load-asymmetric topology (one saturated hub).
- Next Falsification Step: rerun the stat gate with the liveness guard and
  compare (a) quarantine count (expect ~0 with skips logged instead),
  (b) join-step durations, (c) ROUTER_CONNECTION_CLOSED rate; confirm
  truly-dead-peer quarantine still fires (unit-covered).
- Required Guard: unit tests proving (1) fresh inbound activity or recent
  ACK skips the teardown while the message still fails, (2) silent peers
  quarantine exactly as before, (3) window=0 restores pre-change behavior.
  (Landed with the fix: test/transport/message-router-quarantine-liveness-guard.test.js.)

### Evidence

1. All-joiners-simultaneous quarantine witness: 4/4 joiners logged
   "Quarantining target connection after ACK timeout" targeting the seed
   at 18:08:25.6-25.9 in stat-gate-20260610T180803Z-run1, ~1s after their
   registration writes began. The seed logged ZERO quarantines (its
   inbound side was fine) and the harness probes timed out against it
   (event-loop saturation, driver tick gaps 20-80s measured earlier).
2. Priority starvation REFUTED by code trace: join writes carry
   deliveryPriority='critical' end-to-end
   (node-registration-owner-constants.js:30, preserved by
   normalizeDeliveryPriority cdc-integration-service-shared.js:285-289),
   the outbound queue schedules CRITICAL first
   (message-router-shared-stage-2.js:596-642), and the pressure governor
   always admits critical work (pressure-governor.js:380-382). The seed is
   slow to ACK because its EVENT LOOP is saturated, not because join
   traffic queues behind recovery traffic.
3. The quarantine replacement connection resets ackTimeoutStreak to zero
   (message-router-reconnect-behaviors.js:598 area), so the cycle repeats
   after each reconnect — "quarantine churn" already named in
   message-router-delivery-behaviors.js:632.
4. FIX LANDED: per-node inbound-activity liveness evidence
   (router.nodeInboundActivityAt, stamped in handleMessage which serves
   both inbound and outbound sockets) + lastAckAt; quarantine skipped with
   a warn ("Skipping ACK-timeout quarantine: peer demonstrably alive")
   when evidence is fresher than
   transport.ackTimeoutQuarantineLivenessWindowMs (default 30000; 0
   disables = pre-change behavior). The timed-out message still fails and
   retries; ws close/error teardown is untouched.

### Exit Criteria

1. Formation runs show liveness-skips instead of quarantines against the
   seed; ROUTER_CONNECTION_CLOSED cascades disappear from the creep window.
2. Join registration steps no longer fail on severed connections while the
   peer is alive (85-88s sub-step failures gone or reduced to genuine
   write timeouts).
3. Truly dead peers (silent beyond the window) still quarantine (unit
   guard) and reconnect storms do not regress.
4. The pressure-creep stall class (CL-001 coupling) either closes or its
   residual is re-pinned to the seed event-loop saturation layer.

### Notes

1. Opened 2026-06-10 from the two-agent investigation (artifact mining +
   priority-path code trace) after CL-006 closed the join-failure cascade.
2. GATE VALIDATION (stat-gate-20260610T192851Z, 4 runs, post b1ec2466):
   guard engaged 200-476 times/run (alive-but-slow preserved) vs only 4-7
   real quarantines; reconnect failures 16-1069 vs 15-22k pre-fix; join
   failures 0-1/run. Exit criteria 1+3 met. Topline 1 CONVERGED / 3 STALLED
   (0 corrupt): the residual stall re-pins per exit criterion 4 to the seed
   EVENT-LOOP SATURATION layer — the seed still takes >5s to ACK for
   minutes (each skip event = one 5s ACK timeout) while executing
   formation-time rebalancing (321 move executions; planning gate parked at
   "stabilization"; replica ops to joiners dying at PENDING). Next record
   should ask WHY the rebalancer executes hundreds of moves during initial
   formation and what the seed event loop is actually blocked in
   (CL-003-adjacent).
   The seed event-loop saturation itself (what the seed is busy WITH:
   321 rebalancing-move executions during formation, planning gate parked
   at "stabilization") remains a separate concern — likely CL-003-adjacent
   — if creep persists after this guard.

## CL-008 In-Flight Move Reuse Must Be Side-Effect-Free At Planning Cadence

- Status: narrowed (2026-06-11 artifact verification refuted the headline
  mechanism; record re-pinned to the two confirmed planning-feedback gaps)
- Concern: placement-planning-feedback
- Failure Class: redundant-work-amplification (downgraded from
  seed-saturation: NOT the demonstrated stall driver — see Evidence 4)
- First Violated Invariant: When a planning tick re-executes a calculated
  move whose previously-created operation is still in flight, the reuse must
  be side-effect-free — it must not re-trigger authoritative owner reads,
  claim writes, and remote dispatch attempts while the dispatch layer
  already has a live deferred-retry scheduled for that operation.
- Authoritative Owner: rebalance coordinator create-intent reuse path
  (rebalance-coordinator-segment-3.js:94-122 createOperation recent-intent
  hit → rebalance-coordinator-operation-intent-methods.js:410
  maybeRearmReusedPendingOperation → armCoordinatorCreatedOperationProgress,
  currently UNCONDITIONAL for any PENDING op) + planning cadence
  (rebalancer-planning-gate-methods.js:685 advanceCheckCadence — priority
  partitions use a fixed retry delay in BOTH branches; no dispatch-health
  feedback exists, and a reused in-flight op counts as executedMoveCount>0,
  which today only affects the non-priority backoff branch).
- VERIFICATION RESULTS (2026-06-11, stat-gate-20260610T192851Z runs 1+3 seed
  full logs + code read, rubber-duck-reviewed):
  - REFUTED: "each re-execution creates a NEW operation record" and
    "unbounded operation-row churn". Run1: 96 "Executing rebalancing move"
    (70 replace + 26 add, 5 priority partitions, ~1 per 14s per partition)
    but only 10 "Creating operation" (a PRE-persist upper bound —
    rebalance-coordinator-segment-3.js logs CREATE_OPERATION before
    persistNewOperation), 7 coordinator skips, 0 move failures, 4 ops
    completed in 45-55s. Run3: 61 executes / 9 creates / 4 completed. The
    previously recorded "321 move executions" is unreproducible from the
    cited artifacts (actual 96+61=157) and conflated executions with
    creations.
  - REFUTED: "NO dedup against in-flight operations". Dedup exists at three
    layers and works: (a) planner hasPendingAddForNode/hasPendingMove
    (move-planner-move-calculation-methods.js:339,382,432; PENDING REPLACE
    counts as add-like — isReplaceRemoveDispatchPhase requires
    ACTIVE/STOPPING, so the phase-misclassification alternative is refuted);
    (b) coordinator in-memory recent-intent cache with priority-extended TTL
    (rebalance-coordinator-operation-intent-methods.js:456 — built precisely
    because owner/cache reads lag under pressure); (c) repository strict
    in-flight query. The 79 unaccounted executions (96−10−7) were silent
    layer-(b) absorbs; 0 "Duplicate operation detected" confirms layer (c)
    was never reached.
  - CONFIRMED gap 1 (the re-pinned invariant): each layer-(b) absorb calls
    maybeRearmReusedPendingOperation → armCoordinatorCreatedOperation
    UNCONDITIONALLY. The DISPATCH_REARM_BUDGET evidence table gates only the
    progress-reconcile rearm path, and inside
    armCoordinatorCreatedOperation (operation-workflow-owner-handoff-state.js)
    the budget gates only WAKE_REMOTE_OWNER — the seed-owned
    CLAIM_AND_APPLY_LOCAL_PRIME path is not budget-gated. Net per tick per
    partition: authoritative owner read + claim write + remote dispatch
    attempt (5s router timeout against a creeping joiner) + deferral
    bookkeeping (63 "Deferred retryable replica operation dispatch failure"
    run1). Row-UPDATE churn from claims/deferrals feeds CDC events on the
    seed (~250 CDC fetch lines in the creep window) — this is the live
    bridge to the unverified supply-side suspect, kept OPEN for measurement.
  - CONFIRMED gap 2: no target-side dispatch-health feedback into planning.
    The existing transport-backpressure planning gate
    (rebalancer-transport-pressure-methods.js) reads only LOCAL outbound
    pressure and therefore CORRECTLY did not engage during the creep window
    (0 gate logs) — do not "fix" it by loosening local thresholds; the
    missing input is per-target dispatch deferral evidence.
  - CONFIRMED witness gaps: LoggingService injects the LOCAL nodeId into
    every payload (logging-service.js:251/297 {...context, nodeId:
    this.nodeId}), clobbering move.nodeId in EXECUTE_MOVE / MOVE_SKIPPED /
    MOVE_BLOCKED_BY_SAFETY_POLICY — all 96 run1 EXECUTE_MOVE lines show the
    seed's own id regardless of the actual move target (the joiners).
    EXECUTE_MOVE has no operationId; intent-cache reuse logs nothing.
  - UNSETTLED: WHY the planner-side layer (a) missed every tick. Best
    surviving hypothesis is systemTableCache lag (CDC visibility of the op
    row on the creating node), but the skip at
    move-planner-move-calculation-methods.js:382 is a silent continue, so
    there is no direct witness; a latent alternative is the snake_case-only
    target_node_id match in hasPendingAddForNode
    (unified-rebalancer-segment-4-stage-4.js:149) never matching camelCase
    cache rows (lag vs never). The new reuse witness log discriminates this.
  - CAUSALITY (honest framing): move-churn demand is modest (~100 dispatch
    events/6min) and the outbound saturation storm (now CL-009) starts only
    in the final ~24s (run1) / ~75s (run3), but planner executions DO start
    coincident with creep onset (19:29:20) — so CL-008 is exonerated as the
    creep driver on magnitude grounds, not temporal precedence; the
    supply-side measurement below will falsify.
- Next Falsification Step (supply side, unchanged in substance): instrument
  seed event-loop blockage attribution non-perturbingly — the earlier claim
  of 13.4-25.7% wall blocked in >3s gaps inside synchronous CDC hydration
  (partition-cdc-parameterized-sql.js:231-234,298-301 via
  partition-cdc-generator.js:361) remains UNVERIFIED; measure cumulative
  tight-loop fetches vs SQLite lock/WAL contention vs gap-attribution bias,
  and attribute what fraction of CDC event volume is replica_operations
  row updates from the rearm/deferral churn above.
- Required Guard: regression test proving (a) a reused PENDING operation
  with a live dispatch deferred-retry (or created-operation handoff retry)
  is NOT re-armed, (b) a reused PENDING operation with NO live retry timer
  IS re-armed (missed-handoff recovery preserved — timer absence is exactly
  the state the rearm exists for), (c) terminal/non-PENDING reuse behavior
  unchanged.
- Fix plan (rubber-duck-reviewed order; cadence backoff deliberately
  DEFERRED because priority partitions have event-driven wakes
  (unified-rebalancer-priority-recovery-coordination.js:54-72) making it
  optional hardening, and landing it together with the rearm guard would
  mask attribution of any gate-run delta):
  1. Witness first: un-clobber the move target in rebalancer logs
     (moveTargetNodeId), add operationId, add an info log on intent-cache
     reuse with the live-retry decision. Pre-registered expectations for the
     next gate run: reuse rate unchanged, deferral warns drop after step 2,
     creep onset UNCHANGED if CL-008 is truly not the driver.
  2. Rearm guard: skip the redundant re-arm when
     isOperationDeferredRetryActive(opId) OR an active created-operation
     handoff retry exists (BOTH timers — the rearm-evidence predicate alone
     does not cover createdOperationHandoffRetryTimerByOperationId).
- CL-003 NOTE (unchanged): evidence item 9 (analyzePrioritySpread ready-only
  denominator) is FALSIFIED as the source of these formation moves — primary
  moves come from standard MovePlanner.calculateMoves replica-count
  convergence; the denominator defect may still matter for the
  priority-recovery augmentation path but is not this record's driver.

## CL-009 Outbound Backpressure Rejection Must Not Storm Warns Or Hot-Retry A Stillborn Replica

- Status: open (opened 2026-06-11 from CL-008 artifact verification;
  fix (i) is cheap and should not wait for fix (ii))
- Concern: transport-replication-backpressure
- Failure Class: observer-effect-amplification
- First Violated Invariant (two parts):
  (i) A saturated per-source outbound lane must rate-limit/aggregate its
  backpressure warns — emitting one full-payload warn per rejected enqueue
  converts containment into a log storm on the already-pressured node.
  (ii) Per-source backpressure rejection must feed back into the sender's
  retry pacing — the sender currently re-attempts every partition write to
  a non-absorbing replica immediately, at the partition's write rate.
- Authoritative Owner: message router outbound queue admission
  (message-router-shared-stage-3.js:331 and :380 — both emission sites log
  per rejected enqueue with full pendingSourceSummary payload, no rate
  limiting) + the partition replication sender that retries against the
  rejected source (sender-side trace NOT yet done — required before fix ii).
- Current Symptom (stat-gate-20260610T192851Z, both runs, identical shape):
  in the final ~24s (run1: 19:34:45→19:35:07, run end 19:35:09) / ~75s
  (run3), 5,911 / 5,894 "Outbound queue saturated for node delivery" warns —
  67-69% of the seed's ENTIRE run log — all deliveryPriority=critical, all
  with attemptedDeliverySource = target:<joiner>/partition/<replica> where
  <replica> is a REPLACE-created replica that never came up
  (sql_transactions-p1-r5 on 35a891b8, sql_write_operations-p1-r4 on
  ebc4aa0b). Aggregate ~80-270 attempts/s. The per-source pending cap
  (pendingForSource=48=pendingSourceLimit) correctly contains the queue —
  containment works; the storm is the per-attempt warn + immediate retry.
  The target joiners were alive through the burst (their logs run past it),
  so this is live retry-against-stillborn-replica, not teardown noise.
- Allowed Evidence: per-source admission counters, warn emission rate,
  sender-side retry traces, replica bootstrap state for the target replica.
- Forbidden Promotion Inputs: warn line volume as proof of queue
  malfunction (admission containment demonstrably worked); teardown-window
  noise without checking target liveness.
- Stable Witness: warns-per-second per delivery source; suppressed-warn
  counters once rate-limiting lands; sender retry cadence per rejected
  source.
- Entry Gate: scenario.load-readiness during initial formation (same runs
  as CL-008).
- Next Falsification Step: trace WHICH sender loop re-attempts at 80-270/s
  (partition raft replication vs CDC forwarding vs snapshot catch-up) before
  designing fix (ii); land fix (i) (warn rate-limit/aggregation with a
  suppressed count) immediately since it is behavior-preserving.
- Required Guard: unit test that saturated-source warn emission is bounded
  per interval per target while rejections continue to be returned to
  callers unchanged.
- NOTE (observer effect): per [[debug-logs-observer-effect-on-seed]], an
  unthrottled ~270/s warn on the saturated seed is itself a perturbation
  hazard; fix (i) is also a measurement-hygiene prerequisite for the CL-008
  supply-side attribution step.
