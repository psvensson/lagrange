# Spec-Led Runtime Modularization Operation Workflow Timeout Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_timeout",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The active-gate snapshot package removed startup/status and snapshot-lane fallback behavior. The representative rolling-restart rerun now selects operation_workflow_owner / workflow_timeout as the first frontier while active-gate snapshot coverage remains downstream at 2/5.",
  "nextAction": "Freeze the operation workflow timeout witness from the new report, trace the operation workflow owner path for transition-deferred event-driven wait, and rewrite the owner path so stalled priority recovery progress has one canonical outcome.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_timeout fixture from the representative report",
    "Focused operation workflow owner tests selected by workflow_timeout",
    "Touched-file static guardrails selected by operation_workflow_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*workflow*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/distributed/harness/failure-bundle*.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "workflow timeout evidence requires changes outside operation_workflow_owner",
      "focused fixture exposes a different first frontier",
      "representative proof still fails on workflow_timeout after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md"
}
-->

## Why

The active-gate package removed fallback paths that were masking startup
snapshot debt. The fresh representative rerun still fails, but the analyzer now
selects operation workflow progress as the first frontier before active-gate
snapshot coverage:
`operation_workflow_owner / workflow_timeout`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Freeze the workflow-timeout fixture from the representative report.
2. Trace the operation workflow owner path for transition-deferred
   event-driven wait.
3. Rewrite the owner logic so priority recovery workflow timeout emits one
   canonical owner outcome and reasons.
4. Keep diagnostics and harness consumers read-only and owner-bound.
5. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Active-gate snapshot fallback deletion; that is predecessor proof.
2. Active-gate report schema alias deletion.
3. Harness timeout increases, report relabeling, or fallback workflow paths.
4. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / workflow_timeout`.
2. `priority_recovery_progress_blocked` must remain operation-workflow evidence
   until the owner emits a canonical satisfied, retryable, deferred, or blocked
   outcome.
3. Startup active-gate snapshot coverage must not mask workflow timeout debt.
4. Diagnostics may present the operation owner decision but must not recreate
   it from raw cache timing or reachability evidence.

## Tactical Inspiration

1. Temporal workflow history: stalled workflow progress is classified from
   durable owner state, not inferred from elapsed time alone.
2. Kubernetes controllers: event-driven waits must have explicit re-entry
   conditions and stable status reasons.
3. Raft controllers: metadata workflow ownership stays in one log and one
   owner path, even when consumers observe stale or partial progress.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: workflow timeout evidence requires changes outside
  `operation_workflow_owner`; focused fixture exposes a different first
  frontier; representative proof still fails on `workflow_timeout` after owner
  fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress summary,
dominant workflow witness, unresolved semantic state ids, blocked partition
ids, workflow timeout boundary, and owner reasons
`priority_recovery_progress_blocked` and
`priority_recovery_event_driven_wait`.

Allowed consumers: topology convergence analyzer, failure bundle, priority
recovery diagnostics, operation workflow tests, and sprint/package handoff
notes.

Prohibited reinterpretations: do not treat workflow timeout as startup
snapshot coverage, publication convergence, generic readiness failure, or a
harness timeout. Do not add fallback workflow classification outside the
operation workflow owner.

Primary diagnostics / proof surfaces: workflow-timeout fixture, topology
convergence explain output, focused operation workflow tests, static
guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_timeout`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked, priority_recovery_event_driven_wait`
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json --explain priority_recovery_partition_progress`

## Implementation Evidence

- Implementation subagent: Agent Ptolemy
  (`019e0cbe-3acf-7ee0-9faa-3aa88dbb0009`) implemented this
  package.
- Frozen witness:
  `control_plane_publications-p1` operation
  `fc5e0a3a-e508-4974-b62b-0b6dfa5acc4d`, latest workflow step
  `SENDING`, status `pending`, workflow phase `dispatch_pending`,
  `stepAgeMs=57442`, `stepTimeoutMs=30000`,
  `operation_stalled`, `operation_created_but_no_step_transitions`,
  next action `reconcile_stale_operation_progress`, boundary
  `workflow_timeout`, wait mode `timeout_reconcile_due`.
- Runtime change: `OWNER_RECONCILE` is now an operation workflow owner port
  mode, and stale `SENDING` / `pending` dispatch-pending owner reconcile
  evidence enters the canonical dispatch-not-observed owner path before
  transition advancement.
- Representative rerun:
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json`
  failed after `129.9s`, but migrated the first frontier off
  `operation_workflow_owner / workflow_timeout`.
- Fresh frontier evidence: topology convergence now selects
  `topology_publication_owner / publication_convergence` with dominant reason
  `pending_acks_present`. Priority recovery remains a downstream blocked
  witness under `operation_workflow_owner / workflow_progress`, and the old
  `priority_recovery_workflow_timeout_transition_deferred` dominant witness is
  no longer first frontier evidence.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent McClintock (`019e0cba-a6ca-7c70-8033-0f84e8ecf3cd`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-active-gate-snapshot-coverage-frontier.md`; result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
      Agent Ptolemy (`019e0cbe-3acf-7ee0-9faa-3aa88dbb0009`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md`.

## Commit And Push Ledger

1. Focused package commit: `a8aa566f2b3d008f7ea88326799fc33f03237c59`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Detection / Analysis Tasks

- [x] Review the active-gate snapshot package before implementation starts.
- [x] Extract the smallest workflow-timeout fixture from the representative
      report.
- [x] Trace the operation workflow owner path for transition-deferred
      event-driven wait.
- [x] Identify any cache, timeout, or diagnostics branch that can mask workflow
      timeout evidence.

## Implementation Tasks

- [x] Add or update the focused operation workflow timeout fixture.
- [x] Rewrite the owner logic so workflow timeout debt has one canonical
      decision path.
- [x] Delete or guard superseded workflow fallback branches.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
- [x] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot.report.json --explain priority_recovery_partition_progress`
3. Focused operation workflow owner tests selected by
   `operation_workflow_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json --fast-local --verbose`

Validation notes:

1. `node test/rebalancer/operation-workflow-owner-adapter.test.js`
   passed: 31/31 assertions.
2. `node test/rebalancer/operation-workflow-owner-decision.test.js`
   passed: 161/161 assertions.
3. `node test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
   passed: 51/51 assertions.
4. `node test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
   passed: 16/16 assertions.
5. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner*.js src/control-plane/priority-recovery-snapshot*.js src/diagnostics/topology-convergence-graph.js`
   passed: 0 new literal-guideline violations.
6. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner*.js src/control-plane/priority-recovery-snapshot*.js src/diagnostics/topology-convergence-graph.js`
   passed: 0 decision-boundary guideline violations.
7. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner*.js src/control-plane/priority-recovery-snapshot*.js src/diagnostics/topology-convergence-graph.js`
   failed on 5 inherited runtime-grammar violations in untouched
   `src/rebalancer/operation-workflow-owner-segment-5.js`.
8. `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js`
   passed: 0 runtime-grammar-contract violations in touched runtime files.
9. `npm run work:validate`
   passed: work tracker validation OK for 27 files.
10. `git diff --check -- src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js test/rebalancer/operation-workflow-owner-adapter.test.js work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md`
   passed.
11. Representative rolling-restart failed 0/1 after `129.9s`, but the
    topology analyzer migrated the first frontier to
    `topology_publication_owner / publication_convergence` with
    `pending_acks_present`.

## Migration

Successor package:
`work/packages/active-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`.

## Done When

1. Operation workflow timeout has one owner-bound decision path.
2. Focused operation workflow and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
