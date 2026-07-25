---
audience: human
---

# Latency Topology Operations

Operator runbook for latency-aware topology: nodes are measured and assigned
into latency groups, and CDC fanout can use that grouping for propagation.
This document covers operating, configuring, and diagnosing that machinery;
the ownership architecture behind it is described in
[../architecture/runtime-lifecycle.md](../architecture/runtime-lifecycle.md)
(Latency Topology Ownership).

## Scope

This runbook covers runtime operation of latency-aware topology:

1. latency-group assignment metadata
2. in-memory latency tree recomputation
3. CDC grouped propagation mode and safe fallback mode

## Ownership Model

The feature is wired through `LatencyTopologySetup` and has single owners:

1. `LatencyMeasurementService` - RTT sampling and inter-group latency writes
2. `LatencyGroupManager` - assignment/reassignment lifecycle writes
3. `GroupSelectionService` - representative/coordinator deterministic selection
4. `LatencyTreeService` - derived in-memory routing order from topology tables
5. `CDCGroupPropagationService` - grouped fanout orchestration

Final CDC apply remains owned by `MessageGroupService.applyCDCEvent`.

## Metadata Tables

Latency topology state is authoritative in system tables:

1. `nodes.latency_group_id`
2. `nodes.last_latency_check_at`
3. `nodes.latency_assignment_state`
4. `latency_groups`
5. `inter_group_latencies`

No secondary topology cache is introduced.

## Configuration

Configured under `latency.*`:

1. `latency.groupThresholdMs` (default `100`)
2. `latency.recalcIntervalMs` (default `60000`)
3. `latency.recalcJitterRatio` (default `0.1`)
4. `latency.pingTimeoutMs` (default `1000`)
5. `latency.pingRetryCount` (default `2`)
6. `latency.smoothingAlpha` (default `0.3`)
7. `latency.propagationMode` (default `safe`, allowed: `safe`, `grouped`)

Invalid values fail validation at startup/config apply time.

## Changing Propagation Mode

1. Verify `latency_groups` and `inter_group_latencies` appear in bootstrap
   snapshots/cache dumps.
2. Keep `latency.propagationMode = safe` while validating assignment and
   measurement behavior.
3. Enable `latency.propagationMode = grouped` after topology metadata is
   stable and coordinators are routable.

Rollback is immediate by setting `latency.propagationMode = safe`.

## Diagnostics

Admin meta actions:

1. `listLatencyGroups`
2. `listInterGroupLatencies`
3. `getCacheDump` (includes topology tables)

Equivalent SQL checks:

```sql
SELECT * FROM latency_groups ORDER BY group_id;
SELECT * FROM inter_group_latencies ORDER BY source_group_id, target_group_id;
SELECT node_id, latency_group_id, latency_assignment_state, last_latency_check_at
FROM nodes
ORDER BY node_id;
```

Bootstrap diagnostics:

1. `/bootstrap` response includes `latencyTopologyHints.groupCount`
2. `/bootstrap` response includes `latencyTopologyHints.interGroupEdgeCount`
3. `/bootstrap` response includes `latencyTopologyHints.propagationMode`

## Grouped Mode Fallback Behavior

When grouped propagation cannot safely route, the service uses safe mode for
that event and logs/records a fallback reason. Typical reasons:

1. local node has no `latency_group_id`
2. active groups/coordinator metadata missing
3. coordinator address unavailable in `services`
4. message router unavailable

Correctness is preserved because safe mode still delegates to the canonical CDC
apply owner path.
