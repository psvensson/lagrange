# Priority Recovery Actuation Contract Under Load

The owner actuation contract and presentation cutover are in place. The
representative rerun migrated away from the publication-closed
workflow-progress blocker to a publication ACK / snapshot reachability
regression now tracked by
[Rolling Restart Publication ACK Snapshot Reachability Regression](./done-20260430-rolling-restart-publication-ack-snapshot-reachability-regression.md).

## Why

The April 30 `rolling-restart --fast-local` representative run moved beyond
the missing published-active-node blocker. Publication and membership evidence
are now closed in the terminal snapshot, but the scenario still fails in
load-mode ACTIVE readiness because one priority recovery partition is waiting
for workflow progress.

Reference report:

`test-output/reports/runtime-stability-rolling-restart-20260430-codex-active-publication-missing-node-owner-state.report.json`

Reference triage:

`test-output/reports/.playback/runtime-stability-rolling-restart-20260430-codex-active-publication-missing-node-owner-state/rolling-restart/triage-summary.md`

Reference failure bundle:

`test-output/reports/.playback/runtime-stability-rolling-restart-20260430-codex-active-publication-missing-node-owner-state/rolling-restart/failure-bundle.json`

Current terminal evidence:

1. publication epoch `4` is `PUBLISHED`.
2. pending ACK count is `0`.
3. published active nodes are `5/5`.
4. missing published node count is `0`.
5. selected snapshot coverage is `5/5`.
6. priority spread is pending with gap `6`.
7. unresolved priority partition is `sql_transactions-p1`.
8. dominant reason is `priority_recovery_workflow_progress_event_driven`.
9. current owner is `operation_workflow_owner`.
10. blocking boundary is `workflow_progress`.
11. wait mode is `event_driven`.
12. next action is `wait_for_operation_progress`.
13. latest operation step is `SENDING`.
14. latest operation status is `pending`.

The current active work must contract to this owner boundary. Historical
operation-transition, publication, quiescence, and readiness blocker migrations
remain useful evidence, but they must not keep widening the active package.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Supersedes current active execution of:

1. [Rolling Restart Operation Transition Pressure And Over-Target Trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

That package remains queued history for post-active operation drain and trim.
This package owns only the current load-readiness priority recovery actuation
blocker.

## In Scope

1. Define one first-class actuation contract for priority recovery workflow
   progress under load.
2. Reproduce the current `sql_transactions-p1` blocker from the latest failure
   bundle or a derived owner-decision fixture before changing runtime behavior.
3. Make the decision layer consume the actuation contract instead of inferring
   workflow progress from raw operation rows, publication fragments, or
   presentation summaries.
4. Make harness presentation consume the decision contract when present.
5. Add a guard or focused regression that fails if presentation reports
   publication as blocked while publication is `PUBLISHED`, ACK debt is zero,
   missing published-active nodes are zero, and the canonical owner is workflow
   progress.
6. Rerun the representative `rolling-restart --fast-local` path and record
   whether the blocker closes or migrates.

## Out Of Scope

1. Increasing ACTIVE wait, publication, workflow, or transport timeouts.
2. Reopening publication membership, ACK, or missing published-active-node
   ownership while the current artifact shows those gates closed.
3. Reopening quiescence, CDC projection, or admin reachability packages unless
   the representative rerun migrates back to one of those named boundaries.
4. Broad 7-node or full matrix execution before this 5-node representative
   blocker moves.
5. Pro or Enterprise features.

## Invariants

1. Publication state must not be reported as the operational blocker when the
   canonical publication evidence is `PUBLISHED`, ACK debt is zero, and
   missing published-active nodes are zero.
2. `presentation` surfaces may summarize decision-layer meaning, but must not
   invent a new runtime meaning from lower-layer evidence when the decision
   contract is present.
3. Workflow progress under load must be represented as an explicit actuation
   state with owner, boundary, wait mode, next action, operation id, workflow
   step, status, and retryability evidence.
4. Transport, snapshot reachability, and cache repair pressure may be recorded
   as conditions, but they must not replace the operation workflow owner unless
   the decision contract names them as the current owner.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/control-plane/priority-recovery-observation-snapshot.js`
3. `src/rebalancer/operation-workflow-owner-segment-7.js`
4. `src/rebalancer/replica-operation-liveness.js`
5. `test/distributed/harness/active-gate-closure-classification.js`
6. `test/distributed/harness/failure-bundle-segment-*.js`
7. `test/distributed/harness/__tests__/failure-bundle.test.js`
8. `test/distributed/harness/__fixtures__/`

## Shared Boundary Contract

- Semantic owner:
  `operation_workflow_owner`, surfaced through the priority recovery decision
  snapshot.
- Canonical contract shape / vocabulary:
  one priority recovery actuation snapshot with these states:
  `no_action_needed`, `action_required`, `persisted_not_dispatched`,
  `dispatched_waiting_progress`, `transition_deferred`, `terminal_failed`,
  and `terminal_completed`.
- Allowed consumers:
  priority recovery decision snapshot, observation snapshot, ACTIVE gate,
  failure bundles, triage summaries, and replay fixtures.
- Prohibited reinterpretations:
  consumers must not reinterpret `PUBLISHED` publication with zero ACK debt as
  publication convergence blocked when the actuation contract names workflow
  progress as the current blocker. Consumers must not collapse
  `dispatched_waiting_progress` into `needs_operation`, `unknown`, empty
  partition lists, or generic priority recovery pending.
- Primary diagnostics / proof surfaces:
  owner-decision fixture, focused priority recovery snapshot tests, failure
  bundle tests, active gate classification tests, and one
  `rolling-restart --fast-local` rerun.

## Progress Grammar

1. `no_action_needed` means the priority partition already satisfies the
   desired spread and has no current operation work.
2. `action_required` means the decision owner found a spread gap and no
   durable operation exists for the required work.
3. `persisted_not_dispatched` means a durable operation exists but no dispatch
   attempt or legal workflow step is visible yet.
4. `dispatched_waiting_progress` means a durable operation exists and has been
   dispatched, but the workflow owner is waiting for a legal state transition
   or observation.
5. `transition_deferred` means the next workflow transition is retryable and
   blocked by explicit pressure, authority, visibility, or transport evidence.
6. `terminal_failed` means the owner has terminal failure evidence and the
   recovery planner must decide whether follow-up work is required.
7. `terminal_completed` means the owner has terminal completion evidence and
   consumers may count the operation as closed.

## Static Drift Ledger

Preflight:

- [x] Record the current file-scoped literal audit for materially edited files.
      2026-04-30 scoped hotspot preflight:
      `node scripts/check-guideline-literals.js --include-tests
      src/control-plane/priority-recovery-snapshot.js
      src/control-plane/priority-recovery-observation-snapshot.js
      src/rebalancer/operation-workflow-owner-segment-7.js
      src/rebalancer/replica-operation-liveness.js
      test/distributed/harness/active-gate-closure-classification.js
      test/distributed/harness/failure-bundle-segment-1.js
      test/distributed/harness/failure-bundle-segment-2.js
      test/distributed/harness/failure-bundle-segment-3.js
      test/distributed/harness/failure-bundle-segment-4.js
      test/distributed/harness/failure-bundle-segment-5.js
      test/distributed/harness/priority-recovery-summary-normalization.js
      test/distributed/harness/__tests__/failure-bundle.test.js`:
      12 files scanned, 1513 existing literal-guideline violations in the
      broader harness/test touched set.
- [x] Record the decision-boundary audit for edited decision/presentation
      files.
      Same scoped hotspot preflight:
      12 files scanned, 4 existing decision-boundary violations
      (`failure-bundle-segment-5.js`: 2, `failure-bundle-segment-1.js`: 1,
      `failure-bundle-segment-4.js`: 1).
- [x] Record the runtime-grammar audit for priority recovery meaning changes.
      Same scoped hotspot preflight:
      12 files scanned, 0 runtime-grammar-contract violations.
- [x] Record whether edited files already have inherited touched-file debt.
      Inherited touched-file debt is the existing literal and decision-boundary
      noise above; closure must not increase either count for the files
      actually edited.

Closure:

- [x] Same guardrails rerun after implementation.
      2026-05-01 rerun over the production runtime files changed by this
      package:
      `node scripts/check-guideline-literals.js
      src/control-plane/priority-recovery-snapshot.js
      src/control-plane/priority-recovery-diagnostics-constants.js`:
      2 files scanned, `0` new literal-guideline violations.
      `node scripts/check-guideline-decision-boundaries.js
      src/control-plane/priority-recovery-snapshot.js
      src/control-plane/priority-recovery-diagnostics-constants.js`:
      2 files scanned, `0` decision-boundary violations.
      `node scripts/check-runtime-grammar-contracts.js
      src/control-plane/priority-recovery-snapshot.js
      src/control-plane/priority-recovery-diagnostics-constants.js`:
      2 files scanned, `0` runtime-grammar-contract violations.
- [x] Test-inclusive guardrail state is recorded without treating the existing
      harness backlog as a package pass.
      2026-05-01 rerun over the broader touched harness/test set with the new
      fixture:
      `node scripts/check-guideline-literals.js --include-tests ...`:
      13 files scanned, `1510` literal-guideline findings concentrated in the
      pre-existing harness test files; the new owner-decision fixture reports
      `0` literal findings when scanned directly.
      `node scripts/check-guideline-decision-boundaries.js --include-tests ...`:
      7 files scanned, the same inherited decision-boundary findings remain
      (`failure-bundle-segment-5.js`: 2,
      `failure-bundle-segment-1.js`: 1).
- [x] No new production owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains in the runtime files materially
      edited by this package.
- [x] Any out-of-scope inherited violation has a linked follow-on package.
      Follow-on cleanup remains under
      [Guardrail Authority Alignment](./todo-20260426-guardrail-authority-alignment.md)
      and
      [Runtime Vocabulary Owner Consolidation](./todo-20260426-runtime-vocabulary-owner-consolidation.md).

## Detection / Analysis Tasks

- [x] Derive a small owner-decision fixture from the latest failure bundle for
      `sql_transactions-p1`.
- [x] Identify the exact runtime source for latest workflow step `SENDING`,
      latest status `pending`, operation id
      `11856d47-ae53-4070-9014-9de1358cf17d`, owner
      `operation_workflow_owner`, and next action
      `wait_for_operation_progress`.
- [x] Decide whether the correct actuation state is
      `persisted_not_dispatched`, `dispatched_waiting_progress`, or
      `transition_deferred`.
- [x] Identify every presentation path still reporting
      `publication_convergence_blocked` or generic
      `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` for this fixture.
- [x] Name the next owner boundary if the fixture proves presentation is
      correct and runtime actuation is truly stalled.
      The rerun migrated to publication ACK / selected snapshot reachability,
      not the publication-closed workflow-progress fixture.

## Implementation Tasks

- [x] Add or update the focused fixture/test before runtime changes.
- [x] Add the actuation snapshot at the owner/decision boundary instead of
      adding another presentation-only classifier.
- [x] Cut priority recovery observation and ACTIVE gate classification over to
      the actuation snapshot.
- [x] Cut failure bundle and triage summary presentation over to the decision
      contract when present.
- [x] Add the publication-closed/workflow-progress regression guard.
- [x] Delete or fence any local fallback that reconstructs the same meaning
      from publication/readiness fragments.

## Residual Closure Inventory

- [x] Owner-path actuation contract exists and has focused proof.
- [x] Direct decision consumers are cut over.
- [x] Harness, triage, and failure bundle presentation surfaces are cut over.
- [x] Superseded publication/readiness reconstruction for this meaning is
      removed or fails closed behind the decision contract.
- [x] Representative `rolling-restart --fast-local` rerun is recorded.
      `test-output/reports/priority-recovery-actuation-contract-rolling-restart-20260430-codex.report.json`
      failed after `133.8s`.
- [x] If the blocker migrates, the next active package is created or linked
      before this package is closed.
      Migration target:
      [Rolling Restart Publication ACK Snapshot Reachability Regression](./done-20260430-rolling-restart-publication-ack-snapshot-reachability-regression.md).

## Validation

1. Focused owner-decision fixture test for the current `sql_transactions-p1`
   evidence.
2. Focused priority recovery snapshot or operation workflow owner tests.
3. Focused failure bundle and active gate classification tests.
4. File-scoped scalar/literal and decision-boundary guardrails for touched
   files.
5. `npm run audit:runtime-grammar`.
6. `git diff --check`.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`.

## Done When

1. The current artifact can be replayed into one priority recovery actuation
   state without presentation reconstructing a different blocker.
2. Publication-closed evidence cannot be reported as publication convergence
   blocked when the canonical decision owner names workflow progress.
3. Runtime and harness consumers agree on owner, boundary, wait mode, next
   action, operation step, operation status, and retryability.
4. The representative rerun either passes this blocker or migrates to one new
   named owner boundary with a linked package.

## Closure Evidence

Focused tests:

1. `node test/control-plane/priority-recovery-snapshot.test.js`: passed
   (`223/223` assertions).
2. `node test/distributed/harness/__tests__/failure-bundle.test.js`: passed
   (`58/58` tests).
3. `node test/distributed/harness/__tests__/active-gate-closure-classification.test.js`:
   passed (`1/1` test).

Static/runtime validation:

1. `node scripts/check-runtime-grammar-contracts.js <touched files>`:
   `0` runtime grammar violations.
2. `npm run audit:runtime-grammar`: passed; runtime grammar `0`, state-machine
   pressure preflight passed.
3. `git diff --check`: passed.

Representative rerun:

`node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/priority-recovery-actuation-contract-rolling-restart-20260430-codex.report.json`

Result: failed, `0/1` passed after `133.8s`, but the original
publication-closed workflow-progress owner boundary moved. The new terminal
failure is `publication_convergence_blocked` with publication epoch `4`
`ACK_PENDING`, pending ACK count `1`, selected snapshot reachability timeout on
`7493b0ab-a054-5fad-a91b-5e331db29304`, failure-bundle
`missingPublishedCount=2`, and priority recovery witnesses now carrying the
canonical actuation contract (`sql_transactions-p1` as
`transition_deferred` / `workflow_timeout`, `sql_write_operations-p1` as
`action_required` / `operation_scheduling`).
