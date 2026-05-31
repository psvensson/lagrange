# Rolling Restart Active Gate Observation Route Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "post_observation_route_rerun",
    "currentState": "The observation-layer active-gate source route has local focused proof; fresh representative rolling-restart evidence is required before another runtime package or sprint closure.",
    "nextAction": "Run fresh rolling-restart representative evidence after the observation-route source implementation and route the result."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-contract-first-green-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Representative rerun is the next valid proof after the source route selected wait_owner_recovery for selected snapshot recovery-only evidence.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "representative-rerun",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "representative-rerun",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime source write is selected",
      "fresh evidence names a different owner boundary"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-active-gate-observation-route-implementation"
    ],
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json"
      ]
    }
  },
  "representativeResidual": {
    "status": "active-theory-loop",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "frontier": "post_observation_route_rerun / representative_evidence_owner / rolling_restart_rerun",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "post_observation_route_rerun",
    "nextAction": "Run fresh representative evidence and route the result.",
    "residualCount": 1
  },
  "mechanismCard": {
    "failureMechanism": "representative rerun verification",
    "stableFacts": "The source route implementation is limited to src/control-plane/publication-active-gate-handoff-contract-decision.js and focused proof selects wait_owner_recovery for selected snapshot recovery-only evidence.",
    "changedFacts": "Fresh representative evidence has not been generated after the observation-layer route implementation.",
    "rejectedAlternatives": "Do not edit runtime files in this rerun package; runtime follow-up requires fresh route evidence.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Run the rolling-restart representative scenario and route the result.",
    "missingTransitionOrObservation": "Fresh representative evidence must show whether active_gate_snapshot_coverage reduces, migrates, goes green, remains same-frontier, or records architecture-gap.",
    "smallestFalsifyingProbe": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose",
    "expectedMovement": "Fresh representative evidence moves off owner_reconcile_pending, reduces active_gate_snapshot_coverage, migrates ownership, reaches representative-green, or records architecture-gap.",
    "negativeResultMeans": "Record the routed result and open the selected successor instead of widening this verification package.",
    "escalationRule": "Same-frontier or needs-rerun evidence keeps the theory-loop sprint active."
  },
  "observablePrediction": {
    "metric": "rolling-restart / startup_active_gate_owner / snapshot_coverage / representative route after observation-route implementation",
    "predicted": "Fresh representative evidence reflects the local route by reducing or moving active_gate_snapshot_coverage away from saturated owner_reconcile_pending, or it gives a canonical architecture-gap or migration result.",
    "observed": "pending-before-rerun",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "owner_reconcile_pending",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative evidence reduces active_gate_snapshot_coverage, migrates owner/boundary, reaches representative-green, records architecture-gap, or supplies the next canonical successor route.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The observation-layer route implementation changes representative active-gate behavior enough for fresh rolling-restart evidence to reduce, migrate, go green, or record architecture-gap.",
    "stopConditionCheck": "Run the representative rerun command, npm run work:scenario-route, npm run work:evidence-summary, and npm run analyze:causal-model before closure.",
    "expectedCausalModelChange": "Fresh evidence should no longer rely on the pre-change owner_reconcile_pending routing shape without a canonical reduction, migration, green, or architecture-gap explanation.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh representative evidence is pending after the local observation-route implementation.",
    "crossBoundaryReview": "No runtime files are in writeScope; do not patch startup readiness, priority recovery, release gate, or active-gate source in this rerun package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate observation route representative rerun",
    "phaseChain": [
      "observation-layer source route implemented in publication active-gate decision contract",
      "focused proof selects wait_owner_recovery for selected snapshot recovery-only evidence",
      "fresh representative rolling-restart evidence is required before selecting the next runtime route"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate snapshot coverage improves",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-active-gate-observation-route.md"
    ],
    "oscillationCheck": "This package is a fresh-evidence gate after a selected source route, not another same-artifact local patch.",
    "handoffInvariant": "Verification must not edit runtime files.",
    "missingCausalEdge": "Fresh representative evidence after the local source route.",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose",
    "boundedProgressProof": "Representative rerun must produce routeable evidence that shows bounded progress retry/observation movement or a canonical successor result.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json",
    "expectedObservableTransition": "active_gate_snapshot_coverage reduces, migrates, reaches representative-green, records architecture-gap, or routes to the next valid successor.",
    "maxProgressBound": "one representative rerun before route classification",
    "sameFrontierFallback": "If fresh evidence returns the same frontier with no concrete reduction, open the selected architecture/causal successor instead of editing runtime source here.",
    "expectedNextFrontier": "reduced active-gate frontier, owner-boundary migration, representative-green, or architecture-gap stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart requires fresh evidence after the observation-layer active-gate source route before the sprint can select another runtime or closure path.",
    "phaseChain": [
      "Representative evidence comes from test-output/reports/rolling-restart-contract-first-green-rerun.report.json.",
      "Local source proof selected wait_owner_recovery for selected snapshot recovery-only evidence.",
      "This package produces test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json."
    ],
    "ownerBoundaryMap": [
      "representative_evidence_owner / rolling_restart_rerun: owns the representative rerun gate.",
      "startup_active_gate_owner / snapshot_coverage: active-gate route target for post-rerun classification.",
      "Downstream owners remain frozen until fresh evidence selects migration or representative-green."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "No runtime files are in writeScope.",
      "Declared package owner boundary remains representative_evidence_owner / rolling_restart_rerun."
    ],
    "changedFacts": [
      "Observation-route source implementation is locally validated.",
      "Fresh representative evidence is pending."
    ],
    "competingTheories": [
      "H1 the source route reduces or moves active_gate_snapshot_coverage.",
      "H2 the fresh route names a different owner boundary.",
      "H3 the fresh route remains architecture-gap or same-frontier and needs a canonical successor."
    ],
    "eliminatedTheories": [
      "Stopping at local proof is eliminated because the sprint success condition requires representative evidence."
    ],
    "downstreamSymptoms": [
      "startup readiness support evidence remains downstream",
      "release gate remains downstream"
    ],
    "transitionTable": [
      {
        "inputSignal": "owner_reconcile_pending",
        "owner": "startup_active_gate_owner / snapshot_coverage",
        "missingTransition": "fresh representative evidence after source implementation",
        "expectedEvidence": "representative rerun plus scenario-route and evidence summary",
        "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose",
        "migrationTrigger": "fresh scenario-route names a different owner boundary"
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when fresh route evidence names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Record architecture-gap when fresh evidence remains same-frontier without concrete reduction."
    ],
    "wholeSystemInvariant": "The rerun package verifies evidence only and does not reinterpret downstream runtime behavior."
  },
  "sliceTheory": {
    "systemTheoryRef": "architecture/contracts/active-gate-convergence.md#active-gate-convergence",
    "selectedSystemTheory": "Fresh evidence after the source route decides whether the sprint reduced, migrates, goes green, or opens a canonical successor.",
    "selectedMechanism": "contract_gap representative rerun verification",
    "sourceTestContract": "No runtime source edit; this package executes representative evidence and routes the result.",
    "falsifier": "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose",
    "representativeExpectedMovement": "reduced active-gate frontier, owner-boundary migration, representative-green, or architecture-gap continuation",
    "killRule": "Unchanged same-frontier or no-reduction evidence opens the selected architecture/causal successor; do not add runtime edits inside this rerun package.",
    "theoryFitScore": {
      "evidenceFit": "high - fresh representative evidence is the required next proof.",
      "ownerBoundaryFit": "high - the rerun verifies the current active-gate boundary before migration.",
      "falsifiability": "high - the representative rerun can stay same-frontier, reduce, migrate, go green, or fail.",
      "representativeMovement": "high - the package exists only to measure representative movement.",
      "downstreamRiskContainment": "high - no downstream runtime edits are allowed."
    },
    "wrongSliceTriggers": [
      "proof requires runtime source edits",
      "fresh route names a different owner boundary",
      "representative evidence cannot be produced"
    ]
  }
}
-->

## Why

This package runs the fresh representative rolling-restart proof required after the active-gate observation-route source implementation. It does not own runtime edits; it owns the rerun artifact and the canonical route classification that follows.

## Scope Basis

Canonical predecessor evidence: `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`.

Fresh target artifact: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the package is a representative rerun gate with no runtime write scope.
- Escalation trigger to a heavier lane: fresh evidence names a new owner boundary, architecture-gap, or contradictory state that needs a successor.

## Core Logic Brief

- Canonical outcome: fresh representative evidence after the observation-route implementation is routed to green, reduction, migration, same-frontier, or architecture-gap.
- Inputs/signals: fresh rolling-restart report, scenario-route, evidence summary, and causal model.
- State model or invariant: verification packages do not edit runtime source; they decide the next package from fresh representative evidence.
- Non-goals and forbidden interpretations: do not patch active-gate, startup readiness, priority recovery, or release-gate source here.
- Proof mapping: the rerun command produces the artifact; scenario-route and evidence summary classify the result.
- Wrong-slice trigger: stop or split if proof requires runtime writes.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| fresh representative evidence | rolling-restart / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending | startup_active_gate_owner owns the active-gate verification boundary before migration | route fresh artifact | reduced, migrated, representative-green, same-frontier, or architecture-gap | `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose` |

- Anti-symptom rationale: this package measures the representative result instead of opening another local source patch on stale evidence.
- Falsifying focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose`
- Competing explanations: source route reduced the frontier, ownership migrated, architecture-gap remains, or the artifact is contradictory.
- Systemic interaction scan: compare route, evidence summary, causal model, and frontier history before choosing a successor.
- Ping-pong stop rule: same-frontier evidence without reduction opens the selected architecture/causal successor instead of editing runtime here.
- Oscillation guard: no runtime edits are allowed in this rerun package.

## Decision Experiment Gate

- Decision question: what does fresh representative evidence show after the observation-route implementation?
- Architecture review: runtime promotion is blocked until the route result selects the next package.
- Competing hypotheses: reduction, migration, representative-green, architecture-gap, or same-frontier continuation.
- Pre-edit focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose`
- Success metrics: residual count reduction, owner-boundary migration, representative green, architecture-gap classification, or an active_gate_snapshot_coverage frontier move in fresh route evidence.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending`
- Redirect rule: unchanged same-frontier/no-reduction evidence opens an architecture/causal experiment or successor; close the sprint only on the recorded sprint success condition.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- Expected delta: fresh evidence reduces active-gate, migrates, reaches representative-green, records architecture-gap, or selects the next successor.
- Local proof class: none; this package is representative proof.
- Representative proof class: fresh rolling-restart rerun plus route/evidence tools.
- Stop if unchanged: open the selected architecture/causal successor rather than editing runtime here.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `owner_reconcile_pending`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## In Scope

1. work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md
2. work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md
3. work/theory-ledger.md
4. work/sprints/current-blocker.json
5. work/sprints/current-blocker.md

## Out Of Scope

1. Runtime source edits.
2. Downstream readiness, release-gate, priority-recovery, or benchmark patches.

## Model Fit

- Package class: `representative-rerun`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `representative-rerun`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md`, `work/theory-ledger.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Do-not-edit scope: `src/`
- Frozen decisions: no runtime edit in this package.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose`; `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage`; `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json`

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.

- [ ] action: freshness-review; owner: Agent <name> (<agent-id>); files-changed: none; validation: npm run work:context; npm run work:package:doctor -- --suggest work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md; npm run work:validate -- --entry work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md; decision: fresh; outcome: pending.
- [ ] action: implementation; owner: startup_active_gate_owner; files-changed: work/packages/todo-20260531-rolling-restart-active-gate-observation-route-rerun-gate.md, work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md, work/theory-ledger.md; validation: representative rerun and route proof pending; parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: verification-fix; owner: startup_active_gate_owner; files-changed: none recorded yet; validation: verifier reruns representative proof and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: pending.

## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --fast-local --verbose
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-observation-route-rerun.report.json
