# Design: R3 message groups on rs-raft; R4 worker deletion + WASM service group on the port

Read-only design on worktree `.claude/worktrees/raft-rs-write-path` at HEAD `fe70eb76e`; paths
repository-relative, line numbers on that head. Epic: `solve/epics/raft-rs-full-cutover.md` (R3
:273-283, R4 :285-297, R8 items 12-14 :361-363, gaps :181-199). Census + owner decisions 5/6:
`solve/epics/raft-rs-full-cutover/census-legacy-consumers-outside-partitions-2026-09-23.md:141-160`.
One pure probe (no cluster) was run: `designs/probe-tick-derivation.json`.

## 0. Measured facts the design rests on

F1. Port surface. Twelve frozen operations (`src/raft/raft-operation-port.js:5-18`); the rs-raft
port subscribes seven event names (`src/raft/raft-rs-operation-port.js:33-41`) but the runtime
owner emits only role names, TERM_CHANGE and LEADER_CHANGE (`src/raft/raft-rs-runtime-owner.js:921-942`;
`raft-rs-runtime-owner-constants.js:29-34,49-52`). COMMIT is never emitted. Committed entries reach
the host only through the request's `applyCommittedEntry`, decoded by the codec into a frozen
`{command, index, term, effects}` (`raft-rs-operation-port.js:63-70,180-181`;
`raft-rs-proposal-codec.js:33-46,53-60`), synchronously inside the store transaction that also
advances the applied state (`raft-rs-application-transaction-owner.js:41-63`; a promise throws :50-52);
`effects.afterCommit/afterRollback` run outside it (:14-28,57,61). `propose(value)` encodes JSON
(`raft-rs-operation-port.js:239-241`) and CORE_OK means appended, persisted and sent (drainReady
after the primitive, `raft-rs-runtime-owner.js:1147-1161,871-902`), not committed.

F2. Every rs-raft owner needs one better-sqlite3 connection: the request requires DURABLE_STORAGE
(`raft-rs-operation-port.js:129-130`); `RaftRsPeerIdentityRegistry(db)` (:134; `raft-rs-peer-identity.js:78-81`),
`RaftRsReplicaLifecycleOwner({db})` (:139-141; `raft-rs-replica-lifecycle-owner.js:38-80`),
`RaftRsDurableStore(db)` (`raft-rs-runtime-owner.js:1259`; `raft-rs-durable-store.js:122-152`),
persistence admission reads `db.inTransaction` (:182-186). Tables `_raft_rs_log/_hard_state/
_applied_state/_snapshot` (`raft-rs-durable-store-constants.js:14-19`) "in the replica's OWN SQLite
database - the same file and the same connection" (:3-5). Restart restores hard state, entries,
ConfState and applied index from that record (`raft-rs-runtime-owner.js:216-225,328-348,1293-1299`).

F3. Transport. Outbound envelope `{protocol:'raft-rs', groupId, from, to, message}` through the
request's `sendToPeer(address, envelope)` (`raft-rs-runtime-owner.js:724-753`;
`raft-rs-ingress-constants.js:13`); the partition hands `transport.deliver(peerAddress, packet,
resolveRaftTransportDeliveryOptions({...packet, targetAddress}))`
(`src/partition/partition-service-raft-init-base.js:458-466`) and demuxes inbound with
`isRaftRsTransportEnvelope(payload) -> this.raft.step(payload)`
(`partition-service-entry-apply-base.js:206-213`). Ingress admits envelope routing only, never
sender membership (`raft-rs-ingress.js:1-13,171-183`).

F4. Timing. `tuningOf` reads `electionMinMs` and the tick (`tickIntervalMs` or `heartbeatMs/3`);
`electionMaxMs` is ignored (`raft-rs-runtime-tuning.js:14-38`). Probe on the message-group defaults
(heartbeat 150, election 1000/3000, jitter 2500 per index, `src/raft/constants.js:49-58`;
`src/message-group/message-group-service-raft-lifecycle.js:170-194`): tick 50 ms, electionTick
20/70/120 for replica index 0/1/2, recovery retry window 1.0/3.5/6.0 s
(`designs/probe-tick-derivation.json`). The core's election randomization is drawn from `rand` via
`getrandom` "js" -> `crypto.getRandomValues` (`vendor/raft-rs-wasm/Cargo.toml:19-22`;
`vendor/raft-rs-wasm/pkg/raft_wasm.js:657-659`); `create_node` takes no seed
(`vendor/raft-rs-wasm/src/lib.rs:70-75,455-458`). No rs-raft owner reads `randomSource` (grep of
`src/raft/raft-rs-*.js`: zero hits); the port's SUBSTRATE resolves only `timeSource`
(`raft-rs-operation-port.js:154-155`; `src/time/time-source.js:237-243`).

F5. Message-group legacy surface (all on `fe70eb76e`): `new LiferaftProvider()` + `InMemoryLogAdapter`
(`message-group-service-state.js:24,28,138-139,196`); `new RaftGroup(...)` and the raw-node leak
`this.raft = this.raftRuntime.getRaftInstance()` (`raft-lifecycle.js:195-218`;
`src/raft/raft-group.js:608-610`); `raft.nodes`/`raft.leave`/`joinPeer` cache reconcile
(`raft-lifecycle.js:38-147`; `forwarding-owner-routing-methods.js:79-105`); heartbeat monkeypatch
and `clearTimers` (`raft-lifecycle.js:276-290,381-425`); vote denial `raft.packet(VOTED,{granted:false})`
(`inbound-ingress-runtime-methods.js:143-181`); `raft.state === LifeRaft.LEADER`
(`leadership-state-runtime-methods.js:29-35`); `raftProvider.getCurrentTerm` (:154-158;
`cache-and-lifecycle-runtime-methods.js:122-124`; `raft-lifecycle.js:294`); `raftProvider.propose`
fire-and-forget (`outbound-dispatch-runtime-methods.js:363-397`) and `proposeWithLeaderRouting`
(`cdc-replication-runtime-methods.js:297-380`); `applyRuntimeRaftTiming` (`raft-timing.js:79-85` ->
`src/raft/raft-timing-utils.js:18-49`); `applyCommittedEntry(command)` switching on
MESSAGE/CDC/CDC_BATCH/ACK with a silent default (`raft-timing.js:147-194`;
`runtime-support.js:41-44,103`). The service has no db, no dbPath option (`state.js:96-296`). The
ledger is local-only and its term resets to 0 (`message-group-operation-ledger.js:33-35,51`).

F6. The state machine is ephemeral by design: CDC commands apply into the node's shared in-memory
cache (`raft-timing.js:155-188`; `state.js:230-243`), MESSAGE commit is a no-op (:152-154), ACK
mutates a Set (:189-192). Nothing durable is co-transacted. After a restart the cache is rehydrated
from partitions, not from a log (`bootstrap-service-seed-delegates.js:312-314`).

F7. Acknowledgement level today: liferaft `command()` resolves after the append packet is sent
(`node_modules/@markwylde/liferaft/index.js:919-936`), and the provider merely wraps that promise
(`src/raft/liferaft-provider.js:392-413`). The port's CORE_OK is the same level, with local
persistence added (F1). No consumer waits for commit today.

F8. Events/roles already agree by name: `RAFT_EVENT` in `src/raft/constants.js` is the port's
(`:2,375`); `RAFT_ROLE` values `follower/candidate/leader` (`:30-35`) equal the runtime's `ROLE`
(`raft-rs-runtime-owner-constants.js:29-34`; `pre-candidate` appears only with pre_vote, R5);
`wireReplicaLifecycleEvents` subscribes via `.subscribe` when present
(`src/raft/replica-leadership-state.js:89-160`) and is what the partition uses on the port
(`partition-service-raft-lifecycle-wiring.js:42-106`).

F9. Membership today (post-R1) on the partition: `admitPartitionRaftPeer` is leader-only, reads
membership from `readStatus().peers`, proposes `{type: ADD_PEER, replicaIdentity, peerAddress}`
(`partition-service-raft-membership-administration.js:80-135`), identity reserved through
`raftRsMembershipAdministration.reservePeerIdentity` (:17-26; `raft-rs-membership-administration.js:19-34`);
the trigger is still the services cache (`partition-service-raft-peer-cache-reconciliation.js`). No
R2 quest exists on this head (`solve/quests/` has none). A moved peer needs no membership change on
rs-raft: the address is resolved per delivery (`raft-rs-runtime-owner.js:724-731`;
`raft-rs-status-observation.js:27-43`).

F10. Worker path: `ReplicaWorkerManager` is constructed only in tests (grep: `test/worker/*` only);
`replica-worker.js` builds `PartitionWorkerService`/`MessageGroupWorkerService` (:181-193,224-232)
on `RaftGroup` with a `:memory:` log db (`message-group-worker-service.js:55,290-296`;
`partition-worker-service.js:242-273`) over the bridge transport (`worker-message-bridge.js:141-184`);
bundled by `scripts/build-sea.js:76-81`. `src/cache/system-cache-proxy.js` has no src importer; only
worker tests and `test/cache/system-cache-proxy-*` use it. `piscina` is also used by
`src/threading/*` (stays).

F11. WASM path: `WasmServiceReplica extends RaftReplicaBase` (`wasm-service-replica.js:84-102`),
KV store on `dbPath || ':memory:'` with its own connection (:110-112; `session-kv-store.js:92-100`),
commands `kv_set/kv_delete/kv_delete_session/timer_state` (:36-50,376-432, default branch silently
accepts :429-431), `proposeEntry` through `raftProvider.propose` (:536-551), committed index through
`raftProvider.getCommittedIndex` (:704-719), native-packet `handleRaftPacket` (:441-445;
`raft-replica-base.js:342-388`). `RaftReplicaBase.createRaftInstance` has no caller; `this.raft`
stays null (:102). `WasmServiceLifecycle.createReplica(definition, replicaConfig{replicaId,
replicaIds, dbPath, transport})` (`wasm-service-lifecycle.js:116-143`) is reached only through
`WasmComponentDriver.#prepareLegacyReplica(context.wasmLifecycle, context.replicaConfig)`
(`src/runtime/wasm-component-driver.js:391-416`); `ServiceRuntimeLifecycle` forwards `context`
adding only `handlerMap` (`service-runtime-lifecycle-operation-methods.js:192-196`); nothing in src
supplies `wasmLifecycle`/`replicaConfig` (only `meta-service-lifecycle.js:46-53`, test-only). Nothing
registers a WASM replica address on the MessageRouter (grep `register(` in `src/wasm-service`: only
the executor's function registry).

F12. Step-down/demotion is already dead on every port consumer: `performTrackedLeaderDemotion`
returns false without `raft.change` (`src/raft/tracked-leader-demotion.js:18-28`; epic findings
F1). It neither blocks nor is fixed by R3/R4.

## 1. R3 design: message groups on the port

### 1.1 Command/commit contract
- Proposals stay JSON commands; the port is the only codec owner (F1). The message group never
  encodes or decodes bytes and gains no codec module.
- New admission owner `src/message-group/message-group-committed-command-admission.js`, the
  `partition-committed-command-admission.js` pattern (`:1-27,125-138`): the frozen type list
  {MESSAGE, CDC, CDC_BATCH, ACK} moves to `message-group/constants.js` (R06); `admitMessageGroupCommand`
  refuses, before `propose`, an unknown type, a CDC without `tableName/operation/data`, a CDC_BATCH
  without `events[]`, a MESSAGE without `message.id`, an ACK without `messageId`. Every proposer asks
  it first and answers the caller with the typed refusal (R11).
- Request callback `APPLY_COMMITTED_ENTRY: (committed) => this.applyCommittedEntry(committed)` as
  the partition does (`partition-service-raft-init-base.js:471-472`). `applyCommittedEntry` takes the
  frozen `{command, index, term, effects}`; dispatch on `command.type`; an unrecognised type throws a
  typed error (R07; replaces the silent return at `raft-timing.js:148-150`), which the runtime
  records as the group's host failure (`raft-rs-runtime-owner.js:800-812`).
- The `cdcApplied` emits (`raft-timing.js:166,180-186`) move to `effects.afterCommit` so listeners
  run after the applied-state transaction commits; `logIndex` comes from the record's `index`.
- The `onCommit` handler and COMMIT subscription are deleted (F1); `operationLedger.currentTerm`
  is fed from `readStatus().term` in the role/term handlers, as now (`raft-lifecycle.js:299-326`).
- `persistToRaftLog` (`outbound-dispatch:363-397`) records the port's outcome instead of ignoring
  the callback: CORE_OK -> `{success:true}`; CORE_REFUSED/HOST_FAILURE -> the typed failure on the
  envelope (R11/R12). Same acknowledgement level as today (F7).
- Durable-state model (epic :183-191): consensus state (hard state, log, ConfState, applied index)
  is durable and restored; application state stays ephemeral (F6) and is never replayed - the core
  is restored with `applied = record.appliedIndex` (`raft-rs-runtime-owner.js:333`). Stated
  explicitly in the quest so no verifier reads "restart" as replay.

### 1.2 Durable store handle: owner and file layout
- One owner: `DataDirectoryManager` gains `getMessageGroupsDir()` and
  `getMessageGroupDbPath(groupId, replicaId)` -> `{dataDir}/message-groups/{groupId}/{replicaId}.db`,
  plus `ensureMessageGroupDirExists`, mirroring partitions (`src/storage/data-directory-manager.js:142-171`;
  `STORAGE_DEFAULT.MESSAGE_GROUPS_DIRNAME` beside `PARTITIONS_DIRNAME`, `storage-constants.js:7-13`).
- Bootstrap: a `resolveMessageGroupDbPath(groupId, replicaId)` delegate beside
  `resolvePartitionDbPath` (`bootstrap-service-seed-delegates.js:321-330`); both constructors pass
  `dbPath` (`seed-message-groups-phase.js:138-153`; `create-message-group-replica-lifecycle.js:53-71`).
- `MessageGroupService` requires `dbPath` (typed `MISSING_DB_PATH` refusal like MISSING_TRANSPORT,
  `state.js:104-111`); `initialize()` opens `this.db = new Database(dbPath)` with the partition's
  pragmas (`partition-service-raft-init-base.js:380-382`; the two pragma names move to a shared
  replica-db constants owner, R06) before building the port, hands it as DURABLE_STORAGE, and closes it
  after `port.close()` in `shutdown()` (`cache-and-lifecycle:164-169`). `:memory:` is refused by name.
- The file holds only `_raft_rs_*`, `_raft_rs_replica_lifecycle` and the peer-identity table; no
  application table (F6). A copied or foreign file is refused by the lifecycle owner's identity check
  (`raft-rs-replica-lifecycle-owner.js:55-73`). No legacy-content detector is needed: the in-memory
  adapter never wrote SQLite.

### 1.3 Status, leader and term
- `isCurrentRaftLeader()` -> `const s = this.raft.readStatus(); s.outcome === CORE_OK && s.role ===
  RaftRole.LEADER && this.isLeaderReplica()` (a held group answers HOST_FAILURE with `role: null`,
  `raft-rs-runtime-owner.js:525-543`).
- `getCurrentTerm()`/`getStatus().term` -> `readStatus().term` when the port exists
  (`raft-rs-status-observation.js:118`), the ledger term only when `this.raft === null`.
- Lifecycle wiring keeps `wireReplicaLifecycleEvents` with `getCurrentTerm: () =>
  this.raft.readStatus().term` and no `onCommit` (partition: `lifecycle-wiring.js:39-52`).
- `raft.nodes[].address` readers -> `readStatus().peers[].{replicaIdentity, address, addressStatus}`
  and `leaderAddress` (`raft-rs-status-observation.js:45-66`). LEADER_CHANGE already carries the
  replica identity (`raft-rs-runtime-owner.js:907-919`); `normalizeLeaderReplicaId` stays as a no-op
  normalizer for identities.
- Role/leader-node publication (`roleMutationHelper`, `leaderNodeMutationHelper`, `state.js:252-257`)
  is unchanged; it is driven by the same wiring.

### 1.4 Transport envelope and demux (same as partitions)
- Request: `PEER_ADDRESS: this.unifiedAddress` (`state.js:150-154`); `BOOTSTRAP_PEER_IDS:
  this.replicaIds`; `SEND_TO_PEER` exactly as `partition-service-raft-init-base.js:458-466`;
  `RESOLVE_PEER_ADDRESS: (id) => this.buildPeerAddress(id, {allowBootstrapHints: true})`
  (`peer-resolution.js:53,175-179`); `SUBSTRATE: {timeSource: providedTimeSource, randomSource:
  providedRandomSource}` as `hostedConsensusSubstrate` (`init-base.js:102-111`).
- Inbound: in `receiveMessage` (`inbound-ingress:120-195`) the `isRaftPacket` branch (:131-191) is
  replaced by `if (isRaftRsTransportEnvelope(payload)) { if (this.raft) await
  Promise.resolve(this.raft.step(payload)); return {acknowledged: true}; }` (F3). Router
  registration unchanged (`seed-message-groups-phase.js:159-161`).
- `deliverRaftPacketWithBackpressureMute` is not carried: per-peer delivery outcomes are recorded by
  the runtime (`raft-rs-runtime-owner.js:688-722`).
- Recorded, not fixed (R17): `resolveRaftTransportDeliveryOptions` keys on native `packet.type`
  (`src/raft/constants.js:312-369`); rs envelopes get message-group readiness priority by target
  address only (:316-322) and lose heartbeat/append classification, as partitions do today (R6).

### 1.5 Join phase via DEFER_ELECTION / startScheduling / stopScheduling
- Request `DEFER_ELECTION: this.deferElection || isJoiningExistingGroup ||
  deferElectionUntilJoinConvergence` (`state.js:288-292`): the port then never arms the tick timer
  (`raft-rs-operation-port.js:292-295`); inbound drains never campaign (`runtime-owner.js:1198-1204`).
- `clearJoinExistingGroupTimers` -> `this.raft.stopScheduling()` (:205-211); `startElection()` ->
  `this.raft.startScheduling()` (partition :633-650); `completeJoinConvergence` (`raft-lifecycle:431-455`)
  keeps its role bookkeeping and ends in `startScheduling()`.
- Deleted: `armJoinExistingGroupElectionSuppression`/`release...` (:396-425; the core's heartbeat is a
  leader tick effect and an unscheduled replica never leads), the demotion-event `clearTimers`
  (:276-290; a demotion announced by the port is the core's own), and the vote denial
  (`inbound-ingress:143-181`). Decision D2 below: a joiner is not a voter until the leader's
  ADD_LEARNER/ADD_PEER commits (`raft-rs-operation-port.js:98-123`); a non-voter's granted vote is
  inert because raft-rs tallies over the configuration's voters, and the host reproduces no Raft
  check (`raft-rs-ingress-constants.js:4-8`).
- Single replica: `await this.raft.campaign()` and fail closed on non-CORE_OK, as the partition
  (`init-base.js:583-598`); the `raft.change({state: LEADER})` promotion (`raft-group.js:441-458`) goes.

### 1.6 Cache-driven join/leave -> the R2 interface (one paragraph)
R3 does not copy the partition's cache reconcile into message groups (R01/R03). It extracts
`admitPartitionRaftPeer` + `reservePartitionRaftPeerIdentity` (F9) into one group-neutral owner
`src/raft/raft-rs-group-membership-admission.js` with signature
`admitGroupPeer(port, {groupId, localReplicaIdentity, logger}, {replicaIdentity, peerAddress})`
returning the existing `RAFT_MEMBERSHIP_ADMISSION_OUTCOME` record; the partition becomes its first
caller (scope widening into `src/partition`, recorded under R16), the message group its second,
triggered by the same services-row observation the partition uses today (`raft-lifecycle.js:38-100`
keeps only the "which replica ids/addresses appeared" projection). Interface statement to R2:
"membership requests enter through one admission owner over `port.proposeConfChange`; message
groups and partitions are callers; R2 owns which event may call it, deletes the cache trigger for
both, and adds REMOVE_PEER". R3 deletes `raft.leave` outright: a moved replica keeps its identity and
its address is resolved per delivery (F9), so no membership change replaces it.

### 1.7 Leader-routed proposal policy
Message-group-owned `src/message-group/message-group-proposal-routing.js` over `port.propose` +
`readStatus`: leader (1.3) -> `await port.propose(command)`; CORE_OK done; a retryable HOST_FAILURE
with `recoveryRequired:false` -> retry within the existing budget (`cdc-replication:298-305,351-367`);
not leader with `leaderAddress` -> the existing application forward
(`forwardCDCEventToLeader/forwardCDCBatchToLeader`, :323-350); no leader -> typed `no_leader`
deferral. `proposeWithLeaderRouting` and its provider live only in the provider being deleted
(`liferaft-provider.js`), so nothing else keeps it. Acknowledgement level is parity (F7); a
commit-level acknowledgement (pending map keyed by an entryId, settled in `effects.afterCommit`) is
recorded as a later improvement, not built here.

### 1.8 randomSource
Threaded into SUBSTRATE for parity with partitions and measured inert (F4): election timing on
rs-raft is drawn from `crypto.getRandomValues` inside the binding and cannot be seeded from
JavaScript. Recorded (R17) for the owner: decision O2.

### 1.9 Election jitter vs the port's tick derivation
Today the message group jitters (`raft-lifecycle.js:180-186`) and `RaftGroup` jitters again
(`raft-group.js:269-283`). On the port the jittered `electionMinMs` becomes `electionTick`
(20/70/120 ticks, F4) and raft-rs randomizes each timeout again in `[electionTick, 2*electionTick)`
(core semantics, unseedable), so replica 2 notices a dead leader after 6-12 s and its recovery
retry window is 6 s. The partition passes the same shape (`init-base.js:418-433`, jitter constant
`partition-service-constants.js:752` = `RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS`). R3 keeps
parity (one timing owner, no new number) and records for R5 election settings: index jitter is
redundant on rs-raft and `electionMaxMs` is dead. `applyRaftTimingConfig` -> `port.configureTick`
(`raft-rs-operation-port.js:260-273`), deleting `applyRuntimeRaftTiming`/`applyRuntimeTickInterval`
(`raft-timing.js:79-140`).

### 1.10 Restart preserving term, vote and configuration
Follows from 1.2 + F2: the port restores from the file. The lifecycle row is re-read as ACTIVE
(`raft-rs-replica-lifecycle-owner.js:55-80`). The witness (receipt R3-3) reads the hard-state row on an
independent connection and compares `readStatus().term/confState` across the restart; the term never
re-seeds from 0.

### 1.11 Deletion list and order
Importers on this head (grep of `src`): `liferaft-provider.js` <- state.js, raft-group.js,
raft-replica-base.js; `in-memory-log-adapter.js` <- state.js (+ 3 unit tests + 8 liferaft harness
tests: `test/closure/CL-040..042`, `test/convergence/dt6-*` x4,
`test/distributed/harness/rolling-restart-*`); `raft-group.js`/`raft-group-constants.js` <-
message-group raft-lifecycle + both worker services; `raft-timing-utils.js` <- message-group only
(`computeReplicaElectionTimeouts` lives in `replica-election-timeouts.js`, which stays);
`liferaft.js` <- message-group-service.js (LifeRaft dep), raft-timing-utils, liferaft-provider,
tracked-leader-demotion; `raft-provider-contract.js` <- state.js, partition-service-shared
(`assertPartitionRaftProviderContract` stays), raft-group, raft-replica-base;
`raft-peer-backpressure-mute.js` <- raft-group, replica-base helpers; `raft-packet-utils.isRaftPacket`
<- workers, message-group-service.js, partition legacy branch (`entry-apply-base.js:214-251`,
steps a native packet into the port: recorded for R6), transport x2.
Order: (1) R4(a) worker deletion first (zero reachability, removes two RaftGroup importers);
(2) R3-a: 1.1-1.10 in `src/message-group` plus the admission-owner extraction (1.6);
(3) R3-b: delete `raft-timing-utils.js` (+ `test/raft/raft-timing-utils.test.js`), `raft-group.js`,
`raft-group-constants.js` (+ `test/raft/raft-group*.test.js`), the message-group imports of
`liferaft-provider`, `in-memory-log-adapter`, `liferaft.js`, `raft-provider-contract`
(`assertRaftProviderContract` half); (4) `in-memory-log-adapter.js` and `liferaft-provider.js`
modules go in R6 with the 8 liferaft harness tests (epic :323-325; decision D6); (5) R4(b) deletes
`raft-replica-base*.js` and `raft-peer-backpressure-mute.js`; (6) `raft-provider-control.js` +
`src/raft/spike/*` + the two scripts + `lagrange-runtime-startup.js:713-717` in R4 (epic :293-295);
(7) `tracked-leader-demotion.js` waits for the F1 quest.

## 2. R4 plan

### 2(a) Worker consensus path: DELETE (owner decision 5)
Files (17, 6456 lines): all of `src/worker/*` including `worker-constants.js`,
`sqlite-system-cache.js`, `worker-message-bridge.js`, `worker-raft-runtime-defaults.js`; plus
`src/cache/system-cache-proxy.js` (F10, dead). SEA: remove the "Replica Worker" bundle
(`scripts/build-sea.js:76-81`); `test/packaging/sea-bundle-smoke.test.js:15-16` names only the main
and CLI bundles, so it needs no change. `piscina` stays (`src/threading/*`). Generated shards
(`test/shards/*.json`) are refreshed by `npm run test:metadata:refresh` (epic contract item 8).
Tests to delete (worker-specific or native-packet worker simulations): all 28 `test/worker/*`,
`test/integration/multi-worker-raft.integration.test.js`, `test/integration/cross-worker-cdc.integration.test.js`,
`test/cache/system-cache-proxy-*.property.test.js` (8), `test/cache/system-cache-key-descriptor.test.js`
(imports `sqlite-system-cache.js`), `test/raft/leader-election-completion.property.test.js`
(worker-process property over `isRaftPacket`, :7-14,33-35).
Tests to retain, re-pointed from `worker-constants.js` to `ENTITY_TYPE` in `src/constants`
(backend-independent transport/bootstrap invariants): `test/transport/handler-registration.property.test.js`,
`test/transport/loopback-connection.property.test.js`, `test/transport/uniform-message-routing.property.test.js`,
`test/bootstrap/message-groups-first-bootstrap-order.property.test.js`.
Ephemeral context later (no design): a partition whose storage class marks its application table
ephemeral. The ordinary write path (`propose` -> `applyCommittedEntry`), consensus record, ownership
and transport are the partition's; only the table's home (a non-file schema) and its restart
semantics (empty after restart, since the applied index is durable and nothing replays) belong to
the partition storage-class owner. Never a second runtime, never a second transport.

### 2(b) WASM service group BUILT on the port (owner decision 6)
- Purpose (F11): one consensus group per placed `wasm_component` service replicating session KV
  writes and timer state into a per-replica SQLite KV store; strong/eventual reads routed by the
  safety interval; leader owns timers.
- Production constructor that must exist: a node-level composition root that, when a wasm_component
  service is placed here, supplies `ServiceRuntimeLifecycle`'s prepare `context` with
  `{wasmLifecycle, replicaConfig: {replicaId, replicaIds, dbPath, transport: messageRouter}}`
  (`wasm-component-driver.js:391-416`). Proposed: `createRuntimeStartupWiring` (`runtime-startup-wiring.js:42-88`)
  takes `{messageRouter, dataDirectoryManager, portAllocator, moduleMirror, cdcIntegrationService}`
  and hands `WasmComponentDriver` a `wasmLifecycleFactory`; the driver builds one
  `WasmServiceLifecycle` per node lazily and derives `replicaConfig` from the placement row. Which
  owner projects `replicaIds` from placement is R2's authority (decision O3).
- Durable store: `WasmServiceReplica` opens `this.db = new Database(dbPath)` (file only; the
  `:memory:` default at `wasm-service-replica.js:67,110-112` is deleted), `dbPath` from a new
  `DataDirectoryManager.getWasmServiceDbPath(serviceId, replicaId)` ->
  `{dataDir}/wasm-services/{serviceId}/{replicaId}.db`; `SessionKVStore` accepts an open `db`
  (constructor change at `session-kv-store.js:92-100`) so the KV write and `putAppliedState` are one
  transaction on one connection (F1, `raft-rs-durable-store-constants.js:3-5`); the same `db` is
  DURABLE_STORAGE.
- Transport: the replica registers `{nodeId}/wasm_service/{replicaId}` on the MessageRouter
  (nothing does today, F11) and demuxes `isRaftRsTransportEnvelope -> port.step` before
  `read|write` (`:447-458`); SEND_TO_PEER/RESOLVE_PEER_ADDRESS as 1.4, peer addresses from the
  services cache (`raft-replica-base-runtime-helpers.js:59-75` logic re-homed in the replica).
- Command contract: JSON `{type: kv_set|kv_delete|kv_delete_session|timer_state, sessionId, key,
  value, valueEncoding:'base64'}` (a Buffer does not survive the JSON codec, `codec.js:33-46`);
  admission owner `wasm-service-committed-command-admission.js` refuses unknown types before
  `propose` and `applyCommittedEntry({command,index,term,effects})` throws on an unknown type
  (replaces `:429-431`); `safetyInterval.updateLocalAppliedIndex(index)` from the record;
  `_startSafetyBroadcasts` reads `readStatus().commitIndex` (`raft-rs-status-observation.js:119`);
  `_handleWrite` non-leader answers `{forwarded:true, leaderId}` from `readStatus().leaderId`;
  `proposeEntry` returns the port's typed outcome (parity acknowledgement, F7).
- Role/leader publication: keep `AuthoritativeRowMutationHelper` (`:269-352`) driven by
  `wireReplicaLifecycleEvents(this, {events: RAFT_EVENT, roles: RAFT_ROLE, getCurrentTerm: () =>
  port.readStatus().term, onLeader: onBecameLeader, onFollower/onCandidate: onBecameFollower})`, the
  shared wiring (F8), instead of `RaftReplicaBase.wireRaftEvents` (`raft-replica-base.js:198-259`).
- `RaftReplicaBase`, its helpers and constants (990 lines) and `raft-peer-backpressure-mute.js` are
  deleted; `WasmServiceReplica extends EventEmitter` and owns its fields explicitly; no `raftProvider`
  option, no `handleRaftPacket`. Membership: bootstrap voters = `replicaIds`; join through the 1.6
  admission owner. Tests: `test/raft/raft-replica-base.test.js` deleted; `wasm-service-replica.test.js`
  and `wasm-service-lifecycle.test.js` rewritten on the port (their describe blocks :230-460 assert
  provider-stub behaviour).
- R8 item 13 is certified by the R4 receipts 2-5 below on the exact head; pre_vote/check_quorum and
  blast radius stay R5.

## 3. Receipts (R1 quest.json style; red first, each red for the reason named)

Quest `raft-rs-message-group-cutover` (`doneWhen: test-receipt`, file
`test/raft/raft-rs-backend/message-group-on-raft-rs.test.js`):
1. `message-group-initializes-on-the-rs-raft-port-with-a-durable-store` - `initialize({dbPath})`
   yields a frozen port and `_raft_rs_*` in `{dataDir}/message-groups/{groupId}/{replicaId}.db`
   (independent connection). Red: no `dbPath`, `RaftGroup` constructed (`raft-lifecycle.js:195-218`).
2. `a-cdc-command-commits-through-the-port-and-applies-on-every-replica` - three replicas over the
   real MessageRouter; the leader proposes a CDC command; every replica's cache holds the row and
   `RaftRsDurableStore.readCommittedEntriesIn(db, groupId)` lists the decoded command. Red: propose
   reaches `raftProvider.propose` (`cdc-replication:373`).
3. `restart-preserves-term-vote-and-configuration` - shutdown, reopen on the same file;
   `readStatus().term >= before`, `confState.voters` equal, hard-state row read independently. Red:
   ephemeral adapter, term 0 (`operation-ledger.js:51`).
4. `role-leader-and-term-are-consumed-from-the-port` - `isCurrentRaftLeader()`, `getStatus().term`,
   `leaderId` after LEADER_CHANGE all equal `readStatus()`. Red: `LifeRaft.LEADER`/`getCurrentTerm`
   (`leadership-state:29-35,154-158`).
5. `a-deferred-joiner-never-campaigns-and-cannot-decide-an-election` - a fourth replica with
   `isJoiningExistingGroup` steps vote requests for N election windows: zero `campaign` core entries
   (`setActualCoreEntryObserver`), role follower, `confState.voters` = 3, a leader elected by the
   three voters. Red: the joiner runs liferaft with vote denial (`inbound-ingress:143-181`).
6. `no-legacy-consensus-object-remains-in-message-groups` - static: `src/message-group/**` imports
   none of liferaft-provider/in-memory-log-adapter/raft-group/raft-timing-utils/liferaft.js and has no
   `raft.nodes|raft.packet|raft.heartbeat|raft.state|getRaftInstance` access; `raft-timing-utils.js`
   and `raft-group.js` absent; an unknown command type is refused before propose. Red: all present.

Quest `raft-rs-worker-deletion-and-wasm-service-group` (file
`test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js` + a static witness):
1. `no-worker-consensus-path-remains` - static: `src/worker/` and `src/cache/system-cache-proxy.js`
   absent; `scripts/build-sea.js` lists no replica-worker bundle; shards regenerated. Red: present.
2. `a-wasm-service-replica-is-constructed-by-production-on-the-port` - `ServiceRuntimeLifecycle`
   prepare through the wired context yields a replica whose port is frozen and whose
   `{dataDir}/wasm-services/{serviceId}/{replicaId}.db` holds `_raft_rs_*`. Red: nothing supplies
   `wasmLifecycle` (`wasm-component-driver.js:392-393`); `raft` null.
3. `a-kv-write-commits-over-the-message-router-and-is-readable-on-every-replica` - three replicas,
   leader `write`; every `kvStore.get` returns the value; `readCommittedEntriesIn` shows `kv_set`.
   Red: `proposeEntry` uses `raftProvider` (`wasm-service-replica.js:536-551`).
4. `restart-restores-kv-state-and-consensus-record-from-one-file` - restart one replica: value
   present, term and ConfState preserved, KV row and applied index in the same file. Red: `:memory:`.
5. `leadership-change-moves-timers-and-safety-broadcasts` - close the leader's port; a new leader
   emerges; `onBecameLeader` reconstructs timers and the broadcast's `committedIndex` equals
   `readStatus().commitIndex`; the services-row role writer sees the new role. Red: liferaft events
   (`raft-replica-base.js:201-259`).
6. `raft-replica-base-is-deleted-not-inherited` - static: `raft-replica-base*.js` absent; no
   `RaftReplicaBase` in the prototype chain; no `raftProvider`, no `handleRaftPacket`; unknown command
   type refused. Red: `extends RaftReplicaBase` (`:84`).

## 4. Open owner decisions

### The lead can decide by the recorded rules (decided here)
D1 Durable store owner/layout (1.2): `DataDirectoryManager`, one file per replica, no `:memory:`.
   Rules: epic :189-191 ("explicitly owned local durable storage"), R01, R13. Decided: yes.
D2 Join-phase vote refusal (census q2): dropped; carried by ConfState membership + DEFER_ELECTION
   (1.5). Rules: `raft-rs-ingress.js:1-13` (host reproduces no Raft check), epic :127. Decided.
D3 Leader-routed proposal policy (q9): message-group-owned helper over `port.propose` (1.7).
   Rules: R01/R03; the port keeps twelve operations (R1 constraint `port-unchanged`). Decided.
D4 R2 binding (q3): one group-neutral admission owner extracted from the partition (1.6); R3 widens
   into `src/partition` for the extraction only, recorded (R16). Decided.
D5 Commit contract owner (q4): the port's codec + callback (1.1); COMMIT removed from the port's
   subscribable set (`raft-rs-operation-port.js:37`) and from the partition wiring's event map
   (`lifecycle-wiring.js:47`) in R3 - a subscribable event that never fires is an unnamed state (R07).
   Decided, recorded as an R16 widening of two lines.
D6 `InMemoryLogAdapter` module: message-group import removed in R3; module + 11 dependent tests go
   in R6 as liferaft fixtures (epic :323-325); deleting in R3 breaks 8 harness tests R6 deletes anyway.
D7 Election jitter (q7): parity with the partition in R3; redundancy recorded for R5. Decided.
D8 Tracked demotion (q12): already dead on the port for every consumer (F12); not an R3 blocker;
   belongs to the F1 quest. Decided.
D9 Worker tests: delete/retain split as 2(a); `system-cache-proxy` deleted with the workers
   (decision 5, no src importer). Decided.
D10 Acknowledgement level: parity (F7); commit-level acknowledgement recorded as a later
   improvement for both message groups and strong WASM writes. Decided.

### Needs the owner
O1 Log growth without compaction. A message group's `_raft_rs_log` grows one row per CDC command and
   the core keeps the log in WASM `MemStorage` (`vendor/raft-rs-wasm/src/lib.rs:403`); the store
   deletes rows only on conflict (`raft-rs-durable-store.js:236-258`); the port has no compaction
   operation; the state machine is empty so a snapshot would carry nothing. Snapshot/catch-up on
   rs-raft is unowned (epic findings F5). R3 lands with the growth measured and bounded by nothing;
   the owner decides whether a compaction operation (port change) enters R5 before message groups
   carry production CDC volume.
O2 Seeded randomness (q10): the DT5 seam cannot reach rs-raft election timing without a binding
   change (a seed on `create_node` or a `seed_rng` primitive in the fork,
   `vendor/raft-rs-wasm/src/lib.rs`, rebuilt with a new `artifact-digest.json`). Carry inert, or fund
   the fork change.
O3 WASM composition root: which owner supplies `replicaIds`/placement for a wasm_component group and
   where the lifecycle factory is constructed (2(b)); this touches the placement authority R2 is
   about to redefine.
O4 Durability pragmas for consensus hard state: WAL + `synchronous` as the partition sets them
   (`partition-service-raft-init-base.js:381-382`) survive a process crash but not necessarily power
   loss before checkpoint; the same choice now covers three group kinds. Confirm or raise (R5).
O5 Process-level provider control (q8): `RAFT_PROVIDER` env, `ensureLiferaftProviderForRuntime`
   (`lagrange-runtime-startup.js:713-717`), `src/raft/spike/*`, `scripts/run-raft-logic-investigation-spike.js`,
   `scripts/run-raft-migration-rollback-drill.js`: delete in R4 (recommended; epic :293-295) or move
   to test-only tooling. The census asked; the owner has not answered.
