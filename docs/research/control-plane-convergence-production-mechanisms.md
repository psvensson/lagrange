# Control-plane truth convergence: how production systems avoid the "physically healthy, authoritatively stale" failure

**Context.** Lagrange's failure class: physical placement is correct (raft group 3/3, leaders elected), but the *authoritative control-plane read* of membership / replica role / partition leader-ownership is stale, because control-plane rows are written and read through a single leader-funneled path (one write-leader node; non-leaders defer ~3000 times; new-replica role rows fail to persist through the funnel under load). Downstream consumers (deficit detector, planning gate, placement fence) then act on phantom state: "2<3 replicas" against a healthy 3/3 group, "missing active leader" for minutes.

**The shared root cause across every system below:** a *single funneled writer/reader of truth* is an anti-pattern at production scale. Every production system below replaces it with one of two named wheels (often both):

1. **Consensus-replicated truth, served from *local replicas* with a freshness/leadership proof** — so reads never funnel through one node's log application.
2. **Separation of *liveness/membership* (eventually consistent, gossiped, locally readable) from *authoritative state* (consensus, but read via lease+index, not via the writer).**

Below, per system: the named canonical mechanism(s), how each works, and citations. Then a synthesis naming the canonical wheel and the 1–2 best precedents for Lagrange.

---

## 1. CockroachDB — range leases (Leader leases), meta-ranges as data, gossip for liveness, local leaseholder reads

**Named mechanisms:** (a) **range leases** (now **Leader leases**, v25.2+), (b) **meta-ranges as ordinary KV data**, (c) **gossip** for node liveness / first-range location, (d) **leaseholder bypasses Raft for reads**.

How it avoids the funnel:

- **Truth is stored as data, replicated, and cached locally — not owned by one writer.** The location of every range (its replicas, hence membership/leadership routing) lives in a two-level index `meta1`/`meta2`, which are *ordinary replicated KV ranges*. Every node caches `meta2` (range descriptors) and `meta1` location is "distributed among all the nodes in the cluster using a gossip protocol." So any node answers "where is this range / who holds it" from local cache or a gossip-provided root, never by asking a single control-plane leader. ([distribution-layer])
- **Lease ≠ Raft leader, and the leaseholder serves reads locally without Raft round-trips.** A single replica is the **leaseholder** — "the only node that can serve reads or propose writes." Critically: "When serving strongly-consistent (aka 'non-stale') reads, **leaseholders bypass Raft**; for the leaseholder's writes to have been committed in the first place, they must have already achieved consensus, so a second consensus on the same data is unnecessary." ([replication-layer#leases]) This is the canonical "read authoritative state locally with a lease, not through the log" move.
- **The lease is a *durability/liveness proof*, not a leader-RPC.** **Leader leases** tie the lease to *store liveness* via quorum "fortification": a replica can only become Raft leader (and hence leaseholder) if "fortified" by a quorum of stores. "This guarantee enables … improvements … that were prevented by the need to handle cases where Raft leadership and range leases were not colocated," and "remove[s] the need for the single point of failure (SPOF) that was the node liveness range." ([replication-layer#leader-leases]) The older epoch-based design explicitly documented the SPOF/funnel risk of a single liveness range. ([range-leases RFC])
- **Gossip is used for what gossip is good at** (liveness, bootstrap addressing); consensus for what must be true (placement, lease). ([distribution-layer: meta1 via gossip]; [replication-layer#leader-leases: liveness for membership/decommission/rebalance])

**Why it does NOT have Lagrange's problem:** there is no single control-plane writer whose congestion can starve a role-row. Membership/leadership *is the data plane*, replicated and locally cached; leadership is proven by a lease object readable at the leaseholder without contacting a funnel; liveness is gossip, not a consensus row behind one writer.

Citations: distribution-layer (meta ranges as data, meta1 via gossip, per-node meta2 cache); replication-layer (leases, Leader leases, leaseholder bypasses Raft); range-leases RFC (epoch leases, liveness range SPOF).

---

## 2. TiKV / PD (Placement Driver) — PD as scheduler source-of-truth fed by *two heartbeat streams*, region epoch, reads served from PD leader

**Named mechanisms:** (a) **PD as the "brain" / single source of scheduling truth**, (b) **two independent heartbeat streams up to PD** (store heartbeats + region-leader heartbeats), (c) **region epoch** for staleness fencing, (d) **operators piggybacked on heartbeat responses** (pull, not push).

How it avoids the funnel:

- **Truth flows UP from the edges, not DOWN from one writer.** PD "stores metadata of real-time data distribution of every single TiKV node and the topology structure of the entire TiDB cluster … according to the data distribution state **reported by TiKV nodes in real time**." ([tidb-architecture]) TiKV reports two streams: per-store heartbeats (`StoreState`: disk, region count, load, overload, labels) and per-region-leader heartbeats (`RegionState`: leader position, positions of *other replicas*, number of offline replicas, read/write speed). ([tidb-scheduling#information-collection]) The authoritative membership/leadership fact is *asserted by the region leader itself*, not inferred by a funnel.
- **Consumers read PD's converged view; PD itself is replicated (≥3 nodes) and HA.** PD is "the brain," run as an odd number of nodes. ([tidb-architecture]) Reads of topology hit the PD leader; PD is not a single node whose congestion stalls a role-row — it's a replicated raft-backed store.
- **Region epoch fences staleness.** Every region carries an epoch (conf_ver + version) bumped on membership change / split; PD and TiKV use it to reject stale decisions. (This is the epoch-fencing half of the wheel; see synthesis.)
- **Scheduling is pull-based, so a congested PD does not strand a replica.** "Every time PD receives a Region heartbeat from a Region leader, it checks whether there is a pending operator … it puts the operator into heartbeat responses, and monitors the operator by checking follow-up Region heartbeats." Operators are "only suggestions." ([tidb-scheduling#implementation])

**Key honesty note:** PD *is* a centralized brain, but it avoids Lagrange's trap because (i) the *authoritative* membership/leader fact is **reported by the region leader up**, and (ii) reads of that fact are served from PD's replicated store, not from a single congested writer's log application. The deficit a replica physically exists is known to PD *because the leader said so*, not because a funnel persisted a role-row.

Citations: tidb-architecture (PD brain, ≥3 nodes, real-time reporting); tidb-scheduling (two heartbeats, RegionState fields, operators in responses, region epoch for scheduling).

---

## 3. etcd / Raft — ReadIndex and lease-read: linearizable reads WITHOUT funneling through the leader's log application

**Named mechanisms:** (a) **ReadIndex** (Raft paper §8), (b) **lease read** (leader lease), (c) **serializable (member-local) reads** as the explicit stale-tolerant mode, (d) **PreVote** (availability, not consistency).

How a follower/client gets a linearizable read without the funnel:

- The etcd docs state the trade-off plainly: "etcd ensures linearizability for all … operations by default. Linearizability comes with a cost … because **linearized requests must go through the Raft consensus process**. To obtain lower latencies and higher throughput … clients can configure a request's consistency mode to **serializable**, which may access stale data with respect to quorum, but removes the performance penalty of linearized accesses' reliance on live consensus." ([api_guarantees])
- **ReadIndex** is the canonical mechanism that makes the *default* linearizable read cheap and *not* a log-append: the leader, on a read, (1) confirms it is still leader by exchanging one heartbeat round with a quorum, then (2) serves the read once its state machine has applied at least up to the current commit index. No new log entry is written. (Raft paper, §8 "Processing client requests"; this is the standard mechanism etcd's linearizable read path implements.)
- **Lease read** is the further optimization: if the leader's clock is trusted and it holds a lease (its election timeout hasn't elapsed), it can answer reads *without even the ReadIndex quorum round*, because no other leader could have been elected. This is exactly CockroachDB's "leaseholder bypasses Raft" (§1) and is the named pattern for Lagrange.
- **Serializable / member-local reads** are etcd's honest escape hatch: serve locally, possibly stale, in exchange for availability — the same dial Consul exposes as `stale`.
- **PreVote** is orthogonal (prevents a partitioned follower from disrupting the cluster with a higher term) — included for completeness; it does not address read freshness.

**Why it does NOT have Lagrange's problem:** a read of authoritative KV state never has to be *written through* or *funneled behind* a congested leader's log application. The leader proves leadership via ReadIndex (one heartbeat round, no append) or serves lease-reads; followers can serve serializable reads. A "phantom stale leader" read is a deliberate, bounded client choice (serializable), not an emergent artifact of a congested writer.

Citations: api_guarantees (linearizable vs serializable, linearizable via Raft); Raft paper §8 (ReadIndex, lease read); etcd api (serializable flag on RangeRequest, revision as logical clock).

---

## 4. Consul — Serf gossip for membership/liveness (local, eventually consistent) vs Raft for catalog truth (consistency-mode reads)

**Named mechanisms:** (a) **two-plane split: Serf/SWIM gossip (LAN+WAN pools) for membership & failure detection**, (b) **Raft for the catalog/KV (strongly consistent)**, (c) **three explicit read consistency modes** (`stale` / `default` / `consistent`), (d) **staleness telemetry headers** so consumers can *detect* staleness.

How consumers know which plane to read:

- **Membership/liveness is gossip, read locally, never funneled.** "Consul uses [Serf] to manage membership … The LAN gossip pool … share[s] membership information … and distribute[s] failure detection throughout the cluster." This is the Lifeguard-enhanced SWIM protocol. ([gossip]) Consumers of *liveness* read their local agent's gossip view — there is no single writer to congest.
- **Catalog/KV truth is Raft, and consumers pick a freshness/consistency dial.** "`stale` … allows any server to handle the read regardless of whether it is the leader … generally consistent to within 50 ms … no upper limit"; "`default` … strongly consistent in almost all cases … small window in which a new leader may be elected during which the old leader may respond with stale values"; "`consistent` … requires that a leader verify with a quorum of peers that it is still leader" (this is ReadIndex, §3). ([consistency-modes])
- **Consumers can *measure* staleness rather than trust it.** Responses carry `X-Consul-LastContact` (ms since leader contact) and `X-Consul-KnownLeader`, "used by clients to gauge the staleness of a result and take appropriate action." And `X-Consul-Effective-Consistency` reports which mode actually served the read. ([consistency-modes#visibility]) This is a direct, named countermeasure to acting on phantom-stale state: the read tells you how stale it is.
- **Bounded staleness as a policy knob.** `discovery_max_stale` / `dns_config.max_stale` force a too-stale follower read to be upgraded to a leader read.

**Why it does NOT have Lagrange's problem:** liveness consumers read gossip (no funnel); catalog consumers choose an explicit consistency mode *and get staleness telemetry*, so a placement-fence-style consumer can demand `consistent` (ReadIndex) or reject reads older than `max_stale`. A deficit detector reading gossip is *told* it's reading eventually-consistent liveness, not authoritative placement.

Citations: gossip (Serf pools, membership/failure detection); consensus (Raft for catalog, leader records authoritative log); consistency-modes (three modes, headers, max_stale).

---

## 5. KRaft (Kafka) — the metadata quorum as an event log; brokers PULL metadata into local replicas (no push, no funnel)

**Named mechanisms:** (a) **metadata as an event log** (single source of truth = a replicated Raft log, the "metadata quorum"), (b) **MetadataFetch: brokers pull deltas from the active controller**, (c) **local persisted metadata snapshots on each broker**, (d) **fencing via integrated membership+metadata (Fenced state)**, (e) **broker epochs** (staleness fencing).

How it avoids the funnel — this is the *most directly applicable* precedent (see synthesis):

- **The truth is a log; every consumer maintains a local replay, keyed by a single offset.** KIP-500's core motivation: "metadata should be stored in Kafka itself … **Rather than pushing out notifications to brokers, brokers should simply consume metadata events from the event log. This ensures that metadata changes will always arrive in the same order.** Brokers will be able to store metadata locally in a file." ([KIP-500])
- **Reads of controller/broker/leader state are served from each broker's local materialized image, not from the controller.** "The broker will periodically ask for metadata updates from the active controller … track the offset of the last updates it fetched, and only request newer updates … Most of the time, the broker should only need to fetch the deltas." ([KIP-500#broker-metadata-management]) A broker's view of "who is leader of partition P" is its *local replay of the metadata log* — it does not RPC a congested leader to find out.
- **The old failure was literally Lagrange's failure.** KIP-500 names it: with push-based ZK, "it is possible for brokers to get some of the changes, but not all … This can leave brokers in a divergent state," and "the state in ZooKeeper often doesn't match the state that is held in memory in the controller." The fix is the pull/event-log wheel.
- **Fencing kills the phantom-leader problem at the source.** A broker that cannot receive metadata updates is *removed from the cluster*: "Brokers cannot continue to be members of the cluster if they cannot receive metadata updates … the broker will be removed from the cluster if it is partitioned from the controller." Brokers enter a **Fenced** state and refuse client RPCs until caught up. ([KIP-500#broker-state-machine]) So no consumer can be fooled into acting on a leader that the control plane has moved past — the stale node is fenced out. Broker **epochs** (assigned at registration) fence stale brokers' requests, exactly the "lease + epoch fencing" pattern.

**Why it does NOT have Lagrange's problem:** there is no "write-leader funnels control-plane rows that other nodes must read." The active controller *appends to a Raft log*; every broker *pulls the log* and materializes it locally; a consumer (ISR manager, partition state machine) reads its *own local image*; and a node too stale to trust is fenced. Phantom "missing active leader" is impossible because a broker that can't see the current leader is not allowed to serve.

Citations: KIP-500 (metadata as event log; pull vs push; broker metadata management, snapshots, MetadataFetch as heartbeat; Fenced state; "brokers cannot continue to be members …"; controller quorum Raft; snapshots to disk).

---

## 6. Kubernetes — etcd (linearizable by default) + API-server watch, and controllers read *informers/caches* keyed by resourceVersion; controllers are leader-elected

**Named mechanisms:** (a) **watch + informer + local cache (reflector → DeltaFIFO → store)**, (b) **resourceVersion** as the freshness/optimistic-concurrency token, (c) **controller leader election via Leases** (coordination.k8s.io), (d) **etcd linearizable-by-default reads underneath** (§3).

How controllers read authoritative state without hammering/funneling, and avoid acting on stale cache:

- **The read path is a cached watch, not a poll against one writer.** Controllers don't GET objects in a loop; they establish a **watch** on the API server, which streams ordered, reliable, resumable events (etcd watch guarantees: ordered, unique, reliable, resumable, bookmarkable; §3). Each controller process keeps a local **informer cache** materialized from that stream. Reads hit the local cache, not etcd, and not a single control-plane leader.
- **resourceVersion makes staleness *detectable and enforceable*.** Every object carries a `resourceVersion` (backed by etcd's revision, §3). A controller (i) starts its watch from a known resourceVersion and is *guaranteed* no gaps, and (ii) does compare-and-swap writes (`resourceVersion` precondition) so it cannot act on a stale read of an object it intends to mutate. A watch that falls too far behind gets a `410 Gone`/compact error and must re-list — the system *tells* the consumer its cache is untrustworthy rather than letting it act stale.
- **Leader election prevents *two* controllers from acting, but reads stay local.** Controllers elect one active instance via a **Lease object** ("Kubernetes also uses Leases to ensure only one instance of a component is running at any given time"). ([k8s-leases]) This bounds *who acts*, while the *what's true* read remains the local informer cache. So a deficit-detector-style consumer never funnels reads through the elected leader — it reads its own cache and only the leader *acts*.
- **Honesty note:** informer caches are deliberately *eventually consistent* (stale-tolerant) for scalability; Kubernetes' answer to "don't act on phantom-stale" is **resourceVersion fencing on writes + leader election for who may act + re-list on compaction**, not strongly-consistent reads of every object. It trades read freshness for scale, and uses the version token + single-actor discipline to stay correct.

**Why it does NOT have Lagrange's problem:** reads of object truth are served from per-consumer local caches fed by an ordered watch (not a single congested writer's read path); staleness is *named and checked* via resourceVersion; and mutation authority is serialized by a Lease, so even if a cache lags, only one actor mutates and it does so with a version precondition that fails on staleness.

Citations: k8s controllers (control loops watch cluster state, desired vs current); k8s leases (Lease for leader election, node heartbeats via Lease renewTime); etcd api_guarantees (watch ordered/reliable/resumable; revision as logical clock; linearizable default) — the substrate under the API server.

---

## Synthesis — what is the canonical wheel?

Your problem, restated precisely, is: **consumers must read a locally-available, fresh-enough, authoritative view of membership/leadership instead of a stale leader-funneled read.** Production systems solve it with exactly two named wheels, used alone or together:

### Wheel A — "Consensus truth, read locally with a lease + index proof" (ReadIndex / lease-read)
*Named:* **ReadIndex**, **lease read** (Raft paper §8; etcd linearizable read; CockroachDB "leaseholder bypasses Raft"; Consul `consistent` mode).
*Shape:* writes go through consensus once; reads are served by the current leader/leaseholder *without* a new log append, after a cheap leadership proof (one quorum heartbeat round = ReadIndex, or an unexpired lease = lease read). Freshness is *proven*, not assumed.
*Use when:* the consumer needs a *strongly-consistent* answer (a placement fence that must not act on a phantom missing leader).

### Wheel B — "Metadata as a replicated event log; consumers pull into local materialized views; fence the stale"
*Named:* **metadata log replication to local replicas** (KRaft KIP-500: "brokers simply consume metadata events from the event log … store metadata locally"); **informers/watch+cache with resourceVersion** (Kubernetes); **PD heartbeats up / operators down** (TiKV/PD).
*Shape:* the control-plane truth is an append-only, totally-ordered log. Every consumer keeps a *local replay* and reads that. A single offset/revision/resourceVersion names a consumer's position. Crucially, **staleness is made first-class and fenced**: a node too far behind is fenced out of membership (KRaft Fenced state), or its writes fail a version precondition (Kubernetes resourceVersion), or its reads carry staleness telemetry (Consul `X-Consul-LastContact`).
*Use when:* many consumers must read the *same* truth and you'd rather they read local replicas than all hit the leader — and when you can fence/de-authorize a stale reader.

### Two supporting sub-patterns that both wheels rely on
- **Split liveness from truth** (gossip/SWIM for "is it alive," consensus for "what is the placement"): CockroachDB gossip/meta1, Consul Serf-vs-Raft, etcd/Consul serializable-vs-linearizable. Never make liveness a consensus row behind a single writer.
- **Epoch / version fencing** (region epoch, broker epoch, resourceVersion, lease epoch): every authoritative record carries a monotonically increasing token so a consumer can *detect* that its view is behind, and so stale writers/actors are rejected rather than believed.

---

## Best precedent for Lagrange

Your shape: single-leader-funneled control-plane writes, raft per partition, and consumers (deficit detector, planning gate, placement fence) that must not act on phantom-stale leader/deficit state.

**#1 — KRaft's "metadata as an event log, pulled into local replicas, stale nodes fenced" (Wheel B).** This is the closest structural match and directly eliminates your funnel. Make control-plane rows (membership, replica role, partition leader-ownership) entries in a *replicated log* that each node consumes and materializes locally (à la `MetadataFetch` + local snapshot). The deficit detector / planning gate / fence then read their *own* converged local image, keyed by a log offset — never the write-leader. KIP-500 is literally a post-mortem of your bug ("brokers … get some of the changes, but not all … divergent state") and its fix.

**#2 — ReadIndex / lease-read (Wheel A) for the consumers that must be strongly consistent.** For the placement fence specifically — the consumer that today waits on a phantom "missing active leader" — serve that read the way etcd/Consul `consistent` and CockroachDB leaseholders do: the partition's raft leader answers "am I the leader / is there an active leader" with a ReadIndex (one quorum heartbeat, no log append) or under an unexpired lease. This makes "active leader present" a *proven, fresh* local fact, immune to a congested write-funnel.

**And two discipline rules the precedents force on you:**
1. **Make staleness observable and fenced, not silent.** Attach a version/epoch (region-epoch / broker-epoch / resourceVersion analog) to every role/membership/leadership row, and have the deficit detector and fence *refuse to act* (or trigger a re-sync) when their view is older than a bound — exactly Consul's `X-Consul-LastContact` / `max_stale` and KRaft's Fenced state. Your "2<3 replicas against a healthy 3/3" bug is a *consumer acting on un-fenced staleness*; the fix is as much "fence the reader" as "fix the writer."
2. **Report leadership/membership up from the edge, don't infer it at the funnel.** PD's region-leader heartbeats (the leader asserts its own position and its replicas' positions) is the reason PD doesn't believe a phantom deficit: the physically-healthy group *self-reports*. A new replica's existence should be known because the *partition raft group says so*, not because a role-row survived a congested single-writer path.

**Where systems honestly do NOT have your problem:** CockroachDB and KRaft structurally *cannot* — membership/leadership *is* replicated data read locally, and stale nodes are fenced. etcd/Consul avoid it by giving consumers an explicit, telemetry-tagged freshness dial (linearizable/ReadIndex vs serializable/stale) so a stale read is a *choice*, never a surprise. Kubernetes accepts eventually-consistent informer reads but fences mutations with resourceVersion and serializes actors with a Lease — it trades read freshness for scale and stays correct via the version token.

---

## Citations

- CockroachDB — distribution-layer: https://www.cockroachlabs.com/docs/stable/architecture/distribution-layer (meta1 via gossip; per-node meta2 cache; range descriptors as KV)
- CockroachDB — replication-layer: https://www.cockroachlabs.com/docs/stable/architecture/replication-layer (leaseholder; "leaseholders bypass Raft"; Leader leases; store liveness; SPOF of node liveness range)
- CockroachDB — overview (leaseholder = raft leader): https://www.cockroachlabs.com/docs/stable/architecture/overview
- CockroachDB — range leases RFC (epoch leases, liveness SPOF): https://github.com/cockroachdb/cockroach/blob/master/docs/RFCS/20160210_range_leases.md
- TiDB — architecture (PD brain, ≥3 nodes, real-time reporting): https://docs.pingcap.com/tidb/stable/tidb-architecture/
- TiDB — scheduling (store + region-leader heartbeats, RegionState fields, operators in responses): https://docs.pingcap.com/tidb/stable/tidb-scheduling/
- etcd — API guarantees (linearizable-by-default via Raft consensus; serializable local reads; revision as logical clock; watch guarantees): https://etcd.io/docs/v3.5/learning/api_guarantees/
- etcd — API (serializable flag on RangeRequest; watch stream; leases): https://etcd.io/docs/v3.5/learning/api/
- Raft paper (ReadIndex & lease read, §8 "Processing client requests"; PreVote §9.6): https://raft.github.io/raft.pdf
- Consul — gossip (Serf LAN/WAN pools, membership & failure detection, Lifeguard): https://developer.hashicorp.com/consul/docs/concept/gossip
- Consul — consensus (Raft for catalog; leader records authoritative log): https://developer.hashicorp.com/consul/docs/concept/consensus
- Consul — consistency modes (stale/default/consistent; `X-Consul-LastContact`, `X-Consul-KnownLeader`, `X-Consul-Effective-Consistency`; max_stale): https://developer.hashicorp.com/consul/api-docs/features/consistency
- Kafka — KIP-500 (metadata as event log; pull not push; MetadataFetch; broker snapshots; Fenced state; "brokers cannot continue to be members if they cannot receive metadata updates"): https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum
- Kubernetes — controllers (control loops watch cluster state): https://kubernetes.io/docs/concepts/architecture/controller/
- Kubernetes — Leases (leader election via Lease; node heartbeats via renewTime): https://kubernetes.io/docs/concepts/architecture/leases/

*Note on a deliberate honesty caveat:* etcd's docs state linearizable reads "must go through the Raft consensus process"; the *named mechanism* that makes this cheap and non-log-appending is ReadIndex (Raft paper §8), which etcd's linearizable read path implements — the docs describe the guarantee, the paper names the mechanism. Similarly, Consul's `consistent` mode ("leader verify with a quorum of peers that it is still leader") is ReadIndex by another name.
