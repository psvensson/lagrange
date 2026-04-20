# Message Router Connection Authority and Outbound Registry Owner Split

## Why

`MessageRouter` still owns too many unrelated concerns: peer identity,
incoming admission, reconnect authority, outbound queue pressure, pending
request bookkeeping, and shutdown behavior. That makes transport bugs harder
to isolate because connection authority and queue pressure failures overlap in
one class.

This package splits those concerns so transport failures are easier to reason
about in harness runs and in direct owner tests.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Split `src/transport/message-router.js` into one connection
   authority/admission owner and one outbound queue + pending registry owner.
2. Preserve one canonical peer-endpoint authority for delivery and reconnect
   decisions.
3. Preserve one canonical outbound-pressure and pending-request contract for
   callers.
4. Touch direct collaborators only where needed to consume the extracted
   owners cleanly.

## Out Of Scope

1. New transport features
2. Broad WebSocket protocol changes
3. Control-plane redesign outside the direct transport boundary touched here

## Scenario Targets

1. `rolling-restart`
2. `seed-restart-under-load`
3. `seven-node-load-during-partitioning`
4. `seven-node-read-write-load-transaction-recovery`

## Invariants

1. Connection identity/admission and outbound queue pressure must no longer
   share one semantic owner.
2. Delivery callers must keep one canonical backpressure and retry story.
3. Endpoint authority must stay canonical and must not be rebuilt from
   observed transport noise.

## Shared Boundary Contract

- Semantic owner: extracted transport connection-authority owner and
  outbound-registry owner
- Canonical contract shape / vocabulary: one peer-authority/admission state
  and one outbound registry/backpressure state with typed retry evidence
- Allowed consumers: `MessageRouter`, control-plane heartbeat/publication
  paths, query delivery, focused transport diagnostics and tests
- Prohibited reinterpretations: callers must not infer peer authority from raw
  WebSocket events or pending queue internals
- Primary diagnostics / proof surfaces: transport tests, reconnect/backpressure
  diagnostics, named recovery scenarios

## Detection / Analysis Tasks

- [ ] Build the current connection-authority inventory.
- [ ] Build the current outbound queue and pending-request inventory.
- [ ] Define the extracted owner interfaces before moving logic.

## Implementation Tasks

- [ ] Extract the connection authority/admission owner.
- [ ] Extract the outbound queue + pending registry owner.
- [ ] Cut `MessageRouter` over to those owners and delete superseded local
      logic.

## Residual Closure Inventory

- [ ] `MessageRouter` no longer mixes peer authority and queue registry policy
      in one hotspot owner.
- [ ] Tail consumers read one canonical transport contract.
- [ ] Superseded local queue/authority logic is deleted.

## Validation

1. Targeted transport tests
2. Focused reconnect/backpressure regression coverage
3. Distributed scenario evidence for the named restart and recovery lanes
4. `npm run test:metrics`

## Done When

1. Connection authority and outbound registry behavior have distinct semantic
   owners.
2. Transport bugs can be localized to one canonical owner path.
3. The named scenario lanes keep green or fail with one obvious typed blocker
   story.
