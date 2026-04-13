# Implementation Plan: Unified Service Runtime (Option 3 Target)

## Overview

This plan delivers the target architecture directly:

1. one runtime selection owner (`Runtime_Driver_Registry`)
2. one runtime lifecycle owner (`Service_Runtime_Lifecycle`)
3. one mutation path (SQL/CDC)

It enables current admin handlers to run as replicated `native_js` services,
keeps WASM behavior intact through a runtime driver, and introduces a gated
`oci_container` runway without creating parallel lifecycle systems.

Cross-spec dependency: partition callback runtime integration from
`.kiro/specs/sql-wasm-unified-engine/partition-callback-delta.md` MUST consume
the same runtime selection/lifecycle owners defined in this plan. No separate
callback runtime engine is allowed.

Status-gate note: completion claims in this plan are governed by
`.kiro/specs/runtime-ownership-closure/closure-matrix.md` and
`.kiro/specs/runtime-ownership-closure/completion-gates.md`.

## Workstreams and Tasks

- [x] 1. Runtime schema and constants foundation
  - [x] 1.1 Add runtime model constants (`runtime_kind`, descriptor field names, allowed kinds: `native_js`, `wasm_component`, `oci_container`)
    - _Requirements: 1.1, 5.1_
  - [x] 1.2 Extend `service_definitions` schema with runtime fields (`runtime_kind`, `runtime_ref`, `runtime_config`)
    - _Requirements: 5.1, 5.5_
  - [x] 1.3 Add deterministic legacy mapping from WASM-centric rows to runtime
    rows (read + write path compatibility)
    - _Requirements: 3.1, 5.2, 5.3_
  - [x] 1.4 Add validation helpers for runtime descriptor envelopes
    - _Requirements: 5.4, 9.2_
  - [x] 1.5 Add schema/model tests for backward-compatible serialization
    - _Requirements: 5.3, 5.5, 14.1_

- [x] 2. Runtime driver contract and registry
  - [x] 2.1 Introduce `Runtime_Driver` contract (`validateDescriptor`,
    `prepare`, `start`, `stop`, `health`)
    - _Requirements: 1.1, 4.4_
  - [x] 2.2 Implement `Runtime_Driver_Registry` as the single lookup owner keyed by `runtime_kind`
    - _Requirements: 1.2, 1.4_
  - [x] 2.3 Enforce unknown-kind failure behavior with typed errors
    - _Requirements: 1.4, 12.5_
  - [x] 2.4 Prevent runtime fallback selection in registry/lifecycle paths
    - _Requirements: 1.5, 6.5, 15.5_
  - [x] 2.5 Add unit tests for deterministic registry behavior
    - _Requirements: 1.2, 14.1, 14.2_

- [x] 3. Unified lifecycle owner
  - [x] 3.1 Introduce `Service_Runtime_Lifecycle` as the only runtime lifecycle orchestrator for replicated services
    - _Requirements: 1.3, 1.5_
  - [x] 3.2 Route prepare/start/stop/health through lifecycle -> registry ->
    driver contract
    - _Requirements: 1.2, 1.3, 4.5_
  - [x] 3.3 Keep endpoint registration in one write path; drivers provide only endpoint intent
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 3.4 Integrate operation journaling transitions for async lifecycle work (no ad-hoc driver mutation state)
    - _Requirements: 6.4, 11.1, 11.3_
  - [x] 3.5 Add lifecycle idempotency checks and tests
    - _Requirements: 11.2, 11.3, 14.4_

- [x] 4. Native JS runtime driver (admin serviceization)
  - [x] 4.1 Implement `Native_JS_Driver` to execute current admin handlers unchanged inside replicated service runtime
    - _Requirements: 2.1, 2.2_
  - [x] 4.2 Bind `sys-admin-meta` to `native_js` runtime descriptors
    - _Requirements: 2.2, 5.1_
  - [x] 4.3 Ensure `sys-wasm-meta` remains invokable from the same serviceized routing flow (direct routing or explicit delegation)
    - _Requirements: 2.3, 7.4_
  - [x] 4.4 Keep node-local admin APIs as compatibility adapters only
    - _Requirements: 2.4, 13.2_
  - [x] 4.5 Add reject mode for direct node-local mutation bypasses
    - _Requirements: 2.5, 6.3, 13.5_

- [x] 5. WASM runtime driver migration
  - [x] 5.1 Wrap current WASM lifecycle behavior in `Wasm_Component_Driver`
    without introducing a second lifecycle owner
    - _Requirements: 3.2, 3.3, 3.5_
  - [x] 5.2 Preserve manifest/dependency/capability/lock policy checks through
    existing validation and resolution owners
    - _Requirements: 3.2, 9.4_
  - [x] 5.3 Keep existing WASM APIs compatible during runtime abstraction
    transition
    - _Requirements: 3.4, 13.3_
  - [x] 5.4 Add contract conformance tests for WASM driver behavior
    - _Requirements: 14.2, 14.5_

- [x] 6. Container runtime runway (feature-gated)
  - [x] 6.1 Define `oci_container` descriptor model and digest-only validation
    - _Requirements: 4.1, 4.2, 9.3_
  - [x] 6.2 Implement `OCI_Container_Driver` behind feature gate
    - _Requirements: 4.3, 4.5_
  - [x] 6.3 Add registry/source policy checks and deny-by-default behavior
    - _Requirements: 9.2, 9.3, 9.5_
  - [x] 6.4 Add startup/shutdown/health contract tests for container driver
    semantics
    - _Requirements: 4.4, 14.2_
  - [x] 6.5 Ensure disabled gate produces explicit unsupported errors
    - _Requirements: 4.3, 12.5_

- [x] 7. Routing, availability, and adapter enforcement
  - [x] 7.1 Ensure command routing resolves service leader from `services`
    metadata for runtime-owned handlers
    - _Requirements: 7.1, 7.5_
  - [x] 7.2 Return explicit unavailable errors for missing/unroutable leaders
    - _Requirements: 7.2, 12.5_
  - [x] 7.3 Preserve trace/request identity across adapter -> router -> service
    paths
    - _Requirements: 7.3, 12.3_
  - [x] 7.4 Keep fixed node-level administrative endpoint as adapter ingress
    only; no node-local mutation ownership
    - _Requirements: 8.4, 13.2_
  - [x] 7.5 Add integration tests for deterministic adapter behavior across
    nodes
    - _Requirements: 7.5, 14.3_

- [x] 8. Mutation path and operation integrity
  - [x] 8.1 Enforce SQL/CDC-only metadata mutations for all runtime/service
    lifecycle commands
    - _Requirements: 6.1, 6.2_
  - [x] 8.2 Ensure driver code cannot directly write system metadata
    - _Requirements: 6.2, 6.3_
  - [x] 8.3 Keep idempotency-key semantics for mutating runtime commands
    - _Requirements: 11.2, 11.5_
  - [x] 8.4 Keep operation stream/event contracts for async lifecycle commands
    - _Requirements: 11.4, 12.1_
  - [x] 8.5 Add tests for monotonic operation state transitions
    - _Requirements: 11.3, 14.4_

- [x] 9. Security, policy, and resource controls
  - [x] 9.1 Apply shared authn/authz checks to all management commands
    independent of runtime kind
    - _Requirements: 9.1, 9.5_
  - [x] 9.2 Enforce runtime-specific policy gates prior to activation
    - _Requirements: 9.2, 9.4_
  - [x] 9.3 Add normalized runtime resource telemetry dimensions
    (`runtime_kind`, service profile, operation id)
    - _Requirements: 10.2, 12.2_
  - [x] 9.4 Enforce resource budget failures with typed over-budget errors
    - _Requirements: 10.1, 10.3_
  - [x] 9.5 Add policy + budget tests for fail-closed behavior
    - _Requirements: 9.5, 10.3, 14.2_

- [x] 10. Observability and diagnostics
  - [x] 10.1 Emit command metrics across runtime kinds (action, latency,
    success, error)
    - _Requirements: 12.1, 12.2_
  - [x] 10.2 Add logs/traces with runtime kind, service id, and operation id
    dimensions
    - _Requirements: 12.3, 12.4_
  - [x] 10.3 Surface runtime selection decisions in diagnostics
    - _Requirements: 12.5_
  - [x] 10.4 Add adapter-to-service trace continuity tests
    - _Requirements: 12.3, 14.3_

- [x] 11. Migration, rollout, and deprecation
  - [x] 11.1 Roll out in `observe` mode first (warn on bypass paths, no hard
    reject yet)
    - _Requirements: 13.1, 13.5_
  - [x] 11.2 Promote to `enforce` mode (reject direct node-local mutation
    ownership paths)
    - _Requirements: 13.1, 13.5_
  - [x] 11.3 Preserve CLI/API compatibility envelopes during transition
    - _Requirements: 13.2, 13.3_
  - [x] 11.4 Document rollback procedure and recovery checkpoints
    - _Requirements: 13.4_
  - [x] 11.5 Remove deprecated bypass paths after enforcement stabilization
    - _Requirements: 13.5, 15.5_

- [x] 12. Documentation and architecture finalization
  - [x] 12.1 Update `architecture.md` with runtime abstraction ownership model
    and data flow
    - _Requirements: 15.1_
  - [x] 12.2 Document runtime kind semantics and descriptor examples
    (`native_js`, `wasm_component`, `oci_container`)
    - _Requirements: 15.3, 15.4_
  - [x] 12.3 Document fixed admin adapter endpoint role vs replicated service
    mutation ownership
    - _Requirements: 8.4, 15.2_
  - [x] 12.4 Document anti-pattern bans:
    parallel lifecycle systems, fallback runtime selection, adapter mutation
    ownership, direct driver metadata writes
    - _Requirements: 15.5_
  - [x] 12.5 Update user/admin docs to reflect the unified runtime model and
    migration posture
    - _Requirements: 15.2, 15.3_

- [x] 13. Cross-spec partition callback runtime integration
  - [x] 13.1 Define callback-host runtime invocation contract that resolves
    runtime kind through `Runtime_Driver_Registry` ownership
    - _Requirements: 1.2, 1.4, 15.5_
  - [x] 13.2 Route callback runtime lifecycle touchpoints through
    `Service_Runtime_Lifecycle` semantics (no parallel lifecycle owner)
    - _Requirements: 1.3, 1.5, 3.5_
  - [x] 13.3 Enforce fail-closed behavior for unknown/unsupported callback
    runtime kinds with typed errors and no fallback execution path
    - _Requirements: 1.4, 6.5, 12.5_
  - [x] 13.4 Add integration tests proving `partition_callback` execution uses
    unified runtime ownership for `native_js`/`wasm_component` and gated
    `oci_container` behavior
    - _Requirements: 4.3, 14.2, 14.3_
  - [x] 13.5 Add architecture/user-doc cross-links so callback execution
    ownership is documented in both runtime and SQL runtime specs
    - _Requirements: 15.1, 15.3, 15.5_

## Verification Checkpoints

- [x] V1. Unit checkpoint
  - Driver registry tests, descriptor validation tests, and mapping tests pass
  - _Requirements: 14.1, 14.2_

- [x] V2. Integration checkpoint
  - Admin adapter -> replicated service routing, operation lifecycle, and
    idempotency tests pass
  - _Requirements: 14.3, 14.4_

- [x] V3. Compatibility checkpoint
  - Existing WASM flows and CLI compatibility tests pass with runtime
    abstraction enabled
  - _Requirements: 14.5, 13.2, 13.3_

- [x] V4. Documentation checkpoint
  - Architecture and user/admin docs reflect final ownership and migration
    model
  - _Requirements: 15.1, 15.2, 15.3_

- [x] V5. Cross-spec callback ownership checkpoint
  - `partition_callback` execution routes through unified runtime ownership
    (`Runtime_Driver_Registry` + `Service_Runtime_Lifecycle`) with no fallback
    callback engine
  - _Requirements: 1.2, 1.3, 1.5, 14.3, 15.5_

## Non-Negotiable Guardrails

1. No parallel lifecycle orchestration by runtime kind.
2. No runtime fallback selection on driver resolution failures.
3. No node-local adapter mutation ownership after enforcement phase.
4. No driver-owned direct system metadata writes.
