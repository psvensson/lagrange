# Topology Placement Capacity Fail Closed

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_placement_owner",
  "boundary": "capacity_admission",
  "dominantReason": "unknown_capacity_allows_optimistic_placement",
  "currentState": "Placement can still treat missing capacity/accounting evidence too optimistically unless strict dependencies are enforced explicitly.",
  "nextAction": "Classify unavailable capacity accounting as degraded or blocked in production and release gates",
  "proof": [
    "npm run analyze:owner-files -- topology_placement_owner capacity_admission --markdown",
    "npx tap test/rebalancer/storage-admission-service.test.js test/rebalancer/move-planner-capacity-gating.test.js test/rebalancer/storage-capacity-ownership.test.js test/rebalancer/storage-capacity-constants.test.js test/rebalancer/provisioning-admission-policy.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js",
    "git diff --check -- work/packages/active-20260513-topology-placement-capacity-fail-closed.md work/model-ledger.jsonl src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js test/rebalancer/storage-admission-service.test.js test/rebalancer/move-planner-capacity-gating.test.js test/rebalancer/storage-capacity-ownership.test.js test/rebalancer/storage-capacity-constants.test.js test/rebalancer/provisioning-admission-policy.test.js"
  ],
  "writeScope": [
    "work/packages/active-20260513-topology-placement-capacity-fail-closed.md",
    "work/model-ledger.jsonl",
    "src/rebalancer/storage-capacity-constants.js",
    "src/rebalancer/storage-admission-constants.js",
    "src/rebalancer/storage-admission-service.js",
    "src/rebalancer/rebalancer-constants.js",
    "src/rebalancer/move-planner.js",
    "test/rebalancer/storage-admission-service.test.js",
    "test/rebalancer/move-planner-capacity-gating.test.js",
    "test/rebalancer/storage-capacity-ownership.test.js",
    "test/rebalancer/storage-capacity-constants.test.js",
    "test/rebalancer/provisioning-admission-policy.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/rebalancer/storage-capacity-constants.js",
    "src/rebalancer/storage-admission-constants.js",
    "src/rebalancer/storage-admission-service.js",
    "src/rebalancer/rebalancer-constants.js",
    "src/rebalancer/move-planner.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-topology-placement-capacity-fail-closed.md",
    "work/model-ledger.jsonl",
    "src/rebalancer/storage-capacity-constants.js",
    "src/rebalancer/storage-admission-constants.js",
    "src/rebalancer/storage-admission-service.js",
    "src/rebalancer/rebalancer-constants.js",
    "src/rebalancer/move-planner.js",
    "test/rebalancer/storage-admission-service.test.js",
    "test/rebalancer/move-planner-capacity-gating.test.js",
    "test/rebalancer/storage-capacity-ownership.test.js",
    "test/rebalancer/storage-capacity-constants.test.js",
    "test/rebalancer/provisioning-admission-policy.test.js"
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
  "predecessor": "work/packages/done-20260513-topology-partition-descriptor-epoch.md"
}
-->

## Why

Placement cannot be production-grade if missing capacity accounting silently
makes every node look feasible. This package owns the capacity admission
contract that distinguishes strict release-gate behavior from any named
best-effort dev/test mode.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  for placement capacity admission.
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

1. Make unknown capacity accounting or placement admission dependencies fail
   closed or degrade explicitly in production and release-gate modes.
2. Preserve any dev/test best-effort behavior only behind a named mode.
3. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.

## Out Of Scope

1. Rewriting placement policy unrelated to capacity admission.
2. Partition descriptor epoch implementation.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260513-topology-placement-capacity-fail-closed.md`, `work/model-ledger.jsonl`, `src/rebalancer/storage-capacity-constants.js`, `src/rebalancer/storage-admission-constants.js`, `src/rebalancer/storage-admission-service.js`, `src/rebalancer/rebalancer-constants.js`, `src/rebalancer/move-planner.js`, `test/rebalancer/storage-admission-service.test.js`, `test/rebalancer/move-planner-capacity-gating.test.js`, `test/rebalancer/storage-capacity-ownership.test.js`, `test/rebalancer/storage-capacity-constants.test.js`, `test/rebalancer/provisioning-admission-policy.test.js`
- Forbidden files: rolling-restart packages, rolling-restart scenarios,
  `src/rebalancer/unified-rebalancer-segment-4-stage-3.js`, Pro behavior,
  Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/rebalancer/storage-admission-service.test.js test/rebalancer/move-planner-capacity-gating.test.js test/rebalancer/storage-capacity-ownership.test.js test/rebalancer/storage-capacity-constants.test.js test/rebalancer/provisioning-admission-policy.test.js`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Bohr (019e257c-6a62-7e42-bb9e-85024529225a) reviewed work/packages/active-20260513-topology-placement-capacity-fail-closed.md predecessor work/packages/done-20260513-topology-partition-descriptor-epoch.md; result clean`.
- [x] Fix subagent recorded or explicitly not needed:
      `not-needed`.
- [x] Implementation subagent recorded:
      `Agent Boyle (019e2587-0697-79c1-8557-1e027a8feb43) implemented work/packages/active-20260513-topology-placement-capacity-fail-closed.md`.

## Validation

1. `npm run work:context` passed after activation and confirmed this package as
   the current blocker.
2. `npm run work:package:doctor -- --suggest work/packages/active-20260513-topology-placement-capacity-fail-closed.md`
   initially found the required Subagent Sequencing Ledger missing.
3. `npm run analyze:owner-files -- topology_placement_owner capacity_admission --markdown`
   passed and showed the owner/boundary is represented by the active package,
   current blocker handoff, sprint, and predecessor package.
4. Review subagent proof recorded from Bohr
   (`019e257c-6a62-7e42-bb9e-85024529225a`), result `clean`.
5. Implementation subagent proof recorded from Boyle
   (`019e2587-0697-79c1-8557-1e027a8feb43`) after completing scoped
   capacity-accounting unavailable classification changes. Plato
   (`019e2583-1af0-7fc2-b127-2cf6344f42ba`) performed read-only analysis and
   is not recorded as implemented.
6. `npm run analyze:owner-files -- topology_placement_owner capacity_admission --markdown`
   passed and showed five owner/boundary matches.
7. `npx tap test/rebalancer/storage-admission-service.test.js test/rebalancer/move-planner-capacity-gating.test.js test/rebalancer/storage-capacity-ownership.test.js test/rebalancer/storage-capacity-constants.test.js test/rebalancer/provisioning-admission-policy.test.js`
   passed with 264 assertions.
8. `node scripts/check-guideline-literals.js src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js`
   passed with zero new literal-guideline violations.
9. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js`
   passed with zero decision-boundary guideline violations.
10. `npm run audit:runtime-grammar:file -- src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js`
    passed with zero runtime-grammar-contract violations.
11. `git diff --check -- work/packages/active-20260513-topology-placement-capacity-fail-closed.md work/model-ledger.jsonl src/rebalancer/storage-capacity-constants.js src/rebalancer/storage-admission-constants.js src/rebalancer/storage-admission-service.js src/rebalancer/rebalancer-constants.js src/rebalancer/move-planner.js test/rebalancer/storage-admission-service.test.js test/rebalancer/move-planner-capacity-gating.test.js test/rebalancer/storage-capacity-ownership.test.js test/rebalancer/storage-capacity-constants.test.js test/rebalancer/provisioning-admission-policy.test.js`
    passed.
12. `npm run work:model-ledger -- record --package work/packages/active-20260513-topology-placement-capacity-fail-closed.md --model gpt-5.3-codex --reasoning-effort high --task-class runtime-owner-boundary --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason none --outcome implemented --validation-status focused-green --correction-loops 0 --review-findings 0 --notes "..."`
    recorded the package evidence.
13. `npm run work:validate -- --closure work/packages/active-20260513-topology-placement-capacity-fail-closed.md`
    passed.
