# Round 8: production handler-removal census (owner guidance 2026-09-29, item 6)

Source: `grep -rnE "\.unregister(Exact)?\??\.?\(" src` on the round-8 tree. The census test in
test/bootstrap/message-group-activation-handler-boundary.test.js is a ratchet over this list, not permission.

| Site | What it removes | Owner / why it is not a per-replica MG bypass |
| --- | --- | --- |
| src/node/replica-transport-handler-identity.js:37 `unregisterExact` | per-replica partition + MG handlers | THE removal owner: runs in the replica lane, waits only on an open activation effect section, exact identity |
| src/node/replica-transport-handler-identity.js:39 `unregister` | same | fallback only for a transport without the identity API (MessageRouter and WebSocketTransport both have it). Candidate to delete once no such transport exists (follow-up, not closed here) |
| src/node/message-group-service-handler.js:778 | node-level MG service handler at the fixed `<node>/<service>/<handler>` address | not a per-replica handler; node shutdown |
| src/node/replica-handler-runtime-methods.js:582 | node-level replica handler at a fixed address | not a per-replica handler |
| src/node/runtime-service-handler.js:840 | node-level runtime service handler | not a replica handler |
| src/control-plane/replica-dispatch-service.js:44 | direct dispatch service address | not a replica handler |
| src/transport/message-router-handler-registry.js:120,149 | registry internals (re-register / replace) | transport layer itself |
| src/bootstrap/phases/seed-cleanup-handler.js:342,581 | PARTITION replica handlers (loops over getPartitionServices) | not MG. Run after clearReplicaStateMachine (close+drain) or in a failure phase before any activation (R7 census). Still raw and non-exact: OPEN ITEM for the partition side; the owner should decide whether they must also route through retireReplicaTransportHandler before freeze |

All six MG per-replica removal sites (join/seed stop hooks, join-cleanup, seed-cleanup x2, move-replica-handoff-owner)
route through `retireMessageGroupTransportHandler(s)` -> `retireReplicaTransportHandler`. The join partition stop hook's
raw removal was deleted in round 8.
