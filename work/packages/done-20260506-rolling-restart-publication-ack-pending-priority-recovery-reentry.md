# Rolling Restart Publication ACK-Pending Priority Recovery Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-owner-normalization-20260506T161610Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-owner-normalization-20260506T161610Z/rolling-restart/",
  "owner": "Publication recovery gate over priority recovery scheduling and workflow progress",
  "boundary": "Startup publication ACK-pending priority recovery reentry",
  "dominantReason": "pending_ack_nodes",
  "currentState": "The 155451Z owner decision was repaired: sql_transactions-p1 remains workflow-owned while fresh, and later sql_write_operations-p1 synthetic no-operation evidence yields to serial/workflow progress. The representative rerun migrated to epoch 5 rebalancer handoff/admission.",
  "nextAction": "Migrated to done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-admission-reentry.md for the epoch 5 rebalancer handoff/admission boundary.",
  "proof": [
    "Focused priority recovery publication-ACK fixture",
    "Operation scheduling or workflow owner regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot.js",
    "test/control-plane/priority-recovery-snapshot.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-seed-transport-delivery-source-saturation-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-admission-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Startup Seed Transport Delivery-Source Saturation Reentry](./done-20260506-rolling-restart-startup-seed-transport-delivery-source-saturation-reentry.md)
closed by migration. The focused transport fairness fix removed the hot
delivery-source saturation blocker, but the representative rerun still fails
inside startup convergence. The live evidence is now publication and priority
recovery again: epoch `3` is `ACK_PENDING`, pending ACK node is
`11601fe0-72d6-5853-8590-ec2881853e72`, selected active-gate coverage is
`3/5`, priority spread is pending, and priority recovery has two unresolved
partitions.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-seed-transport-fairness-20260506T155451Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-seed-transport-fairness-20260506T155451Z/rolling-restart/`.
3. Result: failed after `131.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `startup`.
6. Failure class: `publication_convergence_blocked`.
7. Dominant reason: `pending_ack_nodes`.
8. Publication convergence: epoch `3`, status `ACK_PENDING`, recovery protocol
   `publication_pending`, pending ACK count `1`, pending ACK node
   `11601fe0-72d6-5853-8590-ec2881853e72`, missing published count `0`.
9. Active-gate best progress reaches active `5/5`, selected snapshot coverage
   `3/5` on `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, pending ACK count `1`,
   priority spread gap `3`, and blocked priority partition count `2`.
10. `sql_transactions-p1` is `recovering_in_flight` under
    `operation_workflow_owner / workflow_progress / event_driven`, next action
    `wait_for_operation_progress`, workflow phase `dispatch_pending`, and
    operation `7a24201b-6f3c-4298-a32c-4efe04157ff9`.
11. `sql_write_operations-p1` is `needs_operation` with progress class
    `eligible_but_no_operation_created`, owner `rebalancer_leader`, boundary
    `operation_scheduling`, wait mode `event_driven`, and next action
    `create_recovery_operation`.
12. Failure-bundle history still shows selected snapshot coverage debt, but
    the priority recovery witnesses are now stronger than the retired
    seed-delivery-source saturation blocker.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Build a focused owner-decision fixture from the `155451Z` artifact for the
   two priority recovery witnesses under epoch `3` `ACK_PENDING`.
2. Determine whether `sql_write_operations-p1` operation scheduling is the
   primary owner, or whether it is subordinate to `sql_transactions-p1`
   workflow progress.
3. Repair the smallest owner path once the focused fixture identifies the
   canonical owner boundary.
4. Preserve the transport fairness regression and failure-bundle publication
   classification while fixing the priority recovery owner path.

## Out Of Scope

1. Reopening the closed seed transport delivery-source saturation package
   unless a new artifact re-enters that exact saturation signature.
2. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
3. Harness-only timeout increases or startup-readiness exemptions.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Publication recovery gate for deciding whether epoch `ACK_PENDING` is
   waiting on ACK, priority spread, or stale observation.
2. Priority recovery scheduling and workflow owners for the unresolved
   partitions that keep the publication recovery gate open.

Canonical contract shape:

1. `ACK_PENDING` publication state must name the priority recovery blocker
   that prevents publication closure when pending ACK and priority spread both
   remain open.
2. A `needs_operation` witness must either create one recovery operation or
   yield to one stronger workflow-progress blocker from the same priority
   recovery decision snapshot.
3. A `recovering_in_flight` witness must expose whether it is making progress,
   waiting within budget, or blocking a later operation scheduling action.
4. Failure bundle, replay, sprint snapshot, and focused owner fixtures must
   agree on the selected current owner and subordinate evidence.

## Residual Closure Inventory

- [x] Extract the `155451Z` priority recovery decision snapshot into the
      narrowest fixture that preserves `sql_transactions-p1` and
      `sql_write_operations-p1`.
- [x] Decide whether operation scheduling or workflow progress is the
      canonical current owner.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Validation

1. `npx tap test/control-plane/priority-recovery-snapshot.test.js`: passed
   with `62` subtests and `285` assertions.
2. `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot.js test/control-plane/priority-recovery-snapshot.test.js`:
   passed with no new violations.
3. `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot.js`:
   passed.
4. `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot.js`:
   passed.
5. `npx eslint src/control-plane/priority-recovery-snapshot.js`: passed.
6. `git diff --check src/control-plane/priority-recovery-snapshot.js test/control-plane/priority-recovery-snapshot.test.js`:
   passed.
7. `npm run work:validate`: passed before migration.
8. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`:
   passed with `88` tests.
9. Representative rerun:
   `test-output/reports/rolling-restart-after-priority-owner-normalization-20260506T161610Z.report.json`.
   The old `155451Z` owner-decision signature did not recur:
   `sql_transactions-p1` converged, and `sql_write_operations-p1` remained
   `recovering_in_flight` under `operation_workflow_owner /
   workflow_progress`.
10. The rerun failed after `132.2s` at a different boundary: epoch `5`
    `ACK_PENDING`, active `2/5`, snapshot coverage `2/5`, terminal
    `replica_operations-p1` and `sql_transaction_participants-p1` recovery
    witnesses in `rebalancer_handoff`, and a later `replica_operations-p1`
    follow-up admission denial with `insufficient_placement_eligible_nodes`
    plus `control_plane_write_unhealthy`.
11. `npx eslint src/control-plane/priority-recovery-snapshot.js test/control-plane/priority-recovery-snapshot.test.js`
    still reports inherited indentation errors in the later test file body;
    the production file and focused test run pass.

## Done When

1. The representative path either clears the epoch `3` `ACK_PENDING` priority
   recovery blocker or migrates to a different named owner boundary with
   replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.

## Migration

This package closes by migration. The repaired boundary was the stale
owner-decision snapshot around `sql_transactions-p1` and
`sql_write_operations-p1` from the `155451Z` artifact. The successor package is
[Rolling Restart Publication ACK-Pending Rebalancer Handoff Admission Reentry](./done-20260506-rolling-restart-publication-ack-pending-rebalancer-handoff-admission-reentry.md),
which owns the `161610Z` epoch `5` rebalancer handoff/admission evidence.
