# Implementation Plan: Runtime Ownership Closure

## Overview

This plan closes the audit shortcoming set (`S1`..`S10`) by making runtime,
admin, SQL dispatch, and documentation ownership claims true in production.

This is a closure plan, not a greenfield feature plan. Each task must point to
observable elimination of a documented shortcoming.

## Workstreams and Tasks

- [x] 1. Canonical `service_definitions` contract alignment (S1)
  - [x] 1.1 Define one canonical service-definition column set and reuse it
    across schema, serializer, and command SQL generation.
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Add `service_profile` to schema contract where currently missing.
    - _Requirements: 1.2_
  - [x] 1.3 Align `handler_function_id` nullability with runtime-aware service
    definitions.
    - _Requirements: 1.3_
  - [x] 1.4 Add backward-compatible migration/backfill logic for existing rows.
    - _Requirements: 1.4, 11.3_
  - [x] 1.5 Add schema + mutation tests proving fresh bootstrap tables accept
    runtime-aware rows.
    - _Requirements: 1.5_

- [x] 2. Canonical SQL-engine runtime mapping (S8)
  - [x] 2.1 Introduce `SQL_ENGINE_RUNTIME_KIND` constant with canonical value
    `native_js`.
    - _Requirements: 2.1_
  - [x] 2.2 Replace conflicting SQL-engine runtime defaults in runtime mapping,
    factory logic, and architecture/docs references.
    - _Requirements: 2.2, 2.3_
  - [x] 2.3 Add parity tests for runtime inference/serialization constants.
    - _Requirements: 2.4, 2.5_

- [x] 3. Production execution-mode ownership closure (S2)
  - [x] 3.1 Implement `stage` dispatch path in `SqlCore.executeRequest`.
    - _Requirements: 3.1, 3.2_
  - [x] 3.2 Implement `plan` dispatch path in `SqlCore.executeRequest`.
    - _Requirements: 3.1, 3.2_
  - [x] 3.3 Remove "not wired" execution-mode behavior for stage/plan modes.
    - _Requirements: 3.2, 3.4_
  - [x] 3.4 Add integration coverage proving stage/plan are reached via
    production `executeRequest` dispatch.
    - _Requirements: 3.5_

- [x] 4. Admin ingress ownership closure (S3)
  - [x] 4.1 Wire `AdminWebSocketAPI` command routing through `AdminApiAdapter`
    as the primary ingress contract.
    - _Requirements: 4.2, 4.3_
  - [x] 4.2 Keep fixed ingress endpoint behavior on port `8081` while removing
    direct node-local mutation ownership paths.
    - _Requirements: 4.1, 4.3_
  - [x] 4.3 Validate guard-mode behavior (`observe`/`enforce`) for bypass paths.
    - _Requirements: 4.4_
  - [x] 4.4 Add deterministic multi-node adapter routing integration tests,
    including unavailable meta leader cases.
    - _Requirements: 4.5_

- [x] 5. Unified runtime lifecycle activation (S4)
  - [x] 5.1 Instantiate and wire `Runtime_Driver_Registry` and
    `Service_Runtime_Lifecycle` in live startup/runtime flows.
    - _Requirements: 5.1, 5.3_
  - [x] 5.2 Register runtime drivers in one startup-owned registration path.
    - _Requirements: 5.2_
  - [x] 5.3 Route runtime-aware service lifecycle operations through unified
    lifecycle owner only.
    - _Requirements: 5.3, 5.4_
  - [x] 5.4 Add startup-path integration tests for seed and joining nodes that
    prove unified lifecycle ownership is active.
    - _Requirements: 5.5_

- [x] 6. Partition callback runtime ownership unification (S5)
  - [x] 6.1 Replace parallel callback runtime selector ownership with unified
    runtime selector ownership.
    - _Requirements: 6.1, 6.2_
  - [x] 6.2 Keep `CallbackExecutionHost` as single callback invocation owner.
    - _Requirements: 6.3_
  - [x] 6.3 Enforce fail-closed typed errors for unknown callback runtime kinds.
    - _Requirements: 6.4_
  - [x] 6.4 Add integration tests for callback runtime selection across
    `native_js`, `wasm_component`, and gated `oci_container`.
    - _Requirements: 6.5_

- [x] 7. Explicit callback runtime descriptor propagation (S6)
  - [x] 7.1 Extend callback request contract with explicit runtime-kind intent.
    - _Requirements: 7.1_
  - [x] 7.2 Ensure `WasmCallAdapter` emits deterministic callback runtime intent
    (`wasm_component`) for WASM callback usage.
    - _Requirements: 7.2_
  - [x] 7.3 Remove implicit callback runtime fallback to `native_js`.
    - _Requirements: 7.1, 7.3_
  - [x] 7.4 Enforce SELECT-only validation for `partition_callback` statements
    before dispatch.
    - _Requirements: 7.4_
  - [x] 7.5 Add failure-path tests for descriptor omission/mismatch and invalid
    callback statement mode.
    - _Requirements: 7.5_

- [x] 8. Runtime descriptor validation enforcement (S7)
  - [x] 8.1 Integrate `runtime-descriptor-validator` into create/update service
    command mutation paths.
    - _Requirements: 8.1, 8.4_
  - [x] 8.2 Make service-definition validator runtime/profile-aware for handler
    existence rules.
    - _Requirements: 8.2_
  - [x] 8.3 Validate runtime descriptors before lifecycle activation begins.
    - _Requirements: 8.3_
  - [x] 8.4 Add fail-closed tests for invalid descriptor contracts at mutation
    and activation boundaries.
    - _Requirements: 8.5_

- [x] 9. Documentation truth alignment (S9)
  - [x] 9.1 Update `.kiro/steering/architecture.md` to explicitly label
    `Active` vs `Target` vs `Planned` behavior.
    - _Requirements: 9.1_
  - [x] 9.2 Update `README.md` execution-mode ownership statements to match
    active code behavior.
    - _Requirements: 9.2_
  - [x] 9.3 Update operator docs (`docs/admin-migration-guide.md`,
    `docs/wasm-services-user-guide.md`) to remove stale claims and align with
    runtime ownership.
    - _Requirements: 9.2, 9.3, 9.4_
  - [x] 9.4 Add cross-links between runtime, SQL, and admin docs for one
    coherent operator guidance path.
    - _Requirements: 9.4, 9.5_

- [x] 10. Completion governance and closure evidence (S10)
  - [x] 10.1 Add shortcoming closure matrix artifact mapping each `S#` to code,
    tests, and docs evidence.
    - _Requirements: 10.2, 10.5_
  - [x] 10.2 Define completion gate checklist requiring production-path proof,
    not unit-only proof.
    - _Requirements: 10.1, 10.3_
  - [x] 10.3 Update status claims in existing runtime specs to reference this
    closure workstream until closure evidence is complete.
    - _Requirements: 10.3_
  - [x] 10.4 Add targeted CI/test command list for closure checkpoints.
    - _Requirements: 10.4_

- [x] 11. Migration and rollback runbooks
  - [x] 11.1 Document phased rollout sequence for closure changes.
    - _Requirements: 11.1_
  - [x] 11.2 Document rollback triggers and safe rollback actions per phase.
    - _Requirements: 11.2, 11.3_
  - [x] 11.3 Add feature-gate behavior tables for `oci_container` and admin
    enforcement modes.
    - _Requirements: 11.4_
  - [x] 11.4 Add operational error-code catalog for closure-related failure
    modes.
    - _Requirements: 11.5_

## Verification Checkpoints

- [x] V1. Contract checkpoint
  - Canonical schema/model/command parity tests pass.
  - _Shortcomings: S1, S8_

- [x] V2. Dispatch checkpoint
  - Stage/plan/callback execution modes verified through production
    `SqlCore.executeRequest` path.
  - _Shortcomings: S2, S6_

- [x] V3. Runtime ownership checkpoint
  - Startup-wired lifecycle operations run through unified runtime ownership.
  - _Shortcomings: S4, S5, S7_

- [x] V4. Admin ownership checkpoint
  - Admin ingress operates as adapter-to-serviceized ownership path with
    deterministic failure behavior.
  - _Shortcomings: S3_

- [x] V5. Documentation parity checkpoint
  - Architecture/README/operator docs align with implementation and runtime
    mapping constants.
  - _Shortcomings: S8, S9_

- [x] V6. Governance closure checkpoint
  - Closure matrix complete for `S1`..`S10`; no open shortcoming marked closed
    without evidence.
  - _Shortcomings: S10_

## Non-Negotiable Guardrails

1. No parallel runtime selector owners.
2. No fallback execution-mode dispatch paths.
3. No node-local mutation ownership in admin ingress.
4. No runtime-driver direct system metadata writes.
5. No completion status without production-path evidence.
