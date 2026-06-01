# Topology Failure Scenario Gates

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "failure-gate-matrix",
  "artifact": "none",
  "playback": "none",
  "owner": "distributed_test_harness",
  "boundary": "failure_gate_matrix",
  "dominantReason": "missing_failure_detection_rebalance_gate_coverage",
  "currentState": "Human-directed sprint-queue pivot to focused failure-gate coverage after owner proof. The latest representative rolling-restart artifact still fronts startup_active_gate_owner / snapshot_coverage with snapshot_coverage_incomplete; this package is a coverage-gate handoff, not a runtime first-frontier fix.",
  "nextAction": "Promote join rejoin failure remote handoff and rebalance disruptions into focused release gates while preserving active-gate snapshot coverage as the current representative runtime frontier.",
  "proof": [
    "npm run analyze:owner-files -- distributed_test_harness failure_gate_matrix --markdown",
    "npx tap test/distributed/harness/__tests__/scenario-registry.test.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "node scripts/check-guideline-literals.js test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js",
    "node scripts/check-guideline-decision-boundaries.js test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js",
    "git diff --check -- test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/scenario-registry.js test/distributed/harness/__tests__/scenario-registry.test.js work/packages/done-20260513-topology-failure-scenario-gates.md work/sprints/active-2026-q2-topology-convergence-ship-shape.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/model-ledger.jsonl"
  ],
  "writeScope": [
    "test/distributed/harness/topology-failure-gate-matrix.js",
    "test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "test/distributed/harness/scenario-registry.js",
    "test/distributed/harness/__tests__/scenario-registry.test.js",
    "work/packages/done-20260513-topology-failure-scenario-gates.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-bounded-progress-budgets.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "test/distributed/harness/topology-failure-gate-matrix.js",
    "test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "test/distributed/harness/scenario-registry.js",
    "test/distributed/harness/__tests__/scenario-registry.test.js",
    "work/packages/done-20260513-topology-failure-scenario-gates.md",
    "work/packages/done-20260513-topology-failure-scenario-gates.md",
    "work/packages/todo-20260513-topology-failure-scenario-gates.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "hypothesis": "If distributed_test_harness / failure_gate_matrix owns the final sprint gate, the harness must expose a canonical topology failure gate matrix that maps failure detection, join, rejoin, remote handoff, stale publication, and rebalance disruption scenarios to expected durable owner outcomes instead of leaving coverage implicit in broad distributed runs.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "No representative rolling-restart causal-model change is claimed by this handoff. Scenario gate coverage becomes an explicit matrix with missing runtime failures split into follow-on owner-boundary packages rather than patched inside this package.",
    "representativeOutcome": "classification-only",
    "causalDebt": "No representative failure-gate artifact is recorded yet. The latest rolling-restart artifact still fronts startup_active_gate_owner / snapshot_coverage with snapshot_coverage_incomplete and unbounded active_gate_timeout; this package first creates the focused matrix and proof surface by human direction.",
    "crossBoundaryReview": "Review subagent Codex (019e25d8-a64b-7363-ab65-ef787e5a3fb9) reviewed work/packages/done-20260513-topology-bounded-progress-budgets.md and found fixes required; fix subagent Codex (019e25dd-ec25-7de3-ac1a-4beb4ed7ac8a) fixed the reviewed bounded-progress package handoff and reconciled this active package before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "failure-gate-matrix focused harness probe",
    "phaseChain": [
      "failure detection repair intent",
      "join and rejoin reconciliation",
      "remote handoff acknowledgement",
      "publication truth ahead of projection",
      "split and rebalance disruption recovery"
    ],
    "currentFirstFrontier": "The current representative rolling-restart first frontier remains active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with snapshot_coverage_incomplete. This package is a human-directed sprint-queue pivot to distributed_test_harness / failure_gate_matrix coverage after owner proof, not a representative owner-boundary migration.",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains the representative runtime frontier with active_gate_timeout still unbounded",
      "runtime fixes discovered by new gates are out of scope for this package",
      "full distributed scenario reruns remain downstream of focused matrix proof"
    ],
    "missingCausalEdge": "The canonical scenario registry does not yet declare which topology failure gates are required for ship-shape closure or which owner outcome each gate must prove.",
    "missingCausalEdgeProbe": "npx tap test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "boundedProgressProof": "Focused matrix tests must prove every required gate names at least one bounded progress mechanism from wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, advance, or bounded progress.",
    "boundedProgressProofArtifact": "test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "expectedObservableTransition": "Focused harness tests expose a complete topology failure gate matrix and fail if any required gate lacks a canonical scenario, config, owner, boundary, or expected durable outcome.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused harness proof, and no runtime edits",
    "sameFrontierFallback": "If canonical representative evidence is rechecked before failure-gate implementation, keep startup_active_gate_owner / snapshot_coverage as the runtime first frontier unless fresh evidence proves otherwise.",
    "expectedNextFrontier": "focused failure-gate execution, a fresh runtime owner-boundary package if a gate exposes behavior debt, or return to startup_active_gate_owner / snapshot_coverage if the human-directed coverage pivot is paused",
    "resultClassification": "classification-only",
    "stopCondition": "human-escalation"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "distributed_test_harness",
    "toBoundary": "failure_gate_matrix",
    "reason": "No representative owner-boundary migration occurred. The user explicitly directed the sprint to continue by promoting focused failure-gate coverage after owner proof while the latest representative artifact still fronts active_gate_snapshot_coverage; this package is a coverage-gate handoff, not runtime first-frontier closure.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260513-topology-bounded-progress-budgets.md",
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The runtime contracts in this sprint need release gates that exercise the
failure paths directly. This package owns the focused scenario matrix that
proves failure detection, rejoin, remote handoff, and rebalance disruptions
converge through durable owner outcomes.

This package does not claim the representative rolling-restart first frontier
has moved. The latest canonical evidence still names
`startup_active_gate_owner / snapshot_coverage` with
`snapshot_coverage_incomplete`. The user-directed move to this package is a
sprint-queue coverage-gate pivot after focused owner proof, so implementation
must not record representative green or patch active-gate runtime behavior in
this package.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package targets scenario gate coverage and
  must not implement runtime fixes discovered by those gates.
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

1. Promote focused gates for rolling restart, killed join, killed rejoin,
   killed replica-operation coordinator, missed remote handoff ACK, stale
   publication with durable truth ahead, and split/rebalance during node
   recovery.
2. Assert durable convergence, owner reasons, and epoch/fencing where
   applicable.
3. Update this package metadata before activation with exact write scope,
   generated files, commit scope, and required subagent proof.

## Out Of Scope

1. Runtime fixes discovered by the gates; those must become separate packages.
2. Harness timeout stretching without owner proof.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `test/distributed/harness/topology-failure-gate-matrix.js`,
  `test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`,
  `test/distributed/harness/scenario-registry.js`,
  `test/distributed/harness/__tests__/scenario-registry.test.js`,
  `work/packages/done-20260513-topology-failure-scenario-gates.md`,
  `work/model-ledger.jsonl`
- Forbidden files: runtime files unless a gate exposes a fresh owner-boundary
  runtime package; this package should own harness/test definitions.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/distributed/harness/__tests__/scenario-registry.test.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Codex (019e25d8-a64b-7363-ab65-ef787e5a3fb9) reviewed work/packages/done-20260513-topology-bounded-progress-budgets.md; result fixes-required`
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Codex (019e25dd-ec25-7de3-ac1a-4beb4ed7ac8a) fixed work/packages/done-20260513-topology-bounded-progress-budgets.md`.
      Successor handoff fix result:
      `Agent Codex (019e25dd-ec25-7de3-ac1a-4beb4ed7ac8a) fixed work/packages/done-20260513-topology-failure-scenario-gates.md`.
- [x] Implementation subagent recorded:
      `Agent Kepler (019e25e4-14bb-7432-9d0b-6c100f0bb2c9) implemented work/packages/done-20260513-topology-failure-scenario-gates.md`

## Validation

1. `npm run work:context` passed and confirmed this package as the current
   blocker after activation.
2. `npm run work:llm-start` passed and identified missing scope,
   causal-governance, scenario-closure, and subagent proof fields.
3. `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260513-topology-failure-scenario-gates.md`
   passed and confirmed the missing proof fields before metadata repair.
4. `npm run analyze:owner-files -- distributed_test_harness failure_gate_matrix --markdown`
   passed and showed no existing runtime owner file for this matrix.
5. Fix subagent ran
   `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`,
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`,
   and
   `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`;
   these confirm the representative first frontier remains
   `startup_active_gate_owner / snapshot_coverage` with
   `snapshot_coverage_incomplete`, and the causal budget inventory still
   reports `unboundedCount: 2` including `active_gate_timeout`.
6. Implementation subagent Kepler
   (`019e25e4-14bb-7432-9d0b-6c100f0bb2c9`) added the focused topology
   failure gate matrix and registry surface only. No runtime files were
   edited, no full distributed scenarios were run, and this proof does not
   claim representative rolling-restart green or a runtime first-frontier
   migration.
7. `npm run analyze:owner-files -- distributed_test_harness failure_gate_matrix --markdown`
   passed and kept the owner surface limited to the active package and sprint
   handoff files.
8. `npx tap test/distributed/harness/__tests__/scenario-registry.test.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`
   passed with 13/13 focused tests. The matrix now exposes failure detection,
   join, rejoin, remote handoff, stale publication, and rebalance disruption
   gates with canonical config/scenario pairs, owners, boundaries, durable
   outcomes, owner reasons, epoch/fencing requirements, and bounded progress
   mechanisms.
9. `node scripts/check-guideline-literals.js test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js`
   passed with 0 new literal-guideline violations.
10. `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js`
    passed with 0 decision-boundary guideline violations.
11. `npm run audit:runtime-grammar:file -- test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/scenario-registry.js`
    passed with 0 runtime-grammar-contract violations.
12. `git diff --check -- test/distributed/harness/topology-failure-gate-matrix.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/scenario-registry.js test/distributed/harness/__tests__/scenario-registry.test.js work/packages/done-20260513-topology-failure-scenario-gates.md work/sprints/active-2026-q2-topology-convergence-ship-shape.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/model-ledger.jsonl`
    passed before final package and model-ledger notes were recorded.
13. `npm run work:model-ledger -- record --package work/packages/done-20260513-topology-failure-scenario-gates.md --model gpt-5.3-codex --reasoning-effort high --task-class implementation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason none --outcome implemented --validation-status focused-green --correction-loops 1 --review-findings 1 --notes "..."`
    recorded the final coverage-gate implementation evidence.

## Commit And Push Ledger

1. Focused package commit: f9362f6e
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
