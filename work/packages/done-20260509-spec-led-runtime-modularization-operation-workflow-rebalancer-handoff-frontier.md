# Spec-Led Runtime Modularization Operation Workflow Rebalancer Handoff Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-publication-convergence/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Rebalancer handoff was reduced to one operation workflow owner outcome for retry-scheduled priority recovery work. The representative rerun no longer reports rebalancer_handoff; it migrates priority_recovery_partition_progress to operation_workflow_owner / workflow_timeout with workflow_timeout_transition_deferred evidence while publication ACK convergence remains satisfied.",
  "nextAction": "Open or continue a fresh operation_workflow_owner / workflow_timeout package from test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner rebalancer_handoff fixture from the representative report",
    "Focused operation workflow/rebalancer handoff tests selected by priority_recovery_progress_blocked",
    "Touched-file static guardrails selected by operation_workflow_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/rebalancer/*handoff*.js",
    "src/rebalancer/unified-rebalancer*.js",
    "src/control-plane/priority-recovery-operation-owner-observation.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*workflow*.test.js",
    "test/rebalancer/*handoff*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/distributed/harness/failure-bundle-segment-3.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/priority-rebalancer-handoff.fixture.json",
    "test/scripts/__fixtures__/topology-convergence/priority-rebalancer-handoff.expected.json",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/model-ledger.jsonl",
    "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "rebalancer handoff evidence requires changes outside operation_workflow_owner",
      "focused fixture exposes publication ACK convergence again",
      "representative proof still fails on rebalancer_handoff after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-timeout-transition-deferred-frontier.md"
}
-->

## Why

The publication convergence package closed the pending ACK residual. The
representative rerun still fails, but the first frontier moved to
`operation_workflow_owner / rebalancer_handoff` on
`priority_recovery_partition_progress`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the publication convergence package before implementation starts.
2. Freeze the smallest rebalancer handoff witness from the representative
   report.
3. Trace operation workflow owner handoff for retry-scheduled priority
   recovery work.
4. Rewrite the owner path so rebalancer handoff has one canonical workflow
   outcome, retry reason, and re-entry path.
5. Keep diagnostics and harness consumers read-only and owner-bound.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Publication ACK convergence; that is predecessor proof.
2. Active-gate report schema alias deletion.
3. Harness timeout increases, report relabeling, or fallback workflow
   classification.
4. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / rebalancer_handoff`.
2. `priority_recovery_progress_blocked` must come from operation workflow
   owner evidence, not from diagnostics reconstructing retry-scheduled state
   from raw active-gate blockers.
3. `needs_operation` and `operation_stalled` must resolve through one
   canonical handoff decision table.
4. Publication ACK convergence must stay satisfied while this frontier is
   reduced.

## Tactical Inspiration

1. Temporal workflow histories: handoff retry state is durable owner history,
   not a consumer-side timeout guess.
2. Kubernetes controllers: retry-scheduled status needs one owning controller,
   stable reason codes, and explicit re-entry conditions.
3. Raft controller logs: membership and rebalancer handoff events must be
   ordered through a single owner path.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: rebalancer handoff evidence requires changes outside
  `operation_workflow_owner`; focused fixture exposes publication ACK
  convergence again; representative proof still fails on `rebalancer_handoff`
  after owner fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
operation workflow handoff boundary, unresolved semantic states, blocked
partition ids, retry-scheduled handoff reason, workflow outcome, and owner
reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, operation
workflow tests, priority recovery diagnostics, and sprint/package handoff
notes.

Prohibited reinterpretations: do not treat rebalancer handoff as publication
ACK convergence, startup snapshot coverage, generic readiness failure, or a
harness timeout. Do not add fallback workflow classification outside the
operation workflow owner.

Primary diagnostics / proof surfaces: rebalancer-handoff fixture, topology
convergence explain output, focused operation workflow/rebalancer tests,
static guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `rebalancer_handoff`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked`
- Source: `unresolvedSemanticStateIds: needs_operation,operation_stalled`,
  `blockedPartitionIds: replica_operations-p1,sql_transactions-p1,sql_write_operations-p1`,
  `dominantReason: priority_recovery_rebalancer_handoff_retry_scheduled`,
  `failureClass: priority_recovery_progress_blocked`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain priority_recovery_partition_progress`

## Implementation Evidence

- Frozen probe:
  `test/scripts/__fixtures__/topology-convergence/priority-rebalancer-handoff.fixture.json`
  and
  `test/scripts/__fixtures__/topology-convergence/priority-rebalancer-handoff.expected.json`.
- Root cause: active created-operation handoff retry evidence stayed inside
  the coordinator owner and was not exposed through the workflow owner retry
  budget port. Priority recovery snapshots also skipped owner overlay for
  `dispatched_waiting_progress`, leaving retry-deferred handoff evidence to
  be interpreted by consumer fallback paths.
- Owner fix: retry-scheduled remote handoff now maps through
  `remote_owner_handoff_retry_scheduled`,
  `wait_for_rebalancer_handoff_retry`, and
  `remote_handoff_retry_scheduled`, with one priority recovery descriptor:
  pending contract, retry next action, `rebalancer_handoff` boundary, and
  retry-scheduled wait mode.
- Consumer update: the failure-bundle handoff witness now uses the owner
  pending contract vocabulary instead of deferred fallback vocabulary.

## Representative Rerun Evidence

- Source artifact:
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_timeout`
- Frontier state: `blocked`
- Dominant source:
  `priority_recovery_workflow_timeout_transition_deferred`
- Dominant witness: `sql_transaction_participants-p1`
- Representative result: rebalancer handoff reduced; residual frontier
  migrated to `operation_workflow_owner / workflow_timeout`.
- Publication ACK convergence: satisfied in the representative report
  (`publicationStatus: PUBLISHED`, pending ACK count `0`, missing published
  count `0`).

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Hubble (`019e0cf8-d227-77a0-85a1-659bb7cb90a1`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`; result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
      Agent Averroes (`019e0cfd-15a6-77e1-ab9a-71ec00bf0d2a`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md`.

## Detection / Analysis Tasks

- [x] Review the publication convergence package before implementation
      starts.
- [x] Extract the smallest rebalancer handoff fixture from the representative
      report.
- [x] Trace the operation workflow owner handoff path for
      retry-scheduled priority recovery work.
- [x] Identify any diagnostics or active-gate branch that masks handoff owner
      evidence.

## Implementation Tasks

- [x] Add or update the focused rebalancer handoff fixture.
- [x] Rewrite the owner logic so rebalancer handoff has one canonical decision
      path.
- [x] Delete or guard superseded handoff fallback branches.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
- [x] Rerun representative rolling-restart and migrate any fresh frontier.
      Representative evidence moved from `rebalancer_handoff` to
      `operation_workflow_owner / workflow_timeout`.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain priority_recovery_partition_progress`
3. Focused operation workflow/rebalancer handoff tests selected by
   `operation_workflow_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --fast-local --verbose`

## Validation Results

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain priority_recovery_partition_progress`
   - Passed; source report still identifies the frozen
     `operation_workflow_owner / rebalancer_handoff` witness.
2. `npx tap test/rebalancer/operation-workflow-owner-decision.test.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
   - Passed, `260/260`.
3. `node --test test/scripts/analyze-topology-convergence.test.js test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
   - Passed, `28/28`.
4. `node scripts/check-guideline-literals.js ...`, `node scripts/check-guideline-decision-boundaries.js ...`, `npm run audit:runtime-grammar:file -- ...`, and `git diff --check -- ...`
   - Passed for touched production/test/package files.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --fast-local --verbose`
   - Failed on the representative timeout, but no longer on
     `rebalancer_handoff`; analyzer migrates the residual frontier to
     `operation_workflow_owner / workflow_timeout`.

## Commit And Push Ledger

1. Focused package commit: `5a5b97c6`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Done When

1. Rebalancer handoff has one owner-bound decision path.
2. Focused operation workflow and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
