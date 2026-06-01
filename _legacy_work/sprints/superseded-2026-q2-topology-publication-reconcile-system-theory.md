# Topology Publication Reconcile System Theory Sprint

Status: superseded. Closed on May 23, 2026.

Distinguished Outcome: H1 (hidden active queue) + H3 (operation residual predecessor).

## Goal

Distinguish whether the accepted publication owner-reconcile handoff has a
bounded wake/retry/reconcile/drain path across the full
publication-to-active-gate system, or whether the missing progress visibility is
an architecture contract gap.

## Holistic Theory Surface

This sprint must account for all relevant system parts before runtime
promotion:

1. `topology_publication_owner / publication_convergence`: publication is
   `OPEN`, missing published nodes remain, and recovery waits for publication.
2. `operation_workflow_owner / rebalancer_handoff`: one non-splitting residual
   witness remains for `control_plane_publications-p1`.
3. `startup_active_gate_owner / snapshot_coverage`: active-gate is downstream
   and deferred with `snapshotCoverage=3/5`.
4. `startup_readiness_owner / startup_support_evidence`: readiness is inherited
   behind active-gate no progress.
5. `diagnostics_owner / causal_analysis_framework`: routing selects
   publication ACK convergence while handoff diagnostics report
   `write_deferred`, `enqueued=true`, and owner queue depth `unknown`.

## Competing Theories

- H1: the handoff reaches a publication-owner queue, but diagnostics do not
  expose queue depth or drain/retry progress.
- H2: the handoff is accepted as `enqueued=true` but does not reach durable
  publication-owner drain/retry progress.
- H3: the operation workflow residual is the true predecessor, so publication
  pending is a routed symptom until that residual is explained.

## Required First Proof

```bash
npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe
npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown
```

## Package Queue

1. [Topology Publication Reconcile System Theory](../packages/done-20260521-topology-publication-reconcile-system-theory.md)
   - Lane: `experiment`
   - Owner boundary: `topology_publication_owner / publication_convergence`
   - Acceptance: distinguish H1/H2/H3 and name either one bounded runtime
     package or an architecture-contract package.
