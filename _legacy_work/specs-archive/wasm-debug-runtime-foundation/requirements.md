# Requirements Document: WASM Debug Runtime Foundation (Track B)

## Introduction

This spec defines **Track B**: the runtime foundation required for true source-level debugging
for WASM workloads, including:
1. DWARF-based source mapping
2. DAP stepping and variable inspection
3. Deterministic snapshot capture
4. Local replay debugging

Track B depends on Track A (`.kiro/specs/wasm-debugging/*`) being complete.

## Goals

1. Replace runtime assumptions that currently prevent low-level debugging.
2. Provide a single execution ownership model for service and callback WASM execution.
3. Deliver DAP-compatible debugging across distributed `ctx.call` stage transitions.
4. Provide deterministic snapshot + replay for post-hoc debugging.

## Non-Goals

1. Building a second parallel executor path that coexists indefinitely.
2. Introducing non-SQL/CDC ownership for distributed debug state.
3. Creating standalone transport infrastructure outside existing admin ingress ownership.

## Glossary

- **Wasm_Runtime_Adapter**: Component that owns WASM instantiation, import wiring, interruption,
  and runtime introspection APIs.
- **Debug_Import_Module**: Host import namespace exposing debug-aware host functions.
- **DWARF_Index**: Parsed mapping from source file/line/column to WASM code offsets and symbol
  metadata.
- **Breakpoint_Manager**: Runtime component that tracks breakpoints and interruption strategy.
- **Runtime_Introspector**: Component that reads stack frames, locals, and linear memory snapshots
  at suspend points.
- **DAP_Server**: Debug Adapter Protocol endpoint for a debug-attached runtime instance.
- **Debug_Coordinator**: Distributed coordinator for lineage-stage debug endpoint handoff.
- **Snapshot_Recorder**: Deterministic capture of inputs/host-call ledger/memory boundaries.
- **Replay_Runtime**: Local runtime that replays captured snapshots with identical host outcomes.

## Requirements

### Requirement B1: Unified Runtime Ownership Upgrade

**User Story:** As a platform maintainer, I want a single runtime owner that supports low-level
WASM debugging primitives, so source-level debug features are technically possible.

#### Acceptance Criteria

1. WASM execution SHALL be owned by a `Wasm_Runtime_Adapter` with explicit APIs for:
   - instantiate
   - execute
   - interrupt/suspend
   - inspect state
2. Service and callback WASM execution SHALL use the same runtime adapter contract.
3. Final architecture SHALL have one execution ownership path; no permanent parallel fallback path.
4. Module validation SHALL be run against actual runtime-instantiated exports and import contracts.

### Requirement B2: Host Import ABI for Runtime + Debug

**User Story:** As a runtime engineer, I want a formal host-import ABI so debug and non-debug host
calls are consistent and enforceable.

#### Acceptance Criteria

1. Host imports SHALL be declared by namespace/module constants, not literals.
2. `Debug_Import_Module` SHALL be injected only when capability + active session allow it.
3. Track B debug imports SHALL include at least breakpoint/trace/snapshot control hooks required by
   DAP and snapshot recorder.
4. Import validation SHALL fail closed when required imports are missing or mismatched.

### Requirement B3: Debug Artifact and DWARF Metadata Management

**User Story:** As a module publisher, I want debug metadata to be validated and addressable so
source maps and symbol inspection are reliable.

#### Acceptance Criteria

1. Module metadata SHALL support DWARF availability declaration (embedded or sidecar reference).
2. Validation pipeline SHALL verify debug artifact presence/format when `debug.breakpoint` or
   `debug.snapshot` is requested.
3. DWARF parse/index failures SHALL produce explicit rejection or explicit downgrade behavior,
   according to policy.
4. Artifact provenance SHALL flow through existing module metadata ownership and policy checks.

### Requirement B4: Breakpoint Control and Execution Suspension

**User Story:** As a debugger user, I want breakpoints and stepping controls to suspend execution
safely and deterministically.

#### Acceptance Criteria

1. Breakpoints SHALL be registered by source location and resolved to code offsets.
2. Runtime SHALL support suspension at/near target offsets through supported interruption strategy
   (fuel/epoch/trap-based approach selected by runtime adapter design).
3. Continue, next, step-in, and step-out SHALL be implemented for suspended threads/contexts.
4. Breakpoint and stepping operations SHALL be session-scoped and capability-gated.

### Requirement B5: Runtime Introspection for Variables and Memory

**User Story:** As a debugger user, I want to inspect variables and memory during a pause.

#### Acceptance Criteria

1. Runtime introspection SHALL provide stack frame enumeration at suspension point.
2. Runtime introspection SHALL expose local variable values mapped through DWARF metadata.
3. Runtime introspection SHALL provide bounded linear memory reads with strict limits.
4. Introspection errors SHALL be deterministic and surfaced via DAP error responses.

### Requirement B6: DAP Server Compliance

**User Story:** As a VS Code user, I want first-class DAP compatibility for standard debug
interactions.

#### Acceptance Criteria

1. DAP server SHALL implement at minimum:
   - initialize
   - setBreakpoints
   - continue
   - next
   - stepIn
   - stepOut
   - threads
   - stackTrace
   - scopes
   - variables
2. DAP responses SHALL include stable source/line mappings from DWARF index.
3. DAP server lifecycle SHALL bind to debug session lifecycle.
4. Authentication/authorization rules for debug attachment SHALL be enforced at ingress.

### Requirement B7: Distributed Debug Coordination

**User Story:** As a distributed debugger user, I want debugger attachment to follow execution
across callback stages automatically.

#### Acceptance Criteria

1. Coordinator SHALL track active stage endpoint by `lineageId` and `stageId`.
2. On stage transition, coordinator SHALL publish endpoint handoff notifications.
3. Endpoint discovery SHALL reuse existing system metadata + CDC ownership.
4. No ad-hoc replica-discovery channel SHALL be introduced.

### Requirement B8: Deterministic Snapshot Capture

**User Story:** As an incident investigator, I want deterministic capture so executions can be
replayed exactly.

#### Acceptance Criteria

1. Snapshot recorder SHALL capture per-stage inputs and execution metadata.
2. Snapshot recorder SHALL capture host-call ledger (arguments + returned values/errors).
3. Snapshot recorder SHALL capture memory boundary snapshots at defined checkpoints.
4. Snapshot serialization SHALL be stable and versioned.
5. Capture limits (size/count/time) SHALL be enforced to protect production systems.

### Requirement B9: Replay Runtime Determinism

**User Story:** As a developer, I want replay to behave identically to captured execution.

#### Acceptance Criteria

1. Replay runtime SHALL load module + debug metadata locally.
2. Replay host interactions SHALL be served from captured ledger, not live infrastructure.
3. DAP operations SHALL work over replay execution.
4. Replay determinism property SHALL be tested: same snapshot -> same trace and observable state.

### Requirement B10: SQL/CDC Ownership for Debug Metadata

**User Story:** As a system architect, I want debug control state and artifacts to follow the same
ownership pattern as other distributed metadata.

#### Acceptance Criteria

1. Session, breakpoint, and snapshot metadata SHALL be persisted through SQL write path.
2. Node convergence for debug metadata SHALL rely on CDC.
3. Ownership boundaries for each table/state concern SHALL be explicit and singular.
4. Operation lifecycle SHALL reuse existing operation-management conventions where possible.

### Requirement B11: Security, Isolation, and Performance Guardrails

**User Story:** As an operator, I want debug features to be safe in multi-tenant production.

#### Acceptance Criteria

1. Debug attach SHALL require explicit authorization policy check.
2. Tenant/service boundary checks SHALL prevent cross-tenant debug attachment.
3. Snapshot and memory inspection SHALL enforce strict byte/time quotas.
4. Inactive debug path SHALL remain minimal-overhead and free of heavy instrumentation.

### Requirement B12: Verification Strategy

**User Story:** As a maintainer, I want robust tests that validate runtime correctness and prevent
regressions.

#### Acceptance Criteria

1. Unit tests SHALL cover runtime adapter, breakpoint resolution, and introspection contracts.
2. Integration tests SHALL cover DAP end-to-end for service and callback execution contexts.
3. Distributed integration tests SHALL cover stage handoff and coordinator correctness.
4. Determinism tests SHALL validate snapshot/replay invariants.
5. Property tests (where used) SHALL obey project test limits and be mandatory for key invariants.
