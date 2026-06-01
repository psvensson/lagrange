# Node Lifecycle Transition Outcome Owner Collapse

## Why

After the TAP worker stability fix, the unit-only gate exposed one real logic
failure in `test/node/state-transition-validity.property.test.js`.

The failure is not a random property seed issue. It is one ownership split in
node lifecycle transition semantics:

1. `VALID_TRANSITIONS` owns the graph of state-changing lifecycle moves
2. `transition()` independently allows `ready -> ready`
3. property tests that trust only the graph misclassify the idempotent
   lifecycle no-op as invalid
4. transition validity therefore has two owners

This should be collapsed into one explicit transition-outcome contract.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Introduce one explicit node lifecycle transition-outcome owner that
   classifies state-changing, idempotent, and invalid attempts.
2. Remove the out-of-band `ready -> ready` branch from `transition()`.
3. Update lifecycle tests to consume the shared transition-outcome owner.
4. Revalidate the full unit-only gate.
5. Rerun the seven-node harness after unit closure.

## Out Of Scope

1. Changing the lifecycle graph itself beyond formalizing existing
   idempotent-ready behavior.
2. Reworking node readiness, reintegration, or failure-detector semantics.
3. Broad lifecycle architecture rewrites outside the transition contract.

## Invariants

1. State-changing lifecycle transitions remain owned by the canonical graph.
2. Idempotent lifecycle no-op transitions must be explicit in the same owner
   contract, not hidden in runtime branches.
3. Idempotent no-op transitions must not emit state-change events.
4. Unit validation must be green before the next seven-node rerun.

## Hotspots

1. `src/node/node-lifecycle-state-machine-constants.js`
2. `src/node/node-lifecycle-state-machine.js`
3. `test/node/state-transition-validity.property.test.js`
4. `test/node/state-change-event-emission.property.test.js`
5. `test/node/node-lifecycle-state-machine.test.js`

## Analysis Tasks

- [x] Confirm the remaining unit failure is a true lifecycle-transition
  contract mismatch, not runner instability.
- [x] Confirm `transition()` allows `ready -> ready` outside
  `VALID_TRANSITIONS`.
- [x] Confirm property tests currently classify invalid transitions using only
  the state-change graph.

## Implementation Tasks

- [ ] Add one explicit node lifecycle transition-outcome contract.
- [ ] Route `isValidTransition()` and `transition()` through that contract.
- [ ] Update lifecycle tests to use the shared transition-outcome owner.
- [ ] Rerun focused lifecycle suites and the full unit-only gate.
- [ ] Rerun the seven-node harness.
- [ ] Record package outcomes.

## Validation

1. `node test/node/node-lifecycle-state-machine.test.js`
2. `node test/node/state-transition-validity.property.test.js`
3. `node test/node/state-change-event-emission.property.test.js`
4. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
5. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. Lifecycle transition validity has one explicit owner contract.
2. The property suites no longer infer invalidity from the graph alone when an
   idempotent no-op is explicitly allowed.
3. The unit-only gate is green.
4. The next seven-node rerun either passes or moves to a later, clearly
   different runtime boundary.
