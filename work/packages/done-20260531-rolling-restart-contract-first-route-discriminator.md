# Work Package: Rolling Restart Contract-First Route Discriminator

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "playback": "none",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "contract_first_route_selection",
    "currentState": "Package opened to classify the active rolling-restart residual before more runtime edits.",
    "nextAction": "Close the discriminator as accepted-backpressure route selection and open fresh representative rolling-restart evidence before runtime source work.",
    "predecessor": "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-contract-first-route-discriminator.md",
      "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md",
      "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-system-theory-rederive.md",
      "work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md",
      "work/sprints/superseded-2026-q2-spec-led-runtime-modularization.md",
      "architecture/contracts/rolling-restart-rebalancer-handoff.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/theory-ledger.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js"
    ],
    "commitScope": [
      "work/packages/active-20260531-rolling-restart-contract-first-route-discriminator.md",
      "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-rerun-backpressure-residual.md",
      "work/packages/superseded-20260530-rolling-restart-priority-recovery-rebalancer-handoff-contract-gap-system-theory-rederive.md",
      "work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md",
      "work/sprints/superseded-2026-q2-spec-led-runtime-modularization.md",
      "architecture/contracts/rolling-restart-rebalancer-handoff.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/theory-ledger.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The previous active package produced same-frontier evidence, so the next action must classify the route before implementation."
  },
  "modelFit": {
    "packageClass": "system-theory-rederive",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "whole-system-theory/contract-first-route-selection",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "model contracts fail",
      "route evidence is stale or ambiguous",
      "proof does not select exactly one next owner-boundary route"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-contract-first-green-loop"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
        "regression: npm run model:contracts",
        "supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait"
      ]
    }
  },
  "systemTheoryRevision": true,
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run model:contracts",
      "npm run work:loop-health -- --owner operation_workflow_owner --boundary rebalancer_handoff",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait"
    ],
    "decisionRecord": "Record the selected route in this package, the sprint edge card, current-blocker state, and the theory ledger before opening implementation work.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "Do not open a runtime-owner-boundary successor from this artifact; open runtime-owner-boundary work only if fresh representative evidence reselects a stable local blocker after accepted backpressure is rerun."
  },
  "theoryLoop": {
    "gateMarker": "same-mechanism-repeat",
    "result": "needs-rerun",
    "outcome": "theory-confirmed",
    "jointFalsifierCommand": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --explain snapshot_coverage"
  },
  "systemContractRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff",
  "modelTheory": {
    "modelKind": "invariant-spec",
    "executableArtifact": "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json",
    "propertiesProven": [
      "Priority recovery must either classify backpressure as an accepted residual with bounded retry semantics or route to a concrete owner/boundary mismatch.",
      "A repeated same-frontier result must select a new route before another runtime-owner package is opened."
    ],
    "assumptions": [
      "The latest representative artifact is still a valid evidence anchor for the active residual.",
      "The residual name accept_classified_backpressure is not by itself proof of a runtime defect.",
      "A green route must pass model contracts before another runtime implementation package is opened."
    ],
    "counterExampleHandling": "Counterexamples route to contract/model repair, evidence regeneration, or a named owner-boundary implementation package before runtime edits.",
    "linkedSystemTheoryRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff",
    "counterexamples": [
      "The decision table rejects the current classification because no invariant covers it.",
      "The active-gate contract shows the residual belongs outside rebalancer handoff.",
      "The latest representative artifact is stale and must be regenerated before route selection."
    ]
  },
  "causalGovernance": {
    "hypothesis": "The current rolling-restart residual is best handled by first discriminating between accepted backpressure, rebalancer handoff defect, active-gate defect, stale evidence, and release-gate expectation mismatch.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json, model contracts, loop health, and scenario route proof before opening any runtime implementation package.",
    "expectedCausalModelChange": "The package selected accepted classified backpressure plus fresh representative rerun before runtime source promotion.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Representative green evidence is still required; model contracts and route evidence do not close the sprint.",
    "crossBoundaryReview": "Runtime source edits are out of scope for this discovery package."
  },
  "systemTheory": {
    "problemStatement": "release_gate_owner / rolling_restart_fully_green_gate has repeated observation-gap style closure without representative green, so the sprint must rederive the whole-system route before any local runtime slice is promoted.",
    "phaseChain": [
      "The superseded sprint ended with accept_classified_backpressure under operation_workflow_owner / rebalancer_handoff.",
      "Frontier history on release_gate_owner / rolling_restart_fully_green_gate reports same-mechanism-repeat observation_gap.",
      "The new sprint requires contract/model proof before another runtime implementation package."
    ],
    "ownerBoundaryMap": [
      "release_gate_owner / rolling_restart_fully_green_gate: owns the representative green condition and route-selection stop rule.",
      "operation_workflow_owner / rebalancer_handoff: owns the current runtime frontier accept_classified_backpressure / priority_recovery_event_driven_wait.",
      "active_gate_owner / convergence_gate: remains a candidate if model or route evidence shows recovered handoff is complete but active convergence still blocks.",
      "workflow_tooling_owner / scenario_router: owns stale or under-classified route evidence if canonical commands cannot select one route."
    ],
    "stableFacts": [
      "Rolling-restart representative green remains the sprint success condition.",
      "The latest evidence anchor is test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json.",
      "The visible residual is accept_classified_backpressure.",
      "Runtime source edits are out of scope until this discriminator selects one owner/boundary route."
    ],
    "changedFacts": [
      "The active sprint now carries system contract records and model gates.",
      "The release-gate boundary has a same-mechanism-repeat observation_gap signal.",
      "The current package must select route, contract repair, evidence regeneration, or release-gate expectation update before implementation."
    ],
    "competingTheories": [
      "H1 accepted bounded backpressure is valid and the release gate expectation must change.",
      "H2 operation_workflow_owner / rebalancer_handoff still lacks a wake, retry, reconcile, or advance mechanism for priority recovery.",
      "H3 active_gate_owner / convergence_gate misreads recovered handoff state as incomplete.",
      "H4 workflow_tooling_owner / scenario_router evidence is stale or under-classified and must be regenerated before runtime work."
    ],
    "eliminatedTheories": [
      "Opening generic rebalancer runtime work is eliminated until proof names a concrete prediction.",
      "Closing the sprint from model evidence alone is eliminated by the representative-green success condition.",
      "Treating current-blocker route text as runtime truth is eliminated unless model contracts and canonical route proof agree."
    ],
    "downstreamSymptoms": [
      "active_gate convergence remains downstream until the route discriminator selects it.",
      "release-gate green remains downstream until fresh representative evidence reports no active residual.",
      "publication handoff remains downstream unless selected by new route evidence."
    ],
    "transitionTable": [
      {
        "inputSignal": "accept_classified_backpressure / operation_workflow_owner / rebalancer_handoff with priority_recovery_event_driven_wait",
        "owner": "release_gate_owner / rolling_restart_fully_green_gate",
        "missingTransition": "route selection between bounded backpressure, rebalancer handoff implementation, active-gate convergence implementation, stale evidence regeneration, or release-gate expectation update",
        "expectedEvidence": "model contracts, loop health, causal model, and scenario route agree on exactly one next owner/boundary or non-runtime repair route",
        "falsifier": "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
        "migrationTrigger": "canonical proof selects operation_workflow_owner / rebalancer_handoff, active_gate_owner / convergence_gate, workflow_tooling_owner / scenario_router, or release_gate_owner / rolling_restart_fully_green_gate with a concrete successor action"
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate to operation_workflow_owner only if route proof selects rebalancer_handoff with a concrete wake, retry, reconcile, or advance prediction.",
      "Migrate to active_gate_owner only if route proof shows recovered handoff is accepted but convergence evidence still blocks.",
      "Migrate to workflow_tooling_owner only if evidence is stale, contradictory, or under-classified.",
      "Stay at release_gate_owner only for accepted bounded backpressure or release-gate expectation mismatch."
    ],
    "architectureGapTriggers": [
      "If the proof repeats same-frontier without selecting a route, record contract/model correction before runtime work.",
      "If model contracts fail, repair the system contract or model artifact before implementation.",
      "If route evidence contradicts the model, prefer evidence regeneration over local runtime edits."
    ],
    "wholeSystemInvariant": "Repeated release-gate observation gaps must rederive the route and select one owner/boundary before any runtime implementation package opens.",
    "wholeSystemInvariants": [
      {
        "invariant": "release_gate_owner / rolling_restart_fully_green_gate cannot promote another local runtime slice until model and route evidence select exactly one owner/boundary or non-runtime repair route.",
        "coupledWith": [
          "operation_workflow_owner / rebalancer_handoff bounded residual invariant"
        ],
        "couplingNote": "The release gate decides whether the residual is accepted bounded backpressure or must migrate to a runtime owner; operation workflow evidence, startup_support_evidence, and snapshot_coverage cannot be interpreted independently."
      },
      {
        "invariant": "operation_workflow_owner / rebalancer_handoff accept_classified_backpressure must either carry bounded retry semantics or expose a missing wake, retry, reconcile, or advance transition.",
        "coupledWith": [
          "release_gate_owner / rolling_restart_fully_green_gate route-selection invariant"
        ],
        "couplingNote": "If bounded semantics are valid, release-gate expectations are the route; if not, operation workflow owns a concrete implementation successor."
      }
    ]
  },
  "sliceTheory": {
    "systemTheoryRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff",
    "selectedSystemTheory": "H2 is selected only if model contracts pass and scenario-route keeps operation_workflow_owner / rebalancer_handoff as the concrete runtime route; otherwise select contract/model repair, evidence regeneration, active-gate convergence, or release-gate expectation update.",
    "selectedMechanism": "contract_gap with observation_gap and protocol_mismatch alternates",
    "sourceTestContract": "No runtime source files are in writeScope. The executable contract is the system-theory rederive, model contracts, loop health, causal model, and scenario-route discriminator.",
    "falsifier": "npm run model:contracts",
    "representativeExpectedMovement": "selected route to one owner/boundary, contract/model repair, evidence regeneration, release-gate expectation update, or representative green after the successor package",
    "killRule": "If proof cannot select exactly one route, redirect to contract/model correction or evidence regeneration instead of opening runtime work; same-frontier no-reduction blocks this package from closing as implementation-ready.",
    "theoryFitScore": {
      "evidenceFit": "high - the package uses the current representative artifact plus model contracts and canonical route commands.",
      "ownerBoundaryFit": "medium - the release gate owns green selection while the current runtime frontier is operation_workflow_owner / rebalancer_handoff.",
      "falsifiability": "high - model contracts or route proof can reject runtime promotion.",
      "representativeMovement": "medium - this package produces structural route movement; representative green requires a successor package.",
      "downstreamRiskContainment": "high - runtime files stay candidate-only until route proof selects one owner boundary."
    },
    "wrongSliceTriggers": [
      "model contracts fail",
      "scenario-route selects a different owner or boundary",
      "causal model reports stale or contradictory evidence",
      "proof repeats same-frontier without a concrete runtime prediction"
    ]
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart contract-first route discriminator",
    "phaseChain": [
      "Latest representative artifact is test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json.",
      "The prior active package stayed at accept_classified_backpressure.",
      "The successor sprint requires a contract/model route before runtime implementation."
    ],
    "currentFirstFrontier": "accept_classified_backpressure / operation_workflow_owner / rebalancer_handoff",
    "knownDownstreamBlockers": [
      "active_gate_owner / convergence_gate remains downstream until the route discriminator says otherwise",
      "release_gate_owner / rolling_restart_fully_green_gate remains downstream until representative evidence exits green"
    ],
    "missingCausalEdge": "Whether accept_classified_backpressure is valid bounded backpressure, a rebalancer handoff defect, an active-gate defect, stale evidence, or a release-gate expectation mismatch.",
    "missingCausalEdgeProbe": "npm run model:contracts",
    "falsifyingProbe": "npm run model:contracts",
    "boundedProgressProof": "The proof ladder must decide whether accept_classified_backpressure is a bounded retry/reconcile residual or whether another owner must emit an advance, wake, retry, or reconcile mechanism; it must select exactly one next route and must not reopen generic rebalancer work.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "expectedObservableTransition": "The active route becomes fresh representative evidence after accepted classified backpressure; runtime source promotion remains blocked until the rerun selects a stable local blocker.",
    "maxProgressBound": "one discovery-framing package before a concrete successor package",
    "sameFrontierFallback": "A repeated same-frontier result without route selection forces contract correction or a new discriminator.",
    "expectedNextFrontier": "release_gate_owner / rolling_restart_fully_green_gate fresh representative rerun, then representative-green or the fresh first frontier",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "release_gate_owner",
    "fromBoundary": "rolling_restart_fully_green_gate",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "This discovery package is owned by the release gate because it selects the next route for rolling-restart green, while the current representative first frontier remains operation_workflow_owner / rebalancer_handoff.",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait"
  },
  "representativeResidual": {
    "status": "needs-rerun",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "frontier": "accept_classified_backpressure / operation_workflow_owner / rebalancer_handoff",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Run fresh representative rolling-restart evidence before runtime source promotion.",
    "residualCount": 1
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap with protocol_mismatch and stale_evidence as alternates",
    "stableFacts": "The latest recorded residual stayed at accept_classified_backpressure after a rebalancer handoff rerun.",
    "changedFacts": "The sprint format now requires system contract records and executable model gates before another runtime package.",
    "rejectedAlternatives": "Opening another rebalancer runtime patch without a new discriminator is rejected because the previous package produced same-frontier evidence.",
    "ownerWhoDecides": "release_gate_owner",
    "currentAction": "Classify the residual route through model contracts and scenario route evidence.",
    "missingTransitionOrObservation": "The loop does not yet know whether accept_classified_backpressure is a valid bounded wait, a rebalancer handoff defect, an active-gate defect, or stale evidence.",
    "smallestFalsifyingProbe": "regression: npm run model:contracts",
    "expectedMovement": "The discriminator selects exactly one next route: runtime owner implementation, contract/model repair, evidence regeneration, or release-gate expectation update.",
    "negativeResultMeans": "If no route is selected, this package failed and must not spawn a generic implementation package.",
    "escalationRule": "A second same-frontier result without a selected route forces a new discovery-framing package or contract correction."
  },
  "observablePrediction": {
    "metric": "rolling-restart contract-first route selection",
    "predicted": "Proof will select one explicit route instead of repeating the same rebalancer handoff implementation loop.",
    "observed": "Model contracts pass after repairing the stale system-contract package reference; canonical route evidence keeps operation_workflow_owner / rebalancer_handoff visible but causal outcome is accept_classified_backpressure with stopCondition classified_backpressure, so runtime promotion is not selected.",
    "accuracy": "partial",
    "evidence": "npm run model:contracts; npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait; npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json"
  },
  "closureSummary": {
    "status": "validated",
    "resultClassification": "classification-only",
    "predictionAccuracy": "partial",
    "observedMovement": "Contract/model gate is green after repairing the stale system-contract package reference; route proof classifies priority_recovery_event_driven_wait as accepted backpressure and selects fresh representative rerun before runtime source promotion.",
    "successorReason": "The sprint success condition still requires representative rolling-restart evidence; open the fresh representative rerun gate and route the fresh first frontier if it stays red.",
    "nextOwnerBoundary": "release_gate_owner / rolling_restart_fully_green_gate fresh representative rerun gate",
    "evidenceArtifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "evidence": [
      "npm run model:contracts",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json"
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Discovery Gate

Package contract:

- Do not edit runtime code before selecting a route.
- Every next implementation package must name a system contract record.
- Repeated same-frontier results require a new discriminator or a contract update.

Question: is the current `accept_classified_backpressure` residual a valid accepted
state that needs a release-gate expectation update, or is it masking a remaining
priority-recovery/rebalancer/active-gate contract mismatch?

Current evidence:

- `test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json`
- Prior rerun classification:
  `operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait`
- Prior movement:
  same-frontier, no reduction

Competing routes:

- `release_gate_owner / rolling_restart_fully_green_gate`: accepted backpressure is
  now a bounded residual and the green gate expectation is too strict.
- `operation_workflow_owner / rebalancer_handoff`: priority recovery still waits on
  a handoff event that should be emitted or normalized earlier.
- `active_gate_owner / convergence_gate`: active-gate convergence still treats a
  recovered handoff as incomplete.
- `workflow_tooling_owner / scenario_router`: the route artifact is stale or
  under-classified and should not drive implementation.

Selection rule:

- If model contracts pass and route evidence remains at the same owner/boundary,
  create one implementation package with a concrete runtime prediction.
- If model contracts fail, fix the failing contract/model artifact before runtime
  edits.
- If route evidence is stale or ambiguous, regenerate representative evidence before
  opening a runtime package.

## Core Logic Brief

- Canonical outcome: select contract/model repair, accepted bounded backpressure,
  runtime owner implementation, active-gate convergence work, evidence
  regeneration, or release-gate expectation update before runtime edits.
- Inputs/signals: system-theory rederive, `npm run model:contracts`,
  `work:loop-health`, `work:scenario-route`, and `analyze:causal-model` on the
  active rolling-restart artifact.
- State model or invariant: release-gate green cannot promote another runtime
  slice until model and route evidence select exactly one owner/boundary or a
  non-runtime repair route.
- Non-goals and forbidden interpretations: do not edit `src/`, do not mark the
  sprint green from model evidence alone, and do not reopen generic rebalancer
  work on unchanged evidence.
- Proof mapping: model contracts validate contract records and model bindings;
  loop health detects saturation; scenario-route selects the current owner route;
  causal-model verifies accepted backpressure versus migration.
- Wrong-slice trigger: if proof cannot select exactly one route, redirect to
  contract/model repair or evidence regeneration instead of runtime work.

## Decision Experiment Gate

- Decision question: does `accept_classified_backpressure` route to accepted
  bounded backpressure, contract/model repair, rebalancer handoff runtime work,
  active-gate convergence work, stale evidence regeneration, or release-gate
  expectation update?
- Architecture review: system contract records stay authoritative; this package
  may repair the referenced contract record but must not edit runtime source.
- Competing hypotheses: accepted bounded backpressure, rebalancer handoff defect,
  active-gate convergence defect, stale route evidence, or release-gate
  expectation mismatch.
- Pre-edit focused probe: `npm run model:contracts`.
- Success metrics: residual count, selected frontier, route migration, or
  representative green moves through exactly one selected next action or
  contract/model repair route.
- Representative rerun: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-route-rerun.report.json --fast-local --verbose
- Kill rule: same-frontier/no-reduction or model-contract failure redirects by
  opening the contract/model repair successor, evidence regeneration, or another
  discriminator instead of runtime edits.

## Observable Prediction

Running the proof ladder should produce one of four explicit next states:

- runtime owner implementation package selected;
- contract/model repair package selected;
- evidence regeneration package selected;
- release-gate expectation package selected.

Any result that simply says "continue rebalancer work" without a new prediction is
a failed discriminator.

## Non-Goals

- Do not edit `src/` in this package.
- Do not mark the successor sprint green from model evidence alone.
- Do not reopen the superseded sprint.

## Execution Evidence

- [x] action: implementation; owner: release_gate_owner; files-changed: work/packages/active-20260531-rolling-restart-contract-first-route-discriminator.md, work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md, work/theory-ledger.md, architecture/contracts/rolling-restart-rebalancer-handoff.md; validation: npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write passed and stamped systemTheoryRederivedAt=2026-05-31; initial npm run model:contracts failed because architecture/contracts/rolling-restart-rebalancer-handoff.md referenced a missing active predecessor package; after repairing the contract packageRef to the superseded package, npm run model:contracts passed; npm run work:loop-health -- --owner operation_workflow_owner --boundary rebalancer_handoff passed with loopHealth=compositional-signal-active; npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait passed with causalOutcome=accept_classified_backpressure, stopMode=classified_backpressure, and priorityRecoveryResiduals.witnessCount=7; npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json passed with outcome=accept_classified_backpressure and failedInvariantCount=0; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json passed with first frontier operation_workflow_owner / rebalancer_handoff and next expected frontier startup_active_gate_owner / snapshot_coverage; parent revalidated focused proof: yes; outcome: validated - route discriminator selects fresh representative rerun before runtime source promotion.
- [x] action: verification-fix; owner: release_gate_owner; files-changed: none; validation: npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-contract-first-route-discriminator.md passed; npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-contract-first-route-discriminator.md passed; npm run work:theory-ledger -- validate passed; npm run model:contracts passed; parent revalidated focused proof: yes; outcome: validated - package records accepted-backpressure route selection and keeps runtime files candidate-only.

## Commit And Push Ledger

1. Focused package commit: b52134994eec633c6b28890401de7da967e6476e
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T08:19:36.518Z