# Priority Recovery Operator Controller And Step Witnesses

## Why

The sharpest current blocker is no longer "no operation created." It is
"operation created, but no meaningful step transition followed."

That means critical `replica_operations` still need a stronger operator model:

1. one explicit step table
2. one witness model for each step
3. one timeout/stall classification
4. one legal resume or supersession path

TiKV/PD's operator-controller model is the useful inspiration here: operators
are not just rows that exist; they are monitored progress units.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Define one explicit step model for critical `replica_operations`.
2. Record one required witness or evidence class for every critical step.
3. Detect and classify stalled operations when step witnesses do not arrive.
4. Define one owner path for resume, reissue, supersede, or fail-closed
   behavior.
5. Surface those states into diagnostics and failure bundles.

## Out Of Scope

1. Rewriting all non-critical operation flows in the same package.
2. Replacing the durable `replica_operations` table with a different
   substrate.
3. Broad metrics or reporting work outside operator-state surfacing.

## Invariants

1. Every active critical operation must have one explicit step and one legal
   next action.
2. Timeout-only silence must not be the primary semantic state.
3. `RebalanceCoordinator` remains the durable owner of owner-managed workflow
   fields.

## Hotspots

1. `src/rebalancer/rebalance-coordinator.js`
2. `src/control-plane/replica-dispatch-service.js`
3. `src/replica-operation-constants.js`
4. `src/replica-operation-liveness.js`
5. `src/replica-operation-repository.js`
6. `test/distributed/harness/failure-bundle.js`
7. `test/distributed/harness/report-writer.js`

## Detection / Analysis Tasks

- [x] Inventory the current step names, status fields, and inferred
      transitions for critical operations.
- [x] Detect where step progress depends on indirect log or cache evidence.
- [x] Detect where multiple callers can reinterpret the same stalled state.
- [x] Define one canonical stalled-operation vocabulary and witness map.
- [x] Define the legal resume/supersede matrix for critical operations.

## Implementation Tasks

- [x] Add the explicit step and witness model for critical operations.
- [x] Make dispatch and coordinator paths write and consume that model.
- [x] Add canonical stall classification and recovery ownership.
- [x] Surface the witnesses into diagnostics and failure bundle output.
- [x] Perform the required closure deep dive across all affected code areas;
      fix spotted mistakes, irregularities, and doctrine violations or split
      follow-up packages before closure.

## Validation

1. Targeted `rebalance-coordinator` and dispatch owner tests.
2. Failure-bundle and report-writer regression tests.
3. One boundary scenario that proves stalled-operation classification.
4. One seven-node rerun that confirms the failure either clears or moves to a
   later, clearer boundary.

## Done When

1. No critical operation can remain active without an explicit step witness.
2. `operation_created_but_no_step_transitions` is either eliminated or owned
   by one typed recovery path.
3. Failure diagnostics surface the operator state directly.
4. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
