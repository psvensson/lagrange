# Research Report: Control-Plane Metadata Bootstrap Bug Class in Production Distributed Systems

## Executive Summary

Across all major production distributed systems (TiKV/PD, FoundationDB, CockroachDB, Elasticsearch, Ceph, etcd/Consul), the dominant solution to the **self-referential progress-write** problem is **architectural separation**: the operator/rebalancer state is never persisted to the substrate being moved, and progress is derived from level-triggered reconciliation against observed cluster state—not from an explicit durable operations journal. The dominant solution to **interlock over-deferral** is **predicate scoping**: freeze tokens are attached to specific operation classes (rebalancing vs. repair vs. admission), not to the entire I/O surface, so foreground admission and background movement never compete for the same gate.

---

## Q1 — How Production Systems Avoid the Self-Reference Problem

### TiKV / Placement Driver (PD)

**Where does move/operator progress live?** Entirely in-memory inside PD's `operator.Controller`, backed by a Go `sync.Map`.

**Confirmed via source code** (`tikv/pd:pkg/schedule/operator/operator_controller.go:84-107`):
```go
type Controller struct {
    operators sync.Map   // ← all in-flight operator state, in-memory only
    records   *records   // ← completed op records, in-memory TTL cache
    ...
}
```

The `Operator` struct itself (`tikv/pd:pkg/schedule/operator/operator.go:67-91`) tracks step progress via `currentStep int32` (atomic) and timestamps — pure in-memory fields with no persistence path.

**PD's own etcd vs. TiKV data are architecturally separate.** PD uses `go.etcd.io/etcd/client/v3` for its own cluster configuration (`tikv/pd:server/cluster/cluster.go:33`), while the TiKV regions being rebalanced are a wholly distinct store. An operator for a TiKV region never writes progress rows into TiKV.

**After PD failover,** operators are LOST and REBUILT from scratch via region heartbeats. Each TiKV region reports its current peer configuration to PD on every heartbeat cycle. PD computes the delta between observed config and desired placement policy, generates a fresh `Operator`, and dispatches it. This is fully **level-triggered** — there is no dependency on recovering "what step was the previous operator at."

**Citations:** `tikv/pd:pkg/schedule/operator/operator_controller.go:84-107`, `tikv/pd:pkg/schedule/operator/operator.go:67-91`, `tikv/pd:server/cluster/cluster.go:17-82`

---

### FoundationDB Data Distributor

**Where does move progress live?** Two layers:

1. *Phase-boundary checkpoints* are written to system keyspace `\xff/serverKeys/` and `\xff/keyServers/` — these are committed atomically via FDB transactions and represent durable state.

2. *Within-phase progress* is tracked in the Data Distributor actor's in-memory state (`RelocateShard`, `DDQueue`).

**Confirmed via design doc** (`apple/foundationdb:design/data-distributor-internals.md:25-35`):
> "Special keys in the system keyspace: DD saves its state in the system keyspace to recover from failure and to ensure every process has a consistent view of which storage server is responsible for which key range."

The **four-step movement protocol** (`design/data-distributor-internals.md:103-107`) writes to the same system keyspace that's being redistributed. This creates a structural similarity to your problem — writing movement progress into the table that is itself being moved. FDB's answer: the DD is a **stateless coordinator** role separate from storage. When a new DD starts, it reads `\xff/serverKeys/` to reconstruct in-flight state and calls `resumeRelocations()` (`dataDistribution.actor.cpp:233`). If system-keyspace writes fail during a move, the current DD crashes and is replaced; the new one recovers from whatever was durably committed.

**The MoveKeysLock** (`apple/foundationdb:design/data-distributor-internals.md:213-227`) is a two-key lock (`moveKeysLockOwnerKey`, `moveKeysLockWriteKey`) in `\xff/moveKeysLock/`. Only one DD may hold it; if a new DD grabs it, the old one self-terminates. This prevents concurrent writers from corrupting the system keyspace — but it does NOT prevent write failures during the move itself. FDB accepts that system-keyspace writes may degrade during moves and relies on DD restart + re-read for recovery.

**The DD runs in a separate process class** (`DataDistributorClass` in `fdbrpc/include/fdbrpc/Locality.h:26`) and is not co-located with storage servers, which provides some blast-radius isolation.

**Citations:** `apple/foundationdb:design/data-distributor-internals.md:25-35,103-107,213-227`, `fdbrpc/include/fdbrpc/Locality.h:17-46`

---

### CockroachDB Meta/System Ranges

**Where does replicate-queue progress live?** Purely in-memory. There is NO system.jobs entry for range rebalancing.

**Confirmed by examining `pkg/jobs/jobspb/jobs.proto`** (`cockroachdb/cockroach:pkg/jobs/jobspb/jobs.proto`): The jobs proto defines entries for SchemaChange, Backup, Import, Restore, LogicalReplication, StreamReplication, ChangeFeed — all SQL-level operations. **No job type exists for replica moves, range rebalancing, or lease transfers.** The replicate queue keeps no durable state.

**system.rangelog** records completed replication events but is write-after-fact; it is not a progress journal and is not used for recovery.

**The replicate queue** (`cockroachdb/cockroach:pkg/kv/kvserver/replicate_queue.go:40-66`) is an in-memory queue driven by a periodic scanner. On each iteration it calls `allocator.ComputeAction()` to re-derive what needs to happen, then applies it synchronously. There is no concept of "step N out of M" being persisted anywhere.

**Meta1, meta2, and liveness ranges** are "treated mostly like normal ranges" (CockroachDB architecture docs) — they go through the same replicate queue as user ranges. There is no special freeze or admission gate specific to them. The allocator is purely reactive: it sees the current replication factor, compares to desired, and acts.

**The allocator priority system** (`cockroachdb/cockroach:pkg/kv/kvserver/allocator/allocatorimpl/allocator.go:125-315`): `AllocatorAddVoter`/`AllocatorReplaceDeadVoter` have high priorities; `AllocatorConsiderRebalance` has the lowest. System ranges like liveness get processed by the same priority logic — being under-replicated (which they will be during seed formation) raises their priority.

**Citations:** `cockroachdb/cockroach:pkg/jobs/jobspb/jobs.proto:846-1165`, `cockroachdb/cockroach:pkg/kv/kvserver/replicate_queue.go:40-66`, `cockroachdb/cockroach:pkg/kv/kvserver/allocator/allocatorimpl/allocator.go:125-315`

---

### Kubernetes / etcd

**etcd** is the substrate AND the state store for Kubernetes controllers. Kubernetes controllers (ReplicaSet controller, StatefulSet controller, etc.) do NOT write "operation progress" rows anywhere — they simply watch the API server and reconcile desired vs. observed state. There is no `operations` table for pod movements.

**Kubernetes' answer to the controller writing to the store while the store is being moved**: etcd cluster membership changes are done via Raft joint consensus at the etcd layer, completely invisible to Kubernetes controllers. A controller that writes to etcd while etcd is in a membership change simply sees write retries if the leader transfers; the controller's next reconcile cycle will see the updated state and converge correctly.

**The reconciliation pattern** is the key: controllers compute the difference between desired state (stored in etcd) and observed state (from API server caches) on every invocation. If a write fails mid-reconciliation, the controller simply retries the full reconcile loop; there is no partial progress to roll back.

**Citations:** etcd bootstrap documentation (https://etcd.io/docs/v3.5/op-guide/clustering/), Kubernetes controller-runtime reconciliation pattern

---

### Elasticsearch Cluster State

Elasticsearch's master node maintains all cluster state (index metadata, shard routing table) in-memory as a single immutable object published as a versioned cluster state update. There is NO separate "shard operation journal." Shard relocation progress is tracked in the routing table (`ShardRouting.state` = INITIALIZING/STARTED/RELOCATING) — this is the master's in-memory cluster state, not a separate replicated operations table.

Crucially: the cluster state store is separate from index data stores. Moving a shard does NOT write progress to that shard's index. Shard allocation decisions and shard data are served from independent paths.

---

## Q2 — Scoping "Freeze/Drain" Interlocks

### Elasticsearch — Two Independent Gates (CONFIRMED via source)

Elasticsearch provides **separate** dynamic settings for allocation vs. rebalancing:

**`cluster.routing.allocation.enable`** (`elastic/elasticsearch:server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/EnableAllocationDecider.java:54-60`):
- `ALL` — permit all new shard assignments
- `PRIMARIES` — only primaries
- `NEW_PRIMARIES` — only new index primaries (no existing replica movement)
- `NONE` — no new allocation at all

**`cluster.routing.rebalance.enable`** (same file, lines 62-68):
- `ALL` — allow rebalancing between nodes
- `PRIMARIES` / `REPLICAS` — only one type
- `NONE` — freeze all rebalancing

**The key insight**: these are `Property.Dynamic` settings (changeable at runtime without restart) and are **orthogonal**. You can set `rebalance.enable=NONE` while keeping `allocation.enable=ALL`, which precisely allows new index creation (new primary assignment) while stopping all background rebalancing. Rebalancing ONLY moves existing shards between nodes; allocation allows new primaries for new indices. The check in `canRebalance()` never gates `canAllocate()` and vice versa.

Both also have **per-index overrides** that take precedence over cluster settings, allowing finer-grained control: you could suppress rebalancing only for a specific index.

This is the most directly applicable pattern. A non-disruptive write (writing a row to the ledger to record a provisioning operation's start) is functionally equivalent to "allocating a primary" in Elasticsearch terms — it does not require moving any data.

**Citations:** `elastic/elasticsearch:server/src/main/java/org/elasticsearch/cluster/routing/allocation/decider/EnableAllocationDecider.java:54-148`, https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-cluster.html

---

### Ceph — OSD Map Flags: Separate Bits for Recovery vs. Rebalance vs. Client I/O

Ceph's OSDMap carries per-cluster flags that control PG background operations, completely independently of client I/O:

**From `ceph/ceph:src/include/rados.h:158-166`:**
```c
#define CEPH_OSDMAP_NOBACKFILL    (1<<9)   /* block osd backfill */
#define CEPH_OSDMAP_NORECOVER     (1<<10)  /* block osd recovery and backfill */
#define CEPH_OSDMAP_NOREBALANCE   (1<<14)  /* block osd backfill unless pg is degraded */
```

`NOREBALANCE` specifically blocks **healthy→healthy data movement** while allowing **degraded PG recovery to continue**. The critical implementation is in `ceph/ceph:src/osd/PG.cc`:
```cpp
if (recovery_state.is_peered() &&
    !recovery_state.is_clean() &&
    !recovery_state.get_osdmap()->test_flag(CEPH_OSDMAP_NOBACKFILL) &&
    (!recovery_state.get_osdmap()->test_flag(CEPH_OSDMAP_NOREBALANCE) ||
      recovery_state.is_degraded())) {    // ← if degraded, NOREBALANCE is bypassed
    queue_recovery();
}
```

**Client I/O is NEVER subject to these flags.** The OSD primary still accepts reads and writes for any PG regardless of NOREBALANCE/NOBACKFILL. The conflict boundary is drawn between: (a) background data movement; (b) client read/write path. These are fully orthogonal.

**The principle:** "disruptive background work" and "foreground client work" share no admission gate. Only same-layer background operations (backfill vs. recovery) share gating, with safety override for degraded state.

**Citations:** `ceph/ceph:src/include/rados.h:158-166`, `ceph/ceph:src/osd/PG.cc` (NOBACKFILL/NOREBALANCE test)

---

### CockroachDB — Per-Key Conflict Detection, Not Global Freeze

CockroachDB's replication changes never block foreground writes. The mechanism:

1. Replication changes (adding/removing voters) go through a joint Raft configuration change — a `ChangeReplicasTrigger` proposed to the Raft group.
2. Foreground writes are batched into `BatchRequest`s and also proposed to the Raft group.
3. Both are serialized by the Raft log — but they don't conflict with each other unless they write to the same key. A config change to the raft group membership does not block a user key-value write to the same range.
4. Latches are used for per-key conflict detection within a range. Replication changes acquire a span latch on `localRangeKey`, which does not conflict with user key spans.

There is no global "replicate queue in flight" flag that would cause a write to be rejected.

---

### Consul / HashiCorp Autopilot — Voter Promotion Gate

**`Config.ServerStabilizationTime`** (`hashicorp/raft-autopilot:types.go:44-47`):
> "ServerStabilizationTime is the minimum amount of time a server must be in a stable, healthy state before it can be added to the cluster. Only applicable with Raft protocol version 3 or higher."

The `isHealthy()` check (`hashicorp/raft-autopilot:types.go:80-100`) requires:
- `NodeStatus == NodeAlive` (application says the node is up)
- `LastContact < LastContactThreshold` (heartbeat recency)
- `LastTerm == lastTerm` (caught up to current term)
- `LastIndex + MaxTrailingLogs >= leaderLastIndex` (not too far behind)

**Critically:** This gate only applies to the **voter promotion step** (`AddVoter` call). Once a server is added as a non-voter, it can receive log replication normally. Other cluster operations (reading, writing, existing voter operations) are not affected by the gate. This is a predicate scoped to one transition: non-voter → voter.

**Citations:** `hashicorp/raft-autopilot:types.go:44-100`

---

### HDFS Balancer

The HDFS balancer runs as a separate JVM process with explicit bandwidth throttling (`dfs.datanode.balance.bandwidthPerSec`). New block allocation (for HDFS client writes) goes through the NameNode block placement policy independently. The balancer reads/writes to DataNodes but the NameNode never blocks a new file write because a balancer is running. Conflict boundary: balancer uses a dedicated connection; client writes use the primary DataNode pipeline. No shared admission gate.

---

### Kafka Partition Reassignment

In Apache Kafka (KRaft mode), partition reassignment is a controller-level operation that writes to the `__cluster_metadata` topic. New topic creation is also a controller operation writing to `__cluster_metadata`. These are serialized by the KRaft log — both compete for the same log but with independent record types. A reassignment in progress does not block a `CreateTopics` request from being processed by the active controller; the controller processes both as log entries.

---

## Q3 — Making Operator Progress Durable During Substrate Churn

### TiKV/PD — Pure In-Memory + Level-Triggered Heartbeat Reconciliation (CONFIRMED)

TiKV/PD operators are never persisted. `Operator.currentStep` (`tikv/pd:pkg/schedule/operator/operator.go:76`) is an in-memory atomic int32. When PD restarts, ALL in-flight operators are dropped. Recovery is automatic:

1. Each TiKV region leader sends a heartbeat to PD every 10 seconds with its current peer configuration.
2. On receiving the heartbeat, PD checks if the region's current config matches the placement policy.
3. If not, PD creates a new `Operator` for that region.
4. The operator steps are dispatched back to TiKV via the heartbeat response.

This is a **level-triggered** (reconciliation) architecture: the desired state is computed fresh from policy on every heartbeat; no state needs to be carried across PD restarts. The operator is ephemeral — it's the medium for translating "current → desired" into a sequence of Raft config change commands.

**Operator timeout** (`tikv/pd:pkg/schedule/operator/operator.go:36`): `OperatorExpireTime = 3 * time.Second` for creation, plus per-step timeouts based on data size. If a step doesn't complete in time, the operator is cancelled and re-generated on the next heartbeat cycle.

**Citations:** `tikv/pd:pkg/schedule/operator/operator.go:36,76`, `tikv/pd:pkg/schedule/operator/operator_controller.go:150-210`

---

### FoundationDB — Phase-Boundary Durability

FDB writes move state only at defined phase boundaries:
1. `startMoveKeys`: Commits source+destination to `\xff/keyServers/` — durable checkpoint.
2. Data fetch phase: Destination server reads data range (tracked in-memory in DD actor).
3. `finishMoveKeys`: Commits removal of source from `\xff/keyServers/` — durable checkpoint.

Between checkpoints, progress is in-memory. If DD crashes mid-phase, the new DD reads the current system keyspace, sees a partially-complete move (source and destination both listed as owners), and calls `resumeRelocations()` to continue from the last durable phase boundary.

**This is "write at phase transitions only," not continuous progress writes.** The substrate write frequency is O(phases) not O(bytes-moved).

**Citations:** `apple/foundationdb:design/data-distributor-internals.md:103-107,213-227`

---

### CockroachDB — Stateless Scanner + Purgatory

The replicate queue does not write progress at all. Each scan cycle (`shouldQueue()` → `process()` → `applyChange()`) is atomic from the queue's perspective. If a step fails, the replica is put into purgatory (an in-memory set) and retried after `replicateQueuePurgatoryCheckInterval = 1 * time.Minute`. The next scan re-evaluates from scratch.

The queue has a purgatory mechanism rather than a progress journal. Idempotency is guaranteed by Raft configuration change semantics: proposing `AddVoter(nodeX)` when nodeX is already a voter is a no-op.

**Citations:** `cockroachdb/cockroach:pkg/kv/kvserver/replicate_queue.go:69-77`

---

### Kubernetes Reconciliation Principle

The canonical statement: **"Make level-triggered reconcilers, not edge-triggered event processors."** Controllers should be able to process a reconcile request for an object at any time and produce correct output without depending on what previous reconcile events occurred. All state they need is in the object itself (in etcd). This directly maps to: operator progress should not require a journal if the desired state can always be re-derived from observed state.

---

## Q4 — Bootstrap/Formation Special-Casing

### Elasticsearch — `cluster.initial_master_nodes` + Bootstrap Threshold

**From `elastic/elasticsearch:server/src/main/java/org/elasticsearch/cluster/coordination/ClusterBootstrapService.java`:**

```java
public static final Setting<List<String>> INITIAL_MASTER_NODES_SETTING = Setting.stringListSetting(
    "cluster.initial_master_nodes",
    Property.NodeScope
);
```

The `onFoundPeersUpdated()` method (line ~140) checks:
```java
if (nodesMatchingRequirements.size() * 2 > bootstrapRequirements.size()) {
    startBootstrap(nodesMatchingRequirements, unsatisfiedRequirements);
}
```

Bootstrap only proceeds when **a strict majority of the required nodes** are discovered. This prevents a solo seed node from bootstrapping with a partial quorum that would later need to be "fixed" by a self-move.

**After bootstrap:** The setting has no effect (cluster UUID is committed). Continued attempts to use `initial_master_nodes` trigger a warning because it could cause split-brain if a second bootstrap is attempted.

The `unconfiguredBootstrapTimeout` (3 seconds default for `discovery.unconfigured_bootstrap_timeout`) triggers a best-effort bootstrap with whatever nodes have been found, preventing infinite wait in development scenarios.

**Key formation principle:** Elasticsearch will not start allocating shards until a quorum of master-eligible nodes is elected and the first cluster state is published. This means no shard placement occurs until the control plane is stable.

**Citations:** `elastic/elasticsearch:server/src/main/java/org/elasticsearch/cluster/coordination/ClusterBootstrapService.java:47-223`

---

### etcd — `initial-cluster-state` Static Bootstrap

etcd's static bootstrap (`--initial-cluster` / `--initial-cluster-state=new`) specifies ALL members at start time. No member performs any leader election or log replication until a quorum of the specified members has joined. Parameters are ignored on subsequent restarts (`initial-cluster-state=new` is only read once).

**The key property:** The cluster does not become operational until the required quorum is present. There is no "single-node bootstrap + later self-move" sequence — all nodes join simultaneously as peers.

After bootstrap, membership changes use the Raft joint consensus path, which does not require a separate formation mode.

**Citations:** https://etcd.io/docs/v3.5/op-guide/clustering/ (Static Bootstrap section)

---

### Consul Autopilot — Non-Voter Staging

New servers join as `RaftStaging` (non-voter) first, regardless of cluster state. They only become voters after satisfying `isHealthy()` for a duration >= `ServerStabilizationTime`. This effectively creates a **formation sequence**: seed node bootstraps alone as initial voter, remaining nodes join as non-voters, become voters after stabilization.

**`ServerState.isHealthy()`** (`hashicorp/raft-autopilot:types.go:80-100`) checks:
- `LastContact < LastContactThreshold` (≤ 200ms default in Consul)
- `LastTerm == lastTerm` (same election term as leader)
- `LastIndex + MaxTrailingLogs >= leaderLastIndex` (log caught up, default 250 trailing entries)

The `isBootstrappedSupplier` prevents re-bootstrapping an existing cluster.

**Formation principle:** A new server EARNS voter rights by demonstrating stability, rather than being immediately granted them. Allocation and rebalancing for a new member can begin as a non-voter (learner/observer), and the disruptive voter-config-change step is deferred until conditions are met.

**Citations:** `hashicorp/raft-autopilot:types.go:44-100`

---

### CockroachDB — Liveness-Based Suppression

The allocator uses `storePool.LiveAndDeadReplicas()` before making decisions (`cockroachdb/cockroach:pkg/kv/kvserver/allocator/allocatorimpl/allocator.go:1093-1099`):

```go
// NB: For the purposes of determining whether a range has quorum, we consider
// stores marked as "suspect" to be live. This is necessary because we would
// otherwise spuriously consider ranges with replicas on suspect stores to be
// unavailable, just because their nodes have failed a liveness heartbeat.
const includeSuspectAndDrainingStores = true
liveVoters, deadVoters := storePool.LiveAndDeadReplicas(voterReplicas, includeSuspectAndDrainingStores)
```

The allocator won't take rebalancing actions toward stores that haven't established liveness (gossip heartbeat). This is an implicit formation gate: during cold bootstrap, stores won't receive rebalancing traffic until they're live in the gossip ring. However, under-replicated ranges (which is the normal state during bootstrap) still get processed with high priority.

There is NO explicit "suppress all rebalancing for X seconds after formation." CockroachDB relies on the correctness of the liveness check rather than a bootstrap-mode suppression window.

**Citations:** `cockroachdb/cockroach:pkg/kv/kvserver/allocator/allocatorimpl/allocator.go:1092-1099`

---

## Q5 — Mapping to Your Two Mechanisms

| System | Mechanism | Maps To Our Mechanism | Transferable Principle |
|--------|-----------|----------------------|----------------------|
| **TiKV/PD** | Operators are pure in-memory, rebuilt from heartbeats after PD failover | Mechanism 2 (progress writes) | Eliminate ledger writes during self-move; derive progress from observed Raft config heartbeats instead |
| **TiKV/PD** | Dispatch is driven by region heartbeat; no write needed between steps | Mechanism 2 | Level-triggered: each heartbeat triggers progress evaluation, no persistent intermediate state |
| **FDB Data Distributor** | Progress written only at phase boundaries (startMoveKeys / finishMoveKeys); intra-phase is in-memory | Mechanism 2 | Write to ledger only at phase boundaries (ADD-VOTER-COMPLETE, LEADER-TRANSFER-COMPLETE), not on every step |
| **FDB Data Distributor** | DD is stateless coordinator, recovers by rereading system keyspace | Mechanism 2 | If self-move writes fail, detect failure and re-derive state from Raft config observation rather than ledger rows |
| **CockroachDB replicate queue** | No per-move progress table; stateless scanner re-derives action each cycle | Mechanism 2 | Eliminate progress writes entirely; re-derive "what phase is the self-move in" from the actual Raft config |
| **Elasticsearch `rebalance.enable`** | Rebalancing and allocation are SEPARATE gates; freezing rebalancing does NOT block new primary allocation | Mechanism 1 (interlock) | Split "disruptive voter-move" from "foreground ledger write" in the predicate; a ledger WRITE is NOT a voter move and should never hit the voter-move interlock |
| **Elasticsearch `allocation.enable=new_primaries`** | Only new-index primary allocation is allowed while rebalancing is frozen | Mechanism 1 | Foreground writes to the ledger table are semantically "new primary writes," not rebalancing operations — use a separate admission category |
| **Ceph `NOREBALANCE`** | Suppresses healthy→healthy moves, NOT degraded-PG recovery, NOT client I/O | Mechanism 1 | The interlock should be scoped to "voter set restructuring ops" not "writes through the ledger"; a table provisioning that writes a row is client I/O, not a voter move |
| **Consul Autopilot `ServerStabilizationTime`** | Voter promotion gate applies ONLY to the AddVoter step, not to all cluster operations | Mechanism 1 | The "idle ledger" interlock should gate only actual Raft config changes (AddVoter/RemoveVoter/TransferLeadership), not the write operations that happen to use the ledger as a transport |
| **Elasticsearch `cluster.initial_master_nodes`** | Bootstrap waits for quorum of required masters; no allocation until cluster state is stable | Mechanism 1 + both | Formation special-casing: delay admission of new table provisioning until ledger partition has completed its self-move (sequence formation so ledger spreads FIRST) |
| **etcd static bootstrap** | All members join simultaneously; no single-node bootstrap + self-move needed | Both | Avoid the self-move entirely during seed formation by pre-placing the ledger partition on its final quorum distribution before allowing the cluster to accept work |
| **Consul non-voter staging** | New servers join as non-voters (learners), don't disrupt quorum until ready | Mechanism 2 | During ledger self-move, the progress writes from the move itself could be routed to an in-memory buffer or a separate lightweight store that doesn't degrade ledger quorum |

---

## Final Synthesis

### Core Principles

**Principle A (addresses Mechanism 2): Architecturally separate the coordinator's state from the substrate being coordinated.** No production system writes per-step move progress into the very partition being moved. TiKV/PD keeps operators in-memory and derives progress from heartbeats. CockroachDB's replicate queue is stateless. FDB writes only at phase transitions. The transferable principle for your system: the self-move operation should derive its progress from **observing the actual Raft configuration** (who are the current voters? is the leader on target?) rather than from writing rows to `replica_operations-p1`. If the self-move can be made self-describing (i.e., "I am complete when the leader is on node X and voters are [A, B, C]"), its progress writes become strictly optional — they can be a best-effort telemetry record, not a progress dependency.

**Principle B (addresses Mechanism 1): Narrow the interlock's conflict predicate to the exact operation class it is meant to serialize.** The Elasticsearch `EnableAllocationDecider` enforces that `canRebalance()` and `canAllocate()` are completely independent code paths. Ceph's `NOREBALANCE` flag affects only `queue_recovery()` decisions, not the OSD primary's write path. Consul autopilot's stabilization check gates only `AddVoter`. Your interlock's predicate "ledger self-move in flight → reject ALL operations" conflates two disjoint categories: (a) operations that need to RESTRUCTURE the ledger's Raft group (disruptive, need serialization), and (b) operations that merely need to WRITE A ROW through the ledger's current quorum (non-disruptive, should never be gated by the voter-move interlock). The fix is to narrow the predicate from "ledger is busy" to "the caller's operation requires a voter config change on the ledger."

**Principle C (addresses both): Treat cold formation as a distinct phase with explicit sequencing.** etcd, Elasticsearch, and Consul all have explicit bootstrap gates that hold application work until the control plane is stable. Your system should not allow user-visible table provisioning to begin until the ledger partition has completed spreading to its final quorum. This is a **sequencing fix** (formation → ledger spread → admission open), not a retry-and-wait fix. The interlock over-deferral bug disappears if there is nothing to defer against: by the time the first `CREATE TABLE` arrives, the ledger self-move is already complete.

**Principle D (addresses Mechanism 2): Write progress at phase boundaries, not at every step.** If progress writes to the ledger cannot be eliminated, they should only occur at the END of major phases (e.g., "voter added," "leader transferred"), not on every dispatch iteration. TiKV operators record step transitions atomically; FDB DD writes only at `startMoveKeys`/`finishMoveKeys`. This reduces the write amplification from ~175 failures per self-move to at most 2-3 writes, reducing the degradation window.

### What NOT to do

- **Do NOT simply remove the interlock** on genuinely-disruptive operations. Ceph's `NOREBALANCE` can be bypassed for degraded PGs (safety override), but healthy-to-healthy rebalancing is never allowed to run unbounded during maintenance — the flag exists for a reason. Your interlock similarly exists for a real reason (write-starvation cascades).
- **Do NOT store per-step move progress in a raft-replicated table that participates in the move being described.** No production system does this; it is the unique source of your thrashing.
- **Do NOT rely on write retries alone** to survive quorum degradation during a self-move. FDB crashes and restarts the DD when writes fail; TiKV/PD generates fresh operators on next heartbeat. The right pattern is: if the substrate is degraded, stop writing to it and recover from observed state instead.

---

## Gaps and Uncertainties

1. **CockroachDB meta-range special-casing during bootstrap**: I could not confirm via source code whether CRDB has any explicit "wait for N nodes before processing meta-range rebalancing" logic. The allocator appears to treat them uniformly; the liveness gate (`LiveAndDeadReplicas`) is the only implicit gate. **Inferred, not confirmed.**

2. **FDB system keyspace degradation handling**: The design doc describes `resumeRelocations()` but I did not verify the exact behavior when `\xff/keyServers/` writes fail during an active move. The doc states DD kills itself on lock loss; it's inferred that write failures trigger a similar retry path. **Partially confirmed.**

3. **Kafka KRaft partition reassignment vs. topic creation serialization**: Could not confirm the exact conflict-detection path in KRaft. The claim that both are serialized via the controller log is based on architecture understanding, not source verification. **Inferred.**

4. **HDFS balancer/NameNode interaction**: Could not locate the exact HDFS balancer source in the apache/hadoop repo due to search limits. The claim about independent allocation is based on documented HDFS architecture. **Inferred.**

5. **`gateway.recover_after_nodes` in Elasticsearch** (the legacy 5.x/6.x setting for controlling minimum nodes before shard recovery): This setting was deprecated in 7.x in favor of `cluster.initial_master_nodes`. The modern equivalent — that allocation doesn't start until cluster state is published — is confirmed, but the specific 5.x/6.x knob behavior is not researched.