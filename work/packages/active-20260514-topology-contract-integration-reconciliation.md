# Topology Contract Integration Reconciliation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "contract_integration_reconcile",
  "dominantReason": "focused_contracts_not_integrated_by_scenario",
  "currentState": "Activated after rebalance disruption recovery gate migration. All promoted failure gates have executable observe/classify artifacts or completed harness mapping, but the latest rebalance gate still migrated before its owner boundary to topology_publication_owner / publication_convergence with missing_published_nodes_present, publicationStatus=PUBLISHED, pendingAckCount=0, missingPublishedCount=6, publicationPending=true, activeGateState=ready, snapshotCoverageNodeCount=2/7, activeNodeCount=7/7, and zero priority recovery witnesses. Focused contracts still need one integration reconciliation before final ship confirmation.",
  "nextAction": "Run a focused integration reconciliation across the focused contracts and latest gate evidence. Record ready-for-ship-gate only if the chain is coherent; otherwise record the exact owner-boundary blocker. Do not fix rolling-restart, publication, active-gate, or rebalance runtime behavior without explicit re-scope.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run work:evidence-summary -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown",
    "npm run analyze:owner-files -- topology_control_plane contract_integration_reconcile --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-contract-integration-reconciliation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-membership-epoch-fencing.md",
    "work/packages/done-20260513-topology-failure-repair-intents.md",
    "work/packages/done-20260513-topology-post-rejoin-reconciliation.md",
    "work/packages/done-20260513-topology-partition-descriptor-epoch.md",
    "work/packages/done-20260513-topology-placement-capacity-fail-closed.md",
    "work/packages/done-20260513-topology-anti-entropy-reconciler.md",
    "work/packages/done-20260513-topology-bounded-progress-budgets.md",
    "work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/topology-owner-constants.js",
    "src/topology/topology-anti-entropy-reconciler.js",
    "src/control-plane/membership-epoch-contract.js",
    "src/control-plane/rejoin-reconciliation-contract.js",
    "src/node/failure-repair-intent-contract.js",
    "src/partition/partition-descriptor-epoch-contract.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-contract-integration-reconciliation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
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
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Keep the representative residual live while contract integration classifies whether focused topology contracts are ready for final ship confirmation or must point at a narrower owner-boundary blocker."
  },
  "causalGovernance": {
    "hypothesis": "topology_control_plane / contract_integration_reconcile evidence should reduce, migrate, or classify focused_contracts_not_integrated_by_scenario without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "focused_contracts_not_integrated_by_scenario becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until topology_control_plane / contract_integration_reconcile is classified, the sprint representative rolling-restart residual stays open. Latest gate evidence still names topology_publication_owner / publication_convergence before final ship proof; runtime fixes remain out of scope.",
    "crossBoundaryReview": "Required before closure through the causal-escalation subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / topology_control_plane / contract_integration_reconcile",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_control_plane / contract_integration_reconcile focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier topology_control_plane / contract_integration_reconcile; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_control_plane / contract_integration_reconcile causal edge for focused_contracts_not_integrated_by_scenario",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "boundedProgressProof": "Focused evidence must show the cross-contract chain is bounded and diagnosable, or classify the first owner boundary that prevents final ship confirmation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "focused_contracts_not_integrated_by_scenario resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_control_plane / contract_integration_reconcile active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "ready-for-ship-gate or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "classification-only-stop"
  }
}
-->

## Why

The former sprint produced focused contracts for membership epoch fencing,
failure repair intents, post-rejoin reconciliation, partition descriptor epoch,
placement capacity fail-closed behavior, anti-entropy, and bounded progress
budgets. Focused contracts can still fail when composed. The current
representative artifact proves at least one composition gap remains.

This package owns the integration reconciliation step: verify that the focused
contracts form one coherent topology control-plane model before final ship
confirmation.

## Scope Basis

AGPL topology convergence closure. This package is causal reconciliation first:
it reads focused contract outputs, latest representative evidence, and owner
file maps to identify composition gaps. It may split runtime work, but should
not silently widen into all topology owners.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: it reconciles existing contracts and evidence to
  decide whether the sprint can proceed to final gate or needs a narrower owner
  package. In this sprint segment it records classification and handoff state
  only unless explicitly re-scoped.
- Escalation trigger to a heavier lane: reconciliation requires runtime edits
  to a shared topology contract or representative evidence changes first
  frontier.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Re-read focused contract packages named in handoff files.
2. Run evidence summary, causal model, and owner-file analysis for
   `topology_control_plane / contract_integration_reconcile`.
3. Build an integration matrix across epoch, failure repair, rejoin,
   descriptor, placement, anti-entropy, budget, publication, active gate, and
   operation workflow contracts.
4. Identify duplicate authorities, missing handoffs, event-only waits,
   unbounded budgets, stale cache authority, and local fallback repairs.
5. Record the exact owner-boundary package required when a composition gap is
   found.
6. Record a final `ready-for-ship-gate` or `blocked-by-owner-boundary` decision.

## Out Of Scope

1. new-feature-scope
2. pro-or-enterprise-behavior
3. Broad runtime refactors across multiple topology owners in one package.
4. Closing the sprint without final rolling-restart and failure-gate evidence.
5. Runtime repair for rolling-restart, publication convergence, active-gate
   snapshot coverage, or rebalance behavior.

## Integration Matrix

The reconciliation must explicitly cover:

1. Membership/topology epoch: boot, join, rejoin, failure detection, placement,
   active-gate checks, and rebalancer decisions carry/compare one generation.
2. Failure repair intents: failure detection creates durable owner-key work and
   consumers acknowledge or retry.
3. Post-rejoin reconciliation: local services, durable partition map, replica
   operations, handoffs, and active admission are ordered.
4. Partition descriptors: split/rebalance/routing consume a central versioned
   descriptor.
5. Placement capacity: release/production mode fails closed or records explicit
   degraded placement reason.
6. Anti-entropy: reconciler compares durable truth and enqueues exact owner-key
   work only.
7. Budgets: every critical owner wait has finite retry window, next-attempt,
   attempt count, and terminal degraded classification.
8. Publication and active gate: durable owner truth, not cache publication,
   controls active convergence.
9. Operation workflow: remote handoff and coordinator-created operations never
   finish in event-only wait.

## Owner Contract To Prove

`topology_control_plane` is ready for final ship confirmation only if each
focused contract has one authority and all cross-owner handoffs are durable,
epoch-fenced, bounded, and diagnosable from owner decision snapshots.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-contract-integration-reconciliation.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/rebalancer/topology-owner-constants.js`, `src/topology/topology-anti-entropy-reconciler.js`, `src/control-plane/membership-epoch-contract.js`, `src/control-plane/rejoin-reconciliation-contract.js`, `src/node/failure-repair-intent-contract.js`, `src/partition/partition-descriptor-epoch-contract.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a causal-escalation package.

1. [x] Review subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-contract-integration-reconciliation-review
2. [x] Fix subagent recorded or explicitly not needed:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-contract-integration-reconciliation-fix
3. [x] Implementation subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-contract-integration-reconciliation-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-contract-integration-reconciliation.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `new-feature-scope`, `pro-or-enterprise-behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run work:evidence-summary -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`, `npm run analyze:topology-convergence -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown`, `npm run analyze:owner-files -- topology_control_plane contract_integration_reconcile --markdown`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-contract-integration-reconciliation.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-contract-integration-reconciliation.md
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
5. npm run work:evidence-summary -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
6. npm run analyze:topology-convergence -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
7. npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
8. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown
9. npm run analyze:owner-files -- topology_control_plane contract_integration_reconcile --markdown
10. node scripts/check-guideline-literals.js src/rebalancer/topology-owner-constants.js src/topology/topology-anti-entropy-reconciler.js src/control-plane/membership-epoch-contract.js src/control-plane/rejoin-reconciliation-contract.js src/node/failure-repair-intent-contract.js src/partition/partition-descriptor-epoch-contract.js
11. node scripts/check-guideline-decision-boundaries.js src/rebalancer/topology-owner-constants.js src/topology/topology-anti-entropy-reconciler.js src/control-plane/membership-epoch-contract.js src/control-plane/rejoin-reconciliation-contract.js src/node/failure-repair-intent-contract.js src/partition/partition-descriptor-epoch-contract.js
12. npm run audit:runtime-grammar:file -- src/rebalancer/topology-owner-constants.js src/topology/topology-anti-entropy-reconciler.js src/control-plane/membership-epoch-contract.js src/control-plane/rejoin-reconciliation-contract.js src/node/failure-repair-intent-contract.js src/partition/partition-descriptor-epoch-contract.js
13. npm run work:validate -- --entry work/packages/active-20260514-topology-contract-integration-reconciliation.md
14. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-contract-integration-reconciliation.md
15. npm run work:validate -- --closure work/packages/active-20260514-topology-contract-integration-reconciliation.md
16. git diff --check -- work/packages/active-20260514-topology-contract-integration-reconciliation.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
17. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If one owner contract is missing or incoherent, split to that owner boundary.
2. If two owners claim authority for the same decision, split a shared contract
   package before final gate.
3. If evidence is stale, split to residual evidence inventory or rerun package.
4. If all contracts compose, activate the final ship gate package.

## Acceptance Criteria

1. Integration matrix is filled with pass/blocker for every contract area.
2. No event-only wait, cache-authority convergence, unbounded budget, or local
   fallback repair remains unowned.
3. Active sprint records either `ready-for-ship-gate` or exact package to run
   next.

## Commit And Push Ledger

Required at closure if this package edits package/sprint state.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
