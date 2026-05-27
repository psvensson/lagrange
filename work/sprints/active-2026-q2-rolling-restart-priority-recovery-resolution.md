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
Representative artifact: test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json
Visible first frontier: operation_workflow_owner/workflow_progress
Active package: work/packages/active-20260527-rolling-restart-operation-workflow-owner-workflow-progress.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Classify persisted-not-dispatched priority recovery workflow progress, keep unrelated dirty runtime edits out of scope, then promote only a selected runtime successor or architecture stop before the next rolling-restart rerun.
Representative status: same-frontier
Causal outcome: accept_classified_backpressure
Architecture gate: not-required / unknown
Expected delta: Classify the persisted-not-dispatched operation workflow progress residual and promote the smallest runtime proof or architecture stop before the next rolling-restart rerun.
Current state: Fresh rolling-restart evidence moved the representative blocker from startup admin reachability to priority recovery workflow progress.
Allowed edits: work/theory-ledger.md
Candidate runtime files: unknown
Forbidden edits: Do not patch active-gate snapshot coverage, startup readiness, rebalancer handoff, or transport runtime until workflow progress is proven or formally migrated.
Required latest proof: falsifier: npm run work:evidence-summary -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json, regression: npm run work:scenario-route -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json --owner operation_workflow_owner --boundary workflow_progress --dominant-reason priority_recovery_event_driven_wait --explain priority_recovery_partition_progress, supporting: npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-startup-readiness-http-stage-cap-20260527T000000Z.report.json --markdown
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
