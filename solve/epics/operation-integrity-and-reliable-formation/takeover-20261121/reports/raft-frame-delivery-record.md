# Raft frame delivery: contract-first transition record (stage 1)

Line: the per-message cost of delivering raft frames between nodes, repairs (e), (h), (i), (b), (c1) of
`reports/idle-raft-cpu-cost.md` section 7. Stage 1 only: this record, the consumer census and red witnesses.
Nothing under `src/` was changed.

| Item | Value |
| --- | --- |
| Base | `23344cddc` (source read here; the analysis read `f580579a5`, an ancestor 38 commits back; every file:line below is re-read at `23344cddc`) |
| Branch / worktree | `work/raft-frame-delivery-20261121`, `/mnt/data/peter/projects/.worktrees/raft-frame-delivery-20261121` |
| Witness commit | `f1265c5cae96e6cc05ffc3626f6ab48b2daf74b5` on `work/raft-frame-delivery-20261121`, pushed (section 11) |
| Rule set loaded | `docs/steering/rules.md` (last_reviewed 2026-11-13): R01, R08, R11, R12, R13, R19 in particular; `architecture/contracts/authority-and-recovery.md`; `docs/steering/workflow-guidelines/solver-quests.md` (8-item checklist); `test/guidelines/INDEX.md`; `src/test-helpers/INDEX.md` |
| Labels | VERIFIED = read in source at `23344cddc` or measured by a witness run named in section 11. INFERRED = my reading. |

## 1. The canonical raft message delivery path today (VERIFIED)

### 1.1 What an envelope is

A raft-rs transport envelope is `{protocol: 'raft-rs', groupId, from, to, message}`, built once per outbound raft message
by `deliverToPeer` (`src/raft/raft-rs-peer-delivery.js:161-167`). `message` is the binding's message object (decimal-string
positions, `msgType` numbered by the binding's `num_to_msg_type`). The transport classifies it by shape only:
`isRaftRsTransportEnvelope` / `isRaftTransportPayload` (`src/raft/raft-packet-utils.js:11-28`).

### 1.2 Sender, hop by hop

| # | Hop | Where | Per message today |
| --- | --- | --- | --- |
| S1 | A Ready's messages are sent in order, after `persistReady` and `persist_ready` | `raft-rs-runtime-owner.js:1316` (persist), `:1227-1237` (`finishReady` -> `sendMessages`) | Send-after-persist holds: nothing leaves before the Ready's storage-bearing part committed |
| S2 | `sendMessages` -> `deliverToPeer`, one message at a time; a pending delivery is awaited before the next message (`continueTurn`) | `raft-rs-peer-delivery.js:198-207`, `:146-185` | The group's turn stays open until every delivery promise of the Ready settles |
| S3 | `MsgSnapshot` never reaches the transport: it becomes a snapshot catch-up notification | `raft-rs-peer-delivery.js:155-158`, `:123-144` | - |
| S4 | `group.sendToPeer(address, envelope)` = the SEND_TO_PEER closure: `transport.deliver(peerAddress, envelope, resolveRaftTransportDeliveryOptions({...envelope, targetAddress}))` | `partition-service-raft-init-base.js:324-332`; `message-group-consensus-port.js:124-131`; `wasm-service-consensus-port.js:172-177` | Options: priority CRITICAL / READINESS / BACKGROUND, heartbeat `replacePendingKey`, `raft:append` delivery source (`src/raft/constants.js:247-315`); they act only on the fallback path (S8) |
| S5 | `router.deliver` opens a delivery lifetime | `message-router-delivery-behaviors.js:149-228`; `message-router-delivery-lifetime.js:220-234`, `:45-170`, `:183-218` | `createTimeoutBudget`, an `AbortController`, a router-shutdown abort listener, a ref'd deadline `setTimeout` on the router clock (`:85-95`, `:164`), `Promise.withResolvers` plus `new Promise` (`:186`, `:193`), `messageCount += 1` (`delivery-behaviors.js:173`) |
| S6 | `resolveDeliveryOutcome` -> `deliverRemote` (same lifetime) -> `tryDeliverRaftDirect` | `message-router-delivery-pressure-routing.js:278-328`; `delivery-behaviors.js:275-295`, `:230-273` | If the peer connection is CONNECTED and the socket OPEN: `JSON.stringify` and one `ws.send` (`:265-268`); returns `{messageId, acknowledged: true}` (`:269`) |
| S7 | Back in `deliver`: normalise, `buildDeliveryEnvelope`, `recordDeliveryMetric` (sampled TRANSPORT_DELIVER log) | `delivery-behaviors.js:198-211`, `:107-147` | The deliver promise resolves DELIVERED with a null answer; lifetime disposed (timer cleared, listeners removed) |
| S8 | Fallback when S6 returns null (not CONNECTED, socket not OPEN, or `ws.send` threw) | `delivery-behaviors.js:296-446`, `:449-488`; `message-router-ack-delivery.js:58-184` | Reconnect-in-progress -> FAILED at once (`:297-307`); else a SERVICE_RESPONSE waiter (`registerPendingResponse`, `:308-313`), the outbound queue with the raft priority options (`:328-401`), a delivery-triggered reconnect (`:341-360`), `sendWithAck` (ACK timer, `pendingMessages`, ACK-timeout quarantine on the router's own spent grant, `ack-delivery.js:110-118`, `:36-57`), then the response grant (`armPendingResponseTimeout`, `:470-472`) and **the raft turn waits for the receiver's SERVICE_RESPONSE** (`:475`) up to the delivery lifetime (`transport.messageTimeoutMs`, default 5000 ms, `config-definitions.js:102`) |
| S9 | The sender records the outcome against the peer | `raft-rs-peer-delivery.js:92-105`, `:43-50`, `:76-87` | DELIVERED -> `peerDelivery` observation; FAILED -> observation, and later messages to that peer in the same Ready are dropped (`failedPeers`) |

**What "delivered" means to the sender today (VERIFIED, the analysis' claim holds).** On the direct path the sender
records DELIVERED when `ws.send` accepted the frame (`delivery-behaviors.js:266-269`): the ACK and SERVICE_RESPONSE that
follow are never awaited by anyone. On the fallback path it means "ACKed and answered": a handler throw is FAILED
`handler_failed`, a missing handler is FAILED `send-no-handler` (`raft-rs-peer-delivery.js:95-99`).

### 1.3 Receiver, hop by hop

| # | Hop | Where |
| --- | --- | --- |
| R1 | `handleMessage` -> `dispatchInboundMessage`: `JSON.parse`, `recordNodeInboundActivity(peer)` for **any** parsed frame | `message-router-inbound-dispatch.js:66-94` (`:72-73`); the key is the peer node id once identified (`connection-lifecycle-methods.js:459`, `:526`; `server-lifecycle.js:257`) |
| R2 | Authentication, then `routeAuthenticatedInboundFrame`; SERVICE_MESSAGE -> `captureIncomingDelivery` -> `handleServiceMessage` | `:95-141` |
| R3 | **An ACK frame, unconditionally, before the handler runs** | `:483-487` |
| R4 | No handler: emit MESSAGE and a SERVICE_RESPONSE `{noHandler: true}` | `:488-506` |
| R5 | The handler in a microtask; its answer (or its throw's message) as a **SERVICE_RESPONSE frame, unconditionally** | `:515-542` |
| R6 | The handler's raft branch: partition `assertReplicaHandlerServing` then `await turnChainValue(this.raft.step(payload))`, answer `null`; message group and WASM service the same without the serving assertion | `partition-service-entry-apply-base.js:351-367`; `message-group-service-inbound-ingress-runtime-methods.js:114-128`; `wasm-service-replica.js:362-369` |
| R7 | `port.step` -> `protocolTurn` -> lifecycle `execute` (a closed port refuses) -> `enqueueStep` | `raft-rs-operation-port.js:351-370`; `raft-rs-runtime-owner.js:2283-2321` |
| R8 | `enqueueStep`: shared-runtime recovery refusal; ingress `admitRaftRsMessage` (typed CORE_REFUSED); recovery-window drop; reseed hold; identity-unrecorded drop; `pushInboundEnvelopeWithBounds` (copy + `deepFreeze`, bounds 16384 envelopes / 64 MiB, overflow **throws** `RAFT_INBOUND_QUEUE_OVERFLOW`); `scheduleInboundDrain` | `:2283-2321`, `:1917-1928`, `:2157-2163`; bounds `raft-rs-runtime-owner-constants.js:100-101` |
| R9 | One zero-delay drain timer per group when none is armed; custody record per group | `:2010-2027`; `raft-rs-inbound-timer-custody.js:9-31` |
| R10 | The drain: lifecycle admission (`admitScheduledEntry` -> `protocolTurn`), the group's turn queue (`enqueue`), at most 32 envelopes (`MAX_SCHEDULED_INBOUND_DRAIN_BATCH`), re-armed while envelopes remain; a user transaction defers on a 10 ms poll bounded at 120 s; a shared-runtime rebuild records `inboundWakeDebt` | `:2067-2099`, `:1983-2005`, `:70`, `:2029-2065`, `raft-rs-runtime-owner-constants.js:237-241` |
| R11 | Per envelope: local-log guard, `step`, then a whole Ready cycle and `announce` | `:1874-1898`, `:1306-1327`, `:1329-1369`, `:1398-1422` |

The step's outcome is discarded by all three receivers (they answer `null`). What reaches the sender is only "the
handler returned" or "the handler threw".

### 1.4 Same contract for all three service types (VERIFIED)

Partition, message-group and WASM-service raft traffic use the identical SEND_TO_PEER closure body and the same
`MessageRouter.deliver`; their receivers have the identical raft branch (R6). Message-group envelopes differ only in the
fallback-path priority (READINESS lane, `raft/constants.js:223-245`), which the direct path ignores.

### 1.5 Traffic on the same path that does need the ACK and the response (VERIFIED)

Every non-raft SERVICE_MESSAGE to another node takes the ACK path by construction (S6 returns null for a non-raft
payload, `delivery-behaviors.js:239-241`; query data-plane messages may first go through the query transport selection,
`message-router-delivery-pressure-routing.js:286-306`) and is answered by R3 and R5: partition application payloads on the **same handler address** as raft
(`handleCanonicalApplicationPayload`, FORWARD_WRITE, statement admission), queries, CDC deliveries (`deliveryContext`),
CREATE_REPLICA and the other replica operations, control-plane gateway writes, message-group application messages
(duplicate suppression by `acknowledgedMessages`), WASM reads and writes, router RPC (`rpc-client.js:168`). The anchor of
witness (e) keeps one of them. Consequence: the receiver cannot choose "no ACK, no response" by address; the frame must
say which delivery class it is.

## 2. Consumer census for (e)

Every reader of a raft frame's ACK, of its SERVICE_RESPONSE, of its delivery outcome or lifetime, and of the orphaned
response record. "Raft frame" below means a SERVICE_MESSAGE whose payload is a raft-rs envelope.

| # | Consumer | file:line | What it reads today | Need | Provided after (e) by | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | ACK-timeout quarantine liveness guard ("slow, not dead", CL-007) | `message-router-reconnect-behaviors.js:630-682`; fed by `inbound-dispatch.js:54-58`, `:72-73` | `connection.lastAckAt` and `nodeInboundActivityAt(peer)`. Raft ACKs never touch `lastAckAt`: `handleAcknowledgment` finds no `pendingMessages` entry for a direct raft frame and does nothing (`pending-response-ledger.js:498-532`). Raft ACK and SERVICE_RESPONSE frames do refresh `nodeInboundActivityAt` (R1) | Evidence within `ackTimeoutQuarantineLivenessWindowMs` (30 s, `config-definitions.js:104`) that the peer is alive | The peer's own raft envelopes: in every group the two nodes share and that has a leader, traffic flows both ways at heartbeat cadence (heartbeat one way, its response the other); plus every non-raft frame and PING/PONG (`pingIntervalMs` 30 s). The wedged-socket test reads only `lastAckAt` (`:640-655`), which raft never fed | **Met**, with residual R-1 |
| C2 | Keepalive missed-ping sever guard | `message-router-connection-close-reconnect.js:367-405` (`:381-399`) | `nodeInboundActivityAt(peer)` | As C1 | As C1 | **Met**, residual R-1 |
| C3 | `pingNode` timeout answered "reachable" by recent inbound | `message-router-peer-liveness.js:64-71`, `:73-105`; callers `control-plane/membership-swim-prober.js:79`, `node/node-readiness-policy.js:329`, `rebalancer/unified-rebalancer-replica-state.js:178`, `:245`, `rebalancer/operation-workflow-recovery-timeout.js:703`, `rebalancer/operation-workflow-remove-safety-universal-tier.js:110`, `topology/latency-measurement-service.js:218` | As C1 | As C1 | As C1 | **Met**, residual R-1 |
| C4 | ACK-timeout streak, `lastAckAt`, `lastAckTimeoutAt` and the handoff diagnostics built from them | `pending-response-ledger.js:510-520`; `reconnect-behaviors.js:609-628`; `ack-delivery.js:36-57`, `:110-118`; `delivery-behaviors.js:601-620`; `rebalancer/operation-workflow-owner-shared.js:513-516` | Direct raft frames: nothing. **Fallback** raft frames: their ACK timeouts count toward quarantine | The streak must mean "the ACK path to this peer is failing" | Non-raft ACK-path deliveries only | **Met**; behaviour change named: a raft frame no longer adds to the streak (today only on the fallback path) |
| C5 | Sender's per-peer delivery observation | `raft-rs-peer-delivery.js:43-50`, `:92-105`; exposed as `status.peers[].delivery` (`raft-rs-status-observation.js:54-64`) | DELIVERED / FAILED per peer | No `src/` decision reads `.delivery`: every `src/` reader of `status.peers` reads address, learner or identity only (`node/replica-handler-participant-cutover.js:54`, `message-group/message-group-forwarding-owner-routing-methods.js:69-120`, `message-group/message-group-service-peer-resolution.js:64`, `raft/learner-catch-up-acknowledgement.js:46`, `raft/raft-rs-group-membership-admission.js:240`; `partition/partition-participant-transaction-pause.js:123` passes `peers` into release facts whose one reader takes `.address`). Readers: diagnostics and tests | The class's own outcome: DELIVERED = written to the peer's open connection (today's direct meaning); FAILED = no open connection or the write threw | **Met**, provided (e) keeps the direct meaning and states it as the class's contract |
| C6 | `failedPeers`: drop the rest of a Ready's messages to a peer that just failed | `raft-rs-peer-delivery.js:76-87`, `:198-207` | The per-message outcome | A per-message failure, before the next message to that peer | The class answers at once (written / not written) | **Met** (and can become a settled turn: no per-message promise) |
| C7 | The group's turn awaits each delivery promise (S2) | `raft-rs-peer-delivery.js:173-184`; `raft-rs-turn-answer.js` | Promise settlement | None beyond C6 | Synchronous answer | **Met**; removes today's hazard that a fallback raft frame holds its group's turn for up to the delivery lifetime (S8) |
| C8 | Handler-identity refusal F1: a retiring incarnation never takes a raft envelope it would drop | `node/replica-transport-handler-identity.js:84-102`; `partition-service-entry-apply-base.js:359-367`; witness `test/partition/handler-identity-w-hid-1-retiring-partition-refuses-raft.test.js` (header lines 1-14) | Receiver side: the throw prevents the step. Sender side: FAILED `handler_failed` **on the local path** (`deliverLocal`, `delivery-behaviors.js:57-105`) and on S8; on the remote direct path the error SERVICE_RESPONSE is already orphaned and the sender already recorded DELIVERED | (i) no step reaches a retired port; (ii) W-HID-1 also asserts the sender's FAILED, through `MessageRouter.deliver` LOCAL | (i) unchanged (receiver side). (ii) unchanged only if the raft class leaves same-node delivery as it is | **Blocks (e) for same-node delivery** unless the class is remote-only or W-HID-1's sender clause is superseded (O-2). Remote: no change |
| C9 | Receiver throws on raft envelopes (message group not initialized; inbound queue overflow `RAFT_INBOUND_QUEUE_OVERFLOW`; F1) | `message-group-service-inbound-ingress-runtime-methods.js:114-119`; `raft-rs-runtime-owner.js:1917-1928` | Today an error SERVICE_RESPONSE, orphaned at the sender | Nobody remote reads it | A receiver-local record of the refusal (count or log), never an unhandled rejection | **Met** with that design item |
| C10 | Orphaned-response record: disposition counts, `getStats().serviceResponseDispositions`, the rate-limited `No pending service response request` warning | `pending-response-ledger.js:123-180`, `:186-207`, `:234-258`; `message-router-stats-shutdown.js:139` | One `orphaned` per raft frame sent | No `src/` reader decides on it (the pressure governor reads `outboundQueues`, `pressure-governor.js:611-626`; `control-plane-write-health-owner.js:87-100` goes through the governor; `admin-preflight-snapshot.js:404-420`, `:551-560` read connections and queues). Tests read it for non-raft cases (`test/transport/message-router-late-response-classification.test.js`, `message-router-tail-more-test-cases.js:162`). Human analyses read the log | Fewer, genuine orphans | **Met** |
| C11 | `LATE_RESPONSE_HONORED` | `inbound-dispatch.js:564-578` | Retired waiters with a `responseContext` (non-raft) | - | - | **Unaffected** |
| C12 | Backpressure and flow control | `pressure-governor.js:611-626`; outbound queue `message-router-outbound-delivery-registry.js` | Raft direct frames bypass the queue (`tryDeliverRaftDirect`, since `8f284ad8a` 2026-04-13: "so consensus traffic does not contend with the general outbound queue"); fallback raft frames enter it with the raft options | Nothing reads raft in the queue as pressure evidence | - | **Met**; the raft options in `raft/constants.js:48-315` become dead if the class has no queued fallback and must then be deleted (no legacy). The direct lane stays unmetered (R-2, carried to c1) |
| C13 | Delivery-triggered reconnect | `delivery-behaviors.js:341-360`, `:512-555`; `owner-retry-budget.js` | Fallback raft frames to a disconnected peer start a reconnect | A lost connection is re-established | `scheduleReconnect` on close of an outbound connection; for a peer whose only connection was its adopted incoming socket, the peer re-dials | **Open** (O-3): verify in stage 2 that no peer pair depends on raft-triggered reconnects |
| C14 | Delivery metrics and `messageCount` | `delivery-behaviors.js:107-147`, `:173`; `stats-shutdown.js:136` | Every `deliver()`, raft included | Diagnostics and tests (`test/transport/message-router-deliver-metrics.test.js`, `message-router-tail-test-cases.js:312-332`, non-raft) | A per-class counter if raft leaves `deliver()` | **Met** (diagnostic) |
| C15 | CDC delivery invocation | `delivery-lifetime.js:34-43`, `:48` | Only with `deliveryContext`; raft options carry none | - | - | **Unaffected** |
| C16 | Tests that read raft delivery shape | `test/partition/raft-rs-transport-demux.test.js:165-177` (`tryDeliverRaftDirect` answers `acknowledged: true`, envelope unchanged); `test/raft/raft-rs-peer-delivery-transport-outcome.test.js` (local-dispatch outcomes into `sendMessages`); W-HID-1 (C8) | - | Envelope unchanged on the wire: kept. Outcome mapping: follows the class | - | **Met** except C8 |
| C17 | Distributed harness verdicts | grep of `scripts/` and `test/` for the orphan message, `serviceResponseDispositions`, `tryDeliverRaftDirect`, `RAFT_DIRECT_DELIVERY` | None reads them | - | - | **Unaffected** |

**Residual R-1 (liveness evidence).** Raft ACK/SERVICE_RESPONSE frames are a node's only inbound evidence from a peer
exactly when it sends raft frames to that peer and the peer answers none of them at raft level for the whole 30 s window:
the peer has no handler for the address, or its replica is held (reseed hold, recovery window, identity not recorded,
closed), or it ignores vote requests inside its lease, **and** the two nodes share no other live group and exchange no
other traffic. Today's PING/PONG every 30 s also counts. In that case, after (e), an ACK-path timeout streak on a slow
peer could quarantine it where today it would not. INFERRED: rare; formation (the CL-007 case) has heavy shared-group
traffic. Stage 2 should either accept this with a record or keep liveness by counting every inbound frame including
the new class (it already does: R1 records any parsed frame).

**Residual R-2 (unmetered direct lane).** The direct raft lane has no backpressure today (`ws.send` into an unbounded
socket buffer; raft-rs allows 256 in-flight appends of up to 1 MiB each per peer, `vendor/raft-rs-wasm/src/lib.rs:467-472`).
Already routed on 2026-08-11 as "metering/pacing the raft direct-send catch-up lane (transport owner)"
(`solve/quests/partition-leader-row-publication-integrity/quest.json:4`). Not changed by (e); (c1) must not make it worse.

**What the repair must be (from the census).** An explicit owner-defined delivery class for raft envelopes, owned by the
transport router vocabulary: the sender declares it on the frame (a distinct router frame type or an explicit class
field, one shape, R08); the receiver dispatches it to the handler with no ACK and no SERVICE_RESPONSE and records a
handler refusal locally (C9); the sender's outcome is "written to the open connection" or FAILED, answered synchronously,
with no delivery lifetime, no deadline timer, no pending waiter and no queued fallback (R11: one execution path; the S8
fallback for raft is removed, not kept beside it). Not a flag that silently drops responses: the classification is the
sender's, carried on the frame, and every non-raft frame keeps ACK and SERVICE_RESPONSE (section 1.5). Same-node
delivery needs a decision (C8, O-2).

## 3. Raft safety argument

### 3.1 The message types (from the binding, not hand-listed)

Source of the list: `num_to_msg_type` in `vendor/raft-rs-wasm/src/lib.rs:1294-1316`, mirrored by
`RAFT_RS_MESSAGE_TYPE` in `src/raft/raft-rs-ingress-constants.js:66-86` (range `:57-60`). Classification per number:

| msgType | Name | On this wire path? | Loss / duplication / reordering |
| --- | --- | --- | --- |
| 0, 1, 10, 11, 12 | Hup, Beat, Unreachable, SnapStatus, CheckQuorum | No: local messages raft-rs never puts in a Ready | - |
| 7 | Snapshot | No: intercepted into the snapshot catch-up notification (`raft-rs-peer-delivery.js:155-158`); the binding exports no compaction, and ingress refuses it (`MESSAGE_TYPE_WITHOUT_PRODUCER`, `raft-rs-ingress-constants.js:42-45`) | - |
| 15, 16 | ReadIndex, ReadIndexResp | No producer (no `read_index` export); refused at ingress | - |
| 3 | Append | Yes | Lost: the follower does not answer; the leader resends on the next heartbeat response or probe, or the follower rejects a later out-of-order append and the leader backs `next` off. Duplicated: idempotent by (index, term). Reordered: rejected and re-sent. Safety never depends on delivery |
| 4 | AppendResponse | Yes | Lost: `matched` does not advance; heartbeat responses free in-flight slots and trigger a resend. Safety intact; commit is delayed |
| 5, 6, 17, 18 | RequestVote, RequestVoteResponse, RequestPreVote, RequestPreVoteResponse | Yes | Lost: the election times out and retries at a new randomised timeout. Duplicate votes are idempotent per term. Liveness only |
| 8, 9 | Heartbeat, HeartbeatResponse | Yes | Lost: a follower may time out (election) and a check-quorum leader may step down after an election timeout without responses. Liveness only |
| 14 | TimeoutNow | Yes (leadership transfer) | Lost: the transfer does not happen and the leader aborts it after an election timeout. Liveness only; the transfer owner sees no leadership change |
| 13 | TransferLeader | Possible (raft-rs forwards it from a follower to the leader) | Lost: no transfer starts. Liveness only |
| 2 | Propose | Possible (a follower forwards a proposal; ingress admits only port-shaped proposals, `FORWARDED_ENTRY_NOT_A_PROPOSAL`) | Lost: the proposal is silently gone (raft-rs gives no feedback). **Already true today on the direct path**, where DELIVERED is recorded at socket accept; (e) changes nothing here |

Conclusion (INFERRED from raft's design, VERIFIED that no Lagrange consumer reads more than the socket-accept outcome on
the direct path, census C5-C7): raft tolerates loss, duplication and reordering of every type on this path; no
obligation rides on the ACK or the SERVICE_RESPONSE.

### 3.2 Ordering the transport must keep

- **Safety-critical (kept by construction, must stay):** a Ready's messages leave only after its persistence committed
  (S1). Any batching or deferral moves sends later, never earlier.
- **Efficiency (keep):** FIFO per node pair, which gives FIFO per (group, sender, receiver). A pipelined `Append` stream
  that is reordered is rejected and re-sent (cost, not harm). Today one socket per pair plus in-order microtasks at the
  receiver (R5) keep it; (b) and (c1) must keep it.
- **Not required:** any order across groups, or across pairs.

### 3.3 Snapshot and large messages

`MsgSnapshot` is not on this path (S3); snapshot bytes travel on the bulk channel (`src/transport/bulk-transfer-channel.js`).
The largest messages on this path are catch-up `Append`s (up to `max_size_per_msg` 1 MiB of entries plus JSON and
base64 overhead, 256 in flight per peer). They rely on no delivery outcome beyond C6; raft-rs flow control is
acknowledgement-driven (`AppendResponse`), not transport-outcome-driven.

## 4. (h) and (i): status announcement and empty-Ready persistence

### 4.1 Readers of the recorded status observation (VERIFIED)

`announce` (`raft-rs-runtime-owner.js:1398-1422`) runs after every drain that found no further Ready
(`drainReady`, `:1339-1341`): it reads `status`, records the observation (`recordStatusObservation`, `:1501-1507`, which
reads `conf_state`, `:1451-1477`), and derives events from it.

| Reader | file:line | Reads | Relies on a refresh every drain? |
| --- | --- | --- | --- |
| `readStatus` while the group is busy (turn queued or inbound pending) answers the recorded observation; idle, it reads the core fresh | `:1542-1578` | Every field of the shaped status | Yes, for fields that change without a Ready: see the leader row below |
| Committed-membership reads (non learner-action) | `:2141-2145` via `readStatusNow` | `confState` | Changes only with applied conf changes or snapshots: covered by a Ready predicate |
| `SHAPED_STATUS` cache, keyed by the observation object | `:110`, `:1573-1577`; shaping reads live `group.peerDelivery`, `group.inboundStepRefusals`, `group.health` (`raft-rs-status-observation.js:61`, `:167`, `:173`) | Shaped status | Today the cache refreshes because every drain replaces the observation object. If the object is kept, delivery, refusal and health fields go stale: must be invalidated on their own changes |
| ROLE, TERM_CHANGE, LEADER_CHANGE | `:1407-1415` | `raftState`, `term`, `lead` | Covered by Ready soft state / hard state |
| APPLIED_PROGRESS | `:1424-1431` | applied index | Covered by committed entries (Ready or LightReady) |
| MEMBERSHIP_CHANGED, CONF_CHANGE_APPLIED, GATE_OPENED | `:1437-1447`, `:1416-1421`, `:1388-1393` | confState key, applied conf-change count, pending gate | Covered by applied conf changes and snapshots |
| **Leader catch-up evaluation, every drain** | `evaluateTenureCatchUpOnDrain`, `raft-rs-conf-change-admission.js:214-234` (`evaluatePeerCatchUp` `:187-206` reads `progress[].state`, `matched`) | Leader `progress` | **Yes.** `progress` changes when the leader steps an `AppendResponse` or `HeartbeatResponse`, with no Ready |
| **Leader follower progress** | `learner-catch-up-acknowledgement.js:46-48`; `partition-service-learner-promotion-proof-methods.js:135` (via `followerProgress`, `raft-rs-status-observation.js:82-100`) | `matched` per peer | **Yes, while busy**: a stale value delays a learner's catch-up proof (liveness; `matched` only grows within a term) |
| `group.lastStatus` (the "before" of every comparison) | `:1402-1403` | Last read status | Must be the last status actually read |

### 4.2 The (h) predicate that keeps every reader whole

Read `status` and `conf_state` and record the observation exactly when one of these holds; otherwise keep the previous
observation and read nothing:

1. the drain took a Ready or LightReady with soft state (role, leader), hard state (term, vote, commit), non-empty
   entries (`lastIndex`), non-empty committed entries (applied, conf changes, gate) or a snapshot;
2. the replica leads and stepped a message that can move `progress` (`AppendResponse`, `HeartbeatResponse`; to be
   decided whether every step on a leader counts), or holds outstanding catch-up records;
3. a host input of the observation changed: participation gate, `membershipGenerationIndex`, `lifecycleIncarnation`,
   `runtimeHealth` / `runtimeGeneration` (reconstruction, replacement), `persistedLastIndex`;
4. separately, the shaped-status cache is dropped when `peerDelivery`, `inboundStepRefusals` or `group.health` change.

A quiet follower (heartbeat with no hard-state change, tick with no Ready) meets none of them: that is the measured
saving. A leader keeps reading after response steps: (h) saves the follower share (two of three replicas per group at
RF 3), not the leader's. INFERRED: the "term, leader, commit, applied or configuration" list in the analysis misses
items 2-4 and role changes without a term change (pre-candidate).

### 4.3 What "nothing to persist" means for (i), and what must still run

Nothing to persist = the taken Ready has no snapshot (absent or index 0), no entries, and no hard state. `mustSync` false
is not enough: a commit-only hard state has `mustSync` false and must persist (`raft-rs-durable-store.js:268-272`,
`:444-460`). Must still run: `take_ready`, `persist_ready` (a no-op on the binding's MemStorage for an empty Ready, `lib.rs:590-624`; the
pending Ready that `advance_append` consumes is set by `take_ready`, `:567-588`, `:626-663`, so skipping it is possible
but saves one core entry only), `syncTakenSnapshot` (no-op), sends, `applyEntries` of `committedEntries` (they can be non-empty with
nothing to persist and have their own transaction), `advance_append`, the LightReady commit index write
(`putCommitIndex`, `:1249-1251`, an autocommit statement outside `persistReady`), `persistMemCommitIndex`, LightReady
messages and committed entries, `advance_apply`. The persistence admission check needs no transaction: it already ran
before `take_ready` (`:1308-1310`).

**Finding (blocks (i) as written, R09):** the sealed receipts of owner decision 2026-10-05 ("option 2", design O4),
`raft-persist-commits-with-full-sync-before-any-message-of-its-ready` and
`the-store-honours-raft-rs-must-sync-on-every-ready-shape`, are witnessed by
`test/raft/raft-rs-backend/durable-commit-sync.test.js`. It asserts that every send is preceded by a persist of its Ready
(`:118-150`) and that the scenario produced a persisted `messages-or-soft-state-only` Ready (`READY_SHAPE.NO_STORAGE`,
`:58-85`, `:216-225`). With (i) an empty Ready is no longer persisted, so both
assertions turn red although the property they protect (no message before its Ready's storage is durable) still holds,
vacuously. That needs an explicit supersession of the witness clause for the empty shape, not a reinterpretation.

## 5. (b) and (c1): invariants to keep, bounds, backpressure

### 5.1 (b) one node-level inbound drain per event-loop turn

Keep, per group: lifecycle admission (a closed or retired port is never drained; `admitScheduledEntry`, R10); the
group's own turn queue (`enqueue`, `:1071-1097`), so a drain never nests inside another turn; at most 32 envelopes per
group per pass, then the other groups (fairness; anchored by witness (b)); per-group FIFO; the persistence-admission
wait (an open user transaction defers that group only, 10 ms poll, 120 s bound, `:2029-2047`); the shared-runtime
`inboundWakeDebt` re-offer (`:2051-2053`, `:2076-2083`). Custody (R13): an admitted envelope always has exactly one owned,
live wake (today one per group, `raft-rs-inbound-timer-custody.js`); close clears the group's membership in the pass and
its queue (`:2342-2349`). Bound: one pass per turn, each pass bounded by 32 x groups-with-work envelopes; a per-pass time
or envelope budget so one pass cannot block the loop (R12). The per-group inbound queue bounds (16384 / 64 MiB) stay.

### 5.2 (c1) one frame per node pair per loop turn

Keep: every envelope delivered unchanged (the demux test's "envelope unchanged", C16); FIFO per pair; send-after-persist
(3.2); the receiver fans a batch out in order into the same per-envelope handler path (R6-R8), so lifecycle admission,
ingress and queue bounds apply per envelope. Bounded occupancy and release (R13): one pending batch per directed pair,
released at the end of the turn and when it reaches a byte cap; the cap below the socket's `maxPayload` (ws default
100 MiB, `docs/evidence/cdc-obligation-range-shipping-2026-11/challenge-timing-interleaving.md:99`), and a single envelope
larger than the cap goes alone. A closed or replaced connection releases its pending batch as FAILED for each envelope
(C5/C6 semantics), never re-queued. Backpressure when a peer is slow: today there is none on the direct lane (R-2). The
honest options are to keep today's behaviour (write regardless; the socket buffer grows) or to refuse a batch while the
socket's buffered amount is above a bound (FAILED per envelope; raft re-sends). The second changes behaviour under
load (heartbeats dropped rather than delayed) and is an owner decision (section 6).

## 6. Needs an owner decision, therefore excluded

- From the analysis: heartbeat cadence (c0); synthesised coalesced heartbeats (c2); quiescing idle groups (d); anything
  that changes raft timing (tick, election, heartbeat ticks, check-quorum, pre-vote).
- Out of this line's scope by the lead: the per-group tick timer (a), the CDC currentness check (f, another writer).
- Found by this census:
  - O-1 (i): supersede the durable-commit-sync witness clause for the empty Ready shape (section 4.3).
  - O-2 (e): same-node raft delivery. Either the raft class is remote-only (W-HID-1 unchanged) or W-HID-1's sender-side
    FAILED clause is superseded (C8).
  - O-4 (c1): drop-on-slow-peer for raft batches (section 5.2) versus today's unbounded socket buffer.
  - Wire compatibility: a new frame class is not understood by an older node, which would log it as unknown and drop
    it. `docs/operations-readiness.md:190-192` states there is no mixed-version contract in 0.x, so this is informational.

## 7. History quoted (so a previous reason is not rediscovered)

- The direct path's reason, `8f284ad8a` (2026-04-13), comment on `tryDeliverRaftDirect`: "Deliver a native Raft packet
  on an already-open socket so consensus traffic does not contend with the general outbound queue." No reason was ever
  given for the receiver's ACK and SERVICE_RESPONSE to raft frames; they are the generic SERVICE_MESSAGE handling.
- `solve/epics/raft-rs-full-cutover/evidence/router-envelope-q6-2026-10-26/DESIGN-router-envelope-q6-2026-10-26.md:166`:
  "Raft direct send (`tryDeliverRaftDirect`) ... DELIVERED with a null answer is legitimate (an ACK-only delivery)".
- `solve/quests/raft-snapshot-bulk-transfer/quest.json:21` (2026-07-26, that quest's constraint): "CL-040/041/042 repros
  stay green on every attempt; the primary router queue-class/reserve machinery and tryDeliverRaftDirect are not
  modified." A constraint of that quest, not of this line; CL-040..042 use the raft-rs network host without routers and
  are untouched by (e)/(c1), exercised by (b).
- `solve/quests/partition-leader-row-publication-integrity/quest.json:4` (2026-08-11): "Out of sealed scope, routed as
  their own candidates: metering/pacing the raft direct-send catch-up lane (transport owner) ..." (R-2).
- `solve/quests/rolling-restart-core-stability/log.ndjson:1144` (2026-06-19): "transport ACK is sent on receipt BEFORE
  the handler"; "'Skipping ACK-timeout quarantine: peer demonstrably alive (slow, not dead)' x336" - the liveness guard
  C1 is load-bearing under saturation.
- `src/constants/transport.js:67-72` comment: "During formation all joiners quarantined the alive-but-saturated seed -
  their only control-plane path - within 1s of each other (closure record CL-007)." The reason for C1; note that it
  names "inbound traffic (ACK or message)" as the evidence.
- `solve/epics/raft-rs-full-cutover/investigation-cutover-seed-regressions-2026-09-24.md` (quoted by the analysis): the
  node-level tick driver and batched drains were proposed and never executed; no quest exists.
- `docs/evidence/cdc-obligation-range-shipping-2026-11/challenge-timing-interleaving.md:99`, `:289`: raft heartbeats
  share the primary socket with everything else; one oversized frame closes the socket (1009) and fails every raft
  message on it (relevant to the (c1) cap).

## 8. Contract-first checklist (solver-quests.md) for this line

1. **Producer and consumer symbols.** Producer: `deliverToPeer`/`sendMessages` -> SEND_TO_PEER (three sites) ->
   `MessageRouter.deliver` -> `tryDeliverRaftDirect` / S8. Consumers: R1-R11 and C1-C17.
2. **Owner-defined shape.** The envelope shape is unchanged. New: one transport delivery class for raft envelopes,
   owned by the router vocabulary (`src/constants/transport.js` `ROUTER_MESSAGE_TYPE`), carried on the frame; its sender
   outcome is the existing transport envelope (DELIVERED / FAILED), no answer field.
3. **Identity and generation.** `groupId`, `from`, `to` (raft peer ids) travel inside the envelope; the router identity
   (node id, boot incarnation, connection authority) is unchanged; `captureIncomingDelivery` still binds each inbound
   frame to its connection (C8 needs it).
4. **Ordering.** Section 3.2.
5. **Absent versus unavailable.** No open connection is FAILED with the router's reason code, never a silent drop; a
   receiver refusal is recorded at the receiver (C9).
6. **Durable commit.** None in the transport. For (i): `persistReady`'s commit stays the durable point for every Ready
   with something to persist.
7. **Retained obligations.** None ride on a raft frame (section 3). Pending batch (c1) and drain custody (b) are
   bounded and owned (section 5).
8. **Wake and cleanup.** (b) keeps one owned wake per admitted envelope; close releases. (c1) releases its batch at
   turn end, on cap, or as FAILED on connection close.

## 9. The repair order this record supports

(e) first (it needs only O-2); (h) next (no owner decision; predicate 4.2); (i) after O-1; (b) (no owner decision);
(c1) after (e) and O-4. Each is its own commit with its witness turning green and the anchors staying green.

## 10. What each witness substitutes

Common: no production instrumentation was added; counts go through seams production already exposes (the router's
injectable `timeSource`, the in-process connection environment, the runtime owner's `setActualCoreEntryObserver` and
`setCoreFaultInjector` test seams, the operation port's injected substrate clock and database).

| Witness | File | Real | Substituted |
| --- | --- | --- | --- |
| (e) | `test/transport/raft-frame-unacknowledged-delivery.test.js`, fixture `test/transport/raft-frame-router-world.js` | Two `MessageRouter`s (production construction, IDENTIFY, adoption, deliver, inbound dispatch); a three-replica raft-rs partition (`PartitionNodeCluster` -> `createRaftRsOperationPort`), whose leader sends through the SEND_TO_PEER closure body | The link (VirtualNetwork + virtual connection environment, 1 ms); the raft ports' clock (network clock); the routers' clock (host clock behind a counting wrapper); the receiving handler (the partition handler's raft branch only); the followers' return leg (in process on the network clock, so the router link carries one direction) |
| (h)(i) | `test/raft/raft-rs-quiet-ready-cost.test.js` | The raft-rs partition operation port, its runtime owner and durable store over SQLite | One `VirtualTimeSource`; the transport (a held list the test steps, so a measured window holds only the follower's core entries); the follower's database handle (a Proxy counting `transaction`, `prepare`, `pragma`) |
| (b) | `test/raft/raft-rs-node-inbound-drain-scaling.integration.test.js` | G three-replica partitions (one replica per node), scheduled on their own ticks | One `VirtualTimeSource` seen per node through a wrapper counting zero-delay timeouts; the transport (a 1 ms timer that steps the recipient); step observation through `setCoreFaultInjector` (observe only) |
| (c1) | `test/transport/raft-frame-pair-coalescing.integration.test.js` | Three `MessageRouter`s, G three-replica partitions, raft in both directions through the routers | As (e), without the in-process return leg |

Robustness to the later repairs: (e) counts frames generically and envelopes at the handler, so (c1) batching keeps it
valid; (h)(i) and (b) let a host turn run inside each measured window, so a drain a repair schedules on the host still
lands inside it.

## 11. Lab run (EXECUTED)

- Commit `f1265c5cae96e6cc05ffc3626f6ab48b2daf74b5` (pushed to `origin/work/raft-frame-delivery-20261121`), host
  `adams-gamla` (4 cores, speed x2.12, machine factor 2.2), check base `0dbed1718c2d07c1fcb8bbe56b87ac41763c262c`.
- Attempt r1 (`lab/raftframes-stage1-r1`): runner failure "no lab machine is ready" before any test started; not a
  result. Attempt r2 (`lab/raftframes-stage1-r2`, log `lab/raftframes-stage1-r2.log`, ledger `test-results.ndjson`):
  4 files, 7 tests; every contract test red, every anchor green.

| Witness | Test | Result | Measured today (the failure message's own numbers) | Contract |
| --- | --- | --- | --- | --- |
| (e) | one frame, nothing back | **red** (1877 ms file) | 25 rounds: N = 50 raft envelopes sent A to B, 50 received by the handler; frames A to B 50, **B to A 100 (50 ACK + 50 SERVICE_RESPONSE)**, total 150 = 3N; **orphaned responses at A 50 = N**; **router timers armed at A 50 = N**; leader kept its term | total <= N, 0 back, 0 orphaned, 0 timers |
| (e) | anchor: ordinary request | green | 1 request frame, ACK + SERVICE_RESPONSE with its message id, DELIVERED with the answer, no orphan, no waiter left | kept |
| (h)(i) | 100 quiet heartbeats | **red** (1935 ms file) | **SQLite transactions 100**, prepares 0, pragmas 0; core entries: step 100, has_ready 200, take_ready 100, persist_ready 100, advance_append 100, advance_apply 100, **status 100, conf_state 100**; 100 heartbeat responses; term, leader, commit unchanged; nothing applied | 0 transactions, 0 status, 0 conf_state (prepares and pragmas are already 0) |
| (h) | 100 quiet ticks | **red** | tick 100, has_ready 100, **status 100, conf_state 100**, transactions 0 | 0 status, 0 conf_state |
| (h)(i) | anchor: commit-advancing heartbeat | green | commit advanced; one application; Ready persistence 1 transaction; status 1 | kept |
| (b) | drain wakes vs G | **red** (6539 ms file) | per 1000 virtual ms, zero-delay drain timers at the measured node **272 / 544 / 1088** for G = 8 / 16 / 32 (= 34 per group, one per envelope: 272 / 544 / 1088 envelopes delivered); all three nodes 816 / 1632 / 3264; every delivered envelope stepped once and in order (0 mismatched of 24 / 48 / 96 keys); fairness: burst 100 stepped, 7 of 7 singles stepped, 32 burst steps before the last single | growth <= 1.5 x from G = 8 to 32 (today 4.0 x) |
| (c1) | frames per pair vs G | **red** (4993 ms file) | per 1000 virtual ms, frames per directed pair **396 / 792 / 1584** for G = 4 / 8 / 16 on a-b, b-a, b-c, c-b (= 99 per group: 33 raft + 66 ACK and SERVICE_RESPONSE), 0 on a-c / c-a (followers do not talk); raft envelopes received 528 / 1056 / 2112; leadership stable in every world | growth <= 1.5 x (today 4.0 x on every loaded pair) |

What the numbers add to the analysis: the (b) count shows that in an idle cluster the per-group drain timer coalesces
nothing on a follower (one timer per envelope); only the leader's two responses per heartbeat share one. The (c1)
count reproduces the analysis' model exactly: 3 frames per raft message, and 132 raft messages per group per second at
this fixture's 30 ms heartbeat (twice the analysis' 66.7 at the production 60 ms cadence).

## 12. Open questions for the lead before stage 2

- O-2: same-node raft delivery under the new class (remote-only, or supersede W-HID-1's sender clause)?
- O-3: does any node pair rely on raft-triggered reconnects (C13)? Stage 2 should witness reconnect after a closed
  adopted connection without raft traffic.
- Work unit: (e) changes an owner-boundary contract (the router's wire delivery contract). Under R15 that is a quest
  sealed against a measuring red probe; these witnesses are that probe. Who opens it (lead or this line)?
- (h) predicate item 2: count every step on a leader, or only response types? The former is simpler and safe; the latter
  saves more.
- O-1, O-4: owner decisions (section 6).

## 13. Stage 2 (lead rulings of 2026-11-21)

Rulings received: O-2 = one contract for remote and same-node delivery, W-HID-1's sender clause superseded in its own
commit; O-3 = witness the reconnect owner; Q3 = no quest opened here: the line continues under the epic
`operation-integrity-and-reliable-formation` with this record as the contract and the witnesses as the probe (the lead
owns the quest record); (h) a leader re-reads status after every step; (i) and (c1) are NOT implemented pending the
owner (O-1, O-4).

### 13.1 Quest-record inputs (for the lead)

| Field | Value |
| --- | --- |
| Statement | Raft envelopes between replicas travel as one owner-defined consensus delivery class (no ACK, no SERVICE_RESPONSE, no delivery lifetime, no fallback); a follower announces status only on change; one node-level inbound drain per event-loop turn |
| Epic | `operation-integrity-and-reliable-formation` |
| Affected interaction | MessageRouter <-> raft-rs peer delivery (send closure, receiver branch) for partition, message-group and WASM-service groups; the runtime owner's announce and inbound drain |
| Writable paths, step 1 | `src/transport/message-router-consensus-delivery.js` (new), `message-router-delivery-behaviors.js`, `-delivery-delegation.js`, `-inbound-dispatch.js`, `-stats-shutdown.js`, `message-router.js`; `src/constants/transport.js`; `src/raft/raft-packet-utils.js`, `src/raft/constants.js`; the three SEND_TO_PEER sites and three receivers (`partition-service-raft-init-base.js`, `partition-service-entry-apply-base.js`, `partition-service-shared.js`, `message-group-consensus-port.js`, `message-group-service-inbound-ingress-runtime-methods.js`, `wasm-service-consensus-port.js`, `wasm-service-replica.js`); the tests of the deleted raft options and of the direct and fallback paths; W-HID-1 (own commit) |
| Writable paths, steps 2-3 | `src/raft/raft-rs-runtime-owner.js`, `src/raft/raft-rs-status-observation.js`, `src/raft/raft-rs-inbound-timer-custody.js`, `src/raft/raft-rs-operation-port.js` (as needed) |
| Probe | `test/transport/raft-frame-unacknowledged-delivery.test.js`, `test/raft/raft-rs-quiet-ready-cost.test.js`, `test/raft/raft-rs-node-inbound-drain-scaling.integration.test.js`; consumers: `test/transport/raft-frame-liveness-residual.integration.test.js`, `test/transport/raft-frame-reconnect-owner.integration.test.js`, `test/transport/raft-frame-turn-not-held.integration.test.js`; kept red: `test/transport/raft-frame-pair-coalescing.integration.test.js` |
| Exclusions | (i) and `durable-commit-sync.test.js` (O-1), (c1) (O-4), heartbeat cadence, synthesised heartbeats, quiescence, node-level tick driver, CDC currentness |

### 13.2 Step 1, repair (e): the consensus delivery class

Commits on `work/raft-frame-delivery-20261121`: witnesses `d6cfa14ab` and `f0892b478` (before the repair), the repair
`5e5f5ffa8`, the W-HID-1 supersession `8a8b08f79` (own commit), a complexity split of the receipt record (next commit).

**The class (`src/transport/message-router-consensus-delivery.js`).**
- Sender: `MessageRouter.deliver` routes a raft-rs payload (`isRaftTransportPayload`) to `deliverConsensusEnvelope`
  before any lifetime is created. The frame is `{type: CONSENSUS_ENVELOPE, targetAddress, sourceNodeId, payload}`
  (`ROUTER_MESSAGE_TYPE.CONSENSUS_ENVELOPE`, `src/constants/transport.js`). Outcome, answered at once: DELIVERED once
  written to the peer's open connection or handed to this router's own dispatch (same-node peer); FAILED
  (`no_connection`, or `connection_closed` when the write threw or the router is shutting down, or an invalid
  address). No ACK wait, no SERVICE_RESPONSE waiter, no delivery lifetime or deadline timer, no outbound queue, no
  reconnect. Counts `written` / `notWritten` in `getStats().consensusDelivery`.
- Receiver: `routeAuthenticatedInboundFrame` hands a CONSENSUS_ENVELOPE frame to `receiveConsensusEnvelope`
  (no ACK, no SERVICE_RESPONSE); the same function serves the same-node path. It checks the payload shape, finds the
  handler at the address and calls it in a microtask (as the SERVICE_MESSAGE path did). What it could not hand over is
  recorded at the receiver in `getStats().consensusDelivery.receiptRefusals`, keyed `malformed-envelope`,
  `no-handler`, or `handler-failed[:<code>]` (`CONSENSUS_RECEIPT_REFUSAL`), plus a debug log line.
- Where the lead's three receiver-side failures land: a retiring incarnation (`REPLICA_HANDLER_NOT_SERVING`) and a
  message group not initialised throw out of the handler and are recorded as `handler-failed[:code]`; an inbound queue
  overflow never reaches the handler as a throw: the operation port contains it (`containRuntimeThrow`) and the runtime
  owner records it on the group (`inboundRejectedCount`, and a host failure with phase `unexpected-throw`, which holds
  the group for reconstruction - pre-existing, unchanged by (e), routed below as F-3).
- One send closure and one receiver branch: `sendRaftEnvelope(transport, peerAddress, envelope)` and
  `stepRaftEnvelope(port, envelope)` in `src/raft/raft-packet-utils.js`, used by the partition, message-group and
  WASM-service groups. The send closure keeps calling `transport.deliver`, so every test fixture that intercepts raft
  traffic by wrapping `deliver` still sees it.

**Deleted, with the grep proof** (`git grep` at `5e5f5ffa8` over `src test scripts` for `tryDeliverRaftDirect`,
`resolveRaftTransportDeliveryOptions`, `RAFT_TRANSPORT_DELIVERY_OPTIONS`, `RAFT_TRANSPORT_BACKGROUND_DELIVERY_OPTIONS`,
`RAFT_TRANSPORT_READINESS`, `RAFT_DIRECT_DELIVERY`, `'raft:heartbeat'`, `raft:append:entries`,
`buildHeartbeatReplacePendingKey`, `resolveMessageGroupReadinessDeliveryOptions`): two hits only - the stale allowance
for `tryDeliverRaftDirect` in `scripts/check-guideline-navigability-baseline-catch_returns_default.json` (the
navigability checker prints "can be tightened from 374 to 373"; not tightened here because the same run prints
tightening hints for six other patterns that are not this line's, see 13.6) and the "today" sentence in the header of
the (e) witness.
- `tryDeliverRaftDirect` (the direct path) and the raft branch of `deliverRemote`; raft frames no longer reach the
  fallback (queue, ACK wait, response wait, delivery-triggered reconnect).
- In `src/raft/constants.js`: `resolveRaftTransportDeliveryOptions` and the three raft priority option objects, the
  heartbeat replace key, the `raft:append` delivery source and twenty helpers (286 lines).
- `ROUTER_LOG_MSG.RAFT_DIRECT_DELIVERY` and `RAFT_DIRECT_DELIVERY_FAILED`.
- Tests of the deleted contract: `test/raft/message-group-readiness-delivery-priority.test.js` (whole file), the raft
  heartbeat queue cases in `message-router-tail-test-cases.js` and
  `message-router-critical-source-rotation-and-classification.js`, the raft saturation case in
  `message-router-critical-capacity-reservation.js`, the two raft priority cases in
  `partition-service-size-split-transport.test.js` (replaced by one case: the transport receives the address and the
  unchanged envelope and nothing else). Rewritten for the class: the direct and fallback cases in
  `message-router-routing-and-recovery.js` (one CONSENSUS_ENVELOPE frame, no queue, no waiter; FAILED `no_connection` at
  once, no reconnect started) and the router case of `raft-rs-transport-demux.test.js`.

**W-HID-1 supersession (`8a8b08f79`, own commit).** Witness
`test/partition/handler-identity-w-hid-1-retiring-partition-refuses-raft.test.js`, from the raft-rs-full-cutover
epic's transport handler-identity cluster (finding F1; owner review 2026-10-26, item 6:
`solve/epics/raft-rs-full-cutover/evidence/owner-review-2026-10-26/OWNER-REVIEW-2026-10-26.md:55-57`; landed with
0.2.6, `54dd2d7ce`). Superseded clause, quoted: "so the sender's router reports the delivery FAILED with reasonCode
handler_failed (never DELIVERED)". Superseding contract: the retiring incarnation still refuses and no step reaches a
port (kept); the refusal is recorded at the receiving router as `handler-failed:REPLICA_HANDLER_NOT_SERVING`; the
sender's outcome is the write (DELIVERED). The non-raft parts of the witness are untouched.
- Follow-up `393ece640`: the scoped complexity ratchet reported the new `recordReceiptRefusal` at 14 (limit 12); split.
  The first lab run found one more test of the deleted contract
  (`message-group-service-raft-replication-and-cdc.test.js`, the READINESS lane for message-group consensus
  envelopes); it now asserts one delivery through the send closure, envelope unchanged, no delivery options.

### 13.3 Step 1 lab runs (EXECUTED, adams-gamla, check base `0dbed1718c2d…`)

| Run | Head | Files | Result |
| --- | --- | --- | --- |
| `lab/raftframes-s2e-before-r1` | `d6cfa14ab` (before) | R-1, C13 (2 cases), C7 | R-1 green; C13 short outage green, long outage red on its own anti-vacuity (see C13 below); C7 **red** |
| `lab/raftframes-s2e-before-r2` | `f0892b478` (before) | C13 | long outage: measurements below (assertion on "dialer spent its schedule" red: it never is) |
| `lab/raftframes-s2e-after-r1` | `8a8b08f79` (after) | 34 files: the 6 raft-frame witnesses, router, partition, message-group, WASM-service, raft-rs backend and handler-identity tests | 32 pass; (c1) red as kept; `message-group-service-raft-replication-and-cdc.test.js` red (deleted-lane assertion, fixed in `393ece640`) |
| `lab/raftframes-s2e-after-r2` | `393ece640` | the fixed test, (e), W-HID-1, router, demux, C7 | 6 / 6 pass |
| `lab/raftframes-s2e-after-r3` | `393ece640` | four formation-sim production compositions, (h)(i), (b) | bootstrap-phase-one, message-groups, handoff green; `formation-sim-production-partitions.test.js` red (C-1/C-2: 46 runtimes, 138 expected); (h)(i) and (b) red as kept |
| `lab/raftframes-s2e-before-r3` | `d6cfa14ab` (before) | `formation-sim-production-partitions.test.js` | the same red (46 !== 138, C-3 green): **pre-existing, not caused by (e)**; F-5 below |

| Witness | Before (today) | After (e) |
| --- | --- | --- |
| (e) one frame, nothing back | **red**: N = 50; 150 frames (100 back: 50 ACK + 50 SERVICE_RESPONSE), 50 orphaned, 50 deadline timers | **green**: 0 frames back, 0 orphaned, 0 router timers armed, total frames <= N; 50 / 50 envelopes reached the handler; anchor (ordinary request: ACK + SERVICE_RESPONSE, DELIVERED with answer) green |
| (c1) frames per pair per s, G = 4 / 8 / 16 | 396 / 792 / 1584 (99 per group) | 132 / 264 / 528 (33 per group = one frame per raft message, 3x fewer); still proportional to G, **red as kept** (c1 not implemented) |
| C7 turn held by a slow, unconnected peer | **red**: 4003 virtual ms (fallback dial, ACK and response over a 2 s link) | **green**: < 2000 ms (the envelope fails at once, no dial) |
| R-1 slow, raft-silent peer (125 s, 1.5 s link) | green: connection kept, no closure, pings reachable | **green, outcome unchanged** (late pongs and the peer's own keepalive pings are the evidence) |
| C13 short outage (3 s) | green: both ends' own reconnect schedule restores the link | green |
| C13 20-minute outage | link restored 5 ms after the heal by the adopted end's dial; both ends dialing throughout (refused dials 240001 to the dialer's node, 118 to the adopted end's node) | green: restored after the heal, both ends kept dialing, raft flows both ways |
| W-HID-1 | (sender FAILED handler_failed on the local path) | green under the superseding clause |

**Census items closed by step 1.** C1-C3 (R-1 witnessed: outcome unchanged); C4 (raft no longer feeds the streak:
there is no raft ACK path); C5-C7 (DELIVERED keeps its direct-path meaning, FAILED at once; C7 witnessed); C8 (one
contract, W-HID-1 superseded); C9 (receiver record, with the overflow exception in 13.2); C10, C11 (nothing to orphan);
C12 (raft options deleted, grep proof); C13 (owner witnessed, see below); C14 (`consensusDelivery` counts); C16 (tests
migrated). R-2 stays open with (c1).

**C13 - who reconnects.** The routers' own close handling on both ends (`handleConnectionClose` ->
`scheduleReconnect`, `message-router-connection-close-reconnect.js:104-172`, `:202-288`; every closed non-self peer
connection with a remembered address, inbound ones included, `:180-191`). No raft frame was needed in either case,
before or after. Two facts measured that the record did not predict:
- the dialing end's schedule had not ended after 20 virtual minutes (attempt 9, 118 refused dials) although
  `reconnectMaxAttempts` is 10 with a 1.5x backoff from 1 s;
- **F-2 (transport defect, routed to the transport owner, not repaired here, R17):** an adopted inbound connection's
  record carries no `reconnectAttempts` (`message-router-server-lifecycle.js:240-251`); on close it becomes a reconnect
  owner and `scheduleReconnect` computes `reconnectAttempts += 1` on `undefined` = NaN, so the attempt bound never
  holds and the backoff delay is NaN (a host `setTimeout(NaN)` fires after 1 ms): the adopted end re-dials on every
  turn for as long as the peer is unreachable (240001 refused dials in 20 virtual minutes at a 5 ms step). It is also
  what restored the link 5 ms after the heal in both runs.
- Consequence for the residual: were F-2 repaired with the same 10-attempt bound as the dialing end, a pair that
  exchanges only raft traffic would, after both ends' schedules end, be re-joined only by non-raft delivery-triggered
  reconnects, the node-row CDC connect (INSERT only, `src/cdc/cdc-event-handler.js:595`, whose catch comment says "Raft
  will handle retries") or a restarting node's bootstrap mesh dial (`connect-websocket-phase.js:597`). Before (e) a raft
  frame on the fallback path would also have re-dialed. This is not this line's to fix; it belongs with F-2.

**F-3 (runtime, routed to the runtime owner, R17):** an inbound queue overflow (`pushInboundEnvelopeWithBounds`) throws
inside `enqueueStep`; the port contains it as an unexpected throw and the group is held for reconstruction
(`containUnexpectedThrow` -> `groupFailed`, `raft-rs-runtime-owner.js:262-271`, `:199-216`) rather than the envelope
being dropped. Pre-existing, unchanged by (e); it is the opposite of R12 under a burst.

**F-4 (pre-existing slack):** the whole-domain navigability checker prints "can be tightened" for seven patterns at
this base (catch_returns_default 374 -> 373 is this line's: `tryDeliverRaftDirect`); the other six are not this
line's. Not tightened here; for the lead to decide whether one tightening commit should take them all.

**F-5 (pre-existing red, routed):** `test/simulation/formation-sim-production-partitions.test.js` C-1 and C-2 fail at
`d6cfa14ab` (source identical to the base `23344cddc`) exactly as after the repair: 46 partition runtimes on node-0
where 138 (46 x 3) are expected. Not this line's; for the formation-sim composition owner.

## 14. Raft-owner item A: `currentTermApplied` (lead, 2026-11-21; own red-first pair)

**Fact required:** this replica leads and the term of the last entry it applied is its current term (an entry of its
own term applied), monotone within a term.

**Census (at `1d4125c7b`).** Computed in one place, `src/raft/raft-rs-status-observation.js` (`currentTermApplied`,
then `applied > pendingConfIndex`, and `confChangePending = pendingConfIndex > applied` in the same shaper), from the
binding's `status` (`vendor/raft-rs-wasm/src/lib.rs:694-736`: `pending_conf_index`, `st.applied`). raft-rs sets
`pending_conf_index` to the last index at `become_leader` (before the term-start entry; raft-0.7.0
`src/raft.rs:1207-1232`) and raises it to a proposed configuration entry's index, so after the leader applies its own
configuration change `applied == pendingConfIndex` and the old form read false on a quiet group.
- `currentTermApplied` consumers (src): `raft/raft-rs-committed-membership-read.js:278-287` (carried into the
  committed view); `rebalancer/replica-operation-message-group-membership-authorization.js:371, :397` (absence flag,
  leader authority); `rebalancer/replica-operation-message-group-removal.js:149`;
  `rebalancer/replica-operation-message-group-promotion.js:221-231` (`leaderTermApplied`: the native flag OR "the
  recorded learner action is an entry of the leader's term and applied" - a workaround written for exactly this
  defect; after the repair its second branch implies the first, so the consumer owner may delete it; not edited here).
  Tests: the learner-promotion fixture and integration tests, replace-removal fence, fresh-identity tests.
- `confChangePending` consumers (unchanged; its meaning "a proposed configuration change not yet applied" is right
  for them): `partition-participant-release-contract.js:129`, `partition-service-split-accessor-base.js:99,107,650`,
  `partition-participant-transaction-pause.js:122`, `raft-rs-committed-membership-read.js:192`,
  `bootstrap/owners/partition-quorum-authority.js:539`.
- The conf-change admission's own form, `hasAppliedOwnTermEntry` (`raft-rs-conf-change-admission.js:236-248`,
  callers `:497`, `:677`): `appliedTerm === term` when `appliedTerm > 0`, else the fallback `applied >=
  pendingConfIndex`. Not provably the same decision (the fallback says true for a fresh leader whose prior log is
  applied and whose own entry is not), so it is left as it is and reported: whether its fallback can be reached at
  all (a leader with `appliedTerm == 0`) is for its owner.

**Obtained without a binding change.** The runtime owner already keeps the term of the last applied entry
(`group.appliedTerm`: set on every applied slice `raft-rs-runtime-owner.js` `applyCommittedSlice`, on an installed
snapshot `syncTakenSnapshot`, restored at opening by `restoreAppliedTerm` - entry at the applied index, else snapshot
term, else hard-state term). After a restart the restored value is at most the old term and the new leadership's
term is higher, so the field is false until the new term's entry applies.

**Repair (`bc949308f`).** One field, one computation: `currentTermApplied(status, appliedTerm)` = leader and
`appliedTerm === term`; the recorded observation carries `appliedTerm` read in the same turn as its applied index. No
second field, no fallback. The runtime owner did not grow (file-size ratchet; two single-statement ifs folded).

| Run | Head | Result |
| --- | --- | --- |
| `lab/raftframes-cta-red` | `1d4125c7b` (witness only) | **red**: `afterItsConfChangeApplied` false (leader term 1, applied 2 == pendingConfIndex 2); the other four cases as required (fresh leader false/true, re-elected after restart false on its first status, true after its entry) |
| `lab/raftframes-cta-green` | `bc949308f` | **12 / 12 green**: the witness and every consumer test (learner promotion x4 integration, fresh-identity x2, replace-removal fence, conf-state authority, leader self-removal, committed-membership read, admission redrive wakes, fresh learner promotion) |

**What the two other lanes should read (not edited here).**
- Placement owner (`work/placement-owner-repair-20261121`, `replica-placement-owner-tenure.js:52-55`
  `isTermStartApplied`): it reads `ledger.raft.readStatus().currentTermApplied && term === tenure.term`. After this
  repair the field is the exact fact; its comment ("applied past the index it held when it became leader") should say
  "applied an entry of its own term". It should read it from the current observation of section 15
  (`observeCurrentAuthority().currentTermApplied` and `.term`), because `readStatus()` answers the last completed
  entry's status while a turn is pending.
- Owner-fact read (`work/owner-fact-read-20261121`, `partition-service-remote-query-methods.js:219`
  `readAuthorityWitnessOf`): `electionLogApplied: status?.confChangePending === false` is the conf-change fact, not
  the own-term fact (a fresh leader whose prior log is applied reads true before its term-start entry applies). It
  should read `currentTermApplied === true`, from the current observation (section 15).

## 15. Raft-owner item B: a current, non-driving authority observation (lead, 2026-11-21; own red-first pair)

Defect (verify-owner-fact-read.md F1, F2): `readStatus()` -> `readStatusNow` -> `readStatusObserved`
(`raft-rs-runtime-owner.js:1560-1578` at `1d4125c7b`) returns `group.statusObservation`, the status recorded by
`announce` at the end of the last completed drain, whenever a core turn is pending; with delivered inbound it first
enqueues a READ_STATUS turn that steps that inbound. A receiver deciding "still leader" on it can answer "leader at
T" from a core that already follows T+1 (F1) and name an applied index below the rows its connection reads (F2).

**History, and why it is so.**
- `f4f5b5a6e` (2026-09-22, #46, operation-only port): `readStatus()` returned the fresh core read when the group's
  queue was idle and a Promise otherwise; delivered inbound was driven by the read.
- Amendment A7.1 of quest `raft-rs-single-path-partition-cutover` (lead, 2026-09-23,
  `solve/epics/raft-rs-full-cutover/quest-records/raft-rs-single-path-partition-cutover/design.md:262-267`): "readStatus()
  is a synchronous observation, never a Promise ... the frozen snapshot refreshed after the last completed core entry
  when the queue is busy. Measured cause: 22-35% of a busy seed's 135 replicas answered a Promise at any instant (F4),
  which made the sealed seed witness red and left twelve production sites reading undefined." (F4 of the same design
  lists those twelve synchronous `readStatus().x` sites.)
- `1aea11baf` (2026-09-30, #63) implemented A7.1 as `readStatusObserved` ("a read still drives delivered inbound, as
  before"); `54dd2d7ce` (0.2.6 release) and `2d4dfcf60` (2026-11-08, always-promise-port-answers: the answer became a
  settled turn) kept the semantics. The cache answered a typing problem (a Promise where a value was expected), not an
  authority question; no consumer of the time needed currentness mid-turn.

**Per field, during a pending turn.** A turn is pending only at an await of `finishReady` (a peer send, or the
persistence admission), and every Ready the turn took was persisted (`persistReady`, SQLite) before that await; raft-rs
asserts the whole log is persisted when a replica becomes leader (raft-0.7.0 `src/raft.rs:1207-1214`), and the
runtime sends a candidate's vote requests only after persisting its term and vote.

| Field | Core in memory vs durable | Conservative for a receiver that refuses unless leader? |
| --- | --- | --- |
| term | equal at the await for the taken Ready; ahead only while a Ready is held untaken (persistence deferral) | yes: a higher term the core knows makes it refuse |
| role, leader id | current; a deposed leader is a follower in memory at once | non-leader: yes. LEADER: its election is durable, only its term-start entry may not be -> reported `NOT_SETTLED` unless it has applied an entry of its term |
| commit | in memory >= durable; always a quorum fact | yes (never names an uncommitted entry) |
| applied (runtime's) | equal: advanced in the same synchronous run as the apply transaction | exact: the position of the rows |
| own-term applied | from the durable applied term and the in-memory term/role | yes |
| cached `readStatus()` | behind on every field (last completed entry) | **no**: reports leader at T after the core stepped T+1 |

**F-6 (code read, routed to the runtime owner, not witnessed):** after a persistence deferral inside a drain
(`processReadyCycle` -> READY_DEFERRED, a CORE_OK outcome), `drainInbound` keeps stepping the remaining inbound into
the core with the Ready untaken, so the core's in-memory state runs ahead of the durable record by several envelopes
(safety holds: nothing is sent unpersisted). `raft-rs-persistence-admission.js:7-9` says "inbound envelopes stay
queued", which is true only for the first deferral of a drain.

**The operation (`97ba4431b`).** `port.observeCurrentAuthority()` (`RAFT_OPERATION.OBSERVE_CURRENT_AUTHORITY`, on the
frozen port method list) -> the port's `dispatch` (lifecycle admission, closed-port refusal, throw containment) ->
the runtime dispatcher's `observeCurrentAuthority` (not a runtime command, never a turn, never queued) ->
`src/raft/raft-rs-current-authority.js` (new). It enters the core twice (`status`, `has_ready`; both `&self` in
raft-rs, through the runtime owner's `invokeCoreAt`) and reads the owner's own fields; it steps, drains, takes a
Ready, persists, applies, announces, records an observation, reconstructs or replaces nothing. A runtime that is
not HEALTHY answers `runtimeRecoveryOutcome`, a reseed-held group its hold, a RECOVERY_REQUIRED group (including one
awaiting resumption after a replacement) `recoveryOutcome(RECOVERY_DEFERRED)`, a closed or handle-less group the
generation refusal of `invokeCoreAt` - all without starting the work that ends them. A core trap during the read is
recorded as every core trap is (the runtime is marked unhealthy and reported), which the read cannot avoid.

Answer (CORE_OK): `groupId, replicaIdentity, peerId, settled (= !turnPending && !readyHeld), turnPending,
readyHeld, inboundQueued, role, term, leaderPeerId, commitIndex, appliedIndex, appliedTerm, currentTermApplied,
lifecycleIncarnation, runtimeGeneration, runtimeHealth, groupHealth`. `role` and `leaderPeerId` are
`RAFT_AUTHORITY_OBSERVATION.NOT_SETTLED` for a core that leads, has not applied an entry of its term, and is not
settled. That rule is conservative: in the witnessed case (e) the term-start entry was already persisted before the
held send, but nothing in the binding's status names the core's last index, so the observation cannot tell a
persisted term-start entry from a held one without a binding change; it reports NOT_SETTLED until the entry applies
or the core is settled. No binding change was needed for anything else.

`readStatus()` is unchanged. The runtime owner did not grow (file-size ratchet): the observation lives in its own
module; two single-statement ifs at the top of `executeCommand` were folded onto one line each (formatting only).
Contract-required test edits: `operation-port-boundary.test.js` (the port's method list) and the controllable test
double (`test/test-helpers/controllable-consensus-port.js`, the same shape: never pending, a leading double has
applied its term).

Writable paths used by items A and B: `src/raft/raft-rs-status-observation.js`, `src/raft/raft-rs-runtime-owner.js`,
`src/raft/raft-rs-current-authority.js` (new), `src/raft/raft-operation-port-constants.js`,
`src/raft/raft-operation-port.js`, `src/raft/raft-rs-operation-port.js`; tests
`test/raft/raft-rs-current-term-applied.test.js`, `test/raft/raft-rs-current-authority-observation.test.js` (new
witnesses), `test/raft/raft-rs-backend/operation-port-boundary.test.js`,
`test/test-helpers/controllable-consensus-port.js`.

**What `partition-service-remote-query-methods.js` should call (another writer's file; not edited).** Both the
decision and the post-read re-check of `answerLeaderQualifiedRead` (`readOwnRaftStatus()` at `:304` and in
`leaderReadRefusalAfter` `:272-282`, at `ee58d307f`) should read `this.raft.observeCurrentAuthority()` (through the
service's own seam), not `readStatus()`. Mid-turn it may rely on: `outcome === CORE_OK` (anything else refuses);
`role === LEADER` (`NOT_SETTLED` and every other role refuse); `currentTermApplied === true` (the exact own-term fact:
its `electionLogApplied` witness field should be this, not `confChangePending === false`); `term`;
`appliedIndex` (the position of the rows: the statement runs in the same synchronous run, with no await, as the
reviewer verified); `lifecycleIncarnation` and `runtimeGeneration`. It must not use `commitIndex` as the rows'
position (in-memory, may be ahead of applied), and need not use `settled` (a leader with its term applied is
authoritative mid-turn). The redirect (`resolveLeaderAddress`) can stay on `readStatus()`: it needs addresses, and a
stale address only misroutes a retry. Residual that no read closes: a deposed leader whose core has not yet received
the newer term (the documented stale-leader class).

## 16. Raft-owner item C: a proposal enters the core only under the leadership it was submitted under (lead, 2026-11-21; own red-first pair)

Source: the write-kernel tenure-fence line (`work/write-kernel-tenure-fence-20261121`, head `a5bf01004`, record
`reports/write-kernel-tenure-fence-record.md` section 7; executed red `lab/kernel-green-a5bf0100`, witness c).
Mechanism (verified by read here): `executeCommand` queues a PROPOSE behind a busy turn (`group.queuedProposals`,
bytes only); `drainQueuedProposalBatch` later runs `perform(PROPOSE)`, whose `drainInbound` steps the successor's
envelopes first; nothing compared the leadership of submission with the core's at the propose step, and raft-rs 0.7
`step_follower` forwards a MsgPropose to the leader it knows (`raft.rs` ~2312-2322; the binding has no switch,
`lib.rs:457-465`), whose ingress admits a forwarded port proposal (`raft-rs-ingress.js:44-49`, `:168-198`). The entry
committed under the successor's term after its term-start entry. The same holds for an immediate propose whose own
turn's inbound drain deposes the core, and for any propose at a follower.

**Is follower forwarding relied on? No production caller.** Census of `port.propose` callers in `src`:
`partition-service-raft-write-commit.js:88` (the write kernel: leader-gated, now tenure-fenced on its side);
`message-group/message-group-proposal-routing.js:121` (proposes "while it leads", forwards to the leader over its
own application forward otherwise, and already types a CORE_REFUSED from a non-leader as a retryable routing miss,
`:72-88`); `wasm-service/wasm-service-replica.js:490` via `proposeEntry` (writes leader-only, `_handleWrite :433`;
timers and writer completion run on the leader). Conf changes and typed membership operations are refused on a
non-leader by the admission (`raft-rs-conf-change-admission.js:66, :343, :761`), and the ingress refuses a forwarded
non-NORMAL entry anyway. Transfer-leader forwarding (MsgTransferLeader) is a different message and is untouched;
read-index is not exported by the binding. Tests: the local-log guard's W4
(`local-log-guard-correct-followers.test.js`) proposed at a follower precisely to produce a forwarded MsgPropose
for the guard to see; that case now asserts the refusal (contract change, same commit). The randomized election
safety test proposes at random replicas but asserts only safety, not that a follower's proposal commits.
Now unreachable from this system's own senders (not removed here; for the raft owner): the ingress admission of a
forwarded MsgPropose and the local-log guard's "a forwarded proposal with entries is legitimate" branch.

**The rule (stated once, `src/raft/raft-rs-proposal-term.js`, new).** `withSubmittedTerm`: every proposal, queued
or immediate, records the core's term as last announced (`group.lastStatus.term`, the status every consumer's
leadership tenure derives from; none before the first announcement). `proposeUnderSubmittedTerm`: at the propose
step itself - after the turn's inbound drain, and for each member of a queued batch - one `status` core read; a core
that does not lead, or leads a term other than the submitted one, never proposes: the proposal is answered with the
core's own dropped-proposal refusal (`CORE_REFUSED`, reason `propose: raft: proposal dropped`, phase `propose`,
built by the runtime's one core-refusal answer `coreCallFailure`, then `answerRefusedProposal` as for any refused
proposal) and nothing enters the log or is forwarded. Note: the core's own refusal is `retryable: false`; I kept
that shape exactly rather than inventing a retryable variant - the write kernel types it as "not proposed" and the
message group as a routing miss. Cost: one `status` core entry per proposal (per batch member).

Runtime owner: `invokePrimitive` routes the one `propose` primitive through the rule (`performCommand`,
`finishBatchedPropose`); `PROPOSE_COMMAND` now comes from the new module; the deferred-batch path uses
`settleBatchTurn` like the admitted one (same answers for a settled turn; a pending rejection now rejects the
batch's deferreds instead of leaving them unsettled). No growth (file-size ratchet).

**Item C runs.** Red `lab/raftframes-pf-red` (adam-laptop, `adfbbed6a`): witness c RED exactly as on the kernel
branch (the proposal submitted while queued-fence-a led at term 1 answered `CORE_OK/drained` and committed at index
3, term 2 on the successor queued-fence-c; a ended as c's follower at term 2); the follower witness RED (the
follower's propose answered `CORE_OK/drained`, 1 MsgPropose forwarded, committed at index 2, term 1 on all three
replicas); W4 green (still the forwarding variant at that head).

## 17. Lab runs for items A and B (recap; check base `0dbed1718c2d...`)

| Run | Host | Head | Result |
| --- | --- | --- | --- |
| `lab/raftframes-cta-red` | adams-gamla | `1d4125c7b` | A red as recorded in 14 |
| `lab/raftframes-cta-green` | adams-gamla | `bc949308f` | A: 12 / 12 green |
| `lab/raftframes-cao-red` | adams-gamla | `90021de24` | B: 4 / 4 red (the port has no current authority observation; every case reached its observation point, so the scenarios themselves ran) |
| `lab/raftframes-cao-green` | adam-laptop | `97ba4431b` | B: **18 / 18 green**: the B witness (a)-(e), A's witness, the port boundary and lifecycle audits, construction seam, committed-membership read, leadership-transfer single path, admission redrive, runtime opening refusal, the nine controllable-double consumers (message-group x8, WASM replica) |

**Item C, the fix and its consequences.** Fix `f94291812` (pushed). Its focused lab run
`lab/raftframes-pf-green` (adam-laptop, 29 files) was 26 / 3: both C witnesses, W4, the local-log guard refusals
and sender admissibility, randomized election safety, O1 proposal ingress, transfer-leadership anchors and write
path, conf-change self-removal and deferral, power loss, durable ready loop, the port audits, A's and B's witnesses,
message-group replication and service, WASM replica: green. Three red, all green at `adfbbed6a`
(`lab/raftframes-pf-red-consumers`): `inbound-drain-owned-timer` case 7 (held follower B's turn on the send of a
proposal B forwarded - setup only), `transfer-leadership-drain-order` case 7 and
`runtime-ordering-native-companion` D3 V-before-proposal (both asserted that a deposed core's proposal reaches
native propose; the answers they assert are unchanged). Updated in their own commit (`d3edaa08c`, see 18);
its lab run `lab/raftframes-pf-tests` (adam-laptop, `d3edaa08c`): 6 / 6 green (the three updated witnesses, both C witnesses, W4).

## 18. HANDOVER (2026-11-21; the frame steps go to a successor)

**Where.** Worktree `/mnt/data/peter/projects/.worktrees/raft-frame-delivery-20261121`, branch
`work/raft-frame-delivery-20261121`, head `d3edaa08c`, everything pushed. Lab: `tools/focused.mjs <sha40>
<host> 0dbed1718c2d07c1fcb8bbe56b87ac41763c262c <out> <files>`; before each run pick a READY and FREE host among
tv-dator, adam-laptop, adams-gamla; "not a ready lab machine" is a runner failure: switch host. Commits go through
`tools/heavy.sh`; the pre-commit hook regenerates `solve/changes/global-owner-debt-inventory/inventory.json`,
`test/shards/*.json`, `src/raft/INDEX.md` into each commit (an extraction should regenerate them, not cherry-pick
them blindly). `src/raft/raft-rs-runtime-owner.js` is an oversized file under a no-growth ratchet: put new logic in
its own module (as `raft-rs-current-authority.js`, `raft-rs-proposal-term.js`).

**Commits of this line, in order.** Stage 1 witnesses up to `f1265c5ca`; step 1 (e): witnesses `d6cfa14ab`,
`f0892b478`, repair `5e5f5ffa8`, W-HID-1 supersession `8a8b08f79`, follow-ups `393ece640`; item A `1d4125c7b` (red)
+ `bc949308f`; item B `90021de24` (red) + `97ba4431b`; item C `adfbbed6a` (red) + `f94291812` + `d3edaa08c`
(witness updates). A and B are being extracted by another agent onto `work/raft-owner-authority-20261121`; C's three
commits touch only `src/raft/**`, `test/raft/raft-rs-backend/**` and generated metadata.

**Done and executed.** Step 1 (e) (section 13; `lab/raftframes-s2e-*`), items A (14), B (15, 17), C (16, this
section). Not yet reported to the lead in a hand-back: step 1 and items A, B, C go in this agent's final report.

**Step 2 - (h) status announced only on change (NOT STARTED).** Ruling: a leader re-reads status after EVERY step;
a follower announces only when the Ready changed term, leader, commit, applied or configuration; no reused
observation object that can leave `SHAPED_STATUS` holding stale delivery/refusal/health fields. Red witness
`test/raft/raft-rs-quiet-ready-cost.test.js` (stage 1 `lab/raftframes-stage1-r2`: 100 quiet heartbeats -> status 100,
conf_state 100 core entries on the follower; 100 quiet ticks -> status 100, conf_state 100; the commit-advancing
anchor green). Required greens: quiet-heartbeat and quiet-tick announces 0 on a follower; learner catch-up
acknowledgement and the promotion proof still see leader progress at once (the message-group learner promotion
integration tests, `message-group-fresh-learner-promotion.test.js`); the anchor stays at exactly one. Watch: the first
(h)(i) case asserts `transactions: 0` and the status entries in ONE `deepEqual` (`:263-269`); (i) is excluded (O-1),
so that case stays red after (h) unless the assertion is split in its own witness commit with the reason. Items B and
C add core reads of their own (B only when called; C one `status` per proposal on the leader) - the follower-side
witness does not see them.

**Step 3 - (b) one node-level inbound drain per event-loop turn (NOT STARTED).** Ruling and invariants: section 5.1
(per-group lifecycle admission, turn queue and FIFO, <= 32 envelopes per group per pass, a held group waits alone,
shared-runtime wake debt, one owned wake per admitted envelope, a per-pass budget). Red witness
`test/raft/raft-rs-node-inbound-drain-scaling.integration.test.js` (stage 1: zero-delay timers on the measured node
272 / 544 / 1088 for G = 8 / 16 / 32, all nodes 816 / 1632 / 3264, mismatched 0, fairness 32). Required: the scaling
case, fairness, the held-group case; `inbound-drain-owned-timer.test.js` is the custody witness to keep green (its
case 7 now holds B's turn on a heartbeat reply, `d3edaa08c`).

**Kept red, excluded.** (i) empty Ready (O-1); (c1) `raft-frame-pair-coalescing.integration.test.js` (O-4;
132 / 264 / 528 frames per pair after (e)); heartbeat cadence, synthesised heartbeats, quiescence, node-level tick
driver, CDC currentness.

**Unverified / open.** F-2 (adopted-connection NaN reconnect, transport owner) and the C13 residual tied to it; F-3
(inbound overflow holds the group); F-5 (formation-sim partitions composition red at base); F-6 (persistence
deferral mid-drain, code read only); the no-growth folds in the runtime owner are formatting only but were not
separately witnessed; no full corpus or cone run on this branch (focused sets only); the ingress admission of a
forwarded MsgPropose and the local-log guard's forwarded-proposal branch are now unreachable from this system's own
senders (removal is the raft owner's call); `test/test-helpers/controllable-consensus-port.js` is changed here (B)
and on `work/write-kernel-tenure-fence-20261121` (+34 lines): expect a merge conflict.

**Waiting on the owner.** (1) The empty-Ready transaction, (i): superseding the `durable-commit-sync.test.js`
clause for the empty Ready shape (section 4.3, O-1). (2) The slow-peer policy for coalescing, (c1): write regardless
versus refuse a batch above a buffered-amount bound (section 5.2, O-4). (3) The W-HID-1 supersession: done on the
lead's ruling in its own commit `8a8b08f79` (section 13.2); the owner-review witness clause it supersedes
(`OWNER-REVIEW-2026-10-26.md:55-57`) still needs the owner's acknowledgement.

**What each consumer should call.**
- Item A (`currentTermApplied` = leader whose last applied entry is of its current term): the placement owner's
  `isTermStartApplied` (`replica-placement-owner-tenure.js:52-55` on `work/placement-owner-repair-20261121`) reads
  `observeCurrentAuthority().currentTermApplied` and `.term === tenure.term`; the owner-fact read's
  `electionLogApplied` (`partition-service-remote-query-methods.js:219` on `work/owner-fact-read-20261121`) is
  `currentTermApplied === true`, not `confChangePending === false`; the promotion consumer's second branch
  (`replica-operation-message-group-promotion.js:221-231`) is now redundant; the conf-change admission's
  `hasAppliedOwnTermEntry` fallback is not provably the same decision (left; for its owner).
- Item B (`port.observeCurrentAuthority()`): `answerLeaderQualifiedRead` decides and re-checks on it; it relies on
  `outcome`, `role === LEADER` (`NOT_SETTLED` refuses), `currentTermApplied`, `term`, `appliedIndex` (the rows'
  position), `lifecycleIncarnation`, `runtimeGeneration`; not on `commitIndex` as a position; the redirect can stay
  on `readStatus()`.
- Item C: nothing new to call. A proposal answered `CORE_REFUSED`, reason `propose: raft: proposal dropped`, phase
  `propose`, `retryable: false` was not proposed and nothing was forwarded: the write kernel already types it so;
  message groups treat it as a routing miss when the replica does not lead. A follower never forwards a proposal.

## 19. F-2 and the reconnect owner (successor writer, 2026-11-21; lead brief + verifier conditions)

Successor writer on the same worktree; start head `d3edaa08c` (clean). Rule set: `docs/steering/rules.md`
(last_reviewed 2026-11-13), `test/guidelines/INDEX.md`, this record 1-18, `idle-raft-cpu-cost.md`, `lead-rulings.md`
(raft frame entries), `verify-consensus-delivery-class.md` (findings 1-2, received mid-task through the lead).

### 19.1 The defect (VERIFIED by read at `d3edaa08c`)

- Path. `message-router-server-lifecycle.js:240-251` creates the inbound record with no `reconnectAttempts` (nor
  `reconnectTimeout`, `reconnectDueAt`, `ackTimeoutStreak`, `lastAckAt`, `lastAckTimeoutAt`, `observedAddress`,
  `isSelfConnection`, `pingInterval`, `missedPings`). IDENTIFY binds its address (`inbound-dispatch.js`
  `bindIncomingConnectionAddress`, `:204-209`) and adoption re-keys it to the peer (`:237-253`, `:394-419`). On close,
  `resolveConnectionCloseDisposition` (`close-reconnect.js:172-196`) gives any non-self record with an address the
  RECONNECT disposition, `:161-169` turns the inbound record into an outbound reconnect owner, and `scheduleReconnect`
  (`:224-231`) computes `undefined + 1 = NaN`: the bound `reconnectAttempts >= reconnectMaxAttempts` (`:292`) never
  holds and the delay `1000 x 1.5^NaN = NaN` runs at once (host `setTimeout(NaN)` = 1 ms; virtual clock: next step).
  Each failure logs `Reconnection failed` at ERROR and re-schedules (`:258-267`).
- Sibling entry to the same NaN: the ACK-timeout quarantine replacement record copies
  `reconnectAttempts: activeConnection.reconnectAttempts` (`reconnect-behaviors.js:689-711`); quarantining an adopted
  inbound connection arms a NaN owner too.
- Siblings masked, not live: every other reader of the missing fields defends itself (`|| 0` / `?? 0`:
  `lifecycle-methods.js:48`, `:365`; `reconnect-behaviors.js:609-610`, `:640`; `close-reconnect.js:377`;
  `delivery-behaviors.js:565-568`; `stats-shutdown.js:96`; `admin/admin-preflight-snapshot.js:567`). Only
  `scheduleReconnect`'s increment did not.
- Which schedule triggers it on a real cluster: one end of every node pair holds the adopted inbound record (the
  end that did not dial first, or the larger node id of a simultaneous dial, `connection-authority.js:304-349`).
  When that peer's process dies while its host stays up (crash, kill, rolling restart, container restart), dials are
  refused at once and the survivor re-dials about every millisecond with one ERROR line each, until the peer
  returns. A blackholed peer costs one dial per connect timeout instead.
- Predates this line: introduced by `a662f2b10` (2026-06-07, "Fix 1: a closed connection with a remembered dial
  address now schedules a reconnect even when isIncoming"); the inbound record had no `reconnectAttempts` then
  either (`message-router-segment-1.js:427-435` at that commit). Step 1 did not expose it (rate and trigger
  unchanged) but made the system depend on it (19.2). `router-server-manager.js:248-256` is a second, older copy of
  the inbound record creation with the same gap; it has no production importer (its own test and
  `check-current-capabilities.js` only): routed, not edited (R17).
- Real-cluster count (GCP run 1 of `f580579a5`, full node logs
  `.playback/report/.full-logs/fresh-formation-user-table-routability/*.log.gz`): during formation 0 occurrences
  on all three nodes (no peer connection closed before teardown). At teardown, node `fab780c9` (which had adopted
  `868fba57`'s inbound connection at 12:15:04.657, `Re-keyed incoming connection`) logged **51 `Reconnection
  failed` for `868fba57` in 517 ms** (12:24:39.718 - 12:24:40.235, about 99 per second) until its own process
  exited; its outbound record for `751f5575` failed once (the normal schedule). `868fba57`: 0; `751f5575`: 0 (its
  process stopped first). So F-2 cost the formation measurement nothing; it burns CPU and log on any node loss.

### 19.2 Why bounding F-2 alone is wrong (verifier finding 1, lead ruling)

After step 1 a raft envelope to a node without an open connection fails `no_connection` and never dials. The
router's own schedule is then the only owner that re-joins two live members after an outage: the dialing end stops
after `reconnectMaxAttempts` (10 attempts, about 113 s), and the adopted end kept going only through F-2. With F-2
merely bounded, two live members that exchange only raft are disconnected for good after an outage longer than
113 s. Hence the repair: one record initializer (F-2) together with an owned, unending reconnect for members.

### 19.3 The reconnect owner (design)

- Membership: the existing node address resolution owner, `router.resolveNodeAddress` (production:
  `createNodeWebSocketAddressResolver`, `bootstrap/shared/message-router-setup.js:63-85`: the NODES row and the ACTIVE
  WebSocket endpoint of the node's current incarnation, `node-address-resolution.js:375-403`, `:475-482`). The same
  answer every delivery and reconnect address already resolves through (`resolveCanonicalReconnectAddress`). No second
  membership notion: `connectionAuthorityOwner.isConnectionMember(nodeId)` is that answer being non-null. A router
  without a resolver knows no member.
- Schedule: attempt n waits `reconnectIntervalMs x reconnectBackoffMultiplier^(n-1)` for the first
  `reconnectMaxAttempts` attempts (unchanged); later attempts wait as long as the last of those, the cap:
  `1000 x 1.5^9 = 38443 ms` with the defaults (no new configuration). A member is dialed past
  `reconnectMaxAttempts` at the cap, for as long as it is a member; a non-member stops after `reconnectMaxAttempts`
  with the existing `wait_bound_spent` report. Stops also on shutdown, when the record is retired or superseded, and
  when a connection is established (the count resets).
- Which end: both ends of a closed connection own a schedule (as since `a662f2b10`); the existing simultaneous-dial
  resolution keeps one connection (`resolveIncomingConnectionAdoption`'s deterministic tie-break and newer-boot rule;
  `establishConnection`'s live-wins check).
- Counted and visible: `reconnectAttempts` per record (in `getStats().connections` and the delivery diagnostics),
  `reconnectDueAt`, one `Reconnection failed` ERROR per failed attempt (at most one per peer per 38 s at the cap).
- Reference systems (INFERRED: from their designs as I know them, not re-read for this record): etcd's rafthttp keeps a stream reader per member that re-dials until the member is removed
  (retry every 100 ms); CockroachDB re-dials on the next raft message through a per-node circuit breaker; TiKV
  reconnects lazily on send with backoff. None abandons a member after a fixed number of attempts. Lagrange's raft
  traffic no longer dials (step 1), so the member rule belongs to the scheduled owner.

### 19.4 Commits and runs (item 1)

| Commit | What | Run | Result |
| --- | --- | --- | --- |
| `ca6071d4d` | F-2 witness `test/transport/router-adopted-connection-reconnect-schedule.test.js` (two routers, A dials B, B adopts; sever plus dial blackout; 30 virtual s; policy-agnostic: the adopted end follows the same declared schedule as the dialing end, no re-dial within `reconnectIntervalMs`, a finite attempt count) | `lab/raftframes2-f2-red` (adams-gamla) | **red**: dialing end 6 dials at 1005 / 2505 / 4755 / 8130 / 13192 / 20788 ms (the declared schedule), attempts 7; adopted end **5999 dials** (one per 5 ms drive step), shortest gap 5 ms, attempts NaN |
| `aaba000fb` | C13 long-outage clause restored (verifier finding 1, lead (c)): outage of 20 min, longer than the bounded schedule by more than one capped delay; both ends dial until the heal (last dial within one cap of it), never more often than the capped schedule permits; the link returns within one cap of the heal; raft alone resumes both ways; numbers printed with `t.diagnostic` | `lab/raftframes2-c13-red` (adams-gamla) | short case green; long case **red**: schedule interval 1000, 10 attempts, bounded span 113330 ms, cap 38443 ms, permitted 39 dials in the outage; dialing end `rfr-a` **10 dials, CLOSED at the heal, last dial 1086672 ms before it**; adopted end `rfr-b` **240001 dials** (NaN, last 5 ms before the heal); the link came back 5 ms after the heal only through the NaN dialer; raft 4 / 4 after |
| `9c3604ed9` (local ref `probe/f2-bounded-only`, NOT for merge, never pushed) | F-2 bounded alone: the one record initializer, no reconnect owner | `lab/raftframes2-probe-bounded` (tv-dator; adams-gamla and adam-laptop "not ready": runner failures) | F-2 witness **green**; C13 short green; C13 long **red, the hazard**: both ends 10 dials, both CLOSED at the heal, last dial 1086672 ms before it, **the link never came back (`restoredAfterMs` null) and raft received 0 / 0 after the heal**: two live members permanently disconnected (the reason the reconnect owner exists) |
| `f792423ff` | **Repair**: `createPeerConnectionRecord` (`src/transport/message-router-connection-record.js`) at the four production creation sites (inbound `server-lifecycle`, `connectToNode`, `ensureReconnectOwnerConnection`, the quarantine replacement); `reconnectDelayMs` (cap = last bounded delay) and the member rule in `resolveReconnectDisposition`; `connectionAuthorityOwner.isConnectionMember` | `lab/raftframes2-f2-green` (tv-dator), 15 files | 14 / 15: F-2 witness **green**, C13 short and long **green**, (e), R-1, C7, W-HID-1, demux, `message-router.test.js` (499), quarantine guard, ping wait bound, incarnation fence, cold-reconnect grant, transport cleanup, delivery-deadline liveness green; **`message-router-endpoint-address-change-redial` case 2 red** (green at `aaba000fb`, `lab/raftframes2-redial-before`): see 19.5 |

### 19.5 A test that passed through F-2

`message-router-endpoint-address-change-redial.test.js` "recovers connectivity to a peer that restarted on a new
address" kept the OLD node-b alive and re-dialing under the same boot incarnation as the new node-b, only deaf
(`routerB.handleMessage = () => {}`). Mechanism (INFERRED from the code and the two runs; the failure state is
node-a's record `reconnecting` at `ws://localhost:19821`, the old node-b's advertised address, so node-a had just
lost a connection adopted from the old node-b): node-a's keepalive severs the deaf link; both ends re-dial on the
same first backoff (100 ms in that test); the old node-b's dial reaches node-a while node-a's record is
reconnecting and is adopted (`resolveIncomingConnectionAdoption`: a non-connected existing record is replaced);
node-a's own dial to the new address then opens against a live record and drops itself
(`establishConnection`'s live-wins check); the cycle repeats on every keepalive sever. Before the repair node-a's
adopted record re-dialed at once (NaN) and always reached the new address first. A restarted process's old
incarnation dials no one: the world now says so (`routerB.scheduleReconnect = () => {}`, commit below).
**Residual for the transport owner (not changed here):** two live processes claiming one node id under one boot
incarnation can keep the adopting end on the wrong one; real restarts carry a new boot incarnation, and the
adoption has no canonical-endpoint fence (it adopts an IDENTIFY whose advertised address the resolver does not
name while its own record is reconnecting).

### 19.6 Router message-table members (lead, 2026-11-21, own pair)

Census (read-only scan of every `<TABLE>.<member>` reference in `src` and `test` against the tables of
`src/constants/transport.js` and the shared router vocabulary): three undefined members, no other
(`test/diagnostics/lease-liveness-decision-grid.js` `CONNECTION_STATE.READY` is that file's own table).
`ROUTER_ERROR_MSG.addressInUse` (`router-server-manager.js:196`: an in-process port clash threw a TypeError),
`ROUTER_LOG_MSG.CONNECTION_PING_TIMEOUT_SKIPPED_ALIVE` (`close-reconnect.js:391`) and
`ROUTER_LOG_MSG.PING_TIMEOUT_SATISFIED_BY_INBOUND` (`peer-liveness.js:95`): both INFO lines logged with no message,
and their test passed vacuously (it filtered lines on `message === undefined`).

| Commit | What | Run | Result |
| --- | --- | --- | --- |
| `f5bcbe857` | witnesses: `router-in-process-address-in-use.test.js` re-created from `work/line-regression-causes-20261121` `e5cdc7770`; the ping test asserts the INFO line carries a message | `lab/raftframes2-msg-red` (tv-dator) | **red**: address-in-use (TypeError); ping cases 3 and 4 |

Item 1 continued:

| Commit | What | Run | Result |
| --- | --- | --- | --- |
| `97978ad99` | `message-router-endpoint-address-change-redial`: the old process dials no one (19.5) | `lab/raftframes2-transport-all` (tv-dator): every `test/transport/*.test.js` (67 files) | 62 / 67. Red: the two 19.6 witnesses (fixed by the next commit); (c1) `raft-frame-pair-coalescing` (kept, O-4); `node-identity-separation.property` and `node-registration-creates-endpoint.property` (**F-7**, below). Everything else green, the redial case included |

**F-7 (pre-existing red, routed, not this line's):** `test/transport/node-identity-separation.property.test.js` and
`node-registration-creates-endpoint.property.test.js` fail with "Failed to register node: The proposal was accepted
into consensus and its outcome is not known to this replica; a retry with the same entryId is idempotent"
(`node-registration-owner.js:106`). Red at `d3edaa08c` (`lab/raftframes2-props-d3edaa08c`) and at the branch base
`23344cddc` (`lab/raftframes2-props-base`), so neither this line's transport work nor items A-C caused it. Owner: the
node-registration / write-kernel outcome owner.
| `7039f9018` | 19.6 fix: the three members at `src/constants/transport.js` | `lab/raftframes2-msg-green` (adams-gamla) | **green**: address-in-use, ping wait bound (30), router-server-manager (40) |

Stale comments named by the verifier (not edited; outside this writer's paths, `src/cdc/**` and `src/partition/**`):
`src/cdc/cdc-event-handler.js:615-616` "Raft will handle retries and leader election" -> suggested "The router's
reconnect owner re-dials a member peer at its capped cadence (message-router-connection-close-reconnect.js)";
`src/partition/partition-service-entry-apply-base.js:360-361` "so the sender never records it as taken (F1)" ->
"the receiving router records the refusal (`consensusDelivery.receiptRefusals`); the sender's outcome is the write".
No active 2026-11-21 branch touches the first; the second is touched by most of them (it would conflict).
