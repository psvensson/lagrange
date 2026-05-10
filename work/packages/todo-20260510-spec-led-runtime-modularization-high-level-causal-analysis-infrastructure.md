# Spec-Led Runtime Modularization High-Level Causal-Analysis Infrastructure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
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
    "work/packages/todo-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md"
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
  "setupSubagentNotes": [
    "Agent rolling-restart-causal-review (rolling-restart-causal-review) reviewed predecessor/setup; result fixes-required.",
    "Agent rolling-restart-causal-package-fix (rolling-restart-causal-package-fix) fixed package setup."
  ],
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability-frontier.md"
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

## Setup Subagent Notes

- [x] Review subagent recorded:
      Agent rolling-restart-causal-review (rolling-restart-causal-review) reviewed
      predecessor/setup; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed:
      Agent rolling-restart-causal-package-fix (rolling-restart-causal-package-fix) fixed
      package setup.

Implementation subagent is pending package activation. When this package moves
to `active-...`, replace these setup notes with the required real Subagent
Sequencing Ledger and have the implementation subagent record its identity
after it implements the causal-analysis infrastructure modules under
`src/diagnostics/`.
