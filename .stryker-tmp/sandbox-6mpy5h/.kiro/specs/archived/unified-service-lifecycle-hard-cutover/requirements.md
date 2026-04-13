# Requirements Document

## Introduction

This spec defines a total migration to a single service lifecycle model for the
entire system. "Service" means any message handler with state, including:

- message groups
- partitions
- built-in meta services (`sys-admin-meta`, `sys-wasm-meta`)
- userland services

The target state has one startup path, one reconciliation path, and one message
invocation path for all services. There is no legacy compatibility mode in the
final state.

## Glossary

- **Service_Definition**: desired service contract row (identity, runtime,
  policy, scale, config).
- **Service_Replica**: running instance of a service on a node.
- **Service_Lifecycle_Manager (SLM)**: single owner for create/start/stop/
  restart of all service replicas.
- **Service_Reconciler**: control-loop owner that converges actual state to
  desired state.
- **Service_Type_Adapter**: wrapper implementing lifecycle contract for a
  specific service class (partition, message-group, runtime service).
- **Service_Message**: canonical runtime-neutral invocation envelope.
- **Ingress_Adapter**: protocol-specific adapter (WS now, others later)
  translating external requests into `Service_Message`.

## Requirements

### Requirement 1: Single Lifecycle Owner

**User Story:** As a maintainer, I want one lifecycle owner for all services so
startup and maintenance are deterministic.

#### Acceptance Criteria

1. THE System SHALL manage service replica create/start/stop/restart via one
   `Service_Lifecycle_Manager`.
2. THE System SHALL forbid direct service startup from bootstrap/join components
   outside `Service_Lifecycle_Manager`.
3. THE System SHALL forbid parallel lifecycle orchestration paths by service
   class.
4. THE System SHALL fail closed when a lifecycle request targets an unknown
   service type.

### Requirement 2: Single Reconciliation Owner

**User Story:** As an operator, I want one control loop that keeps service
runtime state aligned with desired metadata.

#### Acceptance Criteria

1. THE System SHALL converge desired service state using one
   `Service_Reconciler`.
2. THE System SHALL compute placement/replica actions from canonical system
   tables and policies only.
3. THE System SHALL persist lifecycle operations in operation tables before
   mutating runtime state.
4. THE System SHALL not allow ad-hoc side-channel reconciliation loops.

### Requirement 3: Universal Service Descriptor

**User Story:** As a platform developer, I want all service kinds represented
with one canonical descriptor model.

#### Acceptance Criteria

1. THE System SHALL represent partitions, message groups, built-ins, and
   userland services through the same descriptor schema.
2. THE System SHALL include runtime selection (`runtime_kind`) and runtime
   descriptor fields for all service kinds.
3. THE System SHALL include service type identity for lifecycle adapter
   resolution.
4. THE System SHALL reject descriptors that cannot be resolved to exactly one
   lifecycle adapter.

### Requirement 4: Universal Invocation Envelope

**User Story:** As a protocol developer, I want all requests to reach services
through one canonical message contract.

#### Acceptance Criteria

1. THE System SHALL define one `Service_Message` envelope used by all ingress
   protocols.
2. Ingress adapters SHALL translate protocol payloads to `Service_Message`
   without owning mutation logic.
3. THE System SHALL route `Service_Message` through `MessageRouter` and leader
   resolution semantics.
4. THE System SHALL reject non-canonical invocation envelopes.

### Requirement 5: Ingress Adapter Unification

**User Story:** As a maintainer, I want admin/local ingress to be adapters only,
not service owners.

#### Acceptance Criteria

1. Node-local admin websocket ingress SHALL remain an adapter only.
2. Adapter layers SHALL not start services directly.
3. Adapter layers SHALL not mutate service metadata directly.
4. Adapter layers SHALL not bypass service routing/lifecycle owners.

### Requirement 6: Built-in Service Adoption

**User Story:** As an architect, I want existing core services to use the same
lifecycle API as new services.

#### Acceptance Criteria

1. Message-group replicas SHALL be managed through `Service_Lifecycle_Manager`
   via a message-group adapter.
2. Partition replicas SHALL be managed through `Service_Lifecycle_Manager` via
   a partition adapter.
3. Existing internal logic inside partition/message-group services MAY stay, but
   lifecycle ownership SHALL be unified.
4. Bootstrap/join shall call unified lifecycle APIs only.

### Requirement 7: Userland Service Parity

**User Story:** As a userland developer, I want custom services to have the same
lifecycle and routing behavior as built-ins.

#### Acceptance Criteria

1. Userland services SHALL use the same descriptor, lifecycle, and invocation
   path as built-ins.
2. Userland services SHALL use the same operation journaling semantics.
3. Runtime selection for userland services SHALL use the shared runtime driver
   registry.
4. Policy validation SHALL be consistent across built-in and userland services.

### Requirement 8: Runtime Driver Unification

**User Story:** As a runtime maintainer, I want runtime selection and execution
to stay centralized.

#### Acceptance Criteria

1. Runtime driver lookup SHALL remain owned by one runtime registry.
2. Lifecycle runtime calls SHALL be mediated by `Service_Lifecycle_Manager`.
3. Unknown runtime kinds SHALL fail closed with typed errors.
4. Runtime drivers SHALL not write system metadata directly.

### Requirement 9: Metadata Ownership and Write Path

**User Story:** As a reliability engineer, I want all service metadata changes to
follow one durable write path.

#### Acceptance Criteria

1. Service definition and service state writes SHALL flow through SQL/CDC only.
2. Runtime/lifecycle code SHALL not perform direct partition metadata writes.
3. Reconciler decisions SHALL be persisted before execution.
4. System cache updates SHALL remain CDC-driven only.

### Requirement 10: Operations, Idempotency, and Recovery

**User Story:** As an operator, I want lifecycle actions to be trackable and
safe across retries/crashes.

#### Acceptance Criteria

1. Mutating service lifecycle actions SHALL create operation records.
2. Idempotency keys SHALL return original operation identity on duplicate
   requests.
3. Recovery SHALL resume from operation journal state.
4. Operation state transitions SHALL be monotonic and validated.

### Requirement 11: Observability and Diagnostics

**User Story:** As an SRE, I want uniform diagnostics for all service kinds.

#### Acceptance Criteria

1. Logs SHALL include service ID, service type, runtime kind, operation ID.
2. Metrics SHALL cover lifecycle and invocation latency/success/failure.
3. Traces SHALL propagate adapter -> dispatcher -> service replica.
4. Diagnostic endpoints SHALL expose reconciler decisions and lifecycle adapter
   selections.

### Requirement 12: Security and Policy

**User Story:** As a security operator, I want one policy path independent of
service origin.

#### Acceptance Criteria

1. Management commands SHALL pass shared authn/authz checks.
2. Runtime-specific policy gates SHALL run before activation.
3. Placement and replication policy checks SHALL run before reconciliation
   execution.
4. Policy violations SHALL fail closed.

### Requirement 13: Hard Cutover and Legacy Removal

**User Story:** As a maintainer, I want migration completion to leave zero
legacy startup or maintenance code paths.

#### Acceptance Criteria

1. THE System SHALL remove legacy startup paths for service classes once
   cutover is complete.
2. THE System SHALL remove legacy maintenance/reconciliation paths once cutover
   is complete.
3. THE System SHALL remove fallback/compatibility execution branches after
   cutover.
4. THE System SHALL not ship runtime flags that preserve old lifecycle owners.
5. All tests SHALL run only against the unified lifecycle path.

### Requirement 14: No Parallel Ownership in Final State

**User Story:** As an architect, I want ownership boundaries to be explicit and
singular.

#### Acceptance Criteria

1. Exactly one component SHALL own lifecycle orchestration.
2. Exactly one component SHALL own reconciliation.
3. Exactly one component SHALL own ingress adaptation per protocol.
4. Exactly one component SHALL own runtime driver selection.
5. Architecture documentation SHALL name all owners and ban parallel owners.

### Requirement 15: Completion Gates for Total Migration

**User Story:** As a release owner, I want objective criteria proving migration
is complete.

#### Acceptance Criteria

1. Cutover gate SHALL require legacy lifecycle code paths deleted from source.
2. Cutover gate SHALL require negative tests proving legacy entrypoints are not
   callable.
3. Cutover gate SHALL require integration tests for bootstrap, join, rebalance,
   and userland service invocation through unified lifecycle only.
4. Cutover gate SHALL require architecture and operations docs updated to final
   model only.
5. Release SHALL be blocked until all cutover gates pass.
