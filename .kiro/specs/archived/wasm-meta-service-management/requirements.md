# Requirements Document

## Introduction

This feature implements the missing WASM artifact management plane as a
service-owned control plane. Management surfaces must run in replicated
services, not as ad-hoc node-local APIs.

The design follows the WebAssembly Component Model distribution practicalities:

- Canonical package identifiers (`namespace:name@version`)
- Registry mapping by namespace with per-package overrides
- OCI-compatible package references and digest pinning
- Deterministic dependency resolution with lock records

Two service roles are defined:

- `sys-wasm-meta` (required): owns WASM module/package and WASM service
  lifecycle admin commands
- `sys-admin-meta` (required): owns broader admin APIs and
  delegates WASM-specific commands to `sys-wasm-meta`

## Glossary

- **Wasm_Meta_Service**: Built-in replicated management service for WASM module
  and WASM service administration.
- **Admin_Meta_Service**: Built-in replicated service that owns general admin
  API surfaces and delegates WASM operations to Wasm_Meta_Service.
- **Package_Reference**: Canonical component package ID
  `namespace:name@version`.
- **Registry_Mapping**: Namespace-to-registry resolution rules with optional
  per-package overrides.
- **OCI_Reference**: OCI location for a package/artifact (tag or digest form).
- **Dependency_Lock**: Persisted resolved dependency graph pinned to immutable
  digests for deterministic fetch/activation.
- **Service_Operation**: Async command workflow with operation id, status, and
  audit trail.
- **Idempotency_Key**: Client key used to deduplicate mutating retries.

## Requirements

### Requirement 1: Service-Owned Admin Surface

**User Story:** As an operator, I want all WASM admin functionality owned by
replicated services so control-plane behavior is uniform and highly available.

#### Acceptance Criteria

1. THE System SHALL provision `sys-wasm-meta` during seed bootstrap as a
   replicated service.
2. THE System SHALL route all WASM admin mutations through `sys-wasm-meta`
   handlers.
3. THE System SHALL provision `sys-admin-meta` during seed bootstrap as a
   replicated service and allow it to delegate WASM-specific commands to
   `sys-wasm-meta`.
4. Node-local HTTP/WebSocket admin routes SHALL act only as thin adapters to
   service-owned handlers.
5. THE System SHALL reject direct metadata mutation paths that bypass meta
   services.

### Requirement 2: External Management API

**User Story:** As a platform client, I want stable external APIs for module and
service administration.

#### Acceptance Criteria

1. THE System SHALL expose versioned APIs for module publish/read/list and
   service create/update/rollout/scale/delete.
2. THE System SHALL expose operation-stream subscription for async updates.
3. Mutating responses SHALL include `request_id` and `operation_id`.
4. Mutating commands SHALL accept Idempotency_Key.
5. THE System SHALL validate request schema and return field-level errors.

### Requirement 3: Component Package Identity and Metadata

**User Story:** As a developer, I want package identity and metadata to follow
component-model conventions so distribution is interoperable.

#### Acceptance Criteria

1. THE System SHALL represent published packages with canonical
   `namespace:name@version` identity.
2. THE System SHALL persist package metadata including package id, digest,
   `run_export`, exports, dependencies, capabilities, and source reference.
3. THE System SHALL support both package-level metadata and executable artifact
   references without dual-write ambiguity.
4. IF package identity is invalid, THEN publish SHALL fail with descriptive
   validation errors.
5. IF digest validation fails, THEN publish SHALL fail without partial writes.

### Requirement 4: Registry Mapping and Distribution Sources

**User Story:** As an operator, I want namespace-based registry mapping so
component package resolution is explicit and policy-controlled.

#### Acceptance Criteria

1. THE System SHALL support registry mapping by package namespace.
2. THE System SHALL support per-package registry override entries.
3. THE System SHALL support OCI-compatible source references for fetch/publish.
4. THE System SHALL require immutable digest pinning for activation paths.
5. THE System SHALL audit which mapping rule selected each resolved source.

### Requirement 5: Dependency Resolution and Locking

**User Story:** As an operator, I want deterministic dependency resolution so
runtime activation is reproducible.

#### Acceptance Criteria

1. THE System SHALL resolve dependencies to immutable digests before activation.
2. THE System SHALL persist a Dependency_Lock record for each activation-ready
   module/service revision.
3. THE System SHALL reject undeclared imports and undeclared dependency usage.
4. THE System SHALL reject mutable dependency drift until an explicit rollout
   updates lock state.
5. THE System SHALL expose lock inspection in admin read APIs.

### Requirement 6: Capability and Policy Enforcement

**User Story:** As a security-focused operator, I want strict capability
enforcement during publish and activation.

#### Acceptance Criteria

1. THE System SHALL enforce tenant/service capability allowlists.
2. THE System SHALL reject capabilities not declared by module manifest.
3. THE System SHALL inject only allowed and declared capabilities at runtime.
4. THE System SHALL emit audit records for allow/deny decisions.
5. THE System SHALL fail closed on policy check errors.

### Requirement 7: Service Lifecycle Management

**User Story:** As an operator, I want service management commands to reuse
existing lifecycle and rebalancer ownership.

#### Acceptance Criteria

1. THE System SHALL validate service definitions before acceptance.
2. THE System SHALL route accepted lifecycle mutations through existing WASM
   lifecycle + rebalancer components.
3. THE System SHALL support SQL engine service profile creation via the same
   meta-service command path.
4. THE System SHALL support safe rollout and scale workflows with operation
   tracking.
5. THE System SHALL not duplicate lifecycle logic in API adapters.

### Requirement 8: Asynchronous Operations and Idempotency

**User Story:** As a client, I want async operation tracking and idempotent
retries for long-running commands.

#### Acceptance Criteria

1. Mutating commands SHALL execute as persisted Service_Operation workflows.
2. THE System SHALL return `operation_id` immediately for async commands.
3. THE System SHALL persist operation state transitions and results/errors.
4. Duplicate requests with same Idempotency_Key SHALL return original operation
   identity/result.
5. Operation updates SHALL be publishable through stream endpoints.

### Requirement 9: Security and Quotas

**User Story:** As an operator, I want authentication, authorization, and quota
enforcement for external management APIs.

#### Acceptance Criteria

1. THE System SHALL authenticate management clients.
2. THE System SHALL authorize commands with tenant/service scoped policy.
3. THE System SHALL enforce quotas (module size, package count, concurrent ops).
4. Unauthorized and quota-exceeded commands SHALL return explicit error codes.
5. Audit records SHALL include tenant and principal context.

### Requirement 10: Data Model and System Tables

**User Story:** As a maintainer, I want explicit system tables for package and
operation state.

#### Acceptance Criteria

1. THE System SHALL add system tables for package metadata and operation
   journaling (`module_manifests`, `wasm_operations` or final equivalent names).
2. THE System SHALL add table constants and bootstrap schema registration for
   those tables.
3. THE System SHALL include those tables in cache hydration and node-join
   snapshots.
4. THE System SHALL define unique constraints for package identity and lock
   identity.
5. THE System SHALL document source-of-truth ownership for artifact bytes vs
   package metadata.

### Requirement 11: Admin API Serviceization

**User Story:** As a platform operator, I want the existing admin API migrated
to a service-owned model to align with the same control-plane architecture.

#### Acceptance Criteria

1. THE System SHALL define service-owned admin handlers in `sys-admin-meta` for
   all existing non-WASM admin operations.
2. Existing node-level Admin API endpoints SHALL be compatibility adapters that
   forward to service handlers.
3. Migration SHALL preserve current admin CLI capabilities during transition.
4. THE System SHALL publish a deprecation plan for direct node-local admin
   behavior.
5. THE System SHALL provide tests covering adapter compatibility and service
   ownership behavior.

### Requirement 12: Single-Path Contract Compliance

**User Story:** As a maintainer, I want strict single-path behavior for all
WASM/admin management actions.

#### Acceptance Criteria

1. All WASM/admin mutations SHALL write through SQL/CDC ownership paths.
2. No fallback code paths SHALL mutate package/service metadata in parallel.
3. Lifecycle ownership SHALL remain in lifecycle/rebalancer components.
4. Validation ownership SHALL remain in existing validator components.
5. THE System SHALL fail closed on unresolved ownership ambiguities.

### Requirement 13: Documentation and Migration

**User Story:** As a developer, I want clear rollout and migration documentation
for component distribution and serviceized admin surfaces.

#### Acceptance Criteria

1. THE System SHALL document package identity, registry mapping, OCI reference
   handling, and lock semantics.
2. THE System SHALL update architecture docs for `sys-wasm-meta` and
   `sys-admin-meta` ownership boundaries.
3. THE System SHALL provide migration guidance from direct table writes to
   service APIs.
4. THE System SHALL provide compatibility tests proving no lifecycle regressions.
5. THE System SHALL provide staged rollout guidance for existing clusters.
