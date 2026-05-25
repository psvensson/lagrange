# Rolling Restart Workflow Progress Dispatch Chain

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-25",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Scaffolded from representative evidence for priority_recovery_partition_progress.",
    "nextAction": "Before runtime edits, prove the workflow-progress missing edge with causal-escalation proof or select an autonomous architecture experiment; activate only after pre-implementation validation is clean."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260525-rolling-restart-workflow-progress-dispatch-chain.md",
      "work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/rebalancer/operation-workflow-owner.js",
      "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
      "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
      "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
      "src/rebalancer/operation-workflow-owner-constants.js",
      "src/control-plane/priority-recovery-snapshot-stage-10.js"
    ],
    "commitScope": [
      "work/packages/todo-20260525-rolling-restart-workflow-progress-dispatch-chain.md",
      "work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Fresh representative evidence moved the stale active-gate package to the first actionable priority_recovery_partition_progress frontier. The residual is one operation_workflow_owner / workflow_progress group with five witnesses, two direct dispatch_pending advance_existing_operation operations, one dispatched target_creation wait, and two serial-wait dependents.",
    "representativeRerunCadence": "fresh-representative-rerun"
  },
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ],
    "ambiguityScore": 3
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix",
      "theory-20260513-rolling-restart-preflight-green-gate-confirmation"
    ],
    "proof": {
      "commands": [
        "falsifier: representative route npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
        "regression: priority recovery residuals npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --markdown",
        "supporting: causal model npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
      ]
    }
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
      "route npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
      "recovery residuals npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --markdown",
      "model npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-causal-escalation",
    "runtimePromotionRule": "Keep runtime files in candidateRuntimeFiles until this successor is active and passes pre-implementation validation. If fresh evidence remains same-frontier with no reduction, open/select an autonomous architecture experiment before local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "causal-escalation",
    "nextLane": "causal-escalation",
    "expectedDelta": "priority recovery witness count drops below 5, owner boundary migrates, snapshot coverage increases beyond 2/5, or rolling-restart turns green",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "refresh current-blocker with npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "requiredPreImplProbe": {
    "command": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain priority_recovery_partition_progress",
    "artifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "reason": "Runtime promotion depends on the fresh dispatch chain: control_plane_publications-p1 is dispatched_waiting_progress, replica_operations-p1 and sql_transaction_participants-p1 are persisted_not_dispatched, and sql_transactions-p1 plus sql_write_operations-p1 are serial-wait dependents."
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Implement one bounded workflow-progress advance/re-entry path, then rerun rolling-restart for reduction, migration, or green."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart fresh workflow progress dispatch chain",
    "phaseChain": [
      "active-gate selected snapshot evidence improved and is no longer first frontier",
      "publication is PUBLISHED with zero pending ACKs",
      "priority recovery remains pending on operation_workflow_owner / workflow_progress",
      "workflow progress must advance or re-enter the dispatch chain before active-gate coverage can complete"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner / snapshot_coverage remains incomplete at 2/5",
      "startup_readiness_owner / startup_support_evidence remains downstream of priority recovery and active-gate coverage"
    ],
    "missingCausalEdge": "The owner must advance, wake, timeout, or re-enter the dispatch_pending persisted operations while preserving target_creation waits and serial-wait dependents as downstream evidence.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain priority_recovery_partition_progress",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress",
    "boundedProgressProof": "Focused owner tests plus fresh representative rerun must show a bounded dispatch, advance, wake, retry, timeout, or reconcile mechanism that drops priority recovery witness count below 5, migrates owner boundary, raises snapshot coverage above 2/5, or turns rolling-restart green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "expectedObservableTransition": "priority recovery witness count drops below 5, owner boundary migrates, snapshot coverage increases beyond 2/5, or rolling-restart turns green",
    "maxProgressBound": "one operation_workflow_owner / workflow_progress runtime slice",
    "sameFrontierFallback": "If fresh evidence remains same-frontier with no concrete metric reduction, stop for autonomous architecture experiment instead of another local runtime patch.",
    "expectedNextFrontier": "reduced operation_workflow_owner / workflow_progress, migrated owner boundary, startup_active_gate_owner / snapshot_coverage, or representative green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260525-rolling-restart-cache-watermark-write-queue-drain-successor.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Fresh evidence moved from startup_active_gate_owner / snapshot_coverage back to operation_workflow_owner / workflow_progress after active-gate evidence improved but did not complete.",
    "handoffInvariant": "Startup active-gate and startup readiness remain downstream until workflow progress proves reduction, migration, or green."
  },
  "causalGovernance": {
    "hypothesis": "Workflow progress must advance the fresh priority-recovery dispatch chain before active-gate coverage can complete.",
    "stopConditionCheck": "Run priority-recovery route, residual extraction, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json` before runtime promotion.",
    "expectedCausalModelChange": "The successor either proves a concrete operation_workflow_owner / workflow_progress missing edge, reduces the witness count, migrates owner boundary, or stops for architecture work.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh evidence shows priority_recovery_partition_progress first with five operation_workflow_owner / workflow_progress witnesses after active-gate coverage improved but did not complete.",
    "crossBoundaryReview": "Do not patch downstream startup readiness or active-gate symptoms until workflow progress moves or migrates."
  },
  "observablePrediction": {
    "metric": "priority recovery witness count, owner boundary, snapshot coverage, or representative green",
    "predicted": "causal-escalation proof names one missing workflow-progress edge before runtime promotion",
    "observed": "pending-before-observation",
    "accuracy": "pending-before-observation",
    "evidence": "test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json",
    "metricDelta": 0
  }
}
-->

## Why

Fresh rolling-restart evidence moved the first actionable frontier to
`operation_workflow_owner / workflow_progress`. This package is queued as the
successor, but it must prove the producer-consumer missing edge before runtime
files move into write scope.

## Scope Basis

Owner-boundary migration from the active-gate discriminator in the rolling
restart resume activation sprint.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the recent history shows adjacent-boundary
  oscillation, so the next package must prove the missing edge or select an
  autonomous architecture experiment before runtime work.
- Escalation trigger to a heavier lane: representative evidence is
  contradictory or the missing edge cannot be proven with the declared probes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / workflow_progress either names
  the missing dispatch/re-entry edge or stops for architecture work before a
  local runtime patch.
- Inputs/signals: test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --markdown; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --explain priority_recovery_partition_progress; npm run work:evidence-summary -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --markdown.
- State model or invariant: priority_recovery_event_driven_wait remains
  owner-boundary evidence until the causal-escalation proof names a producer,
  consumer, admission, retry, lifecycle, or evidence-generation edge.
- Non-goals and forbidden interpretations: do not reinterpret downstream
  startup readiness or active-gate symptoms, and do not move runtime files into
  write scope before pre-implementation validation is clean.
- Proof mapping: route, residual extraction, and topology explanation must
  justify the exact missing edge before runtime implementation is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait | operation_workflow_owner owns this decision before downstream consumers reinterpret it | prove the missing edge, reduce/migrate the frontier, or open an autonomous architecture experiment | priority recovery witness count drops below 5, owner boundary migrates, snapshot coverage increases beyond 2/5, or rolling-restart turns green | npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`
- Competing explanations: At minimum compare priority_recovery_event_driven_wait against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / workflow_progress still own priority_recovery_event_driven_wait, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_event_driven_wait is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`
- Success metrics: priority recovery witness count drops below 5, owner boundary migrates, snapshot coverage increases beyond 2/5, or rolling-restart turns green; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
- Expected delta: priority recovery witness count drops below 5, owner boundary migrates, snapshot coverage increases beyond 2/5, or rolling-restart turns green
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `causal-escalation`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-causal-escalation`
- Runtime promotion rule: keep runtime files in candidateRuntimeFiles until this
  package is activated and passes pre-implementation validation. If the route is
  unchanged with no reduction, open/select an autonomous architecture
  experiment before local runtime work.

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

1. Package metadata and proof-surface preparation for this queued successor.
2. Candidate runtime and test files listed in metadata stay candidate-only until
   activation.

## Out Of Scope

1. Runtime source edits before this package becomes active and passes
   pre-implementation validation.

## Model Fit

- Package class: `architecture-gap-analysis`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260525-rolling-restart-workflow-progress-dispatch-chain.md`
- Candidate runtime files: `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `src/rebalancer/operation-workflow-owner-constants.js`, `src/control-plane/priority-recovery-snapshot-stage-10.js`
- Forbidden files: runtime source and tests until activation passes
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --markdown`, `npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
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

- [ ] action: implementation; owner: <owner>; files-changed: <paths or none>; validation: <focused proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.
- [ ] action: verification-fix; owner: <owner>; files-changed: <paths or none>; validation: <verification proof and parent revalidated focused proof: yes>; outcome: <validated|blocked>.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: <validated|not-needed>.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --markdown
3. npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json
