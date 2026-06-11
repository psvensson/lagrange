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
| CL-010 | guarded | readiness-observation-hot-path | Per-observation readiness diagnostics must be O(changes), not O(calls): the recovery-epoch timeline's change check must not allocate and double-JSON.stringify full summaries (including fresh timestamps, so it never matched) on every getNodeReadinessSync. |
| CL-011 | guarded | readiness-observation-hot-path | Read isolation for cached system-table rows must not cost a JSON serialize+parse roundtrip per row per read. |
| CL-012 | guarded | readiness-read-amplification | The query executor's partition-routing path must not rebuild full node readiness (evidence pipeline + authoritative reads) per service row per routing decision; readiness evaluation must not recursively issue reads that themselves require routing + readiness. |
| CL-013 | open | replica-join-topology | A REPLACE-created replica joining an ESTABLISHED partition must consume the owner-dispatched bootstrap topology; it must never fall back to a locally-filtered cache view that can reduce to self-only and trigger a fresh solo raft bootstrap. |

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
- FALSIFICATION EXECUTED (2026-06-11, stat-gate-20260611T090827Z runs 1-4 —
  the first runs to reach this record's surface cleanly after the
  CL-006..012 formation chain cleared): "did the planner ever plan the
  spread move?" — YES, fully. Run1 seed witnesses (un-clobbered
  moveTargetNodeId + operationId): five REPLACE operations created within
  13s (09:09:33-46), one per priority partition, targets spread across
  three distinct joiners. Planning, dedup (75 reuses correctly absorbed,
  rearmActions correct), creation, and dispatch (PENDING->SENDING->CREATING)
  all work. EVIDENCE ITEM 9 (analyzePrioritySpread ready-only denominator)
  is FALSIFIED as this record's blocker. The actual failure: the new
  learner replica on the target joiner fails voter-ready promotion within
  its 60s budget ("Replica replica_operations-p1-r4 did not become
  voter-ready within 60000ms"), the CREATE retries wedge on "state
  transition rejected: creating/failed", and all five partitions sit in
  recovering_in_flight (largestSpreadGap=0 — the spread summary itself is
  satisfied; the blocker is operation completion). ROOT: the seed's raft
  append fan-out to the starving learner is per-source backpressure-capped
  and the sender hot-retried every rejection — 6,434 rejected sends to
  sql_write_operations-p1-r4 and 2,943 to sql_transaction_participants-p1-r4
  in ~3min (CL-009's suppressed counters as the witness) — so learner
  catch-up starves behind its own doomed re-sends. This is CL-009(ii)
  promoted to load-bearing for this record; fix landed there.
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
- Next Falsification Step (supply side) — EXECUTED 2026-06-11 (watchdog
  gate stat-gate-20260611T061307Z, 2 CONVERGED / 2 STALLED, 0 corrupt;
  EventLoopGapWatchdog landed 65691c7f, profiler cfef0e70). RESULTS:
  (a) CDC-HYDRATION HYPOTHESIS FALSIFIED: the tagged CDC row fetches
  (partition-cdc-parameterized-sql.js sync prepare/get) measured 97-136
  calls totaling 1-2 MILLISECONDS per run — 0.0% of gap time. The earlier
  "13-26% of wall inside CDC hydration" agent claim is refuted.
  (b) MAGNITUDE FAR WORSE THAN CLAIMED: the seed's event loop is blocked
  ~95% of wall in STALLED runs (totalGap 341s/323s of ~372s wall; single
  gaps up to 70.2s) and 380-580s even in CONVERGED runs (max gap 80.3s in
  a converged run — convergence is surviving the blockage, not avoiding
  it).
  (c) IT IS THE SEED EXECUTING JS, NOT THE ENVIRONMENT: ELU=1.0 in 101 of
  105 gap reports (loop active, not starved), and the four joiners show
  ZERO gaps — host CPU contention and cgroup throttling are excluded.
  (d) ATTRIBUTION PENDING: gap-boundary log lines are heterogeneous
  (lease-service burst before the 70s gap, rebalancer leadership churn
  before the 29s gap) — boundaries cannot name the blocker. The watchdog
  now embeds the V8 sampling profiler (LAGRANGE_LOOP_GAP_PROFILE=1,
  30s windows rotated on the first post-block tick, gap-free windows
  discarded, top-10 self-time frames console-only); a profiled run will
  name the function(s). Whatever it names becomes a NEW record — at ~95%
  blockage it, not anything in CL-008's residue, is the pressure-creep
  first violated invariant.
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
- FIX LANDED (0df23df0, 2026-06-11): (1) rearm guard —
  maybeRearmReusedPendingOperation consults the workflow owner's live
  deferred-retry evidence (isOperationDeferredRetryActive PLUS
  hasActiveCreatedOperationHandoffRetry — the handoff lane is not covered
  by the former) and skips the redundant rearm; rearm preserved for the
  missed-handoff state (PENDING, no live timer). (2) Witness — every reuse
  logs 'Reusing in-flight operation for planned move' with operationId +
  rearmAction; rebalancer move logs carry the target under moveTargetNodeId
  (LoggingService overwrites payload 'nodeId' with the local node id).
  Guard test coordinator-reused-operation-rearm-guard.test.js, red on guard
  revert. Independent subagent verification PASS: no new stuck state —
  every predicate input is deleted-at-fire, deleted-on-clear, or
  deadline-self-expiring (worst false-"live" window ≤8s of transition-retry
  grace vs ≥1s planning cadence), erroring retry callbacks delete their
  timer entry first so re-entry rearm stays available, and the 1s
  checkTimeouts + recovery-reconcile lanes back the guard independently.
  Witness volume bounded by the ≥1000ms planning cadence clamp. Minor
  follow-ups noted, not landed: demote skip_not_pending to debug if chatty;
  MOVE_SKIPPED keeps plain replicaId (only nodeId is clobbered).
- GATE VALIDATION ROUND 1 (stat-gate-20260611T052934Z, 4 runs, clean
  containers, srcFingerprint 2611afcf2f919ffe): 1 CONVERGED / 1 SLOW /
  2 STALLED, 0 corrupt. Pre-registered expectations checked against seed
  full logs:
  (a) WITNESS WORKS — the reuse log is present in every run (28/60/83/45
  reuses vs 57/93/104/70 executes and 10/10/6/6 creates), making the
  formerly-silent layer-(b) absorption directly observable; rearmAction
  distribution per run: skip_not_pending 11/38/13/28,
  rearm_dispatch 9/19/70/15, skip_live_deferred_retry 8/3/0/2.
  (b) GUARD ENGAGES BUT COVERAGE IS PARTIAL (new finding): in run3
  (STALLED, 120 deferral failures, 0 completions) ALL 70 PENDING reuses
  rearmed and the skip never fired. Mechanism hypothesis, consistent with
  the verified timer lifecycle: retry timers delete their map entry as the
  FIRST statement of the callback, so during each in-flight dispatch
  attempt (~5s router timeout) the live-timer predicate is false and a
  planning-tick reuse rearms. Residual cost is bounded by claim semantics
  (concurrent dispatch is claim-protected; DEFERRED_RETRY_PENDING short-
  circuits when a deferred retry is active at claim time), but each such
  rearm still spends an owner read + claim attempt. If a future round
  needs tighter coverage, add an "attempt in flight" marker to the
  predicate rather than widening timers.
  (c) CREEP UNCHANGED, AS PRE-REGISTERED — stall class persists
  (publication_missing_active_node on the creeping joiners, missing=2/4),
  topline comparable to pre-fix (N=4 mixtures are not comparable beyond
  this). CL-008 is CONFIRMED not the stall driver; the supply-side
  event-loop attribution remains the live falsification step.
- Topline classifier rates at N=4 sample a mixture of stall modes — judge
  rounds by the mechanism witnesses above, not CONVERGED/STALLED counts.

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
- NOTE (existing pacing hint, for fix ii): buildOutboundQueueBackpressureError
  already attaches retryAfterMs + deferRetry to every rejection
  (message-router-shared-stage-3.js:16-31) — the storming sender either does
  not receive these per-entry rejections at its retry decision point or does
  not honor them; the sender-side trace should start there.
- FIX (ii) CORRECTION (same day, caught by independent subagent
  verification): the first landing (bb458817) wired the mute into
  RaftTransportAdapter — which is DEAD CODE (never instantiated in src;
  verified via git log -S: never was). The verifier confirmed the
  MECHANISM safe (only data-bearing appends and non-priority append-fails
  can resolve BACKGROUND; votes/acks/heartbeat-appends never mutable;
  liferaft's heartbeat-driven append-fail loop regenerates muted messages
  within ~3 heartbeats; the witnessed storm reproduces unchanged until the
  real paths are wired). RE-LANDED into the three REAL send paths via a
  shared scope-aware module (src/raft/raft-peer-backpressure-mute.js,
  process-wide shared state since outbound queues are per node):
  raft-group.js deliverPacket, raft-replica-base-runtime-helpers.js
  deliverPacket, partition-raft-node.js write; the adapter now delegates
  to the same module. Scope-aware keys: 'node'-scoped rejections mute the
  whole node lane, 'delivery_source'-scoped only the replica address; any
  success clears both. The raft-group REPLY path stays unmuted
  deliberately (response-shaped, follower->leader, not the storm
  direction). Worker bridge verified OUT of production scope (the only
  new Worker( in src is a test helper). Verifier-noted residual: the
  RAFT_TRANSPORT_BACKGROUND_APPEND_PARTITION_IDS set makes steady-state
  appends to healthy voters of sql_transactions/sql_transaction_participants
  mutable too — bounded at 500ms + one heartbeat and only after a real
  rejection; acceptable, recorded.
- FIX (ii) ORIGINAL NOTE (superseded above): per-peer backpressure mute in
  RaftTransportAdapter.write — on a ROUTER_OUTBOUND_QUEUE_BACKPRESSURED
  rejection the peer's lane is muted for the error's retryAfterMs (default
  500ms); BACKGROUND sends (append bulk / learner catch-up) are skipped
  with a deferRetry error while muted, CRITICAL/READINESS traffic (votes,
  heartbeat-appends, priority consensus) always attempts since the critical
  reserve may admit it; any successful delivery clears the mute. Raft
  tolerates dropped messages by design — muted sends are retransmitted by
  liferaft — so this is "slow", never "broken". Promoted to load-bearing by
  CL-003's falsification: the hot-retry storm starved learner voter-ready
  promotion (6.4k rejected sends to one learner in ~3min). Guard:
  test/raft/raft-transport-backpressure-mute.test.js (red on revert: mute
  engages, critical bypasses, window expires, success clears, ordinary
  errors don't mute). 521 raft + 1428 partition tests green.
- FIX (i) LANDED (2bfdca12, 2026-06-11): warn emission bounded to one per
  second per target-node queue with a suppressedSinceLastWarn counter, both
  emission sites sharing one per-queue budget; rejections, error fields
  (code/backpressureScope/retryAfterMs/deferRetry), and preemption behavior
  unchanged. Guard test outbound-saturation-warn-rate-limit.test.js (red on
  limiter revert; 200-rejection storm → ≤2 warns). Independent subagent
  verification PASS: queues are long-lived per target node (limiter state
  survives disconnects; removed only at router stop), no freeze/shape
  assumptions violated. Known low-severity tradeoff: a rare
  critical-source-reserve preemption warn can be shadowed by frequent
  rejection warns within the shared budget (the preempted sender still
  receives preemptedByCriticalSource on its rejection); trailing suppressed
  counts after a storm ends are not flushed.
- GATE VALIDATION ROUND 1 (stat-gate-20260611T052934Z): rate-limit works —
  60/39/8/31 emitted warns per run (vs 5,911 pre-fix), every one carrying
  the suppressed counter; seed run logs shrank ~60% (3.0-4.1k lines vs
  8.5-8.8k). CRITICAL READING for fix (ii): the suppressed totals show the
  UNDERLYING rejection storm is alive and larger than the pre-fix log ever
  revealed — 38,472 / 19,244 / 3,321 / 14,889 suppressed rejections per
  run. The warn flood is cured; the sender pacing violation (invariant
  part ii) is now the live remainder of this record and the suppressed
  counter is its quantitative witness.

## CL-010 Readiness Observation Diagnostics Must Be O(changes), Not O(calls)

- Status: fix-landed (2026-06-11; gate validation pending)
- Concern: readiness-observation-hot-path
- Failure Class: observer-effect-saturation
- First Violated Invariant: Per-observation diagnostics on the readiness hot
  path must cost O(semantic changes), not O(calls) — the recovery-epoch
  timeline's change check must not allocate a full frozen summary (embedding
  the entire projection readiness contract) and double-JSON.stringify it on
  EVERY getNodeReadinessSync, and a change check must be able to succeed:
  the compared payload included observedAtMs (fresh every call), so the
  "dedup" never matched and every observation appended.
- Authoritative Owner: control-plane readiness snapshot store
  (src/control-plane/control-plane-readiness-snapshot-store.js
  recordRecoveryEpochObservation, called from storeReadinessSnapshot on
  every readiness evaluation — dispatch admission, mutation readiness,
  rebalancer planning, lease checks all route through getNodeReadinessSync).
- Discovery Path (method note): EventLoopGapWatchdog (65691c7f) measured the
  seed's loop blocked ~95% of wall at ELU=1.0 with joiners clean, falsifying
  the CDC-hydration hypothesis (0.0% of gap time); its embedded V8 sampling
  profiler (cfef0e70, LAGRANGE_LOOP_GAP_PROFILE=1) then named this function
  as the dominant frame inside the gap windows of profiled run
  stat-gate-20260611T064855Z (5+ of the top-10 stack nodes; ~20s named self
  time + ~19s GC consistent with its per-call allocation churn; per-node
  ranking understates the aggregate share — profiler now aggregates
  per-function).
- Amplifier: recoveryActive derives from
  projectionReadinessContract?.recoveryOpen !== false, which defaults TRUE
  when the contract is null — exactly the formation/joining state — so the
  per-call tax was maximal precisely during the pressure-creep window.
- Fix Landed: signature-based change detection — a cheap concatenated
  signature over exactly the semantic fields of buildRecoveryEpochSummary
  (lifecycleState, the seven dimension booleans, contract state, priority
  recovery activity + reason codes, reason codes, recoveryOpen), EXCLUDING
  observation timestamps. Steady-state observations exit before any
  allocation; the summary is built only on epoch open, semantic change, or
  epoch close. Timeline semantics are now what the doc comment always
  claimed (distinct progress states, bounded), rather than "last N
  observations at call rate".
- Required Guard:
  test/control-plane/recovery-epoch-observation-hot-path.test.js — 1000
  identical-state observations with advancing observedAtMs produce ONE
  event (red pre-fix: 3 failures), semantic changes still append, event
  limit enforced, epoch closure archives without leaking the signature
  bookkeeping field, no epoch while recovery inactive. 331 adjacent
  readiness tests green.
- Exit Criteria:
  1. Watchdog gate run shows seed blockedPercentOfWall collapses from ~95%
     (or the residual re-pins to the next named frame — deepClone
     system-table-cache.js:633 and readEntryRow sqlite-log-adapter.js:113
     are the runners-up on record).
  2. Pressure-creep symptoms (registration steps in-flight 4.5+ min,
     publication missing joiners) improve or re-pin with the blockage gone.
  3. No readiness diagnostics consumer regresses (timeline still records
     distinct states).
- Notes:
  1. Same class as [[debug-logs-observer-effect-on-seed]] and CL-009(i):
     observability built for the harness perturbing the system under
     observation. Third instance — when a fourth appears, consider a
     systemic audit of hot-path diagnostics (grep JSON.stringify near hot
     accessors).

## CL-011 Cache Read Isolation Must Not JSON-Roundtrip On The Hot Path

- Status: fix-landed (2026-06-11; gate validation pending)
- Concern: readiness-observation-hot-path
- Failure Class: observer-effect-saturation (fourth instance of the class —
  per CL-010 note 1, a systemic hot-path-diagnostics/clone audit is now due)
- First Violated Invariant: Read isolation for cached system-table rows must
  not cost a JSON serialize+parse roundtrip per row per read —
  get/find/filter/getAll deep-clone every returned row, and the
  readiness/recovery projection pipeline drives table scans at readiness-
  evaluation frequency, so clone cost multiplies into the seed's loop.
- Authoritative Owner: system-table cache read isolation
  (src/cache/system-table-cache.js deepClone, used by get/find/filter/
  getAll; same roundtrip in system-table-cache-row-merge.js deepClone and
  priority-recovery-observation-snapshot-stage-2.js cloneJsonValue).
- Discovery Path: CL-010 gate round (stat-gate-20260611T070443Z, 1C/2S/1St)
  showed blockedPercentOfWall UNCHANGED (~92-96%) — CL-010 was real but not
  dominant. The per-function-aggregated profiler (improvement landed with
  CL-010) then ranked the stalled run's gap windows: deepClone
  (system-table-cache.js:633) 41.4% of top-frame hits + GC 13.5% (its
  transient-string churn), followed by the priority-recovery projection
  builders (normalizePriorityRecoveryStringList 8.8%,
  buildPublicationRecoveryGateSnapshot 4.5%,
  buildPriorityRecoveryPlanningProjection 4.0%,
  buildPriorityRecoveryPartitionSnapshot 3.6%, cloneJsonValue 2.8%) that
  drive those cache reads.
- Fix Landed: fastJsonClone (src/utils/fast-json-clone.js) — structural
  clone matching JSON.parse(JSON.stringify(...)) semantics exactly
  (undefined/function dropped from objects and null'd in arrays, non-finite
  numbers→null, toJSON honored; sole divergence: bigint dropped instead of
  throwing). Wired at all three roundtrip sites. Isolation semantics
  unchanged by construction; frozen-shared rows were considered and
  rejected (mutation-semantics blast radius across every cache consumer
  violates never-break-only-slow).
- Required Guard: test/utils/fast-json-clone.test.js — JSON-roundtrip
  parity on representative row shapes (flat rows, nesting,
  undefined/function dropping, non-finite numbers, Date/toJSON), clone
  isolation, and a perf assertion (measured ~3x on a small row; larger on
  wide rows, plus the GC share). 582 cache + 808 control-plane
  readiness/priority-recovery tests green.
- Exit Criteria:
  1. Watchdog gate: seed blockedPercentOfWall drops materially from ~92-96%
     (deepClone was 41% of named samples; GC share should also shrink).
  2. If residual blockage persists, the profiler re-pins it — projection-
     builder VOLUME (memoize projections until cache epoch changes) is the
     pre-registered next candidate, distinct from clone COST.
  3. Pressure-creep symptoms improve or re-pin.
- Notes:
  1. The projection pipeline's read volume (whole-table scans per readiness
     evaluation) is a separate latent record; this fix cheapens reads but
     does not reduce their count.
- GATE VALIDATION (stat-gate-20260611T073605Z, 4 runs: 1C/3St, 0 corrupt):
  FRAME ELIMINATED, BLOCKAGE UNCHANGED. deepClone vanished from the profile
  (fastJsonClone now 3.5% self; GC 13.5%->6.1%) -- the fix did what it
  claimed -- but seed blockedPercentOfWall held at ~94-97% and the
  self-time profile went DIFFUSE: top-10 frames cover only 33% of samples,
  spread across the priority/publication-recovery projection builders
  (normalizePriorityRecoveryStringList 4.9%,
  buildPriorityRecoverySyntheticSerialWaitWorkflowOwnedOperationContext
  4.1%, buildPublicationRecoveryGateSnapshot 2.1%, planning projections,
  raft sqlite readEntryRow 1.8%). VERDICT: the violated invariant is not
  any single function's COST but the VOLUME of the loop driving these
  builders (exit criterion 2's pre-registered candidate). Self-time cannot
  name a driving loop -- the profiler now also ranks by INCLUSIVE time;
  the next profiled run names the loop and opens the next record.


## CL-012 Query Routing Must Not Rebuild Node Readiness Per Decision

- Status: open (named 2026-06-11 by inclusive-time profiling; fix not
  started)
- Concern: readiness-read-amplification
- Failure Class: formation-livelock (microtask starvation)
- First Violated Invariant: The query executor's partition-routing path must
  not rebuild full node readiness (publication diagnostics, membership
  planning snapshot, evidence pipeline, authoritative system-table reads)
  per service row per routing decision. Corollary under verification:
  readiness evaluation must not recursively issue system-table reads that
  themselves require routing + readiness (amplification cycle).
- Authoritative Owner: query executor partition routing
  (src/query/query-executor-partition-routing-snapshot.js:26
  getPartitionRoutingSnapshot -> evaluatePartitionServiceRoutability per
  service row -> control-plane-readiness-service-node-methods.js:330
  getNodeReadinessSync) and the readiness sync evidence pipeline it
  triggers.
- Evidence (stat-gate-20260611T080523Z-run1, SLOW, 12 profile windows,
  220k samples, INCLUSIVE-time ranking aggregated):
  runMicrotasks 84.6% (the 20-95s gaps are microtask-chain starvation of
  timers, matching ELU=1.0 with zero I/O yield);
  getNodeReadinessSync 72.0%; getControlPlaneParticipationSync 65.7%;
  getPartitionRoutingSnapshot 65.4% / evaluatePartitionServiceRoutability
  64.8% (the query-routing driver); buildEvaluatedNodeReadinessSnapshot
  46.5% (full rebuild dominates — the stored-snapshot reuse is either
  missing or not saving the cost); executeAuthoritativeSystemTableRead
  36.0% (authoritative reads INSIDE the readiness path — the suspected
  cycle edge); resolveMembershipPublicationPlanningSnapshot 15.9%.
- Code-read finding (verified): getNodeReadinessSync computes its heavy
  evidence pipeline EAGERLY — getPublicationDiagnostics,
  getMembershipPublicationDiagnosticsSync,
  resolveNodeMembershipPublicationPlanningAnswerSync, getNodeServiceRows,
  getLifecycleState, buildNodeEvidence — BEFORE consulting
  getFresherStoredReadinessSnapshot, so even snapshot-reuse hits pay most
  of the per-call cost (node-methods.js:330-366).
- Next Falsification Step (before any fix): (a) measure the stored-snapshot
  hit rate and the cost split eager-prelude vs post-reuse on a profiled
  run (cheap counters, console-only); (b) confirm or refute the
  amplification cycle: does executeAuthoritativeSystemTableRead inside
  readiness evaluation route through getPartitionRoutingSnapshot ->
  getNodeReadinessSync again (stack evidence or code trace)? (c) identify
  WHO issues the routing decisions at this volume during formation (the
  seed's own control-plane SQL vs harness probes vs benchmark lanes).
- Fix directions (existing-systems-first, pending falsification):
  reorder getNodeReadinessSync so the stored-snapshot freshness check runs
  FIRST with only its required inputs; memoize the per-node readiness
  answer for the duration of one routing snapshot (a routing snapshot
  evaluates many service rows of the same few nodes); if the cycle is
  confirmed, break it with a non-recursive read mode for readiness-internal
  table reads (cache-visible reads cannot require routing). Respect the
  circular-dependency systemic pattern
  ([[circular-dependency-class-formation-vs-steady-state]]).
- Required Guard (when fixed): profiled gate run shows
  blockedPercentOfWall collapsing from ~94-97%, plus a unit/perf guard on
  the readiness fast path.
- PHASE 1 FIX LANDED (2026-06-11): three cuts, all verified
  diagnostics-only or reuse-preserving by code trace before changing:
  (a) executeAuthoritativeSystemTableRead no longer builds a routing
  snapshot for its base diagnostics (built on EVERY authoritative read;
  fields informational with existing cache fallbacks; owner-RPC targeting
  uses executeOnPartition's own routing, verified unaffected);
  (b) gateway operation-ledger diagnostics build the live routing snapshot
  only on failure signals (was unconditional per gateway operation);
  (c) getNodeReadinessSync consults the stored-snapshot reuse BEFORE the
  heavy evidence prelude — planning-snapshot resolution (15.9% inclusive),
  service-row scan, lifecycle, and node evidence now run only on reuse
  miss; the background-refresh hook receives serviceRows via a lazy getter
  (consumed only on its doubly-gated repair path).
  AMPLIFICATION CYCLE STATUS: the direct local-read path is verified
  non-recursive (partitionService.executeQuery straight to the replica);
  the eager diagnostics edges (a)+(b) WERE cycle edges and are now cut;
  the owner-RPC fallback edge (executeOnPartition -> routing -> readiness)
  remains by design but no longer triggers on local-read happy paths.
  Guards: readiness-read-amplification-fast-paths.test.js (8 failures on
  revert of the three cuts; hit path skips prelude, miss path unchanged,
  lazy serviceRows resolves on access, read-flow never builds the
  snapshot, gateway gates on failure). 331 readiness + 1248 cdc/gateway +
  full control-plane suite green (3 pre-existing owner-membership-driver
  stub failures unrelated, fail identically without these changes).
  DEFERRED (pending gate measurement): per-(partition,dimension) TTL memo
  of getPartitionRoutingSnapshot — has a real staleness tradeoff, only to
  be taken if the gate shows the remaining volume still dominates.
- PHASE 1 GATE VALIDATION (stat-gate-20260611T090827Z, 4 runs, clean
  containers, srcFingerprint 07bd91b10c887565): **4/4 CONVERGED, 0 corrupt
  — first 4/4 publication convergence in this work's history.** Wall times
  237-294s for three runs (vs 370-640s in every prior round). Gap
  STRUCTURE transformed: max single gap collapsed from 70-95s to 13-34s
  (mostly 13-17s); blockedPercentOfWall remains ~89-92% (the seed still
  works at capacity during formation) but the gaps are now short enough
  that registration writes and publication complete inside their budgets —
  cutting the per-read/per-operation amplification edges broke the
  COMPOUNDING, which was the load-bearing harm. Inclusive profile shape
  persists (getNodeReadinessSync 71%, full snapshot rebuilds 45.7%,
  resolveMembershipPublicationPlanningSnapshot up to 38.5% on the miss
  path) — phase 2 (stored-snapshot hit-rate measurement, routing-snapshot
  TTL memo) remains available as hardening if larger clusters need
  headroom, but is NOT the scenario blocker anymore.
- SCENARIO RE-PIN (the decisive readout): all four runs now fail the
  ACTIVE gate at a much later state that the CL-003 guarded witness
  claims by name: publication=PUBLISHED, publishedActive=5/5,
  missingPublished=0, coverage=5/5#complete, epoch=4, gateReasons=
  priority_control_plane_spread_pending,
  closure=CL-003#publication_converged_priority_spread_pending,
  priorityRecoveryState=recovering_in_flight. The formation-livelock chain
  (CL-006 join cleanup -> CL-007 quarantine -> CL-008 rearm -> CL-009
  storm -> CL-010 epoch dedup -> CL-011 clone cost -> CL-012 read
  amplification) is cleared; the live blocker for rolling restart is again
  CL-003 priority spread recovery — exactly the record whose witness
  infrastructure was built for this moment. CL-003's recorded
  falsification step (did the planner ever plan the spread move for the
  gap partition?) is now directly answerable with this session's
  witnesses: moveTargetNodeId is un-clobbered in EXECUTE_MOVE, in-flight
  reuse is logged with rearmAction, and the watchdog/profiler stand by.
  Statistical honesty: N=4 at 4/4 (vs 1-2/4 in recent rounds) plus the
  structural gap change and the consistent re-pin across all four runs
  support a real effect; a confirmation round will tighten it.
- Notes:
  1. CL-010 and CL-011 are now guarded sub-causes of this record's class:
     they cut per-call cost (recovery-epoch dedup, clone cost); this record
     owns per-call VOLUME and the eager prelude.
  2. The microtask-starvation structure explains why joiners show zero
     gaps: only the seed both leads the control plane and serves the
     routing-heavy query load during formation.


## CL-013 Established-Partition Joins Must Consume Owner-Dispatched Topology

- Status: open (named 2026-06-11 by a three-layer subagent trace with run
  artifacts; fix not started)
- Concern: replica-join-topology
- Failure Class: formation-livelock (with a control-row pollution side
  effect)
- First Violated Invariant: A REPLACE-created replica joining an
  ESTABLISHED partition must consume the owner-dispatched bootstrap
  topology (replicaIds/peerAddresses stamped on the operation by the
  coordinator). It must never silently fall back to its own locally-
  filtered SERVICES cache view — which under churn can reduce to
  self-only — and then run a FRESH solo raft bootstrap that forms an
  isolated single-node group.
- Authoritative Owner: replica handler join-context resolution
  (src/node/replica-handler-runtime-metadata-methods.js:275-289 — the
  dispatched hints are merged ONLY inside isFreshPartitionBootstrapWindow;
  src/node/replica-handler-class-part-2.js:120-129 — the window requires
  leader_node_id unset AND created_at===updated_at, i.e. NEVER true for
  the REPLACE-spread case) + the priority-partition sibling viability
  filter (runtime-metadata-methods.js:216-223 +
  class-part-2.js:152-184) + solo-bootstrap admission
  (replica-handler-create-methods.js:623 isJoiningExistingGroup).
- Witness (stat-gate-20260611T100326Z, ALL runs; certainty: the learner's
  cached partition row in the run1 artifacts proves the fresh window was
  closed — leader_node_id=seed, created_at!=updated_at): every priority-
  partition REPLACE create logs stage=starting peers=0/0, then "Became
  leader (liferaft)" (isolated solo group), then "did not become
  voter-ready within 60000ms", stage=failed — 10+ creates, zero
  successes. The solo group also OVERWROTE the canonical partition row's
  leader_node_id to itself (authoritative row updated at the solo
  became-leader instant) — an isolated group polluting canonical control
  rows.
- Exact live trigger chain: all three existing replicas of each priority
  partition co-locate on the seed post-formation; the seed's 15s ready
  lease is chronically expired in peers' cache views (seed still runs
  5-18s loop gaps; lease renewal + CDC propagation lag); the learner's
  viability filter (router CONNECTED + node ACTIVE + unexpired
  ready_lease_expires_at, node-readiness-policy.js:151-170) therefore
  excludes ALL siblings; replicaIds collapses to [self];
  existingReplicaCount=0 (hasViableLeader needs a viable row on
  leader_node_id) -> isJoiningExistingGroup=false -> fresh solo raft
  bootstrap.
- Aggravators (recorded for the fix):
  1. Services-row staleness is NOT a transient error: only partition/table
     metadata misses throw and trigger resolveReplicaContextWithRetry's
     hydration (runtime-metadata-methods.js:48-55,83-92,123-140); a
     self-only context returns "successfully" with no log and no retry
     (run1: peers=0/0 logged 7ms after the request).
  2. Seed-side topology stamping can also fail SILENTLY:
     buildOperationBootstrapTopology returns null for partitions on
     empty/incomplete cache rows (rebalance-coordinator-segment-3.js:
     341/363) with ZERO logging, and the "Creating operation" log omits
     topology — unconfirmable from artifacts (DX gap: add the stamped
     topology presence to the create log).
  3. Dispatch re-allocates operation.replicaId on re-dispatch
     (operation-workflow-dispatch-response-reconcile.js:325-334; run1
     shows r4->r5) while stepsHistory[0].replicaIds would still name the
     stale target.
- Guard Gap (why CL-003 evidence 8's guards missed this): the existing
  tests prove stamp+forward (replace-replica-workflow.test.js:190-292,
  pre-seeded complete cache) and hint consumption ONLY in the fresh
  window (replica-handler-create-topology-test-cases.js:539-616 uses
  leader_node_id:null, created_at===updated_at). Not covered: hints for an
  established partition (the actual case — provably dropped at
  runtime-metadata-methods.js:277), tolerated-null stamping, the
  viability filter reducing to self-only, and staleness-without-throw.
- Fix directions (existing-systems-first; next session): (a) merge
  owner-dispatched hints for REPLACE/ADD joins regardless of the fresh
  window — the dispatching coordinator IS the placement owner, its
  topology is authoritative over the learner's cache view; (b) never solo-
  bootstrap when the operation is an explicit REPLACE join
  (explicitOperationType is already on the request) — fail/retry instead
  of forming an isolated group; (c) make self-only-context a retryable
  staleness condition; (d) log the null-topology path at the seed.
- FIX LANDED (2026-06-11): (a) dispatched bootstrap hints now merge
  UNCONDITIONALLY (replica-handler-runtime-metadata-methods.js — the
  fresh-window gate on hint consumption removed; the window still governs
  join-mode semantics only); (b)+(c) an explicit REPLACE join whose
  resolved topology is SELF-ONLY throws a retryable
  'Replica join topology unavailable' error (new transient class wired
  into isTransientMetadataResolutionError, so the existing
  hydrate-from-authority retry loop engages) instead of solo-bootstrapping;
  join MODE deliberately unchanged — with peers present but no viable
  leader, voter-mode re-formation remains the designed dead-leader
  recovery (the pre-existing guard test for disconnected-leader REPLACE
  enforced this and was honored, not weakened); (d) the seed's tolerated
  null-topology paths now warn ('Create dispatch proceeding without
  bootstrap topology', reasons no_service_rows/incomplete_topology) and
  the CREATE_OPERATION log carries
  bootstrapTopologyStamped/bootstrapReplicaIdCount.
  Guards: three new cases in
  test/node/replica-handler-create-topology-test-cases.js (established-
  partition REPLACE consumes hints with full cohort and never self-only;
  hint-less self-only REPLACE fails retryably with NO partition service
  created; legacy non-REPLACE fallback unchanged) — 4 failures on fix
  revert. 1175 node + 224 replace-workflow tests green.
- SUBAGENT VERIFICATION (PASS): wiring confirmed end-to-end on the real
  CREATE_REPLICA path (dispatch FIELD operationType -> handler ->
  context); quorum math verified slow-only — liferaft computes majority
  from each node's LOCAL peer list and peers join only via explicit
  join(), so stale hint entries can only inflate the JOINER's own quorum,
  never the group's; voter-mode join cannot win elections against voters
  holding committed entries (sect. 5.4 vote restriction present in the
  fork); the solo-leader break path requires replicaIds.length===1, now
  unreachable for explicit REPLACE. Post-verification cleanups applied:
  case-normalized the REPLACE comparison (was fail-open on non-canonical
  case) and fixed a misleading test title.
- FOLLOW-UPS recorded, not landed: (1) stamped hints do not filter
  terminal/failed service rows (buildReplicatedServiceBootstrapTopology /
  merge time) and peer reconciliation never prunes row-less peers — a
  stale hint entry persistently inflates the joiner's own quorum
  (slow-only; filter at stamp or merge); (2) the legacy
  replica-lifecycle-manager.js:346-373 CREATE path drops operationType
  (guard inert there; that path always carries replica_ids so self-only
  is improbable); (3) when ALL siblings are genuinely dead and hints are
  absent, each create attempt burns syncTimeoutMs then terminal-FAILs
  (planner re-plans) — correct but slower than a DEFER_RETRY shape.
- GATE VALIDATION (stat-gate-20260611T110228Z, 4 runs): MECHANISM
  VALIDATED, TOPLINE REGRESSED — the two must be read together.
  Mechanism: 99 replica creates per run now carry peer topology and reach
  stage=ready (prior round: EVERY priority create was peers=0/0 and
  failed); the topology-missing throw fired zero times harmfully; the
  remaining 4-8 peers=0/0 starts are non-REPLACE provisioning creates
  (legitimate fresh bootstraps). CL-013's invariant holds.
  Topline: 1 CONVERGED / 3 STALLED (runs 1+3 on the CL-003 spread
  surface; runs 2+4 in a publication-missing-all-joiners mode) vs
  11C/1S/0St across the prior three rounds — a real regression, not N=4
  noise.
  FIRST HYPOTHESIS FALSIFIED (election churn): stable converged rounds
  show 42-46 'Became leader' events too — that is normal formation noise,
  not new churn; the planning-gate bypass review confirmed the gates
  admit formation-time priority REPLACE BY DESIGN (the ACTIVE gate
  requires spread, so deferral would be circular) — that design stands.
  ACTUAL WITNESS (run2, verified): the four joiners COMPLETED
  registration ('Node endpoint registered in cluster', 'Joining phase
  completed') — registration is NOT creeping. The stall is the
  PUBLICATION side: at run end the seed's owner-membership driver traces
  'skip no-deficit missingPublishedCount=0' (27 traces, all no-deficit)
  while the gate reports publication_missing_active_node for ALL FOUR
  registered joiners. Owner and gate disagree about the deficit — the
  owner-vs-gate mismatch class that the hard-cutover Phase 4 was built to
  eliminate — and it appears in the round where the
  control_plane_publications-p1 partition itself underwent REPLACE spread
  recovery (created 11:06:55 -> 35a891b8) for the first time. The
  REPLACE-target node's driver correctly defers ('skip not-owner', 232
  traces).
  CL-014 (FINAL RE-PIN, completed same session — full witness chain from
  run2 artifacts): the OWNER IS RIGHT and the GATE'S ORACLE IS STALE, and
  the staleness is itself the new invariant violation:
  (a) owner driver final trace: publicationEpoch=5,
  publishedActiveNodeCount=5/5, missing=0, contract pending only on
  priority_spread_pending — publication genuinely converged at the owner;
  (b) gate final witness (control snapshot via joiner ebc4aa0b):
  epoch=1, publishedActive=1/5, missingPublished=4, disagreementNodes=4 —
  ALL FOUR joiners' caches are FROZEN at the pre-REPLACE publication
  epoch 1 for the rest of the run (~5min) while epochs 2-5 commit on the
  seed;
  (c) the freeze begins in the round where control_plane_publications-p1
  underwent its first SUCCESSFUL REPLACE (11:06:55 -> 35a891b8, unblocked
  by CL-013;) joiners completed registration normally;
  (d) the gate loops handoffOutcome=write_deferred/owner_reconcile_enqueued
  while the owner answers no-deficit — a stalemate between a correct
  owner and a stale oracle.
  CL-014 THIRD AND FINAL RE-PIN (same session, three-layer subagent CDC
  trace, code+artifact evidence): the REPLACE hypothesis is REFUTED — no
  subscriber was lost, leadership never moved, and the publications
  REPLACE in run2 in fact FAILED voter-ready (r4 never activated; the
  'successful REPLACE' framing was wrong for this partition in this run).
  ACTUAL MECHANISM (verified): publication CDC fan-out to non-hosting
  nodes is STATELESS POINT-IN-TIME delivery — the partition leader's
  local subscriber propagates each event to message groups resolved from
  the SENDER'S services cache at event time
  (cdc-group-propagation-routing.js:95-133), and groups absent/not-ACTIVE
  at that instant are skipped SILENTLY with no buffer, retry, or replay
  (cdc-group-propagation-delivery-methods.js:670-737). In run2 the ENTIRE
  publication stream (epochs 1-5, 10 events) completed by 11:07:27 —
  BEFORE two joiners wired CDC at all (11:09:05/11:09:43) and WHILE the
  other two joiners' message-group rows were not yet ACTIVE-with-address
  in the seed's post-restart cache (their services rows were still being
  re-inserted; the seed's own mg ingress was broken 11:06:51-11:07:15).
  The owner then reached no-deficit via its own authoritative read
  (11:07:07, epoch 5, 5/5) and NEVER WROTE AGAIN — so no later event
  could carry the joiners past their epoch-1 bootstrap snapshot.
  THIS EXPLAINS THE SCENARIO'S NON-DETERMINISM WHOLESALE: a run converges
  iff the LAST publication write lands after the LAST joiner becomes
  fan-out-targetable (verified contrast: in converged 100326Z-run1 the
  final epoch-7 write at 10:05:26 postdated all CDC wiring at 10:05:16
  and fanned out to everyone; the intermediate epochs were lost there too
  but the gate reads only the latest row, masking it). The stat-gate
  CONVERGED/SLOW/STALLED mixture has been sampling this startup RACE.
  CL-014 FIRST VIOLATED INVARIANT (final): a joining node must be able to
  CATCH UP on publication rows written inside the (bootstrap-snapshot,
  CDC-fan-out-targetability] window — point-in-time fan-out plus a
  one-shot pre-subscription snapshot closes no such window.
  MINIMAL FIX SURFACE (existing mechanisms, from the trace):
  (a) re-run the EXISTING join-time snapshot hydration
  (query-system-state-phase.js:416-499) immediately AFTER 'CDC
  subscriptions confirmed active' — the read exists, it is merely ordered
  before the stream arms and never re-run; epoch 5 was in the seed's SQL
  from 11:07:04, so this alone closes run2's window for all four joiners;
  (b) CDCPipelineReadinessGate.pipelineProven is satisfied VACUOUSLY by
  the pre-gate snapshot (cdc-pipeline-readiness-gate.js:74-78) — it
  should require evidence of live propagation, not just any cached row;
  (c) longer-term: the remote fan-out leg lacks the replay-on-subscribe
  analog that the partition-local layer already has
  (partition-cdc-delivery.js:424-465 catch-up) — recorded, not required
  for the scenario.
  REFUTED ALTERNATIVES (for the record): zero-subscriber buffering loss
  (would have warn-logged EVENT_BUFFERED; none), REPLACE-moved CDC source
  (no removes, leader stayed on seed), joiners rejecting stale events (no
  apply activity at all). RESIDUAL noted: voter-ready failures persist
  even with correct peer topology (12-15/run) — separate from this
  record, likely the learner-catchup-vs-budget layer.
  Secondary (CL-002 coupling): the harness gate knowingly used a
  'stale_usable' snapshot for minutes — witness selection should require
  an advancing publication watermark or cross-check the owner before
  declaring no-progress.
- Relationship to other records: this is the ACTUAL CL-003 blocker (the
  planner and spread summary are exonerated; operations fail at learner
  join). CL-009(ii)'s mute landed correctly but is NOT load-bearing here
  — gate stat-gate-20260611T100326Z showed the storms are all
  CRITICAL-priority traffic (heartbeat-appends + priority appends), which
  the mute exempts by design (0 muted skips); the storm itself is partly
  DOWNSTREAM of this record (the seed streams to an isolated replica that
  can never catch up). Same systemic class as
  [[circular-dependency-class-formation-vs-steady-state]]: a
  steady-state trust rule (only viable-leased siblings count) goes
  circular during recovery (the lease provider is the node being
  recovered around).
- Topline note: all 4 runs of 100326Z CONVERGED on publication (8/12
  cumulative post-CL-012 plus 4 more = 11C/1S across 12 runs, zero
  stalls) — formation remains healthy; the scenario still fails at the
  ACTIVE gate on this record.
