# Lagrange Architecture Diagrams

This document contains diagrams explaining the core concepts of the
Lagrange distributed database and execution platform.

GitHub supports **Mermaid diagrams**, so these will render automatically
when viewed in the repository.

------------------------------------------------------------------------

# 1. High Level Architecture

``` mermaid
flowchart TD

Client[Client Applications]
SQL[PostgreSQL Wire Protocol]

Client --> SQL

SQL --> SqlCore

SqlCore[SqlCore SQL Engine]

SqlCore --> Router[Message Router]

Router --> Partitions
Router --> Wasm

Partitions[Partition Groups<br>Raft + SQLite]
Wasm[WASM Service Groups<br>Distributed Compute]

Partitions --> Nodes
Wasm --> Nodes

Nodes[Cluster Nodes]
```

------------------------------------------------------------------------

# 2. Compute-Near-Data Model

Traditional distributed systems move data to compute.

``` mermaid
flowchart LR

DB[(Database)]
Network1[Network Transfer]
Worker[Compute Worker]
Network2[Network Transfer]
Result[Result]

DB --> Network1 --> Worker --> Network2 --> Result
```

Lagrange moves compute to the data.

``` mermaid
flowchart LR

Client[Client]

Client --> Partition[Partition Node]

Partition --> Compute[Local WASM Execution]

Compute --> Result[Result]
```

------------------------------------------------------------------------

# 3. Cluster Structure

``` mermaid
flowchart TD

Cluster[Lagrange Cluster]

Cluster --> Node1
Cluster --> Node2
Cluster --> Node3

Node1 --> P1[Partition Replica]
Node2 --> P2[Partition Replica]
Node3 --> P3[Partition Replica]

P1 --> Raft
P2 --> Raft
P3 --> Raft

Raft[Raft Consensus Group]
```

Each table is divided into partitions and replicated across nodes.

------------------------------------------------------------------------

# 4. Query Routing

``` mermaid
sequenceDiagram

participant Client
participant SQL as SqlCore
participant Cache as System Table Cache
participant Router
participant Leader

Client->>SQL: SELECT * FROM users WHERE id=42
SQL->>Cache: find partition
Cache-->>SQL: partition + leader

SQL->>Router: route query
Router->>Leader: execute query

Leader-->>Router: rows
Router-->>SQL: rows
SQL-->>Client: results
```

------------------------------------------------------------------------

# 5. Distributed Execution

```mermaid
flowchart TD

Runtime[runtime.run + ctx.call]

Runtime --> Planner[SqlCore target planner]
Planner --> Partitions[Partition fanout]

Partitions --> Worker1[Worker 1 local stage]
Partitions --> Worker2[Worker 2 local stage]
Partitions --> WorkerN[Worker N local stage]

Worker1 --> Emit1[ctx.emit key,value]
Worker2 --> Emit2[ctx.emit key,value]
WorkerN --> EmitN[ctx.emit key,value]

Emit1 --> Shuffle[Shuffle by key]
Emit2 --> Shuffle
EmitN --> Shuffle

Shuffle --> Reduce[Reduce / aggregate]
Reduce --> Result[Result stream]
```

------------------------------------------------------------------------

# 6. WASM Service Groups

``` mermaid
flowchart TD

Client --> Gateway

Gateway --> ServiceGroup

ServiceGroup --> Replica1
ServiceGroup --> Replica2
ServiceGroup --> Replica3

Replica1 --> KV[(Replicated State)]
Replica2 --> KV
Replica3 --> KV
```

Services run inside replicated Raft groups.

------------------------------------------------------------------------

# 7. System Metadata Flow

``` mermaid
flowchart LR

SystemTables[(System Tables)]

SystemTables --> CDC

CDC --> MessageGroup

MessageGroup --> NodeCache1
MessageGroup --> NodeCache2
MessageGroup --> NodeCache3

NodeCache1[System Table Cache]
NodeCache2[System Table Cache]
NodeCache3[System Table Cache]
```

Metadata changes propagate through CDC events.

------------------------------------------------------------------------

# 8. Full System Overview

``` mermaid
flowchart TD

Client

Client --> SQL

SQL[SqlCore]

SQL --> Router

Router --> PartitionGroup
Router --> WasmGroup
Router --> MessageGroup

PartitionGroup[Partition Groups<br>Raft + SQLite]

WasmGroup[WASM Service Groups]

MessageGroup[Cluster Message Groups]

PartitionGroup --> Storage[(SQLite)]
WasmGroup --> Runtime
Runtime[WASM Runtime]
```

------------------------------------------------------------------------

# Usage

You can reference these diagrams from the README:

    See architecture/lagrange_architecture_diagrams.md for system diagrams.

Or embed them directly into documentation pages.
