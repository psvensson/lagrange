# Startup Active Gate Snapshot Coverage After Workflow Advance Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "owner_reconcile_pending",
  "currentState": "Fresh representative rerun after the operation-workflow proof remains red. The visible producer frontier is publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending, but the handoff probe reports operationWorkflow priority_recovery_partition_progress satisfied, missingEdge=null, and nextOwnerPath startup_active_gate_owner / snapshot_coverage with requiredAction=reconcile_owner_membership_publication. Active-gate snapshot coverage is 3/5 with pendingReconcileCount=2 and runtimePromotionAllowed=false.",
  "nextAction": "Run the required review subagent for this startup_active_gate_owner / snapshot_coverage successor before runtime edits. The review must decide whether the first implementation slice stays on owner membership publication reconcile or stops as an architecture gap; do not edit topology publication, operation workflow, timeout budgets, active-gate admission, readiness, or diagnostics grammar.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --handoff-probe",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
  ],
  "writeScope": [
    "work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md",
    "work/packages/done-20260518-publication-operation-active-gate-handoff-contract-architecture.md",
    "test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "canonical evidence reselects topology_publication_owner / publication_convergence",
      "canonical evidence reselects operation_workflow_owner / workflow_progress or rebalancer_handoff",
      "the owner reconcile path requires timeout, admission, readiness, or diagnostics grammar changes"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Prove or classify reconcile_owner_membership_publication for the two pending active-gate owner reconcile nodes selected by the fresh handoff probe."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The predecessor operation-workflow package closed as migrated after the fresh handoff probe reported operationWorkflow satisfied and selected active_gate_snapshot_coverage with requiredAction=reconcile_owner_membership_publication, pendingReconcileCount=2, and runtimePromotionAllowed=false.",
    "evidence": [
      "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --handoff-probe",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After operation workflow satisfies the selected advance leg, rolling-restart remains red because startup active-gate snapshot coverage waits on owner membership publication reconcile for two pending active nodes while runtimePromotionAllowed=false.",
    "stopConditionCheck": "Use npm run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json plus npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --handoff-probe before implementation and again after focused proof.",
    "expectedCausalModelChange": "Focused active-gate proof should reduce pendingReconcileCount, improve snapshot coverage, surface one bounded owner reconcile outcome, migrate to a narrower active-gate publication reconcile boundary, or stop as architecture-gap without reopening publication or operation workflow.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The sprint has recently bounced among publication convergence, operation workflow progress, rebalancer handoff, and active-gate reconcile. This package must keep the proof on the handoff probe's selected active-gate reconcile edge.",
    "crossBoundaryReview": "Required review subagent must inspect the predecessor migration, fresh handoff probe, active-gate owner files, and subordinate priority residual report before any runtime edit."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative rerun after operation-workflow proof plus publication-operation-active-gate handoff probe",
    "phaseChain": [
      "predecessor architecture package selected operation_workflow_owner / workflow_progress for advance_existing_operation",
      "operation-workflow package proved the selected advance leg with focused tests and no runtime change",
      "fresh representative rerun remained red but changed the selected handoff owner",
      "fresh handoff probe reports operationWorkflow satisfied and active_gate_snapshot_coverage deferred",
      "this successor owns startup_active_gate_owner / snapshot_coverage reconcile_owner_membership_publication"
    ],
    "currentFirstFrontier": "publication_ack_convergence remains visible as producer context, while the selected next owner path is active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending.",
    "knownDownstreamBlockers": [
      "active-gate snapshotCoverageNodeCount is 3 of expectedNodeCount 5",
      "publicationActiveGateHandoffState is pending with reason owner_reconcile_pending",
      "publicationActiveGateHandoffPendingReconcileCount is 2",
      "pending reconcile nodes are 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
      "publicationActiveGateHandoffNextAction is reconcile_owner_membership_publication",
      "runtimePromotionAllowed is false",
      "operationWorkflow priority_recovery_partition_progress is satisfied in the fresh handoff probe",
      "priority residual extraction reports subordinate operation_workflow_owner / rebalancer_handoff witnesses that remain parked unless canonical evidence promotes them"
    ],
    "missingCausalEdge": "The active-gate owner path must submit or consume the owner membership publication reconcile for the two pending nodes and surface a bounded owner outcome instead of leaving the handoff at generic owner_reconcile_pending.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --handoff-probe",
    "boundedProgressProof": "The bounded progress mechanism is reconcile: prove reconcile_owner_membership_publication for pendingReconcileCount=2 with runtimePromotionAllowed=false, or classify the exact owner outcome blocking active_gate_snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json",
    "expectedObservableTransition": "Representative evidence should reduce pendingReconcileCount, improve snapshot coverage, surface one bounded owner reconcile outcome, migrate to a narrower active-gate publication boundary, or stop as architecture-gap.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage implementation slice before another architecture decision",
    "sameFrontierFallback": "If the same active-gate frontier remains, record the owner reconcile outcome and do not broaden into publication runtime, operation workflow runtime, timeout budgets, active-gate admission, readiness, or diagnostics grammar.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage for active_gate_snapshot_coverage requiredAction=reconcile_owner_membership_publication",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260518-publication-operation-active-gate-handoff-contract-architecture.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md / operation_workflow_owner / workflow_progress / same-frontier"
    ],
    "oscillationCheck": "The package stays causal-escalation because the representative gate remains red after adjacent publication, workflow, and active-gate classifications; implementation may only target the selected active-gate reconcile edge.",
    "handoffInvariant": "Publication remains producer context, operationWorkflow remains satisfied, and active-gate owner reconcile may not locally promote runtime truth, relax admission, expand timeout budgets, bypass readiness, or reinterpret diagnostics."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh handoff probe selects startup_active_gate_owner / snapshot_coverage after operation workflow satisfied.",
      "Visible publication_ack_convergence remains red, but the handoff nextOwnerPath is active-gate reconcile.",
      "Recent sprint history includes adjacent publication, workflow_progress, rebalancer_handoff, and active-gate classifications without green representative closure."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Proceed only with bounded startup active-gate owner reconcile proof.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --handoff-probe",
          "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
        ]
      },
      {
        "id": "migrate-owner-boundary",
        "summary": "Migrate only if focused active-gate proof selects a narrower owner boundary.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json",
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Stop for architecture if reconcile_owner_membership_publication cannot be represented by a bounded active-gate owner proof.",
        "route": "architecture-package",
        "proof": [
          "npm run work:package:doctor -- --suggest work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Escalate if canonical extractors disagree on owner, boundary, or required action.",
        "route": "human-escalation",
        "proof": [
          "npm run work:context"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Run review, fix if needed, and implementation subagents sequentially before any active-gate runtime edit."
  },
  "predecessor": "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md"
}
-->

## Why

The fresh representative rerun after the operation-workflow proof did not go
green, but the focused handoff probe moved the selected owner away from
`operation_workflow_owner / workflow_progress`. Operation workflow is now
satisfied; the remaining selected edge is the active-gate owner reconcile path
for two pending membership publication targets.

This package owns only that `startup_active_gate_owner / snapshot_coverage`
proof surface. Publication convergence remains visible producer context, and
subordinate priority residual witnesses remain parked unless canonical
extractors promote them.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the sprint has a repeated publication,
  operation-workflow, and active-gate frontier oscillation, but the fresh
  handoff probe selects one bounded active-gate owner reconcile edge.
- Escalation trigger to a heavier lane: focused proof cannot represent
  `reconcile_owner_membership_publication`, or canonical evidence reselects
  publication, operation workflow, timeout, readiness, admission, or diagnostics
  grammar.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime owner
boundary package. Run review, fix if needed, and implementation subagents
sequentially before editing runtime files.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending before implementation.
- [ ] Fix subagent recorded or explicitly not needed: pending review result.
- [ ] Implementation subagent recorded: pending review/fix completion.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. topology_publication_owner runtime
2. operation_workflow_owner runtime
3. timeout budgets
4. active-gate admission
5. readiness shortcut
6. diagnostics-only reinterpretation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner runtime`, `operation_workflow_owner runtime`, `timeout budgets`, `active-gate admission`, `readiness shortcut`, `diagnostics-only reinterpretation`
- Frozen decisions: operation workflow proof is satisfied in the fresh handoff
  probe; publication remains producer context; subordinate priority residuals
  stay parked unless canonical evidence promotes them.
- Escalation triggers: owned files expand beyond this package, runtime ownership
  changes outside active-gate reconcile, or representative scenario evidence
  changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --handoff-probe`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --handoff-probe
3. npm run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json --markdown
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
