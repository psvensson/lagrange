# Priority Recovery Deadlock Triage

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-26",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Scaffolded from representative evidence for priority_recovery_partition_progress.",
    "nextAction": "Triage rebalancer target selection and blocker filters to identify why priority recovery operations are not created."
  },
  "scope": {
    "writeScope": [
      "src/control-plane/pressure-governor.js",
      "src/rebalancer/operation-workflow-dispatch-rearm-evidence.js",
      "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
      "src/rebalancer/operation-workflow-transition-retry-grace.js",
      "test/control-plane/pressure-governor.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/control-plane/pressure-governor.js"
    ],
    "commitScope": [
      "work/packages/active-20260526-rolling-restart-priority-recovery-deadlock-triage.md",
      "src/control-plane/pressure-governor.js",
      "work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md",
      "src/rebalancer/operation-workflow-dispatch-rearm-evidence.js",
      "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
      "src/rebalancer/operation-workflow-transition-retry-grace.js",
      "test/control-plane/pressure-governor.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "causal-escalation",
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
      "theory-20260526-rolling-restart-logger-cpu-starvation",
      "theory-20260526-rolling-restart-seed-websocket-cleanup",
      "theory-20260526-rolling-restart-rebalancer-outbound-saturation"
    ],
    "proof": {
      "commands": [
        "falsifier: contract transition operation_workflow_owner workflow_progress priority_recovery_event_driven_wait npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json",
        "regression: contract transition operation_workflow_owner workflow_progress priority_recovery_event_driven_wait npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
        "supporting: contract transition operation_workflow_owner workflow_progress priority_recovery_event_driven_wait npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown"
      ]
    }
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Triage the priority recovery event-driven wait via logger CPU rate limiting.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "Update Sprint Strategy Brief from the route result.",
      "Update Current Edge Card from the route result.",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "observablePrediction": {
    "metric": "bootstrap_joining",
    "predicted": "restarted nodes successfully contact the seed node during bootstrap joining without CPU starvation",
    "observed": "restarted nodes successfully contact the seed node during bootstrap joining without CPU starvation",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "metricDelta": 0
  },
  "representativeResidual": {
    "status": "active",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Triage rebalancer target selection and blocker filters to identify why priority recovery operations are not created."
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and do-not-edit scope are named",
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "causalGovernance": {
    "hypothesis": "The priority recovery event-driven wait is due to target readiness or budget filtering in unified rebalancer planning.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "expectedCausalModelChange": "A confirmed triage or classification makes priority recovery progress, transitioning to green, reduced, or migrated.",
    "representativeOutcome": "representative-green",
    "causalDebt": "No accumulated causal debt for this triage concern.",
    "crossBoundaryReview": "Review with rebalancer owner if backpressure persists after triage."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart post-diagnostics artifact test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "phaseChain": [
      "previous diagnostics fix populated active-gate snapshot coverage evidence",
      "fresh representative rerun migrated to operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "priorityRecoveryResiduals witnessCount=5 with splitRequired=true",
      "priority recovery reports eligible_but_no_operation_created and needs_operation/recovering_in_flight"
    ],
    "missingCausalEdge": "Which operation workflow or rebalancer edge owns priority_recovery_event_driven_wait after diagnostics evidence is complete.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json",
    "falsifyingProbe": "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "boundedProgressProof": "triage dispatch/delivery path to resolve event-driven wait via wake or retry",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json",
    "expectedObservableTransition": "priority recovery event-driven wait reduction, owner-boundary split, or representative green.",
    "maxProgressBound": "one diagnostic-classification package and one representative rerun",
    "sameFrontierFallback": "If successor rerun stays on priority_recovery_event_driven_wait, split the operation workflow/rebalancer owner boundary instead of patching startup active-gate.",
    "expectedNextFrontier": "representative-green, reduced priority recovery residual, or split successor owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait"
    ],
    "oscillationCheck": "This package is allowed because the prior representative rerun migrated owner boundary.",
    "handoffInvariant": "Owners decide admin readiness, bootstrap recovery readiness, and active-gate admission; diagnostics and harness evidence may observe but must not override owner outcomes."
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: Bounded runtime edits inside `PressureGovernor.emitPressureMetric` are required to fix logger starvation issues without altering core rebalancer operations.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: `operation_workflow_owner / workflow_progress` is green.
- Inputs/signals: High backpressure stdout metrics logging.
- State model or invariant: rate limit logger metrics to prevent thread pool starvation.
- Non-goals and forbidden interpretations: Do not alter control plane state machine transitions or bootstrap protocols.
- Proof mapping: Verify control plane and query test suites pass successfully.
- Wrong-slice trigger: Stop or split if rebalancer operations are impacted.





## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
- Next lane: `diagnostic-classification`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `diagnostic-classification`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `diagnostic-owner-evidence/current-artifact`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:advance -- --check`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: bounded local edit after owner, scope, proof, and do-not-edit scope are named
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: operation_workflow_owner; files-changed: src/control-plane/pressure-governor.js; validation: node --test test/control-plane/pressure-governor.test.js and parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: test/control-plane/pressure-governor.test.js; validation: node --test test/control-plane/pressure-governor.test.js and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. `git diff --check -- <files>`

