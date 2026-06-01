# Rolling Restart Reconcile Owner Membership Publication Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused proof and verifier-fixer validated the reconcile_owner_membership_publication runtime contract. Fresh rolling-restart evidence moved the package metric: pendingReconcileCount dropped from 1 to 0, publication convergence is ready, and the handoff moved to wait_owner_recovery with pendingRecoveryCount=1. The representative is still red on startup_active_gate_owner / snapshot_coverage with selected_snapshot_source_timeout and snapshot_repair_deferred evidence.",
  "nextAction": "Close this package as reduced and activate the startup_active_gate_owner / snapshot_coverage successor for wait_owner_recovery selected-source timeout recovery.",
  "stabilityCredit": "local-proof-only",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The causal-escalation predecessor selected this exact child after the selected retry-floor fix moved the representative. This package has one named owner action, one missing published node, and a frozen runtime-promotion invariant.",
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "work/packages/active-20260523-rolling-restart-reconcile-owner-membership-publication-runtime.md",
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
      "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof",
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
    "expectedDelta": "Make reconcile_owner_membership_publication bounded progress for pendingReconcileCount=1 and pendingReconcileNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Open the wait_owner_recovery selected-source timeout recovery successor."
  },
  "causalGovernance": {
    "hypothesis": "The selected child route is correct: startup active-gate snapshot coverage remains blocked because reconcile_owner_membership_publication is visible for one missing published node but does not make bounded progress before active-gate budgets exhaust.",
    "stopConditionCheck": "Run focused contract fixture and affected consumer proof, static guardrails, npm --silent run analyze:causal-model on the fresh representative, and a fresh rolling-restart rerun before closure.",
    "expectedCausalModelChange": "Focused proof should show reconcile_owner_membership_publication produces bounded progress or explicit defer; fresh representative should increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence moved pendingReconcileCount from 1 to 0 and publication convergence to ready, then exposed wait_owner_recovery for pendingRecoveryCount=1. The remaining blocker is startup_active_gate_owner / snapshot_coverage with snapshotCoverageNodeCount=0/5, activeNodeCount=4/5, selectedSnapshotError='Admin API query timed out for node 11601fe0-72d6-5853-8590-ec2881853e72 on lane snapshot after 100ms', selectedSnapshotObservation=repair_deferred/deferred_refresh/deferred/deferred/retry, selectedSnapshotObservationRetryAfterMs=100, and active_gate_timeout exhausted.",
    "crossBoundaryReview": "Keep selected-source retry floors, publication convergence, priority recovery, readiness support, runtime promotion, and product/scenario timeout ceilings frozen; this child only implements the selected reconcile_owner_membership_publication bounded progress contract."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after causal-escalation selected reconcile_owner_membership_publication",
    "phaseChain": [
      "selected-source retry floor proof passed",
      "snapshotCoverageNodeCount increased to 2/5",
      "activeNodeCount increased to 4/5",
      "causal-escalation selected continue-local-proof for reconcile_owner_membership_publication",
      "runtime promotion remains false while coverage is incomplete"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "load-readiness is not reached",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "reconcile_owner_membership_publication must produce bounded progress, explicit defer, or owner outcome for the remaining missing published node.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof",
    "boundedProgressProof": "Focused proof must show reconcile_owner_membership_publication bounded progress, retry/defer, or drain/advance behavior for pendingReconcileCount=1.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json",
    "expectedObservableTransition": "Observed: pendingReconcileCount decreased from 1 to 0, publication convergence became ready, and the handoff moved to wait_owner_recovery with pendingRecoveryCount=1. Rolling-restart remains red on selected snapshot timeout and repair-deferred snapshot coverage.",
    "maxProgressBound": "one selected reconcile_owner_membership_publication runtime contract; no timeout widening and no runtime promotion while coverage is incomplete",
    "sameFrontierFallback": "If fresh evidence remains same-frontier with no metric movement, stop for architecture-gap instead of another adjacent runtime patch.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage / wait_owner_recovery selected-source timeout recovery",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-snapshot-coverage-owner-reconcile-membership-publication / causal-escalation / selected continue-local-proof",
      "done-20260523-rolling-restart-selected-snapshot-late-retry-floor-contract / selected_snapshot_late_retry_floor_contract / reduced",
      "done-20260523-rolling-restart-owner-recovery-reconcile-architecture-experiment / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor was causal-escalation and selected this concrete child route.",
    "handoffInvariant": "reconcile_owner_membership_publication may not imply readiness or runtime promotion until snapshot coverage completes."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Predecessor causal-escalation selected continue-local-proof for reconcile_owner_membership_publication.",
      "The child has one pending reconcile node and runtimePromotionAllowed=false.",
      "Canonical evidence moved from selected retry timeout to snapshot_coverage with pendingReconcileCount=1."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the selected reconcile_owner_membership_publication bounded progress contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use only if focused proof contradicts the selected child route.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json"
        ]
      }
    ],
    "nextAction": "Implement the selected local proof."
  },
  "observablePrediction": {
    "metric": "pendingReconcileCount, pendingReconcileNodeIds, snapshotCoverageNodeCount, selectedSnapshotObservation mode/state/nextAction, route owner/boundary, and rolling-restart result",
    "predicted": "Focused proof will make reconcile_owner_membership_publication bounded progress or explicit defer visible; fresh representative will reduce pendingReconcileCount, increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass.",
    "observed": "pendingReconcileCount=0, pendingRecoveryCount=1, handoff nextAction=wait_owner_recovery, publication convergence ready, snapshotCoverageNodeCount=0/5, rolling-restart still failed.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json"
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

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json; npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof; npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js; npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js; npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js; node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement the selected reconcile_owner_membership_publication runtime contract for startup active-gate snapshot coverage. | Make reconcile_owner_membership_publication bounded progress for pendingReconcileCount=1 and pendingReconcileNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes. | npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof`
- Success metrics: Make reconcile_owner_membership_publication bounded progress for pendingReconcileCount=1 and pendingReconcileNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`
- Expected delta: Make reconcile_owner_membership_publication bounded progress for pendingReconcileCount=1 and pendingReconcileNodeIds=[11601fe0-72d6-5853-8590-ec2881853e72], increase snapshotCoverageNodeCount beyond 2/5, migrate owner/boundary, or pass rolling-restart while runtimePromotionAllowed remains false until coverage completes.
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

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/cluster-segment-7-class-5.js
3. test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js
4. test/distributed/harness/__tests__/cluster.test-part-4.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`, `test/distributed/harness/__tests__/cluster.test-part-4.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof`, `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js`, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js`, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown`
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

- [x] implementation: status: validated; evidence: focused proof passed locally (`npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js`, 39/39), static guardrails passed (`audit:guideline:literals`, `audit:guideline:decision-boundaries`, `audit:runtime-grammar:file` over package runtime/test files), and representative rerun `test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json` failed with movement (`pendingReconcileCount=0`, `pendingRecoveryCount=1`, `nextAction=wait_owner_recovery`); parent revalidated focused proof: yes; next: close reduced and open successor action.
- [x] verification-fix-falsification: status: validated; wrong-slice evidence would be owner/boundary migration away from startup_active_gate_owner/snapshot_coverage or required edits outside write scope; evidence: `npm run work:package:doctor -- --suggest work/packages/active-20260523-rolling-restart-reconcile-owner-membership-publication-runtime.md` (validation ok), `npm run work:validate -- --pre-impl work/packages/active-20260523-rolling-restart-reconcile-owner-membership-publication-runtime.md` (ok), focused proof and static guardrails passed; changed files: none; parent revalidated focused proof: yes; next: validated verification-fix evidence.
- [x] verification-fix: status: validated; evidence: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` passed (39/39), `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js` passed (0 new), `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js` passed, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js` passed, `git diff --check -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js work/packages/active-20260523-rolling-restart-reconcile-owner-membership-publication-runtime.md work/sprints/current-blocker.md work/sprints/current-blocker.json` passed; changed files: work/packages/active-20260523-rolling-restart-reconcile-owner-membership-publication-runtime.md; parent revalidated focused proof: yes; next: closure or successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after package status changed to done; next: closure validation.

## Validation

1. npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused contract fixture and affected consumer proof
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-5.js
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --fast-local --verbose
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json
7. npm run work:scenario-triage -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown
8. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-selected-snapshot-late-retry-floor-contract-20260523T004025Z.report.json --markdown
