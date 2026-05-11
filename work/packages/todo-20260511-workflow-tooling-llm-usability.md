# Workflow Tooling LLM Usability Slice

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "llm_usability_handoff",
  "dominantReason": "tooling_handoff_false_positive_and_large_context",
  "currentState": "Dedicated workflow-tooling package records the local LLM-usability slice without taking ownership of the active runtime representative package.",
  "nextAction": "Validate the tracker, context, package doctor, representative evidence summary, and harness owner-card guidance.",
  "proof": [
    "node --test test/scripts/work-context.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/summarize-representative-evidence.test.js",
    "npm run work:package:doctor -- work/packages/todo-20260511-workflow-tooling-llm-usability.md",
    "npm run work:evidence-summary -- test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json",
    "npm run work:validate -- --all"
  ],
  "touchedFiles": [
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/summarize-representative-evidence.js",
    "package.json",
    "test/scripts/work-context.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/summarize-representative-evidence.test.js",
    "test/distributed/harness/README.md",
    "work/README.md",
    "work/templates/work-package-template.md",
    "work/packages/todo-20260511-workflow-tooling-llm-usability.md"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "scope expands into runtime active-gate behavior",
      "package doctor becomes a replacement for real subagent sequencing",
      "evidence summary reads raw logs or mutates artifacts"
    ]
  },
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-high-level-causal-analysis-infrastructure.md"
}
-->

## Why

LLM handoffs need compact workflow tooling that does not misclassify generated
current-blocker files, glob-owned dirty paths, or representative evidence.

## Scope Basis

Approved maintenance scope: workflow/package tracking, deterministic diagnostics
summaries, and harness owner-card guidance for existing AGPL test infrastructure.

## In Scope

1. Tracker validation, package doctor, and generated current-blocker handling.
2. Work-context glob labels and dirty-scope glob ownership.
3. Compact representative evidence summary command.
4. Harness owner-card guidance for active-gate, publication, and recovery evidence.
5. Focused script tests and package-script wiring.

## Out Of Scope

1. Runtime active-gate, publication, or recovery behavior changes.
2. Rewriting the staged harness implementation files from the prior package.
3. Replacing mandatory real subagent sequencing with npm scripts.
4. Pro or Enterprise behavior.

## Invariants

1. Generated tracker handoff files are not treated as sprint package files.
2. `touchedFiles` glob patterns are displayed as patterns and match dirty paths.
3. Evidence summaries are deterministic and read-only.
4. Harness README points LLMs to compact owner evidence before large segment files.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Owned files: `scripts/work-tracker.js`, `scripts/work-context.js`, `scripts/summarize-representative-evidence.js`, `package.json`, `test/scripts/*`, `test/distributed/harness/README.md`, `work/packages/todo-20260511-workflow-tooling-llm-usability.md`
- Forbidden files: `src/`, `test/distributed/harness/cluster-segment-2.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Frozen decisions: npm scripts assist workflow checks but do not replace real review/fix/implementation subagents.
- Escalation triggers: runtime behavior changes, raw-log evidence parsing, or package sequencing policy changes.
- Focused proof: `node --test test/scripts/work-context.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/summarize-representative-evidence.test.js`

## Validation

1. Focused script tests.
2. Package doctor on this package.
3. Representative evidence summary fixture command.
4. `npm run work:validate -- --all`.
