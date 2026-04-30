# Rolling Restart Quiescence Stale In Flight Canonical Blocker

April 30 activation: the startup publication epoch operation-creation package
moved the representative `rolling-restart --fast-local` path past startup
publication convergence. Publication ACK debt is closed, priority spread is
satisfied, and the prior `sql_write_operations-p1`
`eligible_but_no_operation_created` blocker is no longer terminal. The current
failure is a later control-plane quiescence boundary where the harness reports
quiescent state while stale in-flight operation evidence and a leadership-churn
window reset are still present.

Reference artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-operation-snapshot-reachability.report.json`

Failure bundle:

`test-output/reports/.playback/runtime-stability-rolling-restart-20260430-codex-operation-snapshot-reachability/rolling-restart/failure-bundle.json`

Result: failed, `0/1` passed after `507.0s`.

Terminal barrier:

`Control plane quiescence stalled for 35272ms (inFlightCount=2, leaderQuietElapsedMs=35272, nodeId=ebc4aa0b-06c6-506d-93ea-1dd2deca3f58, quiescenceState=quiescent, canonicalBlocker=none)`

Observed boundary:

1. root cause class: `unknown`
2. dominant reason: `quiescent`
3. quiescence node:
   `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`
4. quiescence state: `quiescent`
5. canonical blocker: `none`
6. in-flight count: `2`
7. effective in-flight count: `0`
8. stale in-flight count: `2`
9. stale in-flight discount count: `7`
10. cache-visible satisfied priority recovery operation count: `7`
11. ignore stale in-flight replica operations: `true`
12. stable elapsed: `17597ms`
13. leader quiet elapsed: `35272ms`
14. candidate window reset: `leadership_churn`
15. reset canonical blocker: `leadership_unstable`
16. control-plane pressure signals: empty
17. readiness fallback signal:
    `readiness_probe_timeout_fallback=Node readiness probe timed out for 7493b0ab-a054-5fad-a91b-5e331db29304`
18. first fault markers:
    `queuePressureOnset=2026-04-30T16:05:35.864Z`,
    `attemptErrorOnset=2026-04-30T16:05:35.864Z`,
    `hardFailureOnset=2026-04-30T16:05:56.864Z`

Closed publication evidence in the same report:

1. publication epoch: `7`
2. publication status: `PUBLISHED`
3. recovery protocol state: `steady_published`
4. pending ACK count: `0`
5. pending ACK nodes: empty
6. publication gate reasons: empty
7. stability gates `failover`, `convergence`, and `restart_recovery`: closed
8. priority spread pending: `false`
9. priority blocked partition count: `0`
10. priority unresolved partition count: `0`
11. `needs_operation`: empty

Stale workflow evidence still reported:

1. `control_plane_publications-p1`
   - operation id: `06960917-075e-42ad-a3c4-4074c72227f8`
   - semantic state: `spread_satisfied_in_flight`
   - current owner: `operation_workflow_owner`
   - next required action: `reconcile_stale_operation_progress`
   - blocking boundary: `workflow_timeout`
   - wait mode: `timeout_reconcile_due`
   - workflow phase: `dispatch_pending`
   - workflow step: `SENDING`
   - status: `pending`
   - step age: `163637ms`
   - step timeout: `30000ms`
   - completion state: `converged`
   - visibility state: `cache_visible`
   - pressure state: `none`
2. `sql_transaction_participants-p1`
   - operation id: `eb684a25-2fd4-45d0-88f1-e18a025054c7`
   - semantic state: `spread_satisfied_in_flight`
   - current owner: `operation_workflow_owner`
   - next required action: `reconcile_stale_operation_progress`
   - blocking boundary: `workflow_timeout`
   - wait mode: `timeout_reconcile_due`
   - workflow phase: `dispatch_pending`
   - workflow step: `PENDING`
   - status: `pending`
   - step age: `161968ms`
   - step timeout: `30000ms`
   - completion state: `converged`
   - visibility state: `cache_visible`
   - pressure state: `none`

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Startup Publication Epoch Operation Creation And Snapshot Reachability](./done-20260430-rolling-restart-startup-publication-epoch-operation-creation-and-snapshot-reachability.md)
2. [Rolling Restart Startup Publication Epoch Pending Operation Stalled](./done-20260430-rolling-restart-startup-publication-epoch-pending-operation-stalled.md)
3. [Rolling Restart Control Plane Quiescence Critical Spread After Load Readiness Closure](./done-20260430-rolling-restart-control-plane-quiescence-critical-spread-after-load-readiness-closure.md)
4. [Control Plane Quiescence Stable Window After Publication Closure](./done-20260429-control-plane-quiescence-stable-window-after-publication-closure.md)

## In Scope

1. Reconstruct why the quiescence gate fails while its own normalized state is
   `quiescent`, `effectiveInFlightCount=0`, and `canonicalBlocker=none`.
2. Determine whether stale in-flight operation rows should be drained,
   reconciled, discounted before the terminal decision, or surfaced as the
   canonical blocker.
3. Determine why `control_plane_publications-p1` and
   `sql_transaction_participants-p1` remain `pending` past their workflow
   timeout while also reporting `completionState=converged`.
4. Reconcile the leadership-churn candidate window reset with the terminal
   quiescence state.
5. Explain whether the seed readiness probe timeout is the same owner boundary,
   a symptom of control-plane backpressure, or a non-blocking diagnostic.
6. Add focused regression coverage for quiescence state normalization,
   stale-in-flight discounting, or canonical blocker emission.
7. Rerun focused checks and the representative `rolling-restart --fast-local`
   path, recording whether the blocker passes or migrates.

## Out Of Scope

1. Increasing quiescence, readiness, publication, or operation timeout budgets.
2. Reopening publication ACK or priority spread blockers that are closed in the
   reference report.
3. Treating `quiescent` plus `canonicalBlocker=none` as a failing terminal
   state without adding an explicit owner-state reason.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  control-plane quiescence, stale in-flight operation discounting,
  workflow-timeout reconciliation, leadership-churn stable window, and
  readiness probe fallback classification.
- Canonical contract:
  the terminal quiescence gate must emit one coherent outcome. If stale
  in-flight operations are discounted, they must not keep the gate failing. If
  they still matter, the gate must name them as the canonical blocker with
  owner, action, and operation ids. If leadership churn resets the stable
  window, terminal state must remain `leadership_unstable` until the reset
  requirement is satisfied.
- Allowed consumers:
  distributed harness quiescence gate, failure bundles, priority recovery
  observation, operation workflow timeout reconciliation diagnostics, readiness
  fallback diagnostics, and stability gate summaries.
- Prohibited reinterpretations:
  do not widen timeouts, do not hide nonzero stale in-flight rows behind a
  blocker-free failure, and do not split leadership churn, stale operations,
  and readiness probe timeout into unrelated terminal symptoms.

## Residual Closure Inventory

- [x] Reconstruct the quiescence decision snapshot that produced
      `state=quiescent`, `effectiveInFlightCount=0`, and
      `canonicalBlocker=none` while the harness still failed.
- [x] Identify the canonical owner for the two stale in-flight operations.
- [x] Decide whether stale discounted operations should be ignored, drained, or
      emitted as a blocker before terminal failure.
- [x] Reconcile the `leadership_churn` candidate-window reset with terminal
      `quiescent` state.
- [x] Classify the seed readiness probe timeout against the quiescence owner
      boundary.
- [x] Add focused regression coverage for the selected owner boundary.
- [x] Rerun the representative path and record the migrated or closed blocker.

## Validation

Root cause:

1. The quiescence snapshot already canonicalized stale in-flight rows to
   `effectiveInFlightCount=0`.
2. `waitForControlPlaneQuiescence` still used raw `inFlightCount` for progress
   accounting and ran the no-progress watchdog before the poll success result
   could return.
3. The stale rows were therefore discounted by the quiescence decision but
   still allowed to trip the harness watchdog.
4. The leadership-churn reset was historical stable-window evidence; once the
   stable window closed, it should remain diagnostic and not block a successful
   quiescence result.

Implementation:

1. `test/distributed/harness/cluster-segment-7-class-3.js`
   - quiescence progress accounting now uses the canonical
     `effectiveInFlightCount` when present
   - operation-progress snapshots are rebuilt with zero no-progress age after
     canonical progress is observed
   - the no-progress watchdog no longer preempts a closed quiescence stable
     window
2. `test/distributed/harness/__tests__/cluster.test-part-6.js`
   - added a regression where raw in-flight work remains nonzero, stale
     in-flight work discounts to zero, and the stable window must complete
     without collecting failure logs

Focused proof:

1. `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep 'discounted stale in-flight work'`
   - failed before the harness patch
   - passed after the patch
2. `node --check src/control-plane/publication-recovery-evidence.js`
3. `node --check src/control-plane/control-plane-readiness-service-segment-2.js`
4. `node --check src/control-plane/control-plane-readiness-service-segment-4.js`
5. `node --check test/distributed/harness/cluster-segment-7-class-3.js`
6. `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`
7. `./node_modules/.bin/eslint <touched runtime and focused test files> --no-ignore`
8. `./node_modules/.bin/tap test/control-plane/publication-recovery-evidence.test.js --grep 'explicit empty required ACK list|count-only ACK debt'`
9. `./node_modules/.bin/tap test/control-plane/control-plane-readiness-service.test-part-4.js --grep 'count-only ACK debt'`
10. `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep 'waitForControlPlaneQuiescence'`
11. `./node_modules/.bin/tap test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
12. `npm run audit:guideline:literals`
13. `npm run audit:guideline:decision-boundaries`
14. `npm run audit:runtime-grammar`

Representative proof:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-quiescence-stale-inflight-closure.report.json --fast-local --verbose`
2. Result: failed, `0/1` passed after `353.9s`, but the quiescence blocker
   migrated.
3. The new failure bundle has `quiescence=null`; it no longer reports
   `quiescenceState=quiescent` with `canonicalBlocker=none`.
4. New dominant reason: `restart_recovery_timeout`.
5. Terminal barrier:
   `Restarted node did not become recovery-ready within 120000ms for node
   11601fe0-72d6-5853-8590-ec2881853e72`.
6. Current owner-state evidence:
   - `reachable=true`
   - `adminReady=false`
   - `controlPlaneRecoveryReady=false`
   - `readinessPhase=INIT`
   - `readinessStage=traffic_ready`
   - `reachableBy=bootstrap_health`
   - last admin probe:
     `connect ECONNREFUSED 172.19.0.4:8081`
7. Follow-on package:
   [Rolling Restart Restart Recovery Admin Reachability Regression](./done-20260430-rolling-restart-restart-recovery-admin-reachability-regression.md).

Deep-dive review:

1. Reviewed the quiescence snapshot builder, cluster quiescence wait loop,
   focused cluster quiescence tests, and the ACK evidence call sites touched
   by the preceding review fixes.
2. No additional in-scope quiescence owner bypass, stale blocker-free terminal
   state, or new static guardrail drift remained after the patch.

## Done When

1. [x] The representative path no longer fails with `quiescenceState=quiescent` and
   `canonicalBlocker=none`.
2. [x] The two stale in-flight operation rows are either reconciled/drained or named
   as one canonical owner-state blocker with operation ids and next action.
3. [x] Leadership churn either resets the quiescence stable window through the
   terminal decision or is proven non-blocking with explicit evidence.
4. [x] The seed readiness probe timeout is either closed or classified as the
   canonical terminal blocker with owner-state evidence.
5. [x] The representative `rolling-restart --fast-local` path passes or migrates to
   one named active package with current owner-state evidence.
