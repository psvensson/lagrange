# LLM Steering Context Tightening

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "llm_context_handoff",
  "dominantReason": "overbroad_steering_load",
  "currentState": "AGENTS and work:context expose compact steering and lower-model package lanes, but model-ledger summaries and subagent prompts can still leave escalation open-ended enough that parent sessions inherit a stronger model by default.",
  "nextAction": "Keep work:context compact, make model-ledger summaries report a bounded recommended executor, and make subagent prompts tell parent sessions to set the package target model explicitly.",
  "proof": [
    "npm test -- test/scripts/model-ledger.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/analyze-topology-convergence.test.js",
    "npm run work:package:schema",
    "npm run work:validate -- --entry work/packages/active-20260519-llm-steering-context-tightening.md",
    "git diff --check -- AGENTS.md package.json scripts/analyze-topology-convergence.js scripts/model-ledger.js scripts/work-context.js scripts/work-llm-start.js scripts/work-package-new.js scripts/work-package-route-after-rerun.js scripts/work-package-schema.js scripts/work-subagent-next.js scripts/work-subagent-prompt.js scripts/work-tracker.js src/diagnostics/topology-convergence-graph.js test/scripts/analyze-topology-convergence.test.js test/scripts/model-ledger.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-tracker-subagent-ledger.test.js work/README.md work/packages/active-20260519-llm-steering-context-tightening.md work/templates/work-package-template.md"
  ],
  "writeScope": [
    "AGENTS.md",
    "package.json",
    "scripts/analyze-topology-convergence.js",
    "scripts/model-ledger.js",
    "scripts/work-context.js",
    "scripts/work-llm-start.js",
    "scripts/work-package-new.js",
    "scripts/work-package-route-after-rerun.js",
    "scripts/work-package-schema.js",
    "scripts/work-subagent-next.js",
    "scripts/work-subagent-prompt.js",
    "scripts/work-tracker.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/model-ledger.test.js",
    "test/scripts/work-context.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/README.md",
    "work/templates/work-package-template.md",
    "work/packages/active-20260519-llm-steering-context-tightening.md"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "AGENTS.md",
    "package.json",
    "scripts/analyze-topology-convergence.js",
    "scripts/model-ledger.js",
    "scripts/work-context.js",
    "scripts/work-llm-start.js",
    "scripts/work-package-new.js",
    "scripts/work-package-route-after-rerun.js",
    "scripts/work-package-schema.js",
    "scripts/work-subagent-next.js",
    "scripts/work-subagent-prompt.js",
    "scripts/work-tracker.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/scripts/model-ledger.test.js",
    "test/scripts/work-context.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "work/README.md",
    "work/templates/work-package-template.md",
    "work/packages/active-20260519-llm-steering-context-tightening.md"
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
  }
}
-->

## Why

`AGENTS.md`, `work:context`, and the package tooling are the LLM entrypoints for
this repository. They currently make compact steering available, but the handoff
can still load multiple domain packs as first-read context, `AGENTS.md` repeats
package ceremony that already belongs to validators and templates, and the
schema needs explicit lower-model execution lanes so broad work can split into
mechanical, test-only, bounded experiment, or single-file runtime packages.
The remaining sizing gap is operational: ledger summaries and subagent prompts
must cap escalation to the package target so parent sessions do not quietly
spawn expensive inherited models for bounded work.

## Scope Basis

Human-approved workflow maintenance request: reduce always-on steering load,
separate primary from secondary steering packs, generate task-local active
constraints in `work:context`, and add a proof-gated `bounded-experiment` lane
plus model-fit-first package splitting for same-owner workflow velocity.

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
- Route owner: `workflow_tooling_owner`
- Route boundary: `llm_context_handoff`
- Route dominant reason: `overbroad_steering_load`
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
4. Execution evidence and optional subagent prompts: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Generated handoff repair: `npm run work:repair`.
6. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.
6. Before assigning execution to a lower model, split route selection and ambiguity into the parent package, then create Spark-safe mechanical/test/bounded children or a `gpt-5.4` single-file runtime child.
7. Record closure in `## Execution Evidence`; agent identity is optional provenance and must not be invented.
8. When spawning a subagent, set the package target executor explicitly instead of inheriting a stronger parent model.

## In Scope

1. AGENTS.md
2. package.json
3. scripts/analyze-topology-convergence.js
4. scripts/model-ledger.js
5. scripts/work-context.js
6. scripts/work-llm-start.js
7. scripts/work-package-new.js
8. scripts/work-package-route-after-rerun.js
9. scripts/work-package-schema.js
10. scripts/work-subagent-next.js
11. scripts/work-subagent-prompt.js
12. scripts/work-tracker.js
13. src/diagnostics/topology-convergence-graph.js
14. test/scripts/analyze-topology-convergence.test.js
15. test/scripts/model-ledger.test.js
16. test/scripts/work-context.test.js
17. test/scripts/work-llm-usability-tools.test.js
18. test/scripts/work-tracker-subagent-ledger.test.js
19. work/README.md
20. work/templates/work-package-template.md
21. work/packages/active-20260519-llm-steering-context-tightening.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `AGENTS.md`, `package.json`, `scripts/analyze-topology-convergence.js`, `scripts/model-ledger.js`, `scripts/work-context.js`, `scripts/work-llm-start.js`, `scripts/work-package-new.js`, `scripts/work-package-route-after-rerun.js`, `scripts/work-package-schema.js`, `scripts/work-subagent-next.js`, `scripts/work-subagent-prompt.js`, `scripts/work-tracker.js`, `src/diagnostics/topology-convergence-graph.js`, `test/scripts/analyze-topology-convergence.test.js`, `test/scripts/model-ledger.test.js`, `test/scripts/work-context.test.js`, `test/scripts/work-llm-usability-tools.test.js`, `test/scripts/work-tracker-subagent-ledger.test.js`, `work/README.md`, `work/templates/work-package-template.md`, `work/packages/active-20260519-llm-steering-context-tightening.md`
- Forbidden files: runtime owner files outside `src/diagnostics/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/model-ledger.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/analyze-topology-convergence.test.js`, `npm run work:package:schema`, `git diff --check -- AGENTS.md package.json scripts/analyze-topology-convergence.js scripts/model-ledger.js scripts/work-context.js scripts/work-llm-start.js scripts/work-package-new.js scripts/work-package-route-after-rerun.js scripts/work-package-schema.js scripts/work-subagent-next.js scripts/work-subagent-prompt.js scripts/work-tracker.js src/diagnostics/topology-convergence-graph.js test/scripts/analyze-topology-convergence.test.js test/scripts/model-ledger.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-tracker-subagent-ledger.test.js work/README.md work/packages/active-20260519-llm-steering-context-tightening.md work/templates/work-package-template.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: mechanical workflow/tooling edits only; no runtime behavior or ownership decisions.
- Spawn rule: set the subagent model explicitly to `gpt-5.3-codex-spark`; do not inherit a stronger parent model.
- Safe to execute when:
1. Owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared.
2. The executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence.
3. The focused script tests and package validators give a clear pass, fail, or escalate signal.
- Split or escalate when:
1. Runtime ownership changes.
2. Workflow tooling needs to decide a live scenario route instead of shaping package metadata.
3. The implementation expands outside package schema, scaffolder, validator, docs, templates, and focused tests.
- Candidate lower-model child packages:
1. `mechanical-maintenance` for docs/templates/schema/metadata.
2. `test-only-proof` for tests and fixtures.
3. `bounded-experiment` for one same-owner hypothesis.
4. `single-file-runtime` for one preselected runtime file under `gpt-5.4`.

## Execution Evidence

- [x] implementation: status: validated; evidence: focused tests, schema render, entry/pre-impl validators, doctor, `work:repair`, current active package pre-impl validation, subagent prompt generation, and scoped diff check passed; parent revalidated focused proof: yes; next: workflow package can close after focused commit/push.

## Validation

1. PASS - `npm test -- test/scripts/model-ledger.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-tracker-subagent-ledger.test.js test/scripts/analyze-topology-convergence.test.js` passed 554/554.
2. PASS - `npm run work:package:schema` rendered the shared schema with lower-model lanes, the `bounded-experiment` lane, the `single-file-runtime` lane, `modelFitSplit`, and explicit target-executor spawn guidance.
3. PASS - `npm run work:validate -- --entry work/packages/active-20260519-llm-steering-context-tightening.md`.
4. PASS - `npm run work:validate -- --pre-impl work/packages/active-20260519-llm-steering-context-tightening.md`.
5. PASS - `npm run work:package:doctor -- --suggest work/packages/active-20260519-llm-steering-context-tightening.md`.
6. PASS - `git diff --check -- AGENTS.md package.json scripts/analyze-topology-convergence.js scripts/model-ledger.js scripts/work-context.js scripts/work-llm-start.js scripts/work-package-new.js scripts/work-package-route-after-rerun.js scripts/work-package-schema.js scripts/work-subagent-next.js scripts/work-subagent-prompt.js scripts/work-tracker.js src/diagnostics/topology-convergence-graph.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/scripts/analyze-topology-convergence.test.js test/scripts/model-ledger.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-tracker-subagent-ledger.test.js work/README.md work/packages/active-20260519-llm-steering-context-tightening.md work/packages/active-20260519-topology-publication-active-gate-handoff-fixture-runtime.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md work/templates/work-package-template.md`.
7. PASS - `npm run work:repair` refreshed generated current-blocker files and passed freshness checks.
8. PASS - `npm run work:validate -- --pre-impl work/packages/active-20260519-topology-publication-active-gate-handoff-fixture-runtime.md` proves the current runtime package is not blocked by legacy process ledgers before implementation.
9. PASS - `npm run work:advance -- --check` reports `Next required subagent role: none`, `Implementation proof recorded`, and clean entry/pre-implementation validation for the current runtime package.
10. PASS - `npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260519-topology-publication-active-gate-handoff-fixture-runtime.md` emits `Spawn/execution model: gpt-5.3-codex`, explicit non-inheritance guidance, and `## Execution Evidence` ledger guidance.
11. PASS - `npm run work:model-ledger -- summary` reports bounded executor guidance for recent entries.
