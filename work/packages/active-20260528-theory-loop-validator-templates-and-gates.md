# Theory Loop Validator Templates And Gates

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "intent": {
    "opened": "2026-05-28",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "mechanism_card_validator_gate",
    "dominantReason": "workflow_improvement",
    "currentState": "Mechanism cards can be produced by tools, but package readiness still does not require them for non-trivial theory-loop work.",
    "nextAction": "Wire mechanism-card, expected-movement, and negative-learning fields into templates, schema help, and validator checks.",
    "predecessor": "work/packages/done-20260528-theory-loop-artifact-compare-invariants.md",
    "successor": "work/packages/todo-20260528-theory-loop-negative-learning-frontier-history.md"
  },
  "scope": {
    "writeScope": [
      ".kiro/steering/schemas/work-package.schema.json",
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "work/templates/lightweight-maintenance-package.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "test/scripts/work-tracker-mechanism-card-gate.test.js"
    ],
    "handoffFiles": [
      "work/packages/todo-20260528-theory-loop-mechanism-taxonomy-and-card-contract.md",
      "work/packages/todo-20260528-theory-loop-mechanism-card-command.md",
      "work/packages/todo-20260528-theory-loop-artifact-compare-invariants.md"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260528-theory-loop-validator-templates-and-gates.md",
      "work/sprints/active-2026-q2-theory-loop-causal-learning-upgrade.md",
      ".kiro/steering/schemas/work-package.schema.json",
      "scripts/work-package-schema.js",
      "scripts/work-tracker.js",
      "work/templates/lightweight-maintenance-package.md",
      "work/templates/runtime-owner-package.md",
      "work/templates/scenario-closure-package.md",
      "test/scripts/work-tracker-mechanism-card-gate.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This advances the representative gate and current first frontier active_gate_snapshot_coverage by turning mechanism cards from optional prose into a normal package-readiness guard."
  },
  "modelFit": {
    "packageClass": "workflow-validator-maintenance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "schema-validator-template-cutover",
    "outputProfile": "high",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "validator changes reject historical closed packages",
      "schema changes require migration of active packages",
      "mechanism-card enforcement cannot distinguish trivial docs-only packages from theory-loop packages"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        ".kiro/steering/schemas/work-package.schema.json",
        "scripts/work-package-schema.js",
        "scripts/work-tracker.js",
        "work/templates/lightweight-maintenance-package.md",
        "test/scripts/work-tracker-mechanism-card-gate.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "proof": {
      "commands": [
        "regression: npm test -- test/scripts/work-tracker-mechanism-card-gate.test.js",
        "supporting: npm run work:package:schema",
        "supporting: npm run work:validate -- --entry work/packages/active-20260528-theory-loop-validator-templates-and-gates.md",
        "supporting: npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-validator-templates-and-gates.md",
        "supporting: git diff --check -- .kiro/steering/schemas/work-package.schema.json scripts/work-package-schema.js scripts/work-tracker.js work/templates/lightweight-maintenance-package.md test/scripts/work-tracker-mechanism-card-gate.test.js"
      ]
    }
  }
}
-->

## Gate Contract

The validator must require mechanism-card readiness for non-trivial theory-loop packages without breaking docs-only work or historical closed packages. The first enforcement target is active or todo packages in lanes `diagnostic-classification`, `experiment`, `bounded-experiment`, `runtime-owner-boundary`, `scenario-release-gate`, `causal-escalation`, and workflow-tooling maintenance packages that alter theory-loop behavior.

## Required Fields

The schema/help surface should expose a `mechanismCard` metadata object or an equivalent structured section with these stable fields: `failureMechanism`, `stableFacts`, `changedFacts`, `rejectedAlternatives`, `ownerWhoDecides`, `currentAction`, `missingTransitionOrObservation`, `smallestFalsifyingProbe`, `expectedMovement`, `negativeResultMeans`, and `escalationRule`.

## Mechanism Card

- Failure mechanism: transition_gap
- Stable facts: the validator runs on all packages in the workflow.
- Changed facts: validator now validates mechanism-card presence and concrete values for theory-loop packages.
- Why not the alternatives: other lanes don't alter theory loop behavior, so they are excluded to avoid breaking docs-only packages.
- Owner who decides: workflow_tooling_owner
- Current code or workflow action: validate packages using runPackageValidationsSync.
- Missing transition or missing observation: a validation rule that checks for mechanism-card presence and concrete values.
- Smallest falsifying probe: npm test -- test/scripts/work-tracker-mechanism-card-gate.test.js
- Expected movement: 1/8 to 2/8
- Negative result means: rollback package changes
- Escalation rule: human intervention

## In Scope

1. Schema/help updates.
2. Validator checks and doctor suggestions.
3. Template updates.
4. Focused validator tests for pass/fail cases.

## Out Of Scope

1. Current active package migration.
2. Runtime files.
3. Commands that compare artifacts or extract frontier history.

## Validation

1. `npm test -- test/scripts/work-tracker-mechanism-card-gate.test.js`
2. `npm run work:package:schema`
3. `npm run work:validate -- --entry work/packages/active-20260528-theory-loop-validator-templates-and-gates.md`
4. `npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-validator-templates-and-gates.md`
5. `git diff --check -- .kiro/steering/schemas/work-package.schema.json scripts/work-package-schema.js scripts/work-tracker.js work/templates/lightweight-maintenance-package.md work/templates/runtime-owner-package.md work/templates/scenario-closure-package.md test/scripts/work-tracker-mechanism-card-gate.test.js`

## Execution Evidence

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: .kiro/steering/schemas/work-package.schema.json, scripts/work-package-schema.js, scripts/work-tracker.js, work/templates/lightweight-maintenance-package.md, test/scripts/work-tracker-mechanism-card-gate.test.js; validation: npm test -- test/scripts/work-tracker-mechanism-card-gate.test.js, node scripts/work-package-schema.js | grep -A 15 "Mechanism Card"; parent revalidated focused proof: yes before closure; outcome: validated.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: work/packages/active-20260528-theory-loop-validator-templates-and-gates.md; validation: npm run work:validate -- --entry work/packages/active-20260528-theory-loop-validator-templates-and-gates.md && npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-validator-templates-and-gates.md; parent revalidated focused proof: yes; outcome: validated.
- [ ] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: not needed while sprint remains todo; outcome: pending.

## Commit And Push Ledger

- Focused package commit: 0b079df1
- Pushed to: origin/codex/pending-ack-eligibility-filter
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes
