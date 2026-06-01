# Rolling Restart Benchmark Table Bootstrap Control Timeout Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "causal-escalation",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_probe_timeout",
    "currentState": "Timeline evidence shows setup.cluster.active and scenario.load-readiness.stable before the terminal benchmark_events partition visibility timeout, so the repeated startup readiness boundary is handled as a causal-escalation runtime slice with explicit cross-boundary proof.",
    "nextAction": "Fix benchmark table bootstrap so a selected control-lane create timeout cannot consume the entire bootstrap visibility budget before rotating, repairing, or observing partition visibility on an alternate query node.",
    "closed": "2026-05-28",
    "successor": "work/packages/done-20260528-rolling-restart-load-readiness-queryable-admin-gate-architecture.md"
  },
  "scope": {
    "writeScope": [
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-control-timeout-runtime.md"
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
    "theoryLedgerRefs": [],
    "theoryLedger": "no ledger update: not-applicable because this package continues the existing benchmark table bootstrap control-timeout theory and will record a durable theory only if representative proof creates one.",
    "proof": {
      "commands": [
        "falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused table-bootstrap create-timeout recovery",
        "regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected scenario admission contracts",
        "representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-control-timeout-20260527T223053Z.report.json --fast-local --verbose"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
        "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
        "work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-control-timeout-runtime.md",
        "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
  "boundedExperiment": {
    "hypothesis": "Benchmark table bootstrap stalls because the selected control-lane CREATE TABLE attempt can consume the bootstrap visibility budget before another query node observes or repairs the table.",
    "hypothesisDiscriminator": "H1 selected if focused proof shows a timed-out selected primary has no remaining bounded rotation/repair attempt; H2 wrong if alternate query nodes are attempted before deadline; H3 wrong if authoritative repair is attempted and fails with a concrete repair error.",
    "expectedMetric": "lastCreateError remains bounded, authoritativeRepairAttempted or alternate primary attempt becomes true, partition visibility becomes observable, and rolling-restart moves past benchmark_events bootstrap.",
    "inheritsFrom": "work/packages/done-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "cross-owner",
  "observablePrediction": {
    "metric": "benchmark_events bootstrap partition visibility after selected control-lane create timeout",
    "predicted": "Focused proof fails before the fix for a selected primary control timeout that leaves authoritativeRepairAttempted=false, then passes after bootstrap rotates, repairs, or observes visibility on another query node.",
    "observed": "Focused bootstrap recovery proof passed and representative rolling-restart no longer stopped at a single selected-primary control timeout; it rotated/extended until the remaining concrete blocker was admin SQL query availability after load readiness.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-benchmark-table-bootstrap-control-timeout-20260528T002910Z.report.json",
    "metricDelta": 1
  },
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
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "readiness_probe_timeout",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Benchmark table bootstrap records bounded progress after a control-lane create timeout, partition visibility becomes observable for benchmark_events, and rolling-restart moves past the current table visibility blocker.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "active",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "frontier": "startup_readiness_owner / startup_support_evidence",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_probe_timeout",
    "nextAction": "Repair benchmark table bootstrap control-timeout bounded progress after active/load readiness already succeeded."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "Canonical topology retained active-gate evidence, but stage proof shows setup.cluster.active and scenario.load-readiness.stable before the terminal benchmark_events partition visibility timeout.",
    "evidence": "test-output/reports/.playback/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z/rolling-restart/events.ndjson; test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json"
  },
  "causalGovernance": {
    "hypothesis": "Rolling restart is no longer blocked at active-gate admission; benchmark table bootstrap has a bounded-progress gap when the selected control-lane create primary times out.",
    "stopConditionCheck": "Run npm run analyze:causal-model -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json and the focused table bootstrap create-timeout proof before edits, then rerun representative rolling-restart and route the fresh artifact.",
    "expectedCausalModelChange": "Benchmark table bootstrap rotates, repairs, or observes partition visibility after a selected control timeout instead of terminating with authoritativeRepairAttempted=false.",
    "representativeOutcome": "migrated",
    "causalDebt": "The previous bootstrap package proved one rotation/repair fixture, but the representative still timed out with lastCreateError on the selected seed control lane and no visibility or repair attempt.",
    "crossBoundaryReview": "Do not change active-gate snapshot coverage, readiness timeouts, publication ownership, or operation workflow; this package may only change benchmark table bootstrap recovery and focused tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart benchmark table bootstrap control timeout",
    "phaseChain": [
      "active gate reached setup.cluster.active",
      "pre-load readiness reached scenario.load-readiness.stable",
      "benchmark_events CREATE TABLE timed out on the selected control primary",
      "partition visibility stayed none with authoritativeRepairAttempted=false"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence / readiness_probe_timeout",
    "knownDownstreamBlockers": [
      "rolling restart cannot start benchmark load until benchmark_events partition visibility is established",
      "canonical active-gate diagnostics may remain stale after admission has already succeeded"
    ],
    "missingCausalEdge": "Benchmark table bootstrap does not preserve a bounded rotate/repair/observe step after a selected control-lane create timeout consumes its local budget.",
    "missingCausalEdgeProbe": "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "falsifyingProbe": "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "boundedProgressProof": "Focused proof must fail before the fix for the representative shape, then pass with an alternate create primary, authoritative repair attempt, or post-timeout visibility observation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "expectedObservableTransition": "The representative no longer fails with benchmark_events partition visibility none and authoritativeRepairAttempted=false.",
    "maxProgressBound": "one causal-escalation runtime slice; no timeout-budget increase",
    "sameFrontierFallback": "If focused proof passes and representative rerun still reports the same table bootstrap timeout with no metric movement, stop for an autonomous architecture experiment.",
    "expectedNextFrontier": "representative-green, migrated frontier, or reduced table-bootstrap residual",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md / startup_readiness_owner / startup_support_evidence / migrated",
      "done-20260527-rolling-restart-startup-readiness-admin-reachability-support.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "Allowed only as causal-escalation because fresh stage proof distinguishes this from readiness/admin symptoms: the scenario passed active and load-readiness gates before table bootstrap failed.",
    "handoffInvariant": "Table bootstrap recovery may rotate, repair, or observe through existing query nodes; it must not promote active-gate coverage or widen readiness/timeout budgets."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "continue-local-proof",
    "nextAction": "Run the focused table-bootstrap proof and implement the bounded create-timeout recovery path.",
    "triggerEvidence": [
      "startup_readiness_owner / startup_support_evidence recently repeated",
      "timeline proof shows setup.cluster.active and scenario.load-readiness.stable before table bootstrap failed",
      "terminal error reports benchmark_events partition visibility none and authoritativeRepairAttempted=false"
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement bounded benchmark table bootstrap create-timeout recovery.",
        "route": "continue-local-proof",
        "proof": [
          "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop if the focused proof cannot distinguish rotate, repair, or observe semantics.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json"
        ]
      }
    ]
  },
  "requiredPreImplProbe": {
    "command": "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "artifact": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "reason": "Focused proof must expose the create-timeout recovery gap before runtime edits."
  },
  "theoryLedger": "no ledger update: not-applicable because this package continues the existing benchmark table bootstrap control-timeout theory and will record a durable theory only if representative proof creates one.",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-control-timeout-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns startup_readiness_owner / startup_support_evidence because the selected evidence routes readiness_probe_timeout there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Canonical evidence source: `test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits Fix benchmark table bootstrap so a selected control-lane create timeout cannot consume the entire bootstrap visibility budget before rotating, repairing, or observing partition visibility on an alternate query node. for readiness_probe_timeout.
- Inputs/signals: test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json; falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused table-bootstrap create-timeout recovery; regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected scenario admission contracts; representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-control-timeout-20260527T223053Z.report.json --fast-local --verbose; npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps readiness_probe_timeout and route evidence to one emitted outcome: Fix benchmark table bootstrap so a selected control-lane create timeout cannot consume the entire bootstrap visibility budget before rotating, repairing, or observing partition visibility on an alternate query node..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / readiness_probe_timeout | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Fix benchmark table bootstrap so a selected control-lane create timeout cannot consume the entire bootstrap visibility budget before rotating, repairing, or observing partition visibility on an alternate query node. | Benchmark table bootstrap records bounded progress after a control-lane create timeout, partition visibility becomes observable for benchmark_events, and rolling-restart moves past the current table visibility blocker. | falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused table-bootstrap create-timeout recovery |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused table-bootstrap create-timeout recovery`
- Competing explanations: At minimum compare readiness_probe_timeout against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own readiness_probe_timeout, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: readiness_probe_timeout is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused table-bootstrap create-timeout recovery`
- Success metrics: Benchmark table bootstrap records bounded progress after a control-lane create timeout, partition visibility becomes observable for benchmark_events, and rolling-restart moves past the current table visibility blocker.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.

## Bounded Experiment

- Hypothesis: State the experiment hypothesis before implementation.
- Hypothesis discriminator: Predict the different observable under H1 vs H2 vs H3 before implementation.
- Expected metric: Name the count, frontier, route, or representative result expected to move.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `cross-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`
- Expected delta: Benchmark table bootstrap records bounded progress after a control-lane create timeout, partition visibility becomes observable for benchmark_events, and rolling-restart moves past the current table visibility blocker.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `readiness_probe_timeout`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-rolling-restart-benchmark-table-bootstrap-control-timeout-runtime.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260527-rolling-restart-benchmark-table-bootstrap-control-timeout-runtime.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260527-rolling-restart-benchmark-table-bootstrap-control-timeout-runtime.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. test/distributed/scenarios/table-distribution-helpers-segment-3.js
2. test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js
3. work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/scenarios/table-distribution-helpers-segment-3.js`, `test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`, `work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused table-bootstrap create-timeout recovery`, `regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected scenario admission contracts`, `representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-control-timeout-20260527T223053Z.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown`
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

- [x] action: implementation; owner: startup_readiness_owner; files-changed: test/distributed/scenarios/table-distribution-helpers-segment-3.js, test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js, work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-control-timeout-runtime.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json; validation: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js and parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: verification-fix; owner: startup_readiness_owner; files-changed: test/distributed/scenarios/table-distribution-helpers-segment-3.js, test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js; validation: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js and parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: 4668b9101e8a60884f1364ecb50a78c19919bcdf
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused table-bootstrap create-timeout recovery
2. regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected scenario admission contracts
3. representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-control-timeout-20260527T223053Z.report.json --fast-local --verbose
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json
5. npm run work:scenario-triage -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --markdown
