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

# 12. Suggested Repo Layout

```text
architecture/
  lagrange_architecture_diagrams.md
  lagrange_advanced_architecture_diagrams.md
```

---

# 13. Best Use Order for Documentation

For best comprehension, link the diagrams in this order:

1. High-level architecture
2. Compute-near-data model
3. Query routing
4. Distributed execution pipeline
5. Partition lifecycle
6. Bootstrap process
7. WASM activation / service groups

That gives new readers the shortest path from **"what is this?"** to
**"I understand how this works."**
