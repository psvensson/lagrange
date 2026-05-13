# Topology Active Gate Snapshot Coverage After Workflow Progress

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_coverage_incomplete",
  "currentState": "Priority recovery workflow progress moved publication ACK and priority recovery to satisfied in the latest representative rerun, but active-gate snapshot coverage is again the first frontier with snapshotCoverage=2/5, expectedNodeCount=5, publishedActive=1/5, missingPublished=4, prioritySpread=ready, and priorityRecovery=none.",
  "nextAction": "Repair active-gate snapshot coverage after publication and priority recovery are satisfied, focusing on why the selected admin-ready snapshot exposes only two owner-truth nodes.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
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
    "work/packages/active-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
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
    "expectedCausalModelChange": "active_gate_snapshot_coverage either converges, reduces to a narrower selected-snapshot freshness/projection sub-boundary, or migrates to a fresh owner boundary with canonical evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The latest representative is red with publication ACK and priority recovery satisfied, but active-gate snapshot coverage remains 2/5 and the selected admin-ready snapshot exposes only one durable published node plus one additional owner-truth node.",
    "crossBoundaryReview": "Pending fresh review subagent for predecessor work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md before implementation starts."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative after priority recovery workflow-progress proof",
    "phaseChain": [
      "publication acknowledgement convergence",
      "priority recovery operation workflow progress",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with snapshotCoverage=2/5 after publication ACK and priority recovery are satisfied.",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited active-gate no-progress",
      "membership epoch, failure repair intent, rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain downstream"
    ],
    "missingCausalEdge": "Selected control snapshot coverage must derive expected nodes and observed nodes from the current owner-truth active cohort after publication and priority recovery are satisfied.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused proof must show a bounded reconcile, repair, projection, refresh, or owner-boundary migration for selected active-gate snapshot coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "Representative rolling-restart should move selected snapshot coverage beyond 2/5, reach active-gate readiness, or migrate to a narrower owner boundary with canonical evidence.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused owner proof, and one representative rolling-restart rerun",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, record the exact selected snapshot source, missing node ids, publication state, and owner truth field that fails to widen.",
    "expectedNextFrontier": "representative-green, startup readiness support, or a narrower startup_active_gate_owner selected-snapshot owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md"
}
-->

## Why

Publication ACK and the original priority recovery workflow-progress residual
are satisfied in the latest representative rerun. The current blocker is again
active-gate snapshot coverage: the selected admin-ready snapshot exposes only
two of five expected nodes even though priority recovery no longer fronts the
causal chain.

This package owns the next active-gate snapshot coverage repair or a fresh
owner-boundary migration if the selected snapshot is blocked by another owner.

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

- [ ] Review subagent recorded:
      `pending-review-subagent`.
- [ ] Fix subagent recorded or explicitly not needed:
      `pending-review-result`.
- [ ] Implementation subagent recorded:
      `pending-before-implementation-resumes`.

## In Scope

1. work/packages/active-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md
2. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. src/admin/admin-control-snapshot-class-part-1.js
6. src/admin/admin-control-snapshot-class-part-3.js
7. src/admin/admin-control-snapshot-class-part-5.js
8. src/control-plane/active-node-projection.js
9. src/control-plane/membership-publication-planning.js
10. src/control-plane/membership-publication-coordinator-class-stage-2.js
11. test/admin/admin-control-snapshot.test.js
12. test/control-plane/membership-publication-coordinator-main-stage-1.js
13. test/control-plane/membership-publication-coordinator-main-stage-3.js
14. test/distributed/harness/cluster-segment-7-class-4.js
15. test/distributed/harness/cluster-segment-7-class-5.js
16. test/distributed/harness/__tests__/cluster.test-part-5.js

## Out Of Scope

1. operation workflow runtime changes unless fresh evidence delegates back downward
2. harness timeout increases
3. Pro behavior
4. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/control-plane/active-node-projection.js`, `src/control-plane/membership-publication-planning.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `test/admin/admin-control-snapshot.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-1.js`, `test/control-plane/membership-publication-coordinator-main-stage-3.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`
- Forbidden files: `operation workflow runtime changes unless fresh evidence delegates back downward`, `harness timeout increases`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
4. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
