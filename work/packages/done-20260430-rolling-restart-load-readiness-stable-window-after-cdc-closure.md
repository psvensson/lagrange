# Rolling Restart Load Readiness Stable Window After CDC Closure

April 30 activation: the CDC projection visibility slice moved the
representative `rolling-restart --fast-local` path off
`cdc_projection_visible_open`.

Fresh artifact:

`test-output/reports/runtime-stability-rolling-restart-20260429-codex-cdc-projection-visible.report.json`

Result: failed, `0/1` passed after `389.0s`.

The terminal barrier is now:

`Cluster load readiness did not stabilize within 300000ms`

Observed boundary:

1. root cause class: `startup`
2. dominant reason: `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
3. readiness stable-window blocker: `READINESS_STABLE_WINDOW_PENDING`
4. publication convergence: `ready`
5. priority spread: `ready`
6. snapshot coverage: `5/5`
7. all five node diagnostics reported `active`
8. instability summary includes `state:degraded:234`, seed readiness probe
   timeout fallback, and `state:warming:13`

The active blocker is no longer CDC projection visibility or post-rebalance
closure. It is load readiness stable-window classification after the canonical
publication and priority-spread gates are ready.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart CDC Projection Visible Closure](./done-20260429-rolling-restart-cdc-projection-visible-closure.md)

## In Scope

1. Reconstruct load readiness stable-window samples from the fresh report and
   playback artifacts.
2. Identify why nodes reported `active` while the stable window remained
   `degraded` or `warming`.
3. Determine whether the owner is readiness probe timeout fallback, priority
   control-plane recovery state, stable-window sampling, or diagnostic
   classification.
4. Preserve the closed CDC projection, publication convergence, and priority
   spread boundaries.
5. Add focused coverage for the stable-window owner boundary.
6. Rerun `rolling-restart --fast-local` and record whether the blocker passes
   or migrates.

## Out Of Scope

1. Increasing readiness or convergence timeout budgets.
2. Reopening CDC projection visibility while owner evidence remains closed.
3. Reopening publication ACK or priority-spread gates while they are ready.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  load readiness stable-window resolver and readiness probe fallback
  classification.
- Canonical contract:
  when all nodes are active and publication/priority-spread gates are ready,
  readiness stable-window diagnostics must either expose the node-level reason
  that keeps the window open or close from a canonical readiness snapshot.
- Allowed consumers:
  rolling restart scenario, readiness diagnostics, failure bundles, and sprint
  triage.
- Prohibited reinterpretations:
  do not treat publication readiness or CDC closure as proof of load readiness
  without the load readiness owner snapshot.

## Residual Closure Inventory

- [x] Reconstruct the stable-window sample history and node-level readiness
      states from the latest report and playback artifacts.
- [x] Identify whether degraded samples, warming samples, or probe timeout
      fallback owns the open stable window.
- [x] Add one canonical evidence field or transition that closes or names the
      load readiness stable-window blocker.
- [x] Preserve the CDC projection, publication convergence, and priority-spread
      closure evidence from the previous package.
- [x] Add focused coverage for load readiness stable-window classification.
- [x] Rerun `rolling-restart --fast-local` and record whether the blocker
      passes or migrates to a new named owner boundary.

## Execution Notes

April 30 rerun artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-load-readiness-stable-window.report.json`

Result: failed, `0/1` passed after `411.7s`, but the failure migrated beyond
this package boundary.

The load-readiness stage closed:

1. stage: `scenario.load-readiness.stable`
2. attempts: `20`
3. elapsedMs: `92087`
4. stableElapsedMs: `5866`
5. state: `closed`
6. reason: `ready`
7. source: `selected_snapshot`
8. startedAtMs: `1777525980528`
9. observedAtMs: `1777525986394`

The previous terminal blocker
`Cluster load readiness did not stabilize within 300000ms` did not recur.
The new terminal blocker is:

`Control plane did not quiesce within 120000ms`

Canonical migrated owner:

1. root cause class: `topology`
2. dominant reason: `critical_system_spread_open`
3. quiescence state: `critical_spread_open`
4. canonical blocker: `critical_system_spread_open`
5. inFlightCount: `3`
6. effectiveInFlightCount: `0`
7. staleInFlightCount: `2`
8. cacheVisibleSatisfiedPriorityRecoveryOperationCount: `12`
9. stableElapsedMs: `0`
10. leaderQuietElapsedMs: `17888`

The next active package is:

`work/packages/done-20260430-rolling-restart-control-plane-quiescence-critical-spread-after-load-readiness-closure.md`

## Validation

1. `node --check test/distributed/harness/cluster-segment-7.js` - passed.
2. `node --check test/distributed/harness/__tests__/cluster.test-part-6.js` - passed.
3. `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js` - passed, `28/28`.
4. `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-4.js` - passed, `23/23`.
5. `./node_modules/.bin/tap test/distributed/harness/__tests__/post-rebalance-closure-contract.test.js` - passed, `9/9`.
6. `./node_modules/.bin/tap test/distributed/harness/__tests__/assertions.test.js` - passed, `46/46`.
7. `npm run audit:guideline:literals` - passed.
8. `npm run audit:guideline:decision-boundaries` - passed.
9. `npm run audit:runtime-grammar` - passed.
10. `git diff --check` - passed.
11. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-load-readiness-stable-window.report.json --verbose` - migrated to `critical_system_spread_open`.

## Done When

1. The representative failure no longer stops on load readiness stable-window
   timeout without canonical owner evidence.
2. CDC projection visibility, publication convergence, and priority-spread
   closure evidence remain canonical and are not reopened by the fix.
3. The next failure, if any, is represented by one active work package.
