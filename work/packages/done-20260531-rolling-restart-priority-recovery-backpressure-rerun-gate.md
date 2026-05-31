# Rolling Restart Priority Recovery Backpressure Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "priority_recovery_backpressure_rerun",
    "currentState": "Fresh evidence kept the first frontier at priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait, but reduced priority-recovery witnesses from 8 to 2.",
    "nextAction": "Close this rerun gate as reduced and continue with a fresh priority-recovery backpressure drain rerun successor.",
    "closed": "2026-05-31",
    "successor": "work/packages/superseded-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json",
      "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The current evidence classifies priority recovery as retryable backpressure with no failed invariants; the lightest valid next step is a fresh representative rerun, not a runtime source edit.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "representative-rerun",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-rerun/priority-recovery-backpressure",
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
      "theory-20260531-rolling-restart-active-gate-post-architecture-gap-rerun"
    ],
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_rerun --explain priority_recovery_partition_progress",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
      ]
    }
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Continue with a fresh representative rerun to test whether the reduced priority-recovery backpressure drains.",
    "residualCount": 1,
    "witnessCount": 2
  },
  "mechanismCard": {
    "failureMechanism": "classified priority-recovery backpressure rerun",
    "stableFacts": "The previous artifact's first frontier is priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait with 8 recovering_in_flight witnesses and causal outcome accept_classified_backpressure.",
    "changedFacts": "The active-gate same-frontier path is no longer first; active-gate is downstream of priority recovery in the fresh evidence.",
    "rejectedAlternatives": "Do not edit runtime source from retryable classified backpressure evidence with zero failed invariants.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Generate fresh rolling-restart evidence after accepting classified priority-recovery backpressure.",
    "missingTransitionOrObservation": "Fresh evidence must show representative-green, concrete reduction, owner-boundary migration, contradiction, unavailable evidence, or a new successor frontier.",
    "smallestFalsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose",
    "expectedMovement": "Fresh evidence drains or moves priority recovery backpressure, reaches green, migrates, or selects a non-local successor.",
    "negativeResultMeans": "Repeated priority-recovery backpressure requires a non-runtime successor or architecture analysis instead of another local source patch.",
    "escalationRule": "Contradictory or unavailable representative evidence records a blocked external/dependency result."
  },
  "observablePrediction": {
    "metric": "rolling-restart representative route after classified priority-recovery backpressure",
    "predicted": "Fresh evidence is green, reduced, migrated, contradictory, or routeable to a non-runtime successor before any source write.",
    "observed": "Fresh evidence stayed at priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait, but priority-recovery witnesses reduced from 8 to 2 with causal outcome accept_classified_backpressure.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "Priority recovery is classified as bounded backpressure and may drain on a fresh representative rerun without runtime source changes.",
    "hypothesisDiscriminator": "Compare the new rolling-restart artifact with the previous priority-recovery backpressure artifact and route it with canonical tools.",
    "expectedMetric": "Representative evidence exits green, reduces priority recovery witnesses, migrates owner/boundary, becomes contradictory/unavailable, or selects a non-runtime successor.",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus scenario-route and evidence-summary",
    "killRule": "If fresh evidence is unchanged, same-frontier, no-reduction, or architecture-gap, redirect to an architecture/causal successor or terminate only on a validated blocked dependency; do not open a runtime source patch from classified backpressure without a concrete owner-owned transition."
  },
  "validationTier": "single-owner",
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "routeOwner": "representative_evidence_owner",
    "routeBoundary": "rolling_restart_rerun",
    "routeDominantReason": "priority_recovery_backpressure_rerun",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative evidence reduced priority-recovery witnesses from 8 to 2 while keeping the same operation_workflow_owner / rebalancer_handoff frontier; continue with another fresh representative rerun before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_rerun",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_rerun --explain priority_recovery_partition_progress",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Classified priority-recovery backpressure can drain on a fresh representative rerun without source edits.",
    "stopConditionCheck": "Run the representative rolling-restart command, scenario-route, evidence-summary, npm run analyze:causal-model, and current-blocker repair before selecting any runtime successor.",
    "expectedCausalModelChange": "Fresh evidence should move priority recovery, reach green, migrate ownership, become contradictory or unavailable, or select a non-runtime successor without source edits.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence still has priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait, but priority-recovery witnesses reduced from 8 to 2. The causal outcome remains accept_classified_backpressure with zero failed invariants and zero exhausted budgets.",
    "crossBoundaryReview": "Runtime source, active-gate, startup readiness, release gate, and benchmark work remain frozen during the representative rerun."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority-recovery classified-backpressure representative rerun",
    "phaseChain": [
      "active-gate post-architecture-gap rerun migrated the first frontier to priority recovery",
      "priority recovery evidence is retryable recovering_in_flight backpressure with zero failed invariants",
      "fresh representative evidence is required before any runtime source write"
    ],
    "currentFirstFrontier": "representative_evidence_owner / rolling_restart_rerun observed priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait with 2 priority-recovery witnesses",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains downstream until priority recovery drains",
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate evidence moves",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md / representative_evidence_owner / rolling_restart_rerun / migrated to priority recovery"
    ],
    "oscillationCheck": "The package is a representative evidence gate, not another local priority-recovery runtime patch.",
    "handoffInvariant": "No runtime files are writable in this package.",
    "missingCausalEdge": "Fresh representative artifact route classification after classified priority-recovery backpressure.",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose",
    "boundedProgressProof": "The rerun produced bounded retry/reduction evidence: priority-recovery witnesses decreased from 8 to 2 while the remaining two witnesses stay retryable recovering_in_flight, with causal outcome accept_classified_backpressure and no failed invariants.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "expectedObservableTransition": "reduction from 8 priority-recovery witnesses to 2 while preserving a routeable successor",
    "maxProgressBound": "one representative rerun before route classification",
    "sameFrontierFallback": "Same-frontier/no-reduction evidence must not open a local runtime patch.",
    "expectedNextFrontier": "priority_recovery_partition_progress drain rerun successor",
    "resultClassification": "reduced",
    "stopCondition": "classification-only-stop"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "Fresh representative evidence kept the first frontier at priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait, but priority-recovery residual witnesses reduced from 8 to 2.",
    "successorReason": "The result is non-terminal but monotonic; continue with a fresh representative drain rerun before runtime source promotion.",
    "nextOwnerBoundary": "representative_evidence_owner / rolling_restart_rerun",
    "evidenceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently has classified priority-recovery backpressure after active-gate moved downstream.",
    "phaseChain": [
      "Post-architecture-gap rerun moved the first frontier to priority recovery.",
      "Priority recovery is retryable with recovering_in_flight witnesses.",
      "Fresh representative evidence is required before selecting runtime or closure."
    ],
    "ownerBoundaryMap": [
      "representative_evidence_owner / rolling_restart_rerun: owns this evidence refresh.",
      "operation_workflow_owner / rebalancer_handoff: owns the prior observed first frontier.",
      "startup_active_gate_owner / snapshot_coverage: downstream until priority recovery drains."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Previous artifact is test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json.",
      "Runtime source files are not in writeScope."
    ],
    "changedFacts": [
      "Active-gate is no longer the first frontier.",
      "Priority recovery backpressure is classified as retryable with zero failed invariants.",
      "This package only generates and routes fresh representative evidence."
    ],
    "competingTheories": [
      "H1 priority recovery drains on a fresh rerun.",
      "H2 priority recovery repeats and requires architecture or owner-boundary analysis.",
      "H3 fresh evidence is unavailable or contradictory."
    ],
    "eliminatedTheories": [
      "A local active-gate runtime write is not allowed from the previous same-frontier artifact."
    ],
    "downstreamSymptoms": [
      "Active-gate, startup readiness, release gate, and benchmark symptoms remain downstream until the representative route changes."
    ],
    "transitionTable": [
      {
        "inputSignal": "fresh rolling-restart rerun",
        "owner": "representative_evidence_owner / rolling_restart_rerun",
        "missingTransition": "fresh artifact route classification",
        "expectedEvidence": "green, reduced, migrated, contradictory, unavailable, or non-runtime successor route",
        "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose",
        "migrationTrigger": "scenario-route names a different owner boundary from the prior priority-recovery frontier"
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when scenario-route names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap only if fresh evidence cannot select movement, migration, green, or a valid non-runtime successor."
    ],
    "wholeSystemInvariant": "Representative evidence refresh packages do not edit runtime source."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md systemTheory",
    "selectedSystemTheory": "Fresh representative evidence is required before another runtime package can be selected.",
    "selectedMechanism": "observation_gap with scheduling_retry as the first alternate",
    "sourceTestContract": "No runtime source files are writable in this package; proof is representative evidence generation plus canonical route classification.",
    "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose",
    "representativeExpectedMovement": "fresh representative route is green, reduced, migrated, contradictory, unavailable, or names a non-runtime successor",
    "killRule": "If fresh evidence is unchanged, same-frontier, no-reduction, or architecture-gap, redirect to an architecture/causal successor or terminate only on a validated blocked dependency; do not open a runtime source patch from classified backpressure without a concrete owner-owned transition.",
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
  "commitAndPushLedgerRequired": true
}
-->

## Why

Priority recovery is currently classified as retryable backpressure. This package
refreshes representative evidence without touching runtime source.

## Scope Basis

Baseline evidence: `test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json`.
Fresh evidence target: `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: this is a representative rerun and route gate with no runtime source writes.
- Escalation trigger to a heavier lane: fresh evidence is unavailable, contradictory, or selects a cross-owner runtime successor.

## Core Logic Brief

- Canonical outcome: `representative_evidence_owner / rolling_restart_rerun` generates fresh rolling-restart evidence and routes the result before any runtime source write.
- Inputs/signals: prior artifact `test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json`; fresh output `test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json`; prior first frontier `operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait`.
- State model or invariant: runtime source remains frozen while the evidence gate determines green, reduction, migration, contradiction, unavailable evidence, or a non-runtime successor.
- Non-goals and forbidden interpretations: do not edit runtime files and do not treat classified backpressure as a source-write authorization.
- Proof mapping: the distributed rerun creates the artifact; `work:scenario-route`, `work:evidence-summary`, and `analyze:causal-model` classify the route.
- Wrong-slice trigger: stop or split if fresh evidence names a concrete runtime owner-boundary successor or requires source writes.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.

- [x] action: freshness-review; owner: Agent Dirac (019e7e6c-5eaf-7152-a755-06bcd1cb64db); files-changed: none; validation: npm run work:context passed with this active package selected; npm run work:package:doctor -- --suggest work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md failed only on this checked freshness-review line being recorded and future closure implementation evidence; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md passed; decision: fresh; outcome: validated.
- [x] action: implementation; owner: representative_evidence_owner; files-changed: test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json, work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md; validation: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose failed with a written representative artifact; npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_rerun --explain priority_recovery_partition_progress passed and reported first frontier priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait; npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json passed with causal outcome accept_classified_backpressure and 2 priority-recovery witnesses; npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json passed with firstCriticalPathNodeId=topology:priority_recovery_partition_progress, zero failed invariants, and zero exhausted budgets; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --markdown passed with 2 witnesses in operation_workflow_owner / rebalancer_handoff; parent revalidated focused proof: yes before closure; outcome: validated - representative frontier stayed at priority recovery but reduced from 8 to 2 witnesses.
- [x] action: verification-fix; owner: Agent Bohr (019e7e7b-463a-7ad2-88c8-01d3cd35fda6); files-changed: none; validation: npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md passed; npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-priority-recovery-backpressure-rerun-gate.md passed; npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_rerun --explain priority_recovery_partition_progress passed; npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json passed; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json passed; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --markdown passed; npm run work:validate -- --entry work/packages/superseded-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md; validation: npm run work:repair passed and refreshed current-blocker to work/packages/superseded-20260531-rolling-restart-priority-recovery-backpressure-drain-rerun-gate.md; parent revalidated focused proof: yes; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: f41c74ce6282f1e5fa6427f050d48cfd979cd6ec
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T16:05:40.149Z
## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --fast-local --verbose
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason priority_recovery_backpressure_rerun --explain priority_recovery_partition_progress
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json
