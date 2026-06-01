# Topology Post Rejoin Reconciliation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_membership_owner",
  "boundary": "rejoin_reconciliation",
  "dominantReason": "rejoin_restore_lacks_remote_operation_reconcile",
  "currentState": "Durable rejoin restores local services, but full active admission still needs explicit reconciliation of local topology and coordinated remote operation state.",
  "nextAction": "Introduce a canonical post-rejoin reconciliation outcome and require NodeReintegrationService to observe a satisfied reconciliation decision before marking a recovering node active.",
  "proof": [
    "npm run analyze:owner-files -- topology_membership_owner rejoin_reconciliation --markdown",
    "npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js",
    "git diff --check -- work/packages/done-20260513-topology-post-rejoin-reconciliation.md work/model-ledger.jsonl work/sprints/active-2026-q2-topology-convergence-ship-shape.md work/sprints/current-blocker.json work/sprints/current-blocker.md src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260513-topology-post-rejoin-reconciliation.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/control-plane/rejoin-reconciliation-contract.js",
    "src/node/node-reintegration-service.js",
    "src/node/node-constants.js",
    "test/control-plane/rejoin-reconciliation-contract.test.js",
    "test/node/node-reintegration-service.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-failure-repair-intents.md",
    "work/packages/done-20260513-topology-membership-epoch-fencing.md",
    "src/bootstrap/shared/durable-rejoin-partition-restore-planner.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "src/control-plane/membership-lifecycle-controller.js",
    "src/control-plane/membership-epoch-contract.js",
    "test/bootstrap/durable-rejoin-partition-restore-planner.test.js",
    "test/bootstrap/node-joining-service.test-part-4.js",
    "test/control-plane/membership-lifecycle-controller.test.js"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/rejoin-reconciliation-contract.js",
    "src/node/node-reintegration-service.js",
    "src/node/node-constants.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-topology-post-rejoin-reconciliation.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/control-plane/rejoin-reconciliation-contract.js",
    "src/node/node-reintegration-service.js",
    "src/node/node-constants.js",
    "test/control-plane/rejoin-reconciliation-contract.test.js",
    "test/node/node-reintegration-service.test.js"
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
    "hypothesis": "If topology_membership_owner emits one canonical rejoin reconciliation decision before NodeReintegrationService marks a recovering node active, full active admission and rebalance wakeups cannot race ahead of local restore, startup authority, or coordinated operation reconciliation evidence.",
    "stopConditionCheck": "Do not rerun rolling-restart for this package; npm run analyze:causal-model is cited only as not applicable for scenario:none/artifact:none. Focused stop proof is npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js.",
    "expectedCausalModelChange": "topology_membership_owner / rejoin_reconciliation becomes the active-admission gate consumed by node reintegration before rebalance wake events.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Later packages must wire broader partition descriptor, placement, anti-entropy, bounded-budget, and failure-gate consumers to this rejoin reconciliation outcome.",
    "crossBoundaryReview": "Review and fix subagents must confirm the failure repair intent predecessor closed cleanly before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "focused rejoin reconciliation contract and node reintegration tests",
    "phaseChain": [
      "durable rejoin restore",
      "post-rejoin reconciliation decision",
      "recovering node active admission",
      "rebalance wake signal"
    ],
    "currentFirstFrontier": "systemic sprint frontier: topology_membership_owner / rejoin_reconciliation / rejoin_restore_lacks_remote_operation_reconcile",
    "knownDownstreamBlockers": [
      "partition descriptor epoch",
      "placement capacity",
      "anti-entropy reconciler",
      "bounded progress budgets",
      "failure scenario gates"
    ],
    "missingCausalEdge": "A recovering node can be marked active and trigger rebalancing without one canonical post-rejoin reconciliation outcome.",
    "missingCausalEdgeProbe": "npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js",
    "boundedProgressProof": "Focused tests prove the reconcile mechanism: pending or blocked rejoin reconciliation suppresses active admission and rebalance wakeups, while satisfied reconciliation advances reintegration.",
    "boundedProgressProofArtifact": "test/control-plane/rejoin-reconciliation-contract.test.js and test/node/node-reintegration-service.test.js",
    "expectedObservableTransition": "health-only recovery admission -> rejoin reconciliation gated recovery admission",
    "maxProgressBound": "one review subagent, one fix subagent if needed, one implementation subagent, focused owner tests, static guardrails",
    "sameFrontierFallback": "If scope requires partition descriptor or broad operation-owner consumption, split that consumer into the next package instead of broadening this one.",
    "expectedNextFrontier": "partition_topology_owner / descriptor_epoch",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "predecessor": "work/packages/done-20260513-topology-failure-repair-intents.md",
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Durable rejoin can restore local partition services and restart elections, but
full active admission also needs coordinated operation and remote handoff
reconciliation. This package owns the post-rejoin checkpoint that proves local
runtime state has caught up with durable topology truth.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  between rejoin restore and steady-state topology admission.
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

1. Add post-rejoin reconciliation of restored local services, durable
   partition ownership, and coordinated replica operations before full active
   admission.
2. Re-arm locally owned and coordinator-created operation work through owners.
3. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.

## Out Of Scope

1. Membership epoch definition unless this package explicitly consumes the
   completed epoch contract.
2. Broad failure repair intent creation outside rejoin continuation.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260513-topology-post-rejoin-reconciliation.md`, `work/model-ledger.jsonl`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/control-plane/rejoin-reconciliation-contract.js`, `src/node/node-reintegration-service.js`, `src/node/node-constants.js`, `test/control-plane/rejoin-reconciliation-contract.test.js`, `test/node/node-reintegration-service.test.js`
- Forbidden files: membership epoch definition, durable failure repair intent
  creation, partition descriptor epoch, placement capacity, anti-entropy scans,
  failure scenario gates, Pro behavior, Enterprise behavior
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Schrodinger (019e254a-f738-78a2-abf9-9609bec11e71) reviewed work/packages/done-20260513-topology-post-rejoin-reconciliation.md; result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Pascal (019e254c-8dae-7f61-bfe4-a6da80a3a966) fixed work/packages/done-20260513-topology-post-rejoin-reconciliation.md`.
- [x] Implementation subagent recorded:
      `Agent Avicenna (019e2551-ed31-78a0-b2b4-234aaca9e8d3) implemented work/packages/done-20260513-topology-post-rejoin-reconciliation.md`.

## Validation

1. `npm run work:context` passed after activation and confirmed this package as
   the current blocker.
2. `npm run work:package:doctor -- --suggest work/packages/done-20260513-topology-post-rejoin-reconciliation.md`
   initially found the required Subagent Sequencing Ledger missing.
3. `npm run analyze:owner-files -- topology_membership_owner rejoin_reconciliation --markdown`
   passed and showed this boundary is currently represented by package/sprint
   metadata plus the membership epoch contract, so the package must create the
   focused rejoin reconciliation contract.
4. Review subagent proof recorded from Schrodinger
   (`019e254a-f738-78a2-abf9-9609bec11e71`), result `fixes-required`.
5. Fix subagent proof recorded from Pascal
   (`019e254c-8dae-7f61-bfe4-a6da80a3a966`).
6. Implementation subagent proof recorded from Avicenna
   (`019e2551-ed31-78a0-b2b4-234aaca9e8d3`).
7. Implementation introduced `src/control-plane/rejoin-reconciliation-contract.js`
   with one normalized post-rejoin reconciliation snapshot and decision model
   for local topology, remote operation, and startup admission evidence.
8. `NodeReintegrationService.completeReintegration()` now requires a satisfied
   post-rejoin reconciliation decision before the active node write,
   `nodeReintegrated` event, and `triggerRebalancing` event; pending or blocked
   decisions leave pending reintegration retryable.
9. `npm run analyze:owner-files -- topology_membership_owner rejoin_reconciliation --markdown`
   passed and now reports the new contract as an owner-boundary file.
10. `npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js`
   passed with 70 assertions.
11. `node scripts/check-guideline-literals.js src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js`
    passed after naming one empty-string fallback constant.
12. `node scripts/check-guideline-decision-boundaries.js src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js`
    passed.
13. `npm run audit:runtime-grammar:file -- src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js`
    passed.
14. `git diff --check -- work/packages/done-20260513-topology-post-rejoin-reconciliation.md work/model-ledger.jsonl work/sprints/active-2026-q2-topology-convergence-ship-shape.md work/sprints/current-blocker.json work/sprints/current-blocker.md src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js`
    passed.
15. `npm run work:validate -- --pre-impl work/packages/done-20260513-topology-post-rejoin-reconciliation.md`
    passed.

## Commit And Push Ledger

1. Focused package commit: `35ee14b5`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
