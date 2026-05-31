# Rolling Restart Fresh Representative Rerun Gate

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-31",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "playback": "none",
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "dominantReason": "accepted_classified_backpressure_rerun",
    "currentState": "The predecessor selected accepted classified backpressure, but release-gate history is saturated on observation_gap, so a system-theory revision must be recorded before the fresh representative rerun executes.",
    "nextAction": "Rederive the release-gate system theory, run fresh rolling-restart representative evidence, route the resulting artifact, and select representative-green closure or one fresh successor.",
    "predecessor": "work/packages/done-20260531-rolling-restart-contract-first-route-discriminator.md",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/theory-ledger.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-agent-cards.js",
      "scripts/work-agent-plan.js",
      "scripts/work-agent-validate.js",
      "scripts/work-agent-collect.js",
      "scripts/work-context.js",
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "test/scripts/work-agent-cards.test.js",
      "work/RULES.md",
      "work/agent-reports/README.md",
      "work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/evidence-scout.md",
      "work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/model-contract-scout.md",
      "work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/source-map-scout.md",
      "work/templates/agent-route-card.md",
      "work/templates/agent-verifier-card.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-contract-first-green-rerun.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner-ports.js",
      "src/control-plane/publication-active-gate-handoff-contract-decision.js"
    ],
    "commitScope": [
      "work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md",
      "work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/theory-ledger.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-agent-cards.js",
      "scripts/work-agent-plan.js",
      "scripts/work-agent-validate.js",
      "scripts/work-agent-collect.js",
      "scripts/work-context.js",
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "test/scripts/work-agent-cards.test.js",
      "work/RULES.md",
      "work/agent-reports/README.md",
      "work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/evidence-scout.md",
      "work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/model-contract-scout.md",
      "work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/source-map-scout.md",
      "work/templates/agent-route-card.md",
      "work/templates/agent-verifier-card.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "work/packages/todo-20260531-rolling-restart-active-gate-observation-route.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The contract/model discriminator is green and selected accepted backpressure, so only fresh representative evidence can prove green or name the next real frontier.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "system-theory-rederive",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate/fresh-representative-rerun",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "rederive fails to record a durable release-gate invariant",
      "fresh evidence selects a runtime owner boundary",
      "fresh evidence repeats the same frontier with no metric reduction",
      "representative evidence is unavailable or contradictory"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260531-rolling-restart-contract-first-green-loop",
      "theory-20260531-rolling-restart-contract-first-green-fresh-rerun"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
        "supporting: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose",
        "regression: npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json"
      ]
    }
  },
  "parallelDiagnostics": {
    "mode": "read-only-scouts",
    "requiredCards": [
      "evidence-scout",
      "model-contract-scout",
      "source-map-scout"
    ],
    "reportDir": "work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate",
    "coordinatorOnlyWrites": [
      "work/packages/",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/theory-ledger.md"
    ],
    "routeDecisionRequired": true,
    "trigger": "after the fresh representative rerun routes red or before opening a runtime successor"
  },
  "systemTheoryRevision": true,
  "theoryLoop": {
    "gateMarker": "same-mechanism-repeat",
    "result": "migrated",
    "outcome": "theory-confirmed",
    "jointFalsifierCommand": "npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain active_gate_snapshot_coverage",
    "successorPackage": "work/packages/todo-20260531-rolling-restart-active-gate-observation-route.md"
  },
  "progressContract": {
    "owner": "release_gate_owner",
    "boundary": "rolling_restart_fully_green_gate",
    "state": "deferred",
    "reason": "accepted_classified_backpressure_rerun",
    "nextAction": "open_startup_active_gate_snapshot_coverage_architecture_route_successor",
    "wakeSource": "manual-release-gate",
    "retryAfterMs": 0,
    "terminalState": "representative-green",
    "evidencePath": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "blockingDependency": "runtime_promotion_guard_requires_non_repeated_source_contract"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-bounded-reentry-model-route.report.json",
    "routeOwner": "release_gate_owner",
    "routeBoundary": "rolling_restart_fully_green_gate",
    "routeDominantReason": "accepted_classified_backpressure_rerun",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "System-theory rederive recorded release-gate observation-gap saturation; fresh representative evidence drained priority-recovery residuals to zero and selected active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage, while runtime promotion remains guarded by saturated history until a non-repeated architecture route is implemented.",
    "requiredRefreshCommands": [
      "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain active_gate_snapshot_coverage",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "residualCount": 1,
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Open the selected startup_active_gate_owner / snapshot_coverage architecture-route successor; priority-recovery residual witness count is zero."
  },
  "causalGovernance": {
    "hypothesis": "Accepted classified backpressure is only a valid non-runtime route if release-gate observation-gap saturation is recorded and a fresh rolling-restart rerun either exits green or selects a fresh first frontier for successor work.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json after the system-theory rederive, representative rerun, and route proof.",
    "expectedCausalModelChange": "The package records a release-gate system-theory revision plus representative-green, a fresh owner/boundary migration, a concrete reduction, same-frontier classification, or architecture/non-runtime successor decision.",
    "representativeOutcome": "reduced",
    "causalDebt": "The sprint remains non-green: the fresh artifact is red at active_gate_snapshot_coverage with owner_reconcile_pending, selected_snapshot_source_timeout, and snapshot_repair_deferred.",
    "crossBoundaryReview": "No runtime source edits are in this package; source changes are delegated to the successor selected by fresh route evidence and the architecture-route guard."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart fresh representative rerun gate",
    "phaseChain": [
      "contract-first discriminator repaired the stale system contract reference",
      "model contracts passed",
      "canonical route classified priority recovery as accepted backpressure",
      "release-gate observation-gap saturation blocks a plain rerun package",
      "fresh representative evidence must prove green or name a fresh first frontier after the rederive"
    ],
    "currentFirstFrontier": "release_gate_owner / rolling_restart_fully_green_gate routed to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence remains downstream until active-gate snapshot coverage improves",
      "benchmark_events table partition visibility remains downstream of startup/readiness convergence"
    ],
    "recentFrontierHistory": [
      "active-20260531-rolling-restart-fresh-representative-rerun-gate.md / release_gate_owner / rolling_restart_fully_green_gate / reduced",
      "done-20260531-rolling-restart-contract-first-route-discriminator.md / release_gate_owner / rolling_restart_fully_green_gate / classification-only",
      "done-20260530-rolling-restart-release-gate-observation-gap-system-theory-rederive.md / release_gate_owner / rolling_restart_fully_green_gate / architecture-gap",
      "done-20260529-rolling-restart-post-architecture-gap-fresh-representative-green-gate.md / release_gate_owner / rolling_restart_fully_green_gate / same-frontier"
    ],
    "oscillationCheck": "Release-gate history is saturated and the fresh route guard reports runtimePromotionGuard.state=blocked; route-card disagreement was resolved by opening the required architecture-route runtime successor rather than another classifier.",
    "handoffInvariant": "Fresh representative evidence must either close rolling-restart green or name a single successor without reinterpreting stale release-gate artifacts as runtime authorization.",
    "missingCausalEdge": "Fresh evidence drained priority recovery but exposed active_gate_snapshot_coverage owner_reconcile_pending; the next edge is a non-repeated startup_active_gate_owner / snapshot_coverage architecture-route implementation.",
    "missingCausalEdgeProbe": "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose",
    "falsifyingProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose",
    "boundedProgressProof": "The rederive must record release-gate saturation and the representative rerun must pass green or produce one canonical first-frontier route with a bounded progress, retry, reconcile, drain, dispatch, delivery, timer, timeout, wake, or advance mechanism named by fresh evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "expectedObservableTransition": "rolling-restart exits green or route proof selects one fresh owner/boundary successor from the rerun artifact; observed successor is startup_active_gate_owner / snapshot_coverage with priority-recovery residuals at zero.",
    "maxProgressBound": "one system-theory rederive, one representative rerun, and one canonical route decision",
    "sameFrontierFallback": "If fresh evidence repeats the same frontier with no metric reduction, open an architecture/causal experiment or successor instead of local runtime edits.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage architecture-route successor, then representative rerun or downstream startup readiness route",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix"
  },
  "mechanismCard": {
    "failureMechanism": "observation_gap with contract_gap as alternate",
    "stableFacts": "Model contracts pass and runtime source promotion is blocked until release-gate system theory is rederived and fresh representative evidence runs.",
    "changedFacts": "The stale contract packageRef was repaired in the predecessor; the fresh rerun drained priority-recovery residual witnesses to zero and exposed active_gate_snapshot_coverage with owner_reconcile_pending.",
    "rejectedAlternatives": "Do not open another runtime package from the stale artifact.",
    "ownerWhoDecides": "release_gate_owner",
    "currentAction": "Close the rederive/rerun package as reduced and create the startup_active_gate_owner / snapshot_coverage architecture-route successor.",
    "missingTransitionOrObservation": "Non-repeated owner-owned active-gate snapshot-coverage transition after selected snapshot observation retry.",
    "smallestFalsifyingProbe": "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
    "expectedMovement": "system-theory revision plus priority-recovery residual reduction to zero and one selected startup_active_gate_owner / snapshot_coverage successor.",
    "negativeResultMeans": "unchanged same-frontier/no-reduction evidence redirects to a bounded architecture/causal experiment or successor instead of runtime edits.",
    "escalationRule": "Fresh evidence that is contradictory or unavailable blocks runtime promotion and routes to evidence regeneration."
  },
  "systemTheory": {
    "problemStatement": "rolling-restart cannot close from accepted classified backpressure while release-gate observation_gap is saturated; the sprint revised release-gate system theory, ran fresh representative evidence, and now must redirect to the active-gate snapshot-coverage successor selected by that evidence.",
    "phaseChain": [
      "contract-first discriminator selected accepted backpressure",
      "model contracts passed",
      "release-gate same-mechanism-repeat blocks a plain rerun package",
      "fresh representative evidence must prove green or route the next first frontier after the rederive"
    ],
    "ownerBoundaryMap": [
      "release_gate_owner / rolling_restart_fully_green_gate owns the representative rerun gate.",
      "operation_workflow_owner / rebalancer_handoff is candidate only if fresh priority recovery evidence reappears.",
      "startup_active_gate_owner / snapshot_coverage is candidate only if fresh active-gate evidence becomes first frontier."
    ],
    "stableFacts": [
      "Scenario remains rolling-restart.",
      "The sprint success condition is representative green.",
      "Runtime files remain candidate-only."
    ],
    "changedFacts": [
      "The active artifact has been regenerated after accepted backpressure classification.",
      "Priority-recovery residual witnesses are zero.",
      "The next executable concern is active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending."
    ],
    "competingTheories": [
      "H1 the fresh rerun is representative-green.",
      "H2 priority recovery remains first frontier.",
      "H3 priority recovery drains and active-gate snapshot coverage becomes first frontier.",
      "H4 the fresh evidence is contradictory or unavailable."
    ],
    "eliminatedTheories": [
      "A plain release-gate rerun package without system-theory revision is eliminated by compositional validation.",
      "Runtime source work from the stale artifact is eliminated.",
      "Sprint closure from model evidence alone is eliminated."
    ],
    "downstreamSymptoms": [
      "active-gate convergence",
      "publication handoff",
      "readiness support evidence"
    ],
    "transitionTable": [
      {
        "inputSignal": "accepted classified backpressure after contract/model green",
        "owner": "release_gate_owner / rolling_restart_fully_green_gate",
        "missingTransition": "release-gate system-theory rederive plus fresh representative rerun",
        "expectedEvidence": "system-theory rederive output plus representative-green or one canonical route from test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
        "falsifier": "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
        "migrationTrigger": "scenario-route selected active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage"
      }
    ],
    "ownershipMigrationTriggers": [
      "Migrate only when fresh scenario-route names a different owner and boundary."
    ],
    "architectureGapTriggers": [
      "Open or activate an architecture-route successor when fresh evidence selects active-gate snapshot coverage but runtimePromotionGuard blocks unguided source promotion.",
      "Regenerate evidence if the rerun artifact is contradictory or unavailable."
    ],
    "wholeSystemInvariant": "Representative green, not model-only classification or repeated release-gate observation_gap, closes the sprint.",
    "wholeSystemInvariants": [
      {
        "invariant": "release_gate_owner / rolling_restart_fully_green_gate may request representative evidence, but repeated observation_gap cannot authorize runtime source work without a system-theory revision.",
        "coupledWith": [
          "operation_workflow_owner / rebalancer_handoff accepted backpressure must stay classified until fresh evidence names a concrete runtime successor.",
          "startup_active_gate_owner / snapshot_coverage remains candidate-only until fresh evidence makes it first frontier."
        ],
        "couplingNote": "The release gate, rebalancer_handoff, and snapshot_coverage boundaries form the coupled invariant that decides whether the sprint can close green or must redirect."
      },
      {
        "invariant": "Fresh rolling-restart representative evidence is the only artifact that may migrate the sprint from release_gate_owner / rolling_restart_fully_green_gate to a runtime owner boundary.",
        "coupledWith": [
          "release_gate_owner / rolling_restart_fully_green_gate saturation guard"
        ],
        "couplingNote": "This prevents stale route artifacts from being reinterpreted as source authorization after accepted classified backpressure."
      }
    ]
  },
  "sliceTheory": {
    "systemTheoryRef": "architecture/contracts/rolling-restart-rebalancer-handoff.md#rolling-restart-rebalancer-handoff",
    "selectedSystemTheory": "H1/H2/H3/H4 are distinguished by the release-gate rederive, fresh representative rerun, and route proof.",
    "selectedMechanism": "observation_gap with contract_gap as alternate",
    "sourceTestContract": "No runtime source files are in writeScope; the executable contract is the system-theory rederive plus representative rerun and route proof.",
    "falsifier": "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
    "representativeExpectedMovement": "system-theory revision plus representative green, owner-boundary migration, concrete reduction, same-frontier classification, or architecture-gap result.",
    "killRule": "If the fresh artifact is unchanged same-frontier/no-reduction, redirect to architecture/causal experiment or successor; never stop the sprint on classification-only evidence.",
    "theoryFitScore": {
      "evidenceFit": "high - the package directly records the required rederive and runs the representative gate required by the sprint.",
      "ownerBoundaryFit": "high - release_gate_owner owns representative green.",
      "falsifiability": "high - the distributed rerun can pass, fail, or produce a routeable artifact.",
      "representativeMovement": "high - proof combines the release-gate rederive with the representative scenario itself.",
      "downstreamRiskContainment": "high - runtime edits stay out of scope."
    },
    "wrongSliceTriggers": [
      "system-theory rederive cannot produce a release-gate revision",
      "representative rerun cannot produce an artifact",
      "scenario-route cannot select one route from the fresh artifact",
      "proof requires runtime source edits before route selection"
    ]
  },
  "observablePrediction": {
    "metric": "release-gate system-theory revision plus rolling-restart representative result and first frontier",
    "predicted": "rederive records release-gate observation_gap saturation; fresh rerun either passes green or routes to exactly one first-frontier successor.",
    "observed": "rederive recorded release-gate observation_gap saturation; fresh rerun stayed red but drained priority-recovery residual witnesses to 0 and selected active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / owner_reconcile_pending.",
    "accuracy": "partial",
    "evidence": "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose; npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain active_gate_snapshot_coverage",
    "metricDelta": 7
  },
  "closureSummary": {
    "status": "validated",
    "resultClassification": "reduced",
    "predictionAccuracy": "partial",
    "observedMovement": "Fresh representative evidence drained priority-recovery residual witnesses to zero, but remained red at active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending, selected_snapshot_source_timeout, and snapshot_repair_deferred.",
    "successorReason": "Route-card scouts disagreed on runtime versus architecture-gap, and canonical route-after-rerun reports runtimePromotionGuard.state=blocked; open the architecture-route runtime successor with a non-repeated observation-layer invariant before source promotion.",
    "nextOwnerBoundary": "startup_active_gate_owner / snapshot_coverage architecture-route successor",
    "evidenceArtifact": "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "evidence": [
      "npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write",
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain active_gate_snapshot_coverage",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
      "npm run analyze:owner-explain -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json active_gate_snapshot_coverage",
      "npm run work:agent:collect -- --package work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md"
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Core Logic Brief

- Canonical outcome: run the representative rolling-restart gate and route the
  fresh artifact before any runtime source promotion.
- Inputs/signals: predecessor contract/model proof, accepted classified
  backpressure route, fresh representative report, scenario-route, and evidence
  summary.
- State model or invariant: representative green is the only sprint terminal
  success state; classification-only evidence must redirect.
- Non-goals and forbidden interpretations: do not edit `src/`, do not close the
  sprint from model evidence alone, and do not route from stale evidence after
  the fresh rerun exists.
- Proof mapping: distributed rerun creates the artifact; scenario-route selects
  green or one first frontier; evidence-summary records compact residuals.
- Wrong-slice trigger: if runtime code is required, close or redirect to a
  successor selected by the fresh route.

## Decision Experiment Gate

- Decision question: does fresh representative evidence exit green or select one
  new owner/boundary successor?
- Architecture review: runtime promotion is blocked until the fresh route names
  a concrete owner and passes compositional gates.
- Competing hypotheses: H1 representative green; H2 priority recovery remains
  first frontier; H3 active-gate snapshot coverage becomes first frontier; H4
  evidence is unavailable or contradictory.
- Pre-edit focused probe: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose
- Success metrics: representative green, frontier migration, residual count
  reduction, or one selected fresh first frontier.
- Representative rerun: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose
- Kill rule: same-frontier/no-reduction redirects by opening an
  architecture/causal experiment or successor package instead of runtime edits.

## Parallel Diagnostics

- Mode: `read-only-scouts`
- Report directory:
  `work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate`
- Required cards: `evidence-scout`, `model-contract-scout`,
  `source-map-scout`
- Trigger: after the fresh representative rerun routes red or before opening a
  runtime successor.
- Coordinator-only writes: `work/packages/`,
  `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, and
  `work/theory-ledger.md`
- Plan command:
  `npm run work:agent:plan -- --package work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md`
- Collection command:
  `npm run work:agent:collect -- --package work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md`

## Execution Evidence

- [x] action: freshness-review; owner: Agent FreshnessReviewer (019e7d35-9d5a-7f72-a5d4-02e5f5592e64); files-changed: none; validation: npm run work:context; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md; npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md; npm run work:frontier-history -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --limit 12; decision: fresh; outcome: validated.
- [x] action: implementation; owner: Codex parent; files-changed: .kiro/steering/schemas/work-package.schema.json, package.json, scripts/list-commands.js, scripts/work-agent-cards.js, scripts/work-agent-plan.js, scripts/work-agent-validate.js, scripts/work-agent-collect.js, scripts/work-context.js, scripts/work-package-schema.js, scripts/work-tracker.js, test/scripts/work-agent-cards.test.js, test/scripts/work-llm-usability-tools.test.js, work/RULES.md, work/agent-reports/README.md, work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/evidence-scout.md, work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/model-contract-scout.md, work/agent-reports/active-20260531-rolling-restart-fresh-representative-rerun-gate/source-map-scout.md, work/templates/agent-route-card.md, work/templates/agent-verifier-card.md, work/templates/runtime-owner-package.md, work/templates/scenario-closure-package.md, work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md, work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md, work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: node --check scripts/work-agent-cards.js && node --check scripts/work-agent-plan.js && node --check scripts/work-agent-validate.js && node --check scripts/work-agent-collect.js; npm run work:system-theory:rederive -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --sprint work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md --write; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-contract-first-green-rerun.report.json --fast-local --verbose; npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain active_gate_snapshot_coverage; npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json; npm run analyze:owner-explain -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json active_gate_snapshot_coverage; npm run work:agent:collect -- --package work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: Agent Ampere (019e7d56-be2f-79f0-aad6-0eb58cb37e32); files-changed: scripts/work-agent-cards.js, test/scripts/work-agent-cards.test.js; validation: npm run work:context; npm run work:agent:plan -- --package work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md; npm run work:agent:collect -- --package work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md --allow-missing; npm run work:agent:validate -- --package work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md --allow-missing; npm run work:validate -- --entry work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md; npm run work:validate -- --pre-impl work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md; npm run work:sprint:remaining; node --check on the agent scripts; npx tap test/scripts/work-agent-cards.test.js; npx eslint scripts/work-agent-cards.js scripts/work-agent-plan.js scripts/work-agent-validate.js scripts/work-agent-collect.js test/scripts/work-agent-cards.test.js --ignore-pattern 'test/.gitkeep'; parent revalidated focused proof: yes; outcome: validated; finding: scout cards could declare write-scope metadata while still passing read-only validation; fixed by rejecting scout writeScope, commitScope, and filesChanged metadata.

## Commit And Push Ledger

1. Focused package commit: bccd1261e4c531e92921fd31fe7c3e08e2454c6a
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T10:17:43.118Z