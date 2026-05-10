# Spec-Led Runtime Modularization High-Level Causal-Analysis Infrastructure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/",
  "owner": "diagnostics_owner",
  "boundary": "causal_analysis_framework",
  "dominantReason": "active_gate_classification_incomplete_requires_causal_model",
  "currentState": "The active-gate snapshot-coverage reachability frontier package is a classification closure, not a runtime resolver. The representative rolling-restart report is still failing with snapshotCoverage=3/5 and residual seed readiness timeout / contact-seed transport-timeout joiners. Before further tactical runtime owner patches, the high-level causal-analysis framework must be established to trace root-cause chains, bound recovery budgets, account for timeout cascades, enumerate failure classes, and define stop conditions for rolling restart.",
  "nextAction": "Establish the causal-analysis infrastructure framework covering all six user-requested capabilities: (1) end-to-end phase model for rolling restart lifecycle, (2) cross-node causal graph capturing dependency chains between components, (3) budget/timeout accounting model tracking resource limits, (4) invariant review for constraint preservation, (5) failure-class taxonomy for normalized failure modes, and (6) architecture-level stop condition definition. Emit canonical causal-analysis schema and decision table suitable for future runtime owner packages.",
  "proof": [
    "npm run work:validate",
    "git diff --check",
    "src/diagnostics/causal-analysis-schema.js defines end-to-end phase model with canonical vocabulary",
    "src/diagnostics/causal-graph-builder.js or equivalent builds cross-node causal chains from report data",
    "src/diagnostics/budget-timeout-accounting.js or equivalent models resource limits and cascade behavior",
    "src/diagnostics/invariant-review.js or equivalent validates constraint preservation",
    "src/diagnostics/failure-class-taxonomy.js or equivalent normalizes failure modes",
    "src/diagnostics/stop-condition-decision.js or equivalent defines architecture-level stop conditions",
    "test/diagnostics/causal-analysis-schema.test.js validates schema, phase model, and decision tables",
    "npm run analyze:causal-model validates both report and failure-bundle inputs",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-causal-analysis.report.json --fast-local --verbose",
    "Scripts produce new causal-analysis artifact; no regressions in topology-convergence analysis"
  ],
  "touchedFiles": [
    "src/diagnostics/causal-analysis-schema.js",
    "src/diagnostics/causal-graph-builder.js",
    "src/diagnostics/budget-timeout-accounting.js",
    "src/diagnostics/invariant-review.js",
    "src/diagnostics/failure-class-taxonomy.js",
    "src/diagnostics/stop-condition-decision.js",
    "src/diagnostics/index.js",
    "scripts/analyze-causal-model.js",
    "test/diagnostics/causal-analysis-schema.test.js",
    "test/diagnostics/causal-graph-builder.test.js",
    "test/diagnostics/budget-timeout-accounting.test.js",
    "test/diagnostics/invariant-review.test.js",
    "test/diagnostics/failure-class-taxonomy.test.js",
    "test/diagnostics/stop-condition-decision.test.js",
    "work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md"
  ],
  "modelFit": {
    "packageClass": "diagnostics-infrastructure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-domain-foundation",
    "ownedDomain": "causal-analysis framework, rolling-restart phase model, cross-node dependency chains, resource budget accounting, failure taxonomy, stop-condition decision tables",
    "forbiddenFiles": [
      "src/control-plane/",
      "src/rebalancer/",
      "src/operations/",
      "test/rebalancer/",
      "test/control-plane/",
      "test/operations/",
      "unrelated sprint/package files"
    ],
    "frozenDecisions": [
      "This package owns infrastructure only; it does not implement runtime owner patches or resolve active-gate fixture regressions",
      "Schema and decision tables must be canonical and reusable by successor runtime packages",
      "Causal-analysis artifacts are read-only views; they do not drive runtime decisions",
      "The framework establishes vocabulary and boundaries but does not change active-gate or other owner behavior"
    ],
    "escalationTriggers": [
      "causal-analysis schema requires runtime owner behavior changes",
      "failure-class taxonomy reveals missing owner boundaries not in current diagnostics",
      "budget/timeout accounting exposes dead-code or orphaned fallback paths in runtime",
      "stop-condition decision table contradicts existing phase model invariants"
    ]
  },
  "doneWhen": [
    "All six user-requested causal-analysis capabilities are modeled in canonical schema/decision tables:",
    "  (1) end-to-end rolling-restart phase model (startup, active-gate, recovery, rebalance, completion)",
    "  (2) cross-node causal graph with dependency-chain vocabulary",
    "  (3) budget/timeout accounting with cascade rules",
    "  (4) invariant review with constraint preservation checks",
    "  (5) failure-class taxonomy with normalized failure modes",
    "  (6) architecture-level stop conditions with decision table",
    "Causal-analysis modules are isolated under src/diagnostics/",
    "Test coverage for schema, graph building, budget accounting, invariant validation, taxonomy, and stop conditions",
    "npm run work:validate and git diff --check pass",
    "Representative rolling-restart proof analysis shows no regressions in topology-convergence",
    "Successor active-gate or other runtime packages can reference causal-analysis schema",
    "Work-package setup notes carry predecessor review/fix evidence; real Subagent Sequencing Ledger is added when the package is activated"
  ],
  "outOfScope": [
    "Runtime owner patches or behavior changes",
    "Active-gate snapshot coverage regressions or fixes",
    "Schema cleanup / alias deletion (that remains deferred until after causal-analysis)",
    "Workflow progress, operation scheduling, or publication ACK convergence implementation",
    "Pro or Enterprise diagnostic features"
  ],
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability-frontier.md",
  "closed": "2026-05-10",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The representative rolling-restart analysis is still failing at the active-gate snapshot-coverage boundary. Earlier packages treated individual owner boundaries in isolation. Before further tactical runtime work, the causal-analysis framework must establish the high-level model that connects all phases, traces cross-node dependencies, accounts for resource constraints, and defines when restart succeeds or enters unrecoverable failure.

This creates the infrastructure and vocabulary that later runtime owner packages will reference.

## Scope Basis

User-requested high-level causal-analysis work:
1. End-to-end phase model for rolling-restart lifecycle
2. Cross-node causal graph capturing dependency chains
3. Budget/timeout accounting model for resource limits
4. Invariant review for constraint preservation
5. Failure-class taxonomy for normalized failure modes
6. Architecture-level stop condition definitions

This is Phase `0.1` internal-coherence infrastructure work in the AGPL repository, foundational for successor runtime owner packages.

## In Scope

1. Define the rolling-restart lifecycle as canonical phases with state transitions.
2. Model cross-node dependencies and causal chains as directed graph vocabulary.
3. Establish resource budgets (timeouts, retry attempts, capacity limits) and cascade behavior.
4. Enumerate invariants that must hold across phases and validate them structurally.
5. Classify all observed failure modes into canonical taxonomy entries.
6. Define architecture-level stop conditions (unrecoverable states, success criteria, etc.).
7. Emit canonical causal-analysis schema suitable for diagnostics readers and future runtime packages.
8. Create decision tables and supporting analysis modules under `src/diagnostics/`.

## Out Of Scope

1. Runtime owner patches or behavior changes to active-gate, operation scheduling, workflow progress, or publication ACK convergence.
2. Active-gate snapshot coverage regressions or fixes; those remain in the frontier package domain.
3. Schema cleanup and alias deletion (deferred until causal-analysis is stable).
4. Harness timeout or report relabeling changes.
5. Pro or Enterprise diagnostic features.

## Model Fit

- Package class: `diagnostics-infrastructure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-domain-foundation`
- Owned domain: causal-analysis framework, rolling-restart phase model, cross-node dependency chains, resource budget accounting, failure taxonomy, stop-condition decision tables.
- Forbidden files: `src/control-plane/`, `src/rebalancer/`, `src/operations/`, test runtime owners, unrelated sprint/package files.
- Frozen decisions: This package owns infrastructure only; it does not implement runtime patches or resolve active-gate regressions. Schema and decision tables are canonical and reusable. Causal-analysis artifacts are read-only diagnostic views. The framework establishes vocabulary and boundaries but does not change owner behavior.
- Escalation triggers: Causal-analysis schema requires runtime behavior changes; failure-class taxonomy reveals missing owner boundaries; budget/timeout accounting exposes dead code or orphaned fallback paths; stop-condition table contradicts existing phase model invariants.
- Focused proof: Create causal-analysis modules under `src/diagnostics/`, write decision tables and test coverage, run `npm run work:validate`, confirm topology-convergence analysis shows no regressions.

## Done When

1. All six user-requested causal-analysis capabilities are modeled in canonical schema/decision tables.
2. Causal-analysis modules are isolated under `src/diagnostics/`.
3. Test coverage for schema, graph building, budget accounting, invariant validation, taxonomy, and stop conditions.
4. `npm run work:validate` and `git diff --check` pass.
5. Representative rolling-restart proof analysis shows no regressions in topology-convergence.
6. Successor runtime packages can reference causal-analysis schema.
7. Work-package setup notes carry predecessor review/fix evidence; real Subagent
   Sequencing Ledger is added when the package is activated.

## Shared Boundary Contract

Semantic owner: `diagnostics_owner`.

Canonical contract shape / vocabulary:
- Rolling-restart lifecycle phase (startup, active-gate-selection, bootstrap-in-flight, bootstrap-ready, convergence-watchdog, rebalance-provisioning, rebalance-placement, rebalance-coordination, rebalance-settled, completion).
- Cross-node causal chain (node-set, dependency edge, cycle detection, critical path).
- Resource budget (timeout milliseconds, retry count, capacity limit, accounting rules, cascade behavior).
- Invariant (constraint name, predicate, failure mode).
- Failure class (canonical name, causation chain, resolution strategy).
- Stop condition (event, outcome, rationale).

Allowed consumers: topology convergence analyzer, failure bundle, causal-analysis tests, future runtime owner diagnostic surfaces, and sprint/package handoff notes.

Prohibited reinterpretations: do not treat causal-analysis schema as runtime decision-making code. Do not allow raw logs or heuristics to override canonicalized failure taxonomy. Do not add fallback or "best guess" failure classification outside the taxonomy.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent rolling-restart-active-causal-review (`8e146807-818f-5f67-ad87-3f29353153ab`) reviewed `work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent rolling-restart-active-causal-ledger-fix (`87f4a58c-0fc2-5c2c-a410-8e2d09afd02e`) fixed `work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md`.
- [x] Implementation subagent recorded:
      Agent rolling-restart-causal-analysis-impl (3e6f5b4d-37a6-5afd-9d76-4f52da9c724b) implemented work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md.

## Implementation Notes

- Added read-only causal-analysis diagnostics under `src/diagnostics/` covering schema,
  graph construction, budget accounting, invariant review, failure taxonomy, stop
  decisions, and the combined API.
- Added `scripts/analyze-causal-model.js` plus `npm run analyze:causal-model` for
  deterministic report/failure-bundle causal-analysis JSON output.
- Added focused `node --test` coverage for every new diagnostics module and CLI output.
- Final review fix: report-side `readinessFailure` now normalizes to canonical
  readiness blocker evidence so report and failure-bundle causal analyses both
  classify `startup_readiness_blocked` and share invariant summary counts.
- Final topology dependency-kind fix: causal graph topology dependency edges now
  use the semantic dependency kind table for publication ACK, priority recovery,
  snapshot coverage, and readiness chain edges instead of defaulting to
  `publication_ack`.
- Latest stop-condition success fix: passed rolling-restart reports now normalize
  a report-success outcome so absent failure-only readiness and budget evidence
  does not create unknown invariants, `healthy` taxonomy reaches
  `all_invariants_passed`, and failed active artifacts still retain
  `active_gate_snapshot_coverage_incomplete`, `startup_readiness_blocked`, and
  `budget_timeout_cascade`.
- Latest failure-bundle provenance fix: causal graph normalization now accepts
  explicit, embedded, and direct failure-bundle evidence without falling back to
  the entire input report; report-only passed canary artifacts now emit
  `generatedFrom.failureBundle=absent`.

## Representative Causal-Analysis Outcome

Command:

```bash
npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json
```

Summary:

- Stop outcome: `widen_architecture_work`.
- Stop condition: `architecture_gap`.
- Dominant failure class: `active_gate_snapshot_coverage_incomplete`.
- First critical path node: `topology:active_gate_snapshot_coverage`.
- Exhausted budget count: `2`.
- Failed invariant count: `1`.

## Validation

- [x] `node --test test/diagnostics/causal-analysis-schema.test.js test/diagnostics/causal-graph-builder.test.js test/diagnostics/budget-timeout-accounting.test.js test/diagnostics/invariant-review.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js test/diagnostics/topology-convergence-graph.test.js`
- [x] `npx eslint src/diagnostics/causal-analysis-schema.js src/diagnostics/causal-graph-builder.js src/diagnostics/budget-timeout-accounting.js src/diagnostics/invariant-review.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js src/diagnostics/index.js scripts/analyze-causal-model.js test/diagnostics/causal-analysis-schema.test.js test/diagnostics/causal-graph-builder.test.js test/diagnostics/budget-timeout-accounting.test.js test/diagnostics/invariant-review.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js`
- [x] `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json`
- [x] `npm --silent run analyze:causal-model -- test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/failure-bundle.json`
- [x] `npm --silent run analyze:causal-model -- test-output/reports/canary-rolling-restart-local-latest.report.json`
- [x] `npm --silent run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json`
- [x] `node scripts/check-guideline-literals.js src/diagnostics/causal-analysis-schema.js src/diagnostics/causal-graph-builder.js src/diagnostics/budget-timeout-accounting.js src/diagnostics/invariant-review.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js src/diagnostics/index.js`
- [x] `node scripts/check-guideline-decision-boundaries.js src/diagnostics/causal-analysis-schema.js src/diagnostics/causal-graph-builder.js src/diagnostics/budget-timeout-accounting.js src/diagnostics/invariant-review.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js src/diagnostics/index.js`
- [x] `npm --silent run audit:runtime-grammar:file -- src/diagnostics/causal-analysis-schema.js src/diagnostics/causal-graph-builder.js src/diagnostics/budget-timeout-accounting.js src/diagnostics/invariant-review.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js src/diagnostics/index.js`
- [x] `git diff --check -- src/diagnostics/causal-analysis-schema.js src/diagnostics/causal-graph-builder.js src/diagnostics/budget-timeout-accounting.js src/diagnostics/invariant-review.js src/diagnostics/failure-class-taxonomy.js src/diagnostics/stop-condition-decision.js src/diagnostics/index.js scripts/analyze-causal-model.js test/diagnostics/causal-analysis-schema.test.js test/diagnostics/causal-graph-builder.test.js test/diagnostics/budget-timeout-accounting.test.js test/diagnostics/invariant-review.test.js test/diagnostics/failure-class-taxonomy.test.js test/diagnostics/stop-condition-decision.test.js work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md package.json`
- [x] `npm run work:current-blocker -- --write`
- [x] `npm run work:validate`
- [x] `npm run work:model-ledger -- record --package work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md --model gpt-5.3-codex --reasoning-effort high --task-class diagnostics-infrastructure --package-class diagnostics-infrastructure --intended-minimum-model gpt-5.3-codex --scope-shape cross-domain-foundation --escalated true --bailout-reason none --outcome architecture-gap-classified --validation-status focused-green-causal-analysis --correction-loops 1 --review-findings 1 --notes causal-analysis-framework-added-with-cli-tests-and-guardrails`
- [x] Final review fix validation: report and failure-bundle analyses both list
      `startup_readiness_blocked` and both report invariant counts
      `failed=1`, `unknown=0`, `passed=5`.
- [x] Final topology dependency-kind fix validation: causal graph builder test
      asserts topology chain dependency kinds for `publication_ack`,
      `priority_recovery`, `snapshot_coverage`, and `readiness`.
- [x] Latest stop-condition success fix validation: canary passed report returns
      stop outcome `complete`, condition `all_invariants_passed`, dominant
      failure class `healthy`, and invariant counts `failed=0`, `unknown=0`;
      active failed report and failure bundle still return
      `widen_architecture_work` with classes
      `active_gate_snapshot_coverage_incomplete`,
      `startup_readiness_blocked`, and `budget_timeout_cascade`.
- [x] Latest failure-bundle provenance fix validation: causal graph builder
      tests prove report-only passed canary input emits
      `generatedFrom.failureBundle=absent`, direct failure-bundle input emits
      `generatedFrom.failureBundle=failure_bundle`, and active failed report /
      failure-bundle causal outputs keep their previously validated blockers and
      architecture-gap outcome.

## Commit And Push Ledger

1. Focused package commit: `90b6fda5`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
