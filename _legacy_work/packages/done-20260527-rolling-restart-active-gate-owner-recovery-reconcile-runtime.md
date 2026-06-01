# Rolling Restart Active Gate Owner Recovery Reconcile Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "selected_source_owner_recovery_reconcile",
    "dominantReason": "active_gate_timed_out",
    "currentState": "Representative evidence selects startup_active_gate_owner / snapshot_coverage at active_gate_snapshot_coverage; the package records the bounded next decision before runtime edits.",
    "nextAction": "Implement the selected-source owner-recovery reconcile progress contract so bounded owner queue writes can wake or rearm active-gate snapshot coverage before terminal timeout.",
    "closed": "2026-05-27"
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md",
      "work/packages/active-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
      "test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md",
      "work/packages/active-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
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
      "theory-20260526-rolling-restart-selected-snapshot-source-staleness",
      "theory-20260526-rolling-restart-selected-view-best-view-evidence-gap",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap",
      "theory-20260522-snapshot-watch-handoff-contract"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js # focused contract fixture for selected_source_owner_recovery_reconcile contract transition",
        "regression: npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js # affected consumer proof for active-gate owner recovery handoff",
        "representative: npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json # representative routing evidence"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/packages/active-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md",
        "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json",
        "test/distributed/harness/cluster-segment-7-class-5.js",
        "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
        "test/distributed/harness/cluster-control-snapshot-recovery.js",
        "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
        "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "boundedExperiment": {
    "hypothesis": "Selected-source owner recovery is stuck because the active gate records owner queue pending writes and write_deferred handoff but does not perform a bounded reconcile/wake before the selected snapshot retry consumes the active gate budget.",
    "hypothesisDiscriminator": "H1 selected if focused tests show pending owner queue writes trigger a bounded reconcile/wake and representative evidence reduces selected_snapshot_source_timeout or queue pending writes; H2 if retry cadence remains the actual blocker; H3 if alternative witness selection owns progress.",
    "expectedMetric": "selectedControlPlaneOwnerQueuePendingWrites, membershipPublicationHandoffOutcome, requiredProgressMechanism, activeGate attempts, selectedSnapshotObservationRetryAfterMs, snapshotCoverageNodeCount, route owner/boundary",
    "inheritsFrom": "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md",
    "timebox": "24h",
    "mergeRequirement": "focused owner-recovery tests, runtime guardrails, and representative rolling-restart route-after-rerun",
    "killRule": "If focused proof cannot move owner-recovery reconcile state without changing publication/readiness ownership, stop and open an architecture-gap or migration package."
  },
  "validationTier": "cross-owner",
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
    "hypothesis": "Selected-source owner recovery is stuck because active-gate snapshot coverage records owner queue pending writes and write_deferred handoff but does not perform a bounded reconcile/wake before selected snapshot retry consumes the active gate budget.",
    "stopConditionCheck": "Run npm run analyze:causal-model on test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json before implementation, then rerun representative rolling-restart and route the fresh artifact after focused proof.",
    "expectedCausalModelChange": "Owner-recovery reconcile progress clears or reduces selected_snapshot_source_timeout, drains or explicitly defers selectedControlPlaneOwnerQueuePendingWrites, raises snapshotCoverageNodeCount, migrates the frontier, or makes rolling-restart green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Fresh handoff evidence selected H2: requiredProgressMechanism=reconcile, selectedControlPlaneOwnerQueuePendingWrites=1, handoffOutcome=write_deferred, pendingRecoveryCount=1, activeGate attempts=1/8, selectedSnapshotObservationRetryAfterMs=15000, and zero priority-recovery residuals.",
    "crossBoundaryReview": "Do not change publication, readiness, operation workflow, diagnostics capture, or timeout budgets; this package may only change startup_active_gate_owner snapshot coverage owner-recovery reconcile behavior and affected tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart selected-source owner-recovery reconcile runtime",
    "phaseChain": [
      "fresh representative route stays active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
      "architecture experiment selected H2 owner-recovery reconcile from handoff evidence",
      "selected snapshot source times out with repair_deferred retryAfterMs=15000 while owner queue pending writes remain bounded at one",
      "this package implements the local reconcile/wake contract and then reruns rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / selected_source_owner_recovery_reconcile / active_gate_timed_out (source route: snapshot_coverage)",
    "knownDownstreamBlockers": [
      "startup readiness remains inherited downstream of active-gate snapshot coverage",
      "priority recovery residual witnesses remain zero"
    ],
    "missingCausalEdge": "Bounded selected-source owner recovery reconcile progress does not wake or rearm active-gate snapshot coverage before terminal timeout.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --handoff-probe",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
    "boundedProgressProof": "Focused tests must prove owner queue pending writes trigger bounded reconcile/wake or explicit deferral without publication/readiness ownership changes.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "expectedObservableTransition": "selectedControlPlaneOwnerQueuePendingWrites drains or is explicitly deferred, selected_snapshot_source_timeout clears or reduces, snapshotCoverageNodeCount rises above 1/5, the frontier migrates, or rolling-restart passes.",
    "maxProgressBound": "one runtime-owner-boundary package; no publication/readiness ownership changes",
    "sameFrontierFallback": "If representative rerun remains same-frontier with no owner-recovery metric movement, stop for architecture-gap or route migration instead of another adjacent runtime patch.",
    "expectedNextFrontier": "representative-green, reduced active-gate snapshot coverage, migrated frontier, or architecture-gap stop",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-active-gate-wait-owner-recovery-selected-source-runtime.md / architecture experiment / H4 architecture gate",
      "done-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md / architecture experiment / H2 owner-recovery reconcile selected"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor was an autonomous architecture experiment that selected this concrete runtime route.",
    "handoffInvariant": "Owner recovery reconcile may wake/retry/defer active-gate snapshot coverage but must not promote runtime coverage while snapshot coverage is incomplete."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "architecture predecessor selected H2 owner-recovery reconcile",
      "topology handoff reports requiredProgressMechanism=reconcile and selectedControlPlaneOwnerQueuePendingWrites=1",
      "runtimePromotionAllowed remains false while snapshot coverage is incomplete"
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement bounded selected-source owner-recovery reconcile progress in startup active-gate snapshot coverage.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Use only if focused proof cannot move owner-recovery reconcile state within this owner boundary.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json"
        ]
      }
    ],
    "nextAction": "Implement the selected local proof."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "selected_source_owner_recovery_reconcile",
    "reason": "The autonomous architecture predecessor selected the concrete H2 owner-recovery reconcile contract after the same snapshot_coverage frontier repeated without metric reduction.",
    "evidence": "work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md; topology handoff requiredProgressMechanism=reconcile; selectedControlPlaneOwnerQueuePendingWrites=1; handoffOutcome=write_deferred"
  },
  "observablePrediction": {
    "metric": "selectedControlPlaneOwnerQueuePendingWrites, membershipPublicationHandoffOutcome, requiredProgressMechanism, activeGate attempts, selectedSnapshotObservationRetryAfterMs, snapshotCoverageNodeCount, and route owner/boundary",
    "predicted": "Focused proof and representative rerun show owner-recovery reconcile progress: pending writes drain or explicitly defer, selected snapshot timeout reduces, snapshot coverage rises, frontier migrates, or rolling-restart passes.",
    "observed": "focused proof green; representative rerun cleared active_gate_timed_out and moved causal output to migrate_owner_boundary while remaining red on snapshot_coverage_incomplete/table visibility",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json",
    "metricDelta": 1
  },
  "requiredPreImplProbe": {
    "command": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js # focused contract fixture for selected_source_owner_recovery_reconcile contract transition",
    "artifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "reason": "Focused tests must fail or expose the selected-source owner-recovery reconcile contract before runtime edits."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Selected-source owner-recovery reconcile progress clears or reduces selected_snapshot_source_timeout, reduces owner queue pending write evidence, increases snapshotCoverageNodeCount above 1/5, migrates the frontier, or makes rolling-restart green.",
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
      "work/packages/active-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js"
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

Canonical evidence source: `test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits Implement the selected-source owner-recovery reconcile progress contract so bounded owner queue writes can wake or rearm active-gate snapshot coverage before terminal timeout. for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: Implement the selected-source owner-recovery reconcile progress contract so bounded owner queue writes can wake or rearm active-gate snapshot coverage before terminal timeout..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the selected-source owner-recovery reconcile progress contract so bounded owner queue writes can wake or rearm active-gate snapshot coverage before terminal timeout. | Selected-source owner-recovery reconcile progress clears or reduces selected_snapshot_source_timeout, reduces owner queue pending write evidence, increases snapshotCoverageNodeCount above 1/5, migrates the frontier, or makes rolling-restart green. | npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`
- Success metrics: Selected-source owner-recovery reconcile progress clears or reduces selected_snapshot_source_timeout, reduces owner queue pending write evidence, increases snapshotCoverageNodeCount above 1/5, migrates the frontier, or makes rolling-restart green.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: Selected-source owner recovery is stuck because the active gate records owner queue pending writes and write_deferred handoff but does not perform a bounded reconcile/wake before the selected snapshot retry consumes the active gate budget.
- Hypothesis discriminator: H1 selected if focused tests show pending owner queue writes trigger a bounded reconcile/wake and representative evidence reduces selected_snapshot_source_timeout or queue pending writes; H2 if retry cadence remains the actual blocker; H3 if alternative witness selection owns progress.
- Expected metric: selectedControlPlaneOwnerQueuePendingWrites, membershipPublicationHandoffOutcome, requiredProgressMechanism, activeGate attempts, selectedSnapshotObservationRetryAfterMs, snapshotCoverageNodeCount, route owner/boundary
- Inherits from: `work/packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-contract-architecture.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused owner-recovery tests, runtime guardrails, and representative rolling-restart route-after-rerun
- Kill rule: If focused proof cannot move owner-recovery reconcile state without changing publication/readiness ownership, stop and open an architecture-gap or migration package.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`
- Expected delta: Selected-source owner-recovery reconcile progress clears or reduces selected_snapshot_source_timeout, reduces owner queue pending write evidence, increases snapshotCoverageNodeCount above 1/5, migrates the frontier, or makes rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/todo-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md
2. work/packages/active-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md
3. work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. test/distributed/harness/cluster-segment-7-class-5.js
7. test/distributed/harness/cluster-control-snapshot-recovery.js
8. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js
9. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
10. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js
11. test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md`, `work/packages/active-20260527-rolling-restart-active-gate-owner-recovery-reconcile-runtime.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/cluster-control-snapshot-recovery.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`, `test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown`
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

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: test/distributed/harness/cluster-control-snapshot-recovery.js, test/distributed/harness/cluster-segment-7-class-5.js, test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js, test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js, test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js, test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js; validation: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: none after verification; validation: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js test/distributed/harness/__tests__/cluster-active-gate-startup-owner-handoff-test-cases.js test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js passed; npm test -- test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster-active-gate-admin-probe-timeout-projection.test.js passed; git diff --check -- package scope passed; representative test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json failed later with causal migrate_owner_boundary after active_gate_timed_out cleared; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair passed; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: e6793b73e3445092c5d20cec65b2fdd9d7288714
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-theory-loop-resume-20260527T202818Z.report.json --markdown
