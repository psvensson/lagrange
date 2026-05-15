# Topology Active Gate Snapshot Coverage After Publication Handoff

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh representative evidence after publication handoff repair selects active_gate_snapshot_coverage as the first frontier. Publication ACK convergence is satisfied with publicationPending=false, pendingAck=0, missingPublished=0, ack not_required, no_revision, and stream not_started. Active gate remains timed_out with snapshotCoverage=0/5 and selected snapshot timeout/authoritative repair failure.",
  "nextAction": "Run required subagent sequencing, inspect the active-gate selected snapshot timeout and authoritative repair failure in the fresh representative artifact, then promote the exact active-gate snapshot coverage owner path before implementation.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/cluster-segment-7.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md",
    "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "high",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Run subagent review/fix/implementation sequencing, then inspect the active-gate selected snapshot timeout and authoritative repair failure before promoting exact runtime files."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage must either advance selected snapshot coverage from 0/5 after publication handoff closure or classify the authoritative repair failure as the bounded local blocker.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK convergence is no longer first frontier. Active-gate snapshot coverage remains blocked by active_gate_timed_out, snapshotCoverage=0/5, inactive_nodes=1, and selected snapshot authoritative repair failure.",
    "crossBoundaryReview": "Subagent sequencing is required before implementation because this is a causal-escalation runtime owner-boundary package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup_active_gate_owner / snapshot_coverage after publication handoff closure",
    "phaseChain": [
      "publication handoff closure proof",
      "active-gate snapshot coverage extraction",
      "selected snapshot repair failure owner discovery",
      "focused active-gate repair or classification",
      "representative rerun classification"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out in test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration, active_gate_timeout, active_gate_attempts, and readiness_retry_window budgets are exhausted or terminal-classified",
      "priority_recovery_partition_progress remains classified as satisfied"
    ],
    "missingCausalEdge": "Active-gate selected snapshot coverage does not advance from 0/5 before timeout after publication handoff closure and authoritative repair failure.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Fresh evidence names the bounded timeout and authoritative repair failure mechanism: active_gate_snapshot_coverage is first frontier with active_gate_timed_out, snapshotCoverage=0/5, selectedSnapshotRepairDeferred=false, and selected snapshot repair failure on the nodes table.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "expectedObservableTransition": "A focused owner fix should move active_gate_snapshot_coverage to ready/reduced evidence or expose a new owner-boundary frontier without reopening publication_ack_convergence.",
    "maxProgressBound": "one focused active-gate snapshot coverage package slice with canonical extractors, owner-file proof, subagent sequencing, focused validation, and representative result classification",
    "sameFrontierFallback": "If fresh evidence still selects startup_active_gate_owner / snapshot_coverage with the same selected snapshot repair failure, keep this package active and classify same-frontier progress rather than opening another successor.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The cross-boundary publication handoff package closed stale publication_pending reentry. This successor must not reopen publication unless canonical extraction promotes publication_ack_convergence as first frontier again.",
    "handoffInvariant": "Do not edit active-gate/admin runtime files until owner-file proof and subagent sequencing promote exact files into writeScope and commitScope."
  },
  "predecessor": "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md"
}
-->

## Why

Publication handoff closure moved the representative first frontier back to
active-gate snapshot coverage. This package owns the next local blocker:
`startup_active_gate_owner / snapshot_coverage` with active gate timed out,
snapshot coverage at `0/5`, and selected snapshot authoritative repair failure.

## Scope Basis

AGPL topology convergence release-gate closure. The scope is bounded to the
active-gate snapshot coverage owner boundary after publication ACK convergence
is satisfied.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: representative evidence is red at one runtime
  owner boundary and the predecessor recorded the owner-boundary migration.
- Escalation trigger to a heavier lane: canonical evidence promotes
  publication convergence, operation workflow, or readiness support ahead of
  active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md
2. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
3. work/model-ledger.jsonl

## Out Of Scope

1. Publication convergence unless fresh canonical evidence promotes it back to
   first frontier.
2. Operation workflow/runtime unless fresh canonical evidence promotes it.
3. Scenario timeout defaults.

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [ ] Review subagent recorded:
      pending-before-implementation-starts
- [ ] Fix subagent recorded or explicitly not needed:
      pending-before-review-result
- [ ] Implementation subagent recorded:
      pending-before-review-and-fix

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `high`
- Owned files: `work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`
- Forbidden files: runtime files until owner-file proof and subagent
  sequencing promote exact paths into write scope.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json
4. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
