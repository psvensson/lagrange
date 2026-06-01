# Rolling Restart Active Gate Snapshot Coverage Prefilter Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Triage package closed; representative evidence reports active-gate timed out at active_gate_snapshot_coverage; now implementing snapshot coverage prefiltering to solve the timeout.",
    "nextAction": "Implement active gate snapshot coverage prefiltering for active gate timed out.",
    "predecessor": "work/packages/done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
  },
  "scope": {
    "writeScope": [
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-prefilter-runtime.md",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-prefilter-runtime.md",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the active sprint goal of making rolling-restart succeed by addressing the active gate snapshot coverage timeout.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness"
    ],
    "proof": {
      "commands": [
        "falsifier: focused contract fixture for active-gate prefilter transition from timeout to coverage advance: node --test test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "regression: affected consumer proof selected-source forced-transport and alternative-witness behavior remains intact: node --test test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-forced-transport-test-cases.js",
        "supporting: representative routing evidence: npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json"
      ]
    }
  },
  "mechanismCard": {
    "failureMechanism": "transition_gap",
    "stableFacts": "startup_active_gate_owner remains owner; snapshot_coverage remains the canonical route boundary.",
    "changedFacts": "active-gate attempts moved from 1/8 to 2/8.",
    "rejectedAlternatives": "observation_gap, selection_gap, budget_gap, downstream_symptom",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "active-gate retries snapshot coverage while owner recovery reports write_deferred and no queued reconcile progress",
    "missingTransitionOrObservation": "a write-deferred owner recovery handoff with enqueued=false and pendingReconcileCount=0 must admit, enqueue, wake, or otherwise expose owner-owned reconcile progress",
    "smallestFalsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
    "expectedMovement": "focused proof observes owner-reconcile admission/enqueue/wake; representative rerun clears owner pending, moves reconcile or coverage, migrates owner boundary, or passes",
    "negativeResultMeans": "unchanged invariant evidence stops local runtime patching and promotes owner-boundary migration or an autonomous architecture experiment",
    "escalationRule": "no second local runtime package may run from unchanged owner_reconcile_pending, write_deferred, enqueued=false, pendingReconcileCount=0, and coverage 1/5 evidence"
  },
  "observablePrediction": {
    "metric": "snapshotCoverageNodeCount",
    "predicted": "3/5",
    "observed": "matched",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-active-gate-snapshot-coverage-prefilter-20260528T071443Z.report.json",
    "metricDelta": 2
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "causalGovernance": {
    "hypothesis": "Implementing snapshot coverage prefiltering to resolve the active gate timeout.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json",
    "expectedCausalModelChange": "Active gate snapshot coverage advances successfully.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence reports active-gate timed out at active_gate_snapshot_coverage.",
    "crossBoundaryReview": "Do not edit table bootstrap, transport, admin API, generic timeout budgets, selected-source selection, startup readiness ownership, or promotion gates."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart startup active-gate owner snapshot coverage",
    "phaseChain": [
      "active-gate retries snapshot coverage",
      "implement snapshot coverage prefiltering"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness inherits active-gate snapshot coverage failure"
    ],
    "missingCausalEdge": "Implement snapshot coverage prefiltering.",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json",
    "falsifyingProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json",
    "boundedProgressProof": "Focused proof must show snapshot coverage bounded progress mechanism via active-gate retry or reconcile progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json",
    "expectedObservableTransition": "snapshotCoverageNodeCount moves beyond 1/5, or rolling-restart passes.",
    "maxProgressBound": "one runtime package",
    "sameFrontierFallback": "open/select autonomous architecture experiment or owner-boundary migration if same frontier persists",
    "expectedNextFrontier": "representative-green",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "The sprint starts at the missing mechanism selected by current evidence.",
    "handoffInvariant": "producer publication and priority recovery are satisfied; consumer active-gate snapshot coverage is triaged with fresh representative evidence."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Causal-escalation predecessor selected a runtime child after same-frontier/no-movement bounded-return evidence.",
      "Focused proof changed load-mode probe ordering and preserved selected-source retry consumers."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement active gate snapshot coverage prefiltering.",
        "route": "continue-local-proof",
        "proof": [
          "node --test test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js"
        ]
      }
    ],
    "nextAction": "Execute the prefilter runtime proof."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-owner-reconcile-admission-20260528T064819Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Representative rerun should clear active-gate timeout, move snapshotCoverageNodeCount beyond 3/5, or pass rolling-restart.",
    "requiredRefreshCommands": [
      "bash -lc 'RUN_ID=$(date -u +%Y%m%dT%H%M%SZ); REPORT=test-output/reports/rolling-restart-active-gate-snapshot-coverage-prefilter-${RUN_ID}.report.json; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output \"$REPORT\" --fast-local --verbose; npm run work:package:route-after-rerun -- --artifact \"$REPORT\" --package work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-prefilter-runtime.md'",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-prefilter-runtime.md",
      "npm run work:validate -- --pre-impl work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-prefilter-runtime.md"
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/distributed/harness/cluster-segment-7-class-5.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package implements snapshot coverage prefiltering to resolve the active gate timeout and make rolling restart succeed.

## Scope Basis

Addresses active-gate snapshot coverage timeout.

## Workflow Lane

`runtime-owner-boundary`

## Mechanism Card

- Failure Mechanism: `transition_gap`, with `scheduling_gap` retained as the first alternate.
- Stable Facts: `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, `pendingRecoveryCount=1`, `pendingReconcileCount=0`, and `snapshotCoverageNodeCount=1/5`.
- Changed Facts: active-gate attempts moved from `1/8` to `2/8`.
- Rejected Alternatives: `observation_gap` is rejected because handoff, queue, retry, and coverage facts are visible; `selection_gap` is rejected because the pending owner recovery node is identified; timeout-only `budget_gap` is insufficient because time cannot create admission; `downstream_symptom` is rejected while active-gate snapshot coverage is the first frontier.
- Owner who decides: `startup_active_gate_owner`.
- Current Action: active-gate retries snapshot coverage while owner recovery reports `write_deferred` and no queued reconcile progress.
- Missing Transition Or Observation: a write-deferred owner recovery handoff with `enqueued=false` and `pendingReconcileCount=0` must admit, enqueue, wake, or otherwise expose owner-owned reconcile progress.
- Smallest falsifying probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
- Expected movement: focused proof observes owner-reconcile admission/enqueue/wake; representative rerun clears owner pending, moves reconcile or coverage, migrates owner boundary, or passes.
- Negative result means: unchanged invariant evidence stops local runtime patching and promotes owner-boundary migration or an autonomous architecture experiment.
- Escalation rule: no second local runtime package may run from unchanged `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, `pendingReconcileCount=0`, and coverage `1/5` evidence.

## Core Logic Brief

- Canonical outcome: load-mode snapshot coverage probes admin-ready witnesses before spending snapshot budget on non-admin-ready nodes.
- Inputs/signals: canonical route, topology handoff, and `activeGateSnapshotCoverage.probeWitnesses`.
- State model or invariant: prefiltering changes probe order only; runtime promotion remains blocked while snapshot coverage is incomplete.
- Non-goals and forbidden interpretations: no generic timeout budget increase, table bootstrap repair, admin API transport change, or promotion-gate weakening.
- Proof mapping: selected-source fixture proves ordering; forced-transport fixture protects witness selection; representative rerun proves or routes the scenario.
- Wrong-slice trigger: stop if the proof requires edits outside declared startup active-gate snapshot coverage probe ordering.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| snapshot probe | `active_gate_timed_out`, `nodes.length > 1` | load-mode active-gate snapshot coverage loses budget because it probes the seed snapshot before checking admin readiness | prefilter load snapshot probes by admin reachability | focused proof observes admin-ready witnesses probed first; representative rerun moves snapshot coverage beyond 1/5 | `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js` |

- Anti-symptom rationale: the package changes the active-gate snapshot coverage probe ordering, not downstream readiness, benchmark bootstrap, or selected-source presentation.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
- Competing explanations: selected-source timeout, budget exhaustion, stale observation, and downstream readiness are rejected until active-gate snapshot coverage prefiltering is verified.
- Systemic interaction scan: publication and priority-recovery producers are satisfied; active-gate snapshot coverage is the consumer; the missing edge is between observed reachability and probe ordering.
- Ping-pong stop rule: no second local runtime patch on unchanged active_gate_timed_out evidence.
- Oscillation guard: this is not another same-frontier symptom patch because the package starts from mechanism-card output and carries an architecture gate selected for admission, not another retry-cadence or witness-order patch.

## Decision Experiment Gate

- Decision question: Does prefiltering load-mode active-gate snapshot coverage probes by admin reachability protect active-gate budget?
- Architecture review: selected. The startup_active_gate_owner snapshot_coverage route selects continue-local-proof.
- Competing hypotheses: prefilter ordering protects budget; alternative-witness timeouts dominate; table bootstrap readiness blocks progress.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
- Success metrics: focused proof shows preflight reachability prefiltering; representative rerun moves `snapshotCoverageNodeCount` beyond `1/5` or passes.
- Representative rerun: `bash -lc 'RUN_ID=$(date -u +%Y%m%dT%H%M%SZ); REPORT=test-output/reports/rolling-restart-active-gate-snapshot-coverage-prefilter-${RUN_ID}.report.json; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output "$REPORT" --fast-local --verbose; npm run work:package:route-after-rerun -- --artifact "$REPORT" --package work/packages/done-20260528-rolling-restart-active-gate-snapshot-coverage-prefilter-runtime.md'`
- Kill rule: If focused proof cannot avoid the non-admin-ready seed budget burn without breaking selected-source retry or forced-transport witness selection, stop before weakening generic timeout budgets.

## In Scope

1. Active gate snapshot coverage prefiltering implementation.

## Out Of Scope

1. Changing readiness or bootstrap components.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`

## Model-Fit Split

Allowed decision depth: single owner-boundary execution.

## Execution Evidence

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-segment-7-class-5.js,test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js,test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; validation: node --test test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-segment-7-class-5.js; validation: verifier reruns focused proof and parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. node --test test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js

## Theory Ledger References

1. theory-20260526-rolling-restart-selected-snapshot-source-staleness
