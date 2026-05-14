# Topology Partition Descriptor Epoch

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "partition_topology_owner",
  "boundary": "descriptor_epoch",
  "dominantReason": "partition_map_epoch_missing",
  "currentState": "Partition split, move, route, and diagnostics need one descriptor-version truth surface instead of cache freshness inference.",
  "nextAction": "Make partition descriptors versioned routing truth for split merge move and stale-route rejection",
  "proof": [
    "npm run analyze:owner-files -- partition_topology_owner descriptor_epoch --markdown",
    "npx tap test/partition/partition-descriptor-epoch-contract.test.js test/partition/partition-split-routing.test.js test/partition/managed-split-workflow-transition-persistence.test.js test/rebalancer/move-planner-placement-owner-kernel.test.js",
    "node scripts/check-guideline-literals.js src/partition/partition-descriptor-epoch-contract.js src/partition/partition-constants.js src/partition/partition-split-routing.js src/partition/partition-service-segment-4-part-1.js src/partition/managed-split-workflow-provisioning-methods.js src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js",
    "node scripts/check-guideline-decision-boundaries.js src/partition/partition-descriptor-epoch-contract.js src/partition/partition-constants.js src/partition/partition-split-routing.js src/partition/partition-service-segment-4-part-1.js src/partition/managed-split-workflow-provisioning-methods.js src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js",
    "npm run audit:runtime-grammar:file -- src/partition/partition-descriptor-epoch-contract.js src/partition/partition-constants.js src/partition/partition-split-routing.js src/partition/partition-service-segment-4-part-1.js src/partition/managed-split-workflow-provisioning-methods.js src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js",
    "git diff --check -- work/packages/active-20260513-topology-partition-descriptor-epoch.md work/packages/done-20260513-topology-post-rejoin-reconciliation.md work/model-ledger.jsonl work/sprints/active-2026-q2-topology-convergence-ship-shape.md work/sprints/current-blocker.json work/sprints/current-blocker.md src/partition/partition-descriptor-epoch-contract.js src/partition/partition-constants.js src/partition/partition-split-routing.js src/partition/partition-service-segment-4-part-1.js src/partition/managed-split-workflow-provisioning-methods.js src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js test/partition/partition-descriptor-epoch-contract.test.js test/partition/partition-split-routing.test.js test/partition/managed-split-workflow-transition-persistence.test.js test/rebalancer/move-planner-placement-owner-kernel.test.js"
  ],
  "writeScope": [
    "work/packages/active-20260513-topology-partition-descriptor-epoch.md",
    "work/packages/done-20260513-topology-post-rejoin-reconciliation.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/partition/partition-descriptor-epoch-contract.js",
    "src/partition/partition-constants.js",
    "src/partition/partition-split-routing.js",
    "src/partition/partition-service-segment-4-part-1.js",
    "src/partition/managed-split-workflow-provisioning-methods.js",
    "src/rebalancer/move-planner.js",
    "src/rebalancer/move-planner-state-methods.js",
    "test/partition/partition-descriptor-epoch-contract.test.js",
    "test/partition/partition-split-routing.test.js",
    "test/partition/managed-split-workflow-transition-persistence.test.js",
    "test/rebalancer/move-planner-placement-owner-kernel.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-post-rejoin-reconciliation.md",
    "work/packages/done-20260513-topology-failure-repair-intents.md",
    "work/packages/done-20260513-topology-membership-epoch-fencing.md",
    "src/bootstrap/system-table-schemas-constants.js",
    "src/partition/partition-service-constants.js",
    "src/partition/managed-split-workflow.js",
    "src/partition/partition-service-row-owner.js",
    "src/partition/partition-split-merge-manager.js",
    "src/rebalancer/topology-owner-constants.js"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/partition/partition-descriptor-epoch-contract.js",
    "src/partition/partition-constants.js",
    "src/partition/partition-split-routing.js",
    "src/partition/partition-service-segment-4-part-1.js",
    "src/partition/managed-split-workflow-provisioning-methods.js",
    "src/rebalancer/move-planner.js",
    "src/rebalancer/move-planner-state-methods.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-topology-partition-descriptor-epoch.md",
    "work/packages/done-20260513-topology-post-rejoin-reconciliation.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/partition/partition-descriptor-epoch-contract.js",
    "src/partition/partition-constants.js",
    "src/partition/partition-split-routing.js",
    "src/partition/partition-service-segment-4-part-1.js",
    "src/partition/managed-split-workflow-provisioning-methods.js",
    "src/rebalancer/move-planner.js",
    "src/rebalancer/move-planner-state-methods.js",
    "test/partition/partition-descriptor-epoch-contract.test.js",
    "test/partition/partition-split-routing.test.js",
    "test/partition/managed-split-workflow-transition-persistence.test.js",
    "test/rebalancer/move-planner-placement-owner-kernel.test.js"
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
    "hypothesis": "If partition_topology_owner exposes one descriptor epoch decision for table and partition rows, split, merge, move planning, and write routing can reject stale topology evidence before changing placement or routing state.",
    "stopConditionCheck": "Do not rerun rolling-restart for this package; npm run analyze:causal-model is cited only as not applicable for scenario:none/artifact:none. Focused stop proof is descriptor-epoch owner tests plus directly affected split-routing and move-planner consumers.",
    "expectedCausalModelChange": "partition_topology_owner / descriptor_epoch becomes the routing and placement freshness boundary consumed by split, merge, move, and stale-route rejection paths.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Later packages must use descriptor epoch outcomes for placement capacity, anti-entropy, bounded budgets, and failure scenario gates without reopening this owner contract.",
    "crossBoundaryReview": "Review and fix subagents must confirm the post-rejoin predecessor closed cleanly before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "focused partition descriptor epoch tests",
    "phaseChain": [
      "partition descriptor read",
      "descriptor epoch decision",
      "split or move admission",
      "write route acceptance or stale-route rejection"
    ],
    "currentFirstFrontier": "systemic sprint frontier: partition_topology_owner / descriptor_epoch / partition_map_epoch_missing",
    "knownDownstreamBlockers": [
      "placement capacity",
      "anti-entropy reconciler",
      "bounded progress budgets",
      "failure scenario gates"
    ],
    "missingCausalEdge": "Partition consumers infer freshness from cache-visible table and partition rows without one canonical descriptor epoch outcome.",
    "missingCausalEdgeProbe": "npx tap test/partition/partition-descriptor-epoch-contract.test.js test/partition/partition-split-routing.test.js test/partition/managed-split-workflow-transition-persistence.test.js test/rebalancer/move-planner-placement-owner-kernel.test.js",
    "boundedProgressProof": "Focused tests must prove stale table/partition descriptor combinations are rejected, matching descriptor epochs are accepted, split routing dispatch rejects stale routes, and move-planner reconcile snapshots consume descriptor epoch outcomes.",
    "boundedProgressProofArtifact": "test/partition/partition-descriptor-epoch-contract.test.js, test/partition/partition-split-routing.test.js, test/partition/managed-split-workflow-transition-persistence.test.js, and test/rebalancer/move-planner-placement-owner-kernel.test.js",
    "expectedObservableTransition": "cache-row freshness inference -> descriptor epoch decision with stale-route rejection",
    "maxProgressBound": "one review subagent, one fix subagent if needed, one implementation subagent, focused owner tests, static guardrails",
    "sameFrontierFallback": "If scope requires a broad membership epoch or scenario artifact rerun, split that consumer into a later package instead of broadening this one.",
    "expectedNextFrontier": "topology_placement_owner / capacity_fail_closed",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "predecessor": "work/packages/done-20260513-topology-post-rejoin-reconciliation.md"
}
-->

## Why

Split, merge, move, route, and stale-route rejection need one versioned
partition descriptor contract. This package owns that descriptor epoch so
consumers stop inferring partition freshness from cache age or incidental
service rows.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  for partition descriptor versioning and direct consumers.
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

1. Make partition descriptors versioned routing truth for split, merge, move,
   and stale-route rejection.
2. Cut direct consumers over to descriptor-version outcomes instead of cache
   freshness or incidental rows.
3. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.

## Out Of Scope

1. Membership epoch implementation unless descriptor epoch explicitly consumes
   its completed contract.
2. User-facing partition management APIs.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260513-topology-partition-descriptor-epoch.md`, `work/packages/done-20260513-topology-post-rejoin-reconciliation.md`, `work/model-ledger.jsonl`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/partition/partition-descriptor-epoch-contract.js`, `src/partition/partition-constants.js`, `src/partition/partition-split-routing.js`, `src/partition/partition-service-segment-4-part-1.js`, `src/partition/managed-split-workflow-provisioning-methods.js`, `src/rebalancer/move-planner.js`, `src/rebalancer/move-planner-state-methods.js`, `test/partition/partition-descriptor-epoch-contract.test.js`, `test/partition/partition-split-routing.test.js`, `test/partition/managed-split-workflow-transition-persistence.test.js`, `test/rebalancer/move-planner-placement-owner-kernel.test.js`
- Forbidden files: membership epoch implementation, user-facing partition
  management APIs, broad operation workflow owner changes, rolling-restart
  harness scenarios, Pro behavior, Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/partition/partition-descriptor-epoch-contract.test.js test/partition/partition-split-routing.test.js test/partition/managed-split-workflow-transition-persistence.test.js test/rebalancer/move-planner-placement-owner-kernel.test.js`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Codex (019e2560-da68-74b0-89e3-ce4b07639458) reviewed work/packages/active-20260513-topology-partition-descriptor-epoch.md; result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Codex (019e2563-6c77-7f51-8e78-84aaf44fef9b) fixed work/packages/active-20260513-topology-partition-descriptor-epoch.md`.
- [ ] Implementation subagent recorded:
      pending-before-implementation-starts

## Validation

1. `npm run work:context` passed after activation and confirmed this package as
   the current blocker.
2. `npm run work:package:doctor -- --suggest work/packages/active-20260513-topology-partition-descriptor-epoch.md`
   initially found the required Subagent Sequencing Ledger missing.
3. `npm run analyze:owner-files -- partition_topology_owner descriptor_epoch --markdown`
   passed and showed the boundary is currently represented only by package and
   sprint metadata.
4. Review subagent proof recorded from Heisenberg
   (`019e2560-da68-74b0-89e3-ce4b07639458`), result `fixes-required`.
5. Fix subagent proof recorded from Harvey
   (`019e2563-6c77-7f51-8e78-84aaf44fef9b`) for the predecessor commit ledger.
6. `git diff --check -- work/packages/active-20260513-topology-partition-descriptor-epoch.md work/packages/done-20260513-topology-post-rejoin-reconciliation.md`
   passed before implementation subagent starts.
