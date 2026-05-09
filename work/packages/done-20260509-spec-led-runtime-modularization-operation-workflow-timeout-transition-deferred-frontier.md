# Spec-Led Runtime Modularization Operation Workflow Timeout Transition-Deferred Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_timeout",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Workflow timeout transition-deferred evidence was reduced to canonical operation workflow progress re-entry. The latest representative report no longer fails on workflow_timeout or rebalancer_handoff; it migrates to priority_recovery_partition_progress with operation_workflow_owner / workflow_progress, unresolved semantic states operation_stalled and recovering_in_flight, blocked partitions replica_operations-p1 and sql_transactions-p1, and dominant source priority_recovery_workflow_progress_event_driven.",
  "nextAction": "Open or continue the successor operation_workflow_owner / workflow_progress package from test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_timeout fixture from the representative report",
    "Focused operation workflow timeout/reentry tests selected by priority_recovery_workflow_timeout_transition_deferred",
    "Touched-file static guardrails selected by operation_workflow_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json --fast-local --verbose"
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
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/model-ledger.jsonl",
    "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-transition-deferred-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "workflow timeout evidence requires changes outside operation_workflow_owner",
      "focused fixture exposes rebalancer_handoff again",
      "representative proof still fails on workflow_timeout after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md",
  "currentBlocker": {
    "report": "test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json",
    "frontierEdge": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_progress_blocked",
    "residual": "workflow_timeout and rebalancer_handoff reduced; representative migrated to event-driven workflow progress",
    "publicationAckConvergence": {
      "state": "satisfied",
      "publicationStatus": "PUBLISHED",
      "pendingAckCount": 0,
      "missingPublishedCount": 0
    },
    "migratedFrontier": {
      "edgeId": "priority_recovery_partition_progress",
      "owner": "operation_workflow_owner",
      "boundary": "workflow_progress",
      "dominantReason": "priority_recovery_progress_blocked"
    }
  },
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-event-driven-frontier.md"
}
-->

## Why

The rebalancer handoff package closed the retry-scheduled handoff boundary.
The representative rerun still fails, but the first frontier moved to
`operation_workflow_owner / workflow_timeout` on
`priority_recovery_partition_progress`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the rebalancer handoff package before implementation starts.
2. Freeze the smallest workflow-timeout transition-deferred witness from the
   representative report.
3. Trace operation workflow owner timeout and re-entry handling for
   transition-deferred priority recovery work.
4. Rewrite the owner path so workflow timeout has one canonical stale-progress
   outcome, retry reason, and re-entry path.
5. Keep rebalancer handoff and publication ACK convergence satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Rebalancer handoff retry scheduling; that is predecessor proof.
2. Publication ACK convergence; that is earlier predecessor proof.
3. Active-gate report schema alias deletion.
4. Harness timeout increases, report relabeling, or fallback workflow
   classification.
5. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / workflow_timeout`.
2. `priority_recovery_workflow_timeout_transition_deferred` must come from
   operation workflow owner evidence, not from diagnostics reconstructing
   timeout state from raw active-gate blockers.
3. `operation_stalled` and `recovering_in_flight` must resolve through one
   canonical timeout/re-entry decision table.
4. Rebalancer handoff and publication ACK convergence must stay satisfied
   while this frontier is reduced.

## Tactical Inspiration

1. Temporal workflow histories: timeout state is durable owner history, not a
   consumer-side elapsed-time guess.
2. Kubernetes controllers: timeout reconciliation needs one owning controller,
   stable reason codes, and explicit re-entry conditions.
3. Raft controller logs: timeout and handoff events must be ordered through a
   single owner path.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: workflow timeout evidence requires changes outside
  `operation_workflow_owner`; focused fixture exposes `rebalancer_handoff`
  again; representative proof still fails on `workflow_timeout` after owner
  fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
operation workflow timeout boundary, unresolved semantic states, blocked
partition ids, transition-deferred timeout reason, workflow outcome, and owner
reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, operation
workflow tests, priority recovery diagnostics, and sprint/package handoff
notes.

Prohibited reinterpretations: do not treat workflow timeout as rebalancer
handoff, publication ACK convergence, startup snapshot coverage, generic
readiness failure, or a harness timeout. Do not add fallback workflow
classification outside the operation workflow owner.

Primary diagnostics / proof surfaces: workflow-timeout fixture, topology
convergence explain output, focused operation workflow/rebalancer tests,
static guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_timeout`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked, priority_recovery_event_driven_wait`
- Source: `unresolvedSemanticStateIds: operation_stalled,recovering_in_flight`,
  `blockedPartitionIds: control_plane_publications-p1,replica_operations-p1,sql_transaction_participants-p1`,
  `dominantReason: priority_recovery_workflow_timeout_transition_deferred`,
  `failureClass: priority_recovery_progress_blocked`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --explain priority_recovery_partition_progress`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Faraday (`019e0d15-523b-7ad0-b1f4-82239412843c`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Curie (`019e0d19-4336-7471-9358-11caf22ae5fe`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md`.
- [x] Implementation subagent recorded:
      Agent Peirce (`019e0d1f-856e-7d30-a49b-a3052fa5d840`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-transition-deferred-frontier.md`.

## Detection / Analysis Tasks

- [x] Review the rebalancer handoff package before implementation starts.
      Faraday reviewed the closed predecessor and Curie fixed the tracker-only
      closure proof finding before implementation starts.
- [x] Extract the smallest workflow-timeout transition-deferred fixture from
      the representative report.
- [x] Trace the operation workflow owner timeout path for transition-deferred
      priority recovery work.
- [x] Identify any diagnostics or active-gate branch that masks timeout owner
      evidence.

## Implementation Tasks

- [x] Add or update the focused workflow-timeout fixture.
- [x] Rewrite the owner logic so workflow timeout has one canonical decision
      path.
- [x] Delete or guard superseded timeout fallback branches.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
- [x] Rerun representative rolling-restart and migrate any fresh frontier.

## Implementation Evidence

- Frozen fixture/probe:
  `test/scripts/__fixtures__/topology-convergence/priority-workflow-timeout-transition-deferred.fixture.json`
  and
  `test/scripts/__fixtures__/topology-convergence/priority-workflow-timeout-transition-deferred.expected.json`.
- Root cause: priority recovery consumers translated stale workflow-timeout
  owner evidence into `transition_deferred` / `workflow_timeout` diagnostics
  and a stale-progress retry action instead of re-entering the canonical
  `advance_existing_operation` owner progression path.
- Runtime change: operation workflow timeout re-entry now preserves the
  timeout cause into the owner adapter, maps stale timeout outcomes to
  workflow-progress re-entry, infers the same owner outcome for selected
  dispatch-pending timeout snapshots, and guards same-operation retry-log
  handoff witnesses once direct operation workflow progress advancement
  evidence exists.
- Handoff/ACK state: the fresh representative report keeps
  `publication_ack_convergence` satisfied and no longer reports
  `rebalancer_handoff` or `workflow_timeout`. The remaining
  `priority_recovery_partition_progress` frontier is
  `operation_workflow_owner / workflow_progress`.

## Validation Results

- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --explain priority_recovery_partition_progress`
  passed as the frozen source witness.
- `npx tap test/rebalancer/operation-workflow-owner-decision.test.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/control-plane/priority-recovery-snapshot.test.js`
  passed: 626 passing.
- `node --test test/scripts/analyze-topology-convergence.test.js test/diagnostics/topology-convergence-graph.test.js test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
  passed: 31 passing.
- Correction-worker focused regression:
  `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
  passed: 10 passing.
- Correction-worker analyzer proof on the current representative report
  re-normalized through the corrected summary normalizer:
  `npm run analyze:topology-convergence -- /tmp/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.renormalized.report.json`
  reports first frontier `priority_recovery_partition_progress`,
  `operation_workflow_owner / workflow_progress`; `rebalancer_handoff` is no
  longer dominant.
- Static guardrails passed for touched production files: literal guideline,
  decision-boundary guideline, runtime grammar, and `git diff --check`.
- Representative command wrote
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json`
  and failed on a migrated frontier:
  `operation_workflow_owner / workflow_progress`.

## Migrated Frontier

- Fresh representative frontier:
  `priority_recovery_partition_progress`.
- Owner/boundary:
  `operation_workflow_owner / workflow_progress`.
- Dominant reasons:
  `priority_recovery_progress_blocked`,
  `priority_recovery_event_driven_wait`.
- Package-owned edge status:
  `workflow_timeout` and `rebalancer_handoff` are reduced; the remaining
  witness is event-driven workflow progress for `sql_transactions-p1`, with
  `replica_operations-p1` still blocked in workflow progress.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --explain priority_recovery_partition_progress`
3. Focused operation workflow/rebalancer timeout tests selected by
   `operation_workflow_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json --fast-local --verbose`

## Done When

1. Workflow timeout has one owner-bound decision path.
2. Focused operation workflow and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.

## Commit And Push Ledger

1. Focused package commit: `18e980d3`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
