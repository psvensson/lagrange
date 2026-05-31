# Model Contract Scout Route Card

<!-- agent-route-card
{
  "schema": "agent-route-card-v1",
  "package": "work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md",
  "agentRole": "model-contract-scout",
  "mode": "read-only",
  "status": "complete",
  "recommendedRoute": "architecture-gap",
  "confidence": "high",
  "ownerBoundary": "release_gate_owner / rolling_restart_fully_green_gate -> startup_active_gate_owner / snapshot_coverage",
  "stalenessRisk": "low",
  "evidenceUsed": [
    "npm run work:context",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain snapshot_coverage",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "npm run work:contract:check",
    "npm run model:contracts",
    "npm run work:frontier-history -- --owner startup_active_gate_owner --boundary snapshot_coverage --limit 12",
    "npm run work:frontier-history -- --owner release_gate_owner --boundary rolling_restart_fully_green_gate --limit 12",
    "test-output/reports/rolling-restart-contract-first-green-rerun.report.json"
  ],
  "contractRefs": [
    "architecture/contracts/rolling-restart-rebalancer-handoff.md",
    "architecture/contracts/active-gate-convergence.md",
    "architecture/contracts/package-lifecycle.md"
  ],
  "modelRefs": [
    "docs/specs/decision-tables/rebalancer-handoff-priority-recovery.json",
    "docs/specs/statecharts/package-lifecycle.json",
    "models/active-gate/ActiveGate.tla",
    "models/active-gate/action-manifest.json",
    "test/model/active-gate/model.js",
    "test-output/reports/active-gate-model-route.model.report.json",
    "test-output/reports/active-gate-model-stall.model.report.json",
    "test-output/reports/active-gate-tlc-route.model.report.json",
    "test-output/reports/active-gate-tlc-stall.model.report.json"
  ],
  "mustNotEdit": [
    "src/",
    "work/packages/",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/sprints/",
    "work/theory-ledger.md"
  ],
  "writesAllowed": [],
  "rationale": "Fresh representative evidence is accepted and contract/model checks pass, but the route guard blocks runtime promotion for the repeated startup_active_gate_owner / snapshot_coverage frontier; the next route should be an architecture-gap experiment/package that names a non-repeated contract/model/topology transition before any source work."
}
-->

## Finding

The fresh rerun is not representative-green. Canonical evidence now selects
`active_gate_snapshot_coverage` under
`startup_active_gate_owner / snapshot_coverage` with
`owner_reconcile_pending`, `snapshot_coverage_incomplete`,
`selected_snapshot_source_timeout`, and `snapshot_repair_deferred`.
Priority-recovery residual witness count is `0`, so the old
`operation_workflow_owner / rebalancer_handoff` backpressure route is drained
for this artifact.

The contract/model records are structurally valid: `work:contract:check` passed
for all three system contracts, and `model:contracts` passed the decision-table,
statechart, active-gate fast-check, and TLC checks. Those records support
treating the fresh result as a real route signal, but they do not authorize
runtime source promotion because `scenario-route` reports
`runtimePromotionGuard.state=blocked` with
`saturated_history_requires_non_repeated_source_contract`.

## Recommended Route

`architecture-gap` as the scout-card value, concretely an
architecture-package/experiment for the fresh
`startup_active_gate_owner / snapshot_coverage` frontier.

Do not select `runtime-owner-implementation` from this card. The model and
contract records are green, but the repeated active-gate frontier and blocked
promotion guard mean the coordinator needs a non-repeated contract/model/topology
route or a bounded architecture experiment before source edits. Do not select
`evidence-regeneration`: the fresh artifact is present and the summary, route,
causal model, and residual extractor agree. Do not select
`contract-model-repair` as the first route: the contract checker and model gates
are green; the gap is route selection after repeated representative evidence,
not a broken contract record.

## Evidence

- Active package:
  `work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md`
- Sprint:
  `work/sprints/active-2026-q2-rolling-restart-contract-first-green-theory-loop.md`
- Theory ledger:
  `work/theory-ledger.md`
- Contracts:
  `architecture/contracts/rolling-restart-rebalancer-handoff.md`,
  `architecture/contracts/active-gate-convergence.md`,
  `architecture/contracts/package-lifecycle.md`
- Fresh artifact:
  `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- `npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
  reported first frontier `active_gate_snapshot_coverage`,
  owner/boundary `startup_active_gate_owner / snapshot_coverage`, and dominant
  reason `owner_reconcile_pending`.
- `npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun --explain snapshot_coverage`
  reported priority recovery residual witnesses `0` and
  `runtimePromotionGuard.state=blocked`.
- `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
  reported `witnessCount: 0`.
- `npm run model:contracts` passed.

## Coordinator Notes

Compare this card with `evidence-scout` and `source-map-scout`. If they agree
that the fresh artifact is accepted and source mapping still points at a
repeated saturated active-gate shape, open an architecture-gap/experiment route
package rather than a runtime package. The successor should explicitly name the
non-repeated contract/model/topology transition it is trying to prove, and keep
`src/` plus workflow state outside scout write scope.
