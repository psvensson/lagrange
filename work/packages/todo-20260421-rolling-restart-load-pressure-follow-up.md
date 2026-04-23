# Rolling-Restart Load-Pressure Follow-Up

## Status

Todo on 2026-04-21.

Observed signal after the startup/rejoin boundary fix:

1. `rolling-restart` now closes `restart_recovery`.
2. The remaining failure is classified as `load_pressure` /
   `attemptErrors`, not startup/rejoin recovery.
3. The restarted node becomes reachable through bootstrap health, but the
   remaining failure is on the later admin/query availability path under load.

## Why

This is no longer the same boundary as the node-join convergence failure.

It should stay out of the active critical path while the remaining
priority-recovery completion / remove-safety defect is closed.

## Scope

1. Reproduce and isolate the post-recovery `rolling-restart` load-pressure
   failure after the active node-join convergence package closes.
2. Keep the scope limited to admin/query lane availability and load-pressure
   behavior after recovery closure.

## Validation

1. Focused tests on touched admin/query/load-pressure owners if needed
2. `rolling-restart`
3. `npm run test:metrics`
