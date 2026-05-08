# Rolling Restart Topology Priority Recovery Operation Scheduling Post-Publication Closure Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z/rolling-restart/",
  "owner": "Topology priority-recovery operation scheduling regression after publication closure and dispatch-replay repair",
  "boundary": "Rebalancer leader / operation_scheduling",
  "dominantReason": "publication_epoch_pending",
  "currentState": "The observer-only authoritative-visibility repair closes the post-publication rebalancer scheduling seam by migration. The new representative rerun fails earlier at startup/publication convergence with epoch 3 OPEN, pendingAck=1 on ebc4..., snapshot coverage 3/5, 35a... degraded under observability backlog, and sql_write_operations-p1 demoted from create_recovery_operation to workflow-progress serial wait behind sql_transactions-p1 operation 6d1346a9-2655-427e-8d80-31fbc193919d.",
  "nextAction": "Continue in work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md to extract the epoch-3 OPEN publication/startup witness, pick the direct lower owner, and repair the new convergence boundary.",
  "proof": [
    "Focused post-publication operation-scheduling witness extraction",
    "Focused observer-only authoritative operation visibility regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and startup/publication convergence frontier analysis"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-5-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/packages/done-20260507-rolling-restart-topology-priority-recovery-operation-scheduling-post-publication-closure-reentry.md",
    "work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-operation-workflow-progress-dispatch-replay-reentry.md",
  "successor": "work/packages/done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Operation Workflow Progress Dispatch Replay Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-operation-workflow-progress-dispatch-replay-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Startup Publication Open Convergence Priority Serial-Wait Workflow Progress Reentry](./done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md).

## Closure Summary

1. Added an observer-only visibility fallback in the workflow owner so
   partition decision snapshots can recover authoritative entity-scoped
   priority REPLACE rows even when the local incomplete-operation view is
   empty.
2. Added a focused regression proving an observer node recovers the remote
   authoritative operation id for `sql_write_operations-p1` instead of
   collapsing to `null` / `operation_unknown`.
3. Focused rebalancer tests and touched-file guardrails passed after the fix.
4. The representative rerun
   `rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z`
   no longer supports the post-publication `rebalancer_leader /
   operation_scheduling` seam as the direct owner.
5. The live blocker migrated earlier to startup/publication convergence:
   epoch `3` `OPEN`, pending ACK node `ebc4...`, snapshot coverage `3/5`,
   degraded node `35a...`, and `sql_write_operations-p1` waiting behind
   serial-wait workflow-progress evidence from `sql_transactions-p1`
   operation `6d1346a9-2655-427e-8d80-31fbc193919d`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z/rolling-restart/`.
3. Result: failed after `133.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Publication convergence now fails earlier at epoch `3` `OPEN` with pending
   ACK node `ebc4...`, missing-published node ids
   `11601...|8be8...`, snapshot coverage `3/5`, and recovery protocol state
   `publication_pending`.
6. Active-gate readiness reports node `35a...` as degraded under
   `OBSERVABILITY_BACKLOG` and
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`, while `7493...` falls back to a
   readiness probe timeout witness.
7. Priority recovery no longer blocks on
   `eligible_but_no_operation_created`. The selected unresolved classes are
   `priority_operation_serial_wait` for `sql_write_operations-p1` and
   `operation_created_but_no_step_transitions` for `sql_transactions-p1`.
8. `sql_write_operations-p1` is now a supporting workflow-progress witness:
   semantic state `needs_operation`, owner `operation_workflow_owner`,
   boundary `workflow_progress`, next action `wait_for_operation_progress`,
   and serial-wait dependency on operation
   `6d1346a9-2655-427e-8d80-31fbc193919d`.
9. The repaired observer-visibility seam is therefore closed enough to stop
   being the representative owner; the blocker has migrated to the new
   startup/publication convergence boundary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed dispatch-replay regressions from the predecessor
   package.
2. Extract the post-publication `sql_write_operations-p1`
   `eligible_but_no_operation_created` witness.
3. Add a focused regression for rebalancer-side event-driven re-entry after
   routing-readiness or candidate-feasibility changes.
4. Repair only the selected `rebalancer_leader / operation_scheduling`
   boundary.
5. Rerun focused tests, touched-file guardrails, and one representative
   `rolling-restart` scenario.

## Out Of Scope

1. Reopening the closed dispatch-replay package unless the representative
   rerun again selects `operation_workflow_owner / workflow_progress` as the
   deepest owner.
2. Broad publication-owner or bootstrap-join rewrites while publication is
   already `PUBLISHED`.
3. Harness-only timeout increases or blocker relabeling.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `rebalancer_leader / operation_scheduling` owns this package only while the
   selected blocker remains `needs_operation` with
   `nextRequiredAction=create_recovery_operation`.
2. Supporting in-flight workflow rows on sibling partitions do not move the
   owner boundary downward unless the selected partition also has an operation
   id and concrete workflow-progress evidence.
3. Candidate-feasibility or routing-readiness changes must re-enter the same
   scheduling boundary if the first observation could not create a recovery
   operation.

Canonical contract shape:

1. Publication closure must leave one deterministic follow-up trigger that can
   re-evaluate priority spread once routing-readiness evidence changes.
2. Temporary `routing_not_ready` rejection may defer create-time scheduling,
   but it must not permanently strand a `needs_operation` partition in
   `event_driven` wait mode without a new operation id.
3. The representative rerun must either create the missing recovery operation
   or migrate to a new explicit owner boundary with fresh evidence.

## Package Bookkeeping Note

The prior local-session Subagent Sequencing Ledger entries were removed rather
than restated falsely. This run does not provide auditable real-agent
identities for the earlier predecessor-package review/fix/implementation
sequence, so that proof remains unresolved here.

The Commit And Push Ledger proof gap is also unresolved in the current local
worktree. This package file is untracked locally and `git log --` for this path
returns no commit history, so a truthful focused-package commit SHA and pushed
remote/branch cannot be reconstructed without inventing data.

## Residual Closure Inventory

- [x] Extract the post-publication `sql_write_operations-p1`
      operation-scheduling witness fixture in package form.
- [x] Add the focused rebalancer event-driven re-entry regression.
- [x] Repair the selected scheduling boundary.
- [x] Rerun focused tests and touched-file static guardrails.
- [x] Rerun one representative `rolling-restart` scenario and record whether
      the blocker closes or migrates again.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npx tap test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed after adding a regression that proves observer-only workflow-owner
   snapshots recover authoritative remote partition operations.
2. `npx tap test/rebalancer/priority-follow-up-target-readiness.test.js`
   passed.
3. `npx tap test/rebalancer/unified-rebalancer-part-5-2-stage-4.js` passed.
4. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   returned `0 decision-boundary guideline violations`.
5. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   returned `0 runtime-grammar-contract violations`.
6. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   returned `0 new literal-guideline violations` and matched `0` inherited
   baseline violations.
7. `git diff --check -- src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-5-stage-5.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   passed.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-observer-visibility-20260507T000000Z.report.json --fast-local --verbose`
   failed after `133.3s`, but migrated the representative blocker away from
   post-publication rebalancer scheduling to startup/publication convergence
   at epoch `3` `OPEN`.

## Migration

This package closes by migration. The repaired boundary was observer-only
authoritative visibility for post-publication priority recovery scheduling. The
successor package is
[Rolling Restart Startup Publication Open Convergence Priority Serial-Wait Workflow Progress Reentry](./done-20260507-rolling-restart-startup-publication-open-convergence-priority-serial-wait-workflow-progress-reentry.md),
which now owns the epoch `3` `OPEN` startup/publication convergence failure.
