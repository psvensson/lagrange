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
Representative artifact: test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json
Visible first frontier: priority_recovery_partition_progress / operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait
Active package: work/packages/active-20260526-rolling-restart-operation-workflow-owner-workflow-progress.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Triage priority_recovery_partition_progress with combined scenario evidence before runtime edits.
Representative status: retryable
Causal outcome: accept_classified_backpressure
Architecture gate: watching / unknown
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Scaffolded from representative evidence for priority_recovery_partition_progress.
Allowed edits: src/admin/admin-control-snapshot-class-part-2.js, .kiro/steering/llm/boot.md, .kiro/steering/llm/core.md, scripts/list-commands.js, scripts/work-advance.js, scripts/work-context.js, scripts/work-package-new.js, scripts/work-package-route-after-rerun.js, scripts/work-package-schema.js, scripts/work-subagent-prompt.js, scripts/work-tracker.js, test/scripts/list-commands.test.js, test/scripts/work-context.test.js, test/scripts/work-llm-usability-tools.test.js, test/scripts/work-tracker-architecture-decision-gate.test.js, test/scripts/work-tracker-contract-ledger.test.js, test/scripts/work-tracker-package-doctor-ledger.test.js, test/scripts/work-tracker-subagent-ledger-fixtures.js, work/README.md, work/RULES.md, work/templates/work-package-template.md, test/scripts/work-advance.test.js
Candidate runtime files: unknown
Forbidden edits: Startup readiness remains downstream until active-gate snapshot coverage is resolved.
Required latest proof: falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json, regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --markdown, supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-snapshot-freshness-rerun.report.json --markdown
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
