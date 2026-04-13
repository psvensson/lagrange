# Implementation Plan: WASM Debug Runtime Foundation (Track B)

## Overview

This plan delivers the runtime prerequisites and features for:
1. DWARF source-level debugging
2. DAP stepping and variable inspection
3. Distributed debug handoff
4. Snapshot capture and replay

This plan starts only after Track A completion.

## Phase B0: Runtime Adapter Foundation

- [x] B0.1 Define runtime adapter contract
  - [x] B0.1.1 Create `src/debug-runtime/wasm-runtime-adapter.js` interface and error constants
  - [x] B0.1.2 Define typed request/response shapes for instantiate/execute/suspend/inspect
  - [x] B0.1.3 Add unit tests for contract guard behavior

- [x] B0.2 Implement initial runtime adapter backend
  - [x] B0.2.1 Add concrete backend implementation
  - [x] B0.2.2 Add timeout and cancellation integration
  - [x] B0.2.3 Add lifecycle tests (create/execute/destroy)

- [x] B0.3 Add HostImportRegistry
  - [x] B0.3.1 Create `src/debug-runtime/host-import-registry.js`
  - [x] B0.3.2 Implement capability/session-gated import assembly
  - [x] B0.3.3 Add tests for gated debug import presence

- [x] B0.4 Add migration compatibility tests
  - [x] B0.4.1 Service path parity tests against current behavior
  - [x] B0.4.2 Callback path parity tests against current behavior

## Phase B1: Service Execution Migration

- [x] B1.1 Route WasmExecutor through runtime adapter
  - [x] B1.1.1 Update `src/wasm-service/wasm-executor.js` orchestration path
  - [x] B1.1.2 Preserve resource budget checks
  - [x] B1.1.3 Preserve error semantics where required

- [x] B1.2 Update module validation for runtime-instantiated exports
  - [x] B1.2.1 Integrate runtime-instantiated export verification
  - [x] B1.2.2 Update manifest runtime validator tests

- [x] B1.3 Remove permanent direct export invocation path
  - [x] B1.3.1 Finalize single execution ownership
  - [x] B1.3.2 Add regression test preventing path reintroduction

## Phase B2: Callback Execution Migration

- [x] B2.1 Integrate runtime adapter in callback WASM path
  - [x] B2.1.1 Update `WasmComponentCallbackDriver` to pass full execution/debug scope
  - [x] B2.1.2 Ensure callback context compatibility (`ctx.call`, lookup, emit, broadcast)

- [x] B2.2 Integrate stage-aware debug metadata
  - [x] B2.2.1 Ensure lineage/stage/partition metadata reaches runtime adapter
  - [x] B2.2.2 Add stage migration tests with multiple batches and retries

- [x] B2.3 Remove dropped-option behavior
  - [x] B2.3.1 Add tests that fail if callback options are ignored in wasm path

## Phase B3: DWARF Metadata and Breakpoint Engine

- [x] B3.1 Add debug artifact metadata support
  - [x] B3.1.1 Extend manifest/runtime metadata schema for DWARF declaration
  - [x] B3.1.2 Add policy validation hooks for debug artifact availability
  - [x] B3.1.3 Add publish validation tests

- [x] B3.2 Build DWARF index pipeline
  - [x] B3.2.1 Add parser integration module
  - [x] B3.2.2 Build source<->offset and symbol indexes
  - [x] B3.2.3 Add cache and eviction policy
  - [x] B3.2.4 Add unit/property tests for mapping invariants (`numRuns: 10`)

- [x] B3.3 Implement BreakpointManager
  - [x] B3.3.1 Session-scoped breakpoint storage
  - [x] B3.3.2 Offset resolution and hit detection
  - [x] B3.3.3 Step control primitives (continue/next/stepIn/stepOut)
  - [x] B3.3.4 Add integration tests for breakpoint lifecycle

- [x] B3.4 Implement RuntimeIntrospector
  - [x] B3.4.1 Stack frame enumeration API
  - [x] B3.4.2 Local variable mapping through DWARF
  - [x] B3.4.3 Bounded memory read API
  - [x] B3.4.4 Add safety/limit tests

## Phase B4: DAP Server

- [x] B4.1 Implement DAP transport and protocol framing
  - [x] B4.1.1 Create `src/debug-runtime/dap-server.js`
  - [x] B4.1.2 Implement initialize/launch/attach lifecycle

- [x] B4.2 Implement required DAP requests
  - [x] B4.2.1 `setBreakpoints`
  - [x] B4.2.2 `continue`, `next`, `stepIn`, `stepOut`
  - [x] B4.2.3 `threads`, `stackTrace`, `scopes`, `variables`

- [x] B4.3 Integrate DAP with runtime adapter and managers
  - [x] B4.3.1 Breakpoint control path
  - [x] B4.3.2 Pause/resume event flow
  - [x] B4.3.3 Inspect path through RuntimeIntrospector

- [x] B4.4 Add DAP integration tests
  - [x] B4.4.1 Single-node service handler debug session tests
  - [x] B4.4.2 Single-node callback stage debug session tests

## Phase B5: Distributed Debug Coordination

- [x] B5.1 Implement DebugCoordinator
  - [x] B5.1.1 Create `src/debug-runtime/debug-coordinator.js`
  - [x] B5.1.2 Track lineage stage endpoint transitions
  - [x] B5.1.3 Publish handoff notifications to subscribed clients

- [x] B5.2 Integrate coordinator with metadata ownership
  - [x] B5.2.1 Use CDC/system metadata for endpoint discovery
  - [x] B5.2.2 Add ordering/monotonicity guardrails for stage transitions

- [x] B5.3 Add multi-node integration tests
  - [x] B5.3.1 Verify auto-handoff across node boundaries
  - [x] B5.3.2 Verify no manual reconnect needed for continued stepping

## Phase B6: Snapshot Capture

- [x] B6.1 Implement SnapshotRecorder core
  - [x] B6.1.1 Capture input frames
  - [x] B6.1.2 Capture host-call ledger
  - [x] B6.1.3 Capture memory boundary snapshots

- [x] B6.2 Implement quota and safety controls
  - [x] B6.2.1 Max bytes per snapshot
  - [x] B6.2.2 Max frames/host calls per session
  - [x] B6.2.3 Time-bounded capture operations

- [x] B6.3 Implement serialization format
  - [x] B6.3.1 Versioned binary envelope
  - [x] B6.3.2 JSON manifest for artifact indexing
  - [x] B6.3.3 Round-trip tests

## Phase B7: Replay Runtime

- [x] B7.1 Implement replay runtime core
  - [x] B7.1.1 Load module + debug artifacts
  - [x] B7.1.2 Replay using host-call ledger

- [x] B7.2 Implement local replay DAP
  - [x] B7.2.1 Hook replay runtime to DAP server backend
  - [x] B7.2.2 Support breakpoint/step/inspect on replay timeline

- [x] B7.3 Determinism verification
  - [x] B7.3.1 Same snapshot replay equivalence tests
  - [x] B7.3.2 Drift diagnostics when replay diverges

## Phase B8: Metadata, Security, and Ingress Completion

- [x] B8.1 Finalize metadata table ownership
  - [x] B8.1.1 Add/adjust `debug_sessions`, `debug_breakpoints`, `debug_snapshots` schemas
  - [x] B8.1.2 Ensure SQL/CDC write/read path only

- [x] B8.2 Add authz and tenant isolation checks
  - [x] B8.2.1 Session attach authorization
  - [x] B8.2.2 Metadata read/write scope enforcement

- [x] B8.3 Extend admin ingress routes for DAP/debug APIs
  - [x] B8.3.1 Add route constants
  - [x] B8.3.2 Add route handlers within existing admin ownership
  - [x] B8.3.3 Add ingress integration tests

## Phase B9: End-to-End Validation and Hardening

- [x] B9.1 End-to-end distributed debug scenario
  - [x] B9.1.1 Breakpoint on service handler
  - [x] B9.1.2 Continue into callback chain with auto-handoff
  - [x] B9.1.3 Inspect variables across stages

- [x] B9.2 End-to-end snapshot/replay scenario
  - [x] B9.2.1 Capture from distributed run
  - [x] B9.2.2 Replay locally with DAP stepping
  - [x] B9.2.3 Verify determinism assertions

- [x] B9.3 Performance/regression checks
  - [x] B9.3.1 Inactive debug overhead regression tests
  - [x] B9.3.2 Snapshot overhead budget checks under load

- [x] B9.4 Documentation updates
  - [x] B9.4.1 Update architecture docs with final ownership and flow
  - [x] B9.4.2 Update user-facing debugging guide and operational runbooks

## Completion Criteria

Track B is complete when:
1. Runtime adapter is the single execution owner for debug-capable WASM execution.
2. DAP operations work for service and callback contexts with DWARF-backed mapping.
3. Distributed stage handoff is automatic and validated in multi-node tests.
4. Snapshot + replay supports deterministic debug workflows.
5. Metadata, transport, and authz follow existing ownership rules.
6. Full relevant test suites pass.
