# Spec-Led Runtime Modularization Operation Owner Decision Kernel

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress_decision_kernel",
  "dominantReason": "operation_progress_decision_mixed_with_effects_and_consumers",
  "currentState": "Operation progress decisions are still spread across workflow-owner segments, coordinator paths, priority-recovery snapshots, and diagnostics consumers, making it too easy for old branch piles to survive the core rewrite.",
  "nextAction": "Introduce a pure operation-owner decision kernel with normalized evidence, explicit state vocabulary, and canonical outcomes before changing adapters or consumers.",
  "proof": [
    "Focused operation owner decision-table tests",
    "Focused stale-progress or transition-deferred regression from the latest rolling-restart artifact",
    "npm run audit:guideline:decision-boundaries -- --changed",
    "npm run audit:guideline:literals -- --changed"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/rebalancer/operation-workflow-owner-evidence.js",
    "src/rebalancer/operation-workflow-owner-state.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner-segment-7*.js",
    "test/rebalancer/operation-workflow-owner-decision*.test.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-operation-owner-kernel.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md"
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
2. The kernel is pure and side-effect free.
3. Outcomes use named variants, never `null`, `undefined`, raw booleans, cache
   presence, or elapsed time alone.
4. Consumers cannot create new operation blocker names outside the outcome
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

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: normalized operation evidence,
operation workflow state, decision outcome, ordered reasons, and effect-command
requests.

Allowed consumers: workflow adapter, priority recovery observation package,
topology convergence analyzer, operation tests, and failure-bundle presentation
after consumer rewrite.

Prohibited reinterpretations: consumers must not inspect raw operation rows,
cache misses, wall-clock age, dispatch counters, or publication symptoms to
choose an operation-progress blocker.

Primary diagnostics / proof surfaces: operation owner decision-table tests,
stale-progress regression, transition-deferred regression, decision-boundary
guardrail, literal-owner guardrail.

## Detection / Analysis Tasks

- [ ] Build an operation evidence inventory from all current branch inputs.
- [ ] Map each branch pile to one proposed state or reject it as adapter-only.
- [ ] Identify duplicated reason names and shadow classifications.
- [ ] Identify effectful code that must stay outside the decision kernel.
- [ ] Record deletion candidates for the later adapter and legacy packages.

## Implementation Tasks

- [ ] Add operation constants and state vocabulary.
- [ ] Add an evidence normalizer that accepts raw adapter inputs and emits one
      immutable snapshot.
- [ ] Add the pure decision table.
- [ ] Add effect-command output shape without executing effects.
- [ ] Add focused decision-table tests that cover all active representative
      operation blockers.
- [ ] Leave adapters on the old path until the adapter cutover package.

## Validation

1. Focused operation owner decision tests.
2. Focused priority recovery workflow-progress regression if it can run without
   adapter cutover.
3. `npm run audit:guideline:decision-boundaries -- --changed`
4. `npm run audit:guideline:literals -- --changed`

## Done When

1. Operation progress has a pure, tested kernel.
2. Current operation blockers map to canonical outcomes.
3. No runtime effect is executed from the decision module.
4. Adapter cutover work has exact commands and deletion targets to consume.
