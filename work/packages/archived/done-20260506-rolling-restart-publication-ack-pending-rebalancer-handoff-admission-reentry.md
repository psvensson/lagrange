# Rolling Restart Publication ACK-Pending Rebalancer Handoff Admission Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-owner-normalization-20260506T161610Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-owner-normalization-20260506T161610Z/rolling-restart/",
  "owner": "Priority recovery rebalancer handoff and admission under publication pending",
  "boundary": "Startup publication ACK-pending rebalancer handoff/admission reentry",
  "dominantReason": "pending_ack_nodes",
  "currentState": "Publication-owned fallback eligibility now excludes projection-rejected pending-ACK nodes, and the representative rerun closed the epoch 5 ACK_PENDING admission boundary. The blocker migrated to epoch 6 PUBLISHED with snapshot coverage 3/5 and priority serial-wait workflow progress on sql_write_operations-p1 behind sql_transaction_participants-p1.",
  "nextAction": "Continue in done-20260506-rolling-restart-published-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md for the epoch 6 PUBLISHED snapshot-coverage / workflow-progress boundary.",
  "proof": [
    "Focused terminal rebalancer-handoff/admission fixture",
    "Owner decision for admission versus transport visibility",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot.js",
    "src/control-plane/priority-recovery-observation-snapshot.js",
    "src/rebalancer/unified-rebalancer-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-5.js",
    "src/transport/message-router-shared.js",
    "test/control-plane/priority-recovery-snapshot.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-publication-ack-pending-priority-recovery-reentry.md",
  "closed": "2026-05-06",
  "successor": "work/packages/done-20260506-rolling-restart-published-snapshot-coverage-priority-serial-wait-workflow-progress-reentry.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Publication ACK-Pending Priority Recovery Reentry](./done-20260506-rolling-restart-publication-ack-pending-priority-recovery-reentry.md)
closed by migration. The focused owner-decision repair removed the stale
`sql_transactions-p1` / `sql_write_operations-p1` conflict, but the next
representative rerun still fails startup publication convergence at a different
priority recovery boundary.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-priority-owner-normalization-20260506T161610Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-priority-owner-normalization-20260506T161610Z/rolling-restart/`.
3. Result: failed after `132.2s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `startup`.
6. Failure class: `publication_convergence_blocked`.
7. Dominant reason: `pending_ack_nodes`.
8. Active gate: active `2/5`, snapshot coverage `2/5`, publication epoch `5`,
   publication status `ACK_PENDING`, pending ACK count `1`, priority spread gap
   `3`.
9. Normalized priority recovery witnesses:
   `sql_transactions-p1` is `converged`; `sql_write_operations-p1` is
   `recovering_in_flight`; `replica_operations-p1` and
   `sql_transaction_participants-p1` are terminal `rebalancer_handoff`
   witnesses with spread still unsatisfied.
10. Runtime active-gate history still records
    `priority_recovery_progress_class=eligible_but_no_operation_created` for
    `replica_operations-p1`; the normalized report snapshots refine that into
    terminal rebalancer handoff evidence.
11. Rebalancer evidence on `7493b0ab-a054-5fad-a91b-5e331db29304` attempted a
    `replica_operations-p1` replace follow-up to
    `8be8d30f-4499-5eed-865c-71b4d529a67a`, then denied provisioning admission
    with `insufficient_placement_eligible_nodes` and
    `control_plane_write_unhealthy`.
12. Transport evidence still includes repeated participant failures and
    connection timeouts involving `7493b0ab-a054-5fad-a91b-5e331db29304`,
    including `ROUTER_CONNECTION_CLOSED` on `replica_operations-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Build a focused `161610Z` fixture that preserves the terminal
   `replica_operations-p1` and `sql_transaction_participants-p1` handoff
   evidence plus the `replica_operations-p1` admission denial.
2. Decide whether the canonical owner is rebalancer follow-up admission,
   publication recovery eligibility, or transport/CDC visibility.
3. Repair only the selected owner path.
4. Preserve the priority owner normalization and serial wait regression from
   the predecessor package.

## Out Of Scope

1. Reopening the `155451Z` stale owner-decision repair unless that exact
   `sql_transactions-p1` / `sql_write_operations-p1` signature re-enters.
2. Harness-only timeout increases or startup-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Priority recovery rebalancer handoff owns terminal operation witnesses whose
   spread remains unsatisfied.
2. Admission owns follow-up scheduling when the rebalancer names explicit
   admission denial reasons.
3. Transport/CDC visibility owns the repair only when the admission evidence is
   a symptom of unreachable authoritative participants or unpropagated target
   visibility.

Canonical contract shape:

1. Terminal completed priority operations that still have spread gaps must not
   collapse into an unqualified no-operation claim.
2. Follow-up admission denial must expose the exact denial dimensions and
   selected target cohort.
3. Transport participant failures must be named as transport/visibility
   evidence only when they explain the missing target visibility or admission
   health state.
4. Failure bundle, active gate, replay, and focused fixtures must agree on the
   selected owner before the package closes.

## Residual Closure Inventory

- [x] Extract the `161610Z` terminal handoff/admission fixture.
- [x] Decide the owner boundary: admission, publication eligibility, or
      transport/CDC visibility.
- [x] Add the focused regression and repair the selected owner path.
- [x] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

## Progress Notes

May 6 central priority-recovery snapshot simplification:

1. Extracted serial-wait snapshot rebuilding into one shared helper so
   release/synthetic transforms no longer duplicate the completion,
   observation, conditions, actuation, and progress rebuild chain.
2. Replaced nested decision-snapshot conflict normalization calls with an
   explicit ordered stage table.
3. Replaced actuation/progress owner outcome branch piles with explicit
   decision tables backed by shared normalized contract input helpers.
4. Focused proof passed:
   `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`.
5. Scoped guardrails passed:
   `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot.js`;
   `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot.js`;
   `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot.js`;
   `git diff --check -- src/control-plane/priority-recovery-snapshot.js`.
6. File-scoped ESLint passed:
   `./node_modules/.bin/eslint src/control-plane/priority-recovery-snapshot.js --no-ignore`.
7. File-scoped complexity probe still has inherited violations in
   `src/control-plane/priority-recovery-snapshot.js`, but the refactored
   serial-wait, actuation, and progress helpers are no longer among them.

May 6 publication ACK-pending admission follow-up:

1. Added the focused regression
   `priority recovery decision snapshots exclude projection-rejected pending-ACK nodes from follow-up eligibility`
   in `test/control-plane/priority-recovery-snapshot-core-08-test-cases.js`.
2. Filtered publication-membership fallback eligibility through publication
   exclusion decisions in
   `src/control-plane/priority-recovery-snapshot-stage-9.js`,
   `src/control-plane/priority-recovery-snapshot-stage-10.js`, and
   `src/control-plane/priority-recovery-snapshot-stage-11.js`.
3. Focused proof passed:
   `./node_modules/.bin/tap test/control-plane/priority-recovery-snapshot.test.js`.
4. Scoped guardrails passed:
   `node scripts/check-guideline-literals.js test/control-plane/priority-recovery-snapshot-core-08-test-cases.js`;
   `node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-9.js src/control-plane/priority-recovery-snapshot-stage-10.js src/control-plane/priority-recovery-snapshot-stage-11.js`;
   `node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-9.js src/control-plane/priority-recovery-snapshot-stage-10.js src/control-plane/priority-recovery-snapshot-stage-11.js`;
   `node scripts/check-runtime-grammar-contracts.js src/control-plane/priority-recovery-snapshot-stage-9.js src/control-plane/priority-recovery-snapshot-stage-10.js src/control-plane/priority-recovery-snapshot-stage-11.js`;
   `npx eslint src/control-plane/priority-recovery-snapshot-stage-9.js src/control-plane/priority-recovery-snapshot-stage-10.js src/control-plane/priority-recovery-snapshot-stage-11.js test/control-plane/priority-recovery-snapshot-core-08-test-cases.js`;
   `git diff --check`.
5. Representative rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-priority-recovery-publication-exclusion-filter-20260506T184523Z.report.json --fast-local --verbose`
   failed after `132.7s`, but the blocker migrated to epoch `6` `PUBLISHED`
   snapshot coverage `3/5` with `priority_operation_serial_wait` on
   `sql_write_operations-p1`.

## Validation

1. Focused terminal handoff/admission fixture passes.
2. Focused owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either clears the epoch `5` ACK-pending rebalancer
   handoff/admission blocker or migrates to a different named owner boundary
   with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
