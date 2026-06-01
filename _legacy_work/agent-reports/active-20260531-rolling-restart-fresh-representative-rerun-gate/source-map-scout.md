# Source Map Scout Route Card

<!-- agent-route-card
{
  "schema": "agent-route-card-v1",
  "package": "work/packages/active-20260531-rolling-restart-fresh-representative-rerun-gate.md",
  "agentRole": "source-map-scout",
  "mode": "read-only",
  "status": "complete",
  "recommendedRoute": "runtime-owner-implementation",
  "confidence": "medium",
  "ownerBoundary": "startup_active_gate_owner / snapshot_coverage",
  "stalenessRisk": "low",
  "evidenceUsed": [
    "test-output/reports/rolling-restart-contract-first-green-rerun.report.json",
    "work/templates/agent-route-card.md",
    "src/control-plane/publication-active-gate-handoff-contract-decision.js",
    "src/control-plane/membership-publication-active-gate-reconcile.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-active-gate-handoff-contract-selection.js",
    "src/bootstrap/traffic-readiness-utils.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "src/control-plane/owner-queue.js"
  ],
  "candidateFiles": [
    "src/control-plane/publication-active-gate-handoff-contract-decision.js",
    "src/control-plane/membership-publication-active-gate-reconcile.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-active-gate-handoff-contract-selection.js",
    "src/control-plane/publication-active-gate-handoff-contract-fence.js",
    "src/control-plane/publication-recovery-handoff-evidence-normalizers.js",
    "src/admin/admin-control-snapshot-publication-handoff.js",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js",
    "src/bootstrap/traffic-readiness-utils.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "src/control-plane/owner-queue.js"
  ],
  "mustNotEdit": [
    "src/",
    "work/packages/",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/theory-ledger.md"
  ],
  "writesAllowed": [],
  "rationale": "Fresh representative evidence selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending, selected_snapshot_source_timeout, snapshot_repair_deferred, and zero priority-recovery residual witnesses; source inspection maps that route to the publication active-gate handoff and owner-reconcile files, with readiness and owner-queue files as adjacent consumers/supporting surfaces."
}
-->

## Finding

Fresh route evidence does not support representative-green or priority-recovery work. `npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json` reports first frontier `active_gate_snapshot_coverage`, owner `startup_active_gate_owner`, boundary `snapshot_coverage`, state `deferred`, dominant reason `owner_reconcile_pending`, plus `snapshot_coverage_incomplete`, `selected_snapshot_source_timeout`, and `snapshot_repair_deferred`. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json` reports `witnessCount: 0`.

Read-only source inspection maps the selected route to the publication active-gate handoff contract and reconcile path. `src/control-plane/publication-active-gate-handoff-contract-decision.js` owns the pending owner-reconcile and runtime-promotion decision table. `src/control-plane/publication-active-gate-handoff-contract.js` builds the handoff contract with pending reconcile/recovery debt, retry, and owner outcome evidence. `src/control-plane/publication-active-gate-handoff-contract-selection.js` selects active-gate handoff candidates from progress context and selected snapshot timeout/recovery evidence. `src/control-plane/membership-publication-active-gate-reconcile.js` is the concrete owner-reconcile executor for active-gate membership publication.

Adjacent surfaces are candidates for affected-consumer proof, not primary edit targets from this scout card. Startup readiness/support evidence is represented in `src/bootstrap/traffic-readiness-utils.js` and `src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js`. Control-plane owner queue visibility/reconcile mechanics map to `src/workflow/owner-key-reconcile-queue.js` and `src/control-plane/owner-queue.js`.

## Recommended Route

`runtime-owner-implementation` at medium confidence.

The owner/boundary is concrete and source-mappable, but coordinator selection should compare this card with the model-contract scout because the scenario route also reports a blocked runtime-promotion guard from saturated repeated history. If promoted, the runtime package should be tightly scoped to one non-repeated active-gate handoff/reconcile mechanism and keep startup readiness downstream.

## Evidence

- `npm run work:evidence-summary -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- `npm run work:scenario-route -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json --owner release_gate_owner --boundary rolling_restart_fully_green_gate --dominant-reason accepted_classified_backpressure_rerun`
- `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-contract-first-green-rerun.report.json`
- `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- `rg` inspections for active-gate snapshot coverage, publication active-gate handoff, startup readiness/support, and control-plane owner queue terms.

## Coordinator Notes

Compare with the evidence-scout and model-contract-scout before opening the successor. This card identifies source candidates only; it did not edit `src/`, workflow state, package status, sprint state, current-blocker files, or theory ledger.
