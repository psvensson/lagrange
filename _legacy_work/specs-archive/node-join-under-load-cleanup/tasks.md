# Implementation Plan: Node Join Under Load Cleanup

## Overview

This plan executes the remaining cleanup work in strict sequence. Every task is
gated by a failing regression first, and each task is marked complete before
the next one begins.

## A1 - Typed Admin Query Pressure Contract

- [x] 1. Add failing regressions for admin query retry-metadata propagation
  - Reproduce an admin query failure that carries `deferRetry` and
    `retryAfterMs`.
  - Reproduce a load-run attempt where retryable control-plane pressure should
    remain attempt-level only.
  - _Requirements: 1.1, 1.2, 1.3, 1.5. Design: D1.1, D1.2, Verification Strategy._

- [x] 2. Implement typed retry-metadata propagation and classification
  - Forward `deferRetry` and `retryAfterMs` across the admin query result
    boundary.
  - Route `LoadRun` pressure classification through typed fields and the shared
    control-plane classifier before message heuristics.
  - _Requirements: 1.1, 1.2, 1.3, 1.4. Design: D1.2, D1.3._

## A2 - Wait-Reason Accounting

- [x] 3. Add failing regressions for wait-reason accounting
  - Reproduce per-node slot saturation and retryable control-plane pressure.
  - Assert global and per-node wait-reason counters are emitted.
  - _Requirements: 2.1, 2.3, 2.5. Design: D2.1, D2.2, Verification Strategy._

- [x] 4. Implement bounded wait-reason metrics in `LoadRun`, reports, and bundles
  - Add global and per-node wait-reason counters.
  - Serialize the counters in load metrics, report entries, and failure bundles.
  - _Requirements: 2.1, 2.2, 2.3, 2.4. Design: D2.2, D2.3._

## A3 - Bottleneck Estimate

- [x] 5. Add failing regressions for bottleneck estimation
  - Cover at least one admission-dominated sample and one queue-dominated
    sample.
  - Assert the report and failure bundle include the derived estimate.
  - _Requirements: 3.1, 3.2, 3.3, 3.5. Design: D3.1, D3.2, Verification Strategy._

- [x] 6. Implement report and failure-bundle bottleneck estimation
  - Derive a bounded heuristic estimate from measured run metrics.
  - Emit machine-readable and human-readable summaries.
  - _Requirements: 3.1, 3.2, 3.3, 3.4. Design: D3.2, D3.3._

## A4 - READY Ownership Cleanup

- [x] 7. Add a failing regression for duplicate READY transition handling
  - Reproduce join-completion code requesting READY when the lifecycle owner is
    already READY.
  - Assert the canonical owner path is still used and same-state READY is
    idempotent.
  - _Requirements: 4.1, 4.2, 4.3. Design: D4.1, D4.2, Verification Strategy._

- [x] 8. Implement singular READY ownership cleanup
  - Suppress same-state READY invalid-transition noise at the lifecycle owner
    boundary.
  - Preserve true invalid-transition diagnostics.
  - _Requirements: 4.1, 4.2, 4.4. Design: D4.2, D4.3._

## A5 - Verification And Closure

- [x] 9. Run focused verification and a `node-join-under-load` rerun
  - Run targeted tests for tasks A1-A4.
  - Rerun the scenario and record residual risks if it still fails.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5. Design: Verification Strategy._

## A6 - Retry-After-Aware Admission Backoff

- [x] 10. Add a failing regression for server-directed retry-window backoff
  - Reproduce retryable control-plane pressure with a typed `retryAfterMs`
    larger than the local admission-backoff floor.
  - Assert the pressured node is not reprobed on the local floor.
  - _Requirements: 6.1, 6.3, 6.4. Design: D5.1, D5.2, Verification Strategy._

- [x] 11. Implement retry-after-aware admission blocking in `LoadRun`
  - Apply the greater of the local admission-backoff floor and typed
    `retryAfterMs` for retryable control-plane pressure.
  - Preserve node-client breaker ownership and rerun the targeted load
    generator verification.
  - _Requirements: 6.1, 6.2, 6.3. Design: D5.2, D5.3._

- [x] 12. Rerun `node-join-under-load` after the retry-window fix
  - Record whether failed operations and timeout-shaped errors fall further.
  - Update the residual-risk note if bootstrap/control-plane pressure still
    remains the dominant bottleneck.
  - _Requirements: 5.2, 5.4, 5.5, 6.1, 6.4. Design: D5.3, Verification Strategy._

## A7 - Dynamic Healthy-Node Concurrency Reuse

First attempt on 2026-03-22 regressed the real scenario by reintroducing
timeout-shaped failures under CDC/bootstrap pressure. Leave this slice pending
until a safer design is available.

- [ ] 13. Add a failing regression for static per-node slot stranding
  - Reproduce a load run where some nodes stay admission-blocked while healthy
    nodes remain artificially capped by the original per-node slot budget.
  - Assert dispatch throughput or backlog reflects the stranded-capacity bug.
  - _Requirements: 7.1, 7.4. Design: D6.1, D6.2, Verification Strategy._

- [ ] 14. Implement dynamic per-node slot reuse across dispatch-ready nodes
  - Derive the effective per-node slot cap from the current dispatch-ready node
    count while preserving the global `maxInFlight` limit.
  - Rerun the targeted load-generator verification.
  - _Requirements: 7.1, 7.2, 7.3. Design: D6.2, D6.3._

- [ ] 15. Rerun `node-join-under-load` after the slot-reuse fix
  - Record whether dispatch backlog falls materially once healthy nodes can
    absorb unused concurrency budget.
  - Update the residual-risk note if CDC/bootstrap pressure remains dominant.
  - _Requirements: 5.2, 5.4, 5.5, 7.1, 7.4. Design: D6.3, Verification Strategy._

## A8 - Failed-Run Telemetry Preservation

- [x] 16. Add failing regressions for failed-run partial-result preservation
  - Reproduce a scenario failure that throws after computing `loadMetrics`.
  - Assert the failed report entry still carries `loadMetrics`,
    `details.diagnostics`, and a derived bottleneck estimate.
  - _Requirements: 8.1, 8.2, 8.3, 8.4. Design: D7.1, D7.2, Verification Strategy._

- [x] 17. Implement failed-run partial-result propagation
  - Extend `node-join-under-load` failure errors with `diagnostics.partialResult`.
  - Merge the partial result into the failed runner/report path without adding
    a second report schema.
  - _Requirements: 8.1, 8.2, 8.3. Design: D7.2, D7.3._

## A9 - CDC / Control-Plane Diagnostics

- [x] 18. Add failing owner regressions for bounded structured diagnostics
  - Cover CDC write failure diagnostics, forward rejection diagnostics, raft
    propose failure diagnostics, and failed-run leak-attribution surfaces.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 11.1, 11.2. Design: D8.1, D8.2, Verification Strategy._

- [x] 19. Implement bounded structured diagnostics and leak-attribution counters
  - Add stable structured fields to the failing CDC/control-plane owners.
  - Surface bounded logging/replay retention counters through report and
    failure-bundle output.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 11.1, 11.2. Design: D8.2, D8.3._

## A10 - Focused Reproducer And First-Fix Selection

- [x] 20. Add a deterministic CDC/bootstrap/control-plane integration repro
  - Reproduce at least one current failure family through a non-Docker
    integration test.
  - Assert structured diagnostics instead of raw string-only output.
  - _Requirements: 10.1, 10.2, 10.3. Design: D9.1, D9.2, Verification Strategy._

- [x] 21. Rerun `node-join-under-load` after telemetry + diagnostics land
  - Use the failed report and structured owner logs to identify the first
    broken boundary from the branch-selection rules.
  - Record the chosen first-fix branch before editing production behavior.
  - _Requirements: 5.4, 8.3, 9.4, 10.2, 11.3. Design: D9.2, D9.3._

## A11 - First Production Fix

- [x] 22. Add a failing regression for the chosen first-fix branch
  - Pin the earliest broken boundary selected in task 21.
  - Keep the regression inside the chosen owner path or focused integration
    repro, whichever isolates the bug best.
  - _Requirements: 5.1, 9.4, 10.2, 11.3. Design: D9.2, D9.3, Verification Strategy._

- [x] 23. Implement exactly one first-fix branch and verify it
  - Apply the smallest owner-boundary fix selected by task 21.
  - Rerun the focused repro, touched owner tests, the full load-generator
    suite, and one authoritative `node-join-under-load` rerun.
  - _Requirements: 5.3, 5.4, 9.4, 10.2, 11.3. Design: D8.3, D9.2, D9.3._

## A12 - Distributed Read Participant Attribution

- [x] 24. Add failing regressions for bounded participant-failure attribution
  - Reproduce one distributed read fanout where one participant returns a
    retryable failure with bounded metadata.
  - Assert the fanout/coordinator diagnostics retain the first failed
    participant, failed table, per-participant duration, and backpressure
    state.
  - _Requirements: 12.1, 12.2, 12.3, 12.4. Design: D10.1, D10.2, Verification Strategy._

- [x] 25. Implement participant attribution through fanout and coordinator logs
  - Preserve bounded participant diagnostics in `ParallelQueryCoordinator` and
    distributed query aggregation.
  - Surface the bounded first-failure summary in replica-operation query
    failure logs.
  - _Requirements: 12.1, 12.2, 12.3. Design: D10.2, D10.3._

## A13 - Discovery Repair Cause Chain

- [x] 26. Add failing regressions for authoritative repair cause-chain classification
  - Reproduce at least one participant-failure-shaped repair failure and one
    backpressure-shaped repair failure.
  - Assert the warning payload includes a bounded `causeChain` and first
    failing participant summary.
  - _Requirements: 13.1, 13.2, 13.3, 13.4. Design: D11.1, D11.2, Verification Strategy._

- [x] 27. Implement authoritative read error preservation and repair causeChain
  - Preserve structured authoritative-read failure fields instead of
    rethrowing plain `Error(message)`.
  - Derive and log the bounded `causeChain` in `AdminServiceDiscovery`.
  - _Requirements: 13.1, 13.2, 13.3. Design: D11.2, D11.3._

## A14 - Retained-Object Diagnostics Surfacing

- [x] 28. Add failing regressions for retained-object diagnostics in failed scenario reports
  - Reproduce a failed `node-join-under-load` assertion where a control
    snapshot exposes retained-object diagnostics.
  - Assert the failure diagnostics preserve the bounded counters in
    `details.diagnostics.controlPlaneDiagnostics`.
  - _Requirements: 14.1, 14.2, 14.3, 14.4. Design: D12.1, D12.2, Verification Strategy._

- [x] 29. Implement retained-object diagnostics export through control snapshots and scenario failures
  - Add bounded logs-table and local CDC replay counters to control snapshots.
  - Copy the retained-object diagnostics into failed
    `node-join-under-load` scenario diagnostics without adding a new schema.
  - _Requirements: 11.1, 11.2, 14.1, 14.2, 14.3. Design: D12.2, D12.3._

## A15 - Focused Authoritative-Read Reproducer

- [x] 30. Add a deterministic authoritative-read participant-failure integration repro
  - Exercise the canonical gateway / discovery-repair read path while one
    participant fails or times out.
  - Assert participant attribution and derived `causeChain` fields.
  - _Requirements: 12.1, 13.1, 13.2, 15.1, 15.2, 15.3. Design: D10.2, D11.2, D13.2, Verification Strategy._

- [x] 31. Run focused verification for the new read-side diagnostics path
  - Run the touched unit tests plus the new integration repro.
  - Record residual risks if the full distributed scenario is not rerun in the
    same slice.
  - _Requirements: 5.1, 5.3, 5.5, 12.4, 13.4, 14.4, 15.1, 15.2. Design: D10.3, D11.3, D12.3, D13.3._

## A16 - Local Query-Transport Gate For Authoritative Reads

- [x] 32. Add a failing regression for authoritative reads when local query transport is not ready
  - Reproduce an authoritative control-plane read where the canonical local
    query/data-plane transport owner reports deferred readiness.
  - Assert the read fails closed before routed fanout and preserves typed
    `errorCode`, `deferRetry`, `retryAfterMs`, and the owner reason.
  - _Requirements: 16.1, 16.2, 16.3, 16.5. Design: D14.1, D14.2, Verification Strategy._

- [x] 33. Implement canonical local query-transport preflight in the authoritative read owner path
  - Expose one bounded query-transport readiness snapshot from the canonical
    transport owner.
  - Gate routed authoritative reads on that readiness snapshot and preserve
    typed defer metadata through the gateway/report path.
  - _Requirements: 16.1, 16.2, 16.3, 16.4. Design: D14.2, D14.3._

## A17 - Query-Transport Gating Surfacing

- [x] 34. Add failing regressions for readiness and diagnostics surfacing of local query-transport gating
  - Reproduce a self-node authoritative-read defer caused by local
    query-transport unavailability.
  - Assert canonical readiness or compact diagnostics preserve bounded local
    transport-gating state.
  - _Requirements: 17.1, 17.2, 17.4. Design: D15.1, D15.2, Verification Strategy._

- [x] 35. Implement local query-transport gating in readiness and diagnostics
  - Surface canonical local query-transport readiness through the existing
    readiness/diagnostics owners without adding a second schema.
  - Preserve bounded transport-gating context in failed authoritative-read
    diagnostics.
  - _Requirements: 17.1, 17.2, 17.3. Design: D15.2, D15.3._

## A18 - Replay-Heavy Metadata Isolation

- [x] 36. Add a failing regression for replay-heavy metadata starvation of critical control-plane work
  - Reproduce replay pressure on hot control-plane metadata tables while one
    critical read or write needs admission.
  - Assert replay-only churn is not allowed to consume the same bounded
    resources first.
  - _Requirements: 18.1, 18.3, 18.4. Design: D16.1, D16.2, Verification Strategy._

- [x] 37. Implement bounded replay isolation for critical control-plane metadata traffic
  - Route critical control-plane metadata work through a protected existing
    work-class or admission path.
  - Defer replay-only churn first and emit bounded diagnostics when isolation
    engages.
  - _Requirements: 18.1, 18.2, 18.3. Design: D16.2, D16.3._

- [x] 38. Run focused verification and one authoritative scenario rerun for the architectural slices
  - Run the touched owner tests and at least one `node-join-under-load` rerun
    after the read-gating and replay-isolation slices land.
  - Record whether the first broken boundary moved and whether replay churn or
    local query-transport gating remains dominant.
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 16.5, 17.4, 18.4. Design: D14.3, D15.3, D16.3, Verification Strategy._

## A19 - Self Query-Transport-Aware Routing Eligibility

- [x] 39. Add failing regressions for self query-transport-aware readiness and routing
  - Reproduce a self-node control-plane readiness snapshot where local
    query/data-plane transport is deferred while service rows remain active.
  - Assert canonical readiness marks the self node ineligible for routed
    control-plane reads and preserves a bounded local query-transport reason.
  - Assert `QueryExecutor` filters the self candidate through the existing
    readiness owner path without adding a local transport bypass.
  - _Requirements: 17.1, 17.2, 19.1, 19.2, 19.3, 19.4. Design: D15.2, D17.2, Verification Strategy._

- [x] 40. Implement self query-transport-aware canonical readiness gating
  - Fold self local query-transport readiness into the existing readiness
    dimensions used by routed control-plane reads.
  - Preserve a bounded local query-transport readiness reason in the canonical
    readiness snapshot so routing denials identify the self-ingress miss.
  - _Requirements: 19.1, 19.2, 19.3. Design: D17.2, D17.3._

- [x] 41. Run focused verification for the self query-transport readiness slice
  - Run the touched readiness and query-routing tests after the gating fix
    lands.
  - Record residual risk before the next distributed rerun if the scenario is
    not rerun in the same slice.
  - _Requirements: 5.1, 5.2, 5.3, 19.4. Design: D17.3, Verification Strategy._

## A20 - Canonical Control-Plane Participation Contract

- [x] 42. Add failing regressions for shared participation-decision consumption
  - Reproduce one routed partition-read decision and one
    `replica_operations` owner-read decision that should both defer from the
    same self local query-transport miss.
  - Assert both consumers use one canonical participation contract instead of
    rebuilding local eligibility separately.
  - _Requirements: 20.1, 20.2, 20.3, 20.6. Design: D18.1, D18.2, Verification Strategy._

- [x] 43. Implement the canonical control-plane participation contract and wire the first consumers
  - Expose one bounded participation-decision API from the canonical
    readiness owner.
  - Route `QueryExecutor` candidate selection and
    `ReplicaOperationRepository` owner-read admission through that API without
    adding a transport-only local bypass.
  - Preserve typed defer metadata and bounded reason codes when participation
    is deferred.
  - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5. Design: D18.2, D18.3._

- [x] 44. Run focused verification and one `node-join-under-load` rerun for the participation slice
  - Run the touched readiness, query, and rebalancer tests after the contract
    lands.
  - Rerun the scenario and record whether the earliest self-owner
    `replica_operations` miss disappears or whether remote participant
    instability remains first.
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 20.6. Design: D18.3, Verification Strategy._

## A21 - Lifecycle-Traffic-Gated READY Publication

- [x] 45. Add failing regressions for lifecycle-gated READY publication
  - Reproduce one join ready-signal path and one seed steady-state writer
    activation path where lifecycle traffic readiness is still pending.
  - Assert READY publication is deferred until the lifecycle owner reaches
    `TRAFFIC_READY`.
  - _Requirements: 21.1, 21.2, 21.4. Design: D19.1, D19.2, Verification Strategy._

- [x] 46. Implement lifecycle-traffic-gated READY publication and writer activation
  - Reuse the existing lifecycle owner snapshot to gate join ready-heartbeat
    publication and seed steady-state writer activation.
  - Preserve the initial bootstrap registration path so seed cache hydration
    can still observe the seed's ready lease before recurring writers start.
  - _Requirements: 21.1, 21.2, 21.3. Design: D19.2, D19.3._

- [x] 47. Run focused verification for the lifecycle publication slice
  - Run the touched join, bootstrap, and heartbeat suites after the lifecycle
    publication gate lands.
  - Record any residual risk before the next distributed rerun if broader
    bootstrap characterization coverage remains noisy.
  - _Requirements: 5.1, 5.2, 5.3, 21.4. Design: D19.3, Verification Strategy._

## A22 - Monotonic Retryable Join Resume

- [x] 48. Add a failing regression for retryable join resume over cleaned local state
  - Reproduce a persisted `MEMBERSHIP_WRITTEN` session whose local
    infrastructure was cleaned up and must rerun
    `JOIN_INFRASTRUCTURE_READY` through `shouldRerun`.
  - Assert the rerun succeeds without demoting the durable checkpoint and the
    session remains at its highest satisfied checkpoint.
  - _Requirements: 22.1, 22.2, 22.4. Design: D20.1, D20.2, Verification Strategy._

- [x] 49. Implement monotonic checkpoint preservation in retryable join resume
  - Keep `JoinCoordinator` rerun support for already satisfied steps, but do
    not issue a durable checkpoint write when the rerun step is below the
    session high-water mark.
  - Preserve strict regression rejection in `JoinSessionStore` for real
    non-monotonic writes.
  - _Requirements: 22.1, 22.2, 22.3. Design: D20.2, D20.3._

- [x] 50. Run focused join verification and one `node-join-under-load` rerun for the monotonic-resume slice
  - Run the touched join/session/coordinator tests after the monotonic-resume
    fix lands.
  - Rerun the scenario and record whether the joiners now progress past the
    synthetic checkpoint-regression boundary.
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 22.4. Design: D20.3, Verification Strategy._

## A23 - Metadata-Publication-Safe Join READY Signal

- [x] 51. Add failing regressions for metadata-publication-safe join READY publication
  - Reproduce a join ready-signal attempt where lifecycle readiness is
    `CONTROL_READY` with only `LEADER_METADATA_INCOMPLETE`.
  - Assert the join ready-signal opens without waiting for strict
    `TRAFFIC_READY`, while strict steady-state writer gating remains unchanged.
  - _Requirements: 23.1, 23.2, 23.4. Design: D21.1, D21.2, Verification Strategy._

- [x] 52. Implement metadata-publication readiness gating for the join ready-signal
  - Reuse the existing metadata-publication readiness contract for the one-time
    join ready heartbeat after local query-transport readiness succeeds.
  - Preserve strict `TRAFFIC_READY` gating for seed recurring control-plane
    writers.
  - _Requirements: 23.1, 23.2, 23.3. Design: D21.2, D21.3._

- [x] 53. Run focused verification and one `node-join-under-load` rerun for the join metadata-publication slice
  - Run the touched traffic-readiness, join ready-signal, and bootstrap ready
    signal tests after the metadata-publication gate lands.
  - Rerun the scenario and record whether joiners now progress past the
    `CONTROL_READY` / `LEADER_METADATA_INCOMPLETE` deadlock.
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 23.4. Design: D21.3, Verification Strategy._

## A24 - Seed Owner-Local Replica-Operations Read Path

- [x] 54. Extend the canonical participation contract to expose owner-local safe execution
  - Keep the existing `replica_operation_owner_read` participation decision,
    but let the readiness owner surface one bounded local execution allowance
    for the local authoritative owner path when self query transport is the
    immediate defer reason.
  - Preserve the same readiness owner and avoid a parallel transport/readiness
    subsystem.
  - _Requirements: 20.1, 20.3, 20.4, 20.5. Design: D18.2, D18.3._

- [x] 55. Implement seed/local `replica_operations` owner-read admission on the local-safe path
  - Reuse the new participation allowance in `ReplicaOperationRepository`
    so local seed/self owner reads do not fail closed before the existing
    owner-local execution path can run.
  - Preserve typed defer behavior for the broader participation contract and
    non-local/routed consumers.
  - _Requirements: 20.2, 20.3, 20.4, 20.5. Design: D18.2, D18.3._

- [x] 56. Verify the owner-local seed read slice with focused integration coverage
  - Run the readiness-service and repository regressions plus the focused
    seed owner-read integrations that distinguish self-routing mismatch,
    stale readiness, and reconciliation dependency.
  - Record whether local `replica_operations` owner reads now succeed while
    `/readyz` remains blocked on local query transport readiness.
  - _Requirements: 5.1, 5.2, 20.4, 20.6. Design: D18.2, D18.3, Verification Strategy._

## A25 - Gateway-Owned Owner-Local Authoritative Reads

- [x] 57. Add failing regressions for gateway-owned owner-local authoritative reads
  - Reproduce one `OWNER_LOCAL_NON_PROPAGATED` gateway read where local
    authoritative rows are available and assert the gateway uses the
    authoritative local-read owner instead of the routed query-engine path.
  - Reproduce one `OWNER_LOCAL_NON_PROPAGATED` gateway read where local
    authoritative rows are unavailable and assert the gateway returns a typed
    owner-read failure instead of silently routing through a second ingress.
  - _Requirements: 24.1, 24.2, 24.3, 24.6. Design: D22.1, D22.2, Verification Strategy._

- [x] 58. Implement gateway-owned owner-local authoritative read execution
  - Move the true owner-local execution choice into
    `ControlPlaneSystemTableGateway.executeOwnerLocalRead()` by reusing the
    existing authoritative local-read owner before any query-engine path.
  - Keep `ReplicaOperationRepository` on the same canonical participation and
    gateway intent path without adding a direct caller-local helper.
  - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5. Design: D22.2, D22.3._

- [x] 59. Run focused verification for the gateway-owned owner-local read slice
  - Run the touched gateway, repository, and focused owner-read integration
    tests after the gateway execution change lands.
  - Record whether the gateway now truly owns owner-local authoritative
    execution and whether the remaining seed failure, if any, is now reduced
    to local authoritative availability rather than execution-path mismatch.
  - _Requirements: 5.1, 5.2, 24.6. Design: D22.3, Verification Strategy._

## A26 - Canonical Failed-Operation Accounting

- [x] 60. Add failing regressions for canonical failed-operation accounting in `node-join-under-load`
  - Reproduce load metrics where `failed` and `errors` carry overlapping
    operation failures and assert scenario failure messages do not double-count.
  - Reproduce metrics with only `failed` populated and only `errors` populated,
    and assert deterministic fallback behavior.
  - _Requirements: 5.1, 8.2, 25.1, 25.2. Design: D23.1, Verification Strategy._

- [x] 61. Implement canonical failure counting and preserve diagnostic detail
  - Replace assertion-path double-counting with one canonical operation-failure
    measure in `node-join-under-load` while preserving both raw counters in
    diagnostics output.
  - Keep existing failure-bundle/report schemas stable.
  - _Requirements: 8.1, 8.3, 25.1, 25.3. Design: D23.2, D23.3._

- [x] 62. Run focused verification for the failure-counting slice
  - Run touched scenario-unit tests and report/failure-bundle tests.
  - Record before/after assertion-message values on one controlled fixture run.
  - _Requirements: 5.1, 5.3, 25.4. Design: D23.3, Verification Strategy._

## A27 - Root-Cause And Readiness Attribution Completeness

- [x] 63. Add failing regressions for non-null root-cause and readiness attribution in failed bundles
  - Reproduce a failed run with waiting-active readiness reasons in playback
    events and assert bundle `summary.rootCauseClass` and
    `summary.dominantReason` are populated.
  - Assert `readiness.nodeReasonsByNodeId` surfaces bounded owner reasons
    instead of null when stage diagnostics contain them.
  - _Requirements: 9.4, 17.2, 26.1, 26.2. Design: D24.1, D24.2, Verification Strategy._

- [x] 64. Implement root-cause derivation and readiness reason extraction in failure-bundle generation
  - Derive root-cause class and dominant reason from first-fault diagnostics,
    wait reasons, and bounded control-plane signals.
  - Extract canonical readiness reasons from cluster-stage diagnostics into the
    scenario bundle with bounded size limits.
  - _Requirements: 9.1, 9.4, 17.1, 26.1, 26.3. Design: D24.2, D24.3._

- [x] 65. Run focused verification and one failed-scenario rerun for attribution quality
  - Run touched failure-bundle/report tests plus one authoritative
    `node-join-under-load` rerun.
  - Record whether bundle-only triage is sufficient without opening raw logs.
  - _Requirements: 5.1, 5.4, 26.4. Design: D24.3, Verification Strategy._

## A28 - First-Fault Timeline Correlation

- [x] 66. Add failing regressions for first-fault timeline telemetry
  - Reproduce a run where attempt errors, queue-pressure growth, and hard load
    failures happen at different times.
  - Assert report/bundle diagnostics expose first timestamps and ordered deltas
    from load start.
  - _Requirements: 8.3, 11.3, 27.1, 27.2. Design: D25.1, D25.2, Verification Strategy._

- [x] 67. Implement first-fault timeline capture in report and failure bundle output
  - Capture first-seen markers for attempt-error onset, queue-pressure breach,
    and hard-failure onset from playback events.
  - Emit bounded causal-order summaries in machine-readable diagnostics fields.
  - _Requirements: 8.2, 8.3, 27.1, 27.3. Design: D25.2, D25.3._

- [x] 68. Run focused verification for first-fault correlation accuracy
  - Run touched diagnostics tests with deterministic event fixtures.
  - Validate timestamp ordering and delta math on at least one integration run.
  - _Requirements: 5.1, 5.3, 27.4. Design: D25.3, Verification Strategy._

## A29 - Control-Plane Protected Capacity Under Join Load

- [x] 69. Add a failing integration repro for control-plane starvation during join-under-load
  - Reproduce load pressure where critical control-plane reads/writes are
    starved and degrade into participant-failure/timeouts.
  - Assert bounded critical operations miss latency/availability SLO without
    protected capacity.
  - _Requirements: 18.1, 18.3, 28.1, 28.2. Design: D26.1, D26.2, Verification Strategy._

- [x] 70. Implement protected admission/work-class capacity for critical control-plane paths
  - Reserve bounded execution/admission capacity for critical control-plane
    metadata and readiness operations during load.
  - Preserve existing backpressure behavior for non-critical replay/churn paths.
  - _Requirements: 18.2, 20.4, 28.1, 28.3. Design: D26.2, D26.3._

- [x] 71. Run focused verification and one authoritative rerun for the protected-capacity slice
  - Run touched owner tests and the starvation repro.
  - Rerun `node-join-under-load` and record whether participant-failure storms
    and timeout-shaped errors materially fall.
  - _Requirements: 5.1, 5.4, 28.4. Design: D26.3, Verification Strategy._

## A30 - Readiness Stabilization Before Full Load Pressure

- [x] 72. Add failing regressions for unstable readiness-to-load transition
  - Reproduce delayed local query-transport readiness that clears just before
    cluster active.
  - Assert load readiness remains gated until a bounded stabilization window
    passes with no regressions.
  - _Requirements: 16.1, 17.1, 29.1, 29.2. Design: D27.1, D27.2, Verification Strategy._

- [x] 73. Implement readiness stabilization gating for join/load start conditions
  - Gate full-load admission on stabilized readiness windows after transport
    readiness clears.
  - Preserve existing bootstrap and join progression semantics.
  - _Requirements: 16.2, 17.2, 29.1, 29.3. Design: D27.2, D27.3._

- [x] 74. Run focused verification and one scenario rerun for stabilization gating
  - Run touched readiness/startup/load-admission suites.
  - Rerun `node-join-under-load` and record whether early-run instability no
    longer precedes load collapse.
  - _Requirements: 5.1, 5.4, 29.4. Design: D27.3, Verification Strategy._

## A31 - Adaptive Dispatch Guardrails During Join Pressure

- [x] 75. Add failing regressions for runaway dispatch backlog under join-time pressure
  - Reproduce admission-pressure escalation where queue delay and undispatched
    ratio run away while control-plane stress is active.
  - Assert no adaptive reduction in effective dispatch pressure occurs today.
  - _Requirements: 7.1, 18.3, 30.1, 30.2. Design: D28.1, D28.2, Verification Strategy._

- [x] 76. Implement bounded adaptive dispatch guardrails tied to control-plane pressure signals
  - Reduce effective dispatch pressure when bounded control-plane pressure
    thresholds are exceeded; restore capacity when signals recover.
  - Keep failure visibility explicit and avoid masking hard correctness errors.
  - _Requirements: 7.2, 18.2, 30.1, 30.3. Design: D28.2, D28.3._

- [x] 77. Run focused verification and one authoritative rerun for adaptive guardrails
  - Run touched load-generator and scenario tests.
  - Rerun `node-join-under-load` and record impacts on queue-delay p95,
    undispatched ratio, and timeout waits.
  - _Requirements: 5.1, 5.4, 30.4. Design: D28.3, Verification Strategy._

## A32 - Reliability Gate And Multi-Run Validation

- [x] 78. Add repeat-run validation harness coverage for `node-join-under-load`
  - Add a repeatable validation driver that runs the scenario across multiple
    seeds/runs and captures pass/fail plus key degradation metrics.
  - Assert output includes distribution summaries, not only single-run values.
  - _Requirements: 5.2, 5.5, 31.1, 31.2. Design: D29.1, D29.2, Verification Strategy._

- [x] 79. Execute the validation matrix after A26-A31 and record outcome distributions
  - Run the agreed matrix and attach aggregate metrics for failed ops,
    attemptErrors, queue-delay p95, undispatched ratio, and timeout waits.
  - Record whether failures are stable/narrowed or still multi-modal.
  - _Requirements: 5.3, 5.4, 31.1, 31.3. Design: D29.2, D29.3._

- [x] 80. Define ship/no-ship gate and residual-risk closure note for this spec
  - Codify pass criteria for scenario reliability and diagnostics completeness.
  - Document residual risks and next branch-selection rules if gate is not met.
  - _Requirements: 5.4, 5.5, 31.4. Design: D29.3, Verification Strategy._
