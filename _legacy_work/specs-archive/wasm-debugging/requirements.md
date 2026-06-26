# Requirements Document: WASM Debugging (Track A Runtime-Aligned)

## Introduction

This spec defines **Track A** of WASM debugging for the current implementation.

Current execution model reality:
- `WasmExecutor` invokes `run_export` from `mod.exports[runExport]`.
- `ModuleMirror` caches `{wasmBytes, manifest, exports}` and does not own low-level
  runtime-debug primitives such as instruction stepping, fuel metering, or linear-memory
  introspection.
- `CallbackExecutionHost` is request-scoped; callback execution is routed through runtime
  drivers (`native_js`, `wasm_component`, `oci_container` feature-gated).

Because of this, the immediate deliverable is **structured distributed debugging traces** with
session gating, SQL/CDC metadata ownership, and harness/UI integration.

Track B (source-level debugging, DWARF, DAP stepping, snapshot/replay) is fully specified in:
- `.kiro/specs/archived/wasm-debug-runtime-foundation/requirements.md`
- `.kiro/specs/archived/wasm-debug-runtime-foundation/design.md`
- `.kiro/specs/archived/wasm-debug-runtime-foundation/tasks.md`

## Scope

### In Scope (Track A)

1. Debug capability constants and policy usage for trace sessions.
2. Structured trace emission from both service execution and partition callback execution.
3. Per-node trace collection and client forwarding using existing admin ingress ownership.
4. Debug session lifecycle and SQL/CDC-backed state propagation.
5. Test harness + admin UI support for viewing and filtering trace streams.
6. Zero/near-zero inactive overhead via strict session/capability gating.

### Out of Scope (Track A)

1. Source-level breakpoints and stepping.
2. DWARF mapping and local variable inspection.
3. Linear memory snapshots and deterministic replay runtime.
4. Per-replica DAP server orchestration.

These are Track B requirements and are not to be partially implemented under Track A.

## Glossary

- **Trace_Event**: Structured diagnostic event emitted during execution with lineage/stage
  metadata.
- **Trace_Collector**: Node-local collector that receives Trace_Events and forwards them to
  connected debug clients.
- **Debug_Session**: SQL/CDC-propagated session record that enables trace emission for a target
  scope.
- **Debug_Session_Resolver**: Runtime component that resolves whether tracing is active for the
  current execution scope (service or lineage).
- **Debug_API**: Runtime-aligned API surface exposed to executed code under Track A
  (for example `ctx.debug.trace(...)`) rather than low-level WASM import debugging.
- **Lineage_ID**: Existing deterministic correlation identifier from lineage tracking.
- **Stage_ID**: Existing identifier for callback stage execution in a `ctx.call` chain.

## Requirements

### Requirement A1: Debug Capability Constants and Policy Compatibility

**User Story:** As a module developer, I want debug capability names to be stable constants,
so policy checks and runtime checks are consistent.

#### Acceptance Criteria

1. Debug capability strings SHALL be defined in dedicated constants as:
   `debug.trace`, `debug.breakpoint`, `debug.snapshot`.
2. Track A session activation SHALL require `debug.trace` to be declared by the module.
3. Existing capability enforcement (`enforceCapabilityPolicy`) SHALL be reused; no parallel policy
   path SHALL be introduced.
4. Track A implementation SHALL NOT require `debug.breakpoint` or `debug.snapshot` at runtime.

### Requirement A2: Runtime-Aligned Trace Emission API

**User Story:** As a module developer, I want to emit structured traces from executed logic with a
stable API compatible with the current executor model.

#### Acceptance Criteria

1. The system SHALL expose a trace API compatible with current execution contracts
   (for example `ctx.debug.trace(level, message, context)`), without requiring low-level WASM
   import injection.
2. Trace API calls SHALL validate level against defined levels
   (`error`, `warn`, `info`, `debug`, `trace`).
3. Invalid levels SHALL fail with a deterministic, descriptive error.
4. When tracing is inactive, trace calls SHALL short-circuit with no Trace_Event allocation.

### Requirement A3: Trace Event Envelope

**User Story:** As a debugging client, I want strongly-structured trace envelopes so I can filter,
aggregate, and visualize distributed execution.

#### Acceptance Criteria

1. Each Trace_Event SHALL include:
   - `level`, `message`, `context`, `timestamp`
   - `lineageId`, `stageId`, `partitionId`
   - `nodeId`, `serviceDefinitionId`, `replicaId`
   - `runtimeKind`, `source` (`service` or `partition_callback`)
2. Lineage/stage metadata SHALL be read from existing lineage/stage owners and SHALL NOT create
   parallel tracking state.
3. Event serialization format for transport SHALL be JSON.

### Requirement A4: Trace Collection and Admin Ingress Reuse

**User Story:** As an operator, I want trace streaming to reuse existing node admin ingress ownership
instead of introducing a parallel transport server.

#### Acceptance Criteria

1. A node-local Trace_Collector SHALL accept Trace_Events from local execution paths.
2. External client streaming SHALL be exposed via existing admin ingress ownership
   (`AdminWebSocketAPI` route extension), not a second standalone socket server.
3. Collector behavior with no subscribers SHALL be drop/no-buffer by default.
4. Per-connection lineage filter support SHALL be provided (prefix matching).
5. Per-source ordering SHALL be preserved for emitted events.

### Requirement A5: Debug Session Lifecycle Through SQL/CDC

**User Story:** As a system architect, I want debug session state to flow through SQL/CDC so all
nodes converge without ad-hoc replication paths.

#### Acceptance Criteria

1. Active debug session state SHALL be represented in system metadata accessible via SQL.
2. Session create/update/detach SHALL flow through SQL mutation path and CDC propagation.
3. No direct inter-node debug-state channel SHALL be introduced outside existing infrastructure.
4. Session state model SHALL support at minimum:
   - session ID
   - target service_definition_id
   - optional lineage scope
   - required capabilities
   - state
   - timestamps
5. Session state ownership SHALL align with existing WASM operation lifecycle conventions;
   if a new table is used, ownership boundaries SHALL be explicit and non-overlapping.

### Requirement A6: Service and Callback Integration Semantics

**User Story:** As a developer, I want trace behavior to work across both service handlers and
partition callbacks with correct ownership and no duplicate runtime paths.

#### Acceptance Criteria

1. `WasmExecutor` integration SHALL preserve existing invocation contract and add optional
   trace instrumentation via options/context, not a second execution pipeline.
2. `CallbackExecutionHost` integration SHALL resolve session state per execution scope and forward
   trace context through existing callback driver invocation options.
3. `WasmComponentCallbackDriver` SHALL propagate relevant execution options needed for tracing
   (rather than silently dropping them).
4. No fallback or parallel callback invocation path SHALL be introduced.

### Requirement A7: Inactive Overhead Budget

**User Story:** As an operator, I want debug tracing to impose negligible overhead when disabled.

#### Acceptance Criteria

1. Inactive path SHALL perform at most a cheap gate check and return.
2. Inactive path SHALL NOT allocate Trace_Event objects.
3. Collector path SHALL do no work when no subscribers are connected, beyond minimal guard checks.
4. Track A SHALL include benchmark-style tests or assertions to prevent accidental inactive-path
   regressions.

### Requirement A8: Harness and Admin UI Support

**User Story:** As a test/harness user, I want to run scenarios and inspect correlated debugging
traces in the same workflow.

#### Acceptance Criteria

1. Distributed test harness SHALL support enabling debug session(s) for a run.
2. Harness run artifacts SHALL include trace export data (for playback and diagnosis).
3. Admin test UI SHALL provide a trace stream view with filters for lineage, node, and level.
4. UI extensions SHALL reuse existing dashboard/service routes and ownership.

### Requirement A9: Track A Test Coverage

**User Story:** As a maintainer, I want deterministic tests that lock in Track A behavior.

#### Acceptance Criteria

1. Unit tests SHALL cover trace level validation, inactive gating, and event envelope correctness.
2. Integration tests SHALL cover multi-node lineage-correlated trace flow through admin ingress.
3. Property tests (where used) SHALL follow project limits (`numRuns: 10`) and not be marked
   optional for core acceptance criteria.
4. Tests SHALL verify no parallel ownership violations (single ingress path, SQL/CDC state path).

### Requirement A10: Explicit Track Boundary Contract

**User Story:** As a planner, I want clear boundaries so Track A delivery is shippable and Track B
work starts from explicit prerequisites.

#### Acceptance Criteria

1. Track A SHALL ship without partial placeholder DAP/DWARF/snapshot logic.
2. Track B work SHALL be tracked only through the dedicated runtime-foundation spec.
3. Track A docs SHALL cross-reference Track B docs and state dependency order explicitly.
