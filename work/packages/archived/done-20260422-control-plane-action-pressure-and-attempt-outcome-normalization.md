# Control-Plane Action Pressure And Attempt-Outcome Normalization

## Why

The latest under-load artifacts show strong control-plane pressure signals:
queue growth, owner-RPC timeouts, message timeouts, and write backlog.

Those are currently visible, but they are still too secondary.
They need to become normalized `conditions` and actuation inputs on the pilot
slice rather than free-floating reason strings.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

## In Scope

1. Normalize control-plane pressure evidence relevant to the pilot slice into
   one `conditions` contract.
2. Distinguish retryable pressure from terminal actuation failure.
3. Feed normalized pressure conditions into the actuation contract instead of
   leaving them as report-only evidence.
4. Keep transport, queue, write, and authoritative-read pressure on one
   bounded vocabulary where they are semantically equivalent for the touched
   action path.

## Out Of Scope

1. Repo-wide pressure taxonomy redesign
2. Non-pilot slices outside the touched priority-recovery path

## Hotspots

1. `src/control-plane/control-plane-mutation-readiness.js`
2. `src/rebalancer/rebalance-coordinator-segment-1.js`
3. `src/rebalancer/replica-operation-repository-observation-methods.js`
4. `src/control-plane/priority-recovery-snapshot.js`
5. `test/control-plane/priority-recovery-snapshot.test.js`

## Execution Notes

1. Normalized logs-table backlog and shared backpressure evidence into one
   shared `conditions.pressure` contract via
   `buildPriorityRecoveryPressureConditions(...)`.
2. Threaded that pressure contract through
   `PriorityRecoveryDecisionSnapshot`,
   `PriorityRecoveryObservationSnapshot`,
   admin control snapshots, and harness retained diagnostics.
3. The actuation layer now distinguishes ordinary missing work from
   `persist_blocked_by_pressure`, so pressure is no longer only a report-side
   explanation.

## Validation

1. Focused snapshot and coordinator tests for retryable pressure shaping
2. `npm run test:metrics`

## Done When

1. Pressure evidence on the pilot slice is a first-class condition input.
2. Actuation can distinguish blocked-by-pressure from plain absence of work.
