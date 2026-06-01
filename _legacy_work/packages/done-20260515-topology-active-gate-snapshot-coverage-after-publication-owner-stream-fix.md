# Topology Active Gate Snapshot Coverage After Publication Owner Stream Fix

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused forced-snapshot fallback now escalates repair-deferred refresh debt when active-gate forceRepair reaches NodeHandle.getControlSnapshot. Focused tests and lint pass. Fresh representative evidence is still red, but the selected stale repair_deferred / stale_usable / pending / idle / wait observation is gone; the first frontier migrated back to publication_ack_convergence under topology_publication_owner / publication_convergence with publication_pending while active_gate_snapshot_coverage is downstream with snapshotCoverage=0/5 and a forced authoritative snapshot repair error.",
  "nextAction": "Close this active-gate slice as migrated. Because the representative frontier oscillated again between startup_active_gate_owner / snapshot_coverage and topology_publication_owner / publication_convergence without green closure, stop tactical single-boundary patching and open a cross-boundary causal package that owns the publication-to-active-gate handoff.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "node test/distributed/harness/__tests__/cluster.test-part-3.js",
    "npx eslint --no-ignore test/distributed/harness/cluster-segment-4.js test/distributed/harness/__tests__/cluster.test-part-3.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-3.js"
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
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-3.js"
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
    "status": "live-red-migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open one cross-boundary causal package for the publication-to-active-gate handoff. The active-gate refresh-debt symptom is reduced, but publication convergence and active-gate coverage now oscillate as frontiers."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage must advance or explicitly classify selected snapshot repair_deferred stale_usable evidence before active-gate timeout can reach 5/5 coverage.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "The active-gate forceRepair path now escalates repair-deferred cache_stale_watermark and stale_replica_operations_in_flight evidence into forced authoritative repair instead of reusing the stale local snapshot. The representative rerun no longer shows the stale repair-deferred observation, but canonical extraction moved first frontier back to topology_publication_owner / publication_convergence with publication_pending. This is a repeated publication/active-gate oscillation and should be handled by one cross-boundary causal package.",
    "crossBoundaryReview": "Review, fix, and implementation subagent proof are clean. Focused force-repair tracing promoted test/distributed/harness/cluster-segment-4.js and test/distributed/harness/__tests__/cluster.test-part-3.js into writeScope and commitScope because active-gate forceRepair reaches NodeHandle.getControlSnapshot but forced fallback only escalated discovery coverage or publication-gate debt."
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
    "currentFirstFrontier": "fresh representative rerun first frontier moved to publication_ack_convergence under topology_publication_owner / publication_convergence with publication_pending",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage remains blocked downstream with activeGate=timed_out, snapshotCoverage=0/5, and selected snapshot forced authoritative repair failure",
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted",
      "publication_ack_convergence is again the canonical first frontier"
    ],
    "missingCausalEdge": "The active-gate forced repair path now wakes into authoritative repair, but publication convergence and active-gate coverage still do not form a monotonic handoff before timeout.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused proof shows a bounded retry/advance mechanism: forceRepair escalates repair-deferred refresh debt to the forced authoritative snapshot path instead of reusing stale local evidence. Representative proof migrates away from stale repair-deferred evidence and back to publication_pending, so this package is migrated/reduced rather than green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "active_gate_timed_out resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one focused active-gate snapshot coverage package slice with canonical extractors, owner-file proof, subagent sequencing, focused validation, and representative result classification",
    "sameFrontierFallback": "keep startup_active_gate_owner / snapshot_coverage active and do not absorb publication convergence, operation workflow, or generic harness timeout changes without canonical promotion.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence inside a cross-boundary publication-to-active-gate causal package",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260514-topology-publication-convergence-final-blocker.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The frontier returned from active_gate_snapshot_coverage to publication_ack_convergence after the focused forced-fallback repair. This confirms repeated active-gate/publication oscillation without green closure; stop tactical single-boundary patching and open one cross-boundary causal package.",
    "handoffInvariant": "Do not continue one-off active-gate or publication packages until a cross-boundary publication-to-active-gate handoff package names the missing edge probe."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused forced-fallback repair removed the selected stale repair-deferred snapshot observation by escalating cache_stale_watermark and stale_replica_operations_in_flight repair debt to the forced authoritative snapshot path. The fresh representative artifact still fails, but canonical extraction moves the first frontier back to publication_ack_convergence / publication_pending and leaves active_gate_snapshot_coverage downstream.",
    "evidence": [
      "node test/distributed/harness/__tests__/cluster.test-part-3.js",
      "npx eslint --no-ignore test/distributed/harness/cluster-segment-4.js test/distributed/harness/__tests__/cluster.test-part-3.js",
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --verbose",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md"
}
-->

## Why

The publication owner-stream fix produced the desired representative movement:
publication ACK convergence became satisfied and the live blocker moved back to
active-gate snapshot coverage. This package owned that edge and repaired the
local forced-snapshot decision that was reusing a stale repair-deferred
observation after the active-gate force-repair threshold.

The focused fix now treats `cache_stale_watermark` plus
`stale_replica_operations_in_flight` as repairable refresh debt when the local
snapshot is repair-deferred and force repair is requested. The representative
rerun is still red, but the selected stale repair-deferred observation is gone:
canonical evidence moved the first frontier back to publication convergence.

## Scope Basis

AGPL topology convergence release-gate closure. Ship criteria still require
`active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`. This package
is closed as migrated because the fresh representative evidence no longer
selects the active-gate stale repair-deferred observation as first frontier.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the first frontier has oscillated between
  publication convergence and active gate, so the package must preserve the
  migration proof and then work the active-gate owner boundary.
- Escalation trigger to a heavier lane: fresh representative evidence promotes
  publication convergence, operation workflow progress, or readiness support
  ahead of active-gate snapshot coverage.
- Re-entry rule: same-boundary evidence stays in this package. Open a successor
  only if canonical extraction changes the first-frontier edge, owner,
  boundary, or next required action.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md
2. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
3. work/model-ledger.jsonl
4. test/distributed/harness/cluster-segment-4.js
5. test/distributed/harness/__tests__/cluster.test-part-3.js

## Out Of Scope

1. topology_publication_owner / publication_convergence unless fresh canonical evidence promotes it back to first frontier
2. operation_workflow_owner / workflow_progress unless fresh canonical evidence promotes it to first frontier
3. scenario_timeout_defaults

## Subagent Sequencing Ledger

Required before implementation because this is a runtime owner-boundary and
causal-escalation package.

- [x] Review subagent recorded:
      Agent Nash (019e2a94-5ee1-76f1-a97a-7a2e5c195521) reviewed work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Euclid (019e2a98-3aba-7742-9946-f580a6772c38) fixed work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md
- [x] Implementation subagent recorded:
      Agent Ohm (019e2a9e-4209-7b91-b902-12957b06c134) implemented work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Owned files: `work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`, `test/distributed/harness/cluster-segment-4.js`, `test/distributed/harness/__tests__/cluster.test-part-3.js`
- Forbidden files: runtime files outside the promoted forced-control-snapshot fallback decision and its focused node-client regression test
- Frozen decisions: focused active-gate forceRepair refresh-debt fallback is implemented; fresh representative evidence moved first frontier back to publication_ack_convergence.
- Escalation triggers: owned files expand beyond metadata without owner-file proof, runtime ownership changes, or representative evidence changes first frontier.
- Focused proof: `node test/distributed/harness/__tests__/cluster.test-part-3.js`, `npx eslint --no-ignore test/distributed/harness/cluster-segment-4.js test/distributed/harness/__tests__/cluster.test-part-3.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
4. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
6. node test/distributed/harness/__tests__/cluster.test-part-3.js
7. npx eslint --no-ignore test/distributed/harness/cluster-segment-4.js test/distributed/harness/__tests__/cluster.test-part-3.js
8. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --verbose
9. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
10. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage
11. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
12. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json
13. npm run work:validate -- --closure

## Commit And Push Ledger

1. Focused package commit: `f3c8a3ff35c5300396bffe79acf5a1142010d8f2`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
