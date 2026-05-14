# Topology Failure Repair Intents

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "failure_detector",
  "boundary": "durable_repair_intent",
  "dominantReason": "failure_detection_not_causal_for_repair",
  "currentState": "Failure detection marks node/service state and emits events, but repair continuation is not yet durable owner-key work.",
  "nextAction": "Record canonical durable repair intents for failure-detector node and replica transitions while keeping events as wake signals only.",
  "proof": [
    "npm run analyze:owner-files -- failure_detector durable_repair_intent --markdown",
    "npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js",
    "node scripts/check-guideline-literals.js src/node/failure-repair-intent-contract.js src/node/failure-detector.js src/node/node-constants.js",
    "node scripts/check-guideline-decision-boundaries.js src/node/failure-repair-intent-contract.js src/node/failure-detector.js src/node/node-constants.js",
    "npm run audit:runtime-grammar:file -- src/node/failure-repair-intent-contract.js src/node/failure-detector.js src/node/node-constants.js",
    "git diff --check -- work/packages/done-20260513-topology-failure-repair-intents.md work/model-ledger.jsonl work/sprints/active-2026-q2-topology-convergence-ship-shape.md work/sprints/current-blocker.json work/sprints/current-blocker.md src/node/failure-repair-intent-contract.js src/node/failure-detector.js src/node/node-constants.js test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260513-topology-failure-repair-intents.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/node/failure-repair-intent-contract.js",
    "src/node/failure-detector.js",
    "src/node/node-constants.js",
    "test/node/failure-repair-intent-contract.test.js",
    "test/node/failure-detector.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-membership-epoch-fencing.md",
    "src/node/node-lifecycle-service.js",
    "src/node/replica-recovery-service.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "src/bootstrap/system-table-schemas-constants.js"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/node/failure-repair-intent-contract.js",
    "src/node/failure-detector.js",
    "src/node/node-constants.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-topology-failure-repair-intents.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/node/failure-repair-intent-contract.js",
    "src/node/failure-detector.js",
    "src/node/node-constants.js",
    "test/node/failure-repair-intent-contract.test.js",
    "test/node/failure-detector.test.js"
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
    "hypothesis": "If failure_detector records canonical durable repair intents before emitting wake events, downstream repair owners can reconcile missed node failure and recovery transitions from durable owner-key evidence instead of depending on event delivery.",
    "stopConditionCheck": "Do not rerun rolling-restart for this package; npm run analyze:causal-model is cited only as not applicable for scenario:none/artifact:none. Focused stop proof is npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js.",
    "expectedCausalModelChange": "failure_detector / durable_repair_intent becomes a concrete owner boundary consumed by later post-rejoin, anti-entropy, and failure-gate packages.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Later packages must consume the durable repair intents for partition, message-group, replica-operation, rejoin, anti-entropy, and failure-scenario gates.",
    "crossBoundaryReview": "Required before implementation: review the closed membership epoch package and this active failure repair intent scope."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "focused failure detector repair intent tests",
    "phaseChain": [
      "failure detection transition",
      "durable repair intent record",
      "event wake signal",
      "downstream owner reconcile"
    ],
    "currentFirstFrontier": "systemic sprint frontier: failure_detector / durable_repair_intent / failure_detection_not_causal_for_repair",
    "knownDownstreamBlockers": [
      "post-rejoin reconciliation",
      "partition descriptor epoch",
      "placement capacity",
      "anti-entropy reconciler",
      "bounded progress budgets",
      "failure scenario gates"
    ],
    "missingCausalEdge": "Failure detection emits status changes and events without one durable owner-key repair-intent record.",
    "missingCausalEdgeProbe": "npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js",
    "boundedProgressProof": "Focused tests prove durable intent recording for node failure, node recovery, partition replica failure, and message-group replica failure before event wake signals.",
    "boundedProgressProofArtifact": "test/node/failure-repair-intent-contract.test.js and test/node/failure-detector.test.js",
    "expectedObservableTransition": "event-only failure continuation -> durable repair intent plus wake event",
    "maxProgressBound": "one review subagent, one fix subagent if needed, one implementation subagent, focused owner tests, static guardrails",
    "sameFrontierFallback": "If scope requires new system-table schema or broad rebalancer consumption, split that consumer into the next package instead of expanding this one.",
    "expectedNextFrontier": "topology_membership_owner / rejoin_reconciliation",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "predecessor": "work/packages/done-20260513-topology-membership-epoch-fencing.md",
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Failure detection currently marks node and service state and emits events.
Ship-shape recovery requires those observations to become durable repair
intent consumed by the correct owners, so a missed event cannot strand
partition or replica recovery.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  between failure observation and topology repair intent.
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

1. Convert node lifecycle transitions into durable owner-key repair intents.
2. Keep events as wake signals while making durable repair intent the
   authority for recovery continuation.
3. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.

## Out Of Scope

1. Broad anti-entropy scans beyond the specific failure-transition intents.
2. Rejoin admission changes that belong to the post-rejoin package.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260513-topology-failure-repair-intents.md`, `work/model-ledger.jsonl`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/node/failure-repair-intent-contract.js`, `src/node/failure-detector.js`, `src/node/node-constants.js`, `test/node/failure-repair-intent-contract.test.js`, `test/node/failure-detector.test.js`
- Forbidden files: new system-table schema, post-rejoin admission,
  anti-entropy scans, partition descriptor epoch, placement capacity,
  failure scenario gates, Pro behavior, Enterprise behavior
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Kuhn (019e2537-9500-73a0-9062-57caf19743fc) reviewed work/packages/done-20260513-topology-failure-repair-intents.md; result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Laplace (019e2539-0aed-7010-93cb-10cac665ab5f) fixed work/packages/done-20260513-topology-failure-repair-intents.md`.
- [x] Implementation subagent recorded:
      `Agent Aquinas (019e253b-6c42-79d2-b5a1-4f1946a305d8) implemented work/packages/done-20260513-topology-failure-repair-intents.md`.

## Validation

1. `npm run work:context` passed after activation and confirmed this package as
   the current blocker.
2. `npm run analyze:owner-files -- failure_detector durable_repair_intent --markdown`
   passed and confirmed the runtime durable repair intent boundary is not yet
   represented outside this package.
3. Implementation subagent proof recorded from Aquinas
   (`019e253b-6c42-79d2-b5a1-4f1946a305d8`).
4. `npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js`
   passed with 74 assertions.
5. `node scripts/check-guideline-literals.js src/node/failure-repair-intent-contract.js src/node/failure-detector.js src/node/node-constants.js`
   passed.
6. `node scripts/check-guideline-decision-boundaries.js src/node/failure-repair-intent-contract.js src/node/failure-detector.js src/node/node-constants.js`
   passed.
7. `npm run audit:runtime-grammar:file -- src/node/failure-repair-intent-contract.js src/node/failure-detector.js src/node/node-constants.js`
   passed.
8. `npm run work:validate -- --closure work/packages/done-20260513-topology-failure-repair-intents.md`
   passed after recording the real implementation subagent entry.

## Commit And Push Ledger

1. Focused package commit: `07817961`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
