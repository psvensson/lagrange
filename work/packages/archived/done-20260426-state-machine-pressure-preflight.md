# State Machine Pressure Preflight

April 26 package: add a fast pressure-point sanity check that runs before
long distributed harness scenarios and can also be fed captured diagnostics by
tests or triage scripts.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## Why

The latest `rolling-restart` runs moved the blocker several times:

1. `OPEN` publication with pending ACK count `0`
2. real `ACK_PENDING` publication debt
3. post-active topology timeout after publication and operation drain closed
4. sustained membership trim and over-target voter pressure

The long harness run is still needed for runtime proof, but the state-machine
grammar has enough information to catch impossible or stall-prone states before
spending several minutes on the full scenario.

## Completed Work

1. Added `test/distributed/harness/state-machine-pressure-preflight.js`.
2. The preflight defines explicit closure obligations for:
   publication convergence, operation drain, membership trim, no-over-target
   voter cleanup, replacement leader ownership, recovery admission, and CDC
   projection visibility.
3. The static check verifies every pressure point has:
   owner, producer, witness, retry trigger, escalation, and consumer.
4. The snapshot check accepts harness diagnostics and flags:
   published publication with pending ACK debt, ack-complete non-terminal
   publication rows, completed-active operation rows, membership trim after
   operation drain closure, over-target cleanup after operation drain closure,
   replacement leader handoff stalls, recovery-admission stalls, and CDC
   projection stalls.
5. Added `scripts/check-state-machine-pressure-preflight.js`.
6. Added `npm run audit:state-machine-pressure`.
7. Wired `npm run audit:runtime-grammar` to run the preflight after the
   runtime grammar contract audit.
8. Wired `npm test` through `pretest` so the preflight runs before the default
   unit suite.
9. Wired `npm run test:static` to include `npm run audit:runtime-grammar`.
10. Wired `test/distributed/run.js` so the static preflight executes before
   Docker build and distributed scenario execution.
11. Wired `runScenarios` so tests and programmatic distributed runs execute
    the same preflight and record the result in report metadata.
12. Extended the runtime grammar contract audit so removal of the preflight
    module or runner wiring is itself a static audit failure.

## Current Diagnostic Use

Running the preflight against the latest representative report:

1. command:
   `node scripts/check-state-machine-pressure-preflight.js --report test-output/report.json`
2. result: `warning`, `ready=true`
3. issues:
   completed-active operation rows, membership trim still open after operation
   drain closed, and over-target cleanup still open after operation drain
   closed

That matches the current `rolling-restart` blocker: publication is closed and
the remaining failure is post-active topology trim/over-target pressure.

## Validation

1. `node --check test/distributed/harness/state-machine-pressure-preflight.js`
2. `node --check scripts/check-state-machine-pressure-preflight.js`
3. `node --check test/distributed/run.js`
4. `node --check test/distributed/run-runtime-helpers.js`
5. `node --check test/distributed/harness/__tests__/state-machine-pressure-preflight.test.js`
6. `node --test test/distributed/harness/__tests__/state-machine-pressure-preflight.test.js`
7. `node --test test/distributed/harness/__tests__/run.test.js`
8. `node --test test/scripts/check-runtime-grammar-contracts.test.js`
9. `npm run audit:state-machine-pressure`
10. `npm run audit:runtime-grammar`
11. `npm run audit:guideline:literals`
12. `npm run audit:guideline:decision-boundaries`
13. `npm run audit:guideline:boundary-mode-contracts`
14. `git diff --check`

## Done

The preflight is now reusable as a test helper, available as a direct audit
script, included in the runtime grammar audit path, included in static test
quality, and executed by the distributed runner before long scenarios.
