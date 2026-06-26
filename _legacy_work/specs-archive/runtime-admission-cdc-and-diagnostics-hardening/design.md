# Design Document: Runtime Admission, CDC Policy, and Diagnostics Hardening

## Overview

This design focuses on a narrow but high-leverage area of instability: the
system still admits workload nodes, interprets CDC behavior, and reports
distributed failures from too many derived signals.

The design makes four structural changes:

1. benchmark admission becomes an explicit runtime-owned state
2. CDC behavior moves onto a canonical per-table policy matrix
3. rebalancer outcomes become hard degradation states
4. distributed runs emit coherent, diagnosable failure bundles with explicit
   no-progress semantics

This is not a second stabilization program. It is a runtime-oriented extension
of the broader work already described in
[../system-stability-and-determinism-hardening/design.md](../system-stability-and-determinism-hardening/design.md).

## Key Design Decisions

1. Use one CDC engine, but several explicit policy classes.
2. Treat benchmark admission as owned state, not a harness-side guess.
3. Treat failed replica movement as a serving-state degradation, not just an
   informational event.
4. Treat no-progress as a distinct failure class from absolute timeout.
5. Treat authoritative fallback as a structured exception signal, not a normal
   success path.

## Architecture Changes

### 1. Explicit Benchmark Admission State (`P0`)

#### Problem

Today benchmark load eligibility is composed from:

1. service discovery readiness
2. local replica role
3. generic load-lane probes
4. benchmark-table probes
5. assorted strictness heuristics in the harness

That lets a node look admissible through one lens and fail immediately under
real workload.

#### Design

Introduce one runtime-owned benchmark admission evaluator that returns a
per-node, per-table result such as:

```json
{
  "tableName": "benchmark_events",
  "nodeId": "11601fe0-72d6-5853-8590-ec2881853e72",
  "state": "blocked",
  "reasons": [
    {
      "code": "load_path_probe_failed",
      "scope": "table",
      "entityId": "tbl-c35e3fc6-e143-4c16-86ac-bb2968795826-p1"
    }
  ],
  "routingReady": true,
  "localReplicaRole": "follower",
  "degradedByOperationIds": []
}
```

#### Ownership

Primary producers:

1. runtime readiness and replica-state services
2. admin discovery surfaces
3. benchmark admission serializer

Primary consumers:

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. `src/admin/admin-websocket-api.js`
3. report serialization and failure bundling

#### Consequences

1. The harness stops inventing composite readiness logic.
2. A benchmark node can be blocked for explicit runtime reasons.
3. Admission reasons become stable enough for strict-gate and report use.

### 2. CDC Policy Matrix with One Shared Engine (`P0`)

#### Problem

The `benchmark_events` incident showed that the real problem is not lack of CDC
capability. The problem is that per-table CDC policy is still too implicit, so
user-table paths can drift into control-plane propagation semantics.

#### Design

Keep one CDC substrate, but add one canonical policy registry with fields such
as:

```json
{
  "tableName": "services",
  "authorityClass": "control",
  "internalCachePropagation": true,
  "bootstrapHydrationMode": "bootstrap_only",
  "readinessRelevant": true,
  "externalCdcAllowed": false
}
```

```json
{
  "tableName": "benchmark_events",
  "authorityClass": "user",
  "internalCachePropagation": false,
  "bootstrapHydrationMode": "none",
  "readinessRelevant": false,
  "externalCdcAllowed": true
}
```

#### Required Policy Classes

1. control tables with internal CDC propagation
2. control tables without internal CDC propagation
3. user tables with external CDC enabled
4. user tables without CDC

#### Components

1. `src/cache/cache-constants.js`
2. bootstrap and node-joining CDC setup
3. partition CDC generation and delivery
4. admin readiness and discovery evaluation

#### Consequences

1. One engine remains shared.
2. Readiness no longer depends on accidental subscriber semantics for user
   tables.
3. Bootstrap, join, and discovery stop relying on parallel table lists.

### 3. Rebalancer Degradation State Machine (`P0`)

#### Problem

Failed `replica.moved` operations are visible in playback, but they do not yet
become authoritative serving-state consequences. That allows unstable nodes to
remain apparently admissible.

#### Design

Introduce an explicit degradation state model for rebalancer outcomes:

1. `healthy`
2. `move_pending`
3. `move_failed`
4. `promotion_pending`
5. `promotion_failed`
6. `drain_blocked`
7. `recovering`

Each state transition must record:

1. operation ID
2. entity type and entity ID
3. source node and target node
4. started-at and last-transition timestamps
5. stable reason code

#### Admission Rule

If a node or serving path is degraded by active or recently failed replica
movement, benchmark admission must block that node until recovery criteria are
met.

#### Consequences

1. Playback and runtime state agree on the meaning of failed movement.
2. The harness stops treating rebalancer instability as passive background
   noise.
3. The system can distinguish “load slow because of degraded placement” from
   “load slow for unknown reasons.”

### 4. Automatic Failure Bundle (`P1`)

#### Problem

Distributed debugging currently requires manual triangulation across:

1. report JSON
2. playback events
3. control snapshots
4. node logs
5. ad hoc Docker inspection

#### Design

Emit one bundle per failed distributed run under the run artifact root. The
bundle should include:

1. normalized failure summary
2. last successful and last failed phase snapshots
3. latest control snapshot
4. per-node benchmark admission states
5. top failing operations by node and error class
6. condensed per-node log excerpts for the failing window
7. no-progress metadata if applicable

#### Format

1. one machine-readable JSON summary
2. one compact human-readable markdown summary
3. links from the main report JSON to both

### 5. Deterministic Replica-Instability Integration Layer (`P1`)

#### Problem

Full 7-node baseline runs are still where some replica-creation and
move-failure bugs become obvious. That is too expensive and too late.

#### Design

Add a deterministic integration layer focused on:

1. benchmark admission after replica creation
2. learner-to-follower promotion timing
3. failed replica moves
4. degraded-state recovery
5. admission suppression during movement instability

This sits above unit tests but below Docker baseline runs. It should use fake
time and in-process fixtures wherever possible.

### 6. No-Progress Phase Protocol (`P1`)

#### Problem

Some phases appear hung until a late artifact change proves otherwise. That
creates wasted debugging time and encourages over-waiting.

#### Design

Each long-running phase should emit explicit progress events such as:

1. `phase.started`
2. `phase.progress`
3. `phase.last_meaningful_change`
4. `phase.no_progress_warning`
5. `phase.failed_no_progress`

Each phase gets:

1. absolute deadline budget
2. no-progress budget
3. last meaningful progress payload

The failure bundle records both.

### 7. Runtime-First Stabilization Boundary (`P1`)

#### Problem

The harness still compensates for missing explicit runtime state too often.

#### Design

Adopt a boundary rule:

1. if runtime can own the state, runtime must publish it
2. harness may aggregate and gate on that state
3. harness should not invent durable alternate heuristics once runtime state
   exists

This applies directly to:

1. benchmark admission
2. degradation due to failed replica moves
3. CDC policy class and readiness relevance
4. fallback-rate visibility

### 8. Authoritative Fallback Reduction (`P2`)

#### Problem

`Recovered cache visibility gap from authoritative system table read` appears
too often in recent failures. That suggests steady-state projections are still
allowed to lag enough that repair-by-read is routine.

#### Design

Instrument authoritative fallback as a structured runtime signal with:

1. table name
2. row key
3. node ID
4. count window
5. rate window
6. whether the fallback happened during bootstrap, recovery, or steady state

Use those signals to:

1. classify persistent fallback as degraded
2. feed strict benchmark gates
3. prioritize runtime fixes in the owning subsystem

## Data Model Additions

### Benchmark Admission Record

Recommended fields:

1. `tableName`
2. `tableId`
3. `nodeId`
4. `state`
5. `reasons`
6. `localReplicaRole`
7. `routingReady`
8. `schemaReady`
9. `loadPathReady`
10. `degradedByOperationIds`
11. `capturedAt`

### CDC Table Policy Record

Recommended fields:

1. `tableName`
2. `authorityClass`
3. `internalCachePropagation`
4. `bootstrapHydrationMode`
5. `readinessRelevant`
6. `externalCdcAllowed`
7. `steadyStateSubscriptionMode`

### Rebalancer Degradation Record

Recommended fields:

1. `entityType`
2. `entityId`
3. `nodeId`
4. `state`
5. `reasonCode`
6. `operationId`
7. `startedAt`
8. `updatedAt`
9. `recoveryCriteria`

## Migration Plan

### Phase A1: Benchmark Admission Ownership

1. define admission record shape
2. publish it from runtime/admin surfaces
3. move harness load selection to consume it

### Phase A2: CDC Policy Registry

1. add canonical per-table CDC policy registry
2. route bootstrap/join/discovery logic through it
3. remove duplicated propagation lists where policy now owns behavior

### Phase A3: Rebalancer Degradation

1. model failed move and promotion outcomes explicitly
2. gate benchmark admission on degraded state
3. backfill deterministic tests for movement failure

### Phase A4: Failure Bundle and No-Progress Protocol

1. emit progress heartbeats
2. add no-progress budgets and reason codes
3. create failure bundle artifacts and report links

### Phase A5: Fallback Reduction and Closure

1. instrument authoritative fallback as structured signals
2. classify sustained fallback as degraded
3. record deltas and remaining hotspots

## Testing Strategy

1. targeted unit tests for table-policy resolution and benchmark admission
2. admin and scenario tests for runtime-owned admission serialization
3. deterministic integration tests for failed moves and promotion delays
4. distributed baseline runs only after focused layers pass

## Risks

1. admission state may initially duplicate some existing readiness payloads
   before old paths are removed
2. degraded-state windows must be precise enough to avoid blocking healthy
   nodes for too long
3. adding fallback instrumentation may expose more latent staleness than the
   current reports show

## Open Questions

1. How long should degraded rebalancer outcomes remain admission-relevant after
   the last failed move?
2. Which control tables currently belong in the “control without internal CDC
   propagation” class?
3. Should benchmark admission be exposed only through admin discovery or also
   through a dedicated runtime diagnostics API?
