# Rolling Restart Load Readiness No Progress Fast Fail And Publication Gate Closure

April 30 activation: the quiescence critical-spread package moved the
representative `rolling-restart --fast-local` path past the prior
`critical_system_spread_open` blocker.

Reference artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-quiescence-critical-spread.report.json`

Result: failed, `0/1` passed after `469.1s`.

The original terminal barrier was:

`Cluster load readiness did not stabilize within 120000ms`

Observed boundary:

1. root cause class: `topology`
2. dominant reason: `publication_epoch_pending`
3. active gate mode: `load`
4. active gate state: `timed_out`
5. attempts: `15`
6. elapsedMs: `121604`
7. stableWindowMs: `15000`
8. stableElapsedMs: `0`
9. publication epoch: `29`
10. publication status: `PUBLISHED`
11. pendingAckCount: `0`
12. missingPublishedNodeIds: `7493b0ab-a054-5fad-a91b-5e331db29304`
13. activeNodeCount: `3`
14. inactiveNodeCount: `2`
15. snapshot coverage: `5/5`
16. prioritySpreadSatisfied: `true`
17. prioritySpreadGap: `0`
18. priorityBlockedPartitionCount: `0`
19. readiness delay cause: `snapshot_reachability_timeout`
20. selected control-plane owner pendingWrites: `513`
21. selected control-plane owner pendingWriteGrowthCount: `606`

The prior critical-system spread owner is closed in the terminal evidence. The
activation blocker was the publication gate under the final post-restart
load-readiness stable window.

April 30 fast-fail follow-up: the long wait was confirmed to be masking an
unchanged owner-state blocker rather than producing useful late evidence. The
harness now records load-readiness active-gate progress snapshots and fails the
gate when no meaningful progress is observed for the configured attempt budget.
That rerun failed in the pre-load readiness gate, not in the post-restart gate;
the package therefore owns the shared load-readiness no-progress classifier and
keeps the original post-restart publication evidence as prior input, not as the
latest terminal proof.

Fast-fail artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-fast-fail-load-readiness.report.json`

Result: failed, `0/1` passed after `110.8s`.

The fast-fail terminal barrier is:

`Cluster ACTIVE wait stalled with no meaningful progress for 8 attempts`

Current observed boundary:

1. root cause class: `topology`
2. dominant reason: `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
3. active gate mode: `load`
4. active gate state: `stalled`
5. active gate attempts: `13`
6. elapsedMs: `73821`
7. no-progress max attempts: `8`
8. attempts since progress: `8`
9. publication status: `ACK_PENDING`
10. pendingAckCount: `2`
11. missingPublishedNodeIds: `none`
12. snapshot coverage: `5/5`
13. prioritySpreadSatisfied: `false`
14. prioritySpreadGap: `8`
15. priority recovery class: `eligible_but_no_operation_created`
16. priority recovery state: `needs_operation`
17. blocked partitions:
    `sql_transaction_participants-p1`, `sql_transactions-p1`

The current package therefore owns the harness fast-fail boundary and keeps the
publication-gate evidence visible. The runtime blocker exposed by the faster
failure is priority recovery operation creation under load, not a reason to
increase the outer load-readiness timeout.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Control Plane Quiescence Critical Spread After Load Readiness Closure](./done-20260430-rolling-restart-control-plane-quiescence-critical-spread-after-load-readiness-closure.md)

## In Scope

1. Reconstruct the original post-restart load-readiness samples and the latest
   pre-load fast-fail samples from the fresh report and playback artifacts.
2. Identify whether `publication_epoch_pending` is owned by true membership
   publication debt, stale selected-snapshot evidence, snapshot-lane
   reachability, readiness admission, or diagnostic classification.
3. Preserve the closed critical-system spread, priority-recovery, quiescence,
   CDC projection, and pre-restart load-readiness boundaries.
4. Add focused coverage for the load-readiness publication/no-progress owner
   boundary.
5. Rerun `rolling-restart --fast-local` and record whether the blocker passes
   or migrates.
6. Add a load-readiness no-progress fast-fail budget so unchanged owner-state
   blockers fail with current evidence instead of waiting for the outer timeout.
7. Wire the representative scenario through explicit pre-load, post-restart
   load-readiness, and post-restart quiescence no-progress budgets.

## Out Of Scope

1. Increasing load-readiness, convergence, or quiescence timeout budgets.
2. Reopening critical-system spread while terminal priority-spread evidence is
   closed.
3. Reopening CDC projection visibility, priority recovery, or quiescence gates
   while their owner evidence remains closed.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  load-readiness publication gate, active-gate progress evidence, and
  no-progress fast-fail classification.
- Canonical contract:
  the load-readiness gate must distinguish true missing active membership,
  publication ACK debt, priority-spread debt, selected-snapshot reachability
  gaps, and stalled progress; when progress stalls, the harness must emit one
  canonical no-progress outcome with the best and latest owner snapshots.
- Allowed consumers:
  rolling restart scenario, active-gate diagnostics, failure bundles, and sprint
  triage.
- Prohibited reinterpretations:
  do not treat priority spread or quiescence closure as proof of load readiness
  without the load-readiness owner snapshot, and do not increase the outer
  timeout when the owner-state progress score is unchanged.

## Residual Closure Inventory

- [x] Reconstruct the original post-restart load-readiness sample history and
      the latest pre-load fast-fail sample history from the report artifacts.
- [x] Add load-readiness no-progress progress scoring and stalled diagnostics.
- [x] Wire `rolling-restart` through explicit no-progress budgets.
- [x] Rerun `rolling-restart --fast-local` and record the migrated blocker.
- [x] Determine that the latest fast-fail artifact is a pre-load gate failure
      from `rolling-restart.js:339`, so it does not prove the original
      post-restart missing-published-node question.
- [x] Determine that selected snapshot reachability timeout from the original
      post-restart blocker is prior evidence only until the pre-load blocker
      moves.
- [x] Identify why the active gate reports no meaningful progress across the
      fast-fail budget.
- [x] Add `loadReadinessPhase` evidence so future reports distinguish
      pre-load and post-restart load-readiness gates.
- [x] Preserve critical-system spread and quiescence closure evidence.
- [x] Fix stable-window start selection so a later complete snapshot cannot
      backdate across an earlier partial-coverage ACTIVE observation.
- [x] Add focused coverage for load-readiness no-progress classification.
- [x] Split the current priority-recovery `eligible_but_no_operation_created`
      runtime blocker if the next implementation cycle continues beyond the
      harness fast-fail boundary.

## Validation

1. `node --check test/distributed/harness/cluster-segment-7.js`
2. `node --check test/distributed/scenarios/rolling-restart.js`
3. `node --check test/distributed/harness/__tests__/cluster.test-part-6.js`
4. `node --check test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
5. `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js --grep "backdate complete snapshot|waitForLoadReadinessStability fails fast"`
6. `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
7. `./node_modules/.bin/tap test/distributed/harness/__tests__/cluster.test-part-6.js`
8. `npm run audit:guideline:literals`
9. `npm run audit:guideline:decision-boundaries`
10. `npm run audit:runtime-grammar`
11. `git diff --check -- test/distributed/harness/cluster-segment-7.js test/distributed/scenarios/rolling-restart.js test/distributed/harness/__tests__/cluster.test-part-6.js test/distributed/harness/__tests__/rolling-restart-scenario.test.js work/packages/done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md work/packages/done-20260430-rolling-restart-control-plane-quiescence-critical-spread-after-load-readiness-closure.md`
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-fast-fail-load-readiness.report.json --verbose`

Result: focused checks, TAP tests, static guardrails, runtime grammar, and
scoped diff whitespace passed. The focused TAP grep covered both the
no-progress fast-fail behavior and the stable-window backdating regression.
The full `cluster.test-part-6.js` suite passed `32/32`, and the rolling restart
scenario unit coverage passed `5/5`. The representative scenario still fails,
but it now fails after `110.8s` with canonical no-progress evidence instead of
after `469.1s` through the outer load-readiness timeout.

## Done When

1. The representative failure no longer waits for the outer load-readiness
   timeout when active-gate owner progress has stalled.
2. The fast-fail diagnostics include best progress, latest progress,
   no-progress attempt budget, canonical blocker reasons, and failure logs.
3. Critical-system spread, CDC projection visibility, quiescence closure, and
   publication-gate evidence remain canonical and are not hidden by the
   fast-fail path.
4. The next runtime failure, if any, is represented by one active work package.
