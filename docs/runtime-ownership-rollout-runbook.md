# Runtime Ownership Rollout and Rollback Runbook

This runbook defines phased rollout, rollback, feature-gate behavior, and
failure handling for runtime-ownership closure changes.

## 1. Phased Rollout Sequence

| Phase | Scope | Entry Criteria | Exit Criteria |
|---|---|---|---|
| P0 | Baseline and backup | Cluster healthy, current schema snapshot captured | Baseline checkpoints recorded |
| P1 | Schema and runtime descriptor alignment | P0 complete | `service_definitions` runtime columns and compatibility paths validated |
| P2 | SQL dispatch and callback ownership closure | P1 complete | `executeRequest` dispatch and callback contracts validated |
| P3 | Unified runtime lifecycle activation | P2 complete | startup-owned runtime registry/lifecycle paths validated |
| P4 | Admin ingress enforcement progression | P3 complete | adapter-first ingress validated in observe, then enforce |
| P5 | Governance closure sign-off | P4 complete | closure matrix and completion gates fully satisfied |

### Phase Actions

1. P0:
   - Capture current `service_definitions`, `services`, and `wasm_operations`
     snapshots.
   - Record current admin enforcement mode and OCI feature-gate state.
2. P1:
   - Deploy schema/model/runtime descriptor contract changes.
   - Run V1 contract checkpoint commands.
3. P2:
   - Deploy `SqlCore.executeRequest` stage/plan/callback dispatch closure.
   - Deploy explicit callback runtime-kind propagation and SELECT-only checks.
   - Run V2 dispatch checkpoint commands.
4. P3:
   - Deploy startup wiring for `Runtime_Driver_Registry` and
     `Service_Runtime_Lifecycle`.
   - Run V3 runtime ownership checkpoint commands.
5. P4:
   - Start with admin enforcement mode `observe`.
   - Validate adapter routing and meta-leader unavailable behavior.
   - Promote to `enforce` only after no bypass-path warnings remain.
   - Run V4 admin checkpoint commands.
6. P5:
   - Complete docs parity and governance checks (V5, V6).
   - Mark closure tasks done only after evidence is present.

## 2. Rollback Triggers and Safe Rollback Actions

| Phase | Trigger | Safe Rollback Action |
|---|---|---|
| P1 | Service-definition mutation errors spike | Keep new columns; revert writer behavior to compatibility defaults and re-run migration checks |
| P2 | Callback or stage/plan requests fail unexpectedly | Roll back to previous release build; preserve data and re-run V2 tests before reattempt |
| P3 | Startup/runtime lifecycle activation failures | Revert build; keep persisted metadata intact; validate runtime descriptors before retry |
| P4 (observe) | Warning volume indicates unresolved bypass callers | Stay in `observe`; do not promote to `enforce`; remediate callers |
| P4 (enforce) | `BYPASS_REJECTED` errors on critical paths | Immediately revert to `observe` enforcement mode; remediate callers; retry later |
| P5 | Docs/evidence mismatch at sign-off | Block release sign-off; fix matrix/docs/checkpoints before progressing |

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
