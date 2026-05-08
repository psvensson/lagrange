# Rolling Restart Operation Workflow Progress Persisted Not Dispatched

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-skip-retry/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_rebalancer_handoff_retry_scheduled",
  "currentState": "Ready-node rediscovery now keeps workflow-owner startup skips on the bounded dispatch retry lane. The follow-up rolling-restart rerun no longer reports the single sql_transactions-p1 persisted-not-dispatched workflow-progress witness as the dominant blocker. The fresh frontier is operation_workflow_owner / rebalancer_handoff with priority_recovery_rebalancer_handoff_retry_scheduled across sql_transaction_participants-p1 and sql_write_operations-p1.",
  "nextAction": "Resume the rebalancer-handoff retry-scheduled boundary with the fresh dispatch-skip-retry artifact, preserving the dispatch retry fix as package evidence.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_progress regression for timed-out cached PENDING dispatch/reconcile re-entry",
    "Touched-file runtime grammar, decision-boundary, literal-owner, syntax, and diff hygiene guardrails",
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --explain priority_recovery_partition_progress",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-shared.js",
    "test/control-plane/replica-dispatch-startup-operation-replay.test.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "test/rebalancer/operation-workflow-observed-progress-lane-held.test.js",
    "test/rebalancer/priority-follow-up-target-readiness.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true
}
-->

Opened on May 8, 2026 after the rebalancer-handoff package removed the
ready-lease-incomplete target retry loop and the observed-progress lane-held
fix allowed the previous `SENDING` operation to advance. The next
representative `rolling-restart` rerun still failed, but the first frontier
migrated back to `operation_workflow_owner / workflow_progress` with a
persisted `PENDING` operation that was not dispatched.

## Current Evidence

1. Pre-fix representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-observed-progress-lane-held.report.json --fast-local --verbose`
2. Pre-fix representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-observed-progress-lane-held.report.json`.
3. Pre-fix playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-observed-progress-lane-held/rolling-restart/`.
4. Pre-fix result: failed after approximately `132500ms`.
5. Pre-fix owner and boundary:
   `operation_workflow_owner / workflow_progress`.
6. Pre-fix blocking witness:
   `control_plane_publications-p1` was `recovering_in_flight` with
   `persisted_not_dispatched`, `dispatch_pending`, operation
   `d1b03d00-a486-47fb-94d5-c1e71f359eb6`, latest workflow step `PENDING`,
   latest status `pending`, and `advance_existing_operation` as the next
   required action.

## Follow-Up Evidence

1. Representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-persisted-not-dispatched.report.json --fast-local --verbose`
2. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-persisted-not-dispatched.report.json`.
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-persisted-not-dispatched/rolling-restart/`.
4. Result: failed after approximately `140048ms`.
5. Active gate: `3/5` nodes reached ACTIVE within `120000ms`.
6. Progress snapshot: `snapshotCoverage=3/5`, `publication=PUBLISHED`,
   `pendingAck=0`, `prioritySpread=pending#gap=5`.
7. Priority recovery invariants: `passed`.
8. Frontier edge: `priority_recovery_partition_progress`.
9. Owner and boundary:
   `operation_workflow_owner / workflow_progress`.
10. Dominant reason:
    `priority_recovery_workflow_progress_transition_deferred`.
11. Blocked partitions: `control_plane_publications-p1`,
    `sql_transaction_participants-p1`, and `sql_write_operations-p1`.
12. Dominant witness:
    `sql_write_operations-p1` is `needs_operation` with
    `priority_operation_serial_wait`, operation
    `6713758e-a94c-44a8-bd4e-e3b8e4eab4c6`, latest workflow step `PENDING`,
    latest status `pending`, and serial wait operation
    `7c1f0942-e0cb-4165-bd16-1d9a4e6dbb02` on
    `control_plane_publications-p1`.
13. Blocking witness:
    `control_plane_publications-p1` is `recovering_in_flight` with operation
    `7c1f0942-e0cb-4165-bd16-1d9a4e6dbb02` in `CREATING` / `creating`,
    workflow phase `target_creation`, actuation
    `dispatched_waiting_progress`, target visibility
    `active_non_operational`, and `wait_for_operation_progress` as the next
    required action.
14. Snapshot evidence shows the previous persisted-not-dispatched state
    advanced. The remaining blocker is now target-creation progress after the
    target learner is visible and promotable but not yet operational.

## Target-Creation Follow-Up Evidence

1. Representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress.report.json --fast-local --verbose`
2. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress.report.json`.
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress/rolling-restart/`.
4. Result: failed after approximately `131900ms`.
5. Active gate: `2/5` nodes reached ACTIVE within `120000ms`.
6. Progress snapshot: `snapshotCoverage=2/5`, `publication=PUBLISHED`,
   `pendingAck=0`, `prioritySpread=pending#gap=1`.
7. Priority recovery invariants: `passed`.
8. Frontier edge: `priority_recovery_partition_progress`.
9. Owner and boundary:
   `operation_workflow_owner / workflow_progress`.
10. Dominant reason:
    `BOOTSTRAP_PHASE_INCOMPLETE`.
11. Blocked partition: `sql_transaction_participants-p1`.
12. Blocking witness:
    `sql_transaction_participants-p1` is `recovering_in_flight` with operation
    `696b9436-6837-44d9-824c-2f0dd6dd3c5a` in `PENDING` / `pending`,
    workflow phase `dispatch_pending`, actuation
    `persisted_not_dispatched`, target visibility `absent`, and
    `advance_existing_operation` as the next required action.
13. The witness is fresh rather than timed out:
    `stepAgeMs=2779` under `stepTimeoutMs=30000`, with
    `timeoutReconcileDue=false`.
14. Snapshot evidence shows the target-creation progress blocker advanced.
    The remaining release gate is now a single late-created priority operation
    that had not yet dispatched before the startup active gate stopped.

## Repeat Follow-Up Evidence

1. Representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json --fast-local --verbose`
2. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json`.
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress-rerun/rolling-restart/`.
4. Result: failed after approximately `129679ms`.
5. Active gate: `3/5` nodes reached ACTIVE within `120000ms`.
6. Progress snapshot: `snapshotCoverage=3/5`, `publication=PUBLISHED`,
   `pendingAck=0`, `prioritySpread=pending#gap=5`.
7. Priority recovery invariants: `passed`.
8. Frontier edge: `priority_recovery_partition_progress`.
9. Owner and boundary:
   `operation_workflow_owner / workflow_progress`.
10. Dominant reason:
    `BOOTSTRAP_PHASE_INCOMPLETE`.
11. Blocked partition: `sql_transactions-p1`.
12. Blocking witness:
    `sql_transactions-p1` is `recovering_in_flight` with operation
    `28547787-9f0e-47d1-9f20-878c8b9529a2` in `PENDING` / `pending`,
    workflow phase `dispatch_pending`, actuation
    `persisted_not_dispatched`, target visibility `absent`, no timeline
    transitions, and `advance_existing_operation` as the next required action.
13. The witness is no longer a fresh timing sample:
    `stepAgeMs=49372` over `stepTimeoutMs=30000`, with
    `timeoutReconcileDue=true`.
14. This repeat classifies the remaining package frontier as a deterministic
    dispatch wake or timeout-reconcile gap for cached `PENDING` operations with
    no timeline transitions.

## Dispatch-Skip Retry Follow-Up Evidence

1. Representative command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --fast-local --verbose`
2. Representative report:
   `test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json`.
3. Playback directory:
   `test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-skip-retry/rolling-restart/`.
4. Result: failed after approximately `133215ms`.
5. Active gate: `3/5` nodes reached ACTIVE within `120000ms`.
6. Progress snapshot: `snapshotCoverage=3/5`, `publication=PUBLISHED`,
   `pendingAck=0`, `prioritySpread=pending#gap=5`.
7. Priority recovery invariants: `passed`.
8. Frontier edge: `priority_recovery_partition_progress`.
9. Owner and boundary:
   `operation_workflow_owner / rebalancer_handoff`.
10. Dominant reason:
    `priority_recovery_rebalancer_handoff_retry_scheduled`.
11. Blocked partitions:
    `sql_transaction_participants-p1` and `sql_write_operations-p1`.
12. The previous `sql_transactions-p1` timed-out
    `persisted_not_dispatched` / `dispatch_pending` witness is no longer the
    dominant frontier in the normalized analyzer output.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the latest workflow-progress persisted-not-dispatched witness.
2. Add the smallest owner-path regression for a coordinator-created priority
   `PENDING` operation that remains persisted but not dispatched.
3. Repair only the operation-workflow owner wake-up, replay, or re-entry path
   needed to advance that persisted operation.
4. Preserve the rebalancer-handoff target-readiness and observed-progress
   lane-held fixes from the predecessor package.
5. Rerun the representative `rolling-restart --fast-local` gate.

## Out Of Scope

1. Harness timeout increases or presentation-only relabeling.
2. Broad publication, startup, join, or transport work unless a fresh rerun
   promotes that owner boundary after workflow progress advances.
3. Reopening old residual packages unless fresh evidence restores their owner
   boundary as the first frontier.
4. Phase `0.5`, Phase `1.0`, Pro, or Enterprise work.

## Invariants

1. `operation_workflow_owner` remains the owner for progressing persisted
   operation workflow rows.
2. `workflow_progress`, `persisted_not_dispatched`, `dispatch_pending`,
   `transition_deferred`, and `priority_operation_serial_wait` retain one
   canonical meaning across diagnostics, analyzer output, and focused tests.
3. A persisted priority `PENDING` operation must have a deterministic owner
   re-entry path that either claims and dispatches it, wakes its remote owner,
   or records a retryable owner-boundary reason.
4. Serial-waiting priority partitions must remain attached to the blocking
   operation owner until that dependency advances or is classified.
5. No domain/runtime scalar, absence state, or independent branch lattice may
   be introduced while fixing this boundary.

## Hotspots

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/rebalancer/operation-workflow-owner-segment-1.js`
3. `src/rebalancer/operation-workflow-owner-segment-2.js`
4. `src/rebalancer/operation-workflow-owner-segment-4.js`
5. `src/rebalancer/operation-workflow-owner-segment-7*.js`
6. `src/rebalancer/rebalance-coordinator-segment-2.js`
7. `src/rebalancer/rebalance-coordinator-segment-3.js`
8. `src/control-plane/replica-dispatch-service-segment-*.js`
9. `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
10. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`

Dirty-worktree caution: do not touch unrelated existing edits in
`test/distributed/harness/__tests__/failure-bundle-core-16-test-cases.js`,
`test/distributed/harness/failure-bundle-segment-4.js`, unrelated archived
tracker files, `exports/`, or model-ledger files unless this package explicitly
adopts that scope.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Zeno (`019e096b-42c5-7be2-8ebd-2642758b6d83`) reviewed
      `work/packages/done-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md`;
      result `clean`.
- [x] Fix subagent recorded or explicitly not needed: `not-needed`.
- [x] Implementation subagent recorded:
      Agent Ampere (`019e0977-f38c-7233-a8c9-291455a48a0c`) implemented
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`.
- [x] Follow-up review subagent recorded:
      Agent Gibbs (`019e098a-508a-7d70-a961-2f99bed6924e`) reviewed
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`;
      result `fixes-required`.
- [x] Follow-up fix subagent recorded:
      Agent McClintock (`019e098c-bce3-7682-8362-38252955a5a1`) fixed
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`.
- [x] Follow-up implementation subagent recorded:
      Agent Pascal (`019e098f-68d8-7841-8711-7b750ecef2f4`) implemented
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`.
- [x] Follow-up review finding recorded:
      Agent Helmholtz (`019e09a6-9606-7162-971f-2cb558f4a356`) reviewed
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`;
      result `fixes-required`.
- [x] Follow-up fix recorded:
      Agent Lorentz (`019e09aa-156b-7c33-b52f-dd8eccc67f23`) fixed
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`.
- [x] Follow-up implementation recorded:
      Agent Parfit (`019e09ad-c503-7cc1-a189-6f8aa672b85a`) implemented
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`.
- [x] Closure review finding recorded:
      Agent Lovelace (`019e09c3-505c-7303-9002-f5f2f8d17d5b`) reviewed
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`;
      result `fixes-required`.
- [x] Closure fix recorded:
      Agent Noether (`019e09c7-67c7-7b11-8ebe-8c60c72fff15`) fixed
      `work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`.

## Static Drift Ledger

Preflight:

- [x] Latest representative owner evidence recorded from the failed
      `rolling-restart` report.
- [x] Existing unrelated dirty files classified as out of scope.
- [x] Boundary-scoped baseline guardrails recorded by implementation
      subagent before additional package edits:
      production owner literal, decision-boundary, runtime-grammar, and
      syntax checks passed on the owner files; `--include-tests` literal audit
      reported inherited fixture-literal debt in the two focused test files.

Closure:

- [x] Focused workflow-progress regression passes.
- [x] Touched-file static guardrails pass after implementation for production
      owner files and clean new test probes. Accepted exception:
      `node scripts/check-guideline-literals.js --include-tests test/control-plane/replica-dispatch-startup-operation-replay.test.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js test/rebalancer/priority-follow-up-target-readiness.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
      remains red with `317` test-fixture literal violations retained in this
      combined uncommitted package slice: `204` in
      `test/control-plane/replica-dispatch-node-state-update.test-part-2.js`,
      `72` in
      `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`,
      and `41` in
      `test/rebalancer/priority-follow-up-target-readiness.test.js`.
- [x] `npm run work:current-blocker` and `npm run work:validate` pass.
- [x] `git diff --check` passes for the package-owned slice.
- [x] Representative `rolling-restart --fast-local` rerun passes or migrates
      to one named owner boundary.
- [x] Focused implementation changes are committed as `970cfb9c`; the local
      package-status handoff is prepared here for the parent commit.
- [x] The focused implementation slice is pushed to
      `origin/codex/pending-ack-eligibility-filter`; this fix subagent did not
      push the tracker handoff by instruction.

## Failure Migration / Contraction

Current dominant blocker:
`priority_recovery_rebalancer_handoff_retry_scheduled`.

Current semantic owner:
`operation_workflow_owner`.

Current boundary:
`rebalancer_handoff`.

Generated evidence block:

```text
Source artifact: test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json
Scenario: rolling-restart
Frontier edge: priority_recovery_partition_progress
Current semantic owner: operation_workflow_owner
Current boundary: rebalancer_handoff
Frontier state: blocked
Dominant reason: priority_recovery_rebalancer_handoff_retry_scheduled
Evidence path: report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness
Reasons: priority_recovery_event_driven_wait, priority_recovery_progress_blocked
Next explain command: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --explain priority_recovery_partition_progress
```

## Validation

Required implementation validation:

1. Focused workflow-progress owner regression for persisted
   `PENDING` operations.
2. Affected existing workflow-owner tests.
3. Touched-file literal, decision-boundary, runtime-grammar, syntax, and diff
   hygiene guardrails.
4. `npm run work:current-blocker`
5. `npm run work:validate`
6. `git diff --check`
7. Representative
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --fast-local --verbose`

Validation progress:

1. `node --test test/control-plane/replica-dispatch-startup-operation-replay.test.js`
   passed with `4` tests.
2. `node --check src/control-plane/replica-dispatch-service-segment-1.js && node --check test/control-plane/replica-dispatch-startup-operation-replay.test.js`
   passed.
3. `node scripts/check-guideline-literals.js src/control-plane/replica-dispatch-service-segment-1.js`
   passed with `0` new literal-guideline violations and `0` inherited
   baseline violations.
4. `node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-1.js`
   passed with `0` decision-boundary guideline violations.
5. `npm run audit:runtime-grammar:file -- src/control-plane/replica-dispatch-service-segment-1.js`
   passed with `0` runtime-grammar-contract violations.
6. `node scripts/check-guideline-literals.js --include-tests test/control-plane/replica-dispatch-startup-operation-replay.test.js`
   passed with `0` new literal-guideline violations and `0` inherited
   baseline violations.
7. `git diff --check -- src/control-plane/replica-dispatch-service-segment-1.js test/control-plane/replica-dispatch-startup-operation-replay.test.js work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md`
   passed.
8. `npm run work:current-blocker`
   passed and refreshed `work/sprints/current-blocker.json` plus
   `work/sprints/current-blocker.md`.
9. `npm run work:validate`
   passed with tracker validation OK for `11` files.
10. `git diff --check -- src/control-plane/replica-dispatch-service-segment-1.js test/control-plane/replica-dispatch-startup-operation-replay.test.js work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md work/sprints/current-blocker.json work/sprints/current-blocker.md`
   passed.
11. `node test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
    passed with `39` assertions.
12. `node test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
    passed with `62` assertions.
13. `node test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
    passed with `15` assertions.
14. `node test/rebalancer/priority-follow-up-target-readiness.test.js`
    passed with `13` assertions.
15. `node scripts/check-runtime-grammar-contracts.js src/control-plane/replica-dispatch-service-segment-1.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
    passed with `0` runtime-grammar-contract violations.
16. `node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-1.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/control-plane/replica-dispatch-startup-operation-replay.test.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js test/rebalancer/priority-follow-up-target-readiness.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
    passed with `0` decision-boundary guideline violations.
17. `node scripts/check-guideline-literals.js src/control-plane/replica-dispatch-service-segment-1.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.
18. `node scripts/check-guideline-literals.js --include-tests test/control-plane/replica-dispatch-startup-operation-replay.test.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.
19. `node scripts/check-guideline-literals.js --include-tests test/control-plane/replica-dispatch-startup-operation-replay.test.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js test/rebalancer/priority-follow-up-target-readiness.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
    remains red with `143` reported test-fixture literal violations in the
    predecessor rebalancer fixture files; the new startup replay test remains
    clean.
20. `git diff --check -- src/control-plane/replica-dispatch-service-segment-1.js test/control-plane/replica-dispatch-startup-operation-replay.test.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js test/rebalancer/priority-follow-up-target-readiness.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md work/packages/done-20260508-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md work/packages/todo-20260508-rolling-restart-operation-workflow-progress-transition-deferred.md work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md`
    passed.
21. `node test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
    passed with `41` assertions.
22. `node --check test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
    passed.
23. `git diff --check -- test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
    passed.
24. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-persisted-not-dispatched.report.json --fast-local --verbose`
    failed after approximately `140048ms`, but contracted the previous
    `persisted_not_dispatched` blocker to `target_creation` /
    `dispatched_waiting_progress` on `control_plane_publications-p1`.
25. `node --check src/rebalancer/operation-workflow-owner-segment-7-stage-2.js && node --check test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
    passed after the target-creation observed-progress regression landed.
26. `node scripts/check-runtime-grammar-contracts.js src/control-plane/replica-dispatch-service-segment-1.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
    passed with `0` runtime-grammar-contract violations.
27. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-2.js`
    passed with `0` runtime-grammar-contract violations.
28. `node scripts/check-guideline-literals.js src/control-plane/replica-dispatch-service-segment-1.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.
29. `node scripts/check-guideline-literals.js --include-tests test/control-plane/replica-dispatch-startup-operation-replay.test.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.
30. `node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-1.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-2.js src/rebalancer/unified-rebalancer-segment-4-stage-3.js test/control-plane/replica-dispatch-startup-operation-replay.test.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js test/rebalancer/priority-follow-up-target-readiness.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
    passed with `0` decision-boundary guideline violations.
31. `git diff --check -- src/rebalancer/operation-workflow-owner-segment-7-stage-2.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md work/sprints/current-blocker.json work/sprints/current-blocker.md`
    passed.
32. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress.report.json --fast-local --verbose`
    failed after approximately `131900ms`, but contracted the target-creation
    progress blocker to a single fresh `PENDING` /
    `persisted_not_dispatched` operation on `sql_transaction_participants-p1`
    with `stepAgeMs=2779` under `stepTimeoutMs=30000`.
33. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json --fast-local --verbose`
    failed after approximately `129679ms` and repeated the
    `persisted_not_dispatched` class on `sql_transactions-p1`; this witness
    was timed out with `stepAgeMs=49372`, `stepTimeoutMs=30000`, no timeline
    transitions, and `timeoutReconcileDue=true`.
34. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json --scenario rolling-restart`
    passed and reported `rootCauseClass=startup`,
    `dominantReason=BOOTSTRAP_PHASE_INCOMPLETE`, plus
    `priority_recovery_actuation_state_persisted_not_dispatched`,
    `priority_recovery_owner_operation_workflow_owner`, and
    `priority_recovery_next_action_advance_existing_operation`.
35. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json`
    passed and preserved the frontier as
    `operation_workflow_owner / workflow_progress`.
36. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json --explain priority_recovery_partition_progress`
    passed and identified `sql_transactions-p1` as the blocked partition.
37. `node --test test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
    passed with `87` tests.
38. `node --check src/control-plane/replica-dispatch-service-segment-2.js && node --check src/control-plane/replica-dispatch-service-shared.js && node --check test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
    passed.
39. `node scripts/check-guideline-literals.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-shared.js`
    passed with `0` new literal-guideline violations and `0` inherited
    baseline violations.
40. `node scripts/check-guideline-literals.js --include-tests test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
    remains red with `204` reported legacy test-fixture literal violations in
    the touched file; the added regression uses named constants for its new
    string evidence.
41. `node scripts/check-guideline-decision-boundaries.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-shared.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
    passed with `0` decision-boundary guideline violations.
42. `npm run audit:runtime-grammar:file -- src/control-plane/replica-dispatch-service-segment-2.js`
    passed with `0` runtime-grammar-contract violations.
43. `npm run audit:runtime-grammar:file -- src/control-plane/replica-dispatch-service-shared.js`
    passed with `0` runtime-grammar-contract violations.
44. `git diff --check -- src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-shared.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js work/packages/done-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md work/sprints/current-blocker.json work/sprints/current-blocker.md`
    passed.
45. `npm run work:current-blocker` and `npm run work:validate`
    passed; tracker validation reported OK for `11` files.
46. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --fast-local --verbose`
    failed after approximately `133215ms`, but the previous timed-out
    `persisted_not_dispatched` / `dispatch_pending` witness was no longer the
    dominant frontier. The fresh blocker migrated to
    `operation_workflow_owner / rebalancer_handoff` with
    `priority_recovery_rebalancer_handoff_retry_scheduled` across
    `sql_transaction_participants-p1` and `sql_write_operations-p1`.
47. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --scenario rolling-restart`
    passed and reported `rootCauseClass=topology`,
    `dominantReason=priority_recovery_rebalancer_handoff_retry_scheduled`,
    active gate `3/5`, snapshot coverage `3/5`, publication `PUBLISHED`, and
    priority recovery invariants `passed`.
48. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json`
    passed and preserved the frontier as
    `operation_workflow_owner / rebalancer_handoff`.
49. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --explain priority_recovery_partition_progress`
    passed and identified `sql_transaction_participants-p1` plus
    `sql_write_operations-p1` as blocked partitions.
50. `node scripts/check-guideline-literals.js --include-tests test/control-plane/replica-dispatch-startup-operation-replay.test.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/rebalancer/operation-workflow-observed-progress-lane-held.test.js test/rebalancer/priority-follow-up-target-readiness.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
    remains red with `317` reported test-fixture literal violations retained
    as a precise accepted exception for this combined uncommitted package
    slice; do not claim the touched-file include-tests literal guardrail fully
    passed.

## Done When

1. Persisted priority `PENDING` operations no longer remain
   `persisted_not_dispatched` without an owner retry or dispatch path.
2. Serial-waiting priority partitions advance once their blocking operation
   is dispatched.
3. Required focused tests, static guardrails, tracker validation, and diff
   hygiene pass.
4. A representative `rolling-restart --fast-local` rerun passes or is recorded
   as one new owner-boundary migration.
5. The package has a truthful Commit And Push Ledger before closure.

## Commit And Push Ledger

- Focused package commit: 970cfb9c
- Pushed to: origin/codex/pending-ack-eligibility-filter
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes

Closure handoff note: `970cfb9c` is the pushed focused implementation slice
before the local `done-*` rename. Lovelace's closure review found the package
status rename, current-blocker refresh, and successor activation were still
local-only. This fix prepares those tracker files for the parent to commit and
push; this fix subagent did not commit or push by instruction.
