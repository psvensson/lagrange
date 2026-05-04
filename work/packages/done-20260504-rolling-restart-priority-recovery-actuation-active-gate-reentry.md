# Rolling Restart Priority Recovery Actuation Active Gate Reentry

Opened on May 4, 2026 after
[Rolling Restart Startup Rejoin Seed Contact Snapshot Coverage](./done-20260504-rolling-restart-startup-rejoin-seed-contact-snapshot-coverage.md)
closed the startup seed-contact presentation blocker and the representative path
migrated to topology priority-recovery actuation.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-startup-seed-contact-owner-20260504-codex.report.json`.
2. Failure bundle:
   `test-output/reports/.playback/rolling-restart-startup-seed-contact-owner-20260504-codex/rolling-restart/failure-bundle.json`.
3. Result: failed, `0/1` passed after `132.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure class: `topology_unstable`.
6. Root cause class: `topology`.
7. Dominant reason:
   `priority_recovery_actuation_state_action_required`.
8. Publication convergence remains top-level closed:
   publication pending `false`, pending ACK `0`, missing published `0`.
9. Active-gate progress reports blockers:
   `inactive_nodes=2`, `snapshot_coverage=2/5`, and
   `priority_recovery_progress_class=eligible_but_no_operation_created`.
10. Active-gate progress has gate reason count `0`; no
    `publication_gate=...` blocker is restored.
11. Active-gate selected snapshot still reports selected missing published
    nodes:
    `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
    `8be8d30f-4499-5eed-865c-71b4d529a67a`, and
    `ebc4aa0b-06c6-506d-93ea-1dd2deca3f58`.
12. Current restarted-node startup decisions are `fresh_join`.
13. Stale pre-decision seed-contact failures are no longer retained as latest
    startup artifacts in the regenerated bundle.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Identify why active-gate priority recovery remains
   `eligible_but_no_operation_created` after publication closure.
2. Trace the owner path that should create or resume the next priority recovery
   operation for the active-gate selected snapshot.
3. Preserve the closed publication and startup seed-contact classifications.
4. Decide whether the remaining selected missing-published list is current
   topology evidence or stale active-gate projection debt.

## Out Of Scope

1. Harness-only timeout increases or readiness exemptions.
2. Post-active over-target trim until the representative path reaches that
   boundary again.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Progress Grammar

1. `publication_closed` means publication pending is `false`, pending ACK is
   `0`, and top-level missing published is `0`.
2. `priority_recovery_actuation_open` means priority recovery has an unresolved
   progress class that requires owner action.
3. `eligible_but_no_operation_created` means the selected priority-recovery
   witness is eligible for repair but no current operation exists for that
   owner boundary.
4. `snapshot_coverage_open` means selected active-gate snapshot coverage is
   less than expected node coverage.
5. `closed_or_migrated` means the representative path either reaches ACTIVE
   convergence or moves to a newly named non-publication owner boundary.

## Residual Closure Inventory

- [x] Direct owner path for active-gate priority-recovery operation creation
      identified.
- [x] Active-gate selected missing-published evidence classified as current
      topology evidence or stale projection debt.
- [x] Failure bundle keeps publication and startup closure while reporting the
      priority-recovery actuation owner.
- [x] Focused owner fixture added before runtime changes.
- [x] Representative `rolling-restart --fast-local` rerun recorded after the
      focused proof.

## Static Drift Ledger

Preflight:

- [x] Select file-scoped guardrails after identifying the priority-recovery
      actuation owner files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation was introduced.
- [x] Any inherited out-of-scope violation has a linked follow-on package or
      recorded exclusion.

## Implementation Tasks

- [x] Inspect the representative bundle and playback for the
      `eligible_but_no_operation_created` active-gate priority witness.
- [x] Identify the operation-creation owner path and the stale/current boundary
      for selected missing-published active-gate evidence.
- [x] Add the smallest fixture for that owner boundary.
- [x] Fix the owner path or split a sharper package if the evidence points to a
      separate projection issue.
- [x] Rerun focused tests, static guardrails, and the representative scenario.

## Validation

1. Focused priority-recovery actuation owner test.
2. Focused failure-bundle playback test if the owner surface changes
   diagnostics.
3. Static guardrails for touched files.
4. One representative `rolling-restart --fast-local` rerun.

Executed on May 4, 2026:

1. `node --check test/distributed/harness/failure-bundle-segment-4.js`
2. `node --check test/distributed/harness/publication-evidence-contract.js`
3. `node --check test/distributed/harness/failure-bundle-segment-5.js`
4. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
5. `node --test --test-name-pattern "classifies startup active-gate priority actuation|keeps current active-gate ACK closure|does not let non-priority|preserves pressure-shaped|preserves retry-shaped" test/distributed/harness/__tests__/failure-bundle.test.js`
6. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   passed `72/72`.
7. `git diff --check`
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-actuation-active-gate-reentry-ack-closure-20260504-codex.report.json --fast-local --verbose`
   failed `0/1` after `133.7s`, then regenerated bundle classified
   `priority_recovery_progress_blocked` with
   `priorityRecoveryOwner=rebalancer_leader`,
   `priorityRecoveryBoundary=operation_scheduling`, and
   `priorityRecoveryNextAction=create_recovery_operation`.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-actuation-active-gate-reentry-final-20260504-codex.report.json --fast-local --verbose`
   failed `0/1` after `130.0s`; the original no-operation blocker had
   migrated to operation workflow progress evidence, then reopened publication
   at epoch `4` with pending ACK nodes.

## Closure Notes

1. The diagnostics path now preserves active-gate priority-recovery actuation
   under snapshot coverage instead of suppressing it behind active
   priority-spread evidence.
2. Current active-gate selected-snapshot ACK and missing-published debt is
   suppressed only when the priority-recovery actuation contract is present;
   ordinary active-gate publication debt remains open.
3. The focused fixture covers stale selected-snapshot ACK debt, closed
   publication convergence, and the owner boundary
   `rebalancer_leader -> operation_scheduling -> create_recovery_operation`.
4. The fresh representative rerun progressed beyond
   `eligible_but_no_operation_created`; the remaining runtime blocker is split
   to
   [Rolling Restart Operation Workflow Publication ACK Reentry](./todo-20260504-rolling-restart-operation-workflow-publication-ack-reentry.md).

## Done When

1. `rolling-restart` no longer stalls on unnamed
   `eligible_but_no_operation_created` active-gate priority-recovery evidence.
2. The representative path either reaches ACTIVE convergence or migrates to one
   newly named owner boundary without reopening publication convergence or
   startup seed-contact classification.
