# Transport Delivery Contract And Response-Correlation Hardening

## Status

Complete on 2026-04-19 after landing the shared transport delivery-outcome
grammar, hardening ACK-versus-SERVICE_RESPONSE correlation in `MessageRouter`,
and cutting the remaining touched business owners over to the canonical
delivery contract. Named harness reruns remain intentionally deferred until
the completed package set is handed back to the harness lane.

## Why

`MessageRouter` still leaks transport timing and correlation surprises into
business boundaries. The system needs one delivery contract so reconnects,
orphan responses, and queue defer semantics remain transport-local.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Make transport return canonical delivery outcomes only.
2. Keep response-correlation, reconnect, and queue bounds owned by transport.
3. Remove business-owner dependence on raw orphan-response or reconnect
   warnings.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Residual Closure Inventory

- [x] Router delivery normalization now preserves handler payloads while
      treating canonical transport metadata as transport-owned, not inline ACK
      business payload.
- [x] Rebalancer dispatch, join publication, node-state publication, and
      service dispatcher now consume one shared delivery outcome grammar plus
      typed reason codes.
- [x] Response correlation, late-response absorption, and reconnect/timeout
      diagnostics stay transport-local instead of leaking through ad hoc raw
      warning interpretation.

## Validation

1. `test/transport/transport-semantic-outcome.test.js`
2. `test/transport/message-router.test.js`
3. `test/bootstrap/node-joining-service.test.js`
4. `test/service/service-dispatcher.test.js`
5. `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
6. `npm run test:metrics`
