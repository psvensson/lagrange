# Rolling-Restart Stop/Start Boundary Repair

## Status

Done on 2026-04-21.

`rolling-restart` no longer fails on the raw Docker `container already stopped`
restart boundary. Focused proof is green, and the scenario now reaches a real
recovery-ready timeout with full diagnostics and failure bundles.

## Why

This package existed to remove a false blocker at the stop/start restart
boundary. That blocker is now gone.

## Validation

1. `npx tap test/distributed/harness/__tests__/cluster.test.js`
2. `npm run test:metrics`
3. `rolling-restart`

## Outcome

1. The shared ignorable-stop classifier now recognizes the observed Docker
   already-stopped outcome.
2. Restart observation consumes ignorable stop results instead of surfacing raw
   Docker noise.
3. `rolling-restart` now fails on a real restarted-node recovery-ready timeout
   rather than `container already stopped`.
