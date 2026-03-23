# Design Document: Unified System Metadata Gateway

## Overview

This spec does not create a new metadata service. It takes the existing
`ControlPlaneSystemTableGateway` and turns it into the only runtime ingress for
shared metadata reads and writes, while requiring query-plane ingress to reuse
the same pressure-governor policy through its own boundary.

The architecture after this migration is:

`caller -> semantic owner -> ControlPlaneSystemTableGateway -> partition leader / authoritative read -> CDC -> SystemTableCache -> readers`

For query-plane traffic, the shape stays separate:

`query caller -> query ingress -> shared pressure policy -> query router / partition path`

That preserves the existing single source of truth:

- durable truth: system tables
- write propagation: partition leader + CDC
- local cache: `SystemTableCache`

The migration removes alternate runtime access paths, not the underlying data
model.

## Scope Boundary

This spec fully unifies **shared metadata and system-table I/O**.

It intentionally does **not** unify:

- user-table reads and writes behind the metadata gateway
- query-plane routing for application queries behind the metadata gateway

That is deliberate. The system guidelines require control-plane and query-plane
isolation. A single mixed gateway for literally all reads and writes would
collapse those planes and reintroduce starvation risks.

What is shared is the pressure logic, not the ingress itself.

## Design Goals

1. One runtime write ingress for shared metadata.
2. One runtime read ingress for shared metadata.
3. One local cache (`SystemTableCache`) and no shadow metadata stores.
4. One semantic owner per concern.
5. No fallback chains between "new" and "old" paths.
6. One shared pressure/admission model across metadata and query ingress paths.
7. Bounded pressure handling and coalescing at the gateway boundary.
8. Bootstrap exceptions that are explicit, phase-scoped, and unreachable after
   bootstrap.

## Non-Goals

- Replacing CDC
- Replacing `SystemTableCache`
- Inventing a second topology store
- Routing user-table SQL through the metadata gateway
- Preserving low-level direct access APIs for runtime callers

## Owner Model

### Semantic Owners

The gateway is the single I/O ingress, but semantic ownership stays distinct.
The target shape is:

| Concern | Semantic Owner | Primary Tables |
|---------|----------------|----------------|
| Node lifecycle and readiness rows | `NodesOwner` | `nodes` |
| Service lifecycle and replica status rows | `ServicesOwner` | `services` |
| Partition ownership and leader identity | `PartitionsOwner` | `partitions` |
| Message-group ownership and leader identity | `MessageGroupsOwner` | `message_groups` |
| Replica workflow rows | `ReplicaOperationsOwner` | `replica_operations` |
| Structured log rows | `LogsOwner` | `logs` |
| Endpoint publication | `ServiceEndpointsOwner` | `service_endpoints` |
| Service definition metadata | `ServiceDefinitionsOwner` | `service_definitions` |

Callers invoke owner methods. Owners construct read and mutation intents.
Owners do not directly persist rows or run system-table SQL.

### Canonical Gateway

`ControlPlaneSystemTableGateway` becomes the only runtime ingress for:

- metadata reads
- metadata writes
- pressure evaluation
- single-flight/coalescing
- typed defer/reject outcomes

It remains a transport/query execution boundary, not a second metadata store.

### Shared Pressure Policy

`PressureGovernor` becomes the shared policy engine for both planes.

That means:

- control-plane metadata ingress uses it through
  `ControlPlaneSystemTableGateway`
- query-plane ingress uses it through its own boundary
- both planes share:
  - work classes
  - resource-key admission
  - typed defer/reject outcomes
  - retry hints
  - bounded coalescing semantics

What they do **not** share:

- the same ingress object
- the same queues
- the same resource budgets

This preserves plane isolation while unifying overload behavior.

### Low-Level Dependencies

These remain implementation details behind the gateway:

- `cdcIntegrationService`
- `AuthoritativeControlPlaneView`
- `sqlQueryEngine` for authoritative and non-propagated reads

Runtime domain services stop calling them directly for shared metadata.

## Canonical Interfaces

### `MutationIntent`

```javascript
{
  owner: 'services-owner',
  tableName: 'services',
  operation: 'update', // insert | update | upsert | delete
  identity: {
    primaryKey: {service_id: 'replica-1'},
  },
  row: null,           // insert / upsert
  whereClause: {service_id: 'replica-1'}, // update / delete
  data: {status: 'ACTIVE', updated_at: 123},
  workClass: 'critical',   // critical | interactive | background
  deliveryPriority: 'critical',
  routingReadinessDimension: 'repairEligible',
  coalescingKey: 'services:replica-status:replica-1',
  allowCoalescing: true,
  mergePolicy: 'replace_pending', // none | single_flight | replace_pending
  allowPressureDefer: true,
  pressureRetryAfterMs: 250,
  expectedCacheFields: {status: 'ACTIVE'},
}
```

### `ReadIntent`

```javascript
{
  owner: 'nodes-owner',
  tableName: 'nodes',
  strategy: 'cache', // cache | authoritative | authoritative_required |
                     // owner_local_non_propagated | bootstrap_snapshot
  query: {
    sql: 'SELECT * FROM nodes WHERE node_id = ?',
    params: ['node-1'],
  },
  workClass: 'interactive',
  routingReadinessDimension: 'repairEligible',
  coalescingKey: 'nodes:node-1',
  allowCoalescing: true,
  allowPressureDefer: true,
  requireFreshAtOrAfterEpoch: null,
}
```

### `MutationResult`

```javascript
{
  success: true,
  outcome: 'applied', // applied | no_op | deferred | rejected |
                      // observed_state_changed | owner_not_ready
  retryAfterMs: null,
  partitionResult: {...},
}
```

### `ReadResult`

```javascript
{
  success: true,
  outcome: 'cache_hit', // cache_hit | authoritative | deferred | rejected |
                        // stale_not_allowed | owner_not_ready
  rows: [...],
  strategyUsed: 'cache',
  retryAfterMs: null,
}
```

## Read Path Design

### One Intent, One Strategy

The key rule is: one read intent declares one strategy, and the gateway
executes that strategy only.

Allowed strategies:

- `cache`
  - For hot-path metadata reads that may be satisfied from `SystemTableCache`.
- `authoritative`
  - For reads that prefer authoritative execution but may tolerate a typed
    staleness/defer result.
- `authoritative_required`
  - For reads that must not succeed from cache-only state.
- `owner_local_non_propagated`
  - For non-propagated tables whose authoritative partition must be queried.
- `bootstrap_snapshot`
  - For bootstrap/join snapshot consumption only.

Forbidden pattern:

- cache read fails -> try raw SQL -> try some old helper -> try bootstrap hint

That is exactly the fallback architecture this spec removes.

### Gateway Read Execution

1. Validate the declared strategy.
2. Evaluate pressure/admission.
3. Single-flight by stable request key.
4. Execute the strategy:
   - `cache`: read from `SystemTableCache` only
   - `authoritative` / `authoritative_required`: delegate to
     `AuthoritativeControlPlaneView`
   - `owner_local_non_propagated`: execute owner-scoped authoritative SQL
   - `bootstrap_snapshot`: read explicit bootstrap snapshot body
5. Return one typed result. Do not branch to a second strategy on failure.

## Shared Pressure Policy Design

### One Policy, Separate Ingresses

The correct architecture is:

- one metadata ingress
- one query ingress
- one shared pressure-governor contract

That shared contract defines:

- work classes: `critical`, `interactive`, `background`
- resource keys
- `allow`, `defer(retryAfterMs)`, and `reject(reason)` outcomes
- bounded coalescing/single-flight expectations

### Resource Partitioning

To satisfy control-plane/query-plane isolation, the pressure governor must
support distinct resource keys and capacity partitions, for example:

- `control-plane:read`
- `control-plane:write`
- `query-plane:read`
- `query-plane:write`
- `transport:node:<nodeId>`

The policy is shared, but resource pools remain separable.

### Query-Plane Reuse

Query-plane ingress remains responsible for:

- stale-routing tolerance
- bounded replica retries
- redirect handling during topology change

But it must stop inventing unrelated overload handling. When it needs
admission/backpressure decisions, it uses the same shared pressure-governor
contract as metadata ingress.

## Write Path Design

### One Runtime Mutation Ingress

All runtime shared metadata writes converge on:

`semantic owner -> ControlPlaneSystemTableGateway.submitMutation -> cdcIntegrationService -> partition leader -> CDC -> SystemTableCache`

The gateway owns:

- pressure evaluation
- mutation coalescing
- typed defer/reject behavior
- write option normalization
- stable metrics and logs

### Coalescing Model

The gateway supports two distinct behaviors:

1. `single_flight`
   - identical writes collapse to one in-flight execution
2. `replace_pending`
   - later supersedable writes replace earlier pending writes for the same key

`replace_pending` is for bounded last-value-wins metadata churn such as:

- replica status transitions
- heartbeat-like liveness/status refreshes
- advisory metadata rewrites

It is not allowed for:

- non-idempotent writes
- create/delete sequences that change row lifecycle ownership
- writes whose intermediate states must all be preserved

### Pressure Semantics

All runtime metadata writes use one admission model:

- `allow`
- `defer(retryAfterMs)`
- `reject(reason)`

Callers do not invent local retry loops. They either:

- propagate the typed result to their owner workflow, or
- reschedule through their canonical owner queue

## System Cache Contract

`SystemTableCache` remains unchanged in principle:

- only CDC updates propagated tables
- runtime consumers do not mutate it
- there is no second cache

This spec changes who is allowed to read/write **around** that cache, not what
the cache means.

For propagated tables:

- hot-path reads may still be served from cache
- they do so through gateway/owner contracts rather than ad hoc direct reads

For non-propagated tables:

- owners use `owner_local_non_propagated` through the gateway

## Bootstrap Exception Design

Bootstrap remains the only sanctioned exception to the single write path rule.

Allowed exceptions:

- seed bootstrap creation before normal routing exists
- join snapshot hydration before CDC subscriptions are active

Required containment:

- bootstrap-only modules are phase-scoped
- runtime modules must not import them
- the gateway may expose `bootstrap_snapshot` only to bootstrap/join phases
- no runtime fallback may target bootstrap helpers

## Enforcement Model

The end state should not rely on hand-maintained "who is allowed to write which
table" lists. It should be enforced structurally.

### Forbidden Runtime Patterns

The static audit will fail runtime code that does any of the following:

- calls `cdcIntegrationService.insertSystemTableRow(...)`
- calls `cdcIntegrationService.updateSystemTableRow(...)`
- calls `cdcIntegrationService.upsertSystemTableRow(...)`
- calls `cdcIntegrationService.deleteSystemTableRow(...)`
- calls `sqlQueryEngine.executeQuery(...)` for system tables
- calls `SystemTableCache.applySystemTableChange(...)` outside sanctioned
  bootstrap/test paths

### Allowed Low-Level Callers

Only these categories remain valid:

- `ControlPlaneSystemTableGateway`
- bootstrap-only sanctioned helpers
- authoritative read helpers used only by the gateway
- tests that intentionally exercise low-level behavior

## Migration Strategy

### Phase 1: Freeze the Boundary

- extend the canonical gateway contract
- add static audit in warning mode
- stop adding new direct callers

### Phase 2: Migrate Runtime Writers

Move all runtime system-table mutation call sites behind semantic owners plus
the canonical gateway. The highest-value migrations come first:

- `services` lifecycle churn
- `nodes` readiness/status churn
- `replica_operations`
- `logs`

### Phase 3: Migrate Runtime Readers

Move runtime system-table reads behind owner read methods backed by the gateway:

- readiness and bootstrap diagnostics
- replica lifecycle and handler paths
- partition/message-group owner reads
- authoritative repair and discovery reads

### Phase 4: Contain Bootstrap Exceptions

- delete runtime imports of bootstrap-only helpers
- phase-scope bootstrap snapshot access
- hard-fail if runtime code attempts to use bootstrap exceptions

### Phase 5: Enforce Structurally

- audit in fail mode
- delete transitional helpers
- require gateway path in regression tests

## Verification Strategy

### Unit and Integration

- gateway mutation coalescing and replacement behavior
- typed defer/reject outcomes
- strategy-specific read behavior
- shared pressure-policy reuse across metadata and query ingress
- owner-path tests that fail when the gateway is bypassed
- bootstrap exception reachability tests

### Distributed

Primary scenarios:

- `node-join-under-load`
- `rolling-restart`
- `seven-node-table-partition-distribution`

Key checks:

- bounded metadata in-flight work
- reduced producer amplification under pressure
- no unbounded gateway-retained memory growth
- typed deferrals replacing repeated timeout-only failure patterns

## Success Criteria

This migration is complete when all of the following are true:

1. runtime shared metadata writes have one ingress
2. runtime shared metadata reads have one ingress
3. bootstrap exceptions are unreachable after bootstrap
4. static audit prevents regressions
5. distributed scenarios show bounded producer behavior and bounded memory
   under pressure
