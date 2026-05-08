# Rolling Restart Control Plane Quiescence Critical Spread After Load Readiness Closure

April 30 activation: the load-readiness stable-window package moved the
representative `rolling-restart --fast-local` path past the prior
`Cluster load readiness did not stabilize within 300000ms` blocker.

Fresh artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-load-readiness-stable-window.report.json`

Result: failed, `0/1` passed after `411.7s`.

The terminal barrier is now:

`Control plane did not quiesce within 120000ms`

Observed boundary:

1. root cause class: `topology`
2. dominant reason: `critical_system_spread_open`
3. quiescence state: `critical_spread_open`
4. canonical blocker: `critical_system_spread_open`
5. inFlightCount: `3`
6. effectiveInFlightCount: `0`
7. staleInFlightCount: `2`
8. cache-visible satisfied priority recovery operation count: `12`
9. stableElapsedMs: `0`
10. leaderQuietElapsedMs: `17888`
11. critical system distribution reports `0/3` for `replica_operations`,
    `sql_transactions`, `sql_transaction_participants`, and
    `sql_write_operations`.
12. distribution evidence is blocked by snapshot-lane admin timeouts for
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.

The load-readiness stable window closed from canonical snapshot evidence:

1. stage: `scenario.load-readiness.stable`
2. stableElapsedMs: `5866`
3. state: `closed`
4. reason: `ready`
5. source: `selected_snapshot`

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Load Readiness Stable Window After CDC Closure](./done-20260430-rolling-restart-load-readiness-stable-window-after-cdc-closure.md)

## In Scope

1. Reconstruct the post-restart quiescence samples and critical-system
   distribution evidence from the fresh report and playback artifacts.
2. Identify whether `critical_system_spread_open` is owned by true critical
   system spread gaps, snapshot-lane reachability, stale in-flight discounting,
   or diagnostic classification.
3. Preserve the closed load-readiness, CDC projection, publication convergence,
   and priority-spread boundaries.
4. Add focused coverage for the quiescence critical-spread owner boundary.
5. Rerun `rolling-restart --fast-local` and record whether the blocker passes
   or migrates.

## Out Of Scope

1. Increasing quiescence timeout budgets.
2. Reopening load-readiness stable-window ownership while canonical snapshot
   evidence remains closed.
3. Reopening CDC projection visibility, publication ACK, or priority-spread
   gates while they are closed.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  control-plane quiescence resolver and critical-system distribution evidence.
- Canonical contract:
  when effective in-flight work is discounted and leadership is quiet,
  critical-system spread diagnostics must distinguish true spread gaps from
  snapshot-lane reachability gaps and expose one canonical blocker.
- Allowed consumers:
  rolling restart scenario, quiescence diagnostics, failure bundles, and sprint
  triage.
- Prohibited reinterpretations:
  do not treat load-readiness or publication convergence as proof of
  control-plane quiescence without the quiescence owner snapshot.

## Residual Closure Inventory

- [x] Reconstruct post-restart quiescence sample history from the fresh report
      and playback artifacts.
- [x] Determine whether the critical-system `0/3` distribution is true topology
      spread debt or snapshot-lane reachability loss.
- [x] Identify why `effectiveInFlightCount=0` and `staleInFlightCount=2` still
      coincide with `inFlightCount=3` at timeout.
- [x] Add or refine one canonical evidence field that separates critical spread
      gaps from snapshot-lane reachability gaps.
- [x] Preserve load-readiness stable-window closure evidence.
- [x] Add focused coverage for quiescence critical-spread classification.
- [x] Rerun `rolling-restart --fast-local` and record whether the blocker
      passes or migrates to a new named owner boundary.

## Execution Notes

April 30 rerun artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-quiescence-critical-spread.report.json`

Result: failed, `0/1` passed after `469.1s`, but the failure migrated beyond
this package boundary.

The previous terminal blocker did not recur:

`Control plane did not quiesce within 120000ms`

Critical-system spread is now closed in the terminal evidence:

1. prioritySpreadSatisfied: `true`
2. prioritySpreadGap: `0`
3. priorityBlockedPartitionCount: `0`
4. priorityRecoveryUnresolvedClassCount: `0`
5. priorityRecoveryBlockedPartitionCount: `0`

The terminal blocker is now post-restart load readiness:

`Cluster load readiness did not stabilize within 120000ms`

Canonical migrated owner:

1. root cause class: `topology`
2. dominant reason: `publication_epoch_pending`
3. publication epoch: `29`
4. publication status: `PUBLISHED`
5. pendingAckCount: `0`
6. missingPublishedNodeIds: `7493b0ab-a054-5fad-a91b-5e331db29304`
7. activeGate mode: `load`
8. activeGate state: `timed_out`
9. activeGate elapsedMs: `121604`
10. activeGate stableWindowMs: `15000`
11. activeNodeCount: `3`
12. inactiveNodeCount: `2`
13. snapshot coverage: `5/5`
14. readiness delay cause: `snapshot_reachability_timeout`
15. selected snapshot reachability error:
    `Control snapshot reachability probe timed out for 11601fe0-72d6-5853-8590-ec2881853e72`
16. selected control-plane owner pendingWrites: `513`
17. selected control-plane owner pendingWriteGrowthCount: `606`

The next active package is:

`work/packages/done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md`

## Validation

1. `node --check test/distributed/harness/control-plane-quiescence-snapshot.js` - passed.
2. `node --check test/distributed/harness/cluster-segment-7-class-5.js` - passed.
3. `node --check test/distributed/harness/cluster-segment-7-class-3.js` - passed.
4. `node --check test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js` - passed.
5. `node --check test/distributed/harness/__tests__/cluster.test-part-6.js` - passed.
6. `./node_modules/.bin/tap test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js` - passed, `12/12`.
7. `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js` - passed, `30/30`.
8. `npm run audit:guideline:literals` - passed.
9. `npm run audit:guideline:decision-boundaries` - passed.
10. `npm run audit:runtime-grammar` - passed.
11. `git diff --check` - passed.
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-quiescence-critical-spread.report.json --verbose` - migrated to `publication_epoch_pending` under post-restart load readiness.

## Done When

1. The representative failure no longer stops on
   `critical_system_spread_open` without canonical owner evidence.
2. Load-readiness stable-window, CDC projection visibility, publication
   convergence, and priority-spread closure evidence remain canonical and are
   not reopened by the fix.
3. The next failure, if any, is represented by one active work package.
