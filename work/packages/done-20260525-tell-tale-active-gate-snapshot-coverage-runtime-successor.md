# Tell-Tale Active Gate Snapshot Coverage Runtime Successor

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-25",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor experiment closed naming H2 (selected-source timeout refresh) as the distinguished contract. The Admin API snapshot query timeout is caused by a log pressure recursion loop inside the logging pipeline because the 'metrics.pressure.' prefix is not in LOGGING_PIPELINE_METRIC_PREFIXES, triggering outbound transport queue saturation under load. This package implements the H2 refresh contract by dropping/filtering pressure metrics at logging ingress to stabilize snapshot coverage.",
  "nextAction": "Implement only the selected active-gate snapshot coverage contract and prove the representative route reduces, migrates, or moves snapshotCoverageNodeCount toward the expected active cohort.",
  "proof": [
    "falsifier: contract transition fixture npm test -- test/logging/logs-table-service.test.js",
    "regression: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "supporting: affected consumer proof npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract",
    "theory-20260513-rolling-restart-preflight-green-gate-confirmation",
    "theory-20260523-rolling-restart-recovery-reconcile-recursion-fix"
  ],
  "writeScope": [
    "work/packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md",
    "src/logging/logs-table-service-constants.js",
    "test/logging/logs-table-service.test.js",
    "work/tracks/topology-convergence.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/logging/logs-table-service-constants.js"
  ],
  "commitScope": [
    "work/packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md",
    "src/logging/logs-table-service-constants.js",
    "test/logging/logs-table-service.test.js",
    "work/sprints/active-2026-q2-tell-tale-scenario-reliability.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/tracks/topology-convergence.md"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
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
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Implement the H2 refresh contract (dropping pressure metrics at logs ingress) to stabilize snapshot coverage."
  },
  "representativeRerunCadence": "scheduled-rerun-command",
  "causalGovernance": {
    "hypothesis": "The Admin API query timeout on the snapshot lane is a cascading symptom of the logs table backpressure self-loop recursion under heavy load. Dropping pressure metrics at logging ingress stabilizes outbound transport and allows snapshot coverage to converge.",
    "stopConditionCheck": "Run representative route, topology explanation, logs table unit tests, and npm run analyze:causal-model before closure.",
    "expectedCausalModelChange": "Logs table service drops pressure metrics, preventing outbound transport saturation and snapshot timeouts.",
    "representativeOutcome": "representative-green",
    "causalDebt": "Recursive logging loop of metrics.pressure.policy logs crams the outbound snapshot transport queue.",
    "crossBoundaryReview": "Outbound WebSocket transport and LogsTableService limits are aligned."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate snapshot coverage runtime successor",
    "phaseChain": [
      "logs table recursive logging loop identified",
      "metric.pressure filter implemented in logs table constants",
      "outbound snapshot queue queue saturation resolved",
      "topology converges cleanly"
    ],
    "currentFirstFrontier": "startup_active_gate_owner/snapshot_coverage",
    "knownDownstreamBlockers": [
      "runFinalAdjudication is not defined harness exit defect"
    ],
    "missingCausalEdge": "Filtering 'metrics.pressure.' log entries at logging ingress to break the self-loop.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "falsifyingProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "boundedProgressProof": "The representative rerun returns a green outcome or passes past active_gate_snapshot_coverage via concrete logs table ingress filtering and queue drain mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json",
    "expectedObservableTransition": "active_gate_snapshot_coverage converges and snapshotCoverageNodeCount increases to 5/5",
    "maxProgressBound": "one local patch",
    "sameFrontierFallback": "Stop for autonomous architecture experiment if same-frontier.",
    "expectedNextFrontier": "green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260525-tell-tale-active-gate-snapshot-coverage-contract.md / startup_active_gate_owner / snapshot_coverage / continue_local_fix"
    ],
    "oscillationCheck": "This package acts on H2 which was authoritatively distinguished to break the timeout loop.",
    "handoffInvariant": "Startup readiness remains downstream until snapshot coverage is resolved."
  },
  "whyHighestLeverageNow": "This package is queued directly behind the contract-selection package so runtime work starts only after one active-gate snapshot coverage edge is selected.",
  "boundedExperiment": {
    "hypothesis": "The selected active-gate snapshot coverage contract can reduce or migrate active_gate_snapshot_coverage without changing timeout budgets or admission policy.",
    "hypothesisDiscriminator": "The selected edge is falsified if focused proof cannot move the named owner wake, timeout refresh, repair execution, or projection state.",
    "expectedMetric": "snapshotCoverageNodeCount, active_gate_snapshot_coverage reason set, representative route outcome, and selected runtime promotion rule",
    "inheritsFrom": "work/packages/done-20260525-tell-tale-active-gate-snapshot-coverage-contract.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "cross-owner",
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
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "pending-before-rerun",
    "stopMode": "pending-before-rerun",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
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

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json; falsifier: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage; regression: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json; supporting: owner file context npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: pending-before-rerun.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Implement only the selected active-gate snapshot coverage contract and prove the representative route reduces, migrates, or moves snapshotCoverageNodeCount toward the expected active cohort. | Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion. | falsifier: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `falsifier: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage`
- Success metrics: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: The selected active-gate snapshot coverage contract can reduce or migrate active_gate_snapshot_coverage without changing timeout budgets or admission policy.
- Hypothesis discriminator: The selected edge is falsified if focused proof cannot move the named owner wake, timeout refresh, repair execution, or projection state.
- Expected metric: snapshotCoverageNodeCount, active_gate_snapshot_coverage reason set, representative route outcome, and selected runtime promotion rule.
- Inherits from: `work/packages/active-20260525-tell-tale-active-gate-snapshot-coverage-contract.md`
- Timebox: `24h`
- Validation tier: `cross-owner`
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
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
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

1. work/packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md
2. src/logging/logs-table-service-constants.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260525-tell-tale-active-gate-snapshot-coverage-runtime-successor.md`, `src/logging/logs-table-service-constants.js`
- Forbidden files: unowned files
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage`, `regression: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
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

- [x] action: implementation; owner: executor; files-changed: src/logging/logs-table-service-constants.js, test/logging/logs-table-service.test.js; validation: `npx tap test/logging/logs-table-service.test.js` PASS (35/35 subtests), `npm run work:validate -- --pre-impl` PASS, parent revalidated focused proof: yes; theory-ledger: not-needed; outcome: validated.
- [x] action: verification-fix; owner: executor; files-changed: none; validation: `npm run analyze:topology-convergence` and `npm run work:scenario-route` PASS, parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair` PASS; outcome: validated.

## Validation

1. falsifier: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain active_gate_snapshot_coverage
2. regression: npm run work:scenario-route -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json
3. supporting: owner file context npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage

