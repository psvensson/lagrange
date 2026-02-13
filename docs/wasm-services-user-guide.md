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

## 7. Operational Queries

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

## 8. Internal Meta Command Surface (For Embedders)

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

## 9. Troubleshooting

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

## 10. Current Implementation Notes

1. The external node API exposes SQL/refresh over WebSocket on fixed port
   `8081` as the stable user ingress.
2. The node ingress is adapter-only; mutation ownership is in replicated
   meta-service handlers.
3. `streamOperations` exists in command constants; polling `wasm_operations` is
   the practical operator workflow unless stream wiring is enabled in your
   branch.

## 11. Related Docs

1. `docs/component-distribution.md` (package identity, OCI refs, dependency locks)
2. `docs/admin-migration-guide.md` (migration to meta-service owned admin paths)
3. `docs/runtime-ownership-rollout-runbook.md` (phase rollout and rollback)
4. `.kiro/steering/architecture.md` (active ownership model)
