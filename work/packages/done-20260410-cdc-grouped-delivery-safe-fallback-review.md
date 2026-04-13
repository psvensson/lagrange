# CDC Grouped-Delivery Safe Fallback Review

## Why

Grouped CDC dissemination already owns its own safe-fanout fallback, which is
the right structural shape. What is still missing is a deliberate review of
which triggers are genuinely necessary and whether repeated grouped-delivery
failures mean the dissemination boundary should shrink further.

## Scope Basis

Phase 0.1 roadmap scope: failure-simulation robustness and one dissemination
path for shared metadata.

## Sprint Umbrella

[Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

Fallback IDs:

1. `FB-TP-001`

## In Scope

1. Review every grouped-delivery fallback trigger.
2. Separate genuinely necessary degraded dissemination from avoidable grouped
   failure triggers.
3. Tighten diagnostics and guardrails around safe-fanout activation.

## Out Of Scope

1. Query provisioning degraded cohort selection.
2. Transport reconnect authority ownership.
3. Bootstrap hint/peer-location bridge removal.

## Invariants

1. Dissemination fallback remains owner-contained.
2. Grouped-to-safe-fanout behavior is explicit and bounded.
3. Repeated grouped-delivery bugs should shrink the boundary, not accumulate
   ad hoc exemptions.

## Hotspots

1. `src/topology/cdc-group-propagation-service.js`
2. Grouped CDC propagation tests and distributed CDC scenarios

## Detection / Analysis Tasks

- [x] Inventory every reason that currently activates safe-fanout fallback.
- [x] Identify which reasons indicate a real structural boundary problem.
- [x] Confirm what diagnostics are needed to keep this path observable.

## Implementation Tasks

- [x] Reduce unnecessary safe-fanout triggers.
- [x] Tighten diagnostics and tests around grouped-delivery fallback.
- [x] Document any remaining irreducible fallback triggers in code/tests.

## Validation

1. CDC group propagation unit tests.
2. CDC integration tests.
3. Distributed scenarios with grouped delivery under node churn or delivery
   failure.

## Done When

1. Safe-fanout fallback remains owner-contained and intentionally small.
2. Trigger reasons are explicit and justified.
3. Repeated grouped-delivery failures are easier to diagnose and act on.
