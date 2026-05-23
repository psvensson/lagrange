# Lane Model Simplification And Picker

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-23",
    "closed": "2026-05-23",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "lane_model",
    "currentState": "New package scaffolded from the shared work-package schema.",
    "nextAction": "Add canonical lane groups, legacy lane aliases, a work:lane-picker helper, and a work:context recommendation line without breaking existing package validation.",
    "dominantReason": "lane_selection_complexity"
  },
  "scope": {
    "writeScope": [
      "package.json",
      "scripts/work-lane-picker.js",
      "scripts/work-package-schema.js",
      "scripts/work-package-new.js",
      "scripts/work-context.js",
      "scripts/list-commands.js",
      "test/scripts/work-lane-picker.test.js",
      "test/scripts/work-context.test.js",
      "test/scripts/work-llm-usability-tools.test.js",
      "test/scripts/list-commands.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "package.json",
      "scripts/work-lane-picker.js",
      "scripts/work-package-schema.js",
      "scripts/work-package-new.js",
      "scripts/work-context.js",
      "scripts/list-commands.js",
      "test/scripts/work-lane-picker.test.js",
      "test/scripts/work-context.test.js",
      "test/scripts/work-llm-usability-tools.test.js",
      "test/scripts/list-commands.test.js",
      "work/packages/done-20260523-lane-model-simplification-and-picker.md"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "This package is the highest-leverage lane-model simplification before the remaining sprint work because it reduces lane-choice ambiguity while keeping legacy packages valid through aliases.",
    "stabilityCredit": "local-proof-only"
  },
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
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run work:lane-picker -- --docs-only",
        "npm test -- test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js",
        "git diff --check -- package.json scripts/work-lane-picker.js scripts/work-package-schema.js scripts/work-package-new.js scripts/work-context.js scripts/list-commands.js test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js work/packages/done-20260523-lane-model-simplification-and-picker.md"
      ]
    }
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

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
- Route boundary: `lane_model`
- Route dominant reason: `lane_selection_complexity`
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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. package.json
2. scripts/work-lane-picker.js
3. scripts/work-package-schema.js
4. scripts/work-package-new.js
5. scripts/work-context.js
6. scripts/list-commands.js
7. test/scripts/work-lane-picker.test.js
8. test/scripts/work-context.test.js
9. test/scripts/work-llm-usability-tools.test.js
10. test/scripts/list-commands.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `package.json`, `scripts/work-lane-picker.js`, `scripts/work-package-schema.js`, `scripts/work-package-new.js`, `scripts/work-context.js`, `scripts/list-commands.js`, `test/scripts/work-lane-picker.test.js`, `test/scripts/work-context.test.js`, `test/scripts/work-llm-usability-tools.test.js`, `test/scripts/list-commands.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:lane-picker -- --docs-only`, `npm test -- test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js`, `git diff --check -- package.json scripts/work-lane-picker.js scripts/work-package-schema.js scripts/work-package-new.js scripts/work-context.js scripts/list-commands.js test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js work/packages/done-20260523-lane-model-simplification-and-picker.md`
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

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: package.json, scripts/work-lane-picker.js, scripts/work-package-schema.js, scripts/work-context.js, scripts/list-commands.js, test/scripts/work-lane-picker.test.js, test/scripts/work-context.test.js, test/scripts/list-commands.test.js, work/packages/done-20260523-lane-model-simplification-and-picker.md; validation: `npm run work:lane-picker -- --docs-only` pass, `npm test -- test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js` pass 568/568, `git diff --check -- package.json scripts/work-lane-picker.js scripts/work-package-schema.js scripts/work-package-new.js scripts/work-context.js scripts/list-commands.js test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js work/packages/done-20260523-lane-model-simplification-and-picker.md` pass, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: verifier-fixer ran `npm run work:lane-picker -- --docs-only`, `npm test -- test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js`, and scoped `git diff --check`, all pass, parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: current package stayed todo until closure; no generated handoff repair required; outcome: not-needed.

## Theory Ledger Update

- no ledger update: package changes workflow lane selection helpers only, with no runtime theory or scenario evidence change.

## Validation

1. npm run work:lane-picker -- --docs-only
2. npm test -- test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js
3. git diff --check -- package.json scripts/work-lane-picker.js scripts/work-package-schema.js scripts/work-package-new.js scripts/work-context.js scripts/list-commands.js test/scripts/work-lane-picker.test.js test/scripts/work-context.test.js test/scripts/work-llm-usability-tools.test.js test/scripts/list-commands.test.js work/packages/done-20260523-lane-model-simplification-and-picker.md
