# Transport Late-Response Lifecycle Unification

## Why

Late service responses were still producing large orphaned-response storms, and
there was a stale parallel implementation shape in
`src/transport/router-message-handler.js`.

This was both an observability problem and a likely pressure amplifier.

## Scope Basis

Phase 0.1 roadmap scope: control-plane stability under transport pressure and
failure simulation.

## In Scope

1. Define one explicit pending-response lifecycle model.
2. Define one typed retirement/disposition model for late responses.
3. Remove or downgrade stale parallel response-handling shapes.
4. Keep warnings for true anomalies while turning expected late responses into
   cheap classified counters or debug-level handling.

## Out Of Scope

1. Admission semantics for rebalancers.
2. Active-membership snapshot work.
3. Operation owner-path unification.

## Invariants

1. Request/response lifetime remains owned and bounded.
2. Expected late responses must not flood warning logs.
3. True protocol mismatches must remain visible.

## Hotspots

1. `src/transport/message-router.js`
2. `src/transport/router-message-handler.js`
3. `test/transport/message-router.test.js`
4. `test/transport/message-router-late-response-classification.test.js`

## Implementation Tasks

- [x] Define one explicit service-response disposition model in
      `src/transport/message-router.js`.
- [x] Count settled and late-response classifications from the canonical owner
      instead of treating only warning logs as observability.
- [x] Reduce `src/transport/router-message-handler.js` to a thin delegated
      adapter for `SERVICE_RESPONSE` handling.
- [x] Cover late-response dispositions and adapter behavior with focused
      transport tests.

## Outcome

Completed as the transport-lifecycle simplification batch. The response path is
cleaner and more explicit, but join/restart storms still create broader
control-plane pressure through durable node-state publication and observation
coupling. That larger pressure path is now tracked in the recovery-architecture
sprint.

## Validation

- [x] Late-response classification tests
- [x] Router tests covering timeout, cancellation, and adapter behavior
- [x] Router message-handler property tests
- [x] Partial distributed verification completed; remaining pressure issues are
      now tracked in the recovery-architecture sprint

## Done When

1. One response-lifetime model owns retirement and late-response meaning.
2. Expected late responses no longer appear as generic orphan warnings.
3. The stale parallel service-response path is removed or reduced to a thin
   adapter.
4. Remaining control-plane pressure issues, if any, are tracked separately.
