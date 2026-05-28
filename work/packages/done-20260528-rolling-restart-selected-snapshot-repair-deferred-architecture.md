# Rolling Restart Selected Snapshot Repair Deferred Architecture

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "Fresh queryability-gate representative rerun failed on active_gate_snapshot_coverage with selected snapshot source timeout, repair_deferred observation, bounded owner handoff writes, and unavailable snapshot coverage.",
    "nextAction": "Discriminate selected-snapshot repair-deferred timeout versus partial-coverage promotion gating, then select one focused runtime successor before another snapshot coverage patch.",
    "closed": "2026-05-28",
    "successor": "work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md",
      "work/packages/done-20260528-rolling-restart-load-readiness-queryable-admin-gate-runtime.md",
      "work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js"
    ],
    "commitScope": [
      "work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md",
      "work/packages/done-20260528-rolling-restart-load-readiness-queryable-admin-gate-runtime.md",
      "work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This architecture package prevents another same-frontier snapshot coverage runtime patch until fresh selected-source timeout evidence chooses one owner contract.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-owner-discriminator/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260522-snapshot-watch-handoff-contract",
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage",
        "regression: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --handoff-probe",
        "supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md",
        "work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md",
        "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    },
    "theoryLedger": "no-ledger-update"
  },
  "boundedExperiment": {
    "hypothesis": "Fresh rolling-restart evidence is no longer a load-queryability admission gap; it is a selected snapshot source repair-deferred timeout where owner handoff writes remain bounded but snapshot coverage is unavailable, so another runtime patch needs an architecture-selected contract.",
    "hypothesisDiscriminator": "H1 selected if topology handoff evidence shows selected_timeout plus repair_deferred with bounded owner queue writes and no runtime promotion; H2 selected if partial coverage or promotion admits load readiness without a selected publication witness; H3 selected if the route lacks enough handoff evidence and must stop as evidence-incomplete.",
    "expectedMetric": "One selected successor: selected-source retry or repair contract, partial-coverage promotion gate contract, or evidence-incomplete architecture stop; no runtime edits in this package.",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-load-readiness-queryable-admin-gate-architecture.md",
    "timebox": "24h",
    "mergeRequirement": "scenario-route, topology-convergence handoff probe, causal-model, and one selected runtime successor or architecture stop",
    "killRule": "If the fresh artifact cannot select a single snapshot-coverage contract, close as architecture-gap before any runtime edits."
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "selected snapshot source timeout, repair_deferred observation, owner handoff write state, runtime promotion state, and snapshot coverage availability",
    "predicted": "The fresh artifact selects a single bounded successor contract before runtime edits: selected-source retry/repair, partial-coverage promotion gate, or evidence-incomplete stop.",
    "observed": "Scenario route and causal model preserve startup_active_gate_owner / snapshot_coverage; handoff evidence shows selected snapshot timeout with repair_deferred, runtimePromotionAllowed=false, snapshot coverage unavailable, and downstream benchmark work admitted. The selected successor is load partial-coverage promotion gating.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json",
    "metricDelta": 1
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "one architecture discriminator that selects a concrete runtime successor; success is information, not runtime metric movement",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not edit runtime files inside this architecture package",
      "canonical route, handoff probe, and causal model agree on one next contract"
    ],
    "splitTriggers": [
      "write scope expands beyond package, sprint, and current-blocker files",
      "proof requires runtime edits before successor selection",
      "the implementation needs to decide unrelated active-gate or table-bootstrap behavior"
    ],
    "childPackageCandidates": [
      "Promote selected-source retry/repair into a runtime-owner-boundary successor if the handoff probe selects H1.",
      "Promote partial-coverage promotion gating into a runtime-owner-boundary successor if projection evidence selects H2.",
      "Close as architecture-gap if canonical proof cannot select one contract."
    ]
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Open the load partial-coverage promotion gate runtime successor."
  },
  "causalGovernance": {
    "hypothesis": "The queryability runtime proof removed the SQL-unavailable admission path locally, but representative evidence now exposes selected snapshot source repair_deferred timeout with bounded owner handoff writes and no runtime promotion, so the next snapshot coverage runtime patch must be selected by architecture evidence.",
    "stopConditionCheck": "Run scenario-route, topology-convergence --handoff-probe, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json` before any runtime edits.",
    "expectedCausalModelChange": "The architecture package selects the load partial-coverage promotion gate runtime successor; runtime files remain frozen in this package.",
    "representativeOutcome": "classification-only",
    "causalDebt": "The representative reached setup.cluster.active and scenario.load-readiness.stable, then benchmark_events visibility failed while active-gate snapshot coverage reported selected_timeout, repair_deferred observation, bestCoverageNodeCount=1/5, runtimePromotionAllowed=false, snapshot coverage unavailable, and bounded owner handoff write_deferred evidence.",
    "crossBoundaryReview": "Do not edit table bootstrap, admin API, transport, generic timeout budgets, or runtime files in this package; only classify the selected snapshot repair-deferred contract gap."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected snapshot repair-deferred architecture discriminator",
    "phaseChain": [
      "queryability runtime focused and regression proofs passed",
      "representative rolling-restart rerun reached setup.cluster.active",
      "representative rolling-restart rerun reached scenario.load-readiness.stable",
      "benchmark_events bootstrap failed while active-gate snapshot coverage reported selected snapshot timeout and repair_deferred observation"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "benchmark table bootstrap cannot observe partition visibility until active-gate snapshot coverage is complete enough to expose a queryable control surface",
      "same-frontier runtime patches are blocked until one selected snapshot coverage contract is named"
    ],
    "missingCausalEdge": "Selected snapshot repair-deferred evidence does not yet decide whether the owner must retry or repair the selected source, or whether partial-coverage promotion is admitting progress without a selected publication witness.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Architecture proof must select one concrete owner contract from route, handoff, and causal evidence before runtime edits: bounded retry/repair, reconcile, or promotion-gate advance.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json",
    "expectedObservableTransition": "Selected runtime successor records partial-coverage promotion gating.",
    "maxProgressBound": "one architecture classification package only; no runtime edits",
    "sameFrontierFallback": "If the runtime successor later repeats the same snapshot coverage frontier with no selected metric movement, stop for causal escalation instead of another local runtime patch.",
    "expectedNextFrontier": "load partial-coverage promotion gate runtime successor",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md / startup_active_gate_owner / selected_source_owner_recovery_reconcile / migrated",
      "done-20260528-rolling-restart-load-readiness-queryable-admin-gate-architecture.md / startup_active_gate_owner / snapshot_coverage / classification-only",
      "load-readiness-queryable-admin-gate-runtime / startup_active_gate_owner / snapshot_coverage_load_queryability / migrated"
    ],
    "oscillationCheck": "Required because fresh representative evidence returned to startup_active_gate_owner / snapshot_coverage after a locally green queryability runtime proof.",
    "handoffInvariant": "The architecture package may only select a successor; it must not promote runtime coverage while snapshot coverage is incomplete."
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "architecture-or-human-stop",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --handoff-probe",
      "npm run analyze:causal-model -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json"
    ],
    "decisionRecord": "Record the selected load partial-coverage promotion gate successor in this package, then migrate to that runtime package.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Promote the selected load partial-coverage promotion gate as a runtime-owner-boundary successor."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H2",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage_load_partial_promotion_gate",
    "evidence": "test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json"
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "queryability runtime focused proof passed but representative rerun still selects active_gate_snapshot_coverage",
      "fresh handoff evidence reports selected_timeout with repair_deferred observation",
      "runtimePromotionAllowed remains false while snapshot coverage is unavailable"
    ],
    "selectedChoice": "partial-coverage-promotion-gate",
    "nextAction": "Open the runtime successor that blocks load-mode selected-timeout owner-recovery promotion while runtimePromotionAllowed=false and snapshot coverage is unavailable.",
    "choices": [
      {
        "id": "selected-source-retry-repair-contract",
        "summary": "Selected source remains admin reachable but snapshot observation times out with repair_deferred evidence; runtime successor owns bounded retry, repair, or source rotation.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "partial-coverage-promotion-gate",
        "summary": "Partial coverage/promotion evidence admits progress without a selected publication witness; runtime successor gates convergence on selected snapshot coverage or selected publication visibility.",
        "route": "continue-local-proof",
        "proof": [
          "node --test test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop if canonical proof cannot select one contract from the fresh artifact.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json"
        ]
      }
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "snapshot_coverage_incomplete",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Load selected-timeout owner-recovery no longer admits load readiness while runtime promotion is denied and snapshot coverage is unavailable.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --package work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md",
      "npm run work:package:migrate -- --write --transaction work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md",
      "work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

Fresh representative evidence no longer selects the load-queryability slice. It selects active-gate snapshot coverage with a selected snapshot timeout, repair-deferred observation, and bounded owner handoff state, so the next runtime patch needs one architecture-selected contract.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json`.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: this package changes package and sprint truth only; runtime files remain candidate-only until one contract is selected.
- Escalation trigger to a heavier lane: canonical extractors disagree, evidence cannot select one successor, or runtime files become necessary before classification closes.

## Classification Decision Brief

- Canonical outcome: selected-snapshot repair-deferred architecture discriminator for `startup_active_gate_owner / snapshot_coverage`.
- Inputs/signals: scenario route, topology handoff probe, causal model, selected snapshot timeout and repair state.
- State model or invariant: classification may select a successor, but it must not promote runtime snapshot coverage or load readiness.
- Non-goals and forbidden interpretations: no table-bootstrap, admin API, transport, generic timeout, or runtime edits in this package.
- Proof mapping: route fixes the owner boundary; handoff probe distinguishes selected-source retry/repair from partial-promotion gating; causal model validates stop mode.
- Wrong-slice trigger: if extractors cannot select one contract, close as architecture-gap instead of patching an adjacent symptom.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md, work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage and parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/active-20260528-rolling-restart-selected-snapshot-repair-deferred-architecture.md, work/packages/done-20260528-rolling-restart-load-partial-coverage-promotion-gate-runtime.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --handoff-probe; npm run analyze:causal-model -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json; parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: 4668b9101e8a60884f1364ecb50a78c19919bcdf
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason snapshot_coverage_incomplete --explain active_gate_snapshot_coverage
2. regression: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json --handoff-probe
3. supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-load-readiness-queryable-admin-gate-20260528T010230Z.report.json
