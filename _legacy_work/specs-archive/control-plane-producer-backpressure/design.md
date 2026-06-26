# Design Document

## Overview

This tranche reduces producer-side pressure on seed-hosted control-plane
partitions without changing the existing ownership model:

- `NodeJoiningService` remains the owner of join-time authoritative backfill.
- `JoinReadinessEvaluator` remains the owner of canonical readiness repair
  pacing.
- `CDCGroupPropagationService` remains the owner of grouped/safe CDC retry.
- `MessageRouter` remains the only outbound queue owner.

The main design change is to make these producers pressure-aware and
single-flight before they enqueue more work.

## Join Backfill Control

### In-flight Coalescing

`NodeJoiningService` will keep an in-flight map keyed by the normalized table
set requested by `backfillPropagatedCacheTablesFromAuthoritativeState()`.
Concurrent requests for the same set will reuse the same promise rather than
starting another backfill wave.

### Blocking vs Opportunistic Behavior

The call contract will accept owner options:

- `blocking: true|false`
- `deliveryPriority: critical|background`
- `allowReplicaFanout: true|false`

Blocking discovery repair will continue to run when needed for join progress,
but opportunistic repair may be deferred when local router pressure is already
active.

### Replica Fanout Shedding

`queryBackfillRowsAcrossReplicas()` will stop issuing fully parallel replica
fanout. It will query replica addresses sequentially and will skip fanout
entirely when the caller marks the pass as pressure-degraded.

This preserves the authoritative merge path when the system is healthy while
preventing a single join from multiplying one table read into many concurrent
seed-bound requests under pressure.

### Critical Delivery For Blocking Backfill

Join-critical backfill reads will pass `deliveryPriority: 'critical'` through
the canonical SQL/query owner path. This requires plumbing delivery priority
through the routed query stack:

- `SQLQueryEngine.executeQuery(..., options)`
- `QueryExecutor.executeOnPartition(..., executionOptions)`
- `MessageRouter.deliver(..., {deliveryPriority})`

The same plumbing will be used by join-critical system-table writes.

## Join Readiness Repair Pacing

`JoinReadinessEvaluator.repairCanonicalJoinReadinessIfNeeded()` will:

- use a larger minimum interval than the current 1 second loop,
- defer repair when local router pressure is active,
- continue using the canonical backfill owner path rather than issuing direct
  repair reads itself.

This removes the repeated “topology not ready -> launch full repair again”
feedback loop while the seed is still saturated.

## Join-Critical Publication Priority

Two join-critical publication paths will be upgraded to explicit critical
priority:

- `sendControlPlaneNodeStateUpdate()`
- join-time system-table writes issued during node registration / endpoint
  publication through `cdcIntegrationService`

This is intentionally narrow. Opportunistic backfill and retry-loop work stays
background so the reserved router lane remains meaningful.

## CDC Background Retry Control

`CDCGroupPropagationService` will keep one background retry entry per canonical
retry key derived from:

- table name
- operation
- source group
- normalized target group set

When a retry is already scheduled for that key, the service will not schedule a
duplicate timer.

When local router pressure is active, scheduling will defer rather than
immediately redrive delivery. Once the timer fires and pressure has cleared,
the existing bounded retry flow continues.

## Verification Strategy

Targeted tests will cover:

- join backfill coalescing and pressure-degraded fanout,
- join-readiness repair defer behavior,
- join-critical delivery priority wiring,
- CDC retry coalescing / pressure defer.

Then the focused distributed scenarios will be rerun to verify whether seed
pressure shifts from repeated producer bursts toward genuine remaining
convergence defects.
