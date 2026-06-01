# Theory Loop Artifact Compare Invariants

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
    "boundary": "artifact_compare_invariant_extractor",
    "dominantReason": "workflow_improvement",
    "currentState": "Agents compare representative reruns by hand, so invariant blockers and presentation-only churn are easy to miss.",
    "nextAction": "Add a work:artifact-compare command that reports stable facts, changed facts, invariant blockers, and plausible mechanism movement between two artifacts.",
    "predecessor": "work/packages/done-20260528-theory-loop-mechanism-card-command.md",
    "successor": "work/packages/todo-20260528-theory-loop-validator-templates-and-gates.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-artifact-compare.js",
      "test/scripts/work-artifact-compare.test.js"
    ],
    "handoffFiles": [
      "work/packages/done-20260528-theory-loop-mechanism-card-command.md",
      "test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json",
      "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260528-theory-loop-artifact-compare-invariants.md",
      "work/sprints/active-2026-q2-theory-loop-causal-learning-upgrade.md",
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-artifact-compare.js",
      "test/scripts/work-artifact-compare.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Artifact comparison advances the representative gate and current first frontier active_gate_snapshot_coverage by preventing another local patch when the same facts remain invariant across representative reruns."
  },
  "modelFit": {
    "packageClass": "workflow-tooling",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "single-command-plus-tests",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "the command mutates work state",
      "the comparison requires hard-coded rolling-restart field paths",
      "canonical evidence tools cannot provide enough normalized fields"
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
        "scripts/work-artifact-compare.js",
        "test/scripts/work-artifact-compare.test.js"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "proof": {
      "commands": [
        "regression: npm test -- test/scripts/work-artifact-compare.test.js",
        "supporting: npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
        "supporting: npm run work:validate -- --entry work/packages/active-20260528-theory-loop-artifact-compare-invariants.md",
        "supporting: npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-artifact-compare-invariants.md",
        "supporting: git diff --check -- package.json scripts/list-commands.js scripts/work-artifact-compare.js test/scripts/work-artifact-compare.test.js"
      ]
    }
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "package.json",
      "scripts/list-commands.js",
      "scripts/work-artifact-compare.js",
      "test/scripts/work-artifact-compare.test.js"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Command Contract

`npm run work:artifact-compare -- old-artifact.json new-artifact.json` must print:

1. stable owner, boundary, dominant reason, and mechanism facts;
2. changed metrics and changed route facts;
3. invariant blockers that stayed unchanged;
4. plausible mechanisms ruled in or ruled out;
5. a recommended next loop action: continue local proof, migrate owner, open architecture gate, rerun evidence, or stop as evidence-incomplete.

## Current Calibration Requirement

When run on the two active-gate artifacts named in `handoffFiles`, the command must identify the invariant blocker facts around `owner_reconcile_pending`, `write_deferred`, `enqueued=false`, and `snapshotCoverageNodeCount=1/5`, while also reporting the movement from active-gate attempts `1/8` to `2/8`.

## In Scope

1. New CLI script and npm script entry.
2. Command index entry.
3. Tests for changed facts, stable facts, invariant blockers, unknown fields, and no file mutation.

## Out Of Scope

1. Package validator enforcement.
2. Negative-learning ledger extraction across many packages.
3. Runtime fixes.

## Validation

1. `npm test -- test/scripts/work-artifact-compare.test.js`
2. `npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-snapshot-coverage-retry-cadence-20260528T033446Z.report.json test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json`
3. `npm run work:validate -- --entry work/packages/active-20260528-theory-loop-artifact-compare-invariants.md`
4. `npm run work:validate -- --pre-impl work/packages/active-20260528-theory-loop-artifact-compare-invariants.md`
5. `git diff --check -- package.json scripts/list-commands.js scripts/work-artifact-compare.js test/scripts/work-artifact-compare.test.js`

## Execution Evidence

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: package.json,scripts/list-commands.js,scripts/work-artifact-compare.js,test/scripts/work-artifact-compare.test.js; validation: none; parent revalidated focused proof: yes; outcome: success.
- [x] action: verification-fix; owner: workflow_tooling_owner; files-changed: package.json,scripts/list-commands.js,scripts/work-artifact-compare.js,test/scripts/work-artifact-compare.test.js; validation: none; parent revalidated focused proof: yes; outcome: success.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: none; parent revalidated focused proof: yes; outcome: success.

## Theory Ledger Justification

This package implements workflow comparison tools and does not touch the runtime behavior or code of the database engine, hence it is not-applicable.

## Commit And Push Ledger

1. Focused package commit: 01ab6e937b67fad71838d4093c09166d453bb441
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
