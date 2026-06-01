# Rolling Restart Active Gate Wait Owner Recovery Selected Source Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Fresh representative evidence stayed on active_gate_snapshot_coverage with zero priority-recovery residuals, selected_snapshot_source_timeout, snapshotCoverageNodeCount=1/5, selectedControlPlaneOwnerQueuePendingWrites=1, and requiredProgressMechanism=reconcile.",
    "nextAction": "Open an autonomous architecture experiment for the repeated active-gate selected-source owner-recovery contract gap before any more local runtime patches.",
    "closed": "2026-05-27"
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/packages/active-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js"
    ],
    "commitScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/packages/active-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the active sprint goal by resolving the current first frontier active_gate_snapshot_coverage without a third same-frontier runtime patch; the package must distinguish one contract or stop before more source edits.",
    "representativeRerunCadence": "architecture-stop-reason"
  },
  "modelFit": {
    "packageClass": "architecture-experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-owner-discriminator/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260522-snapshot-watch-handoff-contract"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
        "regression: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
        "supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
        "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
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
  "boundedExperiment": {
    "hypothesis": "H1 Retry cadence/budget rearm: activeGate attempts remain at 1/8 while selectedSnapshotObservation requests retryAfterMs=15000, so the gate may terminate before the retry can observe. H2 Selected-source owner recovery: the single pending selected owner write and wait_owner_recovery handoff still own progress. H3 Selected-source health: the selected admin_ws source is stale despite an alternative witness. H4 Migration/architecture-gap: prior reducers already covered these local mechanisms and the next move is outside this owner boundary.",
    "hypothesisDiscriminator": "H1 is selected if active_gate_attempts and active_gate_timeout exhaustion dominate while retryAfterMs remains bounded; H2 if ownerRecoveryQueue pendingWrites=1 and requiredProgressMechanism=reconcile dominate; H3 if selected-source health or alternative witness evidence dominates; H4 if canonical proof repeats prior mechanisms without a new contract.",
    "expectedMetric": "selected successor contract plus activeGate attempts, active_gate_timeout state, selectedSnapshotObservationRetryAfterMs, selectedControlPlaneOwnerQueuePendingWrites, requiredProgressMechanism, snapshotCoverageNodeCount, and route owner/boundary",
    "inheritsFrom": "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-post-stale-cache-route.md",
    "timebox": "24h",
    "mergeRequirement": "scenario route, topology handoff probe, topology active-gate explain, causal model, and one selected successor or architecture-gap stop",
    "killRule": "Do not edit runtime files until this experiment names one concrete retry, budget, reconcile, selected-source health, migration, or architecture-gap outcome."
  },
  "validationTier": "cross-owner",
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "falsifier: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
      "regression: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
      "supporting: npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-architecture-experiment",
    "runtimePromotionRule": "Runtime files remain in candidateRuntimeFiles; same-frontier evidence with no reduction must select/open an autonomous architecture experiment instead of another runtime-owner-boundary local patch."
  },
  "causalGovernance": {
    "hypothesis": "The fresh post-stale-cache artifact is not a generic readiness symptom: it carries an active-gate selected snapshot timeout with admin_ws reachability, an alternative snapshot witness, and exactly one selected owner-recovery pending write, so the next bounded proof must test the selected-source owner recovery progress contract.",
    "stopConditionCheck": "Ran npm run analyze:causal-model, scenario-route, and topology handoff probe on test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json before runtime edits.",
    "expectedCausalModelChange": "The experiment selects an autonomous architecture experiment for the repeated active-gate selected-source owner-recovery contract gap; runtime files remain frozen in this package.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh evidence still routes active_gate_snapshot_coverage with selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_health, alternativeSnapshotWitnessAvailable=true, pendingRecoveryCount=1, selectedControlPlaneOwnerQueuePendingWrites=1, requiredProgressMechanism=reconcile, active_gate_attempts=1/8, and active_gate_timeout exhausted.",
    "crossBoundaryReview": "Do not change readiness, publication, operation workflow, timeout budgets, or diagnostics sidecar loading. This package may only change startup_active_gate_owner / snapshot_coverage focused harness behavior and affected consumer tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate selected source wait_owner_recovery after stale-cache scheduling",
    "phaseChain": [
      "priority recovery stale-cache scheduling cleared eligible_but_no_operation_created and zeroed priority-recovery residual witnesses",
      "classification preserved startup_active_gate_owner / snapshot_coverage / active_gate_timed_out as the first frontier",
      "detailed topology explain exposed wait_owner_recovery, selected-source timeout, admin_ws reachability, alternative witness availability, and one selected owner queue pending write",
      "this runtime package owns one bounded selected-source owner-recovery proof before another same-frontier patch is allowed"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness and admin support evidence remain downstream while active-gate snapshot coverage is incomplete",
      "operation workflow and priority recovery are not first blockers because residual witnesses are zero in the source artifact"
    ],
    "missingCausalEdge": "The active-gate selected snapshot source exposes retryAfterMs=15000 and activeGateAttempts=1/8 at terminal timeout, but the system has not selected whether the missing edge is retry-cadence/budget rearm, selected-source owner recovery, selected-source health, or owner-boundary migration.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Architecture proof must select one retry, reconcile, drain, wake, timer, budget, or migration mechanism before any runtime patch resumes.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "expectedObservableTransition": "Canonical proof repeated the same frontier without reduction and therefore selected an autonomous architecture experiment before more local runtime work.",
    "maxProgressBound": "one architecture experiment only; no runtime edits in this package",
    "sameFrontierFallback": "If representative rolling-restart returns startup_active_gate_owner / snapshot_coverage / active_gate_timed_out with selected_snapshot_source_timeout, snapshotCoverageNodeCount=1/5, and owner queue pending write unchanged, stop local runtime work and open/select an autonomous architecture experiment.",
    "expectedNextFrontier": "selected retry-cadence/budget contract, selected-source owner recovery contract, migrated owner boundary, or architecture-gap stop",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-startup-readiness-admin-reachability-support.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "Allowed as a selected local proof because the predecessor classification package recorded fresh post-stale-cache evidence, zero priority-recovery residuals, selectedSnapshotAdminReady=true, selectedSnapshotReachableBy=admin_ws, alternativeSnapshotWitnessAvailable=true, and one selected owner queue pending write.",
    "handoffInvariant": "The selected-source runtime proof may retry, reconcile, or explicitly defer owner recovery, but it must not promote runtime coverage or mutate publication/readiness ownership while snapshot coverage remains incomplete."
  },
  "observablePrediction": {
    "metric": "selected_snapshot_source_timeout, snapshotCoverageNodeCount, and selectedControlPlaneOwnerQueuePendingWrites",
    "predicted": "The focused proof will demonstrate bounded selected-source owner-recovery progress; fresh representative evidence should clear selected_snapshot_source_timeout, raise snapshotCoverageNodeCount above 1/5, reduce or explicitly defer the single selected owner queue pending write, migrate the frontier, or pass rolling-restart.",
    "observed": "Fresh representative evidence remained same-frontier and selected H2: handoff required wait_owner_recovery, selectedControlPlaneOwnerQueuePendingWrites=1, requiredProgressMechanism=reconcile, selected_snapshot_source_timeout persisted, snapshotCoverageNodeCount stayed 1/5, active_gate_timeout exhausted at one attempt, and priority-recovery residuals stayed zero.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "metricDelta": 0
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "frontier returned to startup_active_gate_owner / snapshot_coverage after priority recovery residuals were cleared",
      "classification package preserved the fresh route instead of reopening stale readiness or operation workflow symptoms",
      "topology explain exposes a new bounded selected-source owner-recovery discriminator: admin_ws reachability, alternative witness, and one pending selected owner queue write"
    ],
    "selectedChoice": "open-architecture-experiment",
    "choices": [
      {
        "id": "continue-selected-source-owner-recovery-proof",
        "summary": "Continue local proof only if the experiment names one concrete retry, budget, owner-recovery, or selected-source contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
          "focused proof selected by this experiment"
        ]
      },
      {
        "id": "open-architecture-experiment",
        "summary": "Stop local runtime work if the selected proof cannot move selected-source owner-recovery evidence after representative rerun.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe"
        ]
      }
    ],
    "nextAction": "Open the autonomous active-gate snapshot coverage contract architecture experiment."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H4",
    "decision": "open-architecture-experiment",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage_contract_gap",
    "evidence": "npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "widen_architecture_work",
    "stopMode": "architecture-gap-stop",
    "nextLane": "experiment",
    "expectedDelta": "Autonomous architecture experiment names the missing active-gate snapshot coverage contract before any more same-frontier runtime work.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/packages/active-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns startup_active_gate_owner / snapshot_coverage because the selected evidence routes active_gate_timed_out there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Implement bounded wait_owner_recovery selected-source timeout progress using admin-reachable selected source and alternative witness evidence, then rerun rolling-restart. for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json; falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js; supporting: npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; supporting: npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js; supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js; npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Implement bounded wait_owner_recovery selected-source timeout progress using admin-reachable selected source and alternative witness evidence, then rerun rolling-restart..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement bounded wait_owner_recovery selected-source timeout progress using admin-reachable selected source and alternative witness evidence, then rerun rolling-restart. | Increase snapshotCoverageNodeCount above 1/5, drain or explicitly defer wait_owner_recovery owner queue, clear selected_snapshot_source_timeout, migrate owner/boundary, or pass rolling-restart. | falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`
- Success metrics: Increase snapshotCoverageNodeCount above 1/5, drain or explicitly defer wait_owner_recovery owner queue, clear selected_snapshot_source_timeout, migrate owner/boundary, or pass rolling-restart.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`
- Expected delta: Increase snapshotCoverageNodeCount above 1/5, drain or explicitly defer wait_owner_recovery owner queue, clear selected_snapshot_source_timeout, migrate owner/boundary, or pass rolling-restart.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. test/distributed/harness/cluster-segment-7-class-5.js
2. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
3. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
4. test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`, `supporting: npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `supporting: npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js`, `supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: work/packages/active-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: verified canonical route and handoff evidence on fresh artifact; parent revalidated focused proof: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair before closure; parent revalidated focused proof: yes; outcome: validated.

## Validation

1. falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
2. regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js
3. supporting: npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
4. supporting: npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js
5. supporting: npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json
7. npm run work:scenario-triage -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown
8. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-recovery-stale-cache-scheduling.report.json --markdown

## Commit And Push Ledger

1. Focused package commit: 9afa4d16bfb7adeb39c2253dd5abe800a5a0ebfa
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
