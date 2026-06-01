# Rolling Restart Active Gate Snapshot Coverage Retry Cadence Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_retry_cadence_contract",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Architecture proof selected retry-cadence runtime work because activeGate elapsedMs exhausted the active-gate timeout at 72494ms while attempts stayed 1/8 and snapshot coverage stayed 1/5.",
    "nextAction": "Bound load-mode active-gate snapshot coverage work per attempt so retry cadence can rearm before the active-gate timeout is exhausted, then rerun rolling-restart.",
    "predecessor": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-post-concurrency-architecture.md",
    "closed": "2026-05-28",
    "successor": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md"
  },
  "scope": {
    "writeScope": [
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-post-concurrency-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js"
    ],
    "commitScope": [
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-post-concurrency-architecture.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This runtime package advances the active sprint representative gate by addressing the selected active-gate retry-cadence frontier.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "write scope expands beyond active-gate retry cadence",
      "proof selects a different owner boundary",
      "representative rerun stays same-frontier with no attempt-count movement"
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
        "falsifier: focused contract fixture proves load-mode snapshot coverage receives a bounded per-attempt active-gate deadline and selected-timeout owner recovery remains blocking: npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
        "regression: affected consumer proof selected-source timeout repair and alternative-witness selection remain intact: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
        "representative: timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T000000Z.report.json --fast-local --verbose"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "test/distributed/harness/cluster-segment-7-class-4.js",
        "test/distributed/harness/cluster-segment-7-class-5.js",
        "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
        "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
        "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md",
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
    "theoryLedger": "No ledger update: this package executed the architecture-selected retry-cadence discriminator and reduced the metric from attempts=1/8 to attempts=2/8 without changing the underlying selected snapshot source theory."
  },
  "boundedExperiment": {
    "hypothesis": "Load-mode active-gate snapshot coverage currently uses the overall active-gate deadline for one snapshot coverage pass, so selected-source timeout and bounded witness probing can consume the whole active-gate window before retry cadence rearms.",
    "hypothesisDiscriminator": "H1 selected if focused proof shows _probeClusterActiveState gives load-mode snapshot coverage a bounded per-attempt deadline and _waitForAllActive can run another attempt; H2 selected if retry cadence still cannot move attempts or representative coverage.",
    "expectedMetric": "activeGate attempts move beyond 1/8 or snapshotCoverageNodeCount moves beyond 1/5 on representative rerun",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-post-concurrency-architecture.md",
    "timebox": "24h",
    "mergeRequirement": "focused retry-cadence proof, selected-source snapshot regression, runtime grammar guardrail, and representative rolling-restart rerun",
    "killRule": "If fresh representative evidence stays at activeGate attempts=1/8 and snapshotCoverageNodeCount=1/5, stop for a new architecture/owner-boundary decision instead of another local runtime patch."
  },
  "validationTier": "release-gate",
  "representativeResidual": {
    "status": "runtime-reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue local active-gate owner recovery work because retry cadence rearmed but owner_reconcile_pending still blocks snapshot coverage."
  },
  "causalGovernance": {
    "hypothesis": "The active gate should not let one load-mode snapshot coverage pass consume the full active-gate timeout; a bounded per-attempt deadline should let retry cadence rearm and expose progress or a later owner boundary.",
    "stopConditionCheck": "`npm run analyze:causal-model -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json` selected activeGate elapsedMs=72494 with attempts=1/8 as the architecture discriminator.",
    "expectedCausalModelChange": "Representative rerun should show activeGate attempts greater than 1/8, snapshotCoverageNodeCount greater than 1/5, owner-boundary migration, or representative green.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh representative evidence reports activeGate elapsedMs=31001, attempts=2/8, snapshotCoverageNodeCount=1/5, selectedSnapshotObservationRetryAfterMs=100, owner_reconcile_pending, selectedSnapshotTimeoutMs=100, and alternativeSnapshotWitnessAvailable=false.",
    "crossBoundaryReview": "Do not edit table bootstrap, admin API, transport, generic timeout budgets, promotion gates, or readiness ownership in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage retry-cadence runtime proof",
    "phaseChain": [
      "bounded remaining-witness concurrency focused proof passed locally",
      "fresh representative rerun stayed on active_gate_snapshot_coverage with snapshotCoverageNodeCount=1/5, elapsedMs=72494, and attempts=1/8",
      "architecture experiment selected active-gate snapshot coverage retry-cadence runtime work"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage_retry_cadence_contract / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness inherits active-gate no-progress",
      "benchmark table bootstrap remains downstream while active-gate snapshot coverage is incomplete",
      "active-gate retry attempts remain unused because one snapshot coverage pass consumes the active-gate timeout budget"
    ],
    "missingCausalEdge": "Load-mode snapshot coverage needs a bounded active-gate per-attempt deadline so retry cadence can run another active-gate attempt before the overall timeout.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
    "boundedProgressProof": "Focused proof must show load-mode snapshot coverage receives a per-attempt deadline and owner-recovery selected timeout remains blocking rather than soft-success.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "expectedObservableTransition": "Representative rerun either passes rolling-restart, moves attempts beyond 1/8, moves snapshotCoverageNodeCount beyond 1/5, or routes to a different owner boundary.",
    "maxProgressBound": "one runtime-owner-boundary package plus one representative rerun before another architecture decision",
    "sameFrontierFallback": "If fresh representative evidence repeats attempts=1/8 and snapshotCoverageNodeCount=1/5, stop for a new architecture/owner-boundary decision.",
    "expectedNextFrontier": "representative-green, active-gate attempt-count movement, snapshot coverage movement, or owner-boundary migration",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-load-snapshot-reachability-prefilter-runtime.md / startup_active_gate_owner / snapshot_coverage_probe_reachability_prefilter / same-frontier",
      "done-20260528-rolling-restart-load-snapshot-remaining-witness-concurrency-runtime.md / startup_active_gate_owner / snapshot_coverage_load_remaining_witness_concurrency / same-frontier",
      "done-20260528-rolling-restart-active-gate-snapshot-coverage-post-concurrency-architecture.md / startup_active_gate_owner / snapshot_coverage_retry_cadence_contract / architecture-selector"
    ],
    "oscillationCheck": "This package implements the architecture-selected retry-cadence contract, not another unselected adjacent patch.",
    "handoffInvariant": "Runtime promotion remains blocked while snapshot coverage is incomplete; this package changes only active-gate retry cadence."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "predecessor architecture package selected retry-cadence-contract",
      "activeGate elapsedMs=72494 and attempts=1/8 show one snapshot coverage pass consumed the active-gate timeout before retry cadence could run"
    ],
    "selectedChoice": "retry-cadence-contract",
    "choices": [
      {
        "id": "retry-cadence-contract",
        "summary": "Execute bounded local runtime proof for active-gate snapshot coverage retry cadence.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js"
        ]
      },
      {
        "id": "owner-boundary-migration",
        "summary": "Migrate owner only if fresh representative evidence names a non-active-gate first frontier.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage"
        ]
      }
    ],
    "nextAction": "Execute the selected retry-cadence runtime proof."
  },
  "requiredPreImplProbe": {
    "command": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
    "artifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "reason": "This focused active-gate load-mode fixture owns the selected retry-cadence contract before representative rerun."
  },
  "observablePrediction": {
    "metric": "activeGate attempts and representative snapshot coverage",
    "predicted": "Focused proof moves load-mode snapshot coverage to a per-attempt deadline, and representative rerun moves activeGate attempts beyond 1/8, moves snapshotCoverageNodeCount beyond 1/5, migrates owner boundary, or passes.",
    "observed": "Focused proof passed; representative failed active_gate_snapshot_coverage with activeGate attempts=2/8, elapsedMs=31001, snapshotCoverageNodeCount=1/5, selectedSnapshotTimeoutMs=100, owner_reconcile_pending, and alternativeSnapshotWitnessAvailable=false.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
    "metricDelta": 1
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage_retry_cadence_contract",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Representative rerun should move activeGate attempts beyond 1/8, move snapshotCoverageNodeCount beyond 1/5, migrate owner boundary, or pass rolling-restart.",
    "requiredRefreshCommands": [
      "timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T000000Z.report.json --fast-local --verbose",
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T000000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage_retry_cadence_contract --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh generated current-blocker handoff via npm run work:repair",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "work/packages/active-20260528-rolling-restart-active-gate-snapshot-coverage-retry-cadence-runtime.md",
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-owner-reconcile-architecture.md",
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
  "theoryLedger": "No ledger update: this package executed the architecture-selected retry-cadence discriminator and reduced the metric from attempts=1/8 to attempts=2/8 without changing the underlying selected snapshot source theory.",
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns `startup_active_gate_owner / snapshot_coverage_retry_cadence_contract`. The previous representative run stayed at one active-gate attempt for the full timeout window, so the runtime slice is to bound load-mode snapshot coverage work per active-gate attempt.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-load-snapshot-remaining-witness-concurrency-20260528T030301Z.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to active-gate retry cadence.
- Escalation trigger to a heavier lane: owner boundary migration, generic timeout budget changes, or representative same-frontier with no attempt-count movement.

## Core Logic Brief

- Canonical outcome: load-mode `_probeClusterActiveState` must pass a bounded per-attempt snapshot coverage deadline so `_waitForAllActive` can rearm retry cadence before the overall active-gate timeout is exhausted.
- Inputs/signals: `activeGate elapsedMs=72494`, `attempts=1/8`, `selectedSnapshotObservationRetryAfterMs=2500`, and `snapshotCoverageNodeCount=1/5` from the fresh representative artifact.
- State model or invariant: startup mode keeps the overall deadline contract; load mode caps only snapshot coverage work inside one active-gate polling attempt.
- Non-goals and forbidden interpretations: do not raise active-gate timeout, generic admin query timeout, or readiness retry windows; do not change table bootstrap, transport, admin API, or promotion ownership.
- Proof mapping: focused load active-gate test proves retry-cadence handoff; selected-source snapshot test proves witness selection remains intact; runtime grammar guards owner-contract drift.
- Wrong-slice trigger: stop if proof needs files outside active-gate retry cadence or if fresh representative evidence names a different first owner.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| active-gate attempts | `1/8` with elapsedMs exhausted | one snapshot coverage pass consumed the active-gate timeout | bound load-mode snapshot coverage per active-gate attempt | attempts move beyond `1/8`, coverage moves, migration, or green | `npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js` |

- Anti-symptom rationale: this patch changes the active-gate retry-cadence contract, not downstream readiness or bootstrap symptoms.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`
- Competing explanations: stale representative evidence, owner-boundary migration, and generic timeout exhaustion were compared in the architecture selector.
- Systemic interaction scan: producer and publication evidence remain classified; consumer active-gate snapshot coverage owns the next runtime move.
- Ping-pong stop rule: if representative attempts and coverage do not move, stop for a new architecture/owner-boundary decision.
- Oscillation guard: this runtime package is allowed only because the predecessor architecture package selected `retry-cadence-contract`; a same-frontier rerun without attempt-count or coverage movement cannot open another adjacent runtime patch.

## Decision Experiment Gate

- Decision question: Can load-mode active-gate snapshot coverage return after a bounded per-attempt window so retry cadence can rearm?
- Architecture review: predecessor selected `retry-cadence-contract`; this package may execute that selected local proof only.
- Competing hypotheses: retry cadence is blocked by unbounded per-attempt snapshot coverage; a different owner boundary owns the next move; evidence is stale.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`
- Success metrics: focused proof shows bounded per-attempt deadline; representative moves attempts beyond `1/8`, coverage beyond `1/5`, migrates, or passes.
- Representative rerun: `timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --fast-local --verbose`
- Kill rule: same-frontier with attempts still `1/8` and coverage still `1/5` opens/selects architecture or owner migration before another runtime patch.

## Execution Evidence

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js`; validation: focused retry-cadence proof, selected-source regression, grammar guardrail, and diff check passed; outcome: bounded per-attempt deadline implemented.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: package evidence only; validation: representative `test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json` moved activeGate attempts from `1/8` to `2/8`; outcome: partial progress, not green.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: current-blocker handoff refreshed and package scope corrected back to the active slice.

## Commit And Push Ledger

1. Focused package commit: 4668b9101e8a60884f1364ecb50a78c19919bcdf
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js
2. npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
3. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js
4. timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json --fast-local --verbose
