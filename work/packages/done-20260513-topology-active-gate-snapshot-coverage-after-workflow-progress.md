# Topology Active Gate Snapshot Coverage After Workflow Progress

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_coverage_incomplete",
  "currentState": "Focused owner-truth proof widened control-snapshot projection from missingPublishedRecoveryActiveNodeIds while keeping durable published membership distinct. The representative rerun no longer fronts startup_active_gate_owner / snapshot_coverage; canonical evidence migrated the first frontier to publication_ack_convergence under topology_publication_owner / publication_convergence with missing_published_nodes_present.",
  "nextAction": "Close this package as migrated and continue in work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md.",
  "proof": [
    "npx tap test/admin/admin-control-snapshot.test.js --grep \"(exposes publication owner-truth|widens owner truth|projects recovery-eligible readiness)\"",
    "npm test -- test/control-plane/active-node-projection.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/active-node-projection.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/active-node-projection.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/active-node-projection.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/active-node-projection.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
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
  "causalGovernance": {
    "hypothesis": "If startup_active_gate_owner / snapshot_coverage owns the current first frontier after publication ACK and priority recovery are satisfied, selected admin-ready control snapshots must include the current owner-truth active cohort or report the exact owner blocker that prevents widening past two nodes.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage should converge, reduce, or migrate to a fresh owner boundary with canonical evidence instead of remaining the first frontier at snapshotCoverage=2/5.",
    "representativeOutcome": "migrated",
    "causalDebt": "The latest representative remains red, but this package moved the first frontier off startup_active_gate_owner / snapshot_coverage. Focused proof widened owner-truth projection from missingPublishedRecoveryActiveNodeIds while keeping durable published membership distinct; canonical evidence now fronts publication_ack_convergence under topology_publication_owner / publication_convergence with missing_published_nodes_present.",
    "crossBoundaryReview": "Review subagent Codex (019e23bf-bb18-7972-b42d-adac16481f6b) reviewed predecessor work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md and found fixes required. Fix agent Codex (019e23c3-d78d-7d93-90cf-abf8589bc231) updated the predecessor commit/push ledger to include the closure ledger/model-ledger commit. Implementation agent Codex (019e23c5-ef70-7513-b851-6a20fabad5e1) implemented this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative after priority recovery workflow-progress proof",
    "phaseChain": [
      "publication acknowledgement convergence",
      "priority recovery operation workflow progress",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "publication_ack_convergence under topology_publication_owner / publication_convergence with missing_published_nodes_present after focused active-gate owner-truth proof.",
    "knownDownstreamBlockers": [
      "active-gate snapshot coverage is now downstream of publication convergence with snapshotCoverage=0/5 and selectedSnapshotError=snapshot_timeout",
      "startup readiness support remains inherited from publication and active-gate blockers",
      "membership epoch, failure repair intent, rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain downstream"
    ],
    "missingCausalEdge": "Selected control snapshot coverage must derive expected nodes and observed nodes from the current owner-truth active cohort after publication and priority recovery are satisfied.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused admin and projection tests pass for the bounded active-node projection reconcile; representative rolling-restart rerun no longer fronts active_gate_snapshot_coverage and canonical evidence migrated to publication_ack_convergence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "Observed: active-gate owner truth includes missing published recovery nodes in focused proof, and representative first frontier moved to topology_publication_owner / publication_convergence.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused owner proof, and one representative rolling-restart rerun",
    "sameFrontierFallback": "not used; active_gate_snapshot_coverage is no longer the first representative frontier.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence remains the first frontier in work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md.",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused active-gate owner-truth proof widened control-snapshot projection from missingPublishedRecoveryActiveNodeIds; the refreshed representative no longer fronts active_gate_snapshot_coverage and canonical evidence now fronts publication_ack_convergence with missing_published_nodes_present.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
      "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md"
}
-->

## Why

Publication ACK and the original priority recovery workflow-progress residual
were satisfied before this package started, while the selected admin-ready
snapshot exposed only two of five expected owner-truth nodes.

This package widened active-gate owner truth from
`missingPublishedRecoveryActiveNodeIds` without changing durable published
membership. The representative rerun now fronts publication convergence rather
than active-gate snapshot coverage.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
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

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Codex (019e23bf-bb18-7972-b42d-adac16481f6b) reviewed
      work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md;
      result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Codex (019e23c3-d78d-7d93-90cf-abf8589bc231) fixed
      work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md`.
- [x] Implementation subagent recorded:
      `Agent Codex (019e23c5-ef70-7513-b851-6a20fabad5e1) implemented
      work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md`.

## In Scope

1. work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md
2. work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md
3. work/model-ledger.jsonl
4. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
5. work/sprints/current-blocker.json
6. work/sprints/current-blocker.md
7. src/admin/admin-control-snapshot-class-part-1.js
8. src/admin/admin-control-snapshot-class-part-3.js
9. src/admin/admin-control-snapshot-class-part-5.js
10. src/control-plane/active-node-projection.js
11. src/control-plane/membership-publication-planning.js
12. src/control-plane/membership-publication-coordinator-class-stage-2.js
13. test/admin/admin-control-snapshot.test.js
14. test/control-plane/membership-publication-coordinator-main-stage-1.js
15. test/control-plane/membership-publication-coordinator-main-stage-3.js
16. test/distributed/harness/cluster-segment-7-class-4.js
17. test/distributed/harness/cluster-segment-7-class-5.js
18. test/distributed/harness/__tests__/cluster.test-part-5.js

## Out Of Scope

1. operation workflow runtime changes unless fresh evidence delegates back downward
2. harness timeout increases
3. Pro behavior
4. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md`, `work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md`, `work/model-ledger.jsonl`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/control-plane/active-node-projection.js`, `src/control-plane/membership-publication-planning.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `test/admin/admin-control-snapshot.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-1.js`, `test/control-plane/membership-publication-coordinator-main-stage-3.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`
- Forbidden files: `operation workflow runtime changes unless fresh evidence delegates back downward`, `harness timeout increases`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/admin/admin-control-snapshot.test.js --grep "(exposes publication owner-truth|widens owner truth|projects recovery-eligible readiness)"`, `npm test -- test/control-plane/active-node-projection.test.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`
- Model ledger advisory: `escalate`

## Validation

1. `npx tap test/admin/admin-control-snapshot.test.js --grep "(exposes publication owner-truth|widens owner truth|projects recovery-eligible readiness)"` passed.
2. `npm test -- test/control-plane/active-node-projection.test.js` passed.
3. `node scripts/check-guideline-literals.js src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-class-stage-2.js` passed.
4. `node scripts/check-guideline-decision-boundaries.js src/control-plane/active-node-projection.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-class-stage-2.js` passed.
5. `npm run audit:runtime-grammar:file -- src/control-plane/active-node-projection.js` passed.
6. Representative rolling-restart rerun completed red by migration: first frontier `publication_ack_convergence`, owner `topology_publication_owner`, boundary `publication_convergence`, dominant reason `missing_published_nodes_present`.
7. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json` confirms the migrated frontier.
8. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence` confirms `missingPublishedCount=5` with `pendingAckCount=0`.
9. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json` confirms `migrate_owner_boundary`.
10. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown` confirms no priority recovery residual witnesses.
