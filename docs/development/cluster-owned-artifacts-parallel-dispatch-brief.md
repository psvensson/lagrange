---
audience: development
documentClass: planning
---

# Brief: Cluster-Owned Artifacts And Parallel Call Dispatch

> Implementation brief from Peter, 2026-08-03, preserved verbatim below. It is
> the acceptance authority for the Quests that implement cluster-owned WASM
> artifact storage and bounded parallel shard dispatch. Related planning:
> `solve/epics/services-doc-tightening.md` (the docs epic whose open
> questions this brief partially resolves).

---

Implement two related changes:

1. Make Lagrange durably own installed WASM artifacts.
2. Dispatch partition-local `run` executions concurrently rather than
   serially.

The changes should preserve the existing Artifact / Binding / Cell model,
reuse existing owners, and introduce no alternate scheduler, runtime
lifecycle, or invocation path.

---

## 1. Store Installed WASM Artifacts In Lagrange

### Goal

Once `INSTALL SERVICE` succeeds, every byte needed to start the installed
WASM component must be durably available inside the Lagrange cluster.

External OCI registries and local OCI layouts remain installation inputs.
They must not remain runtime dependencies.

The desired model is:

```text
external OCI source
        ↓
verify and import once
        ↓
replicated Lagrange artifact store
        ↓
node-local disposable cache
        ↓
WASM Cell
```

The node-local filesystem cache remains useful, but it is only a cache.
Losing every local cache must not make an installed service unavailable.

### Keep Artifact Identity Unchanged

Continue to use immutable, digest-pinned identities:

```text
package_id
manifest_digest
artifact_digest
payload_digest
```

Bindings continue to pin an exact package, manifest and export.

Do not introduce mutable artifact versions or tag-based runtime resolution.

### Separate Metadata From Payload Bytes

Keep small lifecycle and identity records in the existing control-plane
tables.

Store executable payload bytes in an internal partitioned Lagrange table, not
in a CDC-propagated metadata table and not in the system-table cache.

Conceptually:

```sql
artifact_payloads (
    payload_digest,
    artifact_digest,
    media_type,
    total_size,
    chunk_count,
    state,
    created_at,
    sealed_at
)

artifact_payload_chunks (
    payload_digest,
    chunk_number,
    chunk_digest,
    chunk_size,
    bytes
)
```

Exact names may follow existing table conventions.

The payload table should use the normal partition, Raft and SQLite storage
path. It must not introduce a separate blob store.

### Chunk Payloads

Do not store an entire component in one giant row.

Split payloads into bounded chunks, probably between 1 MiB and 8 MiB. Choose
one fixed initial chunk size and make the choice a named policy constant.

Each chunk must contain:

* payload digest;
* zero-based chunk number;
* chunk digest;
* chunk size;
* bytes.

The sealed payload record must contain:

* total payload size;
* expected chunk count;
* final payload digest;
* media type;
* immutable Artifact identity.

Verify every chunk while reading and verify the final assembled payload
before use.

### Installation State Machine

An artifact must not become bindable before all payload bytes are durable and
verified.

Use a monotonic lifecycle such as:

```text
UPLOADING
    ↓
SEALED
```

Failures before sealing leave no bindable Artifact.

A safe installation order is:

1. Normalize and validate the manifest.
2. Acquire the OCI descriptor and payload.
3. Verify media type, bounds, signature policy and all digests.
4. Create or reuse the immutable payload identity.
5. Write all payload chunks idempotently.
6. Verify the complete stored payload.
7. Atomically mark the payload `SEALED`.
8. Record the package, revision and installation intent.
9. Allow Bindings to reference it.

Byte-identical retries must be idempotent.

A conflicting retry using the same digest but different bytes, size, media
type or chunk layout must fail closed.

### Artifact Loading

Change the node-local Artifact loader to use this order:

```text
1. Local content-addressed cache
2. Internal Lagrange artifact table
3. Optional external repair source
```

The external source should be a repair path, not the normal source of truth
after installation.

When loading from the internal table:

1. Read the sealed payload metadata.
2. Stream chunks in chunk-number order.
3. Verify each chunk.
4. Verify total size and final digest.
5. atomically populate the node-local cache;
6. start the component through the existing `WasmComponentDriver` and runtime
   lifecycle.

Never expose partially written cache files. Continue using temporary files
plus atomic rename.

### Bootstrap Constraint

Artifact storage must depend only on the built-in native database runtime.

Starting a WASM component cannot require another user WASM component to read
the component bytes. Avoid any circular dependency between the Artifact store
and Cell activation.

### Placement

Do not copy every Artifact onto every node.

Artifact metadata is globally visible, but payload bytes remain in the
replicated internal table and are materialized into node caches only when a
Cell is placed or activated there.

Later, artifact-table replica placement may be optimized by region, latency
group or activation frequency. That is not required for the first
implementation.

### Garbage Collection

Do not use an unsafe live reference counter.

Create a durable mark-and-sweep owner that derives reachability from
canonical references such as:

* installed service revisions;
* Bindings;
* running or desired Cells;
* in-flight pinned invocations;
* retained rollback revisions.

Only sealed payloads with no canonical references and older than a retention
window may be removed.

Garbage collection may be a follow-up quest, but the schema and ownership
boundaries must not make safe GC impossible.

### Migration

Existing installations may still refer to an external source and node-local
cache only.

Provide one explicit migration path:

```text
existing installed Artifact
    ↓
load and verify through current resolver
    ↓
import into internal artifact table
    ↓
seal
```

Do not silently report old Artifacts as internally durable before the import
completes.

A temporary compatibility read path is acceptable during migration:

```text
internal store → external source
```

New installations should internalize WASM payloads by default.

### OCI Containers

Keep the first implementation scoped to `wasm_component`.

Container layers are much larger and need separate policy and operational
analysis. Do not widen this change into managed OCI container mirroring.

---

## 2. Parallelize Partition-Local `run` Dispatch

### Goal

`CallCellInvoker` currently dispatches each shard with an awaited call inside
a loop.

Change it so independent partition-local `run` executions proceed
concurrently while preserving:

* per-partition locality;
* topology fencing;
* bounded activation;
* complete-result semantics;
* bounded resource use;
* exactly one visible reduced result.

Do not use an unlimited `Promise.all` over every partition.

### Add A Bounded Concurrency Owner

Introduce a named, testable concurrency mechanism owned by the call
invocation path.

The maximum concurrent shard runs should be derived from system policy or
Binding budgets, not directly selected by the caller.

Conceptually:

```text
maxConcurrentShardRuns
```

The initial default may be conservative, for example 8 or 16. Keep it a named
configuration value.

The mechanism should:

* begin at most N shard runs simultaneously;
* start another shard as one finishes;
* respect the invocation deadline;
* stop admitting new work after terminal failure or cancellation;
* wait for already-started work to settle cleanly.

Avoid adding a generic scheduler if a small bounded worker pool inside the
invocation owner is sufficient.

### Preserve Deterministic Slot Identity

Continue to create the invocation UUID and deterministic slot IDs before
dispatch:

```text
slot 1 → partition A
slot 2 → partition B
slot 3 → partition C
```

Parallel execution must not change slot identity, wire invocation identity,
lease identity or reduction ordering semantics.

Results may finish in any order. Coordination rows, not completion order,
define the invocation.

### Per-Shard Execution

Each concurrent shard task should independently:

1. use the already resolved canonical partition host and topology fence;
2. try host-restricted Cell dispatch;
3. publish or refresh an activation lease when the host lacks a ready Cell;
4. retry within the shared invocation deadline;
5. execute the partition-local statement on the host node;
6. run the pinned WASM `run` export there;
7. normalize bounded emitted partials;
8. acquire its coordination slot lease;
9. publish that slot's partial set.

No shard may fetch raw rows through the ingress node.

### Failure Semantics

The invocation remains fail-closed.

If any selected shard fails:

* do not silently drop it;
* do not reduce a partial subset;
* do not publish a final result;
* stop starting additional shard work;
* cancel outstanding work where cancellation is supported;
* allow already-running work to settle without making anything visible;
* return the typed failure appropriate to the first canonical terminal cause.

Do not make final error selection depend accidentally on network race order.
Define a deterministic precedence for failures, or select by stable slot
order after all started tasks settle.

Partial rows left by failed invocations remain invisible because reduction
requires a complete, fresh and disjoint slot set. Existing expiry and reclaim
logic should clean them later.

### Deadline And Cancellation

All shard tasks share the original invocation deadline.

Do not grant each shard a fresh timeout.

Activation waiting, dispatch, local statement execution, WASM execution,
partial publication and reduction must consume the same top-level budget.

Where possible, propagate one cancellation token or abort signal through:

```text
CallCellInvoker
→ statement adapter
→ ServiceDispatcher
→ MessageRouter
→ receiver
→ WASM runtime
```

If the current transport cannot cancel already-dispatched work, make that
limitation explicit while still preventing new shard admission and final
publication.

### Reduction

Only resolve the complete partial set after every shard task has successfully
published its slot.

Then:

1. resolve the reduce route;
2. acquire the dedicated reduce lease;
3. invoke `reduce`;
4. verify that execution occurred on the lease-holding replica;
5. atomically publish exactly one final snapshot.

Parallel shard completion must not weaken the current exactly-once-visible
result contract.

### Coordination Contention

Concurrent partial publication may hit the same coordination-table partition.

Keep each slot write independent and idempotent. Do not serialize the entire
invocation merely to avoid table contention.

Measure the coordination path. If it becomes the bottleneck, improve
partitioning or batching in a separate change rather than reintroducing
serial shard execution.

### Observability

Add invocation-level telemetry for:

* selected partition count;
* configured concurrency;
* peak concurrent shard runs;
* ready-Cell hits;
* activation leases published;
* artifact cache hits and internal-store reads;
* shard dispatch duration;
* local statement duration;
* WASM duration;
* partial publication duration;
* reduction duration;
* cancellation and failure reason;
* bytes read from the artifact table;
* bytes emitted as partials.

Keep raw data-row counts separate from emitted partial sizes so locality
savings remain visible.

---

## Suggested Implementation Order

1. Add internal artifact payload tables and schemas.
2. Implement chunked write, seal and verified read owners.
3. Change installation to internalize verified WASM payloads.
4. Change the Artifact loader to cache → internal table → optional repair
   source.
5. Prove Cell activation works after deleting local caches and disabling the
   original registry.
6. Add bounded concurrent shard dispatch.
7. Add deterministic failure and cancellation handling.
8. Add multi-node tests combining cache misses, activation leases and
   parallel runs.
9. Update documentation and examples.
10. Add migration tooling for previously installed Artifacts.

---

## Required Tests

### Artifact durability

Prove that:

* a WASM Artifact is installed from OCI;
* its bytes are stored as sealed chunks;
* every node-local cache is deleted;
* the original OCI source becomes unavailable;
* a Cell is placed on a previously unused node;
* that node reconstructs the component from Lagrange tables;
* digest verification succeeds;
* the component starts and produces the expected result.

Also test:

* missing chunk;
* modified chunk;
* wrong chunk order;
* wrong total size;
* wrong final digest;
* duplicate idempotent installation;
* conflicting installation;
* unsealed payload refusal;
* interrupted upload;
* restart during upload and sealing;
* no payload bytes entering the CDC metadata cache.

### Parallel dispatch

Use several partitions across multiple nodes and prove:

* at least two `run` exports overlap in time;
* concurrency never exceeds the configured limit;
* each `run` executes on its partition's selected host;
* raw rows remain local until `run`;
* a missing Cell on several nodes can be activated concurrently;
* cache misses can fetch components concurrently from the internal store;
* partial completion order does not affect the result;
* one shard failure prevents reduction and final publication;
* deadline expiry stops new admission;
* retries do not duplicate visible output;
* exactly one final snapshot is published;
* serial and parallel modes return byte-identical results for the same
  invocation.

---

## Permanent Invariants

* Installed WASM bytes are durably owned by Lagrange.
* The filesystem contains caches, never canonical Artifacts.
* Artifact bytes are immutable and content-addressed.
* Bindings always pin exact immutable Artifact identity.
* Payload bytes do not enter the system-table cache or CDC propagation path.
* Only existing placement and runtime lifecycle owners create Cells.
* Call activation leases express bounded demand; the invoker never schedules
  replicas directly.
* Raw partition rows do not leave the selected host before `run`.
* Parallelism is bounded by system-owned policy.
* Failed or incomplete shard sets never reach `reduce`.
* Exactly one completed final result becomes visible.
