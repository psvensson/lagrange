# Experiment Theory Ledger Tracker Integration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-22",
  "lane": "mechanical-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "experiment_theory_tracker_integration",
  "dominantReason": "ledger_memory_must_enter_normal_package_flow",
  "currentState": "Theory-ledger tracker integration is implemented in the current worktree, with schema, context, current-blocker, doctor, template, and focused test coverage green.",
  "nextAction": "Formally close this package or preserve it as implemented evidence during the focused commit/closure decision; do not redo tracker integration unless validation regresses.",
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "stabilityCredit": "instrumentation-only",
  "whyHighestLeverageNow": "This advances the sprint goal of universal owner-contract completion by putting theory memory into normal package flow without replacing representative gates or current-blocker truth.",
  "codeQualityAdmission": {
    "reason": "improves-evidence-fidelity",
    "evidence": "The tracker integration surfaces theory-ledger references in package/context flow while preserving current-blocker and package evidence as canonical."
  },
  "proof": [
    "npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-context.test.js",
    "npm run work:theory-ledger -- validate",
    "npm run work:validate -- --pre-impl work/packages/done-20260522-experiment-theory-ledger-tracker-integration.md"
  ],
  "writeScope": [
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/work-package-schema.js",
    "work/templates/work-package-template.md",
    "work/templates/runtime-owner-package.md",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-context.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "scripts/work-tracker.js",
    "scripts/work-context.js",
    "scripts/work-package-schema.js",
    "work/templates/work-package-template.md",
    "work/templates/runtime-owner-package.md",
    "test/scripts/work-tracker-subagent-ledger.test.js",
    "test/scripts/work-llm-usability-tools.test.js",
    "test/scripts/work-context.test.js",
    "work/packages/done-20260522-experiment-theory-ledger-tracker-integration.md"
  ],
  "modelFit": {
    "packageClass": "mechanical-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "small",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "mechanical edits only; no behavior or ownership decisions",
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
      "Keep docs/templates/schema metadata edits in this Spark-safe package.",
      "Split any runtime or test behavior into a separate package before execution."
    ]
  },
  "predecessor": "work/packages/done-20260522-experiment-theory-ledger-tooling.md",
  "closed": "2026-05-22",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The ledger will only help if it becomes part of normal package flow. This
package owns the tracker integration that prompts agents to cite or update
theory entries at evidence-changing moments without making the ledger a second
current-blocker system.

## Scope Basis

Current sprint focus: universal owner-contract completion and representative
stability. This is mechanical workflow integration after the ledger and tooling
exist.

## Detailed Execution Contract

1. Add optional `theoryLedgerRefs` or equivalent metadata support for packages.
2. Surface related theory IDs in `work:context`, package doctor, and template
   guidance when present.
3. Add closure guidance: update or cite the theory ledger when representative
   evidence changes, an architecture gate selects a route, or a theory is
   falsified/superseded.
4. Add validation warnings, not hard errors, for missing ledger refs on legacy
   packages; avoid blocking unrelated current blocker work.
5. Keep `current-blocker` authoritative for the active next action; the ledger
   is navigation/history only.
6. Tests must prove `work/theory-ledger.md` is advisory by requiring package
   evidence to remain primary for closure/current-blocker decisions.
7. Tests must prove no package is required to invent a theory id when no theory
   entry exists.

## Workflow Lane

- Selected lane: `mechanical-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Package/context tooling can show and validate theory-ledger references without changing current-blocker authority or forcing historical backfill.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `experiment_theory_tracker_integration`
- Route dominant reason: `ledger_memory_must_enter_normal_package_flow`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `mechanical-maintenance`
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

1. scripts/work-tracker.js
2. scripts/work-context.js
3. scripts/work-package-schema.js
4. work/templates/work-package-template.md
5. work/templates/runtime-owner-package.md
6. test/scripts/work-tracker-subagent-ledger.test.js
7. test/scripts/work-llm-usability-tools.test.js
8. test/scripts/work-context.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `mechanical-maintenance`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `small`
- Owned files: `scripts/work-tracker.js`, `scripts/work-context.js`, `scripts/work-package-schema.js`, `work/templates/work-package-template.md`, `work/templates/runtime-owner-package.md`, `test/scripts/work-tracker-subagent-ledger.test.js`, `test/scripts/work-llm-usability-tools.test.js`, `test/scripts/work-context.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-context.test.js`, `npm run work:theory-ledger -- validate`, `npm run work:validate -- --pre-impl work/packages/done-20260522-experiment-theory-ledger-tracker-integration.md`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: mechanical edits only; no behavior or ownership decisions
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Keep docs/templates/schema metadata edits in this Spark-safe package.
2. Split any runtime or test behavior into a separate package before execution.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: added optional `theoryLedgerRefs` to package schema, tracker doctor/current-blocker, work context, templates, and focused tests; ran `npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-context.test.js` and `npm run work:theory-ledger -- validate`; parent revalidated focused proof: yes; next: verification.
- [x] verification-fix: status: validated; evidence: Curie verifier-fixer found no blocking issues and reran `npm run work:theory-ledger -- validate`, targeted ledger tests, and five-package pre-impl validation successfully; changed files: none; parent revalidated focused proof: yes; next: closure decision.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card after ledger refs landed; parent revalidated focused proof: yes; next: validation.

## Validation

1. npm test -- test/scripts/work-tracker-subagent-ledger.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/work-context.test.js
2. npm run work:theory-ledger -- validate
3. npm run work:validate -- --pre-impl work/packages/done-20260522-experiment-theory-ledger-tracker-integration.md

## Commit And Push Ledger

1. Focused package commit: b23a1ab300cc701eeb459ac1eca84bcdcb534107
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
