# Rolling Restart Benchmark Table Bootstrap Primary Rotation Runtime

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "runtime-owner-boundary",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json",
    "playback": "none",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_probe_timeout",
    "currentState": "Focused table-bootstrap rotation and repair contracts pass, but the representative rerun returned the same partition-visibility timeout with no repair attempted.",
    "nextAction": "Close as migrated to the active-gate snapshot coverage architecture successor before another local runtime patch.",
    "closed": "2026-05-27",
    "successor": "work/packages/superseded-20260527-rolling-restart-startup-active-gate-owner-snapshot-coverage.md"
  },
  "scope": {
    "writeScope": [
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "handoffFiles": [
      "test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
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
    "theoryLedger": "no ledger update: not-applicable because the focused bootstrap import/test contract did not create or modify a durable theory; representative evidence migrated to the active-gate architecture successor.",
    "proof": {
      "commands": [
        "falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused contract fixture for benchmark table bootstrap primary-rotation transition after control-lane create timeout",
        "regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected consumer proof for rolling-restart and shared benchmark admission contracts",
        "representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --fast-local --verbose"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
        "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
        "work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md",
        "work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
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
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "selectedChoice": "continue-local-proof",
    "nextAction": "Execute the benchmark table bootstrap primary-rotation proof, then rerun rolling-restart before any further local startup-readiness package.",
    "triggerEvidence": [
      "Frontier returned to startup_readiness_owner / startup_support_evidence after recent migrated packages.",
      "Fresh representative evidence moved past active_gate_timed_out and reached a new concrete benchmark_events partition visibility failure.",
      "The failure names lastCreateError on the seed control lane after 15000ms with authoritativeRepairAttempted=false, so the selected local proof is bounded to table bootstrap create-timeout rotation/repair."
    ],
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Patch benchmark table bootstrap to rotate or repair after a control-lane create timeout.",
        "route": "continue-local-proof",
        "proof": [
          "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
          "node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js",
          "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --fast-local --verbose"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Use only if the focused table bootstrap proof cannot move the create-timeout rotation/repair contract inside this owner boundary.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json"
        ]
      }
    ]
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json",
    "routeOwner": "startup_readiness_owner",
    "routeBoundary": "startup_support_evidence",
    "routeDominantReason": "readiness_probe_timeout",
    "routeCausalOutcome": "migrate_owner_boundary",
    "stopMode": "owner_boundary_migration",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Benchmark table bootstrap rotates or repairs after create timeout, partition visibility becomes observable, and rolling-restart moves past the current table visibility blocker.",
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
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json",
    "frontier": "startup_readiness_owner / startup_support_evidence",
    "owner": "startup_readiness_owner",
    "boundary": "startup_support_evidence",
    "dominantReason": "readiness_probe_timeout",
    "nextAction": "Repair benchmark table bootstrap primary rotation after control-lane create timeout."
  },
  "observablePrediction": {
    "metric": "benchmark table bootstrap control-lane timeout recovery",
    "predicted": "A timed-out CREATE TABLE on the initial benchmark bootstrap primary rotates to an alternate query node or triggers authoritative repair before partition visibility times out.",
    "observed": "Focused bootstrap tests passed, but representative rolling-restart still timed out waiting for benchmark_events partition visibility with authoritativeRepairAttempted=false; canonical handoff evidence routes back to startup_active_gate_owner / snapshot_coverage.",
    "accuracy": "missed",
    "evidence": "test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json",
    "metricDelta": 0
  },
  "causalGovernance": {
    "hypothesis": "Rolling restart reaches load admission after active-gate timeout clears, but benchmark table bootstrap stalls because a control-lane CREATE TABLE timeout on the seed does not rotate or repair before partition visibility deadline expires.",
    "stopConditionCheck": "Run npm run analyze:causal-model on test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json before implementation, then rerun focused table bootstrap proof and representative rolling-restart after the fix.",
    "expectedCausalModelChange": "The table bootstrap contract treats control-lane create timeout as bounded recoverable progress, rotating to another query node or applying authoritative repair so benchmark table partition visibility can be observed.",
    "representativeOutcome": "migrated",
    "causalDebt": "Representative failure reached benchmark_events bootstrap and timed out waiting for partition visibility with lastCreateError on seed control lane after 15000ms and authoritativeRepairAttempted=false.",
    "crossBoundaryReview": "Do not change active-gate snapshot coverage, publication convergence, operation workflow, node startup internals, or timeout budgets; this package only changes benchmark table bootstrap control-node recovery and focused tests."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart benchmark table bootstrap primary rotation",
    "phaseChain": [
      "owner-recovery reconcile package cleared active_gate_timed_out",
      "fresh representative rolling-restart reached load-readiness table bootstrap",
      "benchmark_events partition visibility timed out after a seed control-lane CREATE TABLE timeout",
      "authoritativeRepairAttempted was false and partition visibility stayed none"
    ],
    "currentFirstFrontier": "startup_readiness_owner / startup_support_evidence / readiness_probe_timeout",
    "knownDownstreamBlockers": [
      "rolling restart cannot start benchmark load until benchmark_events partition visibility is established",
      "priority recovery residual witnesses remain zero"
    ],
    "missingCausalEdge": "Benchmark table bootstrap does not make bounded progress after a control-lane create timeout on the selected primary.",
    "missingCausalEdgeProbe": "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "falsifyingProbe": "node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
    "boundedProgressProof": "Focused tests prove create-timeout bootstrap either rotates to another query node or applies authoritative repair before partition visibility deadline; affected scenario tests keep rolling-restart and node-join-under-load admission behavior intact.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json",
    "expectedObservableTransition": "Focused table bootstrap proof passes and representative rolling-restart moves past the benchmark_events partition visibility timeout, migrates, or becomes green.",
    "maxProgressBound": "one startup readiness/support table-bootstrap runtime package; no timeout-budget increase",
    "sameFrontierFallback": "If focused proof passes but representative rerun returns the same table bootstrap timeout with no rotation/repair metric movement, stop for an autonomous architecture experiment.",
    "expectedNextFrontier": "representative-green, migrated frontier, or reduced table bootstrap residual",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "done-20260527-rolling-restart-active-gate-snapshot-coverage-post-owner-recovery-route.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260527-rolling-restart-benchmark-load-admission-runtime.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "Allowed because fresh evidence moved past the previous active_gate_timed_out blocker and exposes a concrete table bootstrap create-timeout failure.",
    "handoffInvariant": "Bootstrap mutation recovery may rotate or repair query nodes, but must not widen scenario timeout budgets or bypass required partition visibility."
  },
  "theoryLedger": "no ledger update: not-applicable because the focused bootstrap import/test contract did not create or modify a durable theory; representative evidence migrated to the active-gate architecture successor.",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md",
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

Package metadata fixes the owner, boundary, lane, scope, proof, and stop rule before implementation.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_readiness_owner / startup_support_evidence emits Allow benchmark table bootstrap to rotate or repair after control-lane create timeouts so rolling-restart load admission can establish partition visibility. for readiness_probe_timeout.
- Inputs/signals: falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused contract fixture for benchmark table bootstrap primary-rotation transition after control-lane create timeout; regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected consumer proof for rolling-restart and shared benchmark admission contracts; representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --fast-local --verbose.
- State model or invariant: The startup_readiness_owner / startup_support_evidence decision table in the Causal Decision Contract maps readiness_probe_timeout and route evidence to one emitted outcome: Allow benchmark table bootstrap to rotate or repair after control-lane create timeouts so rolling-restart load admission can establish partition visibility..
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_readiness_owner / startup_support_evidence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_readiness_owner / startup_support_evidence / readiness_probe_timeout | startup_readiness_owner owns this decision before downstream consumers reinterpret it | Allow benchmark table bootstrap to rotate or repair after control-lane create timeouts so rolling-restart load admission can establish partition visibility. | Benchmark table bootstrap rotates or repairs after create timeout, partition visibility becomes observable, and rolling-restart moves past the current table visibility blocker. | falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused contract fixture for benchmark table bootstrap primary-rotation transition after control-lane create timeout |
| scope boundary | lane and package scope only | proof that needs do-not-edit scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_readiness_owner / startup_support_evidence directly; it does not patch downstream symptoms or widen do-not-edit scope.
- Falsifying focused probe: `falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused contract fixture for benchmark table bootstrap primary-rotation transition after control-lane create timeout`
- Competing explanations: At minimum compare readiness_probe_timeout against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_readiness_owner / startup_support_evidence still own readiness_probe_timeout, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: readiness_probe_timeout is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused contract fixture for benchmark table bootstrap primary-rotation transition after control-lane create timeout`
- Success metrics: Benchmark table bootstrap rotates or repairs after create timeout, partition visibility becomes observable, and rolling-restart moves past the current table visibility blocker.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --owner startup_readiness_owner --boundary startup_support_evidence --dominant-reason readiness_probe_timeout`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json`
- Expected delta: Benchmark table bootstrap rotates or repairs after create timeout, partition visibility becomes observable, and rolling-restart moves past the current table visibility blocker.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-active-gate-owner-recovery-bounded-return-runtime-20260527T213301Z.report.json`
- Route owner: `startup_readiness_owner`
- Route boundary: `startup_support_evidence`
- Route dominant reason: `readiness_probe_timeout`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `record a concrete artifact, then run npm run work:evidence-summary` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- startup_readiness_owner startup_support_evidence`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md`.
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
3. work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md
4. work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/scenarios/table-distribution-helpers-segment-3.js`, `test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js`, `work/packages/active-20260527-rolling-restart-benchmark-table-bootstrap-primary-rotation-runtime.md`, `work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused contract fixture for benchmark table bootstrap primary-rotation transition after control-lane create timeout`, `regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected consumer proof for rolling-restart and shared benchmark admission contracts`, `representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --fast-local --verbose`
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

- [x] action: implementation; owner: startup_readiness_owner; files-changed: test/distributed/scenarios/table-distribution-helpers-segment-3.js, test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js; validation: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js; outcome: focused rotation and single-node repair contracts pass.
- [x] action: verification-fix; owner: startup_readiness_owner; files-changed: test/distributed/scenarios/table-distribution-helpers-segment-3.js, test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js; validation: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js; representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --fast-local --verbose; outcome: scenario regression passed, representative rerun stayed on the same table partition visibility timeout and routed back to active-gate snapshot coverage.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md, work/sprints/active-2026-q2-rolling-restart-active-gate-theory-loop-resume.md; validation: `npm run work:repair`; outcome: current blocker and sprint truth refreshed with the active architecture successor.

## Commit And Push Ledger

1. Focused package commit: f8ea8205bc2dfe6845b4d511edc3c188e204ad70
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. falsifier: node --test test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js # focused contract fixture for benchmark table bootstrap primary-rotation transition after control-lane create timeout
2. regression: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # affected consumer proof for rolling-restart and shared benchmark admission contracts
3. representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-benchmark-table-bootstrap-primary-rotation-20260527T215357Z.report.json --fast-local --verbose
