# Rolling Restart Active Gate Snapshot Watch Handoff Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh rolling-restart representative evidence moved past owner_recovery_completion and now returns active_gate_snapshot_coverage with snapshotCoverage=0/5, selected snapshot query connection closed before response, forced repair snapshot connection closed, selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, handoffContract absent, publication convergence ready, priority recovery residuals absent, and runtimePromotionAllowed=false.",
  "nextAction": "Implement the snapshot/watch owner handoff contract for connection-closed selected snapshot source evidence with admin_health reachability and an alternative witness before runtime promotion.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The owner-recovery completion edge is locally proven and no longer appears in the fresh representative artifact; canonical route, replay fixture, and the active theory now select the startup active-gate snapshot/watch handoff contract as the next bounded path before another representative rerun.",
  "proof": [
    "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js # focused contract fixture and affected consumer proof",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --replay-fixture",
    "npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/scripts/analyze-topology-convergence.test.js",
    "npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown"
  ],
  "writeScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "scripts/analyze-topology-convergence.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "scripts/analyze-topology-convergence.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "scripts/analyze-topology-convergence.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "work/packages/done-20260522-rolling-restart-active-gate-snapshot-watch-handoff-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "Connection-closed selected snapshot source evidence with admin_health reachability and an alternative witness remains blocked because startup_active_gate_owner / snapshot_coverage does not emit a typed snapshot/watch owner handoff contract before active-gate runtime promotion.",
    "hypothesisDiscriminator": "If this is selected-source retry debt, focused proof changes selectedSnapshotReachableBy or snapshot coverage without a contract; if this is owner handoff debt, focused proof changes selectedSnapshotObservation or publicationActiveGateHandoff while keeping runtimePromotionAllowed=false until safe.",
    "expectedMetric": "selectedSnapshotObservation state, publicationActiveGateHandoff state, handoffContract detection, runtimePromotionAllowed, snapshotCoverageNodeCount, and rolling-restart route.",
    "inheritsFrom": "work/packages/done-20260522-rolling-restart-active-gate-snapshot-architecture-analysis.md",
    "timebox": "24h",
    "mergeRequirement": "focused owner contract fixture, affected admin/harness consumers, handoff probe, replay fixture, static guardrails, verifier-fixer, and fresh rolling-restart representative route.",
    "killRule": "If focused proof cannot emit a typed handoff contract without weakening active-gate admission, widening timeouts, or adding another caller-local retry path, stop and reopen architecture instead of patching symptoms."
  },
  "validationTier": "cross-owner",
  "representativeResidual": {
    "status": "moved-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Implement typed snapshot/watch owner handoff contract emission for connection-closed selected snapshot source evidence before runtime promotion."
  },
  "causalGovernance": {
    "hypothesis": "The selected snapshot source is admin-health reachable and an alternative witness exists, but connection-closed snapshot reads leave selectedSnapshotObservation and publicationActiveGateHandoff absent, so active-gate snapshot coverage has no typed owner contract to wait on or replay.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json, the focused owner contract and affected consumer proof, topology handoff probe, topology replay fixture, static guardrails, verifier-fixer, and a fresh rolling-restart representative rerun; runtimePromotionAllowed must remain false while snapshot coverage is incomplete.",
    "expectedCausalModelChange": "Focused proof should move selectedSnapshotObservation or publicationActiveGateHandoff from unknown/absent to a typed owner outcome for connection-closed selected-source evidence without weakening promotion gates.",
    "representativeOutcome": "reduced",
    "causalDebt": "The fresh representative at test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json still has snapshotCoverage=0/5 and active_gate_timed_out, but selectedSnapshotObservation is typed as repair_deferred/deferred_refresh/deferred/deferred/retry, publicationActiveGateHandoff is detected as wait_owner_recovery with pendingRecoveryCount=1, runtimePromotionAllowed=false, and no priority recovery residuals.",
    "crossBoundaryReview": "Keep publication convergence, priority recovery, startup readiness, admission, harness timeout policy, and active-gate promotion gates frozen; this package may update the startup active-gate owner contract and its direct admin/harness consumers only."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage connection-closed selected snapshot source",
    "phaseChain": [
      "publication convergence is ready",
      "priority recovery residuals are absent",
      "selected snapshot source is admin_health reachable",
      "selected snapshot query and forced repair snapshot both close before response",
      "alternative snapshot witness is available",
      "handoff contract is absent and runtimePromotionAllowed=false",
      "snapshotCoverage remains 0/5"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshotCoverage=0/5"
    ],
    "missingCausalEdge": "Emit a typed selectedSnapshotObservation or publicationActiveGateHandoff contract for connection-closed selected-source evidence with admin_health reachability and an alternative witness.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --handoff-probe",
    "falsifyingProbe": "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
    "boundedProgressProof": "Focused owner proof must emit one typed retry or wait owner contract outcome that changes selectedSnapshotObservation state, publicationActiveGateHandoff state, handoffContract detection, or runtimePromotionAllowed reasoning without admitting runtime promotion.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
    "expectedObservableTransition": "selectedSnapshotObservation or publicationActiveGateHandoff changes from absent/unknown to a typed owner outcome for connection-closed selected-source evidence, or rolling-restart passes or migrates.",
    "maxProgressBound": "one causal-escalation owner-contract package before another architecture stop",
    "sameFrontierFallback": "If fresh representative evidence returns the same active_gate_snapshot_coverage frontier with no contract, coverage, or route movement, open/select an autonomous architecture experiment instead of another adjacent local patch.",
    "expectedNextFrontier": "typed handoff contract detected, representative reduction, owner-boundary migration, green rolling-restart, or architecture-gap stop",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "owner_recovery_completion package locally proved wait_owner_recovery handoff wake and moved the fresh representative away from owner recovery queue evidence",
      "rolling-restart active-gate snapshot architecture analysis selected pending-recovery projection before this newer artifact removed that edge",
      "node-failure snapshot/watch architecture package selected typed owner handoff contract emission for admin-reachable selected-source failure with an alternative witness"
    ],
    "oscillationCheck": "frontier returned to startup_active_gate_owner / snapshot_coverage after owner-recovery completion moved; causal-escalation lane keeps the next patch constrained to the selected owner-contract route.",
    "handoffInvariant": "Runtime promotion remains blocked until a canonical snapshot/watch handoff owner contract is emitted and proven for degraded selected-source evidence."
  },
  "observablePrediction": {
    "metric": "selectedSnapshotObservation state, publicationActiveGateHandoff state, handoffContract detection, runtimePromotionAllowed, snapshotCoverageNodeCount, and rolling-restart route.",
    "predicted": "Focused proof will move selectedSnapshotObservation or publicationActiveGateHandoff from unknown/absent to a typed owner outcome for connection-closed selected-source evidence while runtimePromotionAllowed remains false until safe.",
    "observed": "Fresh rolling-restart remained red, but selectedSnapshotObservation moved from absent/unknown to repair_deferred/deferred_refresh/deferred/deferred/retry and publicationActiveGateHandoff moved to detected wait_owner_recovery with pendingRecoveryCount=1 while runtimePromotionAllowed remained false.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --handoff-probe; npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "continue-local-proof",
    "triggerEvidence": [
      "fresh representative route is active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage",
      "owner-recovery completion is locally proven and absent from the fresh handoff probe",
      "handoff probe reports handoffContract absent while replay fixture reports selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, and alternativeSnapshotWitnessAvailable=true"
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement typed snapshot/watch owner handoff contract emission under startup_active_gate_owner / snapshot_coverage before runtime promotion.",
        "route": "continue-local-proof",
        "proof": [
          "focused owner contract fixture and affected consumer proof",
          "handoff probe and replay fixture"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Use only if the focused owner-contract route cannot emit a typed contract without widening timeouts, weakening admission, or changing ownership.",
        "route": "architecture-package",
        "proof": [
          "canonical route or focused contradiction"
        ]
      }
    ],
    "nextAction": "Continue with typed snapshot/watch owner handoff contract emission before runtime edits outside this boundary."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --handoff-probe",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --replay-fixture"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Handoff probe detects a typed selectedSnapshotObservation or publicationActiveGateHandoff contract for connection-closed selected source evidence while runtimePromotionAllowed remains false until safe, or rolling-restart passes or migrates.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260522-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json; npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --handoff-probe; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --replay-fixture; npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/scripts/analyze-topology-convergence.test.js; npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the snapshot/watch owner handoff contract for connection-closed selected snapshot source evidence with admin_health reachability and an alternative witness before runtime promotion. | Handoff probe detects a typed selectedSnapshotObservation or publicationActiveGateHandoff contract for connection-closed selected source evidence while runtimePromotionAllowed remains false until safe, or rolling-restart passes or migrates. | npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js`
- Success metrics: Handoff probe detects a typed selectedSnapshotObservation or publicationActiveGateHandoff contract for connection-closed selected source evidence while runtimePromotionAllowed remains false until safe, or rolling-restart passes or migrates.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`
- Expected delta: Handoff probe detects a typed selectedSnapshotObservation or publicationActiveGateHandoff contract for connection-closed selected source evidence while runtimePromotionAllowed remains false until safe, or rolling-restart passes or migrates.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/control-plane/publication-active-gate-handoff-contract.js
2. src/admin/admin-control-snapshot-class-part-1.js
3. src/admin/admin-control-snapshot-class-part-2.js
4. test/control-plane/publication-active-gate-handoff-contract.test.js
5. test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js
6. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
7. test/scripts/analyze-topology-convergence.test.js
8. scripts/analyze-topology-convergence.js
9. src/diagnostics/topology-convergence-graph.js
10. test/distributed/harness/cluster-segment-7-class-5.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-active-gate-handoff-contract.js`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-2.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/scripts/analyze-topology-convergence.test.js`, `scripts/analyze-topology-convergence.js`, `src/diagnostics/topology-convergence-graph.js`, `test/distributed/harness/cluster-segment-7-class-5.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --replay-fixture`, `npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/scripts/analyze-topology-convergence.test.js`, `npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Commit And Push Ledger

1. Focused package commit: 899123964649ae70d8b85498157a00068c574f8b
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: added selected-source Admin API connection-closed retry classification, selected_transport_closed topology cause extraction, selected snapshot observation handoff-probe fallback, and focused regressions; `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js` passed 175/175; topology handoff probe and replay fixture passed and classify the historical artifact as selected_transport_closed; static guardrails passed with 0 new literal violations, 0 new decision-boundary violations with 1 inherited baseline, and 0 runtime grammar violations; parent revalidated focused proof: yes; next: fresh rolling-restart representative rerun.
- [x] verification-fix: status: validated; evidence: verifier-fixer 019e51f8-0cf1-7d72-b608-fb8908a36604 reviewed diffs, reran package doctor/pre-impl validation, focused proof 175/175, handoff probe, replay fixture, evidence summary, scenario triage, priority residuals, and static guardrails; changed files: none; parent revalidated focused proof: yes; next: fresh rolling-restart representative rerun.
- [x] representative-rerun: status: validated; evidence: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-watch-handoff-contract-20260522T233750Z.report.json --fast-local --verbose` failed 0/1, but moved the frontier shape to typed `selectedSnapshotObservation=repair_deferred/deferred_refresh/deferred/deferred/retry`, `selectedSnapshotObservationReasonCodes=selected_timeout`, detected handoff contract `wait_owner_recovery`, pendingRecoveryCount=1, runtimePromotionAllowed=false; next: migrate to successor package for the remaining startup_active_gate_owner / snapshot_coverage blocker.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/scripts/analyze-topology-convergence.test.js
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --replay-fixture
4. npm run audit:guideline:literals -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js ./test/control-plane/publication-active-gate-handoff-contract.test.js ./test/admin/admin-control-snapshot-repair-handoff-outcome-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/scripts/analyze-topology-convergence.test.js
5. npm run audit:guideline:decision-boundaries -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js
6. npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-2.js scripts/analyze-topology-convergence.js src/diagnostics/topology-convergence-graph.js test/distributed/harness/cluster-segment-7-class-5.js
7. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json
8. npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown
9. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-owner-recovery-completion-20260522T230812Z.report.json --markdown
