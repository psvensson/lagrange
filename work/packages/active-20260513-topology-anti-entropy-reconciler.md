# Topology Anti Entropy Reconciler

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_reconcile_owner",
  "boundary": "durable_truth_reconcile",
  "dominantReason": "durable_truth_lacks_periodic_owner_key_repair",
  "currentState": "The topology control plane lacks a periodic durable truth reconciler that enqueues exact owner-key repair without local fallback mutation.",
  "nextAction": "Add low-rate durable truth scans that enqueue exact owner-key reconciliation without local fallback repairs",
  "proof": [
    "npm run analyze:owner-files -- topology_reconcile_owner durable_truth_reconcile --markdown",
    "npx tap test/topology/topology-anti-entropy-reconciler.test.js test/workflow/owner-key-reconcile-queue.test.js",
    "node scripts/check-guideline-literals.js src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js",
    "node scripts/check-guideline-decision-boundaries.js src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js",
    "npm run audit:runtime-grammar:file -- src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js",
    "git diff --check -- src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js test/topology/topology-anti-entropy-reconciler.test.js work/packages/active-20260513-topology-anti-entropy-reconciler.md"
  ],
  "writeScope": [
    "src/topology/topology-anti-entropy-constants.js",
    "src/topology/topology-anti-entropy-reconciler.js",
    "src/workflow/reconcile-queue-constants.js",
    "test/topology/topology-anti-entropy-reconciler.test.js",
    "work/packages/active-20260513-topology-anti-entropy-reconciler.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-placement-capacity-fail-closed.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/topology/topology-anti-entropy-constants.js",
    "src/topology/topology-anti-entropy-reconciler.js",
    "src/workflow/reconcile-queue-constants.js"
  ],
  "commitScope": [
    "src/topology/topology-anti-entropy-constants.js",
    "src/topology/topology-anti-entropy-reconciler.js",
    "src/workflow/reconcile-queue-constants.js",
    "test/topology/topology-anti-entropy-reconciler.test.js",
    "work/packages/active-20260513-topology-anti-entropy-reconciler.md",
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
  "predecessor": "work/packages/done-20260513-topology-placement-capacity-fail-closed.md"
}
-->

## Why

Events are acceleration, not durable truth. This package owns the periodic
durable reconciliation layer that compares topology truth surfaces and
enqueues exact owner-key repair without adding local fallback mutation.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  for durable topology reconciliation.
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

1. Add low-rate durable truth reconciliation that enqueues exact owner-key
   work for nodes, readiness leases, partition services, replica operations,
   placement targets, and active publication state.
2. Ensure the reconciler never mutates another owner's state directly.
3. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.

## Out Of Scope

1. Local fallback repair writes outside owner-key intents.
2. Failure-transition-specific repair intent creation already owned by the
   failure repair package.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `src/topology/topology-anti-entropy-constants.js`,
  `src/topology/topology-anti-entropy-reconciler.js`,
  `src/workflow/reconcile-queue-constants.js`,
  `test/topology/topology-anti-entropy-reconciler.test.js`,
  `work/packages/active-20260513-topology-anti-entropy-reconciler.md`,
  `work/model-ledger.jsonl`
- Forbidden files: rolling-restart scenarios/artifacts, direct local fallback
  repair writers, failure-transition-specific repair intent code, Pro behavior,
  Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/topology/topology-anti-entropy-reconciler.test.js test/workflow/owner-key-reconcile-queue.test.js`
- Model ledger advisory: `escalate`

## Shared Boundary Contract

- Semantic owner: `topology_reconcile_owner`
- Canonical contract shape / vocabulary: low-rate durable truth scan produces
  typed owner-key reconcile enqueues for nodes, readiness leases, partition
  services, replica operations, placement targets, and active publication
  state. Every repair target is an exact owner key plus reason/evidence.
- Allowed consumers: topology/control-plane runtime wiring that needs periodic
  durable truth repair scheduling, diagnostics that read the reconciler
  summary, and tests proving enqueue-only behavior.
- Prohibited reinterpretations: cache visibility, incidental row absence,
  timer age, or local fallback mutation must not be treated as durable repair.
- Primary diagnostics / proof surfaces:
  `test/topology/topology-anti-entropy-reconciler.test.js` and
  `test/workflow/owner-key-reconcile-queue.test.js`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Peirce (019e2592-b236-7b42-8511-465f2ccf2a79) reviewed work/packages/done-20260513-topology-placement-capacity-fail-closed.md; result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Boole (019e2595-b843-7c60-95d7-adff53a8bc19) fixed work/packages/done-20260513-topology-placement-capacity-fail-closed.md`.
- [x] Implementation subagent recorded:
      `Agent Codex (019e25a2-7464-7540-8603-b1c916c213ae) implemented work/packages/active-20260513-topology-anti-entropy-reconciler.md`.

## Validation

1. `npm run work:context` passed and confirmed this package as the current
   blocker.
2. `npm run work:package:doctor -- --suggest work/packages/active-20260513-topology-anti-entropy-reconciler.md`
   initially found the required Subagent Sequencing Ledger missing.
3. `npm run analyze:owner-files -- topology_reconcile_owner durable_truth_reconcile --markdown`
   passed and showed the owner/boundary is represented by the active package,
   current blocker handoff, and sprint.
4. Review subagent proof recorded from Peirce
   (`019e2592-b236-7b42-8511-465f2ccf2a79`), result `fixes-required`.
5. Fix subagent proof recorded from Boole
   (`019e2595-b843-7c60-95d7-adff53a8bc19`) after correcting the predecessor
   package ledger. Parent verification passed
   `npm run work:validate -- --closure work/packages/done-20260513-topology-placement-capacity-fail-closed.md`
   and `git diff --check -- work/packages/done-20260513-topology-placement-capacity-fail-closed.md`.
6. Focused predecessor ledger repair was committed and pushed as `a579d445`.
7. `npm run work:validate -- --pre-impl work/packages/active-20260513-topology-anti-entropy-reconciler.md`
   passed.
8. `npx tap test/topology/topology-anti-entropy-reconciler.test.js test/workflow/owner-key-reconcile-queue.test.js`
   passed.
9. `node scripts/check-guideline-literals.js src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js`
   passed with 0 new literal-guideline violations.
10. `node scripts/check-guideline-decision-boundaries.js src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js`
   passed with 0 decision-boundary guideline violations.
11. `npm run audit:runtime-grammar:file -- src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js`
   passed with 0 runtime-grammar-contract violations.
12. `git diff --check -- src/topology/topology-anti-entropy-constants.js src/topology/topology-anti-entropy-reconciler.js src/workflow/reconcile-queue-constants.js test/topology/topology-anti-entropy-reconciler.test.js work/packages/active-20260513-topology-anti-entropy-reconciler.md`
   passed.
13. Parent review tightened active publication/placement filtering and
    normalized identity-field support, then reran the focused Tap, literal,
    decision-boundary, and runtime-grammar proof successfully.
14. `npm run work:model-ledger -- record --package work/packages/active-20260513-topology-anti-entropy-reconciler.md --model gpt-5.3-codex --reasoning-effort high --task-class runtime-owner-boundary --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason none --outcome implemented --validation-status focused-green --correction-loops 1 --review-findings 1 --notes "..."`
    recorded the final package evidence.
