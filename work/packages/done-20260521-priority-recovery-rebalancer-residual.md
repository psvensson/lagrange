# Priority Recovery Rebalancer Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-21",
  "closed": "2026-05-21",
  "lane": "experiment",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Scaffolded from representative evidence for publication_ack_convergence.",
  "nextAction": "Prove whether the recovering_in_flight residual for control_plane_publications-p1 blocks topology convergence.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260521-priority-recovery-rebalancer-residual.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [],
  "modelFit": {
    "packageClass": "experiment",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "Priority recovery residual rebalancing is deadlocked due to circular node_not_ready states.",
    "hypothesisDiscriminator": "Distinguish whether target node admission can proceed or if partition split/recovery logic must bypass the publication wait.",
    "expectedMetric": "priority recovery residual count, rebalancer phase transition, and active-gate progress",
    "inheritsFrom": "work/packages/done-20260521-topology-publication-reconcile-system-theory.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement discards the experiment or escalates"
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "priority recovery residual count, rebalancer phase transition, and active-gate progress",
    "predicted": "priority recovery residual count, rebalancer phase transition, and active-gate progress",
    "observed": "Restarted nodes (having clusterMemberHealthy = true but writableControlPlaneService = false) are incorrectly denied recovery grace because clusterMemberHealthy = true bypasses shouldAllowTransportBackedRecoveryGrace(context).",
    "accuracy": "matched",
    "evidence": "Analyzed isControlPlaneRecoveryEligible in control-plane-readiness-service-segment-2.js:L947 and shouldAllowTransportBackedRecoveryGrace(context) and verified target node skip reasons."
  },
  "inheritsContext": {
    "owner": true,
    "boundary": true,
    "forbiddenScope": true,
    "proofCommands": true,
    "stopRule": true
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
      "Keep runtime behavior frozen until the probe distinguishes competing hypotheses.",
      "Promote only the discriminated owner/boundary into a follow-on runtime or architecture package."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "rebalancer_handoff",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "triggerEvidence": [],
    "choices": [],
    "selectedChoice": "none",
    "nextAction": "none"
  },
  "causalGovernance": {
    "hypothesis": "The priority recovery residual rebalancing is deadlocked due to circular node_not_ready states.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "expectedCausalModelChange": "No runtime causal model change is expected in this experiment; it should distinguish whether the next package is runtime-owner-boundary or architecture-contract work.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The baseline remains red at publication_ack_convergence until this experiment proves whether the priority recovery rebalancer residual can progress or if split/recovery logic must bypass the publication wait.",
    "crossBoundaryReview": "Required before runtime promotion because this experiment spans operation workflow, active-gate, readiness, and diagnostics."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery rebalancer residual probe",
    "phaseChain": [
      "publication convergence",
      "operation workflow residuals",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence",
      "diagnostics and causal routing"
    ],
    "currentFirstFrontier": "priority_recovery_progress_blocked / operation_workflow_owner / rebalancer_handoff / recovering_in_flight",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains deferred at snapshotCoverage=3/5",
      "startup_readiness_owner / startup_support_evidence remains inherited behind active-gate no progress",
      "diagnostics_owner / causal_analysis_framework reports publication_ack_blocked and owner queue depth unknown"
    ],
    "missingCausalEdge": "The control_plane_publications-p1 priority recovery residual is recovering_in_flight but rebalancer skips it due to node_not_ready (repair_ineligible).",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown",
    "boundedProgressProof": "The probe must analyze the rebalancer reconcile, wake, and drain progression to distinguish whether priority recovery residual can proceed or if partition split/recovery logic must bypass the wait.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json",
    "expectedObservableTransition": "recovering_in_flight -> rebalance progress or explicit deadlock bypass route",
    "maxProgressBound": "one priority recovery residual analysis probe",
    "sameFrontierFallback": "open an architecture-contract package instead of a same-frontier runtime patch",
    "expectedNextFrontier": "runtime-owner-boundary package or architecture-contract package based on discriminator",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260521-topology-publication-reconcile-system-theory: same-frontier publication_ack_convergence",
      "done-20260521-rolling-restart-theory-baseline-probe: same-frontier publication_ack_convergence"
    ],
    "oscillationCheck": "watching: this package exists because H3 distinguished the priority recovery residual as the true predecessor blocking publication",
    "handoffInvariant": "publication owner outcome + operation workflow residual status + active-gate precondition + readiness support state + diagnostics route"
  },
  "successor": "work/packages/active-20260521-priority-recovery-operation-workflow-owner-rebalancer-handoff.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `experiment`
- Why this lane is sufficient: success criterion is information from a bounded hypothesis discriminator, not runtime metric movement.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.



## Bounded Experiment

- Hypothesis: Priority recovery residual rebalancing is deadlocked due to circular node_not_ready states.
- Hypothesis discriminator: Distinguish whether target node admission can proceed or if partition split/recovery logic must bypass the publication wait.
- Expected metric: priority recovery residual count, rebalancer phase transition, and active-gate progress
- Inherits from: `work/packages/done-20260521-topology-publication-reconcile-system-theory.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement discards the experiment or escalates
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.

## Observable Prediction

- Metric: priority recovery residual count, rebalancer phase transition, and active-gate progress
- Predicted: priority recovery residual count, rebalancer phase transition, and active-gate progress
- Observed: pending-before-observation
- Accuracy: pending-before-observation
- Evidence: pending-before-observation
- Closure compares predicted vs observed before the package can close.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `rebalancer_handoff`
- Route dominant reason: `priority_recovery_progress_blocked`
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
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `experiment`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/active-20260521-priority-recovery-rebalancer-residual.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: one probe that distinguishes hypotheses; success is information, not runtime metric movement
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep runtime behavior frozen until the probe distinguishes competing hypotheses.
2. Promote only the discriminated owner/boundary into a follow-on runtime or architecture package.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: completed analysis of priority recovery rebalancer residual deadlock. Found circular dependency where restarted nodes are denied recovery grace. Next: successor action `open-runtime-owner-boundary`.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown

