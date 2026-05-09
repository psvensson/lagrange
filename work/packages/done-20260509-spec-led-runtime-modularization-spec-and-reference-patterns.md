# Spec-Led Runtime Modularization Spec And Reference Patterns

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "none",
  "playback": "none",
  "owner": "specification_owner",
  "boundary": "runtime_module_contracts",
  "dominantReason": "rewrite_contracts_not_yet_baselined",
  "currentState": "Spec pack rebaseline defines contract-first owner modules, package activation rules, owner/deletion matrix, and tactical reference mappings before runtime rewrite work starts.",
  "nextAction": "Activate the next queued runtime package with a frozen operation-owner module contract.",
  "proof": [
    "npm run work:validate",
    "git diff --check -- .kiro/specs/spec-led-runtime-modularization work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md roadmap.md"
  ],
  "touchedFiles": [
    ".kiro/specs/spec-led-runtime-modularization/overview.md",
    ".kiro/specs/spec-led-runtime-modularization/requirements.md",
    ".kiro/specs/spec-led-runtime-modularization/design.md",
    ".kiro/specs/spec-led-runtime-modularization/module-contract-template.md",
    ".kiro/specs/spec-led-runtime-modularization/best-of-breed-tactics.md",
    ".kiro/specs/spec-led-runtime-modularization/migration-map.md",
    ".kiro/specs/spec-led-runtime-modularization/tasks.md",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/todo-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-operation-owner-kernel.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-placement-owner-kernel.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-publication-owner-stream.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-projection-readiness-contract.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-diagnostics-harness-consumer.md",
    "work/packages/todo-20260509-spec-led-runtime-modularization-legacy-deletion-proof.md",
    "work/packages/active-20260509-rolling-restart-operation-workflow-timeout-control-plane-publications-stale-progress-reconcile.md",
    "work/packages/done-20260509-rolling-restart-operation-workflow-timeout-control-plane-publications-stale-progress-reconcile.md",
    "work/packages/done-20260509-rolling-restart-operation-workflow-progress-sql-write-operations-dispatch-pending-reentry.md",
    "roadmap.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-legacy-path-deletion-and-proof.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The recent core topology rewrite created a cleaner contract surface, but the
remaining work still has old compatibility branches, shadow diagnostics
grammars, and fallback decisions around operation progress, priority recovery,
placement, publication, readiness, and harness analysis. This package makes the
new sprint explicit and turns the high-level rewrite idea into a contract-first
program.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, the core topology rewrite closure
handoff, and the AGPL-scoped control-plane/runtime surfaces named by
`.kiro/specs/spec-led-runtime-modularization/migration-map.md`.

## In Scope

1. Freeze the modular owner shape: constants, evidence, state, decision,
   effects, ports, adapter, and diagnostics.
2. Tie each rewrite target to an owner, boundary, consumers, and deletion target.
3. Capture tactical inspiration from mature systems as implementation guidance,
   not as copied vocabulary.
4. Create the sprint and package queue with clear activation rules.
5. Add a roadmap pointer and record that human direction activated this sprint
   after the previous active package closed.

## Out Of Scope

1. Runtime behavior changes.
2. Test rewrites beyond tracker/spec validation.
3. Reopening the parked rolling-restart sprint without a fresh owner-boundary
   package.
4. Backfilling subagent, commit, or push proof for todo packages.
5. Pro or Enterprise feature design.

## Invariants

1. Runtime packages must not start until their owner contract is named.
2. Best-of-breed references are tactical guides; local specifications own the
   domain vocabulary.
3. Queued package files stay `todo` until a human activates the package.
4. No package may let diagnostics or harnesses become a mutation owner or
   runtime source of truth.

## Hotspots

1. `.kiro/specs/spec-led-runtime-modularization/`
2. `work/sprints/active-2026-q2-spec-led-runtime-modularization.md`
3. `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`
4. `work/sprints/todo-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`
5. `work/packages/todo-20260509-spec-led-runtime-modularization-*.md`
6. `work/sprints/current-blocker.*`
7. `roadmap.md`

## Shared Boundary Contract

Semantic owner: `specification_owner`.

Canonical contract shape / vocabulary: each owner module must expose normalized
evidence, explicit state vocabulary, a decision table, effect commands, adapter
ports, and read-only diagnostics.

Allowed consumers: future active work packages, code reviewers, implementation
subagents, owner tests, and sprint closure proof.

Prohibited reinterpretations: do not treat this package as runtime proof, do
not skip package activation ledgers, and do not let a reference architecture
override a local spec.

Primary diagnostics / proof surfaces: work tracker validation, diff hygiene,
spec review, and the package queue itself.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: not-needed (`first-package-in-sprint`).
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded:
      Agent Ampere (`019e0b59-45cd-7562-bdfd-93bd8a64cd5d`) implemented
      `work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md`.

## Detection / Analysis Tasks

- [x] Confirm every owner in the migration map has one primary semantic owner.
- [x] Confirm every planned runtime package has one deletion or quarantine
      target.
- [x] Confirm every tactical reference pattern maps to a local design rule.
- [x] Confirm package activation rules preserve current release-gate work.

## Implementation Tasks

- [x] Review `.kiro/specs/spec-led-runtime-modularization/overview.md`.
- [x] Review `.kiro/specs/spec-led-runtime-modularization/requirements.md`.
- [x] Review `.kiro/specs/spec-led-runtime-modularization/design.md`.
- [x] Review `.kiro/specs/spec-led-runtime-modularization/module-contract-template.md`.
- [x] Review `.kiro/specs/spec-led-runtime-modularization/best-of-breed-tactics.md`.
- [x] Review `.kiro/specs/spec-led-runtime-modularization/migration-map.md`.
- [x] Review `.kiro/specs/spec-led-runtime-modularization/tasks.md`.
- [x] Adjust the sprint and package queue if review finds an owner ordering
      problem.

## Validation

1. `npm run work:validate`
2. `npm run work:dirty-scope -- --package work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md`
3. `git diff --check -- .kiro/specs/spec-led-runtime-modularization work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/packages/done-20260509-spec-led-runtime-modularization-spec-and-reference-patterns.md roadmap.md`

## Done When

1. The spec pack and sprint queue validate.
2. The roadmap points at the new sprint without changing the current blocker.
3. Runtime work packages can be activated one by one with clear owner contracts.

## Commit And Push Ledger

- Focused package commit: `fd6c4435`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
