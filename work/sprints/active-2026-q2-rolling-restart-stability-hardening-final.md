# Rolling Restart Stability Hardening Final Sprint

Status: active. Created on May 23, 2026.

## Goal

Make the system stable under rolling-restart: change the core logic of the system so that the rolling-restart scenario passes clean (representative-green outcome). The sprint is NOT considered done until the rolling-restart scenario actually passes clean without timeouts or admission relaxation.

## Sprint Strategy Brief

- Goal state: Representative `rolling-restart` scenario is green under multiple successive trials with `active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`, and diagnostics/analyzers report zero priority recovery residuals and clean convergence.
- Current causal thesis: System stability during a rolling restart depends on the proper coordination of the active node projection, active-gate snapshot coverage, and robust error/transport retry logic.
- Competing hypotheses:
  - H1: Stale active-gate snapshot timeouts are caused by inadequate transport-closed dampening or cohort fallback parsing.
  - H2: Missing publication convergence is a result of uncoordinated reconcile-queue retry pacing.
  - H3: Stability requires both transport-dampening grace periods and robust active-node eligibility evaluation.
- Confidence and evidence: High. Recent package work resolved multiple specific edge cases, but unified rolling-restart stability under varied restart sequences requires integrated validation of recovery taxonomy and rebalancer gates.
- Expected green path: Activate and execute focused runtime stability packages, verify with targeted multi-node restart tests, and run representative reruns to prove stability.
- Wrong direction signals: Simply raising timeouts, relaxing active-gate admission policies, or ignoring low-confidence recovery signals.
- Next best package: `work/packages/done-20260523-rolling-restart-active-gate-snapshot-coverage-repair.md`.
- Stop or escalate rule: Escalated to a causal governance gate if frontier oscillations persist after focused boundary adjustments.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: unknown
Active package: work/packages/done-20260523-rolling-restart-recovery-reconcile-recursion-fix.md
Active package owner: operation_workflow_owner
Active package boundary: workflow_progress
Selected cause: priority_recovery_progress_blocked
Required action: Identify and fix the re-entry infinite loop or call stack exhaustion in OperationWorkflowRecoveryReconcile getPriorityRecoveryDecisionSnapshotForPartitionOperations
Representative status: unknown
Causal outcome: unknown
Architecture gate: not-required / unknown
Expected delta: unknown
Current state: New package scaffolded from the shared work-package schema.
Allowed edits: src/rebalancer/operation-workflow-recovery-reconcile.js, src/rebalancer/operation-workflow-owner.js, src/control-plane/control-plane-readiness-service-segment-2.js, src/control-plane/control-plane-readiness-service-segment-3.js, .kiro/steering/llm/architecture.md, .kiro/steering/llm/core.md, .kiro/steering/llm/governance.md, .kiro/steering/llm/manifest.json, .kiro/steering/llm/rules.json, .kiro/steering/testing-guidelines.md, roadmap.md, scripts/analyze-priority-recovery-residuals.js, scripts/analyze-topology-convergence.js, scripts/work-scenario-triage.js, scripts/work-theory-ledger.js, src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js, src/control-plane/publication-active-gate-handoff-contract.js, src/diagnostics/topology-convergence-graph.js, src/rebalancer/operation-lifecycle.js, src/rebalancer/operation-workflow-owner-ports.js, src/rebalancer/rebalancer-planning-gate-methods.js, src/rebalancer/unified-rebalancer-segment-1.js, src/rebalancer/unified-rebalancer-segment-5.js, test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js, test/distributed/harness/__tests__/cluster.test-part-4.js, test/distributed/harness/cluster-segment-7-class-4.js, test/rebalancer/cluster-readiness-gate.test.js, test/rebalancer/operation-workflow-owner-adapter.test.js, test/rebalancer/operation-workflow-owner-decision.test.js, test/rebalancer/unified-rebalancer-part-5-2-stage-2.js, test/rebalancer/unified-rebalancer.test-part-5.js, test/scripts/analyze-topology-convergence.test.js, test/scripts/work-theory-ledger.test.js, work/tracks/topology-convergence.md, test/bootstrap/owners/, test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js, test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js, test/scripts/analyze-priority-recovery-residuals.test.js, test/scripts/work-scenario-triage.test.js, work/RULES.md
Candidate runtime files: unknown
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: npm run work:advance -- --check, npm test -- test/rebalancer/operation-workflow-owner-decision.test.js # focused contract fixture, npm test -- test/rebalancer/operation-workflow-owner-adapter.test.js # transition outcome, npm test -- test/rebalancer/unified-rebalancer.test-part-5.js # affected consumer proof
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. All packages must select the lightest valid workflow lane as defined in `work/RULES.md#lane-definitions`.
2. Run `npm run work:context` and `npm run work:llm-start` before package activation or edits.
3. Do not modify runtime code without a preceding pre-implementation validator check (`npm run work:validate -- --pre-impl`).
4. Closure is atomic: rename packages to `done-...`, update theory ledger and edge cards, run closure validation (`npm run work:validate -- --closure`), then commit and push.
5. Do not widen timeouts or relax admission filters to mask underlying coordination errors.

## Package Queue

1. [Rolling Restart Active Gate Snapshot Coverage Repair](../packages/done-20260523-rolling-restart-active-gate-snapshot-coverage-repair.md)
   - Lane: `runtime-owner-boundary`
   - Purpose: Align active-gate cohort fallbacks and repair snapshot recovery projection logic.

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
