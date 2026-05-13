# Priority Recovery Workflow Progress After Snapshot Coverage

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Snapshot-coverage proof moved the representative off startup_active_gate_owner / snapshot_coverage. Publication convergence remains red, and priority-recovery residual extraction names operation_workflow_owner / workflow_progress for sql_transactions-p1 and sql_write_operations-p1 with priority_operation_serial_wait.",
  "nextAction": "Prove or split the priority recovery workflow-progress residual, focusing on needs_operation and recovering_in_flight partitions that remain publication-blocking after snapshot coverage widened.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md",
    "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
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
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the latest priority recovery residual, needs_operation and recovering_in_flight partition operations must advance through one bounded owner wake, retry, timeout, dispatch, delivery, ACK, or terminal classification path instead of leaving publication convergence blocked.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "expectedCausalModelChange": "The priority recovery workflow-progress residual either converges, reduces to a narrower operation workflow runtime edge, or exposes a fresh publication owner boundary with canonical evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The latest representative is red after snapshot coverage widened. Publication convergence is blocked with missing active publication evidence, and priority residual extraction identifies two operation_workflow_owner / workflow_progress witnesses in priority_operation_serial_wait.",
    "crossBoundaryReview": "Review subagent Hooke (019e23a5-aa77-7f22-85b1-89f2cf2bb89e) reviewed predecessor work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md and found fixes required. Fix agent Codex (019e23a8-7118-7e51-9f7e-6d621611f5b0) reconciled predecessor proof docs, guardrail closure proof, migration wording, and successor sequencing before implementation resumes."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative after active-gate snapshot coverage repair",
    "phaseChain": [
      "startup active-gate snapshot coverage",
      "publication acknowledgement convergence",
      "priority recovery operation workflow progress"
    ],
    "currentFirstFrontier": "publication_ack_convergence under topology_publication_owner / publication_convergence is the first frontier. Priority recovery is the residual/next expected owner-boundary, and operation_workflow_owner / workflow_progress is the narrowed implementation owner because publication convergence delegates the missing-active-node progress block to priority recovery residual witnesses.",
    "knownDownstreamBlockers": [
      "active-gate snapshot coverage is deferred at 3/5 rather than first frontier",
      "publication convergence is missing active nodes while priority spread remains pending",
      "membership epoch, failure repair intent, rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain downstream"
    ],
    "missingCausalEdge": "Priority recovery workflow rows for sql_transactions-p1 and sql_write_operations-p1 must leave needs_operation or recovering_in_flight through a bounded owner progress path.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown",
    "boundedProgressProof": "Focused proof must show wake, retry, timeout, dispatch, delivery, ACK, advance, or terminal classification for the selected operation workflow residual before representative rerun.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "expectedObservableTransition": "Representative rolling-restart should move publication convergence off its priority-recovery dependency, reduce to a narrower operation workflow edge, or remain at topology_publication_owner / publication_convergence with evidence that no longer delegates downward.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused owner proof, and one representative rolling-restart rerun",
    "sameFrontierFallback": "If priority recovery workflow progress remains the blocker, record the exact operation id, semantic state, actuation state, and bounded next attempt owner field that is still missing.",
    "expectedNextFrontier": "representative-green, a narrower operation_workflow_owner runtime edge, or topology_publication_owner / publication_convergence if publication remains the first frontier without priority-recovery delegation",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md"
}
-->

## Why

The latest representative moved off startup active-gate snapshot coverage but
remains red. Canonical evidence fronts publication convergence, and the focused
priority-recovery residual extractor narrows the implementation owner to
`operation_workflow_owner / workflow_progress` for `sql_transactions-p1` and
`sql_write_operations-p1`.

This package owns the next bounded workflow-progress proof or a split back to
publication convergence if operation workflow evidence no longer explains the
missing active publication nodes.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Hooke (019e23a5-aa77-7f22-85b1-89f2cf2bb89e) reviewed
      work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md;
      result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Codex (019e23a8-7118-7e51-9f7e-6d621611f5b0) fixed
      work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md`.
- [ ] Implementation subagent recorded:
      `pending-before-implementation-resumes`.

## In Scope

1. work/packages/active-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md
2. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. src/rebalancer/operation-workflow-owner-segment-1.js
6. src/rebalancer/operation-workflow-owner-segment-2.js
7. src/rebalancer/operation-workflow-owner-segment-4.js
8. src/rebalancer/operation-workflow-owner-segment-7-stage-1.js
9. src/rebalancer/operation-workflow-owner-segment-7-stage-3.js
10. src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js
11. src/rebalancer/operation-workflow-owner-shared.js
12. src/rebalancer/operation-workflow-owner.js
13. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
14. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
15. test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js

## Out Of Scope

1. publication-convergence runtime changes before residual proof delegates back upward
2. harness timeout increases
3. Pro behavior
4. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/rebalancer/operation-workflow-owner-segment-1.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-4.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`, `src/rebalancer/operation-workflow-owner-shared.js`, `src/rebalancer/operation-workflow-owner.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
- Forbidden files: `publication-convergence runtime changes before residual proof delegates back upward`, `harness timeout increases`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown
3. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json
