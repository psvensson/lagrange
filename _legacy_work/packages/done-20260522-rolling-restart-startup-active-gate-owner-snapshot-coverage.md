# Rolling Restart Active Gate Budget Architecture Experiment

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Architecture discriminator selected H1 budget-contract debt. Canonical evidence still routes to active_gate_snapshot_coverage, the handoff contract is typed, and raw fallback shows the direct report progress has selectedControlPlaneOwnerQueueDepth=null while topology projection carries queue/outcome evidence; code inspection shows _probeClusterActiveState runs node readiness probes before snapshot coverage, so a slow readiness probe can consume the ACTIVE-gate deadline and leave selected snapshot coverage with the final 50ms retry.",
  "nextAction": "Close this experiment as successor-selected and open a runtime-owner-boundary package for startup_active_gate_owner / active_gate_probe_budget_contract: preserve meaningful snapshot coverage budget under slow readiness without widening timeouts or allowing degraded runtime promotion.",
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "The previous package reduced absent selected-source and handoff evidence to typed contracts, but the representative still fails at the same frontier and the validator blocks a third same-frontier runtime patch. The highest-leverage next move is the mandated architecture discriminator that decides whether the remaining executable edge is active-gate budget accounting, owner-recovery queue drain, owner-boundary migration, or an architecture stop.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260522-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/control-plane-snapshot-owner.js"
  ],
  "commitScope": [
    "work/packages/done-20260522-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "canonical evidence contradicts the budget-contract branch"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "H1 budget-contract debt: the selected snapshot, wait_owner_recovery handoff, and owner queue are all typed and visible, but the active gate reaches the terminal 50ms selected-source query before it can wait for owner recovery progress. H2 owner-queue debt: the observed pending write is the first frontier because write_deferred/enqueued=false never drains independent of the active-gate budget. H3 owner-boundary migration: readiness or workflow owns the first executable progress despite being downstream in canonical topology evidence.",
    "hypothesisDiscriminator": "H1 is selected if canonical evidence shows ownerRecoveryQueue.depth.state=observed, pendingWrites=1, handoffOutcome=write_deferred/enqueued=false/retryAfterMs=0, selectedSnapshotObservationRetryAfterMs=50, requiredProgressMechanism=reconcile, and budget accounting nextRequiredAction=reduce_startup_active_gate_budget_contract. H2 is selected if queue depth/outcome is absent, unknown, or owns a retry/drain action with a positive retryAfterMs. H3 is selected only if evidence summary or causal model migrates the first frontier owner.",
    "expectedMetric": "selectedSnapshotObservationRetryAfterMs, selectedSnapshotTimeoutMs, active_gate_timeout budget state, active_gate_attempts budget state, ownerRecoveryQueue depth/outcome, requiredProgressMechanism, snapshotCoverageNodeCount, and active_gate_snapshot_coverage route",
    "inheritsFrom": "work/packages/done-20260522-rolling-restart-active-gate-snapshot-watch-handoff-contract.md",
    "timebox": "24h",
    "mergeRequirement": "Canonical evidence discriminator selects one concrete runtime owner proof, owner-boundary migration, or architecture-gap stop before runtime edits.",
    "killRule": "Do not add another selected-source retry, active-gate timeout, owner-queue, or promotion patch unless this experiment names the missing budget or queue contract from canonical evidence."
  },
  "validationTier": "cross-owner",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "active_gate_probe_budget_contract",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open runtime-owner-boundary successor for ACTIVE-gate probe budget ordering/reservation."
  },
  "causalGovernance": {
    "hypothesis": "The remaining rolling-restart blocker is no longer absent handoff evidence; it is the contract between the active-gate budget and pending owner recovery. The gate emits a typed retry and wait_owner_recovery contract, but still exhausts the active-gate budget with snapshotCoverage=0/5.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json plus evidence summary and handoff probe on the fresh representative. Continue to runtime only if the experiment selects a single budget, queue, or migrated owner contract while preserving runtimePromotionAllowed=false for degraded coverage.",
    "expectedCausalModelChange": "This experiment changes no runtime state; it selected the active-gate probe budget contract as the next owner path before implementation resumes.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh artifact has active_gate_timed_out, snapshotCoverage=0/5, selectedSnapshotObservationRetryAfterMs=50, wait_owner_recovery pendingRecoveryCount=1, and causal budget nextRequiredAction=reduce_startup_active_gate_budget_contract. Code inspection shows snapshot coverage is probed after readiness, so slow readiness can exhaust the same active-gate deadline before the owner observes coverage.",
    "crossBoundaryReview": "Keep publication convergence, priority recovery, readiness support, active-gate promotion, and product/scenario timeout ceilings frozen. Only the selected successor may edit the named owner contract."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after typed selected snapshot and wait_owner_recovery handoff contracts",
    "phaseChain": [
      "publication convergence is satisfied",
      "priority recovery residuals are absent",
      "selected snapshot observation is typed repair_deferred retry with retryAfterMs=50",
      "publication active-gate handoff is pending wait_owner_recovery with pendingRecoveryCount=1",
      "owner recovery queue is observed with pendingWrites=1 but write_deferred/enqueued=false/retryAfterMs=0",
      "snapshotCoverage remains 0/5 and runtimePromotionAllowed=false"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "The active gate does not convert typed wait_owner_recovery plus observed owner queue debt into bounded reconcile progress before the active-gate budget collapses to the final 50ms selected-source query.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe",
    "boundedProgressProof": "The experiment must identify whether the next bounded progress mechanism is active-gate budget accounting, owner recovery queue drain/enqueue, or owner-boundary migration.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json",
    "expectedObservableTransition": "The package selects a concrete successor route: startup_active_gate_owner / active_gate_probe_budget_contract runtime work.",
    "maxProgressBound": "architecture experiment only; no runtime edits in this package",
    "sameFrontierFallback": "If the discriminator cannot name one contract, close as architecture-gap and do not open another same-frontier runtime patch.",
    "expectedNextFrontier": "runtime-owner-boundary successor for active-gate probe budget ordering/reservation",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260522-rolling-restart-active-gate-snapshot-coverage-timeout / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "done-20260522-rolling-restart-active-gate-snapshot-architecture-analysis / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260522-rolling-restart-active-gate-snapshot-watch-handoff-contract / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "frontier returned to startup_active_gate_owner / snapshot_coverage after several local reductions; this package is the autonomous architecture experiment required before another local runtime edit.",
    "handoffInvariant": "Typed retry or wait_owner_recovery evidence may defer and schedule owner work, but must not allow active-gate runtime promotion until snapshot coverage is safe."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The same startup_active_gate_owner / snapshot_coverage frontier returned after typed selected-source and handoff evidence was added.",
      "The active package validator rejected a third same-frontier runtime-owner-boundary package.",
      "Canonical handoff probe now shows typed wait_owner_recovery and observed owner queue evidence, so the architecture discriminator must choose the next contract before runtime edits."
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Run the bounded budget-vs-queue architecture experiment before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json"
        ]
      },
      {
        "id": "continue-local-proof",
        "summary": "Open only after the experiment names one budget or queue contract and focused proof surface.",
        "route": "continue-local-proof",
        "proof": [
          "focused owner proof selected by this experiment"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory evidence, missing artifacts, or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "canonical evidence contradiction or tool failure evidence"
        ]
      }
    ],
    "nextAction": "Execute the architecture discriminator and then open the selected successor package."
  },
  "observablePrediction": {
    "metric": "selectedSnapshotObservationRetryAfterMs, selectedSnapshotTimeoutMs, active gate budget accounting, ownerRecoveryQueue depth/outcome, requiredProgressMechanism, snapshotCoverageNodeCount, and route",
    "predicted": "Canonical proof will select H1 budget-contract debt because ownerRecoveryQueue is observed, the handoff outcome has no positive queue retry, selected snapshot retryAfterMs is 50, requiredProgressMechanism is reconcile, and causal budget accounting names reduce_startup_active_gate_budget_contract.",
    "observed": "Canonical proof selected H1: evidence summary and causal model keep the first frontier local, handoff probe shows selectedSnapshotObservationRetryAfterMs=50 and requiredProgressMechanism=reconcile, and code inspection shows _probeClusterActiveState runs readiness probes before snapshot coverage so slow readiness can consume the active-gate budget before coverage is observed.",
    "accuracy": "partial",
    "evidence": "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json; node -e raw fallback inspecting report activeGate.progress fields after canonical extractors did not expose probe ordering"
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "active_gate_probe_budget_contract",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe"
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "one probe that distinguishes hypotheses; success is information, not runtime metric movement",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose runtime behavior before canonical proof selects it",
      "the focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond package/tracker files",
      "proof requires forbidden runtime scope before route selection",
      "the implementation needs to decide system behavior instead of classifying canonical evidence"
    ],
    "childPackageCandidates": [
      "Promote the selected budget or queue contract into a runtime-owner-boundary successor.",
      "Keep runtime behavior frozen until the discriminator is recorded."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "architecture-or-human-stop",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json"
    ],
    "decisionRecord": "Record the discriminator outcome in this package; open a separate runtime package only when a concrete owner contract is selected.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Runtime promotion remains blocked while snapshot coverage is incomplete; after this package selects a stable owner/boundary local-fix route, open a runtime-owner-boundary successor for the named contract."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "active_gate_probe_budget_contract",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Runtime successor preserves meaningful snapshot coverage budget when readiness probes are slow, so the next representative either increases snapshotCoverageNodeCount, migrates owner/boundary, or passes rolling-restart.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The representative is still red at `active_gate_snapshot_coverage`, but the
previous missing evidence has moved: selected-source observation, handoff
contract, and owner queue evidence are now typed. This package owns the
architecture discriminator required before another same-frontier runtime edit.

## Scope Basis

AGPL release-gate follow-up for `rolling-restart`.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.

## Bounded Experiment

- Hypothesis: H1 budget-contract debt; H2 owner-queue debt; H3 owner-boundary migration.
- Hypothesis discriminator: use canonical evidence summary, handoff probe, and causal model on the fresh representative.
- Expected metric: selected retry budget, active-gate budget state, owner queue outcome, required progress mechanism, snapshot coverage, and route.
- Inherits from: `work/packages/done-20260522-rolling-restart-active-gate-snapshot-watch-handoff-contract.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: canonical discriminator selects one successor or stop before runtime edits.
- Kill rule: do not add a runtime patch unless the experiment names the missing contract.

## Observable Prediction

- Metric: selected retry budget, active-gate budget state, owner queue outcome, required progress mechanism, snapshot coverage, and route.
- Predicted: canonical proof selects H1 budget-contract debt.
- Observed: canonical proof selected H1; the handoff probe shows a 50ms selected snapshot retry and reconcile as the required progress mechanism, while code inspection shows readiness probes run before snapshot coverage.
- Accuracy: partial
- Evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe`; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`; raw fallback inspecting activeGate.progress fields after canonical extractors did not expose direct probe ordering.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`
- Expected delta: classification to a concrete runtime owner package, migration, architecture stop, or green.
- Local proof class: information-only architecture discriminator.
- Representative proof class: not required for this classification-only experiment.
- Stop if unchanged: close as architecture-gap and do not open another same-frontier runtime patch.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260522-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`
- Forbidden files: `src/`
- Frozen decisions: runtime behavior stays frozen until this package records the selected budget, queue, migration, or architecture-stop route.
- Escalation triggers: owned files expand beyond this package, canonical evidence contradicts the budget-contract branch, or representative evidence migrates owner/boundary.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`
- Model ledger advisory: `escalate`

## Execution Evidence

- [x] implementation: status: validated; evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json` passed; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe` passed; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json` passed; selected H1 budget-contract debt and successor `startup_active_gate_owner / active_gate_probe_budget_contract`; parent revalidated focused proof: yes; next: activate runtime successor.
- [x] verification-fix: status: validated; evidence: verifier confirmed `observablePrediction.accuracy` is `partial` in package metadata and the Observable Prediction section; parent reran `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe`, and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json` successfully after verification; changed files: `work/packages/done-20260522-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`; parent revalidated focused proof: yes; next: closure validation and successor-selected transition.
- [x] repair: status: validated; evidence: successor package was generated for `startup_active_gate_owner / active_gate_probe_budget_contract`; next: closure validation after verifier-fixer.

## Validation

1. `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe`
3. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json`
