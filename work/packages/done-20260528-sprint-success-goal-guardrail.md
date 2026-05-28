# Sprint Success Goal Guardrail

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "sprint_closure_validation",
    "dominantReason": "success_metric_drift",
    "currentState": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "nextAction": "Reject sprint closure unless the original sprint success condition itself is met.",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "scripts/work-sprint-advance.js",
      "scripts/work-tracker.js",
      "work/RULES.md",
      "work/README.md",
      "work/templates/sprint-strategy-brief.md",
      "scripts/work-theory-loop.js",
      "test/scripts/work-sprint-advance.test.js",
      "test/scripts/work-theory-loop-hardening.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/work-sprint-advance.js",
      "scripts/work-tracker.js",
      "work/RULES.md",
      "work/README.md",
      "work/templates/sprint-strategy-brief.md",
      "scripts/work-theory-loop.js",
      "test/scripts/work-sprint-advance.test.js",
      "test/scripts/work-theory-loop-hardening.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "regression: node --test test/scripts/work-sprint-advance.test.js test/scripts/work-theory-loop-hardening.test.js"
      ]
    }
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and do-not-edit scope are named",
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "closureSummary": {
    "resultClassification": "classification-only",
    "predictionAccuracy": "matched",
    "observedMovement": "Theory-loop sprint closure now requires Result: success-condition-met, a Matched success condition equal to the original Evidence Anchor success condition, and an original success condition that is not an alternate stop such as architecture-gap, migration, classification, or route selection.",
    "successorReason": "No successor is required; the workflow guardrail now rejects alternate theory-loop sprint success metrics.",
    "nextOwnerBoundary": "none / none",
    "evidenceArtifact": "node --test test/scripts/work-sprint-advance.test.js test/scripts/work-theory-loop-hardening.test.js"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Commit And Push Ledger

1. Focused package commit: 5ff9a54334d76367ab69c17de95e149b765214a5
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Why

This package owns workflow_tooling_owner / sprint_closure_validation because the selected evidence routes success_metric_drift there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Package metadata fixes the owner, boundary, lane, scope, proof, and stop rule before implementation.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.







## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `sprint_closure_validation`
- Route dominant reason: `success_metric_drift`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260528-sprint-success-goal-guardrail.md`, `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260528-sprint-success-goal-guardrail.md`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `record a concrete artifact, then run npm run work:evidence-summary` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- workflow_tooling_owner sprint_closure_validation`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role review --package work/packages/todo-20260528-sprint-success-goal-guardrail.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- none` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. scripts/work-sprint-advance.js
2. scripts/work-tracker.js
3. work/RULES.md
4. work/README.md
5. work/templates/sprint-strategy-brief.md
6. scripts/work-theory-loop.js
7. test/scripts/work-sprint-advance.test.js
8. test/scripts/work-theory-loop-hardening.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `scripts/work-sprint-advance.js`, `scripts/work-tracker.js`, `work/RULES.md`, `work/README.md`, `work/templates/sprint-strategy-brief.md`, `scripts/work-theory-loop.js`, `test/scripts/work-sprint-advance.test.js`, `test/scripts/work-theory-loop-hardening.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `regression: node --test test/scripts/work-sprint-advance.test.js test/scripts/work-theory-loop-hardening.test.js`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and do-not-edit scope are named
- Safe to execute when:
1. owner, boundary, write scope, do-not-edit scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires do-not-edit scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.

## Execution Evidence

theory-ledger: not-needed

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: scripts/work-sprint-advance.js, scripts/work-tracker.js, scripts/work-theory-loop.js, test/scripts/work-sprint-advance.test.js, test/scripts/work-theory-loop-hardening.test.js, work/RULES.md, work/README.md, work/templates/sprint-strategy-brief.md; validation: `npm run work:validate -- --pre-impl work/packages/todo-20260528-sprint-success-goal-guardrail.md`; parent revalidated focused proof: yes; outcome: passed, implemented original-success-condition-only sprint closure guardrail.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: scripts/work-sprint-advance.js, scripts/work-tracker.js, scripts/work-theory-loop.js, test/scripts/work-sprint-advance.test.js, test/scripts/work-theory-loop-hardening.test.js, work/RULES.md, work/README.md, work/templates/sprint-strategy-brief.md; validation: `node --test test/scripts/work-sprint-advance.test.js test/scripts/work-theory-loop-hardening.test.js`; `git diff --check -- scripts/work-sprint-advance.js scripts/work-tracker.js work/RULES.md work/README.md work/templates/sprint-strategy-brief.md scripts/work-theory-loop.js test/scripts/work-sprint-advance.test.js test/scripts/work-theory-loop-hardening.test.js work/packages/todo-20260528-sprint-success-goal-guardrail.md`; parent revalidated focused proof: yes; outcome: passed, focused proof green.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: `npm run work:repair`; outcome: current-blocker refreshed with no diff.

## Validation

1. regression: node --test test/scripts/work-sprint-advance.test.js test/scripts/work-theory-loop-hardening.test.js
