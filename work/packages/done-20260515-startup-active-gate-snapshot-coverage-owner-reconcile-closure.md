# Startup Active Gate Snapshot Coverage Owner Reconcile Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "operation_workflow_split_required",
  "currentState": "Fresh rolling-restart evidence after owner-key publication reconcile and bounded remote wake-up work remains red at active_gate_snapshot_coverage, but the selected snapshot no longer reports stale_replica_operations_in_flight. All five nodes are active, the canonical handoff contract is still pending, pending reconcile dropped from four nodes to three nodes, and priority recovery now reports a split residual under operation_workflow_owner / rebalancer_handoff and operation_workflow_owner / workflow_progress.",
  "nextAction": "Migrate the remaining red residual to the operation_workflow_owner split: first classify or fix the rebalancer_handoff lifecycle stall for recovering_in_flight control-plane publication replicas, then drain the workflow_progress witnesses without timeout increases or active-gate admission relaxation.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "npm run work:package:doctor -- --fix-dry-run work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "npm run work:validate -- --entry work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "npm run work:validate -- --pre-impl work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json",
    "npm run work:validate -- --closure work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "./node_modules/.bin/tap --grep \"retries bounded remote direct dispatch wake-ups|sends direct remote wake-up|registers a direct dispatch wake-up handler|heartbeat-only update reaches a node missing|READY node-state updates enqueue cluster membership reconcile|handoff pending reconcile target|repair-deferred no-attempt path|explicit handoff target|merges pending explicit handoff targets|ControlPlanePublicationsOwner|buildOperationMutationQueryOptions scopes|replica_operations writes by row identity|persistOperationUpdate uses canonical gateway mutation ingress\" test/control-plane/replica-dispatch-node-state-update.test-part-4.js test/control-plane/replica-dispatch-node-state-update.test.js test/admin/admin-control-snapshot.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/system-metadata-owner-modules.test.js test/control-plane/control-plane-system-table-gateway.test.js test/rebalancer/replica-operation-repository.test.js",
    "git diff --check",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-class-part-6.js src/control-plane/control-plane-system-table-gateway-segment-1.js src/control-plane/control-plane-system-table-gateway-segment-3.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/membership-publication-coordinator-stage-2.js src/control-plane/owners/control-plane-publications-owner.js src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-shared.js src/rebalancer/replica-operation-repository-mutation-methods.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js src/admin/admin-control-snapshot-class-part-5.js src/admin/admin-control-snapshot-class-part-6.js src/control-plane/control-plane-system-table-gateway-segment-1.js src/control-plane/control-plane-system-table-gateway-segment-3.js src/control-plane/control-plane-system-table-gateway-shared.js src/control-plane/membership-publication-coordinator-class-stage-2.js src/control-plane/membership-publication-coordinator-class-stage-3.js src/control-plane/membership-publication-coordinator-stage-2.js src/control-plane/owners/control-plane-publications-owner.js src/control-plane/replica-dispatch-service-segment-1.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-service-segment-3.js src/control-plane/replica-dispatch-service-shared.js src/rebalancer/replica-operation-repository-mutation-methods.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json"
  ],
  "writeScope": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-system-table-gateway-segment-1.js",
    "src/control-plane/control-plane-system-table-gateway-segment-3.js",
    "src/control-plane/control-plane-system-table-gateway-shared.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "src/control-plane/owners/control-plane-publications-owner.js",
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-3.js",
    "src/control-plane/replica-dispatch-service-shared.js",
    "src/rebalancer/replica-operation-repository-mutation-methods.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/control-plane-system-table-gateway.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-4.js",
    "test/control-plane/replica-dispatch-node-state-update.test.js",
    "test/control-plane/system-metadata-owner-modules.test.js",
    "test/rebalancer/replica-operation-repository-tail-test-cases.js",
    "test/rebalancer/replica-operation-repository.test.js",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md",
    "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json"
  ],
  "commitScope": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-system-table-gateway-segment-1.js",
    "src/control-plane/control-plane-system-table-gateway-segment-3.js",
    "src/control-plane/control-plane-system-table-gateway-shared.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "src/control-plane/owners/control-plane-publications-owner.js",
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-3.js",
    "src/control-plane/replica-dispatch-service-shared.js",
    "src/rebalancer/replica-operation-repository-mutation-methods.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/control-plane-system-table-gateway.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-4.js",
    "test/control-plane/replica-dispatch-node-state-update.test.js",
    "test/control-plane/system-metadata-owner-modules.test.js",
    "test/rebalancer/replica-operation-repository-tail-test-cases.js",
    "test/rebalancer/replica-operation-repository.test.js",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-dependency-map.md",
    "work/releases/0.1-stabilization.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-green-gate/current-frontier",
    "outputProfile": "high",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate-migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "operation_workflow_split_required",
    "nextAction": "Migrate to operation_workflow_owner / rebalancer_handoff and operation_workflow_owner / workflow_progress based on fresh priority-recovery residual evidence."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff + workflow_progress",
    "reason": "Owner-key publication reconcile now reaches bounded dispatch and selected snapshot stale-operation pressure is reduced, but fresh priority recovery evidence splits the remaining red residual across operation workflow rebalancer handoff and workflow progress witnesses.",
    "evidence": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown"
  },
  "causalGovernance": {
    "hypothesis": "After the publication-to-active-gate handoff contract is explicit, startup_active_gate_owner / snapshot_coverage must drain owner_reconcile_pending by running the owner-key publication reconcile path and producing durable active membership visibility for the expected cohort.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green with active=5/5, snapshotCoverage=5/5, missingPublished=0, or the package migrates to a narrower owner boundary with concrete evidence and next action.",
    "representativeOutcome": "migrated",
    "causalDebt": "Owner-key reconcile and bounded dispatch reduced the stale operation pressure inside the active-gate snapshot path, but fresh representative evidence still times out because operation workflow handoff/progress witnesses do not drain. Leaving that narrower residual unresolved keeps rolling-restart red even though publication ACK and node activity are otherwise visible.",
    "crossBoundaryReview": "This package starts after the handoff-contract simplification sprint. It must not reopen publication handoff ownership unless canonical evidence promotes publication_ack_convergence again; diagnostics and analyzer surfaces remain observation-only."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup active-gate snapshot coverage owner reconcile closure",
    "phaseChain": [
      "freeze latest reduced handoff evidence",
      "prepare subagent review/fix/implementation sequencing",
      "identify exact owner-key reconcile path",
      "implement bounded owner reconcile without admission relaxation",
      "prove focused owner/consumer tests and static guardrails",
      "rerun representative rolling-restart until green or narrowed"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage remains blocked in test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json, with fresh priority-recovery evidence promoting a split operation_workflow_owner residual.",
    "knownDownstreamBlockers": [
      "publication ACK convergence is satisfied and the canonical handoff contract exists",
      "snapshot coverage remains incomplete while expectedNodeCount=5",
      "handoffContract.state=pending with nextAction=reconcile_owner_membership_publication and pendingReconcileCount=3",
      "runtimePromotionAllowed=false, so active-gate admission must stay strict",
      "priority recovery residuals split between operation_workflow_owner / rebalancer_handoff and operation_workflow_owner / workflow_progress"
    ],
    "missingCausalEdge": "The remaining missing edge is no longer duplicate handoff truth or unbounded direct wake-up; it is operation workflow drain for recovering_in_flight rebalancer handoff witnesses and spread_satisfied_in_flight workflow progress witnesses.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown",
    "boundedProgressProof": "Focused tests prove owner-key reconcile context merging, explicit publication targets, bounded remote dispatch delivery, and router replacement for replica operation writes. The fresh representative run proves bounded progress by removing stale_replica_operations_in_flight from the selected snapshot and reducing pending reconcile before promoting operation workflow split residuals.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "expectedObservableTransition": "Representative rolling-restart moved from active-gate owner reconcile implementation into a narrower operation workflow split; the next package should fix or classify operation_workflow_owner / rebalancer_handoff and operation_workflow_owner / workflow_progress.",
    "maxProgressBound": "one green-gate package slice; no planned split may defer owner-key reconcile, focused tests, static guardrails, representative rerun, or closure classification",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier after implementation, record whether owner reconcile advanced, stalled, or exposed a narrower runtime owner; do not reopen the completed handoff-contract package by default.",
    "expectedNextFrontier": "operation_workflow_owner / rebalancer_handoff, with operation_workflow_owner / workflow_progress as the paired split residual",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md / topology_publication_owner / publication_active_gate_handoff_contract / reduced",
      "work/packages/todo-20260515-topology-active-gate-snapshot-coverage-after-publication-handoff.md / startup_active_gate_owner / snapshot_coverage / dormant stopped-sprint context",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-oscillation.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The prior oscillation boundary was reduced by the canonical handoff contract. This package owns the current active-gate snapshot coverage gate and must not duplicate handoff truth.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; consumers must use the canonical handoff contract rather than reconstructing publication truth."
  },
  "predecessor": "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The last sprint reduced the publication-to-active-gate boundary: the handoff
contract is now explicit, shared, and visible in the representative artifact.
`rolling-restart` is still red because startup active-gate snapshot coverage
does not advance from `2/5` to `5/5` while the canonical handoff says owner
publication reconcile is pending.

This package owns the remaining green-gate blocker. It must make
`nextAction=reconcile_owner_membership_publication` actually drain into durable
published active membership and selected snapshot coverage, or produce a
narrower owner-boundary migration with canonical evidence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the sprint goal is representative green, but
  the package starts from a recently oscillating publication/active-gate
  boundary, so the local owner reconcile patch must keep the causal handoff
  invariant explicit before implementation.
- Escalation trigger to a heavier lane: canonical evidence promotes a different
  first owner boundary before owner-key reconcile can be implemented.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Preserve the completed canonical handoff contract and consume it as the only
   publication-to-active-gate handoff truth.
2. Locate and implement the owner-key reconcile path required by
   `reconcile_owner_membership_publication`.
3. Advance pending reconcile node IDs into durable published active membership
   and selected snapshot coverage.
4. Keep active-gate admission strict while `runtimePromotionAllowed=false`.
5. Update focused owner/consumer tests, diagnostics/harness fixtures, and
   replay surfaces only where they are part of this owner path.
6. Rerun representative `rolling-restart` and classify it as green, migrated,
   same-frontier, classification-only, or architecture-gap with concrete owner
   evidence.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation while `runtimePromotionAllowed=false`.
3. Publication handoff contract rewrites unless canonical evidence promotes
   that owner again.
4. Pro or Enterprise behavior
5. Diagnostics-only success or presentation-only reclassification.

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation package.
This is the first package in the new sprint.

- [x] Review subagent recorded:
      not-needed (first-package-in-sprint)
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded:
      blocked-by-environment-policy; reason: developer policy allows
      spawning subagents only when the user explicitly asks for delegation,
      and this turn has no explicit subagent authorization.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-green-gate/current-frontier`
- Output profile: `high`
- Owned files: package/sprint handoff files; admin snapshot handoff/reconcile files; membership publication reconcile files; control-plane system-table gateway replica operation replacement-key files; replica dispatch bounded remote wake-up files; replica operation repository mutation files; focused admin, control-plane, and repository tests; and `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `publication handoff contract rewrites unless canonical evidence promotes that owner again`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `npm run work:validate -- --entry work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `npm run work:validate -- --pre-impl work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-closure-20260515-codex.report.json`, `npm run work:validate -- --closure work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json --handoff-probe
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-contract-consolidation-20260515-codex.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
7. npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
8. npm run work:package:doctor -- --fix-dry-run work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
9. npm run work:validate -- --entry work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
10. npm run work:validate -- --pre-impl work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md
11. Focused owner/admin/repository regression suite:
    `./node_modules/.bin/tap --grep "retries bounded remote direct dispatch wake-ups|sends direct remote wake-up|registers a direct dispatch wake-up handler|heartbeat-only update reaches a node missing|READY node-state updates enqueue cluster membership reconcile|handoff pending reconcile target|repair-deferred no-attempt path|explicit handoff target|merges pending explicit handoff targets|ControlPlanePublicationsOwner|buildOperationMutationQueryOptions scopes|replica_operations writes by row identity|persistOperationUpdate uses canonical gateway mutation ingress" test/control-plane/replica-dispatch-node-state-update.test-part-4.js test/control-plane/replica-dispatch-node-state-update.test.js test/admin/admin-control-snapshot.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/system-metadata-owner-modules.test.js test/control-plane/control-plane-system-table-gateway.test.js test/rebalancer/replica-operation-repository.test.js`
12. `git diff --check`
13. `npm run audit:runtime-grammar:file -- <touched runtime files>`
14. `node scripts/check-guideline-decision-boundaries.js <touched runtime files>`
15. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --fast-local --verbose`
16. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`
17. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --handoff-probe`
18. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown`
19. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`
20. npm run work:validate -- --closure work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md

## Implementation Proof

- Owner-key publication reconcile: admin snapshot repair-deferred and
  no-attempt paths now forward the canonical
  `publicationActiveGateHandoff` into membership reconcile, and explicit
  reconcile targets publish/ack the union of published plus pending reconcile
  nodes without allowing pressure defer.
- Bounded operation dispatch: remote direct wake-ups now use bounded router
  delivery, classify delivery outcomes, and schedule deferred retry instead of
  clearing retry state after an undelivered wake-up.
- Router replacement: replica operation gateway and repository mutation writes
  now carry `replacePendingKey` so stale queued writes for the same operation
  are replaced instead of preserved behind newer operation state.
- Focused regression, runtime grammar, decision-boundary guardrail, and
  `git diff --check` proof passed.

## Residual / Migration Evidence

- Representative rerun:
  `test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`
  failed overall, but active nodes reached `5/5`, the selected snapshot no
  longer reports `stale_replica_operations_in_flight`, and pending handoff
  reconcile dropped from four nodes to three nodes.
- Handoff probe still reports the canonical contract as pending with
  `requiredAction=reconcile_owner_membership_publication`,
  `missingPublishedCount=4`, and `publicationActiveGateHandoffPendingReconcileCount=3`.
- Priority residual extraction reports `Split required: true`: three
  witnesses under `operation_workflow_owner / rebalancer_handoff` with
  `recovering_in_flight`, and three witnesses under
  `operation_workflow_owner / workflow_progress` with
  `spread_satisfied_in_flight`.
- Raw fallback after canonical extractors: the extractors identified the split
  owner boundaries but did not expose the concrete operation row and replica
  handler lifecycle logs. Focused report inspection showed bounded direct
  wake-up reaching `control_plane_publications-p1-r4`, followed by duplicate
  create handling with service status `creating` while the replica state
  machine timed out in `pending`.

Result classification: `migrated`.

Stop condition: `migrate-owner-boundary`.

## Commit And Push Ledger

1. Focused package commit: `150daceae9bf6d0de6dc46734e3977d1137f02b1`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
