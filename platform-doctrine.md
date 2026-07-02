# Lagrange Platform Doctrine

## Document Role

This document governs platform framing only.

Use this file for:

- the long-form platform model
- the user-facing conceptual shape of Lagrange
- architectural framing that explains why the platform exists in its current
  form

Do not use this file for:

- day-to-day implementation doctrine
- stable implementation rules
- testing policy
- roadmap scope decisions

For implementation work, use [`docs/steering/doctrine.md`](docs/steering/doctrine.md)
as the canonical doctrine, then follow
[`docs/steering/system-guidelines.md`](docs/steering/system-guidelines.md),
[`docs/steering/testing-guidelines.md`](docs/steering/testing-guidelines.md),
and [`roadmap.md`](roadmap.md).

## Purpose

Lagrange is a distributed data and execution platform designed around a small number of durable primitives. The system manages physical distribution, replication, and placement automatically while exposing a simple and stable conceptual model to users.

The guiding principle is:

**external simplicity, internal rigor.**

Users interact with a small set of concepts.  
The system contains the complexity required to make those concepts scalable, reliable, and programmable.

## 1. Core User Primitives

Lagrange exposes two primary durable entities:

### Tables

Tables represent persistent structured state.

Properties:

- durable
- queryable via SQL
- automatically partitioned
- automatically replicated
- automatically rebalanced
- schema-defined

Users interact with tables through SQL and policy configuration.

Users do **not** manage:

- partitions
- replica placement
- leaders
- rebalancing operations

Those concerns belong entirely to the system.

### Services

Services represent persistent execution.

A service is a named, durable runtime workload.

Properties:

- invokable
- scalable
- replicated
- placed automatically
- versioned
- policy-controlled

Services may implement:

- application logic
- APIs
- distributed computation
- system functions

Users interact with services through deployment and invocation interfaces.

Users do **not** manage:

- runtime instances
- replica groups
- placement decisions
- failover logic

Those concerns belong entirely to the system.

## 2. System Responsibilities

The system is responsible for translating user intent into distributed reality.

This includes:

### Distribution

The system partitions data automatically.

Users define tables and policies.  
The system determines partition boundaries and placement.

### Replication

All partitions and services are replicated through Raft groups.

The system ensures:

- durability
- leader election
- log consistency
- failover

Replication details remain internal.

### Placement

The system manages where data and services run.

Placement decisions consider:

- cluster topology
- storage capacity
- latency groups
- policy constraints

Users influence placement through policies, not direct control.

### Rebalancing

The system continuously improves placement.

Triggers include:

- node join or failure
- load imbalance
- policy changes
- capacity pressure

Users do not manually rebalance partitions or services.

### Self-description

All cluster state is stored in tables.

This allows:

- introspection
- consistent replication
- automated repair
- uniform metadata access

The system manages its own state through the same mechanisms used for user data.

## 3. Internal Machinery

The system contains internal subsystems required to implement distributed guarantees.

Examples include:

- partitions
- replica operations
- CDC propagation
- control-plane workflows
- placement planners
- rebalancing coordinators
- system caches

These are **implementation mechanisms**, not user concepts.

Internal complexity is acceptable when it:

- improves reliability
- simplifies the user model
- preserves canonical execution paths

Internal complexity is unacceptable when it leaks into the user-facing model.

## 4. Canonical Paths

Every system concern has a single owner and a single execution path.

Examples:

- SQL planning and execution -> `SqlCore`
- runtime selection -> `Runtime_Driver_Registry`
- lifecycle orchestration -> `Service_Runtime_Lifecycle`
- placement planning -> `MovePlanner`
- durable workflows -> `DurableWorkflowCoordinator`

Parallel execution paths are forbidden.

Fallback mechanisms that bypass canonical owners are forbidden.

This guarantees predictable behavior and maintainable evolution.

## 5. Data Locality

Data locality is a first-class property.

Computation should move toward the data rather than the reverse.

This principle enables:

- efficient distributed execution
- reduced network movement
- scalable analytics
- partition-local computation

The system provides primitives that allow execution near the owning partitions.

## 6. Execution Model

Distributed execution is expressed through a small set of primitives.

Examples include:

- lookup
- emit
- broadcast
- reduce
- out

These primitives enable distributed computation while preserving control over:

- resource budgets
- retry semantics
- execution locality
- failure handling

Execution semantics must remain predictable and composable.

## 7. Policy Over Control

Users influence behavior through policies rather than direct manipulation.

Policies may govern:

- replica counts
- placement constraints
- resource budgets
- runtime permissions
- scaling behavior

The system decides how to realize those policies.

Direct manipulation of low-level mechanisms is intentionally avoided.

## 8. Uniform Metadata

All cluster metadata is represented as tables.

Benefits include:

- consistent replication
- introspection through SQL
- uniform tooling
- simplified system reasoning

System metadata follows the same durability and propagation rules as user data.

## 9. Operational Predictability

The system prioritizes predictable behavior over hidden optimization.

Key principles:

- deterministic control-plane workflows
- explicit ownership
- monotonic state transitions
- observable operations

This ensures the system remains debuggable and operable at scale.

## 10. Evolution

The system evolves by strengthening existing primitives rather than introducing new ones.

New features should extend:

- tables
- services
- policies
- distributed execution primitives

Introducing new user-visible entity types is strongly discouraged.

## 11. Acceptable Complexity

Internal complexity is acceptable when it:

- protects the simplicity of user primitives
- enforces correctness
- improves automation
- reduces operational burden

Complexity is unacceptable when it:

- fragments the conceptual model
- introduces parallel ownership paths
- leaks internal machinery into the user model

## 12. Guiding Question

Every architectural change should answer:

**Which core primitive does this strengthen?**

If the answer is:

“none — it introduces a new conceptual category”

the design should be reconsidered.
