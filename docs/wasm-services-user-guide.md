# WASM Services User Guide

Comprehensive operator guide for publishing WASM artifacts, creating WASM
services, and administering them in this system.

This guide is implementation-focused and maps to the current control plane in
this repository.

## 1. Control Plane Overview

Active operator path:

1. Connect to node admin ingress:
   - `ws://<node-host>:8081/api/admin/stream`
2. Send `query` and `refresh` messages through the WebSocket contract.
3. The node endpoint is an adapter only; command ownership routes to
   replicated meta services:
   - `sys-wasm-meta` for WASM module/service lifecycle
   - `sys-admin-meta` for generic admin commands and WASM delegation
4. Dispatchable ingress messages are translated to canonical `Service_Message`
   envelopes and executed through the shared dispatcher contract.

## 2. Prerequisites

1. Node is running (`npm start`), and you know the admin WebSocket port.
   - Fixed port: `8081` (system admin service port)
2. You can connect to the admin stream:
   - `ws://<node-host>:8081/api/admin/stream`
3. You have a WASM module file and can compute its SHA-256 digest.

Optional CLI:

```bash
npm run cli -- localhost:8081
```

## 3. Admin WebSocket Message Contract

Incoming messages (client -> server):

1. SQL query

```json
{
  "type": "query",
  "queryId": "q-1",
  "sql": "SELECT * FROM service_definitions",
  "params": []
}
```

2. Cache refresh

```json
{
  "type": "refresh"
}
```

Outgoing messages (server -> client):

1. `cache_dump`
2. `query_result`
3. `cdc_event`
4. `error`

### 3.1 Partition Callback Invocation

The admin stream also supports distributed callback execution through a typed
`partition_callback` envelope:

```json
{
  "type": "partition_callback",
  "queryId": "cb-1",
  "statement": "SELECT * FROM logs WHERE level = ?",
  "parameters": ["info"],
  "callbackModuleRef": "example-01-basic-iterator-v1_0_0",
  "callbackExport": "run",
  "runtimeKind": "native_js"
}
```

Response shape (`query_result`) includes callback execution metadata:

```json
{
  "type": "query_result",
  "queryId": "cb-1",
  "operation": "partition_callback",
  "hostResult": {
    "state": "completed",
    "processedPartitions": 3,
    "failedPartitions": 0
  }
}
```

## 4. Artifact Upload Workflow

The practical artifact workflow is:

1. Store executable bytes/metadata in `code`
2. Publish module metadata in `module_manifests`

### 4.1 Compute Digest

```bash
sha256sum ./handler.wasm
```

Format the digest as:

```text
sha256:<64-hex-chars>
```

### 4.2 Insert into `code`

`code` stores function definitions referenced by service definitions.
`code_blob` is text in current schema; common practice is base64-encoding the
WASM bytes.

Example base64 conversion:

```bash
base64 -w 0 ./handler.wasm
```

```sql
INSERT INTO code (
  function_id,
  function_name,
  version,
  executor_type,
  code_blob,
  signature,
  permissions,
  created_at,
  updated_at
) VALUES (
  'fn-acme-hello-v1',
  'acme.hello',
  1,
  'wasm_service',
  '<base64-wasm-bytes>',
  '{"runExport":"handle"}',
  '[]',
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);
```

### 4.3 Insert into `module_manifests`

`module_manifests` uses the composite identity:
`namespace:name@version`

```sql
INSERT INTO module_manifests (
  namespace,
  name,
  version,
  digest,
  run_export,
  exports,
  dependencies,
  capabilities,
  source_reference,
  artifact_pointer,
  created_at
) VALUES (
  'acme',
  'hello',
  '1.0.0',
  'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'handle',
  '["handle"]',
  '[]',
  '["sql.read"]',
  'registry.example/acme/hello:1.0.0@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'fn-acme-hello-v1',
  CAST(strftime('%s','now') AS INTEGER) * 1000
);
```

### 4.4 Verify Publish

```sql
SELECT namespace, name, version, digest, run_export, artifact_pointer, created_at
FROM module_manifests
WHERE namespace = 'acme' AND name = 'hello'
ORDER BY created_at DESC;
```

## 5. Start a WASM Service

Create a service definition row. This is the declarative start signal.

```sql
INSERT INTO service_definitions (
  service_id,
  service_name,
  service_profile,
  handler_function_id,
  runtime_kind,
  runtime_ref,
  runtime_config,
  read_consistency,
  write_consistency,
  replica_count,
  protocol,
  resource_budget,
  safety_interval_ms,
  status,
  created_at,
  updated_at
) VALUES (
  'svc-acme-hello',
  'acme-hello-service',
  'default',
  'fn-acme-hello-v1',
  'wasm_component',
  'fn-acme-hello-v1',
  '{}',
  'strong',
  'strong',
  3,
  'websocket',
  '{}',
  500,
  'active',
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);
```

`resource_budget` may include:
`cpuTimeLimitMs`, `memoryLimitBytes`, `sessionSizeLimitBytes`,
`serviceSizeLimitBytes`.

Constraints to respect:

1. `replica_count` must be odd and `>= 3`
2. `runtime_kind = wasm_component` requires non-empty `runtime_ref`
3. `handler_function_id` must exist in `code` for non-SQL service profiles
4. Consistency values should be valid (`leader_only`/`strong`/`eventual` for
   reads, `strong`/`async` for writes)

### 5.1 Verify Service Definition

```sql
SELECT service_id, service_name, handler_function_id, replica_count, status, updated_at
FROM service_definitions
WHERE service_id = 'svc-acme-hello';
```

### 5.2 Verify Runtime Replicas and Endpoints

```sql
SELECT service_id, node_id, service_type, raft_role, status, address
FROM services
WHERE group_id = 'svc-acme-hello' OR service_id LIKE 'svc-acme-hello%';
```

```sql
SELECT endpoint_id, service_id, node_id, protocol, address, port, health_status
FROM service_endpoints
WHERE service_id = 'svc-acme-hello';
```

### 5.3 Unified Lifecycle Convergence

Service startup and maintenance are ownership-controlled:

1. `service_definitions` is desired state for replica count and runtime
   descriptor (`runtime_kind`, `runtime_ref`, `runtime_config`).
2. `ServiceReconciler` computes drift between desired and actual service rows.
3. `ServiceLifecycleManager` is the only owner of create/start/stop/restart.
4. Built-ins and userland WASM services converge through the same path.

## 6. Administer Existing Services

### 6.1 Update Service Config

```sql
UPDATE service_definitions
SET read_consistency = 'eventual',
    write_consistency = 'async',
    safety_interval_ms = 750,
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE service_id = 'svc-acme-hello';
```

### 6.2 Scale Service

```sql
UPDATE service_definitions
SET replica_count = 5,
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE service_id = 'svc-acme-hello';
```

Use odd replica counts only: `3`, `5`, `7`, ...

### 6.3 Soft-Delete (Deactivate) Service

```sql
UPDATE service_definitions
SET status = 'inactive',
    updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE service_id = 'svc-acme-hello';
```

## 7. Distributed SQL Examples Packaging and Run Flow

The repository includes copyable examples under:

- `examples/distributed-sql/`

Run the full package -> upload -> execute pipeline with:

```bash
node scripts/examples/build-upload-run.js \
  --target ws://127.0.0.1:8081/api/admin/stream \
  --out test-output/examples/examples-run.json
```

Useful flags:

- `--examplesDir <path>`: use a custom examples directory
- `--include id1,id2`: run only selected examples
- `--exclude id1,id2`: skip selected examples

Behavior:

1. Discovers ordered examples (`01-*`, `02-*`, ...).
2. Validates each `example.manifest.json`.
3. Uploads code and module metadata via canonical SQL writes (`code`,
   `module_manifests`).
4. Executes each example with `partition_callback`.
5. Validates results against `expected.json` contracts.
6. Writes a JSON artifact (`test-output/examples/<runId>.json`).
7. Returns non-zero exit code if any required example fails.

## 8. Debug Session and DAP APIs

Debug ingress is adapter-owned at `AdminWebSocketAPI`, but debug metadata
ownership is SQL/CDC-only through `DebugMetadataStore`:

1. All session/breakpoint/snapshot writes go through `SqlRequest` execution.
2. Tenant scope is enforced from debug headers.
3. Attach/read/write authorization is role-gated per request.

Required headers on all debug HTTP routes:

- `x-tenant-id`: tenant scope
- `x-principal`: calling principal
- `x-roles`: comma-separated roles (`debug_admin`, `debug_attach`,
  `debug_read`, `debug_write`)

Debug routes:

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/debug/sessions` | `POST` | Create session metadata |
| `/api/admin/debug/sessions/:sessionId` | `GET` | Read one session |
| `/api/admin/debug/sessions/:sessionId/attach` | `POST` | Attach authorization + session lookup |
| `/api/admin/debug/sessions/:sessionId/breakpoints` | `POST` | Upsert session breakpoints |
| `/api/admin/debug/sessions/:sessionId/breakpoints` | `GET` | List session breakpoints |
| `/api/admin/debug/sessions/:sessionId/snapshots` | `POST` | Write snapshot metadata/artifact envelope |
| `/api/admin/debug/sessions/:sessionId/snapshots` | `GET` | List snapshots for session |
| `/api/admin/debug/snapshots/:snapshotId` | `GET` | Read one snapshot (`sessionId` query optional) |
| `/api/admin/debug/dap/request` | `POST` | Route one DAP envelope |

Create session:

```bash
curl -X POST http://127.0.0.1:8081/api/admin/debug/sessions \
  -H 'x-tenant-id: tenant-a' \
  -H 'x-principal: debugger-user' \
  -H 'x-roles: debug_write,debug_attach,debug_read' \
  -H 'content-type: application/json' \
  -d '{
    "sessionId": "session-2",
    "serviceName": "svc-debug",
    "lineageId": "lineage-2",
    "stageId": 1,
    "endpoint": "ws://node-a/debug"
  }'
```

Write breakpoints:

```json
{
  "moduleRef": "svc:debug@1.0.0",
  "sourceFileUrl": "file:///src/service.ts",
  "breakpoints": [
    {"lineNumber": 10, "columnNumber": 0, "condition": null}
  ]
}
```

Write snapshot (envelope can be byte array, base64, or Buffer-like JSON):

```json
{
  "snapshotArtifact": {
    "manifest": {
      "snapshotId": "snapshot-1",
      "moduleRef": "svc:debug@1.0.0",
      "moduleDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    "snapshot": {
      "moduleRef": "svc:debug@1.0.0",
      "moduleDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    "envelope": [1, 2, 3]
  }
}
```

Snapshot responses expose envelope data as `envelopeBase64` for transport-safe
JSON payloads.

DAP request pass-through:

```json
{
  "sessionId": "session-2",
  "request": {
    "seq": 1,
    "command": "threads"
  }
}
```

Common status codes:

1. `401` missing/invalid tenant+principal headers
2. `403` authorization denied for requested debug action
3. `404` unknown session/snapshot
4. `503` debug metadata service or debug DAP router unavailable

## 9. Operational Queries

List modules:

```sql
SELECT namespace, name, version, digest, run_export, created_at
FROM module_manifests
ORDER BY created_at DESC;
```

List WASM services:

```sql
SELECT service_id, service_name, handler_function_id, replica_count, status
FROM service_definitions
ORDER BY updated_at DESC;
```

Inspect meta-service leaders:

```sql
SELECT service_id, node_id, raft_role, address, status
FROM services
WHERE service_id IN ('sys-wasm-meta', 'sys-admin-meta');
```

Track async operations:

```sql
SELECT operation_id, tenant_id, command, state, result, error, updated_at
FROM wasm_operations
ORDER BY created_at DESC
LIMIT 100;
```

## 10. Internal Meta Command Surface (For Embedders)

The command names owned by `sys-wasm-meta` are:

1. `publishModule`
2. `getModule`
3. `listModules`
4. `createService`
5. `updateService`
6. `scaleService`
7. `rolloutService`
8. `deleteService`
9. `getOperation`
10. `streamOperations`

In-process adapter code can dispatch admin actions through:

- `adaptAdminAction(...)` in `src/admin/admin-api-adapter.js`
- Delegation/routing via `src/admin/admin-meta-delegator.js` and
  `src/wasm-service/meta-service-router.js`

If no meta leader is routable, routing fails with
`META_SERVICE_UNAVAILABLE`.

## 11. Troubleshooting

1. Error: `Replica count must be an odd number >= 3`
   - Fix `replica_count` to odd values (`3`, `5`, `7`, ...).
2. Error: `Handler function not found in code table`
   - Insert/verify `code.function_id` before creating service definition.
3. Error: digest format invalid
   - Use `sha256:` + exactly 64 lowercase hex characters.
4. Error: `Meta-service leader is not routable`
   - Check `services` for `sys-wasm-meta` leader row with non-empty `address`.
5. Admin query timeout
   - Increase `admin.queryTimeoutMs` config or simplify query.
6. Error: `Debug route requires tenant and principal headers`
   - Include `x-tenant-id` and `x-principal` on debug routes.
7. Error: debug route returns `403`
   - Ensure `x-roles` includes one of `debug_admin`, `debug_attach`,
     `debug_read`, `debug_write` for the requested operation.

## 12. Current Implementation Notes

1. The external node API exposes SQL/refresh over WebSocket on fixed port
   `8081` as the stable user ingress.
2. The node ingress is adapter-only; mutation ownership is in replicated
   meta-service handlers.
3. `streamOperations` exists in command constants; polling `wasm_operations` is
   the practical operator workflow unless stream wiring is enabled in your
   branch.
4. Debug metadata tables (`debug_sessions`, `debug_breakpoints`,
   `debug_snapshots`) follow SQL/CDC ownership; no direct cache writes are
   allowed in debug paths.

## 13. Service Replica Table Access

Service replicas can query tables through the standard SQL execution path
during their lifetime. When a service replica starts, the lifecycle owner
injects a scoped query executor into the replica context.

### How It Works

During `ServiceRuntimeLifecycle.start()`, if a query executor factory has
been wired by `SQLQueryEngine`, the lifecycle owner calls the factory with
the service's identity and attaches the resulting executor to
`replicaContext.queryExecutor`.

Lifecycle modules and drivers receive this executor transparently:

```javascript
// Inside a lifecycle module's start() method:
async start(replicaContext) {
  const query = replicaContext.queryExecutor;
  if (query) {
    const result = await query(
      'SELECT * FROM my_table WHERE id = ?', ['row-1']
    );
    // result.rows contains the query results
  }
  // ... rest of start logic
}
```

For long-lived services that need ongoing query access, store the reference:

```javascript
async start(replicaContext) {
  this._query = replicaContext.queryExecutor;
  // Use this._query throughout the service lifetime
}
```

### Ownership Rules

- The query executor routes through `SQLQueryEngine.executeQuery()` — the
  same path used by `ctx.call()`, PG wire, and all other SQL entrypoints.
- Service replicas are consumers only. They must not create their own query
  routing, partition resolution, or caching logic.
- The executor is scoped to the service's identity for session tracking.

## 14. Non-Negotiable Anti-Patterns

1. Direct writes to metadata tables from runtime driver code.
2. Direct service replica startup outside `ServiceLifecycleManager`.
3. Ingress handlers that bypass canonical `Service_Message` translation.
4. Parallel lifecycle owners for built-ins vs userland services.
5. Local cache mutation outside CDC/bootstrap hydration ownership.
6. Service replicas creating their own query routing or partition resolution
   instead of using `replicaContext.queryExecutor`.

## 15. Related Docs

1. `docs/component-distribution.md` (package identity, OCI refs, dependency locks)
2. `docs/admin-migration-guide.md` (migration to meta-service owned admin paths)
3. `docs/runtime-ownership-rollout-runbook.md` (phase rollout and rollback)
4. `docs/steering/architecture.md` (active ownership model)
