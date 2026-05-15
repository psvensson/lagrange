# Topology Active Gate Snapshot Coverage After Publication Consumer Lag

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Successor package opened after the publication-convergence consumer-lag classification repair. Canonical evidence on test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json now marks publication_ack_convergence and priority_recovery_partition_progress satisfied, with first frontier active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage: activeGate=timed_out, inactive_nodes=3, snapshotCoverage=2/5, expectedNodeCount=5, readinessDelayCause=none.",
  "nextAction": "Continue from test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json after publication consumer-lag classification moved the first frontier to active_gate_snapshot_coverage. Analyze inactive_nodes=3 and snapshotCoverage=2/5 under startup_active_gate_owner without reopening publication convergence.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
  ],
  "writeScope": [
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-publication-convergence-final-blocker.md",
    "work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md",
    "work/packages/done-20260514-topology-active-gate-budget-closure.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-7-class-2.js",
    "test/distributed/harness/cluster-segment-6.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Analyze why active-gate snapshot coverage remains at 2/5 with inactive_nodes=3 after publication and priority recovery are classified satisfied."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage work should reduce, migrate, or classify active_gate_timed_out without reopening publication convergence when the owner stream is current and fenced by consumer_lag.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK convergence and priority recovery are satisfied in canonical evidence. The remaining blocker is active-gate timeout with inactive_nodes=3 and snapshotCoverage=2/5.",
    "crossBoundaryReview": "Required before implementation through the runtime-owner-boundary subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup_active_gate_owner / snapshot_coverage after publication consumer-lag classification",
    "phaseChain": [
      "publication consumer-lag classification",
      "active-gate snapshot coverage extraction",
      "startup active-gate owner analysis",
      "representative rerun classification"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted in the current artifact"
    ],
    "missingCausalEdge": "active-gate snapshot coverage remains incomplete at 2/5 while publication ACK and priority recovery are satisfied.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Pending implementation; expected proof must show bounded retry, timeout classification, reconcile, or advance behavior for startup_active_gate_owner / snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "expectedObservableTransition": "active_gate_timed_out resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one focused active-gate package slice with canonical extractors, owner-file proof, focused validation, and representative result classification",
    "sameFrontierFallback": "keep startup_active_gate_owner / snapshot_coverage active and do not absorb publication convergence, operation workflow, or generic harness timeout changes without canonical promotion.",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence after snapshot coverage improves, or a narrower active-gate owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

The publication-convergence package now classifies the current representative
artifact as producer-side publication satisfied: the publication owner stream
is current and acknowledged, and the remaining missing-published signal is
fenced as consumer lag. The first actionable frontier is therefore active-gate
snapshot coverage.

This package owns the next blocker: active gate timed out with
`inactive_nodes=3` and `snapshotCoverage=2/5`.

## Scope Basis

AGPL topology convergence release-gate closure. Ship criteria still require
`active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the canonical first frontier is one owner
  boundary, `startup_active_gate_owner / snapshot_coverage`.
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

1. Maintain package, sprint, current-blocker, and model-ledger handoff.
2. Analyze active-gate snapshot coverage from canonical extractors before raw
   logs.
3. Promote focused runtime files only after owner-file proof and package scope
   update.

## Out Of Scope

1. Reopening `topology_publication_owner / publication_convergence` without
   fresh canonical evidence.
2. Operation workflow runtime fixes.
3. Generic harness timeout stretching.
4. Pro or Enterprise behavior.

## Subagent Sequencing Ledger

Required before implementation because this is a runtime owner-boundary
package. This package is currently an active handoff only; no implementation
has started.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json`, `npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json
2. npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json
3. npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json
4. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
