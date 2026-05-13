# Rolling Restart LLM Preflight Harness

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "lightweight-maintenance",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "release_gate_preflight",
  "dominantReason": "llm_preflight_not_recorded",
  "currentState": "The recommendations require a recorded LLM preflight gate before the next full rolling-restart run. Today there are canonical extractor results, but no durable preflight prompt, decision ledger, or agent answer proving whether the remaining priority-recovery evidence is real, stale, or subordinate to active-gate snapshot coverage.",
  "nextAction": "Create the reusable preflight prompt, sprint execution checklist, and decision ledger, then require later packages to record the LLM preflight result before runtime implementation or full scenario rerun.",
  "proof": [
    "npm run work:package:doctor -- --suggest work/packages/done-20260513-rolling-restart-llm-preflight-harness.md",
    "npm run work:validate -- --entry work/packages/done-20260513-rolling-restart-llm-preflight-harness.md",
    "git diff --check -- work/packages/done-20260513-rolling-restart-llm-preflight-harness.md work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md work/templates/release-gate-llm-preflight-template.md"
  ],
  "writeScope": [
    "work/packages/done-20260513-rolling-restart-llm-preflight-harness.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "work/templates/release-gate-llm-preflight-template.md"
  ],
  "handoffFiles": [
    "work/README.md",
    "work/packages/active-20260513-rolling-restart-green-gate-workflow-progress-recovery.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260513-rolling-restart-llm-preflight-harness.md",
    "work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md",
    "work/templates/release-gate-llm-preflight-template.md"
  ],
  "modelFit": {
    "packageClass": "workflow-tooling-governance",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "the package starts interpreting runtime evidence instead of defining the preflight harness",
      "owned files expand into runtime or tests",
      "the sprint activation rule changes current-blocker ownership"
    ]
  },
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The prior recommendation to use an LLM agent is not complete until the repo has
a repeatable way to run that agent and record its answer. Conversation notes are
not durable sprint proof.

This package creates the reusable release-gate preflight harness: a prompt
template, a decision ledger, and a package checklist that later packages must
fill before runtime implementation or full scenario reruns.

## Scope Basis

Approved workflow/tooling maintenance under `work/`. This package creates
planning and template assets only.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: it writes preflight workflow files, not runtime
  behavior or scenario evidence.
- Escalation trigger to a heavier lane: runtime ownership, shared diagnostics
  semantics, or representative evidence changes.

## Required Harness Output

The created template must require the preflight agent to answer:

1. Latest artifact used, and whether it is fresher than the active package
   handoff.
2. Canonical first frontier from `work:evidence-summary`.
3. Priority-recovery residual state from `analyze:priority-recovery-residuals`.
4. Topology explain result for `priority_recovery_partition_progress`.
5. Topology explain result for `active_gate_snapshot_coverage`.
6. Causal-model stop condition, dominant failure class, exhausted budgets, and
   any waits that are not on the critical path.
7. Distributed-failure view of active nodes, snapshot coverage, publication,
   pending ACKs, and priority recovery state.
8. Concrete answer: real priority-recovery work, stale/subordinate
   priority-recovery evidence, or active-gate first frontier.
9. Runtime package to activate, package to supersede, or human escalation.
10. Focused fixture/test proof required before the full scenario rerun.

## In Scope

1. This package file.
2. The new sprint file.
3. `work/templates/release-gate-llm-preflight-template.md`.

## Out Of Scope

1. Runtime `src/` edits.
2. Test implementation.
3. Mutating the current active rolling-restart package or current-blocker files.
4. Running the full distributed scenario.

## Model Fit

- Package class: `workflow-tooling-governance`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Owned files: this package, the new sprint, and
  `work/templates/release-gate-llm-preflight-template.md`
- Forbidden files: `src/`, `test/`, `work/sprints/current-blocker.json`,
  `work/sprints/current-blocker.md`
- Frozen decisions: this package creates the harness but does not decide the
  active runtime owner.
- Escalation triggers: runtime ownership changes, representative evidence
  changes, or active package mutation.
- Focused proof: package doctor, entry validation, and `git diff --check` on
  owned files.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/done-20260513-rolling-restart-llm-preflight-harness.md`
2. `npm run work:validate -- --entry work/packages/done-20260513-rolling-restart-llm-preflight-harness.md`
3. `git diff --check -- work/packages/done-20260513-rolling-restart-llm-preflight-harness.md work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md work/templates/release-gate-llm-preflight-template.md`
