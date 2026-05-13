# Topology Remote Handoff Convergence

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "Focused owner proof is green and the representative rolling-restart rerun has zero priority-recovery residual witnesses; the first frontier migrated to startup_active_gate_owner / snapshot_coverage.",
  "nextAction": "Close this priority-recovery package after required implementation subagent and focused commit proof, then activate the active-gate snapshot-coverage package.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown",
    "node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-topology-remote-handoff-convergence.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "work/packages/done-20260513-topology-remote-handoff-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-topology-remote-handoff-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the latest priority recovery residual, active coordinator-created remote handoff retry evidence must surface as a bounded rebalancer-handoff retry or advance through dispatch, delivery, ACK, timeout, or reconcile instead of remaining only event-driven workflow progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json",
    "expectedCausalModelChange": "priority_recovery_partition_progress either converges, reduces to rebalancer_handoff retry-scheduled evidence with bounded follow-up, or migrates to active_gate_snapshot_coverage after focused owner proof and a representative rerun.",
    "representativeOutcome": "migrated",
    "causalDebt": "The entry artifact reported 10 priority-recovery residual witnesses split between operation_workflow_owner / workflow_progress and operation_workflow_owner / rebalancer_handoff. The post-fix representative artifact reports priorityRecoveryInvariants=passed, priorityRecovery=none, and zero priority-recovery witnesses; remaining debt migrated to startup_active_gate_owner / snapshot_coverage with active_gate_timed_out and snapshot_coverage_incomplete.",
    "crossBoundaryReview": "First package in the Topology Convergence Ship Shape sprint; review is not-needed with reason first-package-in-sprint. Implementation subagent Raman (019e22c9-ed9a-7ec1-9b00-bc3081b69b48) inspected the package and reran the focused owner proof with 202 passing tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative report after focused SQL write dispatch retry proof",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with dominant reason priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage is now first frontier with active_gate_timed_out and snapshotCoverage=1/5",
      "startup_readiness_owner / startup_support_evidence remains deferred behind active_gate_snapshot_coverage",
      "publication convergence is PUBLISHED with pendingAck=0 but missingPublished=4 while active-gate coverage is incomplete"
    ],
    "missingCausalEdge": "Coordinator-created remote handoff retry/ACK progress must move retry_deferred recovering_in_flight operations through one bounded dispatch, delivery, ACK, timeout, or reconcile path.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown",
    "boundedProgressProof": "Focused owner tests must prove active remote handoff retry evidence is bounded and re-enters through the operation workflow owner without inline fallback or local mutation.",
    "boundedProgressProofArtifact": "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "active handoff retry evidence moves from workflow_progress / event_driven to rebalancer_handoff / retry_scheduled or the operation advances through owner dispatch progress.",
    "maxProgressBound": "one focused owner proof plus one representative rolling-restart rerun after guardrails pass",
    "sameFrontierFallback": "If representative evidence stays on priority_recovery_partition_progress, keep this package active and narrow to the remaining operation_workflow_owner sub-boundary instead of starting active-gate work.",
    "expectedNextFrontier": "active_gate_snapshot_coverage after priority recovery operation progress closes",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The current release-gate blocker is still
`operation_workflow_owner / workflow_progress`: coordinator-created remote
handoff operations are retry-deferred and recovering in flight without a
bounded ACK, timeout, or reconcile outcome. This package owns the first
runtime slice because active-gate and broader topology work are downstream of
that missing progress edge.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/todo-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package targets the current representative
  rolling-restart frontier with focused owner proof before a distributed rerun.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Close the current coordinator-created remote handoff retry/ACK gap named by
   the ship-shape sprint.
2. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.
3. Preserve the current owner boundary unless fresh canonical evidence migrates
   the first frontier.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `not-needed (first-package-in-sprint)`.
- [x] Fix subagent recorded or explicitly not needed:
      `not-needed`.
- [x] Implementation subagent recorded:
      `Agent Raman (019e22c9-ed9a-7ec1-9b00-bc3081b69b48) implemented work/packages/done-20260513-topology-remote-handoff-convergence.md`.

## Implementation Subagent Handoff

- 2026-05-13 implementation pass inspected the active package metadata,
  package-owned runtime files, and focused test proof. No runtime correction
  was required in this pass.
- Focused proof rerun:
  `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
  completed with 202 passing tests.
- Parent closure recorded the checked implementation subagent ledger line
  with the actual agent identity plus focused commit/push proof.

## Commit And Push Ledger

1. Focused package commit: 68fe6912
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Out Of Scope

1. Membership epoch, active-gate, failure-repair-intent, partition descriptor,
   anti-entropy, or broad budget work.
2. Pro or Enterprise behavior.
3. Full distributed rerun before focused remote-handoff owner proof.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: none selected before activation; activation must name exact
  runtime write scope and forbidden files.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-sql-write-dispatch-retry-progress.report.json --markdown
2. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
