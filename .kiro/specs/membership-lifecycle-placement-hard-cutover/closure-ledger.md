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
| CL-013 | guarded | replica-join-topology | A REPLACE-created replica joining an ESTABLISHED partition must consume the owner-dispatched bootstrap topology; it must never fall back to a locally-filtered cache view that can reduce to self-only and trigger a fresh solo raft bootstrap. |
| CL-014 | guarded | cdc-fanout-targetability | A joining node must be able to catch up on CDC-propagated rows written inside the (bootstrap-snapshot, fan-out-targetability] window — remote CDC fan-out is point-in-time with no replay. |
| CL-015 | fix-landed | raft-learner-catchup | Raft catch-up must deliver in batches from the follower's actual position — not a one-entry-per-round-trip backward fail-walk that can never complete a formation-sized log inside the voter-ready budget. |
| CL-016 | guarded | replica-activation-evidence | Voter-ready activation must not require a durable services-row round-trip through the control plane being recovered: the priority local-commit fallback must make the LOCAL cache reflect local truth (or the activation check must accept local authoritative evidence). |
| CL-017 | fix-landed | operation-ledger-self-reference | Operation workflow transitions must complete while the operation ledger's own partition is under modification — replica_operations writes fail with participant failures exactly when replica_operations-p1 is mid-REPLACE (4/3, surplus pending removal), pinning operations in CREATING/SENDING forever and blocking pre-restart quiescence. |
| CL-018 | guarded | raft-log-scan-per-heartbeat | A follower's commit catch-up must not rescan and JSON-parse the whole raft log on every heartbeat: sqlite followers never persist committedIndex, so getUncommittedEntriesUpToIndex degenerates to a full-table parse per heartbeat per priority partition on the seed — the top self-time frame in the freeze windows that block CL-017's quiesce. |
| CL-019 | guarded | readiness-snapshot-reuse-per-change | Readiness evaluation must be per-change, not per-call: (1) the CL-012 stored-snapshot reuse predicate rejects watermark EQUALITY (snapshot exactly reflects the current row — the common state between heartbeats), so the sync fast path is structurally a cache-lag bridge with ~0% hit rate and every routing decision runs the full evidence + planning + snapshot build; (2) even on a hit, the pre-check prelude rebuilds the full publication-recovery protocol snapshot (gate + participation maps + normalize/freeze storm) from an effectively-constant membership-publication row, per call. |
| CL-020 | guarded | priority-recovery-event-decision-cost | The rebalancer's priority-recovery visibility cache listener must decide whether an event warrants a rebalance check CHEAPLY: it currently computes the full operation-creation planning-gate snapshot + surrogate follow-up decisions (JSON-parsing steps_history of replica-operation rows) on EVERY cache-change event of EVERY table — during operation churn each row update triggers a full planning re-derive, the residual seed-freeze head after CL-019. |
| CL-021 | guarded | active-gate-promotion-closure | The mode=load ACTIVE wait must close once publication, coverage, and priority recovery are green: 4/4 runs stall there with the handoff contract degraded — sub-mode (A) priority partitions wedged at 1 distinct node (spread recovery blocked); sub-mode (B) the catchup fence denies promotion while recoveryProtocolState=steady_published and every owner-visible count is green (reason code aliased to published_active_coverage_incomplete; fence missingProofReasons not yet observable in the trace). |

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
  FIX LANDED (2026-06-11, systemic per user directive — close the window
  for ALL propagated tables, not the one that bit):
  (1) src/cdc/cdc-integration-service-authoritative-catchup.js —
  hydrateCdcPropagatedTablesFromAuthority(service): re-reads every
  CDC_PROPAGATED_TABLES table via the existing authoritative read flow
  (owner-RPC fallback + pressure deferral honored, bounded per-table
  retries) and applies rows through the existing merge-safe
  applyAuthoritativeCacheRepair; best-effort by contract (a table that
  cannot be read is logged and skipped — the live stream and repair paths
  remain). Exposed as a CDCIntegrationService method.
  (2) Wired at the join seam: signalReadyForReplicas runs the catch-up
  immediately after awaitCdcSubscriptionsForReadiness (gate passed OR
  degraded), before readiness advertisement — pull-on-arm +
  push-stream-after; never blocks readiness.
  (3) Fan-out silent-drop observability: resolveKnownMessageGroupIds +
  CDCGroupPropagationService.recordSkippedFanoutGroups — transition-logged
  warn ('CDC fan-out skipping known message groups not yet targetable')
  whenever the skipped-group set changes, so the remaining mid-stream drop
  class is witnessable instead of silent.
  DELIBERATELY NOT CHANGED: CDCPipelineReadinessGate.pipelineProven's
  vacuous constructor satisfaction stands for now — redefining the gate's
  evidence model is entangled with seed bootstrap (formation-regression
  risk) and the catch-up defuses the window it mis-certifies; revisit with
  the Task-28 audit.
  Guards: test/cdc/cdc-authoritative-catchup-hydration.test.js (applies
  all rows per table; pressure-deferred reads retry bounded then skip;
  throwing reads never escape; keyless rows skipped). 206 node-joining +
  1019 cdc/topology tests green (15 bootstrap-suite failures pre-exist
  identically without these changes).
  SUBAGENT VERIFICATION (PASS) + post-verification hardening: wiring
  verified on the REAL join path (READY_LEASE_ASSIGNED checkpoint;
  cdcIntegrationService assigned in the earlier JOIN_INFRASTRUCTURE_READY
  checkpoint and covered by resume re-runs; DURABLE_REJOIN passes through
  the same flow); cache regression safety verified (stale guards on 17/19
  tables + dedicated publication-epoch and node-heartbeat merges; the
  'indices' table lacks updated_at — LOW, pre-existing class); load
  bounded (19 sequential one-shot SELECT*s per join, pressure-governed,
  not CL-012-class). The verifier's mutation test found the wiring itself
  UNGUARDED (deleting the call left 219 tests green) — closed with
  test/bootstrap/node-joining-cdc-catchup-wiring.test.js (order: cdc-gate
  -> catch-up -> next gate; throwing catch-up never blocks readiness;
  missing service warns and proceeds; mutation now yields 3 failures).
  RESIDUALS recorded, not landed: (1) UPSERT-only catch-up cannot remove
  rows DELETEd inside the window (ghost rows decay via status/lease/epoch
  filters — slow-only for traced consumers; storage_reservations ghost
  consumers not fully traced, flagged); (2) DURABLE_REJOIN nodes that
  restored system-table replicas may serve the catch-up read from their
  own not-yet-caught-up follower (ANY_REPLICA local preference), making
  hydration a no-op exactly when stale — consider a caught-up gate or
  owner-RPC preference for the catch-up read; (3) known-groups set has no
  status filter (decommissioned groups read as perpetually skipped —
  misleading framing in the new warn).
  GATE VALIDATION (stat-gate-20260611T122403Z, 4 runs): EXACTLY AS
  PRE-REGISTERED — CL-014 CLOSED AT THE MECHANISM LEVEL AND THE
  SCENARIO'S NON-DETERMINISM IS GONE. (a) Catch-up engaged on all four
  joiners in every run: 19/19 tables hydrated, ~285-293 rows applied,
  zero failed tables, logged at the readiness seam. (b) The publication
  race is closed: the gate's witness reads the true epoch (7/3/6/3 across
  runs) with publishedActive=5/5 — owner and gate agree for the first
  time; no epoch freeze, no publication_missing_active_node anywhere.
  (c) ALL FOUR runs fail the ACTIVE gate IDENTICALLY at
  closure=CL-003#publication_converged_priority_spread_pending — a
  deterministic failure surface after a history of CONVERGED/SLOW/STALLED
  mixtures. 4/4 publication-classifier CONVERGED, 0 corrupt.
  STATUS: CL-014 -> guarded. The single remaining rolling-restart blocker
  is the CL-003/CL-013-residual voter-ready promotion failure: correctly
  peered REPLACE learners still miss the 60s voter-ready budget
  (witnessed earlier: the seed's raft stream to the learner is throttled
  by the per-source cap at 48-pending/8-in-flight while priority
  partitions carry sizable logs — learner full-log catch-up vs the fixed
  60s budget is the candidate invariant for the next record).
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


## CL-015 Raft Catch-Up Must Batch From The Follower's Position

- Status: fix-landed (2026-06-11, commit 44d9c37c; gate validation pending)
- Concern: raft-learner-catchup
- Failure Class: formation-livelock (voter-ready budget)
- First Violated Invariant: learner/follower catch-up must deliver log
  entries in batches starting from the FOLLOWER'S actual position. Base
  liferaft does the opposite twice over: (a) the follower's append-fail
  echoes the LEADER'S prevLog info, so the leader re-sends from one index
  earlier each round — a BACKWARD WALK of (leaderLast − followerLast)
  round trips that delivers nothing; (b) recovery then proceeds ONE entry
  per round trip (the append-fail handler replies with a single entry;
  the follower reads only data[0]). A REPLACE learner with an empty log
  joining a priority partition with a formation-sized log can never
  finish inside the 60s voter-ready budget — the deterministic CL-003
  failure surface after CL-014 closed the publication race. Witness:
  10k-18k per-source-cap-rejected sends per learner per minute (each head
  append/heartbeat to the lagging learner spawning another fruitless
  walk), every REPLACE learner timing out, planner looping r4->r5->r6.
- Authoritative Owner: the local liferaft patch layer
  (src/raft/liferaft.js patchIncomingDataListener — the established seam
  for protocol fixes over @markwylde/liferaft).
- Design (rubber-duck-reviewed; the reviewer REJECTED the first design —
  batching forward from failedIndex is cosmetic because the backward walk
  dominates — and supplied the load-bearing correction): every packet
  carries the SENDER'S last log info as packet.last, so the leader
  fast-forwards: batchStart = min(failedIndex, followerLast+1),
  batchEnd = min(start+63, leaderLast). One round trip collapses the
  walk; then 64 entries per round trip.
- Fix Landed (44d9c37c):
  (1) Leader side: APPEND_FAIL interception gated on state===LEADER &&
  packet.term===raft.term (anything else delegates to the base handler's
  step-down/stale logic); fast-forward start; entries via log.getRange
  (sqlite) or per-entry walk (in-memory adapter, stops at compaction
  gaps); reply built by appendPacket(firstEntry) with data=batch (fresh
  term/state; last = leader's info for start-1 — the exact consistency
  precondition); per-follower in-flight dedupe (tail+TTL 400ms, cleared
  by tail ack and on state change) so the self-regenerating fails cannot
  spawn overlapping batches into the already-capped lane.
  (2) Follower side: batch packets (data.length>1) run the base handler
  first (canonical preamble, consistency check, truncation, first-entry
  save+ack, commit catch-up), then apply entries 2..N in ascending order
  via saveCommand (NEVER the adapter's bulk append — it would persist the
  leader's committed flags and break the follower's commit emission), ack
  the TAIL once (prefix-commit semantics make a tail ack a truthful
  matchIndex claim), and re-run commit catch-up. Guards: a batch whose
  precondition precedes the committed prefix is DROPPED (no 64-wide
  truncate-committed exposure); entries <= committedIndex are skipped.
  (3) Compatibility verified: old follower + new leader reads data[0]
  and still progresses (and benefits from the fast-forward); new follower
  + old leader uses the unchanged single-entry path; the transport copies
  data opaquely and the delivery classifier treats batches as the same
  BACKGROUND append class.
- Required Guard: test/raft/liferaft-catchup-batching.test.js — batch
  starts at follower position (backward walk eliminated), head capping,
  in-flight dedupe + tail-ack re-arm, stale-term delegation, follower
  full-batch apply with tail ack + commit catch-up, stale-batch drop
  without truncation, mismatching batch still emits the base append-fail.
  Red on revert (14 failures). 3,472 raft/partition/message-group tests
  green.
- Adjacent findings from the design review (recorded, not changed here):
  1. liferaft's consistency check is INDEX-ONLY (never compares
     packet.last.term) — a divergence from raft sect. 5.3 present in the
     base single-entry path; the batch path inherits it (a term check at
     batch apply is a recorded improvement).
  2. sqlite commandAck unconditionally setCommittedIndex(index) — catch-up
     acks at old indexes REGRESS the leader's persisted committedIndex
     until the next head ack (flapping reads for committedIndex
     consumers; 64x rarer with batching).
  3. On sqlite FOLLOWERS committedIndex is never persisted by commit(),
     so every append/heartbeat triggers getUncommittedEntriesUpToIndex —
     a full-table scan + JSON.parse per row per heartbeat on
     formation-sized logs; plausible residual contributor to seed loop
     load (CL-012-adjacent).
  4. The systemic successor: snapshot-install + log compaction for the
     sqlite log (no compaction exists; catch-up cost grows with cluster
     age). liferaft has no InstallSnapshot; partition syncFromLeader is a
     vestigial placeholder. Batch catch-up is the correct now-fix; record
     snapshot-install as the long-term replacement.


## CL-016 Voter-Ready Activation Must Not Round-Trip Through The Recovering Control Plane

- Status: open (pinned 2026-06-11 from stat-gate-20260611T131558Z artifacts
  + code trace; fix not started)
- Concern: replica-activation-evidence
- Failure Class: formation-livelock (circular dependency class — see
  systemic pattern note)
- First Violated Invariant: isReplicaVoterReady
  (replica-handler-class-part-2.js:555-573) requires a SERVICES row with
  an address in the LOCAL systemTableCache. For priority control-plane
  partitions the durable SERVICES status write is EXPECTED to fail
  retryably during recovery (it writes through the very control plane
  being recovered) and falls back to
  commitPriorityReplicaCreateStatusLocally
  (replica-handler-create-methods.js:407+) — which updates the replica
  STATE MACHINE and localServices but NEVER seeds a SERVICES row into the
  systemTableCache. The activation check therefore polls a row that
  cannot exist within the budget; every priority REPLACE replica fails
  voter-ready regardless of raft catch-up speed.
- Witness (131558Z run2, all runs equivalent): 5 replicas reach 'Waiting
  for replica voter-ready activation'; 0 reach 'Replica reached
  voter-ready activation state'; every create logs 'Replica create status
  write deferred after retryable control-plane failure' at creation. The
  ROLE condition is secondary: 3 of 5 went voter-mode (role != LEARNER
  immediately — the CL-013 no-viable-leader path), 2 went learner-mode
  with the 5s priority promotion delay; promotion gating
  (partition-service-learner-promotion-methods.js:440+) is leader-discovery
  + voter-count math, NOT catch-up. The missing SERVICES row is the
  blocking condition in both modes.
- CL-015 RELATIONSHIP (honest framing): the catch-up batching (44d9c37c)
  is correct and unit-guarded — the backward fail-walk was real — but it
  was NOT the load-bearing voter-ready blocker; its gate run showed 0
  activations unchanged because this record blocks first. Validation of
  CL-015's runtime effect (storm reduction, catch-up duration) is
  deferred until this record unblocks activation. Gate topline for
  131558Z: 4/4 publication CONVERGED, runs 2/3 on the CL-003 surface,
  runs 1/4 reaching NEW later surfaces ('Control plane did not quiesce',
  'Cluster load readiness did not stabilize') — the frontier is moving.
- Fix directions (systemic, existing-mechanisms-first):
  (a) commitPriorityReplicaCreateStatusLocally additionally applies the
  SERVICES row into the local systemTableCache (it already computes every
  field incl. serviceAddress via buildTrackedServiceAddress; the
  'bootstrap hydration exception' sanctions direct applySystemTableChange
  call sites — add this one) so the local cache reflects local truth and
  EVERY consumer (voter-ready, routing viability, fan-out targets)
  benefits; the durable write confirms later via CDC.
  (b) Failure-path symmetry: async-creation-failed/cleanup must apply the
  matching removal/failed transition to the locally-seeded row (no ghost
  'creating' rows after terminal failure).
  (c) Alternative (narrower, fallback if (a) has unexpected consumers):
  isReplicaVoterReady accepts the tracked-service/state-machine evidence
  when the cache row is absent and the partition is priority.
  (d) Check the durable-write retry story: deferRetryableReplicaCreateStatusWrite
  drops without scheduling a retry — the row reaches the DISTRIBUTED
  services table only if a later workflow step writes it; verify what
  eventually persists it (status transitions on sync/active?) and whether
  the seed's peer-reconciliation gets it in time.
- Systemic pattern: third instance of
  circular-dependency-class-formation-vs-steady-state — a steady-state
  invariant (activation requires the durable row visible) goes circular
  during recovery (the write path for that row IS the thing recovering).
  The existing local-commit fallback acknowledged the cycle but only
  half-applied it (state machine yes, cache no).
- FIX LANDED (2026-06-11): (a) commitPriorityReplicaCreateStatusLocally
  now seeds the SERVICES row into the local systemTableCache
  (seedLocalPriorityServiceRow: service_id/type/partition/node/status/
  address via buildTrackedServiceAddress; sanctioned direct
  applySystemTableChange site) — local cache reflects local truth, the
  durable write's CDC round-trip supersedes later (newer updated_at wins
  in the cache merge); (b) failure-path symmetry: terminal creation
  failure re-seeds the row as FAILED (no 'creating' ghosts);
  (c) INTERACTION FIX the seed exposed: the lifecycle persistence path
  (replica-state-machine-transition.js updateReplicaStateInCdc) chose
  UPSERT-vs-UPDATE by LOCAL cache existence — the seeded row would have
  flipped it to UPDATE against a distributed row that never landed.
  Resolved with an explicit local-only marker on the state machine
  (markServiceRowLocalOnly at seed time; lifecycle writes UPSERT while
  marked; the marker clears when a durable write commits). A
  previous-state heuristic was tried and rejected — it broke the pinned
  non-priority semantics (normal flow: SYNCING=update after a successful
  durable CREATING write).
  Guards: new CL-016 case in replica-handler-create-admission-test-cases
  (deferred CREATING write -> local row seeded with address before
  service start, marked local-only at factory time; SYNCING lifecycle
  write becomes UPSERT; durable commit clears the marker) — red on src
  revert. 238 replica-handler + 1181 node-suite tests green.
- GATE VALIDATION (stat-gate-20260611T140359Z, 4 runs, 4/4 publication
  CONVERGED, 0 corrupt): CL-016 CLOSED AND THE LADDER MOVED TWO RUNGS.
  (a) VOTER-READY WORKS: 8/9/5/9 'Replica reached voter-ready activation
  state' per run (the FIRST activations in this work's history) with
  0/3/0/0 failures.
  (b) CL-003's SPREAD SURFACE IS GONE: no
  priority_control_plane_spread_pending in any run — the quiesce
  diagnostics show priority partitions at 4/3 replicas across FOUR
  DISTINCT NODES (spread recovered; surplus awaiting source removal).
  CL-003's primary exit criterion (priority partitions recover to
  required spread during the red scenarios) is MET at this surface.
  (c) NEW FRONTIER: runs 1/2/4 fail PRE-RESTART at 'Control plane did not
  quiesce within 300000ms' with inFlightCount~3 and 4/3 surplus replicas
  — the REPLACE source-removal half does not complete/quiesce (CL-017
  candidate: replace source removal + operation quiescence). Run 3 got
  PAST quiesce, began ACTUAL ROLLING RESTARTS (6 boots = first restarted
  node ever), and failed at 'Restarted node did not become recovery-ready
  within 120000ms' — the scenario's true subject is finally exercised
  (second new record candidate: restart recovery-readiness).
  (d) CL-015 runtime note: seed suppressed rejects still ~15.7k in run1 —
  with learners now activating, the residual storm window needs re-pinning
  (likely the source-removal phase / restart catch-up); evaluate with
  CL-017.


## CL-017 Operation Workflow Transitions Must Survive The Ledger's Own Surgery

- Status: open (pinned 2026-06-11 from stat-gate-20260611T140359Z run1
  artifacts; fix not started)
- Concern: operation-ledger-self-reference
- Failure Class: formation-livelock (pre-restart quiescence; circular
  dependency class, now SELF-REFERENTIAL)
- First Violated Invariant: operation workflow step transitions
  (CREATING -> next, SENDING -> next) must be able to complete while the
  operation ledger's own partition (replica_operations-p1) is itself
  under modification. Witness: the TARGET side now completes perfectly
  (second-round replica_operations-p1-r5 on 35a891b8: created 14:07:30,
  voter-ready in 2 SECONDS, 'Replica creation completed' 14:07:49 —
  CL-013..016 chain fully working) but the operation-row UPDATE fails
  repeatedly with 'Distributed operation failed due to participant
  failures' on tableName=replica_operations (also seen:
  query_admission_deferred on nodes) — for 5+ minutes, via the
  'Deferred retryable replica operation transition failure' retry loop —
  so the operations stay CREATING/SENDING, the quiesce gate counts
  inFlight~3 forever, and runs 1/2/4 fail PRE-restart at 'Control plane
  did not quiesce within 300000ms' while the priority partitions sit at
  4/3 with the surplus removal never reached.
- Self-reference: the operation rows for replica_operations-p1's own
  REPLACE live IN replica_operations-p1 — the partition's surgery must
  write its progress into the partition being operated on, while that
  partition is at 4/3 with one stale/pending-removal participant. The
  'participant failures' likely involve the surplus/retiring replica
  still counted as a write participant.
- Next Falsification Step: identify the failing PARTICIPANT in the
  distributed replica_operations write at 4/3 (which replica NACKs/times
  out — the retiring source? the new voter? quorum math at 4 voters?);
  check how distributed writes enumerate participants vs raft voters
  mid-membership-change; then decide the invariant fix (e.g., write
  quorum follows raft membership not service rows; or the retiring
  replica must be excluded from write participation once REPLACE enters
  the removal phase; or transition writes for an operation may use the
  same local-truth fallback class as CL-016 when the ledger partition is
  self-referentially blocked).
- Related: CL-015 runtime re-pin folds in here (seed suppressed rejects
  ~15.7k in run1 — measure whether the storm window now coincides with
  this 4/3 phase); the second new surface (restarted-node
  recovery-readiness, run3, 120s budget) is SEPARATE and queued after
  this record.
- FALSIFICATION EXECUTED (2026-06-11, three-layer subagent trace,
  code+artifact citations) — the record SPLITS INTO TWO PROVEN LAYERS:
  (1) PRIMARY (proven): 'participants' are routed service-row replicas on
  the canonical leader NODE (query-executor-partition-routing-candidates
  :172-232), and every attributed participant failure in the run points
  at the SEED — which hosts 3 of the 4 replicas and freezes again in
  this window (23 event-loop gaps, max 23.5s, 48/48 critical outbound
  saturation, 41 quarantine liveness-skips). A 23s freeze exceeds the
  15s query budget, and one such attempt consumes the
  executeSQLViaQueryEngine retry budget (6 attempts collapsing in the
  same millisecond — cdc-routed-mutation-readiness.js:370-396,494-523).
  CL-001-lineage seed saturation surfacing as participant failure;
  enumeration of FAILED/CREATING rows REFUTED (participants come from
  routable service rows only); raft quorum shortfall REFUTED (zero raft
  commit timeouts; 3 of 4 voters co-located on the seed).
  (2) SECONDARY (proven EFFECT, mechanism candidate — SAFETY-ADJACENT,
  highest scrutiny next session): operation rows INSERTED at/after the
  14:05:50-14:06:06 leadership churn are NEVER FOUND by later UPDATEs on
  the seed ('No row found for CDC update' 144ms after a logged
  inserted-row CDC fetch; no DELETE, no restart between) while
  pre-churn rows fetch fine forever. Consistent with two co-located seed
  replicas applying writes against DIVERGENT SQLite databases, each
  believing it may emit CDC — candidate paths: the unilateral
  single-replica direct-apply (partition-replication-handler.js:288-307,
  taken when isMultiReplica() is false) and local leader-claim
  heuristics (cdc-routed-mutation-readiness.js:56-122,
  cdc-integration-service-local-system-table-routing.js:69-105).
  Even when transport recovers, committed UPDATEs are 0-row no-ops and
  reconciliation reverts steps ('Cache/authoritative divergence detected'
  -> step back to creating) — the operation can never durably leave
  CREATING. INSTRUMENTATION GAP blocking exact attribution: the CDC
  fetch logs (partition-cdc-parameterized-sql.js:292-328) carry no
  replicaId/role — add before pinning.
- CL-017 FIX INVARIANTS (from the trace): (a) a write routed to a
  partition must be admitted against the raft-committed db — never a
  unilaterally-applied local db (isMultiReplica() must never be false
  for a multi-replica group; local leader claims validated against the
  in-memory raft role before direct apply); (b) a committed UPDATE with
  affectedRows==0 on a row the coordinator believes exists must surface
  as a DIVERGENCE ERROR (not success) so the owner re-inserts instead of
  no-op-retrying forever; (c) the transition path needs a per-attempt
  timeout smaller than the retry budget so one freeze window cannot
  consume all attempts.
- FIX LANDED (2026-06-11), all three invariants + instrumentation:
  (i) INSTRUMENTATION: CDC fetch logs now carry cdcPartitionId/
  cdcReplicaId (partition-cdc-parameterized-sql.js all sites incl. the
  'No row found for CDC update' divergence witness; threaded from
  PartitionCDCGenerator) — next divergence is attributable to the exact
  replica db.
  (ii) Invariant (c): per-attempt timeout = min(remainingBudget,
  max(1s, remainingBudget/remainingAttempts)) in
  cdc-routed-mutation-readiness — one frozen-target attempt can no
  longer consume all 6 retries.
  (iii) Invariant (b): persistOperationUpdate's zero-changes branch now
  ESCALATES when the authoritative read finds NO row: logs
  OPERATION_ROW_DIVERGENCE_REINSERT and re-inserts the owner copy via
  persistNewOperationUnlocked (factored from persistNewOperation WITHOUT
  the transition-exclusive lane — callers may already hold it). Visible
  row -> no re-insert (guarded both ways).
  (iv) Invariant (a): isMultiReplica() corroborates the stale-able local
  replicaIds list with the LIVE raft peer view (any known peer => multi;
  single-voter raft commits trivially so preferring consensus is safe);
  resolveLeaderRole() in local system-table routing now lets the LIVE
  getRole() accessor DECIDE when present (stale isLeader /
  leaderId===replicaId flags demoted to fallback-only) — local writes
  can no longer be routed at a stale leader claim.
  Guards: partition-replication-handler-multireplica-guard.test.js +
  2 CL-017(b) cases in replica-operation-repository.test.js (6 red on
  src revert). Suites green: partition 1428, cdc 1008, node 1181,
  rebalancer 4424, repository 306.
- GATE (stat-gate-20260611T153621Z, post-fix): mechanisms ENGAGED,
  surface UNCHANGED — as the record itself predicted (the freeze layer
  is untouched). 4/4 publication CONVERGED; 3 runs quiesce-timeout +
  1 run restarted-node recovery-ready (same mix). Mechanism evidence
  (run1): OPERATION_ROW_DIVERGENCE_REINSERT fired 6x (escalation works);
  the new attribution shows ALL no-row updates land on the SEED'S -r1
  replica databases across SIX system tables (services 36x,
  replica_operations 6x, storage_reservations 4x, partitions,
  message_groups, nodes) — the divergence is not one partition's churn
  artifact but a seed-r1-wide pattern; NOTE the warn fires for ANY
  zero-row update (legitimate update-before-insert races included), so
  the believed-exists correlation (re-insert events, 6x) is the true
  divergence count. Operation churn shrank (creates 11->6 per run on
  the seed) but quiesce still times out.
- STATUS: fix-landed mechanisms guarded; the REMAINING blocker for this
  record is the SEED FREEZE layer in the 4/3 window — next falsification
  step: re-rank the gap-profiler artifacts (LAGRANGE_LOOP_GAP_PROFILE
  data in stat-gate-20260611T153621Z run artifacts) for the 14:0x-14:1x
  freeze windows and open the follow-on record on the top inclusive-time
  frame (CL-012 method, third pass).


## CL-018 Follower Commit Catch-Up Must Not Rescan The Whole Log Per Heartbeat

- Status: open (pinned 2026-06-11 from the third-pass freeze profiler
  re-rank, stat-gate-20260611T153621Z run1 seed; fix not started)
- Concern: raft-log-scan-per-heartbeat
- Failure Class: seed event-loop saturation (the CL-017 freeze layer;
  CL-001 lineage, third profiler pass)
- Witness: seed gaps now up to 42.9s in the 4/3 window; the profile
  window at 15:37:42 shows runMicrotasks inclusive 86.8% with
  getNodeReadinessSync/getControlPlaneParticipationSync/
  buildEvaluatedNodeReadinessSnapshot dominating inclusive time, and the
  TOP SELF-TIME frames led by readEntryRow
  (src/raft/sqlite-log-adapter.js:113, 633 hits/1.2s+ per window) with
  fastJsonClone second (621 hits) and publication-recovery snapshot
  builders (normalizeDistinctStringArray,
  buildPublicationRecoveryGateSnapshot) behind it.
- First Violated Invariant (pre-traced as CL-015 adjacent finding #3):
  on sqlite FOLLOWERS, committedIndex is never persisted by commit()
  (only leader-side commandAck calls setCommittedIndex), so
  raft.log.committedIndex < packet.last.committedIndex is true on EVERY
  append/heartbeat forever, and getUncommittedEntriesUpToIndex
  (sqlite-log-adapter.js:347-359) scans + readEntryRow-parses every row
  <= index — a full-table JSON parse per heartbeat (50ms) per priority
  partition replica; the seed hosts 3 replicas of each of 5+ priority
  partitions.
- Fix directions: (a) persist committedIndex on follower commit() (same
  mechanism commandAck uses), making the per-heartbeat scan bounded to
  genuinely-uncommitted rows; (b) and/or getUncommittedEntriesUpToIndex
  starts from committedIndex+1 with an indexed range read instead of a
  full scan; (c) ALSO fix the leader-side committedIndex REGRESSION
  (CL-015 adjacent #2: commandAck unconditionally setCommittedIndex on
  OLD-index acks) in the same record — both are committedIndex
  bookkeeping defects in the same adapter.
- FIX LANDED (2026-06-11): one cohesive committedIndex-bookkeeping fix
  in the sqlite log adapter: (1) follower commit() now advances the
  persisted watermark (commit is prefix-driven, so monotonic advance is
  exact); (2) setCommittedIndex is MONOTONIC — old-index catch-up acks
  can no longer regress it (closes CL-015 adjacent #2 in the same
  stroke); (3) getUncommittedEntriesUpToIndex scans only the
  uncommitted suffix (log_index > committedIndex) instead of full-table
  JSON-parsing per heartbeat; (4) committedIndex is cached in memory
  over the persisted value (the adapter is the only writer) — liferaft
  reads it per packet build, which was a sqlite SELECT per read.
  Guards: sqlite-log-adapter-committed-watermark.test.js (follower
  advance, no-regress, suffix-only scan with parse-count spy, fresh
  adapter reads persisted state) — 4 red on revert. 3,460
  raft/message-group/partition tests green.
- REGRESSION CAUGHT AND CORRECTED (same day): the first landing kept the
  pre-existing premature setCommittedIndex(index) in commandAck; once the
  uncommitted scan was watermark-bounded, the leader's quorum check saw an
  EMPTY suffix for the entry it was about to commit -> commitEntries
  applied nothing -> seed bootstrap hung at the API gate (gate 161930Z:
  4/4 'Seed node bootstrap API did not become join-ready' at ~50s,
  ~74 attempts). Corrected per real raft semantics: an ACK IS NOT A
  COMMIT — commandAck no longer touches the watermark at all; it advances
  only in commit(). This also closes CL-015 adjacent #2 at the true root
  (the premature set WAS the regression wart). Guard added for the exact
  fatal-skip (ack -> watermark unchanged -> entry still visible to the
  commit flow). Smoke run post-fix: CONVERGED wall=249s.
- GATE VALIDATION (stat-gate-20260611T163020Z, corrected fix): boot
  restored, 4/4 publication CONVERGED. MECHANISM CLOSED: readEntryRow is
  GONE from the self-time top of every freeze window (was #1). The
  freeze itself persists (max gaps 41.7s/37.8s) — it is a HYDRA; the
  fourth-pass re-rank now shows (run2 worst window, self-time):
  GC 3.6s, normalizePriorityRecoveryStringList 2.8s
  (priority-recovery-helpers.js:29), fastJsonClone 2.2s,
  normalizeDistinctStringArray 1.8s
  (publication-recovery-stream-evidence.js:33),
  buildPublicationRecoveryGateSnapshot 1.3s
  (publication-recovery-gate.js:145); inclusive dominance unchanged:
  getNodeReadinessSync 43.8s / getPartitionRoutingSnapshot 42.9s — the
  CL-012 readiness-read-amplification family, now in the
  priority/publication-recovery snapshot building path. Surfaces: 2
  quiesce + 1 restart recovery-ready + 1 ACTIVE-wait (mode=load,
  active=2/5). NEXT RECORD (CL-019 candidate): publication/priority
  recovery snapshot building is O(call) work with heavy allocation
  inside the readiness/routing hot path — same invariant family as
  CL-010/011/012 (per-change not per-call; verify why the CL-012 fast
  path does not bound this window).
- Secondary candidates from the same windows (record, evaluate after):
  getNodeReadinessSync inclusive dominance persists despite CL-012's
  fast path — verify the fast path engages on the line-330 call path in
  the 4/3 window; publication-recovery gate snapshot building
  (buildPublicationRecoveryGateSnapshot + normalizeDistinctStringArray)
  is the next self-time cluster.

## CL-019 Readiness Snapshot Reuse Must Be Per-Change, Not Per-Call

- Status: open (pinned 2026-06-11 from the fourth-pass freeze profiler
  re-rank, stat-gate-20260611T163020Z run2 seed; fix not started)
- Concern: readiness-snapshot-reuse-per-change
- Failure Class: seed event-loop saturation (the CL-017 freeze layer;
  CL-010/011/012 per-change-not-per-call family, fourth profiler pass)
- Witness (163020Z run2 seed 7493b0ab, every freeze window): inclusive
  getNodeReadinessSync up to 43.8s of a 56s window
  (getPartitionRoutingSnapshot 42.9s right behind); the MISS path
  buildEvaluatedNodeReadinessSnapshot at 15-17s inclusive in EVERY
  window (proof the full build runs constantly);
  resolveMembershipPublicationPlanningSnapshot 15.9s,
  getPriorityRecoveryPlanningAnswerSync 5.9s. Self-time = the snapshot
  builder storm: GC 3.6s, normalizePriorityRecoveryStringList 2.8s
  (priority-recovery-helpers.js:29), fastJsonClone 2.2s,
  normalizeDistinctStringArray 1.8s
  (publication-recovery-stream-evidence.js:33),
  buildPublicationRecoveryGateSnapshot 1.3s
  (publication-recovery-gate.js:145),
  buildPriorityRecoveryPlanningProjection
  (segment-4-stage-1.js:466), buildPriorityRecoveryPartitionSnapshot
  (priority-recovery-observation-snapshot-stage-2.js:329). Two hot
  drivers call getNodeReadinessSync per decision: query partition
  routing (evaluatePartitionServiceRoutability) and message-group CDC
  forward selection (resolveCDCForwardSelection).
- First Violated Invariant (answers CL-018's open question "why doesn't
  the CL-012 fast path bound this window"): readiness work must be
  O(per input change), but it is O(per call) twice over:
  (1) getFresherStoredReadinessSnapshot
  (control-plane-readiness-snapshot-store.js:59-64) returns null when
  compareNodeHeartbeatWatermarks(nodeRow, storedWatermark) <= 0 — i.e.
  it reuses the stored snapshot ONLY when the snapshot is STRICTLY
  fresher than the visible cache row. Watermark EQUALITY — the steady
  state between heartbeats, where the stored snapshot exactly reflects
  the current row — falls through to the full rebuild, which re-stores
  a snapshot with the SAME watermark, which the next call again refuses
  to reuse. The sync fast path is structurally a cache-LAG BRIDGE
  (its docstring says so) with a ~0% hit rate by construction; CL-012's
  reorder put the check before the heavy prelude but the predicate
  never fires.
  (2) Even on a hit, getNodeReadinessSync builds publication +
  membershipPublication diagnostics BEFORE the reuse check
  (node-methods.js:333-337): getMembershipPublicationDiagnosticsSync →
  cache row read (fastJsonClone per read, CL-011's frame back via a
  different door) → buildMembershipPublicationDiagnostics →
  buildPublicationRecoveryProtocolSnapshot
  (recovery-protocol-snapshot.js:671) → full gate snapshot +
  participation maps + dozens of normalize/freeze allocations — per
  call, from a membership-publication row that changes ~once per epoch.
- Fix directions (per-change semantics, the proven CL-010/011 method):
  (a) reuse on watermark EQUALITY (rebuild only when the row actually
  changed), keeping the existing maxAge + ready-lease checks and
  consulting isReadinessSnapshotInvalidated so service-row/cache
  invalidation still forces a rebuild — hazard to verify: fields the
  watermark does not cover (e.g. status flips without heartbeat
  change) must either join the comparison or bump the invalidation
  marker; (b) memoize buildMembershipPublicationDiagnostics keyed on
  the publication row's identity/version EXCLUDING observedAt (the
  CL-010 timestamp-signature lesson), making the pre-check prelude
  O(per publication change); (c) optional if residue: memoize the
  hit-path merged frozen snapshot (it currently allocates
  {...stored, publication, membershipPublication, recentTransitions}
  per call).
- Risk note: equality-reuse changes what sync callers can observe
  (bounded by heartbeat cadence + invalidation hooks, same bounds the
  async path already accepts via allowStaleOnCacheChange); never-break-
  only-slow says verify the invalidation coverage before widening reuse.
- FIX LANDED (2026-06-11, rubber-ducked + subagent-verified): (1)
  getFresherStoredReadinessSnapshot — rebuild when the visible row is
  STRICTLY fresher; on watermark EQUALITY reuse unless
  isReadinessSnapshotInvalidated (a row mutation that does not advance
  the watermark, e.g. a status flip, is visible only to the marker); a
  row OLDER than the snapshot or MISSING keeps the ORIGINAL lag-bridge
  reuse — an unconditional invalidation check was caught by two pinned
  tests (test-part-2 lagged-delete, test-part-5 row-regression): the
  marker must decide ONLY the equality case, else rebuilds from
  lagged/regressed rows move answers BACKWARDS. (2) Heartbeat-age guard
  in isStoredReadinessSnapshotFresh (same constant isRecentHeartbeat
  uses): a silently-dead node makes no row change, so reuse must expire
  exactly when the rebuild would flip health. (3) handleCacheChange
  branch for control_plane_publications (rows carry publication_id, not
  node_id): clears the diagnostics memo + sets a CLUSTER-wide
  invalidation marker folded into isReadinessSnapshotInvalidated via
  max(perNode, cluster). (4) getMembershipPublicationDiagnosticsSync
  memoizes the built diagnostics for cluster-scope reads
  (node-independent, verified) — VERIFICATION CAUGHT THE FIRST LANDING:
  the memo was gated on row.created_at/updated_at, but production rows
  pass through normalizeControlPlanePublicationRow which emits NO
  timestamp fields, so the memo was structurally inert exactly when a
  publication exists; consumers of diagnostics createdAt/updatedAt are
  provenance-only (enteredAt descriptors), so the gate was dropped.
  Guard now uses the production row shape. (LESSON, repeat of CL-003's
  dead-code landing: verify the fix engages against PRODUCTION-shaped
  data, not fixture-shaped.) (5) storeReadinessSnapshot TOCTOU: stamps
  capturedAt at buildStartedAtMs (threaded from both sync + async
  evaluation paths) and keeps any marker landing at/after build start —
  one extra rebuild, never a laundered stale snapshot. (6) Cache-swap +
  membershipPublicationService-swap clear all reuse state
  (syncOwnerDependencies). (7) Hit-path residue trimmed:
  getReadinessTransitionHistory memoizes its frozen view per node
  (single writer recordReadinessTransition drops it);
  getPublicationModeDiagnostics returns the stored pre-frozen object.
  Remaining per-hit work: now() + ISO normalize + getNodeRow
  (fastJsonClone of ONE node row) + O(1) checks + the ~25-field overlay
  freeze. DEFERRED (direction (c), evaluate on residue): memoize the
  merged hit-path snapshot itself.
  Guards: test/control-plane/readiness-per-change-reuse.test.js (10
  subtests; equality-reuse + memo-engagement verified red-on-revert by
  the verifier). Suites at clean-tree baseline: control-plane 50
  pre-existing fails unchanged (same 7 files),
  query/rebalancer/topology/admin/cdc/cache all at baseline.
- Pre-registered gate prediction: getNodeReadinessSync inclusive
  collapses out of the freeze windows; seed max gaps shrink from ~42s;
  the 2-quiesce + restart-recovery-ready + ACTIVE-wait surface mix
  moves (quiesce should clear or shrink if the freeze was the binding
  constraint; CL-017's divergence re-insert + per-attempt-timeout
  mechanisms stay engaged).

## CL-019 Gate Verdict + CL-020 Opening

- CL-019 GATE (two rounds, 8 runs total, fingerprint-verified fde3a055):
  195558Z (profiler off): 4/4 publication CONVERGED, 0 corrupt; runs
  1/3 seed max gap <5s (was 42.9s) — FIRST EVER freeze-free 4/3 runs —
  with ACTIVE 5/5 coverage complete (was 2/5); runs 2/4 froze (26-30s
  gaps, blocking 99.99% untagged). 203619Z (LAGRANGE_LOOP_GAP_PROFILE=1):
  3/4 CONVERGED + 1 NO_REPORT(run3, harness gave up against the frozen
  seed); runs 1/2/4 max gaps 6.4-7.5s; run3 froze (16s, 218 gaps).
  **MECHANISM VALIDATED: readiness frames appear in only 6/23 profile
  windows (was EVERY window, 43.8s inclusive) and are no longer
  dominant. CL-019 GUARDED.** Freeze-free runs 5/8 post-fix vs 0/12+
  ever before.
- NEW DOMINANT SURFACE (5 of 7 reporting runs): 'Cluster ACTIVE wait
  stalled (mode=load)' with active=5/5 (one 4/5), coverage=5/5
  complete, publication=PUBLISHED — the wait sees no meaningful
  progress AFTER full publication/coverage; reason tally shows
  load_publication_gate_ready + PRIORITY_CONTROL_PLANE_RECOVERY_PENDING.
  The next ladder rung after the freeze: what does mode=load wait on
  when active=5/5, and why doesn't priority recovery CLOSE.
- CL-020 OPENED (residual freeze head, named by run3 profile windows
  20:51:57/20:52:29): inclusive chain processImmediate →
  system-table-cache.js:299 (deferred notifyListeners) →
  priorityRecoveryVisibilityCacheListener
  (unified-rebalancer-priority-recovery-coordination.js:122) →
  handlePriorityRecoveryVisibilityEvent (:253) →
  buildPriorityRecoveryVisibilityRebalanceDecision
  (unified-rebalancer-segment-5.js:16) →
  buildPriorityRecoveryOperationCreationPlanningGateSnapshot
  (unified-rebalancer-priority-recovery-planning-gate-methods.js:214,
  18/23 windows, ~22s inclusive per 32s window) +
  buildPriorityRecoverySurrogateFollowUpDecisions
  (priority-recovery-follow-up-decisions.js:283). Self-time:
  parseStepsHistory (replica-operation-liveness.js:95) 29% / 8.8s per
  window + parsePriorityRecoveryStepsHistory
  (priority-recovery-snapshot-stage-6.js:104) 11% +
  buildReplicaOperationProgressSnapshot. The listener subscribes to
  ALL cache changes and computes the full planning tree to decide
  shouldEnqueue — during operation churn (claims/deferrals update
  replica_operations rows continuously) every row write triggers a
  full re-derive: an event→planning amplification, same
  per-change-not-per-event family as CL-010..012/019. Fix directions:
  (a) cheap relevance pre-filter (tableName/operation/record) BEFORE
  any snapshot building — the decision inputs that need the heavy tree
  belong in the enqueued check itself, not the filter; (b) coalesce:
  the enqueue is already a dedupe-able reconcile — compute heavy
  planning once per drained queue tick, not per event; (c) memoize
  parseStepsHistory per row identity (rows are cache-frozen; CL-011
  showed the parse cost class). Note the DIAGNOSTIC warn block inside
  enqueueMembershipPublicationReconcile (publications write-leader
  snapshot compare) also runs per enqueue — fold into the same cleanup.

## CL-020 Fix Landed

- FIX LANDED (2026-06-12, direction (a) cheap pre-filter): in
  buildPriorityRecoveryPublicationEventSchedulingSnapshot
  (rebalancer-priority-recovery-planning-gate-methods.js) the heavy
  operation-creation gate is now computed ONLY when all four cheap
  evidence bits hold (priorityPartition && publicationEvent &&
  leaderSatisfied && publicationClosed) — exactly the cases where the
  scheduling state table can reach a row that reads
  operationCreationRequired; the first four table rows match on the
  cheap bits alone, so state/action/shouldEnqueue are bit-identical
  for every skipped event. Covers BOTH per-event callers (the
  visibility cache listener and isCriticalCDCEvent, which passes
  requireLeader:false and therefore always satisfies the leader bit
  when it needs visibilityProgress). Observable delta: for irrelevant
  events the frozen snapshot's operationCreationGate is null (was a
  computed-but-unused gate) and the listener-path decision's
  visibilityProgress is false for non-leader publication events
  (consumer discards it — handlePriorityRecoveryVisibilityEvent reads
  only shouldEnqueue/reconcileReason). Heavy planning remains at its
  legitimate per-rebalance-pass callers
  (rebalancer-planning-gate-methods.js bypass snapshot,
  rebalancer-transport-pressure-methods.js). Directions (b) coalesce
  and (c) parseStepsHistory memo stay on record if the gate shows
  residue. Guard: 'CL-020: visibility events pay the heavy planning
  gate only for PUBLISHED publication events' in
  test/rebalancer/priority-recovery-visibility-wakeup.test.js —
  verified red on revert.
- DEAD CODE REMOVED on contact (new working policy, same change):
  src/raft/raft-transport-adapter.js (165 lines, never instantiated in
  src — the CL-003 no-op-landing site; the repo's own
  raft-cleanup-verification.test.js documents its removal as cleanup
  requirement 5.1 and now passes via its removed-path) + its
  adapter-only tests (raft-transport-adapter.test.js,
  unified-address-format.property.test.js — AddressManager keeps its
  own test/address/ property suites) + orphaned constants
  (RAFT_PACKET_MESSAGE_TYPE, RAFT_MESSAGE_TYPE,
  RAFT_TRANSPORT_ERROR_MSG, RAFT_TRANSPORT_LOG_MSG).
  raft-transport-backpressure-mute.test.js REWRITTEN against the live
  seam (deliverRaftPacketWithBackpressureMute — the path raft-group/
  raft-replica-base/partition-raft-node actually use), preserving all
  six mute semantics subtests + a new default-shared-mute subtest.
  Suites: raft 562/562, partition+message-group 3510 pass,
  rebalancer at baseline.

## Surface Analysis: mode=load ACTIVE Wait (CL-021 candidate, pre-fix notes)

- Analyzed from 203619Z run1 artifacts (freeze-free run, max gap 7.5s —
  the freeze is NOT the binding constraint here).
- CHAIN: harness ACTIVE wait (mode=load) stalls because the
  publication-active-gate handoff contract is DEGRADED with
  runtimePromotionAllowed=false. The seed's convergence decision trace
  shows the aliasing: owner no-deficit (5/5 published, missing=0,
  pendingRecovery=0, pendingReconcile=0, epoch=4) but
  contractReason=published_active_coverage_incomplete — that reason
  code is REUSED by the promotionDeniedByFence path
  (publication-active-gate-handoff-contract.js:280-289) when the
  decision table reached COMPLETE and the CATCHUP FENCE denied; with
  missing=0 the decision-table coverage row cannot have matched. DX
  GAP: the trace does not carry the fence gap reasons
  (resolvePublicationActiveGateCatchupFenceMissingProofReasons —
  targets/presence/durable-publication/snapshot-coverage proofs); add
  them before pinning.
- UNDERLYING STATE: recoveryProtocolState=priority_spread_pending,
  priorityRecoveryReasonCodes=['priority_partitions_not_spread'].
  Rebalancer diagnostic at 20:40:55: blockedPartitions=
  [sql_transaction_participants-p1 readyDistinctNodeCount=1
  spreadGap=2] — ONE priority partition wedged. Its history: dropped
  BELOW MINIMUM (replica_count_below_minimum 0<3 x26, 1<3 x6) — not
  just unspread, it lost ready replicas; operations DO step
  (REPLACE completed 20:37:04 on 11601fe0; another op
  PENDING→SENDING→CREATING→SYNCING 20:37:16; STOPPING/removing
  20:38:50) yet 62 'Rebalancing move skipped: blocked' + 16
  safety_blocked + 14 in-flight reuse rearm; 9 'Cache/authoritative
  divergence detected during reconciliation' + 4 'No row found for CDC
  update' on this partition (CL-017 divergence family witness
  present). ALSO: selectedControlPlaneOwnerQueueDepth pendingWrites=102
  with pendingWriteGrowthCount=1612 — the owner write queue grows
  without draining (stable witness from the closure grammar).
- NEXT falsification loop (after CL-020 gate verdict): (1) add fence
  gap reasons to the decision trace; (2) pin WHY
  sql_transaction_participants-p1 cannot re-establish 3-node spread —
  candidates: move skip reason 'blocked'/'safety_blocked' loop
  (which gate blocks?), CL-017 divergence residue (no-row updates →
  reconciliation reverts), owner queue starvation; (3) check whether
  the below-minimum episode is the trigger (replicas lost during the
  4/3 churn, recovery never re-admits because spread moves are
  blocked by the very state they would fix — circular-dependency
  class candidate).

## CL-020 Gate Verdict (stat-gate-20260612T041945Z) — GUARDED

- 4/4 publication CONVERGED, 0 corrupt, 0 stale; walls 233-306s
  (p95 298s — the 845-870s frozen-run outliers are GONE).
- Pre-registered prediction CONFIRMED: zero frozen runs (seed max gaps
  2.3-7.8s across all four; was 16-30s in 3 of the prior 8 runs); the
  visibility-listener chain
  (priorityRecoveryVisibilityCacheListener →
  buildPriorityRecoveryOperationCreationPlanningGateSnapshot) has NO
  top-3 inclusive appearances in any of 30 profile windows;
  parseStepsHistory residual 1.0-1.6s self in 4 windows (via the
  legitimate per-rebalance-pass callers — direction (c) memo remains
  optional). Most frequent top-3 self frame is now fastJsonClone
  (19/30 windows, CL-011 family residual; not currently binding).
- THE SCENARIO IS DETERMINISTIC AT ONE SURFACE: all four runs fail the
  mode=load ACTIVE wait. TWO SUB-MODES inside it (CL-021 work):
  (A) runs 2/3 — recoveryProtocolState=priority_spread_pending with
  blocked priority partitions at readyDistinctNodeCount=1 (run2:
  control_plane_publications-p1 + replica_operations-p1 +
  sql_write_operations-p1, spreadGap=2 each);
  (B) runs 1/4 — PURE catchup-fence denial: contract degraded with
  published_active_coverage_incomplete while
  recoveryProtocolState=steady_published, priorityRecoveryReasonCodes
  EMPTY, missing=0 — every owner-visible quantity green, the fence
  still denies. Sub-mode (B) cannot be pinned until the decision trace
  carries the fence gap reasons
  (resolvePublicationActiveGateCatchupFenceMissingProofReasons) —
  THAT INSTRUMENTATION IS THE FIRST STEP OF CL-021.
- Freeze hydra status: with CL-019 + CL-020 both guarded, the
  seed event-loop saturation layer (CL-010..012, 017..020 lineage) is
  RETIRED as the binding constraint — first gate round ever with zero
  frozen runs and a deterministic downstream surface.

## CL-021 Active-Gate Promotion Closure (mode=load ACTIVE wait)

- Status: open (2026-06-12; surface deterministic since CL-020 gate —
  4/4 runs; pre-analysis in 'Surface Analysis' + 'CL-020 Gate Verdict'
  entries above)
- Concern: active-gate-promotion-closure
- Failure Class: liveness — runtime promotion never admitted
  (CL-001/CL-003 lineage)
- Witness (per run, stable): harness 'Cluster ACTIVE wait stalled
  (mode=load)' with coverage=5/5 complete, publication=PUBLISHED;
  seed convergence decision trace contractState=degraded,
  contractReason=published_active_coverage_incomplete, missing=0.
  Sub-mode (A): recoveryProtocolState=priority_spread_pending,
  blocked priority partitions readyDistinctNodeCount=1 spreadGap=2.
  Sub-mode (B): recoveryProtocolState=steady_published, reasons
  EMPTY — pure fence denial.
- First Violated Invariant: NOT YET PINNED. Two candidates, one per
  sub-mode; the fence's missingProofReasons (which of
  targets/presence/durable-publication/snapshot-coverage proofs is
  failing) are computed but UNOBSERVABLE in the trace.
- Step 1 (instrumentation, this session): surface the catchup fence
  evidence in the convergence decision trace
  (_buildPublicationReadinessTraceFields,
  membership-publication-coordinator-class-stage-2.js) — fence state,
  promotionAllowed, missingProofReasons, presence counts,
  durable/snapshot covered+stale bits. Then re-gate, split (A)/(B),
  and pin.
- Step 1 LANDED (2026-06-12): fence evidence in the decision trace
  (fenceState/fencePromotionAllowed/fenceMissingProofReasons/
  durable+coverage states+missing counts/presence). Smoke: a contract
  built with the owner driver's exact input shape (stage-2.js:905 — no
  snapshotCoverage/activeNodeViews input) yields
  missingProofReasons=['snapshot_coverage_unavailable'] — the
  owner-driver call site CANNOT prove coverage by construction; the
  admin-snapshot site (admin-control-snapshot-class-part-3.js:206)
  passes activeNodeViews and can. Whether that matters is open:
  runtimePromotionAllowed is consumed ONLY by admin/diagnostics.
- CONSUMPTION CHAIN MAPPED (harness side): the mode=load wait's
  allActive requires publicationConvergenceGate.ready
  (cluster-active-wait-publication-gate.js:561-567) = the NODE's
  publication recovery gate record with ready=true AND reasons EMPTY
  AND status PUBLISHED AND pendingAckCount=0 AND missing=0; the
  progress string's active=N/5 is a PROJECTION
  (projectLoadPublicationGateDiagnostic flips nodes inactive when the
  gate is not ready) — active=0/5 means gate-not-ready, NOT nodes
  leaving ACTIVE. So sub-mode (A) (spread_pending reason codes) blocks
  the harness DIRECTLY via gate reasons; the catchup fence is NOT in
  the harness predicate. Sub-mode (B) candidate mechanism: the gate
  flaps / goes green only after the harness's 150s no-progress budget
  (final traces show steady_published+empty reasons in runs that
  STALLED — 'green at the end'); check lastMeaningfulChange timestamps
  vs gate-green transition in the next gated run.
- Sub-mode (A) ROOT CANDIDATE PINNED (2026-06-12, 041945Z run2
  artifacts, control_plane_publications-p1 trace): the spread wedge is
  a PLANNER-BLINDNESS LOOP. Timeline: REPLACE operations COMPLETE
  (3 REPLACEs to 3 distinct targets + 2 ADDs, 04:25:13-04:27:14), the
  new replicas exist and participate in raft (r5 on 11601fe0 at terms
  5/7), YET the rebalancer still reports readyDistinctNodeCount=1
  spreadGap=2 at 04:28:28 and plans MORE replaces — every one from an
  ALREADY-RETIRED source replica (r1 ×13, then r3, then r2 — chasing
  each newly-retired source), each correctly refused by the
  REPLACE-source-retirement safety guard
  (rebalance-coordinator-topology-guard-methods.js:596,
  SOURCE_RETIRED → safety_blocked; 123 skips/run across priority
  partitions). The planner never sees the new replicas as ready
  because their durable services-row writes were DEFERRED — 12
  'Replica create status write deferred after retryable control-plane
  failure' events (the CL-016 local-commit fallback) and, per the
  CL-016 record's open follow-up, THE DEFER DROPS WITHOUT RETRY: the
  ACTIVE status exists only in the replica's own node's local cache
  (markServiceRowLocalOnly), never persisted durably, never
  CDC-propagated to the planner's node. Loop: replicas activate
  locally → planner blind → spread still 'pending' → plan REPLACE
  from a retired source → safety_blocked → forever. Same circular
  class: the durable write needs the recovered control plane; the
  control plane's ACTIVE gate waits on the spread the durable write
  would prove.
- First Violated Invariant (sub-mode A, candidate): a priority replica
  activated via the local-commit fallback must CONVERGE ITS DURABLE
  SERVICES ROW once the control plane can accept writes (retry the
  deferred write / owner-side reconciliation from raft-membership
  truth) — local-only activation must not be a terminal state.
  Fix directions: (a) retry lane for deferred durable status writes
  (event: control-plane writability restored, or bounded interval),
  clearing the local-only marker on success (the CL-016 marker
  machinery already exists); (b) and/or seed-side peer reconciliation:
  the owner derives priority service rows from live raft peer
  view; (c) DX: planner spread analysis should log WHICH service rows
  it counted (node ids + statuses) when blocked.
- Sub-mode (A) FIX LANDED (2026-06-12): local-only durable-row
  convergence on the replica state machine's EXISTING timeout-checker
  tick (5s). _reconcileLocalOnlyServiceRows
  (replica-state-machine.js) re-attempts the durable services-row
  write for every serviceId still in localOnlyServiceRowIds, via the
  SAME idempotent UPSERT path lifecycle persistence uses for
  local-only rows (_updateReplicaStateInCdc — marker + retry state
  clear on commit inside the helper); per-row exponential backoff
  (5s doubling, 60s cap) bounds the failure-log rate while the
  control plane is still recovering (observer-effect lesson);
  untracked replicas drop their marker (bounded set). Witness on
  success: 'Deferred durable services row converged after
  control-plane recovery'. Guard:
  test/node/replica-local-only-row-convergence.test.js (12 asserts —
  retry+marker-clear, UPSERT semantics, backoff, ghost-drop, tick
  wiring). Node suite 1,196 pass.
- NOTE: the gate launched before this fix validates ONLY the fence
  instrumentation; the CL-021 fix needs its own gate round.
  Pre-registered prediction for that round: spread recovers
  (readyDistinctNodeCount reaches 3 on priority partitions; the
  safety_blocked storm collapses; 'converged' witness lines appear);
  sub-mode (A) surface clears; remaining stalls (if any) show the
  fence gap reasons for sub-mode (B).
- Sub-mode (B) PINNED BY INSTRUMENTATION (gate 045003Z, 4/4 publication
  CONVERGED): 163/165 fence-denial traces show missingProofReasons =
  ['snapshot_coverage_unavailable'] (the other 2 add
  durable_publication_incomplete during publication_pending). Matches
  the smoke test exactly: the owner-driver call site
  (membership-publication-coordinator-class-stage-2.js:905) passes no
  snapshotCoverage/activeNodeViews, so the fence can NEVER prove
  coverage THERE — and the harness does not consume this contract's
  promotion flag. VERDICT: sub-mode (B) is a structural artifact of
  the owner-driver call shape (diagnostic-only aliasing), NOT a
  blocker. CL-021's load-bearing path is sub-mode (A) alone. Residual
  cleanup option: pass activeNodeViews at the owner-driver site or
  rename the aliased reason code (defer to Task-28 audit).
- VERIFICATION CORRECTIONS LANDED (subagent found a never-break
  hazard in the first CL-021(A) landing): (1) HIGH — the reconcile's
  full-row durable REPLACE was stamped with stateEnteredAt
  (arbitrarily old): it could lose cache merges yet overwrite the
  durable row for later HYDRATORS (resurrecting e.g. a FAILED row as
  ACTIVE@old — permanent cache/durable divergence), and a tick firing
  while the final transition persist was in flight could land an
  OLDER state second and clear the marker with no retry left. FIXES:
  fresh-stamped copy (updated_at = reconcile time); per-row persist
  SERIALIZATION between transition persistence and the reconcile
  (serviceRowPersistInFlightByServiceId — transitions chain after an
  in-flight reconcile, the reconcile skips rows with an in-flight
  transition persist); per-iteration marker re-check (a cleared
  marker mid-pass would have taken the UPDATE branch and written an
  object diff into a TEXT column); terminal-state rows (REMOVING/
  REMOVED/FAILED) drop the marker WITHOUT a durable write (their own
  paths own durability; avoids the late canonical-leader clear).
  (2) systemTableCache now wired into the production
  ReplicaStateMachine (replica-handler-setup.js — was absent, forcing
  worst-case fallbacks in the UPSERT-choice and leader-retention
  checks). (3) The tick-wiring guard subtest was TAUTOLOGICAL
  (verifier proved it passed with the wiring deleted) — rewritten
  against a real 5ms interval; new guards: fresh-stamp,
  terminal-skip, in-flight-skip. RESIDUAL accepted (pre-existing for
  all CL-016 upserts): the full-row REPLACE omits raft_role/group_id;
  noted for Task-28. Known sub-case for the gate: if the final ACTIVE
  persist failed before commitTransition, the map may hold an earlier
  state and the reconcile converges a non-ACTIVE row (witness lines
  carry the state field).
- GATE 053704Z (CL-021(A) fix + corrections): 4/4 publication
  CONVERGED, 0 corrupt — but the FIX DID NOT ENGAGE: zero 'Deferred
  durable services row converged' witnesses AND zero
  STATE_PERSIST_FAILED lines across all runs, while 10-16
  'status write deferred' events/run still occurred and the surface
  is unchanged (3 mode=load stalls incl. active=0/5 + 1 quiesce).
  ATTRIBUTION CORRECTED BY DATA: deferred replicas DO transition
  creating→syncing→active within ~5s and their later transition
  persists SUCCEED (no failures logged) — markers were being cleared
  by the NORMAL path all along; the durable rows EXIST. The
  planner-blindness root is therefore NOT missing rows — the
  spread-ready predicate excludes the rows for another reason:
  isPrioritySpreadReadyReplica requires TRUTHY raft_role
  (membership-publication-priority-partition-summary.js:247) and the
  lifecycle full-row REPLACE payload OMITS raft_role (nulls it; the
  verifier's 'column wipe' finding — accepted as residual, actually
  load-bearing), while the partition service's role-mutation helper
  (createRoleMutationHelper, partition-service-segment-1-part-1.js)
  writes it separately as a BACKGROUND deferrable UPDATE that may
  defer/fail in the 4/3 window or be wiped by a subsequent lifecycle
  write. The CL-021(A) reconcile mechanism stays (correct, low-cost,
  closes the real if-rare stranded-marker case) but is NOT the
  load-bearing fix.
- WITNESS LANDED for the actual pinning (per-row attribution was the
  DX gap): the priority spread summary now counts per-partition
  EXCLUSION REASONS (resolvePrioritySpreadReplicaExclusionReason —
  invalid_row/not_partition_service/status_*/raft_role_missing/
  address_missing/node_id_missing/learner_not_promotable/
  node_not_eligible) and blockedPartitions entries carry
  exclusionReasonCounts through the normalizer AND the rebalancer's
  'Deferring non-system rebalancing' diagnostic (zero new log
  volume). NEXT GATE pins the exclusion reason; if raft_role_missing
  dominates, fix = include raft_role in the lifecycle persistence
  payload from the partition service's live role (or stop requiring
  raft_role for spread-readiness when status=ACTIVE — decide on
  evidence).
- DEAD CODE REMOVED on contact: src/policy/raft-role-tracker.js
  (ZERO production callers — updateServiceRole never invoked; zero
  'Updated service Raft role' lines in any run) + its test file +
  tracker sections in sql-engine-read-migration.test.js and
  read-model-contract.test.js + orphaned policy/subsystem constants.
  All affected suites green (policy 143, read-model-contract 71,
  control-plane back to 50 pre-existing).
- WITNESS GATE (061547Z): 4/4 publication CONVERGED, 0 corrupt. THE
  SURFACE MIX MOVED AGAIN — spread blocking nearly VANISHED (ONE
  'Deferring non-system rebalancing' diagnostic across all 4 runs, was
  ~constant; spreadGap now 1, was 2): run1 mode=load active=4/5; run2
  quiesce (300s budget now); run3 PERFORMED ACTUAL ROLLING RESTARTS
  (second time ever) and failed at 'Restarted node did not become
  recovery-ready within 120000ms' (node 11601fe0, reachable=true) —
  THE RESTART-PHASE LADDER RUNG IS LIVE; run4 mode=load active=5/5.
  WITNESS PLUMBING GAP FOUND: the one blocked diagnostic carries
  exclusionReasonCounts:null AND readyReplicaCount:null — the
  rebalancer's blocker (getControlPlanePrioritySpreadBlocker,
  unified-rebalancer-priority-readiness.js:166) consumes the
  priorityPartitionSummary from the PLANNING ANSWER (the published
  row's serialized summary), whose serializer strips per-row fields
  (even the pre-existing readyReplicaCount). NEXT STEP: carry
  exclusionReasonCounts + readyReplicaCount through the publication
  row's priority_partition_summary serializer (find where the
  published summary is built from buildDerivedPriorityPartitionSummary
  output and stops carrying per-row fields), or log the OWNER-side
  derived summary (which has the counts) when blocked. Then one gate
  round pins raft_role_missing vs other exclusion.
- NOTE: with spread mostly recovering this round, CL-021's binding
  constraint may be dissolving for OTHER reasons (CL-021(A) reconcile
  is in the build; the role-update race may simply be winning more
  often). Treat the remaining mode=load stalls + the NEW restart-phase
  surface (run3 artifacts at stat-gate-20260612T061547Z-run3) as the
  next falsification targets.

## Restart-Phase Rung — Pre-Analysis (061547Z-run3, do not over-claim)

- Harness error: 'Restarted node did not become recovery-ready within
  120000ms for node 11601fe0' with reachable=true (via
  bootstrap_health), readinessPhase=INIT, readinessStage=alive,
  reasons=BOOTSTRAP_PHASE_INCOMPLETE|SQL_ENGINE_UNAVAILABLE|
  LEADER_METADATA_INCOMPLETE|BOOTSTRAP_NOT_READY,
  bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable,
  lastError=admin probe ECONNREFUSED :8081 — i.e. the probed process
  looks like a FRESH BOOT stuck before SQL/bootstrap readiness with its
  admin API not yet listening.
- Artifacts (timeline): 11601fe0's captured ndjson is CONTINUOUS from
  formation (06:31:42) through teardown (06:39:10) and shows a
  CL-006-style 'Reset join lifecycle/Resuming join session' loop x121
  from 06:37:01 — every attempt 'Seed bootstrap not ready (phase:
  contacting_seed)'. The SEED's (7493ab) log ends ABRUPTLY at 06:36:03
  mid-traffic, with partition-service/rebalancer shutdown lines at
  06:34:52-06:35:14 (the harness was restarting the SEED) and NO
  post-restart output — the seed's restarted process either never
  logged or its output is not in the capture.
- CAPTURE AMBIGUITY TO RESOLVE FIRST (harness mechanics): does the
  rolling-restart recreate containers, and does .full-logs capture
  span the recreation? The INIT-phase probe result for 11601fe0
  contradicts its continuous log unless captures are per-container and
  the restarted process's log is MISSING. Read the harness restart
  implementation (test/distributed/harness — restartNode/rolling
  driver) before pinning; the prior lesson (CL-006 era) was exactly
  that capture gaps fooled us.
- Candidate shapes (rank after capture question): (a) the SEED restart
  never came back (its fresh boot hung pre-logging) and the harness's
  recovery-ready wait attributed the failure to the NEXT node it
  probed; (b) 11601fe0's restart boot hung before SQL-engine init
  (INIT phase) while its OLD process's log is what we read; (c) the
  rejoin needs the seed's bootstrap API while the seed itself is
  mid-restart — a rolling-restart ORDERING constraint (don't restart
  the next node until the seed's join admission is re-open;
   'Seed bootstrap not ready' x121 supports this).
- REFINEMENT (report data): stabilityGates.restart_recovery shows
  restartBoundaryCount=3 with blocker admin_reachability_refused —
  restart #1 completed (before_stop+after_ready), restart #2
  (11601fe0) recorded before_stop only. Harness restart = docker
  stop+start of the SAME container (chaos.js:217+), so captures DO
  span restarts — 11601fe0's 06:37:01+ resume loop IS its restarted
  process: fresh boot wedges in the JOIN phase ('Seed bootstrap not
  ready', x121/2min) so SQL-engine/admin never initialize →
  recovery-ready timeout. OPEN QUESTION for the rung: which node was
  restart #1 (the seed's log ends 06:36:03 with NO post-restart
  output — if the seed was #1 and passed after_ready while logging
  nothing, the recovery-ready predicate for restart #1 passed on
  weaker evidence than the bootstrap-not-ready state the rejoiner
  then hits). Next: read _recordRestartBoundarySnapshot artifacts +
  the recovery-ready predicate; likely invariant: a restarted SEED
  must re-open join admission before the next node restarts
  (rolling-restart ordering/readiness contract).

## CL-021 PINNED + FIX LANDED: raft_role Column Wipe

- PINNING GATE (070804Z, witness plumbing 89147e21): the spread
  DEFERRING diagnostic never fired (0 lines — the rebalancer blocker
  path is no longer engaged) but the readiness-side derived summary
  carried the witness into the run REPORTS: EVERY blocked priority
  partition in every stalling run shows
  exclusionReasonCounts={raft_role_missing: N} with exact arithmetic
  (e.g. readyReplicaCount=3, readyDistinctNodeCount=1,
  raft_role_missing=2 — three ACTIVE replicas, the two REPLACE-created
  ones invisible). raft_role_missing is the ONLY exclusion reason that
  appears. CL-021's First Violated Invariant, FINAL: a lifecycle
  full-row INSERT OR REPLACE must not NULL columns owned by other
  writers — buildCreateCdcData omitted raft_role/group_id, so every
  lifecycle upsert wiped the partition service's role write, and the
  spread-ready predicate (requires truthy raftRole) excluded the
  replicas forever. (The verifier flagged this exact wipe in the
  CL-021(A) review; it was misfiled as 'pre-existing residual'.)
- FIX LANDED: buildCreateCdcData preserves raft_role + group_id from
  the cached services row when present (systemTableCache is wired
  into the production state machine since the CL-021(A) corrections).
  The UPDATE branch never wiped (column-level). Window remaining:
  before the role helper's FIRST successful write the row legitimately
  has no role — the helper retries (roleUpdateRetryTimer) and the next
  lifecycle upsert no longer destroys it. Guard: 'lifecycle UPSERT
  preserves raft_role/group_id from the cached row' subtest (red on
  revert). Node suite 1,208 pass.
- Gate prediction (pre-registered): raft_role_missing exclusions decay
  to zero within the run; spread surfaces clear; remaining stalls
  shift to the restart-recovery rung / quiesce.
- VALIDATION GATE (073746Z) — CL-021 GUARDED. 4/4 publication
  CONVERGED, 0 corrupt, walls 212-555s. Pre-registered prediction
  CONFIRMED: (1) raft_role_missing DECAYED TO ZERO — runs 1-3 have
  zero occurrences anywhere; run4 shows it only in MID-RUN snapshots
  (1 per partition, down from 2) alongside status_syncing=2
  (legitimate transients in the pre-role-write window), and the FINAL
  snapshots show EMPTY exclusionReasonCounts with
  readyDistinctNodeCount=2/readyReplicaCount=3 — co-location surplus
  awaiting source removal, NOT blindness. (2) The spread surface is
  GONE as a failure cause (no run failed on it). (3) The CL-021(A)
  reconcile ENGAGED for the first time (17 'Deferred durable services
  row converged' witness lines in run4) — with role preservation the
  whole convergence chain now operates. Surfaces now: run4 quiesce
  with quiescenceState=leadership_churn /
  canonicalBlocker=leadership_unstable / inFlightCount=3 (NEW
  canonical blocker — next record candidate); runs 2/3 mode=load at
  active=5/5 coverage complete (everything green — the stable-window/
  gate-flap question from the CL-020 verdict entry); run1 mode=load
  at active=0/5. NEXT SESSION: (a) the mode=load stable-window
  question (why no close at active=5/5 — read
  lastMeaningfulChange timestamps vs gate-green transitions);
  (b) leadership_unstable quiesce blocker; (c) the restart-recovery
  rung (pre-analysis above; 061547Z-run3 artifacts).

## CL-022 Load Admission Must Not Be Fenced By An Unprovable Snapshot-Coverage Input

- Status: narrowed (2026-06-12; opened from 073746Z runs 2/3 — the
  mode=load stable-window question, answered)
- Concern: readiness-projection
- Failure Class: witness-gap
- First Violated Invariant: The active-gate handoff contract embedded
  in the seed's control snapshot must be able to prove snapshot
  coverage whenever the snapshot itself observes full node coverage;
  instead the fence's coverage-evidence input is EMPTY in steady
  state, so the catchup fence denies runtime promotion forever
  (aliased as published_active_coverage_incomplete) while presence
  5/5 and durable publication 5/5 (epoch 4) are both complete.
- Authoritative Owner: AdminControlSnapshot (seed) —
  resolvePublicationActiveGateHandoffContract
  (admin-control-snapshot-class-part-1.js:486) feeding
  buildPublicationActiveGateCatchupFence
  (publication-active-gate-handoff-contract-fence.js:384).
- Authoritative State: the embedded
  controlPlaneDiagnostics.publicationActiveGateHandoff record
  (state/reasonCode/runtimePromotionAllowed + activeGateCatchupFence
  .snapshotCoverage) served by the seed's control snapshot.
- Allowed Evidence: activeNodeViews effective/covered node id lists,
  snapshot revision, node rows, durable publication row.
- Forbidden Promotion Inputs: none new — the bug is the inverse
  (a structurally-absent input acting as a permanent DENIAL).
- Convergence Trigger: every getControlSnapshot rebuild (snapshot is
  rebuilt per request — buildLocalControlSnapshot); nothing converges
  because the input is empty on every rebuild.
- Stable Witness: fence record in the run failure bundle:
  snapshotCoverage={state:unavailable, nodeIds:[], missingNodeCount:5}
  with presence.complete=true AND durablePublication.covered=true;
  harness-side loadReadinessAdmissionGate {state:blocked,
  reasonCode:inactive, ownerState:degraded,
  ownerReasonCode:published_active_coverage_incomplete,
  promotionAllowed:false} on every periodic load-readiness.waiting
  stage record.
- Entry Gate: rolling-restart mode=load load-readiness stability wait
  (pre_load), stat-gate-20260612T073746Z runs 2/3.
- Current Symptom: 'Cluster ACTIVE wait stalled with no meaningful
  progress' at active=5/5, coverage=5/5#complete,
  publication=PUBLISHED, gateReasons=none — 46/32 consecutive
  no-progress attempts; the stable window NEVER starts
  (stableElapsedMs=0, startedAt unavailable for the entire wait).
- Scope: deterministic in the stalling runs (every attempt that
  selects the SEED's snapshot is denied; the one green attempt —
  run2 attempt 47, blockers=['ready'] — selected joiner ebc4aa0b's
  snapshot instead). Unit-repro candidate: build the contract with
  production-shaped inputs (activeNodeViews with empty lists +
  complete publicationConvergence) and assert the denial.
- Next Falsification Step: pin WHY the seed's
  activeNodeViews.effectiveActiveNodeIds (and the other 3 coverage
  fields the fence reads) are empty at steady state —
  candidates: (a) ready-lease/connection gating inside
  resolveActiveNodeViews (active-node-projection.js, the known
  7-source mixer) chronically excluding peers on the seed;
  (b) mergeControlSnapshotActiveNodeViewsWithPublicationOwnerTruth
  not engaging (shouldMergeControlSnapshotPublicationOwnerTruth
  requires ackComplete+prioritySpreadSatisfied evidence SHAPE that
  the served publicationConvergence may not carry) — if it engaged,
  owner-truth ids (5/5) would have populated the projection.
- Required Guard: unit test on the admin-snapshot handoff build path
  with production-shaped snapshot inputs asserting
  runtimePromotionAllowed=true (fence coverage provable) when the
  snapshot covers all expected nodes; plus a harness-side guard that
  loadReadinessAdmissionGate cannot stay ownerState=degraded while
  presence+durablePublication are complete for N consecutive attempts.

### Evidence

1. CONSUMPTION CHAIN (falsifies CL-021 sub-mode (B) verdict
   "the harness never consumes that contract"): the load-readiness
   stability wait builds loadReadinessAdmissionGate
   (cluster-segment-7-alpha-load-readiness.js:300 —
   requireActiveGatePromotion) from
   snapshotCoverage.selectedPublicationActiveGateHandoff
   (resolveActiveGateOwnerCohort:280); when promotion is denied,
   applyLoadReadinessAdmissionGate:364 FORCES allActive=false. The
   contract's promotion flag IS load-bearing in mode=load.
2. Fence record consumed by the harness (run2 failure-bundle,
   /diagnostics/controlPlaneDiagnostics/activeGateSnapshotCoverage/
   selectedPublicationActiveGateHandoff): presence complete 5/5,
   durablePublication available+covered 5/5 epoch=4 revision=0,
   snapshotCoverage state=unavailable available=false nodeIds=[]
   missingNodeCount=5 → promotion_denied → contract degraded /
   published_active_coverage_incomplete (the documented aliasing,
   publication-active-gate-handoff-contract.js:274-290).
3. The denial is NOT the stale watermark: snapshotCoverage.stale=false
   — it is UNAVAILABLE (empty input), not stale. cache_stale_watermark
   (threshold CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS=5000 vs
   CONTROL_PLANE_HEARTBEAT_INTERVAL=5000 + CDC lag → chronically
   stale by construction, observed heartbeat gaps 2-20s in healthy
   snapshots) explains the repair_deferred/stale_usable observation
   noise but NOT the fence denial. Separate latent issue; note for
   Task-28.
4. Blocker history (run2): signature 'none' (zero blockers, allActive
   false) covers 67 attempts spanning 1→93; 'ready' (allActive TRUE)
   exactly once at attempt 47 (elapsed 123.9s) when the probe selected
   joiner ebc4aa0b's snapshot with snapshotObservation=none. The
   load-mode probe only queries nodes past the first when the first
   result is missing nodes (cluster-segment-7-class-5.js:548) — so the
   seed's denied snapshot is selected on essentially every attempt.
5. The mode=load _waitForAllActive allActive conjuncts were all green
   (activeByStatus true — no inactive_nodes blocker; gateReasons
   empty → publicationConvergenceGate.ready true; coverage complete)
   — the stall lives in the LOAD-READINESS wait's admission gate, not
   in the publication gate. The CL-021 'gate flaps green' hypothesis
   is refuted: the gate was green almost the whole time; the ADMISSION
   gate never was.
6. The snapshot is rebuilt per request (buildLocalControlSnapshot via
   getControlSnapshot; prepareVisibleMembershipPublicationHandoffRefresh
   rebuilds again) — the empty coverage input is recomputed live every
   time, not a frozen formation-era snapshot.

### Exit Criteria

1. The fence's snapshot-coverage evidence is provable (covered=true)
   on the seed's served snapshot whenever the snapshot observes all
   expected nodes.
2. loadReadinessAdmissionGate reaches state=ready and the stable
   window closes in mode=load runs at active=5/5.
3. Guard tests red on revert; gate rerun shows runs 2/3-class stalls
   gone (remaining surfaces: quiesce leadership_unstable, restart
   rung).

### Notes

1. CL-021 record correction: sub-mode (B) was RESOLVED AS ARTIFACT on
   the claim the contract is diagnostic-only — WRONG for mode=load
   (evidence 1). The owner-driver call-site shape (stage-2.js:905,
   no activeNodeViews) and the admin-snapshot call-site (passes
   activeNodeViews that turn out EMPTY) produce the SAME unprovable
   fence; the admin one is the load-bearing instance.
2. Fix direction (after falsification step): make the admin-snapshot
   call site pass a provable coverage source (e.g. the snapshot's own
   observed node coverage / snapshot revision it is ABOUT to serve, or
   the owner-truth-merged effective actives), rather than weakening
   the fence; do NOT let the empty-input denial be silently treated as
   'incomplete coverage'.

### CL-022 Fix Landed + Verification (2026-06-12)

- ROOT CORRECTED BY PINNING SUBAGENT (my projection-emptiness inference
  was WRONG; candidates (a) lease-gating and (b) merge-not-engaging
  both REFUTED by repro through the real resolvers): the build-time
  contract (part-1.js:486) is HEALTHY (promotion allowed, coverage
  5/5) and never reaches the wire — EVERY serve path funnels through
  resolveSharedControlSnapshot -> attachControlSnapshotObservation-
  ActiveGateHandoff (part-1.js:716, 796-854), which REBUILDS the
  contract from controlPlaneDiagnostics.activeNodeViews = the
  serialized summary whose keys DROP the "Active" infix
  (effectiveNodeIds/publishedNodeIds/projectedNodeIds/
  authoritativeNodeIds, written at part-1.js:610-627). The fence reads
  only the resolver-shaped *ActiveNodeIds keys -> coverage evidence
  empty -> unavailable -> promotion denied on every served snapshot.
  Field-name contract break; failing this gate on every run since the
  rebuild landed (d6a4a667, 2026-05-22). NOT a staleness/readiness
  problem at all; the stall trigger was the ELAPSED no-progress budget
  (attempts budget deliberately zeroed when the promotion gate is
  required, rolling-restart.js:525-527).
- FIX (2a3b3c2b): resolveControlSnapshotObservationActiveNodeViews
  translates the summary dialect back to resolver-shaped keys at the
  rebuild boundary (never clobbering canonical keys). Guards:
  admin-control-snapshot-served-handoff-coverage.test.js (8 asserts,
  6 red on revert, through the real serve path) +
  admin-control-snapshot-served-handoff-writer-coupling.test.js
  (derives the summary through the REAL writer
  buildLocalControlSnapshot so a writer key rename cannot silently
  re-open CL-022; red on revert).
- ADVERSARIAL VERIFICATION (subagent, 6-scenario full-contract
  deep-diff through the real serve path): PASS on safety — promotion
  =true can only stop the harness gate from FORCING allActive=false
  (applyLoadReadinessAdmissionGate:344 returns the probe unchanged);
  liveness conjuncts computed independently; the only src write path
  consumes the PRE-attach contract; degraded inputs (missing node,
  pendingAck, formation-empty) still DENY with sensible reasons; the
  non-clobber branch fails CLOSED (canonical-empty + summary-populated
  -> deny). Findings recorded, none safety-blocking:
  (A) the rebuilt contract's published-active evidence now resolves
  from the summary's publishedNodeIds AHEAD of publicationConvergence
  when they diverge (= PARITY with the build-time contract's
  precedence, but a serve-time behavioral change: a summary-published
  superset suppresses the served reconcile signal; durable fence still
  governs promotion). If durable should govern evidence, pass
  publishedActiveNodeIds: publicationConvergence.publishedActiveNodeIds
  explicitly at the rebuild site — decide at Task-28.
  (B) writer<->translator coupling guard — CLOSED by the
  writer-coupling test above.
  (C) serve-path staleness blind spot (PRE-EXISTING): the summary
  carries no fresh/revision markers so fence snapshotCoverage.stale
  can never trip on served snapshots; staleness visible only in
  observationMode. Task-28: stamp the summary with snapshotRevision/
  fresh.
- ALSO for Task-28 (from the CL-022 investigation, separate latent
  issue): CONTROL_SNAPSHOT_CACHE_STALE_THRESHOLD_MS (5000) ==
  CONTROL_PLANE_HEARTBEAT_INTERVAL (5000) + CDC lag means the
  cache_stale_watermark repair trigger fires chronically in a healthy
  cluster (observed heartbeat gaps 2-20s) — quiescence misread as
  staleness; harmless for CL-022 but noisy (repair_deferred/
  stale_usable observation on most serves).
- VALIDATION GATE: stat-gate launched 20260612T085908Z (4 runs,
  pre-registered prediction: the runs-2/3-class mode=load
  stable-window stalls at active=5/5 disappear; loadReadinessAdmission
  gate reaches ready; remaining surfaces = quiesce leadership_unstable
  + restart-recovery rung + possibly the active=0/5 projection
  sub-case). Run 1: CONVERGED 355s.

### CL-022 GATE VERDICT (stat-gate-20260612T085908Z) — GUARDED

- 4/4 publication CONVERGED, 0 corrupt, 0 stale-source; walls
  355/491/747/826s (p50 491 — runs now go DEEPER, reaching phases that
  were unreachable behind the admission gate).
- PRE-REGISTERED PREDICTION CONFIRMED: the blocked-admission-gate
  signature is GONE. loadReadinessAdmissionGate reaches
  {state:ready, promotionAllowed:true, ownerState:complete,
  ownerNextAction:admit_active_gate} — first time ever — and holds it
  for 120+ consecutive attempts (run1 stage records); runs 2/3 passed
  load-readiness entirely (run2 reached ACTUAL ROLLING RESTARTS,
  run3 reached the quiesce gate).
- Status: guarded (fix 2a3b3c2b + guards red-on-revert + gate rerun
  shows the first violated invariant no longer violated; move to
  closed after one more confirming round).
- SURFACES AFTER CL-022 (one record candidate each — split by
  first-violated invariant, do NOT lump):
  (1) run1 mode=load stall WITH admission ready: owner reconcile
      handoffOutcome=write_deferred#owner_reconcile_pending#enqueued
      forever, ownerQueue=69 (growing), epoch stuck at 2, snapshot
      observation deferred_refresh/retry + selected_timeout — the
      membership-publication owner write lane never drains. NEW
      record candidate: owner reconcile queue drain liveness.
  (2) run2: restart-recovery rung — 'Restarted node did not become
      recovery-ready within 120000ms' node 11601fe0, fresh boot
      wedged INIT/alive with BOOTSTRAP_PHASE_INCOMPLETE|
      SQL_ENGINE_UNAVAILABLE; SECOND occurrence (artifacts:
      085908Z-run2 + 061547Z-run3 + pre-analysis in the
      'Restart-Phase Rung' entry — candidate invariant: restarted
      seed must re-open join admission before the next node
      restarts).
  (3) run3: quiesce 'Control plane did not quiesce within 120000ms',
      quiescenceState=control_plane_pressure, canonicalBlocker=
      control_plane_pressure (instabilitySummary also carries
      leadership_unstable=0:2 — the 073746Z-run4 leadership_unstable
      blocker may be the same family).
  (4) run4: mode=STARTUP stall at active=4/5 coverage complete,
      observation reasons discovery_node_coverage_gap +
      stale_replica_operations_in_flight + selected_timeout.

## CL-023 REPLACE Terminalization Must Not Assert Retirements That Never Happened

- Status: narrowed (2026-06-12; pinned from 085908Z-run2 artifacts by
  dedicated investigation — exact arithmetic reproduces the seed's
  logged counts)
- Concern: placement-priority-spread
- Failure Class: mixed-truth
- First Violated Invariant: A REPLACE replica operation must not reach
  terminal REMOVED while its source replica remains a live raft
  member — op f93eec38 (replica_operations-p1, source r1 -> target r4)
  completed_at 09:05:40.309Z with workflow_step=REMOVED, yet the
  seed's r1/r2/r3 services rows stayed ACTIVE in every subsequent
  snapshot, r1 won a liferaft election at 09:09:15.670Z (term 13),
  and every later op's membership snapshot still lists r1,r2,r3.
- Authoritative Owner: rebalance operation workflow (the transition
  that sets REPLACE workflow_step=REMOVED) + the planner retirement
  projection that trusts it
  (filterReplicasRetiredByTerminalReplaceOperations,
  unified-rebalancer-segment-3.js:488).
- Authoritative State: replica_operations rows (steps_history
  sourceReplicaId + workflow_step) vs services rows (status=ACTIVE).
- Allowed Evidence: confirmed source services-row delete + raft
  membership change before terminal REMOVED.
- Forbidden Promotion Inputs: target-ACTIVE alone; dispatch-of-removal
  (vs confirmation); cache visibility of the removal.
- Convergence Trigger: REPLACE workflow source-removal step.
- Stable Witness: per priority partition,
  |{sourceReplicaId of REPLACE ops with workflow_step=REMOVED}
  INTERSECT {replica_id of ACTIVE services rows}| from any snapshot
  (both tables in snapshots.ndjson). Run2 final snapshot:
  replica_operations-p1=4, sql_write_operations-p1=5,
  sql_transaction_participants-p1=4, control_plane_publications-p1=4
  (17 ghost retirements). Healthy value: 0.
- Entry Gate: rolling-restart restart phase (085908Z-run2) — but the
  ghost retirements PREDATE the restarts (from 09:05:40, formation/
  load window); restarts only exposed them.
- Current Symptom: when restarts remove the replacement targets, the
  planner's healthy-count collapses to 0/0/1/1 (real rows alive) ->
  38-cycle critical-rebalancing livelock: every planned ADD targets
  the seed and is admission-blocked target_node_already_occupied
  (rebalance-coordinator-topology-guard-methods.js:200 merges
  cache+authoritative rows and SEES the live replicas the planner
  projected out — planner-vs-admission view inconsistency,
  CL-021-adjacent); the un-completable REMOVE dispatches to a dead
  node forever; 0 completions; the churn starves the seed's
  bootstrap serving (rejoiner contact timeouts -> CL-025 chain).
- Scope: run2 artifacts; ops f93eec38, 5a0a7486, 50e695b0, 724a84b5,
  3a1e4360 (replica_operations-p1) + equivalents on the other three
  priority partitions.
- Next Falsification Step: find the REPLACE -> REMOVED transition
  (grep WORKFLOW_STEP REMOVED assignment under src/rebalancer/) and
  check what source-removed evidence it requires; falsified if it
  awaits a confirmed source service-row delete + raft membership
  change (then pivot to 'the confirmation was spoofed by the cache
  layer').
- Required Guard: unit/workflow test red when REPLACE terminalizes
  with the source services row still ACTIVE; plus the stable-witness
  intersection asserted 0 in run reports.

### Notes

1. The 'surplus awaits source removal' observation in the CL-021 gate
   verdict (co-location surplus, readyDistinctNodeCount=2 with
   readyReplicaCount=3) is likely THIS: removals asserted in the op
   ledger but never executed.
2. Downstream symptoms (do NOT open separate records for them):
   planner view-collapse, critical-rebalancing livelock, quiesce
   control_plane_pressure (085908Z-run3 candidate — verify same
   witness there), seed bootstrap starvation.

## CL-024 Durable Rejoin Must Not Be Non-Retryably Fatal On A Missing Dynamic-Table Schema

- Status: narrowed (2026-06-12; 085908Z-run2 restart #1)
- Concern: restart-rejoin-identity
- Failure Class: priority-invariant-breach (restart=re-entry aborts)
- First Violated Invariant: A restarted node's durable-rejoin restore
  must degrade per-partition (skip/defer the unknown table), never
  abort the whole node: 35a891b8's second boot resolved
  startupMode=durable_rejoin, then 'Failed to join cluster {error:
  Missing schema definition for durable rejoin partition
  tbl-e4468ee2-...-p1, phase: querying_state, retryable: false}' ->
  process exit code 1 at 09:10:09.715Z (10s after boot).
- Authoritative Owner: durable-rejoin restore planner
  (src/bootstrap/shared/durable-rejoin-partition-restore-planner.js:210
  assertCritical(schema, ...)).
- Authoritative State: TABLES cache row schema_definition for
  load-created (dynamic) tables; static fallback getSchemaByTableName
  does not know dynamic tables.
- Stable Witness: 'Resolved startup auto-rejoin decision
  startupMode=durable_rejoin' followed by 'Process exit observed
  code=1' within the same boot, with the Missing-schema error line.
- Entry Gate: rolling-restart restart #1 (any restarted node that
  durably hosts a partition of a load-created table).
- Current Symptom: the restarted node dies; the cluster silently runs
  N-2 for the rest of the scenario (masked by CL-025).
- Scope: deterministic-looking given durable state containing a
  dynamic table whose TABLES row lacks schema_definition at restore
  time. Unit-repro: restore planner with a dynamic-table partition +
  cache row without schema_definition.
- Next Falsification Step: why is schema_definition missing — never
  persisted for load-created tables, or not yet hydrated at
  querying_state time (ordering)? Read where TABLES rows get
  schema_definition on CREATE TABLE and what the rejoin path has
  hydrated by then.
- Required Guard: restore-planner test: unknown-schema partition ->
  plan proceeds without it (deferred/skipped, retryable), node boots.
- Notes: 061547Z-run3's restart #1 did NOT crash (no dynamic-table
  restore there) — explains the sub-mode difference between the two
  occurrences of the restart-rung failure.

## CL-025 Restart Recovery-Ready Must Not Pass While The Restarted Process Is Dead

- Status: narrowed (2026-06-12; 085908Z-run2)
- Concern: harness-control-snapshot
- Failure Class: harness-oracle-gap
- First Violated Invariant: the harness's restartNode recovery wait
  must fail (or at minimum not declare recovered) when the restarted
  node's process has exited: chaos declared 35a891b8 recovered at
  09:10:11.729 — 2.0s AFTER its process logged 'Process exit observed
  code=1' (09:10:09.715) — and proceeded to stop the next node,
  running the rest of the scenario with TWO nodes down (the
  rolling-restart N-1 premise silently broken; all downstream
  attribution polluted).
- Authoritative Owner: harness chaos restartNode recovery-ready wait
  (test/distributed/harness/chaos.js + the recovery-ready predicate).
- Stable Witness: node.restart.boundary after_ready carrying an error
  ('Admin API query connection closed before response') followed by
  chaos.fault.recovered for the same node; container exit/restart
  count vs the declaration.
- Current Symptom: false 'recovered'; next restart proceeds; failure
  attributed to the NEXT node (11601fe0) whose only sin was a starved
  seed.
- Next Falsification Step: read the recovery-ready predicate — which
  evidence allowed 'recovered' 2s after process exit (stale probe
  result? bootstrap_health from the dying process? docker container
  state not consulted?).
- Required Guard: harness test: restartNode against a process that
  exits during the wait -> chaos.fault.failed, not recovered; plus
  the rolling driver must verify the PREVIOUS restart's node is still
  alive before stopping the next one.
- Notes: same oracle family as the CL-006-era capture gaps; this one
  actively GREEN-LIGHTS an N-2 cluster.

### CL-023 PINNED (2026-06-12, second investigation round) — status: reproduced (code-path deterministic; unit repro designed)

- THE CALLER: reconcilePriorityRecoveryOperationDrain ->
  completeOperation (operation-workflow-owner-segment-7-stage-4.js:548).
  Decision chain, all file:line-verified: (1) drain candidate =
  REPLACE + priority partition + step in {PENDING..STOPPING}
  (stage-3.js:340, recovery-reconcile-shared.js:282-291);
  (2) completion accepted from the priority-recovery PLANNING
  SNAPSHOT when state in {converged, spread_satisfied_in_flight}
  (segment-6.js:119, shared.js:331-336 — the latter counts IN-FLIGHT
  placement, itself a forbidden promotion input); (3) THE BUG: for a
  pre-sync REPLACE (PENDING/SENDING/CREATING) whose target replica is
  UNMATERIALIZED (no observed services row), the override table maps
  TARGET_UNMATERIALIZED -> SOURCE_STATE.NOT_REQUIRED
  (recovery-reconcile-shared.js:475-482) — THE SOURCE REPLICA IS
  NEVER OBSERVED AT ALL; (4) NOT_REQUIRED -> CONVERGED ->
  COMPLETE_PRIORITY_RECOVERY_DRAIN -> completeOperation -> terminal
  REMOVED from SENDING (or even PENDING), reason operation_completed.
- Run evidence: f93eec38 completed :40.319 while its target's
  services-row write was DEFERRED (status write deferred :36.689;
  r4 active only :43.700). Cross-check op 8358e75f
  (control_plane_publications-p1): PENDING -> REMOVED, NEVER
  DISPATCHED AT ALL (no claim on any node) — kills every
  dispatch/response/outcome theory for the class; only the drain can
  complete an undispatched PENDING op.
- SECOND forbidden input adjacent: ABSENT -> REMOVAL_CONFIRMED
  (recovery-reconcile-shared.js:405-412) treats CACHE-ABSENCE of the
  source services row as confirmed removal.
- Ownership wrinkle (explains the dual-node logs, NOT the bug): for
  unsettled priority REPLACEs the TARGET owns the workflow
  (resolveOperationOwnerNodeId,
  replica-operation-repository-row-methods.js:124-159; seed wakes the
  remote owner; target claims via CAS — its 'step changed
  PENDING->SENDING ingress priority_claim_cas' log). The seed settled
  as a NON-owner via the explicit REMOTE_SETTLE_ALLOWED carve-out
  (stage-4.js:348+, shared.js:581-584). The drain runs from
  checkTimeouts' periodic scan over ALL incomplete ops with no
  ownership filter (stage-3.js:121) — serial completion cadence of
  all 5 priority REPLACEs :30.981-:40.319 matches.
- Eliminated by evidence: step-timeout (SENDING budget 30s, elapsed
  12.3s; timeout path FAILS not completes), reconcileReplaceActualActive
  (commits ACTIVE first, never direct-completes), dispatch responses
  (unreachable for REPLACE; response went to the target),
  stop-phase NOT_FOUND (forces STOPPING first), already-active
  idempotency (create handled exactly once, replica didn't pre-exist).
- FIX LOCUS (one sentence): the pre-sync drain override
  TARGET_UNMATERIALIZED -> NOT_REQUIRED (and the ABSENT ->
  REMOVAL_CONFIRMED mapping) must not terminalize a REPLACE as
  REMOVED — the step filterReplicasRetiredByTerminalReplaceOperations
  reads as confirmed source retirement; settle as FAILED/cancelled
  (re-plannable) instead. NEVER-BREAK CHECK REQUIRED before landing:
  FAILED rows interact with CL-013's 'hints don't filter FAILED rows'
  follow-up and the failure-path removal symmetry from CL-016 —
  verify a FAILED-settled REPLACE cannot strand topology hints or
  ghost service rows; also decide whether spread_satisfied_in_flight
  may remain a completion state for POST-sync steps.
- Required Guard (red today): workflow-owner unit test driving
  reconcilePriorityRecoveryOperationDrain with a priority REPLACE in
  SENDING (and PENDING), completion CONVERGED or
  spread_satisfied_in_flight, unmaterialized target, ACTIVE source
  services row -> op must NOT reach workflow_step=REMOVED. Plus the
  stable witness in run reports: |{sourceReplicaId of REMOVED
  REPLACEs} INTERSECT {ACTIVE services replica_ids}| == 0 (currently
  4/5/4/4).
- DX (one line, fires ~17x/run): info log at the settle branch
  (stage-4.js:~537) carrying {operationId, workflowStep, drainState,
  completionState, sourceState, ownerState, trigger}.

### CL-025 FIX LANDED (2026-06-12) — status: guarded

- MECHANISM CONFIRMED before fixing (085908Z-run2, 35a891b8 second
  boot): Admin WebSocket API started at +3s of boot (09:10:02.345)
  while join-readiness was still blocked in INIT; the recovery wait's
  single adminReady probe passed; the process exited code 1 at
  09:10:09.715; the failing after_ready boundary snapshot was
  swallowed (_recordRestartBoundarySnapshot catch-all); _runChaosAction
  declared the fault recovered at 09:10:11.729.
- FIX (test/distributed/harness/cluster-segment-7-class-2.js +
  class-1.js): (i) _waitForNodeAdminReadiness now requires TWO
  consecutive ready probes (RESTART_RECOVERY_CONSECUTIVE_READY_PROBES;
  a single transient ready sample is not recovery); (ii) NEW
  _assertRestartedNodeRecoveryHeld runs AFTER the after_ready boundary
  snapshot in _restartNodeWithObservation — the same readiness
  predicate re-verified within a bounded budget (default 15s,
  config timeouts.restartRecoveryHoldRecheckMs); a node that died
  after the wait now FAILS the restart action loudly ('Restarted node
  lost recovery readiness after the post-restart boundary'). The
  scenario's per-node loop therefore stops at the ACTUAL dead node —
  the driver-level previous-node-alive pre-check from the record is
  satisfied at the source (failure attribution fixed where it
  arises), no extra driver machinery added.
- Guards: cluster-restart-recovery-held.test.js (3 tests: dies-after-
  readiness fails; healthy restart passes with >=4 probes; single
  transient ready probe never satisfies the wait) — all red on
  revert. Existing restartNode staging-sequence tests updated for the
  recheck call. Full harness __tests__ suite green.
- OPEN FOLLOW-UP (parked, written boundary): the predicate itself
  remains weak — adminReady comes up seconds into a boot that is
  still JOINING, so a slow-but-alive rejoiner is declared recovered
  while mid-rejoin and the driver proceeds to restart the next node
  (rolling N-1 premise can still be violated by SLOW rejoin, just no
  longer by DEATH). Strengthening (e.g. requiring readinessPhase
  beyond INIT or controlPlaneRecoveryReady in addition to adminReady)
  changes what the scenario gate measures — decide deliberately at
  the restart-rung record (CL-024/CL-023 follow-ups), not as a
  harness patch.
- Gate evidence: next stat-gate round (any) — a CL-024-style rejoin
  crash must now surface as chaos.fault.failed on the CRASHED node.

### CL-024 FIX LANDED (2026-06-12) — status: guarded

- FALSIFICATION ANSWER (partial): CREATE TABLE DOES persist
  schema_definition in the TABLES row
  (table-creation-service-create-table.js:103), so the gap at restore
  time is either join-cache hydration ORDERING (schema not yet
  hydrated at querying_state; the CL-014 catch-up runs later) or a
  column WIPE by a later full-row writer (CL-021 pattern; TABLES rows
  not audited). OPEN sub-question, slow-only either way after this
  fix: if it is a wipe, the replica is skipped on EVERY restart —
  witness for the next gated run: count of 'Durable rejoin restore
  skipped' warns per node per boot (should be 0 or transient).
- Context detail: the dynamic table's replica landed on the restarted
  node ~35s before its restart (a rebalancer ADD during load) —
  freshly-placed replicas are the likeliest to hit the gap.
- FIX (durable-rejoin-partition-restore-planner.js): per-partition
  fail-closed — the restore loop wraps eligibility + plan build per
  service row; ANY metadata gap (missing partition row, table ref, or
  schema) skips THAT partition's restore with a structured warn
  ('Durable rejoin restore skipped for partition with incomplete
  metadata' {nodeId, partitionId, replicaId, error}) and the node
  continues its rejoin. The skipped replica is re-established by
  post-join repair (rebalancer ADD) — slow-only; the previous
  behavior was process exit code 1 (and, pre-CL-025, a silent N-2
  cluster). Caller passes this.logger
  (node-joining-publication-activation.js:52).
- Guards (red on revert, 4 failures): planner test updated —
  'fails closed PER PARTITION' (zero plans + warn carries the gap) +
  NEW exact-case test (schema-less dynamic table skipped, healthy
  partition still restored). Suite 16/16; bootstrap-suite failures
  are the known pre-existing set (fail on clean tree).
- Never-break check: skipping a restore cannot create wrong state —
  no partition service is created for the skipped replica (fail
  closed per partition preserved); the only cost is temporary RF-1
  on that partition until repair, which is the same state the
  cluster was already in while the node was down.

### Gate Verdict 20260612T111041Z (CL-024 + CL-025 validation) — both mechanisms LOAD-BEARING; CL-023 confirmed as the binding constraint

- 4/4 publication CONVERGED, 0 corrupt, 0 stale; walls 422-1082s.
- CL-025 GUARDED->WITNESS FIRED IN PRODUCTION (run4): 'Restarted node
  lost recovery readiness after the post-restart boundary' for
  ebc4aa0b — a node that passed the readiness wait then died was
  caught BY THE NEW RECHECK at the right node. Run2's crash is now
  honestly attributed (chaos.fault.failed, reachable=false) instead
  of the previous false 'recovered' + misattribution. CL-025 status:
  guarded (one more clean round for closed).
- CL-024 ENGAGED AND HELD (run4): 3-4 'Durable rejoin restore
  skipped' warns per restarted node (missing PARTITION metadata for
  priority replicas incl. sql_write_operations-p1-r4,
  control_plane_publications-p1-r7) — the planner skipped per
  partition and the rejoin CONTINUED past restore. Status: guarded.
  RECORD EXTENDED — the class has more sites: the same boots then
  died at OTHER non-retryable join asserts:
  site #2 (run2, 11601fe0): 'Leader metadata incomplete:
  missingPartitionLeaders=nodes-p1,node_endpoints-p1' -> exit 1;
  site #3 (run4, ebc4aa0b): 'Failed to register node: Table not
  found: nodes' -> exit 1. The skip-warn content answers the
  ordering-vs-wipe question DECISIVELY toward a deeper cause: whole
  PARTITION rows (not just schema columns) for PRIORITY partitions —
  and even the nodes TABLE — are absent from the rejoiner's join
  cache at querying_state. The rejoin hydration is WHOLESALE
  incomplete on these boots, almost certainly because the cluster is
  under the CL-023 control-plane-pressure livelock when restarts
  begin (quiesce never completed; the seed serves incomplete state).
  Do NOT whack-a-mole the remaining assert sites one by one before
  CL-023 lands; re-evaluate the residual crash rate after CL-023,
  then decide between per-site degradation and a single
  hydration-completeness gate before querying_state.
- CL-023 (still open): 2/4 runs failed quiesce at
  control_plane_pressure (the pinned ghost-retirement livelock
  downstream), and the rejoin-hydration gaps above are consistent
  with the same pressure. CL-023 is the binding constraint for the
  entire restart phase. Fix next (locus + checklist in the CL-023
  pin entry).

### CL-023 FIX LANDED (2026-06-12) — status: fix-landed (gate pending)

- DESIGN (rubber-ducked via adversarial subagent BEFORE landing; the
  review changed the design in four load-bearing ways, listed below):
  (1) The pre-sync override no longer maps TARGET_UNMATERIALIZED ->
  NOT_REQUIRED (the ghost-complete). Fresh rows (step age <
  getTimeoutForStep, updatedAt-based) -> EVIDENCE_UNAVAILABLE (held,
  no source observation) so an in-flight dispatch can land; STALE rows
  -> RETIREMENT_UNPROVEN_STALE -> new drain state
  STALE_WITHOUT_RETIREMENT_EVIDENCE -> new action
  FAIL_PRIORITY_RECOVERY_DRAIN_STALE -> failOperation (terminal
  FAILED, re-plannable, asserts NO retirement). Applies under BOTH
  accepted completion states: with an unmaterialized target the op
  did nothing, so even self-counted in-flight spread satisfaction is
  fictional; staleness (not completion state) is the fresh-work guard.
  (2) ABSENT confirms removal ONLY at STOPPING (removal actually
  dispatched; row deletion is the expected terminal observation).
  All other steps: ABSENT -> EVIDENCE_UNAVAILABLE. LEDGER CORRECTION:
  ABSENT is authoritative-read absence, NOT cache absence (failed
  reads map to UNAVAILABLE; cache fallback never yields ABSENT) —
  still a forbidden pre-dispatch input because CL-016-deferred
  priority source rows can be durably absent while alive (exactly the
  recovery window the drain runs in).
  (3) WEDGE PREVENTION (review counterexample: remote-owned REMOVE at
  SENDING whose row was already deleted, owner decommissioned — under
  (2) alone it would hold quiesce FOREVER): source state
  EVIDENCE_UNAVAILABLE + completion CONVERGED (strictly — NOT
  spread_satisfied_in_flight, which can be satisfied by live work) +
  stale -> the same FAIL settle. Covers REPLACE/REMOVE/ADD
  evidence-unavailable wedges.
  (4) OWNER GATING (review caught the first design's hazard: adding
  the new action to the REMOTE_SETTLE carve-out unconditionally would
  BYPASS the wake path and let the seed kill a live owner's
  deferred-visibility work): stale-FAIL settles remotely ONLY when
  isPriorityRecoveryDrainOwnerUnavailable(owner); an available owner
  is woken (REMOTE_REARM) or skipped (it settles locally).
  reconcilePriorityRecoveryOperationDrain enforces ownerAction
  ALLOW_RECONCILE for the new action itself — several callers
  (reconcileOperationLifecycle, dispatch-pending drain) settle on
  action without re-checking ownerAction.
  Both drain-snapshot builders (stage-4 + the duplicated
  dispatch-pending builder, a review finding) flow through the shared
  decision table + resolvers, so neither path diverges.
- FILES: operation-workflow-recovery-reconcile-shared.js (decision
  table, ABSENT-by-step map, new states/action mapping),
  operation-workflow-owner-segment-7-stage-3.js (staleness helpers +
  CONVERGED-stale escape in resolvePriorityRecoveryOperationDrainState),
  operation-workflow-owner-segment-7-stage-4.js (evidence stepStale,
  step-aware ABSENT, owner gating, settle handling + DX log),
  operation-workflow-recovery-reconcile-dispatch-pending.js (passes
  operation to the state resolver), operation-workflow-owner-shared.js
  + rebalancer-constants.js (action/literal/log-msg constants).
- NEVER-BREAK CHECKLIST (walked, with code evidence):
  FAILED settle writes only the replica_operations row — no services
  rows created, so CL-013 topology-hint pollution and CL-016
  failure-path symmetry are unaffected (the create never ran). A
  dispatch that races the FAIL and materializes the target late is
  cleaned by the EXISTING getTerminalFailedReplaceTargetReplicaIds ->
  move-planner failed-target removal (matches only existing service
  rows; an unmaterialized target id matches nothing).
  spread_satisfied_in_flight REMAINS a completion state for post-sync
  steps (source observation is the load-bearing evidence there).
  failOperation/completeOperation persist without expectedWorkflowStep
  CAS (last-writer-wins) but resurrection after FAILED is blocked:
  the claim CAS expects PENDING and priority updateStep CASes on
  previousStep. FAILED is terminal for quiesce/pressure counting
  (isTerminalReplicaOperationRecord).
- RESIDUALS / FOLLOW-UPS (recorded, deliberately NOT fixed here):
  (a) reconcileActiveReplaceSourceRemovalProgress +
  isActiveReplaceSourceRetirementObserved (stage-1.js:670-706,
  stage-2.js:39-57) complete a REPLACE at step ACTIVE on
  authoritative ABSENT BEFORE any removal dispatch — the same
  forbidden promotion input on a different code path (runs on the
  owner/target node whose cache need not contain the source's
  locally-committed row). NOT the pinned run mechanism (run ops were
  pre-sync). Next-record candidate together with
  OWNER_UNAVAILABLE_RELEASED (completes with sourceRemovalPending
  when the remote owner is unavailable — same ghost class in
  principle). If the gate's ghost witness is nonzero post-fix, look
  HERE first.
  (b) Replica-id reuse hazard (pre-existing, WIDENED by more FAILED
  rows): allocateCanonicalReplicaId is monotonic over op history
  including terminal rows, but a FAILED row invisible during a
  visibility-deferral window can let another coordinator reuse its
  target id; when the FAILED row becomes visible the move-planner
  hard-REMOVEs the healthy reused replica (failed-target cleanup
  bypasses target-count logic). No GC of replica_operations rows
  exists. Slow-only today (remove-safety evaluation downstream).
  (c) STOPPING+ABSENT completion is 'dispatched + row gone' — weaker
  than the record's allowed-evidence definition; NOTHING anywhere
  checks the raft-membership-change half.
  (d) Residual wedge honestly noted: a remote-owned op whose
  completion is NOT in {converged, spread_satisfied_in_flight} (the
  deepest livelock state) still has no drain settle path — unchanged
  from before this fix.
- GUARDS (all red-on-revert verified by stashing src/):
  rebalance-coordinator-stopping-reconcile-stale-priority.test.js —
  the 3 tests that PINNED the ghost as desired (SENDING/PENDING
  converged/spread-satisfied -> REMOVED) rewritten into 6 invariant
  tests: fresh-held (x2), stale->FAILED-never-REMOVED with ACTIVE
  source row (x2, local + remote-dead-owner), ABSENT@CREATING held,
  stale-with-LIVE-owner NOT remotely failed.
  operation-workflow-progress-event-driven-reentry.test.js
  spread-satisfied drain tests now assert FAIL-settle (owner
  unavailable) + completeOperation NEVER called.
  rebalance-coordinator-timeout-cache-visibility tail-more CREATING
  REPLACE test now asserts never-REMOVED-while-source-ACTIVE
  (it previously pinned the forbidden 'target-ACTIVE alone' input);
  tail-final REMOVE test asserts fail-not-complete on unproven
  absence. Suites: rebalancer 5036/5045 pass (the 9 fails are the
  pre-existing unified-rebalancer part-5/6 set, identical on clean
  tree).
- DX: 'Priority recovery drain settled operation' info log fires on
  EVERY drain settle (complete | superseded-fail | stale-fail) with
  {operationId, partitionId, operationType, workflowStep, action,
  drainState, completionState, sourceState, sourceObservationState,
  ownerState}.
- STABLE WITNESS TOOLING: scripts/analyze-replace-ghost-retirements.js
  (npm run analyze:replace-ghost-retirements -- <run-dir>) computes
  the per-priority-partition |REMOVED-REPLACE sources INTERSECT
  ACTIVE services| from the FINAL snapshot (final-only to avoid
  transient false positives from snapshot lag on legit completions);
  exit 1 when nonzero. VALIDATED RED on 085908Z-run2: 22 ghost
  retirements 4/4/4/5/5 across ALL FIVE priority partitions — the
  pinned 17 was an undercount that missed sql_transactions-p1.
- GATE PREDICTION (pre-registered): ghost witness 0 in all runs;
  drain-stale WARN settles appear instead (bounded, re-plannable);
  quiesce control_plane_pressure clears or the surface moves; the
  CL-024 wholesale-hydration crash sites (#2 'Leader metadata
  incomplete', #3 'Table not found: nodes') should decay if the
  livelock was starving the seed's serving during rejoin.
- SUBAGENT VERIFICATION: TRUSTED-WITH-NOTES (2026-06-12). Wiring
  confirmed single-source across all four production paths (no
  dead-code landing; the dispatch-pending builder consumes the same
  shared table and the internal ownerAction guard applies there);
  staleness inputs verified normalized-camelCase ms on real paths
  (the feared snake_case hole does not exist — the same objects feed
  pre-existing timeout math); every claimed mutation has a named red
  test. Notes added to the record:
  (e) Residual hold (deliberate, now explicit): remote owner DEAD +
  completion SPREAD_SATISFIED_IN_FLIGHT + source EVIDENCE_UNAVAILABLE
  at non-pre-sync steps (e.g. ABSENT@SYNCING) is held indefinitely —
  the escape is CONVERGED-only and the release path needs
  REMOVAL_REQUIRED/IN_FLIGHT. Pre-fix this combination
  ghost-completed; if it surfaces as a quiesce wedge, widen the
  escape deliberately rather than re-admitting the ghost.
  (f) Remote stale-FAIL persist carries no expectedWorkflowStep CAS —
  a revived owner's concurrent REMOVED completion can be clobbered by
  FAILED in the unavailability-check->persist window. Traced
  slow-only (a genuinely retired source has no services row; planner
  replans from actuals). Optional hardening: expectedWorkflowStep on
  the remote stale-FAIL persist.
  (g) NEW GHOST VECTOR FOUND OUTSIDE THE DRAIN (verifier):
  applyReconciledReplicaStatus (stage-2.js:146-156) completes a
  non-ADD op as REMOVED when the TARGET replica reconciles as
  REMOVED — target-removed is not source-retired. Joins follow-up (a)
  (ACTIVE-step ABSENT-complete) and OWNER_UNAVAILABLE_RELEASED as the
  candidate set for the next record if the ghost witness stays
  nonzero post-fix. The witness script catches all three in run data.
