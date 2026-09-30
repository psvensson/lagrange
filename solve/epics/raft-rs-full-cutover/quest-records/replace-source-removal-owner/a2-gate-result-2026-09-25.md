# A2 gate on 102e127c4 (seed parity + F1 + lease verdict): stopped at SLO run 7

The A2 gate ran once on the exact candidate 102e127c4 on the controller.

## Results

| Run | Result |
|---|---|
| node-join-convergence-slo runs 1-6 | green (49-53 s each) |
| node-join-convergence-slo run 7 | red: "over-target voter duration should stay bounded (2516ms <= 2000ms)" |

The gate stopped at the first red, as designed. The remaining steps did not run.

Run 7 evidence (the assertion's own evidence record, partition replica_operations-p1):
- The REPLACE was `active/ACTIVE` (source 0201, target 0202) at the first sample and was still ACTIVE at the last sample.
- There was no planner REMOVE.
- There were zero handoff failures.

## Preliminary classification (to be confirmed)

The lease fix removed the early-close path (path 2). The remaining tail is the REPLACE waiting at ACTIVE itself. The suspected cause is remove-safety deferring on the refresh-pending readiness answer, then re-checking on its fixed 1 s fallback: R-2 in the design, which was moved to the epic by the narrowed scope.

This is to be confirmed by a red-rate classification with the recorder on lab hosts before any decision.
