# Requirements Document

## Introduction

This feature closes the implementation gaps discovered in the runtime/admin/SQL
architecture audit and restores a strict described-equals-implemented contract.

The scope spans four areas that currently diverge:

1. runtime schema and service-definition contracts
2. SQL execution-mode dispatch ownership
3. admin ingress ownership and serviceized command routing
4. callback runtime ownership and runtime-kind propagation

This specification is a closure layer on top of:

- `.kiro/specs/unified-service-runtime/*`
- `.kiro/specs/sql-wasm-unified-engine/*`
- `.kiro/specs/wasm-meta-service-management/*`

## Audit Shortcoming Catalog

- **S1**: `service_definitions` schema/model contradiction
  (`service_profile` drift, `handler_function_id` nullability drift).
- **S2**: `SqlCore.executeRequest` documented as owning stage/plan dispatch,
  but stage/plan remain not wired in production path.
- **S3**: Admin ingress still executes SQL directly in node-local path rather
  than using adapter-to-meta-service ownership as the primary path.
- **S4**: `Runtime_Driver_Registry` and `Service_Runtime_Lifecycle` exist but
  are not the active runtime orchestration path in startup/lifecycle wiring.
- **S5**: `partition_callback` runtime selection uses a parallel callback
  registry owner instead of unified runtime ownership.
- **S6**: Callback runtime-kind propagation is under-specified and currently has
  unsafe/default behavior (implicit `native_js`).
- **S7**: Runtime descriptor validation exists but is not consistently enforced
  in service-definition mutation and activation paths.
- **S8**: `sql_engine` runtime-kind mapping is inconsistent across architecture,
  legacy mapping, and factories.
- **S9**: Documentation drifts from implementation state in multiple places.
- **S10**: Verification and task completion criteria allow implementation claims
  without proof of production wiring.

## Glossary

- **Runtime_Closure_Spec**: This remediation specification.
- **Canonical_Contract**: Single authoritative definition used consistently by
  schema, serializers, validators, and documentation.
- **Execution_Mode_Owner**: `SqlCore.executeRequest(SqlRequest)` as the only
  dispatch owner for execution modes.
- **Admin_Ingress_Adapter**: Node-local WebSocket API that only performs
  protocol handling and routing, not mutation ownership.
- **Unified_Runtime_Ownership**: Runtime selection and lifecycle ownership via
  `Runtime_Driver_Registry` and `Service_Runtime_Lifecycle`.
- **Callback_Runtime_Descriptor**: Explicit callback runtime fields
  (`runtimeKind`, optional descriptor fields) carried in callback requests.

## Requirements

### Requirement 1: Canonical Service Definition Contract

**User Story:** As a maintainer, I want one canonical service-definition
contract so schema, serializers, commands, and bootstrap data cannot diverge.

#### Acceptance Criteria

1. THE System SHALL define one canonical column contract for
   `service_definitions` used by schema generation, row serialization,
   command SQL generation, and bootstrap seeding.
2. THE System SHALL include `service_profile` in the canonical
   `service_definitions` schema when it is used by model and command layers.
3. THE System SHALL make `handler_function_id` nullability consistent with
   runtime-aware definitions (`native_js` and `oci_container` may be null).
4. THE System SHALL enforce backward-compatible migration behavior for existing
   rows lacking runtime fields.
5. THE System SHALL provide schema-level and mutation-level tests proving fresh
   bootstrap tables accept runtime-aware service rows.

### Requirement 2: Canonical SQL Engine Runtime Mapping

**User Story:** As a maintainer, I want a single runtime-kind mapping for
`service_profile = sql_engine` so runtime inference is deterministic.

#### Acceptance Criteria

1. THE System SHALL define a single canonical `SQL_ENGINE_RUNTIME_KIND`
   constant.
2. Runtime inference code, service factories, and architecture docs SHALL use
   the same canonical `SQL_ENGINE_RUNTIME_KIND`.
3. THE System SHALL remove contradictory defaults for SQL-engine runtime kind.
4. Runtime inference for legacy rows SHALL be deterministic when
   `runtime_kind` is absent.
5. THE System SHALL include tests that assert mapping parity across inference,
   serialization, and architecture constants.

### Requirement 3: Production Execution-Mode Ownership

**User Story:** As a platform maintainer, I want execution-mode dispatch claims
to match production behavior.

#### Acceptance Criteria

1. `SqlCore.executeRequest(SqlRequest)` SHALL be the active production owner
   for `sql_statement`, `partition_callback`, `stage`, and `plan` modes.
2. Stage and plan execution modes SHALL NOT terminate with
   "not wired" errors in production paths.
3. Internal, protocol, and WASM-call adapters SHALL route through
   `SqlCore.executeRequest` for the modes they use.
4. Unsupported execution modes SHALL fail with explicit typed errors and no
   fallback path.
5. Integration tests SHALL exercise stage/plan execution through the same
   production dispatch entrypoint.

### Requirement 4: Admin Ingress Ownership Closure

**User Story:** As an operator, I want fixed node ingress while keeping command
and mutation ownership in replicated meta services.

#### Acceptance Criteria

1. Node-local admin ingress SHALL remain on fixed port `8081` as a
   compatibility endpoint.
2. Admin ingress SHALL use adapter routing (`AdminApiAdapter` and meta-service
   routing contracts) for command ownership.
3. Node-local admin ingress SHALL NOT own direct mutation paths outside the
   serviceized command pipeline.
4. Guarded bypass behavior (`observe` vs `enforce`) SHALL be explicit and
   test-covered for deprecated direct paths.
5. Adapter integration tests SHALL verify deterministic behavior across nodes
   and unavailable-leader responses.

### Requirement 5: Unified Runtime Lifecycle Activation

**User Story:** As a maintainer, I want unified runtime components to be the
actual runtime lifecycle path, not test-only infrastructure.

#### Acceptance Criteria

1. Startup/runtime orchestration SHALL instantiate and use
   `Runtime_Driver_Registry` and `Service_Runtime_Lifecycle` in live paths.
2. Runtime drivers SHALL be registered through one deterministic runtime
   registration flow.
3. Runtime lifecycle prepare/start/stop/health SHALL be routed through
   `Service_Runtime_Lifecycle` for runtime-aware services.
4. `WasmServiceLifecycle` SHALL be invoked only through runtime-driver
   ownership boundaries where applicable.
5. Integration tests SHALL verify lifecycle operations via startup-wired
   components, not only isolated unit composition.

### Requirement 6: Partition Callback Runtime Ownership Unification

**User Story:** As a maintainer, I want callback runtime selection to follow
unified runtime ownership without a parallel selector owner.

#### Acceptance Criteria

1. `partition_callback` runtime selection SHALL be owned by unified runtime
   selection ownership (`Runtime_Driver_Registry` or a strict adapter over it).
2. THE System SHALL NOT maintain a parallel callback runtime selector owner with
   divergent registration or fallback behavior.
3. `CallbackExecutionHost` SHALL remain the single callback invocation surface.
4. Unknown callback runtime kinds SHALL fail closed with typed errors.
5. Integration tests SHALL prove `native_js`, `wasm_component`, and gated
   `oci_container` behavior under unified ownership.

### Requirement 7: Explicit Callback Runtime Descriptor Propagation

**User Story:** As a runtime author, I want callback runtime kind and invocation
requirements to be explicit and deterministic.

#### Acceptance Criteria

1. Callback requests SHALL carry explicit runtime-kind intent and SHALL NOT rely
   on unsafe implicit defaults.
2. `WasmCallAdapter` SHALL assign callback runtime intent deterministically for
   WASM callback calls.
3. Native callback invocation SHALL require explicit handler + runtime-kind
   compatibility.
4. Callback SELECT-only and descriptor validation SHALL be explicit before
   partition dispatch.
5. Tests SHALL cover descriptor omission, wrong runtime kind, and invalid
   callback statement contracts.

### Requirement 8: Runtime Descriptor Validation Enforcement

**User Story:** As a maintainer, I want runtime descriptor validation to be
mandatory at mutation and activation boundaries.

#### Acceptance Criteria

1. Service-definition create/update command paths SHALL validate runtime
   descriptors with the shared runtime descriptor validator.
2. Service-definition validator SHALL enforce handler existence only where
   required by runtime/profile policy.
3. Activation paths SHALL reject invalid runtime descriptors before lifecycle
   operations begin.
4. Validation errors SHALL be structured, explicit, and auditable.
5. Unit and integration tests SHALL prove fail-closed behavior for invalid
   runtime descriptors.

### Requirement 9: Documentation Truthfulness and Drift Control

**User Story:** As a developer/operator, I want architecture and user docs to
represent actual state with clear active-vs-target distinctions.

#### Acceptance Criteria

1. `architecture.md` SHALL reflect active ownership and wiring, or explicitly
   label target-state sections as not-yet-active.
2. `README.md` and operator docs SHALL align with current runtime behavior and
   callback/runtime constraints.
3. Stale or contradictory implementation notes SHALL be removed or corrected.
4. Cross-links SHALL connect runtime, SQL, and admin migration docs so users do
   not receive contradictory guidance.
5. Documentation reviews SHALL be a completion gate for runtime ownership
   changes.

### Requirement 10: Completion Governance and Verification Gates

**User Story:** As a maintainer, I want task completion status to require proof
of production wiring and contract tests.

#### Acceptance Criteria

1. Task completion SHALL require passing evidence for production-path wiring,
   not only isolated unit tests.
2. Verification checkpoints SHALL include contract tests for each audited
   shortcoming ID (`S1`..`S10`).
3. Completion gates SHALL require parity checks between docs and code for
   execution ownership claims.
4. CI/test plans SHALL include targeted integration tests for admin ingress,
   runtime lifecycle, and callback runtime ownership.
5. Final sign-off SHALL include a shortcoming closure matrix demonstrating each
   audit finding is resolved or explicitly deferred with rationale.

### Requirement 11: Migration and Rollback Safety

**User Story:** As an operator, I want rollout to be phased and reversible while
ownership boundaries converge.

#### Acceptance Criteria

1. Rollout SHALL define explicit phases for schema alignment, runtime wiring,
   admin ingress enforcement, and callback ownership unification.
2. Each phase SHALL define compatibility expectations and rollback triggers.
3. Rollback procedures SHALL preserve data compatibility and avoid dual-owner
   mutation paths.
4. Feature-gated behavior (for `oci_container` and enforcement modes) SHALL be
   explicit and test-covered.
5. Operational runbooks SHALL document failure modes and expected error codes
   for each phase.
