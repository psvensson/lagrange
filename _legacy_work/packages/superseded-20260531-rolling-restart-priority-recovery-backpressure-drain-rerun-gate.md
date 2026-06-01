# Rolling Restart Priority Recovery Backpressure Drain Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "superseded",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "priority_recovery_backpressure_drain_rerun",
    "currentState": "Fresh evidence reduced priority-recovery residual witnesses from 8 to 2 while the first frontier remained priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait.",
    "nextAction": "Run another fresh representative rolling-restart rerun to test whether the reduced priority-recovery backpressure drains, migrates, repeats without reduction, or reaches green.",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md",
      "work/packages/done-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md",
      "work/packages/todo-20260530-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-system-theory-rederive.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
      "test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md",
      "work/packages/done-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md",
      "work/packages/todo-20260530-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-system-theory-rederive.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The latest representative evidence made concrete monotonic progress without a source edit; the lightest valid next step is one more fresh representative rerun before promoting runtime source work.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "representative-rerun",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-rerun/priority-recovery-backpressure-drain",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "fresh evidence names a runtime owner boundary",
      "fresh evidence repeats priority recovery with no reduction",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-priority-recovery-backpressure-reduced-rerun"
    ],
    "theoryLedger": "no ledger update: this package was superseded before implementation because pre-implementation validation blocked another representative drain rerun; the successor system-theory rederive package records the durable route decision.",
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --fast-local --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_drain_rerun --explain priority_recovery_partition_progress",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json"
      ]
    }
  },
  "representativeResidual": {
    "status": "pending-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json",
    "frontier": "pending-before-rerun",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "priority_recovery_backpressure_drain_rerun",
    "nextAction": "Run fresh representative evidence and route the resulting artifact."
  },
  "mechanismCard": {
    "failureMechanism": "reduced classified priority-recovery backpressure drain rerun",
    "stableFacts": "The latest artifact's first frontier is still priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait with causal outcome accept_classified_backpressure.",
    "changedFacts": "Priority-recovery witnesses reduced from 8 to 2, leaving sql_transactions-p1 and sql_write_operations-p1 recovering_in_flight.",
    "rejectedAlternatives": "Do not edit runtime source from a reduced classified-backpressure rerun until fresh evidence either stops reducing, names a concrete runtime transition, or migrates.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Generate another fresh rolling-restart artifact after the observed reduction.",
    "missingTransitionOrObservation": "Fresh evidence must show representative-green, further reduction, owner-boundary migration, contradiction, unavailable evidence, or a new successor frontier.",
    "smallestFalsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --fast-local --verbose",
    "expectedMovement": "Fresh evidence drains or further reduces priority recovery backpressure, reaches green, migrates, or selects a non-local successor.",
    "negativeResultMeans": "Repeated priority-recovery backpressure with no reduction redirects to a concrete runtime/tooling successor or architecture analysis instead of another local source patch.",
    "escalationRule": "Contradictory or unavailable representative evidence records a blocked external/dependency result."
  },
  "observablePrediction": {
    "metric": "rolling-restart representative route after reduced priority-recovery backpressure",
    "predicted": "Fresh evidence is green, further reduced, migrated, contradictory, or routeable to a non-runtime successor before any source write.",
    "observed": "pending-before-rerun",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "Priority recovery is draining under bounded backpressure and may clear on one more fresh representative rerun without runtime source changes.",
    "hypothesisDiscriminator": "Compare the new rolling-restart artifact with the reduced priority-recovery backpressure artifact and route it with canonical tools.",
    "expectedMetric": "Representative evidence exits green, reduces the two remaining priority recovery witnesses, migrates owner/boundary, becomes contradictory/unavailable, or selects a concrete successor.",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus scenario-route and evidence-summary",
    "killRule": "If fresh evidence is unchanged, same-frontier, no-reduction, or architecture-gap, redirect to a concrete runtime/tooling successor or architecture/causal successor; do not open a runtime source patch from classified backpressure without a concrete owner-owned transition."
  },
  "validationTier": "single-owner",
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json",
    "routeOwner": "representative_evidence_owner",
    "routeBoundary": "rolling_restart_rerun",
    "routeDominantReason": "priority_recovery_backpressure_drain_rerun",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative evidence is green, further reduced, migrated, contradictory, unavailable, or names the next legal successor before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_drain_rerun",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_drain_rerun --explain priority_recovery_partition_progress",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Reduced classified priority-recovery backpressure can drain on a fresh representative rerun without source edits.",
    "stopConditionCheck": "Run the representative rolling-restart command, scenario-route, evidence-summary, npm run analyze:causal-model, and current-blocker repair before selecting any runtime successor.",
    "expectedCausalModelChange": "Fresh evidence should further reduce or clear priority recovery, reach green, migrate ownership, become contradictory or unavailable, or select a concrete successor without source edits.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Previous evidence has priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait with 2 recovering_in_flight witnesses, causal outcome accept_classified_backpressure, and zero failed invariants.",
    "crossBoundaryReview": "Runtime source, active-gate, startup readiness, release gate, and benchmark work remain frozen during the representative rerun."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart reduced priority-recovery backpressure representative rerun",
    "phaseChain": [
      "post-architecture-gap rerun migrated the first frontier to priority recovery with 8 witnesses",
      "priority recovery backpressure rerun reduced witnesses from 8 to 2",
      "fresh representative evidence is required before any runtime source write"
    ],
    "currentFirstFrontier": "representative_evidence_owner / rolling_restart_rerun / priority_recovery_backpressure_drain_rerun pending-before-rerun",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains downstream until priority recovery drains",
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate evidence moves",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md / representative_evidence_owner / rolling_restart_rerun / migrated to priority recovery",
      "done-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md / representative_evidence_owner / rolling_restart_rerun / reduced priority recovery from 8 to 2 witnesses"
    ],
    "oscillationCheck": "The package follows concrete reduction and is not another local priority-recovery runtime patch.",
    "handoffInvariant": "No runtime files are writable in this package.",
    "missingCausalEdge": "Fresh representative artifact route classification after reduced classified priority-recovery backpressure.",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --fast-local --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --fast-local --verbose",
    "boundedProgressProof": "The rerun must produce bounded retry, timeout, reconcile, drain, delivery, or routeable successor evidence: green, reduced, migrated, contradictory, unavailable, or concrete successor.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json",
    "expectedObservableTransition": "representative-green, further reduction, owner-boundary migration, contradiction, unavailable evidence, or concrete successor route",
    "maxProgressBound": "one representative rerun before route classification",
    "sameFrontierFallback": "Same-frontier/no-reduction evidence must not open a local runtime patch.",
    "expectedNextFrontier": "pending-before-rerun",
    "resultClassification": "pending-before-probe",
    "stopCondition": "classification-only-stop"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently has reduced but unresolved classified priority-recovery backpressure.",
    "phaseChain": [
      "Post-architecture-gap rerun moved the first frontier to priority recovery.",
      "Priority recovery backpressure reduced from 8 witnesses to 2 on a fresh rerun.",
      "Fresh representative evidence is required before selecting runtime or closure."
    ],
    "ownerBoundaryMap": [
      "representative_evidence_owner / rolling_restart_rerun: owns this evidence refresh.",
      "operation_workflow_owner / rebalancer_handoff: owns the prior observed first frontier.",
      "startup_active_gate_owner / snapshot_coverage: downstream until priority recovery drains."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Previous artifact is test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json.",
      "Runtime source files are not in writeScope."
    ],
    "changedFacts": [
      "Priority recovery witness count reduced from 8 to 2.",
      "The remaining priority recovery backpressure is classified as retryable with zero failed invariants.",
      "This package only generates and routes fresh representative evidence."
    ],
    "competingTheories": [
      "H1 priority recovery drains on another fresh rerun.",
      "H2 priority recovery repeats without reduction and requires architecture or runtime successor selection.",
      "H3 fresh evidence is unavailable or contradictory."
    ],
    "eliminatedTheories": [
      "A local active-gate runtime write is not allowed while priority recovery remains first."
    ],
    "downstreamSymptoms": [
      "Active-gate, startup readiness, release gate, and benchmark symptoms remain downstream until the representative route changes."
    ],
    "transitionTable": [
      {
        "inputSignal": "fresh rolling-restart rerun",
        "owner": "representative_evidence_owner / rolling_restart_rerun",
        "missingTransition": "fresh artifact route classification",
        "expectedEvidence": "green, reduced, migrated, contradictory, unavailable, or concrete successor route",
        "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --fast-local --verbose",
        "migrationTrigger": "scenario-route names a different owner boundary from the prior priority-recovery frontier"
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when scenario-route names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap only if fresh evidence cannot select movement, migration, green, or a valid successor."
    ],
    "wholeSystemInvariant": "Representative evidence refresh packages do not edit runtime source."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md systemTheory",
    "selectedSystemTheory": "Fresh representative evidence is required before another runtime package can be selected.",
    "selectedMechanism": "observation_gap with scheduling_retry as the first alternate",
    "sourceTestContract": "No runtime source files are writable in this package; proof is representative evidence generation plus canonical route classification.",
    "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --fast-local --verbose",
    "representativeExpectedMovement": "fresh representative route is green, further reduced, migrated, contradictory, unavailable, or names a concrete successor",
    "killRule": "If fresh evidence is unchanged, same-frontier, no-reduction, or architecture-gap, redirect to a concrete runtime/tooling successor or architecture/causal successor; do not open a runtime source patch from classified backpressure without a concrete owner-owned transition.",
    "theoryFitScore": {
      "evidenceFit": "high - the package runs the representative scenario that decides the next route.",
      "ownerBoundaryFit": "high - representative_evidence_owner / rolling_restart_rerun owns rerun generation.",
      "falsifiability": "high - the rerun command produces or fails to produce the artifact.",
      "representativeMovement": "high - route classification compares the fresh artifact to the prior frontier.",
      "downstreamRiskContainment": "high - runtime and downstream owners stay frozen during evidence generation."
    },
    "wrongSliceTriggers": [
      "proof needs runtime source edits",
      "fresh evidence names a concrete runtime owner-boundary successor",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "theoryLedger": "no ledger update: this package was superseded before implementation because pre-implementation validation blocked another representative drain rerun; the successor system-theory rederive package records the durable route decision.",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Priority recovery showed concrete monotonic progress but remains the first
rolling-restart frontier. This package refreshes representative evidence without
touching runtime source.

## Scope Basis

Baseline evidence: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`.
Fresh evidence target: `test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: this is a representative rerun and route gate with no runtime source writes.
- Escalation trigger to a heavier lane: fresh evidence is unavailable, contradictory, repeats with no reduction, or selects a cross-owner runtime successor.

## Core Logic Brief

- Canonical outcome: `representative_evidence_owner / rolling_restart_rerun` generates fresh rolling-restart evidence and routes the result before any runtime source write.
- Inputs/signals: prior artifact `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`; fresh output `test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json`; prior first frontier `operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait` with 2 remaining witnesses.
- State model or invariant: runtime source remains frozen while the evidence gate determines green, further reduction, migration, contradiction, unavailable evidence, or a concrete successor.
- Non-goals and forbidden interpretations: do not edit runtime files and do not treat classified backpressure as a source-write authorization.
- Proof mapping: the distributed rerun creates the artifact; `work:scenario-route`, `work:evidence-summary`, and `analyze:causal-model` classify the route.
- Wrong-slice trigger: stop or split if fresh evidence names a concrete runtime owner-boundary successor or requires source writes.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.

- [x] action: freshness-review; owner: Agent Socrates (019e7e7f-459a-7ca1-9b27-8eb6da884c5d); files-changed: none; validation: npm run work:context passed; npm run work:package:doctor -- --suggest work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md failed on representative-progress-circuit-breaker; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md passed; decision: stale; outcome: superseded.
- [x] action: implementation; owner: representative_evidence_owner; files-changed: none; validation: implementation did not start because pre-implementation validation blocked another local representative_evidence_owner / rolling_restart_rerun slice after the last three closed packages did not shrink artifact-bound representative residualCount; parent revalidated focused proof: yes; outcome: superseded.
- [x] action: verification-fix; owner: representative_evidence_owner; files-changed: none; validation: stale review selected system-theory rederive / architecture-route redirection before any fresh drain rerun; parent revalidated focused proof: yes; outcome: superseded.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: successor system-theory rederive package selected for operation_workflow_owner / rebalancer_handoff after frontier-history reported same-mechanism-repeat contract_gap; outcome: superseded.

## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --fast-local --verbose
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_drain_rerun --explain priority_recovery_partition_progress
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-drain-rerun.report.json
