# Rolling Restart Final Adjudication Harness Fix

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-25",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
  "playback": "none",
  "owner": "distributed_harness_verdict_owner",
  "boundary": "timeout_core_state_adjudication",
  "dominantReason": "run_final_adjudication_not_defined",
  "currentState": "Queued because the fresh rolling-restart report produced useful route evidence but the scenario process exited failed when final adjudication raised runFinalAdjudication is not defined.",
  "nextAction": "Repair the harness final-adjudication binding/import path without changing runtime topology behavior, then prove the final adjudication tests and a fresh scenario report can complete adjudication.",
  "proof": [
    "falsifier: contract transition fixture npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js",
    "regression: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json # test/distributed/run.js",
    "supporting: affected consumer proof npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js"
  ],
  "theoryLedgerRefs": [
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [
    "work/packages/done-20260525-rolling-restart-final-adjudication-harness-fix.md",
    "test/distributed/harness/cluster-segment-7.js",
    "work/tracks/topology-convergence.md",
    "src/logging/logs-table-service-constants.js",
    "test/logging/logs-table-service.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/assertions-segment-2.js",
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-7-alpha-load-readiness.js",
    "test/distributed/harness/__tests__/consistency-evaluator.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260525-rolling-restart-final-adjudication-harness-fix.md",
    "test/distributed/harness/cluster-segment-7.js",
    "work/sprints/active-2026-q2-tell-tale-scenario-reliability.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/tracks/topology-convergence.md",
    "src/logging/logs-table-service-constants.js",
    "test/logging/logs-table-service.test.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 1
  },
  "stabilityCredit": "local-proof-only",
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "distributed_harness_verdict_owner",
    "boundary": "timeout_core_state_adjudication",
    "dominantReason": "run_final_adjudication_not_defined",
    "nextAction": "Repair the harness final-adjudication binding/import path without changing runtime topology behavior, then prove the final adjudication tests and a fresh scenario report can complete adjudication."
  },
  "representativeRerunCadence": "scheduled-rerun-command",
  "causalGovernance": {
    "hypothesis": "The runFinalAdjudication not defined error is a test harness binding defect and does not affect the correctness of runtime topology convergence. Repairing it allows scenario runs to output complete verdict reports.",
    "stopConditionCheck": "Run focused consistency-evaluator tests, representative scenario-route, and npm run analyze:causal-model before closure.",
    "expectedCausalModelChange": "ConsistencyEvaluator has a valid runFinalAdjudication binding, allowing the harness to complete final adjudication.",
    "representativeOutcome": "representative-green",
    "causalDebt": "Missing or incorrect export/import binding for runFinalAdjudication.",
    "crossBoundaryReview": "Harness assertions and consistency evaluator boundaries are aligned."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart final adjudication harness fix",
    "phaseChain": [
      "harness runFinalAdjudication is not defined error identified",
      "harness binding/import path repaired",
      "focused consistency-evaluator test passing",
      "scenario final adjudication completes successfully"
    ],
    "currentFirstFrontier": "distributed_harness_verdict_owner/timeout_core_state_adjudication",
    "knownDownstreamBlockers": [
      "representative-green-gate"
    ],
    "missingCausalEdge": "Correct runFinalAdjudication binding in consistency-evaluator.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js",
    "boundedProgressProof": "The consistency-evaluator test suite passes completely and scenario final adjudication executes successfully using the final adjudication drain mechanism without undefined function reference errors.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "expectedObservableTransition": "final adjudication completes, resolving run_final_adjudication_not_defined to green",
    "maxProgressBound": "one local patch",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md / startup_active_gate_owner / snapshot_coverage / continue_local_fix"
    ],
    "oscillationCheck": "This package acts on harness final-adjudication which has not oscillated.",
    "handoffInvariant": "Startup readiness is green, final adjudication is the last remaining gate."
  },
  "observablePrediction": {
    "metric": "runFinalAdjudication executes in harness cluster paths and representative reports finish with routeable adjudication evidence",
    "predicted": "runFinalAdjudication executes successfully without undefined reference errors",
    "observed": "runFinalAdjudication executes successfully without undefined reference errors",
    "accuracy": "matched",
    "evidence": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
  },
  "whyHighestLeverageNow": "Final adjudication must complete before rolling-restart can be trusted as a clean pass/fail release gate, but this package is queued behind the active-gate first frontier.",
  "boundedExperiment": {
    "hypothesis": "The final adjudication failure is a harness binding/import defect independent of runtime topology convergence.",
    "hypothesisDiscriminator": "If consistency-evaluator proof passes but cluster final adjudication still raises runFinalAdjudication is not defined, the binding remains incomplete.",
    "expectedMetric": "runFinalAdjudication executes in harness cluster paths and representative reports finish with routeable adjudication evidence",
    "inheritsFrom": "work/packages/done-20260525-rolling-restart-operation-workflow-route-rerun.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "single-owner",
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
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "routeOwner": "distributed_harness_verdict_owner",
    "routeBoundary": "timeout_core_state_adjudication",
    "routeDominantReason": "run_final_adjudication_not_defined",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --owner distributed_harness_verdict_owner --boundary timeout_core_state_adjudication --dominant-reason run_final_adjudication_not_defined",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-25",
  "commitAndPushLedgerRequired": true
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

- Canonical outcome: distributed_harness_verdict_owner / timeout_core_state_adjudication emits the package outcome for run_final_adjudication_not_defined.
- Inputs/signals: test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json; falsifier: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js; regression: npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js; supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json.
- State model or invariant: The distributed_harness_verdict_owner / timeout_core_state_adjudication decision table in the Causal Decision Contract maps run_final_adjudication_not_defined and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the distributed_harness_verdict_owner / timeout_core_state_adjudication invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | distributed_harness_verdict_owner / timeout_core_state_adjudication / run_final_adjudication_not_defined | distributed_harness_verdict_owner owns this decision before downstream consumers reinterpret it | Repair the harness final-adjudication binding/import path without changing runtime topology behavior, then prove the final adjudication tests and a fresh scenario report can complete adjudication. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies distributed_harness_verdict_owner / timeout_core_state_adjudication directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js`
- Competing explanations: At minimum compare run_final_adjudication_not_defined against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does distributed_harness_verdict_owner / timeout_core_state_adjudication still own run_final_adjudication_not_defined, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: run_final_adjudication_not_defined is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --owner distributed_harness_verdict_owner --boundary timeout_core_state_adjudication --dominant-reason run_final_adjudication_not_defined`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: The final adjudication failure is a harness binding/import defect independent of runtime topology convergence.
- Hypothesis discriminator: If consistency-evaluator proof passes but cluster final adjudication still raises runFinalAdjudication is not defined, the binding remains incomplete.
- Expected metric: runFinalAdjudication executes in harness cluster paths and representative reports finish with routeable adjudication evidence.
- Inherits from: `work/packages/done-20260525-rolling-restart-operation-workflow-route-rerun.md`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
- Route owner: `distributed_harness_verdict_owner`
- Route boundary: `timeout_core_state_adjudication`
- Route dominant reason: `run_final_adjudication_not_defined`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
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

1. work/packages/todo-20260525-rolling-restart-final-adjudication-harness-fix.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260525-rolling-restart-final-adjudication-harness-fix.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js`, `regression: npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js`
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
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: distributed_harness_verdict_owner; files-changed: test/distributed/harness/cluster-segment-7.js, src/logging/logs-table-service-constants.js, test/logging/logs-table-service.test.js, work/tracks/topology-convergence.md; validation: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js and parent revalidated focused proof: yes; theory ledger: no ledger update; outcome: validated.
- [x] action: verification-fix; owner: distributed_harness_verdict_owner; files-changed: none; validation: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js and parent revalidated focused proof: yes; theory ledger: no ledger update; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: validated.

## Validation

1. falsifier: npm test -- test/distributed/harness/__tests__/consistency-evaluator.test.js
2. regression: npm test -- test/distributed/harness/__tests__/cluster.test-part-6.js
3. supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json

## Commit And Push Ledger

1. Focused package commit: b48701b3a40b21c376758d471d3199a42858bede
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
