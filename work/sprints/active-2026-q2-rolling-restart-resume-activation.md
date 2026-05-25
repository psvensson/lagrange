# Rolling Restart Resume Activation Sprint

Status: active. Opened on May 25, 2026.

## Goal

Resume rolling-restart stabilization from the latest canonical route, not from
the stale May 13 priority-recovery activation path.

## Sprint Strategy Brief

- Goal state: the active blocker points at the latest rolling-restart first
  frontier and the successor package has a validator-clean proof surface before
  runtime files move into write scope.
- Current causal thesis: the active-gate discriminator consumed fresh
  representative evidence and migrated the first actionable frontier to
  `priority_recovery_partition_progress / operation_workflow_owner /
  workflow_progress`.
- Competing hypotheses: H1 workflow progress owns a concrete dispatch/re-entry
  edge; H2 the priority-recovery evidence is a downstream lag; H3 the route
  needs an autonomous architecture experiment before runtime edits.
- Confidence and evidence: high that
  `test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json`
  routes first to `operation_workflow_owner / workflow_progress`; medium on the
  exact producer-consumer edge that must move next.
- Expected green path: close the active-gate discriminator as an owner-boundary
  migration, then activate the workflow-progress successor only after its
  causal-escalation proof surface is validator-clean.
- Wrong direction signals: reopening priority recovery from the May 13 brief,
  editing startup readiness, widening timeouts, relaxing admission, or moving
  runtime files into write scope before the discriminator selects a transition.
- Next best package:
  `work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`.
- Stop or escalate rule: do not open another local runtime patch from the
  unchanged artifact; the workflow-progress successor must prove the missing
  edge, reduce/migrate the frontier, or select an architecture experiment.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json
Visible first frontier: priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait
Active package: work/packages/active-20260525-rolling-restart-workflow-progress-dispatch-chain.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Before runtime edits, prove the workflow-progress missing edge with causal-escalation proof or select an autonomous architecture experiment; activate only after pre-implementation validation is clean.
Representative status: pending-before-probe
Causal outcome: pending-before-rerun
Architecture gate: watching / unknown
Expected delta: priority recovery witness count drops below 5, owner boundary migrates, snapshot coverage increases beyond 2/5, or rolling-restart turns green
Current state: Scaffolded from representative evidence for priority_recovery_partition_progress.
Allowed edits: work/packages/todo-20260525-rolling-restart-workflow-progress-dispatch-chain.md, work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md
Candidate runtime files: src/rebalancer/operation-workflow-owner.js, src/rebalancer/operation-workflow-owner-segment-7-stage-3.js, src/rebalancer/operation-workflow-owner-segment-7-stage-5.js, src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js, test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js, test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js, src/rebalancer/operation-workflow-owner-constants.js, src/control-plane/priority-recovery-snapshot-stage-10.js
Forbidden edits: Startup active-gate and startup readiness remain downstream until workflow progress proves reduction, migration, or green.
Required latest proof: falsifier: representative route npm run work:scenario-route -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress, regression: priority recovery residuals npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json --markdown, supporting: causal model npm run analyze:causal-model -- test-output/reports/rolling-restart-continue-green-20260525T000001Z.report.json
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. [Rolling Restart Resume Activation Brief](../packages/done-20260513-rolling-restart-resume-activation-brief.md)
   - Lane: `read-review-doc-only`
   - Purpose: reconcile the stale May 13 resume brief with latest route
     evidence and migrate to the active-gate successor.
   - First-run reason: the current generated blocker was pointing at obsolete
     priority-recovery operation-progress guidance.

2. [Rolling Restart Startup Active Gate Owner Snapshot Coverage](../packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md)
   - Lane: `experiment`
   - Purpose: close the active-gate discriminator as an owner-boundary
     migration after fresh representative evidence moved the first frontier.
   - First-run reason: fresh rolling-restart evidence moved the actionable
     frontier to operation_workflow_owner / workflow_progress while active-gate
     coverage remained downstream.

3. [Rolling Restart Workflow Progress Dispatch Chain](../packages/active-20260525-rolling-restart-workflow-progress-dispatch-chain.md)
   - Lane: `causal-escalation`
   - Purpose: prove the workflow-progress missing edge before any runtime files
     move into write scope.
   - First-run reason: the active-gate discriminator selected owner-boundary
     migration to priority_recovery_partition_progress.
