# Representative Rerun Progress Model Coverage Binding

<!-- work-package
{
  "schema": "work-package-v2",
  "intent": {
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "playback": "none",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "representative_rerun_model_coverage_binding",
    "currentState": "docs/specs/representative-rerun-progress-model.json exists, but owner-dossier reports contractRecord=null, invariants=[], and modelStatus=none for representative_evidence_owner / rolling_restart_rerun.",
    "nextAction": "Bind the representative rerun progress model into a System Contract Record and invariant registry so the pair has owner-dossier-visible model coverage before another rerun is considered.",
    "predecessor": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md",
      "architecture/contracts/rolling-restart-representative-rerun-progress.md",
      "architecture/contracts/invariants.json",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [
      "docs/specs/representative-rerun-progress-model.json",
      "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md",
      "architecture/contracts/rolling-restart-representative-rerun-progress.md",
      "architecture/contracts/invariants.json",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/theory-ledger.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The representative-progress circuit breaker blocks another direct rerun, and the model file is invisible to owner-dossier until a contract record or invariant registry entry binds it.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "model-route",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "model-route/representative-rerun-progress-coverage-binding",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owner-dossier still reports modelStatus none after binding",
      "contract check rejects the System Contract Record",
      "invariant registry cannot cite the model"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-representative-rerun-progress-model-route",
      "theory-20260531-rolling-restart-representative-rerun-progress-model-coverage-binding"
    ],
    "proof": {
      "commands": [
        "falsifier: node -e \"const {execFileSync}=require('child_process'); const out=execFileSync('npm',['--silent','run','work:owner-dossier','--','--owner','representative_evidence_owner','--boundary','rolling_restart_rerun','--json'],{encoding:'utf8'}); const d=JSON.parse(out); if (d.modelStatus!=='proven') throw new Error('expected proven modelStatus'); if (!d.contractRecord) throw new Error('missing contractRecord'); if (!Array.isArray(d.provenRoutes)||d.provenRoutes.length===0) throw new Error('missing provenRoutes');\"",
        "regression: npm run work:contract:check -- architecture/contracts/rolling-restart-representative-rerun-progress.md",
        "supporting: npm run work:invariants:check",
        "supporting: node -e \"const fs=require('fs'); const m=JSON.parse(fs.readFileSync('docs/specs/representative-rerun-progress-model.json','utf8')); if (!m.properties.some((p)=>p.id==='non_shrinking_window_blocks_rerun')) throw new Error('missing non_shrinking_window_blocks_rerun'); if (!m.properties.some((p)=>p.id==='blocked_route_has_non_rerun_exits')) throw new Error('missing blocked_route_has_non_rerun_exits');\""
      ]
    }
  },
  "theoryLoop": {
    "gateMarker": "same-mechanism-repeat",
    "jointFalsifierCommand": "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "result": "architecture-gap",
    "outcome": "theory-confirmed",
    "successorRequired": true,
    "architectureRoute": {
      "selectedLayer": "model",
      "ledgerRef": "theory-20260531-rolling-restart-representative-rerun-progress-model-coverage-binding",
      "coupledInvariant": "representative residual count must shrink or route through a model-backed non-rerun exit before another rolling_restart_rerun evidence slice"
    }
  },
  "representativeResidual": {
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "owner": "representative_evidence_owner",
    "boundary": "rolling_restart_rerun",
    "dominantReason": "representative_rerun_model_coverage_binding",
    "status": "architecture-gap",
    "frontier": "representative-progress-circuit-breaker / representative_evidence_owner / rolling_restart_rerun",
    "nextAction": "Bind model coverage before another representative rerun.",
    "residualCount": 1
  },
  "systemContractRef": "architecture/contracts/rolling-restart-representative-rerun-progress.md",
  "mechanismCard": {
    "failureMechanism": "contract_gap with observation_gap as the first alternate",
    "stableFacts": "docs/specs/representative-rerun-progress-model.json records that window_non_shrinking routes to blocked_model_route and blocked routes exit only through non-rerun successors; owner-dossier currently reports no model coverage for representative_evidence_owner / rolling_restart_rerun.",
    "changedFacts": "This package will add the missing contract record and invariant registry binding for the existing model.",
    "rejectedAlternatives": "Do not run another rolling_restart_rerun, edit runtime source, or patch downstream owners while model coverage is unbound.",
    "ownerWhoDecides": "representative_evidence_owner",
    "currentAction": "Bind representative rerun progress model coverage.",
    "missingTransitionOrObservation": "Owner-dossier-visible System Contract Record and invariant modelRef for the representative rerun progress model.",
    "smallestFalsifyingProbe": "falsifier: node -e \"const {execFileSync}=require('child_process'); const out=execFileSync('npm',['--silent','run','work:owner-dossier','--','--owner','representative_evidence_owner','--boundary','rolling_restart_rerun','--json'],{encoding:'utf8'}); const d=JSON.parse(out); if (d.modelStatus!=='proven') throw new Error('expected proven modelStatus');\"",
    "expectedMovement": "Owner-dossier reports contractRecord, provenRoutes, invariants, and modelStatus=proven for representative_evidence_owner / rolling_restart_rerun.",
    "negativeResultMeans": "If the binding does not surface in owner-dossier, escalate to workflow_tooling_owner / owner_dossier_model_coverage instead of rerunning evidence.",
    "escalationRule": "Only owner-dossier-visible coverage, a workflow-tooling coverage repair, or an explicit owner-boundary migration can reopen representative evidence."
  },
  "observablePrediction": {
    "metric": "owner-dossier model coverage for representative_evidence_owner / rolling_restart_rerun",
    "predicted": "contractRecord becomes architecture/contracts/rolling-restart-representative-rerun-progress.md and modelStatus becomes proven with a model selectedLayer route.",
    "observed": "contractRecord becomes architecture/contracts/rolling-restart-representative-rerun-progress.md and modelStatus becomes proven with a model selectedLayer route.",
    "accuracy": "matched",
    "evidence": "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json; npm run work:contract:check -- architecture/contracts/rolling-restart-representative-rerun-progress.md; npm run work:invariants:check"
  },
  "boundedExperiment": {
    "hypothesis": "Owner-dossier can see the existing representative rerun progress model once it is bound through a System Contract Record and invariant registry entries.",
    "hypothesisDiscriminator": "After binding, owner-dossier must report modelStatus=proven, a contractRecord, provenRoutes, and invariant modelRef entries for the exact owner/boundary.",
    "expectedMetric": "modelStatus=proven for representative_evidence_owner / rolling_restart_rerun",
    "inheritsFrom": "work/packages/done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md",
    "timebox": "24h",
    "mergeRequirement": "owner-dossier assertion, contract check, invariant check, model JSON check, repair, and validation",
    "killRule": "If model coverage remains invisible after contract and invariant binding, stop and open workflow_tooling_owner / owner_dossier_model_coverage."
  },
  "validationTier": "release-gate",
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
    "routeOwner": "representative_evidence_owner",
    "routeBoundary": "rolling_restart_rerun",
    "routeDominantReason": "representative_rerun_model_coverage_binding",
    "routeCausalOutcome": "architecture-gap",
    "stopMode": "model-coverage-binding-required",
    "nextLane": "causal-escalation",
    "expectedDelta": "Owner-dossier-visible model coverage blocks unmodelled rerun churn and enables the next legal route decision.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_coverage_binding",
      "npm run work:contract:check -- architecture/contracts/rolling-restart-representative-rerun-progress.md",
      "npm run work:invariants:check",
      "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json",
      "update Sprint Strategy Brief from the route result",
      "update Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "owner-dossier reports contractRecord=null, invariants=[], and modelStatus=none for representative_evidence_owner / rolling_restart_rerun",
      "docs/specs/representative-rerun-progress-model.json already records the non-shrinking window model properties",
      "the representative-progress circuit breaker blocks another direct rolling_restart_rerun evidence slice"
    ],
    "selectedChoice": "bind-contract-and-invariant-model-coverage",
    "nextAction": "Add architecture/contracts/rolling-restart-representative-rerun-progress.md and matching invariant registry entries, then verify owner-dossier reports modelStatus=proven.",
    "choices": [
      {
        "id": "bind-contract-and-invariant-model-coverage",
        "summary": "Bind the existing model with modelProvenRoutes and invariant modelRef entries.",
        "route": "architecture-package",
        "proof": [
          "npm run work:contract:check -- architecture/contracts/rolling-restart-representative-rerun-progress.md",
          "npm run work:invariants:check",
          "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json"
        ]
      },
      {
        "id": "direct-representative-rerun",
        "summary": "Run another representative rerun from the non-shrinking residual window.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:validate -- --pre-impl work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md"
        ]
      },
      {
        "id": "workflow-tooling-coverage-repair",
        "summary": "Escalate only if valid contract and invariant bindings remain invisible to owner-dossier.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json"
        ]
      }
    ]
  },
  "causalGovernance": {
    "hypothesis": "The representative rerun pair is blocked because the model route exists only as a docs/specs file and not as owner-dossier-visible contract coverage.",
    "stopConditionCheck": "Run owner-dossier, contract check, invariants check, model JSON check, `npm run analyze:causal-model`, repair, and package validation before selecting any rerun or runtime successor.",
    "expectedCausalModelChange": "The package records the pair as model-covered/proven instead of unmodelled and keeps representative rerun blocked until the next legal route uses that coverage.",
    "representativeOutcome": "architecture-gap",
    "causalDebt": "Rolling-restart remains red until a later legal successor either reruns from a permitted state, migrates owner-boundary, or opens a runtime/architecture route.",
    "crossBoundaryReview": "Runtime source, active-gate, startup readiness, release gate, and representative rerun execution remain frozen while coverage is bound."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative rerun progress model coverage binding",
    "phaseChain": [
      "runtime progress contract emits blocked_model_route for rebalancer handoff retry progress",
      "representative-progress circuit breaker blocks another direct rerun on non-shrinking residual history",
      "docs/specs/representative-rerun-progress-model.json already models non-rerun exits",
      "owner-dossier cannot see that model until contract or invariant coverage is bound"
    ],
    "currentFirstFrontier": "representative_evidence_owner / rolling_restart_rerun model coverage binding",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff remains the stale artifact frontier",
      "startup_active_gate_owner / snapshot_coverage remains downstream until priority recovery drains",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits red"
    ],
    "recentFrontierHistory": [
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-owner-wake-rerun-gate.md / model file exists but no owner-dossier coverage",
      "done-20260531-rolling-restart-priority-recovery-rebalancer-handoff-blocked-route-rerun-gate.md / architecture-gap analysis selected model coverage binding"
    ],
    "oscillationCheck": "This package binds the model surface instead of repeating another local representative rerun.",
    "handoffInvariant": "A blocked_model_route artifact cannot authorize rerun_representative_evidence until model coverage and route selection allow it.",
    "missingCausalEdge": "durable owner-dossier-visible model coverage for representative rerun progress",
    "missingCausalEdgeProbe": "npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json",
    "falsifyingProbe": "node -e \"const {execFileSync}=require('child_process'); const out=execFileSync('npm',['--silent','run','work:owner-dossier','--','--owner','representative_evidence_owner','--boundary','rolling_restart_rerun','--json'],{encoding:'utf8'}); const d=JSON.parse(out); if (d.modelStatus!=='proven') throw new Error('expected proven modelStatus');\"",
    "boundedProgressProof": "Coverage binding must expose a model-backed retry, timer, advance, rerun block, owner migration, or architecture successor before representative evidence can run again.",
    "boundedProgressProofArtifact": "docs/specs/representative-rerun-progress-model.json",
    "expectedObservableTransition": "owner-dossier reports modelStatus=proven for the representative rerun pair",
    "maxProgressBound": "one model coverage binding package before route continuation",
    "sameFrontierFallback": "If owner-dossier remains modelStatus=none, open workflow_tooling_owner / owner_dossier_model_coverage rather than rerunning evidence.",
    "expectedNextFrontier": "model-covered representative rerun route decision",
    "resultClassification": "architecture-gap",
    "stopCondition": "architecture-gap-stop"
  },
  "systemTheory": {
    "problemStatement": "The representative rerun progress model exists but is not connected to the workflow read models that govern rerun authorization.",
    "phaseChain": [
      "The runtime route discriminator emits blocked_model_route.",
      "The representative residual window remains non-shrinking.",
      "The JSON model records that non-shrinking windows block rerun.",
      "The owner-dossier currently sees no contract record, no invariants, and no model status for the pair."
    ],
    "ownerBoundaryMap": [
      "representative_evidence_owner / rolling_restart_rerun: owns rerun authorization and model coverage binding.",
      "operation_workflow_owner / rebalancer_handoff: stale artifact frontier and upstream route discriminator owner.",
      "workflow_tooling_owner / owner_dossier_model_coverage: escalation owner if coverage binding is not visible."
    ],
    "stableFacts": [
      "docs/specs/representative-rerun-progress-model.json exists and names representative_evidence_owner / rolling_restart_rerun.",
      "The model contains non_shrinking_window_blocks_rerun and blocked_route_has_non_rerun_exits.",
      "owner-dossier currently reports modelStatus=none for the exact pair."
    ],
    "changedFacts": [
      "This package will add a System Contract Record and invariant modelRef entries.",
      "A proven model route will change owner-dossier output and pre-implementation route forcing."
    ],
    "competingTheories": [
      "H1 contract modelProvenRoutes plus invariant modelRef makes owner-dossier report modelStatus=proven.",
      "H2 invariant modelRef works but modelProvenRoutes does not, leaving modelStatus=modeled and requiring contract shape repair.",
      "H3 neither binding is visible, proving a workflow tooling coverage gap."
    ],
    "eliminatedTheories": [
      "A direct representative rerun is eliminated by the non-shrinking residual window.",
      "Runtime source work is eliminated until model coverage selects a legal route.",
      "Downstream active-gate and release-gate work is eliminated while priority recovery remains first."
    ],
    "downstreamSymptoms": [
      "operation_workflow_owner / rebalancer_handoff",
      "startup_active_gate_owner / snapshot_coverage",
      "release_gate_owner / rolling_restart_fully_green_gate"
    ],
    "transitionTable": [
      {
        "inputSignal": "contract modelProvenRoutes and invariant modelRef for representative_evidence_owner / rolling_restart_rerun",
        "owner": "representative_evidence_owner / rolling_restart_rerun",
        "missingTransition": "owner-dossier-visible modelStatus=proven",
        "expectedEvidence": "owner-dossier JSON includes contractRecord, provenRoutes, invariants, and modelStatus=proven",
        "falsifier": "falsifier: node -e \"const {execFileSync}=require('child_process'); const out=execFileSync('npm',['--silent','run','work:owner-dossier','--','--owner','representative_evidence_owner','--boundary','rolling_restart_rerun','--json'],{encoding:'utf8'}); const d=JSON.parse(out); if (d.modelStatus!=='proven') throw new Error('expected proven modelStatus');\"",
        "migrationTrigger": "If model coverage is invisible after valid binding, migrate to workflow_tooling_owner / owner_dossier_model_coverage."
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only if the coverage binding is valid but owner-dossier still cannot see it."
    ],
    "architectureGapTriggers": [
      "Open workflow tooling architecture repair if the contract and invariant validators pass but owner-dossier remains modelStatus=none."
    ],
    "wholeSystemInvariant": "A representative residual-count window that does not shrink cannot authorize another rolling_restart_rerun slice without model-backed route coverage.",
    "wholeSystemInvariants": [
      {
        "invariant": "representative_evidence_owner / rolling_restart_rerun must record model coverage or migration before another representative rerun.",
        "coupledWith": [
          "operation_workflow_owner / rebalancer_handoff",
          "workflow_tooling_owner / owner_dossier_model_coverage"
        ],
        "couplingNote": "The representative rerun model must be visible to workflow tooling before the stale operation_workflow_owner frontier can be rerun or migrated."
      }
    ]
  },
  "sliceTheory": {
    "systemTheoryRef": "work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md systemTheory",
    "selectedSystemTheory": "The existing model must be bound into contract and invariant surfaces before the rerun gate can legally continue.",
    "selectedMechanism": "contract_gap with observation_gap and ownership_gap as alternates",
    "sourceTestContract": "architecture/contracts/rolling-restart-representative-rerun-progress.md, architecture/contracts/invariants.json, and owner-dossier output",
    "falsifier": "falsifier: node -e \"const {execFileSync}=require('child_process'); const out=execFileSync('npm',['--silent','run','work:owner-dossier','--','--owner','representative_evidence_owner','--boundary','rolling_restart_rerun','--json'],{encoding:'utf8'}); const d=JSON.parse(out); if (d.modelStatus!=='proven') throw new Error('expected proven modelStatus');\"",
    "representativeExpectedMovement": "owner-dossier modelStatus moves from none to proven for representative_evidence_owner / rolling_restart_rerun",
    "killRule": "If contract and invariant checks pass but owner-dossier still reports unchanged model coverage, redirect by opening workflow_tooling_owner / owner_dossier_model_coverage as the successor.",
    "theoryFitScore": {
      "evidenceFit": "high - owner-dossier names the exact missing coverage fields.",
      "ownerBoundaryFit": "high - representative_evidence_owner / rolling_restart_rerun owns rerun admission.",
      "falsifiability": "high - owner-dossier JSON must change to proven.",
      "representativeMovement": "medium - this records model route movement rather than green evidence.",
      "downstreamRiskContainment": "high - runtime, downstream owners, and rerun execution stay frozen."
    },
    "wrongSliceTriggers": [
      "contract validation requires runtime source edits",
      "owner-dossier reports a different deciding owner boundary",
      "model coverage remains invisible after valid binding"
    ]
  },
  "modelTheory": {
    "modelKind": "state-model",
    "executableArtifact": "docs/specs/representative-rerun-progress-model.json",
    "propertiesProven": [
      "non_shrinking_window_blocks_rerun",
      "blocked_route_has_non_rerun_exits"
    ],
    "assumptions": [
      "Closed package residualCount values are artifact-bound and authoritative.",
      "Runtime source and representative rerun execution remain frozen while coverage is bound."
    ],
    "counterExampleHandling": "If owner-dossier still reports modelStatus none after contract and invariant binding, escalate to workflow_tooling_owner / owner_dossier_model_coverage.",
    "linkedSystemTheoryRef": "work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md systemTheory"
  },
  "closureSummary": {
    "resultClassification": "architecture-gap",
    "predictionAccuracy": "matched",
    "observedMovement": "Owner-dossier now reports contractRecord=architecture/contracts/rolling-restart-representative-rerun-progress.md, modelStatus=proven, one model selectedLayer proven route, and two invariant modelRef entries for representative_evidence_owner / rolling_restart_rerun.",
    "successorReason": "The stale representative artifact still routes priority_recovery_partition_progress to operation_workflow_owner / rebalancer_handoff with accept_classified_backpressure; the next route decision must use the proven representative rerun model instead of treating blocked_model_route as rerun permission.",
    "nextOwnerBoundary": "representative_evidence_owner / rolling_restart_rerun",
    "evidenceArtifact": "architecture/contracts/rolling-restart-representative-rerun-progress.md; architecture/contracts/invariants.json; docs/specs/representative-rerun-progress-model.json"
  },
  "commitAndPushLedgerRequired": true,
  "result": {
    "classification": "architecture-gap"
  }
}
-->

## Why

The representative rerun model already encodes the non-shrinking residual
window rule, but workflow tooling does not see that model unless a contract
record or invariant registry entry points to it. This package binds the model
into those durable surfaces before any new representative rerun.

## Core Logic Brief

- Canonical outcome: `representative_evidence_owner / rolling_restart_rerun`
  has owner-dossier-visible model coverage.
- Inputs/signals: owner-dossier `modelStatus=none`, the existing
  `docs/specs/representative-rerun-progress-model.json`, contract validator,
  invariant registry validator, and the rolling-restart baseline artifact.
- State model or invariant: a non-shrinking residual window routes to
  `blocked_model_route` and exits only through non-rerun successors.
- Non-goals and forbidden interpretations: do not run the representative
  scenario, patch runtime source, or promote downstream owners while coverage is
  unbound.
- Proof mapping: owner-dossier must report `modelStatus=proven` with a contract
  record, proven route, and invariant entries; contract and invariant validators
  must pass.
- Wrong-slice trigger: if valid bindings do not change owner-dossier output,
  open workflow_tooling_owner / owner_dossier_model_coverage.

## Validation

1. falsifier: node -e "const {execFileSync}=require('child_process'); const out=execFileSync('npm',['--silent','run','work:owner-dossier','--','--owner','representative_evidence_owner','--boundary','rolling_restart_rerun','--json'],{encoding:'utf8'}); const d=JSON.parse(out); if (d.modelStatus!=='proven') throw new Error('expected proven modelStatus'); if (!d.contractRecord) throw new Error('missing contractRecord'); if (!Array.isArray(d.provenRoutes)||d.provenRoutes.length===0) throw new Error('missing provenRoutes');"
2. regression: npm run work:contract:check -- architecture/contracts/rolling-restart-representative-rerun-progress.md
3. supporting: npm run work:invariants:check
4. supporting: node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('docs/specs/representative-rerun-progress-model.json','utf8')); if (!m.properties.some((p)=>p.id==='non_shrinking_window_blocks_rerun')) throw new Error('missing non_shrinking_window_blocks_rerun'); if (!m.properties.some((p)=>p.id==='blocked_route_has_non_rerun_exits')) throw new Error('missing blocked_route_has_non_rerun_exits');"

## Execution Evidence

- [x] action: freshness-review; owner: Agent Popper (019e7fb5-0cb4-7c62-b2da-95b4333c395f); files-changed: none; validation: `npm run work:context` passed and confirmed active package plus modelStatus=none; `npm run work:package:doctor -- work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md` failed only on missing checked freshness-review and implementation evidence; `npm run work:validate -- --entry work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md` passed; `npm --silent run work:owner-dossier -- --owner representative_evidence_owner --boundary rolling_restart_rerun --json` passed with contractRecord=null, invariants=[], modelStatus=none, provenRoutes=[]; `npm run work:invariants:check` passed; model JSON property probe passed; decision: fresh; outcome: passed.
- [x] action: implementation; owner: representative_evidence_owner; files-changed: architecture/contracts/rolling-restart-representative-rerun-progress.md, architecture/contracts/invariants.json, work/packages/active-20260531-representative-rerun-progress-model-coverage-binding.md; validation: `npm run work:contract:check -- architecture/contracts/rolling-restart-representative-rerun-progress.md` passed; `npm run work:invariants:check` passed; owner-dossier assertion passed with contractRecord=architecture/contracts/rolling-restart-representative-rerun-progress.md, modelStatus=proven, provenRoutes=1, invariants=2; model JSON property probe passed; `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json --owner representative_evidence_owner --boundary rolling_restart_rerun --dominant-reason representative_rerun_model_coverage_binding` passed; `npm run analyze:causal-model -- test-output/reports/rolling-restart-priority-recovery-backpressure-rerun.report.json` passed with accept_classified_backpressure; parent revalidated focused proof: yes; outcome: passed.
- [x] action: verification-fix; owner: Agent Herschel (019e7fbc-0b8f-74c2-813c-c1669dbe744f); files-changed: none; validation: verifier ran active entry/pre-impl validation, `npm run work:contract:check -- architecture/contracts/rolling-restart-representative-rerun-progress.md`, `npm run work:invariants:check`, owner-dossier assertion with modelStatus=proven, contractRecord=architecture/contracts/rolling-restart-representative-rerun-progress.md, provenRoutes=1, invariants=2, `npm run work:theory-ledger -- validate`, and `git diff --check` for touched files; verifier confirmed the new contract `modelProvenRoutes` and invariant modelRef entries are the minimal owner-dossier coverage binding and do not claim representative green movement or runtime behavior changes; parent revalidated focused proof: yes; outcome: validated.

## Commit And Push Ledger

1. Push target: origin/codex/pending-ack-eligibility-filter
2. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
3. Pushed: no
