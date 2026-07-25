---
audience: human
---

# WASM Services Architecture and Current Runtime Guide

This guide covers the two current `wasm_component` runtime axes: the
Artifact / Binding / Cell deployment surface, and the older callback rehearsal
machinery that predates it.

Current runtime support is machine-readable in
[`service-portability-capabilities.json`](service-portability-capabilities.json).
Its repository path is `docs/service-portability-capabilities.json`.
**Service portability status:** external services are deployed through
INSTALL SERVICE and CREATE BINDING (section 5); a Binding-derived Cell runs a
genuine WASI component with budget and declared-table enforcement. The
[`request-binding-deployment`](../examples/request-binding-deployment/README.md)
example runs this end to end locally. The
`wasm_component` *callback* example is a separate, older axis: it wraps
JavaScript source in a `js_wasm_component_v1` envelope and evaluates it as
JavaScript. It is not a WebAssembly binary or component.
Managed OCI container execution is not implemented yet, and OCI callback
invocation remains unsupported.

These capability states change together when a runtime capability actually
lands; the JSON matrix above is always the authoritative implementation claim.

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

## 2. Prerequisites (JavaScript Callback Examples)

1. Node is running (`npm start`), and you know the admin WebSocket port.
   - Default port: REST port + 1 (`8081` when REST uses `8080`)
2. You can connect to the admin stream:
   - `ws://<node-host>:8081/api/admin/stream`
3. Use the JavaScript callback examples under `examples/distributed-sql/`.
   Genuine component binaries are not accepted by the active callback loader.

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

## 4. Legacy Callback Module Upload

This path serves the callback axis only. `code`, `module_manifests`, and
callback registrations are legacy internal substrate, not peers of
Artifact / Binding / Cell; external service payloads are distributed through
`INSTALL SERVICE` (section 5) instead.

The callback upload workflow is:

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

## 5. Deploy an External Service: Artifact / Binding / Cell

Deployment uses exactly three concepts:

- **Artifact** — an installed, immutable package: a validated manifest plus a
  digest-pinned payload, identified by `(package_id, manifest_digest)`.
- **Binding** — the only durable user declaration of execution intent. It pins
  an Artifact export to a typed source (`request`, `change`, `time`, `once`,
  `boot`, `call`, or `pushdown`) with explicit budgets. Bindings are immutable
  and carry no replica intent.
- **Cell** — a Binding-derived actual that the runtime lifecycle reports ready
  and running. Replica capacity and placement are system-policy output, never
  a caller request.

The full architecture is
[`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md).
All three statements below travel over the standard SQL ingress with exactly
one JSON string bind parameter (`$1`).

### 5.1 Install the Artifact

```sql
INSTALL SERVICE $1;
```

with a payload of the form:

```json
{
  "artifact_source": {"kind": "remote_oci"},
  "idempotency_key": "install-acme-hello-1",
  "manifest": { "...": "external service manifest (see architecture/lagrange-service-manifest.md)" }
}
```

The install catalog validates the manifest, records the package, and projects
the bindable Artifact identity: `package_id`
(`service-package-<64 hex>`) and `manifest_digest` (`sha256:<64 hex>`, taken
over the exact canonical normalized manifest bytes).

```sql
SELECT package_id, manifest_digest, name, version
FROM service_packages;
```

`UPGRADE $1` (same payload fields) records a new package revision;
`REMOVE $1` (`{idempotency_key, service_name}`) retires it. `SHOW SERVICES`
and `SHOW SERVICE $1` project catalog state.

### 5.2 Declare the Binding

```sql
CREATE BINDING $1;
```

```json
{
  "schema_version": 2,
  "name": "acme-hello",
  "target": {
    "package_id": "service-package-<64 hex>",
    "manifest_digest": "sha256:<64 hex>",
    "export_name": "serve"
  },
  "source": {"kind": "request", "method": "GET", "path": "/acme/hello"},
  "budgets": {
    "cpu_time_ms": 100,
    "wall_time_ms": 1000,
    "memory_bytes": 33554432,
    "input_bytes": 1048576,
    "output_bytes": 1048576,
    "context_bytes": 1048576
  }
}
```

Source shapes are closed per kind: `request` takes `method` + static `path`;
`change` takes `operations` + `tables`; `time` takes `interval_ms`; `call` and
`pushdown` take a registration `name`; `once` and `boot` take only `kind`.
The `export_name` must match a manifest export whose `interface` corresponds
to the source kind (`request` → `request_v1`, and so on). There is no replica
field anywhere in a Binding: the compiled desired row carries
`replica_count = 0` as a non-authoritative sentinel, and actual Cell capacity
is owned by the system placement policy.

### 5.3 Authorize Table Access (Direct Runtime Policy)

Table authorization is runtime access-policy configuration, applied to an
existing Binding by name — it is never declared in the Artifact manifest:

```sql
CONFIGURE SERVICE ACCESS $1;
```

```json
{
  "schema_version": 1,
  "binding_name": "acme-hello",
  "tables": [
    {"slot": 0, "table": "table:global.orders", "operations": ["read", "write"]}
  ]
}
```

Access to any table outside the configured policy is denied at the component
boundary. Observed access is decaying affinity telemetry and never grants
authority.

### 5.4 Convergence to a Ready Cell

One owner chain activates every Binding source kind:

1. `ServiceDefinitionsOwner` reconciles immutable Binding lineage into desired
   state and activates explicitly enabled source kinds.
2. `RuntimeServiceRebalancerOwner` admits active lineage to exactly one
   system-policy-owned `UnifiedRebalancer`, which owns replica capacity and
   placement.
3. `ServiceRuntimeLifecycle`, `RuntimeDriverRegistry`, and
   `WasmComponentDriver` load the manifest-pinned payload, instantiate the
   export as a genuine WASI component, and enforce declared-table context and
   budgets. Only an actual reported ready and running is a Cell.

Verify:

```sql
SELECT service_id, node_id, status, address
FROM services
WHERE service_id LIKE '%acme-hello%';
```

```sql
SELECT endpoint_id, service_id, node_id, protocol, address, port, health_status
FROM service_endpoints
WHERE service_id LIKE '%acme-hello%';
```

For a `request` Binding, an authenticated HTTP request whose method and static
path match the Binding is resolved to a current ready Cell and returns the
component's status, headers, and body. Invocation for the other source kinds
(timer firing, CDC dispatch, statement/query invocation, bootstrap hooks) is
declared by the Binding but cut over separately; placement and readiness do
not depend on it.

### 5.5 Run the Request Binding Example

This example builds a genuine component from WAT source, packages it
as a reproducible local OCI layout, boots a disposable local node, submits all
three lifecycle statements through the authenticated PostgreSQL adapter, and
invokes the resulting ready Cell over HTTP:

```bash
node examples/request-binding-deployment/run-request-binding-deployment.js
```

It verifies the component's `202` status, response header, and body; a declared
table write; denial of undeclared table slot 1; and zero component invocations
for an unmatched route. Prerequisites and the exact scope are in
[`examples/request-binding-deployment/README.md`](../examples/request-binding-deployment/README.md).

## 6. Administer Existing Services

Binding-managed services are administered through the lifecycle statements in
section 5 (`INSTALL SERVICE`, `UPGRADE`, `REMOVE`, `SHOW SERVICES`,
`CONFIGURE SERVICE ACCESS`, `CREATE BINDING`). Bindings are immutable: a
change in intent is a new Binding generation, not an update. There is no user
scaling operation — replica capacity is system-policy output.

Direct writes to `service_definitions`, `services`, or `service_endpoints`
are internal substrate operations, not a user surface; those tables are
owned by the control-plane owners.

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

This runner proves callback routing and lifecycle scaffolding. Its
`js_wasm_component_v1` artifact contains JavaScript bytes, so a green run is not
evidence of component compilation or execution.

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

These commands are internal substrate for embedders and diagnostics. They are
not the deployment declaration surface — user deployment is declared through
the lifecycle SQL statements in section 5.

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

1. Error: `DeploymentBindingError` with an `INVALID_FIELD` path
   - The Binding payload must carry exactly the fields for its source kind
     (section 5.2); check the reported JSON-pointer path.
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
2. `docs/admin-api-reference.md` (meta-service owned admin actions and CLI contract)
3. `architecture/runtime-lifecycle.md` (active runtime ownership model)
