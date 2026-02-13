# Requirements Document

## Introduction

This feature defines a unified runtime abstraction for replicated services so
the system can:

1. Run existing admin logic as-is inside replicated services (`sys-admin-meta`)
   without forcing immediate WASM rewrites.
2. Preserve and improve current WASM execution paths.
3. Introduce a container-capable runtime model in a controlled, policy-driven
   way without creating parallel lifecycle architectures.

The key architecture constraint is unchanged: one owner per concern, one write
path, one lifecycle orchestration path.

## Glossary

- **Service_Runtime_Kind**: Declared execution runtime for a service
  definition (`native_js`, `wasm_component`, `oci_container`).
- **Runtime_Driver**: Runtime-specific execution adapter selected by
  `Service_Runtime_Kind`.
- **Runtime_Driver_Registry**: Single component mapping runtime kind to driver.
- **Service_Runtime_Lifecycle**: Unified lifecycle owner that provisions,
  starts, monitors, and stops replicated service runtimes independent of kind.
- **Native_JS_Driver**: Driver for existing in-process JS handlers.
- **Wasm_Component_Driver**: Driver for WASM module/component execution.
- **OCI_Container_Driver**: Driver for OCI/container execution (feature-gated).
- **Runtime_Descriptor**: Runtime artifact + config payload attached to a
  service definition.
- **Admin_Serviceization**: Running admin command handlers in replicated
  services, not node-local mutation handlers.

## Requirements

### Requirement 1: Unified Runtime Ownership

**User Story:** As a maintainer, I want one lifecycle owner for all replicated
service runtimes so behavior is coherent and debuggable.

#### Acceptance Criteria

1. THE System SHALL introduce `Service_Runtime_Kind` as the execution selector
   for replicated services.
2. THE System SHALL centralize runtime selection in one
   `Runtime_Driver_Registry`.
3. THE System SHALL centralize runtime startup/shutdown in one
   `Service_Runtime_Lifecycle` owner.
4. THE System SHALL reject runtime execution when no driver exists for the
   declared runtime kind.
5. THE System SHALL NOT duplicate lifecycle orchestration per runtime kind.

### Requirement 2: Native Admin Execution in Replicated Services

**User Story:** As an operator, I want current admin handlers to run in
replicated services now, without rewriting them into WASM first.

#### Acceptance Criteria

1. THE System SHALL support `native_js` runtime kind for replicated services.
2. `sys-admin-meta` SHALL execute command handlers through `Native_JS_Driver`.
3. `sys-wasm-meta` SHALL be invokable through the same serviceized routing
   model (directly or delegated from `sys-admin-meta`).
4. Node-local admin endpoints SHALL act as thin routing adapters only.
5. Direct node-local admin mutation paths SHALL be rejectable via guard mode.

### Requirement 3: WASM Compatibility and Continuity

**User Story:** As a platform owner, I want existing WASM service capabilities
to keep working while runtime abstraction is introduced.

#### Acceptance Criteria

1. Existing WASM service definitions SHALL continue to activate and run.
2. WASM manifest validation, dependency resolution, capability policy, and
   lock semantics SHALL remain intact.
3. WASM runtime behavior SHALL be mediated through `Wasm_Component_Driver`.
4. Existing WASM service APIs SHALL maintain compatibility during migration.
5. Runtime abstraction SHALL NOT introduce a second independent WASM lifecycle.

### Requirement 4: Container Runtime Readiness

**User Story:** As a platform architect, I want a first-class path for
classical containers after native/WASM unification is in place.

#### Acceptance Criteria

1. THE System SHALL define `oci_container` runtime kind and descriptor schema.
2. THE System SHALL require immutable image digest references for activation.
3. Container runtime SHALL be feature-gated until policy and isolation checks
   are enabled.
4. The driver contract SHALL support container health, startup, shutdown, and
   endpoint reporting semantics.
5. Container execution SHALL reuse the same lifecycle and operation tracking
   framework as other runtime kinds.

### Requirement 5: Service Definition Schema Evolution

**User Story:** As a maintainer, I want service definitions to encode runtime
intent explicitly and unambiguously.

#### Acceptance Criteria

1. THE System SHALL add runtime fields to service definitions (runtime kind and
   runtime descriptor/config).
2. Legacy WASM-centric fields SHALL remain readable during migration.
3. Serialization/deserialization SHALL provide deterministic mapping between
   legacy and new fields.
4. Validation SHALL enforce runtime-specific descriptor requirements.
5. Schema migration SHALL be backward compatible for existing clusters.

### Requirement 6: Single-Path Mutation Contract

**User Story:** As an operator, I want all management mutations to continue
flowing through SQL/CDC ownership paths.

#### Acceptance Criteria

1. All runtime/service metadata mutations SHALL flow through SQL/CDC.
2. No runtime driver SHALL write system metadata directly to partitions.
3. No compatibility adapter SHALL introduce alternative mutation paths.
4. Operation journaling SHALL remain the owner of async mutation states.
5. Failures SHALL be surfaced with explicit error codes and no silent fallback.

### Requirement 7: Routing and Availability Behavior

**User Story:** As a client, I want command routing to replicated service
leaders with explicit unavailable behavior.

#### Acceptance Criteria

1. Command routing SHALL resolve service leader from `services` metadata.
2. Missing/unroutable leaders SHALL return explicit unavailable errors.
3. Routing SHALL preserve trace and request identifiers.
4. Delegation from `sys-admin-meta` to other runtime-owned services SHALL be
   explicit and auditable.
5. Adapter behavior SHALL be deterministic across nodes.

### Requirement 8: Endpoint and Port Ownership

**User Story:** As an operator, I want runtime-independent endpoint management
that avoids bespoke per-runtime networking logic.

#### Acceptance Criteria

1. Endpoint registration SHALL remain owned by one endpoint builder/write path.
2. Runtime drivers SHALL report endpoint intents through the same lifecycle
   owner.
3. Port allocation policy SHALL be centralized and runtime-agnostic.
4. Management endpoint policy (including fixed administrative endpoints) SHALL
   remain explicit and documented.
5. Endpoint health transitions SHALL update via CDC-consistent paths.

### Requirement 9: Security and Policy Enforcement

**User Story:** As a security-focused operator, I want runtime-specific policy
checks with fail-closed semantics.

#### Acceptance Criteria

1. All management commands SHALL pass authn/authz checks.
2. Runtime-specific policy checks SHALL run before activation.
3. Container runtime SHALL enforce registry/source policy checks.
4. Capability and dependency checks SHALL remain enforced for WASM.
5. Policy failures SHALL be fail-closed with auditable deny records.

### Requirement 10: Resource Controls and Isolation

**User Story:** As a platform operator, I want predictable resource controls
across runtime kinds.

#### Acceptance Criteria

1. Resource budgets SHALL apply across native, WASM, and container runtimes.
2. Runtime drivers SHALL publish normalized resource telemetry.
3. Over-budget execution SHALL terminate with typed errors.
4. Isolation semantics SHALL be explicit per runtime kind.
5. Runtime limits SHALL be configurable via controlled policy fields.

### Requirement 11: Async Operations and Idempotency

**User Story:** As a client, I want long-running runtime operations to be
trackable, idempotent, and observable.

#### Acceptance Criteria

1. Mutating runtime/service commands SHALL create operation records.
2. Duplicate idempotency keys SHALL return the original operation identity.
3. Operation state transitions SHALL be validated and persisted.
4. Operation stream publishing SHALL support real-time subscribers.
5. Response envelopes SHALL include request and operation identifiers.

### Requirement 12: Observability and Diagnostics

**User Story:** As an SRE, I want uniform observability regardless of runtime.

#### Acceptance Criteria

1. Command metrics SHALL include action, latency, success, and error count.
2. Runtime metrics SHALL include runtime kind and service profile dimensions.
3. Tracing SHALL propagate adapter -> router -> service -> SQL paths.
4. Logs SHALL include runtime kind, service ID, and operation ID where
   applicable.
5. Debug diagnostics SHALL surface runtime selection and driver decisions.

### Requirement 13: Migration and Backward Compatibility

**User Story:** As a maintainer, I want a staged migration path that avoids big
bang risk.

#### Acceptance Criteria

1. Migration SHALL support phased enablement (`observe`, `enforce`).
2. Existing node-local admin clients SHALL continue functioning through
   compatibility adapters.
3. Existing WASM service definitions SHALL not require immediate rewrites.
4. Rollback strategy SHALL be documented and test-covered.
5. Deprecated direct paths SHALL have explicit deprecation and removal phases.

### Requirement 14: Testing and Verification

**User Story:** As a maintainer, I want high-confidence verification for the
unified runtime architecture.

#### Acceptance Criteria

1. Unit tests SHALL cover runtime descriptor validation and driver selection.
2. Unit tests SHALL cover native/WASM/container driver contract conformance.
3. Integration tests SHALL verify admin adapter routing to replicated services.
4. Integration tests SHALL verify operation lifecycle and idempotency.
5. Compatibility tests SHALL confirm existing CLI and WASM flows still work.

### Requirement 15: Documentation and Architecture Updates

**User Story:** As a developer, I want the architecture documentation to
describe the target unified runtime model and ownership boundaries.

#### Acceptance Criteria

1. THE System SHALL update `architecture.md` with runtime abstraction ownership
   and data flow.
2. Documentation SHALL differentiate current behavior vs planned migration
   phases where needed.
3. Admin, WASM, and future container guidance SHALL be documented in one
   coherent runtime model.
4. Runtime kind semantics SHALL be documented with examples.
5. Documentation SHALL include explicit anti-patterns (parallel lifecycle,
   bypass mutation paths, fallback engines).
