# Design Document: System Simplification and Unification

## Overview

This design reduces implementation complexity by introducing a small number of shared abstractions and strict ownership boundaries, while preserving the system’s core invariants:

- System metadata and user data live in tables; tables are partitions; partitions are Raft groups.
- The system cache is the routing truth, updated via CDC.
- One SQL engine path for all entrypoints.
- Message-router-mediated communication for all calls.

The design focuses on “unifying the code that already agrees conceptually” rather than changing system behavior.

## Current Complexity Hotspots

1. **Two orchestration implementations** for seed bootstrap and node join with substantial duplicated wiring, phase tracking, and cleanup.
2. **Multiple cache shapes** (direct cache, read-only wrapper, proxy-to-worker cache) leading to consumer branching and leaky abstractions.
3. **Split ownership for endpoint selection** between MessageRouter and TransportRegistry-like logic.
4. **CDC bootstrap mode** expressed as mutable boolean state, pushing mode-specific branching into setup and callers.
5. **Lifecycle ownership drift** where some startup paths still perform direct replica actions outside the unified lifecycle manager.

## Proposed Architecture

### 1) StartupPipeline + Mode Plans

Introduce a shared pipeline runner:

- `StartupPipelineRunner`
  - runs ordered phases
  - standardizes phase logging, error wrapping, cleanup, and diagnostics
  - emits common events (`phaseStart`, `phaseComplete`, `phaseFailed`, `cleanupStart`, `cleanupComplete`)

Two plans provide configuration:

- `SeedStartupPlan` (seed bootstrap)
- `JoinStartupPlan` (node join)

Each plan supplies:

- phase list + per-phase context builder
- cleanup list
- readiness gates for transition to READY

**Goal:** seed and join differ by “plan,” not by duplicate orchestration implementations.

### 2) SystemCacheClient (read-only) contract

Create a single cache-read interface used by all consumers.

```js
// Proposed interface shape (not necessarily a new class)
// Methods reflect existing usage patterns.
SystemCacheClient = {
  get(tableName, key),
  find(tableName, predicate),
  filter(tableName, predicate),
  getAll(tableName),
  has(tableName, key),
  count(tableName),
  getTableNames(),
  onCacheChange(listener),
  offCacheChange(listener),
}
```

Implementations:

- `DirectSystemCacheClient`: wraps the existing `createReadOnlyCache(...)` output.
- `ProxySystemCacheClient`: wraps `SystemCacheProxy` and forwards read operations.

**Key ownership rule:** write access remains restricted to CDC/hydration owners; the client is strictly read-only.

### 3) Single-owner endpoint selection

Pick one canonical owner for endpoint selection and keep the other component as a thin wrapper.

Two compatible options:

- **Option A (preferred):** fold endpoint selection into MessageRouter, and treat TransportRegistry as an internal helper (or remove it).
- **Option B:** make TransportRegistry the single owner and make MessageRouter delegate endpoint selection to it.

Either way, there is exactly one component that:

- reads node endpoints from cache
- filters active endpoints
- checks provider availability
- selects by priority

### 4) CDC write routing as a strategy

Refactor `CDCIntegrationService` to route writes via an internal strategy object.

- `BootstrapDirectWriteRouter`: direct writes to local partitions during seed registration.
- `SqlWriteRouter`: uses SQLQueryEngine to route to partition leaders.

Seed bootstrap swaps strategies at the end of hydration.

**Preserved behavior:** seed still needs a bootstrap exception, but it’s encapsulated.

### 5) Lifecycle ownership closure

Lean into the existing unified lifecycle owners:

- `ServiceLifecycleManager`
- `ServiceReconciler`
- adapters for partition/message-group/runtime

Bootstrap/join orchestration should not directly call “create/start/stop replica” on underlying service implementations except through adapters.

## Migration & Compatibility Notes

- The pipeline runner should be introduced first as a wrapper, then seed/join move over phase-by-phase.
- Cache client introduction is safe and low-risk because it is a read-only abstraction.
- Endpoint selection unification should preserve existing endpoint ranking semantics.
- CDC strategy routing should keep the current external methods on CDCIntegrationService.

## Risks

1. **Hidden coupling to cache concrete type**: some callers may reach into cache internals. These should be surfaced and replaced with client interface calls.
2. **Bootstrap/join subtle ordering assumptions**: moving to a shared pipeline must preserve existing readiness gates and timing.
3. **Transport selection behavior drift**: merging selection logic must preserve priority/availability rules.

## Validation

- Existing bootstrap/join integration tests remain green.
- Add targeted unit tests for:
  - cache client direct vs proxy parity (same observable read results for same underlying data)
  - pipeline phase error/cleanup behavior
  - CDC strategy swap behavior

