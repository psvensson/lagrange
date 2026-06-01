# Rolling Restart Active Gate Post Architecture Gap Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "post_architecture_gap_rerun",
    "currentState": "Fresh representative evidence moved the first frontier from active_gate_snapshot_coverage to priority_recovery_partition_progress under operation_workflow_owner / rebalancer_handoff with priority_recovery_event_driven_wait.",
    "nextAction": "Close this rerun gate as migrated and continue through the priority recovery rebalancer handoff successor; do not open another local active-gate runtime patch from the previous same-frontier artifact.",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
      "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The current owner-boundary source package cannot pass pre-implementation; fresh representative evidence is the smallest allowed route that can prove green, movement, migration, or a new successor.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "representative-rerun",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-rerun/post-architecture-gap",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "fresh evidence names a runtime owner boundary",
      "fresh evidence repeats the same frontier with no metric reduction",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-active-gate-observation-route-implementation",
      "theory-20260531-rolling-restart-active-gate-observation-route-same-frontier-rerun",
      "theory-20260531-rolling-restart-active-gate-observation-route-architecture-gap"
    ],
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason post_architecture_gap_rerun --explain active_gate_snapshot_coverage",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json"
      ]
    }
  },
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Continue through the priority recovery rebalancer handoff successor.",
    "residualCount": 1
  },
  "mechanismCard": {
    "failureMechanism": "representative evidence refresh after architecture-gap stop",
    "stableFacts": "The previous fresh artifact stayed at active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending with runtimePromotionGuard blocked.",
    "changedFacts": "The architecture selector is superseded and the generated source successor fails pre-implementation on representative-progress circuit-breaker.",
    "rejectedAlternatives": "Do not edit runtime source while the queued runtime package fails pre-implementation validation.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Generate fresh rolling-restart evidence and classify the route.",
    "missingTransitionOrObservation": "Fresh evidence must show representative-green, concrete reduction, owner-boundary migration, contradiction, or the next legal successor.",
    "smallestFalsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose",
    "expectedMovement": "Fresh evidence changes the representative result or confirms the next legal non-runtime route.",
    "negativeResultMeans": "Same-frontier/no-reduction evidence keeps runtime source frozen and requires another non-local successor.",
    "escalationRule": "Contradictory or unavailable representative evidence records a blocked external/dependency result; same-frontier evidence must not open another local active-gate runtime patch."
  },
  "observablePrediction": {
    "metric": "rolling-restart representative route after architecture-gap selector",
    "predicted": "Fresh evidence is green, reduced, migrated, contradictory, or routeable to a non-runtime successor before any source write.",
    "observed": "Fresh evidence migrated the first frontier to priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait with 8 priority-recovery witnesses and causal outcome accept_classified_backpressure.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "Fresh representative evidence is the next valid discriminator because local startup_active_gate_owner / snapshot_coverage runtime work is blocked before implementation.",
    "hypothesisDiscriminator": "Compare the new rolling-restart artifact with the previous active-gate observation-route rerun and route it with canonical tools.",
    "expectedMetric": "Representative evidence exits green, reduces active_gate_snapshot_coverage, migrates owner/boundary, becomes contradictory/unavailable, or selects a non-runtime successor.",
    "inheritsFrom": "work/packages/superseded-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus scenario-route and evidence-summary",
    "killRule": "Do not open another local active-gate runtime patch from same-frontier/no-reduction evidence."
  },
  "validationTier": "single-owner",
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json",
    "routeOwner": "representative_evidence_owner",
    "routeBoundary": "rolling_restart_rerun",
    "routeDominantReason": "post_architecture_gap_rerun",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative evidence migrated the first frontier to operation_workflow_owner / rebalancer_handoff priority recovery backpressure; active-gate remains deferred but is no longer first.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason post_architecture_gap_rerun",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason post_architecture_gap_rerun --explain active_gate_snapshot_coverage",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Fresh representative evidence is the only valid discriminator while local startup_active_gate_owner / snapshot_coverage source work is blocked before implementation.",
    "stopConditionCheck": "Run the representative rolling-restart command, scenario-route, evidence-summary, npm run analyze:causal-model, and current-blocker repair before selecting any runtime successor.",
    "expectedCausalModelChange": "Fresh evidence should either move the representative route, migrate ownership, reach green, become contradictory or unavailable, or select a non-runtime successor without source edits.",
    "representativeOutcome": "migrated",
    "causalDebt": "The new first frontier is priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait with 8 recovering_in_flight witnesses and causal outcome accept_classified_backpressure. Active-gate snapshot coverage remains deferred with owner_reconcile_pending but is now downstream of priority recovery.",
    "crossBoundaryReview": "Do not patch startup active-gate source from this result; priority recovery rebalancer handoff now owns the first frontier."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart post-architecture-gap representative rerun",
    "phaseChain": [
      "observation-route implementation selected wait_owner_recovery in focused proof",
      "fresh representative evidence stayed at active_gate_snapshot_coverage with owner_reconcile_pending",
      "same-frontier architecture selector was superseded after it could not authorize a valid local source package",
      "fresh representative evidence is required before another runtime source write"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate evidence moves",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red",
      "benchmark_events table partition visibility remains downstream until the representative route changes"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-active-gate-observation-route.md / startup_active_gate_owner / snapshot_coverage / focused route visible",
      "done-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md / representative_evidence_owner / rolling_restart_rerun / same-frontier",
      "superseded-20260531-rolling-restart-active-gate-observation-route-same-frontier-architecture-experiment.md / startup_active_gate_owner / snapshot_coverage / runtime source blocked"
    ],
    "oscillationCheck": "The package is a representative evidence gate, not another local active-gate runtime patch.",
    "handoffInvariant": "No runtime files are writable in this package.",
    "missingCausalEdge": "Fresh representative artifact route classification after the architecture-gap selector.",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose",
    "boundedProgressProof": "The rerun produced bounded retry/event-driven wait evidence: priority recovery is retryable with recovering_in_flight witnesses, causal outcome accept_classified_backpressure, and no failed invariants.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json",
    "expectedObservableTransition": "owner-boundary migration from active-gate snapshot coverage to priority recovery rebalancer handoff",
    "maxProgressBound": "one representative rerun before route classification",
    "sameFrontierFallback": "Same-frontier/no-reduction evidence must not open another local active-gate runtime patch.",
    "expectedNextFrontier": "operation_workflow_owner / rebalancer_handoff priority recovery successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "representative_evidence_owner",
    "fromBoundary": "rolling_restart_rerun",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "Fresh representative evidence moved the first topology frontier to priority_recovery_partition_progress with owner operation_workflow_owner, boundary rebalancer_handoff, and dominant reason priority_recovery_event_driven_wait.",
    "evidence": "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress"
  },
  "closureSummary": {
    "resultClassification": "migrated",
    "predictionAccuracy": "partial",
    "observedMovement": "Fresh representative evidence moved the first frontier from active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending to priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait. Priority recovery has 8 recovering_in_flight witnesses, causal outcome accept_classified_backpressure, and no failed invariants.",
    "successorReason": "Continue through priority recovery rebalancer handoff; do not open another local active-gate runtime patch from the previous same-frontier artifact.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart is blocked because the active-gate owner-boundary source path is not pre-implementation valid after the same-frontier architecture-gap selector.",
    "phaseChain": [
      "The observation-route implementation selected wait_owner_recovery in focused proof.",
      "Fresh representative evidence stayed at active_gate_snapshot_coverage with owner_reconcile_pending.",
      "The architecture selector was superseded after no valid repeated local source route could pass the circuit breaker.",
      "Fresh representative evidence is required to select movement, migration, green, contradiction, or a non-runtime successor."
    ],
    "ownerBoundaryMap": [
      "representative_evidence_owner / rolling_restart_rerun: owns this evidence refresh.",
      "startup_active_gate_owner / snapshot_coverage: observed prior frontier, frozen for source edits until a valid successor passes pre-implementation.",
      "release_gate_owner / rolling_restart_fully_green_gate: final downstream proof target."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Previous artifact is test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json.",
      "Runtime source files are not in writeScope.",
      "Durable contract record is architecture/contracts/active-gate-convergence.md#active-gate-convergence."
    ],
    "changedFacts": [
      "The selector package is superseded.",
      "The queued source successor fails pre-implementation on representative-progress circuit-breaker.",
      "This package only generates and routes fresh representative evidence."
    ],
    "competingTheories": [
      "H1 fresh evidence moves, migrates, or reaches green without another source write.",
      "H2 fresh evidence stays same-frontier and proves local active-gate runtime work remains blocked.",
      "H3 fresh evidence is unavailable or contradictory."
    ],
    "eliminatedTheories": [
      "A local active-gate runtime write is not allowed before pre-implementation validation passes."
    ],
    "downstreamSymptoms": [
      "Startup readiness, release gate, priority recovery, and benchmark symptoms remain downstream until the representative route changes."
    ],
    "transitionTable": [
      {
        "inputSignal": "fresh rolling-restart rerun",
        "owner": "representative_evidence_owner / rolling_restart_rerun",
        "missingTransition": "fresh artifact route classification",
        "expectedEvidence": "green, reduced, migrated, contradictory, unavailable, or non-runtime successor route",
        "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose",
        "migrationTrigger": "scenario-route names a different owner boundary from the prior active-gate frontier"
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
    "systemTheoryRef": "work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md systemTheory",
    "selectedSystemTheory": "Fresh representative evidence is required before another runtime package can be selected.",
    "selectedMechanism": "observation_gap with contract_gap as the first alternate",
    "sourceTestContract": "No runtime source files are writable in this package; proof is representative evidence generation plus canonical route classification.",
    "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose",
    "representativeExpectedMovement": "fresh representative route is green, reduced, migrated, contradictory, unavailable, or names a non-runtime successor",
    "killRule": "Do not open another local active-gate runtime patch from same-frontier/no-reduction evidence.",
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
  "systemContractRef": "architecture/contracts/active-gate-convergence.md#active-gate-convergence",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The active-gate owner-boundary runtime successor cannot pass pre-implementation
validation. This package refreshes representative evidence without touching
runtime source, then routes the artifact through the canonical tools.

## Scope Basis

Baseline evidence: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`.
Fresh evidence target: `test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: this is a representative rerun and route gate with no runtime source writes.
- Escalation trigger to a heavier lane: fresh evidence is unavailable, contradictory, or selects a cross-owner runtime successor.

## Core Logic Brief

- Canonical outcome: `representative_evidence_owner / rolling_restart_rerun` generates fresh rolling-restart evidence and routes the result before any runtime source write.
- Inputs/signals: prior artifact `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`; fresh output `test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json`; route owner `representative_evidence_owner`; route boundary `rolling_restart_rerun`.
- State model or invariant: runtime source remains frozen while the evidence gate determines green, reduction, migration, contradiction, unavailable evidence, or a non-runtime successor.
- Non-goals and forbidden interpretations: do not edit runtime files, do not reinterpret downstream startup readiness or release-gate symptoms, and do not open another local active-gate runtime patch from same-frontier/no-reduction evidence.
- Proof mapping: the distributed rerun creates the artifact; `work:scenario-route`, `work:evidence-summary`, and `analyze:causal-model` classify the route.
- Wrong-slice trigger: stop or split if fresh evidence names a concrete runtime owner-boundary successor or requires source writes.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.

- [x] action: freshness-review; owner: Agent Wegener (019e7e55-4501-77f1-afbb-1bf0e3a53863); files-changed: none; validation: npm run work:context passed with this active package selected; npm run work:package:doctor -- --suggest work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md failed only on the freshness-review line being recorded here and closure-only implementation evidence; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md passed; decision: fresh; outcome: validated.
- [x] action: implementation; owner: representative_evidence_owner; files-changed: test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json, work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md; validation: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose failed with a written representative artifact; npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason post_architecture_gap_rerun --explain active_gate_snapshot_coverage passed and reported first frontier priority_recovery_partition_progress / operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json passed with causal outcome accept_classified_backpressure and 8 priority-recovery witnesses; npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json passed with firstCriticalPathNodeId=topology:priority_recovery_partition_progress; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --markdown passed with 8 witnesses in operation_workflow_owner / rebalancer_handoff; parent revalidated focused proof: yes; outcome: validated - representative frontier migrated to priority recovery backpressure.
- [x] action: verification-fix; owner: Agent Euclid (019e7e62-aae2-79c0-9320-d7f1bfef1c5e); files-changed: none; validation: npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md passed; npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-active-gate-post-architecture-gap-rerun-gate.md passed; npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress passed; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json passed with first frontier priority_recovery_partition_progress and 8 priority-recovery witnesses; npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json passed with firstCriticalPathNodeId=topology:priority_recovery_partition_progress, 0 failed invariants, and 0 exhausted budgets; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md; validation: npm run work:repair passed; parent revalidated focused proof: yes; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: f41c74ce6282f1e5fa6427f050d48cfd979cd6ec
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T16:05:40.149Z
## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --fast-local --verbose
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason post_architecture_gap_rerun --explain active_gate_snapshot_coverage
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-post-architecture-gap-rerun.report.json
