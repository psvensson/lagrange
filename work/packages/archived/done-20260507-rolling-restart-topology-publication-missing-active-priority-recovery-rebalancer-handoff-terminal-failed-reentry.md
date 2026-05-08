# Rolling Restart Topology Publication Missing-Active Priority Recovery Rebalancer Handoff Terminal-Failed Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z/rolling-restart/",
  "owner": "Priority recovery rebalancer handoff retry-lane preservation for critical replica create failures behind topology publication missing-active reentry",
  "boundary": "Priority recovery rebalancer handoff / workflow-progress retry lane",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The retryable create-failure handoff seam is closed. Executor outcomes now preserve retry metadata, the owner reconcile path keeps critical retryable create failures in the transition-retry lane, focused tests and touched-file guardrails pass, and the representative rerun no longer selects priority_recovery_rebalancer_handoff_terminal_failed. The live blocker migrated to epoch 5 OPEN publication convergence with pendingAckCount 1, missingPublishedCount 2, and dominant reason publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md for the current epoch 5 OPEN publication convergence boundary over missing-active nodes 11601... and 8be8..., pending-ack node ebc4..., and supporting workflow-progress witnesses on replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1.",
  "proof": [
    "Focused 044845Z retryable create-handoff witness regression",
    "Focused critical create-failure owner retry-lane regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/node/replica-handler-class-part-1.js",
    "src/rebalancer/executor-outcome-constants.js",
    "src/rebalancer/executor-outcome-emitter.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/rebalancer/executor-outcome-emitter.test.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-rebalancer-handoff-terminal-failed-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md",
  "closed": "2026-05-07",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Recovery Eligible-Cohort Replace-Safety Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md)
closed by migration. The materialized-target superseded-cohort seam is closed,
and this package owns the next direct priority-recovery handoff failure.

Closure update on May 7, 2026: the representative `044845Z` playback proved the
selected failure was not a true terminal `REPLICA_CREATE_FAILED` boundary. The
target bootstrap owner raised a retryable
`Operational message-group ingress not ready for replica_operations CDC subscription`
error, but the runtime dropped retry metadata between replica creation,
executor outcome emission, and owner reconcile. This slice now preserves
`errorCode`, `retryAfterMs`, and `deferRetry` across that path and converts
retryable critical create failures into deferred transition retry instead of
terminal operation failure. The representative rerun
`test-output/reports/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z.report.json`
no longer selects `priority_recovery_rebalancer_handoff_terminal_failed` as the
live blocker and therefore closes this package by migration.

## Closing Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z/rolling-restart/`.
3. Result: failed after `132.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. The focused owner-path regression now preserves the `044845Z`
   `replica_operations-p1` retryable create witness:
   operation `6c0118c8-21a7-41f6-9f8c-57ecb2801c1d` no longer turns
   `Operational message-group ingress not ready for replica_operations CDC subscription`
   into terminal `OPERATION_FAILED`.
6. `node --test test/rebalancer/executor-outcome-emitter.test.js` passed after
   executor outcomes were extended to retain retry metadata.
7. `./node_modules/.bin/tap test/rebalancer/rebalance-coordinator-outcome-routing.test.js`
   passed after the owner reconcile path routed retryable critical create
   failures into `deferTransitionRetry(...)` rather than `failOperation(...)`.
8. Touched-file guardrails passed on the focused file set:
   literal ownership `0 new violations`, decision-boundary `0 violations`,
   runtime grammar `0 violations`, and `git diff --check` clean.
9. The representative rerun no longer classifies as
   `priority_recovery_progress_blocked` on dominant reason
   `priority_recovery_rebalancer_handoff_terminal_failed`. It now classifies as
   root cause class `topology`, dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`, and
   failure class `publication_convergence_blocked`.
10. Publication convergence in the new artifact is epoch `5` `OPEN` with
    pending ACK count `1`, missing-published nodes `11601...` and `8be8...`,
    pending-ack node `ebc4...`, and three supporting priority partitions still
    unresolved: `replica_operations-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `044845Z` rebalancer-handoff witness set for
   `replica_operations-p1` and the supporting `sql_transactions-p1`
   follow-up debt.
2. Add a focused owner-path regression that proves retryable critical create
   failures stay inside the canonical transition-retry lane.
3. Repair only the selected owner path between replica create failure,
   executor outcome emission, and owner reconcile.
4. Preserve the closed eligible-cohort replace-safety regression from the
   predecessor package.

## Out Of Scope

1. Reopening the closed materialized-target superseded-cohort seam unless the
   same rejection reappears directly in fresh playback.
2. Broad publication-convergence or startup-join repair beyond the live
   `044845Z` retryable create handoff boundary.
3. Harness-only timeout increases or readiness exemptions.
4. Broad matrix continuation before the representative blocker closes or
   migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Rebalancer handoff owns the boundary if priority recovery creates or resumes
   a follow-up operation and then misclassifies a retryable target-side create
   failure as terminal.
2. Operation-workflow ownership owns the boundary if canonical retry metadata
   reaches the owner reconcile path and the operation still fails terminally
   instead of re-entering the transition retry lane.
3. Startup/bootstrap readiness is supporting evidence unless the target-side
   retryable admission error is lost or reinterpreted before the canonical
   owner path can defer it.

Canonical contract shape:

1. A retryable critical `REPLICA_CREATE_FAILED` outcome must preserve retry
   semantics from the replica handler to the owner reconcile path.
2. The owner reconcile path must emit one canonical result for that failure:
   either deferred transition retry for retryable critical create failures or
   terminal failure for non-retryable outcomes.
3. Focused tests, failure-bundle evidence, and the representative rerun must
   agree on whether the named create failure is still the selected dominant
   blocker.

## Residual Closure Inventory

- [x] Extract the `044845Z` rebalancer-handoff / stalled-follow-up witness
      fixture.
- [x] Decide the direct owner boundary: rebalancer follow-up scheduling,
      workflow handoff persistence, or startup-side acceptability of the
      created follow-up.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.
      Focused file-set status for this slice remained clean:
      `node scripts/check-guideline-literals.js ...` ->
      `0 new literal-guideline violations`;
      `node scripts/check-guideline-decision-boundaries.js ...` ->
      `0 decision-boundary guideline violations`;
      `node scripts/check-runtime-grammar-contracts.js ...` ->
      `0 runtime-grammar-contract violations`;
      `git diff --check` -> clean.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `node --test test/rebalancer/executor-outcome-emitter.test.js`
   passed.
2. `./node_modules/.bin/tap test/rebalancer/rebalance-coordinator-outcome-routing.test.js`
   passed.
3. `node scripts/check-guideline-literals.js src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/executor-outcome-emitter.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/executor-outcome-emitter.test.js test/rebalancer/rebalance-coordinator-outcome-routing.test.js`
   passed with `0 new literal-guideline violations`.
4. `node scripts/check-guideline-decision-boundaries.js src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/executor-outcome-emitter.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`
   passed with `0 decision-boundary guideline violations`.
5. `node scripts/check-runtime-grammar-contracts.js src/node/replica-handler-class-part-1.js src/rebalancer/executor-outcome-constants.js src/rebalancer/executor-outcome-emitter.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`
   passed with `0 runtime-grammar-contract violations`.
6. `git diff --check`
   passed.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-retryable-create-handoff-preserve-20260507T053417Z.report.json --fast-local --verbose`
   failed after `132.9s`, but moved the blocker forward from priority recovery
   rebalancer handoff terminal failure to epoch `5` `OPEN` publication
   convergence with missing-active nodes `11601...` and `8be8...`.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the priority recovery rebalancer-handoff terminal-failed boundary with
   replayable evidence.
2. Sprint bookkeeping points to the successor package as the sole current
   representative owner.

## Migration

This package closes by migration. The repaired boundary was retryable critical
replica-create failure handling across `ReplicaHandler`,
`ExecutorOutcomeEmitter`, and owner reconcile for priority-recovery handoff.
The successor package is
[Rolling Restart Topology Publication Missing-Active Publication Convergence Open Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-publication-convergence-open-reentry.md),
which owns the epoch `5` `OPEN` publication convergence blocker with
missing-active nodes `11601...` and `8be8...`, pending-ack node `ebc4...`,
and supporting workflow-progress witnesses on
`replica_operations-p1`, `sql_transactions-p1`, and
`sql_write_operations-p1`.
