# Rolling Restart Active Gate Fresh Representative Route Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-30",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "playback": "none",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "representative_green_required",
    "currentState": "The owner wake delivery architecture experiment closed as architecture-gap continuation; runtime source promotion on startup_active_gate_owner / snapshot_coverage remains blocked until fresh representative evidence changes the route or names a non-repeated successor.",
    "nextAction": "Run fresh rolling-restart representative evidence, route the resulting artifact, and select the next sprint action from the fresh route instead of opening another local active-gate patch from the closed architecture-gap artifact.",
    "predecessor": "work/packages/done-20260529-rolling-restart-active-gate-owner-wake-delivery-architecture-experiment.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md",
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
      "src/control-plane/membership-publication-active-gate-reconcile.js",
      "src/control-plane/membership-publication-control-plane-convergence.js",
      "src/control-plane/membership-publication-coordinator-class-stage-3.js",
      "src/admin/admin-control-snapshot-publication-handoff.js",
      "src/admin/admin-control-snapshot-query-result-helper.js"
    ],
    "commitScope": [
      "work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md",
      "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The latest active-gate architecture-gap proof found no non-repeated owner wake route in the current artifact; the only valid non-halting move is fresh representative evidence or a successor selected by fresh evidence.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "scenario-release-gate",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "fresh evidence selects a runtime owner boundary",
      "fresh evidence repeats active_gate_snapshot_coverage with no metric reduction",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260530-rolling-restart-active-gate-owner-wake-delivery-architecture-gap"
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
  "theoryLedger": "no ledger update yet: this package records fresh representative route evidence and will update successor truth after the rerun.",
  "validationTier": "release-gate",
  "mechanismCard": {
    "failureMechanism": "observation_gap with contract_gap as the active-gate alternate",
    "stableFacts": "rolling-restart remains the sprint success condition; architecture-gap and migration are non-terminal learning states.",
    "changedFacts": "The owner wake delivery architecture experiment closed and left runtime source promotion blocked from the current artifact.",
    "rejectedAlternatives": "Do not reopen a generic startup_active_gate_owner / snapshot_coverage source patch from the closed architecture-gap artifact.",
    "ownerWhoDecides": "release_gate_owner",
    "currentAction": "Run fresh representative evidence and route the resulting artifact.",
    "missingTransitionOrObservation": "The sprint needs a fresh representative observation proving green or naming one first-frontier successor.",
    "smallestFalsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose",
    "expectedMovement": "representative-green, owner-boundary migration, concrete metric reduction, or one selected architecture/non-runtime successor.",
    "negativeResultMeans": "unchanged same-frontier/no-reduction evidence redirects to a bounded architecture/causal experiment or successor instead of another local active-gate patch.",
    "escalationRule": "Fresh evidence that repeats active-gate same-frontier with no reduction must open an architecture/causal experiment or successor, never stop the sprint."
  },
  "representativeResidual": {
    "status": "pending-before-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "frontier": "release_gate_owner / rolling_restart_fully_green_gate / representative_green_required",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "representative_green_required",
    "nextAction": "Run fresh rolling-restart representative evidence and route the resulting artifact."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "routeOwner": "release_gate_owner",
    "routeBoundary": "rolling_restart_fully_green_gate",
    "routeDominantReason": "representative_green_required",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "Fresh representative evidence either satisfies the rolling-restart green condition, migrates owner/boundary, reduces the active-gate timeout shape, or preserves architecture-gap blocking and selects a bounded successor.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --entry work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The sprint can only progress by rerunning the representative green gate from the current workspace state; the closed architecture-gap artifact cannot authorize another local active-gate source package.",
    "stopConditionCheck": "Run the representative scenario, canonical route, evidence summary, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json` before closure.",
    "expectedCausalModelChange": "The result is representative-green, a fresh owner/boundary migration, a concrete reduction, or a fresh architecture/non-runtime successor decision while the sprint remains active.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red in the current artifact at active_gate_snapshot_coverage with active_gate_timed_out, snapshot coverage 1/5, and runtimePromotionGuard blocked.",
    "crossBoundaryReview": "This package performs no runtime source edits; source changes require a successor selected by fresh route evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart fresh representative route gate",
    "phaseChain": [
      "owner wake delivery architecture experiment closed as architecture-gap continuation",
      "the sprint cannot close on architecture-gap",
      "fresh representative evidence is required before any next source package is selected"
    ],
    "recentFrontierHistory": [
      "bounded owner wake scheduling moved handoff enqueue to true",
      "post-wake active_gate_timed_out remained first with runtimePromotionGuard blocked",
      "owner wake delivery proof found convergence evidence already propagated",
      "fresh release-gate evidence is now required"
    ],
    "oscillationCheck": "Do not open another local active-gate runtime package from the closed architecture-gap artifact.",
    "handoffInvariant": "Fresh representative evidence must route one owner boundary before source promotion resumes.",
    "currentFirstFrontier": "release_gate_owner / rolling_restart_fully_green_gate / representative_green_required",
    "knownDownstreamBlockers": [
      "unknown until fresh rerun routes the first frontier"
    ],
    "missingCausalEdge": "Whether the current workspace is representative-green or still routes to an owner/boundary successor.",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose",
    "boundedProgressProof": "The representative rerun must pass green or produce one canonical first-frontier route for successor selection with a bounded progress, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance mechanism named by fresh evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json",
    "expectedObservableTransition": "rolling-restart exits 0 with representative-green evidence, or route-after-rerun selects one bounded successor from the fresh artifact.",
    "maxProgressBound": "one representative rerun and canonical route decision",
    "sameFrontierFallback": "If fresh evidence returns the same active-gate frontier with no metric reduction, select a bounded architecture/causal experiment rather than another local active-gate runtime patch.",
    "expectedNextFrontier": "representative-green, migrated owner/boundary, reduced current frontier, or architecture/non-runtime successor",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "boundedExperiment": {
    "hypothesis": "After owner wake delivery architecture-gap learning, the current workspace can either pass rolling-restart cleanly or produce one fresh routeable first frontier.",
    "hypothesisDiscriminator": "Representative-green requires clean scenario exit and canonical evidence without active priority-recovery or active-gate frontier.",
    "expectedMetric": "rolling-restart exit status, route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0, priorityRecoveryWitnesses=0",
    "inheritsFrom": "work/packages/done-20260529-rolling-restart-active-gate-owner-wake-delivery-architecture-experiment.md",
    "timebox": "24h",
    "mergeRequirement": "fresh representative rerun plus canonical route and evidence summary",
    "killRule": "Do not close the sprint on reduced, migrated, same-frontier, classification-only, or architecture-gap evidence; keep the sprint active and open the one selected successor."
  },
  "observablePrediction": {
    "metric": "rolling-restart exit status, representative route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0, priorityRecoveryWitnesses=0",
    "predicted": "fresh rerun either passes cleanly or routes to exactly one first-frontier successor without closing the sprint on architecture-gap.",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "pending-before-observation"
  },
  "systemTheory": {
    "problemStatement": "rolling-restart is still non-green and the sprint cannot continue from the closed active-gate architecture-gap artifact without fresh representative evidence.",
    "phaseChain": [
      "owner wake scheduling local proof passed",
      "fresh representative evidence returned to active_gate_timed_out",
      "owner wake delivery architecture proof closed without a non-repeated source route",
      "release-gate evidence must decide the next fresh owner boundary"
    ],
    "ownerBoundaryMap": [
      "release_gate_owner / rolling_restart_fully_green_gate: owns the sprint success decision.",
      "startup_active_gate_owner / snapshot_coverage: candidate only until fresh evidence reselects it and passes compositional gates.",
      "operation_workflow_owner / rebalancer_handoff: downstream unless priority recovery witnesses reappear."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "The sprint success condition is representative green, not architecture-gap.",
      "Runtime source promotion remains blocked from the closed active-gate architecture-gap artifact."
    ],
    "changedFacts": [
      "The owner wake delivery architecture-gap analysis has closed.",
      "The active package now owns fresh representative evidence rather than runtime source modification."
    ],
    "competingTheories": [
      "H1 the current workspace is representative-green.",
      "H2 fresh evidence still selects active-gate snapshot coverage.",
      "H3 fresh evidence migrates to a different owner boundary.",
      "H4 evidence is unavailable or contradictory and must not select runtime work."
    ],
    "eliminatedTheories": [
      "The closed architecture-gap artifact alone can authorize another local active-gate source patch."
    ],
    "downstreamSymptoms": [
      "startup readiness and benchmark visibility stay downstream until fresh route evidence promotes them"
    ],
    "transitionTable": [
      {
        "inputSignal": "representative_green_required",
        "owner": "release_gate_owner / rolling_restart_fully_green_gate",
        "missingTransition": "fresh representative run must either pass green or route one first frontier.",
        "expectedEvidence": "scenario exit status, scenario-route, evidence-summary, and causal-model output.",
        "falsifier": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose",
        "migrationTrigger": "fresh route names a different owner/boundary or a valid architecture successor."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when the fresh canonical route names the alternate deciding owner and boundary."
    ],
    "architectureGapTriggers": [
      "Select architecture/non-runtime successor when fresh evidence repeats active-gate same-frontier with no concrete metric reduction."
    ],
    "wholeSystemInvariant": "The sprint remains active until the original rolling-restart representative-green success condition is met.",
    "wholeSystemInvariants": [
      {
        "invariant": "The sprint remains active until the original rolling-restart representative-green success condition is met.",
        "coupledWith": [
          "source promotion remains blocked until fresh route evidence names one owner boundary"
        ],
        "couplingNote": "A red representative rerun can only redirect to one selected successor; it cannot close the sprint."
      }
    ]
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md systemTheory",
    "selectedSystemTheory": "The release gate owns the next discriminator because no runtime source package is valid from the closed active-gate architecture-gap artifact.",
    "selectedMechanism": "observation_gap with contract_gap as the active-gate alternate",
    "sourceTestContract": "No src/ source contract is selected in this release-gate package; source contracts remain candidate-only until fresh route evidence promotes a successor.",
    "falsifier": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose # release-gate contract transition",
    "representativeExpectedMovement": "representative-green, owner-boundary migration, concrete metric reduction, or one selected architecture/non-runtime successor",
    "killRule": "Do not open a local active-gate runtime patch from unchanged same-frontier/no-reduction evidence.",
    "theoryFitScore": {
      "evidenceFit": "high - the package runs the representative artifact directly.",
      "ownerBoundaryFit": "high - release_gate_owner owns sprint success.",
      "falsifiability": "high - the distributed harness command is the falsifier.",
      "representativeMovement": "high - the result must be green or route a fresh successor.",
      "downstreamRiskContainment": "high - runtime files remain candidate-only."
    },
    "wrongSliceTriggers": [
      "fresh evidence selects a concrete source owner",
      "fresh evidence is unavailable",
      "canonical route output is contradictory"
    ]
  }
}
-->

## Why

This package owns the release gate for the active sprint. The sprint success
condition is the local `rolling-restart` harness going green; architecture-gap,
migration, reduced, or classification-only evidence keeps the loop running.

## Core Logic Brief

- Canonical outcome: `release_gate_owner / rolling_restart_fully_green_gate`
  emits the sprint outcome for `representative_green_required`.
- Inputs/signals: fresh rolling-restart report, canonical route output,
  evidence summary, and causal model.
- State model or invariant: sprint closure is allowed only on
  representative-green evidence matching the Evidence Anchor.
- Non-goals and forbidden interpretations: no runtime source edits, no timeout
  widening, no readiness/admission weakening, and no sprint closure on
  architecture-gap, migrated, reduced, same-frontier, or classification-only
  evidence.
- Proof mapping: the proof ladder must establish representative-green or route
  exactly one bounded successor package.
- Wrong-slice trigger: if fresh evidence selects source work, split to a
  successor before implementation.

## Decision Experiment Gate

- Decision question: is `rolling-restart` representative-green now, and if not, what exact owner/boundary is the first blocker in fresh evidence?
- Architecture review: before runtime edits, classify the red result by owner, boundary, route, architecture experiment, or blocked/contradictory evidence.
- Competing hypotheses: H1 the current build is green with no first frontier; H2 active-gate snapshot coverage remains first with repeated timeout evidence; H3 another owner boundary becomes first with different observable route evidence.
- Pre-edit focused probe: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose`
- Success metrics: clean scenario exit, canonical route green, `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, zero priority-recovery witnesses, and no active-gate frontier.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required`
- Redirect rule: on unchanged same-frontier/no-reduction evidence, open a bounded architecture/causal experiment or successor from the fresh artifact; do not close the sprint or open another local active-gate runtime patch from the closed artifact.

## Bounded Experiment

- Hypothesis: after the latest architecture-gap learning, the current workspace can either pass rolling-restart cleanly or produce one fresh routeable first frontier.
- Hypothesis discriminator: representative-green requires clean scenario exit and canonical evidence without active priority-recovery or active-gate frontier.
- Expected metric: rolling-restart exit status, route outcome, active=5/5, snapshotCoverage=5/5, missingPublished=0, priorityRecoveryWitnesses=0.
- Inherits from: `work/packages/done-20260529-rolling-restart-active-gate-owner-wake-delivery-architecture-experiment.md`
- Timebox: `24h`
- Validation tier: `release-gate`
- Merge requirement: fresh representative rerun plus canonical route and evidence summary.
- Kill rule: same-frontier/no-reduction opens or selects a bounded architecture/causal experiment, not another local active-gate runtime patch.

## Execution Evidence

- [ ] action: freshness-review; owner: Agent <name> (<agent-id>); files-changed: none; validation: `npm run work:context`; `npm run work:validate -- --entry work/packages/active-20260530-rolling-restart-active-gate-fresh-representative-route-gate.md`; decision: fresh; outcome: pending.
- [ ] action: implementation; owner: release_gate_owner; files-changed: none recorded yet; validation: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose` and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: verification-fix; owner: release_gate_owner; files-changed: none recorded yet; validation: verifier reruns focused proof and parent revalidated focused proof: yes before closure; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: pending.

## Validation

1. falsifier: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --fast-local --verbose
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason representative_green_required
3. supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json
4. supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-theory-loop-green.report.json
