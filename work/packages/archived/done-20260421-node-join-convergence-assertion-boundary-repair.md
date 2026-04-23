# Node-Join Convergence Assertion Boundary Repair

## Status

Done on 2026-04-21.

`node-join-under-load` no longer fails on the segmented convergence assertion
boundary. The undeclared-symbol failure is gone, focused proof is green, and
the scenario now reaches a real convergence timeout with full diagnostics and
failure bundles.

## Why

This package existed to remove the false blocker where convergence assertions
crashed before they could report an actual cluster state. That blocker is now
gone.

## Validation

1. `npx tap test/distributed/harness/__tests__/assertions.test.js`
2. `npx eslint --rule 'no-undef:error' ... assertions-segment-1.js assertions-segment-2.js`
3. `npm run test:metrics`
4. `node-join-under-load`

## Outcome

1. The convergence assertion segment now imports and owns its required
   constants/helpers directly.
2. `node-join-under-load` now fails on a real convergence timeout instead of
   `CONVERGENCE_DEFAULTS is not defined`.
3. The next blocker is a new runtime/scenario package, not a regression in
   this segment boundary.
