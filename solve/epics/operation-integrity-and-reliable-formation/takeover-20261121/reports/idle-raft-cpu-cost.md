# Idle raft CPU cost and formation pace on f580579a5 (read-only investigation)

Scope: causal and design investigation only. Nothing was run, built or changed. Source is read at f580579a5 (`git show f580579a5:<path>`); profile numbers are recomputed from the 11 retained `.cpuprofile` chunks of GCP run 2 (seed main thread); message rates come from the three node logs of run 2 and its host captures.

Labels: **VERIFIED** = read in source at f580579a5, or computed by me from the chunks / logs / derived files. **INFERRED** = my reading. One profiled run, one node (the seed): proportions are the evidence, absolute times are not.

## Summary

1. **The September diagnosis names the wrong cost.** The per-group tick timer still exists, but the tick path is at most 0.8–2 % of the seed's samples. The WASM `tick` call is 3 samples of 30,119 in the idle tail.
2. **The idle cost is the heartbeat message path.** Every raft message costs three WebSocket frames, of which two are an ACK and a response nobody awaits. Each message also gets its own delivery lifetime, its own timers and about 25–29 async callbacks. The seed handles about 575 such messages per second each way with zero operations in flight.
3. **The model reproduces the measurements.** The nodes' own orphan-response counters give 2,111 raft messages per second cluster-wide, which is 6,333 frames per second against 5,082 measured TCP segments per second. Raft plus its transport is 41.6 % of post-drain samples (48.7 % with profiler frames removed), against the module's 49.8 % bucket.
4. **During formation the largest single seed cost is not raft.** The CDC currentness check is 17.0 % of system-formation samples. It rebuilds the propagation plan and reads raft status up to three times per remaining-budget read. Raft plus transport is 25.5 %, of which roughly 10 points are idle heartbeats (INFERRED).
5. **Follow-ups.** The September tick-driver work was never done; no quest exists. Of the three November items, statement preparation and compacted-storage sync were repaired on 2026-11-19 (73c06f635) and are now 1.2 % and 0.2 %. The CDC currentness item was not touched and has grown.
6. **Formation pace follows seed CPU.** Run 2 carried about 20 % measurement overhead and its queue took 24 % longer. Freeing seed CPU should shorten the queue roughly in proportion; this rests on one pair of runs.

## 1. What runs per group per second when nothing is happening

### Configuration that reaches the core (VERIFIED)

| Item | Value | Where |
| --- | --- | --- |
| Tick driver | one `setInterval` per group, never shared | `src/raft/raft-rs-operation-port.js:390-394` |
| Tick period | 20 ms (`raft.tickIntervalMs`) | `src/config/config-definitions.js:40`; `raft-rs-operation-port.js:136-142` |
| Heartbeat | every 3 ticks = **60 ms**, fixed constant | `src/raft/raft-rs-group-constants.js:18-23`; `raft-rs-runtime-tuning.js:26-38` |
| `heartbeatMs 50` in the logs | does not reach the core while `tickIntervalMs` is set | `raft-rs-runtime-tuning.js:14-24` |
| Election timeout | `ceil(electionMinMs / 20)` ticks, at least 50; raft-rs randomises to 1–2× | `raft-rs-runtime-tuning.js:31-33`; `config-definitions.js:37-38` |
| Pre-vote, check-quorum | on for every group | `raft-rs-group-constants.js:21-22` |
| Inbound drain | one `setTimeout(0)` per group when an envelope arrives and none is armed; up to 32 envelopes per drain | `raft-rs-runtime-owner.js:2020-2027`, `:70`; `raft-rs-runtime-owner-constants.js:237`; `raft-rs-inbound-timer-custody.js:9-31` |

Election timeouts count the node's own ticks, not wall time. `setInterval` does not replay missed ticks, so a saturated node's raft clock runs slow.

### One tick (VERIFIED in source)

Timer → `executeTurn` → `protocolTurn` → `dispatch` → lifecycle `execute` → `enqueue` (one `Promise.withResolvers` per turn) → `perform` → `ensureExecution` → drain all queued inbound → WASM `tick` → `drainReady`.

- **Follower, quiet:** `has_ready` is false, then `announce` runs. `announce` makes two serialising WASM calls, `status` and `conf_state`, and builds a sorted configuration key (`raft-rs-runtime-owner.js:1329-1342`, `:1398-1422`, `:1451-1477`).
- **Leader, every third tick:** a Ready with one heartbeat per peer, then the full Ready cycle below.
- **In WASM:** `tick(handle)` is one `RawNode::tick()` on one handle (`vendor/raft-rs-wasm/src/lib.rs:553-559`). There is no batch call.

### One heartbeat exchange per leader–follower pair (VERIFIED in source)

| Step | Work | Where |
| --- | --- | --- |
| Leader sends | `sendMessages` → `deliverToPeer` → `transport.deliver` (async). A delivery lifetime per message: timeout budget, `AbortController`, a deadline `setTimeout`, abort listeners, `Promise.withResolvers`, a `new Promise`. Then `JSON.stringify` and one `ws.send` per message. | `raft-rs-peer-delivery.js:146-207`; `message-router-delivery-lifetime.js:45-170`, `:183-234`; `message-router-delivery-behaviors.js:230-273` |
| Follower receives | `JSON.parse`; an **ACK frame**; the handler in a microtask; a **SERVICE_RESPONSE frame** with the handler's answer. Both are sent unconditionally. | `message-router-inbound-dispatch.js:70-90`, `:474-543` |
| Sender gets them back | Direct raft delivery registers no pending response, so both frames arrive unmatched. The router logs `No pending service response request … orphaned`. | `message-router-delivery-behaviors.js:251-269` |
| Follower enqueues | Envelope copied and deep-frozen; `setTimeout(0)` armed. | `raft-rs-runtime-owner.js:2283-2321`, `:2157-2163` |
| Follower steps | WASM `step` (deserialise) → `has_ready` → `take_ready` (serialise) → **a SQLite transaction even when the Ready has nothing to persist** → `persist_ready` → send the heartbeat response through the same delivery path → `advance_append` → `advance_apply` → `has_ready` → `announce` (`status` + `conf_state`). | `raft-rs-runtime-owner.js:1874-1898`, `:1306-1327`, `:1227-1280`; `raft-rs-durable-store.js:444-460` |
| Leader handles the response | The whole inbound path again, including its own ACK and SERVICE_RESPONSE. | same |

Messages cross the WASM boundary as JS objects with decimal-string integers through `serde_wasm_bindgen` (`vendor/raft-rs-wasm/src/lib.rs:84-110`, `:566-587`, `:694-726`, `:956-964`).

### Cost model per group per second, nominal cadence, RF 3

| Quantity | Per group | 47 groups, cluster-wide | Basis |
| --- | --- | --- | --- |
| Tick timer fires | 150 (50 × 3 replicas) | 7,050 | VERIFIED configuration |
| Raft messages | 66.7 (16.7 heartbeats × 2 followers × request and response) | 3,133 | VERIFIED configuration |
| WebSocket frames | 200 (3 per raft message) | 9,400 | VERIFIED source |
| Unawaited frames | 133 (ACK + response) | 6,267 | VERIFIED source |
| `JSON.stringify` + `JSON.parse` | 200 + 200 | 9,400 + 9,400 | VERIFIED source |
| Inbound-drain timers | up to 66.7 | up to 3,133 | VERIFIED source |
| Delivery-lifetime deadline timers armed and cleared | 66.7 | 3,133 | VERIFIED source |
| SQLite transactions for Readies | about 50 | about 2,350 | INFERRED from the Ready cycle |
| Async callbacks owned by raft | about 25–29 per heartbeat exchange on a follower | – | VERIFIED: 16,617 dispatches/s ÷ 575 messages/s on the seed |

### Does it reproduce the measurements?

**Message rate (VERIFIED from node logs, run 2 idle tail).** Each node's orphaned-response counter counts one response per raft message it sent.

| Node | Orphaned responses per second | Window |
| --- | --- | --- |
| seed 95ce5141 | 573–578 | 13:27:10.7–13:28:10.7 |
| c14b47ee (fdiag-2) | 831–836 | 13:27:09.5–13:28:09.7 |
| d1162379 (fdiag-3) | 702 | 13:27:19.3–13:27:49.3 |
| **Cluster** | **about 2,111** | Run 1 measured 2,079 |

- 2,111 messages per second is **67 % of the nominal 3,133**. The effective heartbeat interval is about 90 ms, not 60 ms: the timers slip under load.
- 2,111 × 3 frames = **6,333 frames per second predicted, against 5,082 TCP segments per second measured** (ratio 0.80).
  - Segments undercount frames: the `ws` sender corks the socket, so frames written in one turn leave in one `writev`.
  - Segments overcount frames by pure TCP ACKs. The two effects cannot be separated from this evidence.
- Leadership split (INFERRED, assuming one common heartbeat rate of 11.2 per second): the seed leads about 4 of 47 groups, fdiag-2 about 27, fdiag-3 about 16. **The seed profile is therefore a follower profile.** Leader cost is unprofiled.

**CPU share (VERIFIED from the chunks and the attribution snapshots).**

| Measure, seed, zero operations in flight | Value |
| --- | --- |
| Raft machinery + transport, my stack partition of post-drain samples | 41.6 % of all samples; 48.7 % with profiler frames and idle removed |
| Module's `raft_protocol` bucket, 13:27:24.4–13:27:34.7 | 53.0 % (plus transport 15.7 %) |
| Async callbacks per second, same 10.3 s | 22,566 total; 16,617 owned by raft; 4,354 by transport |
| Cost per raft message end (send or receive) | about 0.27 ms of main-thread CPU, profiler on (INFERRED: 41.6 % × 0.74 CPU ÷ 1,146 message ends/s) |

The model reproduces both the segment rate (within 20 %) and the roughly 50 % share. The per-message CPU figure is calibrated on the same profile, so only the message and segment counts are an independent check.

**Scaling (INFERRED).** The joiners carry no profiler and sit at 85–90 % of a CPU with zero operations at 47 replicas. That is about 1.8–1.9 % of a CPU per hosted replica, all periodic work included. A 1-CPU node would saturate at roughly 53–55 replicas with no work at all. Timer slip already hides part of this.

### Periodic work outside raft in the idle tail (VERIFIED shares, seed)

| Owner | Share of post-drain samples |
| --- | --- |
| CDC currentness check | 7.5 % |
| Application of committed entries (log shipping, node heartbeats, CDC acknowledgements) | 6.2 % |
| Readiness / planning / publication | 5.8 % |
| Synced commits (`commitDurably`, fsync on the main thread) | 4.0 % |
| Per-partition sweep timer (`partition-service-participant-transaction-cadence-methods.js:86`) | 0.4 % |
| Compacted-storage sync per turn (`raft-rs-runtime-owner.js:976-1020`) | 0.2 % |

The idle tail is not idle: replicated writes continue with no operation in flight.

## 2. The profile, recomputed

**Method.** One chunk parsed per command. Each sample is placed by the chunk's start anchor from the run 2 report. Totals match that report exactly: 30,119 post-drain samples (chunk 9 from +49.653 s, chunk 10) and 289,655 system-formation samples (chunk 2 from +40.664 s to chunk 9 at +49.653 s). Each sample is assigned to exactly one owner by its stack, in this priority order: special entries; profiler frames; CDC currentness subtree; raft apply; raft send; raft persistence; raft status; raft other; transport; the rest by file.

Samples are wall-clock samples of the main thread. The seed was throttled in 67–87 % of scheduler periods, and blocking native calls (fsync inside `run`) count as wall time.

### Owner partition (% of all samples in the window)

| Owner | Post-drain (46 s) | System formation (431 s) |
| --- | --- | --- |
| Raft step / turn machinery / WASM boundary | 12.4 | 8.3 |
| Raft message send, synchronous part | 10.5 | 4.9 |
| Raft status announce after each drain | 3.7 | 1.8 |
| Raft inbound handler (partition transport handler) | 2.1 | 2.2 |
| Raft Ready persistence, excluding synced commits | 2.3 | 1.1 |
| Raft tick timer, synchronous part | 0.2 | 0.1 |
| Transport inbound (receive, parse, ACK and response frames) | 5.9 | 2.9 |
| Transport outbound and delivery lifetime, async parts | 4.6 | 4.2 |
| **Raft machinery + transport** | **41.6** | **25.5** |
| CDC currentness (`assertCurrent` subtree) | 7.5 | **17.0** |
| Readiness / planning / publication | 5.8 | 9.1 |
| Raft apply = application of committed entries | 6.2 | 7.1 |
| Synced commits (`commitDurably`) | 4.0 | 4.6 |
| Garbage collector | 9.0 | 8.8 |
| Admin websocket / observer | 0.8 | 3.3 |
| Control-plane other | 1.8 | 3.3 |
| CDC other | 0.9 | 2.9 |
| Rebalancer (the formation operations' own workflow) | 0.1 | 2.4 |
| SQL / storage other | 2.4 | 1.7 |
| Other runtime internals, program | 4.1 | 2.8 |
| Bootstrap owners, partition, cache, logging, topology | 1.4 | 1.4 |
| Profiler and attribution frames | 12.8 | 7.8 |
| Idle | 1.7 | 2.4 |

Over the run, raft machinery plus transport on the seed grows from about 21 % (first formation minute, chunk 1) to about 33 % (chunk 8) and 46 % in the last chunk. CDC currentness stays at 13.5–18 % per chunk through formation and falls to 7 % after it. The three raft figures in this paragraph include synced commits.

### Profiler overhead: how identified and what remains hidden

- **Identified by frame (removed above):** self time in `src/diagnostics/*`, `node:internal/async_hooks`, `node:internal/async_local_storage/*`, the native `registerDestroyHook`, and `hrtimeBigInt` called from diagnostics. 12.8 % post-drain, 7.8 % in formation.
- **Chunk flush:** 0.02 % inside the windows; the flush falls in the unsampled gaps.
- **Not identifiable by frame:** the slower promise path with hooks on (part of `runMicrotasks` self, 2.1 % and 1.5 %), garbage from the hook maps, and the profiler's own thread (about 7 % of the 1-CPU quota, outside this profile).
- **Total (INFERRED):** about 20 % of the seed's CPU budget. Formation took 24 % longer than in run 1.

With profiler frames and idle removed, the top owners are:

| Window | Owners, share of remaining samples |
| --- | --- |
| Post-drain | raft machinery + transport 48.7 %; GC 10.5 %; CDC currentness 8.8 %; apply 7.3 %; readiness 6.7 %; synced commits 4.6 % |
| System formation | raft machinery + transport 28.4 %; CDC currentness 19.0 %; readiness 10.1 %; GC 9.8 %; apply 7.8 %; synced commits 5.1 %; rebalancer 2.7 % |

### Top 25 by self time (% of all samples; owner tag)

| # | Post-drain | % | System formation | % |
| --- | --- | --- | --- | --- |
| 1 | (garbage collector) · GC | 8.99 | (garbage collector) · GC | 8.76 |
| 2 | `run` native SQLite · persistence/apply | 4.93 | `run` native SQLite · persistence/apply | 5.23 |
| 3 | `writev` native · transport | 3.22 | `deepFreeze` raft-operation-port.js:30 · raft status | 3.60 |
| 4 | `deepFreeze` src/raft/raft-operation-port.js:30 · raft | 2.90 | `fastJsonClone` src/utils/fast-json-clone.js:35 · CDC currentness | 2.56 |
| 5 | `recordScheduledEntry` src/diagnostics/formation-turn-attribution.js:394 · profiler | 2.58 | (idle) | 2.40 |
| 6 | `registerDestroyHook` native · profiler | 2.57 | `writev` native · transport | 1.79 |
| 7 | `runMicrotasks` native · runtime | 2.05 | `registerDestroyHook` native · profiler | 1.63 |
| 8 | (idle) | 1.71 | `recordScheduledEntry` formation-turn-attribution.js:394 · profiler | 1.56 |
| 9 | `startLoop` node_modules/ws/lib/receiver.js:171 · transport | 1.48 | `runMicrotasks` native · runtime | 1.52 |
| 10 | `dispatchInboundMessage` src/transport/message-router-inbound-dispatch.js:70 · transport | 1.33 | `sendToClient` src/admin/admin-websocket-message-dispatch-methods.js:429 · observer | 1.26 |
| 11 | `transaction` node_modules/better-sqlite3/lib/methods/transaction.js:5 · raft persistence | 1.23 | `Statement` native · SQL prepare | 1.04 |
| 12 | `fastJsonClone` fast-json-clone.js:35 · CDC currentness | 1.15 | `resolveActiveMessageGroupServices` src/topology/cdc-group-propagation-routing.js:43 · CDC currentness | 0.97 |
| 13 | `get` native · SQL | 0.92 | `collectKnownMessageGroupDomain` cdc-group-propagation-routing.js:242 · CDC currentness | 0.95 |
| 14 | `typedRowSetByteLength` src/query/sql-value-codec.js:497 · SQL | 0.90 | `get` native · SQL | 0.78 |
| 15 | `send` node_modules/ws/lib/sender.js:351 · transport | 0.87 | `deepFreeze` src/utils/deep-freeze.js:28 · readiness | 0.71 |
| 16 | `wasm-to-js` wasm://wasm/0029a806 · raft WASM boundary | 0.81 | `decodeUTF8` native · raft WASM boundary | 0.69 |
| 17 | `__wbg_set_…` vendor/raft-rs-wasm/pkg/raft_wasm.js:791 · raft WASM boundary | 0.78 | `copyStrictOwnDataRecord` src/utils/strict-own-data.js:61 · readiness | 0.69 |
| 18 | `tryDeliverRaftDirect` src/transport/message-router-delivery-behaviors.js:230 · raft send | 0.78 | `startLoop` ws receiver.js:171 · transport | 0.68 |
| 19 | (program) | 0.76 | `__wbg_set_…` raft_wasm.js:791 · raft WASM boundary | 0.66 |
| 20 | `enterSegment` formation-turn-attribution.js:506 · profiler | 0.74 | `transaction` better-sqlite3 transaction.js:5 · raft persistence | 0.66 |
| 21 | `decodeUTF8` native · raft WASM boundary | 0.71 | `get` src/cache/system-table-cache-observation-methods.js:446 · CDC currentness | 0.64 |
| 22 | `destroy` formation-turn-attribution.js:349 · profiler | 0.66 | `all` native · SQL | 0.61 |
| 23 | `sendToClient` admin-websocket-message-dispatch-methods.js:429 · observer | 0.65 | `wasm-to-js` · raft WASM boundary | 0.60 |
| 24 | `Statement` native · SQL prepare | 0.64 | `dispatchInboundMessage` message-router-inbound-dispatch.js:70 · transport | 0.58 |
| 25 | `promiseInitHookWithDestroyTracking` node:internal/async_hooks:335 · profiler | 0.63 | `isActiveMessageGroupServiceRow` cdc-group-propagation-routing.js:228 · CDC currentness | 0.57 |

### Top 25 by inclusive time (% of all samples; anonymous closures omitted)

| # | Post-drain | % | System formation | % |
| --- | --- | --- | --- | --- |
| 1 | `runMicrotasks` · runtime | 62.1 | `runMicrotasks` · runtime | 68.9 |
| 2 | `processTimers` node:internal/timers:508 · runtime | 46.8 | `processTicksAndRejections` task_queues:72 · runtime | 40.3 |
| 3 | `listOnTimeout` timers:528 · runtime | 45.6 | `processTimers` timers:508 · runtime | 30.3 |
| 4 | `runNextTicks` task_queues:63 · runtime | 34.8 | `runNextTicks` task_queues:63 · runtime | 28.7 |
| 5 | `runFormationOwner` formation-turn-attribution.js:744 · profiler wrapper | 30.4 | `runFormationOwner` :744 · profiler wrapper | 23.3 |
| 6 | `run` formation-turn-attribution.js:574 · profiler wrapper | 30.3 | `run` :574 · profiler wrapper | 23.2 |
| 7 | `run` node:internal/async_local_storage/async_hooks:77 · profiler wrapper | 29.9 | `run` async_local_storage:77 · profiler wrapper | 23.0 |
| 8 | `processTicksAndRejections` task_queues:72 · runtime | 27.6 | `listOnTimeout` timers:528 · runtime | 22.6 |
| 9 | `drainReady` src/raft/raft-rs-runtime-owner.js:1329 · raft | 25.9 | `continueTurn` src/raft/raft-rs-turn-answer.js:63 · raft | 18.7 |
| 10 | `drainInbound` raft-rs-runtime-owner.js:1930 · raft | 25.2 | `drainInbound` :1930 · raft | 18.3 |
| 11 | `dispatch` src/raft/raft-rs-operation-port.js:351 · raft | 21.3 | `drainReady` :1329 · raft | 17.4 |
| 12 | `processReadyCycle` raft-rs-runtime-owner.js:1306 · raft | 21.3 | `withinGroup` :1049 · raft | 17.1 |
| 13 | `execute` src/raft/raft-rs-replica-lifecycle-owner.js:255 · raft | 21.3 | `assertCurrent` src/cdc/cdc-delivery-invocation.js:83 · CDC currentness | 17.0 |
| 14 | `containRuntimeThrow` raft-rs-operation-port.js:151 · raft | 21.1 | `cdcProgressCurrent` src/partition/partition-cdc-obligation-progress.js:43 · CDC currentness | 16.9 |
| 15 | `continueTurn` raft-rs-turn-answer.js:63 · raft | 20.4 | `topologyBindingCurrent` partition-cdc-obligation-progress.js:32 · CDC currentness | 16.9 |
| 16 | `withinGroup` raft-rs-runtime-owner.js:1049 · raft | 20.3 | `dispatch` raft-rs-operation-port.js:351 · raft | 15.7 |
| 17 | `stepOneInbound` raft-rs-runtime-owner.js:1874 · raft | 19.0 | `execute` raft-rs-replica-lifecycle-owner.js:255 · raft | 15.7 |
| 18 | `protocolTurn` raft-rs-operation-port.js:363 · raft | 17.1 | `containRuntimeThrow` raft-rs-operation-port.js:151 · raft | 15.6 |
| 19 | `runRaftProtocolActivity` src/diagnostics/raft-formation-attribution.js:15 · profiler wrapper | 17.0 | `withDeliveryLifetime` src/transport/message-router-delivery-lifetime.js:220 · transport | 15.5 |
| 20 | `perform` raft-rs-runtime-owner.js:1983 · raft | 16.3 | `processReadyCycle` :1306 · raft | 15.1 |
| 21 | `enqueue` raft-rs-runtime-owner.js:1071 · raft | 15.4 | `callbackTrampoline` node:internal/async_hooks:118 · profiler wrapper | 14.7 |
| 22 | `withDeliveryLifetime` message-router-delivery-lifetime.js:220 · transport | 15.0 | `remaining` message-router-delivery-lifetime.js:96 · transport → CDC currentness | 13.7 |
| 23 | `deliver` src/transport/message-router-delivery-delegation.js:61 · transport | 14.0 | `parentDeliveryLimits` message-router-delivery-lifetime.js:34 · transport → CDC currentness | 13.5 |
| 24 | `sendMessages` src/raft/raft-rs-peer-delivery.js:198 · raft send | 13.4 | `executeCommand` raft-rs-runtime-owner.js:2134 · raft | 12.4 |
| 25 | `deliver` message-router-delivery-behaviors.js:149 · transport | 13.4 | `transaction` src/raft/raft-rs-durable-store.js:419 · raft persistence | 11.5 |

Next in formation: `readStatus` raft-rs-operation-port.js:456 8.8 %; `cdcPropagationProgressCurrent` src/cdc/cdc-propagation-progress.js:142 8.5 %; `captureDurablePropagationPlan` src/topology/cdc-group-propagation-durable-plan.js:14 8.1 %; `buildSafeTargets` cdc-group-propagation-routing.js:580 7.9 %; `readStatusUndrained` raft-rs-runtime-owner.js:1512 7.7 %.

### The November items today

| Item (2026-11-14) | Then | Now, formation / post-drain | Status |
| --- | --- | --- | --- |
| CDC currentness (`assertCurrent`) | 13.8 % | **17.0 % / 7.5 %** | **Not repaired.** Last change to these files is 2026-11-14 |
| `db.prepare` per call | 15.6 % | native `prepare` 1.22 % / 0.74 % | Repaired by 73c06f635 (2026-11-19): statements cached in `src/storage/sqlite-connection-state.js` |
| `syncCompactedStorage` per turn | 8.1 % | 0.21 % / 0.24 % | Repaired by the same commit (snapshot index held as a committed fact) |

**What `assertCurrent` calls (VERIFIED).**
- `assertCurrent` (`cdc-delivery-invocation.js:83-90`) calls `cdcProgressCurrent` (`partition-cdc-obligation-progress.js:43-50`).
- That calls `cdcPropagationProgressCurrent` (`cdc-propagation-progress.js:142`), which **rebuilds the durable propagation plan on every call** through `captureDurablePropagationPlan`. The rebuild reads the system-table cache; each cache `get` deep-clones its rows (`fastJsonClone`, 2.4 % of formation samples).
- `cdcProgressCurrent` also reads `owner.isLeader`, which is a raft `readStatus`: a `status` serialisation plus a deep freeze of the shaped answer (2.7 % of formation samples in `deepFreeze` alone).
- It is not once per delivery. The transport's `remaining()` calls the CDC context three times per call (`message-router-delivery-lifetime.js:34-43`), and `remaining()` runs on every `assertDeliveryOpen`, at creation, at settle and twice in `prepareMessage` (`:96-126`, `:143-148`, `:172-177`, `:199`, `:210`).
- Parents by share: `assertCdcDeliveryInvocation` 5.7 %, `remainingMs` (`:164`) 4.7 %, `remainingMs` (`:94`) 4.5 %.

**Remaining `db.prepare` sites (VERIFIED, formation window):** the synchronous-level pragma inside `commitDurably` (`raft-rs-durable-store.js:176`) 0.19 %; partition statement admission (`partition-statement-admission.js:333`) 0.38 %; CDC obligation ledger (`partition-cdc-obligation-ledger.js:139`, `:271`, `:367`) about 0.3 %.

**`deepFreeze` (raft-operation-port.js:30) is not per-message work.** Of its 3.6 % in formation, 2.7 % is status shaping for readers (mostly the CDC check). Envelope, delivery-record and outcome freezes together are about 0.9 %.

## 3. Was the September tick-driver work ever done?

**No (VERIFIED).**
- **Record.** `solve/epics/raft-rs-full-cutover/investigation-cutover-seed-regressions-2026-09-24.md`: "The fix would be one node-level tick driver for all groups instead of one timer per group. That is a performance item, not a repair for either red."
- **No quest.** A search of `solve/quests` and `solve/epics` at f580579a5 for tick driver, per-group timer, batch drain, quiescence and coalescing finds no quest for it. The quest `rs-raft-admitted-inbound-liveness` changed the custody of the inbound-drain timer, not its batching.
- **Code today.** One `setInterval` per group at `raft-rs-operation-port.js:390-394`, also on the current branch head. One zero-delay drain timer per group; envelopes coalesce within a group (up to 32 per drain), never across groups.

The profile does not confirm the timer as the main cost: the tick callback is 0.83 % of post-drain samples inclusive and 0.41 % in formation. Whether the seed's ticks fire at the nominal 2,350 per second is **not established**; the profile has no call counts.

## 4. Formation pace

### One ADD (run 1, 95 ADDs; durations from `gcp-formation-run1-analysis.md`, classification mine)

| Phase | p50 s | Kind | Why |
| --- | --- | --- | --- |
| Row created → seed sends CREATE_REPLICA | 0.92 | CPU-bound on the seed | Dispatch workflow behind the saturated loop; 54 fixed 250 ms deferrals in the run |
| Send → target handles it | 1.86 | CPU-bound, both loops | Network round trip is 0.25 ms. Includes 500 ms ACK bounds spent and re-sends |
| Handle → replica `pending` | 0.50 | CPU and fsync on the target | Local state write |
| `pending` → `stage=starting` | 2.43 | CPU-bound on the seed, plus spent bounds | A control-plane write round trip to the ledger leader; response grants of up to 974 ms spent |
| `starting` → `creating` | 1.33 | CPU and fsync on the target | Opens the partition service and the raft port |
| `creating` → learner started → `syncing` | 0.81 | CPU on the target | |
| `syncing` → `active` | 3.78 | **Fixed cadence, stretched by the leader's load** | The learner re-asks on a 1 s cadence (`LEARNER_CATCH_UP_CHECK_INTERVAL_MS`, `partition-service-constants.js:47`) and polls at 250 ms (`replica-handler-transition-policy.js:26`) |
| **Total** | **12.4** | | |

- About 8.7 s of 12.4 s is CPU-bound queueing behind saturated loops; these phases would shrink with idle cost (INFERRED).
- About 3.8 s is quantised by the 1 s cadence. It would shrink only in whole seconds unless the cadence becomes an event (INFERRED).
- Re-sends are waste, not waiting: 3.1 CREATE_REPLICA deliveries per ADD in run 1.

**The `logs-p1` episode (203–242 s).** ADDs of 20.2 s and 17.5 s; each joiner blocked for 3.4–4.4 s in `raft_follower_commit_apply_slice`. This is synchronous catch-up apply of the largest log on the joiner. It is CPU-bound and proportional to log size, not idle cost. It cost about 10 s of margin and would not shrink if idle cost dropped.

### Is the pace CPU-bound? (INFERRED from two runs)

| Evidence | Reading |
| --- | --- |
| Run 2 carried about 20 % overhead; its queue took 24 % longer (530.6 s against 427.2 s); ADD p50 was 22 % longer | Pace is roughly proportional to available seed CPU |
| Completion rate within run 1: 21.0 per minute (60–210 s) → 19.5 (300–420 s). Run 2: 20 → about 15–17 | Pace falls 8–20 % as groups spread |
| Seed raft + transport share grows about 12 points over the same span | Consistent with the fall |
| Seed is at 98–100 % from the first second, before any group is spread | The seed is saturated by formation, CDC and readiness work first; idle raft cost is added on top |

### Queue time if per-group idle cost were removed (estimate)

Assumptions: pace is proportional to seed CPU; idle heartbeats take about 10 ± 4 points of the seed's main thread during formation; target-local phases shorten by about 1 s once joiners lose half their idle load.

- ADD about 10.3 s; queue about 92 × 10.3 ÷ 3 + 13 s serial start + 10 s tail ≈ **340 s, range 340–390 s**.
- It would pass, but with 7–19 % margin. Idle cost alone is not what makes formation slow on the seed.

### Other levers that raise no bound and no CPU limit

| Lever | Kind |
| --- | --- |
| Make the CDC currentness check cheap (17 % of the seed during formation) | Repair; section 7 (f) |
| Replace the 1 s learner re-ask cadence with a wake when the leader has the proof | Design change; up to about 2 s per ADD |
| Stop re-sending CREATE_REPLICA while the first is still in progress | Repair of amplification |
| Use the 42.6 idle slot-seconds at the start (ledger partition runs alone, about 13 s) | Planner change |
| Add both learners of a partition in one operation | Redesign; owner decision |
| Bound the catch-up apply slice so a joiner is never blocked for seconds | Repair in the follower apply path |
| Batch log shipping into `logs-p1` | Design change; reduces replicated writes and fsyncs |

**Shortcuts that would violate R12 ("add backpressure, not a shortcut"):** raising `K_SRC` into a saturated seed; lengthening ACK, read or election bounds; switching off check-quorum; skipping the currentness check instead of making it cheap; dropping fsync; reducing the harness capture only for the acceptance run.

## 5. What adapts to load, and which deadlines fire because the loop is saturated

**Adapts (VERIFIED in source, engagement from the run 1 analysis).**

| Mechanism | Reads | Effect |
| --- | --- | --- |
| Pressure governor (`src/control-plane/pressure-governor.js`) | Queue depth and reserves, not loop delay | Defers with a pacing hint; engaged twice in run 1 |
| Query admission deferral | Its own queue | 4 / 14 / 24 deferrals |
| ACK-timeout quarantine skip ("slow, not dead") | Recent inbound traffic | Prevented quarantine 6 times |
| Event-loop gap watchdog | Loop gaps ≥ 1 s | Observes only |
| Raft adaptive timing controller | CPU, write rate | **Disabled by default** (`config-definitions.js:41`). Its heartbeat field would not change the core's fixed 3-tick heartbeat while a tick interval is configured (INFERRED from `raft-rs-runtime-tuning.js`) |
| Timer slip | – | The only thing that slows raft under load: heartbeats run at 67 % of nominal. Not by design |

Nothing that admits work reads loop delay, CPU or the rate of spent bounds.

**Wall-clock bounds that fire under saturation (counts from run 1, seed / fdiag-2 / fdiag-3).**

| Bound | Count | Cost when it fires |
| --- | --- | --- |
| Delivery ACK, mostly 500 ms | 25 / 40 / 37 | Delivery fails upward; caller re-sends |
| SERVICE_RESPONSE grant after ACK | 40 / 59 / 80 | Answer treated as lost while the peer keeps working; the seed re-sends CREATE_REPLICA (3.1 deliveries per ADD) |
| Partition execution deadline, 1–1.5 s | 22 / 55 / 56 | Write reported as outcome unknown after delivery; re-issued or dropped |
| Coordinator query timeout, 1 s | 3 / 3 / 3 | Query fails |
| Raft election timeout, 1–2 s in the follower's own ticks | 45 campaigns, 44 leadership changes | Leader activation, role and leader-row publication to three nodes (replicated writes), readiness re-planning, paused writes during cutover |

**Why elections fire on a clean network (INFERRED).** A leader on a saturated node sends heartbeats on its own slipped ticks and sends none during a loop gap. The seed had 11 gaps of at least 1 s in run 1. Followers on less loaded nodes keep ticking and reach 50 ticks. Leadership therefore drifts to the node with the fastest clock, which matches the seed leading only about 4 of 47 groups at the end.

## 6. Prior art that changes the design

Recalled from public design documents; not re-fetched in this session. Version numbers are approximate.

| System | Mechanism | Safety invariant | In raft-rs or in the application? |
| --- | --- | --- | --- |
| CockroachDB, coalesced heartbeats | The store intercepts per-range heartbeats and responses and sends one message per node pair per tick; the receiver fans them out | Pure transport change; each range still steps its own heartbeat | Application |
| CockroachDB, quiescence | An idle range's leader (no pending proposals, all followers caught up) sends a last heartbeat marked quiesce; replicas stop ticking | A quiesced replica wakes on any proposal or message, and when node liveness shows the leader's node dead; liveness of the leader is tracked per node, not per range | Application, plus a library call that advances the election clock without campaigning (etcd's `TickQuiesced`) |
| CockroachDB, store liveness and leader leases | Stores exchange heartbeats per store pair; a leader gathers support from followers' stores; ranges stop per-range heartbeats while supported | A follower neither votes for another candidate nor campaigns until its store's support has expired | Changes inside the raft library and the application |
| TiKV, batch system | A few poller threads drive all regions; each turn collects Readies from many regions, writes them in one batch with one fsync, then sends. Base tick 1 s, heartbeat 2 s, election 10 s | Per-region ordering kept; persistence before send | Application (raftstore) |
| TiKV, hibernate regions | An idle region stops ticking when all peers agree; any proposal or message wakes it; a wake is broadcast to all peers | Election timeouts must still fire when the leader's store dies: peers wake on store-level unreachability and on a slow stale-state check | Application; raft-rs has no quiescence |
| TiKV, region heartbeat to the placement driver | Leaders report region state every 60 s, stores every 10 s, separately from raft heartbeats | Scheduling metadata never rides the consensus cadence | Application |
| etcd/raft `MultiNode` | One loop drove many groups inside the library; removed once CockroachDB moved to `RawNode` | – | Lesson: the library exposes one synchronous group; ticking, batching and coalescing across groups belong to the application. raft-rs has only `RawNode` |
| Kafka KRaft | One metadata quorum; partitions are not consensus groups; one fetch per broker pair covers many partitions | Partition leadership and in-sync sets are linearised through the single quorum; leader epochs fence stale leaders | Opposite design: consensus cost is independent of partition count |
| ScyllaDB raft | One failure detector per node pair shared by all groups; a follower does not campaign while the detector reports the leader's node alive | A dead leader node is detected by the shared detector within its own timeout | Library takes a failure-detector interface; raft-rs has none |
| Redpanda | A node-level heartbeat manager batches all groups' heartbeats per destination into one request; unchanged groups send only an identifier | Same as coalescing | Application |
| YugabyteDB | Per-tablet heartbeats (500 ms) with an optional batcher per destination server; tablets per node are bounded in practice | – | Application |

**What raft-rs gives natively:** `RawNode` with tick, step, Ready, campaign, leadership transfer, unreachable reports, pre-vote and check-quorum. No multi-group driver, no coalescing, no quiescence and no call that advances the election clock without campaigning.

**Consequence for quiescence with raft-rs.** With check-quorum and pre-vote, a peer ignores a pre-vote while its own election clock is below the timeout. Peers that are not ticked never reach it. A wake must therefore be group-wide, or the vendored core must gain a quiesced tick.

## 7. Design options for Lagrange, smallest first

"Repair" means an executed measurement in this report demonstrates the defect. Shares are of post-drain samples unless stated.

| # | Option | Removes | Kind |
| --- | --- | --- | --- |
| g | Finish prepared-statement caching | 1.2 % (formation) | Repair, small |
| i | No SQLite transaction for a Ready with nothing to persist | up to 2.3 % | Repair |
| h | Announce status only when the Ready changed term, leader, commit, applied or configuration | up to 3.7 % | Repair |
| e | No ACK and no SERVICE_RESPONSE for raft frames; no per-message delivery lifetime | 2 of every 3 frames; about 7–8 % for the frames plus most of the 10.5 % send path | **Repair** |
| f | CDC currentness evaluated against a change stamp, not recomputed per read | 17.0 % of formation, 7.5 % idle | **Repair** |
| b | One node-level inbound drain per loop turn | One timer per message; up to 3,133 timers/s cluster-wide | Bounded change |
| a | One node-level tick driver | 7,050 timer fires/s cluster-wide; at most 0.8–2 % CPU on the seed | Bounded change; not confirmed as a main cost |
| c1 | One transport frame per node pair per loop turn carrying all raft envelopes | Frames per node pair become O(1) per turn instead of O(groups) | Bounded change |
| c0 | Heartbeat every N ticks instead of 3, election timeout unchanged | Message volume ÷ (N/3) | **Tuning; owner decision** |
| c2 | Synthesised coalesced heartbeats (term and commit tuples) | Bytes and serialisation, not the per-group step | Redesign; owner decision |
| d | Quiesce idle groups with node-level liveness | Everything per idle group | **Redesign; owner decision** |

### Per option

**(e) Unawaited frames and the per-message delivery path.**
- **Defect.** Raft delivery awaits no response, yet the receiver sends two frames per message. The product logs them as orphaned: 575, 834 and 702 per second on the three nodes.
- **Safety.** Raft tolerates lost messages by design and re-sends on the next heartbeat or append. No obligation rides on the ACK or the response: the sender already records delivery as soon as the socket accepts the frame (`message-router-delivery-behaviors.js:266-269`).
- **Binding.** Nothing needed.
- **Files.** `src/transport/message-router-inbound-dispatch.js:474-543`; `message-router-delivery-behaviors.js:149-273`; `message-router-delivery-lifetime.js:220-234`; `src/raft/raft-rs-peer-delivery.js:146-207`; the three `SEND_TO_PEER` sites (`partition-service-raft-init-base.js:324`, `message-group-consensus-port.js:124`, `wasm-service-consensus-port.js:172`).
- **Red witness.** Two real routers on the virtual network. Deliver N raft envelopes one way. Assert N frames on the wire, zero frames back, zero orphaned-response records, zero deadline timers armed. Today: 3N, 2N, N and N.
- **Risk.** Liveness evidence for the quarantine guard comes from inbound traffic; heartbeats in both directions still provide it. The peer-delivery observation must keep its meaning.

**(f) CDC currentness.**
- **Defect.** A read-only predicate rebuilds the propagation plan, clones cache rows and reads raft status on every budget read, three times per read.
- **Safety.** The check must never answer current after any fact it reads has changed: system-table cache generation of the tables the plan reads, leadership tenure, subscriber epoch, propagation lifetime. A stamp over exactly those facts preserves the answer. A stale positive is the only unsafe outcome.
- **Files.** `src/cdc/cdc-delivery-invocation.js:73-126`, `:139-166`, `:223-230`; `src/partition/partition-cdc-obligation-progress.js:32-50`, `:108-119`; `src/cdc/cdc-propagation-progress.js:142`; `src/topology/cdc-group-propagation-durable-plan.js:14`; `src/topology/cdc-group-propagation-routing.js:43`, `:242`, `:580`; `src/transport/message-router-delivery-lifetime.js:34-43`.
- **Red witness.** Counting test on the real invocation, scope and delivery lifetime. One CDC delivery with nothing changing: plan rebuilds and raft status reads must be at most 1. Today the count grows with the number of budget reads. Paired negative: change each stamped fact in turn; the next check must answer not-current at once.
- **Risk.** A missed input to the stamp. The negative witness must enumerate every fact the current code reads.

**(h), (i), (g) Turn-path repairs.**
- **Safety.** (h) announces exactly the transitions the core reported, never fewer: the Ready already carries soft and hard state. (i) persists nothing because nothing is owed; `persist_ready` and the advances still run. (g) changes no semantics.
- **Files.** `raft-rs-runtime-owner.js:1329-1342`, `:1398-1422`, `:1451-1477`; `raft-rs-durable-store.js:176`, `:444-460`.
- **Red witness.** Counting on virtual time: a follower receives 100 heartbeats with no state change. Assert zero SQLite transactions, zero `status` and `conf_state` core entries (the existing core-entry observer counts them), zero `db.prepare`.
- **Risk.** A reader of the recorded status observation that relies on it being refreshed every tick.

**(b) + (a) One node-level raft scheduler.**
- **Removes.** Per-group timers. Idle timer fires become one or two per node per period.
- **Safety.** Every opened group is still ticked once per period, including gated learners, so no check-quorum lease freezes (`raft-rs-group-constants.js` comment). Missed periods are dropped, never replayed: replayed ticks would fire elections. Each tick and each drain still enters through the group's own lifecycle admission and turn queue. The admitted-inbound wake stays owned and referenced (the `rs-raft-admitted-inbound-liveness` receipts). Per-drain fairness (32 envelopes) is kept.
- **Binding.** Nothing needed. An optional `tick_many(handles)` returning the handles with a Ready would cut boundary crossings.
- **Files.** `raft-rs-operation-port.js:371-405`; `raft-rs-runtime-owner.js:108`, `:2010-2099`; `raft-rs-inbound-timer-custody.js`.
- **Red witness.** Virtual time, G idle groups on one node for G = 8, 16, 32. Assert timer fires per second independent of G, every group ticked exactly once per period, a stopped or held group not ticked, a group opened mid-period ticked from the next period. Today timer fires are 50 × G.
- **Risk.** One long tick pass blocks the loop; it needs a per-pass budget. The saving is small on its own.

**(c1) Frame batching per node pair.**
- **Safety.** Framing only. Every raft message is delivered unchanged and in order per group.
- **Files.** As (e), plus the fan-out on the receiver.
- **Red witness.** Three nodes on the virtual network, G idle groups, 1 s of virtual time. Assert frames per node pair per second independent of G. Today 200 × G ÷ 3 per pair.
- **Risk.** One large frame delays the first message in it; needs a size cap.

**(c0) Heartbeat cadence.**
- **Safety.** Election timeout unchanged at 1–2 s, so dead-leader detection is unchanged. At N = 15 the ratio of heartbeat to election timeout becomes 1:3.3–6.7 (TiKV 1:5, etcd 1:10; Lagrange today 1:17–33).
- **Risk.** Fewer heartbeats per election window while loop gaps of 1 s still occur means more spurious elections. Only after (e), (b) and (c1) have removed the gaps.

**(d) Quiescence.**
- **Safety to establish.** Wake on any proposal or message; wake the whole group; a dead leader's node detected within today's bound through node-level liveness (the SWIM prober and the node heartbeat exist); leadership transfer and learner catch-up never run on a quiesced group; any lease derived from check-quorum must not outlive the leader's real liveness.
- **Conflict.** It contradicts the standing condition that every opened replica is ticked (owner ruling 2026-10-05 in `raft-rs-group-constants.js`).
- **Binding.** Stopping ticks needs nothing. A safe wake needs either a group-wide wake message or a quiesced tick in the vendored core.

### What to put first

1. **(f) CDC currentness.** Largest single cost on the bottleneck node during formation, demonstrated, untouched since it was first reported.
2. **(e) Unawaited raft frames and the per-message delivery lifetime.** Two of every three frames; the product's own log names them orphaned.
3. **(b) + (c1), with (h) and (i).** Idle cost per node pair stops scaling with groups for frames and timers.

**Arithmetic for the 138-operation queue (estimate; assumptions as in section 4).**

| Step | Seed main thread freed during formation | ADD | Queue |
| --- | --- | --- | --- |
| Run 1 baseline | – | 12.4 s | 427 s |
| (f), 90 % of 17.0 % | about 15 points (16 % of real work) | about 11.0 s | about 360 s (340–400) |
| (e) + (b) + (c1) + (h) + (i), half of the 25.5 % raft and transport share | about 9–12 points | about 11.0 s alone | about 360 s alone |
| All of the above | about 25 points | about 9–10 s | **about 300–340 s** |

- Margin against 420 s: 19–29 % for the combination, if the assumptions hold.
- Uncertainty is large: one profiled node; the proportionality rests on one pair of runs; the joiners are unprofiled; the 1 s learner cadence sets a floor near 3.8 s for the last phase.
- (a) alone and (g) alone would not move the queue measurably.

**Needs an owner decision:** (d) quiescence; (c0) heartbeat cadence; (c2) synthesised heartbeats; two learners per operation; event-driven learner proof instead of the 1 s cadence; batching log shipping; whether the harness's observer load on the seed belongs in the acceptance.

## 8. What a second profile should capture

| Gap | What to capture | Change needed |
| --- | --- | --- |
| Joiner (leader-heavy) cost | The same profile on one joiner | Harness: the keys `LAGRANGE_FORMATION_ATTRIBUTION`, `LAGRANGE_FORMATION_ATTRIBUTION_DEADLINE_MS` and `LAGRANGE_FORMATION_PROFILE_DIR` are in `FORWARDED_SEED_HOST_ENV_KEYS` (`test/distributed/harness/cluster-class-lifecycle-base.js:70-74`) and applied only to node 0 (`:618`). Joiners receive only `FORWARDED_HOST_ENV_KEYS` (`:61-66`, `:706`). Forward the three keys to one chosen joiner |
| Async-hooks distortion | A profile with the sampler on and the attribution hooks off | Source: the sampler starts only inside the attribution window (`src/diagnostics/formation-attribution-window.js`); it needs a profile-only mode |
| Short idle tail | At least 180 s after the last operation, profiler running | Deadline of at least drain + 180 s, and the cluster held idle past the last 60 s flush: SIGTERM writes no final chunk |
| Call counts | Per 10 s: tick timer fires; raft messages in and out by type; frames in and out by type; orphaned ACKs and responses; Readies total and empty; synced commits; drain timers; delivery lifetimes created; CDC currentness evaluations and plan rebuilds; groups led; event-loop utilisation | Counters as log lines |
| Observer load | 60 s of the idle tail with playback capture and polls paused (the seed's admin connection carries 965 segments per second in the idle minute) | Harness option |
| Leader versus follower cost | Leadership per node over time | Status dump per 10 s |

## Not established

- The tick rate on the seed, and so the cost per tick.
- The cost on a leader-heavy node (no joiner profile).
- Frames per second on the wire (only TCP segments were counted).
- How much of the raft and transport share during formation is heartbeats rather than replication of real writes (about 10 points is INFERRED from the growth between the first and last formation minute).
- That formation pace is proportional to seed CPU beyond this pair of runs.
- Whether any consumer depends on the unawaited raft ACK or response frames; I found none on the direct delivery path and did not census every reader.

## Method note

The folding and aggregation scripts and the per-chunk folded files are in the session scratchpad, which is not durable: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9fc649c2-52dc-446a-bd53-fca59718b5ee/scratchpad/tools/` and `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9fc649c2-52dc-446a-bd53-fca59718b5ee/scratchpad/folded/`. Each chunk was parsed once, one per command, at nice 19 on cores 8, 9, 18 and 19.
