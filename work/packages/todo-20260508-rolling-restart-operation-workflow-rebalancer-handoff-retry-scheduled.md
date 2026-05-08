# Rolling Restart Operation Workflow Rebalancer Handoff Retry Scheduled

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-next.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-next/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_rebalancer_handoff_retry_scheduled",
  "currentState": "The workflow-progress package added a focused local-owner dispatch-pending probe and the representative rolling-restart rerun migrated. The current artifact fails the active gate with active=3/5, snapshotCoverage=3/5, publication=PUBLISHED, pendingAck=0, prioritySpread=pending#gap=5, and priorityRecoveryInvariants=passed. Normalized priority-recovery evidence selects operation_workflow_owner / rebalancer_handoff with dominant reason priority_recovery_rebalancer_handoff_retry_scheduled: four priority partitions have dispatch retry evidence against target ebc4aa0b-06c6-506d-93ea-1dd2deca3f58 while the rebalancer topology-settling log names node_ready_lease_incomplete for the same target.",
  "nextAction": "Fix or classify the priority follow-up target-selection boundary so rebalancer handoff does not create retry-loop operations for nodes already known to have incomplete ready leases, then rerun focused tests and rolling-restart.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-next.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-next.report.json --explain priority_recovery_partition_progress",
    "node scripts/check-runtime-grammar-contracts.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js",
    "node test/rebalancer/priority-follow-up-target-readiness.test.js",
    "node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-target-readiness.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "test/rebalancer/priority-follow-up-target-readiness.test.js",
    "test/rebalancer/operation-workflow-observed-progress-lane-held.test.js",
    "work/packages/todo-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/todo-20260508-rolling-restart-operation-workflow-progress-transition-deferred.md"
}
-->

Opened on May 8, 2026 after the workflow-progress package reran the
representative `rolling-restart` gate and migrated to
`operation_workflow_owner / rebalancer_handoff`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-next.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-next/rolling-restart/`.
3. Result: failed after `134525ms`.
4. Active gate: `3/5` nodes reached ACTIVE within `120000ms`.
5. Progress snapshot: `snapshotCoverage=3/5`, `publication=PUBLISHED`,
   `pendingAck=0`, `prioritySpread=pending#gap=5`.
6. Priority recovery invariants: `passed`.
7. Frontier edge: `priority_recovery_partition_progress`.
8. Owner and boundary:
   `operation_workflow_owner / rebalancer_handoff`.
9. Dominant reason:
   `priority_recovery_rebalancer_handoff_retry_scheduled`.
10. Blocked partitions: `control_plane_publications-p1`,
    `replica_operations-p1`, `sql_transaction_participants-p1`, and
    `sql_write_operations-p1`.
11. Dominant witness:
    `sql_write_operations-p1`, operation
    `738b81f6-136c-4e8d-bd35-1cb379e44c73`, workflow step `SENDING`,
    latest status `retry_deferred`, wait mode `retry_scheduled`, retry after
    `1000ms`, evidence source `operation_dispatch_retry_log`.
12. Playback logs show the handoff target as
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58` while the same node is also named
    by rebalancer `topology_settling_blocked` with blocker reason
    `node_ready_lease_incomplete`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the migrated `rebalancer_handoff` witness and log correlation.
2. Add a focused rebalancer follow-up target-readiness regression for
   known incomplete ready-lease candidates.
3. Repair only the priority follow-up target-selection boundary needed to
   avoid creating retry-loop handoffs for known not-ready targets.
4. Preserve the existing deferred workflow-owner readiness contract for
   otherwise valid priority follow-up moves.
5. Rerun the representative `rolling-restart --fast-local` gate.

## Out Of Scope

1. Harness timeout increases or presentation-only relabeling.
2. Broad startup, join, publication, or transport repair unless a fresh rerun
   promotes that boundary after this target-selection issue is fixed.
3. Reopening old workflow-progress, workflow-timeout, publication, or
   operation-scheduling packages unless fresh evidence restores them as the
   first frontier.
4. Phase `0.5`, Phase `1.0`, Pro, or Enterprise work.

## Invariants

1. Rebalancer target selection owns whether a new priority follow-up operation
   may be created for a candidate target.
2. Workflow-owner dispatch retry may keep retryable handoffs alive, but it
   must not be the first owner to discover that the rebalancer selected a
   target already known locally as ready-lease incomplete.
3. The existing `defer_to_workflow_owner` readiness mode remains valid for
   candidates that are not known locally as not-ready.
4. `rebalancer_handoff`, `retry_scheduled`, `dispatch_pending`, and
   `operation_dispatch_retry_log` must retain one canonical meaning across
   diagnostics, analyzer output, and focused tests.
5. No domain/runtime scalar, absence state, or independent branch lattice may
   be introduced while fixing the boundary.

## Hotspots

1. `src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
2. `test/rebalancer/priority-follow-up-target-readiness.test.js`
3. `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
4. `src/rebalancer/unified-rebalancer-segment-2.js`
5. `src/rebalancer/unified-rebalancer-segment-4-stage-4.js`
6. `src/control-plane/active-node-projection.js`

Dirty-worktree caution: do not touch unrelated existing edits in
`test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`,
`test/distributed/harness/failure-bundle-segment-4.js`, unrelated archived
tracker files, `exports/`, or the model-ledger deletion unless this package
explicitly adopts that scope.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Gauss (`019e093f-a973-7132-814e-6bdc386284a3`) reviewed
      `work/packages/todo-20260508-rolling-restart-operation-workflow-progress-transition-deferred.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Rawls (`019e0942-4819-7283-bb21-bc516f4728aa`) fixed
      `work/packages/todo-20260508-rolling-restart-operation-workflow-progress-transition-deferred.md`.
- [x] Implementation subagent recorded:
      Agent Hooke (`019e0947-8ec0-76f2-b14c-8fb2d826b166`) implemented
      `work/packages/todo-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`.
- [x] Follow-up review finding recorded:
      Agent Beauvoir (`019e0953-f39c-70a0-9630-5f8f739f0d2e`) reviewed
      `work/packages/todo-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`;
      result `fixes-required`.
- [x] Follow-up fix subagent recorded:
      Agent Dalton (`019e0958-51e1-7c23-a9f4-0e3c18676356`) fixed
      `work/packages/todo-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`.
- [x] Follow-up implementation subagent recorded:
      Agent Curie (`019e095d-88d1-7e13-a155-7fd65170821e`) implemented
      `work/packages/todo-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`.

## Static Drift Ledger

Preflight:

- [x] `node scripts/check-runtime-grammar-contracts.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
      passed with `0` runtime-grammar-contract violations.
- [x] `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`
      passed with `0` decision-boundary guideline violations.
- [x] `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`
      passed with `0` new literal-guideline violations.
- [x] `node --check src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
      and `node --check test/rebalancer/priority-follow-up-target-readiness.test.js`
      passed.

Closure:

- [x] Focused target-readiness regression passes.
- [x] Touched-file static guardrails pass after implementation.
- [ ] `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
      passes or is explicitly superseded by a narrower affected test.
- [ ] Representative `rolling-restart --fast-local` rerun passes or migrates
      to one named owner boundary.
- [ ] Package-owned changes are committed as one focused slice.
- [ ] The focused package slice is pushed before the next package starts.

## Failure Migration / Contraction

Current dominant blocker:
`priority_recovery_rebalancer_handoff_retry_scheduled`.

Current semantic owner:
`operation_workflow_owner`.

Current boundary:
`rebalancer_handoff`.

Generated evidence block:

```text
Source artifact: test-output/reports/rolling-restart-current-release-gate-next.report.json
Scenario: rolling-restart
Frontier edge: priority_recovery_partition_progress
Current semantic owner: operation_workflow_owner
Current boundary: rebalancer_handoff
Frontier state: blocked
Dominant reason: priority_recovery_rebalancer_handoff_retry_scheduled
Evidence path: report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness
Reasons: priority_recovery_event_driven_wait, priority_recovery_progress_blocked
Next explain command: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-next.report.json --explain priority_recovery_partition_progress
```

## Validation

Required implementation validation:

1. Focused rebalancer target-readiness regression.
2. `node test/rebalancer/priority-follow-up-target-readiness.test.js`
3. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
4. Touched-file literal, decision-boundary, runtime-grammar, syntax, and diff
   hygiene guardrails.
5. `npm run work:current-blocker`
6. `npm run work:validate`
7. `git diff --check`
8. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-target-readiness.report.json --fast-local --verbose`

Implementation subagent validation notes:

1. `node test/rebalancer/priority-follow-up-target-readiness.test.js`
   failed before the runtime fix on the new lease-incomplete target
   regression, then passed after the fix with `13/13` assertions.
2. `node --check src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
   passed.
3. `node --check test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed.
4. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
   passed with `0` runtime-grammar-contract violations.
5. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed with `0` decision-boundary guideline violations.
6. `node scripts/check-guideline-literals.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed with `0` new literal-guideline violations and `0` inherited
   baseline violations.
7. `git diff --check -- src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/priority-follow-up-target-readiness.test.js work/packages/todo-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`
   passed.

Fix subagent follow-up validation notes:

1. Addressed Beauvoir review finding that observed-progress events could be
   coalesced away when `handleObservedReplicaStateChange` entered
   `operationWorkflowRunExclusive` while the operation owner key was already
   held.
2. Added lane-held observed-progress retry scheduling in
   `src/rebalancer/operation-workflow-owner-segment-1.js` and
   `src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`.
3. Extended dispatch wake preemption in
   `src/rebalancer/operation-workflow-owner-segment-4.js` so cached target
   `creating` progress is reconciled from SENDING/CREATING wake paths before
   replaying create dispatch.
4. Added
   `test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
   covering lane-held observed target `creating` retry and SENDING dispatch
   wake reconciliation before create replay.
5. `node test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
   passed with `10/10` assertions.
6. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed with `62/62` assertions.
7. `node test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
   passed with `168/168` assertions.
8. `node --check src/rebalancer/operation-workflow-owner-segment-1.js`,
   `node --check src/rebalancer/operation-workflow-owner-segment-4.js`,
   `node --check src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`,
   and
   `node --check test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
   passed.
9. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`
   passed with `0` runtime-grammar-contract violations.
10. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
    passed with `0` decision-boundary guideline violations.
11. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.

Follow-up implementation subagent validation notes:

1. Inspected Dalton's observed-progress lane-held patch for integration issues
   against the package goal; no runtime or test corrections were required.
2. `node --check src/rebalancer/operation-workflow-owner-segment-1.js`,
   `node --check src/rebalancer/operation-workflow-owner-segment-4.js`,
   `node --check src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`,
   and
   `node --check test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
   passed.
3. `node test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
   passed with `10/10` assertions.

## Done When

1. Known ready-lease-incomplete follow-up targets do not produce new
   retry-loop `rebalancer_handoff` operations.
2. Existing deferred workflow-owner readiness behavior remains covered.
3. Required focused tests, static guardrails, work validation, and diff
   hygiene pass.
4. A representative `rolling-restart --fast-local` rerun passes or is recorded
   as one new owner-boundary migration.
5. The package has a truthful Commit And Push Ledger before closure.
