# Peer Address Resolution And Restart-With-New-IP Recovery

How peers find and re-establish connectivity to each other, and why a node that
restarts on a **new network address** (new IP) is recovered without operator
intervention. This is the cross-layer view spanning transport, CDC, and bootstrap;
Raft/placement addressing detail lives in [rebalance.md](rebalance.md).

## Identity is a logical nodeId, not the address

A node's identity is a stable logical `nodeId` (a UUID / configured value), **not**
its IP:port. Network location is stored separately in the `node_endpoints` system
table, keyed by a stable `endpoint_id = ep-<nodeId>-ws`. Connections, Raft peer
sets, and query routing all key on `nodeId`, so a changed IP updates the endpoint
row **in place** (upsert on the same key) and never creates a new identity.

- Identity: `src/node/node-service.js` (`nodeId`), `NodesOwner` (`src/control-plane/owners/nodes-owner.js`).
- Location: `node_endpoints` rows, written by heartbeat publication
  (`src/control-plane/heartbeat-service-publication-methods.js`).

## Resolution authority order

`resolveNodeWebSocketAddress` (`src/transport/node-address-resolution.js`) resolves
`nodeId -> ws address` in this order:

1. **Canonical `node_endpoints` cache row** (live, CDC-updated) — authoritative.
2. **Bootstrap seed pin** (`bootstrapResponse.seedNodeWsAddress`) — used only as a
   cold-start fallback when the cache has no row for the seed. The seed pin and the
   canonical row are the same self-advertised value; the pin is a point-in-time
   bootstrap snapshot, so the fresher cache row must win. A stale seed pin no longer
   beats a fresher canonical row after a seed restarts on a new address.
3. **Bootstrap snapshot `node_endpoints`** rows.

## Restart-with-new-IP recovery (three cooperating mechanisms)

When a peer restarts with the same `nodeId` but a new address, its heartbeat
upserts the new address into `node_endpoints`, which CDC-propagates into every
peer's system-table cache. Peers then recover connectivity via any of:

1. **Keepalive sever of a half-open socket.** A restart can leave a peer's old
   socket half-open (no clean TCP close). Each keepalive PING carries a `pingId`
   and arms a `transport.pingTimeoutMs` pong deadline; after `transport.pingMaxMissed`
   (default 2) unanswered pings the socket is terminated, whose close event drives
   `handleConnectionClose -> scheduleReconnect`
   (`src/transport/message-router-connection-close-reconnect.js`).
2. **Pull-based reconnect re-resolution.** On each reconnect attempt,
   `refreshReconnectAuthority` re-resolves the canonical address fresh and tries it
   as the first dial candidate; the transiently-observed peer IP is only a lower
   fallback and is re-adopted to the canonical value once the socket leaves the
   CONNECTED state (`src/transport/message-router-connection-authority.js`).
3. **CDC-triggered mesh reconciliation.** A `node_endpoints` address change fires
   `handleMeshConnectivityCDCEvent -> triggerBackgroundClusterMeshReconciliation ->
   connectToClusterNodes`, which re-dials every peer not in
   `{CONNECTED, CONNECTING, RECONNECTING}` with a freshly-resolved address —
   reviving even a connection that had exhausted its reconnect budget
   (`src/bootstrap/phases/connect-websocket-phase.js:connectToClusterNodesFromSnapshot`).

Regression coverage:
`test/transport/message-router-endpoint-address-change-redial.test.js` (sever +
end-to-end recovery to a new address) and
`test/bootstrap/mesh-reconcile-terminal-revive.test.js` (terminal-connection revive).

## Name-first addressing (optional, recommended for dynamic-IP environments)

To make an IP change fully transparent, advertise a **stable hostname** instead of
a raw IP by setting `node.advertisedWsAddress` (config key
`transport`/`node.advertisedWsAddress`) to a DNS/service name, e.g.
`ws://node-b.svc.cluster.local:8082`.

- An explicit advertised address is preserved verbatim — the routable-local-IP
  substitution that fires for wildcard (`0.0.0.0`) binds does **not** clobber it
  (`resolveAdvertisedWebSocketAddress`). Coverage:
  `test/transport/node-address-resolution.test.js`.
- Peers store and dial the advertised value verbatim; `new WebSocket(name)` lets the
  OS re-resolve the name to the current IP on every connect, so a restart behind the
  same name is transparent (no address update needed).
- Without an explicit `advertisedWsAddress`, a wildcard-bound node derives its
  advertised address from a routable local interface (a raw IP). That IP is still
  recovered on change by the three mechanisms above, but names avoid the reconnect
  churn entirely.
