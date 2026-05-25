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
Active package: work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits.
Representative status: unknown
Causal outcome: continue_local_fix
Architecture gate: watching / unknown
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Scaffolded from representative evidence for active_gate_snapshot_coverage.
Allowed edits: unknown
Candidate runtime files: unknown
Forbidden edits: Startup readiness remains downstream.
Required latest proof: falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json, regression: npm run work:scenario-triage -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --markdown, supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-operation-workflow-route-rerun-20260525.report.json --markdown
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
