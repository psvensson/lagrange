# Rolling Restart Resume Activation Sprint

Status: active. Opened on May 25, 2026.

## Goal

Resume rolling-restart stabilization from the latest canonical route, not from
the stale May 13 priority-recovery activation path.

## Sprint Strategy Brief

- Goal state: the active blocker points at the latest rolling-restart first
  frontier and the successor package has a validator-clean proof surface before
  runtime files move into write scope.
- Current causal thesis: the old resume brief correctly prevented another local
  operation-progress witness, but newer representative evidence now shows
  priority-recovery witnesses are zero and `active_gate_snapshot_coverage` is
  the first frontier.
- Competing hypotheses: H1 selected transport closure needs selected snapshot
  refresh; H2 owner recovery needs a wake or retry path; H3
  `snapshot_repair_deferred` needs repair execution; H4 the evidence is
  architecture-gap or instrumentation-only and should not trigger runtime
  edits.
- Confidence and evidence: high that
  `test-output/reports/rolling-restart-tell-tale-green-gate.report.json`
  routes to `startup_active_gate_owner / snapshot_coverage`; high that
  priority-recovery witnesses are zero; medium on which active-gate transition
  owns the next move.
- Expected green path: close the stale resume brief into the active-gate
  successor, run the architecture discriminator, then promote exactly one
  runtime-owner-boundary package only after the missing transition is named.
- Wrong direction signals: reopening priority recovery from the May 13 brief,
  editing startup readiness, widening timeouts, relaxing admission, or moving
  runtime files into write scope before the discriminator selects a transition.
- Next best package:
  `work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md`.
- Stop or escalate rule: if the discriminator cannot name one wake, retry,
  repair, projection, or refresh transition, keep runtime frozen and close as
  architecture-gap.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-tell-tale-green-gate.report.json
Visible first frontier: active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out
Active package: work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md
Active package owner: startup_active_gate_owner
Active package boundary: snapshot_coverage
Selected cause: active_gate_timed_out
Required action: Run an autonomous architecture experiment to distinguish selected transport closure, owner recovery wake, repair execution, or projection refresh before another runtime patch.
Representative status: unknown
Causal outcome: continue_local_fix
Architecture gate: selected / open-architecture-package
Expected delta: Select the owner transition that moves selected_transport_closed plus repair_deferred evidence toward snapshotCoverageNodeCount=5/5, or stop before runtime edits.
Current state: Latest rolling-restart evidence after the resume brief routes to active_gate_snapshot_coverage with startup_active_gate_owner / snapshot_coverage / active_gate_timed_out. Priority-recovery witnesses are zero; the selected snapshot source is transport-closed with owner_reconcile_pending and snapshot_repair_deferred.
Allowed edits: work/packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md
Candidate runtime files: src/admin/admin-control-snapshot-publication-handoff.js, src/control-plane/publication-active-gate-handoff-contract-decision.js, src/control-plane/publication-active-gate-handoff-contract-fence.js, src/control-plane/publication-active-gate-handoff-contract.js, test/admin/admin-control-snapshot-deferred-refresh-membership-observation-test-cases.js, test/distributed/harness/cluster-segment-7-class-4-publication-coverage.js
Forbidden edits: Startup readiness stays downstream until active-gate snapshot coverage clears, reduces, migrates, or selects a runtime contract.
Required latest proof: falsifier: representative routing evidence npm run work:scenario-route -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out --explain active_gate_snapshot_coverage, regression: topology explanation npm run analyze:topology-convergence -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json --explain active_gate_snapshot_coverage, supporting: causal route proof npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-tell-tale-green-gate.report.json
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Package Queue

1. [Rolling Restart Resume Activation Brief](../packages/done-20260513-rolling-restart-resume-activation-brief.md)
   - Lane: `read-review-doc-only`
   - Purpose: reconcile the stale May 13 resume brief with latest route
     evidence and migrate to the active-gate successor.
   - First-run reason: the current generated blocker was pointing at obsolete
     priority-recovery operation-progress guidance.

2. [Rolling Restart Startup Active Gate Owner Snapshot Coverage](../packages/active-20260525-rolling-restart-startup-active-gate-owner-snapshot-coverage.md)
   - Lane: `experiment`
   - Purpose: run the active-gate architecture discriminator before any further
     startup_active_gate_owner / snapshot_coverage runtime patch.
   - First-run reason: latest rolling-restart evidence still fronts
     active_gate_snapshot_coverage with selected_transport_closed,
     owner_reconcile_pending, and snapshot_repair_deferred.
