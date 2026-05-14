# Topology Rebalance Disruption Recovery Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "seven-node-load-during-partitioning",
  "artifact": "test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
  "playback": "none",
  "owner": "topology_rebalance_owner",
  "boundary": "split_rebalance_recovery_gate",
  "dominantReason": "rebalance_disruption_release_gate_unproven",
  "currentState": "Observed gate result: seven-node-load-during-partitioning failed after 336079ms. Canonical evidence did not reach topology_rebalance_owner / split_rebalance_recovery_gate; the first frontier is topology_publication_owner / publication_convergence with publication_ack_convergence deferred, missing_published_nodes_present, publicationStatus=PUBLISHED, pendingAckCount=0, missingPublishedCount=6, publicationPending=true, activeGateState=ready, snapshotCoverageNodeCount=2/7, and activeNodeCount=7/7. Priority recovery residual extraction reports zero witnesses.",
  "nextAction": "Close this package as migrated/classification evidence and activate contract integration reconciliation; do not fix rolling-restart, publication, or rebalance runtime behavior in this package without explicit re-scope.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-partition-descriptor-epoch.md",
    "work/packages/done-20260513-topology-placement-capacity-fail-closed.md",
    "work/packages/done-20260513-topology-anti-entropy-reconciler.md",
    "work/packages/done-20260514-topology-remote-coordinator-handoff-gate.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/partition/partition-descriptor-epoch-contract.js",
    "src/partition/partition-split-routing.js",
    "src/rebalancer/move-planner.js",
    "src/rebalancer/storage-admission-service.js",
    "test/rebalancer/move-planner-placement-owner-kernel.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md",
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
  "causalGovernance": {
    "hypothesis": "topology_rebalance_owner / split_rebalance_recovery_gate evidence should reduce, migrate, or classify rebalance_disruption_release_gate_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "expectedCausalModelChange": "rebalance_disruption_release_gate_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "The rebalance-disruption gate artifact is red, but canonical evidence does not implicate topology_rebalance_owner / split_rebalance_recovery_gate. The first frontier migrated to topology_publication_owner / publication_convergence with missing_published_nodes_present; runtime rolling-restart, publication, and rebalance fixes remain out of scope.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "seven-node-load-during-partitioning / topology_rebalance_owner / split_rebalance_recovery_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_rebalance_owner / split_rebalance_recovery_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "migrated frontier topology_publication_owner / publication_convergence with missing_published_nodes_present in test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_rebalance_owner / split_rebalance_recovery_gate causal edge for rebalance_disruption_release_gate_unproven",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose",
    "boundedProgressProof": "Focused evidence must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for topology_rebalance_owner / split_rebalance_recovery_gate, or classify the first earlier owner boundary.",
    "boundedProgressProofArtifact": "test-output/reports/topology-rebalance-disruption-recovery-gate.report.json",
    "expectedObservableTransition": "rebalance_disruption_release_gate_unproven migrated before the rebalance owner boundary: publicationStatus=PUBLISHED with pendingAckCount=0, missingPublishedCount=6, publicationPending=true, activeGateState=ready, snapshotCoverageNodeCount=2/7, and activeNodeCount=7/7.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_rebalance_owner / split_rebalance_recovery_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "contract integration reconciliation unless explicitly re-scoped to a publication-owner runtime repair",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_rebalance_owner",
    "fromBoundary": "split_rebalance_recovery_gate",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "fresh seven-node-load-during-partitioning gate first frontier is publication_ack_convergence / missing_published_nodes_present before split/rebalance recovery release-gate evidence can be evaluated",
    "evidence": "test-output/reports/topology-rebalance-disruption-recovery-gate.report.json"
  },
  "successor": "work/packages/done-20260514-topology-contract-integration-reconciliation.md",
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Partition descriptor epoch, placement capacity fail-closed behavior, and
anti-entropy have focused proof, but split/rebalance during node recovery has
not been executed as a release gate. This is where stale routing, stale
descriptor versions, capacity gaps, and recovery admission can race in one
scenario.

This package owns observe/classify execution of the rebalance disruption
recovery gate for
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
5. Verify final durable placement convergence under recovery load, or identify
   the first earlier owner-boundary blocker with canonical evidence.
6. Split or migrate any descriptor, placement, anti-entropy, active admission,
   or publication failure. Do not start rolling-restart runtime repair in this
   package.

## Out Of Scope

1. best-effort-production-placement
2. stale-route-success
3. Development-only best-effort behavior as a production gate result.
4. Runtime work unrelated to split/rebalance under recovery.
5. Rolling-restart runtime repair, even if the gate exposes the same
   publication or active-gate residual.

## Entry Evidence

1. Focused descriptor epoch proof exists.
2. Focused placement capacity fail-closed proof exists.
3. Focused anti-entropy reconciler proof exists.
4. No split/rebalance during recovery artifact currently proves release
   convergence.

## Owner Contract To Observe

`topology_rebalance_owner` must converge placement using durable, versioned
truth. This package must observe and classify whether the gate proves:

1. Partition descriptors carry monotonic version/epoch.
2. Routing and move planning reject stale descriptors.
3. Capacity/accounting uncertainty is strict in release/production mode.
4. Degraded placement reason is explicit when strict placement cannot proceed.
5. Anti-entropy enqueues exact owner-key repair work.
6. Final placement and active publication agree with durable truth.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/partition/partition-descriptor-epoch-contract.js`, `src/partition/partition-split-routing.js`, `src/rebalancer/move-planner.js`, `src/rebalancer/storage-admission-service.js`, `test/rebalancer/move-planner-placement-owner-kernel.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

1. [x] Review subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-rebalance-disruption-recovery-gate-review
2. [x] Fix subagent recorded or explicitly not needed:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-rebalance-disruption-recovery-gate-fix
3. [x] Implementation subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-rebalance-disruption-recovery-gate-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `best-effort-production-placement`, `stale-route-success`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`, `npm run analyze:topology-convergence -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md
3. node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-load-during-partitioning --output test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --verbose
4. npm run work:evidence-summary -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
5. npm run analyze:distributed-failure -- --report test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
6. npm run analyze:topology-convergence -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
7. npm --silent run analyze:causal-model -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json
8. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown
9. node scripts/check-guideline-literals.js src/partition/partition-descriptor-epoch-contract.js src/partition/partition-split-routing.js src/rebalancer/move-planner.js src/rebalancer/storage-admission-service.js test/rebalancer/move-planner-placement-owner-kernel.test.js
10. node scripts/check-guideline-decision-boundaries.js src/partition/partition-descriptor-epoch-contract.js src/partition/partition-split-routing.js src/rebalancer/move-planner.js src/rebalancer/storage-admission-service.js test/rebalancer/move-planner-placement-owner-kernel.test.js
11. npm run audit:runtime-grammar:file -- src/partition/partition-descriptor-epoch-contract.js src/partition/partition-split-routing.js src/rebalancer/move-planner.js src/rebalancer/storage-admission-service.js test/rebalancer/move-planner-placement-owner-kernel.test.js
12. npm run work:validate -- --entry work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md
13. npm run work:validate -- --pre-impl work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md
14. npm run work:validate -- --closure work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md
15. git diff --check -- work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
16. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

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

## Observed Gate Result

`seven-node-load-during-partitioning` failed after `336079ms`. The direct
scenario error was an admin query failure on node
`7493b0ab-a054-5fad-a91b-5e331db29304`: minimum routable provisioning cohort
could not be satisfied for one table partition (`required=2`,
`provisionable=1`, `target=3`) because two candidate nodes were rejected with
`insufficient_placement_eligible_nodes`,
`control_plane_write_unhealthy`, and `cluster_member_unhealthy`.

Canonical topology evidence did not reach the rebalance owner boundary. The
first frontier is `topology_publication_owner / publication_convergence` with
`publication_ack_convergence`, `missing_published_nodes_present`,
`publicationStatus=PUBLISHED`, `pendingAckCount=0`,
`missingPublishedCount=6`, and `publicationPending=true`. Active-gate evidence
is `ready` but incomplete at snapshot coverage `2/7` with active nodes `7/7`.

The causal model reports `outcome=migrate_owner_boundary`,
`dominantFailureClass=publication_ack_blocked`, failed invariant
`publication_ack_closed`, and stop condition `owner_boundary_migration`.
Priority recovery residual extraction reports zero witnesses and
`splitRequired=false`. This package is therefore migrated rather than widened
into rebalance or rolling-restart runtime repair.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: 0148798db43890488552a34f12351c7dbf53d7bc.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
