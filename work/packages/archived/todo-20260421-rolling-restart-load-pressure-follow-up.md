# Rolling-Restart Load-Pressure Follow-Up

## Status

Superseded on April 24, 2026 by
[Rolling restart final leader-map consistency and CDC pressure](./done-20260424-rolling-restart-final-leader-map-consistency-and-cdc-pressure.md),
then by
[Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md).

Observed signal after the startup/rejoin boundary fix:

1. `rolling-restart` now closes `restart_recovery`.
2. The remaining failure is classified as `load_pressure` /
   `attemptErrors`, not startup/rejoin recovery.
3. The restarted node becomes reachable through bootstrap health, but the
   remaining failure is on the later admin/query availability path under load.

## Why

This is no longer the same boundary as the node-join convergence failure.

It stayed out of the active critical path while priority-recovery completion,
remove-safety, and follow-up operation creation were closed. The latest
secondary re-entry evidence now makes this area active again, but under the
newer recovery-ready/admin transport pressure package because the concrete
failure has sharper owner evidence than this older placeholder.

## Scope

1. Reproduce and isolate the post-recovery `rolling-restart` load-pressure
   failure after the active node-join convergence package closes.
2. Keep the scope limited to admin/query lane availability and load-pressure
   behavior after recovery closure.

## Validation

1. Focused tests on touched admin/query/load-pressure owners if needed
2. `rolling-restart`
3. `npm run test:metrics`
