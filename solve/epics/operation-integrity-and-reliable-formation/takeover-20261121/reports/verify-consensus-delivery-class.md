# Verification: raft envelopes as one consensus delivery class (step 1 (e))

Independent, read-only verification. No test was executed here; every execution fact below is read from the
author's lab outputs. Nothing was written in any git worktree.

| Item | Value |
| --- | --- |
| Subject | `work/raft-frame-delivery-20261121`, transport change only: `23344cddc..393ece640` (`f1265c5ca`, `d6cfa14ab`, `f0892b478`, `5e5f5ffa8`, `8a8b08f79`, `393ece640`) |
| Not judged | `1d4125c7b` .. `d3edaa08c` (raft-owner items A, B, C) |
| Read | `git diff 23344cddc 393ece640 -- src test`; base and head versions of the router files named below; the author's record sections 1-13, 18; `idle-raft-cpu-cost.md`; lab `raftframes-stage1-r2`, `raftframes-s2e-before-r1..r3`, `raftframes-s2e-after-r1..r3` |
| Labels | VERIFIED = read in source at the named commit, or read in a named lab file. INFERRED = my reasoning, not executed. |

## Verdict

**APPROVE-WITH-CONDITIONS** for merging through `393ece640` into the integration candidate.

The class itself is sound: one frame, no answer, an immediate outcome, one closure and one receiver branch, no
re-entrant step, no sender-side decision lost. I found no safety defect. The conditions are about what the old
path did implicitly for **connection establishment**, about an evidence gap, and about the owner's
acknowledgement of the superseded witness clause.

Conditions (detail in the findings):

1. The owner acknowledges the W-HID-1 supersession (finding 3) and the lost raft-triggered dial (finding 1).
2. The F-2 routing record states that F-2's repair must bring an unending reconnect owner with it, and must
   restore the original C13 clause as its required green (finding 1). Without that note, the obvious F-2 fix
   turns finding 1 into a permanent link loss.
3. The suites in the last section run on the merged tree, with `getStats().consensusDelivery` captured per node
   in the formation run (finding 4).
4. The three commits `5e5f5ffa8`, `8a8b08f79`, `393ece640` merge as one unit: W-HID-1 is red at `5e5f5ffa8`
   alone, and one message-group test is red until `393ece640` (VERIFIED, `raftframes-s2e-after-r1.log:16`).

## Findings

### 1. Raft traffic no longer dials; after a long outage the link returns only because of defect F-2 (condition)

What the old path did (VERIFIED at `23344cddc`, `src/transport/message-router-delivery-behaviors.js:296-360`): a
raft envelope to a node without an open connection took the fallback, which resolved a reconnect address and
dialed (`tryDeliverAfterReconnect`). That covered two cases the scheduled reconnect does not:

- **A spent schedule.** The dialing end's schedule ends after `reconnectMaxAttempts` (10). After that,
  `ensureNodeConnection` allows one delivery-triggered dial per `AD_HOC_RECONNECT_COOLDOWN_MS` (10 s)
  (`message-router-reconnect-behaviors.js:24`, `:362-369`). Raft heartbeats were the steady source of those
  deliveries. Measured before the repair: the dialing end made 118 dials in a 20-minute outage, about one per
  10 s (`raftframes-s2e-before-r2.log:659`, head `f0892b478`).
- **A pair that never connected.** Measured before the repair: the C7 world's candidate held no connection to
  the third node and the raft send dialed it at 22 ms (`raftframes-s2e-before-r1.log:704`, `dials`).

After (e) (VERIFIED, `src/transport/message-router-consensus-delivery.js:89-93`): no open connection is FAILED
`no_connection` at once and nothing dials.

Who dials now (VERIFIED by read):

- Both ends' close handling: `handleConnectionClose` -> `scheduleReconnect`
  (`message-router-connection-close-reconnect.js:104-172`, `:202-288`), for any closed non-self connection with a
  remembered address, adopted inbound ones included (`:180-191`; the address is bound at
  `message-router-inbound-dispatch.js:208`). The dialing end is bounded at 10 attempts (`:292`).
- The adopted end never stops, **only because of F-2** (finding 2).
- A joiner's bootstrap mesh dial (`src/bootstrap/phases/connect-websocket-phase.js:597`) and the node-row CDC
  connect (`src/cdc/cdc-event-handler.js:595`), each followed by the same bounded schedule on failure
  (`message-router-connection-lifecycle-methods.js:313-319`).
- Any non-raft delivery to that node (the fallback is unchanged for non-raft).

Minimal schedule for the gap: X dialed Y. The link is down for longer than X's schedule (10 attempts, 1 s x 1.5
backoff plus connect timeouts) while both processes stay up. The pair exchanges only raft. X's record is CLOSED
and X never dials again. Y re-dials only through the NaN defect. Repair F-2 with the same 10-attempt bound and
neither end dials: every raft envelope between X and Y fails `no_connection` until some non-raft delivery or a
restart happens.

Evidence weakness (VERIFIED): the C13 long-outage clause was rewritten **inside the repair commit** `5e5f5ffa8`.
The original asserted the outage outlasted the dialing end's schedule. The new one asserts each end made more
than zero dials during the outage (`test/transport/raft-frame-reconnect-owner.integration.test.js:147-149`),
which the first ten scheduled attempts satisfy. The green after-run prints no numbers
(`raftframes-s2e-after-r1.log:297`). The record's table row "both ends kept dialing" is therefore measured
before (e) and not after it. INFERRED: after (e) the dialing end stops after ten attempts, and the link came
back through the adopted end's NaN re-dial, as it did before (`dialsAfterHeal` from `rfr-b`, before-r2).

The author states the consequence himself (record section 13, "Consequence for the residual"). I agree with it
and raise it from a note to a merge condition, because the defect that currently hides the gap is one that must
be repaired.

Also stale after (e): `src/cdc/cdc-event-handler.js:615` "Raft will handle retries and leader election". Raft no
longer retries a connection.

### 2. F-2: an adopted inbound connection re-dials about every millisecond (pre-existing, severe, not introduced here)

VERIFIED by read: the inbound record is created without `reconnectAttempts`
(`src/transport/message-router-server-lifecycle.js:240-251`). On close it becomes a reconnect owner
(`message-router-connection-close-reconnect.js:164-171`). `scheduleReconnect` computes
`reconnectAttempts += 1` on `undefined` (`:224`), so the delay is NaN (`:225-230`, a host `setTimeout(NaN)` fires
after 1 ms) and the bound `reconnectAttempts >= reconnectMaxAttempts` (`:292`) never holds.

VERIFIED pre-existing by measurement: at `f0892b478`, whose `src/` equals the base, the adopted end shows
`attempts: null` and 240001 refused dials in 1,200,010 virtual ms at a 5 ms step
(`raftframes-s2e-before-r2.log:659`).

Minimal real schedule (INFERRED for real sockets): joiner J dials seed S, so S holds the adopted record. J's
process dies while its host stays up, so dials are refused at once. S then dials J about every millisecond,
with one error-level log line per attempt, until J returns. A blackholed peer costs one dial per connect
timeout instead. On a 1-CPU node this is a real CPU and log burn during any kill or rolling-restart window. It
is not triggered by a three-node formation in which no node is lost.

Does (e) expose it? No: the rate and the trigger are unchanged. But (e) makes the system depend on it
(finding 1). It should not block this merge. It should be repaired next, together with the reconnect owner.

### 3. The W-HID-1 supersession: what is given up (owner acknowledgement required)

- **What the clause protected** (VERIFIED, `solve/quests/retained-seed-original-handoff/log.ndjson:151`, finding
  F1 of the handler-identity cluster): a retiring partition incarnation, between consensus close and handler
  retirement, could answer `acknowledged: true` for a raft envelope it drops, so "the sender's peerDelivery
  status then shows DELIVERED; status truth only, the router already ACKed". The repair made the handler throw
  and the witness asserted the sender's FAILED `handler_failed` through `MessageRouter.deliver` LOCAL.
- **Its standing**: owner review 2026-10-26 item 6 approved the handler-identity cluster "prioritized by whether
  it can affect the wrong handler incarnation" (`OWNER-REVIEW-2026-10-26.md:55-57`). The witness landed with
  0.2.6. The clause is the witness's own header text; I found no separate sealed receipt naming it.
- **The superseding clause is weaker for the sender and equal for the receiver.** Kept: the retiring incarnation
  refuses and no step reaches a port (`port.steps.length` unchanged, VERIFIED in `8a8b08f79`). Given up: the
  sender-visible failure. The sender now records DELIVERED for an envelope the retiring incarnation dropped,
  which is exactly the status untruth F1 named, on the same-node path. Replacement: the receiving router counts
  `handler-failed:REPLICA_HANDLER_NOT_SERVING` in `getStats().consensusDelivery.receiptRefusals`, plus a debug
  log line. Nothing surfaces that count beyond `getStats()`.
- **Why the loss is small**: on the remote path the sender never saw this failure (the error response was
  already orphaned, VERIFIED at base `message-router-delivery-behaviors.js:265-269`). No `src/` decision reads
  the peer delivery observation: `peerDelivery` is written in `raft-rs-peer-delivery.js` and read only by
  `raft-rs-status-observation.js:61` (VERIFIED by grep at `393ece640`). The one behavioural consumer,
  `failedPeers`, only drops the rest of one Ready's messages to that peer.
- Follow-ups (minor): `src/partition/partition-service-entry-apply-base.js:360-361` still says "so the sender
  never records it as taken (F1)", which is now false. `raft-rs-peer-delivery.js:96-98` maps a NO_HANDLER reason
  the router can no longer produce for a raft envelope.

### 4. Evidence gap: no green run of raft groups spread across nodes in a production composition

VERIFIED: the only composition that spreads partition replicas, `formation-sim-production-partitions.test.js`,
is red before and after for an unrelated reason (46 !== 138 at `d6cfa14ab` and at `393ece640`,
`raftframes-s2e-before-r3.log:25`, `raftframes-s2e-after-r3.log:123`). It therefore proves nothing about (e).
No corpus, cone, distributed-matrix or real formation run exists on this branch (author's section 18). R-1 and
C13 were last run at `8a8b08f79`; the `src` delta to `393ece640` is the refusal-record split only (VERIFIED,
28 lines in `message-router-consensus-delivery.js`), so I accept them for `393ece640`.

### 5. Smaller observations (none blocks)

- `MessageRouter.deliver` is still `async`, so each envelope still costs one promise and the group's turn still
  pends for a microtask hop per message (`message-router-delivery-behaviors.js:149-159`,
  `raft-rs-peer-delivery.js:173-182`). The record's "synchronous answer" is not literally reached. No defect.
- The class skips `router.initialize()` and `messageCount`, and emits no TRANSPORT_DELIVER metric. No `src/`
  decision reads those for raft (author's C14, spot-checked).
- A node on the old frame vocabulary logs "Unknown message type" at warn level per raft frame and drops it.
  `docs/operations-readiness.md:190-192` states there is no mixed-version contract in 0.x. A rolling upgrade
  across this commit cannot keep consensus between old and new nodes.

## The attack list, item by item

### 1. What the acknowledged path did and the class does not

| Provided before | Consumer | After (e) | Status |
| --- | --- | --- | --- |
| ACK frame per raft frame | Direct path: nothing. `handleAcknowledgment` finds no pending entry and does nothing (`message-router-pending-response-ledger.js:498-532` at base). As a parsed frame it refreshed `nodeInboundActivityAt` | Gone | VERIFIED |
| SERVICE_RESPONSE and correlation | Direct path: orphaned at the sender. Fallback path: the turn waited for it | Gone | VERIFIED |
| Per-message lifetime and deadline | Fallback only: held the group's turn up to 5 s | Gone; FAILED at once | VERIFIED; C7 4003 ms before, green after |
| Queue while disconnected, heartbeat replace key, priority lanes | Fallback only | Deleted; `replacePendingKey` still has non-raft users | VERIFIED |
| Reconnect and cold dial on failure | Link establishment | **Gone: finding 1** | VERIFIED |
| Backpressure | None on the direct lane before | None | VERIFIED unchanged (R-2) |
| Quarantine streak | Fallback raft frames could add ACK timeouts | Raft never adds | VERIFIED, benign |
| Liveness evidence | Guards read "any parsed frame from the peer" | The peer's own frames still count, the new class included (`message-router-inbound-dispatch.js:72-73`) | VERIFIED; residual R-1 |
| Latency samples | None from raft ACKs; the latency service uses `pingNode` | Unchanged | VERIFIED by grep |
| Ordering | One socket per pair; in-order microtasks at the receiver | Same | VERIFIED |

**(a) Failure detection and readiness.** No consumer inferred liveness from raft ACKs as such or from raft
delivery failures. The three guards (ACK-timeout quarantine, keepalive sever
`message-router-connection-close-reconnect.js:367-405`, `pingNode` timeout
`message-router-peer-liveness.js:73-105`) read one stamp fed by every parsed frame. The SWIM prober, node
readiness, the rebalancer and the latency service go through `pingNode`. After (e) the stamp is fed by the
peer's own raft envelopes, its pongs and its own keepalive pings. The old ACK was written in the frame-parse
turn, as a PONG is, so it carried no timeliness a PONG lacks; it was only more frequent. Removing it removes the
only frequent signal exactly in the author's R-1 case: the peer answers no raft and shares no other traffic.
The R-1 witness is green with the same outcome before (`d6cfa14ab`) and after (`8a8b08f79`). INFERRED residual:
the keepalive alone clears the 30 s window by construction but with almost no margin (a late pong's age at the
next check is 31 s minus its round trip). I accept R-1 as stated.

**(b) Reconnect.** Close handling re-dials on both ends (VERIFIED, finding 1 for the bound). A half-open
connection is noticed by the application keepalive only: PING every 30 s, pong deadline 1 s, sever after 2
consecutive misses unless any frame arrived in the last 30 s (`src/constants/transport.js:80-88`; no TCP
keepalive is set and nothing reads `bufferedAmount`, VERIFIED by grep). So raft envelopes can be recorded
DELIVERED into a dead socket for up to about 61 s. That bound is unchanged: the old direct path recorded
DELIVERED at `ws.send` too. Raft's own election timeout decides leadership meanwhile.

**(c) Backpressure and memory.** DELIVERED means `ws.send` accepted the frame into the socket's user-space
buffer (`message-router-consensus-delivery.js:96`). No transport bound exists per connection, before or after.
What bounds it: raft-rs flow control for appends, 256 in flight x 1 MiB per group and follower
(`vendor/raft-rs-wasm/src/lib.rs:467-472`), and the 61 s sever for a dead peer. Heartbeats are not bounded by
raft: a peer that stays alive but drains slower than the heartbeat rate grows the sender's buffer without limit
and delivers stale heartbeats late. INFERRED: safety holds, commit latency grows. This is the author's R-2,
pre-existing; (e) removes two of three frames and so makes it less likely, not more. It stays an owner decision
(O-4).

### 2. Ordering, duplication, timeouts

Per-connection order is kept. No raft code path asks the transport to retry: `settlePeerDelivery` records the
outcome and `failedPeers` drops the rest of that Ready (`raft-rs-peer-delivery.js:92-105`, `:198-207`); there is
no `report_unreachable` call (VERIFIED by grep). On the path through this class: Append, AppendResponse, the four
vote messages, Heartbeat, HeartbeatResponse, TimeoutNow, and possibly TransferLeader and a forwarded Propose.
MsgSnapshot never reaches it (`raft-rs-peer-delivery.js:155-158`); ReadIndex has no producer. No timeout is
longer than before for a connected peer. For a disconnected peer the old path could deliver up to 5 s late after
a dial; the class drops, and raft re-sends at heartbeat cadence once a link exists. A lost TimeoutNow costs one
election timeout, as before.

### 3. Same-node delivery

VERIFIED not inline. `deliverConsensusEnvelope` calls `receiveConsensusEnvelope`, which invokes the handler in a
microtask (`message-router-consensus-delivery.js:85`, `:155-158`). The handler calls `port.step`, which is
`enqueueStep`: admission checks, `pushInboundEnvelopeWithBounds`, `scheduleInboundDrain`, an owned timer
(`raft-rs-runtime-owner.js:2283-2320`, `:2020-2027`). It never enters the core. The old local path awaited the
same enqueue; nothing that used to be deferred is now nested.

### 4. Receiver refusals

All three receivers discarded the step outcome and answered `null`, before and after, so no typed raft refusal
(unknown group, admission, reseed hold, recovery window) ever reached a sender. Only throws did: the retiring
partition incarnation, an uninitialised message group, and the contained overflow. No sender-side decision was
driven by them: no membership repair, no address refresh, no epoch handling (VERIFIED by grep for the delivery
observation and its phases across `src`). The old no-handler branch also emitted a router MESSAGE event; no
`src` or `scripts` listener exists for it (VERIFIED by grep). The supersession is finding 3.

### 5. Three group kinds, one closure

The three SEND_TO_PEER closures had the same body and the three receivers the same branch; they now share
`sendRaftEnvelope` and `stepRaftEnvelope`. Message groups differed only in the fallback lane priority, which is
deleted with the fallback. `deliverToPeer` is the only producer of the raft envelope shape (VERIFIED by grep), so
no non-raft message shared the path and lost its ACK. Lab: message-group provisional route, W7 multi-target
route, WASM-service group and replica tests green at `8a8b08f79` (`raftframes-s2e-after-r1.log:241-263`).

### 6. F-2 and F-3

F-2: finding 2. F-3 (VERIFIED by read): an inbound queue overflow throws out of
`pushInboundEnvelopeWithBounds` (`raft-rs-runtime-owner.js:1917-1928`) and the port's containment turns it into
a group failure held for reconstruction (`:262-271`). Pre-existing and untouched by (e). Reaching 16384
envelopes or 64 MiB needs a long-stalled drain; the 120 s admission wait at heartbeat cadence stays near 2000
envelopes (INFERRED). Low severity, does not block; it is the wrong answer under R12 and belongs to the runtime
owner.

### 7. Evidence, confirmed from the lab files

| Claim | File | Head | Confirmed |
| --- | --- | --- | --- |
| (e) red: N 50, 150 frames, 100 back (50 ack, 50 service_response), 50 orphaned, 50 timers | `raftframes-stage1-r2.log:23` | `f1265c5ca` | Yes |
| (e) green, anchor green | `raftframes-s2e-after-r2.log:15` | `393ece640` | Yes. The log prints no counts; the witness asserts 0 back, 0 orphaned, 0 timers and 50 of 50 received |
| (c1) 396 / 792 / 1584 | `raftframes-stage1-r2.log:225` | `f1265c5ca` | Yes |
| (c1) 132 / 264 / 528, red as kept | `raftframes-s2e-after-r1.log:276` | `8a8b08f79` | Yes |
| C7 4003 ms before | `raftframes-s2e-before-r1.log:704` | `d6cfa14ab` | Yes |
| C7 green after (bound 2000 ms) | `raftframes-s2e-after-r2.log:20` | `393ece640` | Yes |
| R-1 green before and after | `before-r1.log:12`, `after-r1.log:265` | `d6cfa14ab`, `8a8b08f79` | Yes |
| C13 green after | `after-r1.log:297` | `8a8b08f79` | Yes, under the weakened clause (finding 1) |
| W-HID-1 green under the superseding clause | `after-r2.log:12` | `393ece640` | Yes |

### 8. Expected effect on the three-node acceptance (estimate, not a measurement)

Removed per heartbeat exchange (request and response for one follower): 4 of 6 frames, 2 delivery lifetimes
with their deadline timers, 2 orphaned-response records. At the nominal 60 ms cadence and RF 3 that is 133
frames per group per second; the motivation report measured about two thirds of nominal on the loaded cluster.
The report attributes to (e), in the idle seed profile, 7-8 % for the frames plus most of a 10.5 % send path,
and puts all idle heartbeat work during formation at 10 +/- 4 points of the seed (itself INFERRED there).
Scaling the first by the second gives roughly 2 to 5 points of seed CPU during formation. If pace follows seed
CPU, which rests on one pair of runs, 427 s becomes roughly 406 to 418 s against the 420 s bound. That is inside
run-to-run noise. (e) alone should not be expected to make the acceptance pass reliably.

## What the owner must explicitly acknowledge

1. **The W-HID-1 supersession** (`8a8b08f79`): the sender no longer sees a retiring incarnation's refusal of a
   raft envelope on the same-node path. The status untruth F1 named returns there, replaced by a receiver-side
   count.
2. **Raft traffic no longer establishes or re-establishes connections.** The transport's own reconnect owners
   are bounded on the dialing end; the unbounded end exists today only through defect F-2.

## Suites to run on the merged tree

Lab hosts, not this machine. Capture `getStats().consensusDelivery` per node wherever a cluster is formed.

- Transport: `test/transport/**`, including `message-router.test.js` and the six `raft-frame-*` witnesses
  ((c1) stays red as kept).
- Handler identity: W-HID-1, W-HID-2/3.
- Failure detection and liveness: the membership SWIM prober, node liveness and node readiness tests, the
  ACK-timeout quarantine tests.
- Reconnect: a kill and a rolling restart of a node that dialed its peers (watch the survivor's dial rate, F-2),
  and a partition longer than two minutes followed by a heal (the link must return and `notWritten` must stop
  growing).
- Formation: the three-node 1-CPU acceptance, and the four `formation-sim-production-*` compositions
  (`partitions` is red at base, F-5, and needs its own repair before it can witness anything).
- Snapshot catch-up: `partition-snapshot-compaction-catchup`, the bulk-transfer and learner catch-up and
  promotion tests.
- Leadership transfer and membership change: `partition-write-leadership-transfer`, the `raft-rs-backend`
  transfer, conf-change and self-removal tests.
- Message groups and WASM services: native provisional route, W7 multi-target route, the WASM group and replica
  tests.
- The distributed matrix on the lab, and the corpus or cone gate with the duplication and complexity ratchets.
