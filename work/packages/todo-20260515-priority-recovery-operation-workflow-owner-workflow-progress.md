# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "New package scaffolded from the shared work-package schema.",
  "nextAction": "Park until rebalancer_handoff is green, reduced, split, or superseded, then prove or split this residual owner boundary.",
  "proof": [
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md"
  ],
  "handoffFiles": [
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/rebalancer/replica-operation-repository-mutation-methods.js"
  ],
  "commitScope": [
    "work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown

