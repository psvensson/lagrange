# Spec-Led Runtime Modularization Priority Recovery Observation Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "none",
  "owner": "priority_recovery_observer",
  "boundary": "operation_owner_observation",
  "dominantReason": "priority_recovery_can_still_reconstruct_operation_progress",
  "currentState": "Priority recovery snapshots can still blend observation, scheduling hints, operation workflow progress, and presentation labels instead of consuming a canonical operation-owner outcome.",
  "nextAction": "Rewrite priority recovery snapshots to observe operation-owner outcomes and emit only observation records plus owner requests.",
  "proof": [
    "Focused priority recovery snapshot tests",
    "Focused operation-owner outcome consumer fixture",
    "npm run audit:guideline:decision-boundaries -- --changed",
    "npm run audit:guideline:literals -- --changed"
  ],
  "touchedFiles": [
    "src/control-plane/priority-recovery-snapshot.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "src/control-plane/priority-recovery-diagnostics-constants.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md"
}
-->

## Why

Priority recovery is a critical consumer of operation progress. It should
surface which owner action is needed, not recreate operation progress logic from
local hints. This rewrite turns priority recovery into an observer and request
producer so it can aid recovery without becoming a second operation owner.

## Scope Basis

Operation owner kernel package and
`.kiro/specs/spec-led-runtime-modularization/migration-map.md` priority recovery
observation target.

## In Scope

1. Replace operation-progress classification inside priority recovery with
   consumption of operation-owner outcomes.
2. Define priority recovery observation records for partition priority,
   readiness lane, owner outcome, blocked dependency, and requested owner action.
3. Preserve current diagnostics labels only when they map to canonical owner
   outcomes.
4. Add tests for transition deferral, serial wait, dispatch pending, and stale
   progress as observed states.
5. Delete or quarantine local fallback classifications that duplicate operation
   owner decisions.

## Out Of Scope

1. Executing operation effects.
2. Changing the operation owner kernel vocabulary.
3. Publication stream rewrites.
4. Representative harness rerun unless this package becomes the active blocker
   closure package.

## Invariants

1. Priority recovery does not own workflow progress.
2. Priority recovery may request owner action, but it cannot decide operation
   advancement.
3. Snapshot absence is explicit evidence, not a domain state.
4. Diagnostics names must be derived from owner outcomes.

## Tactical Inspiration

1. Kubernetes status conditions: consumers read stable conditions from owners
   and add local context without overwriting the owner condition.
2. SRE diagnostic pipelines: separate root-cause witness selection from
   presentation and escalation.
3. Temporal worker boundaries: recovery workers can signal or request progress,
   but the workflow state machine remains authoritative.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot*.js`
2. `src/control-plane/priority-recovery-snapshot-stage-10.js`
3. `src/control-plane/priority-recovery-diagnostics-constants.js`
4. `test/control-plane/priority-recovery-snapshot*.js`
5. `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
6. `scripts/analyze-topology-convergence.js`

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`; consumer owner:
`priority_recovery_observer`.

Canonical contract shape / vocabulary: priority recovery receives owner
outcomes and emits observation records with priority lane, partition id,
operation outcome, local urgency, and requested owner action.

Allowed consumers: topology analyzer, failure bundles, active gate diagnostics,
and owner-specific tests.

Prohibited reinterpretations: priority recovery cannot create operation
blocker reasons from raw dispatch age, cache coverage, publication state, or
startup active gate symptoms.

Primary diagnostics / proof surfaces: priority recovery snapshot tests and
operation-owner outcome consumer fixtures.

## Detection / Analysis Tasks

- [ ] Inventory all priority recovery fields currently derived from operation
      rows, dispatch state, or elapsed time.
- [ ] Map each field to owner outcome, priority observation, or deletion.
- [ ] Identify all diagnostics constants that duplicate operation reasons.
- [ ] Record old labels that must become aliases or be removed.

## Implementation Tasks

- [ ] Add priority recovery observation constants.
- [ ] Rewrite snapshot normalization to consume operation outcomes.
- [ ] Replace local operation-progress branches with outcome mapping.
- [ ] Update tests to assert observer behavior, not owner behavior.
- [ ] Remove stale fallback reason selection.

## Validation

1. Focused priority recovery snapshot tests.
2. Focused analyzer presentation tests if the exposed reason vocabulary moves.
3. `npm run audit:guideline:decision-boundaries -- --changed`
4. `npm run audit:guideline:literals -- --changed`

## Done When

1. Priority recovery no longer reconstructs workflow progress.
2. All priority recovery operation blockers cite operation-owner outcomes.
3. Presentation labels are stable aliases or deleted.
