# Evidence Scout Route Card

<!-- agent-route-card
{
  "schema": "agent-route-card-v1",
  "package": "work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md",
  "agentRole": "evidence-scout",
  "mode": "read-only",
  "status": "complete",
  "recommendedRoute": "runtime-owner-implementation",
  "confidence": "medium",
  "ownerBoundary": "startup_active_gate_owner / snapshot_coverage",
  "stalenessRisk": "low",
  "evidenceUsed": [
    "npm run work:context",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun",
    "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md"
  ],
  "mustNotEdit": [
    "src/",
    "work/packages/",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/theory-ledger.md",
    "work/sprints/"
  ],
  "writesAllowed": [],
  "rationale": "The fresh representative rerun is causal rather than stale, accepted, contradictory, or green-capable: priority-recovery residuals drained to zero, but the first frontier is active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending, selected_snapshot_source_timeout, and snapshot_repair_deferred."
}
-->

## Finding

The current rolling-restart rerun evidence is fresh and causal. It is not green-capable because the representative rerun failed, not stale because the canonical summary and route read the active rerun artifact, not accepted because priority-recovery residuals are already zero, and not contradictory because the evidence summary and scenario route agree on the same first frontier.

The canonical evidence summary reports one topology frontier: `active_gate_snapshot_coverage`, owned by `startup_active_gate_owner / snapshot_coverage`, in `deferred` state with dominant reason `owner_reconcile_pending`. The witness reasons are `owner_reconcile_pending`, `snapshot_coverage_incomplete`, `selected_snapshot_source_timeout`, and `snapshot_repair_deferred`.

## Recommended Route

`runtime-owner-implementation`

The route should migrate successor attention from the drained priority-recovery path to `startup_active_gate_owner / snapshot_coverage`. The coordinator should keep release-gate workflow state unchanged until it compares the other scout cards and records the selected successor, but this evidence card selects the active-gate snapshot coverage frontier as the fresh causal blocker.

## Evidence

- `npm run work:context`
- `npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- `npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun`
- `test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- `work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md`

## Coordinator Notes

The route output reports `priorityRecoveryResiduals.witnessCount: 0`, `ownerBoundaryGroupCount: 0`, and `splitRequired: false`, so priority recovery should not be reopened from this artifact.

The representative evidence remains red at `active_gate_snapshot_coverage`; the causal result is `continue_local_fix` with stop condition `classified_local_blocker`. Compare this card against the model-contract and source-map cards before opening the successor, especially because the route also reports a release-gate runtime promotion guard blocked by saturated history and continuation required.
