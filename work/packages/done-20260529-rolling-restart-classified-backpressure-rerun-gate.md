# Rolling Restart Classified Backpressure Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-29",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "representative_green_required",
    "currentState": "The classified-backpressure representative rerun stayed red but drained priority-recovery residuals to zero and routed the first frontier back to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending.",
    "nextAction": "Close this rerun gate and continue with the active architecture-gap successor for owner_reconcile_pending before any runtime source package.",
    "predecessor": "work/packages/done-20260529-rolling-restart-fresh-representative-green-gate.md",
    "closed": "2026-05-29",
    "successor": "work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-architecture-gap-analysis.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md",
      "work/packages/done-20260529-rolling-restart-fresh-representative-green-gate.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-owner-constants.js",
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/control-plane/priority-recovery-snapshot-stage-8.js"
    ],
    "commitScope": [
      "work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md",
      "work/packages/done-20260529-rolling-restart-fresh-representative-green-gate.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The fresh route classified priority recovery as backpressure with no failed invariants; the route helper selected rerun-representative-evidence rather than immediate runtime promotion.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation/classified-backpressure",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "fresh evidence selects a concrete runtime owner boundary",
      "priority recovery remains first with no metric movement",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260527-rolling-restart-priority-recovery-workflow-progress",
      "theory-20260529-rolling-restart-active-gate-snapshot-coverage-architecture-gap-stop"
    ],
    "proof": {
      "commands": [
        "falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose # release-gate contract transition",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required # release-gate outcome state transition",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
        "supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
      ]
    }
  },
  "validationTier": "release-gate",
  "theoryLedger": "no ledger update: this rerun gate records the fresh representative reduction from classified priority-recovery backpressure to active-gate owner_reconcile_pending and hands off to the architecture-gap successor without adding durable theory.",
  "mechanismCard": {
    "failureMechanism": "scheduling_gap with observation_gap as the release-gate alternate",
    "stableFacts": "rolling-restart is still the sprint success condition and the current fresh route reports accept_classified_backpressure.",
    "changedFacts": "The latest rerun moved from active-gate-first evidence to priority_recovery_partition_progress with active=5/5 and snapshotCoverage=3/5.",
    "rejectedAlternatives": "Do not open operation workflow runtime work directly from a route classified as accepted backpressure unless the next fresh route selects concrete source promotion.",
    "ownerWhoDecides": "release_gate_owner",
    "currentAction": "Rerun representative evidence to see whether classified backpressure drains or selects one successor.",
    "missingTransitionOrObservation": "Fresh evidence must prove green, migration, concrete reduction, or a non-backpressure runtime successor.",
    "smallestFalsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose",
    "expectedMovement": "representative-green, owner-boundary migration, concrete priority-recovery reduction, or one selected runtime/architecture successor.",
    "negativeResultMeans": "unchanged priority_recovery_event_driven_wait with no metric reduction redirects to a bounded successor or architecture/causal experiment instead of another evidence-only loop.",
    "escalationRule": "A second unchanged backpressure route must select a concrete successor, architecture/causal experiment, or blocked/contradictory evidence path."
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "representative_green_required",
    "nextAction": "Rerun representative evidence after classified backpressure."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "release_gate_owner",
    "routeBoundary": "rolling_restart_fully_green_gate",
    "routeDominantReason": "representative_green_required",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "causal-escalation",
    "expectedDelta": "Fresh representative evidence either reaches green, drains priority-recovery backpressure, migrates to a concrete successor, or proves unchanged same-frontier/no-reduction.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The priority-recovery event-driven wait is currently classified backpressure; a fresh rerun should either drain it or produce a more concrete successor route.",
    "stopConditionCheck": "Run the representative scenario, canonical route, evidence summary, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` before closure.",
    "expectedCausalModelChange": "The result is representative-green, a drained priority-recovery route, migrated owner/boundary, or one selected concrete successor.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence reports active_gate_snapshot_coverage first with owner_reconcile_pending, selected_snapshot_source_timeout, snapshot_repair_deferred, snapshot coverage 1/5, one pending owner queue write, membershipPublicationHandoffOutcomeEnqueued=false, and zero priority-recovery residuals.",
    "crossBoundaryReview": "This package performs no runtime source edits; source changes require a successor selected by fresh route evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart classified backpressure rerun gate",
    "phaseChain": [
      "fresh representative green gate moved active nodes to 5/5 and snapshot coverage to 3/5",
      "canonical route selected priority_recovery_partition_progress under operation_workflow_owner / workflow_progress",
      "causal-model classified the route as accepted backpressure",
      "one more fresh representative rerun decides whether backpressure drains or selects source work"
    ],
    "currentFirstFrontier": "release_gate_owner / rolling_restart_fully_green_gate / representative_green_required",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / workflow_progress priority recovery is first if backpressure persists",
      "startup_active_gate_owner / snapshot_coverage remains next-expected after priority recovery closes"
    ],
    "missingCausalEdge": "Whether classified priority-recovery backpressure drains under another fresh representative run.",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose",
    "boundedProgressProof": "The representative rerun must pass green or produce one canonical first-frontier route with a bounded progress, retry, reconcile, drain, dispatch, delivery, timer, timeout, wake, or advance mechanism named by fresh evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedObservableTransition": "rolling-restart exits 0, priority-recovery witness count drops, owner boundary migrates, or one concrete successor is selected.",
    "maxProgressBound": "one representative rerun and canonical route decision",
    "sameFrontierFallback": "If fresh evidence repeats priority_recovery_event_driven_wait with no metric reduction, open a concrete successor or architecture/causal experiment rather than another evidence-only package.",
    "expectedNextFrontier": "representative-green, reduced priority-recovery backpressure, migrated owner/boundary, or concrete successor",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260529-rolling-restart-fresh-representative-green-gate.md / release_gate_owner / rolling_restart_fully_green_gate / reduced",
      "work/packages/done-20260529-rolling-restart-priority-recovery-rebalancer-handoff-retry-scheduled.md / operation_workflow_owner / rebalancer_handoff / migrated",
      "work/packages/done-20260529-rolling-restart-causal-stop-dominant-frontier-selection.md / diagnostics_owner / causal_analysis_framework / reduced"
    ],
    "oscillationCheck": "The predecessor closure makes another plain release-gate rerun on the same release_gate_owner / rolling_restart_fully_green_gate boundary a frontier-oscillation risk; this causal-escalation package must prove movement or select a concrete successor.",
    "handoffInvariant": "Do not promote operation_workflow_owner, startup_active_gate_owner, or another runtime boundary unless fresh canonical route evidence names the owner boundary and the successor package records the handoff."
  },
  "observablePrediction": {
    "metric": "rolling-restart exit status, route outcome, priorityRecoveryWitnesses, active=5/5, snapshotCoverage=5/5",
    "predicted": "fresh rerun either passes cleanly, drains priority-recovery witnesses, or selects exactly one successor route.",
    "observed": "fresh rerun stayed red and routed to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending; priority-recovery residual witnesses were zero, topology-convergence reported snapshotCoverage=1/5 with one pending owner queue write and membershipPublicationHandoffOutcomeEnqueued=false, and frontier-history required architecture-gap analysis before another runtime source package.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "closureSummary": {
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "The fresh rerun drained classified priority-recovery backpressure but remained red at active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending.",
    "successorReason": "Frontier-history reports pair-alternation-post-rederive on startup_active_gate_owner / snapshot_coverage, so runtime source promotion is blocked until the architecture-gap successor selects a non-repeated route, migration, or stop.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage architecture-gap analysis",
    "evidenceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json"
  },
  "boundedExperiment": {
    "hypothesis": "Classified priority-recovery backpressure may drain on the next representative attempt; if it does not, the frontier oscillation must select a concrete source, architecture, or handoff successor before another local runtime patch.",
    "hypothesisDiscriminator": "H1 predicts priority-recovery witness count drops or rolling-restart goes green; H2 predicts the same priority-recovery route repeats and must promote a concrete successor.",
    "expectedMetric": "priorityRecoveryWitnesses, route owner/boundary, scenario exit status",
    "inheritsFrom": "work/packages/done-20260529-rolling-restart-fresh-representative-green-gate.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus canonical route and evidence summary",
    "killRule": "unchanged same-frontier/no-reduction evidence opens a concrete successor or architecture/causal experiment."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "release-gate routing and successor selection only",
    "safeToExecuteWhen": [
      "no runtime source edits are made in this package",
      "representative evidence is fresh and routeable",
      "a red rerun opens or selects exactly one bounded successor before implementation work"
    ],
    "splitTriggers": [
      "fresh evidence selects a runtime owner boundary",
      "proof requires source edits, timeout changes, or admission changes",
      "representative evidence is contradictory or unavailable"
    ],
    "childPackageCandidates": [
      "Use this package for the rerun gate and route decision.",
      "Create a runtime-owner-boundary child only after the route selects a concrete owner/boundary and passes compositional gates.",
      "Create an autonomous architecture experiment if same-frontier evidence repeats with no concrete reduction."
    ]
  },
  "systemTheory": {
    "problemStatement": "rolling-restart is non-green after a reduced fresh run that causal-model classifies as priority-recovery backpressure.",
    "phaseChain": [
      "fresh release-gate rerun reached active=5/5 and snapshotCoverage=3/5",
      "priority_recovery_partition_progress became the first frontier",
      "causal-model returned accept_classified_backpressure",
      "this package reruns representative evidence once before source promotion"
    ],
    "ownerBoundaryMap": [
      "release_gate_owner / rolling_restart_fully_green_gate: owns the sprint success decision.",
      "operation_workflow_owner / workflow_progress: candidate if priority recovery remains first.",
      "startup_active_gate_owner / snapshot_coverage: next-expected after priority recovery closes."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "The sprint success condition is representative green.",
      "Runtime source edits are out of scope for this package."
    ],
    "changedFacts": [
      "The latest report moved from active-gate-first to priority-recovery-first.",
      "Causal-model classified the priority-recovery route as accepted backpressure."
    ],
    "competingTheories": [
      "H1 classified backpressure drains on rerun.",
      "H2 operation_workflow_owner / workflow_progress remains first and needs a concrete successor.",
      "H3 the route migrates back to active-gate or another owner boundary."
    ],
    "eliminatedTheories": [
      "The closed active-gate architecture-gap artifact alone can authorize another active-gate source package."
    ],
    "downstreamSymptoms": [
      "startup readiness and active-gate snapshot coverage stay downstream until priority recovery closes"
    ],
    "transitionTable": [
      {
        "inputSignal": "representative_green_required after accept_classified_backpressure",
        "owner": "release_gate_owner / rolling_restart_fully_green_gate",
        "missingTransition": "fresh rerun must either drain backpressure, pass green, or route one successor.",
        "expectedEvidence": "scenario exit status, scenario-route, evidence-summary, and causal-model output.",
        "falsifier": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose",
        "migrationTrigger": "fresh route names a concrete owner/boundary or architecture successor."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when the fresh canonical route names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Select architecture/non-runtime successor when fresh evidence repeats same-frontier with no metric reduction."
    ],
    "wholeSystemInvariant": "The sprint remains active until the original rolling-restart representative-green success condition is met."
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md systemTheory",
    "selectedSystemTheory": "The release gate owns a causal-escalation discriminator because the predecessor closure makes another plain release-gate rerun an oscillation risk.",
    "selectedMechanism": "scheduling_gap with observation_gap as the release-gate alternate",
    "sourceTestContract": "No src/ source contract is selected in this release-gate package; source contracts remain candidate-only until fresh route evidence promotes a successor.",
    "falsifier": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose # release-gate contract transition",
    "representativeExpectedMovement": "representative-green, reduced priority-recovery witnesses, owner-boundary migration, or one selected successor",
    "killRule": "unchanged same-frontier/no-reduction evidence opens a concrete successor or architecture/causal experiment.",
    "theoryFitScore": {
      "evidenceFit": "high - the package reruns the representative artifact directly.",
      "ownerBoundaryFit": "high - release_gate_owner owns sprint success.",
      "falsifiability": "high - the distributed harness command is the falsifier.",
      "representativeMovement": "high - the result must be green, reduced, migrated, or route a successor.",
      "downstreamRiskContainment": "high - runtime files remain candidate-only."
    },
    "wrongSliceTriggers": [
      "fresh evidence selects a concrete source owner",
      "fresh evidence is unavailable",
      "canonical route output is contradictory"
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns the causal-escalation discriminator after the latest fresh
artifact reduced the active-gate shape but classified priority recovery as
accepted backpressure. It does not edit runtime source.

## Scope Basis

Approved causal-escalation workflow scope. Runtime source files remain
candidate-only until fresh evidence selects a concrete owner-boundary successor.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the predecessor closure makes another plain
  release-gate rerun an oscillation risk, so this package must either prove
  movement or select a concrete source, architecture, or handoff successor.
- Escalation trigger to a heavier lane: contradictory evidence, unavailable
  representative evidence, or a frozen architecture decision.

## Core Logic Brief

- Canonical outcome: `release_gate_owner / rolling_restart_fully_green_gate`
  emits the sprint outcome for `representative_green_required`.
- Inputs/signals: fresh rolling-restart report, canonical route output,
  evidence summary, and causal model.
- State model or invariant: sprint closure is allowed only on
  representative-green evidence matching the Evidence Anchor.
- Non-goals and forbidden interpretations: no runtime source edits, no timeout
  widening, no readiness/admission weakening, and no sprint closure on
  backpressure, migrated, reduced, same-frontier, architecture-gap, or
  classification-only evidence.
- Proof mapping: the proof ladder must establish representative-green or route
  exactly one bounded successor package.
- Wrong-slice trigger: if fresh evidence selects source work, split to a
  successor before implementation.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| release gate | release_gate_owner / rolling_restart_fully_green_gate / representative_green_required | the release gate owns the sprint success decision | close only as representative-green, or keep the sprint active and route one successor | green, reduced priority-recovery witnesses, migration, or one selected successor | `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose` |
| scope boundary | workflow state and representative evidence only | runtime fixes require a successor package | split, migrate, or continue with architecture successor | no source edits in this package | `npm run work:validate -- --pre-impl work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md` |

- Anti-symptom rationale: this package tests whether accepted backpressure
  drains; it does not patch downstream symptoms.
- Falsifying focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
- Competing explanations: backpressure drains on rerun; operation workflow
  remains first; active-gate returns first; evidence is stale or contradictory.
- Systemic interaction scan: review producer, consumer, admission/gating,
  retry/lifecycle, and evidence-generation effects before assigning a successor.
- Ping-pong stop rule: do not open another local runtime patch from an
  accepted-backpressure route unless fresh evidence selects it.
- Oscillation guard: unchanged same-frontier/no-reduction must open a concrete
  successor or architecture/causal experiment, not another evidence-only loop.

## Decision Experiment Gate

- Decision question: does classified priority-recovery backpressure drain on a
  fresh representative rerun, or does oscillation require a concrete successor?
- Architecture review: before runtime edits, classify the red result by owner,
  boundary, route, architecture experiment, or blocked/contradictory evidence.
- Competing hypotheses: H1 backpressure drains; H2 operation workflow remains
  first and needs source work; H3 the route migrates to another owner boundary.
- Pre-edit focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
- Success metrics: clean scenario exit, canonical route green, reduced
  priorityRecoveryWitnesses, `active=5/5`, `snapshotCoverage=5/5`, and no
  active-gate frontier.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required`
- Redirect rule: unchanged same-frontier/no-reduction evidence opens a concrete
  source, architecture, or handoff successor; it does not close the sprint or
  authorize another evidence-only loop.

## System Theory

- Problem statement: rolling-restart is non-green after a reduced fresh run
  that causal-model classifies as priority-recovery backpressure.
- Phase chain: release-gate rerun reached active=5/5, priority recovery became
  first, causal-model accepted classified backpressure, and this package reruns
  once before source promotion.
- Owner-boundary map: release gate owns the success decision; operation workflow
  is candidate-only until fresh evidence reselects it; active gate remains
  next-expected after priority recovery closes.
- Competing theories: backpressure drains; operation workflow remains first;
  route migrates elsewhere.
- Whole-system invariant: the sprint remains active until the original
  rolling-restart representative-green success condition is met.

## Slice Theory

- System theory reference: `work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md systemTheory`
- Selected system theory: the release gate owns one more representative
  discriminator because the latest route was classified backpressure.
- Selected mechanism: scheduling_gap with observation_gap as alternate.
- Source/test contract: no source contract is selected in this package.
- Falsifier: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
- Representative expected movement: representative-green, reduced
  priority-recovery witnesses, migration, or one selected successor.
- Redirect rule: unchanged same-frontier/no-reduction evidence opens a concrete
  successor or architecture/causal experiment.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Expected delta: representative-green, reduced priority-recovery witnesses,
  migrated owner/boundary, or a concrete successor.
- Local proof class: none; this package is not a runtime source package.
- Representative proof class: fresh representative rerun and canonical
  route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction
  selects a concrete successor or architecture/causal experiment.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
- Route owner: `release_gate_owner`
- Route boundary: `rolling_restart_fully_green_gate`
- Route dominant reason: `representative_green_required`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current
  Edge Card update, current-blocker refresh, entry validation,
  pre-implementation validation, and closure validation.

## In Scope

1. Fresh `rolling-restart` representative rerun.
2. Canonical route and evidence-summary classification.
3. Sprint/current-blocker updates that point to the next valid action.

## Out Of Scope

1. Runtime source edits.
2. Timeout widening, readiness/admission weakening, or diagnostic hiding.
3. Closing the sprint on anything except representative-green success evidence.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation/classified-backpressure`
- Output profile: `medium`
- Owned files: `work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md`, `work/sprints/active-2026-q2-spec-led-runtime-modularization.md`
- Do-not-edit scope: `src/` and `test/` files in this package.
- Frozen decisions: accepted backpressure is not sprint success; source work
  resumes only from fresh route evidence.
- Escalation triggers: fresh evidence selects source work, repeated
  same-frontier/no-reduction, contradictory evidence, or unavailable
  representative artifact.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation
end to end; one separate verifier-fixer validates the last package work and may
fix in-scope problems directly.

- [x] action: freshness-review; owner: Agent Ohm (019e74db-6cf1-73f3-9f33-5e02d2a9a35c); files-changed: none; validation: npm run work:context passed and current blocker points at work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md passed; npm run work:package:doctor -- --suggest work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md failed only for expected pre-implementation evidence gaps; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json passed and still routes to priority_recovery_partition_progress with causal outcome accept_classified_backpressure; decision: fresh; outcome: validated.
- [x] action: implementation; owner: release_gate_owner; files-changed: work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md, work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-architecture-gap-analysis.md; validation: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose failed red after 738.8s as expected; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json passed and selected active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required passed and showed priority-recovery residuals 0; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json passed with causal outcome continue_local_fix and first critical path topology:active_gate_snapshot_coverage; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --markdown passed with 0 witnesses; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --explain active_gate_snapshot_coverage passed and exposed snapshotCoverage=1/5, selectedControlPlaneOwnerQueuePendingWrites=1, pendingRecoveryCount=1, membershipPublicationHandoffOutcomeEnqueued=false; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed and required architecture-gap analysis before another runtime package; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-architecture-gap-analysis.md passed; parent revalidated focused proof: yes; outcome: validated - architecture-gap successor selected.
- [x] action: verification-fix; owner: Agent McClintock (019e74f3-5897-7d42-aee7-508cffc70cf5); files-changed: none by verifier; validation: npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md passed; npm run work:validate -- --pre-impl work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md passed; npm run work:validate -- --entry work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-architecture-gap-analysis.md passed; npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json passed; npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason owner_reconcile_pending --explain active_gate_snapshot_coverage passed; npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12 passed; git diff --check -- work/packages/active-20260529-rolling-restart-classified-backpressure-rerun-gate.md work/packages/active-20260529-rolling-restart-active-gate-owner-reconcile-pending-architecture-gap-analysis.md passed; parent revalidated focused proof: yes; outcome: validated - architecture-gap successor remains selected.

## Validation

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
2. `npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`
4. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json`

## Commit And Push Ledger

1. Focused package commit: d8cd622043faefbf1ef27bfa311ad95ca44e7c01
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: no
