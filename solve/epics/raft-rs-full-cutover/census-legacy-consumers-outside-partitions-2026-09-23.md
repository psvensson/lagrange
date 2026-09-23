# Census: legacy consensus consumers outside `src/partition` (2026-09-23)

Read-only census on main `e3ac0514b` for epic phases R3 (message groups) and
R4 (generic/worker/WASM helpers). Produced by a verifying agent; every claim
cites file:line. The frozen port is `src/raft/raft-operation-port.js:5-18`
(twelve operations); the events the rs-raft runtime owner actually emits are
role events, TERM_CHANGE and LEADER_CHANGE only (`raft-rs-runtime-owner.js:513-520`);
COMMIT is subscribable (`raft-rs-operation-port.js:24`) but never emitted:
committed entries reach the host only through the `applyCommittedEntry`
request callback as base64-decoded bytes (`raft-rs-application-transaction-owner.js:4-8`).

## Reachability (is it constructed on a production startup path?)

| Consumer | Production? | Constructor call site |
|---|---|---|
| MessageGroupService (seed) | yes | `src/bootstrap/phases/seed-message-groups-phase.js:138-152` via `bootstrap-service.js:83-84,553` |
| MessageGroupService (join) | yes | `src/bootstrap/phases/create-message-group-replica-lifecycle.js:53-70` via node-joining |
| RaftGroup | yes (via MessageGroupService) | `src/message-group/message-group-service-raft-lifecycle.js:195` |
| LiferaftProvider + InMemoryLogAdapter | yes (message-group defaults) | `message-group-service-state.js:138,196` |
| `ensureLiferaftProviderForRuntime` | yes | `src/lagrange-runtime-startup.js:717` (`raft-provider-control.js:66-74`, `RAFT_PROVIDER` env, hard-fails on anything but liferaft) |
| tracked-leader-demotion / requestElectionNow (node handoff) | yes | `src/node/replica-handler-leader-handoff-methods.js:65-68,155` (any tracked local service) |
| RaftReplicaBase | no (only via WasmServiceReplica) | `src/wasm-service/wasm-service-replica.js:98` |
| WasmServiceReplica | no: `WasmServiceLifecycle` is constructed only in `test/wasm-service/wasm-service-lifecycle.test.js:88`; the driver needs `context.wasmLifecycle`, which nothing in src supplies; the replica never creates a raft node (`this.raft` stays null) | `src/wasm-service/wasm-service-lifecycle.js:117` |
| PartitionWorkerService / MessageGroupWorkerService | no: `ReplicaWorkerManager` is constructed only in tests; still bundled by `scripts/build-sea.js:77-78`; worker bridge is a second transport (`worker-message-bridge.js:134-183`) | `src/worker/replica-worker.js:181,224` |
| spike provider paths | no (scripts/tests) | `scripts/run-raft-logic-investigation-spike.js` |

## MessageGroupService (R3)

Uses: `LifeRaft.LEADER` state compare (`leadership-state-runtime-methods.js:29-35`);
`new LiferaftProvider()` + `assertRaftProviderContract` (`state.js:138-139`);
`raftProvider.getCurrentTerm` (`leadership-state:154-158`, `cache-and-lifecycle:122-123`,
`raft-lifecycle.js:294`); `raftProvider.propose(raft, cmd, cb)`
(`outbound-dispatch:373-388`, `cdc-replication:373`); `proposeWithLeaderRouting`
with forward/retry policy (`cdc-replication:311-360`); `joinPeer` (`raft-lifecycle.js:143,354`);
`clearTimers(raft, 'heartbeat, election')` (`:287,385-388`); `InMemoryLogAdapter`
(`state.js:24,196`, "intentionally ephemeral across process restart",
`in-memory-log-adapter.js:19-33`); `raft.nodes[].address` (`raft-lifecycle.js:101-111`,
`forwarding-owner-routing-methods.js:80-102`); `raft.leave(address)` (`:136-141`);
`raft.heartbeat` monkeypatched for join suppression (`:396-425`);
`raft.packet(VOTED, {granted: false})` join-phase vote denial
(`inbound-ingress-runtime-methods.js:143-149`); tick/timing mutation through
`applyRuntimeRaftTiming` (`raft-timing.js:79-85` -> `raft-timing-utils.js:61-92`);
`wireReplicaLifecycleEvents` on six liferaft events (`raft-lifecycle.js:291-327`);
`RaftGroup.getRaftInstance()` raw-node leak (`raft-group.js:608-610`) behind every
`this.raft.*` use; inbound `isRaftPacket -> raftRuntime.handleRaftPacket`
(`inbound-ingress:131-190`); outbound native packets via
`deliverRaftPacketWithBackpressureMute` (`raft-group.js:223-237`).

Port coverage: role/term/leader events and reads, propose, peer addresses
(`readStatus.peers`), add/remove peer (`proposeConfChange` by replicaIdentity),
deferred election (`DEFER_ELECTION`, start/stopScheduling), campaign,
configureTick, close. Gaps (named, not designed):
1. commit delivery contract: consumer expects a decoded JSON command on COMMIT;
   the port delivers bytes via the callback and never emits COMMIT;
2. no durable storage handle: MessageGroupService has no db (`state.js:96-296`);
   every rs-raft owner requires one (`raft-rs-durable-store.js:98-105`,
   `raft-rs-peer-identity.js:77-79`, `raft-rs-replica-lifecycle-owner.js:38-44`);
3. join-phase vote refusal has no port operation (DEFER_ELECTION only withholds
   local scheduling);
4. `proposeWithLeaderRouting` is provider-level policy, not a port member;
5. `clearTimers(name)`: rs `stopScheduling` ignores names (`raft-rs-operation-port.js:161-167`);
6. `randomSource` (`state.js:124`, `raft-group.js:248-250`, production wiring
   `hosted-replica-authorities.js:27-40`) has no rs-raft handling;
7. per-replica election jitter (`raft-timing-utils.js:22-49`) vs rs tick derivation:
   unverified;
8. the raw-node leak itself.

Durable state today: none (in-memory log; term never seeded, RaftGroup passes no
INITIAL_TERM); restart resets term/vote/log, which the epic forbids.

## RaftGroup, RaftReplicaBase, WasmServiceReplica, workers (R4)

RaftGroup (`src/raft/raft-group.js`): provider default `:13,95-96`,
`createNodeClass` `:223-237`, liferaft option names `:239-261`, six events
`:292-335`, `joinPeer` `:405`, single-replica promotion via `raft.change` `:441-458`,
`raft.emit('data')` `:540`, `getRaftInstance` `:608-610`. Consumers: message-group
lifecycle, both worker services.
RaftReplicaBase: same shape (`raft-replica-base.js:87-88,201-258,274,331,385`),
hard-locked to liferaft by `ensureLiferaftProviderForRuntime`
(`raft-replica-base-runtime-helpers.js:81`); `createRaftInstance` has no production
caller. Only subclass: WasmServiceReplica, which never creates a node.
Workers: `PartitionWorkerService` (SQLiteLogAdapter `:242-246`, RaftGroup `:257-276`),
`MessageGroupWorkerService` (`:memory:` SQLite `:55,290-293`, raw `raft.command(`
in `cdc-methods.js:171-172,266`); bridge transport outside MessageRouter.

## Other production importers of legacy vocabulary

- `src/raft/raft-timing-utils.js:5,85` (`applyRuntimeRaftTiming` mutates
  `raft.beat`/`election`, calls `raft.heartbeat`); consumers: message-group timing
  and lifecycle, `src/partition/partition-service-shared.js:72`. Port equivalent:
  `configureTick`.
- `src/raft/tracked-leader-demotion.js:1,33-40` (`deferCandidacy`, `raft.change`
  to follower, `startElectionTimer`); consumers `replica-handler-leader-handoff-methods.js:16,155`
  and `partition-service-durability-fitness.js:4`; the same node file calls
  `requestElectionNow`/`startElectionTimer` (`:36-68`). Port gap: no step-down /
  transfer-leadership / immediate-election operation (finding F1).
- `src/raft/raft-provider-control.js` (`RAFT_PROVIDER` env; production startup
  `lagrange-runtime-startup.js:713-717`; two scripts set it).
- Transport: `router-delivery-manager.js:266` gates `deliverRaftDirect` on native-only
  `isRaftPacket` while `message-router-delivery-behaviors.js:236` uses
  `isRaftTransportPayload` (two detection sites disagree); priority classification
  `src/raft/constants.js:312-370` keys on native `packet.type`, so every rs-raft
  envelope loses heartbeat/append/background classification (partitions already
  send through it).

## Smallest migration units, ordered

1. Decision-gated deletions with zero production reachability: WasmServiceReplica
   raft path + RaftReplicaBase (+ helpers/constants); the worker consensus path
   (+ `build-sea.js:77-78`).
2. Leaf liferaft imports with direct port equivalents: `applyRuntimeRaftTiming`
   -> `configureTick` at three call sites; `raft-provider-control.js` +
   startup + the two scripts.
3. MessageGroupService port adoption, split: (a) command/commit contract
   (JSON <-> bytes, callback not COMMIT event); (b) durable storage handle and
   store model; (c) status/leader/term via readStatus/subscribe; (d) transport
   envelope + `isRaftRsTransportEnvelope -> step` demux; (e) join-phase behaviour
   via DEFER_ELECTION/start/stopScheduling; (f) cache-driven join/leave reconcile
   -> proposeConfChange or deletion per R2; (g) leader-routed proposal policy
   over `port.propose`.
4. RaftGroup deletion once 1 and 3 land.
5. Node-level leader handoff / tracked demotion, blocked on a port step-down
   operation (F1).
6. Transport native-vocabulary removal, last (R6).

## Owner questions (each with evidence)

1. Which SQLite db hosts `_raft_rs_*` for a message-group replica (no db option today; the worker's `:memory:` precedent violates the epic)?
2. Join-phase vote refusal: keep, re-express, or drop (port has no "refuse votes")?
3. Does R2's deletion of cache-driven membership reconcile bind message groups too, and what replaces it?
4. Commit contract: who owns decode, and is the dead COMMIT subscription removed from the port's event set?
5. Worker path: supported (R8 item 14) or deleted (no production constructor, second transport)?
6. WasmServiceReplica: production never constructs it and it never creates a node; R8 item 13 certifies a path that does not exist. Migrate or delete?
7. Step-down / immediate election as port operations, or delete those behaviours?
8. Process-level provider control: delete, or move to test-only tooling?
9. Leader-routed proposal policy: message-group-owned helper over `port.propose`, or deletion?
10. Deterministic randomness (`randomSource`) carried into rs-raft or dropped?
11. Transport priority for rs envelopes: read `message.msgType`, and reconcile the two detection sites?
12. Are message-group services ever demoted through `performTrackedLeaderDemotion` (decides whether F1 blocks R3 or only R4/R5)?
