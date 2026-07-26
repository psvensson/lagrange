---
audience: human
documentClass: current
---

# Distributed-Systems Primer For Lagrange

This is the minimum distributed-systems background needed to read Lagrange's
architecture. It assumes you already understand processes, databases,
transactions, networking, and ordinary application services.

We will use one example throughout: an `orders` table whose rows are divided
across three nodes.

## 1. Distribution Introduces Partial Failure

In a single process, a call either returns, throws, or the process dies. Across
a network, a caller cannot immediately distinguish:

- the target is dead;
- the target is alive but slow;
- the network dropped the request;
- the target committed the request but the response was lost; or
- the caller is using stale routing information.

That uncertainty explains many Lagrange mechanisms: idempotency keys, retries,
epochs, owner rows, readiness gates, and reconciliation.

## 2. Partitioning Decides Which Group Owns A Row

Lagrange range-partitions a table by its primary key:

```text
orders-p1: [unbounded, m)
orders-p2: [m, unbounded)
```

The partition is the unit of routing, placement, replication, split, and merge.
A query whose predicate identifies a range can target the relevant partitions.
A predicate the resolver cannot understand must fan out to all partitions.

Partitioning provides scale by dividing work, but it introduces coordination
when one operation touches several partitions.

In Lagrange: read [Process: Partitioning](../architecture/process-partitioning.md).

## 3. Replication Is Not The Same As Consensus

Replication means keeping multiple copies. Consensus is the protocol that makes
those copies behave like one ordered state machine despite failures.

Each data partition is a Raft consensus group:

```text
orders-p1
  node-a: leader
  node-b: follower
  node-c: follower
```

The leader proposes a write. A majority must acknowledge it before the entry is
committed. Followers apply the same committed entries in the same order.

Three replicas tolerate one unavailable replica while retaining a two-node
majority. Two replicas still require two acknowledgements and tolerate no
failure, which is why odd replica counts are normally used.

## 4. Leader, Follower, Learner, And Quorum

- The **leader** coordinates writes for the group.
- A **follower** votes and receives replicated log entries.
- A **learner** receives entries without voting while it catches up.
- A **quorum** is the majority required to commit or elect.

Leadership is a temporary role. The durable data belongs to the group, not to
the machine that happens to be leader today.

Runtime-service Cells are different: they are placed and replaced but do not
form per-service Raft groups. Their durable application state goes in tables.

In Lagrange: read [Process: Replication](../architecture/process-replication.md).

## 5. Safety And Liveness Are Different Questions

**Safety** means “nothing invalid happens,” for example:

- two conflicting writes are not both committed as the same log position;
- a stale owner cannot remove the last safe replica;
- a request is not accepted by the wrong leader.

**Liveness** means “useful progress eventually happens,” for example:

- a failed replica is eventually replaced;
- a joining node eventually becomes usable;
- a deferred workflow is eventually woken and retried.

A system can be safe but stuck. Many control-plane gates deliberately refuse
work when evidence is incomplete; the matching liveness mechanism must ensure
the work is reconsidered later.

## 6. Durable Authority Versus Local Observation

Every node needs fast routing information. Asking peers where every request
should go would add latency and create another failure dependency, so Lagrange
keeps a local cache of system tables.

```text
durable owner row → committed write → CDC → each node's cache
```

The owner row is durable authority. The cache is what this node has observed.
CDC normally keeps the cache converging, but delivery may be delayed, duplicated,
or reordered. Cache application therefore has conflict ordering, tombstones,
and authoritative repair.

A cached row can be suitable for routing without being a completion certificate
for the workflow that produced it.

## 7. Desired State, Actual State, And Reconciliation

A Binding says what should exist. Cells report what actually exists.

```text
Binding: “run export X for request source Y”
Actual:  zero or more starting/ready/failed Cells
```

A reconciler repeatedly compares desired and actual state and issues bounded
actions until they converge. This is preferable to assuming one create request
will complete atomically across several fallible nodes.

The same idea appears in replica repair: policy says how many replicas should
exist; actual rows show what exists now; workflows add or remove replicas until
the policy is satisfied.

## 8. Idempotency, Epochs, And Fencing

A retry may arrive after the first attempt already committed. An
**idempotency key** lets the owner recognize that both attempts represent one
logical operation.

An **epoch** is a generation number for ownership or configuration. A request
from an older epoch is stale even if its sender was once legitimate.

A **fence** is the check that rejects stale authority. Together these prevent a
delayed message from a former leader or former placement plan from mutating the
new state.

## 9. Control Plane Versus Data Plane

The data plane serves SQL reads and writes. The control plane manages:

- membership and node readiness;
- replica placement and repair;
- partition split and merge;
- Binding-to-Cell convergence; and
- endpoint publication.

Control-plane state is also stored in replicated tables. This simplifies the
storage model, but it means control-plane recovery depends on careful ownership,
readiness, and wake-up rules.

## 10. Single-Node Mode Is A Learning Mode

A single node can execute writes directly when there is no known remote leader.
That is useful for the first tutorial, but it does not demonstrate:

- majority commit during a failure;
- leader election and failover;
- learner catch-up and promotion;
- cross-node CDC delivery;
- replica rebalancing; or
- Cell placement across alternative data locations.

Do not infer multi-node guarantees from a successful one-node example. Use the
distributed examples and test scenarios when those behaviors are the subject.

## Continue

Read the [vocabulary map](vocabulary.md), then
[The Lagrange System Model](../architecture/system-model.md). The system model
turns these generic concepts into Lagrange's concrete tables, owners, caches,
routers, and workflows.
