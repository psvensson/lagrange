# Rolling Restart Restart Recovery Admin Reachability Regression

April 30 migration: the quiescence stale-in-flight package moved the
representative `rolling-restart --fast-local` path past the prior terminal
state where quiescence reported `state=quiescent`, `effectiveInFlightCount=0`,
and `canonicalBlocker=none` while the harness still failed. The current
terminal blocker is earlier in restarted-node recovery readiness.

Reference artifact:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-quiescence-stale-inflight-closure.report.json`

Failure bundle:

`test-output/reports/.playback/runtime-stability-rolling-restart-20260430-codex-quiescence-stale-inflight-closure/rolling-restart/failure-bundle.json`

Result: failed, `0/1` passed after `353.9s`.

Terminal barrier:

`Restarted node did not become recovery-ready within 120000ms for node 11601fe0-72d6-5853-8590-ec2881853e72 (reachable=true, ready=false, adminReady=false, controlPlaneRecoveryReady=false, publishedControlPlaneEpoch=unknown, expectedPublicationEpoch=none, readinessPhase=INIT, readinessStage=traffic_ready, readinessStageRank=5, readinessReasons=none, recoveryStage=unknown, bootstrapJoinProjectionBlocker=none, bootstrapJoinProjectionRule=init_priority_bypass, reachableBy=bootstrap_health, lastError=Admin API query failed for node 11601fe0-72d6-5853-8590-ec2881853e72 on lane probe: connect ECONNREFUSED 172.19.0.4:8081)`

Observed boundary:

1. root cause class: `startup`
2. dominant reason: `restart_recovery_timeout`
3. failure class: `startup_recovery_blocked`
4. failed node: `11601fe0-72d6-5853-8590-ec2881853e72`
5. bootstrap health is reachable
6. admin API is not reachable: `ECONNREFUSED 172.19.0.4:8081`
7. `ready=false`
8. `adminReady=false`
9. `controlPlaneRecoveryReady=false`
10. readiness phase: `INIT`
11. readiness stage: `traffic_ready`
12. bootstrap join projection blocker: `none`
13. bootstrap join projection rule: `init_priority_bypass`
14. quiescence evidence: `null`
15. top secondary reason:
    `readiness_probe_timeout_fallback=Node readiness probe timed out for 7493b0ab-a054-5fad-a91b-5e331db29304`

Closed or non-terminal evidence:

1. publication epoch: `4`
2. publication status: `PUBLISHED`
3. pending ACK count: `0`
4. blocked publication node count: `0`
5. missing published node count: `0`
6. stability gates `failover`, `convergence`, and `restart_recovery` report
   `closed`
7. failure classification still reports barrier `restart_recovery`
8. recovery protocol state reports `priority_spread_pending`
9. priority spread pending reports `false`
10. closure witness class:
    `publication_converged_priority_spread_pending`

Priority recovery operation evidence:

1. dominant witness: `replica_operations-p1`
2. semantic state: `spread_satisfied_in_flight`
3. spread gap: `1`
4. ready distinct nodes: `2`
5. required distinct nodes: `3`
6. current owner: `operation_workflow_owner`
7. next required action: `wait_for_operation_progress`
8. blocking boundary: `workflow_progress`
9. workflow progress phase: `source_removal`
10. operation id: `80f891c2-a981-46a5-b4e0-cafc8f18495e`
11. latest operation step: `ACTIVE`
12. latest operation status: `active`

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling Restart Quiescence Stale In Flight Canonical Blocker](./done-20260430-rolling-restart-quiescence-stale-inflight-canonical-blocker.md)
2. [Restart recovery control-plane pressure and admin reachability](./done-20260426-restart-recovery-control-plane-pressure-and-admin-reachability.md)
3. [Rolling restart durable rejoin admin reachability](./done-20260425-rolling-restart-durable-rejoin-admin-reachability.md)

## In Scope

1. Reconstruct why bootstrap health is reachable while the admin API refuses
   connections during restarted-node recovery readiness.
2. Determine whether the `INIT` / `traffic_ready` readiness state is a real
   startup phase stall, a diagnostics reachability gap, or a stale failure
   classification.
3. Reconcile the contradiction between a terminal
   `restart_recovery_timeout` and a failure-bundle `restart_recovery` stability
   gate that reports `closed`.
4. Reconcile `recoveryProtocolState=priority_spread_pending` with
   `prioritySpreadPending=false` and a closure witness class that still names
   priority spread pending.
5. Determine whether the operation-workflow source-removal evidence is the
   owner-state blocker for admin reachability or only concurrent pressure.
6. Add focused regression coverage for the selected recovery-readiness owner
   boundary.
7. Rerun focused checks and the representative `rolling-restart --fast-local`
   path, recording whether the blocker passes or migrates.

## Out Of Scope

1. Increasing restart-recovery, readiness, admin, publication, or workflow
   timeouts.
2. Reopening the quiescence stale-in-flight blocker closed by the dependency
   package.
3. Treating bootstrap health as equivalent to admin/control-plane recovery
   readiness without owner-state evidence.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  restarted-node recovery readiness, admin reachability, bootstrap readiness
  phase/state, and failure-bundle restart-recovery classification.
- Canonical contract:
  the terminal restarted-node recovery decision must name one owner-state
  outcome. If admin reachability is the blocker, the recovery barrier and
  stability gate must both expose that owner-state. If a prior operation
  workflow prevents recovery readiness, the barrier must name that workflow
  owner, operation ids, partition ids, and next action. If the stability gate is
  already closed, the terminal failure must not continue to claim the same
  gate as the open barrier without explicit diagnostic-only semantics.
- Allowed consumers:
  rolling-restart scenario recovery barrier, cluster recovery-readiness wait,
  failure bundles, stability gates, bootstrap readiness diagnostics, and
  priority recovery operation summaries.
- Prohibited reinterpretations:
  do not widen timeouts, do not hide admin refusal behind a generic
  `restart_recovery_timeout`, and do not let closed stability gates and
  terminal barriers disagree without one canonical owner-state explanation.

## Residual Closure Inventory

- [x] Reconstruct the restarted-node recovery-readiness decision snapshot for
      node `11601fe0-72d6-5853-8590-ec2881853e72`.
- [x] Identify the canonical owner for bootstrap-health-reachable but
      admin-refused recovery readiness.
- [x] Decide whether operation-workflow source-removal pressure is causal,
      diagnostic, or an independent next blocker.
- [x] Reconcile restart-recovery terminal barrier classification with the
      closed `restart_recovery` stability gate.
- [x] Reconcile priority-spread pending vocabulary across recovery protocol
      state, boolean pending fields, and closure witness class.
- [x] Add focused regression coverage for the selected owner boundary.
- [x] Rerun the representative path and record the migrated or closed blocker.

## Validation

Focused regression checks:

1. `node --test test/distributed/harness/__tests__/failure-bundle.test.js --test-name-pattern 'admin refusal'`
2. `node --test test/distributed/harness/__tests__/failure-bundle.test.js --test-name-pattern 'admin refusal|stale restart-recovery priority spread'`
3. Result: passed. The failure bundle now classifies the terminal admin-refused
   restart-recovery snapshot as `admin_reachability_refused`; the restart
   recovery gate opens with the same blocker, and stale
   `priority_spread_pending` recovery protocol state normalizes to
   `steady_published` when the priority-spread gate is not active.

Review-fix checks carried with this package:

1. `./node_modules/.bin/tap test/control-plane/control-plane-readiness-service.test-part-4.js --grep 'count-only ACK debt'`
2. `node --test test/distributed/harness/__tests__/control-plane-quiescence-snapshot.test.js --test-name-pattern 'critical spread observation gaps'`
3. Result: passed. Count-only ACK debt is preserved when direct planning has an
   empty ACK list, and the critical-spread observation-unavailable candidate
   reset reason is part of the canonical reset reason set.

Static guardrails:

1. `node --check` on all touched runtime and focused test files.
2. `git diff --check -- <touched files>`
3. `npx eslint <touched files> --no-ignore`
4. `npm run audit:guideline:literals`
5. `npm run audit:guideline:decision-boundaries`
6. `npm run audit:runtime-grammar`
7. `npm run test:metadata-gateway:audit`
8. Result: passed.

Representative proof:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260430-codex-admin-reachability-owner-state.report.json --fast-local --verbose`
2. Result: failed, `0/1` passed after `398.2s`, but the restart-recovery admin
   reachability blocker migrated.
3. The run no longer fails with generic `restart_recovery_timeout`.
4. New terminal error:
   `Cluster ACTIVE wait stalled with no meaningful progress for 8 attempts`.
5. New dominant reason: `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.
6. New failure class: `publication_convergence_blocked`.
7. New convergence evidence:
   - publication epoch: `25`
   - publication status: `PUBLISHED`
   - pending ACK count: `0`
   - blocked node count: `0`
   - published active count: `4/5`
   - missing published node:
     `8be8d30f-4499-5eed-865c-71b4d529a67a`
   - recovery protocol state: `steady_published`
   - priority spread pending: `false`
   - active gate state: `stalled`
   - active gate reason:
     `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`
8. Follow-on active package:
   [Rolling Restart Active Publication Missing Node Convergence](./done-20260430-rolling-restart-active-publication-missing-node-convergence.md).

Deep-dive review:

1. Reviewed the restart-recovery failure barrier classifier, stability gate
   builder, publication-convergence protocol-state normalization, focused
   failure-bundle tests, and the review-fix surfaces for count-only ACK debt
   and quiescence candidate-window reset reasons.
2. No additional in-scope restart-recovery admin-refusal bypass, closed-gate
   contradiction, stale priority-spread protocol state, or new static guardrail
   drift remained after the patch.

## Done When

1. The representative path no longer fails with generic
   `restart_recovery_timeout` while admin reachability is refused without an
   owner-state blocker.
2. Bootstrap health, admin readiness, and control-plane recovery readiness have
   one canonical terminal outcome and diagnostics agree with it.
3. Stability gate state and terminal failure barrier either match or explicitly
   distinguish operational authority from diagnostics-only evidence.
4. Priority-spread pending vocabulary is coherent across recovery protocol
   state, closure witness, and boolean pending fields.
5. The representative `rolling-restart --fast-local` path passes or migrates to
   one named active package with current owner-state evidence.
