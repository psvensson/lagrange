# Rolling Restart Active Gate Snapshot Coverage Owner Reconcile Architecture

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Retry cadence moved activeGate attempts from 1/8 to 2/8 and reduced elapsedMs to 31001, but the representative still fails active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5, selectedSnapshotTimeoutMs=100, owner_reconcile_pending, write_deferred, and enqueued=false.",
    "nextAction": "Open a runtime successor for the selected owner-reconcile retry contract: make write-deferred owner recovery produce bounded observable reconcile progress before active-gate snapshot coverage times out.",
    "predecessor": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
    "closed": "2026-05-28",
    "successor": "work/packages/active-20260528-rolling-restart-active-gate-owner-reconcile-retry-runtime.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md",
      "work/packages/active-20260528-rolling-restart-active-gate-owner-reconcile-retry-runtime.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js"
    ],
    "commitScope": [
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md",
      "work/packages/active-20260528-rolling-restart-active-gate-owner-reconcile-retry-runtime.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "representative-reduced",
    "whyHighestLeverageNow": "This architecture package is required by the frontier oscillation guard before a third active-gate snapshot coverage runtime patch can be opened.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "bounded-experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "architecture-experiment/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "proof selects owner-boundary migration",
      "proof cannot distinguish owner-reconcile retry from selected-source selection",
      "runtime files must be edited before this architecture decision is closed"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap"
    ],
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "regression: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe",
        "supporting: npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    },
    "theoryLedger": "No ledger update: this architecture package selects the owner-reconcile retry contract from existing representative evidence and does not add a durable new theory."
  },
  "boundedExperiment": {
    "hypothesis": "Retry cadence is no longer the primary gap; the next architecture decision is whether owner_reconcile_pending write-deferred recovery, selected snapshot source selection, or a different owner boundary owns the next runtime move.",
    "hypothesisDiscriminator": "H1 owner-reconcile selected if topology evidence shows write_deferred enqueued=false and pending recovery is the blocking mechanism; H2 selected-source selected if source timeout dominates independently of owner recovery; H3 migration selected if a non-active-gate owner becomes first frontier.",
    "expectedMetric": "selected architecture route with explicit successor proof",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
    "timebox": "24h",
    "mergeRequirement": "canonical scenario-route, topology handoff probe, and causal-model proof select a concrete runtime successor or owner-boundary migration",
    "killRule": "Do not edit runtime in this architecture package; if proof cannot select a runtime contract or owner migration, stop as architecture-gap."
  },
  "validationTier": "release-gate",
  "representativeResidual": {
    "status": "migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open the owner-reconcile retry runtime successor."
  },
  "causalGovernance": {
    "hypothesis": "The retry-cadence patch reduced the timeout shape but left active-gate snapshot coverage blocked by owner recovery or selected-source selection; the architecture proof must choose that contract before runtime resumes.",
    "stopConditionCheck": "`npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json` still selects active_gate_snapshot_coverage after retry cadence moved attempts to 2/8.",
    "expectedCausalModelChange": "The architecture experiment selected owner-reconcile retry because topology evidence reports write_deferred enqueued=false, pendingRecoveryCount=1, nextAction=wait_owner_recovery, and requiredProgressMechanism=reconcile.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh evidence reports activeGate elapsedMs=31001, attempts=2/8, snapshotCoverageNodeCount=1/5, selectedSnapshotObservationRetryAfterMs=100, selectedSnapshotTimeoutMs=100, owner_reconcile_pending, write_deferred, enqueued=false, pendingRecoveryCount=1, and alternativeSnapshotWitnessAvailable=false.",
    "crossBoundaryReview": "Do not edit runtime files, table bootstrap, admin API, transport, generic timeout budgets, promotion gates, or readiness ownership in this architecture package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart owner-reconcile architecture selector",
    "phaseChain": [
      "bounded remaining-witness concurrency focused proof passed locally",
      "retry-cadence runtime proof moved activeGate attempts from 1/8 to 2/8",
      "fresh representative rerun still failed active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5 and owner_reconcile_pending",
      "frontier oscillation guard requires architecture selection before another runtime edit"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness inherits active-gate snapshot coverage failure",
      "benchmark table bootstrap remains downstream while active-gate snapshot coverage is incomplete",
      "owner recovery remains pending with write_deferred and enqueued=false"
    ],
    "missingCausalEdge": "Active-gate snapshot coverage needs a selected owner contract for pending owner recovery after retry cadence rearmed: either owner-reconcile retry, selected snapshot source selection, or owner-boundary migration.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Canonical route, topology handoff, and causal-model proof must select owner-reconcile retry, selected-source selection, owner migration, or architecture-gap stop.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
    "expectedObservableTransition": "Selected architecture route points to owner-reconcile retry if write_deferred enqueued=false is the active-gate blocking mechanism after retry cadence movement.",
    "maxProgressBound": "one architecture selector package before runtime resumes",
    "sameFrontierFallback": "If proof cannot select a concrete runtime contract or owner migration, stop as architecture-gap.",
    "expectedNextFrontier": "selected runtime-owner-boundary successor for snapshot_coverage_owner_reconcile_retry_contract",
    "resultClassification": "migrated",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-load-snapshot-reachability-prefilter-runtime.md / startup_active_gate_owner / snapshot_coverage_probe_reachability_prefilter / same-frontier",
      "done-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md / startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency / same-frontier",
      "done-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md / startup_active_gate_owner / snapshot_coverage_retry_cadence_contract / reduced"
    ],
    "oscillationCheck": "This package is the autonomous architecture experiment required after repeated active-gate snapshot coverage runtime packages.",
    "handoffInvariant": "Runtime promotion remains blocked while snapshot coverage is incomplete; this package only selects the next owner contract."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative evidence remains active_gate_snapshot_coverage after multiple same-owner runtime packages",
      "retry cadence moved activeGate attempts from 1/8 to 2/8 but snapshotCoverageNodeCount stayed 1/5",
      "topology handoff evidence reports owner_reconcile_pending with write_deferred, enqueued=false, pendingRecoveryCount=1, selectedSnapshotTimeoutMs=100, and alternativeSnapshotWitnessAvailable=false"
    ],
    "selectedChoice": "owner-reconcile-retry-contract",
    "choices": [
      {
        "id": "owner-reconcile-retry-contract",
        "summary": "Open a runtime successor that makes write-deferred owner recovery produce bounded observable reconcile progress before active-gate snapshot coverage times out.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "selected-source-contract",
        "summary": "Open a runtime successor for selected snapshot source selection only if owner recovery is already progressing and source timeout dominates independently.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "migrate-owner-boundary",
        "summary": "Migrate owner boundary only if canonical route evidence names a non-active-gate first frontier.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use this package as the autonomous architecture experiment before choosing the next runtime successor.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe",
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Escalate only if evidence is contradictory, blocked, or unavailable.",
        "route": "human-escalation",
        "proof": [
          "npm run work:advance -- --check"
        ]
      }
    ],
    "nextAction": "Open the owner-reconcile retry runtime successor."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage_owner_reconcile_retry_contract",
    "evidence": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe reported owner_reconcile_pending, write_deferred, enqueued=false, pendingRecoveryCount=1, requiredProgressMechanism=reconcile, selectedSnapshotTimeoutMs=100, and alternativeSnapshotWitnessAvailable=false."
  },
  "observablePrediction": {
    "metric": "selected architecture route after retry-cadence reduction",
    "predicted": "Canonical proof selects owner-reconcile retry if write_deferred enqueued=false is the blocking mechanism after retry cadence movement.",
    "observed": "Canonical proof selected owner-reconcile retry: route stayed active_gate_snapshot_coverage, topology handoff reported write_deferred enqueued=false with requiredProgressMechanism=reconcile, and causal model kept the first critical path at topology:active_gate_snapshot_coverage.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
    "metricDelta": 0
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Open the owner-reconcile retry runtime successor; representative rerun should clear owner_reconcile_pending, move snapshotCoverageNodeCount beyond 1/5, migrate owner boundary, or pass.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "update Sprint Strategy Brief and Current Edge Card from the selected architecture route",
      "refresh generated current-blocker handoff via npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md"
    ]
  },
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "theoryLedger": "No ledger update: this architecture package selects the owner-reconcile retry contract from existing representative evidence and does not add a durable new theory.",
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package records the autonomous architecture decision forced by the frontier oscillation guard. Runtime files remain candidates only until this package selects the next owner contract.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the package selects the next active-gate owner contract from canonical evidence without editing runtime files.
- Escalation trigger to a heavier lane: canonical proof cannot distinguish owner-reconcile retry, selected-source selection, owner migration, or architecture-gap stop.

## Core Logic Brief

- Canonical outcome: select the next active-gate snapshot coverage contract before another runtime patch.
- Inputs/signals: `attempts=2/8`, `elapsedMs=31001`, `snapshotCoverageNodeCount=1/5`, `selectedSnapshotTimeoutMs=100`, `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, and `alternativeSnapshotWitnessAvailable=false`.
- State model or invariant: retry cadence now rearms, so the next decision must distinguish owner recovery progress from selected-source timeout and owner-boundary migration.
- Non-goals and forbidden interpretations: do not edit runtime, raise timeout budgets, change table bootstrap, change transport/admin API, or bypass promotion ownership in this package.
- Proof mapping: scenario route confirms first frontier, topology handoff distinguishes owner-reconcile signals, and causal model confirms budget ownership.
- Wrong-slice trigger: if proof requires code changes, close this package with a selected runtime successor first.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| owner recovery handoff | `write_deferred`, `enqueued=false`, `pendingRecoveryCount=1` | owner-reconcile retry may be the next runtime contract | select owner-reconcile retry successor | focused successor proof observes enqueue or bounded recovery progress | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe` |
| selected snapshot source | `selectedSnapshotTimeoutMs=100`, `alternativeSnapshotWitnessAvailable=false` | selected-source contract may still dominate if owner recovery is already progressing | select selected-source successor | selected source changes or coverage moves | `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage` |

- Anti-symptom rationale: this package chooses the next owner contract instead of patching downstream readiness or benchmark table bootstrap symptoms.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Competing explanations: owner-reconcile retry, selected-source selection, owner-boundary migration, and architecture-gap stop are compared from the same artifact.
- Systemic interaction scan: publication and priority-recovery producers are satisfied; active-gate snapshot coverage remains the consumer frontier.
- Ping-pong stop rule: this package must close with a selected successor or architecture-gap stop; it cannot edit runtime directly.
- Oscillation guard: this is not another same-frontier symptom patch because it edits no runtime files and must select a concrete owner contract or architecture-gap stop before any local runtime patch resumes.

## Decision Experiment Gate

- Decision question: Which active-gate snapshot coverage contract owns the next runtime move after retry cadence moved attempts to `2/8`?
- Architecture review: prior runtime work reduced the retry-cadence metric but did not improve snapshot coverage, so a route decision is required before another runtime edit.
- Competing hypotheses: owner-reconcile retry is blocked by write-deferred recovery; selected-source selection is the primary blocker; another owner boundary owns the next frontier; evidence is insufficient and must stop as architecture-gap.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe`
- Success metrics: selected architecture route names owner-reconcile retry, selected-source selection, owner-boundary migration, or architecture-gap stop.
- Representative rerun: `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage`
- Kill rule: if architecture proof cannot select a concrete runtime contract or owner migration, stop as architecture-gap instead of opening another active-gate runtime patch.

## Execution Evidence

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: `work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md`; validation: architecture proof commands selected owner-reconcile retry; outcome: selected `snapshot_coverage_owner_reconcile_retry_contract`.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: package evidence only; validation: verifier reran scenario-route, topology handoff, and causal-model proof; parent revalidated focused proof: yes; outcome: selected runtime successor.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: pending successor handoff refresh during migration.

## Commit And Push Ledger

1. Focused package commit: 4668b9101e8a60884f1364ecb50a78c19919bcdf
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --handoff-probe
3. npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json
