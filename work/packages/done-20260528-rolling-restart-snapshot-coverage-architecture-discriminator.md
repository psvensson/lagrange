# Rolling Restart Snapshot Coverage Architecture Discriminator

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Architecture proof selected the local startup active-gate contract: the owner recovery queue is observed and enqueued with pendingWrites=1, but pendingWriteGrowthCount=0, pendingReconcileCount=0, and snapshotCoverage=1/5 remain stuck.",
    "nextAction": "Close this discriminator and open a runtime-owner-boundary successor for owner-recovery queue drain/wake progress into snapshot coverage.",
    "predecessor": "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
      "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
      "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-publication-convergence-diagnostics.js",
      "src/admin/admin-control-snapshot-publication-handoff.js",
      "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js"
    ],
    "commitScope": [
      "work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Repeated fresh evidence keeps the same startup_active_gate_owner / snapshot_coverage frontier after ACK debt is closed, so the next move must select an architecture contract or owner-boundary migration before another runtime patch.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-discriminator/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "proof selects a runtime file for implementation instead of an architecture route",
      "canonical evidence contradicts startup_active_gate_owner / snapshot_coverage ownership",
      "the discriminator needs selected-source ordering, generic timeouts, readiness, admin API, transport, table bootstrap, or promotion gate edits"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260522-snapshot-watch-handoff-contract",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
        "supporting: npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
        "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    }
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the selected alternate",
    "stableFacts": "startup_active_gate_owner / snapshot_coverage remains the first frontier; representative snapshotCoverage stays 1/5; owner_reconcile_pending and write_deferred persist after ACK debt is closed.",
    "changedFacts": "pending ACK/recovery candidate filtering is locally proven; representative pendingAck is 0; publication ACK is closed; owner recovery enqueue moved to true.",
    "rejectedAlternatives": "pending ACK eligibility is rejected as the active blocker; observation_gap is rejected because route, handoff, queue, retry, and coverage facts are visible; selected-source timeout remains downstream.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Active gate exhausts snapshot coverage attempts while owner recovery remains write_deferred and coverage remains 1/5.",
    "missingTransitionOrObservation": "A named owner contract must explain how write_deferred owner recovery becomes snapshot coverage progress, or prove the typed handoff boundary must migrate.",
    "smallestFalsifyingProbe": "npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "expectedMovement": "The discriminator selects the owner-recovery queue drain/wake runtime successor before runtime edits.",
    "negativeResultMeans": "If the runtime successor cannot drain, wake, or retry the queued owner recovery write, the next package must stop as architecture-gap instead of broadening timeouts.",
    "escalationRule": "Do not open another startup_active_gate_owner runtime patch from unchanged owner_reconcile_pending/write_deferred/coverage 1/5 evidence."
  },
  "causalGovernance": {
    "hypothesis": "The remaining blocker is an architecture-level progress contract gap between write_deferred owner recovery and snapshot coverage progress.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "expectedCausalModelChange": "Select the runtime-owner-boundary successor for owner-recovery queue drain/wake progress before runtime implementation resumes.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh evidence reports ownerRecoveryQueue.depth.state=observed, pendingWrites=1, pendingWriteGrowthCount=0, handoffOutcome=write_deferred/enqueued=true/retryAfterMs=100, pendingReconcileCount=0, and snapshotCoverage=1/5.",
    "crossBoundaryReview": "Selected-source ordering, generic timeout budgets, startup readiness, admin API, transport, table bootstrap, and promotion gates remain forbidden unless this package selects them."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart snapshot coverage architecture discriminator",
    "phaseChain": [
      "owner-reconcile admission moved the sprint to active-gate snapshot coverage",
      "pending ACK/recovery eligibility was proven locally",
      "fresh representative evidence kept snapshot coverage at 1/5 with write_deferred owner recovery"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "selected-source timeout remains downstream while owner recovery is pending",
      "startup readiness remains downstream while active-gate snapshot coverage is incomplete",
      "benchmark table bootstrap remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "The owner-recovery queue drain/wake contract must convert observed pendingWrites=1 and enqueued=true into reconcile, retry, or bounded coverage progress.",
    "missingCausalEdgeProbe": "npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "boundedProgressProof": "The package selected the concrete reconcile, retry, and bounded progress mechanism: drain or wake the enqueued owner-recovery write so pendingRecoveryCount=1 can produce coverage progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "expectedObservableTransition": "runtime-owner-boundary successor selected for owner-recovery queue drain/wake progress",
    "maxProgressBound": "one architecture discriminator before another local runtime patch",
    "sameFrontierFallback": "Stop local runtime patching and keep the architecture-package route selected.",
    "expectedNextFrontier": "snapshot_coverage_owner_recovery_queue_drain runtime successor",
    "resultClassification": "classification-only",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / classified",
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md / startup_active_gate_owner / snapshot_coverage / classified",
      "done-20260528-rolling-restart-pending-ack-eligibility-filter.md / startup_active_gate_owner / snapshot_coverage / local-filter-applied",
      "done-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md / startup_active_gate_owner / snapshot_coverage / same-frontier-h1-falsified"
    ],
    "oscillationCheck": "The package is not another symptom patch because it selects the drain/wake successor from enqueued queue evidence before runtime files enter writeScope.",
    "handoffInvariant": "Do not treat route evidence as representative green; the selected successor must prove queued owner-recovery progress before promotion."
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open the owner-recovery queue drain/wake runtime-owner-boundary successor."
  },
  "observablePrediction": {
    "metric": "architecture discriminator successor shape",
    "predicted": "Artifact comparison, scenario route, and owner-files analysis select exactly one of: architecture-package route, owner-boundary migration, concrete source/test contract, or architecture-gap stop.",
    "observed": "Selected concrete source/test contract: ownerRecoveryQueue.depth.state=observed with pendingWrites=1, pendingWriteGrowthCount=0, handoffOutcome=write_deferred/enqueued=true/retryAfterMs=100, pendingReconcileCount=0, and snapshotCoverage=1/5 require owner-recovery queue drain/wake progress.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "metricDelta": 0
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "focused pending ACK/recovery eligibility proof passed",
      "fresh representative evidence kept snapshotCoverage=1/5 with owner_reconcile_pending and write_deferred",
      "artifact comparison recommends owner migration or an architecture gate before another local runtime patch"
    ],
    "selectedChoice": "owner-recovery-queue-drain-contract",
    "choices": [
      {
        "id": "owner-recovery-queue-drain-contract",
        "summary": "Open a runtime-owner-boundary successor that drains or wakes the observed owner-recovery queue write into reconcile or coverage progress.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json --handoff-probe",
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Run this bounded architecture discriminator before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
          "npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical evidence names a different owner for write_deferred recovery-to-coverage progress.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
        ]
      }
    ],
    "nextAction": "Open the owner-recovery queue drain/wake runtime-owner-boundary successor."
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "architecture-or-human-stop",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
      "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
    ],
    "decisionRecord": "Record the selected architecture route in this active package and sprint edge card before any runtime successor.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Open a runtime-owner-boundary successor for owner-recovery queue drain/wake progress; keep selected-source ordering, generic timeouts, readiness, admin API, transport, table bootstrap, and promotion gates out of scope."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Open a runtime-owner-boundary successor that drains or wakes the observed owner-recovery queue write into reconcile or coverage progress.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json --package work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "current-blocker refresh: npm run work:repair",
      "npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
      "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
      "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "Rolling-restart remains red because the observed owner-recovery queue write is not drained or woken into reconcile / coverage progress after ACK debt is closed.",
    "hypothesisDiscriminator": "H2 is supported because canonical handoff evidence shows pendingWrites=1 and enqueued=true, but pendingWriteGrowthCount=0, pendingReconcileCount=0, and snapshotCoverage=1/5 remain stuck.",
    "expectedMetric": "The package names the owner-recovery queue drain/wake runtime successor before runtime edits.",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
    "timebox": "24h",
    "mergeRequirement": "entry validation, pre-implementation validation, artifact comparison, scenario route, owner-files analysis, handoff probe, causal model, current-blocker repair, and closure validation",
    "killRule": "If the runtime successor cannot prove queue drain/wake progress, stop as architecture-gap instead of broadening timeout or selected-source scope."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage_owner_recovery_queue_drain",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json --handoff-probe selected observed ownerRecoveryQueue pendingWrites=1, pendingWriteGrowthCount=0, write_deferred/enqueued=true/retryAfterMs=100, pendingReconcileCount=0, and requiredProgressMechanism=reconcile."
  },
  "validationTier": "release-gate",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "architecture route selection only; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "runtime files remain in candidateRuntimeFiles until a contract is selected",
      "the first focused proof gives a clear contract, migration, or architecture-gap stop"
    ],
    "splitTriggers": [
      "write scope expands into runtime source or tests",
      "proof selects selected-source ordering, readiness, admin API, transport, table bootstrap, or promotion gates",
      "implementation needs system behavior changes instead of route selection"
    ],
    "childPackageCandidates": [
      "Create a runtime-owner-boundary package after this discriminator names a concrete source/test contract.",
      "Create an owner-boundary migration package if owner-files analysis selects a different deciding owner.",
      "Close as architecture-gap if canonical evidence cannot name an executable contract."
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

The sprint has now falsified pending ACK/recovery eligibility as the active blocker. Fresh evidence still stops at `startup_active_gate_owner / snapshot_coverage` with `snapshotCoverage=1/5`, `owner_reconcile_pending`, and `write_deferred`, so another local runtime patch is blocked until this package selects a contract or migration.

## Mechanism Card

- Failure Mechanism: `contract_gap`, with `ownership_gap` retained as the first alternate.
- Stable Facts: startup active gate snapshot coverage remains `1/5`; owner recovery remains `write_deferred`; `owner_reconcile_pending` remains present after ACK debt is closed.
- Changed Facts: focused pending ACK/recovery filtering passed; representative `pendingAck=0`; publication ACK closed; owner recovery enqueue is now true.
- Rejected Alternatives: pending ACK/recovery eligibility is rejected as active blocker; observation gap is rejected; selected-source timeout is downstream until owner recovery progress exists.
- Owner Who Decides: `startup_active_gate_owner`.
- Current Action: active gate exhausts snapshot coverage attempts while owner recovery remains deferred.
- Missing Transition Or Observation: how `write_deferred` owner recovery becomes snapshot coverage progress, or which adjacent owner must own that transition.
- Smallest Falsifying Probe: `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
- Expected Movement: select an architecture package route, owner-boundary migration, or concrete source/test contract before runtime edits.
- Negative Result Means: close as architecture-gap instead of opening another local runtime patch.
- Escalation Rule: no local runtime patch from unchanged owner_reconcile_pending/write_deferred/coverage `1/5` evidence.

## Core Logic Brief

- Canonical outcome: select an architecture-package route, owner-boundary migration, or concrete source/test contract for `write_deferred` recovery-to-coverage progress.
- Inputs/signals: latest representative route, artifact comparison, owner-files analysis, and the closed pending ACK eligibility proof package.
- State model or invariant: same-frontier evidence after ACK closure cannot open another local runtime patch without a selected architecture contract.
- Non-goals and forbidden interpretations: do not edit selected-source ordering, generic timeout budgets, readiness, admin API, transport, table bootstrap, or promotion gates.
- Proof mapping: the proof commands must identify the contract/migration candidate or preserve architecture-gap stop.
- Wrong-slice trigger: any runtime implementation requirement moves to a successor package with explicit write scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| same-frontier rerun | `snapshotCoverage=1/5`, `owner_reconcile_pending`, `write_deferred`, `pendingAck=0` | ACK eligibility is no longer the active blocker | select architecture package route before runtime patch | named contract, migration, or architecture-gap stop | `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json` |
| owner file evidence | `startup_active_gate_owner / snapshot_coverage` | decide whether the progress contract stays local or migrates | local contract or owner-boundary migration | one concrete successor shape | `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage` |

- Anti-symptom rationale: selected-source timeout and readiness symptoms are downstream until owner recovery progress exists.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
- Competing explanations: missing local progress contract, typed handoff owner migration, stale instrumentation, or downstream selected-source timeout.
- Systemic interaction scan: compare producer, consumer, admission, retry, handoff, coverage, and evidence projection before selecting a successor.
- Ping-pong stop rule: unchanged same-frontier evidence opens/selects architecture work, not another local runtime patch.
- Oscillation guard: this is not another same-frontier symptom patch because runtime source stays out of writeScope until this package names the contract.

## Decision Experiment Gate

- Decision question: What exact owner contract turns `write_deferred` owner recovery into snapshot coverage progress, or which boundary must own that transition?
- Architecture review: `architectureDecisionGate` is selected with route `architecture-package`; runtime implementation is blocked until the discriminator names an executable successor.
- Competing hypotheses: local startup active-gate progress contract gap; typed handoff owner migration; stale evidence projection; downstream selected-source timeout.
- Pre-edit focused probe: `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`.
- Success metrics: one concrete contract, migration, or architecture-gap stop is recorded.
- Representative rerun: focused command: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json --package work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md`.
- Kill rule: if the proof cannot name a contract or migration, close as architecture-gap and do not patch runtime.

## Runbook

1. Run `npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md`.
2. Run `npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md`.
3. Run the three proof commands in metadata.
4. Update this package and the sprint edge card with the selected contract, migration, or architecture-gap stop.
5. Run `npm run work:repair`, closure validation, close, commit, and push.

## In Scope

1. Architecture discriminator metadata and sprint/current-blocker handoff.
2. Canonical evidence comparison and owner-file analysis.
3. Selecting a successor shape before runtime edits.

## Out Of Scope

1. Runtime source or test implementation.
2. Selected-source ordering.
3. Generic timeout budgets.
4. Startup readiness, admin API, transport, table bootstrap, or promotion gates.

## Execution Evidence

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md, work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: artifact comparison, scenario route, owner-files analysis, handoff probe, causal model, and parent revalidated focused proof: yes; outcome: selected-runtime-successor.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: none; validation: npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md and npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md passed; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`
2. `npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json`
3. `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`
4. `npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md`
5. `npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md`

## Commit And Push Ledger

1. Focused package commit: 74e022772ccd93959d33507a535dac47ae62a3ba
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
