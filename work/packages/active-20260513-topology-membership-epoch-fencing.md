# Topology Membership Epoch Fencing

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_membership_owner",
  "boundary": "membership_epoch",
  "dominantReason": "membership_topology_epoch_missing",
  "currentState": "Boot, join, rejoin, failure detection, placement, and gates do not yet share one explicit monotonic membership/topology epoch contract.",
  "nextAction": "Introduce the membership epoch contract at the publication owner boundary, expose it through membership publication planning snapshots, and prove stale/fresh fence decisions with focused tests.",
  "proof": [
    "npm run analyze:owner-files -- topology_membership_owner membership_epoch --markdown",
    "npx tap test/control-plane/membership-epoch-contract.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/membership-epoch-contract.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-stage-2.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-epoch-contract.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-stage-2.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/membership-epoch-contract.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-stage-2.js",
    "git diff --check -- work/packages/active-20260513-topology-membership-epoch-fencing.md work/model-ledger.jsonl work/sprints/active-2026-q2-topology-convergence-ship-shape.md work/sprints/current-blocker.json work/sprints/current-blocker.md src/control-plane/membership-epoch-contract.js src/control-plane/membership-publication-planning.js src/control-plane/membership-publication-coordinator-stage-2.js test/control-plane/membership-epoch-contract.test.js"
  ],
  "writeScope": [
    "work/packages/active-20260513-topology-membership-epoch-fencing.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/control-plane/membership-epoch-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "test/control-plane/membership-epoch-contract.test.js"
  ],
  "handoffFiles": [
    "work/packages/superseded-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md",
    "src/control-plane/README.md",
    "src/bootstrap/rejoin-hints-constants.js",
    "src/control-plane/membership-lifecycle-constants.js",
    "src/rebalancer/rebalancer-constants.js"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-epoch-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-topology-membership-epoch-fencing.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/control-plane/membership-epoch-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "test/control-plane/membership-epoch-contract.test.js"
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
    "hypothesis": "If topology_membership_owner / membership_epoch is formalized at the publication owner boundary, downstream packages can fence stale join, rejoin, failure, placement, active-gate, and rebalancer observations against one explicit epoch snapshot instead of reconstructing freshness locally.",
    "stopConditionCheck": "Do not rerun rolling-restart for this package; npm run analyze:causal-model is cited only as not applicable for scenario:none/artifact:none. Focused stop proof is npx tap test/control-plane/membership-epoch-contract.test.js.",
    "expectedCausalModelChange": "membership epoch vocabulary becomes available to downstream runtime-owner packages without running representative rolling-restart.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Downstream packages must consume the contract in failure repair intents, rejoin reconciliation, partition descriptors, placement, anti-entropy, budgets, and final failure gates.",
    "crossBoundaryReview": "Required before implementation: review the last sprint state and active package pivot, then implement this membership epoch contract slice."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "focused membership epoch contract tests",
    "phaseChain": [
      "membership publication planning",
      "membership epoch fence",
      "downstream topology consumers"
    ],
    "currentFirstFrontier": "systemic sprint frontier: topology_membership_owner / membership_epoch / membership_topology_epoch_missing",
    "knownDownstreamBlockers": [
      "failure repair intent",
      "post-rejoin reconciliation",
      "partition descriptor epoch",
      "placement capacity",
      "anti-entropy reconciler",
      "bounded progress budgets",
      "failure scenario gates"
    ],
    "missingCausalEdge": "Membership publication owner does not expose one canonical epoch/fence result for downstream consumers.",
    "missingCausalEdgeProbe": "npx tap test/control-plane/membership-epoch-contract.test.js",
    "boundedProgressProof": "Focused tests prove bounded current, stale, future, and unknown epoch fence outcomes and membership publication snapshot exposure.",
    "boundedProgressProofArtifact": "test/control-plane/membership-epoch-contract.test.js",
    "expectedObservableTransition": "epoch contract absent -> canonical membershipEpochSnapshot and membershipEpochFence available",
    "maxProgressBound": "one review subagent, one fix subagent if needed, one implementation subagent, focused owner tests, static guardrails",
    "sameFrontierFallback": "If scope expands beyond the publication owner boundary, split the affected consumer into the next sprint package instead of broadening this package.",
    "expectedNextFrontier": "failure_detector / durable_repair_intent",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "predecessor": "work/packages/superseded-20260514-topology-active-gate-snapshot-coverage-after-publication-owner-truth.md"
}
-->

## Why

Boot, join, rejoin, failure detection, placement, and active-gate checks need
one monotonic membership/topology generation so stale observations cannot
drive placement or readiness decisions. This package owns the epoch and
fencing vocabulary before downstream repair packages depend on it.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  and the first publication-owner contract consumed by later packages.
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

1. Introduce or formalize the monotonic membership/topology epoch consumed by
   boot, join, rejoin, failure detection, placement, active-gate, and
   rebalancer decisions.
2. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.
3. Define stale-observation fencing and diagnostics vocabulary.
4. Expose the epoch contract from membership publication planning snapshots and
   candidate output.

## Out Of Scope

1. Failure repair intent implementation beyond epoch consumption hooks.
2. Partition descriptor epoch implementation unless explicitly split into this
   package.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260513-topology-membership-epoch-fencing.md`, `work/model-ledger.jsonl`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/control-plane/membership-epoch-contract.js`, `src/control-plane/membership-publication-planning.js`, `src/control-plane/membership-publication-coordinator-stage-2.js`, `test/control-plane/membership-epoch-contract.test.js`
- Forbidden files: failure repair intent implementation, post-rejoin
  reconciliation, partition descriptor epoch, placement capacity, anti-entropy,
  progress budgets, failure scenario gates, Pro behavior, Enterprise behavior
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/control-plane/membership-epoch-contract.test.js`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Jason (019e2522-a647-7002-881b-9c3edf2c73ea) reviewed work/packages/active-20260513-topology-membership-epoch-fencing.md; result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Popper (019e2524-948b-7b80-86aa-d32045cb7557) fixed work/packages/active-20260513-topology-membership-epoch-fencing.md`.
- [x] Implementation subagent recorded:
      `Agent Gibbs (019e2528-03b6-7170-a61f-79e409c81482) implemented work/packages/active-20260513-topology-membership-epoch-fencing.md`.

## Validation

1. `npm run work:context` passed after activation and confirmed this package as
   the current blocker.
2. `npm run analyze:owner-files -- topology_membership_owner membership_epoch --markdown`
   passed and showed this is a sparse contract boundary that must start with a
   focused publication-owner contract.
3. Implementation subagent proof recorded from Gibbs
   (`019e2528-03b6-7170-a61f-79e409c81482`).
