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