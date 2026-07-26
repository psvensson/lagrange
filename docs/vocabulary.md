---
audience: human
documentClass: current
---

# Lagrange Vocabulary

Lagrange deliberately reuses some infrastructure across data and compute. That
does not make all similarly named objects equivalent. These are the terms to
keep distinct.

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

## Service Deployment Hierarchy

```text
Artifact (immutable installed code)
  └─ Binding (immutable desired execution intent)
       └─ Cell (ready, running actual)
```

| Term | Meaning | Durable? | Who chooses it? |
| --- | --- | --- | --- |
| Artifact | Validated, digest-pinned package | Yes | User installs it |
| Binding | Artifact export plus invocation source and budgets | Yes | User declares it |
| Cell | Ready running actual derived from a Binding | No; replaceable | System places and repairs it |
| Access policy | Tables and modes the Binding may use | Yes | User declares it |

A Cell does not have a per-service Raft log. If service code needs durable
state, it reads and writes ordinary tables.

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
| CDC | Change delivery that propagates committed system-table updates |
| System-table cache | Node-local observational read model used for routing |
| Reconciliation | Repeated comparison of desired and actual state until they match |
| Fallback witness | Bounded bootstrap/recovery evidence used while canonical evidence is incomplete; not a second durable owner |

The cache is authoritative for what a local consumer has observed, not for what
has durably completed elsewhere. Owner rows remain the durable source of
ownership truth.

## Control Plane And Data Plane

- The **data plane** executes user reads and writes against table partitions.
- The **control plane** decides placement, repair, readiness, and desired versus
  actual service state.
- **Transport and propagation** carry messages and CDC events between nodes.

These planes share storage and routing infrastructure, but they answer different
questions. A healthy process is not necessarily ready to serve data, and a
visible cached row is not necessarily proof that a workflow has completed.
