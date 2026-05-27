# Rolling Restart Priority Recovery Resolution Sprint

Status: active. Created on May 26, 2026.

## Goal

Resolve the priority recovery event-driven wait/deadlock during rolling-restart and ensure rolling-restart converges to green with all nodes ACTIVE.

## Sprint Strategy Brief

- Goal state: representative `rolling-restart` is green, or fresh evidence shows a fully converged priority recovery lane.
- Current causal thesis: The diagnostics bug in sidecar loading was successfully resolved. The post-diagnostics representative rerun has shifted from missing evidence to a specific event-driven deadlock in priority recovery (`operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`).
- Confidence and evidence: High that a real logical deadlock exists because `eligible_but_no_operation_created` occurs during rolling restart while priority recovery has unresolved semantic states.
- Competing hypotheses:
  - H1/Theory A: Logger CPU Starvation. Rate-limiting or dampening is missing on `metrics.pressure.policy` metrics logging inside `PressureGovernor.emitPressureMetric`, causing CPU starvation under high backpressured load during bootstrap seed contact.
  - H2/Theory B: Seed WebSocket/Transport Cleanup. Seed node's WebSocket or query transport is not properly cleaning up stale inactive-node connections, causing file descriptor exhaustions or connection pool queues to stall.
  - H3/Theory C: Rebalancer Outbound Saturation. Rebalance coordinator's background work-class is aggressively dispatching priority recovery operations, saturating the outbound delivery queues on non-seed nodes and blocking critical control-plane replies.
- Expected green path: Open a focused package in `work/packages/` to investigate the candidate nodes and filters inside `src/rebalancer/`, fix the filtering discrepancy, rerun the rolling-restart scenario, and verify convergence.
- Wrong direction signals: arbitrary delay insertion, ignoring the rebalancer's planning gates, or forcing node status changes without addressing the priority recovery planning loop.
- Stop or escalate rule: If candidate filters match specification but recovery remains stranded, stop for architectural reassessment of the readiness boundary.
- Next best package: [Priority Recovery Deadlock Triage](../packages/done-20260526-rolling-restart-priority-recovery-deadlock-triage.md)

## Theory Loop Sprint

- Central problem: priority recovery event-driven wait on priority_recovery_partition_progress
- Representative artifact: test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
- Success condition: rolling restart succeeds without a problem and all nodes reach ACTIVE status
- Iteration rule: create one compact theory package targeting H1/H2/H3, trace variables/filters, and patch the root filter bug.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json
Visible first frontier: operation_workflow_owner/rebalancer_handoff with startup_readiness_owner/startup_support_evidence selected as owner-boundary migration
Active package: work/packages/active-20260527-rolling-restart-startup-readiness-admin-reachability-support.md
Active package owner: startup_readiness_owner
Active package boundary: startup_support_evidence
Selected cause: admin_reachability_refused
Required action: Prove and repair startup readiness/admin reachability support for admin_reachability_refused, then rerun rolling-restart until the representative scenario succeeds.
Representative status: pending-before-rerun
Causal outcome: migrate_owner_boundary
Architecture gate: not-required / unknown
Expected delta: Focused startup readiness proof should classify admin_reachability_refused as bounded startup support evidence, let recovery readiness proceed only through the startup owner contract, and the fresh rolling-restart representative should pass or expose a new named owner boundary.
Current state: Architecture experiment selected startup_readiness_owner / startup_support_evidence because topology convergence classified the rebalancer handoff source as admin_reachability_refused and startup_recovery_blocked.
Allowed edits: src/bootstrap/startup-recovery-coordinator.js, src/bootstrap/node-joining-ready-signal-readiness.js, src/bootstrap/traffic-readiness-utils.js, test/bootstrap/startup-authority-consumption.test.js, test/bootstrap/node-joining-ready-signal-retry.test.js, test/bootstrap/traffic-readiness-utils.test.js, test/distributed/harness/startup-readiness-evidence.js, test/distributed/harness/cluster-segment-5.js, test/distributed/harness/cluster-segment-7-class-2.js, test/distributed/harness/cluster-segment-7-class-4.js, test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js, test/distributed/harness/__tests__/cluster.test-part-2.js, test/distributed/harness/__tests__/cluster-part-2-node-reachability-test-cases.js, test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js, test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js, test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js
Candidate runtime files: src/bootstrap/startup-recovery-coordinator.js, src/bootstrap/node-joining-ready-signal-readiness.js, src/bootstrap/traffic-readiness-utils.js, test/distributed/harness/cluster-segment-5.js, test/distributed/harness/cluster-segment-7-class-2.js, test/distributed/harness/cluster-segment-7-class-4.js
Forbidden edits: Rebalancer and message-router runtime implementation remains frozen until startup readiness/admin reachability support is proven or falsified.
Required latest proof: falsifier: npm test -- test/bootstrap/startup-authority-consumption.test.js test/bootstrap/node-joining-ready-signal-retry.test.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js test/distributed/harness/__tests__/cluster.test-part-4-startup-snapshot-projection.js test/distributed/harness/__tests__/cluster-reachability-admin-proof-gate-test-cases.js, supporting: npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --owner operation_workflow_owner --boundary rebalancer_handoff --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress, regression: npm run work:evidence-summary -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json, supporting: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json, supporting: npm run audit:guideline:literals -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js, supporting: npm run audit:guideline:decision-boundaries -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js, supporting: npm run audit:runtime-grammar:file -- src/bootstrap/startup-recovery-coordinator.js src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/startup-readiness-evidence.js test/distributed/harness/cluster-segment-5.js test/distributed/harness/cluster-segment-7-class-2.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/cluster-segment-7-class-4-active-probe-projections.js
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. Keep one package active at a time.
2. Run `npm run work:context`, `npm run work:llm-start`, entry validation, and pre-implementation validation before source edits.
3. Source edits must be driven by focused proof for one of the three hypotheses.
4. If source changes, rerun `rolling-restart` and route the fresh artifact before closing the package.

## Package Queue

1. [Priority Recovery Deadlock Triage](../packages/done-20260526-rolling-restart-priority-recovery-deadlock-triage.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Investigate the rebalancer target selection and blocker filters to identify why priority recovery operations are not created.
   - First-run reason: Latest representative evidence routed to `priority_recovery_event_driven_wait` with unresolved semantic states.

## Proof Ladder

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json`

## Theory Ledger

1. `theory-20260526-rolling-restart-logger-cpu-starvation`
2. `theory-20260526-rolling-restart-seed-websocket-cleanup`
3. `theory-20260526-rolling-restart-rebalancer-outbound-saturation`

## Closure Rules

1. The sprint closes only after the package is completed or explicitly superseded.
2. Stability must be proven by representative green or a clear bounded successor blocker.
