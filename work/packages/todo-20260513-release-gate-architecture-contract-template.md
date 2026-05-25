# Release Gate Architecture Contract Template

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-13",
    "lane": "read-review-doc-only",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "architecture_governance_owner",
    "boundary": "release_gate_architecture_contract_template",
    "dominantReason": "runtime_packages_without_predeclared_owner_contract",
    "currentState": "Future release-gate runtime packages need architecture contracts that collapse repeated owner-boundary failures before code scope is chosen.",
    "nextAction": "Define the architecture contract shape and require it to reconcile with the latest active release-gate proof before any runtime-owner package implements the contract."
  },
  "scope": {
    "writeScope": [
      "work/packages/todo-20260513-release-gate-architecture-contract-template.md",
      "work/README.md",
      "work/templates/work-package-template.md"
    ],
    "handoffFiles": [
      "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
      "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md"
    ],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/todo-20260513-release-gate-architecture-contract-template.md",
      "work/README.md",
      "work/templates/work-package-template.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Future release-gate runtime packages need architecture contracts that collapse repeated owner-boundary failures before code scope is chosen."
  },
  "modelFit": {
    "packageClass": "architecture-contract-governance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "release-gate-architecture-contract-template",
    "outputProfile": "medium",
    "escalationTriggers": [
      "the contract needs runtime implementation",
      "the contract conflicts with active scenario proof"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-architecture-contract-template.md",
        "npm run work:validate -- --entry work/packages/todo-20260513-release-gate-architecture-contract-template.md",
        "git diff --check -- work/packages/todo-20260513-release-gate-architecture-contract-template.md work/README.md work/templates/work-package-template.md"
      ]
    }
  }
}
-->

## Why

The ping-pong pattern is architectural: separate packages can make locally
correct changes while the system still lacks one owner contract for progress,
wake-up, budget, or active-gate dependency. This package defines the contract
shape that must exist before those ideas become runtime packages.

## Scope Basis

Read/review/doc-only architecture governance under `work/`. This package does
not create or edit runtime ADRs outside the work tracker unless a later package
explicitly expands scope.

## Workflow Lane

- Selected lane: `read-review-doc-only`
- Why this lane is sufficient: the package defines the required contract shape
  and activation rules.
- Escalation trigger to a heavier lane: adding tracker enforcement, runtime
  source edits, or scenario evidence mutation.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
  and
  `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`.
- Evidence that may be read but not mutated: the current active sprint's
  systemic execution plan and latest blocker-path evidence.
- Files explicitly forbidden by this package: `src/`, `test/rebalancer/`,
  `test/control-plane/`, the active rolling-restart package, and the active
  rolling-restart sprint.
- Runtime architecture ideas captured as contract/backlog items: operation
  progress kernel, active-gate dependency contract, direct wake-up transport
  contract, budget inheritance, and fixture-first gate policy.
- Activation rule before any runtime/scenario implementation: the contract must
  cite the blocker-path ledger row and the latest active sprint proof it
  reconciles with.

## Contract Shape

Each architecture contract must define:

1. systemic problem statement
2. repeated blocker-path evidence
3. semantic owner
4. canonical states, events, and outcomes
5. allowed producers and consumers
6. prohibited reinterpretations and local fallback paths
7. deterministic progress mechanism
8. bounded-progress budget and wake/retry model
9. diagnostics and analyzer surfaces
10. fixture or focused proof required before runtime work
11. runtime package activation criteria
12. active-sprint reconciliation note naming the latest proof that supersedes
    or confirms the contract

## Priority Recovery Operation-Progress Seed

The first concrete contract to draft from this template should be the
priority-recovery operation-progress contract for resumed `rolling-restart`
work. It should start with:

1. Semantic owner: `operation_workflow_owner`.
2. Contract boundary: one owner-owned path from desired recovery action to
   operation creation or reuse, handoff, dispatch, retry, reconcile, timeout,
   completion, or terminal failure.
3. Canonical states: `needs_operation`, `operation_created`,
   `handoff_pending`, `handoff_acknowledged`, `dispatch_pending`,
   `step_in_progress`, `retry_scheduled`, `blocked`, `completed`, and
   `terminal_failed`.
4. Required diagnostics: desired action, operation id, owner node, coordinator,
   handoff status, workflow step, semantic state, next required action, last
   transition, next wake deadline, attempt count, budget deadline, and blocker
   reason.
5. Prohibited reinterpretations: publication convergence, active-gate, startup
   readiness, rebalancer handoff, or failure-bundle code may observe the owner
   projection but must not independently decide that retryable or backpressure
   evidence is closed.
6. Activation proof: focused priority-recovery fixture and residual extractors
   pass before the resumed runtime package runs the full distributed scenario.

## Invariants

1. Architecture contracts are not implementation permission by themselves.
2. A contract that overlaps the active runtime sprint must reconcile with the
   active sprint's latest evidence before activation.
3. One repeated causal edge maps to one contract owner; local wrappers may
   delegate but must not create separate owner logic.

## Model Fit

- Package class: `architecture-contract-governance`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `release-gate-architecture-contract-template`
- Owned files: `work/packages/todo-20260513-release-gate-architecture-contract-template.md`, `work/README.md`, `work/templates/work-package-template.md`
- Forbidden files: `src/`, `test/rebalancer/`, `test/control-plane/`, active
  rolling-restart package/sprint files
- Frozen decisions: this package defines contracts but does not implement them.
- Escalation triggers: runtime implementation, tracker validation code, or
  conflict with latest active release-gate proof.
- Focused proof: `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-architecture-contract-template.md`, `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-architecture-contract-template.md`, `git diff --check -- work/packages/todo-20260513-release-gate-architecture-contract-template.md work/README.md work/templates/work-package-template.md`

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/todo-20260513-release-gate-architecture-contract-template.md`
2. `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-architecture-contract-template.md`
3. `git diff --check -- work/packages/todo-20260513-release-gate-architecture-contract-template.md work/README.md work/templates/work-package-template.md`
