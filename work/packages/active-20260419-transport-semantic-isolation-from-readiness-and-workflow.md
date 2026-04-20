# Transport Semantic Isolation From Readiness And Workflow

## Status

Active on 2026-04-19.

Focused proof is now green. Router/query-transport selection, local transport
readiness normalization, authoritative control-plane fallback, readiness
evidence, and seed-side owner-read diagnosis all consume the shared typed
transport outcome. Named harness evidence remains the final closure gate.

## Why

ACK timeout quarantine, reconnect churn, and owner-read transport failures
still leak into workflow semantics indirectly. That makes transport problems
look like publication or recovery truth problems, which creates surprise and
poor diagnosability.

This package isolates transport outcomes so readiness and workflow owners
consume one typed delivery result instead of raw router symptoms.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Normalize router outcomes to one semantic delivery contract for readiness
   and owner reads.
2. Remove direct readiness/workflow dependence on quarantine or reconnect
   internals.
3. Preserve transport diagnostics without letting them masquerade as semantic
   workflow truth.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Invariants

1. Transport failure must not be misclassified as publication completion or
   workflow absence.
2. Readiness/workflow owners must consume typed delivery outcomes, not raw
   router-local state.
3. Transport diagnostics remain visible but non-authoritative for semantic
   lifecycle decisions.

## Residual Closure Inventory

- [x] One typed delivery outcome is reused across readiness and workflow
      consumers.
- [x] Router-local quarantine/reconnect details stop driving semantic gates.
- [ ] Focused transport/readiness proof and named harness evidence are green.
  Focused proof is green with:
  `npm test -- test/transport/message-router.test.js test/control-plane/authoritative-control-plane-view.test.js test/integration/seed-owner-read-diagnosis.integration.test.js`
  and
  `npm test -- test/integration/replica-operations-owner-read-transport-readiness.integration.test.js`.
  Named harness evidence has not been rerun yet in this package.
