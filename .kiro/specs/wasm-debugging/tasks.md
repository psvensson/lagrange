# Implementation Plan: WASM Debugging

## Overview

Implementation follows the three-phase approach: Phase 1 (Structured Tracing) delivers immediate value, Phase 2 (DAP Debugging) adds source-level debugging, Phase 3 (Snapshot + Replay) adds post-hoc debugging. Each phase builds on the previous. All code follows Google JS style, 2-space indent, single quotes, semicolons, constants in dedicated files, no magic strings/numbers.

## Tasks

- [ ] 1. Create debug constants and capability integration
  - [ ] 1.1 Create `src/debug/debug-constants.js` with all debug-related constants
    - Define `DEBUG_CAPABILITY` (`debug.trace`, `debug.breakpoint`, `debug.snapshot`)
    - Define `DEBUG_TRACE_LEVEL` and `DEBUG_TRACE_LEVEL_SET`
    - Define `DEBUG_SESSION_STATE`, `DEBUG_CHANNEL_STATE`
    - Define `DEBUG_SUBSYSTEM`, `DEBUG_ERROR_MSG`, `DEBUG_LOG_MSG`
    - Define `TRACE_EVENT_FIELD`, `DEBUG_CHANNEL_PORT_DEFAULT`, `DEBUG_SNAPSHOT_MAX_MEMORY_BYTES`
    - All values frozen, no magic strings or numbers
    - _Requirements: 1.5_

  - [ ]* 1.2 Write property test for debug capability policy enforcement
    - **Property 1: Debug capability policy enforcement**
    - Generate random manifests with/without debug capabilities and random policies
    - Verify `enforceCapabilityPolicy` allows capability iff it appears in both manifest and allowlist
    - Reuse existing `enforceCapabilityPolicy` from `src/wasm-service/capability-policy.js`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [ ]* 1.3 Write property test for debug import injection gating
    - **Property 16: Debug import injection gating**
    - Generate random boolean pairs (capability declared, session active)
    - Verify import injection decision matches `declared AND active`
    - **Validates: Requirement 9.3**

- [ ] 2. Implement Debug_Trace_Host (Phase 1 core)
  - [ ] 2.1 Create `src/debug/debug-trace-host.js`
    - Implement `DebugTraceHost` class with constructor accepting `debugSession`, `lineageTracker`, `stageIndex`, `partitionId`, `nodeId`, `serviceDefinitionId`, `replicaId`
    - Implement `trace(level, message, context)` method
    - Fast path: return immediately when `debugSession` is null or inactive (zero alloc)
    - Validate level against `DEBUG_TRACE_LEVEL_SET`, throw `DEBUG_ERROR_MSG.INVALID_TRACE_LEVEL` on invalid
    - Build `Trace_Event` object using `TRACE_EVENT_FIELD` constants
    - Attach `lineageId` from `LineageTracker.generateLineageId()` and `stageIndex`
    - Forward event via `debugSession.emitTrace()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 2.2 Write property tests for Debug_Trace_Host
    - **Property 2: Trace event field completeness**
    - Generate random valid levels, messages, and context objects with active mock session
    - Verify resulting Trace_Event contains all required fields with correct values
    - **Validates: Requirements 2.1, 2.3**

  - [ ]* 2.3 Write property test for trace level validation
    - **Property 3: Trace level validation**
    - Generate random strings, call `trace()`, verify success iff string is in `DEBUG_TRACE_LEVEL_SET`
    - **Validates: Requirements 2.4, 2.5**

  - [ ]* 2.4 Write property test for no-session trace discard
    - **Property 4: No-session trace discard**
    - Generate random trace calls with null/inactive session, verify zero events emitted
    - **Validates: Requirements 2.2, 9.4**

- [ ] 3. Implement Trace_Collector (Phase 1 forwarding)
  - [ ] 3.1 Create `src/debug/trace-collector.js`
    - Implement `TraceCollector` class with per-node singleton pattern
    - `emit(traceEvent)` — forward to connected channels, discard if none connected
    - `addChannel(channel)` / `removeChannel(channel)` — manage connected debug channels
    - Support lineage_id prefix filter per channel
    - Serialize Trace_Events to JSON for transmission
    - No buffering when no channels connected
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [ ] 3.2 Create `src/debug/debug-channel.js`
    - Implement `DebugChannel` class wrapping a WebSocket connection
    - Constructor accepts WebSocket and optional `lineageFilter` prefix
    - `send(traceEvent)` — serialize to JSON and send over WebSocket
    - `matchesFilter(traceEvent)` — check lineage_id prefix match
    - _Requirements: 3.4, 3.5_

  - [ ]* 3.3 Write property test for trace event ordering
    - **Property 5: Trace event ordering preservation**
    - Generate random event sequences from one replica, emit through collector to mock channel
    - Verify received order matches emission order
    - **Validates: Requirement 3.2**

  - [ ]* 3.4 Write property test for no-channel discard
    - **Property 6: No-channel discard without buffering**
    - Generate random event counts, emit with no channel, verify zero buffered
    - **Validates: Requirement 3.3**

  - [ ]* 3.5 Write property test for lineage filter forwarding
    - **Property 7: Lineage filter forwarding**
    - Generate random events with various lineage_ids and random prefix filters
    - Verify only matching events forwarded
    - **Validates: Requirement 3.5**

  - [ ]* 3.6 Write property test for trace event JSON round-trip
    - **Property 8: Trace event JSON round-trip**
    - Generate random Trace_Events, serialize to JSON, parse back, verify equivalence
    - **Validates: Requirement 3.6**

- [ ] 4. Implement Debug_Session lifecycle
  - [ ] 4.1 Create `src/debug/debug-session.js`
    - Implement `DebugSession` class with `sessionId`, `serviceDefinitionId`, `lineageId`, `requiredCapabilities`, `traceCollector`
    - `isActive()` — fast boolean check
    - `emitTrace(traceEvent)` — forward to `traceCollector.emit()`
    - `attach(executor)` — set debug hooks on executor
    - `detach()` — remove all debug state, restore executor to pre-attachment state
    - `static validateCapabilities(manifest, requiredCapabilities)` — check all required capabilities are declared, throw `DEBUG_ERROR_MSG.SESSION_CAPABILITY_REQUIRED` if not
    - State transitions: ACTIVE → DETACHING → DETACHED
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.2 Write property test for session attach/detach round-trip
    - **Property 9: Session attach/detach round-trip**
    - Create mock executors, attach session, then detach, verify executor state matches pre-attachment
    - **Validates: Requirement 4.3**

  - [ ]* 4.3 Write property test for session capability gating
    - **Property 10: Session capability gating**
    - Generate random sets of requested and declared capabilities
    - Verify session allowed iff every requested capability is declared
    - **Validates: Requirements 4.4, 4.5**

- [ ] 5. Checkpoint — Phase 1 core components
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Integrate debug hooks into WasmExecutor and CallbackExecutionHost
  - [ ] 6.1 Add debug session support to `WasmExecutor.execute()`
    - Add optional `debugSession` parameter to `execute()` method
    - When `debugSession` is active and module declares `debug.trace`: construct `DebugTraceHost` and inject as host import
    - When `debugSession` is null or inactive: zero changes to execution path
    - _Requirements: 9.1, 9.3, 2.1_

  - [ ] 6.2 Add debug session support to `CallbackExecutionHost._executeBatch()`
    - When a debug session is active for the current lineage_id: construct `DebugTraceHost` with batch partition context
    - Pass `DebugTraceHost` through to the runtime driver's `invokeCallback` options
    - When no debug session: zero changes to execution path
    - _Requirements: 9.2, 9.3, 2.1_

  - [ ] 6.3 Wire TraceCollector into NodeService
    - Create `TraceCollector` singleton during node initialization
    - Expose WebSocket endpoint for debug channel connections
    - Pass `TraceCollector` reference to components that create `DebugSession` instances
    - _Requirements: 3.1, 3.4_

- [ ] 7. Implement debug session persistence via SQL/CDC
  - [ ] 7.1 Add `debug_sessions` system table schema
    - Define table schema with columns: `session_id`, `service_definition_id`, `lineage_id`, `capabilities`, `state`, `node_id`, `replica_id`, `created_at`, `updated_at`
    - Register in system table definitions
    - Session create/destroy writes go through SQL/CDC path
    - _Requirements: 10.1, 10.2, 10.3_

- [ ] 8. Checkpoint — Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Phase 1 delivers: structured tracing from WASM modules, correlated by lineage_id, forwarded to VS Code extension over WebSocket debug channel.

- [ ] 9. Implement DAP_Server (Phase 2)
  - [ ] 9.1 Create `src/debug/dap-server.js`
    - Implement `DapServer` class with DAP protocol message handling
    - Implement handlers: `setBreakpoints`, `continue`, `next`, `stepIn`, `stepOut`, `threads`, `stackTrace`, `scopes`, `variables`
    - `sourceToOffset(source, line, column)` — translate source location to WASM instruction offset using DWARF info
    - `suspendExecution(instructionOffset)` — suspend WASM via fuel metering
    - `inspectMemory(address, length)` / `inspectLocals(frameIndex)` — read WASM linear memory and locals
    - Return `DEBUG_ERROR_MSG.DWARF_INFO_REQUIRED` when DWARF info is unavailable
    - `start(port)` / `stop()` lifecycle methods
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 9.2 Write property test for DWARF source-to-offset mapping
    - **Property 11: DWARF source-to-offset mapping**
    - Generate valid source locations from mock DWARF info, verify round-trip mapping
    - **Validates: Requirement 5.3**

- [ ] 10. Implement Debug_Coordinator (Phase 2)
  - [ ] 10.1 Create `src/debug/debug-coordinator.js`
    - Implement `DebugCoordinator` class using `systemTableCache` and `messageRouter`
    - `trackStageTransition(lineageId, stageId, replicaId, nodeId)` — update tracking state
    - `getCurrentEndpoint(lineageId)` — return current DAP server endpoint
    - `notifyStageTransition(lineageId, newEndpoint)` — notify VS Code extension
    - Use existing CDC events and services table for replica discovery
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 10.2 Write property test for stage transition tracking
    - **Property 12: Stage transition tracking**
    - Generate random stage transition sequences, verify coordinator always reports latest replica
    - Verify notifications contain correct endpoint info
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [ ] 11. Checkpoint — Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Phase 2 delivers: DAP-based source-level debugging with breakpoints, stepping, variable inspection, and automatic distributed debug following across nodes.

- [ ] 12. Implement Snapshot_Capturer (Phase 3)
  - [ ] 12.1 Create `src/debug/snapshot-capturer.js`
    - Implement `SnapshotCapturer` class with `lineageId`, `stageId`, `maxMemoryBytes`
    - `captureInputs(partitionId, rows, context)` — record function inputs
    - `captureHostCallResult(callType, args, result)` — intercept and record host call
    - `captureMemorySnapshot(wasmInstance)` — capture linear memory (skip if exceeds max)
    - `finalize()` — produce complete `Execution_Snapshot` object
    - Binary serialization/deserialization for transfer
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 12.2 Write property test for snapshot completeness
    - **Property 13: Snapshot completeness**
    - Generate random executions with varying stage/host-call counts
    - Verify snapshot contains correct frame count, host call records, and metadata
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

  - [ ]* 12.3 Write property test for snapshot serialization round-trip
    - **Property 14: Snapshot serialization round-trip**
    - Generate random Execution_Snapshots, serialize to binary, deserialize, verify equivalence
    - **Validates: Requirement 7.5**

  - [ ]* 12.4 Write property test for snapshot determinism
    - **Property 15: Snapshot replay determinism**
    - Serialize same snapshot twice, verify byte-identical output
    - **Validates: Requirement 8.4**

- [ ] 13. Integrate snapshot capture into WasmExecutor and CallbackExecutionHost
  - [ ] 13.1 Add snapshot capture hooks to `WasmExecutor.execute()`
    - When debug session has `debug.snapshot` capability active: wrap host calls with `SnapshotCapturer`
    - Capture memory snapshots at execution boundaries
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 13.2 Add snapshot capture hooks to `CallbackExecutionHost._executeBatch()`
    - When debug session has `debug.snapshot` capability active: capture per-batch inputs and host calls
    - Capture memory snapshots at stage boundaries
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 14. Final checkpoint — All phases complete
  - Ensure all tests pass, ask the user if questions arise.
  - Full feature delivers: structured tracing (Phase 1), DAP source-level debugging with distributed coordination (Phase 2), and snapshot + replay debugging (Phase 3).

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check with `{numRuns: 10}`
- Unit tests validate specific examples and edge cases
- Phase 1 is self-contained and delivers immediate value without Phases 2 and 3
- All constants in `src/debug/debug-constants.js` — no magic strings or numbers
- Existing `enforceCapabilityPolicy` in `src/wasm-service/capability-policy.js` handles debug capabilities without modification — the new capability strings are just new values
