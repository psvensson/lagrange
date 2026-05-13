# Topology Active Gate Snapshot Coverage Repair

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_coverage_incomplete",
  "currentState": "Readiness support has reduced to inherited active-gate no-progress. The current representative first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with snapshotCoverage=1/5, active=0/5, publication=PUBLISHED, publishedActive=1/5, missingPublished=4, priorityRecovery=none.",
  "nextAction": "Repair active-gate snapshot coverage so selected snapshots include current owner truth for all active or recently admitted nodes, or produce a fresh bounded owner migration.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260513-topology-active-gate-snapshot-coverage-repair.md",
    "work/packages/done-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-readiness-stalled-support.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/membership-publication-planning.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-control-snapshot-response-contract.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-readiness-stalled-support.md",
    "test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/membership-publication-planning.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-topology-active-gate-snapshot-coverage-repair.md",
    "work/packages/done-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-readiness-stalled-support.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/membership-publication-planning.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-control-snapshot-response-contract.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
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
    "hypothesis": "If active-gate snapshot coverage owns the current frontier, selected control snapshots must include owner truth for durable published, locally projected, and recently admitted active nodes instead of collapsing coverage to one durable publication row.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage either converges, reduces to a bounded startup_active_gate_owner sub-boundary, or migrates to a fresh publication/membership owner boundary with canonical evidence instead of remaining snapshotCoverage=1/5 from presentation publication only.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The latest representative remains red: active_gate_snapshot_coverage is first frontier with snapshotCoverage=1/5, active=0/5, publication=PUBLISHED, publishedActive=1/5, and missingPublished=4. Readiness support is already reduced to inherited active-gate no-progress.",
    "crossBoundaryReview": "Review subagent Curie (019e2348-bb34-72a2-80cd-febb1473fb0c) found predecessor metadata fixes. Fix subagent Averroes (019e234a-71d7-7780-b605-8d3d4682fc7e) repaired the predecessor commit ledger and current-blocker handoff before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative report after readiness support reduction",
    "phaseChain": [
      "startup active-gate snapshot coverage",
      "membership publication projection/convergence",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with dominant reason snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "membership epoch, durable failure repair intents, post-rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain queued behind the current representative frontier"
    ],
    "missingCausalEdge": "Active-gate selected snapshot coverage must derive coverage from canonical owner truth that includes durable publication plus projected/locally eligible or recently admitted members, or name the exact publication/membership owner blocker that prevents that truth from widening.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "pending before focused implementation proof and representative rerun; proof must cover the active-gate bounded reconcile/timeout path instead of treating snapshot coverage as unbounded waiting",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json",
    "expectedObservableTransition": "Focused proof should make selected snapshot coverage include the current owner-truth active cohort, or produce a fresh narrower owner-boundary migration with canonical evidence.",
    "maxProgressBound": "one review subagent, one fix subagent because review found fixes, one implementation subagent, focused owner proof, and representative rerun",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier after focused proof, the package must record why coverage is still bounded and which exact owner value is missing.",
    "expectedNextFrontier": "representative-green or a narrower publication/membership owner-boundary handoff",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260513-topology-readiness-stalled-support.md"
}
-->

## Why

Readiness support has been reduced to inherited active-gate no-progress. The
remaining representative frontier is active-gate snapshot coverage: the selected
snapshot is admin-ready but only exposes one observed/published node while the
harness expects five. This package owns the active-gate coverage repair or the
fresh owner-boundary migration if coverage is blocked by publication or
membership truth.

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
      `Agent Curie (019e2348-bb34-72a2-80cd-febb1473fb0c) reviewed
      work/packages/done-20260513-topology-readiness-stalled-support.md;
      result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Averroes (019e234a-71d7-7780-b605-8d3d4682fc7e) fixed
      work/packages/done-20260513-topology-readiness-stalled-support.md`.
- [ ] Implementation subagent recorded:
      `pending-before-implementation`.

## In Scope

1. work/packages/active-20260513-topology-active-gate-snapshot-coverage-repair.md
2. work/packages/done-20260513-topology-active-gate-owner-truth.md
3. work/packages/done-20260513-topology-readiness-stalled-support.md
4. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
5. work/sprints/current-blocker.json
6. work/sprints/current-blocker.md
7. src/admin/admin-control-snapshot-class-part-1.js
8. src/admin/admin-control-snapshot-class-part-3.js
9. src/admin/admin-control-snapshot-class-part-5.js
10. src/control-plane/membership-publication-planning.js
11. test/admin/admin-control-snapshot.test.js
12. test/admin/admin-control-snapshot-response-contract.test.js
13. test/control-plane/membership-publication-coordinator-main-stage-1.js
14. test/control-plane/membership-publication-coordinator-main-stage-3.js
15. test/distributed/harness/cluster-segment-7-class-5.js
16. test/distributed/harness/__tests__/cluster.test-part-5.js

## Out Of Scope

1. harness timeout increases
2. priority-recovery runtime changes without fresh first-frontier evidence
3. publication-convergence implementation without fresh first-frontier evidence
4. Pro behavior
5. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260513-topology-active-gate-snapshot-coverage-repair.md`, `work/packages/done-20260513-topology-active-gate-owner-truth.md`, `work/packages/done-20260513-topology-readiness-stalled-support.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/control-plane/membership-publication-planning.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/admin-control-snapshot-response-contract.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-1.js`, `test/control-plane/membership-publication-coordinator-main-stage-3.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`
- Forbidden files: `harness timeout increases`, `priority-recovery runtime changes without fresh first-frontier evidence`, `publication-convergence implementation without fresh first-frontier evidence`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json --explain active_gate_snapshot_coverage
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json
4. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-readiness-stalled-support.report.json
