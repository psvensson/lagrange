# Operation Progress Resource And Deterministic Gates

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-20",
  "lane": "causal-escalation",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "operation_progress",
  "dominantReason": "operation_progress_multi_owner",
  "currentState": "Implementation and closure proof are validated; operation_progress owns lifecycle state, retired source vocabulary is removed from source/test/script/owner docs, and rebalancer ordinal wrappers are guarded by the owner-map ledger.",
  "nextAction": "Close this package or route any successor from fresh representative evidence rather than rolling-restart symptom metrics.",
  "proof": [
    "npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js",
    "npm test -- test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "npm test -- test/control-plane/invariant-engine.test.js test/distributed/harness/__tests__/deterministic-simulator.test.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/__tests__/scenario-registry.test.js",
    "npm run test:topology-failure-gates",
    "npm run audit:operation-progress-authority",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js src/control-plane/invariant-engine.js src/invariants/invariant-catalog.js src/diagnostics/topology-convergence-graph.js src/control-plane/priority-recovery-snapshot-stage-8.js",
    "npm run audit:guideline:literals -- scripts/check-operation-progress-authority.js scripts/list-commands.js src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js src/control-plane/invariant-engine.js src/invariants/invariant-catalog.js src/diagnostics/topology-convergence-graph.js src/control-plane/priority-recovery-snapshot-stage-8.js test/distributed/harness/deterministic-simulator.js test/distributed/harness/topology-failure-gate-runner.js scripts/run-topology-failure-gates.js",
    "npm run audit:guideline:decision-boundaries -- scripts/check-operation-progress-authority.js src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js test/distributed/harness/deterministic-simulator.js test/distributed/harness/topology-failure-gate-runner.js scripts/run-topology-failure-gates.js",
    "npm run work:validate -- --entry",
    "npm run work:validate -- --pre-impl",
    "npm run work:validate -- --closure"
  ],
  "writeScope": [
    "work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md",
    "work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "architecture/current-owner-maps.md",
    "package.json",
    "scripts/check-operation-progress-authority.js",
    "scripts/list-commands.js",
    "scripts/run-topology-failure-gates.js",
    "scripts/work-package-schema.js",
    "scripts/work-tracker.js",
    "work/README.md",
    "work/model-ledger.jsonl",
    "work/templates/probe-package.md",
    "src/rebalancer/README.md",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-progress-events.js",
    "src/rebalancer/operation-progress-observer.js",
    "src/rebalancer/operation-progress-store.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-adapter.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/control-plane/invariant-engine.js",
    "src/control-plane/invariant-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-8.js",
    "src/control-plane/topology-operator-witness.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/invariants/invariant-catalog.js",
    "test/rebalancer/operation-lifecycle.test.js",
    "test/rebalancer/operation-progress-store.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
    "test/rebalancer/priority-recovery-topology-timeout-owner-reentry-test-cases.js",
    "test/control-plane/invariant-engine.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/distributed/harness/deterministic-simulator.js",
    "test/distributed/harness/__tests__/deterministic-simulator.test.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/scenario-registry.js",
    "test/distributed/harness/__tests__/scenario-registry.test.js",
    "test/distributed/harness/topology-failure-gate-runner.js",
    "test/distributed/harness/topology-failure-gate-matrix.js",
    "test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json"
  ],
  "handoffFiles": [],
  "generatedFiles": [
    "test-output/reports/topology-failure-gates/latest/invariant-gate.report.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-progress-events.js",
    "src/rebalancer/operation-progress-observer.js",
    "src/rebalancer/operation-progress-store.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-adapter.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/control-plane/topology-operator-witness.js",
    "src/control-plane/invariant-engine.js",
    "src/control-plane/priority-recovery-snapshot-stage-8.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/invariants/invariant-catalog.js"
  ],
  "commitScope": [
    "work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md",
    "work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "architecture/current-owner-maps.md",
    "package.json",
    "scripts/check-operation-progress-authority.js",
    "scripts/list-commands.js",
    "scripts/run-topology-failure-gates.js",
    "scripts/work-package-schema.js",
    "scripts/work-tracker.js",
    "work/README.md",
    "work/model-ledger.jsonl",
    "work/templates/probe-package.md",
    "src/rebalancer/README.md",
    "src/rebalancer/operation-lifecycle.js",
    "src/rebalancer/operation-progress-events.js",
    "src/rebalancer/operation-progress-observer.js",
    "src/rebalancer/operation-progress-store.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-adapter.js",
    "src/rebalancer/operation-workflow-owner-decision.js",
    "src/rebalancer/operation-workflow-owner-constants.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/control-plane/invariant-engine.js",
    "src/control-plane/invariant-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-8.js",
    "src/control-plane/topology-operator-witness.js",
    "src/diagnostics/topology-convergence-graph.js",
    "src/invariants/invariant-catalog.js",
    "test/rebalancer/operation-lifecycle.test.js",
    "test/rebalancer/operation-progress-store.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner-decision.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js",
    "test/rebalancer/priority-recovery-topology-timeout-owner-reentry-test-cases.js",
    "test/control-plane/invariant-engine.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/distributed/harness/deterministic-simulator.js",
    "test/distributed/harness/__tests__/deterministic-simulator.test.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/scenario-registry.js",
    "test/distributed/harness/__tests__/scenario-registry.test.js",
    "test/distributed/harness/topology-failure-gate-runner.js",
    "test/distributed/harness/topology-failure-gate-matrix.js",
    "test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json"
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js",
      "npm run test:topology-failure-gates",
      "npm run work:validate -- --pre-impl"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "rerun-representative-evidence",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "representativeResidual": {
    "status": "architecture-gap",
    "scenario": "architecture-reset",
    "artifact": "work/sprints/current-blocker.md",
    "frontier": "operation_progress",
    "owner": "operation_workflow_owner",
    "boundary": "operation_progress",
    "dominantReason": "operation_progress_multi_owner",
    "nextAction": "Promote operation_progress to a first-class owner resource with invariant and deterministic gate proof."
  },
  "rerunDecision": {
    "sourceArtifact": "work/sprints/current-blocker.md",
    "routeOwner": "operation_workflow_owner",
    "routeBoundary": "operation_progress",
    "routeDominantReason": "operation_progress_multi_owner",
    "routeCausalOutcome": "architecture-gap",
    "stopMode": "architecture-gap-stop",
    "nextLane": "causal-escalation",
    "expectedDelta": "Operation progress is represented by one owner-owned state machine; publication, active-gate, and observation code consume owned outcomes instead of re-deriving lifecycle state; rolling-restart joins a multi-scenario invariant gate.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact work/sprints/current-blocker.md --owner operation_workflow_owner --boundary operation_progress --dominant-reason operation_progress_multi_owner",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-20",
  "commitAndPushLedgerRequired": true
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: operation_workflow_owner / operation_progress emits the package outcome for operation_progress_multi_owner.
- Inputs/signals: npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js; npm run test:topology-failure-gates; npm run work:validate -- --entry.
- State model or invariant: The operation_workflow_owner / operation_progress decision table in the Causal Decision Contract maps operation_progress_multi_owner and route evidence to one emitted outcome: architecture-gap.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the operation_workflow_owner / operation_progress invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | operation_workflow_owner / operation_progress / operation_progress_multi_owner | operation_workflow_owner owns this decision before downstream consumers reinterpret it | Promote operation_progress to an owned resource with a persisted lifecycle state machine, named invariants, deterministic simulation proof, and multi-scenario gate coverage. | Operation progress is represented by one owner-owned state machine; publication, active-gate, and observation code consume owned outcomes instead of re-deriving lifecycle state; rolling-restart joins a multi-scenario invariant gate. | npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies operation_workflow_owner / operation_progress directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`
- Competing explanations: At minimum compare operation_progress_multi_owner against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does operation_workflow_owner / operation_progress still own operation_progress_multi_owner, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: operation_progress_multi_owner is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`
- Success metrics: Operation progress is represented by one owner-owned state machine; publication, active-gate, and observation code consume owned outcomes instead of re-deriving lifecycle state; rolling-restart joins a multi-scenario invariant gate.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner operation_workflow_owner --boundary operation_progress --dominant-reason operation_progress_multi_owner`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Operation progress is represented by one owner-owned state machine; publication, active-gate, and observation code consume owned outcomes instead of re-deriving lifecycle state; rolling-restart joins a multi-scenario invariant gate.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `operation_workflow_owner`
- Route boundary: `operation_progress`
- Route dominant reason: `operation_progress_multi_owner`
- Route causal outcome: `architecture-gap`
- Stop mode: `architecture-gap-stop`
- Next lane: `causal-escalation`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `rerun-representative-evidence`
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

1. work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md
2. work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/tracks/topology-convergence.md
6. architecture/current-owner-maps.md
7. package.json
8. scripts/check-operation-progress-authority.js
9. scripts/list-commands.js
10. scripts/run-topology-failure-gates.js
11. scripts/work-package-schema.js
12. scripts/work-tracker.js
13. work/README.md
14. work/model-ledger.jsonl
15. work/templates/probe-package.md
16. src/rebalancer/README.md
17. src/rebalancer/operation-lifecycle.js
18. src/rebalancer/operation-progress-events.js
19. src/rebalancer/operation-progress-observer.js
20. src/rebalancer/operation-progress-store.js
21. src/rebalancer/operation-workflow-owner.js
22. src/rebalancer/operation-workflow-owner-adapter.js
23. src/rebalancer/operation-workflow-owner-decision.js
24. src/rebalancer/operation-workflow-owner-constants.js
25. src/rebalancer/operation-workflow-owner-ports.js
26. src/rebalancer/operation-workflow-owner-shared.js
27. src/control-plane/invariant-engine.js
28. src/control-plane/invariant-constants.js
29. src/control-plane/priority-recovery-snapshot-stage-8.js
30. src/control-plane/topology-operator-witness.js
31. src/diagnostics/topology-convergence-graph.js
32. src/invariants/invariant-catalog.js
33. test/rebalancer/operation-lifecycle.test.js
34. test/rebalancer/operation-progress-store.test.js
35. test/rebalancer/operation-workflow-owner-adapter.test.js
36. test/rebalancer/operation-workflow-owner-decision.test.js
37. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js
38. test/rebalancer/priority-recovery-topology-timeout-owner-reentry-test-cases.js
39. test/control-plane/invariant-engine.test.js
40. test/diagnostics/topology-convergence-graph.test.js
41. test/distributed/harness/deterministic-simulator.js
42. test/distributed/harness/__tests__/deterministic-simulator.test.js
43. test/distributed/harness/cluster-segment-7-class-4.js
44. test/distributed/harness/scenario-registry.js
45. test/distributed/harness/__tests__/scenario-registry.test.js
46. test/distributed/harness/topology-failure-gate-runner.js
47. test/distributed/harness/topology-failure-gate-matrix.js
48. test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js
49. test/scripts/analyze-topology-convergence.test.js
50. test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json

## Out Of Scope

1. Publication-owner, active-gate, readiness, admission, timeout-budget, or symptom-only rolling-restart runtime patches.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md`, `work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/tracks/topology-convergence.md`, `architecture/current-owner-maps.md`, `scripts/list-commands.js`, `scripts/work-package-schema.js`, `scripts/work-tracker.js`, `src/rebalancer/README.md`, `src/rebalancer/operation-lifecycle.js`, `src/rebalancer/operation-workflow-owner-decision.js`, `src/rebalancer/operation-workflow-owner-constants.js`, `src/control-plane/invariant-engine.js`, `src/control-plane/invariant-constants.js`, `src/invariants/invariant-catalog.js`, `test/rebalancer/operation-lifecycle.test.js`, `test/control-plane/invariant-engine.test.js`, `test/distributed/harness/deterministic-simulator.js`, `test/distributed/harness/__tests__/deterministic-simulator.test.js`, `test/distributed/harness/scenario-registry.js`, `test/distributed/harness/__tests__/scenario-registry.test.js`, `test/distributed/harness/topology-failure-gate-matrix.js`, `test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js`
- Forbidden files: publication-owner runtime, active-gate admission, timeout budgets, startup readiness runtime, and guardrail weakening.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`, `npm run test:topology-failure-gates`, `npm run work:validate -- --entry`
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

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [x] review: status: not-needed; evidence: lane permits direct execution in the selected operation_workflow_owner / operation_progress boundary; next: runtime proof.
- [x] implementation: status: validated; evidence: owned `operation_progress` schema/FSM/store/event-log/observer/adapter/effects are wired; retired source vocabulary removal and rebalancer ordinal-file guard are implemented; focused rebalancer test set passed with 259/259 assertions; diagnostics and topology reentry regression passed with 278/278 assertions; invariant and deterministic harness test set passed with 276/276 assertions; topology failure gate runner passed 10/10 scenarios; authority, runtime grammar, literal, and decision-boundary guardrails passed with 0 violations; touched-scope diff check passed; parent revalidated focused proof: yes; next: package closure or fresh representative route.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card; next: validation.

## Validation

1. npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js
2. npm test -- test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
3. npm test -- test/control-plane/invariant-engine.test.js test/distributed/harness/__tests__/deterministic-simulator.test.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/__tests__/scenario-registry.test.js
4. npm run test:topology-failure-gates
5. npm run audit:operation-progress-authority
6. npm run audit:runtime-grammar:file -- src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js src/control-plane/invariant-engine.js src/invariants/invariant-catalog.js src/diagnostics/topology-convergence-graph.js src/control-plane/priority-recovery-snapshot-stage-8.js
7. npm run audit:guideline:literals -- scripts/check-operation-progress-authority.js scripts/list-commands.js src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js src/control-plane/invariant-engine.js src/invariants/invariant-catalog.js src/diagnostics/topology-convergence-graph.js src/control-plane/priority-recovery-snapshot-stage-8.js test/distributed/harness/deterministic-simulator.js test/distributed/harness/topology-failure-gate-runner.js scripts/run-topology-failure-gates.js
8. npm run audit:guideline:decision-boundaries -- scripts/check-operation-progress-authority.js src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js test/distributed/harness/deterministic-simulator.js test/distributed/harness/topology-failure-gate-runner.js scripts/run-topology-failure-gates.js
9. npm run work:validate -- --entry
10. npm run work:validate -- --pre-impl
11. npm run work:validate -- --closure

## Commit And Push Ledger

- Focused package commit: `515aeafb06da9c97dd5526f469c4fa97a8e10e5b`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
