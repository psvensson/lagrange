# Workflow Publish Transaction Hardening

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-26",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "markdown_admin_publish_transaction",
    "dominantReason": "manual_workflow_markdown_admin_latency",
    "currentState": "Package closure and publish still require multiple workflow commands plus manual Markdown repair, and the latest close exposed stale current-blocker and commit-ledger friction.",
    "nextAction": "Implement a tool-owned publish transaction that closes packages, refreshes current-blocker, stages the rename/deletion set, records commit/push ledger proof, and reports the next command without manual Markdown edits.",
    "closed": "2026-05-26"
  },
  "scope": {
    "writeScope": [
      "scripts/work-close.js",
      "scripts/work-tracker.js",
      "scripts/work-sprint-remaining.js",
      "scripts/list-commands.js",
      "package.json",
      "work/RULES.md",
      "work/README.md",
      ".kiro/steering/llm/core.md",
      ".kiro/steering/llm/boot.md",
      "test/scripts/work-close.test.js",
      "test/scripts/work-tracker-current-blocker.test.js",
      "work/releases/0.1-dependency-map.md",
      "work/tracks/topology-convergence.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/work-close.js",
      "scripts/work-tracker.js",
      "scripts/work-sprint-remaining.js",
      "scripts/list-commands.js",
      "package.json",
      "work/RULES.md",
      "work/README.md",
      ".kiro/steering/llm/core.md",
      ".kiro/steering/llm/boot.md",
      "test/scripts/work-close.test.js",
      "test/scripts/work-tracker-current-blocker.test.js",
      "work/packages/done-20260526-workflow-publish-transaction-hardening.md",
      "work/sprints/active-2026-q2-workflow-markdown-admin-tooling.md",
      "work/releases/0.1-dependency-map.md",
      "work/tracks/topology-convergence.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "work/packages/active-20260526-workflow-publish-transaction-hardening.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This directly advances the active sprint goal to reduce LLM latency, token use, and source-of-truth drift by hardening the closure/publish transaction where stale generated handoff and manual staging cost appear most often."
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
        "regression: node --test test/scripts/work-close.test.js test/scripts/work-tracker-current-blocker.test.js",
        "regression: npm run work:advance -- --check",
        "supporting: git diff --check -- scripts/work-close.js scripts/work-tracker.js scripts/work-sprint-remaining.js scripts/list-commands.js package.json work/RULES.md work/README.md .kiro/steering/llm/core.md .kiro/steering/llm/boot.md test/scripts/work-close.test.js test/scripts/work-tracker-current-blocker.test.js work/packages/done-20260526-workflow-publish-transaction-hardening.md work/sprints/active-2026-q2-workflow-markdown-admin-tooling.md"
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
  "commitAndPushLedgerRequired": true
}
-->

## Why

Closure/publish is the first workflow transaction to harden because it sits at
the boundary between package Markdown, sprint queue state, generated
current-blocker files, git staging, commit ledger proof, and push follow-up.
When it is not atomic, LLMs must spend extra calls repairing stale handoff,
adding missing headings, staging renamed package files, and re-running
validators.

## Scope Basis

Approved workflow-tooling maintenance under the active Workflow Markdown Admin
Tooling sprint. This package owns the first phase only: the publish/closure
transaction and stale-current-blocker repair path.

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
- Route boundary: `markdown_admin_publish_transaction`
- Route dominant reason: `manual_workflow_markdown_admin_latency`
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

1. scripts/work-close.js
2. scripts/work-tracker.js
3. scripts/work-sprint-remaining.js
4. scripts/list-commands.js
5. package.json
6. work/RULES.md
7. work/README.md
8. .kiro/steering/llm/core.md
9. .kiro/steering/llm/boot.md
10. test/scripts/work-close.test.js
11. test/scripts/work-tracker-current-blocker.test.js

## Out Of Scope

1. src/
2. test/distributed/

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `scripts/work-close.js`, `scripts/work-tracker.js`, `scripts/work-sprint-remaining.js`, `scripts/list-commands.js`, `package.json`, `work/RULES.md`, `work/README.md`, `.kiro/steering/llm/core.md`, `.kiro/steering/llm/boot.md`, `test/scripts/work-close.test.js`, `test/scripts/work-tracker-current-blocker.test.js`
- Do-not-edit scope: `src/`, `test/distributed/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `regression: node --test test/scripts/work-close.test.js test/scripts/work-tracker-current-blocker.test.js`, `regression: npm run work:advance -- --check`, `supporting: git diff --check -- scripts/work-close.js scripts/work-tracker.js scripts/work-sprint-remaining.js scripts/list-commands.js package.json work/RULES.md work/README.md .kiro/steering/llm/core.md .kiro/steering/llm/boot.md test/scripts/work-close.test.js test/scripts/work-tracker-current-blocker.test.js work/packages/done-20260526-workflow-publish-transaction-hardening.md work/sprints/active-2026-q2-workflow-markdown-admin-tooling.md`
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

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: scripts/work-close.js, test/scripts/work-close.test.js, test/scripts/work-tracker-current-blocker.test.js; validation: node --test test/scripts/work-close.test.js test/scripts/work-tracker-current-blocker.test.js; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: npm run work:advance -- --check; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: not-needed.

## Validation

1. regression: node --test test/scripts/work-close.test.js test/scripts/work-tracker-current-blocker.test.js
2. regression: npm run work:advance -- --check
3. supporting: git diff --check -- scripts/work-close.js scripts/work-tracker.js scripts/work-sprint-remaining.js scripts/list-commands.js package.json work/RULES.md work/README.md .kiro/steering/llm/core.md .kiro/steering/llm/boot.md test/scripts/work-close.test.js test/scripts/work-tracker-current-blocker.test.js work/packages/done-20260526-workflow-publish-transaction-hardening.md work/sprints/active-2026-q2-workflow-markdown-admin-tooling.md

## Commit And Push Ledger

1. Focused package commit: b00293624e87de012ab12d2346b950fd09bf39c5
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
