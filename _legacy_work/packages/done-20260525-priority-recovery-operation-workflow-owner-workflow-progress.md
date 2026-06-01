# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-25",
  "lane": "diagnostic-classification",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-tell-tale-suite.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "New package scaffolded from the shared work-package schema.",
  "nextAction": "Prove or split this residual owner boundary.",
  "proof": [
    "falsifier: representative scenario triage npm run work:scenario-triage -- test-output/reports/rolling-restart-tell-tale-suite.report.json --markdown",
    "regression: representative evidence summary npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-suite.report.json",
    "supporting: analyze priority recovery residuals npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-tell-tale-suite.report.json --markdown"
  ],
  "theoryLedgerRefs": [
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260525-priority-recovery-operation-workflow-owner-workflow-progress.md"
  ],
  "modelFit": {
    "packageClass": "diagnostic-classification",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "observablePrediction": {
    "metric": "tell-tale suite promotion eligibility",
    "predicted": "blocked while rolling-restart is not representative green",
    "observed": "same-frontier",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-tell-tale-suite.report.json"
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
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
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "open-architecture-package",
    "nextAction": "Keep the selected workflow-progress classification/triage successor before further runtime edits.",
    "triggerEvidence": [
      "Fresh rolling-restart representative route selected operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait.",
      "Frontier oscillation detected (repeated adjacent-boundary oscillation within the same boundary family).",
      "Same-frontier rolling-restart evidence must stop local patching and triage residuals."
    ],
    "choices": [
      {
        "id": "open-architecture-package",
        "summary": "Keep the workflow-progress successor as the active first frontier.",
        "route": "architecture-package",
        "proof": [
          "npm run work:scenario-triage -- test-output/reports/rolling-restart-tell-tale-suite.report.json --markdown",
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-suite.report.json",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-suite.report.json"
        ]
      }
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-suite.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-tell-tale-suite.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-tell-tale-suite.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-tell-tale-suite.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_progress_blocked",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "scenario-release-gate",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-tell-tale-suite.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "stabilityCredit": "local-proof-only",
  "whyHighestLeverageNow": "This package advances the active sprint goal and current first frontier.",
  "representativeRerunCadence": "architecture-stop-reason",
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-tell-tale-suite.report.json",
    "frontier": "workflow_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Prove or split this residual owner boundary."
  },
  "causalGovernance": {
    "hypothesis": "The priority-recovery event-driven wait residuals represent a distinct classification or stop condition before broader runtime promotion.",
    "stopConditionCheck": "Use npm run analyze:causal-model, work:scenario-triage, work:evidence-summary, and analyze:priority-recovery-residuals on the latest representative artifact.",
    "expectedCausalModelChange": "The package should classify whether fresh evidence is green, reduced, migrated, same-frontier, architecture-gap, or contradictory.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "priority-recovery event-driven wait needs material classification before promotion.",
    "crossBoundaryReview": "Triage stays under operation_workflow_owner / workflow_progress."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart-priority-recovery-triage",
    "phaseChain": [
      "rolling-restart representative gate rerun completed",
      "route evidence selected operation_workflow_owner / workflow_progress",
      "triage residuals to classify the frontier outcome"
    ],
    "currentFirstFrontier": "operation_workflow_owner/workflow_progress",
    "knownDownstreamBlockers": [
      "tell-tale-suite-repeatability"
    ],
    "missingCausalEdge": "Classification of fresh representative evidence is pending.",
    "missingCausalEdgeProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-tell-tale-suite.report.json",
    "falsifyingProbe": "npm run work:scenario-triage -- test-output/reports/rolling-restart-tell-tale-suite.report.json",
    "boundedProgressProof": "The package records that priority-recovery residuals must be classified before runtime promotion to reconcile and advance workflow progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-tell-tale-suite.report.json",
    "expectedObservableTransition": "residuals classified to determine next successor",
    "maxProgressBound": "one classification gate",
    "sameFrontierFallback": "Keep the workflow-progress successor as the active first frontier.",
    "expectedNextFrontier": "workflow_progress",
    "resultClassification": "same-frontier",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "done-20260525-tell-tale-scenario-suite-promotion-gate.md / release_gate_owner / tell_tale_suite_repeatability / tell_tale_suite_repeatability_required"
    ],
    "oscillationCheck": "The package does not patch runtime; it triages priority-recovery evidence to select the next owner/boundary.",
    "handoffInvariant": "Workflow progress triage is downstream of scenario-release-gate routing."
  },
  "closed": "2026-05-25",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260525-priority-recovery-rebalancer-leader-operation-scheduling.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / workflow_progress emits the package outcome for priority_recovery_progress_blocked.
- Inputs/signals: test-output/reports/rolling-restart-tell-tale-suite.report.json; Prove or split this residual owner boundary..
- State model or invariant: The operation_workflow_owner / workflow_progress decision table in the Causal Decision Contract maps priority_recovery_progress_blocked and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / workflow_progress invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_progress_blocked | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Prove or split this residual owner boundary. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm run work:advance -- --check |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:advance -- --check`
- Competing explanations: At minimum compare priority_recovery_progress_blocked against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / workflow_progress still own priority_recovery_progress_blocked, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_progress_blocked is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:advance -- --check`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-tell-tale-suite.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_progress_blocked`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-tell-tale-suite.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-tell-tale-suite.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_progress_blocked`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `scenario-release-gate`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

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

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:advance -- --check`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: operation_workflow_owner; files-changed: none; validation: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-tell-tale-suite.report.json --markdown; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: operation_workflow_owner; files-changed: none; validation: npm run work:evidence-summary -- test-output/reports/rolling-restart-tell-tale-suite.report.json; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: validated.

## Validation

1. `git diff --check -- <files>`

