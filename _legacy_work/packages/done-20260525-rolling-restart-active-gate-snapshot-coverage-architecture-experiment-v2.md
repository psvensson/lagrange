# Rolling Restart Active Gate Snapshot Coverage Architecture Experiment V2

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-25",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The architecture experiment distinguished H1 Cache Watermark as the active-gate snapshot coverage blocker under load because of high enqueued write growth count (289). It selects the write-queue drain successor package.",
  "nextAction": "Triage and implement write-queue drain mechanisms inside startup_active_gate_owner snapshot_coverage.",
  "proof": [
    "falsifier: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "regression: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage",
    "supporting: causal route proof npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [
    "work/packages/active-20260525-rolling-restart-active-gate-snapshot-coverage-architecture-experiment-v2.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260525-rolling-restart-active-gate-snapshot-coverage-architecture-experiment-v2.md"
  ],
  "modelFit": {
    "packageClass": "architecture-experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-owner-discriminator/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 3
  },
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "architecture-stop-reason",
  "whyHighestLeverageNow": "This package is an architecture experiment required by the same-frontier/frontier-oscillation validator checks to classify the cache_stale_watermark and stale_replica_operations_in_flight blocker.",
  "causalGovernance": {
    "hypothesis": "Topology convergence under heavy concurrent load is blocked by stale replicas and stale cache watermarks on starting nodes due to active-gate database in-flight operations saturation.",
    "stopConditionCheck": "Use npm run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json plus topology explain before edits.",
    "expectedCausalModelChange": "This package determines the precise next runtime contract or closes as architecture-gap stop.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "The fresh rerun has activeGateState=timed_out, snapshotCoverageNodeCount=3/5, and reasons cache_stale_watermark, stale_replica_operations_in_flight.",
    "crossBoundaryReview": "All runtime files stay frozen during this metadata-only experiment package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "fresh representative rerun completed",
      "routed to startup_active_gate_owner snapshot_coverage active_gate_timed_out",
      "triage active-gate snapshot coverage with combined scenario evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream of active-gate coverage"
    ],
    "missingCausalEdge": "Whether active-gate snapshot coverage needs a cache watermark bypass or stale replica operations purge.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "boundedProgressProof": "The startup active-gate snapshot coverage reconciles the cache watermark retry timer or names the successor contract.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "expectedObservableTransition": "active_gate_snapshot_coverage reduces, migrates, or selects an architecture stop.",
    "maxProgressBound": "architecture experiment only; no runtime edits",
    "sameFrontierFallback": "If canonical extractors cannot distinguish the route, close as architecture-gap.",
    "expectedNextFrontier": "architecture-gap-stop or selected active-gate runtime contract",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-representative-green-gate.md / release_gate_owner / rolling_restart_green_gate_confirmation / representative_rerun_required"
    ],
    "oscillationCheck": "This package is activated because of validator same-frontier/frontier-oscillation rules.",
    "handoffInvariant": "Startup readiness remains downstream until active-gate snapshot coverage is resolved."
  },
  "boundedExperiment": {
    "hypothesis": "H1 Cache Watermark: The stale cache watermark is not refreshed because of metadata write-queue starvation under concurrent load. H2 Stale Replicas: Stale replica operations are not cleaned up because of active-gate startup sequence ordering issue.",
    "hypothesisDiscriminator": "H1 is chosen if pending writes and growth count dominate; H2 is chosen if pending writes are zero but stale replicas persist.",
    "expectedMetric": "selected successor contract plus active_gate_snapshot_coverage explain output details",
    "inheritsFrom": "work/packages/done-20260525-rolling-restart-representative-green-gate.md",
    "timebox": "24h",
    "mergeRequirement": "canonical route, topology explanation, owner-file context, and one selected runtime successor or explicit architecture stop",
    "killRule": "Do not edit src/ or open a runtime package until this package names one concrete wake, timeout, repair, or projection contract with proof."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "selected successor contract plus active_gate_snapshot_coverage reason set, snapshotCoverageNodeCount, selected snapshot source timeout state, owner_reconcile_pending, snapshot_repair_deferred, and runtime promotion rule",
    "predicted": "H1 Cache Watermark contract selected",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "one probe that distinguishes hypotheses; success is information, not runtime metric movement",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Keep runtime behavior frozen until the probe distinguishes competing hypotheses.",
      "Promote only the discriminated owner/boundary into a follow-on runtime or architecture package."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "experiment",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "selectedChoice": "open-architecture-package",
    "nextAction": "Select the active-gate snapshot coverage contract before runtime implementation resumes.",
    "triggerEvidence": [
      "Fresh rolling-restart route selected active_gate_snapshot_coverage after operation-workflow residuals cleared.",
      "Predecessor proof reproduced the same selected-source timeout, owner-recovery, and repair-deferred shape without a new unique runtime successor.",
      "Runtime files are forbidden until this package selects a concrete contract."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Continue local proof only after one concrete wake, timeout, repair, or projection edge is selected.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical proof names a different first owner boundary.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use this bounded architecture contract package before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json"
        ]
      }
    ]
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage",
    "evidence": "test-output/reports/rolling-restart-tell-tale-green-gate.report.json",
    "conclusion": "The enqueued control plane pending write growth count is 289, confirming the local cache watermark is starved by metadata write-queue latency. The H1 Cache Watermark hypothesis is distinguished."
  },
  "closed": "2026-05-25",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/todo-20260525-rolling-restart-cache-watermark-write-queue-drain-successor.md"
}
-->

## Why

State the focused concern and why this package owns it:
The fresh rerun of the rolling-restart scenario routed to `active_gate_snapshot_coverage` with `snapshotCoverageNodeCount=3/5` under `active_gate_timed_out` after logging table backpressure was fixed. This package owns the architecture triage to classify whether we have a stale cache watermark, a stale replica operations queue blocker, or another system bottleneck under concurrent load before resumption of runtime edits.

## Scope Basis

Approved maintenance scope or Strategic Roadmap: Lagrange Load Stabilization Plan.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits an architecture outcome for cache_stale_watermark and stale_replica_operations_in_flight.
- Inputs/signals:
  - `snapshotCoverageNodeCount` is 3/5 (under the target 5/5)
  - `selectedSnapshotObservationReasonCodes` contains `"cache_stale_watermark,stale_replica_operations_in_flight"`
  - `selectedControlPlaneOwnerQueuePendingWrites` is 4
  - `selectedControlPlaneOwnerQueuePendingWriteGrowthCount` is 289
- State model or invariant:
  - Startup active-gate nodes must not be starved of topology state or fail convergence due to un-reconciled cache watermarks.
- Non-goals and forbidden interpretations:
  - Modifying `src/` files under this experiment package. Changes to `src/` are strictly out of scope and forbidden.
- Proof mapping:
  - `npm run analyze:topology-convergence` is the primary proof discriminator to explain active-gate snapshot convergence delays.
- Wrong-slice trigger:
  - If a representative rerun shows `snapshotCoverageNodeCount` reaches 5/5 or the active gate transitions to `ready`.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision | H1 Cache Watermark selected | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage |

- Anti-symptom rationale:
  - Dropping logging backpressure successfully improved snapshot coverage from 1/5 to 3/5. Therefore, the remaining timeout is not logging table CPU starvation, but an independent cache refresh/stale replica convergence delay.
- Falsifying focused probe:
  - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage`
- Competing explanations:
  - H1: The starting nodes' local cache watermark is stale because metadata update writes are buffered/enqueued but not flushed to starting nodes.
  - H2: Stale replica operations are not cleaned up because of active-gate startup sequence ordering.
- Systemic interaction scan:
  - If enqueued writes are large (`growth count = 289`), it indicates snapshot writes are successfully enqueued but node registration lag exists.
- Ping-pong stop rule:
  - We stop and escalate to an architecture experiment rather than making recurring runtime edits inside `src/`.
- Oscillation guard:
  - Fresh evidence shows an improvement (3/5 vs 1/5), indicating we are not oscillating on the identical state but are making forward progress inside `snapshot_coverage`.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review:
  - This architecture review is conducted under the startup_active_gate_owner boundary to select the next architecture contract route.
- Competing hypotheses:
  - H1: Cache Watermark update latency.
  - H2: Stale replica operations.
- Pre-edit focused probe:
  - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage`
- Success metrics:
  - The success metric is a frontier move or a concrete count reduction in the enqueued metadata snapshot writes.
- Representative rerun:
  - A fresh representative rerun was executed using: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-tell-tale-green-gate.report.json --verbose`
- Kill rule:
  - If there is unchanged same-frontier/no-reduction evidence, we must stop and escalate before resuming runtime changes. Do not edit `src/` or open a runtime package until this package names one concrete wake, timeout, repair, or projection contract with proof.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-tell-tale-green-gate.report.json`

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-tell-tale-green-gate.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `experiment`

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question.

## Model Fit

- Package class: `architecture-experiment`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-owner-discriminator/current-frontier`
- Output profile: `medium`
- Escalation triggers:
  - owned files expand beyond this package
  - a frozen decision must be reopened
- AmbiguityScore: 3

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: none (out of scope); validation: canonical route, topology explain, and causal model; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260525-rolling-restart-active-gate-snapshot-coverage-architecture-experiment-v2.md; validation: `npm run work:validate -- --pre-impl`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. falsifier: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json
2. regression: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage
3. supporting: causal route proof npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json
