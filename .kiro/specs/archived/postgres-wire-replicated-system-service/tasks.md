# Implementation Plan: PostgreSQL Wire Replicated System Service

## Overview

Convert PostgreSQL wire ingress into a built-in replicated runtime service
(`sys-postgres-wire`) with cluster-global scaling and full lifecycle/rebalance
ownership.

Execution order:

1. Canonical constants and built-in definition registration
2. Runtime module lifecycle support and endpoint projection
3. Runtime-service rebalance support and replica operations
4. Wire protocol runtime implementation
5. Admin UX and diagnostics
6. Hard cutover and release gates

## Tasks

- [x] 1. Add canonical constants for PostgreSQL wire system service
  - Add `sys-postgres-wire` service ID constant and runtime-ref constant.
  - Add protocol constant `postgresql` for service endpoint publication.
  - Add metrics log tags under `metrics.pgwire.*` namespace.
  - _Requirements: 1.1, 6.1, 12.1_

- [x] 2. Register built-in `sys-postgres-wire` definition during bootstrap
  - Extend built-in runtime definition registration owner to include PG wire.
  - Ensure row uses `service_type = runtime_service` and runtime descriptor
    fields.
  - Ensure registration writes only through SQL/CDC owner callbacks.
  - _Requirements: 1.1, 1.2, 1.4, 11.1_

- [x] 3. Extend runtime descriptor validation for PG wire runtime config
  - Validate required listener/auth config shape and type constraints.
  - Fail closed on invalid runtime config.
  - Add validation unit tests.
  - _Requirements: 2.4, 7.1, 10.1_

- [x] 4. Implement PostgreSQL wire runtime module (`runtime_ref` target)
  - Add native runtime module for prepare/start/stop/health.
  - `start()` binds TCP listener and returns endpoint intent.
  - `stop()` closes listener and frees state deterministically.
  - _Requirements: 2.1, 6.1, 7.1, 9.1_

- [x] 5. Support lifecycle-capable native runtime refs in native JS driver
  - Extend native runtime resolution to handle lifecycle-capable modules.
  - Preserve current typed error behavior for invalid refs.
  - Add unit tests for module lifecycle delegation.
  - _Requirements: 2.2, 2.4, 9.4_

- [x] 6. Project runtime replica state to `services` table
  - Add single owner write path for runtime replica status projection.
  - Ensure create/start/stop/fail transitions update `services` consistently.
  - Ensure rows are visible as runtime-service replicas.
  - _Requirements: 5.1, 5.2, 5.4, 13.1_

- [x] 7. Publish PG wire endpoints through endpoint intent writer only
  - Map endpoint intent to `service_endpoints` row with
    `protocol = postgresql`.
  - Handle endpoint update and cleanup on stop/failure.
  - Add unit tests for endpoint publication and failure handling.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 8. Add runtime-service entity support in rebalancer models
  - Extend entity-type handling for `runtime_service` in rebalancer constants
    and validation.
  - Extend current-replica discovery for runtime-service entities from
    `services` rows.
  - Extend in-flight operation matching for runtime-service entities.
  - _Requirements: 3.2, 4.1, 4.2, 4.3_

- [x] 9. Extend move planning for runtime-service replicas
  - Reuse existing placement policy inputs (nodes/load/policy constraints).
  - Plan `ADD/REMOVE/REPLACE` for runtime-service entities.
  - Enforce cluster-global `replica_count` target semantics.
  - _Requirements: 3.1, 3.3, 4.4_

- [x] 10. Extend replica-operation execution for runtime services
  - Route runtime-service `ADD/REMOVE/REPLACE` operations through existing
    operation execution ownership.
  - Materialize runtime replicas via `ServiceLifecycleManager` on target nodes.
  - Persist operation transitions and terminal states.
  - _Requirements: 2.1, 3.2, 4.4, 11.2_

- [x] 11. Add bootstrap/join safety gates for PG wire startup ordering
  - Ensure PG wire lifecycle starts only after control-plane readiness.
  - Ensure bootstrap and join do not deadlock on PG wire startup failure.
  - Add integration tests for startup ordering and failure resilience.
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 12. Implement PostgreSQL wire protocol runtime flow
  - Implement startup/auth handshake and ReadyForQuery state handling.
  - Implement simple query and extended query protocol messages.
  - Map protocol execution to canonical `SqlRequest` through
    `PostgresWireAdapter`.
  - _Requirements: 8.1, 9.1, 9.4, 10.1_

- [x] 13. Integrate authentication and policy context mapping
  - Map authenticated session identity to tenant/principal context.
  - Enforce authorization before query execution.
  - Add structured security audit logging.
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 14. Implement port allocation and collision handling policy
  - Support fixed port and dynamic-range allocation modes.
  - Fail operations with typed errors on bind conflict.
  - Add operation-level retry behavior through existing rebalance mechanics.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 15. Add PG wire observability instrumentation
  - Emit `metrics.pgwire.handshake`, `metrics.pgwire.query`,
    `metrics.pgwire.session`, and `metrics.pgwire.protocol_error` logs.
  - Include service/replica/operation/node dimensions.
  - Add unit tests for metrics structure and log levels.
  - _Requirements: 12.1, 12.2, 12.4_

- [x] 16. Update admin UX for logical services and replicas
  - Ensure replica views include runtime-service replicas
    (`sys-postgres-wire`, `sys-admin-meta`, `sys-wasm-meta`).
  - Ensure logical service grouping shows per-service replica distribution.
  - Add endpoint details for PostgreSQL protocol endpoints.
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 17. Add test matrix and shard commands for PG wire coverage
  - Add unit tests for runtime lifecycle, driver, and endpoint projection.
  - Add integration tests for bootstrap/join/scale/failover/rebalance.
  - Add client compatibility tests for `psql` and `pg` usage.
  - Provide shardable npm scripts for faster iteration.
  - _Requirements: 15.1, 15.2, 15.3, 15.4_

- [x] 18. Hard cutover: remove standalone PostgreSQL listener path
  - Delete direct listener startup from node entrypoint/bootstrap/join flows.
  - Remove fallback config and dual-mode execution branches.
  - Add negative tests proving legacy path is removed/non-callable.
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 19. Architecture and operations documentation updates
  - Update `.kiro/steering/architecture.md` with replicated PG wire ownership
    model and data flow.
  - Document scale operations and endpoint discovery expectations.
  - _Requirements: 12.3, 13.4_

- [x] 20. Final verification gate
  - Run targeted lint and tests for all modified files.
  - Run PG wire integration compatibility matrix on multi-node topology.
  - Confirm no legacy listener entrypoint symbols remain.
  - _Requirements: 14.4, 15.1, 15.2, 15.4_

## Notes

- Runtime-service scaling must remain cluster-global; do not interpret
  `replica_count` as per-node for `sys-postgres-wire`.
- All metadata writes remain SQL/CDC-owned; runtime code must not write
  system tables directly.
- Session state is replica-local by design; this is compatible with horizontal
  scaling through endpoint discovery and reconnect.
- The shipped state must contain only the replicated service path.
