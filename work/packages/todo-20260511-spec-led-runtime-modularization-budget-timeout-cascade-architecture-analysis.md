# Spec-Led Runtime Modularization Budget Timeout Cascade Architecture Analysis

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag/rolling-restart/",
  "owner": "diagnostics_owner",
  "boundary": "budget_timeout_cascade",
  "dominantReason": "budget_timeout_cascade",
  "currentState": "The post-publication-ACK active-gate slice froze active_gate_snapshot_coverage at snapshot coverage 3/5 with two inactive nodes, then classified the residual as architecture_gap / widen_architecture_work because budget accounting is unbounded or unknown for active_gate_attempts, workflow_step_timeout, and readiness_retry_window.",
  "nextAction": "Review the closed active-gate classification package, then widen architecture analysis around the budget timeout cascade without changing startup active-gate runtime behavior or increasing harness timeouts.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "Focused diagnostics budget-accounting fixture selected after package review",
    "Touched-file static guardrails selected by diagnostics_owner",
    "Representative rolling-restart rerun or classification handoff"
  ],
  "touchedFiles": [
    "src/diagnostics/*budget*.js",
    "src/diagnostics/*causal*.js",
    "src/diagnostics/*stop-condition*.js",
    "src/diagnostics/*invariant*.js",
    "test/diagnostics/*budget*.test.js",
    "test/diagnostics/*causal*.test.js",
    "test/diagnostics/*stop-condition*.test.js",
    "test/diagnostics/*invariant*.test.js",
    "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "work/packages/todo-20260511-spec-led-runtime-modularization-budget-timeout-cascade-architecture-analysis.md",
    "work/sprints/todo-2026-q2-spec-led-runtime-modularization-budget-cascade-followup.md"
  ],
  "modelFit": {
    "packageClass": "architecture-gap analysis package",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/cross-boundary-causal-edge",
    "escalationTriggers": [
      "causal stop condition no longer reports architecture_gap",
      "proof requires startup_active_gate_owner runtime changes",
      "proof requires harness timeout increases",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If the budget timeout cascade is modeled with bounded active-gate attempts, workflow-step timeout, and readiness retry-window ownership, the architecture gap should reduce or migrate to a named runtime owner boundary.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "expectedCausalModelChange": "The budget_timeout_cascade architecture gap disappears, reduces, or migrates to a named owner-boundary blocker; same-frontier without reduced budget-accounting evidence is contradictory.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Do not hide exhausted scenario or active-gate budgets by raising harness timeouts or relabeling active-gate snapshot coverage.",
    "crossBoundaryReview": "Review the closed active-gate post-publication-ACK package before activation; this is a diagnostics architecture-analysis successor, not startup active-gate runtime work."
  },
  "predecessor": "work/packages/done-20260511-spec-led-runtime-modularization-active-gate-snapshot-coverage-post-publication-ack-frontier.md"
}
-->

## Why

The active-gate post-publication-ACK package froze the startup active-gate witness
without runtime changes. Causal analysis classifies the remaining failure as
`architecture_gap / widen_architecture_work` with stop reason
`budget_timeout_cascade`: scenario duration and active-gate timeout are exhausted
while `active_gate_attempts`, `workflow_step_timeout`, and
`readiness_retry_window` are unbounded or unknown.

## Scope Basis

1. Predecessor package:
   `work/packages/done-20260511-spec-led-runtime-modularization-active-gate-snapshot-coverage-post-publication-ack-frontier.md`.
2. Representative artifact:
   `test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json`.
3. Causal-analysis owner:
   `src/diagnostics/budget-timeout-accounting.js`,
   `src/diagnostics/invariant-review.js`,
   `src/diagnostics/stop-condition-decision.js`, and
   `src/diagnostics/causal-graph-builder.js`.
4. Roadmap Phase `0.1 - Internal Coherence` release-gate closure and runtime
   coherence scope.
5. Edition scope: Community / AGPL repo only.

## In Scope

1. Freeze the smallest diagnostics fixture for the current budget timeout
   cascade.
2. Identify canonical ownership for active-gate attempts, workflow-step timeout,
   and readiness retry-window accounting.
3. Decide whether this is diagnostics modeling debt, runtime owner contract debt,
   or an architecture handoff that needs a narrower successor package.
4. Preserve the active-gate symptom and publication ACK closure invariants.

## Out Of Scope

1. Startup active-gate runtime behavior changes unless this package first reduces
   the budget-accounting architecture gap to that owner boundary.
2. Harness timeout increases, report relabeling, or guardrail weakening.
3. Publication ACK convergence reopening without focused regression proof.
4. Active-gate report schema alias deletion.
5. Pro or Enterprise work.

## Model Fit

- Package class: `architecture-gap analysis package`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: diagnostics causal-analysis and budget-accounting modules, focused
  diagnostics tests, representative report evidence, this package, and sprint
  handoff notes.
- Forbidden files: startup active-gate runtime files unless reduced evidence
  names that owner as the next package, publication ACK runtime, harness timeout
  configuration, Pro or Enterprise surfaces, unrelated packages.
- Frozen decisions: publication ACK convergence is closed; active-gate snapshot
  coverage is a frozen symptom; the current next action is architecture-analysis
  budget ownership, not runtime patching.
- Escalation triggers: causal stop condition changes away from architecture gap;
  proof requires startup-active-gate runtime work; proof requires timeout budget
  increases; implementation would need Pro or Enterprise features.
- Focused proof: evidence summary, topology explain, causal-model output,
  focused diagnostics budget fixture, touched-file guardrails, and representative
  rolling-restart rerun or classification handoff.

## Generated Evidence Snapshot

- Topology first frontier: `active_gate_snapshot_coverage`.
- Symptom owner: `startup_active_gate_owner`.
- Symptom boundary: `snapshot_coverage`.
- Symptom dominant reason: `active_gate_timed_out`.
- Causal stop condition: `architecture_gap`.
- Causal outcome: `widen_architecture_work`.
- Architecture reason: `budget_timeout_cascade`.
- Budget accounting gap: `active_gate_attempts`, `workflow_step_timeout`, and
  `readiness_retry_window` are unbounded or unknown.

## Activation Notes

1. Run the mandatory predecessor review on the closed active-gate
   post-publication-ACK package.
2. Activate only after any review fixes are committed and pushed.
3. Do not patch startup active-gate runtime behavior or increase harness timeouts
   before this package reduces the architecture gap.
