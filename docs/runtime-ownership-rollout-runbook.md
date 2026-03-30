# Runtime Ownership Operations Runbook

This runbook defines the steady-state operating model, release verification,
rollback posture, feature-gate behavior, and failure handling after
runtime-ownership closure.

## 1. Steady-State Operating Model

The runtime-ownership cutover is closed. Operators should reason about the
system using these active boundaries only:

1. `Service_Runtime_Lifecycle` owns runtime lifecycle operations.
2. `Runtime_Driver_Registry` owns runtime selection; no fallback driver path
   exists.
3. `SqlCore.executeRequest(...)` owns canonical SQL dispatch, including
   callback dispatch.
4. Admin and WASM ingress surfaces are compatibility adapters only; they route
   into replicated handlers and the SQL/CDC path rather than owning mutations.
5. Startup wiring in `BootstrapService` and `NodeJoiningService` is limited to
   provisioning and handoff. Those services do not retain a parallel
   steady-state runtime ownership path after startup completes.
6. Rollback, if needed, is by reverting the deployment or release build. Do
   not restore deprecated live bypass paths inside the same runtime.

## 2. Release Verification and Safe Rollback

Before promotion or after an incident rollback, verify:

1. `service_definitions` runtime descriptor columns match the deployed service
   types and runtime kinds.
2. Admin ingress follows adapter-first routing with no bypass-path warnings or
   rejects outside expected enforcement behavior.
3. Callback requests carry explicit `runtimeKind` and remain SELECT-only.
4. Diagnostics show the canonical lifecycle owner path rather than a startup-
   local or adapter-local path.
5. Closure evidence in
   `.kiro/specs/runtime-ownership-closure/completion-gates.md` and
   `.kiro/specs/runtime-ownership-closure/closure-matrix.md` still matches the
   deployed code.

Safe rollback rules:

1. Revert to the last known-good release build.
2. Preserve persisted runtime metadata and descriptor columns.
3. Re-validate runtime descriptors and diagnostics before reattempting a
   promotion.
4. Do not reintroduce removed dual-path ownership logic as an operational fix.

## 3. Feature-Gate Behavior Tables

### 3.1 OCI Container Runtime Gate

| `oci_container_enabled` | Expected Behavior |
|---|---|
| `false` (default) | `oci_container` callback/runtime selection rejects with explicit gated error |
| `true` | Runtime selection allowed, descriptor and policy checks still enforced |

Source: `src/runtime/oci-container-descriptor.js`,
`src/query/callback-runtime-driver-registry.js`.

### 3.2 Admin Enforcement Modes

| Admin Mode | Guard Mapping | Behavior |
|---|---|---|
| `observe` | `warn` | Deprecated bypass paths continue, warning emitted |
| `enforce` | `reject` | Deprecated bypass paths rejected with `BYPASS_REJECTED` |

Source: `src/admin/admin-constants.js`,
`src/admin/admin-websocket-api.js`,
`src/admin/admin-mutation-guard.js`.

## 4. Operational Error Catalog

| Code / Message | Source | Meaning | Operator Action |
|---|---|---|---|
| `BYPASS_REJECTED` | `src/admin/admin-mutation-guard.js` | Direct node-local mutation path rejected | Re-route caller to meta-service command path or revert to `observe` |
| `META_SERVICE_UNAVAILABLE` | `src/wasm-service/meta-service-router.js` | No routable meta-service leader | Restore leader availability or routing metadata in `services` |
| `partition_callback requires explicit runtimeKind` | `src/query/sql-request.js` | Callback request omitted explicit runtime kind | Set `runtimeKind` on callback request path |
| `partition_callback statement must be a SELECT query` | `src/query/partition-callback-dispatcher.js` | Invalid statement mode for callback | Restrict callback SQL to SELECT |
| `Unknown runtime kind; no fallback driver allowed` | `src/query/sql-adapter-constants.js` | Runtime kind not registered | Fix runtime kind or register driver via startup wiring |
| `oci_container runtime is feature-gated and not enabled` | `src/query/sql-adapter-constants.js` | OCI callback/runtime used while gate disabled | Enable gate only when rollout criteria are met |
| `runtime_kind is required` | `src/wasm-service/runtime-descriptor-validator.js` | Missing runtime descriptor kind | Provide runtime descriptor at create/update |
| `runtime_ref is required for this runtime kind` | `src/wasm-service/runtime-descriptor-validator.js` | Missing runtime reference for wasm/oci | Provide runtime_ref compatible with runtime kind |
| `runtime_ref must contain a digest reference (@sha256:)` | `src/wasm-service/runtime-descriptor-validator.js` | OCI descriptor missing digest pin | Use digest-pinned OCI reference |

## 4.1 Canonical Owner Rows vs Read Models

Operator diagnostics must distinguish between canonical owner rows and
supporting read models.

Canonical owner rows:

1. `partitions.leader_node_id` owns canonical partition leader identity.
2. `message_groups.leader_node_id` owns canonical message-group leader identity.
3. `services` owns per-replica role, status, address, and replica placement
   detail only.

Read-model rules:

1. Read the owner row first when diagnosing leadership.
2. Use `services` rows only to answer which replicas exist, what role each
   replica reports, and whether replica metadata disagrees with the owner row.
3. Treat a `services.raft_role = leader` row that disagrees with
   `leader_node_id` as an inconsistency signal, not as alternative truth.
4. Do not infer canonical leader changes from `services` row iteration order.

Operator query order:

1. Query `partitions` or `message_groups` for `leader_node_id`.
2. Query `services` for replica rows under the same partition or group.
3. Escalate when replica rows report multiple leaders or a leader that does
   not match the owner row.

Expected mismatch interpretation:

1. Owner row set, replica rows agree: steady state.
2. Owner row set, replica rows disagree: replica-role inconsistency.
3. Owner row missing, replica rows show a leader: incomplete propagation or
   ownership bug; do not treat the replica row as canonical.

## 5. Sign-Off Checklist

1. All V1..V6 checkpoints in
   `.kiro/specs/runtime-ownership-closure/completion-gates.md` are complete.
2. `closure-matrix.md` includes evidence for all `S1..S10`.
3. Admin mode state and OCI gate state are explicitly recorded for release.

## 6. Ownership Notes for Examples Runtime Closure

### 6.1 Partition Callback Invocation Contract

Callback execution ownership is now explicit and single-path:

1. Admin ingress accepts `partition_callback` envelopes.
2. Admin maps payload into canonical `createSqlRequest(...)` with
   `executionMode: PARTITION_CALLBACK`.
3. SQL dispatch uses `SqlQueryEngine.executeRequest(...)` callback mode.
4. Callback invocation is owned by `CallbackExecutionHost` (no parallel executor
   path).

Primary sources:

- `src/admin/admin-websocket-api.js`
- `src/query/sql-query-engine.js`
- `src/query/callback-execution-host.js`

### 6.2 WASM Stub Closure Ownership

WASM stub closures follow existing ownership boundaries:

1. `ModuleMirror` owns local module cache entries only.
2. Cache invalidation is wired from canonical CDC events on `code` table
   updates (no parallel cache owner).
3. `WasmServiceLifecycle.startReplica(...)` is fail-closed when required module
   artifacts are unavailable and records startup diagnostics.
4. `WasmServiceReplica.flushRoleUpdate()` and
   `flushLeaderNodeUpdate()` write through owner callbacks or
   `cdcIntegrationService.updateSystemTableRow(...)` only.
5. No direct `SystemTableCache` mutations are allowed in these paths.

Primary sources:

- `src/wasm-service/module-mirror.js`
- `src/wasm-service/wasm-service-lifecycle.js`
- `src/wasm-service/wasm-service-replica.js`

## 7. Ownership Notes for Debug Runtime Foundation Closure

### 7.1 Debug Metadata Ownership

Debug metadata ownership is now explicit and SQL/CDC-only:

1. `debug_sessions`, `debug_breakpoints`, and `debug_snapshots` are system
   tables with canonical schema registration.
2. `DebugMetadataStore` is the single owner for debug metadata read/write
   behavior.
3. The store persists and reads through `SqlQueryEngine.executeRequest(...)`
   using canonical `SqlRequest` envelopes only.
4. Cross-tenant reads are prevented by tenant-scoped filters on all metadata
   queries.
5. No direct `SystemTableCache` mutation is allowed for debug metadata.

Primary sources:

- `src/bootstrap/system-table-schemas-constants.js`
- `src/debug-runtime/debug-metadata-service.js`
- `src/cache/cache-constants.js`
- `src/admin/admin-websocket-api.js`

### 7.2 Debug Ingress Ownership and Security Contract

Admin ingress routes are compatibility adapters; debug ownership remains in the
metadata store and DAP router components:

1. Debug routes are exposed under `/api/admin/debug/*` on existing admin
   ingress.
2. Required headers on debug routes:
   - `x-tenant-id`
   - `x-principal`
   - `x-roles` (comma-separated debug roles)
3. Error mapping expectations:
   - `401`: missing/invalid security context
   - `403`: role authorization denied
   - `404`: session/snapshot not found
   - `503`: debug metadata store or DAP router unavailable

Primary sources:

- `src/admin/admin-constants.js`
- `src/admin/admin-websocket-api.js`
- `src/debug-runtime/debug-metadata-service-constants.js`

### 7.3 Rollout Validation and Rollback Guidance

Validation checklist before promotion:

1. `test/debug-runtime/debug-metadata-service.test.js` is green.
2. `test/admin/admin-websocket-api.test.js` debug ingress tests are green.
3. `test/debug-runtime/distributed-debug-e2e.integration.test.js` is green.
4. `test/debug-runtime/debug-overhead-regression.test.js` is green.

If production issues appear after rollout:

1. Keep metadata schemas and rows in place (non-destructive rollback).
2. Temporarily disable debug attach clients or debug ingress routing while
   preserving SQL/CDC metadata ownership.
3. Investigate route-level failures by checking error code mapping first
   (security-context, authorization, not-found, unavailable).
