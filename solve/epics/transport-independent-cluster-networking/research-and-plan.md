# Research and execution plan — independent node transports and Raft timing

Date: 2026-10-17. Source reference:
[psvensson/lagrange at 47889ca3443abf04a5a79252f4b6db95a28799b5](https://github.com/psvensson/lagrange/commit/47889ca3443abf04a5a79252f4b6db95a28799b5).
External API documentation was inspected on 2026-10-17. These are **static
source observations and research hypotheses**, not a live performance test or
proof of runtime behavior. Parent epic:
[`transport-independent-cluster-networking`](../transport-independent-cluster-networking.md).

## A. Research question and non-negotiable outcome

Can each selected inter-node transport (WebSockets, then NATS, then Veilid)
carry **all** Lagrange node traffic on its own, while remaining transparent to
SQL, `ctx.call` and replicated state, and can low-frequency heartbeat /
latency-aware Raft timing make Veilid-only installations practical without
new consensus or routing authorities?

**Yes is a hypothesis, not a finding.** A standalone backend must be
proven without any direct WebSocket or alternate backend for node-to-node
traffic. Mixed-provider optimization is a *later* independent decision.

The planned implementation order is NATS-alone, then Veilid-alone; optional
multi-backend routing and gRPC follow only if justified. No rs-raft code edits,
baseline merges, production adaptation or timeout relaxation are authorized by
this planning snapshot.

## B. Current Lagrange evidence (code, not inference)

| Concern | Read | Observation |
| --- | --- | --- |
| Existing provider concept | [transport-provider.js](../../../src/transport/transport-provider.js), [transport-types.js](../../../src/constants/transport-types.js) | Base class explicitly includes the terms `ws`, `nats` and `veilid`; `connect`, `send`, `disconnect`, health and shutdown are abstract. |
| Endpoint model | [transport-registry.js](../../../src/transport/transport-registry.js), [node-address-resolution.js](../../../src/transport/node-address-resolution.js) | Endpoints and node identity are separate; live registry filters endpoints against current node incarnation. Production bootstrap address resolution is WebSocket-specific. |
| Actual router path | [message-router.js](../../../src/transport/message-router.js), [message-router-delivery-behaviors.js](../../../src/transport/message-router-delivery-behaviors.js) | Router owns queues, ACK, reconnect, admission and message outcomes. Its active link path and direct Raft send use a WebSocket object. |
| Guardrail against fallback | [message-router-transport-cleanup.test.js](../../../test/transport/message-router-transport-cleanup.test.js) | Production `MessageRouter` intentionally has no active `transportRegistry` field or registry delivery branch. Reconnecting it blindly recreates the duplicated authority previously removed. |
| Bulk | [bulk-transfer-channel.js](../../../src/transport/bulk-transfer-channel.js), [transport README](../../../src/transport/README.md) | Snapshots use a second admitted WebSocket lane with byte pacing, bounded pending and independent pressure accounting. Standalone overlay transport needs its own implementation. |
| Raft scheduler | [raft-rs-operation-port.js](../../../src/raft/raft-rs-operation-port.js) | Every group's timer calls `tick`; its `configureTick` can change timer interval and passes other values to runtime owner. |
| Core timing | [raft-rs-group-constants.js](../../../src/raft/raft-rs-group-constants.js), [raft-rs-runtime-tuning.js](../../../src/raft/raft-rs-runtime-tuning.js) | Heartbeat tick count fixed to 3, election tick calculated using minimum election milliseconds and tick length; maximum election milliseconds do not configure native min/max tick fields. |
| Live timing | [raft-rs-runtime-owner.js](../../../src/raft/raft-rs-runtime-owner.js) | A group's `configureTiming` replaces its `group.timing` object, but makes no core timing-config call; core was constructed earlier with `tuningOf(group.timing)`. |
| Dynamic config | [dynamic-config-startup-wiring.js](../../../src/config/dynamic-config-startup-wiring.js), [raft-adaptive-timing-controller.js](../../../src/config/raft-adaptive-timing-controller.js) | Current node wiring watches cluster-wide config and applies updates to known local services. Adaptive controller selects active/idle based on node resource load and writes three configuration keys separately. It is NOT a tested per-group latency-aware consensus policy. |
| Other clocks | [config-definitions.js](../../../src/config/config-definitions.js), [constants/time.js](../../../src/constants/time.js), [constants/transport.js](../../../src/constants/transport.js) | Raft defaults, transport response deadlines, node heartbeat, control-plane ready leases, and liveness ping timers are separate. Changing only Raft can create contradictory liveness reports. |

### Timing calculations to verify on actual wires

At this source reference, config defaults include:

- `raft.heartbeatIntervalMs=50`, `raft.tickIntervalMs=20`,
  `raft.electionTimeoutMinMs=1000`, `raft.electionTimeoutMaxMs=3000`.
- Native `heartbeatTick=3` => **60 ms expected scheduled heartbeat** (3
  ticks at 20 ms), not 50 ms.
- `electionTick=ceil(1000/20)=50`, so the core's nominal election duration
  is 1000 ms before native randomization. Upstream raft-rs defaults
  `min_election_tick=election_tick` and `max_election_tick=2*election_tick`,
  giving a randomized effective 1–2 second interval before additional
  replica-index-specific staggering. Do **not** report current 3 s configured
  max as effective.
- `computeReplicaElectionTimeouts` offsets election windows by replica
  index (current configured jitter 2500 ms per index). The real distribution
  therefore needs per-group/per-voter instrumentation, not one cluster number.
- The live `configureTick` path may change the tick interval and thus the
  effective duration of **already fixed** native tick counts. Updating only
  heartbeat or election milliseconds does not apply new core tick counts;
  runtime `group.timing` may then disagree with what the core executes.
  The runtime also uses that metadata for recovery windows. This is a
  correctness/observability interaction to resolve before claiming hot updates.

**Exact falsifier:** create an actual three-voter group; trace scheduler
ticks, native `MsgHeartbeat` sends, receiving peer observations, and
election/leadership behavior; change all three configuration fields
independently; assert that the new measured cadence matches the reported
effective profile and the core election window without restart. The current
code is predicted to fail parts of that assertion. Do not patch the
controller until the failing experiment is retained.

## C. What raft-rs already gives us — and what it does not

Upstream [raft-rs Config](https://docs.rs/raft/latest/raft/struct.Config.html)
defines independent heartbeat/election ticks and min/max election tick
settings at construction. The public
[RawNode API](https://docs.rs/raft/latest/raft/raw_node/struct.RawNode.html)
offers `propose`, `tick`, `ping`, `ready` and `step`; the public API
listing does **not** advertise a high-level live heartbeat/election reconfigure
operation. Do not write directly into Rust core fields behind the frozen
Lagrange operation port simply to make hot adaptation easy.

The [upstream Raft implementation](https://github.com/tikv/raft-rs/blob/master/src/raft.rs)
generates Append messages when proposals/entries are available; heartbeats are
the periodic *idle leader-presence* mechanism. Thus a longer heartbeat
interval need not force every write to wait for the next heartbeat. This is
a **source-supported behavior to validate at Lagrange's entire Ready/delivery
boundary**, not evidence that arbitrary query/read-index, commit propagation
or leadership transfer latency is unchanged.

A correct pilot should first select **static profiles before node/group
construction**; dynamic changes are a subsequent separate proof. Changing
only the tick interval is not equivalent to changing heartbeat and election
tick counts independently. If a native core cannot be safely reconfigured,
choose an explicitly approved core/operation-port extension with evidence,
or keep settings immutable per live group until a safe lifecycle transition
is proven. Never silently restart a live voter to tune a timer.

## D. Illustrative static timing profiles (NOT released defaults)

| Environment | Tick length | Core heartbeat ticks | Expected heartbeat | Election base ticks | Nominal base election / native default randomized window |
| --- | ---: | ---: | ---: | ---: | --- |
| Current direct | 20 ms | 3 | 60 ms | 50 | 1 s / about 1–2 s |
| Candidate brokered | 100 ms | 3 | 300 ms | 30 | 3 s / about 3–6 s |
| Candidate routed overlay | 250 ms | 3 | 750 ms | 40 | 10 s / about 10–20 s |

Only the first row reflects the current configuration derivation. The other
rows are **experimental hypotheses**. Current replica-specific election
jitter and proposed native min/max support can modify the actual windows.
A long election timeout reduces churn at a cost: real leader failure may
take longer to recover. It does not weaken majority commit safety, but
failure detectors and caller availability semantics must be independently
verified.

Do not select a profile merely from the string `veilid`: same transport
can have different tail latency depending on routes and environment.

### Timing-policy design constraints

1. One group-timing **policy/selection owner** consumes topology/latency
   observations, operator bounds and measured load. It publishes a versioned
   complete profile for each group (or a validated cluster default).
   Never let individual transport adapters or followers independently change
   consensus timings.
2. The existing global `RaftAdaptiveTimingController` must be reconciled into
   this owner, not operate as a second source of policy. Its existing CPU/RSS/
   disk heuristics and non-atomic, three-key writes are *inputs or a migration
   concern*, not a basis for asserting live group timing.
3. Admit a complete tuple (tick, heartbeat, randomized election min/max,
   effective group incarnation/profile epoch) as one revision. Maintain
   an explicit prepared/applied/refused outcome. Reject unsupported or
   partially applied transitions rather than publishing a false applied
   state. Mixed-version voter transitions require independent safety proof.
4. The actual application owner and the driver/core must be able to report
   **effective** timing, not just desired configuration.
5. Use bounded levels and hysteresis, with documented minimum and maximum
   stabilization periods and explicit rollback. No adaptation based on a
   single RTT sample, no infinite escalation under partition, and no
   opportunistic timer changes during critical membership transitions.
6. Source of latency should include authenticated real peer messages,
   p95/p99 and recent stalls, event-loop scheduling gaps, route churn,
   cancellation, and queue pressure. The latency group/placement owner
   supplies observations; timing policy cannot become a second placement
   decision.
7. Preserve request/transaction deadlines and control-plane authority.
   Evaluate the 5 s default transport delivery timeout, 1 s ping timeout,
   5 s control heartbeat, 15 s ready lease and failure-detector
   classification when proposing 10–20 s elections. Each owner keeps its
   own decision, but conflicting assumptions need one named interaction.
8. `check_quorum`, `pre_vote`, follower reads, `ReadIndex`, transfer and
   per-replica election staggering must be rechecked without modifying
   already sealed rs-raft acceptance. Do not switch these flags as an
   incidental timing change.

## E. NATS-only plan (first independent backend)

Use [Core NATS pub/sub](https://docs.nats.io/concepts/pub-sub-basics)
for node-addressed frames; Core NATS is at-most-once, without broker
persistence. JetStream is not a substitute for Raft log durability, so do
not introduce a second replay authority. Default server messages are limited
to 1 MiB; large frames and bulk must be explicitly bounded.

- One scoped subject per cluster/node/incarnation or equivalent authenticated
  subscription contract; no wildcard subscription that crosses cluster
  security boundaries. New broker connections and subject permissions
  authenticate *to broker*; cluster identity and sender authorization still
  belong to the Lagrange router.
- An initial bootstrap seed subject/config may be operator-provided out of
  band. It is a dial hint, never proof of membership/readiness. Once control
  metadata is available, existing endpoint-incarnation authority controls
  route publication.
- The broker delivery receipt is not a Lagrange application ACK. Preserve
  message correlation, bounded send admission, idempotency and the
  current router's retry/caller-deadline semantics.
- Broker loss is a transport partition. Reject/hold explicitly, and prove
  recovery without declaring stale/unavailable replicas healthy or
  authorizing unsafe membership changes.
- Build NATS-native bounded bulk transfers or fragmentation for all
  message classes, with critical lane reserve, byte-denominated pacing
  and snapshots at 16 MiB+; never fall back to WebSocket.
- Disallow every inter-node direct socket route during the NATS-only proof.
  Separately test broker outage, rebalance, seed loss, learner catch-up and
  restart with a new broker address.

## F. Veilid-only plan (second independent backend)

Authoritative external evidence: the Veilid
[RoutingContext API](https://docs.rs/veilid-core/latest/veilid_core/struct.RoutingContext.html),
[VeilidAPI route lifecycle](https://docs.rs/veilid-core/latest/veilid_core/struct.VeilidAPI.html),
[networking guide](https://veilid.com/documentation/networking/), and
[sequencing model](https://docs.rs/veilid-core/latest/src/veilid_core/veilid_api/types/safety.rs.html).

- `app_message` and `app_call` accept at most **32768 bytes of application
  payload**. AppMessage returns when dispatched, not when a peer has committed
  or processed it. AppCall has one bounded response. Neither supplies
  Lagrange's semantic ACK; sequencing preferences do not guarantee
  delivery across network failure.
- Current API defaults to safety routing, and direct targeting by
  `NodeId` is gated behind a deliberately unsafe `footgun-nodeid-target`
  feature. Plan around private `RouteId` publication/import by default,
  not privacy-disabling shortcuts.
- `new_private_route` allocates/tests a route and returns a **publishable
  route blob**; another node imports it, and both owners must release their
  owned routes. Route lifecycle, rotation, expiry, startup discovery, and
  address-to-route currentness need an explicit durable/publication boundary.
  A previously trusted blob is only connectivity, not current membership.
- Bootstrap cannot depend on reading Lagrange's own `node_endpoints` via
  Veilid before it has any initial contact. Explicit configured seed route
  or secured out-of-band mechanism is allowed for first contact; it is
  replaced by authoritative endpoint publication after join.
- A 1 GiB transfer would need at least **32768 frames** if every frame
  carried a full 32768-byte fragment, even before framing headers, route
  control or retries; real count is higher. Both Raft Append envelopes
  *and* snapshots may exceed one Veilid message and require bounded
  chunking/reassembly, integrity, cancellation and restart-safe resumption.
- Reuse Lagrange's existing bulk byte-rate, pending and admission *policy*
  as one owner, but expose priority separation on the sole Veilid backend
  (separate logical lanes or traffic classes). Avoid blocked bulk consuming
  all memory or starving Raft heartbeat/ready traffic.
- A Rust sidecar using `veilid-core` and a bounded local IPC port is a
  candidate implementation, not a mandatory product design. The local
  sidecar link does not count as an alternative *remote* transport.
- Current Veilid route length, relay placement, CPU, and tail-latency costs
  must be measured rather than assumed. Do not equate a safety route's
  configured extra hops with exactly three global physical transmissions.
- Disallow node-to-node WebSockets and all broker connections in the
  acceptance run, including during snapshot catch-up and restarts.
- Prove public and private Veilid network choices independently; an external
  relay may move traffic/cost outside the 100 Lagrange nodes. Standalone
  means no other Lagrange inter-node transport, not absence of Veilid
  network bootstrap infrastructure.

### Confidentiality and cluster admission

Veilid's routing encryption protects overlay communication, but the
application still must authorize sender, cluster ID, destination, node
incarnation, requested capability and current membership/admission.
Node IDs, route IDs and route blobs are not interchangeable security
claims. Reject replay, cross-cluster route publication, route-owner
impersonation and stale-incarnation traffic in the same `MessageRouter`
authority for every backend.

## G. Quantitative hypotheses — how to actually measure 100 nodes

A minimal heartbeat-only *payload* model with replication factor 3 is:

`cluster_application_bytes_per_second = raft_groups × 2 × heartbeat_frequency_hz × mean_request_plus_response_bytes`.

For 1000 groups, 20 Hz, and an **assumed, unmeasured** 1 KiB
request+response pair: about **40 MiB/s** cluster-wide logical traffic.
If every application message took *exactly* three physical overlay edges
and all relaying happened among the 100 cluster members, the aggregate
wire payload and average aggregate per-node up+down consumption are
roughly three times logical transmission volume. **Neither the mean
message size, hop count nor relay location has been established**, and
the former 19–20 Mbps/node figure is not a capacity requirement or
benchmark result.

The traffic model must separate:

- Raft heartbeats, votes, append acknowledgements, payload replication,
  catch-up and heartbeat suppression/coalescing;
- control-plane/node heartbeats, CDC, placement and monitoring;
- service invocation fanout, partials, query and transaction responses;
- fragmentation overhead, Veilid route establishment/refresh, retransmits,
  physical hop count and third-party relay capacity;
- ordinary cluster traffic versus the destructive startup/replacement,
  snapshot and partition-repair peaks.

**Measure, do not infer:** instrument physical byte counters at Lagrange
boundary and overlay interface, messages/sec, payload/frame-size
histograms, overlay edge/relay cost, event-loop/CPU/wall timings, route
allocation churn, p50/p95/p99/p99.9 RTT and end-to-end Raft
convergence. Derive true 100-node numbers from 3-, 10-, 30- and
100-node runs with **100, 1000 and 10000 groups** as hardware and
replica limits allow, using identical workloads and pinned source SHA.
Record steady idle, read-dominated, write-heavy, mixed, partitioned,
catch-up, and seed-loss windows separately.

Stop if a size/message-rate limit makes quorum unstable, if routing
latency exceeds the chosen failure budget, or if the single-backend
bulk path cannot make bounded forward progress. Report the supported
envelope honestly rather than hiding a failure behind another backend.

## H. Verification and implementation graph

The parent epic's frontier order applies. Here are concrete acceptance
falsifiers for Quest authors.

| Interaction | Minimal evidence | Failure to reject |
| --- | --- | --- |
| Timing config -> native core | Unit core adapter probe + actual group pcap/on-wire timing + introspection at exact SHA | "Applied" config with unchanged core counts or divergent recovery budget |
| Current peer endpoints -> backend link | Deterministic CDC/incarnation replay plus restart/new endpoint | Routing to stale endpoint or admitting zombie peer |
| Peer link -> router semantics | Fault-injection equivalence vs WebSocket, ACK/response/cancel/pressure tests | Double retry, acknowledged-but-undelivered application state, unbounded buffering |
| Raft -> link | Three-voter test with induced delay, reorder, loss, duplicate, congestion and leader replacement | Safety regression, false green leader, lost acknowledged write |
| Snapshot/bulk -> link | 16 MiB+, 1 GiB and cancel/partial-transfer scenarios when feasible | Hidden WebSocket lane, memory growth, starvation or incomplete recovery |
| Core NATS standalone | 3/5/10 nodes with direct node ports prohibited | Success due to silent WebSocket mesh or JetStream durable surrogate |
| Veilid standalone | 3/5/10 nodes plus 30/100 scale characterization | Success due to different remote transport, route spoofing, or load-dependent quorum loss |
| Timing profile transitions | Repeated restarts and mixed-old/new profile application at group boundary | Unbounded liveness loss or silent recovery/transaction deadline extension |
| Network/security | Authenticated peer identity, forged-cluster/route/incarnation attacks | Cryptographic link mistaken for membership authority |
| Exact-run certification | Signed or integrity-bound offline receipts, negative controls, same frozen SHA | Fake success from stale logs, partial coverage or a missing witness |

No performance budget is frozen by this document. Make baselines measurable
and then select objective, hardware-specific acceptance bounds under owner
review. Read-only probes only inspect already-produced receipts; they do not
start labs, contact brokers/relays, or schedule runs.

## I. Open research questions to close with evidence

1. Does Lagrange's current rs-raft core binding expose enough primitives
   for genuine dynamic heartbeat/election reconfiguration? If not, which
   bounded lifecycle preserves log/commit/role safety with no voter
   recreation workaround?
2. Do real raft-rs `Ready` packets immediately carry newly proposed
   entries through `MessageRouter.tryDeliverRaftDirect`, even when
   heartbeat cadence becomes 750 ms? What is the effect on read-index/
   commit-index propagation, backpressure and quorum read paths?
3. What actually determines the low and high election windows given
   per-replica jitter? Is the configured max value currently unused
   everywhere on the rs-raft partition path?
4. Which owners should resolve inconsistent global resource-adaptive
   switches and group-level network-aware policies, and what is the
   atomic profile-version publication/grace contract?
5. How do 5 s transport deadlines, 1 s peer ping deadlines, 5 s
   control-plane heartbeats and 15 s readiness leases behave under
   overlay-tail network latency? Which *interaction owner* decides the
   semantic hold outcome?
6. Are Veilid private-route lifetime, revision, storage and import costs
   acceptable for hundreds of nodes? Which trusted seed route is needed
   to break cold-start circularity?
7. Can Veilid sustain required message-rate and fragmented 1 GiB bulk
   with bounded p99 delay and no heartbeat starvation using only overlay
   frames and shared routing resources?
8. What privacy model is non-negotiable (sender/receiver anonymity,
   Veilid network type, relay geography)? Does a lower-hop
   configuration accidentally violate that product contract?
9. Which diagnostic and fairness metrics from current transport pressure
   owners can be reused without retaining any WebSocket-specific
   assumptions?

## J. Source references

### Lagrange source at pinned commit

- [Timing configuration](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/config/config-definitions.js)
- [Config propagation](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/config/dynamic-config-startup-wiring.js)
- [Timing selector](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/config/raft-adaptive-timing-controller.js)
- [Tick to core mapping](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/raft/raft-rs-runtime-tuning.js)
- [Operation-port timer](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/raft/raft-rs-operation-port.js)
- [Live core owner](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/raft/raft-rs-runtime-owner.js)
- [Raft packet delivery](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/raft/raft-rs-peer-delivery.js)
- [Router delivery](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/transport/message-router-delivery-behaviors.js)
- [Bulk channel](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/transport/bulk-transfer-channel.js)
- [Transport owner card](https://github.com/psvensson/lagrange/blob/47889ca3443abf04a5a79252f4b6db95a28799b5/src/transport/README.md)

### Upstream definitions (retrieved 2026-10-17)

- [raft-rs Config and election tick fields](https://docs.rs/raft/latest/raft/struct.Config.html)
- [raft-rs RawNode API](https://docs.rs/raft/latest/raft/raw_node/struct.RawNode.html)
- [raft-rs append and heartbeat mechanics](https://github.com/tikv/raft-rs/blob/master/src/raft.rs)
- [NATS Core pub/sub and payload semantics](https://docs.nats.io/concepts/pub-sub-basics)
- [Veilid RoutingContext app messages and safety](https://docs.rs/veilid-core/latest/veilid_core/struct.RoutingContext.html)
- [Veilid private-route creation/import/release](https://docs.rs/veilid-core/latest/veilid_core/struct.VeilidAPI.html)
- [Veilid sequencing limits](https://docs.rs/veilid-core/latest/src/veilid_core/veilid_api/types/safety.rs.html)
- [Veilid network infrastructure](https://veilid.com/documentation/networking/)

## K. Handoff and non-claims

This is research and a proposed execution contract, not an independently
reviewed source change. It commits no code, tests, running services or
capacity numbers. Implementers must reread current source, seal bounded
Quests with real red probes, obtain independent owner review, and meet the
exact-head rs-raft baseline and publication requirements. An implementation
that only succeeds by mixing transports is explicitly out of scope.

**Next action when rs-raft baseline is accepted:** create the first
instrumentation/owner-boundary Quest (N0), with an executable red on-wire
timing oracle and the complete list of source/test paths authorized; then
follow N1 and N2. Do not begin at Veilid fragmentation or timeout tuning
before these observations exist.
