# Requirements Document

## Introduction

The current codebase has multiple places where ownership is duplicated:
bootstrap flow logic exists both in monolithic services and phase classes,
shared setup components exist but are not consistently used, CDC handling is
split across two implementations, system-cache key metadata is duplicated, and
runtime wiring can be instantiated from multiple paths.

This specification defines a strict single-owner architecture so each concern
has one implementation and one lifecycle owner, with no fallback or parallel
code paths.

## Glossary

- **Owner_Component**: The single component that implements and owns a concern.
- **Bootstrap_Pipeline**: Ordered seed-node startup steps (infra, message groups,
  partitions, registration, hydration, control plane).
- **Joining_Pipeline**: Ordered joining-node startup steps (contact seed, connect
  websocket, message-group join/create, state query, control plane readiness).
- **Shared_Setup_Component**: Reusable setup module for a cross-cutting concern
  (message router, CDC integration, replica handler, control plane).
- **CDC_Application_Path**: The only path that applies CDC events to cache state.
- **System_Cache_Key_Descriptor**: Canonical metadata describing primary keys for
  system tables.
- **Runtime_Wiring**: Startup-owned registry and lifecycle objects for runtime
  kinds (native_js, wasm_component, oci_container).
- **Delegation_Adapter**: Thin compatibility method that forwards to the owner
  implementation without containing duplicate logic.

## Requirements

### Requirement 1: Single Owner for Seed Bootstrap Execution

**User Story:** As an architect, I want seed bootstrap logic to have one owner
per phase, so behavior cannot diverge between parallel implementations.

#### Acceptance Criteria

1. THE system SHALL define one owner implementation for each seed bootstrap
   phase: infrastructure, message groups, partitions, registration, cache
   hydration, and control plane activation.
2. THE BootstrapService SHALL execute phase owners directly or through
   Delegation_Adapters only.
3. IF phase classes remain, THEN each phase class SHALL delegate to the same
   owner implementation used by BootstrapService.
4. THE codebase SHALL NOT contain two independent implementations of the same
   seed bootstrap phase behavior.

### Requirement 2: Single Owner for Joining Pipeline Execution

**User Story:** As an architect, I want joining-node flow logic to have one
owner per step, so joining behavior is deterministic and maintainable.

#### Acceptance Criteria

1. THE system SHALL define one owner implementation for each joining step:
   contact seed, websocket connection, message-group join/create, control plane
   setup, and state query integration.
2. THE NodeJoiningService SHALL execute owner implementations directly or
   through Delegation_Adapters only.
3. IF joining phase classes remain, THEN each class SHALL delegate to the same
   owner implementation used by NodeJoiningService.
4. THE codebase SHALL NOT maintain a parallel joining-path implementation for
   any owned step.

### Requirement 3: Shared Setup Components Are Mandatory Owners

**User Story:** As an architect, I want setup responsibilities centralized in
shared setup components, so bootstrap and joining cannot drift.

#### Acceptance Criteria

1. THE setup of MessageRouter SHALL be owned by MessageRouterSetup.
2. THE setup and upgrade of CDCIntegrationService SHALL be owned by
   CDCIntegrationSetup.
3. THE setup of ReplicaHandler and ReplicaStateMachine SHALL be owned by
   ReplicaHandlerSetup.
4. THE setup of HeartbeatService, LeaseService, EndpointService,
   ReplicaDispatchService, and RebalanceCoordinator composition SHALL be owned
   by ControlPlaneSetup.
5. BootstrapService and NodeJoiningService SHALL NOT directly recreate the owned
   setup logic outside these shared components.

### Requirement 4: Single CDC Application Path in Message Groups

**User Story:** As a developer, I want one CDC handling implementation for
message groups, so subscription behavior, ordering, and dedupe are consistent.

#### Acceptance Criteria

1. THE system SHALL define one Owner_Component for message-group CDC handling.
2. THE Owner_Component SHALL own subscription checks, event ordering rules,
   deduplication rules, and cache application semantics.
3. MessageGroupService SHALL delegate CDC logic to the Owner_Component instead
   of reimplementing it.
4. THE runtime path SHALL NOT bypass the owner CDC path for normal CDC handling.

### Requirement 5: Canonical System Cache Key Metadata

**User Story:** As a maintainer, I want one primary-key descriptor for system
tables, so cache implementations cannot drift.

#### Acceptance Criteria

1. THE system SHALL define one canonical System_Cache_Key_Descriptor.
2. SystemTableCache SHALL consume the canonical descriptor for key resolution.
3. SQLiteSystemCache SHALL consume the same canonical descriptor for key
   resolution.
4. THE system SHALL fail fast with a descriptive error if a system table lacks
   a key descriptor entry.
5. THE default cache hydration table selection SHALL continue to exclude logs by
   default.

### Requirement 6: Single Owner for Runtime Wiring

**User Story:** As an architect, I want runtime registry/lifecycle wiring to be
startup-owned and injected, so runtime behavior is deterministic.

#### Acceptance Criteria

1. THE creation of Runtime_Wiring SHALL occur only in startup composition
   boundaries (seed bootstrap and node joining startup).
2. Callback runtime registries SHALL consume injected runtime wiring and SHALL
   NOT implicitly create independent startup wiring.
3. SQLQueryEngine partition-callback execution SHALL fail closed when runtime
   driver registry ownership is missing.
4. THE system SHALL NOT instantiate hidden per-request runtime owners.

### Requirement 7: No Dual-Path Migration

**User Story:** As an architect, I want migration to avoid old/new fallback
paths, so behavior remains singular during refactor.

#### Acceptance Criteria

1. Migration steps SHALL use delegation-first refactors where legacy entry
   points call owner implementations.
2. Legacy duplicate bodies SHALL be removed after delegation is verified.
3. THE system SHALL NOT introduce feature flags that run both legacy and new
   implementations for the same concern.
4. THE system SHALL preserve externally observable behavior during migration.

### Requirement 8: Ownership Diagnostics and Logging

**User Story:** As an operator, I want clear diagnostics when ownership
contracts are violated, so failures are actionable.

#### Acceptance Criteria

1. Missing owner dependency errors SHALL identify the owner component and
   missing dependency explicitly.
2. Startup logs SHALL include which owner component initialized each major
   concern (CDC setup, control plane setup, runtime wiring).
3. Ownership violation paths SHALL fail fast rather than silently falling back.

### Requirement 9: Ownership Verification Test Coverage

**User Story:** As a maintainer, I want tests that enforce single-owner
architecture, so duplication cannot regress.

#### Acceptance Criteria

1. THE test suite SHALL include contract tests asserting bootstrap and joining
   orchestration delegate to owner components.
2. THE test suite SHALL include contract tests asserting shared setup components
   are used in runtime paths.
3. THE test suite SHALL include CDC behavior tests validating a single CDC owner
   path is used.
4. THE test suite SHALL include cache key descriptor consistency tests shared
   across cache implementations.
5. THE test suite SHALL include runtime wiring ownership tests that fail when
   implicit fallback wiring is created.

### Requirement 10: Architecture Documentation and Traceability

**User Story:** As a maintainer, I want architecture docs to match
implementation ownership, so future work follows correct boundaries.

#### Acceptance Criteria

1. THE architecture document SHALL define single owners for each consolidated
   concern covered by this spec.
2. THE architecture document SHALL describe bootstrap and joining pipelines in
   terms of owner components and delegation boundaries.
3. THE architecture document SHALL document runtime wiring ownership and
   injection boundaries.
4. THE spec tasks SHALL map each implementation task to requirement IDs for
   traceability.
