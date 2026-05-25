# Rolling Restart Resume Activation Brief

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "read-review-doc-only",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "rolling_restart_resume_activation_brief",
  "dominantReason": "paused_release_gate_needs_concrete_resume_path",
  "currentState": "The future-governance sprint now needs a concrete rolling-restart resume activation brief so the paused runtime sprint restarts from the repeated priority-recovery operation-progress edge instead of another local witness.",
  "nextAction": "Before rolling-restart runtime work resumes, reconcile this brief with the latest active artifact and activate a runtime-owner or scenario-release-gate package that cites the blocker-path ledger row, operation-progress contract seed, focused fixture proof, and green path sequence.",
  "proof": [
    "npm run work:package:doctor -- --suggest work/packages/active-20260513-rolling-restart-resume-activation-brief.md",
    "npm run work:validate -- --entry work/packages/active-20260513-rolling-restart-resume-activation-brief.md",
    "git diff --check -- work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-rolling-restart-resume-activation-brief.md work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md work/sprints/done-2026-q2-future-sprint-release-gate-systemic-governance.md work/sprints/current-blocker.json work/sprints/current-blocker.md"
  ],
  "writeScope": [
    "work/packages/active-20260513-rolling-restart-resume-activation-brief.md",
    "work/packages/todo-20260513-rolling-restart-resume-activation-brief.md",
    "work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md",
    "work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
    "work/sprints/done-2026-q2-future-sprint-release-gate-systemic-governance.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
    "work/packages/todo-20260513-release-gate-architecture-contract-template.md",
    "work/packages/todo-20260513-release-gate-fixture-first-policy.md",
    "work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
    "work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
    "test-output/reports/rolling-restart-green-only-baseline-20260513.report.json",
    "test-output/reports/rolling-restart-green-gate-after-direct-wakeup-transport-contract.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260513-rolling-restart-resume-activation-brief.md",
    "work/packages/todo-20260513-rolling-restart-resume-activation-brief.md",
    "work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md",
    "work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
    "work/sprints/done-2026-q2-future-sprint-release-gate-systemic-governance.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "workflow-tooling-governance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "resume-activation-brief/rolling-restart",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "active artifact first frontier changed since this brief was written",
      "runtime implementation scope is selected",
      "the brief needs to reinterpret raw report JSON instead of using canonical extractors"
    ]
  }
}
-->

## Why

The active `rolling-restart` sprint was paused to create governance that improves
future release-gate execution. Without a concrete resume brief, the resumed
runtime work can still restart at the newest witness and repeat the same
package-level ping-pong.

This package turns the governance sprint into a practical handoff: the next
runtime package must cite a concrete blocker path, operation-progress contract
seed, focused fixture proof, and green path sequence before implementation.

## Scope Basis

Approved workflow/tooling governance under `work/`. This package is valid
without a roadmap change because it creates a handoff and activation rule only.

## Workflow Lane

- Selected lane: `read-review-doc-only`
- Why this lane is sufficient: the package writes planning and activation
  guidance only.
- Escalation trigger to a heavier lane: runtime source edits, active
  rolling-restart package mutation, or representative evidence mutation.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
  and
  `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`.
- Evidence that may be read but not mutated: active artifact names, current
  first frontier, residual states, proof ladder, and prior package chain.
- Files explicitly forbidden by this package: `src/`, `test/rebalancer/`,
  `test/control-plane/`, representative report artifacts, the active
  rolling-restart package, and the active rolling-restart sprint.
- Runtime architecture ideas captured as contract/backlog items: priority
  recovery operation-progress owner path, owner-key reconcile loop, active-gate
  dependency, and budget inheritance.
- Activation rule before any runtime/scenario implementation: reconcile this
  brief with the latest active artifact and create or activate a separate
  `runtime-owner-boundary` or `scenario-release-gate` package.

## Higher-Order Problem Framing

- Blocker-path ledger rows this package consumes: publication convergence
  non-frontier, rebalancer handoff retry, rebalancer-leader operation
  scheduling, workflow-progress repeated priority-recovery residuals, and
  downstream startup active-gate snapshot coverage.
- Repeated owner-boundary failure or causal edge being addressed: priority
  recovery does not yet have one canonical operation-progress owner path from
  desired recovery action to dispatch, retry, reconcile, timeout, or completion.
- Architecture contract created, updated, or required before runtime work:
  priority-recovery operation-progress contract.
- Focused fixture, extractor, or probe required before representative rerun:
  `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`,
  `npm run analyze:priority-recovery-residuals -- <latest-artifact> --markdown`,
  and
  `npm run analyze:topology-convergence -- <latest-artifact> --explain priority_recovery_partition_progress`.
- Bounded progress mechanism and maximum bound: one owner-key reconcile cycle
  must dispatch, retry, timeout, advance, reconcile, or classify the operation
  with a named owner-owned fallback.
- Runtime backlog item that may activate later: Priority Recovery Operation
  Progress Kernel.
- Latest active scenario proof this package reconciles with:
  `test-output/reports/rolling-restart-green-only-baseline-20260513.report.json`
  when governance started, and the latest active package artifact before
  resumption.

## Resume Activation Brief

The next resumed runtime package should start from this shape unless canonical
extractors show a newer first frontier:

- Scenario: `rolling-restart`
- Owner: `operation_workflow_owner`
- Boundary: `workflow_progress`
- Current residual: priority-recovery partitions have target-owned `PENDING`
  system-table operations that must advance through one owner path.
- Dominant repeated edge: operation creation, remote handoff, dispatch-pending,
  serial-wait, event-driven wait, stale timeout, and target-owned `PENDING`
  witnesses are all views of one missing operation-progress kernel.
- Downstream blocker: `startup_active_gate_owner / snapshot_coverage` remains
  downstream until priority-recovery operation progress closes.
- Forbidden closures: classification-only, accepted backpressure, reduced
  evidence, owner migration without green, harness timeout stretching, Pro
  behavior, and Enterprise behavior.
- First runtime package to activate if evidence is still same-frontier:
  `Priority Recovery Operation Progress Kernel`.

The runtime package must answer these activation questions before implementation:

1. Which ledger row proves this is a repeated causal edge rather than a new local
   witness?
2. Which operation-progress state transition is missing?
3. Which owner-key owns the next reconcile, dispatch, retry, timeout, advance, or
   completion?
4. Which focused fixture or extractor proves the transition before a full
   distributed rerun?
5. What same-frontier fallback runs after one bounded owner cycle?

## Seeded Blocker Path

1. Publication convergence was reduced to non-frontier when publication was
   `PUBLISHED` with zero pending acknowledgements. Resume work must not return to
   publication unless canonical extractors promote it again.
2. Rebalancer handoff retry scheduling was reduced, but priority-recovery
   partitions repeatedly migrated back to workflow progress.
3. Rebalancer-leader operation scheduling reduced missing operation creation, but
   did not close operation progress.
4. Workflow progress has repeated residuals: `coordination_mismatch`,
   `recovering_in_flight`, serial wait, event-driven wait, dispatch-pending,
   stale timeout, and target-owned `PENDING`.
5. Startup active-gate snapshot coverage remains downstream until workflow
   progress closes.

## Operation-Progress Contract Seed

Semantic owner: `operation_workflow_owner`.

Canonical states:

1. `needs_operation`
2. `operation_created`
3. `handoff_pending`
4. `handoff_acknowledged`
5. `dispatch_pending`
6. `step_in_progress`
7. `retry_scheduled`
8. `blocked`
9. `completed`
10. `terminal_failed`

Required owner events and outcomes:

1. Desired recovery action creates or reuses one operation id.
2. Operation owner and coordinator are normalized before dispatch.
3. Handoff either acknowledges, retries with a deadline, or times out into an
   owner-owned fallback.
4. Dispatch-pending either dispatches, retries, times out, or reconciles from the
   owner-key loop.
5. Step progress either advances, completes, blocks with owner evidence, or
   fails terminally.
6. Diagnostics project the owner-owned state and next action without reinterpreting
   the decision locally.

Allowed consumers: topology convergence, priority-recovery residual analyzers,
active-gate dependency logic, startup readiness support evidence, and failure
bundles.

Prohibited reinterpretations: local publication, active-gate, startup-readiness,
or rebalancer-handoff code must not treat retryable/backpressure evidence as
closed unless the operation-progress owner has named a bounded mechanism and
maximum bound.

## Focused Fixture Proof

Before the next representative rerun, resumed runtime work must prove the current
blocker through focused evidence:

1. `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`
2. `npm run analyze:priority-recovery-residuals -- <latest-artifact> --markdown`
3. `npm run analyze:topology-convergence -- <latest-artifact> --explain priority_recovery_partition_progress`
4. Focused owner tests selected by the runtime package for dispatch, retry,
   timeout, reconcile, or advance behavior.

If no focused proof can represent the target-owned `PENDING` residual, the next
package must be tooling or architecture, not runtime implementation.

## No-More-Symptom Gate

A resumed runtime package is invalid if its only claim is that it fixes one
partition, one table, one node id, one timeout witness, or one report shape.

It must instead name:

1. The repeated causal edge it collapses.
2. The prior packages that show the edge repeats.
3. The state transition it owns in the operation-progress contract.
4. The bounded mechanism and maximum bound.
5. The same-frontier fallback after one owner cycle.

## Green Path Sequence

1. Target-owned `PENDING` priority-recovery operations advance through one owner
   path.
2. Priority recovery no longer blocks active topology progress.
3. Active-gate snapshot coverage advances instead of timing out behind priority
   recovery.
4. Startup readiness consumes active-gate evidence instead of fronting as a
   terminal readiness blocker.
5. `rolling-restart` passes, or fresh evidence promotes a different first
   frontier inside the same active sprint loop.

## Stale-Proof Check

Immediately before activating runtime work, run:

1. `npm run work:evidence-summary -- <latest-active-artifact>`
2. `npm run analyze:priority-recovery-residuals -- <latest-active-artifact> --markdown`
3. `npm run analyze:topology-convergence -- <latest-active-artifact> --explain priority_recovery_partition_progress`
4. `npm --silent run analyze:causal-model -- <latest-active-artifact>`

If the first frontier, owner boundary, residual state, or downstream blocker set
differs materially from this brief, refresh the brief before activation.

## Model Fit

- Package class: `workflow-tooling-governance`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `resume-activation-brief/rolling-restart`
- Output profile: `medium`
- Owned files:
  `work/packages/active-20260513-rolling-restart-resume-activation-brief.md`,
  `work/packages/todo-20260513-rolling-restart-resume-activation-brief.md`,
  `work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md`,
  `work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md`,
  `work/sprints/done-2026-q2-future-sprint-release-gate-systemic-governance.md`,
  `work/sprints/current-blocker.json`, and `work/sprints/current-blocker.md`
- Forbidden files: `src/`, `test/rebalancer/`, `test/control-plane/`,
  representative report artifacts, active rolling-restart package/sprint files
- Frozen decisions: this package does not implement runtime behavior or mutate
  the active rolling-restart lane.
- Escalation triggers: runtime package activation, stale active proof, or a need
  to read raw JSON because canonical extractors are insufficient.
- Focused proof:
  `npm run work:package:doctor -- --suggest work/packages/active-20260513-rolling-restart-resume-activation-brief.md`,
  `npm run work:validate -- --entry work/packages/active-20260513-rolling-restart-resume-activation-brief.md`,
  `git diff --check -- work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-rolling-restart-resume-activation-brief.md work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md work/sprints/done-2026-q2-future-sprint-release-gate-systemic-governance.md work/sprints/current-blocker.json work/sprints/current-blocker.md`

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/active-20260513-rolling-restart-resume-activation-brief.md`
2. `npm run work:validate -- --entry work/packages/active-20260513-rolling-restart-resume-activation-brief.md`
3. `git diff --check -- work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-rolling-restart-resume-activation-brief.md work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md work/sprints/done-2026-q2-future-sprint-release-gate-systemic-governance.md work/sprints/current-blocker.json work/sprints/current-blocker.md`

## Activation Checklist

- [ ] Latest active artifact reconciled with this brief.
- [ ] Runtime package cites this brief and the blocker-path ledger row.
- [ ] Runtime package names the exact operation-progress state transition.
- [ ] Runtime package names the focused fixture or analyzer proof.
- [ ] Runtime package names the same-frontier fallback after one owner cycle.
