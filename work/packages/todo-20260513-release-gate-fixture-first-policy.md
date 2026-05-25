# Release Gate Fixture First Policy

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-13",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "release_gate_fixture_first_policy",
    "dominantReason": "full_harness_reruns_used_as_primary_debug_surface",
    "currentState": "Future release-gate packages need focused fixtures or analyzer proofs before full distributed runs are used for confirmation.",
    "nextAction": "Require future scenario packages to identify the focused fixture, extractor, or missing-tooling gap that proves the architectural edge before representative reruns."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260513-release-gate-fixture-first-policy.md",
      "work/README.md",
      "work/templates/work-package-template.md"
    ],
    "handoffFiles": [
      "work/packages/done-20260511-workflow-tooling-llm-usability.md",
      "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260513-release-gate-fixture-first-policy.md",
      "work/README.md",
      "work/templates/work-package-template.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Future release-gate packages need focused fixtures or analyzer proofs before full distributed runs are used for confirmation."
  },
  "modelFit": {
    "packageClass": "workflow-tooling-governance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate-fixture-first-policy",
    "outputProfile": "medium",
    "escalationTriggers": [
      "policy requires new analyzer implementation",
      "fixture generation mutates representative artifacts"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-fixture-first-policy.md",
        "npm run work:validate -- --entry work/packages/todo-20260513-release-gate-fixture-first-policy.md",
        "git diff --check -- work/packages/todo-20260513-release-gate-fixture-first-policy.md work/README.md work/templates/work-package-template.md"
      ]
    }
  }
}
-->

## Why

Full distributed reruns are necessary confirmation, but they are a poor first
debugging surface for systemic release-gate work. This package makes future
scenario packages identify a focused fixture, extractor, or explicit tooling gap
before they chase another local harness witness.

## Scope Basis

Approved workflow/tooling maintenance under `work/`. This package changes
release-gate proof policy only.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: the package owns package guidance and proof
  ordering.
- Escalation trigger to a heavier lane: implementing analyzers, fixtures, or
  runtime code.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
  and
  `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`.
- Evidence that may be read but not mutated: existing fixture-first proof
  examples and active sprint proof ladder.
- Files explicitly forbidden by this package: `src/`, `test/rebalancer/`,
  `test/control-plane/`, active rolling-restart package/sprint files, and
  representative report artifacts.
- Runtime architecture ideas captured as contract/backlog items: no runtime
  implementation here.
- Activation rule before any runtime/scenario implementation: if no focused
  fixture or extractor exists, create the tooling package before the runtime
  package.

## Required Policy

Future release-gate scenario packages must name:

1. blocker-path ledger row being tested
2. architecture contract or explicit contract gap
3. focused fixture, analyzer, or probe command
4. exact observable transition expected in that focused proof
5. fallback when the focused proof cannot represent the failure
6. representative rerun command used only after focused proof passes

## Rolling-Restart Resume Fixture

For the paused `rolling-restart` sprint, the resumed runtime package must not use
another full distributed run as the first discovery surface. It must first run or
refresh:

1. `node --test test/scripts/priority-recovery-current-artifact-fixture.test.js`
2. `npm run analyze:priority-recovery-residuals -- <latest-active-artifact> --markdown`
3. `npm run analyze:topology-convergence -- <latest-active-artifact> --explain priority_recovery_partition_progress`
4. Focused owner tests for the selected operation-progress transition:
   dispatch, retry, timeout, reconcile, advance, completion, or terminal
   failure.

If the current fixture no longer represents target-owned `PENDING` priority
recovery operations, the first resumed package is fixture/tooling refresh, not a
runtime patch.

## Invariants

1. A full distributed rerun confirms the contract; it does not replace focused
   owner proof.
2. If a focused proof cannot be produced, the next package is tooling or
   architecture, not another broad runtime patch.
3. Fixture data is normalized evidence. It must not be a hand-edited
   success-story artifact.

## Model Fit

- Package class: `workflow-tooling-governance`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `release-gate-fixture-first-policy`
- Owned files: `work/packages/todo-20260513-release-gate-fixture-first-policy.md`, `work/README.md`, `work/templates/work-package-template.md`
- Forbidden files: `src/`, `test/rebalancer/`, `test/control-plane/`,
  representative report artifacts, active rolling-restart package/sprint files
- Frozen decisions: this package defines proof order and does not implement
  analyzers or runtime fixes.
- Escalation triggers: analyzer implementation, fixture generation, runtime
  source edits, or artifact mutation.
- Focused proof: `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-fixture-first-policy.md`, `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-fixture-first-policy.md`, `git diff --check -- work/packages/todo-20260513-release-gate-fixture-first-policy.md work/README.md work/templates/work-package-template.md`

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-fixture-first-policy.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-fixture-first-policy.md`
3. `git diff --check -- work/packages/todo-20260513-release-gate-fixture-first-policy.md work/README.md work/templates/work-package-template.md`
