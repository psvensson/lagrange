# Topology Active Gate Snapshot Coverage After Publication Owner Stream Fix

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh representative evidence after the publication owner-stream fix satisfies publication_ack_convergence and priority_recovery_partition_progress. The first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverage=2/5, expectedNodeCount=5, selected snapshot observation repair_deferred / stale_usable / pending / idle / wait, reason codes cache_stale_watermark and stale_replica_operations_in_flight, active=4/5, pendingAck=0, and missingPublished=4.",
  "nextAction": "Review the previous publication-convergence package, then analyze the active-gate selected snapshot repair-deferred/stale-usable path and repair or classify why snapshot coverage remains 2/5 before active-gate timeout.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md",
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-3.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "escalationTriggers": [
      "owned files expand beyond package metadata before owner-file proof promotes them",
      "selected snapshot repair-deferred path spans publication or operation workflow ownership",
      "fresh evidence promotes publication_ack_convergence or priority_recovery_partition_progress back to first frontier"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Analyze active-gate selected snapshot repair_deferred/stale_usable evidence and determine whether the owner should wake, retry, refresh, advance, or classify terminal coverage debt."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage must advance or explicitly classify selected snapshot repair_deferred stale_usable evidence before active-gate timeout can reach 5/5 coverage.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The prior publication owner-stream package closed publication_ack_convergence as satisfied in fresh evidence. The current live blocker is active_gate_snapshot_coverage with snapshotCoverage=2/5 and selected snapshot repair_deferred/stale_usable/pending/idle/wait evidence.",
    "crossBoundaryReview": "Review and fix subagent proof must be clean before runtime implementation. Candidate runtime files remain read-only until owner-file proof or a focused probe promotes exact files into writeScope and commitScope."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup_active_gate_owner / snapshot_coverage after publication owner-stream fix",
    "phaseChain": [
      "publication owner-stream migration proof",
      "active-gate snapshot coverage extraction",
      "selected snapshot repair-deferred analysis",
      "focused active-gate repair or classification",
      "representative rerun classification"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverage=2/5, expectedNodeCount=5, and selected snapshot repair_deferred / stale_usable / pending / idle / wait evidence",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted",
      "workflow_step_timeout is exhausted for a non-frontier operation_workflow_owner / workflow_progress wait",
      "missingPublished=4 remains observable but publication_ack_convergence is satisfied in canonical topology evidence"
    ],
    "missingCausalEdge": "Selected snapshot repair_deferred/stale_usable evidence did not refresh or advance enough coverage before active gate timeout.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Pending implementation; expected proof must show wake, retry, refresh, advance, bounded terminal classification, or owner-boundary migration for selected snapshot repair-deferred coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "expectedObservableTransition": "active_gate_timed_out resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one focused active-gate snapshot coverage package slice with canonical extractors, owner-file proof, subagent sequencing, focused validation, and representative result classification",
    "sameFrontierFallback": "keep startup_active_gate_owner / snapshot_coverage active and do not absorb publication convergence, operation workflow, or generic harness timeout changes without canonical promotion.",
    "expectedNextFrontier": "readiness_startup_support after coverage improves, or a narrower startup_active_gate_owner selected-snapshot boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260514-topology-publication-convergence-final-blocker.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The frontier returned to active_gate_snapshot_coverage only after publication ACK convergence became satisfied, so this package stays causal-escalation and must preserve the fresh first-frontier proof before runtime edits.",
    "handoffInvariant": "Do not reopen topology_publication_owner / publication_convergence or operation_workflow_owner / workflow_progress unless fresh canonical evidence promotes those edges to first frontier."
  },
  "predecessor": "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md"
}
-->

## Why

The publication owner-stream fix produced the desired representative movement:
publication ACK convergence is now satisfied, and the current live blocker is
again active-gate snapshot coverage. This package owns the next edge, not
publication parity work.

The active-gate evidence is narrower than before: snapshot coverage is `2/5`,
the selected snapshot is `repair_deferred / stale_usable / pending / idle /
wait`, and the reason codes are `cache_stale_watermark` and
`stale_replica_operations_in_flight`.

## Scope Basis

AGPL topology convergence release-gate closure. Ship criteria still require
`active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`. This package
is bounded to the current canonical first frontier and may promote runtime
files into write scope only after owner-file proof or a focused probe names
the exact files.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the first frontier has oscillated between
  publication convergence and active gate, so the package must preserve the
  migration proof and then work the active-gate owner boundary.
- Escalation trigger to a heavier lane: fresh representative evidence promotes
  publication convergence, operation workflow progress, or readiness support
  ahead of active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md
2. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
3. work/model-ledger.jsonl

## Out Of Scope

1. topology_publication_owner / publication_convergence unless fresh canonical evidence promotes it back to first frontier
2. operation_workflow_owner / workflow_progress unless fresh canonical evidence promotes it to first frontier
3. scenario_timeout_defaults

## Subagent Sequencing Ledger

Required before implementation because this is a runtime owner-boundary and
causal-escalation package.

- [ ] Review subagent recorded:
      pending-before-implementation-resumes
- [ ] Fix subagent recorded or explicitly not needed:
      pending-before-review
- [ ] Implementation subagent recorded:
      pending-before-review

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Owned files: `work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`
- Forbidden files: runtime files until owner-file proof or a focused probe promotes exact paths into write scope
- Frozen decisions: publication_ack_convergence is satisfied in the fresh artifact; active_gate_snapshot_coverage is the current first frontier.
- Escalation triggers: owned files expand beyond metadata without owner-file proof, runtime ownership changes, or representative evidence changes first frontier.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
4. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
6. npm run work:validate -- --entry

## Commit And Push Ledger

1. Focused package commit: pending-before-focused-commit
2. Pushed to: pending-before-push
3. Commit contains only package-owned files/package-status/allowed sprint handoff: pending-before-focused-commit
