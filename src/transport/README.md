# Transport Owner Card

## Role

`src/transport/` owns message routing, node-to-node delivery over the
`MessageRouter` WebSocket and in-process connections, and RPC correlation
behavior. `MessageRouter` is the one transport; there is no provider registry,
connection pool or alternate WebSocket transport.

## Primary Owners

- `MessageRouter` owns local and remote message delivery semantics.
- `MessageRouter` owns delivery lifecycle; `message-router-delivery-behaviors.js` owns local/remote delivery selection and `message-router-pending-response-ledger.js` owns pending responses.
- `RouterServerManager` owns server-side router setup.
- `inproc-transport.js` (`InProcWebSocket`) owns the in-process connection
  pair the router uses for same-process peers.
- `RPCClient` owns request/response correlation from callers.
- The bulk transfer channel (`bulk-transfer-channel.js`) owns a SECOND
  per-peer socket lane for snapshot bulk bytes: admitted through the same
  IDENTIFY/admission handshake (`channel: bulk`, forked before router record
  mutation), byte-bounded (single in-flight chunk per peer, sender-side
  token-bucket byte rate, bounded pending, per-socket maxPayload), never
  carrying query/data-plane or router-queue traffic, with its pressure
  visible through the router stats `bulkChannel` section (no hidden drops,
  no unbounded growth). It never rekeys, evicts, or reconnect-fights the
  primary per-peer connection.

## First Files

- `index.js` for exported transport surface.
- `message-router.js` before changing routing semantics.
- `message-router-shared.js` before changing shared delivery classification.
- `message-router-delivery-behaviors.js`, `message-router-pending-response-ledger.js`,
  and `router-server-manager.js` before changing router lifecycle.
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
