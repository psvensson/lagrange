# Rolling Restart Three Theory Recovery Sprint

Status: active. Created on May 26, 2026.

## Goal

Test the three current rolling-restart theories, fix only confirmed bugs, rerun the representative `rolling-restart` scenario, and route the fresh artifact.

## Sprint Strategy Brief

- Goal state: Representative `rolling-restart` is green, or the fresh artifact shows a reduced/migrated first frontier with concrete metrics.
- Current causal thesis: The snapshot-freshness breach was real and the fix moved representative evidence. Priority recovery now has zero residual witnesses; the current blocker is startup active-gate snapshot coverage timing out on selected snapshot source timeout and deferred repair.
- Competing hypotheses:
  - H1: A selected snapshot source can be `admin_health` reachable while snapshot-lane queries time out, leaving partial coverage stuck.
  - H2: `owner_reconcile_pending` plus `write_deferred/enqueued=false` loses bounded owner-recovery progress.
  - H3: A forced control-plane repair can return a fresh/proceed snapshot observation even when the repaired snapshot still has stale replica operations in flight.
- Confidence and evidence: High for representative migration. Baseline `test-output/reports/rolling-restart-three-theory-recovery.report.json` had priority residual witness count `11`; `test-output/reports/rolling-restart-operation-workflow-three-theory-recovery-rerun.report.json` reduced it to `6`; fresh `test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json` has priority residual witness count `0` and routes to active_gate_snapshot_coverage.
- Expected green path: Move to a startup_active_gate_owner / snapshot_coverage successor and fix selected snapshot source timeout / repair-deferred coverage without reopening priority recovery.
- Wrong direction signals: Raising timeouts, continuing to patch snapshot coverage after coverage is `5/5`, or passing load readiness without resolving priority recovery event-driven progress.
- Next best package: work/packages/done-20260526-rolling-restart-three-theory-discriminator.md
- Stop or escalate rule: This package reached `reduced/migrated`; if continuing, open the suggested diagnostic successor from the fresh artifact rather than widening the current write scope.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json
Visible first frontier: priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait
Active package: work/packages/done-20260526-rolling-restart-operation-workflow-three-theory-recovery.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Research the revised three-theory set: H1 workflow budget/capture mismatch, H2 selected snapshot source stale or overloaded, and H3 selected-node publication/readiness evidence lagging the best control-plane view.
Representative status: reduced-migrated-after-h2-fix
Causal outcome: continue_local_fix
Architecture gate: watching / unknown
Expected delta: Priority recovery is cleared; next work should move snapshotCoverage above 1/5, clear selected_snapshot_source_timeout, or migrate the active-gate snapshot coverage frontier.
Current state: The selected-timeout owner-recovery projection bug is fixed and focused proofs pass. Fresh rolling-restart moved from the selected-timeout active-gate blocker to priority_recovery_partition_progress with 4 residual witnesses in one operation_workflow_owner / workflow_progress group; active nodes improved to 4/5 and selected snapshot coverage improved to 2/5.
Allowed edits: work/packages/done-20260526-rolling-restart-operation-workflow-three-theory-recovery.md, work/theory-ledger.md, work/sprints/active-2026-q2-rolling-restart-investigation.md, src/rebalancer/operation-workflow-owner.js, src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js, src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js, src/control-plane/control-plane-snapshot-owner.js, test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js, test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js, test/distributed/harness/__tests__/active-gate-closure-classification.test.js, test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js, test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js, test/rebalancer/priority-recovery-stale-planning-visibility.test.js, test/control-plane/control-plane-snapshot-owner.test.js, work/packages/done-20260526-rolling-restart-three-theory-discriminator.md
Candidate runtime files: src/rebalancer/operation-workflow-owner.js, src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js, src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js, src/rebalancer/unified-rebalancer-priority-recovery-follow-up-decisions.js, src/rebalancer/unified-rebalancer-segment-5.js, src/control-plane/control-plane-snapshot-owner.js, test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js, test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js
Forbidden edits: Owner outcomes decide runtime progress; diagnostics and active-gate readiness observe priority recovery but must not hide or decide the operation workflow contract.
Required latest proof: research: npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json, falsifier: route npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-recovery.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress, regression: residuals npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-three-theory-recovery.report.json --markdown, route: npm run work:scenario-route -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage, residuals: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --markdown, focused: node test/control-plane/control-plane-snapshot-owner.test.js, focused: node test/distributed/harness/__tests__/active-gate-closure-classification.test.js, focused: node test/distributed/harness/__tests__/cluster-active-gate-load-selected-timeout-owner-recovery.test.js, representative: node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json --verbose, route: npm run work:scenario-route -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress, residuals: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-handoff-projection-rerun.report.json --markdown
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. All packages must select the lightest valid workflow lane as defined in `work/RULES.md#lane-definitions`.
2. Run `npm run work:context` and `npm run work:llm-start` before package activation or edits.
3. Do not modify runtime code without a preceding pre-implementation validator check (`npm run work:validate -- --pre-impl`).
4. Closure is atomic: rename packages to `done-...`, update theory ledger and edge cards, run closure validation (`npm run work:validate -- --closure`), then commit and push.
5. Do not widen timeouts or relax admission filters to mask underlying coordination errors.

## Package Queue

1. [Rolling Restart Three Theory Discriminator](../packages/done-20260526-rolling-restart-three-theory-discriminator.md)
   - Lane: `experiment`
   - Purpose: Test the selected snapshot timeout, deferred owner-recovery enqueue, and unreachable-node pressure theories, then promote only the confirmed fix.
   - First-run reason: Latest `rolling-restart` routes to `startup_active_gate_owner / snapshot_coverage` with priority recovery residuals cleared.
2. [Distributed Harness Scenario Teardown Cleanup](../packages/done-20260526-distributed-harness-scenario-teardown-cleanup.md)
   - Lane: `lightweight-maintenance`
   - Purpose: Ensure teardown continues to stop node containers even when playback shutdown or diagnostics fail.
   - First-run reason: Residual harness processes and containers were suspected after scenario end.
3. [Control-Plane Priority Publication & ACK Handoff Triage](../packages/done-20260526-control-plane-priority-publication-ack-handoff-triage.md)
   - Lane: `diagnostic-classification`
   - Purpose: Explore publication coordinate state and ACK handoff logic.
   - First-run reason: Earlier `rolling-restart` evidence showed priority spread delays.
4. [Outbound Message Queue Backpressure Stabilization](../packages/done-20260526-outbound-message-queue-backpressure-stabilization.md)
   - Lane: `scenario-release-gate`
   - Purpose: Separate metadata control signals from data messages to stabilize outbound queue.
   - First-run reason: Earlier evidence showed priority recovery rebalancer handoff stalls due to outbound queue backpressure.
5. [Cache Watermark and Stale Operation Reconciler Hardening](../packages/done-20260526-cache-watermark-stale-operation-reconciler-hardening.md)
   - Lane: `scenario-release-gate`
   - Purpose: Proactively cancel or clean up obsolete replica operations on node rejoin.
   - First-run reason: Earlier evidence showed stale-operation reconciliation delaying coordinator active-gate snapshot progress.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:validate -- --pre-impl <package>`
4. Run focused cluster and rebalancer tests.
5. `npm run work:validate -- --closure <package>` before closure.

## Closure Rules

1. The sprint closes only after all queued packages are completed (renamed to `done-...`) or explicitly superseded.
2. Stability must be proven by a green representative rerun or a clear, bounded successor blocker.
3. All commits must be focused, clean, and contain only package-owned files and allowed sprint handoffs.
