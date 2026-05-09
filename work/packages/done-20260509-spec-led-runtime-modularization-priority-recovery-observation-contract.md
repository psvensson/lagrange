# Spec-Led Runtime Modularization Priority Recovery Observation Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
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
    "Focused operation workflow owner decision test for stale-progress command-idle gating",
    "Focused priority recovery snapshot tests",
    "Focused operation-owner outcome consumer fixture",
    "npm run audit:guideline:decision-boundaries -- --changed",
    "npm run audit:guideline:literals -- --changed"
  ],
  "touchedFiles": [
    ".kiro/specs/spec-led-runtime-modularization/migration-map.md",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/control-plane/priority-recovery-snapshot.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-operation-owner-observation.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "src/control-plane/priority-recovery-diagnostics-constants.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true
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

- [x] Inventory all priority recovery fields currently derived from operation
      rows, dispatch state, or elapsed time.
- [x] Map each field to owner outcome, priority observation, or deletion.
- [x] Identify all diagnostics constants that duplicate operation reasons.
- [x] Record old labels that must become aliases or be removed.

## Implementation Tasks

- [x] Add priority recovery observation constants.
- [x] Rewrite snapshot normalization to consume operation outcomes.
- [x] Replace local operation-progress branches with outcome mapping.
- [x] Update tests to assert observer behavior, not owner behavior.
- [x] Remove stale fallback reason selection.

## Validation

1. Focused priority recovery snapshot tests.
2. Focused analyzer presentation tests if the exposed reason vocabulary moves.
3. `npm run audit:guideline:decision-boundaries -- --changed`
4. `npm run audit:guideline:literals -- --changed`

## Pre-Implementation Fix Proof

The stale-progress command-idle regression failed before the owner decision
fix: `node --test test/rebalancer/operation-workflow-owner-decision.test.js`
reported 151 passing and 10 failing assertions, with in-flight workflow and
dispatch commands still emitting `reconcile_stale_progress_command`.

After the fix, the focused owner test passed with 161/161 assertions through
both the direct Node replay and the repo's TAP runner:
`node --test test/rebalancer/operation-workflow-owner-decision.test.js` and
`npx tap test/rebalancer/operation-workflow-owner-decision.test.js`.

File-scoped guardrails passed:

1. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-decision.js test/rebalancer/operation-workflow-owner-decision.test.js`
2. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-decision.js test/rebalancer/operation-workflow-owner-decision.test.js`
3. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-decision.js test/rebalancer/operation-workflow-owner-decision.test.js`
4. `git diff --check -- src/rebalancer/operation-workflow-owner-decision.js test/rebalancer/operation-workflow-owner-decision.test.js .kiro/specs/spec-led-runtime-modularization/migration-map.md work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md`

The temporary `npm run work:validate` failure from the open implementation
ledger cleared after the Bernoulli implementation entry was recorded.

## Implementation Notes

Priority recovery dispatch-pending normalization now consumes a canonical
operation-owner outcome through
`normalizePriorityRecoverySnapshotFromOperationOwnerOutcome`. The old local
workflow-step/status/timeout branch table was removed from
`priority-recovery-snapshot-stage-10.js`.

Current external priority recovery labels are preserved as aliases from owner
outcomes:

1. `wait_for_serial_operation` -> `wait_for_operation_progress` with
   `priority_operation_serial_wait`.
2. `dispatch_local_owner`, `wake_remote_owner`, and
   `advance_existing_operation` -> `advance_existing_operation`.
3. `reconcile_stale_progress` -> `reconcile_stale_operation_progress`.
4. `wait_for_owner_progress` -> `wait_for_operation_progress`.

The new observation record captures the owner outcome, requested owner action,
effect command, and `not_executed` effect execution state. Priority recovery
does not execute operation effects.

Deferred workflow adapter work: operation-owner outcomes are accepted by
`buildPriorityRecoveryDecisionSnapshot` and by the exported normalization helper,
but the workflow-owner adapter still needs to pass the real owner outcome from
its operation decision path instead of relying on planning snapshots alone.

## Implementation Validation Notes

Focused failing proof before implementation:

1. `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
   failed against the old local normalizer: 5/16 passing, 11/16 failing.

Focused passing proof after implementation:

1. `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
   passed: 16/16 assertions.
2. `node --test test/rebalancer/operation-workflow-owner-decision.test.js`
   passed: 161/161 assertions.
3. `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js test/rebalancer/operation-workflow-owner-decision.test.js`
   passed: 177/177 assertions.

Broader affected-suite state:

1. `node --test test/control-plane/priority-recovery-snapshot.test.js` still
   fails: 370/377 assertions pass, 7 fail in
   `priority recovery observation snapshots prefer explicit same-epoch needs-operation snapshots over stale terminal follow-up rows`.
   The dispatch-pending owner-outcome normalization cases in that suite now pass.

Static guardrails:

1. Baseline before implementation, with shell-expanded snapshot files, passed:
   `node scripts/check-guideline-literals.js ...`,
   `node scripts/check-guideline-decision-boundaries.js ...`, and
   `npm run audit:runtime-grammar:file -- ...`.
2. After implementation, file-scoped guardrails passed for
   `src/control-plane/priority-recovery-snapshot.js`,
   `src/control-plane/priority-recovery-snapshot-stage-10.js`,
   `src/control-plane/priority-recovery-operation-owner-observation.js`,
   `src/control-plane/priority-recovery-diagnostics-constants.js`,
   `test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`,
   and `test/control-plane/priority-recovery-snapshot.test.js`.
3. `git diff --check -- src/control-plane/priority-recovery-snapshot-stage-10.js src/control-plane/priority-recovery-operation-owner-observation.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js test/control-plane/priority-recovery-snapshot.test.js work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md`
   passed.
4. `npm run audit:guideline:decision-boundaries -- --changed` and
   `npm run audit:guideline:literals -- --changed` fail in this checkout because
   the underlying scripts treat `--changed` as a path.

## Parent Closure Validation

1. `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
   passed: 16/16 assertions.
2. `node --test test/rebalancer/operation-workflow-owner-decision.test.js`
   passed: 161/161 assertions.
3. `npx tap test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js test/rebalancer/operation-workflow-owner-decision.test.js`
   passed: 177/177 assertions.
4. File-scoped literal, decision-boundary, and runtime-grammar guardrails passed
   for the priority-recovery observation files and the owner decision fix files.
5. `npm run work:validate` passed.
6. `git diff --check -- ...` passed for the package-owned slice.
7. `node --test test/control-plane/priority-recovery-snapshot.test.js` still
   fails with 370/377 assertions passing in the existing
   `priority recovery observation snapshots prefer explicit same-epoch needs-operation snapshots over stale terminal follow-up rows`
   witness-selection case.

## Done When

1. Priority recovery no longer reconstructs workflow progress.
2. All priority recovery operation blockers cite operation-owner outcomes.
3. Presentation labels are stable aliases or deleted.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Feynman (`019e0b7e-d11b-7572-ae1c-1e3778b376d5`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Boole (`019e0b83-90f9-7fd0-9e78-86acd9a665db`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-operation-owner-kernel.md`.
- [x] Implementation subagent recorded:
      Agent Bernoulli (`019e0b89-ed7c-7281-849f-3a730ea7bce9`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md`.

## Commit And Push Ledger

- Focused package commit: `38380fa9`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
