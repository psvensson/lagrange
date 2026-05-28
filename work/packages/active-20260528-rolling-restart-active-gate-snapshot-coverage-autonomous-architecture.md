# Rolling Restart Active Gate Snapshot Coverage Autonomous Architecture

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh representative evidence cleared priority-recovery residuals and returned to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage, but repeated recent same-boundary runtime packages block another local runtime patch.",
    "nextAction": "Run an autonomous architecture experiment that selects the exact snapshot coverage contract, owner-boundary migration, or architecture-gap stop before runtime edits."
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [
      "src/control-plane/owner-queue.js",
      "src/control-plane/snapshot-service.js",
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/admin/admin-control-snapshot-publication-convergence-diagnostics.js"
    ],
    "commitScope": [
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the rolling-restart representative gate by selecting the current first frontier active_gate_snapshot_coverage contract after validator history rejects a third local runtime package.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-discriminator/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "proof selects a concrete runtime file and source/test contract",
      "proof names a different owner boundary for snapshot coverage progress",
      "fresh evidence contradicts startup_active_gate_owner / snapshot_coverage ownership"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260522-snapshot-watch-handoff-contract",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260526-rolling-restart-restarted-node-admin-surface",
      "theory-20260526-rolling-restart-control-snapshot-authority-recovery"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "regression: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
      ]
    }
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with ownership_gap as the selected alternate",
    "stableFacts": "Fresh route selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out and no priority-recovery residual witnesses.",
    "changedFacts": "The previous priority_recovery_partition_progress split did not reproduce on fresh representative evidence; route-after-rerun moved the active blocker back to snapshot coverage.",
    "rejectedAlternatives": "Do not open another same-boundary runtime patch before an autonomous architecture discriminator; keep generic timeout, transport, admin API, table bootstrap, and promotion-gate edits frozen.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Active gate times out waiting for snapshot coverage after priority recovery residuals clear.",
    "missingTransitionOrObservation": "The architecture proof must name the owner-owned wake, retry, reconcile, drain, or handoff contract that turns available evidence into snapshot coverage progress.",
    "smallestFalsifyingProbe": "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "expectedMovement": "Select a concrete snapshot coverage contract, owner-boundary migration, or architecture-gap stop before runtime edits.",
    "negativeResultMeans": "If no contract can be selected, close as architecture-gap instead of opening another local runtime patch.",
    "escalationRule": "Repeated startup_active_gate_owner / snapshot_coverage runtime routes require architecture selection before local implementation resumes."
  },
  "causalGovernance": {
    "hypothesis": "Repeated startup active-gate snapshot coverage failures require an architecture discriminator before another local runtime patch.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "expectedCausalModelChange": "The package selects a concrete wake, retry, reconcile, drain, owner-boundary migration, or architecture-gap stop for snapshot coverage progress.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Recent packages already exercised startup_active_gate_owner / snapshot_coverage runtime routes, and fresh evidence again reports active_gate_timed_out after priority-recovery residuals clear.",
    "crossBoundaryReview": "Operation workflow, generic rebalancer, transport, admin API, table bootstrap, generic timeout, and promotion gates remain frozen unless canonical proof selects them."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active gate snapshot coverage autonomous architecture",
    "phaseChain": [
      "owner recovery queue drain proof moved priority recovery to the first frontier",
      "priority recovery architecture rerun cleared priority residual witnesses",
      "fresh route returned to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "benchmark table bootstrap remains downstream while active gate snapshot coverage is incomplete",
      "selected-source timeout remains downstream until the owner coverage contract is selected",
      "startup readiness remains downstream unless the architecture proof migrates ownership"
    ],
    "missingCausalEdge": "The owner-owned snapshot coverage contract must choose wake, retry, reconcile, drain, handoff, or migration before runtime implementation resumes.",
    "missingCausalEdgeProbe": "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Architecture must select a concrete wake, retry, reconcile, drain, dispatch, or owner-boundary migration mechanism before runtime edits resume.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "expectedObservableTransition": "selected snapshot coverage contract, owner-boundary migration, or architecture-gap stop",
    "maxProgressBound": "one autonomous architecture experiment with no runtime edits",
    "sameFrontierFallback": "If the architecture proof cannot select a concrete contract or migration, stop as architecture-gap.",
    "expectedNextFrontier": "selected startup active-gate snapshot coverage contract or migration",
    "resultClassification": "pending-before-probe",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "done-20260528-rolling-restart-snapshot-coverage-architecture-discriminator.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "done-20260528-priority-recovery-split-residual-architecture-experiment.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This package is activated because validator same-frontier rules rejected another startup_active_gate_owner / snapshot_coverage runtime package.",
    "handoffInvariant": "Runtime promotion remains blocked until this architecture package selects one owner-owned contract or migration route."
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Run autonomous architecture proof before runtime promotion."
  },
  "observablePrediction": {
    "metric": "snapshot coverage architecture route selection",
    "predicted": "The architecture experiment selects a concrete snapshot coverage contract, owner-boundary migration, or architecture-gap stop.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "metricDelta": 0
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "Select an autonomous architecture route for repeated active_gate_snapshot_coverage before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "current-blocker refresh: npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-autonomous-architecture.md"
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "route-after-rerun selected startup_active_gate_owner / snapshot_coverage",
      "priority recovery residual witness count is 0",
      "validator rejected another runtime-owner-boundary package for this repeated snapshot coverage frontier"
    ],
    "selectedChoice": "autonomous-architecture-experiment",
    "nextAction": "Run architecture proof and select a concrete contract, migration, or architecture-gap stop.",
    "choices": [
      {
        "id": "autonomous-architecture-experiment",
        "summary": "Use this package to select the snapshot coverage contract before runtime implementation resumes.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
          "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json"
        ]
      },
      {
        "id": "runtime-owner-boundary",
        "summary": "Open runtime work only after this proof names a concrete owner-owned mechanism.",
        "route": "continue-local-proof",
        "proof": [
          "selected by this package before runtime edits"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate only if canonical proof names a different deciding owner.",
        "route": "owner-boundary-migration",
        "proof": [
          "selected by this package before runtime edits"
        ]
      }
    ]
  },
  "boundedExperiment": {
    "hypothesis": "The repeated snapshot coverage frontier needs architecture route selection before another startup active-gate runtime patch.",
    "hypothesisDiscriminator": "H1 is supported if proof selects a concrete startup active-gate contract; H2 is supported if proof migrates ownership; H3 is supported if proof cannot select a contract and closes as architecture-gap.",
    "expectedMetric": "selected contract, owner-boundary migration, or architecture-gap stop",
    "inheritsFrom": "test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json",
    "timebox": "24h",
    "mergeRequirement": "scenario-route, frontier-history, causal-model, current-blocker repair, entry/pre-implementation validation, and closure validation",
    "killRule": "If proof cannot select a concrete contract or migration, stop as architecture-gap instead of opening another local runtime patch."
  },
  "validationTier": "release-gate",
  "theoryLedger": "no-ledger-update"
}
-->

## Why

Fresh representative evidence cleared the priority-recovery split and returned the sprint to startup active-gate snapshot coverage. Because this owner/boundary has repeated without a validated contract, this package selects the architecture route before runtime work resumes.

## Core Logic Brief

- Canonical outcome: select a snapshot coverage contract, owner-boundary migration, or architecture-gap stop.
- Inputs/signals: route-after-rerun result, frontier history, causal model, and owner files if needed.
- State model or invariant: repeated same-boundary active-gate snapshot coverage cannot open another local runtime patch without architecture route selection.
- Non-goals and forbidden interpretations: no runtime edits, generic timeout changes, selected-source ordering changes, admin API changes, transport edits, table bootstrap edits, or promotion-gate edits.
- Proof mapping: scenario route proves the fresh frontier, frontier history proves oscillation, and causal model constrains the selected contract.
- Wrong-slice trigger: if proof needs source edits, split a runtime child after selecting the contract.

## Mechanism Card

- Failure mechanism: `contract_gap` with `ownership_gap` as the alternate.
- Stable facts: route selects `active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out`.
- Changed facts: priority-recovery residuals dropped to zero on fresh representative evidence.
- Rejected alternatives: no third same-boundary runtime package before architecture selection.
- Owner who decides: `startup_active_gate_owner`.
- Current action: active gate times out waiting for snapshot coverage.
- Missing transition or observation: selected wake, retry, reconcile, drain, handoff, migration, or architecture-gap stop.
- Smallest falsifier: `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`.
- Expected movement: selected architecture route before runtime edits.
- Negative result means: close as architecture-gap.
- Escalation rule: runtime promotion waits for this package.

## Execution Evidence

- [ ] action: implementation; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; outcome: pending.
- [ ] action: verification-fix; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: verifier reruns focused proof before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: pending.

## Validation

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
2. `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
3. `npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-split-architecture-20260528T101601Z.report.json`
