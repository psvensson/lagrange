# Lagrange Architecture

This is the canonical human entry point for the implemented Lagrange
architecture — the "how it works" layer. Lagrange is a distributed runtime
for data-intensive services: one logical service, authored and deployed as
a unit, physically distributed across the database partitions holding its
data. These documents explain the machinery that makes that true.

Start here for the map, continue to
[The Lagrange System Model](system-model.md) for the vocabulary, and then
choose the process document for the mechanism you need. The conceptual
hierarchy — customer-facing service → endpoint invocation → distributed
execution plan → partition-local function calls → database partitions and
replicas — and the subsystem that owns each transition are laid out in the
root [architecture map](../architecture.md).

For an exact statement of what is implemented, partial, or unsupported, use
[current capabilities and limitations](../docs/current-capabilities-and-limitations.md).
The architecture documents explain how the system is intended to work; the
capability document defines what the checked-in implementation supports today.

## The idea in one picture

A Lagrange service is one deployable; the cluster runs each part of a
request on the nodes holding the relevant data. Durable state remains in
partitioned, replicated tables. Disposable service Cells are placed near
the partitions they use, and both data and compute are continuously
reconciled as the cluster changes.

```mermaid
%%{init: {'theme':'base','darkMode':false,'themeVariables':{'background':'#ffffff','clusterBkg':'#ffffff','clusterBorder':'#94a3b8','edgeLabelBackground':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart LR
  subgraph CANVAS[" "]
    direction LR
    CLIENT["Clients"]:::ext --> ROUTE["Cluster ingress and routing"]:::move

    subgraph NODE["A selected cluster node"]
      direction TB
      CELL["Service Cell<br/>disposable compute"]:::svc
      REPLICA["Relevant partition replica<br/>durable rows"]:::data
      CELL ==>|"local SQL when placement aligns"| REPLICA
    end

    ROUTE -->|"service request"| CELL
    ROUTE -->|"SQL request"| REPLICA
    REPLICA <-->|"Raft replication"| PEERS["Replica quorum<br/>on other nodes"]:::data

    EVIDENCE["Observed access<br/>topology · load · policy"]:::move --> PLACE["Placement and rebalancing"]:::ctrl
    PLACE -. "places / moves" .-> CELL
    PLACE -. "places / repairs" .-> REPLICA
  end

  style CANVAS fill:#ffffff,stroke:#ffffff,color:#0f172a
  style NODE fill:#ffffff,stroke:#94a3b8,color:#0f172a
  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef move fill:#ede9fe,stroke:#6d28d9,color:#2e1065
  classDef ext fill:#f1f5f9,stroke:#475569,color:#0f172a
```

This picture does **not** mean that distributed-systems costs disappear. Reads
may still be remote, writes still require the partition leader and its quorum,
and cross-partition operations still communicate. The architectural advantage
is narrower: locality becomes something the cluster can create and maintain
instead of something application teams arrange manually.

## Six anchors

Keep these six statements in mind while reading the deeper documents:

1. **The service is the logical unit.** Endpoints, partition functions, and
   reducers are authored, versioned, and deployed together. An endpoint
   invocation becomes a distributed operation the cluster owns end to end.
2. **Tables hold durable state.** User data, service state, and cluster
   metadata all live in ordinary partitioned tables.
3. **Partitions are the unit of distribution.** A partition owns a
   primary-key range and is the unit of routing, replication, split, merge,
   and placement.
4. **Replicas provide durability; Cells provide compute.** Partition
   replicas are Raft members. Runtime-service Cells are disposable and have
   no per-service Raft log.
5. **Requests use shared routing and execution surfaces.** Protocol
   adapters and service calls converge on the same SQL engine, metadata
   model, and message router rather than creating independent execution
   paths.
6. **Nothing is placed once and forgotten.** Replica movement, Cell
   placement, partition changes, node changes, and observed access all feed
   continuous reconciliation.

## The four flows to understand

### 1. An endpoint invocation becomes distributed execution

One invocation of a service Binding is planned into per-partition function
runs plus one reduction. Each function executes against the local partition
replica on the node that owns the data; only emitted partial results and
the final reduced result cross the network. The developer wrote one
service; the fan-out, retries, and reduction belong to Lagrange.

Read: [Minimal Deployment Surface](minimal-deployment-surface.md) — the
sealed call-surface contract — and
[Query Runtime Architecture](query-runtime.md)

### 2. A request finds the relevant data

Ingress is normalised, predicates narrow the partition set where possible,
and routing chooses eligible replicas. Writes target the canonical
partition leader; reads can prefer nearby replicas.

Read: [Process: Request Routing](process-request-routing.md)

### 3. A write becomes durable

The leader appends the proposal, replicates it through Raft, applies it
after a majority commit, and emits CDC from the apply path. Service
placement can shorten the application path, but it does not weaken
consensus.

Read: [Process: Replication](process-replication.md)

### 4. Locality follows changing usage

Real service-to-partition access becomes affinity evidence. Placement uses
that evidence alongside capacity, spread, failure, and policy constraints.
If data moves or partitions change, Cells can be replaced near the new
layout.

Read: [Process: Data Affinity](process-data-affinity.md) and
[Process: Rebalancing](process-rebalancing.md)

## The service execution model

Start with these when your question is how one service becomes distributed
execution:

- [Minimal Deployment Surface](minimal-deployment-surface.md) — the sealed
  Artifact / Binding / Cell call-surface contract and owner map. This is
  the design source of truth for the call surface: Binding shapes, budgets,
  and the reduce and witness contract.
- [Process: Request Routing](process-request-routing.md) — how SQL and
  service requests reach their target replica or Cell.
- [Query Runtime Architecture](query-runtime.md) — programmatic runtime,
  execution-mode dispatch, and the movement primitives beneath distributed
  plans.
- [Service Control Transport](service-control-transport.md) — the
  authenticated lifecycle SQL ingress (`INSTALL SERVICE`,
  `CREATE BINDING`, `CALL BINDING`) and its security boundary.
- [Lagrange Service Manifest](lagrange-service-manifest.md) — service
  manifest format and activation model.
- [Lagrange Service Registry](lagrange-service-registry.md) — service
  registry architecture.

## Storage, consensus, and placement machinery

The layers beneath the execution model. Ordinary callers never see them;
the service contract depends on them.

| Question | Start here |
| --- | --- |
| What objects exist, what owns state, and how do they relate? | [The Lagrange System Model](system-model.md) |
| How does a table become key ranges and how are queries narrowed? | [Process: Partitioning](process-partitioning.md) |
| How does a write commit and how is a replica recovered? | [Process: Replication](process-replication.md) |
| How does SQL or a service request find its target? | [Process: Request Routing](process-request-routing.md) |
| How does observed access pull compute toward data? | [Process: Data Affinity](process-data-affinity.md) |
| Why and how does the cluster move replicas and Cells? | [Process: Rebalancing](process-rebalancing.md) |
| How do Artifact, Binding, and Cell deployment work? | [Minimal Deployment Surface](minimal-deployment-surface.md) |
| How does a node or cluster start and join? | [Bootstrap And Data Flow](bootstrap.md) |
| Which component owns a specific runtime concern? | [Runtime Components](runtime-components.md) |
| Which claims are true in the current build? | [Current capabilities and limitations](../docs/current-capabilities-and-limitations.md) |

Reference material for the same layer:

- [Peer Address Resolution And Restart-With-New-IP Recovery](peer-address-resolution.md)
  — logical node identity, address resolution, and restart recovery.
- [Readiness Gating And Owner-Contract Kernels](readiness-and-owner-contracts.md)
  — readiness dimensions, membership guards, and shared owner contracts.

## Current boundaries

The architecture is easiest to understand when its boundaries are explicit:

- Lagrange is a substantial experimental system, not yet a mature drop-in
  production database.
- Request Bindings (HTTP) and call Bindings (`CALL BINDING` over the
  PostgreSQL wire protocol) are the publicly invocable external service
  paths today; the other accepted Binding source kinds (`pushdown`,
  `change`, `time`, `once`, `boot`) are declared-only.
- Managed OCI container execution is not active; it is an internal
  compatibility scaffold. Externally installed services run as genuine
  WASI components.
- PostgreSQL wire compatibility is a bounded measured slice, not a claim of
  arbitrary PostgreSQL or ORM compatibility.
- Query narrowing, indexes, snapshots, and learner promotion have important
  current limitations documented in the capability matrix.

These are implementation boundaries, not alternate architecture paths. Do not
infer a fallback system from code that is scaffolded, retained for compatibility,
or not production-invoked.

## Full architecture tree

The process documents are the recommended illustrated walkthrough. The domain
files below are the complete human architecture tree.

<!-- architecture-domain-files:start -->
- [The Lagrange System Model](system-model.md) - Storage stack, replicated group types, node anatomy, the control loop, and the shared diagram legend.
- [Process: Partitioning](process-partitioning.md) - Partition keys, key ranges, query-to-partition resolution, and the managed split/merge workflows.
- [Process: Replication](process-replication.md) - Raft groups, the write path, CDC propagation to read models, and replica loss and repair.
- [Process: Rebalancing](process-rebalancing.md) - Placement triggers, score dimensions, capacity admission, operation lifecycle, and movement safety guards.
- [Process: Request Routing](process-request-routing.md) - SQL ingress normalisation, replica candidate selection and retry, and service request routing through Bindings and Cells.
- [Process: Data Affinity](process-data-affinity.md) - Access attribution feed, affinity weights, placement pull, and read-locality routing.
- [Architecture Overview](overview.md) - Global architecture role, principles, and single-path ownership contract.
- [Runtime Lifecycle Architecture](runtime-lifecycle.md) - Runtime readiness, lifecycle ownership, runtime descriptors, and observability contracts.
- [Control Plane Architecture](control-plane.md) - Control-plane progression, system-table ownership, node state vocabulary, and configuration ownership.
- [Runtime Components](runtime-components.md) - Node-local components, replicated services, metadata services, and runtime service owners.
- [PostgreSQL Wire And SQL Compatibility](postgres-wire.md) - PostgreSQL wire service flow, endpoint discovery, and implemented SQL compatibility.
- [Query Runtime Architecture](query-runtime.md) - Programmatic runtime, query bridge, execution-mode dispatch, callback execution, and movement primitives.
- [Bootstrap And Data Flow](bootstrap.md) - Seed and joining bootstrap, query routing, CDC continuity, and meta-service management flow.
- [Raft, Rebalancing, And Placement](rebalance.md) - Addressing, Raft consensus, rebalancing, storage placement, and message-group assignment.
- [Operational Architecture Appendices](operational-appendices.md) - Error handling, testing, endpoint sync, and discovery architecture.
<!-- architecture-domain-files:end -->

## Compatibility and internals

Level-4 material: compatibility paths, legacy surfaces, and experimental
runtimes. Read it after the service execution model, not before. None of
it defines the public programming model, which is WASM service components.

- OCI runtime host contract (`oci-runtime-host-contract.md`,
  development-audience) — the OCI container runtime is an internal
  compatibility scaffold. Descriptor validation and an in-memory lifecycle
  exist; managed container activation is unsupported.
- Legacy partition-callback surface — the pre-Binding uploaded-callback
  mechanism, retained as a deliberate historical artifact in
  [`examples/distributed-sql`](../examples/distributed-sql/README.md) and
  covered by the callback-execution sections of
  [Query Runtime Architecture](query-runtime.md).
- Experimental and internal runtime kinds — `native_js` is the
  kernel-internal substrate (the SQL engine itself runs on it);
  `oci_container` is scaffold-only. Externally installed services run as
  WASI components.

Contributor-only owner ledgers, executable model records, workflow contracts,
and planning material are deliberately absent from this human index. This tree
describes the implemented system rather than the process used to change it.
