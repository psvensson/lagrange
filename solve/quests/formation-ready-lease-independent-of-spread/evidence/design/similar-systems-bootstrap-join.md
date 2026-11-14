# Bootstrap and join in mature systems: how circular readiness is avoided

Method: official docs, design posts and source fetched 2026-11-14. Claims carry a URL. "UNCONFIRMED" means I could not verify it from a primary source in this pass. Several doc pages I tried returned 404 or omitted the topic, and that is noted where it matters.

## Per system

### CockroachDB
- Bootstrap: `cockroach init` is a one-time initialisation run against a node from the `--join` list. Until then, nodes are "waiting to be initialized as a new cluster". https://docs.cockroachlabs.com/docs/stable/cockroach-init
- Join: a node tries `--join` hosts until it "can join the gossip network". The join list is persisted in the data dir. https://docs.cockroachlabs.com/docs/stable/cockroach-start
- Q1/Q2 (what makes a node eligible): the docs say a new node reports available space and the cluster rebalances replicas onto it. A replica arrives as a snapshot from the leaseholder, then catches up via the Raft log. https://docs.cockroachlabs.com/docs/stable/architecture/replication-layer Placement is downstream of liveness and gossip/capacity. I found no precondition that existing data is already spread. Fully confirming the store-pool eligibility filter (live, not draining, not decommissioning) is UNCONFIRMED; I only saw it in lease-target code and the node-count comment. https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/kv/kvserver/allocator/allocatorimpl/allocator.go
- Q3 (separate signals): the docs say node heartbeats decide membership, dead status and where replicas avoid placement. Newer versions use leader leases for lease and Raft-leadership health. The per-replica "caught up" state is Raft's own. https://docs.cockroachlabs.com/docs/stable/architecture/replication-layer Under-replication is a per-range allocator action ("Range is under-replicated, and should add an additional voter"), not a node-level gate. The allocator-source URL above has this.
- Q4 (alone): `GetNeededVoters` lowers the target replication factor "if there are fewer nodes than replicas specified in the zone config". A one-node cluster is therefore at its achievable factor and serves traffic. The allocator-source URL above has this. Whether the docs call this state "under-replicated" is UNCONFIRMED. The system-range factor of 5 is UNCONFIRMED from the pages I could read.
- Q5 (one-shot handoff): `init` is the only one-shot step. It is not a token that expires, and persisted state makes later starts level-triggered. No seed-issued join authorisation was found.
- Q6: no documented bootstrap deadlock found.

### TiDB / TiKV / PD
- Bootstrap: on start, a TiKV node asks PD `is_cluster_bootstrapped`. If not, it creates the first Region locally. https://pingcap.com/blog/design-and-implementation-of-multi-raft/ (older design post; current code may differ). PD exposes a Bootstrap RPC with a `bootstrapped` flag. https://sources.debian.org/src/golang-github-pingcap-kvproto/6.1.0~alpha-1/proto/pdpb.proto
- Q1/Q3: a new store has no Regions. It reports capacity via store heartbeat. PD's region heartbeat drives placement: if a Region has fewer peers than configured, PD adds one, and the leader sends a snapshot to the uninitialised peer. https://pingcap.com/blog/design-and-implementation-of-multi-raft/ Store state is Up, Disconnect (no heartbeat over 20s), Down (over `max-store-down-time`, 30 minutes by default), Offline (operator-driven drain) and Tombstone. https://docs.pingcap.com/tidb/stable/tidb-scheduling The deciding evidence is the heartbeat PD receives. The replica's catch-up state is the Raft peer's. Which of these states PD schedules onto is UNCONFIRMED.
- Q2: placement is strictly downstream of heartbeat liveness. Nothing I found conditions it on prior spread.
- Q4: PD adds replicas whenever a Region has fewer than expected. Under-replication is repaired by scheduling, not a gate. https://docs.pingcap.com/tidb/stable/tidb-scheduling
- Q5: bootstrap is one-shot but idempotent. PD returns "already bootstrapped" and records it durably. This is inferred from the proto error enum; the storage detail is UNCONFIRMED.
- Q6: none found.

### etcd (and kubeadm)
- A new member joins as a non-voting learner, so it "doesn't affect quorum while it syncs". It cannot lead and rejects client reads and writes. Promotion is explicit (`member promote`) and the learner never promotes itself. The server rejects promotion unless the learner has its snapshot and is in sync or within a lag threshold (example in the docs: fewer than 1/10 of the snapshot count to replicate). https://etcd.io/docs/v3.5/learning/design-learner/
- Q1-Q3: membership is added first, as a learner. Voting status is gated on catch-up, which the leader judges from replication progress. Liveness, catch-up and client readiness are separate. Placement (all data) is never conditioned on a spread, because etcd is a single group.
- Q4: a one-member cluster is simply healthy with RF 1.
- Q5: promotion is level-triggered in effect. The server answers the same check at any time, and a "not in sync" refusal means wait and retry. https://etcd.io/docs/v3.6/op-guide/runtime-configuration/
- kubeadm: with `EtcdLearnerMode`, a joining control-plane etcd member is created as a learner and promoted once aligned. https://kubernetes.io/blog/2023/09/25/kubeadm-use-etcd-learner-mode/ Re-obtaining credentials (`kubeadm token create --print-join-command`, re-uploading certs) is from my general knowledge. The page I fetched was truncated, so that part is UNCONFIRMED here. https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-join/
- Q6: a stuck-learner failure exists. kubeadm treated "rpc not supported for learner" as fatal and gave up, leaving an unpromotable learner. https://knowledge.broadcom.com/external/article/439838/vks-clusters-fail-to-deploy-with-error-r.html The lesson is that promotion must be retried, not attempted once.

### YugabyteDB
- Masters form their own Raft group and hold the system catalog. TServers heartbeat to the master leader, which tracks liveness. https://docs.yugabyte.com/preview/architecture/yb-master/ The docs I fetched do not describe TServer registration in detail (UNCONFIRMED).
- Q1/Q2: the cluster balancer moves tablet data and leaders to newly added nodes, in the background. Leaders move first, followers (which need data copying) more slowly. Placement-policy and blacklist constraints apply. https://docs.yugabyte.com/stable/architecture/docdb-sharding/cluster-balancing/ I found no precondition that tablets already be spread.
- Q3: a new replica is added as PRE_VOTER, remote-bootstrapped, then promoted to VOTER. This is from a support article, not a design doc. https://support.yugabyte.com/hc/en-us/articles/5407577238925-Data-Not-Being-Rebalanced-Across-Nodes
- Q4: with a failed node, leaders move in about 3 seconds and re-replication starts after `follower_unavailable_considered_failed_sec` (15 minutes by default). Under-replication is a degraded-but-serving state repaired by the balancer. https://docs.yugabyte.com/stable/architecture/docdb-sharding/cluster-balancing/
- Q6: a support article ties a tablet-bootstrap deadlock to load-balancer stalls (fixed in 2.20.8 and later). The balancer also has a reported stall when blacklist moves overlap a new tserver (community post). Both are local bugs, not circular readiness. https://support.yugabyte.com/hc/en-us/articles/34714075359885 (URL is from a search listing; I did not open it, so detail is UNCONFIRMED).

### Consul and Nomad (raft-autopilot)
- `bootstrap_expect`: Consul holds off bootstrapping until that many servers are available, then bootstraps and elects a leader. All servers should use the same value. https://developer.hashicorp.com/consul/docs/reference/agent/configuration-file/bootstrap
- `server_stabilization_time` (default 10s): how long a server must stay healthy before Autopilot adds it. https://developer.hashicorp.com/consul/docs/reference/agent/configuration-file/bootstrap
- Q1-Q3: join as a non-voter, and promotion to voter depends on observed health over time. The stabilisation duration is a time-based, observed property. The promotion code (`stable_promoter.go` in raft-autopilot) could not be read, so the exact criteria are UNCONFIRMED.
- Q2: the quorum-size condition (`bootstrap_expect`) is a count of servers, not a placement state. Nothing is conditioned on data placement because all servers hold the same Raft group.
- Q5: bootstrap-expect is a one-time threshold. After bootstrap, Autopilot reconciles continuously. The second half is UNCONFIRMED from the primary source.
- Q6: none found.

### Cassandra / ScyllaDB
- A new node is assigned tokens and streams ranges from primary replicas. When bootstrap completes the node is marked UP. A replica being unavailable makes consistent bootstrap fail unless `cassandra.consistent.rangemovement=false`. https://cassandra.apache.org/doc/latest/cassandra/managing/operating/topo_changes.html
- A node listed as its own seed does not bootstrap. https://docs.datastax.com/en/cassandra-oss/2.1/cassandra/operations/ops_add_node_to_cluster_t.html
- Existing nodes keep serving while the joiner is in UJ (Up/Joining). Whether the joiner serves reads before NORMAL is UNCONFIRMED. https://docs.axonops.com/data-platforms/cassandra/architecture/cluster-management/node-lifecycle
- Q2: placement is strictly downstream of membership. Data placement is deterministic from the token ring, and streaming is the catch-up step.
- Q5: seeds are a standing discovery list, not a handoff. They have no expiry.
- Q6: concurrent bootstraps are refused ("Other bootstrapping/leaving/moving nodes detected") by design. https://groups.google.com/g/scylladb-dev/c/0LPsf3pN8JE That is a serialisation guard, not a deadlock.

## Synthesis

### Common structural rule
Every system above orders three things the same way: (1) liveness and identity (heartbeat, gossip, registration), then (2) eligibility to receive replicas, then (3) placement and catch-up, with promotion to voter or full serving last. The evidence at each step comes from the layer below. A joiner is evaluated against its own observed liveness and capacity (CockroachDB's store gossip, TiKV's store heartbeat, a Consul server's health history), and then data is moved to it.

Forbidden dependencies, inferred from the pattern and not stated by any source:
- eligibility to receive replicas must not depend on the cluster having already spread data;
- the planner that spreads data must not wait on a signal that only spreading can produce;
- a one-shot authorisation must not be the sole path to eligibility.

Under-replication is always a per-range or per-tablet repair target (CockroachDB's allocator, PD's replica count check, YugabyteDB's balancer) and never a membership gate. The alone-node case is "healthy, degraded redundancy". CockroachDB makes it explicit by lowering the needed replication factor to the node count.

### Applicable designs
1. **Learner-first, placement-before-readiness (etcd, TiKV, YugabyteDB).** The joiner is admitted as a non-voting or uninitialised replica as soon as it is alive. The planner places critical partitions on it as learners. Voting or "ready" follows catch-up. Invariant: placement eligibility is a function of liveness and capacity only. Readiness is a pure consequence of placement, never an input to it.
2. **Level-triggered promoter with a stability window (Consul/Nomad Autopilot, etcd promote retry).** The ready lease, or release, is derived each cycle from current evidence (healthy for N seconds, in sync) by a reconciler that can run at any time. A failed check means retry, not give up. Invariant: the authorisation is a recomputable predicate on current state. It is not an event with a window. The kubeadm stuck-learner incident shows the cost of a single attempt.
3. **Target-factor clamping (CockroachDB).** Required replication for critical partitions is min(configured RF, live eligible nodes), and under-replication is a repair task, not a not-ready state. The seed stays "ready" while alone, and when joiners appear the target rises and the planner repairs. Invariant: readiness is judged against the achievable target given eligible nodes. Raising the target cannot make an already-ready node not-ready for the purpose of authorising the next step.

Mapping to the deadlock: a joiner gated on "critical partitions spread over three nodes" while the planner is gated on joiners' ready leases is exactly the forbidden planner-waits-on-its-own-output cycle. Any of the three designs breaks it by moving the gate off placement. The first is closest to how etcd, TiKV and YugabyteDB behave.

### Caveats
No primary source found documents a bootstrap deadlock of this exact shape. All pattern claims in the synthesis are my inference from the documented orderings. Several design-doc pages were unreachable (CockroachDB tech notes, raft-autopilot source, PD bootstrap source), so the per-system gaps marked UNCONFIRMED remain open.
