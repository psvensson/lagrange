# Topology Active Gate Snapshot Coverage After Publication Owner Truth

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_coverage_incomplete",
  "currentState": "Publication convergence is satisfied after preserving active-gate best publication owner truth; the representative rolling-restart now fronts active_gate_snapshot_coverage with snapshotCoverage=2/5, expectedNodeCount=5, publicationStatus=PUBLISHED, pendingAckCount=0, and priorityRecovery=none.",
  "nextAction": "Repair active-gate snapshot coverage so the selected admin-ready snapshot observes the owner-truth active cohort, or migrate to a narrower owner boundary with canonical evidence.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md",
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
    "test/control-plane/active-node-projection.test.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
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
    "src/control-plane/membership-publication-coordinator-class-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md",
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
    "test/control-plane/active-node-projection.test.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
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
    "hypothesis": "If startup_active_gate_owner / snapshot_coverage owns the current first frontier, active-gate selection must observe the owner-truth active cohort after publication convergence is satisfied, or report the exact startup owner blocker for missing snapshot coverage.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage either converges, reduces to a narrower startup active-gate sub-boundary, or migrates to a fresh owner boundary with canonical evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The latest representative is red with active_gate_snapshot_coverage as the first frontier, snapshotCoverage=2/5, expectedNodeCount=5, publicationStatus=PUBLISHED, pendingAckCount=0, publishedActive=1/5, missingPublishedCount=4 with exact ids, and priorityRecovery=none.",
    "crossBoundaryReview": "Required before implementation: review predecessor work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md, fix any predecessor proof issues, then implement this active-gate snapshot-coverage package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative after publication owner-truth proof",
    "phaseChain": [
      "publication acknowledgement convergence",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with snapshot_coverage_incomplete after publication convergence satisfied.",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate snapshot coverage",
      "membership epoch, failure repair intent, rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain downstream"
    ],
    "missingCausalEdge": "Active-gate snapshot coverage must connect the selected admin-ready snapshot and owner-truth active cohort so coverage does not stall at 2/5 after publication convergence is satisfied.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused proof must show the selected admin-ready snapshot advances through the active-gate wake/timeout path to include the owner-truth active cohort, reduce to an exact startup active-gate blocker, or migrate to a fresh owner boundary.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "Representative rolling-restart should move active_gate_snapshot_coverage to satisfied, reduce to a narrower startup active-gate blocker, or migrate to a fresh owner boundary with canonical evidence.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused owner proof, and one representative rolling-restart rerun",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, record snapshotCoverageNodeCount, expectedNodeCount, selectedSnapshotNodeId, selectedSnapshotError, activeNodeCount, and blocker reasons.",
    "expectedNextFrontier": "representative-green, startup readiness support evidence, or a narrower startup active-gate sub-boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md"
}
-->

## Why

Publication convergence is now satisfied, so the remaining critical path is the
selected active-gate snapshot only covering two of five expected nodes. This
package owns the startup active-gate repair or the next canonical owner-boundary
migration.

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
      `pending-before-implementation-starts`.
- [ ] Fix subagent recorded or explicitly not needed:
      `pending-before-review-result`.
- [ ] Implementation subagent recorded:
      `pending-before-implementation-starts`.

## In Scope

1. work/packages/active-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md
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
12. test/control-plane/active-node-projection.test.js
13. test/distributed/harness/cluster-segment-7-class-4.js
14. test/distributed/harness/cluster-segment-7-class-5.js
15. test/distributed/harness/__tests__/cluster.test-part-5.js

## Out Of Scope

1. harness timeout increases
2. publication convergence runtime changes unless fresh evidence delegates back
3. operation workflow runtime changes unless fresh evidence delegates back
4. Pro behavior
5. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/control-plane/active-node-projection.js`, `src/control-plane/membership-publication-planning.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `test/admin/admin-control-snapshot.test.js`, `test/control-plane/active-node-projection.test.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`
- Forbidden files: `harness timeout increases`, `publication convergence runtime changes unless fresh evidence delegates back`, `operation workflow runtime changes unless fresh evidence delegates back`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
4. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
