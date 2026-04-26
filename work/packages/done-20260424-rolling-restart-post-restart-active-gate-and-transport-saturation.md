# Rolling Restart Post-Restart ACTIVE Gate And Transport Saturation

Status: done on April 24, 2026.

## Why

The `rolling-restart` secondary re-entry moved beyond the per-restart
recovery-ready blocker in:

1. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-recovery-readiness-owner-blocker.report.json`

The scenario now fails after all restart actions complete, at the strict
post-restart ACTIVE gate:

1. `snapshotCoverage=5/5`
2. `publicationConvergence=ready`
3. `priorityRecoveryInvariants=passed`
4. `publication=PUBLISHED`
5. `pendingAck=0`
6. `active=3/5`
7. one node readiness probe timed out
8. one node remained `warming`
9. logs showed repeated critical outbound queue saturation and retryable
   replica operation deferrals.

This package owns the new post-restart ACTIVE convergence blocker. It must not
reopen the completed per-restart recovery-ready package.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Topology workflow stabilization`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Isolate why strict post-restart active convergence remains open when
   publication convergence, snapshot coverage, and priority recovery
   invariants are already ready.
2. Determine whether the timeout belongs to runtime transport saturation,
   bootstrap readiness stable-window progression, control snapshot reachability,
   or harness active-gate classification.
3. Preserve the strict post-load final gate: do not count load-mode soft
   success after load cancellation.
4. Improve ACTIVE-gate failure classification if it still reports
   publication-oriented blockers after publication is already `PUBLISHED`.

## Out Of Scope

1. Treating `bootstrap_health` reachability as final readiness.
2. Reintroducing load-mode soft ACTIVE success for post-load final checks.
3. Increasing ACTIVE or restart readiness timeouts before the owner path is
   understood.
4. Broad matrix continuation while this blocker is active.

## Shared Boundary Contract

- Semantic owner:
  strict post-restart ACTIVE convergence after load cancellation.
- Canonical contract:
  final active convergence must be backed by the runtime readiness owner or by
  a canonical publication/recovery owner state that proves the node is safe for
  final consistency.
- Allowed consumers:
  `rolling-restart`, active-gate diagnostics, failure bundles, and the
  representative matrix re-entry package.
- Prohibited reinterpretations:
  stale publication labels after `publication=PUBLISHED`, timeout-only
  reachability errors without the owning readiness reason, or load-mode closure
  witnesses after load has stopped.

## Progress Grammar

1. `publication_ready` means the selected control snapshot reports complete
   coverage and published membership.
2. `runtime_readiness_pending` means at least one node has not reached the
   strict active readiness owner state.
3. `snapshot_reachability_pending` means a node readiness or admin snapshot
   probe timed out before owner state could be read.
4. `transport_saturated` means the transport owner reports bounded queue
   saturation that can delay readiness or control-plane observation.
5. `strict_active_ready` means every final active consumer observes the
   canonical ready state without load-mode projection.

## Residual Closure Inventory

- [x] Reproduce the post-restart ACTIVE blocker with focused owner evidence.
- [x] Identify whether `state:warming` is a genuine runtime readiness blocker
      or a stale stable-window observation after publication convergence.
- [x] Identify whether the timed-out node is a runtime transport saturation
      problem or an active-gate observation/classification problem.
- [x] Update failure classification so `publication=PUBLISHED` failures do not
      remain labeled as publication convergence blocked without a current
      publication owner blocker.
- [x] Rerun `rolling-restart` and record the next blocker movement.

## Closure Notes

The package moved the scenario beyond the strict post-restart ACTIVE gate in:

1. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-post-restart-active-classified.report.json`

The new terminal failure is not post-restart ACTIVE convergence. Final active
evidence was ready:

1. `activeNodeCount=5/5`
2. `snapshotCoverage=5/5`
3. `publicationStatus=PUBLISHED`
4. `pendingAck=0`
5. `prioritySpreadSatisfied=true`
6. `priorityRecoveryUnresolvedClassCount=0`
7. `priorityRecoveryUnresolvedSemanticStateCount=0`
8. `priorityRecoveryBlockedPartitionCount=0`

The scenario now fails during final leader-map comparison. The visible
disagreement is `sql_transactions-p1`: node
`7493b0ab-a054-5fad-a91b-5e331db29304` reports leader
`8be8d30f-4499-5eed-865c-71b4d529a67a`, while node
`11601fe0-72d6-5853-8590-ec2881853e72` reports leader
`7493b0ab-a054-5fad-a91b-5e331db29304`.

The same run still shows transport and CDC pressure around the failing window:
outbound queue saturation, CDC forward-to-leader rejection, retrying Raft CDC
commands, out-of-order CDC events, bootstrap snapshot divergence, WebSocket
reconnect failures, and cache visibility gap diagnostics.

The blocker is handed off to:

1. [Rolling restart final leader-map consistency and CDC pressure](done-20260424-rolling-restart-final-leader-map-consistency-and-cdc-pressure.md)

## Validation

Executed before activation:

1. `node test/distributed/harness/__tests__/cluster.test-part-2.js`
2. Result: passed.
3. `node test/distributed/harness/__tests__/cluster.test-part-4.js`
4. Result: passed.
5. `node test/distributed/harness/__tests__/cluster.test.js`
6. Result: passed.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-recovery-readiness-owner-blocker.report.json --fast-local --verbose`
8. Result: failed at strict post-restart ACTIVE convergence with the blocker
   named above.
9. `node test/distributed/harness/__tests__/failure-bundle.test.js`
10. Result: passed.
11. `node test/distributed/harness/__tests__/cluster.test-part-6.js`
12. Result: passed.
13. `node test/distributed/harness/__tests__/cluster.test.js`
14. Result: passed.
15. `git diff --check`
16. Result: passed.
17. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-post-restart-active-classified.report.json --fast-local --verbose`
18. Result: moved beyond strict post-restart ACTIVE convergence and failed at
    final leader-map consistency under CDC/transport pressure.

## Done When

1. `rolling-restart` passes the strict post-restart ACTIVE gate and final
   consistency, or the scenario moves to a freshly split blocker with owner
   evidence that is not post-restart ACTIVE convergence. Status: complete;
   the blocker moved to final leader-map consistency.
2. Failure bundles classify the terminal blocker from the owning readiness,
   transport, or active-gate contract rather than stale publication labels.
   Status: complete for the active-gate boundary; focused regressions now keep
   priority-recovery owner evidence and closed `CL-003` closure records from
   reopening publication convergence.
