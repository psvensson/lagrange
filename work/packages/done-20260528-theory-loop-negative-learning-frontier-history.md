# Theory Loop Negative Learning Frontier History

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
    "boundary": "negative_learning_frontier_history",
    "dominantReason": "workflow_improvement",
    "currentState": "Closed packages contain useful evidence, but the workflow has no focused command that surfaces mechanisms ruled out, invariant blockers, and repeated owner/boundary history before a new package opens.",
    "nextAction": "Add negative-learning and frontier-history commands that summarize prior package learning before another local patch is selected.",
    "predecessor": "work/packages/done-20260528-theory-loop-validator-templates-and-gates.md",
    "successor": "work/packages/todo-20260528-theory-loop-active-gate-calibration-proof.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-negative-learning.js",
      "scripts/work-frontier-history.js",
      "test/scripts/work-negative-learning.test.js",
      "test/scripts/work-frontier-history.test.js"
    ],
    "handoffFiles": [
      "work/packages/done-20260528-theory-loop-validator-templates-and-gates.md"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md",
      "work/sprints/todo-2026-q2-theory-loop-causal-learning-upgrade.md",
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-negative-learning.js",
      "scripts/work-frontier-history.js",
      "test/scripts/work-negative-learning.test.js",
      "test/scripts/work-frontier-history.test.js",
      "work/packages/active-20260528-theory-loop-negative-learning-frontier-history.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the representative gate and current first frontier active_gate_snapshot_coverage by making prior negative learning and repeated frontier history visible before another local patch is opened."
  },
  "modelFit": {
    "packageClass": "workflow-tooling",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "two-read-only-commands-plus-tests",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "commands need to mutate packages",
      "frontier history requires full raw report parsing instead of package metadata",
      "output cannot distinguish repeated frontier from repeated mechanism"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "not-applicable: this package adds workflow memory tooling only and does not change the current runtime theory.",
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "package.json",
        "scripts/list-commands.js",
        "scripts/work-negative-learning.js",
        "scripts/work-frontier-history.js",
        "test/scripts/work-negative-learning.test.js",
        "test/scripts/work-frontier-history.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "proof": {
      "commands": [
        "regression: npm test -- test/scripts/work-negative-learning.test.js test/scripts/work-frontier-history.test.js",
        "supporting: npm run work:negative-learning -- --package-dir work/packages --limit 12",
        "supporting: npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
        "supporting: npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md",
        "supporting: npm run work:validate -- --pre-impl work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md",
        "supporting: git diff --check -- package.json scripts/list-commands.js scripts/work-negative-learning.js scripts/work-frontier-history.js test/scripts/work-negative-learning.test.js test/scripts/work-frontier-history.test.js"
      ]
    }
  },
  "theoryLedger": "not-applicable: this package adds workflow memory tooling only and does not change the current runtime theory.",
  "commitAndPushLedgerRequired": true,
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-negative-learning.js",
      "scripts/work-frontier-history.js",
      "test/scripts/work-negative-learning.test.js",
      "test/scripts/work-frontier-history.test.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  }
}
-->

## Mechanism Card

- Failure mechanism: observation_gap
- Stable facts: closed packages contain rich learning and history.
- Changed facts: two new CLI commands summarize this memory and repeated frontier history.
- Why not the alternatives: reading raw package markdown manually in each handoff is slow and prone to overlooking historical patterns.
- Owner who decides: workflow_tooling_owner
- Current code or workflow action: none; human developer reads manually.
- Missing transition or missing observation: a tool to observe past package outcomes, ruled-out mechanisms, and repeated boundary history automatically.
- Smallest falsifying probe: npm test -- test/scripts/work-negative-learning.test.js test/scripts/work-frontier-history.test.js
- Expected movement: 4/8 to 5/8
- Negative result means: rollback tool changes
- Escalation rule: human intervention

## Command Contracts

`npm run work:negative-learning -- --package-dir work/packages --limit 12` must summarize recent package lessons, mechanisms ruled out, invariant facts, and next mechanism to test. It should read metadata and explicit learning sections, not infer undocumented proof.

`npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12` is the calibration command; the implemented command must also accept any owner, boundary, and numeric limit. It must summarize repeated owner/boundary/mechanism history, movement classifications, artifacts, and package outcomes.

## In Scope

1. Two read-only CLI commands.
2. Command index and npm script entries.
3. Tests for extraction, filtering, limit handling, no mutation, and active-gate history examples.

## Out Of Scope

1. Validator enforcement.
2. Runtime behavior.
3. Closing or rerouting existing packages.

## Validation

1. `npm test -- test/scripts/work-negative-learning.test.js test/scripts/work-frontier-history.test.js`
2. `npm run work:negative-learning -- --package-dir work/packages --limit 12`
3. `npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12`
4. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md`
5. `npm run work:validate -- --pre-impl work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md`
6. `git diff --check -- package.json scripts/list-commands.js scripts/work-negative-learning.js scripts/work-frontier-history.js test/scripts/work-negative-learning.test.js test/scripts/work-frontier-history.test.js`

## Execution Evidence

theory-ledger: not-needed

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: package.json, scripts/list-commands.js, scripts/work-negative-learning.js, scripts/work-frontier-history.js, test/scripts/work-negative-learning.test.js, test/scripts/work-frontier-history.test.js; validation: npm test passed with parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: verifier checked recent active-gate packages surface ruled-out witness-selection and retry-cadence-only explanations, and parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: updated automatically; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: b3f16eea9570f2f5fed0c0d4f85a2ea4b50e9974
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
