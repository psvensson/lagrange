# Theory Loop Mechanism Card Command

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
    "boundary": "mechanism_card_cli",
    "dominantReason": "workflow_improvement",
    "currentState": "The mechanism card contract exists only as planned workflow text; agents still have to synthesize mechanism cards manually.",
    "nextAction": "Add a work:mechanism-card command that emits a structured mechanism card from a package or representative artifact.",
    "predecessor": "work/packages/done-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md",
    "successor": "work/packages/todo-20260528-theory-loop-artifact-compare-invariants.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-mechanism-card.js",
      "test/scripts/work-mechanism-card.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260528-theory-loop-mechanism-card-command.md",
      "work/sprints/active-2026-q2-theory-loop-causal-learning-upgrade.md",
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-mechanism-card.js",
      "test/scripts/work-mechanism-card.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the representative gate and current first frontier active_gate_snapshot_coverage by making mechanism-card generation executable before validators and calibration proof depend on it."
  },
  "modelFit": {
    "packageClass": "workflow-tooling",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "single-command-plus-tests",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "the command requires raw report parsing before canonical summaries are tried",
      "the classifier becomes active-gate-specific",
      "the command changes package tracker state"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "package.json",
        "scripts/list-commands.js",
        "scripts/work-mechanism-card.js",
        "test/scripts/work-mechanism-card.test.js"
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
        "regression: npm test -- test/scripts/work-mechanism-card.test.js",
        "supporting: npm run work:mechanism-card -- work/packages/active-20260528-theory-loop-mechanism-card-command.md",
        "supporting: npm run work:validate -- --entry work/packages/active-20260528-theory-loop-mechanism-card-command.md",
        "supporting: npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-mechanism-card-command.md",
        "supporting: git diff --check -- package.json scripts/list-commands.js scripts/work-mechanism-card.js test/scripts/work-mechanism-card.test.js"
      ]
    }
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-mechanism-card.js",
      "test/scripts/work-mechanism-card.test.js"
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

## Command Contract

`npm run work:mechanism-card -- path-to-artifact-or-package` must print a stable text or JSON card with the fields from the sprint contract. For package input, it should read work-package metadata and existing package sections. For artifact input, it should call or reuse canonical evidence summary and topology/causal extraction before falling back to direct report fields.

## Required Behavior

1. Do not mutate package, sprint, tracker, or artifact files.
2. Emit `unknown` for missing fields instead of inventing proof.
3. Prefer package metadata and canonical extractor output over raw JSON.
4. Include a `candidateMechanisms` list and a `confidence` field.
5. Include a `rejectedMechanisms` list when stable facts contradict an alternative.

## In Scope

1. New CLI script and npm script entry.
2. Command index entry.
3. Focused tests for package input, artifact-summary-shaped input, unknown fields, and non-mutating behavior.

## Out Of Scope

1. Artifact comparison between two reports.
2. Validator enforcement.
3. Runtime implementation or scenario reruns.

## Validation

1. `npm test -- test/scripts/work-mechanism-card.test.js`
2. `npm run work:mechanism-card -- work/packages/active-20260528-theory-loop-mechanism-card-command.md`
3. `npm run work:validate -- --entry work/packages/active-20260528-theory-loop-mechanism-card-command.md`
4. `npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-mechanism-card-command.md`
5. `git diff --check -- package.json scripts/list-commands.js scripts/work-mechanism-card.js test/scripts/work-mechanism-card.test.js`

## Mechanism Card

- Failure mechanism: transition_gap
- Stable facts: command exists and passes unit tests, package files are not mutated
- Changed facts: scripts and index updated to register work:mechanism-card
- Why not the alternatives: observation_gap is rejected because we already have a text template, we just need the execution CLI tool.
- Owner who decides: workflow_tooling_owner
- Current code or workflow action: add a work:mechanism-card command
- Missing transition or missing observation: CLI execution script and npm script entry
- Smallest falsifying probe: npm test -- test/scripts/work-mechanism-card.test.js
- Expected movement: mechanism card prints out cleanly in text or JSON
- Negative result means: command fails or emits incorrect fields
- Escalation rule: human-only review

Theory ledger update is not-applicable because this is workflow tooling and does not affect the runtime.

## Execution Evidence

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: package.json, scripts/list-commands.js, scripts/work-mechanism-card.js, test/scripts/work-mechanism-card.test.js; validation: command and test proof above with parent revalidated focused proof: yes before closure; outcome: success.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: package.json, scripts/list-commands.js, scripts/work-mechanism-card.js, test/scripts/work-mechanism-card.test.js; validation: verifier reruns command on package and active-gate artifact examples, checks no state mutation, and parent revalidated focused proof: yes; outcome: success.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: not needed while sprint remains todo; outcome: success.

## Commit And Push Ledger

1. Focused package commit: 57799f5c9d8b668d71a5c8f659d99a46434dfcdb
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
