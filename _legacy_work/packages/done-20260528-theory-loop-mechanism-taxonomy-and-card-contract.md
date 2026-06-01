# Theory Loop Mechanism Taxonomy And Card Contract

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
    "boundary": "theory_loop_mechanism_card_contract",
    "dominantReason": "workflow_improvement",
    "currentState": "The theory loop routes artifacts and owners but does not require a mechanism classification before opening the next implementation package.",
    "nextAction": "Add a general mechanism taxonomy and mechanism-card contract to workflow rules and templates.",
    "successor": "work/packages/todo-20260528-theory-loop-mechanism-card-command.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js"
    ],
    "handoffFiles": [
      "work/sprints/todo-2026-q2-theory-loop-causal-learning-upgrade.md"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md",
      "work/sprints/todo-2026-q2-theory-loop-causal-learning-upgrade.md",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js",
      "test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-fixtures.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "test/distributed/harness/__tests__/table-distribution-helpers-bootstrap-primary-rotation.test.js",
      "test/distributed/harness/cluster-control-snapshot-recovery.js",
      "test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js",
      "test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js",
      "test/distributed/harness/cluster-segment-7-class-4.js",
      "test/distributed/harness/cluster-segment-7-class-5.js",
      "test/distributed/scenarios/table-distribution-helpers-segment-3.js",
      "work/packages/active-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the representative gate and current first frontier active_gate_snapshot_coverage by giving future packages one canonical mechanism vocabulary and card shape before local fixes are selected."
  },
  "modelFit": {
    "packageClass": "workflow-contract-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "rules-and-template-contract",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "the taxonomy needs domain-specific runtime behavior",
      "workflow validation scripts must change before the contract can be expressed",
      "package templates require incompatible schema changes"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "work/RULES.md",
        "work/templates/sprint-strategy-brief.md",
        "work/templates/runtime-owner-package.md",
        "work/templates/scenario-closure-package.md"
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
        "regression: npm run work:validate -- --entry work/packages/active-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md",
        "supporting: npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md",
        "supporting: git diff --check -- work/RULES.md work/templates/sprint-strategy-brief.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md"
      ]
    }
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md"
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

The current loop reliably names artifacts, owners, and boundaries, but it can still open local packages for adjacent symptoms when the missing mechanism has not moved. This package makes the missing mechanism explicit before implementation.

## Mechanism Vocabulary

Use the taxonomy from the sprint file as the canonical starting set: `observation_gap`, `selection_gap`, `admission_gap`, `transition_gap`, `scheduling_gap`, `budget_gap`, `concurrency_gap`, `contract_gap`, `ownership_gap`, and `downstream_symptom`.

## Contract To Add

Add a mechanism-card requirement for non-trivial scenario, runtime, proof, experiment, and workflow-tooling packages. The card must name stable facts, changed facts, rejected alternatives, owner authority, missing transition or observation, smallest probe, expected movement, negative result, and escalation rule.

## In Scope

1. `work/RULES.md` lane and proof guidance for mechanism cards.
2. `work/templates/sprint-strategy-brief.md` systemic insight gate updates.
3. Runtime and scenario package templates that make mechanism cards visible before implementation.

## Out Of Scope

1. Runtime behavior.
2. Work tracker validation logic.
3. New npm commands.
4. Current active sprint or current-blocker edits.

## Validation

1. `npm run work:validate -- --entry work/packages/todo-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md`
2. `npm run work:validate -- --pre-impl work/packages/todo-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md`
3. `git diff --check -- work/RULES.md work/templates/sprint-strategy-brief.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md`

## Execution Evidence

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: work/RULES.md, work/templates/sprint-strategy-brief.md, work/templates/runtime-owner-package.md, work/templates/scenario-closure-package.md; validation: regression: npm run work:validate -- --entry work/packages/active-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md, supporting: npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md, supporting: git diff --check -- work/RULES.md work/templates/sprint-strategy-brief.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md, and parent revalidated focused proof: yes; outcome: done.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: verifier checks taxonomy is general, templates have no placeholders, and parent revalidated focused proof: yes; outcome: done.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: done.

## Commit And Push Ledger

1. Focused package commit: 2258212c866e4ec8d30b5e6b558b66a46710c1c5
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
