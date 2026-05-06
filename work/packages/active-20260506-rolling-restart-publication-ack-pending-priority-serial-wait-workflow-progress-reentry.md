# Rolling Restart Publication ACK-Pending Priority Serial-Wait Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z/rolling-restart/",
  "owner": "Publication recovery gate over pending ACK convergence and priority serial-wait workflow progress",
  "boundary": "Publication ACK-pending priority serial-wait workflow progress",
  "dominantReason": "pending_ack_nodes",
  "currentState": "The bootstrap request startup-admission seam is closed: joiner ebc4... now reaches ACTIVE. The representative rerun migrates to epoch 4 ACK_PENDING with pending ACK node 11601..., active-gate best progress 3/5 and current progress 2/5 on selected snapshot ebc4... coverage 2/5. Priority recovery narrows to sql_transactions-p1 blocked by priority_operation_serial_wait behind sql_write_operations-p1 and sql_transaction_participants-p1 still recovering_in_flight, so the live owner is publication convergence over workflow progress, not join admission.",
  "nextAction": "Extract the 213144Z epoch-4 ACK_PENDING priority workflow fixture, decide whether sql_transactions-p1 serial-wait or selected-snapshot publication disagreement is the canonical current owner, then repair only that publication/workflow path.",
  "proof": [
    "Focused 213144Z publication ACK-pending fixture",
    "Owner regression for pending-ACK serial-wait workflow progress",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "src/control-plane/priority-recovery-snapshot-stage-shared.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/distributed/harness/__tests__/failure-bundle.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-join-contacting-seed-bootstrap-readiness-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Join Contacting Seed Bootstrap Readiness Reentry](./done-20260506-rolling-restart-startup-join-contacting-seed-bootstrap-readiness-reentry.md)
closed by migration. The bootstrap request startup gate now admits the
recovery-authorized join path, so the representative seam has moved away from
startup bootstrap admission and back into publication convergence.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z/rolling-restart/`.
3. Result: failed after `132.8s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification: `publication_convergence_blocked` with confidence
   `high`, root cause class `topology`, dominant reason `pending_ack_nodes`.
6. Publication convergence is epoch `4` `ACK_PENDING` with pending ACK node
   `11601fe0-72d6-5853-8590-ec2881853e72`, blocked node count `0`, missing
   published count `0`, and recovery protocol state `publication_pending`.
7. Active-gate best progress reaches active `3/5`; terminal current progress
   regresses to active `2/5`, selected snapshot coverage `2/5`, selected
   snapshot node `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`, and blocker
   signature
   `inactive_nodes=3|snapshot_coverage=2/5|priority_recovery_progress_class=priority_operation_serial_wait`.
8. `sql_transaction_participants-p1` is `recovering_in_flight` under
   `operation_workflow_owner / workflow_progress`, with actuation state
   `dispatched_waiting_progress`.
9. `sql_transactions-p1` is `needs_operation`, but the stronger witness is
   blocker class `priority_operation_serial_wait` behind serial-wait
   operation `4cd0c9fd-2e25-43aa-b9c0-ac80bd82d575` on
   `sql_write_operations-p1`.
10. Startup join failures remain subordinate evidence only: the repaired
    bootstrap admission seam moved `ebc4...` to `ACTIVE`, while
    `35a891...` and `8be8...` still retain join-time `fetch failed`
    evidence in the playback history.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `213144Z` epoch-`4` `ACK_PENDING` fixture for the
   `sql_transaction_participants-p1` and `sql_transactions-p1` workflow
   witnesses.
2. Decide whether `sql_transactions-p1` serial-wait workflow progress is the
   canonical owner, or whether selected-snapshot publication disagreement now
   outranks it.
3. Repair only the selected publication/workflow owner path.
4. Preserve the closed bootstrap request startup-admission regression.

## Out Of Scope

1. Reopening the closed startup bootstrap-admission package unless the
   representative rerun re-enters that exact seam.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Publication recovery gate for epoch `4` `ACK_PENDING` convergence while
   blocked-node count stays `0` and missing-published count stays `0`.
2. `operation_workflow_owner` progress for `sql_transaction_participants-p1`
   and `sql_transactions-p1` when publication still waits on priority spread.
3. Selected snapshot coverage and disagreement only as supporting evidence
   unless they outrank the pending-ACK workflow contract.

Canonical contract shape:

1. `pending_ack_nodes` publication state must surface one bounded priority
   workflow blocker that explains why the ACK cannot close.
2. `priority_operation_serial_wait` must persist only while its predecessor
   workflow is still live; otherwise it must clear or yield to one stronger
   blocker.
3. Failure bundle, replay, sprint bookkeeping, and focused fixture evidence
   must agree on one canonical owner and one subordinate publication view.

## Residual Closure Inventory

- [ ] Extract the `213144Z` publication ACK-pending fixture.
- [ ] Decide the owner boundary: serial-wait workflow progress or selected
      snapshot publication disagreement.
- [ ] Add the focused regression and repair the selected owner path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Progress Notes

May 6 migration from the startup bootstrap-admission package:

1. The bootstrap request owner now uses the recovery-authorized bootstrap-join
   projection instead of hard-gating on startup completion.
2. Focused bootstrap API regression, broader bootstrap API suite, and touched
   bootstrap-file guardrails all passed after the repair.
3. Representative rerun
   `rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z`
   moved `ebc4...` into `ACTIVE` and closed the startup bootstrap-admission
   owner seam.
4. The new contraction package owns epoch `4` `ACK_PENDING` publication
   convergence with narrowed priority workflow debt on
   `sql_transactions-p1` serial wait and
   `sql_transaction_participants-p1` workflow progress.

## Validation

1. `./node_modules/.bin/tap test/bootstrap/bootstrap-api.test-part-3.js`:
   passed with the new startup-admission regression.
2. `./node_modules/.bin/tap test/bootstrap/bootstrap-api.test.js`:
   passed.
3. `node scripts/check-guideline-literals.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/bootstrap-api.js`:
   passed with no new violations.
4. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/bootstrap-api.js`:
   passed.
5. `node scripts/check-runtime-grammar-contracts.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/bootstrap-api.js`:
   passed.
6. `git diff --check`:
   passed before opening this successor package.
7. Representative rerun:
   `test-output/reports/rolling-restart-after-bootstrap-join-admission-recovery-projection-20260506T213144Z.report.json`.
   The old startup bootstrap-admission seam did not recur; the live owner
   migrated to publication ACK-pending convergence.

## Done When

1. The representative path either clears the epoch `4` `ACK_PENDING`
   publication/serial-wait blocker or migrates to a different named owner
   boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
