# Rolling Restart Active Publication Missing Node Convergence

April 30 migration: the restart-recovery admin reachability package moved the
representative `rolling-restart --fast-local` path past the generic
`restart_recovery_timeout` boundary. The path now fails in the cluster ACTIVE
wait after publication reaches `PUBLISHED` but one active node remains missing
from the selected published active set.

Reference artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-admin-reachability-owner-state.report.json`

Failure bundle:

`test-output/reports/.playback/runtime-stability-rolling-restart-20260430-codex-admin-reachability-owner-state/rolling-restart/failure-bundle.json`

Result: failed, `0/1` passed after `398.2s`.

Terminal barrier:

`Cluster ACTIVE wait stalled with no meaningful progress for 8 attempts (mode=load, progress=active=0/5,coverage=4/5,publication=PUBLISHED,snapshotNode=35a891b8-c1a0-5064-9c6e-2acfba61c2a7#adminReady=true#via=admin_health,epoch=25,publishedActive=4/5,pendingAck=0,missingPublished=1,missingPublishedIds=8be8d30f-4499-5eed-865c-71b4d529a67a,ownerQueue=135,cdcLag=0,disagreementNodes=4,prioritySpread=ready#gap=0,priorityRecovery=none,priorityRecoveryState=none,closure=none,gateReasons=publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a)`

Observed boundary:

1. root cause class: `startup`
2. dominant reason: `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
3. failure class: `publication_convergence_blocked`
4. active gate state: `stalled`
5. active gate readiness class: `no_progress_terminal`
6. active gate attempts since progress: `8/8`
7. publication epoch: `25`
8. publication status: `PUBLISHED`
9. pending ACK count: `0`
10. blocked node count: `0`
11. published active nodes: `4/5`
12. missing published node: `8be8d30f-4499-5eed-865c-71b4d529a67a`
13. selected snapshot node:
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`
14. selected snapshot admin readiness: `true`
15. selected snapshot reachability: `admin_health`
16. snapshot coverage: `4/5`
17. priority spread pending: `false`
18. priority spread gap: `0`
19. recovery protocol state: `steady_published`
20. stability gates `failover`, `convergence`, and `restart_recovery` are
    `open` with blockers `publication_pending` and `startup_readiness_blocked`

Concurrent operation evidence:

1. priority recovery witness partition:
   `sql_transaction_participants-p1`
2. semantic state: `spread_satisfied_in_flight`
3. current owner: `operation_workflow_owner`
4. next required action: `wait_for_operation_progress`
5. blocking boundary: `workflow_progress`
6. workflow phase: `source_removal`
7. operation ids:
   `22f11b1a-5237-486b-be72-4433a0cd61a9`,
   `54e1315e-bc20-40d2-a66f-dc2614b08416`
8. latest operation workflow step: `ACTIVE`
9. latest operation status: `active`
10. terminal log evidence includes
    `replace_remove_safety_blocked` for
    `sql_transaction_participants-p1-r5` not voter-ready.

Transport and cache-repair evidence:

1. missing published node `8be8d30f-4499-5eed-865c-71b4d529a67a` repeatedly
   fails WebSocket reconnection to
   `7493b0ab-a054-5fad-a91b-5e331db29304`.
2. cache repair fails for `nodes` with
   `ROUTER_CONNECTION_CLOSED` and cause chain `control_plane_backpressure`.
3. `7493b0ab-a054-5fad-a91b-5e331db29304` reports transport backpressure with
   critical reserve exhausted.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Restart Recovery Admin Reachability Regression](./done-20260430-rolling-restart-restart-recovery-admin-reachability-regression.md)
2. [Rolling Restart Quiescence Stale In Flight Canonical Blocker](./done-20260430-rolling-restart-quiescence-stale-inflight-canonical-blocker.md)
3. [Rolling Restart Load Readiness No Progress Fast Fail And Publication Gate Closure](./done-20260430-rolling-restart-load-readiness-no-progress-fast-fail-and-publication-gate-closure.md)

## In Scope

1. Reconstruct why ACTIVE readiness regresses from best progress `active=3/5`
   and coverage `5/5` to terminal progress `active=0/5` and coverage `4/5`.
2. Determine why node `8be8d30f-4499-5eed-865c-71b4d529a67a` remains absent
   from the selected published active node set despite `PUBLISHED`,
   `pendingAck=0`, and `blockedNodeCount=0`.
3. Decide whether the owner-state blocker is publication evidence assembly,
   active-node projection, transport/cache-repair backpressure, or the
   concurrent source-removal workflow.
4. Reconcile `dominantReason=PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` with
   `prioritySpreadPending=false`, `priorityRecovery=none`, and
   `recoveryProtocolState=steady_published`.
5. Add focused regression coverage for the selected ACTIVE gate owner boundary.
6. Rerun focused checks and the representative `rolling-restart --fast-local`
   path, recording whether the blocker passes or migrates.

## Out Of Scope

1. Increasing ACTIVE wait, publication, transport, cache-repair, or workflow
   timeouts.
2. Reopening the restart-recovery admin reachability blocker closed by the
   dependency package.
3. Treating `PUBLISHED` and `pendingAck=0` as sufficient for ACTIVE readiness
   without a canonical published-active-node owner state.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  ACTIVE gate readiness, published active node projection, publication
  convergence classification, cache-repair reachability, and operation workflow
  progress evidence.
- Canonical contract:
  if publication is `PUBLISHED` with `pendingAck=0` but an expected active node
  remains missing from the selected published active set, the terminal gate
  must name one owner-state blocker. If transport/cache repair owns the
  absence, the blocker must expose the node ids, target endpoint, pressure
  state, and repair failure. If operation workflow source-removal owns the
  absence, the blocker must expose the operation ids, partition ids, workflow
  phase, and next action. If the failure is only diagnostic vocabulary drift,
  the dominant reason and stability gates must use the canonical publication
  missing-node owner.
- Allowed consumers:
  rolling-restart ACTIVE gate, publication convergence failure bundles,
  stability gates, priority recovery summaries, cache-repair diagnostics, and
  transport pressure reports.
- Prohibited reinterpretations:
  do not widen waits, do not hide missing published active nodes behind generic
  priority recovery pending, and do not let `steady_published` plus
  `prioritySpreadPending=false` continue to report an open priority recovery
  blocker without explicit owner-state evidence.

## Residual Closure Inventory

- [x] Reconstruct the ACTIVE gate decision snapshots for epoch `25`.
- [x] Identify the canonical owner for the missing published active node
      `8be8d30f-4499-5eed-865c-71b4d529a67a`.
- [x] Decide whether transport/cache-repair backpressure is causal,
      diagnostic, or concurrent pressure.
- [x] Decide whether source-removal operation workflow pressure is causal,
      diagnostic, or the next blocker.
- [x] Reconcile priority-recovery vocabulary with `steady_published` and
      `prioritySpreadPending=false`.
- [x] Add focused regression coverage for the selected owner boundary.
- [x] Rerun the representative path and record the migrated or closed blocker.

## Validation

1. Review-fix syntax checks:
   `node --check src/control-plane/active-node-projection.js`;
   `node --check src/control-plane/recovery-protocol-snapshot.js`;
   `node --check src/control-plane/control-plane-readiness-service-segment-4.js`;
   `node --check test/control-plane/control-plane-readiness-service.test-part-4.js`.
   Result: passed.
2. Review-fix regressions:
   `./node_modules/.bin/tap test/control-plane/control-plane-readiness-service.test-part-4.js --grep 'count-only ACK debt|direct count-only ACK debt'`;
   `node --test test/distributed/harness/__tests__/failure-bundle.test.js --test-name-pattern 'stale priority-spread state has ACK debt|admin refusal|stale restart-recovery priority spread'`.
   Result: passed. Count-only ACK debt now survives direct/provided publication
   evidence merges, and stale priority-spread playback remains open only when
   publication ACK debt is still real.
3. Missing-node owner classification syntax checks:
   `node --check test/distributed/harness/failure-bundle-segment-1.js`;
   `node --check test/distributed/harness/failure-bundle-segment-2.js`;
   `node --check test/distributed/harness/failure-bundle-segment-3.js`;
   `node --check test/distributed/harness/failure-bundle-segment-4.js`;
   `node --check test/distributed/harness/failure-bundle-segment-5.js`;
   `node --check test/distributed/harness/failure-bundle-segment-6.js`;
   `node --check test/distributed/harness/failure-bundle-segment-7.js`;
   `node --check test/distributed/harness/__tests__/failure-bundle.test.js`.
   Result: passed.
4. Missing-node owner classification focused regression:
   `node --test test/distributed/harness/__tests__/failure-bundle.test.js`.
   Result: passed, `56/56`. The new regression proves
   `publication_missing_active_node=<node>` wins over stale priority-recovery
   vocabulary, suppresses generic publication/startup blockers, and preserves
   missing-node evidence in stability gates and classification signals.
5. Scoped guideline guardrails:
   `node scripts/check-guideline-literals.js ./test/distributed/harness/failure-bundle-segment-1.js ./test/distributed/harness/failure-bundle-segment-4.js ./test/distributed/harness/failure-bundle-segment-5.js ./test/distributed/harness/__tests__/failure-bundle.test.js ./src/control-plane/active-node-projection.js ./src/control-plane/recovery-protocol-snapshot.js ./src/control-plane/control-plane-readiness-service-segment-4.js ./test/control-plane/control-plane-readiness-service.test-part-4.js`;
   `node scripts/check-guideline-decision-boundaries.js ./test/distributed/harness/failure-bundle-segment-4.js ./test/distributed/harness/failure-bundle-segment-5.js ./src/control-plane/active-node-projection.js ./src/control-plane/recovery-protocol-snapshot.js ./src/control-plane/control-plane-readiness-service-segment-4.js`;
   `node scripts/check-guideline-boundary-mode-contracts.js ./test/distributed/harness/failure-bundle-segment-4.js ./test/distributed/harness/failure-bundle-segment-5.js ./src/control-plane/active-node-projection.js ./src/control-plane/recovery-protocol-snapshot.js ./src/control-plane/control-plane-readiness-service-segment-4.js`.
   Result: passed with `0` new literal, decision-boundary, or
   boundary-mode-contract violations.
6. Representative `rolling-restart --fast-local` rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-active-publication-missing-node-owner-state.report.json --fast-local --verbose`.
   Result: failed, `0/1` passed after `132.1s`, but the missing published
   active-node blocker migrated. Terminal evidence now has publication epoch
   `4`, status `PUBLISHED`, `publishedActive=5/5`, `pendingAck=0`,
   `missingPublished=0`, and selected snapshot coverage `5/5`.
7. Migrated blocker:
   the current terminal owner is priority recovery workflow progress for
   `sql_transactions-p1`, with `prioritySpread=pending#gap=6`,
   `priority_recovery_workflow_progress_event_driven`,
   `operation_workflow_owner`, `workflow_progress`,
   `waitMode=event_driven`, `nextAction=wait_for_operation_progress`,
   latest operation step `SENDING`, and latest status `pending`.
   Transport/cache-repair pressure from the missing-node artifact is not the
   terminal owner in the rerun; operation workflow progress is the next active
   runtime blocker.

## Done When

1. The representative path no longer fails with ACTIVE gate no-progress while
   publication is `PUBLISHED`, ACK debt is zero, and one active node is missing
   without an owner-state blocker.
2. Published active node evidence, stability gate state, and failure bundle
   dominant reason agree on one canonical terminal outcome.
3. Transport/cache-repair and source-removal workflow evidence are classified
   as causal owner, diagnostic pressure, or independent next blocker.
4. Priority-recovery vocabulary is coherent across dominant reason, recovery
   protocol state, priority-spread boolean fields, and partition witnesses.
5. The representative `rolling-restart --fast-local` path passes or migrates to
   one named active package with current owner-state evidence.
