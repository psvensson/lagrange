# Rolling Restart Selected Snapshot Late Retry Floor Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "selected_snapshot_late_retry_floor_contract",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused proof preserves the late selected-source retry floor at 100ms. Fresh rolling-restart evidence moved snapshotCoverageNodeCount from 0/5 to 2/5 and active nodes from 0/5 to 4/5, then routed the remaining active_gate_snapshot_coverage blocker to snapshot_coverage with reconcile_owner_membership_publication required for one missing published node.",
  "nextAction": "Close this package as reduced/migrated and activate a startup_active_gate_owner / snapshot_coverage successor for the reconcile_owner_membership_publication edge.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The last architecture experiment selected this bounded retry-floor contract after raw report progress showed no selected queue/outcome fields and the causal model kept active_gate_timeout and active_gate_attempts exhausted. The selected snapshot retry floor is the smallest runtime contract expected to move the concrete representative metric selectedSnapshotObservationRetryAfterMs away from 50ms without widening scenario timeouts or allowing degraded runtime promotion.",
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
    "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
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
    "work/packages/active-20260523-rolling-restart-selected-snapshot-late-retry-floor-contract.md",
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
  "boundedExperiment": {
    "hypothesis": "The active-gate selected-source retry contract halves the late probe floor from 100ms to 50ms when the first selected snapshot query times out near the deadline; preserving the late floor gives the selected source a meaningful bounded retry without widening product timeouts.",
    "hypothesisDiscriminator": "H1 is supported if a focused fixture fails before the fix with selectedSnapshotObservationRetryAfterMs=50 and passes after preserving the late floor at 100ms; representative evidence then increases retryAfterMs, increases snapshotCoverageNodeCount, migrates owner/boundary, or passes. H2 is supported if retryAfterMs increases but representative stays no-movement same-frontier, requiring a new architecture result.",
    "expectedMetric": "selectedSnapshotObservationRetryAfterMs, selectedSnapshotTimeoutMs, snapshotCoverageNodeCount, active_gate_attempts budget state, and rolling-restart route",
    "inheritsFrom": "work/packages/done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment.md",
    "timebox": "24h",
    "mergeRequirement": "focused retry-floor fixture plus static guardrails and fresh representative route",
    "killRule": "If fresh representative evidence keeps retryAfterMs=50 or stays same-frontier with no metric movement, stop for an autonomous architecture experiment instead of another adjacent runtime patch."
  },
  "validationTier": "cross-owner",
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open a startup_active_gate_owner / snapshot_coverage successor for reconcile_owner_membership_publication."
  },
  "causalGovernance": {
    "hypothesis": "The selected snapshot retry contract halves the late active-gate probe floor from 100ms to 50ms after a selected-source timeout, leaving the terminal representative evidence with an avoidable 50ms retry window.",
    "stopConditionCheck": "Run the focused retry-floor fixture, static guardrails, npm run analyze:causal-model on the fresh representative, then rerun rolling-restart and classify the fresh representative with canonical evidence before closure.",
    "expectedCausalModelChange": "The focused proof should preserve the late retry floor at 100ms; the fresh representative should increase selectedSnapshotObservationRetryAfterMs, increase snapshotCoverageNodeCount, migrate owner/boundary, or pass rolling-restart.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence now has snapshotCoverage=2/5, activeNodeCount=4/5, selectedSnapshotTimeoutMs=100, selectedSnapshotObservationMode=scheduled_repair, selectedSnapshotObservationState=stale_usable, selectedSnapshotObservationNextAction=wait, pendingReconcileCount=1, and publicationActiveGateHandoffNextAction=reconcile_owner_membership_publication. The active_gate_timeout and active_gate_attempts budgets are still exhausted.",
    "crossBoundaryReview": "Keep publication convergence, priority recovery, readiness support semantics, runtime promotion safety, and product/scenario timeout ceilings frozen; this package only changes selected-source retry budget selection inside the active-gate snapshot coverage probe."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after selected_snapshot_late_retry_floor_contract architecture selection",
    "phaseChain": [
      "publication convergence is satisfied",
      "priority recovery residuals are absent",
      "active-gate probe ordering focused proof passed",
      "focused proof preserves the selected-source late retry floor at 100ms",
      "fresh representative moves snapshotCoverageNodeCount to 2/5 and activeNodeCount to 4/5",
      "fresh representative exposes reconcile_owner_membership_publication for one missing published node"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Snapshot coverage now requires the startup active-gate owner to make reconcile_owner_membership_publication progress for the remaining missing published node instead of waiting on the stale scheduled-repair observation.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js",
    "boundedProgressProof": "Focused proof must fail before the fix with late retry collapsing below the 100ms floor and pass after preserving the late retry floor.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json",
    "expectedObservableTransition": "Observed: selected timeout evidence moved from the 50ms retry path to a 100ms scheduled-repair/stale_usable observation, snapshotCoverageNodeCount increased from 0/5 to 2/5, and the next owner action is reconcile_owner_membership_publication.",
    "maxProgressBound": "one selected-source retry floor change; no scenario timeout widening and no runtime promotion while coverage is incomplete",
    "sameFrontierFallback": "If fresh evidence keeps retryAfterMs=50 or remains same-frontier with no metric movement, stop for an autonomous architecture experiment instead of another adjacent runtime patch.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage / reconcile_owner_membership_publication",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260522-rolling-restart-active-gate-probe-budget-contract / startup_active_gate_owner / active_gate_probe_budget_contract / same-frontier",
      "done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment / startup_active_gate_owner / selected_snapshot_late_retry_floor_contract / migrated"
    ],
    "oscillationCheck": "fresh same-frontier/no-movement evidence selected a concrete retry-floor metric contract before another runtime patch",
    "handoffInvariant": "Retry-floor movement must not be interpreted as readiness, publication, or promotion success while snapshot coverage remains incomplete."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The previous architecture experiment selected selected_snapshot_late_retry_floor_contract after raw direct progress showed retryAfterMs=50.",
      "The focused metric is concrete and owner-local: selectedSnapshotObservationRetryAfterMs.",
      "Runtime promotion remains false while snapshot coverage is incomplete."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the selected late retry floor contract with focused fixture and affected consumer proof.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use only if focused proof or representative evidence contradicts the selected retry-floor contract.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json"
        ]
      }
    ],
    "nextAction": "Implement the selected local proof and rerun rolling-restart."
  },
  "observablePrediction": {
    "metric": "selectedSnapshotObservationRetryAfterMs, selectedSnapshotTimeoutMs, snapshotCoverageNodeCount, route owner/boundary, and rolling-restart result",
    "predicted": "Focused proof will preserve late selected-source retry at the 100ms floor instead of 50ms; fresh representative will either increase selectedSnapshotObservationRetryAfterMs, increase snapshotCoverageNodeCount, migrate owner/boundary, or pass.",
    "observed": "Focused proof preserves the late selected-source retry floor at 100ms. Fresh rolling-restart evidence increased snapshotCoverageNodeCount from 0/5 to 2/5 and moved selected evidence to scheduled_repair/stale_usable with reconcile_owner_membership_publication required.",
    "accuracy": "partial",
    "evidence": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
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
      "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Successor must move pendingReconcileCount=1 / reconcile_owner_membership_publication for the remaining missing published node while runtimePromotionAllowed remains false until snapshot coverage completes.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "selected_snapshot_late_retry_floor_contract",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Focused proof preserved the selected-source late retry floor and fresh representative evidence moved out of the selected retry-floor contract: selectedSnapshotTimeoutMs is 100, snapshotCoverageNodeCount improved from 0/5 to 2/5, activeNodeCount improved to 4/5, and the remaining canonical first frontier is startup_active_gate_owner / snapshot_coverage with reconcile_owner_membership_publication required.",
    "evidence": [
      "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
    ]
  }
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

- Canonical outcome: startup_active_gate_owner / selected_snapshot_late_retry_floor_contract emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json.
- State model or invariant: The startup_active_gate_owner / selected_snapshot_late_retry_floor_contract decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / selected_snapshot_late_retry_floor_contract invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / selected_snapshot_late_retry_floor_contract / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Preserve the late active-gate selected-source retry floor so startup retry evidence does not collapse from the 100ms late probe floor to a 50ms retry before snapshot coverage can observe. | Selected-source retry preserves the late active-gate timeout floor instead of halving it to 50ms; fresh representative increases selectedSnapshotObservationRetryAfterMs, increases snapshotCoverageNodeCount, migrates owner/boundary, or passes rolling-restart. | npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / selected_snapshot_late_retry_floor_contract directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / selected_snapshot_late_retry_floor_contract still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js`
- Success metrics: Selected-source retry preserves the late active-gate timeout floor instead of halving it to 50ms; fresh representative increases selectedSnapshotObservationRetryAfterMs, increases snapshotCoverageNodeCount, migrates owner/boundary, or passes rolling-restart.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: The active-gate selected-source retry contract halves the late probe floor from 100ms to 50ms when the first selected snapshot query times out near the deadline; preserving the late floor gives the selected source a meaningful bounded retry without widening product timeouts.
- Hypothesis discriminator: H1 is supported if a focused fixture fails before the fix with selectedSnapshotObservationRetryAfterMs=50 and passes after preserving the late floor at 100ms; representative evidence then increases retryAfterMs, increases snapshotCoverageNodeCount, migrates owner/boundary, or passes. H2 is supported if retryAfterMs increases but representative stays no-movement same-frontier, requiring a new architecture result.
- Expected metric: selectedSnapshotObservationRetryAfterMs, selectedSnapshotTimeoutMs, snapshotCoverageNodeCount, active_gate_attempts budget state, and rolling-restart route
- Inherits from: `work/packages/done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused retry-floor fixture plus static guardrails and fresh representative route
- Kill rule: If fresh representative evidence keeps retryAfterMs=50 or stays same-frontier with no metric movement, stop for an autonomous architecture experiment instead of another adjacent runtime patch.
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-probe-budget-contract-20260523T001244Z.report.json`
- Expected delta: Selected-source retry preserves the late active-gate timeout floor instead of halving it to 50ms; fresh representative increases selectedSnapshotObservationRetryAfterMs, increases snapshotCoverageNodeCount, migrates owner/boundary, or passes rolling-restart.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`
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

1. test/distributed/harness/cluster-segment-7-class-5.js
2. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`
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

- [x] implementation: status: validated; evidence: focused regression failed before runtime fix on `STARTUP_RETRY_LATE_TIMEOUT_FLOOR`; after fix `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` passed 39/39, static guardrails passed, and rolling-restart representative `test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json` moved snapshotCoverageNodeCount to 2/5 with selectedSnapshotTimeoutMs=100; parent revalidated focused proof: yes; next: closure and successor action.
- [x] verification-fix: status: validated; evidence: Lovelace verifier-fixer inspected scoped diffs, changed no files, reran focused proof 39/39, literal audit, decision-boundary audit, runtime-grammar audit, and `git diff --check` successfully; changed files: none; parent revalidated focused proof: yes; next: closure and successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card before implementation; next: closure validation after successor activation.

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --fast-local --verbose
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json
7. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --handoff-probe
8. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json
