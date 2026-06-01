# Spec-Led Runtime Modularization Operation Owner Decision Kernel

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress_decision_kernel",
  "dominantReason": "operation_progress_decision_mixed_with_effects_and_consumers",
  "currentState": "Operation progress decisions are still spread across workflow-owner segments, coordinator paths, priority-recovery snapshots, and diagnostics consumers, making it too easy for old branch piles to survive the core rewrite.",
  "nextAction": "Assign a fresh implementation subagent to implement the frozen operation workflow progress decision kernel without changing adapters or consumers.",
  "proof": [
    "Focused operation workflow owner decision-table tests for the frozen state/outcome matrix",
    "Focused stale-progress or transition-deferred regression from the latest rolling-restart artifact",
    "Representative rolling-restart blocker probe or generated evidence block naming the migrated owner/boundary",
    "npm run audit:guideline:decision-boundaries -- --changed",
    "npm run audit:guideline:literals -- --changed",
    "npm run work:validate",
    "git diff --check -- .kiro/specs/spec-led-runtime-modularization work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md src/rebalancer/operation-workflow-owner*.js test/rebalancer/operation-workflow-owner-decision*.test.js"
  ],
  "touchedFiles": [
    ".kiro/specs/spec-led-runtime-modularization/overview.md",
    ".kiro/specs/spec-led-runtime-modularization/migration-map.md",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/rebalancer/operation-workflow-owner-evidence.js",
    "src/rebalancer/operation-workflow-owner-state.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-5.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-2.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-7.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-operation-owner-kernel.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The current operation workflow code is the highest-value rewrite target because
recent representative evidence keeps selecting operation progress as the first
frontier. This package rewrites the decision core, not the adapter surface. The
goal is a small pure kernel that can be tested like a state machine and consumed
by workflow adapters, priority recovery, and diagnostics without each consumer
reconstructing its own truth.

## Scope Basis

`.kiro/specs/spec-led-runtime-modularization/design.md` owner module shape and
Phase `0.1` operation progress closure scope.

## In Scope

1. Define operation evidence records from durable operation rows, owner commit
   evidence, workflow history, owner lease, serial dependency, retry budget,
   timeout budget, and publication dependency fences.
2. Normalize evidence into one operation state snapshot.
3. Implement a pure decision function that emits exactly one canonical outcome
   plus reasons and effect commands.
4. Add decision-table tests for active representative blockers such as stale
   progress, event-driven transition deferral, serial waits, persisted but not
   dispatched operations, and remote-owner wakeups.
5. Mark existing branch piles that are superseded by the kernel.

## Out Of Scope

1. Rewiring workflow effects to execute the new commands.
2. Priority recovery presentation changes.
3. Placement, publication, and readiness rewrites.
4. Harness gate reruns beyond focused owner proof.

## Invariants

1. `operation_workflow_owner` remains the only semantic owner for workflow
   progress.
2. `workflow_progress_decision_kernel` remains the canonical boundary for the
   pure decision surface.
3. The kernel is pure and side-effect free.
4. Outcomes use named variants, never `null`, `undefined`, raw booleans, cache
   presence, or elapsed time alone.
5. Consumers cannot create new operation blocker names outside the outcome
   vocabulary.

## Tactical Inspiration

1. Temporal/Cadence: model workflow history and commands separately so replay
   and retries stay deterministic.
2. Kubernetes controllers: reconcile observed operation state into one status
   condition and desired next action.
3. Raft-style term discipline: treat owner lease and commit evidence as ordered
   authority, not as advisory signals mixed with consumer guesses.

## Hotspots

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/rebalancer/operation-workflow-owner-shared.js`
3. `src/rebalancer/operation-workflow-owner-segment-5*.js`
4. `src/rebalancer/operation-workflow-owner-segment-7*.js`
5. `src/rebalancer/rebalance-coordinator*.js`
6. `src/rebalancer/replica-operation-repository*.js`
7. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
8. `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`

## Frozen Module Contract

### Contract Status

Package:
`work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md`.

Frozen before runtime edit: yes, by Agent Heisenberg
(`019e0b65-86a1-7732-9c25-3dd3ea6695cc`) on May 9, 2026.

Spec owner: `.kiro/specs/spec-led-runtime-modularization/requirements.md`
Requirement 9 and `.kiro/specs/spec-led-runtime-modularization/design.md`
Contract Freeze Rule.

### Owner

Name: `operation_workflow_owner`.

Boundary: `workflow_progress_decision_kernel`.

Existing runtime files:

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/rebalancer/operation-workflow-owner-shared.js`
3. `src/rebalancer/operation-workflow-owner-segment-5*.js`
4. `src/rebalancer/operation-workflow-owner-segment-7*.js`
5. `src/rebalancer/rebalance-coordinator*.js`
6. `src/rebalancer/replica-operation-repository*.js`
7. `src/control-plane/priority-recovery-snapshot-stage-10.js`

New module files for this package:

1. `src/rebalancer/operation-workflow-owner-constants.js`
2. `src/rebalancer/operation-workflow-owner-evidence.js`
3. `src/rebalancer/operation-workflow-owner-state.js`
4. `src/rebalancer/operation-workflow-owner-decision.js`
5. `src/rebalancer/operation-workflow-owner-effects.js`

Adapter, ports, and diagnostics cutover stay in later packages unless the
implementation subagent proves a zero-consumer helper is needed for focused
decision tests.

### Scalar And Variant Owners

| Value or variant family | Owner constant/module | Runtime import path | Notes |
| --- | --- | --- | --- |
| Semantic owner | `OPERATION_WORKFLOW_OWNER` | `src/rebalancer/operation-workflow-owner-constants.js` | Canonical value `operation_workflow_owner`. |
| Boundary | `OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL` | `src/rebalancer/operation-workflow-owner-constants.js` | Canonical value `workflow_progress_decision_kernel`. |
| Evidence field names | `OPERATION_WORKFLOW_EVIDENCE_FIELDS` | `src/rebalancer/operation-workflow-owner-constants.js` | Owns normalized evidence keys. |
| Operation workflow states | `OPERATION_WORKFLOW_PROGRESS_STATES` | `src/rebalancer/operation-workflow-owner-state.js` | Owns the state vocabulary below. |
| Decision outcomes | `OPERATION_WORKFLOW_PROGRESS_OUTCOMES` | `src/rebalancer/operation-workflow-owner-decision.js` | Owns the outcome vocabulary below. |
| Effect commands | `OPERATION_WORKFLOW_EFFECT_COMMANDS` | `src/rebalancer/operation-workflow-owner-effects.js` | Includes `no_operation_effect`. |
| Reason codes | `OPERATION_WORKFLOW_REASON_CODES` | `src/rebalancer/operation-workflow-owner-decision.js` | Reasons are ordered and emitted with every outcome. |
| Absence variants | `OPERATION_WORKFLOW_ABSENCE_VARIANTS` | `src/rebalancer/operation-workflow-owner-state.js` | Missing or stale evidence is explicit state. |

Every runtime string, number, boolean policy value, missing-signal condition,
and no-effect command used by the operation workflow decision contract must be
owned by one of these modules before it appears in runtime logic.

### Canonical Inputs

1. Input: durable operation row.
   Owner: replica operation repository.
   Shape: operation id, phase, owner node, participant set, terminal marker,
   retry generation, and persisted dispatch status.
   Freshness or revision: repository read revision.
2. Input: owner commit evidence.
   Owner: operation workflow owner.
   Shape: last committed transition, commit generation, and correlation key.
   Freshness or revision: workflow commit generation.
3. Input: workflow history.
   Owner: operation workflow owner.
   Shape: observed progress event, last effect command, last worker result,
   and transition-deferred marker.
   Freshness or revision: workflow history revision.
4. Input: owner lease.
   Owner: owner lease authority.
   Shape: owner node, lease term, lease freshness state, and local/remote
   authority classification.
   Freshness or revision: lease term.
5. Input: serial dependency.
   Owner: operation workflow owner.
   Shape: prior operation id, prior operation state, and release condition.
   Freshness or revision: dependency source revision.
6. Input: retry budget.
   Owner: operation workflow owner.
   Shape: retry generation, retry budget state, and retry deadline state.
   Freshness or revision: workflow commit generation.
7. Input: timeout budget.
   Owner: operation workflow owner.
   Shape: timeout window state and stale-progress classification already
   normalized from timers.
   Freshness or revision: timer observation revision.
8. Input: publication dependency fence.
   Owner: publication owner stream.
   Shape: required publication revision, observed publication revision, and
   visibility freshness state.
   Freshness or revision: publication stream revision.

### Forbidden Inputs

1. Raw evidence that must not be read: priority recovery snapshot-local
   workflow progress labels.
   Reason: priority recovery is an observation consumer and must not decide
   operation workflow progress.
2. Raw evidence that must not be read: failure bundle, topology convergence,
   or admin diagnostic blocker names.
   Reason: diagnostics rank owner witnesses after the owner emits outcomes.
3. Raw evidence that must not be read: cache miss presence, raw row absence,
   `null`, or `undefined`.
   Reason: absence is normalized into named variants before decision.
4. Raw evidence that must not be read: wall-clock age without the timeout
   budget state.
   Reason: elapsed time alone is not operation state.
5. Raw evidence that must not be read: dispatch counters without workflow
   history and lease authority.
   Reason: counters are subordinate evidence, not semantic progress.
6. Raw evidence that must not be read: publication symptoms without the
   publication dependency fence.
   Reason: publication visibility is owned by the publication stream.

### Absence Semantics

| Missing or stale signal | Named variant | Allowed meaning | Forbidden interpretation |
| --- | --- | --- | --- |
| Durable operation row unavailable | `operation_record_unavailable` | The normalizer cannot prove operation lifecycle state. | Treat row absence as terminal success or no work. |
| Workflow history stale | `workflow_history_stale` | Progress cannot advance until a fresher history revision appears. | Infer timeout reconcile from age alone. |
| Owner lease unavailable | `owner_lease_unavailable` | Authority is unknown and effect commands must be blocked. | Dispatch locally or wake a remote owner by guessing. |
| Serial dependency absent | `serial_dependency_clear` | No serial wait blocks this operation. | Encode clear dependency with `null` or missing fields. |
| Publication fence stale | `publication_fence_stale` | Authoritative visibility is deferred. | Classify workflow progress from publication symptoms. |
| No runtime effect required | `no_operation_effect` | Outcome intentionally emits no command. | Omit the command field or use `undefined`. |

### Normalized Evidence

```js
const operationWorkflowEvidence = Object.freeze({
  owner: OPERATION_WORKFLOW_OWNER,
  boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  operationKey,
  correlationKey,
  sourceRevision,
  durableOperation,
  workflowHistory,
  ownerLease,
  serialDependency,
  retryBudget,
  timeoutBudget,
  publicationFence,
  dispatchObservation,
});
```

Every field above must contain a named state or revisioned record owned by the
constants, evidence, or state modules. The normalizer is the only place where
raw rows, timers, leases, or publication fences enter this package.

### State Vocabulary

1. `operation_input_rejected`
   Meaning: normalized evidence contains a forbidden or outside-contract input.
   Terminal: false.
   Retryable: false.
   Emits effect: `no_operation_effect`.
2. `terminal_failure_observed`
   Meaning: durable operation and workflow history agree on terminal failure.
   Terminal: true.
   Retryable: false.
   Emits effect: `record_terminal_failure_command`.
3. `terminal_success_observed`
   Meaning: durable operation and workflow history agree on terminal success.
   Terminal: true.
   Retryable: false.
   Emits effect: `record_terminal_success_command`.
4. `authoritative_visibility_deferred`
   Meaning: workflow progress is blocked by a stale or incomplete publication
   fence.
   Terminal: false.
   Retryable: true.
   Emits effect: `no_operation_effect`.
5. `stale_progress_reconcile_required`
   Meaning: timeout budget and workflow history prove progress is stale and
   the owning workflow must reconcile it.
   Terminal: false.
   Retryable: true.
   Emits effect: `reconcile_stale_progress_command`.
6. `serial_dependency_pending`
   Meaning: a prior operation blocks this operation.
   Terminal: false.
   Retryable: true.
   Emits effect: `no_operation_effect`.
7. `local_owner_dispatch_ready`
   Meaning: local lease authority, durable operation, and workflow history all
   allow local dispatch.
   Terminal: false.
   Retryable: true.
   Emits effect: `dispatch_local_owner_command`.
8. `remote_owner_wake_required`
   Meaning: remote lease authority owns progress and requires a wake command.
   Terminal: false.
   Retryable: true.
   Emits effect: `wake_remote_owner_command`.
9. `existing_operation_advancement_ready`
   Meaning: an existing operation has a valid next workflow transition.
   Terminal: false.
   Retryable: true.
   Emits effect: `advance_existing_operation_command`.
10. `owner_progress_wait_required`
    Meaning: evidence is in contract but no owner action is currently allowed.
    Terminal: false.
    Retryable: true.
    Emits effect: `no_operation_effect`.

### Decision Table

Totality rule: every normalized evidence snapshot maps to exactly one outcome.

Default behavior when evidence is outside contract:
`operation_input_rejected` with `reject_out_of_contract_evidence` and
`no_operation_effect`.

| Priority | State | Evidence predicate | Outcome | Reasons |
| ---: | --- | --- | --- | --- |
| 1 | `operation_input_rejected` | Normalizer reports a forbidden input, missing owner, or missing boundary. | `reject_out_of_contract_evidence` | `outside_contract_evidence` |
| 2 | `terminal_failure_observed` | Durable operation and workflow history agree on terminal failure. | `terminal_failure` | `durable_failure_recorded`, `workflow_history_terminal` |
| 3 | `terminal_success_observed` | Durable operation and workflow history agree on terminal success. | `terminal_success` | `durable_success_recorded`, `workflow_history_terminal` |
| 4 | `authoritative_visibility_deferred` | Publication fence is stale or incomplete for the operation transition. | `defer_authoritative_visibility` | `publication_fence_stale` |
| 5 | `stale_progress_reconcile_required` | Timeout budget and workflow history prove stale progress under current lease authority. | `reconcile_stale_progress` | `timeout_budget_expired`, `workflow_history_stale` |
| 6 | `serial_dependency_pending` | A prior operation is non-terminal and blocks this operation. | `wait_for_serial_operation` | `serial_dependency_pending` |
| 7 | `local_owner_dispatch_ready` | Local lease authority can dispatch a persisted operation with no serial block. | `dispatch_local_owner` | `local_owner_authoritative`, `dispatch_not_observed` |
| 8 | `remote_owner_wake_required` | Remote lease authority owns progress and no fresh wake is observed. | `wake_remote_owner` | `remote_owner_authoritative`, `wake_required` |
| 9 | `existing_operation_advancement_ready` | Existing workflow history has a valid next transition and authority is known. | `advance_existing_operation` | `workflow_transition_available` |
| 10 | `owner_progress_wait_required` | Evidence is valid but action is blocked by an in-flight command or fresh wait state. | `wait_for_owner_progress` | `owner_progress_in_flight` |

### Outcome Shape

```js
const operationWorkflowOutcome = Object.freeze({
  owner: OPERATION_WORKFLOW_OWNER,
  boundary: OPERATION_WORKFLOW_PROGRESS_DECISION_KERNEL,
  state,
  outcome,
  nextRequiredAction,
  effectCommand,
  reasons,
  correlationKey,
  sourceRevision,
});
```

If no runtime effect is required, `effectCommand` is `no_operation_effect` from
the owner contract.

### Effects

| Effect command | Allowed executor | Idempotency key | Retry owner |
| --- | --- | --- | --- |
| `no_operation_effect` | No executor. | Outcome correlation key. | Operation workflow owner. |
| `dispatch_local_owner_command` | Existing workflow adapter in a later cutover package. | Operation id plus workflow commit generation. | Operation workflow owner. |
| `wake_remote_owner_command` | Existing workflow adapter in a later cutover package. | Operation id plus owner lease term. | Operation workflow owner. |
| `advance_existing_operation_command` | Existing workflow adapter in a later cutover package. | Operation id plus workflow history revision. | Operation workflow owner. |
| `reconcile_stale_progress_command` | Existing workflow adapter in a later cutover package. | Operation id plus timeout budget revision. | Operation workflow owner. |
| `record_terminal_success_command` | Existing workflow adapter in a later cutover package. | Operation id plus workflow commit generation. | Operation workflow owner. |
| `record_terminal_failure_command` | Existing workflow adapter in a later cutover package. | Operation id plus workflow commit generation. | Operation workflow owner. |

This package may define command values and output shape. It must not execute
effects from the decision module.

### Consumers

Allowed:

1. Operation workflow adapter after the adapter cutover package.
2. Priority recovery observation package after its contract is active.
3. Topology convergence analyzer after diagnostics consumer rewrite.
4. Operation owner decision tests.
5. Failure-bundle presentation after consumer rewrite.

Forbidden:

1. Priority recovery snapshots reading raw operation rows to classify workflow
   progress.
2. Diagnostics or harness reports inventing operation blocker names from raw
   logs, probes, or cache visibility.
3. Rebalancer participants scheduling operation effects without consuming the
   owner outcome.
4. Publication or readiness consumers completing operation workflow progress
   from publication symptoms.

### Legacy Deletion

Delete or block:

1. Workflow progress, serial wait, timeout, and dispatch branch piles in
   `operation-workflow-owner-segment-5*.js` and
   `operation-workflow-owner-segment-7*.js`.
2. Coordinator-local workflow progress decisions in `rebalance-coordinator*.js`.
3. Priority recovery stage-10 operation-progress reinterpretation.
4. Failure-bundle and convergence classifiers that name workflow progress from
   raw evidence once owner outcomes exist.

Structural guard:

1. Decision module imports no SQL repositories, timers, routers, diagnostics,
   or effect executors.
2. Adapter/cutover packages add import or call guards against the legacy branch
   piles before deletion.

Tail consumers:

1. Priority recovery observation contract.
2. Workflow owner adapter cutover.
3. Diagnostics and harness consumer rewrite.
4. Legacy deletion and representative proof package.

### Proof

1. Decision table fixture: focused operation workflow owner decision tests for
   every state and outcome listed above.
2. Owner adapter test: deferred to workflow owner adapter cutover unless this
   package introduces a no-effect helper.
3. Consumer test: deferred to priority recovery observation and diagnostics
   consumer packages.
4. Representative proof: stale-progress or transition-deferred focused
   regression from
   `test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`,
   plus representative blocker probe or generated evidence block if the
   blocker migrates.
5. Static guardrails:
   `npm run audit:guideline:decision-boundaries -- --changed` and
   `npm run audit:guideline:literals -- --changed`.
6. Work tracker validation: `npm run work:validate`.
7. Diff hygiene:
   `git diff --check -- .kiro/specs/spec-led-runtime-modularization work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md src/rebalancer/operation-workflow-owner*.js test/rebalancer/operation-workflow-owner-decision*.test.js`.

## Detection / Analysis Tasks

- [x] Build an operation evidence inventory from all current branch inputs.
- [x] Map each branch pile to one proposed state or reject it as adapter-only.
- [x] Identify duplicated reason names and shadow classifications.
- [x] Identify effectful code that must stay outside the decision kernel.
- [x] Record deletion candidates for the later adapter and legacy packages.

## Implementation Tasks

- [x] Add operation constants and state vocabulary.
- [x] Add an evidence normalizer that accepts raw adapter inputs and emits one
      immutable snapshot.
- [x] Add the pure decision table.
- [x] Add effect-command output shape without executing effects.
- [x] Add focused decision-table tests that cover all active representative
      operation blockers.
- [x] Leave adapters on the old path until the adapter cutover package.

## Implementation Notes

Branch-input inventory:

1. Serial waits are still represented through priority recovery planning reuse
   evidence and map to `serial_dependency_pending`.
2. Persisted-not-dispatched dispatch-pending rows map to
   `local_owner_dispatch_ready` when local lease authority is canonical.
3. Transition-deferred and stale timeout paths map to
   `stale_progress_reconcile_required` or
   `existing_operation_advancement_ready` depending on timeout and history
   evidence.
4. Remote handoff and drain wakeups map to `remote_owner_wake_required`.
5. Publication visibility deferral maps to
   `authoritative_visibility_deferred` and stays ahead of timeout or dispatch
   action in the decision table.

Shadow classifications replaced by owner reasons:

1. `priority_recovery_workflow_progress_transition_deferred`
2. `priority_operation_serial_wait`
3. `advance_owner_progress_from_timeout`
4. `advance_owner_progress_from_wait`

Effectful code left outside this package:

1. `dispatchOperation`, `executeOperationInternal`, and transition retry lanes.
2. `armCoordinatorCreatedOperation` and remote owner handoff wakeup helpers.
3. Priority recovery snapshot mutation and diagnostics presentation.

Deletion candidates remain the legacy branch piles named in the frozen Legacy
Deletion section for the adapter, consumer, diagnostics, and legacy deletion
packages.

## Validation

1. Focused operation owner decision tests.
2. Focused priority recovery workflow-progress regression if it can run without
   adapter cutover.
3. Representative rolling-restart blocker probe, or a generated evidence block
   that names the migrated owner and boundary if the blocker moves.
4. `npm run audit:guideline:decision-boundaries -- --changed`
5. `npm run audit:guideline:literals -- --changed`
6. `npm run work:validate`
7. `git diff --check -- .kiro/specs/spec-led-runtime-modularization work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md src/rebalancer/operation-workflow-owner*.js test/rebalancer/operation-workflow-owner-decision*.test.js`

## Validation Notes

Commands run:

1. `npx tap test/rebalancer/operation-workflow-owner-decision.test.js`
   passed. Covers the frozen table order, normalized absence variants,
   out-of-contract rejection, terminal success/failure, authoritative
   visibility deferral, stale timeout reconcile, serial wait, local
   persisted-not-dispatched dispatch, remote owner wake, existing transition
   advance, no-op owner wait, and inert effect-command shape.
2. `npm run audit:guideline:literals -- src/rebalancer/operation-workflow-owner-constants.js src/rebalancer/operation-workflow-owner-evidence.js src/rebalancer/operation-workflow-owner-state.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js`
   passed with 0 new literal-guideline violations and 0 inherited matches.
3. `npm run audit:guideline:decision-boundaries -- src/rebalancer/operation-workflow-owner-constants.js src/rebalancer/operation-workflow-owner-evidence.js src/rebalancer/operation-workflow-owner-state.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js`
   passed with 0 decision-boundary violations.
4. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-constants.js src/rebalancer/operation-workflow-owner-evidence.js src/rebalancer/operation-workflow-owner-state.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js`
   passed with 0 runtime-grammar-contract violations.
5. `git diff --check -- src/rebalancer/operation-workflow-owner-constants.js src/rebalancer/operation-workflow-owner-evidence.js src/rebalancer/operation-workflow-owner-state.js src/rebalancer/operation-workflow-owner-decision.js src/rebalancer/operation-workflow-owner-effects.js test/rebalancer/operation-workflow-owner-decision.test.js`
   passed.
6. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
   generated an owner evidence block naming
   `operation_workflow_owner / workflow_progress` with dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
7. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
   confirmed the first frontier remains
   `priority_recovery_partition_progress`, owner
   `operation_workflow_owner`, boundary `workflow_progress`.
8. `npm run work:validate` passed for 23 files.
9. `git diff --check -- .kiro/specs/spec-led-runtime-modularization work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md src/rebalancer/operation-workflow-owner*.js test/rebalancer/operation-workflow-owner-decision*.test.js`
   passed.
10. Parent reran
    `npx tap test/rebalancer/operation-workflow-owner-decision.test.js` after
    tightening in-flight command evidence; it passed with 141/141 assertions.
    The added cases prove in-flight commands block local dispatch and existing
    transition advancement.

Focused priority recovery runtime regression was not run because this package
does not cut adapters over to the new kernel.

## Done When

1. Operation progress has a pure, tested kernel.
2. Current operation blockers map to canonical outcomes.
3. No runtime effect is executed from the decision module.
4. Adapter cutover work has exact commands and deletion targets to consume.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Leibniz (`019e0b61-ff5e-7153-8356-2d5bb8a0e89c`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Heisenberg (`019e0b65-86a1-7732-9c25-3dd3ea6695cc`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md`.
- [x] Implementation subagent recorded:
      Agent Euclid (`019e0b6d-296d-7053-a9c9-af2639c8642e`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md`.

## Commit And Push Ledger

- Focused package commit: `1801d7ec`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
