# Topology Convergence Theory Ladder Sprint

Status: done. Closed on 2026-05-21 after H1 and H3 distinguished the deadlock and migrated the boundary to operation_workflow_owner / rebalancer_handoff.

## Goal

Run topology-convergence as a sequence of falsifiable theory sprints. Each
theory starts with a specific system-level prediction, covers the relevant
producer, workflow, consumer, readiness, and diagnostics surfaces, runs the
smallest useful probe, records how the theory fared, and creates the next
theory from observed evidence instead of continuing as a generic bugfix queue.

## Sprint Strategy Brief

- Goal state: rolling-restart is green, or every failed run produces a holistic
  theory with a pre-registered discriminator across all relevant system parts.
- Current causal thesis: the post-reset baseline returned to
  `publication_ack_convergence / topology_publication_owner /
  publication_convergence / publication_pending`; the next useful theory is
  whether the accepted owner-reconcile handoff is visible and drainable across
  publication owner, operation workflow, active-gate snapshot coverage,
  readiness support evidence, and diagnostics.
- Competing hypotheses: H1 the operation-progress reset made rolling-restart
  green; H2 the first frontier migrates to a narrower owner boundary; H3 the
  same publication/operation/active-gate oscillation persists and requires a
  new architecture or missing-edge theory before runtime work.
- Confidence and evidence: medium; the prior operation-progress package closed
  the architecture gap, but no fresh representative artifact has been routed
  through this theory-ladder process.
- Expected green path: the queued publication-reconcile system theory proves a
  bounded wake/retry/reconcile/drain edge across the publication-to-active-gate
  path, then either opens one runtime package or rejects local runtime
  promotion with a sharper architecture contract.
- Wrong direction signals: opening runtime work before the baseline artifact is
  routed, treating timestamp-only changes as movement, or creating another
  same-frontier package without a changed hypothesis.
- Next best package:
  `work/packages/done-20260521-topology-publication-reconcile-system-theory.md`.
- Stop or escalate rule: if the baseline cannot produce a report or canonical
  route, close the probe as evidence-incomplete and fix the probe/harness before
  runtime implementation.

## Current Edge Card

```text
Representative artifact: test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json
Visible first frontier: publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending
Active package: work/packages/done-20260521-topology-publication-reconcile-system-theory.md
Active package owner: topology_publication_owner
Active package boundary: publication_convergence
Selected cause: publication_pending
Required action: Prove whether the accepted owner-reconcile handoff reaches visible bounded wake/retry/reconcile/drain progress across publication, operation workflow, active-gate, readiness, and diagnostics before runtime promotion.
Representative status: unknown
Causal outcome: pending-before-rerun
Architecture gate: watching / unknown
Expected delta: pending holistic theory -> H1 queue hidden, H2 queue/drain missing, H3 operation residual predecessor, or evidence-incomplete
Current state: Baseline theory run returned to publication_ack_convergence with OPEN epoch 2, missingPublished=2, write_deferred owner_reconcile_pending enqueued=true, active-gate deferred at snapshotCoverage=3/5, one non-splitting operation workflow residual, and owner queue depth unknown.
Allowed edits: work/packages/done-20260521-topology-publication-reconcile-system-theory.md, work/sprints/todo-2026-q2-topology-publication-reconcile-system-theory.md
Candidate runtime files: unknown
Forbidden edits: publication owner outcome + operation workflow residual status + active-gate precondition + readiness support state + diagnostics route
Required latest proof: npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --handoff-probe, npm run analyze:topology-convergence -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --explain publication_ack_convergence, npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-theory-baseline-20260521T035711Z.report.json --markdown, npm run work:validate -- --probe work/packages/done-20260521-topology-publication-reconcile-system-theory.md
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```

## Theory Ledger

| Theory sprint | Status | Prediction | Result | Successor rule |
| --- | --- | --- | --- | --- |
| baseline rolling-restart after operation-progress reset | observed | fresh evidence distinguishes H1 green, H2 migrated frontier, or H3 same oscillation | H3 matched: red at `publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending`; handoff enqueued but owner queue depth unknown | create holistic publication-reconcile system theory |
| publication reconcile system theory | done | accepted `write_deferred` handoff either reaches visible bounded publication-owner progress across dependent consumers, or the architecture contract is missing | H1 (hidden active queue) and H3 (priority residual deadlock) | migrate owner boundary to operation_workflow_owner |

## Package Queue

1. [Rolling Restart Theory Baseline Probe](../packages/done-20260521-rolling-restart-theory-baseline-probe.md)
   - Lane: `experiment`
   - Owner boundary: `diagnostics_owner / rolling_restart_theory_baseline`
   - Purpose: produce and route the fresh post-reset baseline artifact.
   - Acceptance: observed result fills the experiment outcome and selects the
     next theory or runtime package without runtime edits.
2. [Topology Publication Reconcile System Theory](../packages/done-20260521-topology-publication-reconcile-system-theory.md)
   - Lane: `experiment`
   - Owner boundary: `topology_publication_owner / publication_convergence`
   - Purpose: prove whether the accepted owner-reconcile handoff has a visible,
     bounded publication-owner queue/drain path across operation workflow,
     active-gate, readiness, and diagnostics before runtime promotion.
   - Acceptance: H1/H2/H3 is distinguished and the next package is either one
     runtime owner-boundary slice or an architecture-contract package.
