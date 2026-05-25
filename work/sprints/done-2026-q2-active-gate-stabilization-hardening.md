# Rolling Restart Active Gate Stabilization Hardening Sprint

Status: done. Created on May 25, 2026.

## Goal

Make the system stable under rolling-restart: align active-gate cohort fallbacks and repair snapshot recovery projection logic so that the rolling-restart scenario passes clean (representative-green outcome). The sprint is NOT considered done until the rolling-restart scenario actually passes clean without timeouts or admission relaxation.

## Sprint Strategy Brief

- Goal state: Representative `rolling-restart` scenario is green under multiple successive trials with `active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`, and diagnostics/analyzers report zero priority recovery residuals and clean convergence.
- Current causal thesis: System stability during a rolling restart depends on the proper coordination of the active node projection, active-gate snapshot coverage, and robust error/transport retry logic.
- Competing hypotheses:
  - H1: Stale active-gate snapshot timeouts are caused by inadequate transport-closed dampening or cohort fallback parsing.
  - H3: Stability requires both transport-dampening grace periods and robust active-node eligibility evaluation.
- Confidence and evidence: High. Recent refactoring resolved oversized files, leaving a clean, modular source surface. Triage identifies `active_gate_snapshot_coverage` as the first critical failure frontier.
- Expected green path: Scaffold a runtime-owner-boundary package for active-gate coverage, implement WebSocket disconnect grace periods and fallback cohort witness queries, verify locally with focused tests, and run representative reruns.
- Wrong direction signals: Simply raising timeouts, relaxing active-gate admission policies, or ignoring low-confidence recovery signals.
- Next best package: none.
- Stop or escalate rule: Escalated to a causal governance gate if frontier oscillations persist after focused boundary adjustments.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-rerun-4.report.json
Visible first frontier: operation_workflow_owner/workflow_progress
Active package: none
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_event_driven_wait
Required action: Triage priority_recovery_partition_progress with combined scenario evidence before runtime edits.
Representative status: unknown
Causal outcome: accept_classified_backpressure
Architecture gate: watching / unknown
Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
Current state: Scaffolded from representative evidence for priority_recovery_partition_progress.
Allowed edits: unknown
Candidate runtime files: unknown
Forbidden edits: workflow progress is bounded.
Required latest proof: npm run work:evidence-summary -- test-output/reports/rolling-restart-rerun-4.report.json, npm run work:scenario-triage -- test-output/reports/rolling-restart-rerun-4.report.json --markdown, npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. All packages must select the lightest valid workflow lane as defined in `work/RULES.md#lane-definitions`.
2. Run `npm run work:context` and `npm run work:llm-start` before package activation or edits.
3. Do not modify runtime code without a preceding pre-implementation validator check (`npm run work:validate -- --pre-impl`).
4. Closure is atomic: rename packages to `done-...`, update theory ledger and edge cards, run closure validation (`npm run work:validate -- --closure`), then commit and push.
5. Do not widen timeouts or relax admission filters to mask underlying coordination errors.

## Package Queue

1. [Rolling Restart Active Gate Snapshot Coverage Repair](../packages/done-20260525-rolling-restart-active-gate-snapshot-coverage-repair.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Align active-gate cohort fallbacks and repair snapshot recovery projection logic. Implement transport grace periods and cohort fallback querying.
   - First-run reason: The representative `rolling-restart` scenario fails with `active_gate_timed_out` at `active_gate_snapshot_coverage`.

2. [Artifact Triage - operation_workflow_owner - workflow_progress](../packages/done-20260525-rolling-restart-operation-workflow-owner-workflow-progress.md)
   - Lane: `diagnostic-classification`
   - Purpose: Triage priority_recovery_partition_progress with combined scenario evidence before runtime edits.
   - First-run reason: The representative `rolling-restart` scenario fails with `priority_recovery_event_driven_wait` at `priority_recovery_partition_progress`.

## Proof Ladder

1. `npm run work:context`
2. `npm run work:llm-start`
3. `npm run work:validate -- --pre-impl <package>`
4. Run focused cluster and rebalancer tests.
5. Run representative reruns to verify stability.
6. `npm run work:validate -- --closure <package>` before closure.

## Closure Rules

1. The sprint closes only after all queued packages are completed (renamed to `done-...`) or explicitly superseded.
2. Stability must be proven by a green representative rerun or a clear, bounded successor blocker.
3. All commits must be focused, clean, and contain only package-owned files and allowed sprint handoffs.
4. The sprint must not resume runtime stability package execution while `npm run audit:file-size` or `npm run work:oversized-next -- --markdown` still names oversized-file candidates without a concrete front-of-queue cleanup package.
