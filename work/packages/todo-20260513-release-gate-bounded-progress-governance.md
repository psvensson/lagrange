# Release Gate Bounded Progress Governance

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-13",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "release_gate_bounded_progress_governance",
  "dominantReason": "retryable_and_backpressure_states_mistaken_for_closure",
  "currentState": "Future release-gate packages need stricter bounded-progress proof before retryable, backpressure, or accepted residual evidence can be treated as non-frontier.",
  "nextAction": "Add governance that requires a named progress mechanism, maximum bound, proof artifact, and same-frontier fallback before non-green evidence can be classified.",
  "proof": [
    "npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
    "npm run work:validate -- --entry work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
    "git diff --check -- work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/README.md work/templates/work-package-template.md"
  ],
  "writeScope": [
    "work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
    "work/README.md",
    "work/templates/work-package-template.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260512-scenario-causal-closure-governance.md",
    "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
    "work/README.md",
    "work/templates/work-package-template.md"
  ],
  "modelFit": {
    "packageClass": "workflow-tooling-governance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate-bounded-progress-governance",
    "escalationTriggers": [
      "validation requires tracker code changes",
      "policy needs runtime state-machine changes"
    ]
  }
}
-->

## Why

Ping-pong often survives because a package can describe a residual as retryable,
accepted, or backpressured without proving the mechanism that will make it
progress. This package makes that proof explicit and reusable.

## Scope Basis

Approved workflow/tooling maintenance under `work/`. This package changes
release-gate proof policy only.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: the package owns governance text and templates,
  not runtime state machines.
- Escalation trigger to a heavier lane: tracker validation code or runtime
  state-machine implementation is needed.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
  and
  `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`.
- Evidence that may be read but not mutated: existing scenario causal closure
  bounded-progress examples.
- Files explicitly forbidden by this package: `src/`, `test/rebalancer/`,
  `test/control-plane/`, active rolling-restart package/sprint files, and
  representative report artifacts.
- Runtime architecture ideas captured as contract/backlog items: bounded
  progress may create later runtime architecture contracts, but none here.
- Activation rule before any runtime/scenario implementation: runtime work must
  cite the bounded mechanism and maximum bound it implements.

## Required Proof

Before a release-gate package can classify retryable, backpressure, accepted, or
deferred evidence as non-frontier, it must name:

1. mechanism: wake, retry, timeout, reconcile, drain, dispatch, delivery,
   timer, advance, or bounded migration
2. semantic owner responsible for the mechanism
3. maximum cycle, timer, retry, dispatch, or budget bound
4. focused proof command and artifact
5. expected observable transition
6. same-frontier fallback if the bound expires
7. why downstream blockers must remain downstream

## No-More-Symptom Gate

For resumed `rolling-restart` work, bounded-progress proof must reject packages
that only remove one local witness. A runtime package cannot start unless it
names:

1. the repeated causal edge it collapses
2. the prior package history proving that edge repeats
3. the operation-progress state transition it owns
4. the owner-key responsible for the bounded mechanism
5. the maximum owner cycle, timer, retry, dispatch, or budget bound
6. the same-frontier fallback after the bound expires

For the current priority-recovery residual, accepted or retryable `PENDING`
operation evidence stays active until the owner path proves dispatch, retry,
timeout, reconcile, advance, completion, terminal failure, or a bounded
migration with fresh owner evidence.

## Invariants

1. Classification is not closure while a release gate is red.
2. Retryable evidence without a named bound remains an active causal edge.
3. Accepted backpressure must identify who wakes the owner and by when.
4. If no bounded mechanism exists, the next package is architecture or runtime
   owner work, not residual classification.

## Model Fit

- Package class: `workflow-tooling-governance`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `release-gate-bounded-progress-governance`
- Owned files: `work/packages/todo-20260513-release-gate-bounded-progress-governance.md`, `work/README.md`, `work/templates/work-package-template.md`
- Forbidden files: `src/`, `test/rebalancer/`, `test/control-plane/`,
  representative report artifacts, active rolling-restart package/sprint files
- Frozen decisions: this package defines governance only and does not implement
  progress mechanisms.
- Escalation triggers: tracker validation code, runtime state-machine changes,
  or active scenario mutation.
- Focused proof: `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-bounded-progress-governance.md`, `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-bounded-progress-governance.md`, `git diff --check -- work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/README.md work/templates/work-package-template.md`

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-bounded-progress-governance.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-bounded-progress-governance.md`
3. `git diff --check -- work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/README.md work/templates/work-package-template.md`
