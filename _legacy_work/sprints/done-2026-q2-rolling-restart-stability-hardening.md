# Rolling Restart Stability Hardening Sprint

Status: done. Created on May 23, 2026.

## Goal

Make the system stable under rolling-restart: ensure that recovery projections, active-gate snapshot coverages, and publication handoffs converge reliably and deterministically during 5-node rolling restarts without timeouts or admission relaxation.

## Sprint Strategy Brief

- Goal state: Representative `rolling-restart` scenario is green under multiple successive trials with `active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`, and diagnostics/analyzers report zero priority recovery residuals and clean convergence.
- Current causal thesis: System stability during a rolling restart depends on the proper coordination of the active node projection, active-gate snapshot coverage, and robust error/transport retry logic.
- Competing hypotheses:
  - H1: Stale active-gate snapshot timeouts are caused by inadequate transport-closed dampening or read grace periods.
  - H2: Missing publication convergence is a result of uncoordinated reconcile-queue retry pacing.
  - H3: Stability requires both transport-dampening grace periods and robust active-node eligibility evaluation.
- Confidence and evidence: High. Recent package work resolved multiple specific edge cases, but unified rolling-restart stability under varied restart sequences requires integrated validation of recovery taxonomy and rebalancer gates.
- Expected green path: Activate and execute focused runtime stability packages, verify with targeted multi-node restart tests, and run representative reruns to prove stability.
- Wrong direction signals: Simply raising timeouts, relaxing active-gate admission policies, or ignoring low-confidence recovery signals.
- Next best package: `work/packages/done-20260513-rolling-restart-owner-boundary-consistency-closure.md`.
- Stop or escalate rule: Escalated to a causal governance gate if frontier oscillations persist after focused boundary adjustments.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-green-gate-after-dispatch-retry-recovery-readiness.report.json
Visible first frontier: release_gate_owner/rolling_restart_green_gate_confirmation
Active package: work/packages/done-20260513-rolling-restart-preflight-green-gate-confirmation.md
Active package owner: release_gate_owner
Active package boundary: rolling_restart_green_gate_confirmation
Selected cause: full_scenario_requires_preflight_closure_proof
Required action: Keep this package blocked until focused proof is closed, dirty scope is split, and the human explicitly resumes the green-sprint gate. Do not run the full rolling-restart release gate or update current-blocker files from this package while the earlier active sprint is paused.
Representative status: unknown
Causal outcome: pending-before-rerun
Architecture gate: watching / unknown
Expected delta: rolling-restart passes or fresh owner boundary is recorded.
Current state: The full rolling-restart scenario must not be the next discovery step until latest-artifact refresh, LLM preflight, owner-boundary consistency, focused fixtures, optional runtime owner fixes, and diff-aware risk review have produced durable proof. The earlier active rolling-restart green sprint is paused and must not be mutated by this preflight sprint.
Allowed edits: work/packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md, work/sprints/todo-2026-q2-rolling-restart-llm-preflight-and-code-risk-closure.md, .kiro/steering/llm/architecture.md, .kiro/steering/llm/core.md, .kiro/steering/llm/governance.md, .kiro/steering/llm/manifest.json, .kiro/steering/llm/rules.json, .kiro/steering/testing-guidelines.md, roadmap.md, scripts/analyze-priority-recovery-residuals.js, scripts/analyze-topology-convergence.js, scripts/work-scenario-triage.js, scripts/work-theory-ledger.js, src/bootstrap/owners/bootstrap-readiness-owner-class-part-2.js, src/control-plane/control-plane-readiness-service-segment-3.js, src/control-plane/publication-active-gate-handoff-contract.js, src/diagnostics/topology-convergence-graph.js, src/rebalancer/operation-lifecycle.js, src/rebalancer/operation-workflow-owner-ports.js, src/rebalancer/operation-workflow-owner.js, src/rebalancer/operation-workflow-recovery-reconcile.js, src/rebalancer/rebalancer-planning-gate-methods.js, src/rebalancer/unified-rebalancer-segment-1.js, src/rebalancer/unified-rebalancer-segment-5.js, test/distributed/harness/__tests__/cluster-active-gate-startup-acknowledgement-test-cases.js, test/distributed/harness/__tests__/cluster.test-part-4.js, test/distributed/harness/cluster-segment-7-class-4.js, test/rebalancer/cluster-readiness-gate.test.js, test/rebalancer/operation-workflow-owner-adapter.test.js, test/rebalancer/operation-workflow-owner-decision.test.js, test/rebalancer/unified-rebalancer-part-5-2-stage-2.js, test/rebalancer/unified-rebalancer.test-part-5.js, test/scripts/analyze-topology-convergence.test.js, test/scripts/work-theory-ledger.test.js, work/tracks/topology-convergence.md, test/bootstrap/owners/, test/distributed/harness/__tests__/cluster-active-gate-selected-transport-closed-owner-recovery-projection.test.js, test/distributed/harness/__tests__/cluster-active-gate-startup-readiness-admin-availability.test.js, test/scripts/analyze-priority-recovery-residuals.test.js, test/scripts/work-scenario-triage.test.js, work/RULES.md
Candidate runtime files: unknown
Forbidden edits: Preflight closure proof guarantees all focused packages pass before executing the release gate.
Required latest proof: npm run work:context, npm run work:llm-start, npm run work:validate -- --closure work/packages/done-20260513-rolling-restart-latest-artifact-preflight-refresh.md, npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-owner-boundary-consistency-closure.md, npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-latest-residual-fixture-synthesis.md, npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-diff-aware-risk-review.md, focused owner tests selected by the activated runtime package, static guardrails selected by the activated runtime package, node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json --fast-local --verbose # scenario completion state transition contract proof, npm run work:evidence-summary -- test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json, npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-preflight-green-gate-confirmation.report.json, npm run work:validate -- --closure work/packages/todo-20260513-rolling-restart-preflight-green-gate-confirmation.md
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Operating Rules

1. All packages must select the lightest valid workflow lane as defined in `work/RULES.md#lane-definitions`.
2. Run `npm run work:context` and `npm run work:llm-start` before package activation or edits.
3. Do not modify runtime code without a preceding pre-implementation validator check (`npm run work:validate -- --pre-impl`).
4. Closure is atomic: rename packages to `done-...`, update theory ledger and edge cards, run closure validation (`npm run work:validate -- --closure`), then commit and push.
5. Do not widen timeouts or relax admission filters to mask underlying coordination errors.

## Package Queue

1. [Rolling Restart Owner Boundary Consistency Closure](../packages/done-20260513-rolling-restart-owner-boundary-consistency-closure.md)
   - Lane: `scenario-release-gate`
   - Purpose: Reconcile topology, residual, causal-model, and active-gate projections into one owner-owned first frontier.
2. [Rolling Restart Latest Residual Fixture Synthesis](../packages/done-20260513-rolling-restart-latest-residual-fixture-synthesis.md)
   - Lane: `scenario-release-gate`
   - Purpose: Freeze the latest promoted frontier and any priority-recovery residue into focused test fixtures.
3. [Rolling Restart Selected Snapshot Source Timeout Probe](../packages/done-20260521-rolling-restart-selected-snapshot-source-timeout-probe.md)
   - Lane: `experiment`
   - Purpose: Probe whether the selected snapshot source timeout is an inherent transport connection delay or a recovery-planning gate block.
4. [Rolling Restart Preflight Green Gate Confirmation](../packages/done-20260513-rolling-restart-preflight-green-gate-confirmation.md)
   - Lane: `scenario-release-gate`
   - Purpose: Execute full distributed scenario runs to confirm stability under rolling-restarts.

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
