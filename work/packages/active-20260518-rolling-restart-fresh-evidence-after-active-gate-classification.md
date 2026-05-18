# Rolling Restart Fresh Evidence After Active Gate Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "read-review-doc-only",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
  "playback": "none",
  "owner": "release_gate_owner",
  "boundary": "representative_evidence",
  "dominantReason": "fresh_evidence_required",
  "currentState": "The active-gate owner reconcile slice closed as classification-only without runtime changes. This package owns the next evidence step only: run a fresh rolling-restart representative, then use canonical extractors to select the next owner boundary, green state, or architecture/human route.",
  "nextAction": "Run a fresh rolling-restart representative after the active-gate classification-only closure, then use canonical extractors to select the next owner boundary or route.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --handoff-probe",
    "npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md",
    "test-output/reports/rolling-restart-after-workflow-advance-classification-20260518T054537Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/run.js",
    "test/distributed/config/local.json"
  ],
  "commitScope": [
    "work/packages/active-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "pending-before-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "frontier": "pending-fresh-evidence",
    "owner": "release_gate_owner",
    "boundary": "representative_evidence",
    "dominantReason": "fresh_evidence_required",
    "nextAction": "Run the fresh representative and classify the resulting owner boundary with canonical extractors."
  },
  "causalGovernance": {
    "hypothesis": "After the active-gate owner reconcile edge closed as classification-only without runtime changes, stale evidence must not drive another runtime package. A fresh rolling-restart representative is required before selecting the next owner boundary or route.",
    "stopConditionCheck": "Run the fresh representative artifact through work:evidence-summary, topology handoff probe, `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json`, and priority residual extractors before opening or migrating to any runtime owner package.",
    "expectedCausalModelChange": "Fresh evidence should either go green, select a concrete owner boundary, preserve the same frontier with new proof, or justify architecture/human escalation.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication, operation workflow, rebalancer handoff, and active-gate classifications remain historical context only until the fresh artifact selects a live edge.",
    "crossBoundaryReview": "No runtime review subagent is required for this read/review package; if fresh evidence selects a runtime owner-boundary or scenario gate, open the next package with required subagent sequencing."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "fresh rolling-restart representative after active-gate classification-only closure",
    "phaseChain": [
      "operation workflow edge closed as migrated after focused proof",
      "fresh handoff probe selected startup_active_gate_owner / snapshot_coverage",
      "active-gate reconcile edge closed as classification-only without runtime edits",
      "fresh representative rerun is required before selecting another runtime owner"
    ],
    "currentFirstFrontier": "release_gate_owner / representative_evidence owns the pending fresh rolling-restart evidence step; previous artifact showed publication_ack_convergence as visible producer context while handoff selected startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "previous artifact active-gate snapshotCoverageNodeCount was 3 of expectedNodeCount 5",
      "previous artifact publicationActiveGateHandoffPendingReconcileCount was 2",
      "previous artifact runtimePromotionAllowed was false",
      "previous priority residual extraction reported subordinate operation_workflow_owner / rebalancer_handoff witnesses"
    ],
    "missingCausalEdge": "The next live causal edge is unknown until fresh representative evidence is collected and classified.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --handoff-probe",
    "boundedProgressProof": "No runtime bounded-progress proof is owned by this package; it only refreshes evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json",
    "expectedObservableTransition": "Fresh representative evidence should identify the current first frontier and selected owner path, or show representative green.",
    "maxProgressBound": "one fresh representative run plus canonical extractor classification",
    "sameFrontierFallback": "If the same active-gate frontier remains, open a new runtime/scenario package from the fresh evidence rather than editing runtime in this package.",
    "expectedNextFrontier": "unknown until fresh representative evidence is available",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-workflow-advance-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "work/packages/done-20260518-priority-recovery-operation-workflow-advance-after-handoff-probe.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260518-publication-operation-active-gate-handoff-contract-architecture.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "This package is intentionally read/review only to avoid another stale-evidence runtime patch after repeated publication, operation workflow, and active-gate transitions.",
    "handoffInvariant": "Do not edit runtime or broaden owner scope until fresh canonical evidence selects the next owner boundary."
  }
}
-->

## Why

The active-gate owner reconcile slice classified the selected two-node
reconcile edge as already represented by existing focused handoff tests, with
no runtime change. The sprint now needs fresh representative evidence before it
can safely select another implementation boundary.

This package owns only that evidence refresh and canonical extractor pass. It
must not edit runtime, broaden into publication or operation workflow code, or
interpret a stale artifact as a new owner-boundary selection.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `read-review-doc-only`
- Why this lane is sufficient: this package is evidence collection and handoff
  classification only; it has no runtime write scope.
- Escalation trigger to a heavier lane: fresh representative evidence selects
  a runtime owner boundary or a scenario/release-gate package.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. src

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-rolling-restart-fresh-evidence-after-active-gate-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --handoff-probe`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Validation

1. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --verbose
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --handoff-probe
4. npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-classification-fresh-20260518T062159Z.report.json --markdown
