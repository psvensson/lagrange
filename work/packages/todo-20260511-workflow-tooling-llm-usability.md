# Workflow Tooling LLM Usability Slice

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "llm_usability_handoff",
  "dominantReason": "tooling_handoff_false_positive_and_large_context",
  "currentState": "Dedicated workflow-tooling package records the local LLM-usability slice without taking ownership of the active runtime representative package. The implementation adds schema-backed package scaffolding, doctor suggestions, combined LLM start handoff, owner-file discovery, residual extraction, subagent prompt generation, and oversized-file extraction candidates.",
  "nextAction": "Validate the tracker, context, package doctor suggestions, scaffolder, LLM-start handoff, owner-file index, priority residual extraction, subagent prompt generator, oversized-file candidates, representative evidence summary, and harness owner-card guidance.",
  "proof": [
    "node --test test/scripts/work-context.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/summarize-representative-evidence.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js",
    "npm run work:package:doctor -- work/packages/todo-20260511-workflow-tooling-llm-usability.md",
    "npm run work:package:doctor -- --suggest work/packages/todo-20260511-workflow-tooling-llm-usability.md",
    "npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260511-workflow-tooling-llm-usability.md",
    "npm run work:package:schema",
    "npm run work:package:new -- --title \"LLM Usability Dry Run\" --slug llm-usability-dry-run --lane lightweight-maintenance --owner workflow_tooling_owner --boundary llm_usability_handoff --dominant-reason scaffolder_dry_run --next-action \"Validate package scaffolding\" --proof \"git diff --check\"",
    "npm run work:llm-start -- --package work/packages/todo-20260511-workflow-tooling-llm-usability.md",
    "npm run analyze:owner-files -- workflow_tooling_owner llm_usability_handoff --markdown",
    "npm run analyze:priority-recovery-residuals -- test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json --markdown",
    "npm run work:subagent-prompt -- --role implementation --package work/packages/todo-20260511-workflow-tooling-llm-usability.md",
    "npm run work:oversized-next -- --top 3 --markdown",
    "npm run work:evidence-summary -- test/scripts/__fixtures__/topology-convergence/active-gate-snapshot-partial-residual.fixture.json",
    "npm run work:validate -- --all"
  ],
  "touchedFiles": [
    "scripts/work-package-schema.js",
    "scripts/work-package-new.js",
    "scripts/work-llm-start.js",
    "scripts/analyze-owner-files.js",
    "scripts/analyze-priority-recovery-residuals.js",
    "scripts/work-subagent-prompt.js",
    "scripts/work-oversized-next.js",
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/summarize-representative-evidence.js",
    "scripts/check-file-size-thresholds.js",
    "scripts/list-commands.js",
    "package.json",
    "test/scripts/work-context.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/summarize-representative-evidence.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/list-commands.test.js",
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
      "evidence summary reads raw logs or mutates artifacts",
      "owner-file or residual extraction tooling mutates runtime artifacts"
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

1. Tracker validation, package doctor suggestions/fix dry-runs, and generated
   current-blocker handling.
2. Work-context glob labels, dirty-scope glob ownership, and combined LLM-start
   handoff.
3. Shared package schema reference and package scaffolder with model-ledger
   Model Fit defaults.
4. Owner-to-files discovery and priority-recovery residual extraction.
5. Subagent prompt generation and oversized-file extraction candidate tooling.
6. Compact representative evidence summary command.
7. Harness owner-card guidance for active-gate, publication, and recovery evidence.
8. Focused script tests and package-script wiring.

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
5. Schema enums used by validation are discoverable before package metadata is
   written.
6. Prompt and doctor helpers assist real subagent sequencing; they do not
   replace real subagents in lanes that require them.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Owned files: `scripts/work-package-schema.js`, `scripts/work-package-new.js`, `scripts/work-llm-start.js`, `scripts/analyze-owner-files.js`, `scripts/analyze-priority-recovery-residuals.js`, `scripts/work-subagent-prompt.js`, `scripts/work-oversized-next.js`, `scripts/work-tracker.js`, `scripts/work-context.js`, `scripts/summarize-representative-evidence.js`, `scripts/check-file-size-thresholds.js`, `scripts/list-commands.js`, `package.json`, `test/scripts/*`, `test/distributed/harness/README.md`, `work/README.md`, `work/templates/work-package-template.md`, `work/packages/todo-20260511-workflow-tooling-llm-usability.md`
- Forbidden files: `src/`, `test/distributed/harness/cluster-segment-2.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Frozen decisions: npm scripts assist workflow checks but do not replace real review/fix/implementation subagents.
- Escalation triggers: runtime behavior changes, raw-log evidence parsing,
  package sequencing policy changes, or artifact mutation from analysis tools.
- Focused proof: `node --test test/scripts/work-context.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/summarize-representative-evidence.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js`

## Validation

1. Focused script tests.
2. Package doctor, doctor suggestions, and doctor fix dry-run on this package.
3. Package schema and scaffolder dry run.
4. LLM-start handoff with explicit package override.
5. Owner-file index fixture command.
6. Priority-recovery residual extraction fixture command.
7. Subagent prompt dry run.
8. Oversized-file extraction candidate command.
9. Representative evidence summary fixture command.
10. `npm run work:validate -- --all`.
