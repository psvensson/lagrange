# Control Plane Quiescence Stable Window After Publication Closure

April 29 activation: the frozen-publication visibility slice moved the current
`rolling-restart --fast-local` representative path past publication
convergence and back to the quiescence owner boundary:

1. `test-output/reports/runtime-stability-rolling-restart-20260429-codex-frozen-publication-visibility.report.json`
2. result: failed, `0/1` passed after `606.8s`
3. terminal barrier: `Control plane did not quiesce within 120000ms`
4. failure class: `topology_unstable`
5. dominant reason: `quiescence_candidate`
6. failover, convergence, and restart-recovery stability gates are closed
7. publication epoch `4` is `PUBLISHED`
8. pending ACK count is `0`
9. blocked publication node count is `0`
10. priority recovery blocked and unresolved counts are `0`
11. the final quiescence snapshot is `quiescence_candidate` with
    `canonicalBlocker=null`, `reasonCodes=[]`, and `controlPlanePressureSignals=[]`
12. raw `inFlightCount=1`, but `effectiveInFlightCount=0`,
    `staleInFlightCount=1`, and `staleInFlightDiscountCount=1`
13. `stableElapsedMs=0` while `leaderQuietElapsedMs=15997`
14. critical system distribution is satisfied at `5/3` for
    `replica_operations`, `sql_transactions`,
    `sql_transaction_participants`, and `sql_write_operations`

The active blocker is therefore not publication recovery or operation-transition
visibility. It is the quiescence stable-window contract after the owner snapshot
has discounted stale operation evidence and emitted no current blocker.

April 29 closure: the quiescence owner now carries canonical
`candidateWindowReset` evidence from the last non-ready sample into later
`quiescence_candidate` snapshots, timeout diagnostics, and failure bundles. The
review repair also fixed cache-visible satisfied priority-recovery discounts so
the quiescence snapshot consumes the nested `controlPlaneDiagnostics` payload,
not the whole control snapshot wrapper.

The representative rerun no longer failed at the reasonless quiescence
candidate boundary:

1. `test-output/reports/runtime-stability-rolling-restart-20260429-codex-quiescence-stable-window.report.json`
2. result: failed, `0/1` passed after `380.1s`
3. terminal barrier: `Convergence timeout after 120000ms`
4. failure class: `topology_unstable`
5. dominant reason: `convergence_timeout`
6. failover, convergence, and restart-recovery stability gates are closed
7. publication epoch `11` is `PUBLISHED`
8. pending ACK count is `0`
9. blocked publication node count is `0`
10. priority recovery blocked and unresolved counts are `0`
11. post-rebalance closure remains open only on
    `cdc_projection_visible_open`
12. the hard reason is `missing_partition_leaders`
13. operation drain, membership trim, publication visibility, and
    no-over-target are represented as soft closures

The next owner boundary is therefore represented by
[Rolling Restart CDC Projection Visible Closure](./done-20260429-rolling-restart-cdc-projection-visible-closure.md).

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Control plane quiescence owner snapshot](./done-20260426-control-plane-quiescence-owner-snapshot.md)
2. [Rolling restart operation transition pressure and over-target trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## In Scope

1. Reconstruct the final quiescence samples and identify why the candidate
   stable window resets to `0ms` with no canonical blocker.
2. Preserve the current timeout budget.
3. Keep stale operation evidence as diagnostics unless it is still an effective
   quiescence blocker.
4. Add explicit stable-window evidence when a candidate sample is not allowed to
   accumulate elapsed time.
5. Make the failure bundle expose the candidate-window reset reason instead of
   relying on the legacy instability summary.
6. Rerun `rolling-restart --fast-local` and record the next named owner
   boundary.

## Out Of Scope

1. Increasing quiescence, readiness, or convergence timeout budgets.
2. Reopening publication convergence when the publication gates are closed.
3. Treating effective in-flight operation evidence as quiescent.
4. Hiding direct control-plane pressure as a successful stable window.
5. Broad matrix execution before the 5-node representative path stabilizes.
6. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  control-plane quiescence stable-window resolver.
- Canonical contract:
  a `quiescence_candidate` snapshot with no canonical blocker must either
  accumulate stable elapsed time or emit one explicit reset reason.
- Allowed consumers:
  `waitForControlPlaneQuiescence`, rolling-restart diagnostics, failure bundles,
  and sprint triage.
- Prohibited reinterpretations:
  rebuilding candidate stability from the instability summary after the owner
  snapshot has emitted canonical state, blocker, operation, pressure, and spread
  evidence.

## Residual Closure Inventory

- [x] Reconstruct the candidate sample sequence from the latest report and
      playback artifacts.
- [x] Identify whether candidate elapsed time resets on stale operation churn,
      critical-spread signature churn, leader signature churn, pressure evidence,
      or missing stable-window state.
- [x] Add one canonical candidate-window reset reason when elapsed time cannot
      advance.
- [x] Preserve stale operation counts in diagnostics without making them
      effective operation blockers.
- [x] Extend focused quiescence snapshot and failure-bundle coverage for the
      reasonless candidate timeout.
- [x] Rerun `rolling-restart --fast-local` and record whether the blocker passes
      or migrates to a new named owner boundary.

## Validation

Executed on April 29, 2026:

1. `node --check test/distributed/harness/cluster-segment-7-class-5.js`
2. `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`
3. `node --check test/distributed/harness/control-plane-quiescence-snapshot.js`
4. `node --check test/distributed/harness/cluster-segment-7-class-3.js`
5. `node --check test/distributed/harness/failure-bundle-segment-5.js`
6. `node --check test/distributed/harness/failure-bundle-segment-6.js`
7. `node --check test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
8. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
9. Result: passed.
10. `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js`
11. Result: passed, `11/11`.
12. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
13. Result: passed, `53/53`.
14. `npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js`
15. Result: passed, `27/27`.
16. `npm run audit:guideline:literals`
17. Result: passed, `0` new literal-guideline violations.
18. `npm run audit:guideline:decision-boundaries`
19. Result: passed, `0` violations.
20. `npm run audit:runtime-grammar`
21. Result: passed, including state-machine pressure preflight.
22. `git diff --check`
23. Result: passed.
24. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260429-codex-quiescence-stable-window.report.json --verbose`
25. Result: failed at the next named owner boundary:
    `cdc_projection_visible_open` / `missing_partition_leaders`.

## Done When

1. The terminal quiescence failure names one stable-window reset reason or
   passes the stable window.
2. Closed publication and restart-recovery gates remain closed in the
   representative report.
3. The next failure, if any, is represented by one active work package.
