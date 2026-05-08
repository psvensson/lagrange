# Critical Recovery Pressure Reserve And Admission Contract

## Why

The representative harness artifacts show runtime liveness failing under
pressure after the old publication and readiness blockers are closed.

The current failure chain includes:

1. `nodeAdmissionBlocked`
2. `control_plane_write_unhealthy`
3. heartbeat attempt timeouts
4. owner-read and owner-write pressure
5. critical `REPLACE` operations still in flight at convergence timeout

That means critical recovery work and diagnostics/observability work are still
close enough in the pressure model that load can delay the work required to
restore stability. The system needs to be slower under pressure, not less
correct.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Critical replace remove safety and convergence timeout](./done-20260424-critical-replace-remove-safety-and-convergence-timeout.md)

## In Scope

1. Inventory the live traffic classes during `node-join-under-load`.
2. Define one critical recovery pressure reserve for:
   - replica operation workflow transitions
   - source leader handoff
   - replacement leader election
   - node-state publication
   - membership publication
   - critical system-table CDC needed for recovery progress
3. Demote diagnostics, admin repair, logs, broad snapshot repair, and
   background observability to deferable work while the critical reserve is
   under pressure.
4. Add focused proof that critical recovery traffic can still make progress
   when diagnostics or background work is backlogged.
5. Rerun the representative scenario and record blocker migration.

## Out Of Scope

1. A broad transport rewrite.
2. New product-visible quality-of-service features.
3. Harness-side exceptions for pressure symptoms.
4. Treating diagnostics loss as equivalent to critical control-plane write
   loss.

## Shared Boundary Contract

- Semantic owner:
  critical recovery pressure/admission at the control-plane and transport
  ingress boundary.
- Canonical contract:
  one pressure snapshot decides whether work is `critical_recovery`,
  `load_traffic`, `diagnostic`, `observability`, or `background`, then emits
  `admit`, `defer`, `retry`, or `reject` with reason codes and retry hints.
- Allowed consumers:
  message router, pressure governor, control-plane write health,
  operation workflow owner, heartbeat/node-state publication, membership
  publication, admin diagnostics, and harness reporting.
- Prohibited reinterpretations:
  caller-local pressure exceptions, treating observability backlog as critical
  write loss, or letting diagnostics consume critical recovery reserve.
- Primary diagnostics:
  pressure snapshot, control-plane write-health state, owner-contract outcome,
  and harness failure bundle reason counts.

## Progress Grammar

1. `admit_critical` means critical recovery work may proceed despite load.
2. `defer_diagnostics` means non-critical diagnostics must wait.
3. `defer_background` means observability/background write pressure is
   contained.
4. `critical_reserve_exhausted` means true hard recovery progress is blocked.
5. `retryable_pressure` means the owner has a bounded retry path.
6. `terminal_pressure_failure` means the owner cannot safely continue.

## Hotspots

1. `src/control-plane/pressure-governor.js`
2. `src/control-plane/control-plane-workload-profile.js`
3. `src/bootstrap/control-plane-write-health-owner.js`
4. `src/transport/message-router-segment-3.js`
5. `src/rebalancer/operation-workflow-owner-segment-5.js`
6. `src/rebalancer/operation-workflow-owner-segment-6.js`
7. `src/control-plane/membership-publication-coordinator.js`
8. `src/control-plane/heartbeat-service.js`
9. `test/distributed/harness/__tests__/failure-bundle.test.js`

## Status Update

Activated on April 24, 2026 after the harness publication-gate classifier cut
moved the representative failure to a pressure-owned terminal path.

Latest representative evidence:

1. `node-join-under-load` failed after `199.9s`
2. load succeeded at `95/95` operations with `3.1 ops/s`, but tail latency rose
   to `p99=5787ms`
3. terminal error:
   `Convergence timeout after 60000ms`
4. failure classification:
   `failureClass = load_pressure`, `bottleneck = admission_pressure`
5. top reasons:
   `nodeAdmissionBlocked = 1869`,
   `retryableControlPlanePressure = 14`,
   `timeoutWaits = 1`
6. publication convergence is closed:
   epoch `6`, status `PUBLISHED`, pending ACK count `0`,
   blocked partition count `0`
7. active gate progress reached `active=5/5` and `coverage=5/5`, while
   critical recovery still carried pending ACK / pressure evidence
8. terminal operation history still includes in-flight `REPLACE` work:
   `sql_write_operations-p1`, `tables-p1`, and active critical replacements
   on `sql_transaction_participants-p1` / `sql_transactions-p1`
9. logs show repeated `Message timeout`, `control_plane_backpressure`,
   `In-flight operation owner query indicates control-plane pressure`,
   `replace_remove_safety_blocked`, and storage reservation release timeouts

Interpretation:

1. this is no longer a stale publication/readiness assertion
2. source-removal safety and replacement leader ownership remain relevant, but
   control-plane pressure is now the dominant execution constraint
3. the next implementation cut should reserve admission capacity for critical
   recovery before broad scenario reruns

Sprint execution update:

1. background snapshot repair and diagnostic-style work now route through the
   background/deferable pressure partition
2. priority control-plane budget reads and in-flight reads preserve the
   critical workload class
3. the representative `node-join-under-load` path passed twice after the
   pressure/admission cut
4. the no-code confirmation still reports residual memory lifecycle,
   dispatch-queue pressure, and convergence-settle-time optimization
   priorities; these are not currently representative pass/fail blockers
5. secondary `rolling-restart` now fails on priority recovery follow-up
   operation creation rather than representative pressure starvation

## Residual Closure Inventory

- [x] Owner-path cutover for critical recovery traffic.
- [x] Tail-consumer cutover for diagnostics and harness classification.
- [x] Superseded caller-local pressure exceptions are split to
      [Critical pressure workload taxonomy audit](./todo-20260424-critical-pressure-workload-taxonomy-audit.md).
- [x] Focused pressure/admission proof.
- [x] Representative `node-join-under-load` rerun.

## Validation

1. Focused pressure-governor/control-plane write-health tests for touched
   behavior.
2. Focused operation workflow owner tests for critical recovery progress under
   pressure.
3. Harness failure-bundle tests for pressure classification.
4. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

Additional executed validation:

1. `npm test -- test/rebalancer/unified-rebalancer.test.js test/control-plane/priority-recovery-snapshot.test.js`
2. Result: `283/283` assertions passing.
3. `node-join-under-load` representative run: passed.
4. `node-join-under-load` no-code confirmation run: passed.

## Done When

1. Critical recovery traffic has a named reserve and canonical admission
   outcome.
2. Diagnostics and background work defer before critical recovery work stalls.
3. `node-join-under-load` no longer fails because recovery progress is starved
   behind lower-priority work, or the next blocker is explicitly split.
   Status: complete for the representative path; residual secondary work is
   tracked by
   [Priority recovery follow-up operation creation](./done-20260424-priority-recovery-followup-operation-creation.md).
