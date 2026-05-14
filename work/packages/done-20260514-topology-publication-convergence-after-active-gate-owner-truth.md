# Topology Publication Convergence After Active Gate Owner Truth

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Focused publication evidence proof now preserves active-gate best publication owner truth across timeout samples. The refreshed representative rerun marks publication_ack_convergence satisfied with publicationStatus=PUBLISHED, pendingAckCount=0, publishedActive=1/5, and exact missingPublishedNodeIds for the remaining four nodes.",
  "nextAction": "Close this publication-convergence package by owner-boundary migration; continue with startup_active_gate_owner / snapshot_coverage because the current first frontier is active_gate_snapshot_coverage with snapshotCoverage=2/5.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
    "test/control-plane/membership-publication-coordinator-tail-final-test-cases.js",
    "test/control-plane/membership-publication-coordinator-tail-more-test-cases.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/admin/admin-control-snapshot-class-part-3.js"
  ],
  "commitScope": [
    "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/control-plane/membership-publication-coordinator-main-stage-1.js",
    "test/control-plane/membership-publication-coordinator-main-stage-3.js",
    "test/control-plane/membership-publication-coordinator-tail-final-test-cases.js",
    "test/control-plane/membership-publication-coordinator-tail-more-test-cases.js",
    "test/admin/admin-control-snapshot.test.js",
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
    "hypothesis": "If topology_publication_owner / publication_convergence owns the current first frontier, the publication owner must publish or retain the owner-truth active cohort after recovery-active projection, or report the exact publication-owner blocker instead of surfacing steady_published with five missing published nodes.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "publication_ack_convergence either converges, reduces to a narrower publication-owner sub-boundary, or migrates to a fresh owner boundary with canonical evidence.",
    "representativeOutcome": "migrated",
    "causalDebt": "The refreshed representative remains red, but publication_ack_convergence is no longer the first frontier. It is satisfied with publicationStatus=PUBLISHED, pendingAckCount=0, publishedActive=1/5, missingPublishedCount=4, and exact missingPublishedNodeIds; canonical evidence now fronts active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with snapshotCoverage=2/5.",
    "crossBoundaryReview": "Review was clean before implementation: Agent Turing (019e24e2-7286-7553-b37e-7fe479265da5) reviewed the predecessor package; Agent Wegener (019e24e5-bcdb-7e81-a11e-fa5a05a26ec3) implemented this publication-convergence package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative after active-gate owner-truth proof",
    "phaseChain": [
      "publication acknowledgement convergence",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with snapshot_coverage_incomplete after publication convergence satisfied.",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate snapshot coverage with no-progress terminal evidence",
      "membership epoch, failure repair intent, rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain downstream"
    ],
    "missingCausalEdge": "Publication convergence must connect recovery owner truth and published active membership so steady_published does not leave all five expected active nodes missing.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence",
    "boundedProgressProof": "Focused publication evidence proof preserves active-gate best publication owner truth after a timeout sample; representative rolling-restart rerun marks publication_ack_convergence satisfied and migrates first frontier to active_gate_snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "Observed: publication_ack_convergence is satisfied and active_gate_snapshot_coverage is the current first frontier with snapshotCoverage=2/5.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused owner proof, and one representative rolling-restart rerun",
    "sameFrontierFallback": "not used; publication_ack_convergence is no longer the first representative frontier.",
    "expectedNextFrontier": "startup active-gate snapshot coverage or representative-green after active-gate repair",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Representative rolling-restart marks publication_ack_convergence satisfied and selects active_gate_snapshot_coverage as the first frontier.",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  },
  "predecessor": "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md"
}
-->

## Why

The previous representative stopped at publication acknowledgement convergence:
publication reported no pending ACKs, but the publication owner had no
published active nodes and all five expected active nodes remained missing.

This package preserved the active-gate best publication owner-truth snapshot
across timeout samples. The refreshed representative now marks publication
convergence satisfied and migrates the first frontier back to active-gate
snapshot coverage.

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

## Implementation Notes

- Raw artifact fallback used after `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence`, and `npm run analyze:owner-files -- topology_publication_owner publication_convergence`; reason: canonical extractor output did not expose the embedded active-gate `progress` versus `bestProgress` publication evidence split needed to identify why the current timeout sample erased the exact published/missing owner-truth cohort.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Turing (019e24e2-7286-7553-b37e-7fe479265da5) reviewed work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md; result clean`.
- [x] Fix subagent recorded or explicitly not needed:
      `not-needed`.
- [x] Implementation subagent recorded:
      `Agent Wegener (019e24e5-bcdb-7e81-a11e-fa5a05a26ec3) implemented work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md`.

## In Scope

1. work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md
2. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. work/model-ledger.jsonl
6. src/control-plane/membership-publication-planning.js
7. src/control-plane/membership-publication-coordinator-class-stage-2.js
8. src/control-plane/publication-owner-decision.js
9. src/control-plane/publication-owner-evidence.js
10. src/control-plane/publication-owner-state.js
11. src/control-plane/publication-recovery-evidence.js
12. src/control-plane/publication-recovery-gate.js
13. src/admin/admin-control-snapshot-class-part-3.js
14. test/control-plane/membership-publication-coordinator-main-stage-1.js
15. test/control-plane/membership-publication-coordinator-main-stage-3.js
16. test/control-plane/membership-publication-coordinator-tail-final-test-cases.js
17. test/control-plane/membership-publication-coordinator-tail-more-test-cases.js
18. test/admin/admin-control-snapshot.test.js

## Out Of Scope

1. harness timeout increases
2. operation workflow runtime changes unless publication evidence delegates back downward
3. Pro behavior
4. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `work/model-ledger.jsonl`, `src/control-plane/membership-publication-planning.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-state.js`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-recovery-gate.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `test/control-plane/membership-publication-coordinator-main-stage-1.js`, `test/control-plane/membership-publication-coordinator-main-stage-3.js`, `test/control-plane/membership-publication-coordinator-tail-final-test-cases.js`, `test/control-plane/membership-publication-coordinator-tail-more-test-cases.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `harness timeout increases`, `operation workflow runtime changes unless publication evidence delegates back downward`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`
- Model ledger advisory: `escalate`

## Validation

1. `npm run work:validate -- --closure work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md` passed before package migration.
2. `npx tap test/control-plane/membership-publication-coordinator-main-stage-1.js test/control-plane/publication-recovery-evidence.test.js` passed.
3. `npx tap test/admin/admin-control-snapshot.test.js --grep "canonical publication evidence retains active-gate best"` passed.
4. `node scripts/check-guideline-literals.js src/control-plane/publication-recovery-evidence.js src/admin/admin-control-snapshot-class-part-3.js` passed.
5. `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-evidence.js src/admin/admin-control-snapshot-class-part-3.js` passed.
6. `npm run audit:runtime-grammar:file -- src/control-plane/publication-recovery-evidence.js src/admin/admin-control-snapshot-class-part-3.js` passed.
7. `git diff --check -- src/control-plane/publication-recovery-evidence.js test/admin/admin-control-snapshot.test.js work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md` passed before package migration.
8. Representative rolling-restart rerun completed red by migration: first frontier `active_gate_snapshot_coverage`, owner `startup_active_gate_owner`, boundary `snapshot_coverage`, dominant reason `snapshot_coverage_incomplete`.
9. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json` confirms the migrated frontier.
10. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence` confirms publication convergence is satisfied with `publicationStatus=PUBLISHED`, `pendingAckCount=0`, `publishedActive=1/5`, and `missingPublishedCount=4` with exact node ids.
11. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json` confirms `active_gate_snapshot_coverage` as the first critical path node.
12. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json` confirms `publication=PUBLISHED`, `pendingAck=0`, `missingPublished=4`, and exact `missingPublishedIds`.
13. `npm run work:model-ledger -- record --package work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md --model gpt-5.3-codex --reasoning-effort high --task-class distributed-runtime --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason migrated-to-active-gate-snapshot-coverage --outcome migrated --validation-status focused-green-representative-migrated --correction-loops 1 --review-findings 0 --notes ...` recorded the package experience.

## Commit And Push Ledger

1. Focused package commit: ac2f1a34c1cbb032507ffd5d085fb5d850017b6c
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
