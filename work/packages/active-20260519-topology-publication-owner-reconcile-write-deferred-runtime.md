# Topology Publication Owner Reconcile Write Deferred Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "The causal gate selected a bounded runtime-owner-boundary successor: route-after-rerun and causal-model keep topology_publication_owner / publication_convergence selected, the publication-active-gate contract is present, and the remaining shape is publicationStatus=OPEN, epoch=2, handoffOutcome=write_deferred, missingPublishedCount=4, snapshotCoverageNodeCount=2/5, and one pending reconcile node.",
  "nextAction": "Run required review/fix/implementation subagent sequencing, then implement one bounded publication-owned runtime slice for the OPEN epoch-2 owner-reconcile write_deferred shape.",
  "proof": [
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260519-topology-publication-active-gate-reconcile-runtime.md",
    "work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md",
    "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime ownership changes",
      "representative scenario evidence changes"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Implement one bounded publication-convergence owner-reconcile runtime slice selected by the causal gate."
  },
  "causalGovernance": {
    "hypothesis": "The OPEN epoch-2 write_deferred shape is still publication-convergence producer debt: publication remains OPEN with missingPublishedCount=4, the active-gate handoff contract is pending with nextAction=reconcile_owner_membership_publication, priority residual witnesses are zero, and the causal gate selected a bounded runtime successor.",
    "stopConditionCheck": "Before runtime edits, use route-after-rerun, the handoff probe, `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`, owner-files, review/fix sequencing, and focused owner tests to confirm the same owner and boundary.",
    "expectedCausalModelChange": "The runtime slice should reduce the OPEN/write_deferred publication_pending shape by publishing the pending reconcile cohort, clearing missing published nodes, migrating to a concrete active-gate consumer boundary, or turning rolling-restart green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact reports publicationStatus=OPEN, publicationEpoch=2, handoffOutcome=write_deferred, missingPublishedCount=4, publishedActiveNodeIds=1/5, snapshotCoverageNodeCount=2/5, publicationActiveGateHandoff.state=pending, pendingReconcileCount=1, pendingReconcileNodeIds=35a891b8-c1a0-5064-9c6e-2acfba61c2a7, activeGateState=stalled, and priority recovery residual witnesses=0.",
    "crossBoundaryReview": "Required before implementation; review subagent must check the causal gate, predecessor runtime proof, current route evidence, and frozen non-publication boundaries."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart OPEN/write_deferred publication handoff after causal gate",
    "phaseChain": [
      "operation workflow residual drained to zero witnesses",
      "publication-active-gate reconcile contract emitted",
      "causal gate classified same-owner frontier oscillation",
      "route-after-rerun and causal-model selected continue_local_fix",
      "OPEN epoch-2 write_deferred handoff remains the bounded runtime target"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=stalled",
      "snapshotCoverageNodeCount=2/5",
      "handoffContract.state=pending",
      "handoffOutcome=write_deferred",
      "priority recovery residual witnesses=0"
    ],
    "missingCausalEdge": "Publication convergence must complete or retry owner reconcile publication for the OPEN epoch-2 write_deferred handoff without reinterpreting downstream active-gate symptoms.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe plus focused owner tests over publication handoff/recovery/decision files",
    "boundedProgressProof": "One reconcile progress mechanism in a runtime-owner-boundary package with required review/fix/implementation subagent sequencing, parent-focused validation, and representative route proof after implementation.",
    "boundedProgressProofArtifact": "work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md and test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "expectedObservableTransition": "Focused owner proof should change the write_deferred owner-reconcile publication outcome; representative proof should reduce missingPublishedCount or publication_pending, migrate, close green, or trigger renewed architecture/human gate.",
    "maxProgressBound": "one bounded runtime owner slice before another representative rerun or architecture/human gate",
    "sameFrontierFallback": "If the same OPEN/write_deferred publication_pending frontier persists without concrete metric or state reduction, stop for architecture or human escalation instead of opening another local runtime patch.",
    "expectedNextFrontier": "reduced publication frontier, migrated owner boundary, representative green, or renewed architecture/human gate",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md / topology_publication_owner / publication_convergence / causal-gate-selected-runtime-successor",
      "work/packages/done-20260519-topology-publication-active-gate-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Runtime work is allowed only because the causal-escalation handoff gate selected the runtime-owner-boundary successor from fresh route, handoff, and causal-model proof.",
    "handoffInvariant": "Operation workflow, startup active-gate runtime, readiness, admission, and timeout budgets stay frozen unless fresh canonical evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "causal gate selected the publication-open-write-deferred runtime successor",
      "route-after-rerun keeps topology_publication_owner / publication_convergence selected",
      "handoff probe reports pending owner_reconcile_pending with write_deferred outcome",
      "priority residual witnesses are zero",
      "active-gate runtimePromotionAllowed=false"
    ],
    "choices": [
      {
        "id": "causal-gate-selected-runtime-successor",
        "summary": "Run one bounded topology publication owner runtime successor under normal runtime-owner-boundary sequencing.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json"
        ]
      }
    ],
    "selectedChoice": "causal-gate-selected-runtime-successor",
    "nextAction": "Run review subagent first, fix if required, then implementation subagent for this runtime successor."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json"
    ],
    "decisionRecord": "The causal gate selected this runtime-owner-boundary successor after checking the same-owner oscillation.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Runtime/test files are promoted into this runtime-owner-boundary package by the causal gate decision."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Reduce the OPEN epoch-2 handoff write_deferred publication_pending shape by closing owner reconcile publication coverage, clearing missing published nodes, migrating ownership to the active-gate consumer, or turning rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "predecessor": "work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md"
}
-->

## Why

The causal gate selected this bounded runtime package because fresh evidence no longer lacks a handoff contract; it shows a concrete OPEN epoch-2 write-deferred owner-reconcile shape still owned by publication convergence.

## Scope Basis

Rolling-restart release-gate closure in the AGPL roadmap scope.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the causal gate selected same-owner bounded runtime work, and proof is limited to publication convergence files plus focused tests.
- Escalation trigger to a heavier lane: ownership migrates, the write-deferred edge cannot be reduced locally, or representative rerun shows unchanged same-frontier with no metric reduction.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence completes or retries the OPEN epoch-2 owner-reconcile publication handoff instead of leaving `handoffOutcome=write_deferred`.
- Inputs/signals: route-after-rerun, handoff-probe, causal-model, owner-files, publication handoff/recovery evidence, and focused owner tests for `test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`.
- State model or invariant: collect publication status, epoch, missing-published set, handoff contract state, pending reconcile node IDs, priority residual witnesses, and active-gate promotion state into one snapshot, then emit one owner outcome and reasons.
- Non-goals and forbidden interpretations: do not patch operation workflow, startup active-gate runtime, readiness, admission, timeout budgets, or generic active-gate consumer symptoms unless fresh proof migrates ownership.
- Proof mapping: review/fix/implementation subagents check the causal gate and predecessor proof; focused tests and guardrails prove runtime behavior; representative rerun classifies reduction, migration, green, or stop.
- Wrong-slice trigger: stop if the focused probe shows downstream active-gate consumer debt or requires files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | causal gate selected local runtime successor | implement bounded publication owner reconcile slice | reduce OPEN/write_deferred, migrate, or green | `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending` |
| handoff state | pending owner_reconcile_pending, write_deferred, one pending reconcile node | publication producer owns retry/completion before active-gate promotion | produce one canonical owner outcome | pending reconcile count or missingPublishedCount moves | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe` |
| priority residuals | zero witnesses | operation workflow stays frozen | no operation workflow patch | no residual reintroduction | `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json` |

- Anti-symptom rationale: this package targets the publication producer handoff edge named by the causal gate, not active-gate stalled status or readiness timeout symptoms.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe`
- Competing explanations: publication producer failed to publish owner reconcile; active-gate consumer stalled after valid contract; stale evidence; contract architecture gap.
- Systemic interaction scan: check producer publication state, active-gate consumer state, retry/lifecycle behavior, and evidence-generation effects before editing.
- Ping-pong stop rule: one bounded runtime patch is allowed by the causal gate; unchanged representative evidence without metric reduction stops local patching.
- Oscillation guard: this is not another same-frontier symptom patch because the causal gate selected this route, the prior shape reduced from absent contract to concrete write_deferred handoff, and this package targets the named reconcile producer edge instead of downstream stalled symptoms.

## Decision Experiment Gate

- Decision question: Can publication convergence complete the OPEN epoch-2 owner-reconcile write-deferred handoff locally?
- Architecture review: runtime-owner-boundary route selected by the causal-escalation handoff gate for topology_publication_owner / publication_convergence.
- Competing hypotheses: publication producer debt, downstream active-gate consumer debt, stale evidence, or missing handoff contract architecture.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe`
- Success metrics: missingPublishedCount, pendingReconcileCount, handoffOutcome, publication_pending frontier, owner-boundary migration, or rolling-restart green must move.
- Representative rerun: `REPORT="test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T000000Z.report.json"; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output "$REPORT" --fast-local --verbose && npm run work:package:route-after-rerun -- --artifact "$REPORT" --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: unchanged OPEN/write_deferred same-frontier with no count or state reduction stops local patching.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`
- Expected delta: reduce the OPEN/write_deferred publication pending shape, migrate ownership, or turn rolling-restart green.
- Local proof class: focused owner proof only.
- Representative proof class: fresh representative rerun and route-after-rerun.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: causal gate selected this runtime successor.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: runtime files are active only in this package after review/fix sequencing.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use package doctor, evidence summary, focused topology handoff probe, owner-files extractor, and subagent prompt tools.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding package prose.
2. Keep durable proof to route-after-rerun, handoff-probe, owner tests, guardrails, representative rerun, and closure validation.
3. If focused proof cannot target the write-deferred edge, stop or migrate before editing runtime.

## In Scope

1. work/packages/active-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-active-gate-handoff-contract.js
7. src/control-plane/publication-recovery-evidence.js
8. src/control-plane/publication-owner-decision.js
9. src/control-plane/membership-publication-coordinator-class-stage-2.js
10. src/control-plane/active-node-projection.js
11. test/control-plane/publication-active-gate-handoff-contract.test.js
12. test/control-plane/publication-recovery-evidence.test.js
13. test/control-plane/publication-owner-stream.test.js
14. test/control-plane/membership-publication-coordinator-main-stage-2.js

## Out Of Scope

1. src/rebalancer/operation-workflow-owner.js
2. startup-active-gate-runtime
3. startup-readiness-runtime
4. admission-runtime
5. timeout-runtime

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/active-node-projection.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`
- Forbidden files: `src/rebalancer/operation-workflow-owner.js`, `startup-active-gate-runtime`, `startup-readiness-runtime`, `admission-runtime`, `timeout-runtime`
- Frozen decisions: causal gate selected one bounded runtime-owner-boundary successor; no forbidden owner edits.
- Escalation triggers: owned files expand, ownership changes, or representative evidence stays unchanged.
- Focused proof: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required for this runtime package. Each real subagent must append one checked checkpoint after each completed subtask.

- [ ] Agent <name> (<agent-id>) review checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, causal gate, predecessor, sprint, and handoff files read; next: focused review probes.
- [ ] Agent <name> (<agent-id>) implementation checkpoint: status: started; last checkpoint: review/fix clean; parent action: pending; evidence: pre-implementation validation; next: bounded runtime patch.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-review.

## Validation

1. npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json
4. npm run analyze:owner-files -- topology_publication_owner publication_convergence
