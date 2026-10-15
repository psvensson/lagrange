---
audience: human
documentClass: planning
---

# Developer Adoption Direction

Lagrange's developer promise is simple: keep familiar application code and
dependencies, then move selected computation to the data without making the
developer operate a distributed scheduler.

This document describes intended **developer outcomes and acceptance tests**.
It is not a statement of shipped support, a new API specification, an
implementation-scope authority, or a separate release roadmap.

For actual support, read [Current capabilities and limitations](current-capabilities-and-limitations.md).
For release order, read the [product roadmap](../roadmap.md). For a usable
pilot sequence, read [Migration and adoption](migration.md).

## Adopt one capability at a time

A useful adoption path should have independent, reversible steps:

1. **Connect existing SQL clients.** Use the documented PostgreSQL-wire subset
   and ordinary drivers. This is not full PostgreSQL or ORM compatibility.
2. **Evaluate data movement.** Export/load the selected schema and rows into
   Lagrange, verify parity, and preserve the previous source of truth. Lagrange
   is not an extension that executes distributed functions inside an external
   PostgreSQL cluster; a supported source-database CDC ingestion product does
   not yet exist.
3. **Author one service and data-local operation.** The existing code-first
   JavaScript path uses `defineService`, named `distributed` operations,
   `run`, `emit`, `reduce`, and generated deployment records. Keep unrelated
   application work outside the extracted operation.
4. **Port an ordinary native service when OCI is supported.** Retain its
   language, native libraries, and container dependencies; optionally expose
   named functions for data-local execution through the same Lagrange service
   and Binding model. Managed native OCI invocation is still planned.
5. **Add source-driven work when supported.** `change` and `time` Bindings
   already have declaration shapes, but their invocation adapters are not
   publicly available. Start with useful trigger/delivery semantics, not a
   second workflow engine.

Each step must have a testable rollback or exit path. No developer should have
to adopt every Lagrange capability to benefit from one.

## Keep one execution model, not one universal coordinator

The source-level concepts remain a **service**, **named operation**,
**authorized invocation context**, **Binding source**, and **typed outcome**.
Convenient SDK naming does not create a new platform capability.

- A source-level operation reference is an authoring handle. Build/deploy
  derives immutable Artifact, Binding, export, revision, and outbound-call
  authority. An invocation never ships a closure, source file, or VM heap.
- WASM and native OCI project one service API. Each supported native SDK must
  match the supported WASM host capabilities **for the same admitted WIT world
  and Binding mode**, including types, authorization, budgets, deadline,
  failure classifications, and result semantics. API parity does **not**
  imply equivalent runtime isolation or native operating-system capabilities.
- Request and Call Cell worlds are intentionally different. The existence of
  a convenient SDK database method must not grant a Call Cell unrestricted
  read/write access. Extend host interfaces through one versioned, owned
  contract rather than silently widening an existing invocation mode.
- A request, a distributed call, and a future change/time trigger may have
  distinct routing, journaling, fanout, completion, and retry owners.
  `CallCellInvoker` retains call fanout and reduction;
  `ServiceRuntimeLifecycle.invoke()` remains the provider-neutral runtime
  invocation seam. A native broker transports authorized calls; it does not
  choose hosts, reroute shards, schedule retries, or publish results.
- Do not add a universal invocation coordinator merely for uniform naming.
  A narrower admitted-leaf-execution refactor is justified only by measured
  duplicated decisions and a baseline comparison against the existing seam.
- Images can consume an admitted remote execution seam while retaining its
  language dispatch, object identity, local activation, and project history.
  A local Images message send is not inherently a distributed invocation.

The [programming model](native-programming-model.md),
[execution semantics](execution-semantics.md),
[canonical WIT](../wit/world.wit), and
[native OCI architecture](../architecture/native-oci-call-cells.md)
remain the detailed design references. This page must not duplicate their
schemas or become a competing behavioral owner.

## Close the useful Call Cell envelope before deep optimizer work

The priority is not an unbounded `ctx.call` API. It is to make ordinary
data-heavy operations expressible under explicit safety and consistency
contracts:

| Developer need | Required outcome |
| --- | --- |
| Narrow a call with request data | Typed, safe selector parameters that prune relevant partitions before reading rows; no runtime SQL interpolation or undeclared table access. |
| Analyze larger datasets | Bounded streaming/paging with backpressure, cancellation/deadlines, and defined ordering/resume semantics. |
| Combine information across partitions | Bounded structured partial values and explicit merge behavior for shared logical keys, preserving full-slot completeness and deterministic reduction. |
| Compose more than one operation | Multiple named operations and bounded composition through the existing call owner, with source-declared outbound authorization. |
| Understand actual parallelism | A plan/trace showing selected partitions, admitted concurrency, local work, activation, exchange size, retries, and reduction. |
| Select a consistency level | Accurate documented distinctions among local reads, global snapshots, transaction boundaries, result visibility, and external effects. |

Today the public call selector is a fixed single-table `SELECT`, each
partition contributes one bounded batch, partials are finite numeric values
under shard-disjoint keys, and one call has no cross-partition snapshot.
An invocation can fan out concurrently, but concurrency and same-host Cell
capacity are bounded. **No guarantee says that many partitions finish in
roughly the latency of one partition.** Performance claims require controlled
measurements that include admission, activation, serial sections, exchange,
and reduction.

The near-term goal is basic safe composition and streaming; sophisticated
multi-stage distributed optimization can remain a later milestone.

## Developer acceptance scenarios

These are product-level outcome gates, not already-running tests or a new
implementation work queue.

### A. Migrate a real data-heavy endpoint

Take a conventional application using PostgreSQL and a standard language
driver. Inventory its schema/SQL compatibility, move a bounded dataset into
Lagrange, run a baseline side by side, and exercise one extracted operation.

Acceptance requires a documented compatibility result, data parity (including
counts/checksums and an application oracle), observed selected-shard locality,
correctness under representative load, an explicit authority switch, and a
rehearsed rollback. Do not claim a built-in upstream CDC connector.

### B. Show useful distributed execution

Run a named operation across data on multiple real partition hosts. Compare
the reduced result with an independent oracle; show complete expected shard
participation, bounded fanout/partial volume, request correlation, and a
transparent explanation of actual concurrency and transfer costs.

Show refusal or a typed incomplete outcome when a required shard fails.
Exactly-once *visible result publication* is not exactly-once guest code
execution and does not cover arbitrary external effects.

### C. Prove WASM/native provider parity

Run equivalent admitted operations through real WASM and at least two
materially different native-language OCI SDK implementations, including one
with a genuine native dependency. Exercise authorized and denied capabilities,
wrong revision/identity, budgets, nested-call limits, deadlines, stale routes,
transport loss before/after possible execution, replay identity, replacement,
and result publication.

Every host capability exposed through an SDK must map to the same approved
world/Binding capability and behavior as WASM; unsupported methods must be
reported as unavailable, never emulated via privileged shortcuts.
Ordinary PostgreSQL client connectivity is separate from this host-capability
parity promise.

### D. Process a durable change or timer trigger

Once publicly supported, commit an application change or advance a declared
schedule; prove handler admission, delivery identity, acknowledgement,
checkpoint/replay, bounded retries, and restart behavior through the normal
Binding/Cell owners.

Do not promise exactly-once emails, payments, or other external side effects.
An arbitrary business workflow engine is not required for this initial gate.

### E. Diagnose and operate the whole request

For a failed application call, a developer must be able to correlate the
outer request to its selected partitions, individual executions, retries,
activation, result publication, and typed final outcome without reading
unrelated internal service logs. Prove service version identity, rollback,
upgrade/restart behavior, and truthful unsupported-feature diagnostics.

## Acceptance alongside the existing roadmap

| Existing milestone | Developer acceptance emphasis |
| --- | --- |
| 0.2 stable core | Code-first multi-node proof, safe selector narrowing, bounded structured partials, bounded paging/streaming, multi-operation dispatch and honest benchmarks. |
| 0.3 queryable core | Ordinary key/index access, locking reads, live queries and a measured PostgreSQL compatibility slice. |
| 0.5 external usability | Repeatable import/shadow/cutover/rollback and exit procedures; connected driver examples, local testing, readable tracing, supportable deployment instructions. |
| 0.6 native OCI | One lifecycle and same-program native handlers/Call Cells; complete per-world host-capability SDK parity, multi-node locality, real native dependency and failure/restart proofs. |
| Later source/workflow work | Publicly invocable change/time sources with explicit durable delivery semantics before richer jobs and workflows. No automatic new release number. |
| 1.0 production hardening | Security, backup/restore, upgrades, supported envelopes, diagnostics, compatibility guarantees, and operational certification. |
| 2.0 deeper execution | Advanced multi-stage plans, optimization, specialized indexes and resource placement, using the same service model. |

The human roadmap is product direction, not executable scope. Actual AGPL
feature sequencing, edition ownership, owner contracts, and active Quest
authority remain in their existing canonical locations. This document must
not change release status or imply that an experimental alpha is ready for
general production use.

## Work suitable for independent parallel progress

The following *bounded preparatory artifacts* can be produced without changing
rs-raft, transaction/recovery, partition ownership, Cell routing, or production
invocation behavior:

- A **WIT-derived capability inventory** that enumerates each world/import/
  export and its existing owner; it must derive types from canonical WIT rather
  than copy a second hand-maintained grammar.
- A **provider-neutral conformance fixture specification** with positive and
  negative cases, reusable later for WASM and native OCI without pretending
  OCI currently passes.
- A **real-client compatibility worksheet** using an existing PostgreSQL
  driver and representative queries; run actual acceptance against a named
  candidate when it is available rather than asserting generic ORM support.
- A **migration and independent-oracle example** comparing the existing SQL
  path to a bounded data-local operation, with measured data movement and
  honest rollback.
- **Developer navigation and error-message improvements** confined to the
  current documented service path, with no new execution owner or mode.

Anything touching runtime semantics, a sealed ABI, durable identity, or
cross-owner execution must first follow that concern's existing change and
proof process. This page is not authorization to bypass it.
