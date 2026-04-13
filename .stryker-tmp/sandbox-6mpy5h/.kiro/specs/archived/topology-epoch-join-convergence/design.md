# Design

## Overview

This tranche does not add a new topology service. It tightens the existing
bootstrap contract so the seed publishes one authoritative topology snapshot
envelope, the joiner hydrates the existing `SystemTableCache` from that
snapshot, and canonical join readiness uses the published metadata as its
bootstrap baseline until CDC and local cache observation move beyond it.

## Owner Model

- `BootstrapAPI` remains the bootstrap publication owner.
- A new bootstrap topology snapshot builder owns construction of the bootstrap
  snapshot envelope.
- `systemTableSnapshots` remain the snapshot body used for sanctioned bootstrap
  cache hydration.
- `SystemTableCache` remains the only node-local cache and continues to be the
  steady-state read model.
- CDC remains the steady-state propagation path after bootstrap.
- `JoinReadinessEvaluator` remains the owner of canonical join readiness
  decisions.

This keeps one source of truth:

- durable topology truth: system tables + `config.current_epoch`
- local cache truth: `SystemTableCache`
- bootstrap publication: one envelope derived from that truth

## Bootstrap Topology Snapshot Envelope

The bootstrap owner publishes:

- `systemTableSnapshots`: existing authoritative bootstrap snapshot rows
- `topologySnapshotMeta`:
  - `publishedAt`
  - `topologyEpoch`
  - `activeNodeIds`
  - `hydrationTables`
  - `tableRowCounts`

The metadata is descriptive only. It does not become a second mutable topology
state store.

## Join-Side Hydration

`QuerySystemStatePhase.hydrateSystemCacheFromBootstrap()` continues to apply the
snapshot rows directly into `SystemTableCache` under the existing sanctioned
bootstrap exception.

After row hydration:

1. If `bootstrapResponse.currentEpoch` is valid, apply it to the cache epoch
   watermark with `SystemTableCache.updateFromEpoch()`.
2. Record the published `topologySnapshotMeta` on the joining service.

That gives readiness a concrete bootstrap epoch baseline without inventing a
parallel epoch coordinator.

## Snapshot-First Readiness

`JoinReadinessEvaluator` continues to prefer the local cache, but it consumes
the bootstrap topology snapshot metadata explicitly:

- required node IDs fall back to `topologySnapshotMeta.activeNodeIds`
- mesh snapshot fallback remains bootstrap-owned data, not ad hoc discovery
- readiness diagnostics include:
  - `topologySnapshotEpoch`
  - `appliedTopologyEpoch`

This is intentionally incremental. The first slice improves convergence and
diagnostics while preserving the current CDC-based steady-state model.

## Non-Goals

- No new topology store
- No new watch channel beyond existing CDC
- No flag-day removal of `systemTableSnapshots`
- No bootstrap-time direct writes outside existing sanctioned cache hydration
