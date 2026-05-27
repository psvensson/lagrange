# Progress Contract Guardrails And Package Templates

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-27",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "progress_contract_guardrails",
    "dominantReason": "stranded_progress_contract_prevention",
    "currentState": "Created todo package for making the progress-contract pattern repeatable in workflow tooling and package templates.",
    "nextAction": "Add workflow guardrails and package prompts that require progress contracts before runtime promotion.",
    "closed": "2026-05-27"
  },
  "scope": {
    "writeScope": [
      "scripts/work-tracker.js",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "src/diagnostics/topology-convergence-constants.js",
      "src/diagnostics/topology-convergence-owner-witness.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "test/scripts/work-tracker-package-doctor-ledger.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/work-tracker.js",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "src/diagnostics/topology-convergence-constants.js",
      "src/diagnostics/topology-convergence-owner-witness.js",
      "test/diagnostics/topology-convergence-graph.test.js",
      "work/packages/active-20260527-progress-contract-guardrails-and-package-templates.md",
      "test/scripts/work-tracker-package-doctor-ledger.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Advances this sprint goal by making the pattern enforceable so later packages do not recreate stranded-progress states."
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
    "theoryLedger": "no-ledger-update",
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "scripts/work-tracker.js",
        "work/RULES.md",
        "work/templates/sprint-strategy-brief.md",
        "test/scripts/work-tracker-package-doctor-ledger.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    },
    "proof": {
      "commands": [
        "regression: npm test -- test/scripts/work-tracker-package-doctor-ledger.test.js",
        "supporting: npm run work:validate -- --entry",
        "supporting: npm run work:validate -- --pre-impl"
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
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "scripts/work-tracker.js",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "test/scripts/work-tracker-package-doctor-ledger.test.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package turns the sprint pattern into reusable workflow rules so future
runtime and scenario packages cannot introduce stranded progress states without
naming wake, retry, terminal, and evidence behavior.

## Scope Basis

Sprint package 2 in
`work/sprints/todo-2026-q2-owner-boundary-progress-contract-transformation.md`;
scope is limited to package schema, validation, template surfaces, and focused
workflow-tooling proof.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `not-applicable: workflow tooling guardrail package has no representative artifact until it changes routing behavior.`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `not-applicable: workflow tooling guardrail package has no representative artifact until it changes routing behavior.`
- Route owner: `workflow_tooling_owner`
- Route boundary: `progress_contract_guardrails`
- Route dominant reason: `stranded_progress_contract_prevention`
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

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest work/packages/todo-20260527-progress-contract-guardrails-and-package-templates.md` or `npm run work:package:schema`.
2. Representative evidence: use the current rolling-restart artifact from `npm run work:context` only when the guardrail changes route behavior; this package normally proves tooling behavior with focused workflow tests.
3. Owner discovery: `npm run analyze:owner-files -- workflow_tooling_owner progress_contract_guardrails`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role verifier-fixer --package work/packages/todo-20260527-progress-contract-guardrails-and-package-templates.md`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to the commands in the Validation section; add representative routing only if the tooling change changes route behavior.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. scripts/work-tracker.js
2. work/RULES.md
3. work/templates/sprint-strategy-brief.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `scripts/work-tracker.js`, `work/RULES.md`, `work/templates/sprint-strategy-brief.md`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/work-tracker-package-doctor-ledger.test.js`, `npm run work:validate -- --entry`, `npm run work:validate -- --pre-impl`
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

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: scripts/work-tracker.js, work/RULES.md, work/templates/sprint-strategy-brief.md, test/scripts/work-tracker-package-doctor-ledger.test.js; validation: npm test -- test/scripts/work-tracker-package-doctor-ledger.test.js; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: npm run work:validate -- --entry; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. npm test -- test/scripts/work-tracker-package-doctor-ledger.test.js
2. npm run work:validate -- --entry
3. npm run work:validate -- --pre-impl

## Commit And Push Ledger

1. Focused package commit: 5a34702239bacbf7f75e37fd985bc1ba8f245e86
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
