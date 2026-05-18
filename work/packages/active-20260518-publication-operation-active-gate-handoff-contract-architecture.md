# Publication Operation Active Gate Handoff Contract Architecture

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-active-gate-classification-20260518T043001Z/rolling-restart",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused handoff probe implemented. It now reports the publication producer, operationWorkflow leg, active-gate consumer, pending publication_active_gate_handoff_contract, requiredProgressMechanism=advance, and resultClassification=publication_operation_workflow_handoff_leg_missing. The selected next owner contract is operation_workflow_owner / workflow_progress for priority_recovery_partition_progress with requiredAction=advance_existing_operation.",
  "nextAction": "Close this architecture package as migrated, then activate a focused operation_workflow_owner / workflow_progress successor for the selected advance_existing_operation dispatch/re-entry contract.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --markdown",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "node scripts/check-guideline-decision-boundaries.js scripts/analyze-topology-convergence.js",
    "node scripts/check-guideline-literals.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js",
    "node scripts/check-guideline-constant-names.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js",
    "npm run work:validate -- --closure"
  ],
  "writeScope": [
    "work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-priority-recovery-workflow-progress-after-active-gate-classification-rerun.md",
    "test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "test-output/reports/.playback/rolling-restart-after-active-gate-classification-20260518T043001Z/rolling-restart/failure-bundle.json"
  ],
  "predecessor": "work/packages/done-20260518-priority-recovery-workflow-progress-after-active-gate-classification-rerun.md",
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "src/control-plane/topology-operator-witness.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/rebalancer/operation-workflow-owner.js"
  ],
  "commitScope": [
    "work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json"
  ],
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-boundary-causal-gate",
    "outputProfile": "medium",
    "escalationTriggers": [
      "the focused probe selects a runtime owner contract outside the candidate runtime files",
      "canonical evidence changes the first frontier owner or boundary",
      "the probe cannot represent the operation-workflow leg without broader architecture changes"
    ]
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Activate operation_workflow_owner / workflow_progress successor for priority_recovery_partition_progress requiredAction=advance_existing_operation."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "The extended handoff probe preserves the publication producer and active-gate consumer but selects nextOwnerPath operation_workflow_owner / workflow_progress with requiredAction=advance_existing_operation and requiredProgressMechanism=advance.",
    "evidence": [
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe",
      "node --test test/scripts/analyze-topology-convergence.test.js",
      "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The repeated rolling-restart failure is a missing cross-boundary contract: publication convergence blocks on publication_pending, operation workflow has a retryable persisted_not_dispatched dispatch_pending witness, and active-gate owner reconcile consumes stale or incomplete publication visibility without one shared handoff state that names the producer, operator leg, consumer, and required progress mechanism.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json plus npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe plus npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --markdown",
    "expectedCausalModelChange": "The probe now exposes the next implementable contract as operation_workflow_owner / workflow_progress with requiredAction=advance_existing_operation; runtime work must continue in that successor package.",
    "representativeOutcome": "migrated",
    "causalDebt": "Prior focused packages reduced or classified publication, workflow progress, rebalancer handoff, and active-gate owner reconcile in isolation, but the representative scenario still alternates among those boundaries.",
    "crossBoundaryReview": "Review/fix/implementation subagents completed for this package. Runtime work remains out of scope here and moves to the selected operation_workflow_owner / workflow_progress successor."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative rerun after active-gate classification-only proof plus publication-operation-active-gate handoff probe",
    "phaseChain": [
      "publication_ack_convergence blocks with publication_pending",
      "priority recovery emits one operation_workflow_owner / workflow_progress retryable witness",
      "active_gate_snapshot_coverage remains deferred with owner_reconcile_pending",
      "handoff probe reports all three owners as one causal contract",
      "probe selects operation_workflow_owner / workflow_progress with requiredProgressMechanism=advance"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending; next expected frontier operation_workflow_owner / workflow_progress with persisted_not_dispatched dispatch_pending planned operation ec1145bb-d89d-4cef-8b07-fabd87ff8e84 and nextRequiredAction=advance_existing_operation.",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / workflow_progress has one retryable persisted_not_dispatched dispatch_pending witness",
      "active_gate_snapshot_coverage is deferred at snapshotCoverage=2/5 with owner_reconcile_pending",
      "publication_active_gate_handoff_contract is pending with pendingReconcileCount=3 and runtimePromotionAllowed=false",
      "readiness_startup_support inherits active-gate no-progress evidence"
    ],
    "missingCausalEdge": "The missing edge is now narrowed to publication_operation_workflow_handoff_leg_missing: operation_workflow_owner / workflow_progress must advance the selected dispatch_pending operation and expose the dispatch/re-entry outcome to the publication-active-gate handoff.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused probe proof reports producer=publication_ack_convergence, operationWorkflow=priority_recovery_partition_progress, consumer=active_gate_snapshot_coverage, requiredProgressMechanism=advance, resultClassification=publication_operation_workflow_handoff_leg_missing, and nextOwnerPath operation_workflow_owner / workflow_progress.",
    "boundedProgressProofArtifact": "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json",
    "expectedObservableTransition": "The successor package advances or classifies the selected priority_recovery_partition_progress witness so publication convergence can observe a durable dispatch/re-entry outcome.",
    "maxProgressBound": "one focused operation_workflow_owner / workflow_progress successor package before another architecture decision",
    "sameFrontierFallback": "If the successor cannot move or classify advance_existing_operation with focused proof, stop instead of reopening topology publication or active-gate owner reconcile locally.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress for priority_recovery_partition_progress requiredAction=advance_existing_operation",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md / operation_workflow_owner / workflow_progress / same-frontier-focused-proof",
      "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md / operation_workflow_owner / rebalancer_handoff / classification-only-focused-proof",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only-focused-proof",
      "work/packages/done-20260518-priority-recovery-workflow-progress-after-active-gate-classification-rerun.md / topology_publication_owner plus operation_workflow_owner / publication_convergence plus workflow_progress / selected architecture package route",
      "work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md / operation_workflow_owner / workflow_progress / handoff-probe-selected-successor"
    ],
    "oscillationCheck": "Human-selected alternative 3 opens this architecture package because repeated local proofs did not make rolling-restart green or produce monotonic representative reduction.",
    "handoffInvariant": "Publication owner must publish one fresh cohort outcome; operation_workflow_owner must expose one durable dispatch/re-entry outcome for the selected priority operation; active-gate owner reconcile must consume that owner outcome through the canonical handoff without local promotion, timeout-budget expansion, or diagnostic reinterpretation."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Fresh rolling-restart report test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json failed after the prior active-gate classification-only stop.",
      "Canonical evidence reports publication_ack_convergence blocked with publication_pending and a next expected operation_workflow_owner / workflow_progress dispatch_pending witness.",
      "The current --handoff-probe reports publication_active_gate_handoff_not_detected and does not expose the operation-workflow leg.",
      "The user selected alternative 3: open a bounded architecture package for the publication -> operation-workflow -> active-gate handoff contract."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Continue only if a focused cross-boundary probe proves the selected workflow_progress witness can reduce without changing architecture.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --markdown",
          "focused cross-boundary handoff probe spanning publication, operation workflow, and active-gate owner reconcile"
        ]
      },
      {
        "id": "migrate-owner-boundary",
        "summary": "Migrate to a newly selected owner boundary only if canonical evidence names one owner as the missing contract owner.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --explain publication_ack_convergence",
          "npm run analyze:owner-files -- operation_workflow_owner workflow_progress"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Open a bounded architecture package for the publication to operation-workflow to active-gate handoff contract.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe",
          "node --test test/scripts/analyze-topology-convergence.test.js"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Escalate before any runtime implementation if the focused handoff probe cannot select a bounded owner contract.",
        "route": "human-escalation",
        "proof": [
          "npm run work:context",
          "npm run work:package:doctor -- --suggest work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md"
        ]
      }
    ],
    "selectedChoice": "open-architecture-package",
    "nextAction": "Architecture package implemented. Continue in the selected operation_workflow_owner / workflow_progress successor."
  }
}
-->

## Why

The representative rolling-restart gate is red after multiple local focused
proofs. This package implemented the selected architecture route by making the
publication, operation-workflow, and active-gate handoff replayable as one
probe. The probe selects `operation_workflow_owner / workflow_progress` as the
next bounded runtime owner contract.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the sprint has selected a bounded architecture
  package after repeated representative frontier oscillation.
- Escalation trigger to a heavier lane: the focused probe cannot represent the
  producer/operator/consumer handoff or selects files outside the candidate
  runtime scope.

## Subagent Sequencing Requirement

This package required review, fix, and implementation subagents before
implementation. Runtime source edits remain blocked in this package; the
focused probe identifies the exact successor owner contract.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Locke (019e3976-dfad-73e2-bd19-dcd83b3451c8) reviewed work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e397a-11d0-78c1-81ad-f4617c6b6c0b) fixed work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md; result fixed sprint snapshot and predecessor handoff metadata.
- [x] Implementation subagent recorded: Agent Anscombe (019e397f-778a-7353-817d-7b7be2dbeaa1) implemented work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md; result implemented focused handoff probe and selected operation_workflow_owner / workflow_progress.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. `work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md`
2. `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`
3. `work/sprints/current-blocker.md`
4. `work/sprints/current-blocker.json`
5. `scripts/analyze-topology-convergence.js`
6. `test/scripts/analyze-topology-convergence.test.js`
7. `test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json`

## Out Of Scope

1. Runtime `src/` changes before focused probe selects the exact owner contract.
2. Timeout budget increases.
3. Active-gate admission relaxation.
4. Consumer-local reinterpretation of publication, workflow, or active-gate evidence.

## Model Fit

- Package class: `architecture-gap-analysis`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-boundary-causal-gate`
- Output profile: `medium`
- Owned files: package metadata, active sprint tracker proof, generated current-blocker files, model ledger, focused analyzer script, focused analyzer test, and handoff fixture named in metadata.
- Forbidden files: runtime `src/` files before the focused probe selects the exact owner contract.
- Frozen decisions: human-selected alternative 3 is active; prior local workflow-progress, rebalancer-handoff, and active-gate owner-reconcile classifications stay closed as isolated local proofs.
- Escalation triggers: the probe selects a runtime owner outside candidate scope, canonical evidence changes the first frontier, or the producer/operator/consumer handoff cannot be represented by the current analyzer.
- Focused proof: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe` reports `publication_operation_workflow_handoff_leg_missing`, `requiredProgressMechanism=advance`, and nextOwnerPath `operation_workflow_owner / workflow_progress`; `node --test test/scripts/analyze-topology-convergence.test.js` passes.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --explain publication_ack_convergence
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --markdown
5. npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json
6. node --test test/scripts/analyze-topology-convergence.test.js
7. node scripts/check-guideline-decision-boundaries.js scripts/analyze-topology-convergence.js
8. node scripts/check-guideline-literals.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js
9. node scripts/check-guideline-constant-names.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js
10. npm run work:validate -- --closure
