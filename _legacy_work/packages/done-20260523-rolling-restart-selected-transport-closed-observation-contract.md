# Rolling Restart Selected Transport Closed Observation Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "selected_transport_closed_observation_contract",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused proof now emits selected_transport_closed for terminal retry closure while preserving non-promoting wait_owner_recovery and bounded owner queue defer. Fresh rolling-restart evidence improved snapshotCoverageNodeCount from 1/5 to 2/5 and migrated the first critical path to priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.",
  "nextAction": "Close this bounded-progress package and open the routed priority recovery workflow progress successor.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The predecessor architecture experiment resolved the repeated same-frontier loop by selecting a narrower executable edge. This is the smallest implementation slice that can make the selected transport-closed observation truthful without weakening runtime promotion or widening timeouts.",
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
    "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "work/packages/done-20260523-rolling-restart-selected-transport-closed-observation-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
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
      "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof",
      "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "representativeResidual": {
    "status": "bounded-progress-owner-boundary-migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Open the priority recovery operation_workflow_owner / workflow_progress successor with the fresh representative artifact."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "selected_transport_closed_observation_contract",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "The selected transport-closed observation contract passed focused proof and the fresh representative improved snapshotCoverageNodeCount from 1/5 to 2/5, then routed first critical path to priority_recovery_partition_progress.",
    "evidence": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "Terminal retry evidence currently preserves the initial selected_timeout reason even when the final selected error is a transport-closed admin snapshot lane failure. Emitting selected_transport_closed while preserving the wait_owner_recovery handoff should remove the observation mismatch and keep owner queue backpressure bounded.",
    "stopConditionCheck": "Run the focused selected transport-closed fixture and affected consumer proof, static guardrails, npm run analyze:causal-model on the fresh representative, and a fresh rolling-restart rerun before closure.",
    "expectedCausalModelChange": "Focused proof should emit selected_transport_closed for terminal retry closure while preserving wait_owner_recovery, bounded owner queue defer, and runtimePromotionAllowed=false. Fresh representative should increase snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh evidence has snapshotCoverageNodeCount=2/5, selectedSnapshotObservationReasonCodes=[cache_stale_watermark,stale_replica_operations_in_flight], selectedSnapshotObservationNextAction=proceed, publicationActiveGateHandoff=wait_owner_recovery/runtimePromotionAllowed=false, selectedControlPlaneOwnerQueuePendingWrites=18, pendingWriteGrowthCount=132, and membershipPublicationHandoffOutcome=write_deferred/enqueued=true. The first critical path moved to priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.",
    "crossBoundaryReview": "Keep publication convergence, priority recovery, owner queue bounded-defer behavior, readiness support semantics, runtime promotion safety, and product/scenario timeout ceilings frozen; this package only changes selected transport-closed observation and its direct handoff preservation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after selected_transport_closed architecture experiment",
    "phaseChain": [
      "selected-source retry floor proof passed",
      "wait_owner_recovery progress raised snapshotCoverageNodeCount from 0/5 to 1/5",
      "owner queue bounded-defer evidence reports write_deferred/enqueued=false/retryAfterMs=100 and pendingWriteGrowthCount=0",
      "architecture experiment selected H2 observation normalization debt",
      "fresh representative after this package improves snapshotCoverageNodeCount from 1/5 to 2/5 and routes to priority recovery workflow progress"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Terminal selected-source retry closure must classify the final selected transport-closed error as selected_transport_closed while preserving wait_owner_recovery handoff semantics for bounded owner recovery.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof",
    "boundedProgressProof": "Focused proof must show selected transport-closed terminal retry emits selected_transport_closed, preserves wait_owner_recovery retry/defer handoff evidence, and keeps runtime promotion blocked.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json",
    "expectedObservableTransition": "selectedSnapshotObservationReasonCodes includes selected_transport_closed for terminal retry closure while publicationActiveGateHandoff remains wait_owner_recovery, owner queue handoff remains bounded, snapshot coverage increases beyond 1/5, owner/boundary migrates, or rolling-restart passes.",
    "maxProgressBound": "one selected transport-closed observation contract; no timeout widening and no runtime promotion while coverage is incomplete",
    "sameFrontierFallback": "If fresh evidence remains same-frontier with no metric movement, stop for architecture-gap instead of another adjacent runtime patch.",
    "expectedNextFrontier": "priority recovery workflow progress successor, rebalancer leader operation scheduling split, or rolling-restart green",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "ownerBoundaryMigrationProof": "Focused proof satisfied startup_active_gate_owner / selected_transport_closed_observation_contract, and fresh canonical evidence moved the first critical path from active_gate_snapshot_coverage / startup_active_gate_owner to priority_recovery_partition_progress / operation_workflow_owner / workflow_progress while improving snapshotCoverageNodeCount from 1/5 to 2/5.",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime / startup_active_gate_owner / snapshot_coverage / reduced",
      "active-20260523-rolling-restart-selected-transport-closed-architecture-experiment / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260522-rolling-restart-active-gate-snapshot-watch-handoff-contract / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor is an autonomous architecture experiment that selected this narrower observation contract after the validator rejected another same-boundary runtime package.",
    "handoffInvariant": "selected_transport_closed evidence may not imply startup readiness or runtime promotion until snapshot coverage completes."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The previous runtime package reduced owner queue handoff evidence but stayed at active_gate_snapshot_coverage.",
      "The autonomous architecture experiment selected H2 selected_transport_closed observation normalization debt.",
      "The new boundary is selected_transport_closed_observation_contract rather than another snapshot_coverage runtime patch."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the selected transport-closed observation contract with non-promoting wait_owner_recovery preservation.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Use only if the focused proof cannot preserve wait_owner_recovery and truthful selected_transport_closed observation together.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json"
        ]
      }
    ],
    "nextAction": "Execute the selected local proof."
  },
  "observablePrediction": {
    "metric": "selectedSnapshotObservationReasonCodes, publicationActiveGateHandoff nextAction, owner queue handoff outcome, snapshotCoverageNodeCount, route owner/boundary, and rolling-restart result",
    "predicted": "Focused proof will emit selected_transport_closed for terminal retry closure while preserving wait_owner_recovery, bounded owner queue defer, and runtimePromotionAllowed=false; fresh representative will increase coverage beyond 1/5, migrate owner/boundary, or pass.",
    "observed": "focused proof passed, snapshotCoverageNodeCount increased from 1/5 to 2/5, and the fresh representative routed first frontier to priority_recovery_partition_progress / operation_workflow_owner / workflow_progress",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "This package satisfied the selected transport-closed observation contract and moved representative evidence to the priority recovery workflow progress frontier. The next package should prove or split that residual owner boundary.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json --owner startup_active_gate_owner --boundary selected_transport_closed_observation_contract --dominant-reason active_gate_timed_out",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker generated handoff",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260523-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the predecessor architecture experiment selected one bounded observation contract and this package only executed that local proof.
- Escalation trigger to a heavier lane: runtime ownership changes, the selected observation contract cannot preserve wait-owner recovery, or representative evidence returns same-frontier with no metric movement.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / selected_transport_closed_observation_contract emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof; npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json --fast-local --verbose.
- State model or invariant: The startup_active_gate_owner / selected_transport_closed_observation_contract decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / selected_transport_closed_observation_contract invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / selected_transport_closed_observation_contract / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the selected transport-closed observation contract: terminal retry evidence must emit selected_transport_closed while preserving the non-promoting wait_owner_recovery handoff and bounded owner queue defer. | Focused proof should emit selected_transport_closed for terminal retry closure while preserving wait_owner_recovery and bounded owner queue defer; fresh representative should increase snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart. | npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / selected_transport_closed_observation_contract directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / selected_transport_closed_observation_contract still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof`
- Success metrics: Focused proof should emit selected_transport_closed for terminal retry closure while preserving wait_owner_recovery and bounded owner queue defer; fresh representative should increase snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json --owner startup_active_gate_owner --boundary selected_transport_closed_observation_contract --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-wait-owner-recovery-reconcile-drain-runtime-20260523T014023Z.report.json`
- Expected delta: Focused proof should emit selected_transport_closed for terminal retry closure while preserving wait_owner_recovery and bounded owner queue defer; fresh representative should increase snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `scenario-release-gate`
- Required after rerun: close this bounded-progress package, open the priority recovery workflow progress successor, refresh current-blocker, and run pre-implementation validation on the successor.

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

1. test/distributed/harness/cluster-segment-7-class-5.js
2. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
3. test/distributed/harness/__tests__/cluster.test-part-4.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/distributed/harness/__tests__/cluster.test-part-4.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof`, `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json --fast-local --verbose`
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

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` PASS 40/40; `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js` PASS; `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js` PASS; `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js` PASS; parent revalidated focused proof: yes; next: closure and successor action.
- [x] representative: status: reduced; evidence: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json --fast-local --verbose` FAIL with bounded progress; snapshotCoverageNodeCount moved to 2/5; first frontier `priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`; next: successor package.
- [x] canonical-route: status: validated; evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json` PASS; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json --handoff-probe` PASS; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json` PASS; `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json` PASS; next: open scenario-release-gate successor.
- [x] verification-fix: status: validated; evidence: Lovelace verifier-fixer reran `npm run work:context`, focused proof, literal audit, decision-boundary audit, and runtime-grammar audit; all PASS; changed files: none; parent revalidated focused proof: yes; next: closure and successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after package metadata update; next: validation.

## Commit And Push Ledger

1. Focused package commit: 899123964649ae70d8b85498157a00068c574f8b
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected transport-closed observation contract and affected consumer proof
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-transport-closed-observation-contract-20260523T020922Z.report.json --fast-local --verbose
