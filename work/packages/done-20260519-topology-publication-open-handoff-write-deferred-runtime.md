# Topology Publication Open Handoff Write Deferred Causal Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative evidence after the active-gate reconcile package reduced the absent-contract shape still returns to topology_publication_owner / publication_convergence. The new residual is concrete, not absent: publicationStatus=OPEN, epoch=2, handoffOutcome=write_deferred, publicationActiveGateHandoff.state=pending, activeGateState=stalled, snapshotCoverageNodeCount=2/5, and pendingReconcileCount=1.",
  "nextAction": "Close this causal gate as a selected continue-local-proof route, then run the bounded runtime-owner-boundary successor for the OPEN/write_deferred owner-reconcile shape.",
  "proof": [
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260519-topology-publication-active-gate-reconcile-runtime.md",
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
    "work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "causal-escalation-owner-handoff",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
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
    "nextAction": "Open the bounded runtime-owner-boundary successor for the OPEN epoch-2 write_deferred handoff shape."
  },
  "causalGovernance": {
    "hypothesis": "The sprint is oscillating inside topology_publication_owner / publication_convergence, but the fresh shape changed materially: the absent publication-active-gate contract is closed and the remaining publication_pending residual is the OPEN epoch-2 owner-reconcile write_deferred handoff.",
    "stopConditionCheck": "Use route-after-rerun, handoff-probe, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json` before any runtime edit. Continue only if they select the same owner boundary with a concrete publication-owned producer edge; otherwise migrate owner boundary or stop for architecture.",
    "expectedCausalModelChange": "This package did not change runtime. It classified the OPEN/write_deferred handoff as a bounded publication runtime successor because route-after-rerun and causal-model kept topology_publication_owner / publication_convergence selected.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh artifact reports publicationStatus=OPEN, publicationEpoch=2, handoffOutcome=write_deferred, missingPublishedCount=4, publishedActiveNodeIds=1/5, snapshotCoverageNodeCount=2/5, publicationActiveGateHandoff.state=pending, pendingReconcileCount=1, activeGateState=stalled, and priority recovery residual witnesses=0.",
    "crossBoundaryReview": "Required before another runtime-owner-boundary implementation package; operation workflow, startup active-gate, readiness, admission, and timeout runtime stay frozen unless focused proof migrates ownership."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after publication active-gate reconcile reduction",
    "phaseChain": [
      "operation workflow residual drained to zero witnesses",
      "publication-active-gate reconcile contract emitted",
      "snapshot coverage improved from 0/5 to 2/5",
      "fresh evidence remains on publication_ack_convergence with OPEN epoch-2 write_deferred owner reconcile"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=stalled",
      "snapshotCoverageNodeCount=2/5",
      "handoffContract.state=pending",
      "handoffOutcome=write_deferred",
      "priority recovery residual witnesses=0"
    ],
    "missingCausalEdge": "The remaining unknown is whether publication convergence owns the OPEN epoch-2 write_deferred handoff completion or whether the edge should migrate to a downstream active-gate consumer boundary.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
    "boundedProgressProof": "This gate must select a route without runtime edits: bounded publication runtime successor, owner-boundary migration, architecture gap, or human stop.",
    "boundedProgressProofArtifact": "work/packages/done-20260519-topology-publication-active-gate-reconcile-runtime.md and test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "expectedObservableTransition": "Classification selects one concrete next owner route before runtime promotion.",
    "maxProgressBound": "one causal-escalation handoff package before any runtime successor",
    "sameFrontierFallback": "If focused proof cannot name a concrete producer or consumer edge, do not open another local runtime package.",
    "expectedNextFrontier": "work/packages/active-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md as the selected runtime-owner-boundary successor",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-active-gate-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-operation-workflow-progress-advance-existing-operation-runtime.md / operation_workflow_owner / workflow_progress / same-frontier"
    ],
    "oscillationCheck": "Frontier remains in topology_publication_owner / publication_convergence after multiple publication reductions; this package is causal-escalation because validation requires a cross-boundary handoff check before another local runtime patch.",
    "handoffInvariant": "Runtime promotion is blocked until the gate proves whether OPEN/write_deferred is a publication producer debt or a downstream active-gate consumer debt."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "same owner and boundary reselected after a representative reduction",
      "fresh shape changed from absent contract to concrete pending owner reconcile handoff",
      "priority residual witnesses remain zero",
      "active-gate runtime promotion remains downstream"
    ],
    "choices": [
      {
        "id": "publication-open-write-deferred-runtime-successor",
        "summary": "Run one metadata-only causal gate, then open a bounded runtime-owner-boundary successor if the OPEN/write_deferred handoff remains publication-owned.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "publication-open-write-deferred-runtime-successor",
    "nextAction": "Run the bounded runtime-owner-boundary successor selected by this causal gate."
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "architecture-or-human-stop",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json"
    ],
    "decisionRecord": "Record the causal gate result in this package and sprint before promoting runtime files.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Runtime/test files stay in candidateRuntimeFiles until this causal gate selects a bounded runtime-owner-boundary successor."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify the OPEN epoch-2 handoff write_deferred publication_pending shape before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-19",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md"
}
-->

## Why

The fresh representative rerun reduced the prior absent-contract edge but stayed on the same publication owner boundary with a new concrete OPEN/write_deferred handoff shape. This package classifies that oscillation before another runtime edit.

## Scope Basis

Rolling-restart release-gate closure in the AGPL roadmap scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the package is a metadata-only cross-boundary handoff gate with runtime files held as candidates.
- Escalation trigger to a heavier lane: focused proof cannot name a concrete producer or consumer edge, or ownership migrates outside the declared boundary.

## Core Logic Brief

- Canonical outcome: classify whether topology_publication_owner / publication_convergence still owns the OPEN epoch-2 write_deferred publication_pending shape.
- Inputs/signals: fresh route-after-rerun, handoff-probe, and causal-model output for `test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`.
- State model or invariant: collect one fresh residual snapshot, compare route owner/boundary, handoff contract state, pending reconcile count, priority residual witnesses, and active-gate promotion state, then emit one route: bounded publication runtime successor, owner-boundary migration, architecture gap, or human stop.
- Non-goals and forbidden interpretations: do not patch runtime, tests, scripts, reports, operation workflow, startup active-gate, readiness, admission, or timeout behavior in this gate.
- Proof mapping: route-after-rerun proves owner selection, handoff-probe proves producer/consumer edge shape, and causal-model proves whether local fix remains allowed.
- Wrong-slice trigger: stop or migrate if proof no longer selects topology_publication_owner / publication_convergence or if the OPEN/write_deferred edge is downstream consumer debt.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | same owner is reselected after a concrete reduction, so oscillation must be classified before runtime | causal gate route classification | select bounded successor, migration, architecture gap, or human stop | `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending` |
| handoff contract | pending owner_reconcile_pending with write_deferred outcome | publication emitted a concrete contract; the next decision is whether owner reconcile completion is still producer-owned | require cross-boundary handoff proof | no runtime promotion before classification | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe` |
| priority residuals | zero witnesses | operation workflow remains frozen | keep forbidden owners frozen | no operation-workflow patch | `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json` |

- Anti-symptom rationale: the package classifies the publication producer/active-gate consumer handoff edge directly instead of patching downstream stalled snapshot symptoms.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe`
- Competing explanations: publication producer debt, downstream active-gate consumer lag, stale instrumentation, or architecture gap in the handoff contract.
- Systemic interaction scan: compare producer publication state, consumer active-gate state, retry/lifecycle evidence, and evidence-generation fields before assigning implementation scope.
- Ping-pong stop rule: do not open another local runtime patch unless this gate records a selected route and concrete edge.
- Oscillation guard: this is not another same-frontier symptom patch because runtime files are candidates only, the prior absent-contract shape reduced, and the gate must select or reject a concrete OPEN/write_deferred producer-consumer edge before implementation.

## Decision Experiment Gate

- Decision question: Is the OPEN epoch-2 write_deferred handoff still a publication-convergence producer debt, or should the next owner migrate downstream?
- Architecture review: topology_publication_owner / publication_convergence causal-escalation handoff route for the publication-active-gate contract; no runtime edit in this package, and user direction permits architecture changes without stopping for another question.
- Competing hypotheses: publication owner still owes reconcile publication; active-gate consumer is stalled after receiving a valid contract; evidence is stale; the contract lacks an architecture field needed to classify ownership.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe`
- Success metrics: select exactly one next route with evidence: bounded runtime successor, owner-boundary migration, architecture gap, or human stop.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: if proof cannot classify a concrete route from the fresh artifact, stop for architecture or human escalation.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`
- Expected delta: classify the OPEN/write_deferred handoff before runtime promotion.
- Local proof class: focused causal handoff proof only.
- Representative proof class: fresh representative rerun belongs to the selected runtime successor, not this gate.
- Stop if unchanged: unchanged same-frontier without a selected route blocks another local runtime patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `architecture-or-human-stop`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: this package records the causal gate route before runtime promotion.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: candidate runtime files move to write scope only in the selected runtime-owner-boundary successor.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question: package doctor, evidence summary, focused handoff extractor, owner-files extractor, or subagent prompt.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose.
2. Keep proof to route-after-rerun, handoff-probe, causal-model, and validation unless a canonical extractor is insufficient.
3. Runtime promotion must open a successor package with normal subagent sequencing.

## In Scope

1. work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. `src/`
2. `test/`
3. `scripts/`
4. operation workflow runtime
5. startup active-gate, readiness, admission, and timeout runtime

## Model Fit

- Package class: `causal-escalation-owner-handoff`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/`, `test/`, `scripts/`
- Frozen decisions: no runtime, test, script, or report edits in this gate.
- Escalation triggers: proof migrates owner, cannot classify the edge, or requires forbidden files.
- Focused proof: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json`
- Model ledger advisory: `escalate`

## Subagent Progress Ledger

- [x] not-needed causal-escalation handoff: no runtime, test, script, or report write scope is active; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md` required causal-escalation before another local runtime patch; next: validate metadata-only gate and run focused proof.

## Validation

1. npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json

## Commit And Push Ledger

- [x] Focused package commit: `80390bda`
- [x] Pushed to: `origin/codex/pending-ack-eligibility-filter`
- [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes
