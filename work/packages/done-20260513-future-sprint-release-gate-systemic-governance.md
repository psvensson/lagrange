# Future Sprint Release Gate Systemic Governance

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "future_sprint_release_gate_governance",
  "dominantReason": "active_blocker_fix_blending_with_systemic_sprint",
  "currentState": "A separate future-sprint governance lane now exists for systemic release-gate improvements. The queue now starts from blocker-path causality, a concrete rolling-restart resume activation brief, reusable architecture contracts, fixture-first evidence, bounded-progress enforcement, and a reconciled runtime architecture backlog instead of package isolation alone.",
  "nextAction": "Activate this package only if the human wants to continue governance/tooling work; execute the blocker-path ledger and rolling-restart resume activation brief before any runtime architecture implementation package is activated.",
  "proof": [
    "npm run work:package:doctor -- --suggest work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md",
    "npm run work:validate -- --entry work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md",
    "npm run work:validate -- --entry work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
    "git diff --check -- work/sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md work/README.md work/templates/work-package-template.md"
  ],
  "writeScope": [
    "work/sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md",
    "work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md",
    "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
    "work/packages/active-20260513-rolling-restart-resume-activation-brief.md",
    "work/packages/todo-20260513-release-gate-architecture-contract-template.md",
    "work/packages/todo-20260513-release-gate-fixture-first-policy.md",
    "work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
    "work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
    "work/README.md",
    "work/templates/work-package-template.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260512-scenario-causal-closure-governance.md",
    "work/packages/done-20260511-workflow-tooling-llm-usability.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md",
    "work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md",
    "work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md",
    "work/packages/active-20260513-rolling-restart-resume-activation-brief.md",
    "work/packages/todo-20260513-release-gate-architecture-contract-template.md",
    "work/packages/todo-20260513-release-gate-fixture-first-policy.md",
    "work/packages/todo-20260513-release-gate-bounded-progress-governance.md",
    "work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md",
    "work/README.md",
    "work/templates/work-package-template.md"
  ],
  "modelFit": {
    "packageClass": "workflow-tooling-governance",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "repo-wide-governance/higher-order-release-gate-contract",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The requested work is intentionally about how future release-gate sprints think
about systemic failures, not another patch on the current rolling-restart
blocker. The recent blocker path is useful evidence because it shows a repeated
causal shape: local packages can reduce one witness while the unresolved owner
contract reappears at a neighboring boundary.

This package makes the future sprint execute from higher-order artifacts first:
a blocker-path ledger, architecture contract templates, fixture-first evidence,
bounded-progress policy, and a runtime architecture backlog that must reconcile
with the latest active scenario proof before implementation starts.

## Scope Basis

Approved workflow/tooling maintenance scope under `work/`. This package is
valid without a roadmap change because it changes internal work tracking,
package templates, and sprint planning only.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: the package edits work-tracking docs, package
  queue files, one sprint plan, and the reusable work-package template. It does
  not implement runtime behavior.
- Escalation trigger to a heavier lane: runtime ownership, shared runtime
  contracts, active scenario evidence mutation, or active rolling-restart
  package/sprint mutation.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`
  and
  `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`.
- Evidence that may be read but not mutated: the recent rolling-restart
  blocker history and predecessor governance packages.
- Files explicitly forbidden by this package: `src/`, `test/rebalancer/`,
  `test/control-plane/`, the active rolling-restart package, and the active
  rolling-restart sprint.
- Runtime architecture ideas captured as contract/backlog items: operation
  progress kernel, active-gate dependency contract, direct wake-up transport
  contract, budget inheritance, and fixture-first gate policy.
- Activation rule before any runtime/scenario implementation: create a later
  `runtime-owner-boundary` or `scenario-release-gate` package only after the
  blocker-path ledger and relevant architecture contract say which repeated
  causal edge the runtime package collapses.

## Higher-Order Execution Contract

Future release-gate sprint execution must start with the whole problem shape,
not the newest local symptom:

1. Record the blocker path before proposing implementation. The ledger must
   show the last several owner-boundary migrations, same-frontier loops,
   downstream blockers, residual semantic states, and the repeated causal edge
   that explains the ping-pong.
2. Convert repeated local fixes into one architecture contract. The contract
   must name the semantic owner, canonical state/progress vocabulary, allowed
   consumers, prohibited reinterpretations, diagnostics, activation criteria,
   and the active scenario proof it reconciles against.
3. Demand a focused fixture or analyzer proof before another distributed rerun
   is used for discovery.
4. Treat retryable, backpressure, or accepted residual evidence as incomplete
   until the package names a bounded wake, retry, timeout, reconcile, drain,
   dispatch, delivery, timer, or advance mechanism and its maximum bound.
5. Activate runtime packages only from the runtime architecture backlog. Each
   runtime package must cite the blocker-path ledger row and architecture
   contract it implements.
6. When a governance sprint paused an active release gate, produce a concrete
   resume activation brief before runtime work continues. The brief must name
   the latest active artifact, repeated causal edge, focused proof, no-symptom
   gate, operation-progress contract seed, and green path sequence.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Create a separate future-sprint governance sprint file.
2. Create the first governance package without changing current-blocker
   ownership.
3. Add a global `Systemic Sprint Isolation` rule to `work/README.md`.
4. Add `Active Sprint Isolation` prompts to the shared package template.
5. Materialize the detailed package queue for future systemic work as todo
   packages, so execution starts from the higher-order artifacts.
6. Add a concrete `rolling-restart` resume activation brief so the paused active
   sprint can restart from the repeated priority-recovery operation-progress
   edge rather than a fresh local symptom.

## Out Of Scope

1. src/
2. test/rebalancer/
3. test/control-plane/
4. work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md
5. work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md
6. Representative rolling-restart reruns.
7. Closing or modifying the current active release-gate package.

## Invariants

1. Systemic/future-sprint work starts in a separate package and uses the active
   blocker only as handoff context unless a human explicitly changes scope.
2. Governance-only packages must name forbidden active scenario files and
   runtime directories.
3. Runtime architecture suggestions first become contracts or backlog packages;
   implementation requires a later runtime/scenario package.
4. Current-blocker generation remains pointed at the active release-gate lane
   until the human intentionally switches active work.
5. A future release-gate sprint is not ready for runtime implementation until
   its blocker-path ledger and relevant architecture contract identify the
   repeated owner-boundary failure being collapsed.
6. A paused active release-gate sprint is not ready to resume runtime work until
   its resume activation brief has been refreshed against the latest active
   artifact.

## Sprint Plan Created

This package creates
[Future Sprint Release Gate Systemic Governance Sprint](../sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md).

The sprint plan remains governance-scoped. It can be used without changing the
active rolling-restart runtime package. Its package queue covers:

1. systemic governance and active-sprint isolation
2. [blocker-path ledger template](todo-20260513-release-gate-blocker-path-ledger-template.md)
3. [rolling-restart resume activation brief](active-20260513-rolling-restart-resume-activation-brief.md)
4. [architecture contract template](todo-20260513-release-gate-architecture-contract-template.md)
5. [fixture-first release-gate policy](todo-20260513-release-gate-fixture-first-policy.md)
6. [bounded-progress governance](todo-20260513-release-gate-bounded-progress-governance.md)
7. [runtime architecture backlog](todo-20260513-release-gate-runtime-architecture-backlog.md),
   without implementation

## Execution Notes

1. The package was scaffolded with `npm run work:package:new`.
2. In-progress runtime dispatch edits were backed out after the scope
   clarification.
3. The global workflow rule and template prompt were added as the concrete
   first execution slice.
4. The remaining higher-order sprint queue was materialized as todo packages,
   so the sprint has executable next steps for blocker-path causality,
   architecture contracts, fixture-first policy, bounded-progress enforcement,
   and runtime backlog reconciliation.
5. The queue now includes a resume activation brief that seeds the concrete
   `rolling-restart` blocker path, operation-progress contract, focused proof,
   no-symptom gate, and green path sequence.

## Model Fit

- Package class: `workflow-tooling-governance`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `repo-wide-governance/higher-order-release-gate-contract`
- Owned files: `work/sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md`, `work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md`, `work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md`, `work/packages/active-20260513-rolling-restart-resume-activation-brief.md`, `work/packages/todo-20260513-release-gate-architecture-contract-template.md`, `work/packages/todo-20260513-release-gate-fixture-first-policy.md`, `work/packages/todo-20260513-release-gate-bounded-progress-governance.md`, `work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md`, `work/README.md`, `work/templates/work-package-template.md`
- Forbidden files: `src/`, `test/rebalancer/`, `test/control-plane/`, `work/packages/done-20260513-rolling-restart-green-gate-workflow-progress-recovery.md`, `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`
- Frozen decisions: package scope and lane stay bounded; this package must not
  fix the active rolling-restart blocker.
- Escalation triggers: runtime ownership changes, representative scenario
  evidence changes, the governance queue needs tracker validation code, or the
  human asks to activate a runtime architecture contract.
- Focused proof: `npm run work:package:doctor -- --suggest work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md`, `npm run work:validate -- --entry work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md`, `npm run work:validate -- --entry work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md`, `git diff --check -- work/sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md work/README.md work/templates/work-package-template.md`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:package:doctor -- --suggest work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md
2. npm run work:validate -- --entry work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md
3. npm run work:validate -- --entry work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md
4. git diff --check -- work/sprints/todo-2026-q2-future-sprint-release-gate-systemic-governance.md work/packages/done-20260513-future-sprint-release-gate-systemic-governance.md work/packages/todo-20260513-release-gate-blocker-path-ledger-template.md work/packages/active-20260513-rolling-restart-resume-activation-brief.md work/packages/todo-20260513-release-gate-architecture-contract-template.md work/packages/todo-20260513-release-gate-fixture-first-policy.md work/packages/todo-20260513-release-gate-bounded-progress-governance.md work/packages/todo-20260513-release-gate-runtime-architecture-backlog.md work/README.md work/templates/work-package-template.md

## Activation Outcome

- [x] Human confirmed this governance sprint should execute on May 13, 2026.
- [x] Package moved with
      `npm run work:package:move -- --write work/packages/todo-20260513-future-sprint-release-gate-systemic-governance.md --to active`.
- [x] Active rolling-restart package/sprint stayed in forbidden files for this
      governance-only slice.
- [x] Blocker-path ledger, architecture contract, fixture-first,
      bounded-progress, resume-brief, and runtime-backlog packages were
      materialized and validated before any runtime architecture implementation.
- [x] Rolling-restart resume activation brief was created as a governance-only
      handoff before runtime work resumes.
- [x] Runtime architecture implementation remains split into later
      runtime-owner or scenario-release-gate packages.

## Commit And Push Ledger

1. Focused package commit: `6f7f9be0963fa642b84a40d968b228a80361d604`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
