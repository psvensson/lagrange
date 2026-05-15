# Topology Active Gate Snapshot Coverage After Publication Handoff

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Publication catch-up is now reachable from repair-deferred active-gate snapshots with owner_reconcile_pending evidence, but fresh representative evidence remains same-frontier red: all five nodes are active by status, selected snapshot coverage is 2/5, producer publication remains PUBLISHED with pendingAck=0, publishedActive=1/5, and missingPublished=4, and activeGateOwnerCohort still reports two pending reconcile node IDs. The selected snapshot exposes repair_deferred/deferred_refresh/deferred/deferred/retry with retryAfterMs=14976 and reason codes cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight. Canonical priority recovery extraction now names a subordinate operation_workflow_owner / workflow_progress witness on control_plane_publications-p1 with actuationState=persisted_not_dispatched and nextRequiredAction=advance_existing_operation.",
  "nextAction": "Do not relax active-gate admission. Use the same artifact to split or promote the subordinate operation_workflow_owner / workflow_progress residual if the active-gate publication catch-up remains same-frontier after this slice; otherwise continue the active-gate owner path only with owner-file proof.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "./node_modules/.bin/tap --grep \"active-gate owner cohort|owner-truth active cohort\" test/admin/admin-control-snapshot.test.js",
    "node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "node test/distributed/harness/__tests__/cluster.test-part-3.js",
    "node test/distributed/harness/__tests__/cluster.test-part-4.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "./node_modules/.bin/tap --grep \"repair-deferred shared owner|forced authoritative membership observation|build snapshot forwards authoritative membership reconcile|auto-repaired snapshots use authoritative membership publication|active-gate owner cohort|owner-truth active cohort\" test/admin/admin-control-snapshot.test.js",
    "node --test test/scripts/analyze-topology-convergence.test.js"
  ],
  "writeScope": [
    "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md",
    "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md",
    "work/sprints/done-2026-q2-topology-convergence-residual-closure.md",
    "work/tracks/topology-convergence.md",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-5.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-3.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json"
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
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js"
  ],
  "commitScope": [
    "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md",
    "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md",
    "work/sprints/done-2026-q2-topology-convergence-residual-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-5.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-3.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "scripts/analyze-topology-convergence.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json"
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
    "status": "live-red-same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Use the priority-recovery residual extractor result to split or promote the operation_workflow_owner / workflow_progress tail if active-gate catch-up remains same-frontier."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage must either advance selected snapshot coverage from 0/5 after publication handoff closure or classify the authoritative repair failure as the bounded local blocker.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The publication catch-up hook is reachable from repair-deferred active-gate snapshots with owner_reconcile_pending evidence, but representative evidence remains same-frontier red: snapshotCoverage stays 2/5, producer publication stays PUBLISHED with pendingAck=0, publishedActive=1/5, and missingPublished=4, and activeGateOwnerCohort still has two pending reconcile node IDs. Canonical priority recovery extraction names the likely subordinate residual as operation_workflow_owner / workflow_progress on control_plane_publications-p1 with actuationState=persisted_not_dispatched and nextRequiredAction=advance_existing_operation.",
    "crossBoundaryReview": "Subagent review confirmed the bypass and recommended gating catch-up to owner_reconcile_pending evidence. The fix keeps diagnostics as a trigger for the publication owner path and does not relax active admission while runtimePromotionAllowed=false."
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
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with state blocked and dominant reason active_gate_timed_out in test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied, but the handoff probe producer shows publication=PUBLISHED, pendingAck=0, publishedActive=1/5, missingPublished=4, publicationPending=true, and nextOwnerPath startup_active_gate_owner / snapshot_coverage with runtimePromotionAllowed=false",
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration, active_gate_timeout, active_gate_attempts, and readiness_retry_window budgets are exhausted or terminal-classified",
      "priority_recovery_partition_progress remains classified as satisfied in the topology graph, but analyze:priority-recovery-residuals reports operation_workflow_owner / workflow_progress for control_plane_publications-p1 with actuationState=persisted_not_dispatched"
    ],
    "missingCausalEdge": "The selected snapshot now exposes retryable repair-deferred evidence plus activeGateOwnerCohort owner_reconcile_pending, and the replayable handoff fixture captures this shape. The next proof must make pending reconcile node IDs advance into durable published active membership and selected snapshot coverage.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Focused fallback, diagnostic handoff, and publication-owner catch-up wiring proof pass. Fresh representative evidence is still same-frontier red: all five nodes are ACTIVE by status, selectedSnapshotError is unknown, selectedSnapshotRepairDeferred=true with selectedSnapshotObservationNextAction=retry and retryAfterMs=14976, snapshotCoverageNodeCount=2/5, and the handoff probe still detects publication_ack_to_active_gate_reconcile_missing with owner_reconcile_pending. The priority residual extractor now exposes operation_workflow_owner / workflow_progress on control_plane_publications-p1 as the likely subordinate mechanism blocking durable publication catch-up.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "Next proof should make the operation workflow tail explicit or drain it: control_plane_publications-p1 must move beyond persisted_not_dispatched/advance_existing_operation, after which durable publication truth, active node projection, snapshot coverage, and expected cohort should catch up before active admission.",
    "maxProgressBound": "one focused active-gate snapshot coverage package slice with canonical extractors, owner-file proof, subagent sequencing, focused validation, and representative result classification",
    "sameFrontierFallback": "Fresh evidence still selects startup_active_gate_owner / snapshot_coverage, but the local catch-up bypass is closed. Do not add another diagnostics-only successor; split or promote the operation_workflow_owner / workflow_progress residual if the same active-gate handoff remains blocked.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The cross-boundary publication handoff package closed stale publication_pending reentry. This successor must not reopen publication unless canonical extraction promotes publication_ack_convergence as first frontier again.",
    "handoffInvariant": "The track related-work constraint now applies: active-gate admission must stay strict while the owner-reconcile catch-up edge remains pending."
  },
  "predecessor": "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md"
}
-->

## Why

This package is no longer active. Human direction on 2026-05-15 stopped the
residual-closure sprint before this package reached closure. It remains as
dormant context for the complexity-reduction successor and must not be resumed
inside the new sprint unless canonical evidence explicitly reactivates the
same owner boundary.

Publication handoff closure moved the representative first frontier back to
active-gate snapshot coverage. This package owns the next local blocker:
`startup_active_gate_owner / snapshot_coverage` with active gate timed out,
snapshot coverage below the expected cohort, and selected snapshot repair debt.

The focused fallback, diagnostic handoff, forced reconcile, and retry-action
slices reduced ambiguity but did not close the release gate. Fresh
representative evidence reaches all five nodes as active by status, keeps the
local snapshot when forced repair fails, and exposes the remaining catch-up
edge as `owner_reconcile_pending`: selected snapshot coverage is still `2/5`,
producer publication remains
`PUBLISHED / pendingAck=0 / publishedActive=1/5 / missingPublished=4`, and
repair deferral is now
`repair_deferred / deferred_refresh / deferred / deferred / retry` with
`retryAfterMs=14976`, and the selected owner cohort has two pending reconcile
node IDs. The remaining edge is still
`publication_ack_to_active_gate_reconcile_missing`; the replayable handoff
fixture now captures this shape so the next slice can use it before editing
the runtime catch-up path.

## Related Work Recheck

The topology track comparative guidance changes the next move:

1. etcd-style catch-up before promotion means active-gate admission cannot pass
   from partial or stale owner truth.
2. TiKV/PD-style operator progress means `wait` is not enough unless the owner
   exposes a step witness, timeout, and legal next action.
3. CockroachDB-style control-plane strictness means publication `PUBLISHED` with
   `pendingAck=0` is insufficient when active cohort projection still shows
   `publishedActive=1/5` and four missing published nodes.
4. FoundationDB-style replay discipline means the next slice should use the
   existing handoff probe or fixture before another full rerun or runtime edit.

Current proof supports that interpretation:
`npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --handoff-probe`
now reports `publication_ack_to_active_gate_reconcile_missing`,
`consumer=active_gate_snapshot_coverage`, consumer reasons include
`owner_reconcile_pending`, `nextOwnerPath=startup_active_gate_owner /
snapshot_coverage`, and `runtimePromotionAllowed=false`.

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

1. work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md
2. work/sprints/done-2026-q2-topology-convergence-residual-closure.md
3. work/tracks/topology-convergence.md
4. work/model-ledger.jsonl
5. test/distributed/harness/cluster-segment-5.js
6. test/distributed/harness/cluster-segment-2.js
7. test/distributed/harness/cluster-segment-7-class-4.js
8. test/distributed/harness/cluster-segment-7-class-5.js
9. test/distributed/harness/__tests__/cluster.test-part-3.js
10. test/distributed/harness/__tests__/cluster.test-part-4.js
11. test/distributed/harness/__tests__/cluster.test-part-5.js
12. test/distributed/harness/__tests__/active-gate-closure-classification.test.js
13. src/admin/admin-control-snapshot-class-part-2.js
14. src/admin/admin-control-snapshot-class-part-3.js
15. src/admin/admin-control-snapshot-class-part-5.js
16. src/admin/admin-control-snapshot-class-part-6.js
17. src/control-plane/control-plane-snapshot-owner.js
18. src/diagnostics/topology-convergence-graph.js
19. test/admin/admin-control-snapshot.test.js
20. scripts/analyze-topology-convergence.js
21. test/scripts/analyze-topology-convergence.test.js
22. test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json

## Out Of Scope

1. Publication convergence unless fresh canonical evidence promotes it back to
   first frontier.
2. Operation workflow/runtime unless fresh canonical evidence promotes it.
3. Scenario timeout defaults.

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [x] Review subagent recorded:
      Agent Cicero (019e2afe-d34a-7a42-890f-097a2e9a824c) reviewed work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Codex (019e2b00-fbfd-7db3-a2c2-1297f208d7b8) fixed work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md
- [x] Implementation subagent recorded:
      Agent Codex (019e2b05-507c-78d1-85a4-67f2ea47f518) implemented work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `high`
- Owned files: `work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md`, `work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md`, `work/sprints/done-2026-q2-topology-convergence-residual-closure.md`, `work/tracks/topology-convergence.md`, `work/model-ledger.jsonl`, `test/distributed/harness/cluster-segment-5.js`, `test/distributed/harness/cluster-segment-2.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-3.js`, `test/distributed/harness/__tests__/cluster.test-part-4.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `src/control-plane/control-plane-snapshot-owner.js`, `src/diagnostics/topology-convergence-graph.js`, `test/admin/admin-control-snapshot.test.js`, `scripts/analyze-topology-convergence.js`, `test/scripts/analyze-topology-convergence.test.js`, `test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json`
- Forbidden files: runtime files outside the promoted NodeHandle
  forced-snapshot fallback slice unless fresh evidence promotes them.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `node test/distributed/harness/__tests__/cluster.test-part-3.js`
- Model ledger advisory: `escalate`

## Latest Slice Result

Publication catch-up is now reachable from the repair-deferred
active-gate path only when the selected snapshot exposes
`activeGateOwnerCohort` pending owner-reconcile evidence. The direct
option-forwarding bug was fixed in the diagnostics builder, so
`buildLocalControlSnapshot({reconcileAuthoritativeMembershipPublication:true})`
now reaches `membershipPublicationService.reconcileClusterMembership`.

Representative `rolling-restart` remains red at the same first frontier:
`active_gate_snapshot_coverage` under `startup_active_gate_owner /
snapshot_coverage`, with `snapshotCoverage=2/5`, publication `PUBLISHED`,
`publishedActive=1/5`, `missingPublished=4`, and
`activeGateOwnerCohortPendingReconcileCount=2`. The selected snapshot now
keeps a structured `repair_deferred / deferred_refresh / retry` observation
with reason codes
`cache_stale_watermark,discovery_node_coverage_gap,stale_replica_operations_in_flight`.

Canonical `analyze:priority-recovery-residuals` on the same artifact reports a
subordinate `operation_workflow_owner / workflow_progress` witness for
`control_plane_publications-p1`: `semanticStateId=spread_satisfied_in_flight`,
`actuationState=persisted_not_dispatched`, and
`nextRequiredAction=advance_existing_operation`. This package should not edit
operation workflow files without a scope split; that residual is the next
likely package boundary if the active-gate handoff stays same-frontier.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-supplied-stream-closure-20260515-codex.report.json
4. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
5. node test/distributed/harness/__tests__/cluster.test-part-3.js
6. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --fast-local --verbose
7. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json
8. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --explain active_gate_snapshot_coverage
9. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json --handoff-probe
10. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json
11. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-snapshot-local-fallback-20260515-codex.report.json
12. ./node_modules/.bin/tap --grep "repair-deferred shared owner|forced authoritative membership observation|active-gate owner cohort|owner-truth active cohort" test/admin/admin-control-snapshot.test.js
13. node --test test/distributed/harness/__tests__/active-gate-closure-classification.test.js
14. node test/distributed/harness/__tests__/cluster.test-part-3.js
15. node test/distributed/harness/__tests__/cluster.test-part-4.js
16. node test/distributed/harness/__tests__/cluster.test-part-5.js
17. node --test test/scripts/analyze-topology-convergence.test.js
18. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-3.js test/distributed/harness/__tests__/cluster.test-part-4.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-class-part-6.js src/control-plane/control-plane-snapshot-owner.js src/diagnostics/topology-convergence-graph.js test/admin/admin-control-snapshot.test.js test/scripts/analyze-topology-convergence.test.js
19. node scripts/check-guideline-decision-boundaries.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-3.js test/distributed/harness/__tests__/cluster.test-part-4.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-class-part-6.js src/control-plane/control-plane-snapshot-owner.js src/diagnostics/topology-convergence-graph.js test/admin/admin-control-snapshot.test.js test/scripts/analyze-topology-convergence.test.js
20. git diff --check -- work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md work/sprints/done-2026-q2-topology-convergence-residual-closure.md work/tracks/topology-convergence.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-3.js test/distributed/harness/__tests__/cluster.test-part-4.js test/distributed/harness/__tests__/cluster.test-part-5.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-class-part-6.js src/control-plane/control-plane-snapshot-owner.js src/diagnostics/topology-convergence-graph.js test/admin/admin-control-snapshot.test.js scripts/analyze-topology-convergence.js test/scripts/analyze-topology-convergence.test.js test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json

Literal-guideline fallback: `node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/__tests__/cluster.test-part-3.js`
currently reports 385 whole-file findings on existing harness/test files without
a usable baseline. Package-specific static guardrails use runtime-grammar and
decision-boundary checks above.
