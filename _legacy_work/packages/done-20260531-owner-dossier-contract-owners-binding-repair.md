# Owner Dossier Contract Owners Binding Repair

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-31",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "owner_dossier_contract_binding",
    "dominantReason": "contract_record_lookup_owners_array",
    "currentState": "Package opened with declared owner, boundary, scope, proof, and stop rule.",
    "nextAction": "Teach owner-dossier to bind System Contract Records that declare owner/boundary pairs in the owners array, then prove operation_workflow_owner / rebalancer_handoff resolves architecture/contracts/rolling-restart-rebalancer-handoff.md.",
    "closed": "2026-05-31"
  },
  "scope": {
    "writeScope": [
      "scripts/work-tracker.js",
      "test/scripts/work-owner-dossier.test.js"
    ],
    "handoffFiles": [
      "architecture/contracts/rolling-restart-rebalancer-handoff.md"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "scripts/work-tracker.js",
      "test/scripts/work-owner-dossier.test.js",
      "work/packages/active-20260531-owner-dossier-contract-owners-binding-repair.md",
      "work/sprints/active-2026-q2-rolling-restart-active-gate-resolution.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
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
        "regression: npm test -- test/scripts/work-owner-dossier.test.js",
        "supporting: npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json",
        "supporting: npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md"
      ]
    }
  },
  "boundedExperiment": {
    "hypothesis": "State the experiment hypothesis before implementation.",
    "hypothesisDiscriminator": "Predict the different observable under H1 vs H2 vs H3 before implementation.",
    "expectedMetric": "Name the count, frontier, route, or representative result expected to move.",
    "inheritsFrom": "none",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence"
  },
  "validationTier": "single-owner",
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
    "observedMovement": "Owner-dossier now resolves architecture/contracts/rolling-restart-rebalancer-handoff.md for operation_workflow_owner / rebalancer_handoff by matching validated owners[] records and preferring single-owner records over coupled contracts.",
    "successorReason": "The workflow-tooling lookup drift is repaired; runtime source and representative rerun promotion can resume only through the next package selected by refreshed current-blocker evidence.",
    "nextOwnerBoundary": "operation_workflow_owner / rebalancer_handoff",
    "evidenceArtifact": "architecture/contracts/rolling-restart-rebalancer-handoff.md"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

This package owns workflow_tooling_owner / owner_dossier_contract_binding because the selected evidence routes contract_record_lookup_owners_array there. It must either move that owner contract or preserve the classification before downstream symptoms are patched.

## Scope Basis

Package metadata fixes the owner, boundary, lane, scope, proof, and stop rule before implementation.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.


## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Bounded Experiment

- Hypothesis: State the experiment hypothesis before implementation.
- Hypothesis discriminator: Predict the different observable under H1 vs H2 vs H3 before implementation.
- Expected metric: Name the count, frontier, route, or representative result expected to move.
- Inherits from: `none`
- Timebox: `24h`
- Validation tier: `single-owner`
- Merge requirement: focused test plus canonical route or evidence command
- Redirect rule: same frontier with no metric movement opens/selects an autonomous architecture experiment; human escalation is only for contradictory or blocked evidence
- Subagent sequencing is optional while the experiment stays information-first and avoids runtime contract changes.
- The executor owns the implementation pass; a separate verifier-fixer is required before closure when runtime behavior, tests, scripts, or tracker truth changed.


## In Scope

1. scripts/work-tracker.js
2. test/scripts/work-owner-dossier.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `scripts/work-tracker.js`, `test/scripts/work-owner-dossier.test.js`
- Do-not-edit scope: `src/` outside declared writeScope
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/scripts/work-owner-dossier.test.js`, `npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json`, `npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md`
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

- [x] action: implementation; owner: workflow_tooling_owner; files-changed: scripts/work-tracker.js, test/scripts/work-owner-dossier.test.js, work/packages/active-20260531-owner-dossier-contract-owners-binding-repair.md; validation: npm test -- test/scripts/work-owner-dossier.test.js passed; npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json returned contractRecord architecture/contracts/rolling-restart-rebalancer-handoff.md; npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: Agent Franklin (019e7eab-24ff-7180-bedf-1b823390b182); files-changed: none; validation: npm test -- test/scripts/work-owner-dossier.test.js passed; npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json returned contractRecord architecture/contracts/rolling-restart-rebalancer-handoff.md; npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md passed; npm run work:validate -- --pre-impl work/packages/active-20260531-owner-dossier-contract-owners-binding-repair.md passed; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: npm run work:repair; outcome: validated.

## Commit And Push Ledger

1. Focused package commit: f41c74ce6282f1e5fa6427f050d48cfd979cd6ec
2. Push target: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Pushed: yes 2026-05-31T16:05:40.149Z
## Validation

1. npm test -- test/scripts/work-owner-dossier.test.js
2. npm run work:owner-dossier -- --owner operation_workflow_owner --boundary rebalancer_handoff --json
3. npm run work:contract:check -- architecture/contracts/rolling-restart-rebalancer-handoff.md
