# Rolling Restart Active Gate Selected Snapshot Timeout Causal Escalation

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-29",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh representative evidence after owner-reconcile handoff enqueue has membershipPublicationHandoffOutcomeEnqueued=true but still routes active_gate_snapshot_coverage to active_gate_timed_out with selected_snapshot_source_timeout and snapshot_repair_deferred; frontier oscillation blocks another adjacent runtime-owner-boundary package without causal escalation.",
    "nextAction": "Escalate the selected snapshot timeout/repair retry route, then select and implement a non-repeated owner-owned source transition, autonomous architecture experiment, owner-boundary migration, representative-green path, or architecture-gap stop."
  },
  "scope": {
    "writeScope": [
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/publication-active-gate-handoff-contract-selection.js",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js",
      "src/control-plane/publication-active-gate-handoff-contract-evidence.js"
    ],
    "commitScope": [
      "work/packages/active-20260529-rolling-restart-active-gate-selected-snapshot-timeout-causal-escalation.md",
      "src/admin/admin-control-snapshot-repair-diagnostics.js",
      "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The predecessor moved owner-reconcile handoff enqueue evidence, but the fresh representative returned to active_gate_timed_out on the same owner/boundary; causal escalation is required before another adjacent local patch.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-route-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime ownership changes",
      "representative scenario evidence changes"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "theory-20260529-rolling-restart-active-gate-priority-recovery-coupled-invariants"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
        "regression: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
      ]
    }
  },
  "theoryLoop": {
    "enforcement": "source-code-package-required",
    "promotedTheory": "Causal escalation must select and implement a non-repeated selected snapshot timeout/repair transition, architecture experiment, owner-boundary migration, representative-green path, or architecture-gap stop before another local runtime patch.",
    "sprintGoalDelta": "Causal escalation selects a non-repeated selected snapshot timeout/repair transition, architecture experiment, owner-boundary migration, representative-green path, or architecture-gap stop before another local runtime patch.",
    "sourceChangeRequired": true,
    "successorRequired": true,
    "architectureRoute": {
      "selectedLayer": "protocol",
      "ledgerRef": "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop",
      "coupledInvariant": "startup_active_gate_owner / snapshot_coverage must not repeat adjacent local patches until causal escalation selects a non-repeated selected snapshot timeout repair transition, architecture experiment, migration, or architecture-gap stop.",
      "gapAnalysisRef": "work/packages/done-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-analysis.md"
    }
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "active_gate_timed_out / startup_active_gate_owner / snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Escalate selected snapshot timeout/repair evidence before another adjacent local runtime patch."
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the first alternate",
    "stableFacts": "Fresh representative evidence still selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage and priority recovery residual witnesses remain zero.",
    "changedFacts": "The predecessor source package changed the handoff evidence to membershipPublicationHandoffOutcomeEnqueued=true; active_gate_timed_out with selected_snapshot_source_timeout is now the dominant witness again.",
    "rejectedAlternatives": "Do not open another adjacent runtime-owner-boundary patch without causal escalation; do not patch startup readiness, benchmark_events visibility, or priority recovery while active-gate snapshot coverage is first frontier.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Escalate the selected snapshot timeout/repair retry route before implementation.",
    "missingTransitionOrObservation": "The route must select a non-repeated owner-owned retry/repair transition, architecture experiment, owner-boundary migration, representative-green path, or architecture-gap stop.",
    "smallestFalsifyingProbe": "falsifier: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "expectedMovement": "The causal escalation must select a concrete source transition or stop condition before another representative rerun.",
    "negativeResultMeans": "Record the theory result and create the next successor package instead of closing the sprint.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route",
    "predicted": "Causal escalation selects a non-repeated selected snapshot timeout/repair transition, architecture experiment, owner-boundary migration, representative-green path, or architecture-gap stop before another local runtime patch.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-representative-rerun"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared package",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children only if execution becomes unambiguous and disjoint.",
      "Create an autonomous architecture experiment if same-frontier/no-reduction repeats after this source package."
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "Causal escalation selects a non-repeated selected snapshot timeout/repair transition, architecture experiment, owner-boundary migration, representative-green path, or architecture-gap stop before another local runtime patch.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "After owner-reconcile handoff enqueue moved to true, rolling-restart remains red because selected snapshot source timeout and repair-deferred evidence still lack a non-repeated bounded transition under startup_active_gate_owner / snapshot_coverage.",
    "stopConditionCheck": "Run `npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` and the system-theory rederive before implementation to decide whether this remains a local source transition, architecture experiment, migration, or architecture-gap.",
    "expectedCausalModelChange": "Causal escalation should name a non-repeated selected snapshot timeout/repair source transition, owner-boundary migration, architecture-gap, or representative-green path before another local runtime patch.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh representative evidence is red at active_gate_snapshot_coverage with active_gate_timed_out, selected_snapshot_source_timeout, snapshot_repair_deferred, snapshot coverage 1/5, and membershipPublicationHandoffOutcomeEnqueued=true.",
    "crossBoundaryReview": "Do not patch startup readiness, benchmark_events visibility, priority recovery, or owner-reconcile handoff in this package unless causal escalation selects migration."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage selected snapshot timeout causal escalation",
    "phaseChain": [
      "Owner-recovery handoff enqueue proof made membershipPublicationHandoffOutcomeEnqueued true.",
      "Fresh representative evidence still selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
      "The current dominant witness is active_gate_timed_out with selected_snapshot_source_timeout and snapshot_repair_deferred."
    ],
    "recentFrontierHistory": [
      "work/packages/done-20260529-rolling-restart-active-gate-timeout-retry-contract.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md / operation_workflow_owner / rebalancer_handoff / migrated",
      "work/packages/done-20260529-rolling-restart-causal-stop-dominant-frontier-selection.md / diagnostics_owner / causal_analysis_framework / reduced",
      "work/packages/done-20260529-rolling-restart-active-gate-owner-reconcile-pending-control-plane-handoff.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "The same startup_active_gate_owner / snapshot_coverage family has repeated; this package must perform causal escalation before another local runtime patch.",
    "handoffInvariant": "After owner-reconcile enqueue is true, selected snapshot timeout/repair evidence must become a non-repeated source transition, architecture experiment, migration, representative-green path, or architecture-gap stop.",
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream",
      "benchmark_events SQL visibility remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "selected_snapshot_source_timeout with snapshot_repair_deferred needs causal escalation before another local patch.",
    "missingCausalEdgeProbe": "npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "falsifyingProbe": "npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "boundedProgressProof": "Causal escalation must select a bounded retry or repair-progress mechanism in src/admin/admin-control-snapshot-repair-diagnostics.js, or select migration, architecture experiment, or architecture-gap stop before source promotion.",
    "boundedProgressProofArtifact": "work/packages/active-20260529-rolling-restart-active-gate-selected-snapshot-timeout-causal-escalation.md",
    "expectedObservableTransition": "non-repeated selected snapshot timeout/repair transition, architecture experiment, owner-boundary migration, representative-green path, or architecture-gap stop",
    "maxProgressBound": "one causal-escalation package before representative rerun and route recording",
    "sameFrontierFallback": "Unchanged same-frontier evidence after causal escalation opens or selects an autonomous architecture experiment instead of another adjacent local patch.",
    "expectedNextFrontier": "selected route, migration, representative-green, or architecture-gap",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart currently routes active_gate_timed_out to startup_active_gate_owner / snapshot_coverage after owner-reconcile handoff enqueue moved to true.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json.",
      "active_gate_timed_out is the current selected symptom.",
      "startup_active_gate_owner / snapshot_coverage is the declared decision boundary for this package."
    ],
    "ownerBoundaryMap": [
      "startup_active_gate_owner / snapshot_coverage: selected package owner and boundary.",
      "Downstream owners remain frozen until the falsifier selects migration."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "Package lane is causal-escalation.",
      "Priority recovery residual witnesses are zero."
    ],
    "changedFacts": [
      "membershipPublicationHandoffOutcomeEnqueued is now true in fresh representative evidence.",
      "The selected snapshot timeout/deferred repair witness is dominant again."
    ],
    "competingTheories": [
      "H1 startup_active_gate_owner / snapshot_coverage owns a non-repeated selected snapshot timeout/repair transition.",
      "H2 repeated active-gate snapshot timeout evidence requires an autonomous architecture experiment or owner-boundary migration."
    ],
    "eliminatedTheories": [
      "A missing owner-reconcile enqueue transition is eliminated as the current dominant blocker by membershipPublicationHandoffOutcomeEnqueued=true."
    ],
    "downstreamSymptoms": [
      "startup readiness remains downstream",
      "benchmark_events visibility remains downstream"
    ],
    "transitionTable": [
      {
        "inputSignal": "active_gate_timed_out with selected_snapshot_source_timeout and snapshot_repair_deferred",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "causal escalation must select a non-repeated retry/repair transition, architecture experiment, migration, or stop.",
        "expectedEvidence": "focused causal proof selects source promotion, migration, architecture experiment, or architecture-gap evidence.",
        "falsifier": "npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
        "migrationTrigger": "the falsifier names a different owner boundary or proves this boundary cannot own the transition."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when focused evidence names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Stop as architecture-gap when focused evidence cannot select an owner-owned transition or migration."
    ],
    "wholeSystemInvariant": "Runtime edits are allowed only after the system theory selects one owner-owned transition, migration route, or architecture experiment."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-active-gate-selected-snapshot-timeout-causal-escalation.md systemTheory",
    "selectedSystemTheory": "H1 is only provisionally selected; the first proof must confirm a non-repeated transition or select architecture/migration before source edits.",
    "selectedMechanism": "contract_gap with architecture_gap as the first alternate",
    "sourceTestContract": "The concrete src/admin/admin-control-snapshot-repair-diagnostics.js source-code contract under test is selected snapshot timeout/deferred repair retry-progress emission; implementation may edit only declared source files after the causal proof selects a non-repeated owner-owned transition.",
    "falsifier": "falsifier: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage",
    "representativeExpectedMovement": "selected route moves to a concrete transition, owner-boundary migration, architecture experiment, or architecture-gap stop.",
    "killRule": "Stop on unchanged same-frontier, no-reduction, or architecture-gap evidence instead of widening the package.",
    "theoryFitScore": {
      "evidenceFit": "medium - representative evidence is fresh but the boundary is oscillating.",
      "ownerBoundaryFit": "medium - owner boundary is declared as startup_active_gate_owner / snapshot_coverage but must survive causal escalation.",
      "falsifiability": "high - the system-theory rederive must select source work, migration, architecture, or stop.",
      "representativeMovement": "medium - expected movement is route selection, migration, or architecture-gap stop.",
      "downstreamRiskContainment": "high - downstream symptoms remain frozen until owner selection is proven."
    },
    "wrongSliceTriggers": [
      "proof selects a different owner boundary",
      "proof requires runtime files outside writeScope",
      "proof cannot select a concrete transition, migration, architecture experiment, or architecture-gap stop"
    ]
  }
}
-->

## Why

Fresh representative evidence proves the owner-reconcile handoff enqueue moved, but the active-gate snapshot frontier returned to selected snapshot timeout/deferred repair. This package is a causal-escalation gate before another local runtime patch.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`.

## Core Logic Brief

- Canonical outcome: select a non-repeated owner-owned selected snapshot timeout/repair transition, architecture experiment, migration, representative-green path, or architecture-gap stop.
- Inputs/signals: fresh rolling-restart report; active_gate_snapshot_coverage explain; route-after-rerun evidence; frontier history.
- State model or invariant: repeated startup_active_gate_owner / snapshot_coverage evidence cannot be patched again until causal escalation selects the next durable route.
- Non-goals and forbidden interpretations: do not patch startup readiness, benchmark_events visibility, priority recovery, or owner-reconcile enqueue in this package.
- Proof mapping: system-theory rederive and frontier history decide whether source promotion remains valid.
- Wrong-slice trigger: stop or split if proof requires source files outside declared writeScope, names another owner boundary, or cannot produce an owner-owned transition.

## Execution Evidence

- [ ] action: freshness-review; owner: Agent <name> (<agent-id>); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-active-gate-selected-snapshot-timeout-causal-escalation.md; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-selected-snapshot-timeout-causal-escalation.md; decision: fresh; outcome: pending.
- [ ] action: implementation; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: verification-fix; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: verifier reruns focused proof and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: pending.

## Validation

1. falsifier: npm run work:system-theory:rederive -- --owner startup_active_gate_owner --boundary snapshot_coverage
2. regression: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12
3. supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage
4. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
5. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json
