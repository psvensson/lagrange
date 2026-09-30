---
audience: human
documentClass: current
---

# Lagrange Vocabulary

Lagrange deliberately reuses some infrastructure across data and compute. That
does not make all similarly named objects equivalent. These are the terms to
keep distinct.

## What A Service Author Writes

A service is one source-level unit. A handler accepts a request; a distributed
operation declares the data and functions needed to answer it.

| Term | Meaning |
| --- | --- |
| Handler | Function behind an HTTP route |
| Distributed operation | A fixed SQL selector, a partition function, and a reducer |
| Selector | SQL statement that determines the input rows and target partitions |
| `run(rows, arguments, context)` | Function executed beside each selected partition |
| `emit(key, value)` | Adds a numeric intermediate result for reduction; the return value of `run()` is only bookkeeping |
| `reduce(partials, arguments)` | Combines the complete set of emitted partials |
| `call(operation, arguments)` | Handler context helper that invokes a declared operation |

An operation is a descriptor, not a remote JavaScript closure. The compiler
turns the declarations into component code and deployment records. Per-call
arguments reach `run()`; they do not rewrite the fixed SQL selector.
See the [programming model](native-programming-model.md).

## Data Hierarchy

```text
Table
  └─ Partition (one primary-key range)
       └─ Replica (one copy on one node)
            └─ SQLite rows + Raft log
```

| Term | Meaning | Durable? | Who chooses it? |
| --- | --- | --- | --- |
| Table | Logical SQL-visible data set | Yes | User defines schema and policy |
| Partition | Contiguous partition-key range and unit of routing | Yes | System creates, splits, and merges |
| Replica | One member of a partition's Raft group | Yes | System places and repairs |
| Leader | Replica currently allowed to coordinate writes | A role, not separate data | Raft election |
| Learner | Non-voting replica catching up before promotion | Yes | Repair workflow |

A partition is the unit of consensus. A table is not one giant Raft group.
In execution documents, a **shard** usually means one partition's share of a
call. It is not a second storage hierarchy. A node can host several partitions,
so several shard tasks may execute on one physical machine.

## Service Deployment Hierarchy

```text
Artifact (immutable installed code)
  └─ Binding (immutable desired execution intent)
       └─ Cell (ready running instance)
```

| Term | Meaning | Durable? | Who chooses it? |
| --- | --- | --- | --- |
| Artifact | Validated, digest-pinned package | Yes | User installs it |
| Binding | Artifact export plus invocation source and budgets | Yes | User declares it |
| Cell | Ready running instance derived from a Binding | No; replaceable | System places and repairs it |
| Access policy | Tables, modes, and outbound call Bindings the Binding may use | Yes | User declares it |

A Cell does not have a per-service Raft log. If service code needs durable
state, it reads and writes ordinary tables.

A **digest** identifies exact bytes by a cryptographic hash. Pinning a digest
prevents an invocation from silently switching component versions. It is not,
by itself, a signature proving who authored the component.

## WebAssembly Terms

**WASM** is WebAssembly, the portable executable format. A **component** adds
typed imports and exports. **WASI** is the WebAssembly System Interface;
**WIT** is the language used to describe interface types and functions.
Lagrange supplies its own service-specific host interfaces as well.

These are separate from the JavaScript source language. A component is not a
Node.js process and does not automatically inherit Node.js libraries or host
permissions. See the official [component introduction][components] and
[WIT reference][wit], then Lagrange's [security boundary](security.md).

An **OCI layout** is used to package installation input here. It does not mean
that Lagrange runs the service as a Docker or other OCI container. The current
managed service path executes a WASI component.

## Coordination Terms

| Term | Meaning in the call path |
| --- | --- |
| Partial | A numeric intermediate result emitted by one shard, under a key that does not overlap another shard's keys |
| Slot | One expected shard's contribution to a particular invocation |
| Lease | Time-limited coordination ownership or activation demand; it is not a permanent placement promise |
| Epoch | A version of partition topology; a mismatched version lets the receiver reject an obsolete target |
| Fencing | Checking an identity, version, or ownership token before accepting work or publishing its result |
| Exactly-once visibility | Publishing one complete result for an invocation, not a promise that code or external effects execute only once |

See [execution semantics](execution-semantics.md) for the limits and failure
rules. Topology fencing does not give independent partition reads a shared
snapshot.

## “Service” Has Several Contexts

| Phrase | Meaning |
| --- | --- |
| Runtime service | A managed executable workload represented by Cells |
| Built-in service | Kernel-supplied service such as admin or PostgreSQL ingress |
| `service_definitions` row | Desired runtime-service state |
| `services` row | Actual replica/instance metadata on a node |
| Service lifecycle | Desired-versus-actual reconciliation and start/stop handling |
| Partition service | Internal implementation object hosting a partition replica; not a user-deployed service |

When architecture text says a partition and a runtime workload share lifecycle
machinery, it describes internal unification. It does not mean a user deploys a
table as an Artifact or that a Cell becomes a Raft member.

## Authority And Observation

| Term | Meaning |
| --- | --- |
| Owner row | Durable canonical metadata such as `partitions.leader_node_id` |
| System table | Cluster metadata stored through the ordinary replicated data path |
| CDC | Change data capture: committed changes propagated to consumers; here, notably system-table updates feeding routing caches |
| System-table cache | Node-local observational read model used for routing |
| Reconciliation | Repeated comparison of desired and actual state until they match |
| Fallback witness | Bounded bootstrap/recovery evidence used while canonical evidence is incomplete; not a second durable owner |

A cache records what a local consumer has observed and may lag committed
changes. Owner rows remain the durable source of ownership truth. Internal
system-table CDC is not a supported connector for ingesting changes from an
external PostgreSQL database.

## Control Plane And Data Plane

- The **data plane** executes user reads and writes against table partitions.
- The **control plane** decides placement, repair, readiness, and desired versus
  actual service state.
- **Transport and propagation** carry messages and CDC events between nodes.

These planes share storage and routing infrastructure, but they answer different
questions. A healthy process is not necessarily ready to serve data, and a
visible cached row is not necessarily proof that a workflow has completed.

[components]: https://component-model.bytecodealliance.org/design/components.html
[wit]: https://component-model.bytecodealliance.org/design/wit.html
