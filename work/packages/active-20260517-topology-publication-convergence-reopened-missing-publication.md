# Topology Publication Convergence Reopened Missing Publication

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-active-gate-reference-projection-20260517T023552Z/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative evidence reselected publication_ack_convergence after the active-gate forced-repair slice: publicationStatus=OPEN, publishedActiveNodeIds=[], missingPublishedCount=5, pendingAckCount=0, priority residual witnessCount=0, and active_gate_snapshot_coverage is deferred with selected_snapshot_source_timeout.",
  "nextAction": "Build or use the narrowest publication-convergence fixture for OPEN publication with missing published active nodes and selected snapshot source timeout, then edit only the selected publication owner path after review/fix/implementation subagent proof is clean.",
  "proof": [
    "npm run work:validate -- --entry work/packages/active-20260517-topology-publication-convergence-reopened-missing-publication.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260517-topology-publication-convergence-reopened-missing-publication.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
    "test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "test-output/reports/.playback/rolling-restart-active-gate-reference-projection-20260517T023552Z/rolling-restart/"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/distributed/harness/failure-bundle-segment-4.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-topology-publication-convergence-reopened-missing-publication.md",
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
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Decide whether the reopened publication frontier is owned by publication owner planning/evidence, membership publication coordinator progress, or only deferred active-gate selected snapshot source timeout evidence."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "The predecessor focused forced-repair fallback path did not improve snapshotCoverage, but the representative rerun canonically selected publication_ack_convergence as first frontier while active_gate_snapshot_coverage became deferred.",
    "evidence": [
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
      "test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The representative gate is blocked before active-gate ownership because the publication convergence evidence remains OPEN with no published active nodes, missingPublishedCount=5, pendingAckCount=0, and publicationOwnerStreamOutcome=stale.",
    "stopConditionCheck": "Run entry validation, evidence summary, topology explain for publication_ack_convergence, handoff probe, npm run analyze:causal-model, priority residual extraction, owner-files, then a replayable publication-convergence fixture before runtime edits.",
    "expectedCausalModelChange": "publication_ack_convergence disappears, snapshotCoverage improves above 2/5, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Need one replayable decision separating publication owner planning/evidence, membership publication coordinator progress, and deferred active-gate selected snapshot timeout. Current evidence: publicationStatus=OPEN, publishedActiveNodeIds=[], missingPublishedCount=5, pendingAckCount=0, priority residual witnessCount=0, and active_gate_snapshot_coverage is deferred.",
    "crossBoundaryReview": "Publication ACK is reopened only because fresh canonical evidence selected it. Do not change timeout budgets, active-gate admission, CDC fallback, reconnect delivery, query participant routing, or startup active-gate snapshot coverage unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after active-gate forced repair fallback migration",
    "phaseChain": [
      "consume the active-gate forced repair fallback migration proof",
      "use evidence summary, topology explain, handoff probe, causal model, and priority residual extraction to classify the reopened publication frontier",
      "build or reuse the narrowest publication-convergence fixture for OPEN publication with missing active publication",
      "edit only the selected topology_publication_owner / publication_convergence path after review/fix/implementation subagent proof is clean",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json, owned by topology_publication_owner / publication_convergence with reason publication_pending.",
    "knownDownstreamBlockers": [
      "publicationStatus=OPEN",
      "publishedActiveNodeIds=[]",
      "missingPublishedCount=5",
      "pendingAckCount=0",
      "publicationOwnerFreshnessFence=consumer_lag",
      "publicationOwnerRecoveryOutcome=waiting_for_consumer",
      "publicationOwnerStreamOutcome=stale",
      "priority recovery residual witnessCount=0",
      "active_gate_snapshot_coverage is deferred with selected_snapshot_source_timeout and snapshotCoverageNodeCount=0/5"
    ],
    "missingCausalEdge": "Decide whether publication_pending with zero published active nodes is owned by publication owner evidence/planning, membership publication coordinator progress, or only deferred active-gate selected snapshot source timeout.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --replay-fixture",
    "boundedProgressProof": "Pending bounded publication proof: publication_ack_convergence must disappear, snapshotCoverage must improve above 2/5, the frontier must migrate to a genuinely new owner boundary, or representative rolling-restart must turn green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "expectedObservableTransition": "A selected owner fix should publish active membership or classify the edge to a new owner boundary without timeout increases, active-gate admission relaxation, CDC fallback, reconnect-delivery, query routing, or inactive participant routing changes.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence package slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence keeps the same publication frontier without metric movement, stop and record same-frontier instead of widening into frozen edges.",
    "expectedNextFrontier": "publication_ack_convergence gone, snapshotCoverage above 2/5, representative green, or a new owner boundary selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed because fresh canonical evidence reselected publication_ack_convergence after the active-gate package, not because publication ACK was reopened manually.",
    "handoffInvariant": "Timeout budget increases, active-gate admission relaxation, CDC fallback, message-router reconnect delivery, query participant routing, inactive participant routing, priority recovery workflow progress, and startup active-gate snapshot coverage remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md"
}
-->

## Why

Fresh representative evidence reselected `publication_ack_convergence` after
the active-gate forced-repair fallback slice. This is a reopened frozen edge,
but the reopening is canonical: publication is `OPEN`, no active nodes are
published, `missingPublishedCount=5`, `pendingAckCount=0`, and priority
recovery remains drained.

This package owns the narrow publication-convergence decision before any
runtime edit. It must prove whether the edge belongs to publication owner
evidence/planning, membership publication coordinator progress, or only a
deferred active-gate selected snapshot timeout.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is required: the representative release gate is still red and
  canonical evidence selected a reopened publication-convergence runtime owner.
- Escalation trigger to a heavier lane: the replay fixture selects multiple
  runtime owners, a non-publication frozen edge, or a timeout/admission policy.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-implementation.
- [ ] Implementation subagent recorded: pending-before-implementation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-topology-publication-convergence-reopened-missing-publication.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. timeout_budgets
2. active_gate_admission
3. CDC_fallback
4. query_message_router_owner/reconnect_delivery
5. query_participant_failure/inactive_participant_routing
6. startup_active_gate_owner/snapshot_coverage

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-topology-publication-convergence-reopened-missing-publication.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `timeout_budgets`, `active_gate_admission`, `CDC_fallback`, `query_message_router_owner/reconnect_delivery`, `query_participant_failure/inactive_participant_routing`, `startup_active_gate_owner/snapshot_coverage`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/active-20260517-topology-publication-convergence-reopened-missing-publication.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/active-20260517-topology-publication-convergence-reopened-missing-publication.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --explain publication_ack_convergence
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --handoff-probe
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json
7. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
