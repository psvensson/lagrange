# Topology Publication Convergence After Active Gate Owner Truth

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Active-gate owner-truth focused proof widened missing published recovery nodes in control-snapshot projection, and the refreshed representative rerun migrated the first frontier to publication_ack_convergence with missing_published_nodes_present; downstream active-gate snapshot coverage is no longer the first frontier.",
  "nextAction": "Repair publication convergence so the publication owner publishes or retains the owner-truth active cohort, or emits the exact publication-owner blocker while recoveryProtocolState=steady_published and pendingAck=0.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
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
    "work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
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
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The latest representative is red with publication_ack_convergence as the first frontier, publicationStatus=UNKNOWN, pendingAckCount=0, recoveryProtocolState=steady_published, and missingPublishedCount=5. Active-gate snapshot coverage is downstream and includes publication_gate blockers for all five nodes.",
    "crossBoundaryReview": "Required before implementation: review predecessor work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md, fix any predecessor proof issues, then implement this publication-convergence package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative after active-gate owner-truth proof",
    "phaseChain": [
      "publication acknowledgement convergence",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "publication_ack_convergence under topology_publication_owner / publication_convergence with missing_published_nodes_present after active-gate owner-truth proof.",
    "knownDownstreamBlockers": [
      "active-gate snapshot coverage is deferred behind publication convergence with snapshotCoverage=0/5 and selectedSnapshotError=snapshot_timeout",
      "startup readiness support remains inherited from publication and active-gate blockers",
      "membership epoch, failure repair intent, rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain downstream"
    ],
    "missingCausalEdge": "Publication convergence must connect recovery owner truth and published active membership so steady_published does not leave all five expected active nodes missing.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence",
    "boundedProgressProof": "Focused proof must show bounded publication reconcile, publish, retain, reduce, or owner-boundary migration for missing published active nodes.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "Representative rolling-restart should move publication_ack_convergence to satisfied, reduce to a narrower publication-owner blocker, or migrate to a fresh owner boundary with canonical evidence.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused owner proof, and one representative rolling-restart rerun",
    "sameFrontierFallback": "If publication_ack_convergence remains first frontier, record publicationStatus, recoveryProtocolState, pendingAckCount, publishedActiveNodeIds, missingPublishedCount, and missing node ids.",
    "expectedNextFrontier": "representative-green, startup active-gate snapshot coverage, or a narrower topology_publication_owner publication sub-boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md"
}
-->

## Why

The latest representative no longer fronts active-gate snapshot coverage. It
now stops at publication acknowledgement convergence: publication reports no
pending ACKs, but the publication owner has no published active nodes and all
five expected active nodes remain missing.

This package owns that publication-convergence repair or the next canonical
owner-boundary migration.

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

1. work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md
2. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. src/control-plane/membership-publication-planning.js
6. src/control-plane/membership-publication-coordinator-class-stage-2.js
7. src/control-plane/publication-owner-decision.js
8. src/control-plane/publication-owner-evidence.js
9. src/control-plane/publication-owner-state.js
10. src/control-plane/publication-recovery-evidence.js
11. src/control-plane/publication-recovery-gate.js
12. src/admin/admin-control-snapshot-class-part-3.js
13. test/control-plane/membership-publication-coordinator-main-stage-1.js
14. test/control-plane/membership-publication-coordinator-main-stage-3.js
15. test/control-plane/membership-publication-coordinator-tail-final-test-cases.js
16. test/control-plane/membership-publication-coordinator-tail-more-test-cases.js
17. test/admin/admin-control-snapshot.test.js

## Out Of Scope

1. harness timeout increases
2. operation workflow runtime changes unless publication evidence delegates back downward
3. Pro behavior
4. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-publication-convergence-after-active-gate-owner-truth.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/control-plane/membership-publication-planning.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-state.js`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-recovery-gate.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `test/control-plane/membership-publication-coordinator-main-stage-1.js`, `test/control-plane/membership-publication-coordinator-main-stage-3.js`, `test/control-plane/membership-publication-coordinator-tail-final-test-cases.js`, `test/control-plane/membership-publication-coordinator-tail-more-test-cases.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `harness timeout increases`, `operation workflow runtime changes unless publication evidence delegates back downward`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain publication_ack_convergence
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
4. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
5. npm run analyze:owner-files -- topology_publication_owner publication_convergence
