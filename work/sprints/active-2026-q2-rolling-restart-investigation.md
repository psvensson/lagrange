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
- Next best package: work/packages/done-20260526-outbound-message-queue-backpressure-stabilization.md
- Stop or escalate rule: Escalate if downstream/upstream protocol contradictions appear or if proof requires cross-owner changes.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-rerun-4.report.json
Visible first frontier: transport_owner/message_routing
Active package: work/packages/done-20260526-outbound-message-queue-backpressure-stabilization.md
Active package owner: transport_owner
Active package boundary: message_routing
Selected cause: accept_classified_backpressure
Required action: Separate metadata control signals from data messages to stabilize outbound queue
Representative status: pending-before-probe
Causal outcome: reduced
Architecture gate: not-required / unknown
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Scaffolded for priority recovery transport_owner message_routing stabilization.
Allowed edits: src/transport/message-router-shared-stage-2.js, src/transport/message-router-shared-stage-3.js, src/transport/message-router-shared-stage-4.js
Candidate runtime files: src/transport/message-router-shared-stage-2.js, src/transport/message-router-shared-stage-3.js, src/transport/message-router-shared-stage-4.js
Forbidden edits: none
Required latest proof: falsifier: contract transition transport_owner message_routing accept_classified_backpressure npm run work:scenario-route -- test-output/reports/rolling-restart-rerun-4.report.json, regression: contract transition transport_owner message_routing accept_classified_backpressure npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-4.report.json, supporting: contract transition transport_owner message_routing accept_classified_backpressure npm run work:advance -- --check
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
