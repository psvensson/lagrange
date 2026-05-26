# Rolling Restart Priority Publication and ACK Handoff Investigation Sprint

Status: active. Created on May 26, 2026.

## Goal

Investigate the control-plane priority publication and ACK handoff dynamics during a rolling restart under load. Find why the coordinator fails to complete rebalancer handoffs, stalling priority spread, without altering any timeout limits.

## Sprint Strategy Brief

- Goal state: Understand the coordinator's publication coordinate state and ACK handoff logic, identify the root causes of priority spread convergence stalls under load, and design targeted, non-timeout-based fixes.
- Current causal thesis: Priority control-plane spread delays during rolling restarts are caused by inefficiencies or logic gaps in the priority publication and ACK handoff mechanisms under load.
- Competing hypotheses:
  - H1: Priority publications are delayed due to packet/message queue backpressure or coordinator connection cycling.
  - H2: Stale local cache views or rebalancer state mismatches block publication progression.
  - H3: Transport-level connection handoffs fail to propagate or wait for critical ACKs cleanly.
- Confidence and evidence: Medium. The approved sprint options identify priority spread convergence as a highly relevant diagnostic path.
- Expected green path: Run focused diagnostics, inspect coordinator publications and ACK handoff state machines, locate coordination mismatches, and prepare targeted local repairs.
- Wrong direction signals: Raising timeouts or relaxing admission rules to pass tests.
- Next best package: work/packages/active-20260526-cache-watermark-stale-operation-reconciler-hardening.md
- Stop or escalate rule: Escalate if downstream/upstream protocol contradictions appear or if proof requires cross-owner changes.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: work/packages/active-20260526-cache-watermark-stale-operation-reconciler-hardening.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: investigate stale replica operation cancellation upon node rejoin
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: New package scaffolded from the shared work-package schema.
Allowed edits: src/admin/admin-authoritative-repair-policy.js, src/admin/admin-control-snapshot-class-part-3.js, src/rebalancer/rebalance-coordinator.js, src/rebalancer/replica-operation-liveness.js, test/rebalancer/replica-operation-liveness.test.js
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: falsifier: contract transition startup_active_gate_owner snapshot_coverage active_gate_timed_out npm run work:advance -- --check, regression: contract transition startup_active_gate_owner snapshot_coverage active_gate_timed_out npm run work:advance -- --check
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. All packages must select the lightest valid workflow lane as defined in `work/RULES.md#lane-definitions`.
2. Run `npm run work:context` and `npm run work:llm-start` before package activation or edits.
3. Do not modify runtime code without a preceding pre-implementation validator check (`npm run work:validate -- --pre-impl`).
4. Closure is atomic: rename packages to `done-...`, update theory ledger and edge cards, run closure validation (`npm run work:validate -- --closure`), then commit and push.
5. Do not widen timeouts or relax admission filters to mask underlying coordination errors.

## Package Queue

1. [Control-Plane Priority Publication & ACK Handoff Triage](../packages/done-20260526-control-plane-priority-publication-ack-handoff-triage.md)
   - Lane: `diagnostic-classification`
   - Purpose: Explore publication coordinate state and ACK handoff logic.
   - First-run reason: The representative `rolling-restart` scenario experiences priority spread delays.
2. [Outbound Message Queue Backpressure Stabilization](../packages/done-20260526-outbound-message-queue-backpressure-stabilization.md)
   - Lane: `scenario-release-gate`
   - Purpose: Separate metadata control signals from data messages to stabilize outbound queue.
   - First-run reason: The representative `rolling-restart` scenario experiences priority recovery rebalancer handoff stalls due to backpressure in outbound queues.
3. [Cache Watermark and Stale Operation Reconciler Hardening](../packages/active-20260526-cache-watermark-stale-operation-reconciler-hardening.md)
   - Lane: `scenario-release-gate`
   - Purpose: Proactively cancel or clean up obsolete replica operations on node rejoin, preventing stale-operation reconciliation delays from stalling coordinator active-gate snapshot progress.

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
