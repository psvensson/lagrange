# Workflow Experiment Lane And Cost Tracking

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-20",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_governance",
  "boundary": "experiment_lane_cost_tracking",
  "dominantReason": "frontier oscillation workflow needs information-first packages, prediction tracking, and cost feedback",
  "currentState": "Workflow governance now has a first-class experiment lane, strict probe validation, experiment closure outcomes, oscillation gates, fixture-first pre-impl proof, semantic decomposition guardrails, and package-cost reporting.",
  "nextAction": "Use the experiment lane, observable predictions, experimentOutcome closure, two-shot same-frontier guard, fixture-first proof, semantic decomposition audit, and package-cost summary on oscillating frontiers.",
  "proof": [
    "npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-architecture-decision-gate.test.js test/scripts/work-llm-usability-tools.test.js",
    "npm test -- test/scripts/check-operation-progress-authority.test.js",
    "node --test test/scripts/analyze-topology-convergence.test.js",
    "node --test test/scripts/priority-recovery-current-artifact-fixture.test.js",
    "npm test -- test/scripts/list-commands.test.js",
    "npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe",
    "npm run audit:operation-progress-authority",
    "npm run work:package:schema",
    "npm run work:package:cost",
    "npm run work:validate -- --entry",
    "npm run work:validate -- --pre-impl",
    "npm run work:validate -- --pre-impl work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "npm run work:validate -- --closure work/packages/done-20260520-workflow-experiment-lane-and-cost-tracking.md",
    "git diff --check"
  ],
  "writeScope": [
    "work/packages/done-20260520-workflow-experiment-lane-and-cost-tracking.md",
    "architecture/current-owner-maps.md",
    "package.json",
    "scripts/check-operation-progress-authority.js",
    "scripts/list-commands.js",
    "scripts/model-ledger.js",
    "scripts/work-package-cost.js",
    "scripts/work-package-new.js",
    "scripts/work-package-schema.js",
    "scripts/work-tracker.js",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/check-operation-progress-authority.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-tracker-architecture-decision-gate.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/tracks/topology-convergence.md",
    "work/README.md",
    "work/templates/probe-package.md",
    "work/templates/work-package-template.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260520-workflow-experiment-lane-and-cost-tracking.md",
    "architecture/current-owner-maps.md",
    "package.json",
    "scripts/check-operation-progress-authority.js",
    "scripts/list-commands.js",
    "scripts/model-ledger.js",
    "scripts/work-package-cost.js",
    "scripts/work-package-new.js",
    "scripts/work-package-schema.js",
    "scripts/work-tracker.js",
    "test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/check-operation-progress-authority.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-tracker-architecture-decision-gate.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md",
    "work/tracks/topology-convergence.md",
    "work/README.md",
    "work/templates/probe-package.md",
    "work/templates/work-package-template.md"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  }
}
-->

## Why

The workflow had experiment vocabulary but runtime-package enforcement kept
oscillating frontiers on patch-oriented proof ladders. This package owns the
workflow schema, validator, scaffolder, templates, and tests that make
information-first packages executable.

## Scope Basis

AGENTS.md permits lightweight maintenance for package tooling and governance.
The write scope stays in workflow scripts, templates, tests, and documentation;
no runtime owner or product behavior changes are included.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs a bounded successor before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_governance`
- Route boundary: `experiment_lane_cost_tracking`
- Route dominant reason: `frontier oscillation workflow needs information-first packages, prediction tracking, and cost feedback`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/done-20260520-workflow-experiment-lane-and-cost-tracking.md
2. package.json
3. scripts/list-commands.js
4. scripts/model-ledger.js
5. scripts/work-package-cost.js
6. scripts/work-package-new.js
7. scripts/work-package-schema.js
8. scripts/work-tracker.js
9. test/scripts/work-llm-usability-tools.test.js
10. test/scripts/work-tracker-architecture-decision-gate.test.js
11. test/scripts/work-tracker-subagent-ledger.test.js
12. work/tracks/topology-convergence.md
13. work/README.md
14. work/templates/probe-package.md
15. work/templates/work-package-template.md
16. architecture/current-owner-maps.md
17. scripts/check-operation-progress-authority.js
18. test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json
19. test/scripts/analyze-topology-convergence.test.js
20. test/scripts/check-operation-progress-authority.test.js
21. work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md
22. work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/done-20260520-workflow-experiment-lane-and-cost-tracking.md`, `architecture/current-owner-maps.md`, `package.json`, `scripts/check-operation-progress-authority.js`, `scripts/list-commands.js`, `scripts/model-ledger.js`, `scripts/work-package-cost.js`, `scripts/work-package-new.js`, `scripts/work-package-schema.js`, `scripts/work-tracker.js`, `test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json`, `test/scripts/analyze-topology-convergence.test.js`, `test/scripts/check-operation-progress-authority.test.js`, `test/scripts/work-llm-usability-tools.test.js`, `test/scripts/work-tracker-architecture-decision-gate.test.js`, `test/scripts/work-tracker-subagent-ledger.test.js`, `work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md`, `work/packages/todo-20260513-priority-recovery-current-artifact-fixture-and-burndown.md`, `work/tracks/topology-convergence.md`, `work/README.md`, `work/templates/probe-package.md`, `work/templates/work-package-template.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-architecture-decision-gate.test.js test/scripts/work-llm-usability-tools.test.js`, `npm test -- test/scripts/check-operation-progress-authority.test.js`, `node --test test/scripts/analyze-topology-convergence.test.js`, `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`, `npm test -- test/scripts/list-commands.test.js`, `npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe`, `npm run audit:operation-progress-authority`, `npm run work:package:schema`, `npm run work:package:cost`, `npm run work:validate -- --entry`, `npm run work:validate -- --pre-impl`, `npm run work:validate -- --pre-impl work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md`, `npm run work:validate -- --closure work/packages/done-20260520-workflow-experiment-lane-and-cost-tracking.md`, `git diff --check`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [x] review: status: not-needed; evidence: lightweight-maintenance lane and write scope permit direct workflow/tooling implementation; next: implementation.
- [x] implementation: status: validated; evidence: targeted workflow tests, semantic audit test, compact fixture tests, schema render, package-cost render, work validation, and `git diff --check` passed; parent revalidated focused proof: yes; next: closure.
- [x] repair: status: not-needed; evidence: active fixture package was intentionally promoted and validated with its focused pre-impl proof; next: validation.

## Validation

1. npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-tracker-architecture-decision-gate.test.js test/scripts/work-llm-usability-tools.test.js
2. npm test -- test/scripts/check-operation-progress-authority.test.js
3. node --test test/scripts/analyze-topology-convergence.test.js
4. node --test test/scripts/priority-recovery-current-artifact-fixture.test.js
5. npm test -- test/scripts/list-commands.test.js
6. npm run analyze:topology-convergence -- test/scripts/__fixtures__/topology-convergence/priority-workflow-dispatch-pending-planned-control-plane-publications.fixture.json --handoff-probe
7. npm run audit:operation-progress-authority
8. npm run work:package:schema
9. npm run work:package:cost
10. npm run work:validate -- --entry
11. npm run work:validate -- --pre-impl
12. npm run work:validate -- --pre-impl work/packages/active-20260513-priority-recovery-current-artifact-fixture-and-burndown.md
13. npm run work:validate -- --closure work/packages/done-20260520-workflow-experiment-lane-and-cost-tracking.md
14. git diff --check
