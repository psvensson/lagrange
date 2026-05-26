# Priority Spread Stabilization Sprint

Status: active. Opened on May 25, 2026.

## Goal

Resolve the control-plane priority spread timeout during heavy-load rolling restarts. This sprint is NOT considered done until the representative `rolling-restart` scenario passes clean, achieving `snapshotCoverage=5/5`, `missingPublished=0`, and full publication convergence with zero priority-spread residuals.

## Sprint Strategy Brief

- Goal state: representative `rolling-restart` is green with `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, and clean priority-spread convergence.
- Current causal thesis: the previous fully-green sprint successfully resolved the active-gate snapshot coverage timeout (achieving 5/5), which has now exposed the downstream bottleneck: the control-plane priority spread coordinator is stuck in a `priority_control_plane_spread_pending` state.
- Competing hypotheses:
  - H1: The spread coordinator is waiting on an ACK that a restarted node failed to send because of subscriber initialization delay.
  - H2: The rebalancer or publication planner is starving/throttled under the heavy query pressure during rolling restarts.
  - H3: A state-machine mismatch keeps the publication status as pending.
- Confidence and evidence: high; the latest local scenario run verified that snapshot coverage is completely healthy at 5/5, but the system halts at priority spread pending.
- Expected green path: triage the priority spread timeout, identify the missing ACK or loop constraint, implement the local stabilization repair under `topology_publication_owner / publication_convergence`, and verify it.
- Wrong direction signals: widening the rebalance/admission timeouts or bypassing control-plane publication validation.
- Next best package:
  `work/packages/done-20260525-priority-spread-triage.md`.
- Stop or escalate rule: if a fresh rerun is red and same-frontier without concrete reduction, open/select an autonomous architecture experiment; human escalation only for contradictory or blocked evidence.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json
Visible first frontier: activeGateSnapshotCoverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out
Active package: work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: Stabilize active-gate snapshot coverage by ensuring closeStaleSnapshotLaneSockets protects healthy, active WebSocket connections and activeClientId from premature closure during retry cycles.
Representative status: reduced
Causal outcome: continue_local_fix
Architecture gate: selected / continue-local-proof
Expected delta: Verify that socket housekeeping logic protects healthy open connections and resolves the premature connection closure symptom.
Current state: Control snapshot queries time out / disconnect under rolling restart due to premature WebSocket query connection teardown in closeStaleSnapshotLaneSockets during transient retryable delays.
Allowed edits: src/admin/admin-websocket-observation-methods.js, test/admin/admin-control-snapshot-retry-decision.test.js, work/packages/done-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md, scripts/list-commands.js, src/bootstrap/node-joining-ready-signal-readiness.js, src/bootstrap/traffic-readiness-utils.js, test/bootstrap/traffic-readiness-utils.test.js, test/distributed/README.local.md, test/distributed/harness/cluster-segment-1.js, scripts/stop-distributed-harness-containers.js, test/scripts/stop-distributed-harness-containers.test.js, work/packages/done-20260525-priority-spread-triage.md
Candidate runtime files: src/admin/admin-websocket-observation-methods.js
Forbidden edits: Startup readiness remains downstream.
Required latest proof: falsifier: npm test -- test/admin/admin-control-snapshot-retry-decision.test.js # focused unit test verifying socket housekeeping logic, regression: npm run audit:runtime-grammar:file -- src/admin/admin-websocket-observation-methods.js # verify syntactical correctness of modified observation methods, supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json # cite representative artifact evidence
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. [Priority Spread Triage](../packages/done-20260525-priority-spread-triage.md)
   - Lane: `causal-escalation`
   - Purpose: triage control-plane priority spread timeout with combined scenario evidence.
   - First-run reason: active-gate snapshot coverage was resolved, and this is the first package to investigate the new priority spread bottleneck.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:validate -- --pre-impl work/packages/done-20260525-priority-spread-triage.md`
3. `npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json`
4. `npm run work:scenario-triage -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --markdown`
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --explain priority_control_plane_spread_pending`

## Closure Rules

1. The sprint closes only when representative `rolling-restart` is green.
2. Reduced, migrated, same-frontier, classification-only, or architecture-gap package outcomes keep the sprint active and must open/update the next bounded package.
3. Full green means clean scenario exit and canonical evidence with `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, and clean control-plane publication spread.
4. Do not widen timeouts or relax admission to satisfy the gate.
