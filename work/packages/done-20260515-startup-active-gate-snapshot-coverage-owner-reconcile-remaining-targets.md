# Startup Active Gate Snapshot Coverage Owner Reconcile Remaining Targets

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "owner_reconcile_pending",
  "currentState": "The package reduced the active-gate owner-reconcile blocker. Representative artifact test-output/reports/rolling-restart-after-handoff-error-outcome-20260516.report.json first surfaced a structured handoff outcome, write_deferred#reason=owner_reconcile_service_unavailable. After wiring the admin runtime to retain the live owner readiness service and prefer readiness services with membershipPublicationService, representative artifact test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json no longer reports owner_reconcile_service_unavailable. The active-gate handoff contract now has pendingReconcileCount=0 and nextAction=wait_owner_recovery; priority recovery remains classified, but the scenario is still red with first frontier publication_ack_convergence / topology_publication_owner / publication_convergence and a seed readiness timeout shape.",
  "nextAction": "Migrate the next package to topology_publication_owner / publication_convergence or the canonical priority-recovery residual if successor evidence selects operation_workflow_owner / rebalancer_handoff; do not continue treating the drained handoff owner-reconcile path as the active blocker.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-catchup-rebuild-retry-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-catchup-rebuild-retry-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json",
    "PASS: node --test test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "PASS: node --test test/control-plane/publication-active-gate-handoff-contract.test.js",
    "PASS: node scripts/check-guideline-literals.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js",
    "PASS: node scripts/check-runtime-grammar-contracts.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js",
    "PASS: node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js",
    "FAIL: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --markdown",
    "rg -n \"membershipPublicationHandoffOutcome|published_visible|write_deferred|pressure_deferred|target_blocked|no_change|active_gate_handoff_owner_reconcile\" test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json",
    "PASS: npx tap --grep \"setSQLQueryEngine\" test/admin/admin-websocket-api.test-part-7.js",
    "PASS: node scripts/check-guideline-literals.js src/entrypoint-runtime-helpers.js src/admin/admin-websocket-api-shared.js src/admin/admin-websocket-api-segment-3.js",
    "PASS: node scripts/check-runtime-grammar-contracts.js src/entrypoint-runtime-helpers.js src/admin/admin-websocket-api-shared.js src/admin/admin-websocket-api-segment-3.js",
    "PASS: node scripts/check-guideline-decision-boundaries.js src/entrypoint-runtime-helpers.js src/admin/admin-websocket-api-shared.js src/admin/admin-websocket-api-segment-3.js",
    "FAIL: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/entrypoint-runtime-helpers.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-websocket-api-shared.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-3.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-websocket-api.test-part-7.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-3.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md",
    "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md",
    "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/entrypoint-runtime-helpers.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-websocket-api-shared.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-3.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-websocket-api.test-part-7.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-3.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/entrypoint-runtime-helpers.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-websocket-api-shared.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-3.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-websocket-api.test-part-7.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-3.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "runtime ownership changes beyond canonical active-gate handoff target or membership publication owner command outcome",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_ack_blocked",
    "nextAction": "Open or activate a successor package for publication convergence unless canonical residual triage selects operation_workflow_owner / rebalancer_handoff first."
  },
  "causalGovernance": {
    "hypothesis": "After workflow progress drains, active-gate snapshot coverage remains red because owner membership publication reconcile is pending for two active nodes while selected publication membership remains seed-only.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green, pendingReconcileCount or missingPublishedCount reduces, snapshotCoverage improves, or fresh evidence migrates to a narrower active-gate publication reconcile boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "The owner command works in focused fixture proof and the latest representative artifact drains active-gate handoff pendingReconcileCount to 0. Remaining red evidence is no longer the owner_reconcile_service_unavailable path; it is publication convergence/readiness evidence with wait_owner_recovery and a seed readiness timeout.",
    "crossBoundaryReview": "Do not relax active-gate admission, rewrite publication handoff truth, increase timeouts, or reopen workflow_progress unless canonical residual extractors promote it again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Latest representative evidence reduced active-gate handoff pendingReconcileCount to 0 and changed nextAction from reconcile_owner_membership_publication to wait_owner_recovery; the causal model now selects publication_ack_convergence as first critical path.",
    "evidence": [
      "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json"
    ]
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / publication active-gate handoff pending owner reconcile",
    "phaseChain": [
      "consume zero priority-recovery residual proof",
      "inspect active-gate handoff pending owner reconcile evidence",
      "run required review/fix/implementation subagents before runtime edits",
      "promote exact runtime/test files only after owner evidence selects the bounded path",
      "prove focused active-gate or publication-reconcile tests and static guardrails",
      "rerun representative rolling-restart until green, reduced, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage is the first topology frontier in test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json, owned by startup_active_gate_owner / snapshot_coverage, while priority_recovery_partition_progress is satisfied at the active-gate summary.",
    "knownDownstreamBlockers": [
      "producer publication_ack_convergence is satisfied with publicationStatus PUBLISHED and pendingAckCount 0",
      "selected producer publishedActiveNodeIds remains seed-only at 1/5 with missingPublishedCount 4",
      "consumer active-gate snapshot coverage is 2/5 with selected snapshot observation repair_deferred/deferred_refresh/deferred/deferred/retry",
      "handoff contract is pending with pendingReconcileCount 2 for 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
      "focused owner-command fixture writes or classifies the widened publication row, but the representative report contains no membershipPublicationHandoffOutcome or structured owner outcome",
      "one subordinate operation_workflow_owner / workflow_progress witness remains parked because active_gate_snapshot_coverage is still the first frontier"
    ],
    "missingCausalEdge": "The representative active-gate handoff path must submit the target set to the membership publication owner and consume or surface one structured owner outcome instead of leaving the evidence at generic owner_reconcile_pending.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --handoff-probe plus rg for membershipPublicationHandoffOutcome and owner outcome values in the same report.",
    "boundedProgressProof": "This package must surface one structured owner handoff reconcile outcome in representative evidence and either reduce pendingReconcileCount, missingPublishedCount, or snapshot coverage, or classify the single owner outcome that blocks publication visibility.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json",
    "expectedObservableTransition": "representative evidence names published_visible, write_deferred, pressure_deferred, target_blocked, or no_change for the handoff command; if the gate remains red, the next blocker is that single owner outcome.",
    "maxProgressBound": "one startup active-gate snapshot coverage package slice; no timeout increases, active-gate admission relaxation, publication handoff rewrites, or workflow-progress implementation",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains red, record which one membership publication owner outcome failed before broadening scope; do not bounce between admin snapshot, active gate, and workflow progress.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / reduced",
      "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed to return to startup_active_gate_owner / snapshot_coverage because the immediately preceding workflow-progress package proved priority recovery is satisfied.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260516-topology-publication-convergence-frontier-causal-edge.md"
}
-->

## Why

Priority recovery is no longer the release-gate blocker. The current
representative artifact selects `active_gate_snapshot_coverage`, with
publication-to-active-gate handoff pending owner reconcile for two active
nodes. This package owns that remaining active-gate owner path.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
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

1. Prove the current handoff pending owner-reconcile targets with canonical
   extractors and focused owner-file reads.
2. Run required review/fix/implementation subagents before runtime edits.
3. Implement only the bounded active-gate handoff target and membership
   publication owner-command outcome path selected by the current evidence.
4. When canonical residual extractors promote workflow-progress again, keep the
   fix bounded to the promoted priority control-plane transition retry context.
5. Rerun focused tests, static guardrails, and representative
   `rolling-restart`.

## Evidence

Canonical extractors were run before raw artifact inspection. `work:evidence-summary`
keeps the first frontier at `active_gate_snapshot_coverage`, the handoff probe
reports `requiredProgressMechanism=reconcile`, and priority-recovery residuals
report zero witnesses. `analyze:owner-files` keeps the owner boundary on
`startup_active_gate_owner / snapshot_coverage`.

The canonical handoff probe does not expose nested handoff target projection,
active-gate owner cohort published nodes, or whether the selected snapshot
carried a fresh `publishedMembershipObservation`, so raw report inspection was
used as a fallback. The report only contains flattened active-gate progress:
`publicationActiveGateHandoffNextAction=null`,
`publicationActiveGateHandoffPendingReconcileCount=2`,
`activeGateOwnerCohortPendingReconcileNodeIds=35a891b8-c1a0-5064-9c6e-2acfba61c2a7,8be8d30f-4499-5eed-865c-71b4d529a67a`,
selected producer `publishedActiveNodeIds` remains the seed only, and
`perNodePublicationDisagreementSet` shows the selected snapshot source and two
other nodes still observe all four non-seed nodes as missing. That selects the
canonical handoff target and admin publication-owner catch-up path for runtime
promotion.

After adding admin publication-owner catch-up during rebuild, representative
artifact
`test-output/reports/rolling-restart-after-catchup-rebuild-retry-20260515-codex.report.json`
remained red. Canonical extractors still kept `active_gate_snapshot_coverage`
as the first frontier, but `analyze:priority-recovery-residuals` promoted one
`operation_workflow_owner / workflow_progress` witness for
`control_plane_publications-p1`: operation
`08e1f42b-afb1-408c-a1d8-c21a0eede98e` was a target-owned `PENDING` row with
`actuation.state=persisted_not_dispatched` and
`nextRequiredAction=advance_existing_operation`. Raw log fallback was needed
because canonical extractors did not expose the retry context recorded by the
target node; the failure bundle showed retryable transition pressure recorded
with `partitionId=null` and `workflowStep=null`, causing transition grace to
expire at the step timeout instead of the priority operation budget.

After preserving transition retry owner context, representative artifact
`test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json`
remained red. `work:evidence-summary` and the causal model keep the first
frontier at `active_gate_snapshot_coverage`; the handoff probe reports
`requiredProgressMechanism=reconcile`,
`pendingReconcileCount=2`, and target nodes
`11601fe0-72d6-5853-8590-ec2881853e72` and
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7`; active-gate progress reports
`priorityRecovery=none`. `analyze:priority-recovery-residuals` still finds
background operation-workflow witnesses, but the active-gate summary no longer
promotes priority recovery as the blocking mechanism. The canonical extractors
do not expose whether the admin catch-up write attempted durable
`control_plane_publications` mutation, whether it was pressure-deferred,
whether the queued reconcile drained, or which selected publication rows were
observed by each node after catch-up; raw report/log inspection is therefore
used as a fallback for those write-path details only.

After moving the handoff write/classification path into the membership
publication owner, focused owner tests pass, including the replayable fixture
with a seed-only published row, two active pending reconcile nodes, all nodes
active, and priority recovery satisfied. The owner command now returns the
structured outcomes `published_visible`, `write_deferred`,
`pressure_deferred`, `target_blocked`, or `no_change`, and admin snapshot
catch-up is trigger/display only.

Representative artifact
`test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json`
remains red on the same first frontier. Canonical extractors report
`owner_reconcile_pending`, `snapshotCoverage=2/5`, producer published active
membership seed-only at `1/5`, `missingPublishedCount=4`, handoff
`pendingReconcileCount=2` for
`11601fe0-72d6-5853-8590-ec2881853e72` and
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, and active-gate priority recovery
satisfied. `rg` against the report finds no
`membershipPublicationHandoffOutcome` or structured owner outcome value, so the
remaining handoff is not admin repair; it is the representative active-gate path
failing to surface or consume the owner command outcome.

Representative artifact
`test-output/reports/rolling-restart-after-handoff-error-outcome-20260516.report.json`
proved the trigger/display path by surfacing
`membershipPublicationHandoffOutcomeState=write_deferred` with
`reasonCode=owner_reconcile_service_unavailable`. That selected admin runtime
readiness wiring, not the membership publication owner command, because the
selected snapshot could not resolve the live membership publication service.

After the admin runtime now keeps the owner readiness service during early
startup and upgrades late SQL attachment to prefer readiness services with
`membershipPublicationService`, representative artifact
`test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`
is still red but no longer reports the service-unavailable outcome. Canonical
extractors show the active-gate handoff contract at `pendingReconcileCount=0`
with `nextAction=wait_owner_recovery`; priority recovery remains classified.
The causal model selects `publication_ack_convergence` /
`topology_publication_owner` / `publication_convergence` as the first critical
path, while priority residual triage separately reports one
`operation_workflow_owner / rebalancer_handoff` witness on
`control_plane_publications-p1`. This package is reduced and should migrate;
continuing to repair the drained owner-reconcile path would be oscillation.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation.
3. Broad publication handoff contract rewrites beyond target/catch-up proof.
4. Workflow-progress implementation unless canonical extractors promote it.
5. Pro or Enterprise behavior.

## Subagent Sequencing Ledger

Required on activation because this is a causal-escalation runtime package.

- [x] Review subagent recorded: Agent Popper (019e2dc5-19a6-7012-88d1-cf02e0c2ff69) reviewed work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed: Agent Wegener (019e2dc7-0af7-75d3-89e5-3afdbf376027) fixed work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md
- [x] Implementation subagent recorded: Agent Harvey (019e2dd0-a35f-7891-9eba-8aec8f8a9dc4) implemented work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md`, `work/tracks/topology-convergence.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/entrypoint-runtime-helpers.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/membership-publication-coordinator-class-stage-3.js`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `src/admin/admin-websocket-api-shared.js`, `src/admin/admin-websocket-api-segment-3.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-3.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/admin-websocket-api.test-part-7.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/distributed/harness/cluster-segment-2.js`, `test/distributed/harness/cluster-segment-3.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Forbidden files: timeout increases, active-gate admission relaxation while `runtimePromotionAllowed=false`, workflow-progress implementation unless canonical extractors promote it, broad diagnostics-only success path, Pro or Enterprise behavior
- Frozen decisions: package scope and lane stay bounded to canonical active-gate handoff target selection, membership publication owner-command outcome, and admin display/trigger-only behavior unless explicitly escalated.
- Escalation triggers: runtime ownership changes beyond canonical active-gate handoff target or membership publication owner-command outcome, or a frozen decision must be reopened.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md`, `node --test test/control-plane/membership-publication-coordinator-main-stage-2.js`, `node --test test/control-plane/publication-active-gate-handoff-contract.test.js`, static guardrails on the active-gate publication owner files, and `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-control-plane-publication-pending-20260515-codex.report.json --markdown
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
9. PASS: node --test test/control-plane/publication-active-gate-handoff-contract.test.js
10. PASS: npx tap --grep "handoff pending reconcile target|preserves awaited handoff reconcile observation|repair-deferred catch-up carries awaited owner publication|repair-deferred shared owner attempts publication catch-up|repair-deferred no-attempt path still attempts publication catch-up" test/admin/admin-control-snapshot.test.js
11. PASS: node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
12. PASS: node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
13. PASS: npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
14. PASS: npx tap --grep "dispatch transition retries preserve priority owner context after the step timeout|coordinator-created dispatch-pending transition retries preserve the operation snapshot" test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
15. PASS: npx tap test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
16. PASS: node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-2.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
17. PASS: node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-2.js
18. PASS: npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-2.js
19. FAIL: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json --fast-local --verbose
20. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json
21. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json --handoff-probe
22. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json
23. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json --markdown
24. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
25. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-transition-retry-context-20260515-codex.report.json
26. PASS: node --test test/control-plane/membership-publication-coordinator-main-stage-2.js
27. PASS: node --test test/control-plane/publication-active-gate-handoff-contract.test.js
28. PASS: node scripts/check-guideline-literals.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
29. PASS: node scripts/check-runtime-grammar-contracts.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
30. PASS: node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-6.js
31. FAIL: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --fast-local --verbose
32. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json
33. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --handoff-probe
34. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json
35. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json --markdown
36. rg -n "membershipPublicationHandoffOutcome|published_visible|write_deferred|pressure_deferred|target_blocked|no_change|active_gate_handoff_owner_reconcile" test-output/reports/rolling-restart-after-owner-trigger-only-handoff-20260516.report.json (no matches)
37. PASS: npx tap --grep "setSQLQueryEngine" test/admin/admin-websocket-api.test-part-7.js
38. PASS: node scripts/check-guideline-literals.js src/entrypoint-runtime-helpers.js src/admin/admin-websocket-api-shared.js src/admin/admin-websocket-api-segment-3.js
39. PASS: node scripts/check-runtime-grammar-contracts.js src/entrypoint-runtime-helpers.js src/admin/admin-websocket-api-shared.js src/admin/admin-websocket-api-segment-3.js
40. PASS: node scripts/check-guideline-decision-boundaries.js src/entrypoint-runtime-helpers.js src/admin/admin-websocket-api-shared.js src/admin/admin-websocket-api-segment-3.js
41. FAIL: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --fast-local --verbose
42. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
43. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe
44. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
45. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown
46. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
47. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown

## Commit And Push Ledger

1. [x] Focused package commit: a70176f9.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
