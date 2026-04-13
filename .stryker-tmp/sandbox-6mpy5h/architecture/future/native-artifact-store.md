# Native Artifact Store

## Status

Future. Depends on activation-cost-aware placement (near-term) and the
installable service ecosystem (Phase 2.0).

## Problem

The external-registry approach to OCI image distribution has structural
limitations:

1. Every node pulls independently from external registries — no
   intra-cluster sharing of already-fetched bytes.
2. External registry availability is required at deployment time.
3. No deduplication of layer storage across the cluster.
4. Air-gapped and edge deployments require a separate registry fleet.
5. Image distribution latency is bounded by internet/WAN speed, not
   internal cluster network speed.

## Design Principle

Do not build a separate storage system. Build a native blob storage class
inside the same distributed system.

Same cluster. Same nodes. Same replication and control universe. Different
object semantics for artifact bytes.

## Approach: Native Blob Storage Class

Artifact bytes are stored by the system on the same distributed substrate
as everything else, but with a different logical storage class optimized
for immutable, content-addressed, chunked data.

### What This Is Not

- Not "fat SQL rows mixed into ordinary control metadata."
- Not "a separate registry cluster that must always be up."
- Not "a whole new storage system."

It is: another storage abstraction on top of the same distributed storage
engine, with different policies for a different access pattern.

### Storage Class Characteristics

Artifact data differs from ordinary OLTP rows:

| Property | OLTP Rows | Artifact Blobs |
|----------|-----------|----------------|
| Mutability | Mutable | Immutable (write-once) |
| Addressing | Primary key | Content hash (digest) |
| Granularity | Small rows | Large chunks (MB-scale) |
| Update frequency | High | Never (append-only) |
| Read pattern | Point/range queries | Streaming sequential |
| Deduplication | N/A | By content hash |
| Lifecycle | CRUD | Publish → cache → GC |

### Data Model

Metadata tables are normal CDC-propagated system tables:

```
artifacts
  artifact_id        TEXT PK
  artifact_type      TEXT        -- 'oci_image', 'wasm_module'
  media_type         TEXT
  created_at         INTEGER
  total_size_bytes   INTEGER
  chunk_count        INTEGER
  status             TEXT        -- 'active', 'gc_pending', 'deleted'

artifact_versions
  artifact_id        TEXT PK(1)
  version_digest     TEXT PK(2)  -- content hash of manifest
  tag                TEXT
  published_at       INTEGER
  manifest_json      TEXT        -- OCI manifest or equivalent

artifact_objects
  object_digest      TEXT PK     -- content hash
  size_bytes         INTEGER
  media_type         TEXT
  chunk_size_bytes   INTEGER
  chunk_count        INTEGER
  reference_count    INTEGER     -- for GC

artifact_chunks
  object_digest      TEXT PK(1)
  chunk_index        INTEGER PK(2)
  chunk_digest       TEXT        -- content hash of chunk
  chunk_size_bytes   INTEGER
  data               BLOB        -- the actual bytes
```

### Chunk Storage Strategy

Chunks are stored in dedicated partitions with policies tuned for
blob workloads:

- Larger partition size targets (chunks are big, splits are wasteful).
- Immutable writes only — no UPDATE, no DELETE of live data.
- Replication follows cluster policy (default replica count), but
  could support lower replica counts or erasure coding in the future.
- No CDC propagation of chunk data — chunks are read on-demand by
  streaming from the owning partition, not cached in `SystemTableCache`.
- Metadata tables (`artifacts`, `artifact_versions`, `artifact_objects`)
  are CDC-propagated for cluster-wide visibility.

### Why Chunks, Not Whole Blobs

A 1 GB OCI image layer as a single Raft log entry would be catastrophic
for replication performance. Chunking (e.g., 4 MB chunks) means:

- Raft log entries stay manageable.
- Partial transfers can resume.
- Deduplication operates at chunk granularity.
- Streaming reads can begin before the full object is replicated.
- Memory pressure during replication stays bounded.

### Architecture

```
                    ┌─────────────────────────┐
                    │   Artifact Service       │
                    │   (sys-artifact-store)   │
                    │                          │
                    │  ┌─────────┐ ┌────────┐  │
                    │  │ Publish │ │ Lookup │  │
                    │  │ Version │ │ Resolve│  │
                    │  │ GC      │ │ Stream │  │
                    │  └─────────┘ └────────┘  │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │  Metadata    │  │  Chunk       │  │  Cache       │
    │  Tables      │  │  Partitions  │  │  State       │
    │  (CDC)       │  │  (blob-class)│  │  (per-node)  │
    └──────────────┘  └──────────────┘  └──────────────┘
```

### Control Plane: Artifact Service

A built-in replicated system service (`sys-artifact-store`) owning:

- Publishing: accept OCI artifacts, chunk them, store chunks, record
  metadata.
- Versioning: track artifact versions by digest and optional tag.
- Lookup and resolution: resolve artifact references to chunk lists.
- Streaming: serve chunk streams to requesting nodes via message group
  transport.
- Policy: replication factor, placement hints, retention.
- GC: reference-counted cleanup of unreferenced objects and chunks.
- Signatures and attestations: verify artifact integrity at publish time.
- Cache hints: inform the scheduler which nodes have which chunks cached.

### Data Plane: Chunk Distribution

Chunk reads use message group transport (consistent with the rule that
all data-plane traffic uses message group transport):

1. Requesting node resolves artifact → object list → chunk list via
   metadata tables (from `SystemTableCache`).
2. For each chunk, check local cache first.
3. If not cached locally, request chunk from the owning partition via
   message group transport (streaming read).
4. Cache chunk locally on the requesting node's filesystem.
5. Update `node_image_presence` metadata (same table as the near-term
   design — the tracking model is unchanged).

### Scheduler Integration

The activation-cost-aware placement system from the near-term design
works unchanged:

- `node_image_presence` still tracks which nodes have which images.
- `MovePlanner` still scores by image locality.
- `StorageAdmissionService` still gates by activation time budget.
- `ControlPlaneReadinessService` still exposes `imageReady`.

The difference is that "pulling an image" now means "streaming chunks
from internal partitions" rather than "pulling from an external registry."
This is faster (internal network), more reliable (no external dependency),
and enables smarter pre-pull (the system knows exactly which chunks are
where).

### Relationship to External Registries

External registries are not eliminated — they remain the ingress path:

1. `INSTALL SERVICE` fetches the artifact from an external registry.
2. The artifact service chunks it and stores it internally.
3. All subsequent distribution is internal.

This means:
- External registry is needed only at install/upgrade time.
- Runtime placement never depends on external registry availability.
- Air-gapped clusters work after initial artifact ingestion.

### Deduplication

Content-addressed chunks enable automatic deduplication:

- Two services sharing a base image share the same layer objects and
  chunks. `reference_count` tracks usage.
- The `LayerSharingAnalyzer` from the near-term design becomes a simple
  metadata query rather than a cross-node analysis.
- GC only removes chunks when `reference_count` reaches zero.

### Storage Policy Differences

| Policy | OLTP Tables | Artifact Chunks |
|--------|-------------|-----------------|
| Partition size target | Normal (split on growth) | Large (avoid splitting immutable data) |
| Write pattern | INSERT/UPDATE/DELETE | INSERT only (immutable) |
| CDC propagation | Yes (metadata) | No (chunks read on-demand) |
| Cache in SystemTableCache | Yes (metadata) | No (chunks cached on filesystem) |
| Replication | Standard replica count | Standard (future: erasure coding option) |
| GC | N/A | Reference-counted |
| Compaction | Normal | Aggressive (immutable data compacts well) |

### Migration Path from External Registry Design

The near-term external-registry design is forward-compatible:

1. `node_image_presence` metadata table is unchanged.
2. `OciPullService` gains an internal source alongside external registries.
3. `PrePullService` prefers internal chunk streaming over external pulls.
4. `ImageGCService` coordinates with the artifact service for reference
   counting.
5. Activation class taxonomy and placement scoring are unchanged.
6. CLI commands (`service analyze`, `SHOW SERVICE ACTIVATION`) work
   identically — the source of the image is transparent to the user.

### Implementation Sequence

1. Metadata tables (`artifacts`, `artifact_versions`, `artifact_objects`).
2. Chunk storage partitions with blob-class policies.
3. Artifact service skeleton (`sys-artifact-store`) with publish and
   lookup.
4. Chunk streaming via message group transport.
5. Local chunk cache on each node.
6. Wire `OciPullService` to prefer internal source.
7. GC with reference counting.
8. OCI-compatible pull API (so external tools can pull from the cluster).

### Open Questions

1. Chunk size: 4 MB is a reasonable starting point (matches many cloud
   storage systems), but optimal size depends on Raft log entry overhead
   and network MTU. Needs benchmarking.

2. Erasure coding: lower replica counts with erasure coding could reduce
   storage amplification for large artifacts. This is a future
   optimization, not a launch requirement.

3. Cross-region replication: for geo-distributed clusters, artifact chunks
   may need lazy replication to remote regions. This interacts with the
   latency topology system.

4. OCI distribution spec compliance: should the artifact service expose
   an OCI Distribution API so external tools (Docker CLI, crane, etc.)
   can push/pull directly? This would make the cluster a first-class
   registry.

5. Streaming activation: can a container runtime begin starting before
   all chunks are local? This depends on the container runtime's support
   for lazy loading (e.g., stargz, nydus, eStargz). Worth investigating
   but not a launch requirement.
