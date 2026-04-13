# Implementation Plan: Unified SQL Runtime v0 on Replicated WASM Services

## Overview

This plan keeps completed groundwork, then tracks the remaining production
wiring required to reach the v0 runtime model defined in the updated
requirements and design documents.

Partition callback ownership and runtime integration changes are tracked in:
`.kiro/specs/sql-wasm-unified-engine/partition-callback-delta.md`.

Status-gate note: runtime ownership and dispatch completion claims in this plan
are governed by `.kiro/specs/runtime-ownership-closure/closure-matrix.md` and
`.kiro/specs/runtime-ownership-closure/completion-gates.md`.

## Completed Groundwork

- [x] A1. Unified SQL adapter contract and canonical `SqlRequest` model
  - _Requirements: 1.1, 1.2, 3.2_
- [x] A2. Strategy selector for broadcast/lookup/emit-shuffle choice
  - _Requirements: 6.1, 6.2, 6.3_
- [x] A3. Primitive modules (`lookup`, `emit`, `broadcast`) with validation and guardrails
  - _Requirements: 6.1, 6.2, 6.3, 6.4_
- [x] A4. Stage callback executor primitives (batch invocation, cancellation, lineage/dedupe helpers)
  - _Requirements: 5.2, 10.2, 10.3_
- [x] A5. WASM manifest/dependency/capability model groundwork
  - _Requirements: 12.1, 12.2, 12.3_

## Open v0 Completion Tasks

- [x] 1. Add runtime API entrypoint
  - [x] 1.1 Implement `runtime.run(async (ctx) => { ... }, opts?)` with session, snapshot, and default budget injection
    - _Requirements: 4.1, 4.2_
  - [x] 1.2 Add runtime API module exports and docs for the v0 surface
    - _Requirements: 4.1, 13.5_

- [x] 2. Implement unified `ctx.call` runtime behavior
  - [x] 2.1 Implement Iterator_Mode for `ctx.call(query, params?)`
    - _Requirements: 5.1_
  - [x] 2.2 Implement Stage_Mode for `ctx.call(query, params?, handler, opts?)`
    - _Requirements: 5.2, 5.5_
  - [x] 2.3 Accept plan-object queries in `ctx.call` (`reduceByKey`, `useBroadcast`)
    - _Requirements: 5.3, 5.4_

- [x] 3. Wire SqlCore request dispatch in production
  - [x] 3.1 Add `SqlCore.executeRequest(SqlRequest)` with execution-mode dispatch
    - _Requirements: 1.1, 13.1_
  - [x] 3.2 Route Internal/Postgres/WASM adapters through `SqlCore.executeRequest`
    - _Requirements: 1.1, 3.2, 13.1_
  - [x] 3.3 Remove adapter paths that only attach callback metadata without runtime dispatch
    - _Requirements: 1.3, 13.1_

- [x] 4. Implement `ctx.out` final output primitive
  - [x] 4.1 Add `ctx.out(value, meta?)` on runtime context
    - _Requirements: 4.4_
  - [x] 4.2 Wire `ctx.out` to `Out_Stream`/result stream budget enforcement
    - _Requirements: 9.1, 9.4_
  - [x] 4.3 Add output telemetry (row/byte counts, budget events)
    - _Requirements: 13.3_

- [x] 5. Implement exchange manager and `exchangeBy` semantics
  - [x] 5.1 Add stage option handling for `exchangeBy` (`local` / `key`)
    - _Requirements: 7.1, 7.2_
  - [x] 5.2 Implement keyed exchange routing with at-least-once delivery
    - _Requirements: 7.2, 7.3_
  - [x] 5.3 Add dedupe-key support on emit metadata
    - _Requirements: 7.5, 10.3_
  - [x] 5.4 Document and enforce no-global-ordering semantics
    - _Requirements: 7.4_

- [x] 6. Implement nested call classifier and rejection policy
  - [x] 6.1 Add bounded/unbounded nested `ctx.call` classifier in stage handlers
    - _Requirements: 8.1, 8.2_
  - [x] 6.2 Reject unbounded nested calls by default in v0 with teachable errors
    - _Requirements: 8.3, 8.4_
  - [x] 6.3 Emit classifier decisions in diagnostics
    - _Requirements: 8.5, 13.3_

- [x] 7. Implement `reduceByKey` execution path
  - [x] 7.1 Add plan execution for `{kind: 'reduceByKey', ...}`
    - _Requirements: 11.1_
  - [x] 7.2 Deliver grouped batch shape `{key, records, continuation?}`
    - _Requirements: 11.2, 11.4_
  - [x] 7.3 Enforce reduce group/batch limits
    - _Requirements: 11.3, 9.1_
  - [x] 7.4 Add continuation-token handling tests
    - _Requirements: 11.4, 11.5_

- [x] 8. Extend budget/backpressure enforcement to v0 runtime limits
  - [x] 8.1 Add nested-call budgets (`maxNestedCalls`, `maxNestedKeys`, `maxNestedBytes`)
    - _Requirements: 9.1_
  - [x] 8.2 Add stage runtime controls (`maxOutBytes`, `maxInflight`, `maxWallMs`)
    - _Requirements: 9.1, 9.2_
  - [x] 8.3 Enforce emit backpressure behavior in runtime path (await/block/spill/fail)
    - _Requirements: 9.3, 9.4_

- [x] 9. Integrate failure/retry/idempotency end-to-end
  - [x] 9.1 Ensure retries are stage/batch scoped in production runtime
    - _Requirements: 10.1_
  - [x] 9.2 Wire lineage + dedupe across stage, emit, and out pipelines
    - _Requirements: 10.2, 10.3_
  - [x] 9.3 Ensure cancellation/timeout propagation covers all active runtime branches
    - _Requirements: 9.5, 10.5_

- [x] 10. Replace WASM executor stub with real module export invocation
  - [x] 10.1 Invoke actual loaded module `run_export` in `WasmExecutor`
    - _Requirements: 12.5_
  - [x] 10.2 Validate invocation signature at runtime boundary
    - _Requirements: 12.3_

- [x] 11. Testing and compatibility checkpoints
  - [x] 11.1 Add integration tests for `runtime.run` + real `ctx.call` modes
    - _Requirements: 4.1, 5.1, 5.2_
  - [x] 11.2 Add integration tests for `ctx.out`, `exchangeBy`, and `reduceByKey`
    - _Requirements: 4.4, 7.1, 11.1_
  - [x] 11.3 Add tests for unbounded nested-call rejection with expected error messages
    - _Requirements: 8.3, 8.4_
  - [x] 11.4 Add failure-path tests for retry duplicates and continuation flows
    - _Requirements: 10.3, 11.4_
  - [x] 11.5 Re-run relevant compatibility suites for internal SQL and protocol SQL behavior
    - _Requirements: 1.5, 13.4_

- [x] 12. Documentation and architecture updates
  - [x] 12.1 Update `architecture.md` with v0 runtime API ownership and execution-mode dispatch ownership
    - _Requirements: 13.5_
  - [x] 12.2 Update `README.md` with v0 runtime API and bounded nested-call guidance
    - _Requirements: 13.5_

- [x] 13. Partition_Callback runtime bridge delta
  - [x] 13.1 Add dedicated `partition_callback` dispatch in `SqlCore.executeRequest` (no alias to plain statement mode)
    - _Requirements: 13.1, 14.1_
  - [x] 13.2 Resolve target partitions from callback select query and construct per-partition batches via one planner path
    - _Requirements: 5.2, 14.2_
  - [x] 13.3 Route callback invocation through one `Callback_Execution_Host` contract (no parallel callback executor path)
    - _Requirements: 1.3, 14.2, 14.3_
  - [x] 13.4 Reuse runtime-kind selection ownership for callback invocation (`native_js`, `wasm_component`, gated `oci_container`)
    - _Requirements: 14.3_
  - [x] 13.5 Ensure callback contexts expose bounded primitives and nested-call guardrails consistent with stage runtime
    - _Requirements: 4.5, 8.3, 14.4_
  - [x] 13.6 Apply uniform budget/cancellation/lineage/dedupe/telemetry enforcement to partition callback path
    - _Requirements: 9.1, 9.5, 10.3, 13.3, 14.5_
  - [x] 13.7 Add end-to-end integration tests for multi-partition callback execution, retries, and failure contracts
    - _Requirements: 10.1, 13.4, 14.5_
  - [x] 13.8 Update docs to show `partition_callback` as first-class runtime execution mode in v0 ownership model
    - _Requirements: 13.5, 14.1_

## Notes

- No second SQL planner/executor path may be introduced.
- No second distributed context backend may be introduced.
- Runtime primitives must be production-wired; test-only composition is
  insufficient for completion.
