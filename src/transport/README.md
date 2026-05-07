# Transport Owner Card

## Role

`src/transport/` owns message routing, node-to-node delivery, WebSocket and
in-process transports, connection pooling, provider registration, and RPC
correlation behavior.

## Primary Owners

- `MessageRouter` owns local and remote message delivery semantics.
- `RouterDeliveryManager` owns delivery lifecycle and pending responses.
- `RouterServerManager` owns server-side router setup.
- `ConnectionPool` owns connection reuse and lifecycle.
- `TransportRegistry` owns provider registration.
- `WebSocketTransportProvider` and `InProcTransport` own concrete transport
  implementations.
- `RPCClient` owns request/response correlation from callers.

## First Files

- `index.js` for exported transport surface.
- `message-router.js` before changing routing semantics.
- `message-router-shared.js` before changing shared delivery classification.
- `router-delivery-manager.js` and `router-server-manager.js` before changing
  router lifecycle.
- `transport-semantic-outcome.js` for canonical transport outcomes.
- `node-address-resolution.js` before changing endpoint selection.

## Do Not

- Do not bypass `MessageRouter` with direct service calls for routed behavior.
- Do not add alternate fast paths for query or data-plane traffic.
- Do not let pressure become hidden drops or unbounded queue growth.
- Do not add independent retry or timeout semantics outside the caller-owned
  budget and transport outcome vocabulary.

## Proof Surface

- Focused tests under `test/transport/`.
- Query, worker, or control-plane tests when the changed route carries those
  domains.
- Decision-boundary and runtime-grammar guardrails for delivery, retry,
  pressure, and outcome changes.
