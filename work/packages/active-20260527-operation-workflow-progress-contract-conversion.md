# Operation Workflow Progress Contract Conversion

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "playback": "none",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "currentState": "Created todo package for operation workflow conversion based on the supported priority-recovery workflow-progress theory; dispatch_pending and planned work must become bounded progress evidence.",
    "nextAction": "Convert priority recovery dispatch_pending/planned owner re-entry paths to explicit progress contracts with wake, retry, and terminal outcomes."
  },
  "scope": {
    "writeScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/rebalancer/operation-workflow-owner-ports.js",
      "src/rebalancer/operation-workflow-owner-evidence.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
      "src/bootstrap/shared/local-query-transport-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "src/diagnostics/causal-graph-builder.js",
      "src/diagnostics/topology-convergence-graph.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "src/diagnostics/topology-convergence-owner-witness.js",
      "test/bootstrap/node-joining-ready-signal-retry.test.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "work/packages/active-20260527-operation-workflow-progress-contract-conversion.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js",
      "src/rebalancer/operation-workflow-owner-ports.js",
      "src/rebalancer/operation-workflow-owner-evidence.js",
      "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
      "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js",
      "src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js",
      "src/bootstrap/shared/local-query-transport-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "src/diagnostics/causal-graph-builder.js",
      "src/diagnostics/topology-convergence-graph.js",
      "src/diagnostics/topology-convergence-normalizers.js",
      "src/diagnostics/topology-convergence-owner-witness.js",
      "test/bootstrap/node-joining-ready-signal-retry.test.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "work/packages/active-20260527-operation-workflow-progress-contract-conversion.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Advances this sprint goal by converting the supported priority-recovery workflow theory into executable contract evidence.",
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
      "theory-20260527-rolling-restart-priority-recovery-workflow-progress"
    ],
    "theoryLedger": "theory-20260527-rolling-restart-priority-recovery-workflow-progress: reuse the supported priority recovery workflow progress theory as the operation-workflow conversion source.",
    "proof": {
      "commands": [
        "falsifier: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
        "regression: npm run audit:operation-progress-authority",
        "regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "Priority recovery dispatch_pending/planned work is stranded because workflow progress lacks an explicit wake/retry/terminal contract.",
    "hypothesisDiscriminator": "H1 if rebalancer tests show persisted-not-dispatched work wakes, retries, reconciles, or terminates through the contract; H2 if generic queue/backpressure owns the blocker; H3 if diagnostics were the only missing consumer.",
    "expectedMetric": "Priority recovery residuals move from unbounded dispatch_pending/planned to a contract state with a concrete next action.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
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
    "hypothesis": "Priority recovery dispatch_pending/planned work is stranded because workflow progress lacks an explicit wake/retry/terminal contract.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedCausalModelChange": "Convert priority recovery dispatch_pending/planned owner re-entry paths to explicit progress contracts with wake, retry, and terminal outcomes.",
    "representativeOutcome": "migrated",
    "causalDebt": "dispatch_pending routes rely on local pending fields without progress contract format.",
    "crossBoundaryReview": "Review with operation workflow owner and progress contract foundation definitions."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart seed-contact-bounded-progress",
    "phaseChain": [
      "operation workflow conversion"
    ],
    "currentFirstFrontier": "operation_workflow_owner / workflow_progress",
    "knownDownstreamBlockers": [
      "startup active gate snapshot coverage progress contract conversion"
    ],
    "missingCausalEdge": "operation workflow progress contract conversion",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
    "falsifyingProbe": "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
    "boundedProgressProof": "Operation workflow emits progress contracts with explicit retry, wake, timeout, and terminal status.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "expectedObservableTransition": "operation workflow progress prefers progress contract",
    "maxProgressBound": "one operation workflow conversion slice",
    "sameFrontierFallback": "autonomous architecture experiment",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress",
    "resultClassification": "pending-before-probe",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-startup-readiness-progress-contract-conversion.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "operation workflow conversion to prevent oscillating symptom-only fixes on the same artifact.",
    "handoffInvariant": "operation workflow changes prefer progress contract and do not invent runtime behaviors."
  },
  "progressContract": {
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "state": "progress_contract_conversion",
    "reason": "Convert priority recovery dispatch_pending/planned owner re-entry paths to explicit progress contracts with wake, retry, and terminal outcomes.",
    "nextAction": "convert progress contract",
    "wakeSource": "rebalancer",
    "retryAfterMs": 1000,
    "terminalState": "satisfied",
    "evidencePath": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "blockingDependency": "no other blocking dependencies"
  },
  "representativeResidual": {
    "status": "live",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "frontier": "operation_workflow_owner / workflow_progress -> startup_readiness_owner / startup_support_evidence",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Convert priority recovery dispatch_pending/planned owner re-entry paths to explicit progress contracts."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "workflow_progress",
    "routeDominantReason": "priority_recovery_event_driven_wait",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "migrate-owner-boundary",
    "nextLane": "causal-escalation",
    "expectedDelta": "priority recovery dispatch_pending/planned paths emit one next action with wake source, retry timing, terminal state, and evidence path.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "theoryLedger": "theory-20260527-rolling-restart-priority-recovery-workflow-progress: reuse the supported priority recovery workflow progress theory as the operation-workflow conversion source."
}
-->

## Why

This package owns the operation-workflow conversion because the supported
rolling-restart theory keeps priority recovery at `operation_workflow_owner /
workflow_progress`. It must turn persisted-not-dispatched work into an
observable progress contract before downstream owners are patched again.

## Scope Basis

Sprint package 5 in
`work/sprints/todo-2026-q2-owner-boundary-progress-contract-transformation.md`;
scope is limited to operation workflow owner files and focused priority
recovery tests.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / workflow_progress emits bounded workflow progress for priority_recovery_event_driven_wait.
- Inputs/signals: npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; npm run audit:operation-progress-authority.
- State model or invariant: The operation_workflow_owner / workflow_progress decision table in the Causal Decision Contract maps priority_recovery_event_driven_wait and route evidence to one emitted outcome: Convert priority recovery dispatch_pending/planned owner re-entry paths to explicit progress contracts with wake, retry, and terminal outcomes..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / workflow_progress invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Convert priority recovery dispatch_pending/planned owner re-entry paths to explicit progress contracts with wake, retry, and terminal outcomes. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / workflow_progress directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Competing explanations: At minimum compare priority_recovery_event_driven_wait against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / workflow_progress still own priority_recovery_event_driven_wait, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: priority_recovery_event_driven_wait is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: Priority recovery dispatch_pending/planned work is stranded because workflow progress lacks an explicit wake/retry/terminal contract.
- Hypothesis discriminator: H1 if rebalancer tests show persisted-not-dispatched work wakes, retries, reconciles, or terminates through the contract; H2 if generic queue/backpressure owns the blocker; H3 if diagnostics were the only missing consumer.
- Expected metric: Priority recovery residuals move from unbounded dispatch_pending/planned to a contract state with a concrete next action.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`
- Route owner: `operation_workflow_owner`
- Route boundary: `workflow_progress`
- Route dominant reason: `priority_recovery_event_driven_wait`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, entry validation, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260527-operation-workflow-progress-contract-conversion.md` or `npm run work:package:schema`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json`.
3. Owner discovery: `npm run analyze:owner-files -- operation_workflow_owner workflow_progress`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role verifier-fixer --package work/packages/active-20260527-operation-workflow-progress-contract-conversion.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to the commands in the Validation section plus `npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json` when representative context is needed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js
2. src/rebalancer/operation-workflow-owner-ports.js
3. src/rebalancer/operation-workflow-owner-evidence.js
4. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js
5. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`, `src/rebalancer/operation-workflow-owner-ports.js`, `src/rebalancer/operation-workflow-owner-evidence.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `npm run audit:operation-progress-authority`
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

- [ ] action: implementation; owner: operation_workflow_owner; files-changed: pending; validation: pending focused proof plus parent revalidated focused proof: yes; outcome: pending.
- [ ] action: verification-fix; owner: operation_workflow_owner; files-changed: pending-or-none; validation: pending verification proof plus parent revalidated focused proof: yes; outcome: pending.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json and work/sprints/current-blocker.md only if repair changes tracker state; validation: `npm run work:repair`; outcome: pending-or-not-needed.

## Validation

1. npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
2. npm run audit:operation-progress-authority
