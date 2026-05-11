# Spec-Led Runtime Modularization Priority Recovery Backpressure Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_backpressure",
  "currentState": "Publication ACK, diagnostics budget ownership, startup readiness support evidence, and active-gate local ownership are classified. The representative causal model reports classified_backpressure / accept_classified_backpressure for operation_workflow_owner / rebalancer_handoff.",
  "nextAction": "Review the closed active-gate local blocker package, then decide whether priority recovery backpressure is acceptable classified backpressure, reducible operation workflow debt, or a narrower downstream owner boundary.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "Focused priority recovery rebalancer handoff fixture selected after package review",
    "Touched-file static guardrails selected by operation_workflow_owner",
    "Representative rolling-restart rerun or classification handoff"
  ],
  "touchedFiles": [
    "src/control-plane/**/*operation*.js",
    "src/control-plane/**/*workflow*.js",
    "src/control-plane/**/*rebalance*.js",
    "src/diagnostics/*causal*.js",
    "src/diagnostics/*topology*.js",
    "test/control-plane/**/*operation*.test.js",
    "test/control-plane/**/*workflow*.test.js",
    "test/control-plane/**/*rebalance*.test.js",
    "test/diagnostics/*causal*.test.js",
    "test/diagnostics/*topology*.test.js",
    "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "work/packages/todo-20260511-spec-led-runtime-modularization-priority-recovery-backpressure-frontier.md",
    "work/sprints/todo-2026-q2-spec-led-runtime-modularization-priority-recovery-backpressure-followup.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/cross-boundary-causal-edge",
    "escalationTriggers": [
      "proof returns to publication ACK",
      "proof returns to diagnostics budget cascade",
      "proof returns to startup readiness support evidence",
      "proof returns to active-gate local blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "With active-gate local ownership classified, priority recovery backpressure should either remain accepted classified backpressure, reduce through operation workflow ownership, or migrate to one narrower owner-boundary blocker.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-publication-lag.report.json",
    "expectedCausalModelChange": "The priority_recovery_backpressure condition remains accepted, disappears, reduces, or migrates to a named downstream owner-boundary blocker; returning to active_gate_local_blocker is contradictory.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Do not hide operation workflow backpressure by reopening publication ACK, diagnostics budget, startup readiness, active-gate local ownership, or harness timeouts.",
    "crossBoundaryReview": "Review the closed active-gate local blocker package before activation; this is operation workflow owner work, not active-gate runtime work."
  },
  "predecessor": "work/packages/done-20260511-spec-led-runtime-modularization-active-gate-local-blocker-frontier.md"
}
-->

## Why

The active-gate local blocker is classified. Priority recovery remains
retryable/in flight, so the representative causal model now accepts classified
backpressure at `operation_workflow_owner / rebalancer_handoff` instead of
presenting active-gate snapshot coverage as local ownership.

## Generated Evidence Snapshot

- Topology frontier: `priority_recovery_partition_progress`.
- Current semantic owner: `operation_workflow_owner`.
- Current boundary: `rebalancer_handoff`.
- Causal stop condition: `classified_backpressure`.
- Causal outcome: `accept_classified_backpressure`.
- Causal reason: `priority_recovery_backpressure`.
- Frozen closures: publication ACK convergence, diagnostics budget ownership,
  startup readiness support evidence, and active-gate local blocker.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/cross-boundary-causal-edge`
- Owned files: operation workflow/rebalancer handoff owner files, focused
  operation workflow tests, diagnostics causal/topology consumers if the
  classified backpressure contract changes, representative evidence notes, and
  current-blocker files.
- Forbidden files: publication ACK runtime, diagnostics budget accounting,
  startup readiness runtime, active-gate runtime, harness timeout configuration,
  Pro or Enterprise surfaces.
- Frozen decisions: publication ACK convergence is closed; diagnostics budget
  ownership is classified; startup readiness support evidence is inherited
  active-gate no-progress evidence; active-gate local ownership is classified.
- Escalation triggers: proof returns to publication ACK, diagnostics budget,
  startup readiness support evidence, active-gate local blocker, or runtime
  implementation would need Pro or Enterprise features.
- Focused proof: evidence summary, topology explain for
  `priority_recovery_partition_progress`, causal-model output, focused operation
  workflow/rebalancer tests, touched-file lint and guardrails, work validation,
  package doctor, and `git diff --check`.

## Activation Notes

1. Run the mandatory predecessor review on the closed active-gate local blocker
   package.
2. Activate only after any review fixes are committed and pushed.
3. Do not reopen publication ACK, diagnostics budget, startup readiness support,
   active-gate local ownership, or harness timeouts before this package reduces
   or migrates priority recovery backpressure evidence.
