# Design Document: PostgreSQL Wire as Replicated System Service

## Overview

This design converts PostgreSQL wire ingress into a built-in replicated runtime
service (`sys-postgres-wire`) managed by existing unified lifecycle, replica
operation, and SQL/CDC metadata ownership.

Current state already has PostgreSQL SQL dialect translation and an internal
`PostgresWireAdapter`, but no cluster-replicated listener service. The target
state introduces a runtime-managed listener replica per placement decision,
published via canonical `services` and `service_endpoints` rows.

The final architecture has one startup/maintenance model:

1. desired state in `service_definitions`
2. placement and movement in rebalancer + `replica_operations`
3. runtime lifecycle in `ServiceLifecycleManager` + `ServiceRuntimeLifecycle`
4. endpoint and state projection via SQL/CDC
5. query execution via `SqlRequest` -> `SQLQueryEngine`

No standalone PostgreSQL listener startup path remains.

## Goals

1. Model PostgreSQL wire ingress as a first-class replicated system service.
2. Support cluster-global replica scaling (`replica_count`) with deterministic
   placement and rebalance.
3. Keep SQL execution ownership unchanged (`SQLQueryEngine` only).
4. Preserve bootstrap/join safety (no chicken-and-egg dependency).
5. Make runtime replicas and endpoints fully visible in admin diagnostics.

## Non-Goals

1. Transparent session migration between replicas.
2. Complete PostgreSQL feature parity in this spec (COPY/logical replication/
   binary format extensions can be separate follow-ups).
3. Introducing a second metadata path outside SQL/CDC.
4. Keeping a dual old/new listener mode after cutover.

## Key Design Decisions

### 1. Represent PG Wire as Built-In Runtime Service

`sys-postgres-wire` is registered in `service_definitions` as:

- `service_id = sys-postgres-wire`
- `service_type = runtime_service`
- `runtime_kind = native_js`
- `runtime_ref = postgres-wire-runtime`
- `protocol = postgresql`

This aligns PG wire with existing runtime-service lifecycle and avoids a
special-case startup owner.

### 2. Reuse Existing Lifecycle and Operation Owners

Replica lifecycle is owned by existing components:

- `ServiceLifecycleManager`
- `RuntimeServiceAdapter`
- `ServiceRuntimeLifecycle`
- `RebalanceCoordinator` + `UnifiedRebalancer`

No PG-specific lifecycle owner is introduced.

### 3. Use a Maintained Wire Protocol Library

Protocol framing/parsing should use a maintained PostgreSQL wire library (for
example `pg-protocol`) where possible, instead of custom byte parsing.

Custom logic remains limited to:

- session policy integration
- runtime wiring
- result/error mapping
- lifecycle-specific listener management

### 4. Cluster-Global Replica Count

`service_definitions.replica_count` is global cluster target for
`sys-postgres-wire`, not per-node.

Rebalancer plans and executes placement operations to converge this target.

### 5. Keep Query Path Single and Canonical

Listener replicas convert protocol messages to `SqlRequest` and delegate through
existing `PostgresWireAdapter` semantics into `SQLQueryEngine`.

No parallel SQL execution path is allowed.

## Current-State Gap

1. `PostgresWireAdapter` is session-to-SQL bridge only and explicitly not a
   byte-level wire server.
2. No replicated runtime service owns PostgreSQL listener sockets.
3. No runtime-service rebalancing path currently converges PG wire replicas.
4. `services`/`service_endpoints` projection for runtime built-ins is
   incomplete for this use case.

## Target Architecture

```mermaid
flowchart TD
  subgraph Client Plane
    C1[psql / pg Client]
  end

  subgraph Replica Node
    PW[PG Wire Replica\n(sys-postgres-wire)]
    PR[Protocol Runtime\n(pg-protocol based)]
    PA[PostgresWireAdapter]
    SQ[SQLQueryEngine]
  end

  subgraph Control Plane
    SD[service_definitions]
    UR[UnifiedRebalancer]
    RC[RebalanceCoordinator]
    RO[replica_operations]
    SLM[ServiceLifecycleManager]
    RSA[RuntimeServiceAdapter]
    SRL[ServiceRuntimeLifecycle]
    RT[PostgresWire Runtime Module]
    SV[services]
    SE[service_endpoints]
  end

  C1 --> PW
  PW --> PR
  PR --> PA
  PA --> SQ

  SD --> UR
  UR --> RC
  RC --> RO
  RO --> SLM
  SLM --> RSA
  RSA --> SRL
  SRL --> RT

  SRL -->|state projection| SV
  SRL -->|endpoint intent writer| SE
```

## Component Design

### A. Built-In Definition Registration

Extend built-in registration ownership to include `sys-postgres-wire` alongside
`sys-admin-meta` and `sys-wasm-meta`.

Responsibilities:

1. Insert canonical `service_definitions` row.
2. Persist through existing `register...Definitions` owner callbacks only.
3. Avoid direct runtime startup during registration phase.

### B. PG Wire Runtime Module (`runtime_ref` target)

Implement runtime module resolved by `runtime_ref = postgres-wire-runtime`.

Contract:

1. `prepare(definition, context)` validates runtime config.
2. `start(replicaContext)` binds TCP listener and returns endpoint intent.
3. `stop(replicaContext)` closes listener and frees resources.
4. `health(replicaContext)` reports bind/session health.

It must not write system tables directly.

### C. Runtime Driver Support for Lifecycle-Capable Native Modules

`native_js` runtime handling must support lifecycle-capable runtime refs used by
`sys-postgres-wire` without introducing a second driver path.

Behavior:

1. Resolve runtime ref from startup wiring map.
2. If module exposes lifecycle contract, delegate lifecycle calls.
3. Preserve existing typed errors and fail-closed validation.

### D. Runtime Service Rebalance Entity

Extend runtime-service rebalance support using existing owners.

Scope:

1. Add/normalize `entity_type = runtime_service` handling in rebalancer entity
   resolution.
2. Resolve current replicas from `services` rows where
   `service_type = runtime_service` and `service_id = entity_id`.
3. Plan `ADD/REMOVE/REPLACE` operations against runtime-service target count.
4. Dispatch operations through existing `replica_operations` flow.

### E. Replica Operation Execution for Runtime Services

Extend replica-operation execution path so target nodes can materialize runtime
service replicas via `ServiceLifecycleManager`.

Execution sequence for `ADD`:

1. Receive operation on target node.
2. Resolve service definition from cache/SQL.
3. `createReplica` -> `startReplica` via lifecycle manager.
4. Persist operation status transitions.

Execution sequence for `REMOVE`:

1. Stop replica via lifecycle manager.
2. Remove/mark endpoint and service state rows.
3. Persist operation completion.

### F. Canonical `services` Projection for Runtime Replicas

Runtime replica lifecycle transitions must project into `services` table so admin
replica views are complete.

Required row characteristics:

1. `service_id = replicaId`
2. `service_type = runtime_service`
3. `partition_id = null`, `group_id = null`
4. `node_id`, `status`, `address`, timestamps populated

### G. Endpoint Publication (`service_endpoints`)

Use `ServiceRuntimeLifecycle` endpoint writer as single publication path.

For PG wire endpoint intents:

1. `protocol = postgresql`
2. `address` and `port` from bound listener
3. health status and metadata fields filled consistently

### H. Session Model

Session behavior remains connection-local to a single replica.

Rules:

1. Prepared statements/portals/transaction state are local to replica session.
2. On replica loss, sessions terminate; clients reconnect to another endpoint.
3. No inter-replica session replication or migration is required.

## Data Model Updates

### 1. Service Definition Values

New built-in definition values:

- `service_id`: `sys-postgres-wire`
- `service_name`: `sys-postgres-wire`
- `service_type`: `runtime_service`
- `runtime_kind`: `native_js`
- `runtime_ref`: `postgres-wire-runtime`
- `protocol`: `postgresql`

### 2. Endpoint Protocol Enumeration

Protocol constants and validators must accept `postgresql` for
`service_endpoints.protocol` and associated metadata.

### 3. Config Surface

Add explicit PG wire runtime configuration keys, for example:

1. listener host binding
2. default port
3. dynamic port range
4. max sessions
5. auth mode
6. TLS mode

All keys use canonical config constants and metadata definitions.

## Control Flow

### Bootstrap (Seed)

1. Bootstrap core infra and system partitions.
2. Register built-in runtime definitions including `sys-postgres-wire`.
3. Start runtime-service rebalance cycle only after control-plane readiness.
4. Execute placement operations to create first PG wire replica(s).

If PG wire replica start fails, operation fails but bootstrap control plane
continues; node is still recoverable via existing admin/bootstrap ingress.

### Join Node

1. Join and hydrate cache using existing bootstrap path.
2. Start runtime-service rebalance participation after readiness checks.
3. Accept runtime-service replica operations when targeted by placement.

### Scale Out / Scale In

1. Operator updates `service_definitions.replica_count` for
   `sys-postgres-wire`.
2. Rebalancer computes drift and emits operations.
3. Target nodes converge replicas and endpoint rows.

## Failure Handling

### Port Bind Conflict

1. Runtime start returns typed error.
2. Operation transitions to failed with reason.
3. Rebalancer retries with policy-compliant replacement action.

### Node Failure

1. Replica rows age out/transition through existing failure handling.
2. Rebalancer schedules replacement runtime replica on healthy node.
3. New endpoint is published through endpoint writer.

### Partial Start (listener up, endpoint write failed)

1. Lifecycle start is treated as failed operation.
2. Listener is stopped during compensation.
3. Operation records and logs carry failure detail.

## Observability

Add structured dimensions:

1. `metrics.pgwire.handshake`
2. `metrics.pgwire.query`
3. `metrics.pgwire.session`
4. `metrics.pgwire.protocol_error`
5. lifecycle and rebalance operation dimensions keyed by service/replica/node.

All metrics use existing logging infrastructure and `metrics.*` conventions.

## Security and Policy

1. Authenticate sessions before query execution.
2. Map session identity to canonical tenant/principal context.
3. Enforce authorization/policy before creating `SqlRequest`.
4. Fail closed on policy violations.

## Admin UX Impact

1. Replica-oriented views display runtime-service replicas, including
   `sys-postgres-wire`.
2. Logical service views group replicas under the `sys-postgres-wire`
   definition.
3. Endpoint panels show `postgresql://address:port` and health status.

## Migration and Cutover

### Migration Steps

1. Introduce replicated PG wire runtime service path.
2. Validate bootstrap/join/scale/failover with feature enabled.
3. Remove standalone entrypoint/startup listener code.

### Final-State Guardrails

1. No direct listener startup in `src/index.js` or bootstrap/join services.
2. No fallback to non-replicated listener mode.
3. All PG wire traffic enters through replicated runtime replicas only.

## Testing Strategy

### Unit

1. runtime module lifecycle
2. driver integration for lifecycle-capable native runtime refs
3. endpoint intent validation and projection
4. rebalancer entity resolution for runtime services

### Integration

1. seed bootstrap creates discoverable `sys-postgres-wire` replica
2. join node receives runtime-service operations
3. replica count changes converge globally
4. node failure triggers replacement replica and endpoint

### Client Compatibility

1. `psql` connect/auth/query
2. `pg` client simple and extended protocol
3. transaction and prepared statement behavior per session

### Negative Tests

1. legacy standalone listener entrypoints removed/non-callable
2. no dual old/new startup mode
3. invalid runtime descriptor and port configs fail closed

## Documentation Updates

1. Add architecture section for replicated PostgreSQL wire service ownership.
2. Update operator docs for scale and endpoint discovery.
3. Update admin UI docs for logical services vs replicas terminology.
