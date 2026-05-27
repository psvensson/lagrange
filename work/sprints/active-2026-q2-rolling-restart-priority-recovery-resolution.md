# Rolling Restart Priority Recovery Resolution Sprint

Status: active. Created on May 26, 2026.

## Goal

Resolve the priority recovery event-driven wait/deadlock during rolling-restart and ensure rolling-restart converges to green with all nodes ACTIVE.

## Sprint Strategy Brief

- Goal state: representative `rolling-restart` is green, or fresh evidence shows a fully converged priority recovery lane.
- Current causal thesis: Fresh May 27 evidence selects `operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait`; priority recovery work exists but remains persisted-not-dispatched, so downstream startup, active-gate, transport, and admin symptoms are not selectable until workflow progress is proven or migrated.
- Confidence and evidence: High that the selected frontier is workflow progress because `work:scenario-route` and `analyze:priority-recovery-residuals` keep the first frontier at `dispatch_pending` / `planned` with three `recovering_in_flight` witnesses.
- Competing hypotheses:
- H1/current: Workflow progress has persisted-not-dispatched priority recovery state that must advance, reconcile, or formally classify backpressure.
- H2/avoided without fresh proof: Logger CPU starvation and seed WebSocket cleanup can explain old symptoms, but the latest route did not select transport_owner / message_routing.
- H3/superseded: Generic rebalancer outbound saturation is replaced by the narrower workflow-progress theory in `theory-20260527-rolling-restart-priority-recovery-workflow-progress`.
- Expected green path: run the focused workflow-progress proof, promote only the selected runtime-owner-boundary successor or architecture stop, rerun rolling-restart, and verify green or concrete frontier migration.
- Wrong direction signals: adopting dirty runtime edits from unrelated files, patching transport/admin/active-gate symptoms before workflow progress proof, or opening another local patch after same-frontier evidence with no reduction.
- Stop or escalate rule: If the focused workflow-progress proof repeats the same frontier with no concrete reduction, open/select an autonomous architecture experiment before more local runtime work.
- Next best package: [Priority Recovery Deadlock Triage](../packages/done-20260526-rolling-restart-priority-recovery-deadlock-triage.md)

## Theory Loop Sprint

- Central problem: priority recovery event-driven wait on priority_recovery_partition_progress
- Representative artifact: test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json
- Success condition: rolling restart succeeds without a problem and all nodes reach ACTIVE status
- Iteration rule: keep the current package classification-only until workflow progress selects a concrete runtime owner; do not let repair or handoff tooling adopt dirty implementation files into classifier scope.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json
Visible first frontier: startup_readiness_owner / startup_support_evidence / readiness_retryable
Active package: work/packages/active-20260527-rolling-restart-benchmark-load-admission-runtime.md
Active package owner: startup_readiness_owner
Active package boundary: startup_support_evidence
Selected cause: readiness_retryable
Required action: Apply benchmark-table load admission gating to rolling restart before node restarts so readiness proof matches the actual load lane.
Representative status: unknown
Causal outcome: migrate_owner_boundary
Architecture gate: selected / continue-local-proof
Expected delta: Rolling restart uses benchmark-ready load nodes/table before starting sustained load, reducing startup readiness pressure and preventing zero-success load/restart recovery timeout.
Current state: Scaffolded from representative evidence for readiness_startup_support.
Allowed edits: test/distributed/scenarios/rolling-restart.js, test/distributed/harness/__tests__/rolling-restart-scenario.test.js, test/distributed/harness/__tests__/node-join-under-load-scenario.test.js, work/packages/active-20260527-rolling-restart-benchmark-load-admission-runtime.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json, work/sprints/active-2026-q2-rolling-restart-priority-recovery-resolution.md, work/packages/done-20260527-rolling-restart-startup-readiness-owner-startup-support-evid.md
Candidate runtime files: test/distributed/scenarios/table-distribution-helpers.js
Forbidden edits: Runtime edits stay limited to rolling restart admission and focused tests unless validation names a different owner boundary.
Required latest proof: falsifier: node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js # contract fixture: benchmark-ready admission transition gates startLoad and affected rolling-restart consumer proof, regression: node --test test/distributed/harness/__tests__/cluster.test-part-2.js test/distributed/harness/__tests__/node-join-under-load-scenario.test.js # consumer proof: shared benchmark admission behavior remains ready for node-join-under-load, supporting: npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json # representative routing evidence, npm run work:evidence-summary -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json, npm run work:scenario-triage -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown, npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-seed-contact-bounded-progress-20260527T155000Z.report.json --markdown
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
2. [Rolling Restart Diagnostic Dispatch Pending Owner Reentry](../packages/done-20260527-rolling-restart-diagnostic-dispatch-pending-owner-reentry.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Fix diagnostic dispatch-pending publication snapshots so owner advancement wakes the remote operation owner and arms bounded verification.
   - First-run reason: Focused workflow-progress proof selected the diagnostic owner re-entry failure behind the current persisted-not-dispatched priority recovery residual.
3. [Rolling Restart Active Gate Snapshot Coverage Load Readiness](../packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-load-readiness.md)
   - Lane: `experiment`
   - Purpose: Select the concrete runtime mechanism for the repeated `startup_active_gate_owner / snapshot_coverage` frontier before another local patch.
   - First-run reason: Fresh representative evidence migrated to `startup_active_gate_owner / snapshot_coverage` with snapshotCoverageNodeCount=1/5, repair_deferred retry, pendingRecoveryCount=1, and selectedControlPlaneOwnerQueuePendingWrites=1.
4. [Rolling Restart Active Gate Load Admin Projection Runtime](../packages/done-20260527-rolling-restart-active-gate-load-admin-projection-runtime.md)
   - Lane: `causal-escalation`
   - Purpose: Extend the active-gate admin availability projection to load mode under bounded selected snapshot owner-recovery and empty publication-disagreement evidence.
   - First-run reason: The architecture experiment selected a load-mode admin probe timeout gap for a canonical published-active node after priority recovery witnesses dropped to zero.
5. [Rolling Restart Operation Workflow Rebalancer Handoff Priority Recovery Classification](../packages/done-20260527-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-classification.md)
   - Lane: `diagnostic-classification`
   - Purpose: Classify the fresh rebalancer_handoff priority-recovery witnesses and select the focused runtime proof for the next operation workflow owner slice.
   - First-run reason: Fresh representative evidence after the active-gate EHOSTUNREACH projection migrated to operation_workflow_owner / rebalancer_handoff with four recovering_in_flight witnesses.
6. [Rolling Restart Operation Workflow Dispatch Pending Owner Effect Reentry Runtime](../packages/done-20260527-rolling-restart-operation-workflow-dispatch-pending-owner-effect-reentry-runtime.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Promote the dispatch-pending owner observation effect re-entry path into a focused runtime proof, including wakeRemoteOwner captured-time handoff behavior.
   - First-run reason: Classification found one operation_workflow_owner / rebalancer_handoff residual group with retry_scheduled dispatched_waiting_progress and wait_for_operation_progress.
7. [Rolling Restart Active Gate Snapshot Coverage Evidence Missing Classification](../packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-classification.md)
   - Lane: `diagnostic-classification`
   - Purpose: Classify the missing active-gate snapshot coverage evidence from the fresh rolling-restart report and select the smallest successor proof or runtime owner.
   - First-run reason: Fresh representative evidence removed priority-recovery residuals and migrated the frontier to startup_active_gate_owner / snapshot_coverage / evidence_missing.
8. [Rolling Restart Startup Readiness Admin Reachability Refused Runtime](../packages/done-20260527-rolling-restart-startup-readiness-admin-reachability-refused-runtime.md)
   - Lane: `causal-escalation`
   - Purpose: Prove and repair the startup readiness support path that leaves a restarted node alive but admin-unreachable in INIT with control_snapshot_authority_unavailable.
   - First-run reason: Fresh representative evidence reports admin_reachability_refused with readinessPhase=INIT and bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable after priority-recovery residuals reached zero.
9. [Rolling Restart Active Gate Snapshot Coverage Evidence Missing After Startup Readiness](../packages/done-20260527-rolling-restart-active-gate-snapshot-coverage-evidence-missing-after-startup-readiness.md)
   - Lane: `diagnostic-classification`
   - Purpose: Classify the migrated active-gate snapshot coverage evidence_missing frontier from the fresh rolling-restart artifact and select the next bounded successor without patching startup readiness again.
   - First-run reason: Canonical route on the fresh representative rerun selected startup_active_gate_owner / snapshot_coverage / evidence_missing with zero priority-recovery residuals.
10. [Rolling Restart Restart Recovery Seed Contact Readiness Experiment](../packages/done-20260527-rolling-restart-restart-recovery-seed-contact-readiness-experiment.md)
    - Lane: `experiment`
    - Purpose: Distinguish whether restart recovery is blocked by seed-contact hang, readiness convergence heartbeat, or active-gate report attachment before the next runtime patch.
    - First-run reason: The post-startup-readiness representative still fails restarted-node admin readiness while the report omits canonical active-gate coverage and the playback sidecar contains deferred owner-recovery evidence.

## Proof Ladder

1. `npm run work:scenario-route -- test-output/reports/rolling-restart-three-theory-validation-post-diagnostics.report.json --json`

## Theory Ledger

1. `theory-20260526-rolling-restart-logger-cpu-starvation`
2. `theory-20260526-rolling-restart-seed-websocket-cleanup`
3. `theory-20260526-rolling-restart-rebalancer-outbound-saturation`

## Closure Rules

1. The sprint closes only after the package is completed or explicitly superseded.
2. Stability must be proven by representative green or a clear bounded successor blocker.
