# Implementation Plan: WASM Debugging (Track A Runtime-Aligned)

## Overview

This plan delivers Track A only: structured distributed tracing with SQL/CDC-backed debug
sessions, current-runtime integration, and harness/UI support.

Track B work is fully planned in:
- `.kiro/specs/archived/wasm-debug-runtime-foundation/tasks.md`

No Track B runtime internals are partially implemented in Track A.

## Tasks

- [x] 1. Create debug constants and shared contracts
  - [x] 1.1 Add `src/debug/debug-constants.js`
    - Define `DEBUG_CAPABILITY` (`debug.trace`, `debug.breakpoint`, `debug.snapshot`)
    - Define `DEBUG_TRACE_LEVEL`, `DEBUG_TRACE_LEVEL_SET`
    - Define trace envelope field constants and debug error/log constants
    - No magic literals in debug implementation files
  - [x] 1.2 Add unit tests for constants and level-set validity

- [x] 2. Implement DebugSessionResolver
  - [x] 2.1 Add `src/debug/debug-session-resolver.js`
    - Resolve active trace session for service scope
    - Resolve active trace session for callback scope (`lineageId`, `stageId`, `serviceDefinitionId`)
    - Provide cheap `isTraceActive(...)` gate method
  - [x] 2.2 Add tests for resolver behavior with active/inactive/stale session metadata

- [x] 3. Implement DebugEmitter
  - [x] 3.1 Add `src/debug/debug-emitter.js`
    - Validate level
    - Fast-return when inactive
    - Build `Trace_Event` envelope
    - Forward to collector
  - [x] 3.2 Add unit tests:
    - invalid level rejection
    - no allocation path when inactive (assert no `emit` call + no envelope build)
    - envelope completeness and field correctness

- [x] 4. Implement TraceCollector
  - [x] 4.1 Add `src/debug/trace-collector.js`
    - subscriber registration/unregistration
    - lineage prefix filtering
    - JSON serialization and forwarding
    - drop/no-buffer behavior with zero subscribers
  - [x] 4.2 Add tests:
    - ordering preservation per source
    - lineage filter correctness
    - drop behavior with no subscribers

- [x] 5. Extend admin ingress with debug trace route ownership
  - [x] 5.1 Add route constants in `src/admin/admin-constants.js`
    - `ADMIN_ROUTE.DEBUG_TRACE_STREAM`
  - [x] 5.2 Extend `src/admin/admin-websocket-api.js`
    - Add debug trace WebSocket route under existing admin server
    - Translate connection filter params to collector subscription filters
    - Ensure disconnect cleanup
  - [x] 5.3 Add integration tests for debug trace stream route

- [x] 6. Integrate tracing into WasmExecutor path
  - [x] 6.1 Extend `src/wasm-service/wasm-executor.js` invocation options
    - Accept optional debug scope/options while preserving current signature compatibility
    - Resolve session via resolver
    - Attach bounded trace API to execution context/options when active
  - [x] 6.2 Add tests for active/inactive behavior and unchanged normal path

- [x] 7. Integrate tracing into callback execution path
  - [x] 7.1 Extend `src/query/callback-execution-host.js`
    - Resolve debug scope from lineage/stage/partition context
    - Pass trace helper through runtime driver invocation options
  - [x] 7.2 Update `src/query/callback-runtime-driver-registry.js`
    - Ensure `WasmComponentCallbackDriver` preserves relevant options instead of ignoring them
  - [x] 7.3 Add integration tests for lineage-correlated callback traces

- [x] 8. Implement SQL/CDC-backed debug session state
  - [x] 8.1 Finalize metadata ownership model
    - Chosen model: dedicated `debug_sessions` table as single owner
    - Codify single owner in design and code comments
  - [x] 8.2 Implement create/update/detach session mutation commands through SQL path
  - [x] 8.3 Wire CDC updates into resolver read path
  - [x] 8.4 Add tests verifying no direct inter-node state channel is used

- [x] 9. Harness integration
  - [x] 9.1 Extend distributed run configuration to request trace session enablement
  - [x] 9.2 Persist trace artifacts in run output
  - [x] 9.3 Add scenario assertions for trace presence and lineage correlation

- [x] 10. Admin UI integration
  - [x] 10.1 Add trace panel to existing dashboard UI
    - stream connect/disconnect
    - lineage/node/level filters
    - scroll-safe rendering of large event sets
  - [x] 10.2 Add UI tests (or deterministic integration checks) for stream rendering and filters

- [x] 11. Track A correctness and performance tests
  - [x] 11.1 Add inactive-path regression test for negligible overhead behavior
  - [x] 11.2 Add multi-node integration test for cross-node lineage trace collection
  - [x] 11.3 Add property tests where appropriate (`numRuns: 10`) for envelope/filter invariants

- [x] 12. Documentation and checkpoint
  - [x] 12.1 Update architecture docs for new debug components and ownership boundaries
  - [x] 12.2 Mark this Track A spec complete only when all tasks above are complete
  - [x] 12.3 Confirm Track B remains in dedicated runtime foundation spec and is not partially
    implemented in Track A

## Completion Criteria

Track A is complete when:
1. Trace events stream from both service and callback paths with lineage-aware filtering.
2. Session state is SQL/CDC-propagated with a single owner.
3. Admin ingress route extension is the only external debug stream transport.
4. Harness/UI support trace workflows end-to-end.
5. All related unit/integration/property tests pass.
