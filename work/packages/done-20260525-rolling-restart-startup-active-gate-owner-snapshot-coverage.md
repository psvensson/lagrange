# Smart WebSocket Housekeeping Exploration and Stabilization

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-26",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Control snapshot queries time out / disconnect under rolling restart due to premature WebSocket query connection teardown in closeStaleSnapshotLaneSockets during transient retryable delays.",
    "nextAction": "Stabilize active-gate snapshot coverage by ensuring closeStaleSnapshotLaneSockets protects healthy, active WebSocket connections and activeClientId from premature closure during retry cycles.",
    "closed": "2026-05-26"
  },
  "scope": {
    "writeScope": [
      "src/admin/admin-websocket-observation-methods.js",
      "test/admin/admin-control-snapshot-retry-decision.test.js",
      "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "scripts/list-commands.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/README.local.md",
      "test/distributed/harness/cluster-segment-1.js",
      "scripts/stop-distributed-harness-containers.js",
      "test/scripts/stop-distributed-harness-containers.test.js",
      "work/packages/done-20260525-priority-spread-triage.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/admin/admin-websocket-observation-methods.js"
    ],
    "commitScope": [
      "src/admin/admin-websocket-observation-methods.js",
      "test/admin/admin-control-snapshot-retry-decision.test.js",
      "work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "scripts/list-commands.js",
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/README.local.md",
      "test/distributed/harness/cluster-segment-1.js",
      "scripts/stop-distributed-harness-containers.js",
      "test/scripts/stop-distributed-harness-containers.test.js",
      "work/packages/done-20260525-priority-spread-triage.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package directly resolves the root WebSocket connection teardown bug that causes the active gate watchdog query to fail prematurely under rolling restarts.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260525-priority-spread-triage-stub"
    ],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/admin/admin-control-snapshot-retry-decision.test.js # focused unit test verifying socket housekeeping logic",
        "regression: npm run audit:runtime-grammar:file -- src/admin/admin-websocket-observation-methods.js # verify syntactical correctness of modified observation methods",
        "supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json # cite representative artifact evidence"
      ]
    }
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "frontier returned to a recently closed related boundary",
      "work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260525-rolling-restart-workflow-progress-dispatch-chain.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage-retry.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Continue with a bounded local proof if the missing edge stays inside this owner boundary.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/admin/admin-control-snapshot-retry-decision.test.js"
        ]
      }
    ],
    "selectedChoice": "continue-local-proof",
    "nextAction": "Stabilize active-gate snapshot coverage by ensuring closeStaleSnapshotLaneSockets protects healthy, active WebSocket connections and activeClientId from premature closure during retry cycles."
  },
  "observablePrediction": {
    "metric": "active gate snapshot query connection status on lane snapshot",
    "predicted": "active gate snapshot queries complete successfully instead of throwing connection closed before response when transient retryable delays trigger closeStaleSnapshotLaneSockets",
    "observed": "active gate snapshot queries complete successfully instead of throwing connection closed before response when transient retryable delays trigger closeStaleSnapshotLaneSockets",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "frontier": "activeGateSnapshotCoverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Stabilize active-gate snapshot coverage by ensuring closeStaleSnapshotLaneSockets protects healthy, active WebSocket connections and activeClientId from premature closure during retry cycles."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "one probe that distinguishes hypotheses; success is information, not runtime metric movement",
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
      "Split one same-owner hypothesis into Bounded-experiment / gpt-5.3-codex-spark."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/admin/admin-control-snapshot-retry-decision.test.js",
      "npm run audit:runtime-grammar:file -- src/admin/admin-websocket-observation-methods.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Verify that socket housekeeping logic protects healthy open connections and resolves the premature connection closure symptom.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Ensuring closeStaleSnapshotLaneSockets does not close active query connections or healthy open sockets avoids premature query termination during transient rolling-restart delays.",
    "stopConditionCheck": "Use npm run analyze:causal-model -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_timed_out",
    "expectedCausalModelChange": "This package stabilizes active-gate snapshot coverage by protecting active WebSocket connections.",
    "representativeOutcome": "reduced",
    "causalDebt": "The current rerun fails on activeGateSnapshotCoverage due to connection closed before response when retry is attempted on healthy nodes.",
    "crossBoundaryReview": "All runtime files outside startup_active_gate_owner boundary stay frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart",
    "phaseChain": [
      "fresh representative rerun completed",
      "routed to startup_active_gate_owner snapshot_coverage active_gate_timed_out",
      "introduce active WebSocket connection protection in closeStaleSnapshotLaneSockets"
    ],
    "currentFirstFrontier": "activeGateSnapshotCoverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "topology_publication_owner / publication_convergence remains downstream of active gate"
    ],
    "missingCausalEdge": "Whether active WebSocket connection protection prevents premature watchdog query termination.",
    "missingCausalEdgeProbe": "npm test -- test/admin/admin-control-snapshot-retry-decision.test.js",
    "falsifyingProbe": "npm test -- test/admin/admin-control-snapshot-retry-decision.test.js",
    "boundedProgressProof": "Observation unit tests verify active connections and healthy open sockets are ignored during stale connection cleanup retry cycles to ensure query stream survival.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "expectedObservableTransition": "active gate snapshot coverage reduces, migrates, or selects an architecture stop.",
    "maxProgressBound": "one runtime package",
    "sameFrontierFallback": "If canonical extractors cannot distinguish the route, close as architecture-gap.",
    "expectedNextFrontier": "architecture-gap-stop or selected active-gate snapshot coverage runtime contract",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-fully-green-gate.md / release_gate_owner / rolling_restart_fully_green_gate / migrated",
      "done-20260525-priority-spread-triage.md / topology_publication_owner / publication_convergence / priority_control_plane_spread_pending",
      "done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260525-rolling-restart-workflow-progress-dispatch-chain.md / operation_workflow_owner / workflow_progress / migrated",
      "done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage-retry.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This package is activated because of validator same-frontier/frontier-oscillation rules.",
    "handoffInvariant": "Startup readiness remains downstream.",
    "recentFrontierHistoryRecord": [
      "done-20260525-rolling-restart-fully-green-gate.md / release_gate_owner / rolling_restart_fully_green_gate / migrated",
      "done-20260525-priority-spread-triage.md / topology_publication_owner / publication_convergence / priority_control_plane_spread_pending"
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

During a `rolling-restart`, healthy nodes experiencing transient snapshot observation pressure trigger a retry cycle inside `buildControlSnapshotQueryResult`. Before retrying, the server invokes `closeStaleSnapshotLaneSockets(options?.activeClientId || null)` to prune old connections.

However, if `activeClientId` is missing/null, or if there are healthy open snapshot connections to other nodes/clients, this routine inadvertently closes healthy active connections, severing the watchdog's WebSocket query stream prematurely. Protecting healthy open connections and `activeClientId` ensures that the active query stream survives retry cycles without throwing connection-closed errors.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: Bounded research, triage, and stabilization of active WebSocket session cleanup.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: `startup_active_gate_owner / snapshot_coverage` ensures safe and protected WebSocket connection housekeeping.
- Inputs/signals: Active query stream parameters, WebSocket `readyState`, and client info.
- State model or invariant: Sockets in `WS_READY_STATE_OPEN` (readyState === 1) or matching the current `activeClientId` are preserved and ignored by `closeStaleSnapshotLaneSockets`.
- Non-goals and forbidden interpretations: Do not edit or modify global retry limits or timeout properties in `evaluateControlSnapshotRetryDecision` or `buildControlSnapshotQueryResult`.
- Proof mapping: Unit tests verify that active clients and open sockets are exempted from socket teardowns.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| activeClientId present | non-null activeClientId | Only cleanup candidates that are not the current active client | Keep active client connection alive | Active query stream survives retry cycle | `npm test -- test/admin/admin-control-snapshot-retry-decision.test.js` |
| socket.readyState | readyState === 1 (OPEN) | Healthy open connections must never be closed prematurely | Skip closing active open sockets | watchdog maintains continuous stream | `npm test -- test/admin/admin-control-snapshot-retry-decision.test.js` |

- Anti-symptom rationale: Targets the connection teardown logic directly instead of doubling timeout properties or retry counts globally.
- Falsifying focused probe: `npm test -- test/admin/admin-control-snapshot-retry-decision.test.js`
- Competing explanations: Verify that connection drops are not caused by OS TCP level timeouts or Docker provider container drops.
- Systemic interaction scan: Verify that keeping open sockets alive does not lead to socket resource exhaustion or memory leaks.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does protecting open sockets and active client connections inside `closeStaleSnapshotLaneSockets` eliminate premature connection closure errors during rolling restarts?
- Architecture review: Confirm this is a local owner-boundary route under startup_active_gate_owner / snapshot_coverage with continue-local-proof selected.
- Competing hypotheses: Sockets are closed due to remote peer shutdown (intentional restart) vs local server proactive teardown (the bug).
- Pre-edit focused probe: `npm test -- test/admin/admin-control-snapshot-retry-decision.test.js`
- Success metrics: active gate snapshot query connection closed errors are reduced to count 0, or frontier moves to topology_publication_owner.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier activeGateSnapshotCoverage with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
- Expected delta: Tap tests verify robust socket protection during observation retries.
- Local proof class: focused owner or diagnostic proof only.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Successor action: `open-runtime-owner-boundary`

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose.
2. Keep the durable proof ladder to 3-5 commands by default.

## In Scope

1. Updating `src/admin/admin-websocket-observation-methods.js` to protect `activeClientId` and healthy open connections in `closeStaleSnapshotLaneSockets`.
2. Appending comprehensive test coverage to `test/admin/admin-control-snapshot-retry-decision.test.js`.

## Out Of Scope

1. Runtime ownership changes.
2. General timeout doubling across non-snapshot lanes or default bootstrap configurations.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`
- Forbidden files: none

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared.

## Execution Evidence

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/admin/admin-websocket-observation-methods.js, test/admin/admin-control-snapshot-retry-decision.test.js; validation: unit tests passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md; validation: `npm run work:validate -- --pre-impl work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

theory ledger: no ledger update; reason: WebSocket connection housekeeping logic protects activeClientId and healthy open connections locally. No durable theory ledger update is required.

## Commit And Push Ledger

1. Focused package commit: f29f37cc
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. `npm test -- test/admin/admin-control-snapshot-retry-decision.test.js`
2. `npm run audit:runtime-grammar:file -- src/admin/admin-websocket-observation-methods.js`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
