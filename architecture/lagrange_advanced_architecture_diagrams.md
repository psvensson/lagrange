# Lagrange — Advanced Architecture Diagrams

This document extends the core diagram pack with the diagrams that are usually
most helpful when explaining a distributed database and compute-near-data
system to developers, contributors, and potential users.

These diagrams are written in **Mermaid**, so GitHub should render them
directly in the repository.

---

# 1. Partition Lifecycle

This shows how a table partition can move through its normal operational
lifecycle as load and data distribution change.

```mermaid
flowchart TD

A[Create Partition] --> B[Assign Initial Replicas]
B --> C[Elect Leader]
C --> D[Serve Reads and Writes]

D --> E{Threshold Reached?}

E -- No --> D
E -- Hot range / size growth --> F[Split Partition]
E -- Low utilization / adjacent sparse ranges --> G[Merge Candidate]
E -- Replica imbalance / topology change --> H[Rebalance Replicas]

F --> I[Create Child Partitions]
I --> J[Transfer Metadata]
J --> K[Warm Followers]
K --> L[Cut Over Routing]
L --> D

G --> M[Validate Adjacent Compatibility]
M --> N[Create Merged Successor]
N --> O[Transfer Ownership]
O --> P[Retire Old Partitions]
P --> D

H --> Q[Plan Replica Movement]
Q --> R[Add New Replica]
R --> S[Catch Up Log]
S --> T[Promote / Demote Roles]
T --> U[Remove Old Replica]
U --> D
```

### What this communicates

- Partitions are not static; they adapt to workload and topology.
- Split, merge, and rebalance are explicit control-plane operations.
- Routing changes only after the new state is ready.

---

# 2. Partition Split Flow

This version focuses specifically on split mechanics.

```mermaid
sequenceDiagram

participant Planner as Control Plane
participant Cache as System Cache
participant Old as Current Partition Leader
participant F1 as Follower A
participant F2 as Follower B
participant NewL as Child Partition A
participant NewR as Child Partition B

Planner->>Old: evaluate split plan
Planner->>Cache: reserve new partition metadata
Old->>F1: replicate final pre-split entries
Old->>F2: replicate final pre-split entries

Old->>NewL: create child partition A
Old->>NewR: create child partition B

Old->>NewL: copy left key-range state
Old->>NewR: copy right key-range state

NewL-->>Planner: ready
NewR-->>Planner: ready

Planner->>Cache: publish new routing
Planner->>Old: retire old partition
```

---

# 3. Distributed Execution Pipeline

This diagram shows the most important "developer mental model" for the runtime:
query selection, local execution, optional shuffle, and reduction.

```mermaid
flowchart TD

A[ctx.call / runtime.run] --> B[Build Execution Request]
B --> C[SqlCore Plans Partition Targets]
C --> D[Dispatch to Relevant Partitions]

D --> E1[Partition Worker 1]
D --> E2[Partition Worker 2]
D --> E3[Partition Worker N]

E1 --> F{Execution Pattern}
E2 --> F
E3 --> F

F -- local only --> G[ctx.out Final Rows]
F -- keyed exchange --> H[ctx.emit key,value]
F -- remote fetch --> I[ctx.lookup batched keys]
F -- small shared set --> J[ctx.broadcast dataset]

H --> K[Shuffle / Group Stage]
I --> L[Lookup Results]
J --> M[Broadcast Cache]

K --> N[Reduce / Aggregate Stage]
L --> N
M --> N

N --> O[Result Stream]
G --> O
```

### What this communicates

- `ctx.call(...)` is the entry point, but the real behavior depends on plan shape.
- Exchange, lookup, and broadcast are first-class movement primitives.
- Reduce happens after local work, not before.

---

# 4. Stage Execution with Shuffle

```mermaid
sequenceDiagram

participant User as User Function
participant Core as SqlCore
participant P1 as Partition 1
participant P2 as Partition 2
participant P3 as Partition 3
participant Group as Shuffle / Exchange
participant Reduce as Reduce Stage

User->>Core: ctx.call(select, handler, {exchangeBy:"key"})
Core->>P1: execute stage handler
Core->>P2: execute stage handler
Core->>P3: execute stage handler

P1->>Group: emit(k,v)
P2->>Group: emit(k,v)
P3->>Group: emit(k,v)

Group->>Reduce: grouped partitions by key
Reduce-->>Core: reduced output
Core-->>User: result stream
```

---

# 5. Query Routing and Metadata Resolution

```mermaid
flowchart LR

Q[Incoming SQL Query] --> P[Parse Table and Predicate]
P --> C[System Table Cache Lookup]
C --> R[Resolve Matching Partition Range]
R --> S[Resolve Current Leader]
S --> M[Message Router]
M --> L[Partition Leader]
L --> X[Execute via SqlCore]
X --> Y[Return Rows / Ack]
```

---

# 6. Bootstrap Process

This is one of the most useful diagrams for contributors, because it explains
how the system avoids the "empty metadata" problem during cluster formation.

```mermaid
flowchart TD

A[Start Seed Node] --> B[Create Infrastructure Services]
B --> C[Create Message Groups]
C --> D[Create System Table Partitions]
D --> E[Enable Bootstrap Mode]
E --> F[Directly Register Initial Metadata]
F --> G[Disable Bootstrap Mode]
G --> H[Read System Tables]
H --> I[Hydrate System Table Cache]
I --> J[Accept Joins and Route SQL]

J --> K[Joining Node Contacts Seed]
K --> L[Receive System Table Snapshots]
L --> M[Hydrate Local Cache]
M --> N[Subscribe to CDC]
N --> O[Register Self]
O --> P[Ready]
```

---

# 7. Seed Node Bootstrap Sequence

```mermaid
sequenceDiagram

participant Seed as Seed Node
participant Msg as Message Groups
participant Sys as System Partitions
participant Cache as System Cache

Seed->>Msg: create message infrastructure
Seed->>Sys: create system table partitions
Seed->>Seed: enable bootstrap mode
Seed->>Sys: write initial nodes / partitions / services
Seed->>Seed: disable bootstrap mode
Seed->>Sys: read current metadata
Sys-->>Cache: hydrate cache
Cache-->>Seed: routing ready
```

---

# 8. Joining Node Bootstrap Sequence

```mermaid
sequenceDiagram

participant Join as Joining Node
participant Seed as Seed Node
participant Cache as Local Cache
participant CDC as CDC Stream

Join->>Seed: /bootstrap request
Seed-->>Join: system table snapshots
Join->>Cache: hydrate local cache
Join->>CDC: subscribe to metadata changes
Join->>Seed: register self through normal routing
Seed-->>Join: acknowledgement
Join-->>Join: ready to serve
```

---

# 9. Metadata Propagation by CDC

```mermaid
flowchart TD

A[System Table Write] --> B[Partition Leader Commit]
B --> C[Generate CDC Event]
C --> D[Publish via Message Group]
D --> E1[Node Cache 1 Update]
D --> E2[Node Cache 2 Update]
D --> E3[Node Cache N Update]

E1 --> F[New Routing State]
E2 --> F
E3 --> F
```

---

# 10. WASM Module Activation

This is helpful for explaining why the WASM runtime is safe and controlled.

```mermaid
flowchart TD

A[Upload Module Artifact] --> B[Read Manifest]
B --> C[Validate digest / identity]
C --> D[Validate run_export]
D --> E[Resolve pinned dependencies]
E --> F[Validate capability allowlist]
F --> G[Create activation record]
G --> H[Deploy to WASM Service Group]
H --> I[Ready for invocation]
```

---

# 11. WASM Service Group Replication

```mermaid
flowchart TD

Client[Client Request] --> Gateway[Gateway / Router]
Gateway --> Leader[WASM Service Leader]

Leader --> Log[Replicated Command Log]
Log --> F1[Follower Replica 1]
Log --> F2[Follower Replica 2]

Leader --> State[Replicated KV / Session State]
F1 --> State
F2 --> State

Leader --> Timers[Persistent Timers]
```

---

# 12. Service Platform — Definitions, Runtime Drivers, and Registry

Services are first-class: a partition is a service, and so are the SQL engine,
WASM services, and the admin/meta services. This diagram separates what is
**shipped** (the replicated service runtime driven by `service_definitions`) from
the **planned** installable-service registry (OCI packaging, manifest, kernel
capability model — designed in `lagrange-service-registry.md`,
`lagrange-service-manifest.md`, and `lagrange-kernel-platform-api-v0.md`, not yet
in code).

```mermaid
flowchart TD

subgraph Planned["Installable service registry — PLANNED (design only)"]
  OCI[OCI registries] --> Install["INSTALL SERVICE / lagrange service install"]
  Install --> Catalog[Service catalog<br>desired vs actual]
  Catalog --> Reconcile[Reconciler:<br>fetch, verify digest,<br>validate manifest + capability allowlist]
end

Reconcile -. activates .-> Def

subgraph Active["Replicated service runtime — ACTIVE (shipped)"]
  Def["service_definitions row<br>runtime_kind, service_profile, read_locality"] --> Registry[Runtime_Driver_Registry<br>selects driver by runtime_kind]
  Registry --> Native["native_js (e.g. sql_engine)"]
  Registry --> Wasm[wasm_component]
  Registry --> Oci[oci_container<br>feature-gated]
  Native --> Lifecycle
  Wasm --> Lifecycle
  Oci --> Lifecycle
  Lifecycle["Service_Runtime_Lifecycle<br>prepare / start / stop / health"] --> Group[Replicated service group<br>Raft + load-aware placement]
end
```

### What this communicates

- One `service_definitions` row + `Runtime_Driver_Registry` selects the runtime
  driver; `Service_Runtime_Lifecycle` owns prepare/start/stop/health for every
  runtime kind — no per-kind lifecycle fork.
- The OCI registry / manifest / kernel-API layer is designed but not yet built;
  it feeds `service_definitions` when it lands.

---

# 13. Placement, Rebalancing, and Read-Locality Routing

Placement (where replicas live, write/topology-time) and read-locality routing
(which replica a read is sent to, read-time) are **two distinct layers** that are
easy to conflate. Both service↔data placement affinity and read-locality routing
are active; activation-cost scoring remains future.

```mermaid
flowchart TD

subgraph L1["Layer 1 — Placement (write-time / topology)"]
  Trigger[Trigger:<br>node join/leave, replica failure,<br>policy change, periodic] --> UR[UnifiedRebalancer<br>per-entity, leader-driven]
  UR --> MP[MovePlanner.sortNodesBySuitability]
  MP --> D1[replica count + spread<br>TablePolicyService]
  MP --> D2[storage capacity + pressure<br>StorageAdmissionService]
  MP --> D3[activation cost / image locality<br>FUTURE]
  MP --> D4["data-access affinity<br>ACTIVE from fresh access evidence"]
  MP --> RC[RebalanceCoordinator<br>ADD / REPLACE / REMOVE<br>via replica_operations]
end

subgraph L2["Layer 2 — Read-locality routing (read-time) — ACTIVE"]
  Svc["Issuing service<br>service_definitions.read_locality"] --> SC["SqlCore.resolveIssuingServiceReadLocality"]
  SC -->|same_group| Local[Prefer same-latency-group replica<br>local node first]
  SC -->|any / unset| Uniform[Uniform routing over routable replicas]
end
```

### What this communicates

- `UnifiedRebalancer` + the single `MovePlanner` own placement. Production
  scoring composes replica spread, storage, incumbent movement cost, and
  data-access affinity derived from fresh `service_partition_access` evidence.
  Activation-cost remains a planned placement dimension (see
  `future/activation-cost-aware-placement.md`).
- **Read-locality is a separate, shipped routing policy:** a service with
  `read_locality = same_group` has its reads steered to its own latency group
  (local node first); `any` keeps uniform load-spreading. This is resolved
  per-query from the node-local CDC cache — no placement move required.

---

# Coverage and Intentional Gaps

These two packs cover the query/execution/WASM/CDC/bootstrap core, the service
platform, and placement/read-locality. Not yet diagrammed (tracked, not
forgotten): control-plane readiness progression and the owner-contract kernels
(see [`readiness-and-owner-contracts.md`](readiness-and-owner-contracts.md)), and
the PostgreSQL wire/endpoint-discovery path (see [`postgres-wire.md`](postgres-wire.md)).

For the recommended reading order, start at [INDEX.md](INDEX.md).
