# Raft-Logic API Gap Analysis

## Scope

Contained spike mapping for:
- `src/raft/raft-replica-base.js`
- `src/partition/partition-service.js`
- `src/message-group/message-group-service.js`
- `src/raft/raft-timing-utils.js`
- packet handling assumptions in `src/raft/constants.js`

## Mapping Summary

| Current liferaft usage | Current call pattern | raft-logic candidate | Gap / friction |
| --- | --- | --- | --- |
| Node construction | `new LifeRaft(address, options)` | `new ThreadedRaftNode({id, peers, ...})` | `id`/`peers` must be stringified u64; current IDs are UUID-style and need mapping. |
| Startup lifecycle | implicit + timer clear path (`initialize`, defer election) | explicit async `start()` | Current sync initialization assumptions in core services do not map 1:1 to async startup. |
| Election trigger | `heartbeat(timeout())` | `campaign()` / internal ticks | Timing semantics differ; deferred-election path needs adapter translation. |
| Peer joining | `join(peerAddress)` | fixed `peers` set at node construction | Dynamic peer join flow is not a direct API match. |
| Command propose | `raft.command(payload, cb)` | `clientRequest(payload, opts)` / `propose()` | Callback-style API needs promise/callback bridge. |
| Commit callback | `'commit'` event | `apply(entry)` callback | Mapping is straightforward through adapter-owned commit emit. |
| Role events | `'leader'/'follower'/'candidate'` | `onRoleChange`, `onStateChange` | Mapping is straightforward, but event cadence differs slightly. |
| Leader change event | `'leader change'` | state snapshot `lead` | Adapter must synthesize leader-change event and map internal IDs back to external IDs. |
| Term change event | `'term change'` | state snapshot `term` | Adapter must synthesize term-change event. |
| Packet ingress/egress | native packet bridge via message router | transport abstraction internal to raft-logic | Existing packet-type assumptions do not map directly; spike used raft-logic transport directly. |
| Runtime timing updates | direct liferaft timer fields | construction-time tick settings | No equivalent runtime mutation path validated in this spike. |

## Validated in Spike

- Async start/stop lifecycle mapping.
- Propose bridge (`clientRequest`) with callback-compatible wrapper.
- Role/leader/term event synthesis from raft-logic signals.
- Commit callback bridge through `apply(entry)`.

## Unresolved / High-Friction Gaps

1. Dynamic membership API mismatch:
   current runtime join/peer-management assumptions do not directly map.
2. Transport bridge mismatch:
   existing liferaft packet-style routing was not reused; spike used raft-logic transport directly.
3. ID model mismatch:
   current external replica IDs require deterministic internal-u64 mapping.
4. Startup/restart durability behavior:
   sqlite-backed restart path reproduced stability failures (see issue register).
5. Runtime timing mutability:
   not validated to match current dynamic timing expectations.

## Conclusion

API fit is viable for a contained adapter path but not drop-in compatible with
current liferaft integration surface. Migration would require explicit
architecture changes in membership/transport/timing ownership.
