# Implementation Plan: Unified System Metadata Gateway

## Overview

This plan converts runtime shared metadata access to one canonical ingress:

- semantic owners decide meaning
- `ControlPlaneSystemTableGateway` executes all runtime reads and writes
- CDC remains the only propagation path
- `SystemTableCache` remains the only local cache
- `PressureGovernor` becomes the shared pressure policy for both metadata and
  query ingress paths

Tasks are ordered to freeze the architectural boundary first, then migrate
writers, then migrate readers, then enforce the boundary in CI.

## Tasks

- [x] 1. Extend the canonical gateway contract
  - [x] 1.1 Add explicit `Read_Intent`, `Mutation_Intent`, typed result shapes,
    and strategy enums to `ControlPlaneSystemTableGateway`
  - [x] 1.2 Introduce one canonical `executeRead(...)` entrypoint and keep
    legacy helper methods as thin delegators only during migration
  - [x] 1.3 Normalize gateway outcomes so runtime callers receive typed
    `applied`, `no_op`, `deferred`, `rejected`, `owner_not_ready`, and
    `observed_state_changed` results
  - [x] 1.4 Add focused unit tests for strategy selection and typed outcomes

- [x] 2. Make gateway pressure and coalescing fully authoritative
  - [x] 2.1 Implement write-side coalescing and bounded `replace_pending`
    behavior for supersedable metadata churn
  - [x] 2.2 Keep identical mutation single-flight in the gateway, not in
    callers
  - [x] 2.3 Add memory-bounded accounting and metrics for in-flight/coalesced
    metadata work
  - [x] 2.4 Add unit/property tests for single-flight, replacement, defer, and
    reject behavior

- [x] 3. Make `PressureGovernor` the shared pressure policy across both planes
  - [x] 3.1 Normalize one reusable pressure contract used by metadata ingress
    and query ingress
  - [x] 3.2 Define distinct resource keys and capacity partitions for
    control-plane and query-plane traffic
  - [x] 3.3 Remove ad hoc overload handling that diverges from the shared
    pressure contract
  - [x] 3.4 Add tests proving metadata ingress and query ingress both return
    the same typed defer/reject semantics while preserving plane isolation

- [x] 4. Define semantic owner surfaces for shared metadata families
  - [x] 4.1 Introduce or normalize explicit owner modules for `nodes`,
    `services`, `partitions`, `message_groups`, `replica_operations`, `logs`,
    `service_endpoints`, and `service_definitions`
  - [x] 4.2 Ensure each owner exposes typed read and mutation methods and does
    not leak raw table writes to callers
  - [x] 4.3 Wire owners from the composition root instead of local lazy
    construction
  - [x] 4.4 Add regression tests proving owner injection paths are used

- [x] 5. Migrate all runtime system-table writers to the gateway
  - [x] 5.1 Migrate remaining `services` writers in replica lifecycle paths:
    `replica-lifecycle-manager`, `replica-state-machine`,
    `replica-handler`, and `replica-recovery-service`
  - [x] 5.2 Migrate any remaining `nodes`, `partitions`, `message_groups`,
    `replica_operations`, `logs`, `service_endpoints`, and
    `service_definitions` direct CDC writers
  - [x] 5.3 Remove direct runtime use of
    `cdcIntegrationService.*SystemTableRow(...)` outside the gateway and
    sanctioned bootstrap files
  - [x] 5.4 Add regression tests that fail if direct writer paths are restored

- [x] 6. Migrate all runtime system-table readers to the gateway
  - [x] 6.1 Replace direct runtime system-table SQL with gateway-backed owner
    reads
  - [x] 6.2 Replace ad hoc direct cache reads in non-owner control-plane code
    with owner/gateway reads where the read is shared metadata logic rather
    than local hot-path internals
  - [x] 6.3 Route authoritative and non-propagated reads through explicit read
    strategies instead of local helper fallbacks
  - [x] 6.4 Add regression tests proving the gateway read path is used

- [x] 7. Integrate query-plane ingress with the shared pressure policy
  - [x] 7.1 Route query ingress admission through `PressureGovernor` without
    routing query execution through `ControlPlaneSystemTableGateway`
  - [x] 7.2 Preserve query-plane redirect/retry semantics while removing
    unrelated local overload policies
  - [x] 7.3 Add tests proving query-plane paths reuse the shared pressure
    contract but remain isolated from control-plane budgets

- [x] 8. Contain bootstrap exceptions
  - [x] 8.1 Identify every runtime import of bootstrap-only helpers and remove
    it
  - [x] 8.2 Restrict `bootstrap_snapshot` reads to explicit bootstrap/join
    phases
  - [x] 8.3 Ensure runtime code cannot reach `SystemTableWriter` or direct
    cache mutation helpers after bootstrap completes
  - [x] 8.4 Add tests proving bootstrap-only helpers are unreachable from
    steady-state runtime logic

- [x] 9. Remove fallback-style read/write reconstruction
  - [x] 9.1 Delete any remaining "gateway unavailable, reconstruct locally"
    logic in control-plane consumers
  - [x] 9.2 Delete any sequential "try new path, then old path" branches for
    system-table reads or writes
  - [x] 9.3 Replace them with typed owner/gateway errors
  - [x] 9.4 Add tests that fail when alternate reconstruction logic is added

- [x] 10. Add structural CI enforcement
  - [x] 10.1 Add a static audit script that fails on runtime direct
    `cdcIntegrationService.*SystemTableRow(...)` calls outside the gateway and
    sanctioned bootstrap files
  - [x] 10.2 Add a static audit script that fails on runtime direct
    `sqlQueryEngine.executeQuery(...)` calls for system tables outside the
    gateway
  - [x] 10.3 Add a static audit script that fails on runtime
    `SystemTableCache.applySystemTableChange(...)` outside sanctioned
    bootstrap/test paths
  - [x] 10.4 Add a static audit script that fails when ingress code invents
    a second unrelated pressure/admission policy instead of using the shared
    pressure contract
  - [x] 10.5 Run the audit in CI and add regression fixtures for expected
    failures

- [x] 11. Add observability for the single path and shared pressure policy
  - [x] 11.1 Emit gateway metrics/logs for read/write outcome, owner, table,
    strategy, work class, coalescing, and latency
  - [x] 11.2 Emit shared pressure-policy diagnostics for both metadata ingress
    and query ingress with distinct resource keys
  - [x] 11.3 Add diagnostics for bounded memory and retained in-flight work
  - [x] 11.4 Surface typed defer/reject reasons in harness-friendly logs
  - [x] 11.5 Add unit/integration tests for diagnostic coverage

- [ ] 12. Verify the new architecture end to end
  - [x] 12.1 Run targeted suites for migrated owners, gateway contracts, and
    query ingress pressure reuse
  - [x] 12.2 Run focused distributed scenarios:
    `node-join-under-load`, `rolling-restart`, and
    `seven-node-table-partition-distribution`
  - [x] 12.3 Confirm metadata producer behavior is bounded and memory growth is
    plateaued before changing any scenario timeout window
  - [x] 12.4 Confirm query-plane pressure behavior uses the same typed
    defer/reject model without starving or being starved by control-plane work
  - [ ] 12.5 Remove transitional delegators only after the distributed baseline
    proves the single-path architecture is stable
