# Requirements Document

## Introduction

This spec defines hard cutover of PostgreSQL wire ingress from an in-process
adapter-only bridge to a fully replicated built-in system service. The target
state is that PostgreSQL wire handling (`sys-postgres-wire`) is created,
started, stopped, scaled, and rebalanced through the same unified lifecycle and
replica-operation model as other replicated services.

No standalone node-owned PostgreSQL listener path is allowed in the final
state. All PostgreSQL wire sessions must flow through the replicated service
model with canonical metadata ownership.

## Glossary

- **PG_Wire_Service**: Built-in runtime service with service ID
  `sys-postgres-wire` that accepts PostgreSQL client TCP connections.
- **PG_Wire_Replica**: One running replica of `sys-postgres-wire` on a node,
  with a registered endpoint and lifecycle state.
- **PG_Wire_Runtime_Module**: Native JS runtime module resolved from
  `runtime_ref` and responsible for listener lifecycle.
- **Replica_Operation**: Canonical operation row in `replica_operations`
  (`ADD`, `REMOVE`, `REPLACE`) used for convergent scaling.
- **Runtime_Service_Entity**: Rebalance entity type for runtime services using
  `entity_type = runtime_service` and `entity_id = service_id`.
- **Endpoint_Intent**: Runtime lifecycle start result describing host/port/
  protocol to publish via the SQL/CDC path.

## Requirements

### Requirement 1: Built-In Replicated PostgreSQL Wire Service Definition

**User Story:** As an operator, I want PostgreSQL wire ingress to exist as a
first-class system service definition so it can be managed and scaled uniformly.

#### Acceptance Criteria

1. The system SHALL register `sys-postgres-wire` in `service_definitions`
   during bootstrap registration.
2. The definition SHALL use `service_type = runtime_service` and a valid
   runtime descriptor (`runtime_kind`, `runtime_ref`, optional
   `runtime_config`).
3. The definition SHALL include a configurable global `replica_count` target.
4. The definition SHALL be persisted via SQL/CDC only.

### Requirement 2: Unified Lifecycle Ownership

**User Story:** As a maintainer, I want PG wire replicas managed by the same
lifecycle owners as other services so there is one operational model.

#### Acceptance Criteria

1. `sys-postgres-wire` replicas SHALL be created, started, stopped, and
   restarted only through `ServiceLifecycleManager`.
2. Runtime-specific startup/shutdown SHALL be invoked only through
   `RuntimeServiceAdapter` -> `ServiceRuntimeLifecycle` -> runtime driver.
3. No bootstrap or entrypoint code SHALL start a PostgreSQL listener directly.
4. Unknown or invalid runtime descriptors SHALL fail closed.

### Requirement 3: Global Replica Placement and Scaling

**User Story:** As an operator, I want replica count to be cluster-global so
scaling does not create duplicate listeners per node unintentionally.

#### Acceptance Criteria

1. `service_definitions.replica_count` for `sys-postgres-wire` SHALL be treated
   as a cluster-global target, not a per-node target.
2. Placement decisions SHALL use one owner path via rebalancing and
   `replica_operations`.
3. The system SHALL support `ADD`, `REMOVE`, and `REPLACE` operations for
   runtime-service entities.
4. Placement enforcement SHALL reject actions that violate declared policy
   constraints.

### Requirement 4: Runtime Service Entity Support in Rebalancing

**User Story:** As a platform engineer, I want runtime services to participate
in the same rebalance machinery used for other replica-bearing entities.

#### Acceptance Criteria

1. Rebalance entity modeling SHALL include runtime-service entities keyed by
   `service_id`.
2. Replica-operation matching and in-flight tracking SHALL support
   `entity_type = runtime_service`.
3. Current replica discovery for runtime services SHALL resolve from canonical
   `services` rows.
4. Runtime-service rebalance actions SHALL use the existing operation journal
   and dispatch flow.

### Requirement 5: Canonical Actual-State Projection

**User Story:** As an operator, I want running PG wire replicas visible in the
same replica inventory as other services.

#### Acceptance Criteria

1. Every running `sys-postgres-wire` replica SHALL have a canonical row in
   `services` with lifecycle-consistent status.
2. Stopped/failed/removed replicas SHALL transition `services.status`
   consistently with lifecycle transitions.
3. `service_type` in `services` for PG wire rows SHALL identify runtime
   service replicas.
4. `services` updates SHALL flow through SQL/CDC only.

### Requirement 6: Endpoint Publication and Discovery

**User Story:** As a client and operator, I want PG wire endpoints discovered
from replicated metadata rather than ad-hoc local config.

#### Acceptance Criteria

1. PG wire start SHALL emit endpoint intent with
   `protocol = postgresql`.
2. Endpoint publication SHALL write `service_endpoints` via
   `ServiceRuntimeLifecycle` endpoint writer only.
3. Each running replica SHALL have one discoverable endpoint row with node,
   address, and port.
4. Endpoint removal/health updates SHALL follow lifecycle state transitions.

### Requirement 7: Port Allocation and Collision Safety

**User Story:** As an operator, I want deterministic listener port behavior that
avoids node-local bind conflicts.

#### Acceptance Criteria

1. PG wire runtime start SHALL validate requested or configured port before
   binding.
2. When policy allows dynamic port allocation, allocated ports SHALL come from
   configured runtime ranges.
3. Bind conflicts SHALL fail the lifecycle operation with typed errors and
   operation-journal failure state.
4. Port selection policy SHALL be consistent across bootstrap, join, and
   rebalance starts.

### Requirement 8: Session and Transaction Affinity Semantics

**User Story:** As a PostgreSQL client user, I want connection/session semantics
that are predictable under replica scaling.

#### Acceptance Criteria

1. PG wire sessions SHALL be connection-scoped to one replica.
2. Session state (prepared statements, portals, transaction state) SHALL remain
   replica-local for that connection lifetime.
3. Cross-replica session migration SHALL not be required for correctness.
4. Session termination on replica loss SHALL be explicit; clients reconnect via
   discovered endpoints.

### Requirement 9: Protocol Compatibility Baseline

**User Story:** As an application developer, I want standard PG clients to work
against the replicated service.

#### Acceptance Criteria

1. The runtime SHALL support startup/auth handshake, simple query protocol, and
   extended query protocol (`Parse/Bind/Describe/Execute/Sync`).
2. Protocol parsing/serialization SHALL use a maintained protocol library where
   feasible instead of custom byte-codec implementations.
3. Unsupported protocol features SHALL fail explicitly with PostgreSQL-compliant
   error responses.
4. All SQL execution SHALL continue through `SqlRequest` -> `SQLQueryEngine`
   (single execution path).

### Requirement 10: Authentication and Policy Integration

**User Story:** As a security operator, I want PG wire sessions to use the
shared authn/authz path.

#### Acceptance Criteria

1. Session authentication SHALL map to canonical tenant/principal context
   before query execution.
2. Authorization/policy checks SHALL be enforced before statement execution.
3. Failed authentication/authorization SHALL not create runnable session state.
4. Security decisions SHALL be auditable with structured logs.

### Requirement 11: Bootstrap and Join Safety (No Chicken-and-Egg)

**User Story:** As an operator, I want node bootstrap/join to remain reliable
without depending on PG wire availability.

#### Acceptance Criteria

1. Seed bootstrap SHALL complete control-plane initialization without requiring
   PG wire listener availability.
2. PG wire replica activation SHALL occur only after required system tables,
   routing, and lifecycle owners are ready.
3. Join flow SHALL preserve existing bootstrap API/admin paths as control-plane
   prerequisites; PG wire runtime starts after convergence conditions are met.
4. PG wire startup failure SHALL not deadlock core cluster bootstrap.

### Requirement 12: Observability and Operations

**User Story:** As an SRE, I want full operational visibility for PG wire
replica lifecycle and traffic.

#### Acceptance Criteria

1. Metrics logs SHALL include `metrics.pgwire.*` namespace for handshake,
   query, session, and error dimensions.
2. Lifecycle/rebalance logs SHALL include service ID, replica ID, operation ID,
   node ID, and runtime kind.
3. Diagnostic views SHALL show PG wire replica state and endpoint health.
4. Logging SHALL be structured and consistent with existing standards.

### Requirement 13: Admin UX Consistency

**User Story:** As an admin user, I want PG wire replicas shown in the same
replica-oriented views as other services.

#### Acceptance Criteria

1. Replica-oriented UI/CLI views SHALL include `sys-postgres-wire` replicas.
2. Logical service views SHALL group PG wire replicas under
   `sys-postgres-wire`.
3. Endpoint details SHALL include protocol/address/port and health metadata.
4. Naming in UI SHALL distinguish logical services from replica rows clearly.

### Requirement 14: Hard Cutover and Legacy Removal

**User Story:** As a maintainer, I want no parallel PostgreSQL listener path
once replicated service support is complete.

#### Acceptance Criteria

1. Standalone node-owned PostgreSQL listener startup code SHALL be removed.
2. No fallback branch SHALL bypass lifecycle/rebalance owners for PG wire.
3. Configuration SHALL not expose dual-mode execution for old/new PG wire
   startup.
4. Negative tests SHALL prove legacy entrypoints are non-callable.

### Requirement 15: Verification Gates

**User Story:** As a release owner, I want objective gates proving replicated
PG wire behavior is correct and scalable.

#### Acceptance Criteria

1. Unit tests SHALL cover runtime lifecycle, endpoint publication, and protocol
   state machine behavior.
2. Integration tests SHALL cover bootstrap, join, scale-out, failover, and
   rebalance for `sys-postgres-wire`.
3. Compatibility tests SHALL verify real PG clients (`psql`, `pg`) against the
   replicated service endpoints.
4. Release gate SHALL require passing tests for both single-node and
   multi-node topologies.
