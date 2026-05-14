# Topology Rebalance Disruption Recovery Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "seven-node-load-during-partitioning",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_rebalance_owner",
  "boundary": "split_rebalance_recovery_gate",
  "dominantReason": "rebalance_disruption_release_gate_unproven",
  "currentState": "Partition descriptor epoch placement capacity anti-entropy and bounded-progress contracts have focused proof but split/rebalance during recovery has not been executed as a release gate.",
  "nextAction": "Execute the split/rebalance recovery gate and close gaps in descriptor epoch fencing placement admission drain reconcile and durable placement convergence under node recovery.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-rebalance-disruption-recovery-gate.report.json"
  ],
  "writeScope": [
    "work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-partition-descriptor-epoch.md",
    "work/packages/done-20260513-topology-placement-capacity-fail-closed.md",
    "work/packages/done-20260513-topology-anti-entropy-reconciler.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/partition/partition-descriptor-epoch-contract.js",
    "src/partition/partition-split-routing.js",
    "src/rebalancer/move-planner.js",
    "src/rebalancer/storage-admission-service.js",
    "test/rebalancer/move-planner-placement-owner-kernel.test.js"
  ],
  "commitScope": [
    "work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
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
    "hypothesis": "topology_rebalance_owner / split_rebalance_recovery_gate proof should reduce, migrate, or classify rebalance_disruption_release_gate_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "expectedCausalModelChange": "rebalance_disruption_release_gate_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until topology_rebalance_owner / split_rebalance_recovery_gate is proven, the sprint representative rolling-restart residual stays open at startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "seven-node-load-during-partitioning / topology_rebalance_owner / split_rebalance_recovery_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_rebalance_owner / split_rebalance_recovery_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier topology_rebalance_owner / split_rebalance_recovery_gate; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_rebalance_owner / split_rebalance_recovery_gate causal edge for rebalance_disruption_release_gate_unproven",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for topology_rebalance_owner / split_rebalance_recovery_gate.",
    "boundedProgressProofArtifact": "test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "expectedObservableTransition": "rebalance_disruption_release_gate_unproven resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_rebalance_owner / split_rebalance_recovery_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

Partition descriptor epoch, placement capacity fail-closed behavior, and
anti-entropy have focused proof, but split/rebalance during node recovery has
not been executed as a release gate. This is where stale routing, stale
descriptor versions, capacity gaps, and recovery admission can race in one
scenario.

This package owns the rebalance disruption recovery gate for
`topology_rebalance_owner / split_rebalance_recovery_gate`.

## Scope Basis

AGPL topology convergence items: make partition descriptors versioned and
central, fail closed on placement capacity/accounting uncertainty, add
anti-entropy reconciliation, and promote split/rebalance during recovery to a
release gate.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package is a named seven-node release gate
  with bounded descriptor, routing, move-planner, and admission candidates.
- Escalation trigger to a heavier lane: evidence requires changing membership
  epoch, anti-entropy owner model, or placement capacity policy beyond this
  gate's owner boundary.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Execute `seven-node-load-during-partitioning` as the split/rebalance during
   recovery gate.
2. Verify partition descriptor version/epoch fences stale routing and
   placement decisions.
3. Verify placement admission fails closed or emits explicit degraded reason
   when capacity/accounting is unavailable.
4. Verify anti-entropy enqueues exact owner-key work and does not perform local
   fallback repairs.
5. Verify final durable placement convergence under recovery load.
6. Fix or split any descriptor, placement, anti-entropy, or active admission
   failure.

## Out Of Scope

1. best-effort-production-placement
2. stale-route-success
3. Development-only best-effort behavior as a production gate result.
4. Runtime work unrelated to split/rebalance under recovery.

## Entry Evidence

1. Focused descriptor epoch proof exists.
2. Focused placement capacity fail-closed proof exists.
3. Focused anti-entropy reconciler proof exists.
4. No split/rebalance during recovery artifact currently proves release
   convergence.

## Owner Contract To Prove

`topology_rebalance_owner` must converge placement using durable, versioned
truth. The gate must prove:

1. Partition descriptors carry monotonic version/epoch.
2. Routing and move planning reject stale descriptors.
3. Capacity/accounting uncertainty is strict in release/production mode.
4. Degraded placement reason is explicit when strict placement cannot proceed.
5. Anti-entropy enqueues exact owner-key repair work.
6. Final placement and active publication agree with durable truth.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/partition/partition-descriptor-epoch-contract.js`, `src/partition/partition-split-routing.js`, `src/rebalancer/move-planner.js`, `src/rebalancer/storage-admission-service.js`, `test/rebalancer/move-planner-placement-owner-kernel.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

1. [ ] Review subagent recorded: pending until package activation.
2. [ ] Fix subagent recorded or explicitly not needed: pending until review
   result.
3. [ ] Implementation subagent recorded: pending until pre-implementation proof
   is clean.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`
- Forbidden files: `best-effort-production-placement`, `stale-route-success`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose`, `npm run analyze:distributed-failure -- --report test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md
3. node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose
4. npm run analyze:distributed-failure -- --report test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
5. node scripts/check-guideline-literals.js src/partition/partition-descriptor-epoch-contract.js src/partition/partition-split-routing.js src/rebalancer/move-planner.js src/rebalancer/storage-admission-service.js test/rebalancer/move-planner-placement-owner-kernel.test.js
6. node scripts/check-guideline-decision-boundaries.js src/partition/partition-descriptor-epoch-contract.js src/partition/partition-split-routing.js src/rebalancer/move-planner.js src/rebalancer/storage-admission-service.js test/rebalancer/move-planner-placement-owner-kernel.test.js
7. npm run audit:runtime-grammar:file -- src/partition/partition-descriptor-epoch-contract.js src/partition/partition-split-routing.js src/rebalancer/move-planner.js src/rebalancer/storage-admission-service.js test/rebalancer/move-planner-placement-owner-kernel.test.js
8. npm run work:validate -- --entry work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md
9. npm run work:validate -- --pre-impl work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md
10. npm run work:validate -- --closure work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md
11. git diff --check -- work/packages/todo-20260514-topology-rebalance-disruption-recovery-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md
12. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If descriptor epoch is stale, split to partition descriptor epoch owner.
2. If capacity/accounting is unavailable and placement proceeds, split to
   placement capacity owner.
3. If anti-entropy performs local fallback repair, split to anti-entropy owner.
4. If active publication lags durable placement, split to publication owner.

## Acceptance Criteria

1. Gate artifact proves split/rebalance during recovery converges durably.
2. Analyzer reports no stale route success, best-effort production placement, or
   local fallback repair.
3. Owner evidence names descriptor epoch, capacity/degraded state, reconcile
   work, and final placement publication.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
