# Rolling Restart Selected Snapshot Timeout Owner Recovery Projection Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "selected_snapshot_timeout_owner_recovery_projection_contract",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor experiment selected H2: typed wait_owner_recovery selected-timeout evidence is bounded owner-recovery progress that startup active-gate must project for the pending recovery node without runtime promotion. Baseline artifact has snapshotCoverageNodeCount=1/5, activeNodeCount=4/5, selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72, selected_timeout repair_deferred retryAfterMs=100, pendingRecoveryCount=1, pendingWrites=1, pendingWriteGrowthCount=0, and runtimePromotionAllowed=false.",
  "nextAction": "Focused proof passed, but the fresh representative stayed same-frontier with activeNodeCount=4/5 and snapshotCoverageNodeCount=1/5; migrate to the active-gate same-frontier causal escalation before more runtime edits.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The predecessor experiment selected this owner contract as the smallest remaining rolling-restart frontier after priority recovery and publication convergence were satisfied. Moving this contract should turn the single pending recovery node from selected-timeout evidence into bounded startup active-gate progress while keeping runtime promotion disabled.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open/select the same-frontier causal escalation because the selected local projection produced no representative movement."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "selected_snapshot_timeout_owner_recovery_projection_contract",
    "reason": "The architecture experiment selected H2: wait_owner_recovery selected-timeout evidence is a typed projection contract inside startup active-gate, not another generic snapshot_coverage patch.",
    "evidence": "test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "Typed wait_owner_recovery selected-timeout evidence currently leaves the startup active-gate at snapshotCoverageNodeCount=1/5 because the pending recovery node is not projected as bounded owner-recovery progress.",
    "stopConditionCheck": "Run npm run analyze:causal-model on the fresh representative, the focused startup active-gate harness proof, static guardrails for touched harness files, and a fresh rolling-restart representative rerun before closure.",
    "expectedCausalModelChange": "The focused contract should project the pending recovery node for startup active-gate progress without setting runtimePromotionAllowed=true. The fresh representative should increase activeNodeCount or snapshotCoverageNodeCount beyond 1/5, migrate to a different owner/boundary, or pass rolling-restart.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh evidence stayed at selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72, selected_timeout repair_deferred retryAfterMs=100, wait_owner_recovery pendingRecoveryCount=1, pendingReconcileCount=0, pendingWrites=1, pendingWriteGrowthCount=0, snapshotCoverageNodeCount=1/5, activeNodeCount=4/5, and runtimePromotionAllowed=false. The local pending-recovery projection did not move representative metrics because the remaining inactive readiness-timeout node was 7493b0ab-a054-5fad-a91b-5e331db29304, not the selected pending recovery node.",
    "crossBoundaryReview": "Keep rebalancer scheduling, operation workflow progress, publication convergence, readiness support semantics, scenario timeout ceilings, and runtime promotion safety frozen. This package only changes the selected-timeout owner-recovery projection contract."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected_snapshot_timeout_owner_recovery_projection_contract successor",
    "phaseChain": [
      "predecessor architecture experiment selected H2 owner-recovery projection debt",
      "publication convergence is satisfied",
      "priority recovery is satisfied",
      "active_gate_snapshot_coverage is the first frontier",
      "selected snapshot timeout evidence is typed repair_deferred retry evidence for one pending recovery node"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Typed wait_owner_recovery selected-timeout evidence must let startup active-gate projection count the pending recovery node as bounded owner-recovery progress without runtime promotion.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js",
    "falsifyingProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused proof must show selected-timeout wait_owner_recovery projects the pending recovery node as bounded startup active-gate progress while runtimePromotionAllowed remains false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-rebalancer-leader-operation-scheduling-20260523T033000Z.report.json",
    "expectedObservableTransition": "Fresh representative evidence should increase activeNodeCount or snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes.",
    "maxProgressBound": "one runtime-owner-boundary package before representative rerun",
    "sameFrontierFallback": "If fresh representative evidence remains unchanged same-frontier with no metric movement, stop for an autonomous architecture experiment instead of another local startup active-gate patch.",
    "expectedNextFrontier": "snapshot coverage movement, owner/boundary migration, or rolling-restart green",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-selected-transport-closed-observation-contract / startup_active_gate_owner / selected_transport_closed_observation_contract / migrated",
      "done-20260523-rolling-restart-selected-transport-closed-architecture-experiment / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "The predecessor architecture package selected this concrete contract to avoid another unbounded same-boundary snapshot_coverage patch.",
    "handoffInvariant": "wait_owner_recovery and selected-source timeout evidence must not imply runtime promotion until snapshot coverage completes."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The predecessor architecture experiment selected H2 owner-recovery projection debt.",
      "Fresh evidence removed priority recovery residuals but stayed red on active_gate_snapshot_coverage.",
      "The selected successor is this local proof contract, not another generic snapshot_coverage patch."
    ],
    "selectedChoice": "open-architecture-package",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Execute the selected selected_snapshot_timeout_owner_recovery_projection_contract runtime proof.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use only if fresh proof contradicts the selected H2 route or returns unchanged with no metric movement.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory evidence, missing artifacts, or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "blocked or contradictory tool evidence"
        ]
      }
    ],
    "nextAction": "Use the active-gate same-frontier causal escalation before any additional local startup active-gate patch."
  },
  "observablePrediction": {
    "metric": "rolling-restart active-gate activeNodeCount and snapshotCoverageNodeCount",
    "predicted": "After the focused contract, selected-timeout wait_owner_recovery evidence should project the pending recovery node as bounded startup active-gate progress with runtimePromotionAllowed=false; the fresh representative should move beyond activeNodeCount=4/5 or snapshotCoverageNodeCount=1/5, migrate owner/boundary, or pass.",
    "observed": "same-frontier: activeNodeCount stayed 4/5 and snapshotCoverageNodeCount stayed 1/5",
    "accuracy": "contradicted",
    "evidence": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json",
    "metricDelta": 0
  },
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/packages/done-20260523-rolling-restart-active-gate-same-frontier-causal-escalation.md"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "work/packages/done-20260523-rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
      "npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "active_gate_same_frontier_causal_escalation",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "widen_architecture_work",
    "stopMode": "architecture_gap",
    "nextLane": "causal-escalation",
    "expectedDelta": "The local proof was contradicted at representative level; the successor must distinguish readiness-support projection, snapshot-coverage accounting, or owner-boundary migration before more runtime edits.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --owner startup_active_gate_owner --boundary active_gate_same_frontier_causal_escalation --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-23",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260523-rolling-restart-active-gate-same-frontier-causal-escalation.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --fast-local --verbose.
- State model or invariant: The startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the typed wait_owner_recovery selected-timeout projection contract so startup active-gate counts the pending recovery node as bounded owner-recovery progress without runtime promotion, then rerun focused proof and rolling-restart. | Focused proof should let typed wait_owner_recovery selected-timeout evidence project the pending recovery node for startup active-gate progress while runtimePromotionAllowed remains false; fresh representative should increase activeNodeCount/snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart. | npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js |
| scope boundary | src/ | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js`
- Success metrics: Focused proof should let typed wait_owner_recovery selected-timeout evidence project the pending recovery node for startup active-gate progress while runtimePromotionAllowed remains false; fresh representative should increase activeNodeCount/snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --owner startup_active_gate_owner --boundary selected_snapshot_timeout_owner_recovery_projection_contract --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json`
- Expected delta: Focused proof did project the selected pending recovery node locally, but representative evidence did not move beyond activeNodeCount=4/5 or snapshotCoverageNodeCount=1/5. This falsifies the local-only contract and selects the same-frontier architecture experiment.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `selected_snapshot_timeout_owner_recovery_projection_contract`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `bounded-experiment`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-architecture-experiment`
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

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/cluster-segment-7-class-5.js
3. test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js
4. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
5. test/distributed/harness/__tests__/cluster.test-part-4.js

## Out Of Scope

1. src/

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/distributed/harness/__tests__/cluster.test-part-4.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --fast-local --verbose`
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

- [x] implementation: status: validated; evidence: `npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` PASS (52 tests); `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js` PASS; `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js` PASS; `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js` PASS; `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --fast-local --verbose` FAIL same-frontier with activeNodeCount=4/5 and snapshotCoverageNodeCount=1/5; parent revalidated focused proof: yes; next: migrate to `work/packages/done-20260523-rolling-restart-active-gate-same-frontier-causal-escalation.md`.
- [x] verification-fix: status: validated; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260523-rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract.md` PASS, `npm run work:validate -- --pre-impl work/packages/done-20260523-rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract.md` PASS, `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json` confirms same-frontier `active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --handoff-probe` confirms wait_owner_recovery with pendingRecoveryCount=1 and bounded queue, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json` reports `continue_local_fix`, plus focused proof and static audits rerun PASS in verifier pass; changed files: `work/packages/done-20260523-rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract.md`; parent revalidated focused proof: yes; next: closure and successor causal escalation activation.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract-20260523T041412Z.report.json --fast-local --verbose

## Commit And Push Ledger

1. Focused package commit: 899123964649ae70d8b85498157a00068c574f8b
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
