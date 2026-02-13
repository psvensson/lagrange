# Implementation Plan: WASM/ADMIN Meta Services and Component Distribution

## Overview

This plan implements missing WASM artifact management and serviceizes admin
surfaces. Delivery is staged to preserve single-owner architecture and avoid
parallel mutation paths.

Status-gate note: completion claims for meta-service ownership and admin
serviceization in this plan are governed by
`.kiro/specs/runtime-ownership-closure/closure-matrix.md` and
`.kiro/specs/runtime-ownership-closure/completion-gates.md`.

## Tasks

- [x] 1. Introduce core constants and schemas
  - [x] 1.1 Add constants for package identity parsing
    (`namespace:name@version`), operation states, and route/action names
    - _Requirements: 2.1, 3.1, 8.1_
  - [x] 1.2 Add table constants and bootstrap schemas for: `module_manifests`, `package_registry_mappings`, `package_registry_overrides`, `module_dependency_locks`, `wasm_operations` (or finalized equivalents)
    - _Requirements: 5.2, 10.1, 10.2_
  - [x] 1.3 Add serializers/deserializers and validators for new row models
    - _Requirements: 3.2, 5.2, 10.4_
  - [x] 1.4 Add schema/model round-trip tests
    - _Requirements: 10.4, 13.4_

- [x] 2. Implement component package identity and source resolution
  - [x] 2.1 Implement package reference parser/validator for `namespace:name@version`
    - _Requirements: 3.1, 3.4_
  - [x] 2.2 Implement namespace registry mapping resolver
    - _Requirements: 4.1, 4.5_
  - [x] 2.3 Implement per-package override resolver
    - _Requirements: 4.2, 4.5_
  - [x] 2.4 Implement OCI-compatible source reference handling with digest pin
    enforcement
    - _Requirements: 4.3, 4.4_
  - [x] 2.5 Add resolver tests for precedence:
    package override -> namespace mapping -> default mapping
    - _Requirements: 4.1, 4.2_

- [x] 3. Implement dependency locking workflow
  - [x] 3.1 Wire dependency resolution to immutable digests before activation
    - _Requirements: 5.1, 5.3_
  - [x] 3.2 Persist dependency lock rows tied to module/service revision
    - _Requirements: 5.2_
  - [x] 3.3 Reject mutable dependency drift unless explicit rollout updates lock
    state
    - _Requirements: 5.4_
  - [x] 3.4 Expose lock inspection in read APIs
    - _Requirements: 5.5_
  - [x] 3.5 Add lock determinism tests
    - _Requirements: 5.1, 5.2_

- [x] 4. Bootstrap and run `sys-wasm-meta`
  - [x] 4.1 Seed built-in `sys-wasm-meta` service definition during bootstrap
    - _Requirements: 1.1_
  - [x] 4.2 Ensure lifecycle/endpoint registration uses existing WASM lifecycle
    ownership
    - _Requirements: 1.2, 7.2_
  - [x] 4.3 Implement unavailable behavior when no meta leader is routable
    - _Requirements: 1.4, 1.5_

- [x] 5. Implement `sys-wasm-meta` command handlers
  - [x] 5.1 Implement module publish/get/list commands
    - _Requirements: 2.1, 3.1, 3.5_
  - [x] 5.2 Implement service create/update/scale/rollout/delete commands
    - _Requirements: 2.1, 7.1, 7.4_
  - [x] 5.3 Reuse manifest/dependency/capability/service validators without
    duplication
    - _Requirements: 6.1, 6.2, 12.4_
  - [x] 5.4 Ensure all writes flow through SQL/CDC paths
    - _Requirements: 12.1, 12.2_

- [x] 6. Implement operation state machine and idempotency
  - [x] 6.1 Persist async operation lifecycle in `wasm_operations`
    - _Requirements: 8.1, 8.3_
  - [x] 6.2 Implement idempotency-key dedupe by tenant + command signature
    - _Requirements: 2.4, 8.4_
  - [x] 6.3 Implement operation stream publishing
    - _Requirements: 2.2, 8.5_
  - [x] 6.4 Add operation query APIs and response envelopes
    - _Requirements: 2.3, 8.2_

- [x] 7. Implement `sys-admin-meta` sister service
  - [x] 7.1 Define admin service command surface for current admin operations
    - _Requirements: 1.3, 11.1_
  - [x] 7.2 Implement delegation from `sys-admin-meta` to `sys-wasm-meta` for
    WASM ownership areas
    - _Requirements: 1.3, 11.1_
  - [x] 7.3 Add service endpoints and routing metadata for both meta services
    - _Requirements: 1.3, 2.1_

- [x] 8. Migrate node-local admin APIs to adapters
  - [x] 8.1 Refactor existing Admin API handlers into compatibility adapters
    that forward to `sys-admin-meta`/`sys-wasm-meta`
    - _Requirements: 1.4, 11.2_
  - [x] 8.2 Preserve CLI compatibility contract during migration
    - _Requirements: 11.3_
  - [x] 8.3 Add deprecation warnings for direct node-local mutation paths
    - _Requirements: 11.4, 13.3_
  - [x] 8.4 Remove/hard-fail bypass mutation paths after migration checkpoints
    - _Requirements: 1.5, 12.2_

- [x] 9. Security and quota enforcement
  - [x] 9.1 Add authn/authz middleware at service command layer
    - _Requirements: 9.1, 9.2_
  - [x] 9.2 Add quota enforcement for module size, package count, and concurrent
    operations
    - _Requirements: 9.3, 9.4_
  - [x] 9.3 Add security context in audit records
    - _Requirements: 9.5_

- [x] 10. Observability and diagnostics
  - [x] 10.1 Add structured logs + metrics for command rate/latency/error and
    operation duration
    - _Requirements: 8.5, 13.4_
  - [x] 10.2 Add trace correlation propagation across adapter -> meta service ->
    SQL -> lifecycle
    - _Requirements: 2.3, 12.1_
  - [x] 10.3 Add audit queries for source mapping decisions and dependency locks
    - _Requirements: 4.5, 5.5_

- [x] 11. Documentation updates
  - [x] 11.1 Document package identity, mapping, OCI source references, and lock semantics
    - _Requirements: 13.1_
  - [x] 11.2 Update architecture with `sys-wasm-meta`/`sys-admin-meta` ownership
    and adapter boundaries
    - _Requirements: 13.2_
  - [x] 11.3 Publish migration guide from direct table writes/node-local admin
    handlers to meta-service commands
    - _Requirements: 13.3, 13.5_

- [x] 12. Verification checkpoints
  - [x] 12.1 Unit checkpoint: tasks 1-6
  - [x] 12.2 Integration checkpoint: tasks 7-10
  - [x] 12.3 Final checkpoint: full relevant suites, including adapter
    compatibility and single-path contract assertions

## Notes

- `sys-wasm-meta` is required.
- `sys-admin-meta` is the recommended sister service for broader admin
  serviceization and delegation.
- No direct mutation fallback paths are allowed after migration completion.
