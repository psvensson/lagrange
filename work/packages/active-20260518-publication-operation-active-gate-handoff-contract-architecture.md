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
  "currentState": "The selected architecture route is active. Fresh rolling-restart evidence starts at publication_ack_convergence / topology_publication_owner / publication_convergence with publication_pending, carries one downstream operation_workflow_owner / workflow_progress dispatch_pending planned witness, and ends with active-gate owner reconcile still pending. Existing --handoff-probe output sees publication -> active-gate but does not expose the operation-workflow leg.",
  "nextAction": "Extend the focused handoff probe so it reports the publication producer, operation-workflow dispatch/re-entry leg, and active-gate owner-reconcile consumer before any runtime patch.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --markdown",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "npm run work:validate -- --closure"
  ],
  "writeScope": [
    "work/packages/active-20260518-publication-operation-active-gate-handoff-contract-architecture.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-priority-recovery-workflow-progress-after-active-gate-classification-rerun.md",
    "test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "test-output/reports/.playback/rolling-restart-after-active-gate-classification-20260518T043001Z/rolling-restart/failure-bundle.json"
  ],
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
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
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
    "status": "architecture-gap",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Add a replayable handoff probe for the publication producer, operation-workflow dispatch/re-entry leg, and active-gate owner-reconcile consumer."
  },
  "causalGovernance": {
    "hypothesis": "The repeated rolling-restart failure is a missing cross-boundary contract: publication convergence blocks on publication_pending, operation workflow has a retryable persisted_not_dispatched dispatch_pending witness, and active-gate owner reconcile consumes stale or incomplete publication visibility without one shared handoff state that names the producer, operator leg, consumer, and required progress mechanism.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json plus npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe plus npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --markdown",
    "expectedCausalModelChange": "The probe must expose whether the next implementable contract belongs to topology publication, operation workflow dispatch/re-entry, active-gate owner reconcile, or an architecture-gap stop before runtime code changes.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Prior focused packages reduced or classified publication, workflow progress, rebalancer handoff, and active-gate owner reconcile in isolation, but the representative scenario still alternates among those boundaries.",
    "crossBoundaryReview": "Required before implementation: verify the previous package closure and this package's probe scope before modifying analyzer, fixture, or runtime files."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative rerun after active-gate classification-only proof plus publication-operation-active-gate handoff probe",
    "phaseChain": [
      "publication_ack_convergence blocks with publication_pending",
      "priority recovery emits one operation_workflow_owner / workflow_progress retryable witness",
      "active_gate_snapshot_coverage remains deferred with owner_reconcile_pending",
      "handoff probe must report all three owners as one causal contract before runtime implementation resumes"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending; next expected frontier operation_workflow_owner / workflow_progress with persisted_not_dispatched dispatch_pending planned operation ec1145bb-d89d-4cef-8b07-fabd87ff8e84 and nextRequiredAction=advance_existing_operation.",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / workflow_progress has one retryable persisted_not_dispatched dispatch_pending witness",
      "active_gate_snapshot_coverage is deferred at snapshotCoverage=2/5 with owner_reconcile_pending",
      "publication_active_gate_handoff_contract is pending with pendingReconcileCount=3 and runtimePromotionAllowed=false",
      "readiness_startup_support inherits active-gate no-progress evidence"
    ],
    "missingCausalEdge": "One canonical handoff probe must show how the OPEN publication producer, operation-workflow dispatch/re-entry leg, and active-gate owner reconcile consumer coordinate progress, defer, retry, or terminal classification without each owner reconstructing the other owners' state.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe",
    "boundedProgressProof": "Pending. The current probe only reports publication -> active-gate and classifies the handoff as not detected; it does not expose whether dispatch, advance, or reconcile is the bounded progress mechanism for the operation-workflow leg.",
    "boundedProgressProofArtifact": "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json",
    "expectedObservableTransition": "The focused probe reports producer, operationWorkflow, consumer, contract state, requiredProgressMechanism, runtimePromotionAllowed, and a result classification that names the missing operation-workflow handoff leg.",
    "maxProgressBound": "one probe fixture and analyzer test before any runtime owner patch",
    "sameFrontierFallback": "If the probe cannot name a single next runtime owner, stop as architecture-gap instead of patching topology_publication_owner, operation_workflow_owner, or startup_active_gate_owner locally.",
    "expectedNextFrontier": "a focused runtime owner package selected by the probe, or architecture-gap classification if no bounded owner contract exists",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md / operation_workflow_owner / workflow_progress / same-frontier-focused-proof",
      "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md / operation_workflow_owner / rebalancer_handoff / classification-only-focused-proof",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only-focused-proof",
      "work/packages/done-20260518-priority-recovery-workflow-progress-after-active-gate-classification-rerun.md / topology_publication_owner plus operation_workflow_owner / publication_convergence plus workflow_progress / selected architecture package route"
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
    "nextAction": "Implement the selected bounded architecture package by first extending the focused handoff probe."
  }
}
-->

## Why

The representative rolling-restart gate is red after multiple local focused
proofs. The current first frontier is publication convergence, but the artifact
also carries operation workflow dispatch-pending evidence and active-gate owner
reconcile evidence. This package owns the selected architecture route: make
that handoff replayable as one contract before more runtime owner patches.

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

This package may not start implementation until a fresh review subagent checks
the previous package and the review/fix ledger is clean. Runtime source edits
remain blocked until the focused probe identifies the exact owner contract.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-review.

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
2. `work/sprints/current-blocker.md`
3. `work/sprints/current-blocker.json`
4. `scripts/analyze-topology-convergence.js`
5. `test/scripts/analyze-topology-convergence.test.js`
6. `test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json`

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
- Owned files: package metadata, generated current-blocker files, focused analyzer script, focused analyzer test, and handoff fixture named in metadata.
- Forbidden files: runtime `src/` files before the focused probe selects the exact owner contract.
- Frozen decisions: human-selected alternative 3 is active; prior local workflow-progress, rebalancer-handoff, and active-gate owner-reconcile classifications stay closed as isolated local proofs.
- Escalation triggers: the probe selects a runtime owner outside candidate scope, canonical evidence changes the first frontier, or the producer/operator/consumer handoff cannot be represented by the current analyzer.
- Focused proof: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe` plus `node --test test/scripts/analyze-topology-convergence.test.js`.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --explain publication_ack_convergence
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --handoff-probe
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json --markdown
5. npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-20260518T043001Z.report.json
6. node --test test/scripts/analyze-topology-convergence.test.js
7. npm run work:validate -- --closure
