# Priority Recovery Actuation Contract Under Load

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

1. [Rolling Restart Operation Transition Pressure And Over-Target Trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

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

- [ ] Record the current file-scoped literal audit for materially edited files.
- [ ] Record the decision-boundary audit for edited decision/presentation
      files.
- [ ] Record the runtime-grammar audit for priority recovery meaning changes.
- [ ] Record whether edited files already have inherited touched-file debt.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Detection / Analysis Tasks

- [ ] Derive a small owner-decision fixture from the latest failure bundle for
      `sql_transactions-p1`.
- [ ] Identify the exact runtime source for latest workflow step `SENDING`,
      latest status `pending`, operation id
      `11856d47-ae53-4070-9014-9de1358cf17d`, owner
      `operation_workflow_owner`, and next action
      `wait_for_operation_progress`.
- [ ] Decide whether the correct actuation state is
      `persisted_not_dispatched`, `dispatched_waiting_progress`, or
      `transition_deferred`.
- [ ] Identify every presentation path still reporting
      `publication_convergence_blocked` or generic
      `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` for this fixture.
- [ ] Name the next owner boundary if the fixture proves presentation is
      correct and runtime actuation is truly stalled.

## Implementation Tasks

- [ ] Add or update the focused fixture/test before runtime changes.
- [ ] Add the actuation snapshot at the owner/decision boundary instead of
      adding another presentation-only classifier.
- [ ] Cut priority recovery observation and ACTIVE gate classification over to
      the actuation snapshot.
- [ ] Cut failure bundle and triage summary presentation over to the decision
      contract when present.
- [ ] Add the publication-closed/workflow-progress regression guard.
- [ ] Delete or fence any local fallback that reconstructs the same meaning
      from publication/readiness fragments.

## Residual Closure Inventory

- [ ] Owner-path actuation contract exists and has focused proof.
- [ ] Direct decision consumers are cut over.
- [ ] Harness, triage, and failure bundle presentation surfaces are cut over.
- [ ] Superseded publication/readiness reconstruction for this meaning is
      removed or fails closed behind the decision contract.
- [ ] Representative `rolling-restart --fast-local` rerun is recorded.
- [ ] If the blocker migrates, the next active package is created or linked
      before this package is closed.

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
