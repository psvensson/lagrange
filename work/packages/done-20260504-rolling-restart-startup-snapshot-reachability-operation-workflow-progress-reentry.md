# Rolling Restart Startup Snapshot Reachability Operation Workflow Progress Reentry

Opened on May 4, 2026 as the explicit residual split from
[Rolling Restart Operation Workflow Publication ACK Reentry](./done-20260504-rolling-restart-operation-workflow-publication-ack-reentry.md).

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-priority-op-workflow-ack-reentry-fastlocal-20260504-codex2.report.json`.
2. Failure bundle:
   `test-output/reports/.playback/rolling-restart-priority-op-workflow-ack-reentry-fastlocal-20260504-codex2/rolling-restart/failure-bundle.json`.
3. Result: failed, `0/1` passed after `130.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Readiness failure:
   `snapshot_reachability_timeout` in startup mode from
   `selectedSnapshotReachabilityError`.
6. Publication remains closed:
   `PUBLISHED`, pending ACK count `0`, and blocked node count `0`.
7. Active-gate selected snapshot coverage remains incomplete at `3/5`.
8. Priority recovery owner state remains
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`
   for `sql_write_operations-p1` with `recovering_in_flight`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Determine whether startup selected-snapshot reachability timeout is the
   current owner boundary or supporting evidence around operation workflow
   progress.
2. Preserve the closed publication ACK path from the split package.
3. Preserve the operation-workflow owner state for `sql_write_operations-p1`
   while deciding whether progress should wait, dispatch, or reconcile.
4. Keep the final failure bundle anchored to one canonical owner outcome.

## Out Of Scope

1. Harness timeout increases.
2. Post-active over-target trim until the representative path reaches that
   boundary again.
3. Reopening publication ACK reentry unless new evidence shows ACK debt is
   current.
4. Pro or Enterprise behavior.

## Residual Closure Inventory

- [x] Classify the terminal `snapshot_reachability_timeout` as dominant owner
      evidence or supporting startup evidence.
- [x] Trace `sql_write_operations-p1` operation workflow progress from
      `recovering_in_flight` through dispatch, wait, or timeout reconciliation.
- [x] Prove the failure bundle reports one canonical owner state for startup
      snapshot reachability plus operation workflow progress.
- [x] Run focused owner/static checks and one representative
      `rolling-restart --fast-local` rerun.

## Validation

1. Focused fixture for startup snapshot reachability plus operation workflow
   progress.
2. Failure-bundle playback/regeneration for the final representative report.
3. Static guardrails for touched files.
4. One representative `rolling-restart --fast-local` rerun.

## Closure Evidence

1. Added focused regression coverage in
   `test/distributed/harness/__tests__/failure-bundle.test.js` for startup
   `snapshot_reachability_timeout` plus
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`
   with `persisted_not_dispatched`.
2. The focused regression failed before the harness fix because
   `persisted_not_dispatched` workflow progress was not accepted as active-gate
   priority-recovery actuation evidence.
3. Updated `test/distributed/harness/failure-bundle-segment-4.js` so
   workflow-progress actuation evidence includes both
   `persisted_not_dispatched` and `dispatched_waiting_progress`.
4. `snapshot_reachability_timeout` is supporting startup readiness evidence
   when a meaningful operation-workflow witness exists; the canonical owner
   outcome remains `priority_recovery_progress_blocked` with workflow-progress
   owner signals.
5. Publication ACK closure remained closed in the representative evidence:
   publication `PUBLISHED`, pending ACK count `0`, blocked node count `0`, and
   missing published count `0` in the normalized final rerun bundle.
6. Representative rerun:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-startup-snapshot-workflow-progress-reentry-fastlocal-20260504-codex.report.json --fast-local --verbose`
   failed `0/1` after `133.3s`, but the blocker migrated. The selected
   snapshot was reachable by `admin_health`, readiness failure was
   `no_progress_terminal`, selected snapshot coverage was `2/5`, and the
   canonical failure became
   `priority_recovery_workflow_progress_transition_deferred`.
7. The migrated blocker is split to
   [Rolling Restart Priority Recovery Workflow Transition Deferred Reentry](./todo-20260504-rolling-restart-priority-recovery-workflow-transition-deferred-reentry.md).

## Static Drift Ledger

Preflight:

- [x] `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
      passed before implementation.
- [x] `node scripts/check-guideline-literals.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` new literal-guideline violations and `0` inherited baseline
      violations before implementation.
- [x] `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` decision-boundary guideline violations before implementation.
- [x] `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` runtime-grammar-contract violations before implementation.

Closure:

- [x] `node --check test/distributed/harness/failure-bundle-segment-4.js`
      passed.
- [x] `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
      passed.
- [x] `./node_modules/.bin/eslint --no-warn-ignored test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle.test.js`
      passed.
- [x] `node scripts/check-guideline-literals.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` new literal-guideline violations and `0` inherited baseline
      violations.
- [x] `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` decision-boundary guideline violations.
- [x] `node scripts/check-runtime-grammar-contracts.js test/distributed/harness/failure-bundle-segment-4.js test/distributed/harness/__tests__/failure-bundle.test.js`:
      `0` runtime-grammar-contract violations.
- [x] `node --test --test-name-pattern "keeps startup snapshot reachability subordinate to workflow progress" test/distributed/harness/__tests__/failure-bundle.test.js`
      passed.
- [x] `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
      passed `75/75`.

## Deep-Dive Review

1. Reviewed `buildPublicationConvergenceSummary`,
   `buildPriorityRecoveryActuationWitnessEvidence`,
   priority-recovery progress summary normalization, and failure classification
   signal emission for the affected harness boundary.
2. Fixed inherited literal-owner and decision-boundary drift in
   `test/distributed/harness/failure-bundle-segment-4.js` while the file was
   touched.
3. No runtime owner change was needed; the runtime evidence was already
   publishing a meaningful workflow-progress witness and the harness
   classification gate was too narrow.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates to one
   newly named owner boundary.
2. Publication ACK closure remains closed while startup snapshot reachability and
   operation workflow progress are classified through one canonical outcome.
