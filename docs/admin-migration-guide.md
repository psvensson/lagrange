# Admin Migration Guide

Migration from direct table writes and node-local admin handlers
to meta-service commands (`sys-admin-meta` and `sys-wasm-meta`).

## Why

The system enforces a single-path mutation contract: every write
flows through SQL/CDC, and every admin command is owned by a
replicated meta-service. Direct partition mutations and node-local
admin handlers are deprecated because they bypass the ownership
model, creating duplicate write paths and inconsistent state.

After migration, all mutations route through:

- `sys-admin-meta` — cluster/node state queries, cache dumps
- `sys-wasm-meta` — WASM module and service lifecycle

Ingress remains fixed on `ws://<host>:8081/api/admin/stream`, but this endpoint
is an adapter ingress only. It is not a node-local mutation owner.

Dispatchable admin messages (`query`, `partition_callback`, `refresh`) are
translated into canonical `Service_Message` envelopes before execution/dispatch.
This keeps one envelope contract across ingress protocols.

## Unified Service_Message Translation

`AdminWebSocketAPI` uses `adaptAdminMessageToServiceMessage(...)` to map
dispatchable admin messages into canonical envelopes:

1. `messageId`
2. `serviceId`
3. `serviceType`
4. `operation`
5. `payload`
6. `traceId`

Translated envelopes always execute through the `ServiceDispatcher` contract.
When no external dispatcher is injected, `AdminWebSocketAPI` creates a local
dispatcher shim that executes the same canonical envelope operations without
re-introducing legacy per-message handler branching.

## Unified Lifecycle Diagnostics Endpoint

Admin ingress exposes unified lifecycle diagnostics:

- `GET /api/admin/diagnostics/services`

Payload includes:

1. `reconciler` cycle/action stats and recent decisions.
2. `lifecycle` operation metrics and adapter selection counts.

## Before / After

### Direct table writes → MetaWriteExecutor

```javascript
// ❌ BEFORE: direct partition write
partition.apply({ sql: 'INSERT INTO nodes ...', params });

// ✅ AFTER: route through SQL/CDC via meta-service
// MetaWriteExecutor (src/wasm-service/meta-write-executor.js)
// produces SQL statements executed by SqlCore, which generates
// CDC events that update all node caches.
const result = handleCreateService({
  serviceId: 'my-svc',
  serviceName: 'My Service',
  handlerFunctionId: 'handler-1',
  replicaCount: 3,
});
// result.sql and result.params are executed by SqlCore
```

### Node-local admin handler → AdminApiAdapter

```javascript
// ❌ BEFORE: custom WebSocket handler per action
ws.on('message', (msg) => {
  if (msg.type === 'query') {
    executeQueryDirectly(msg.sql);
  }
});

// ✅ AFTER: adapter dispatches to meta-service handlers
// AdminApiAdapter (src/admin/admin-api-adapter.js)
import {adaptAdminAction} from './admin-api-adapter.js';

// Non-WASM actions dispatch to sys-admin-meta handlers
const result = adaptAdminAction('listNodes', {}, cache);

// WASM actions auto-delegate to sys-wasm-meta
const wasmResult = adaptAdminAction(
  'publishModule', {manifest}, cache
);
```

### Direct WASM management → sys-wasm-meta commands

```javascript
// ❌ BEFORE: direct INSERT into module_manifests
const sql = 'INSERT INTO module_manifests ...';
partition.apply({sql, params});

// ✅ AFTER: use WASM_META_ACTION commands
// Meta command handlers (src/wasm-service/meta-command-handlers.js)
import {handlePublishModule} from
  '../wasm-service/meta-command-handlers.js';

const result = handlePublishModule({manifest});
// result.sql / result.params executed by SqlCore
```

## Available Commands

### sys-admin-meta (ADMIN_META_ACTION)

Defined in `src/admin/admin-meta-command-handlers.js`:

| Action | Handler | Purpose |
|--------|---------|---------|
| `executeQuery` | `handleExecuteQuery` | Run arbitrary SQL |
| `getCacheDump` | `handleGetCacheDump` | Dump system tables |
| `getNodeStatus` | `handleGetNodeStatus` | Query nodes table |
| `listServices` | `handleListServices` | Query services |
| `listNodes` | `handleListNodes` | List all nodes |
| `listPartitions` | `handleListPartitions` | List partitions |

### sys-wasm-meta (WASM_META_ACTION)

Defined in `src/constants/wasm-meta.js` and handled by
`src/wasm-service/meta-command-handlers.js`:

| Action | Handler | Purpose |
|--------|---------|---------|
| `publishModule` | `handlePublishModule` | Publish WASM module |
| `getModule` | `handleGetModule` | Fetch module by key |
| `listModules` | `handleListModules` | List modules |
| `createService` | `handleCreateService` | Create service def |
| `updateService` | `handleUpdateService` | Update service |
| `scaleService` | `handleScaleService` | Change replica count |
| `deleteService` | `handleDeleteService` | Soft-delete service |
| `getOperation` | `handleGetOperation` | Get async operation |
| `streamOperations` | — | Stream operation updates |

WASM actions received by `sys-admin-meta` are auto-delegated via
`AdminMetaDelegator` (`src/admin/admin-meta-delegator.js`), which
checks `WASM_DELEGATION_ACTIONS` and routes through
`MetaServiceRouter` to the `sys-wasm-meta` leader.

## Final-State Rules

The shipped model is hard-cutover:

1. All admin mutations route through `sys-admin-meta` or `sys-wasm-meta`.
2. Dispatchable websocket messages always translate to canonical
   `Service_Message` envelopes before execution.
3. Adapter ingress does not own lifecycle, metadata mutation, or placement.
4. SQL/CDC is the only metadata write path.
5. Legacy direct mutation and node-local ownership paths are not valid.

## CLI Compatibility

`AdminCliCompat` (`src/admin/admin-cli-compat.js`) preserves the
existing CLI WebSocket message contract.

The contract validates both directions:

**Incoming** (CLI → server):
- `query` — requires `type`, `queryId`, `sql`; optional `params`
- `refresh` — requires `type`

**Outgoing** (server → CLI):
- `query_result` — requires `type`, `queryId`, `timestamp`
- `cache_dump` — requires `type`, `timestamp`, `nodeId`, `data`
- `cdc_event` — requires `type`, `timestamp`, `table`,
  `operation`, `record`
- `error` — requires `type`, `timestamp`, `error`, `errorCode`

Use `validateIncomingMessage()` and `validateOutgoingMessage()`
to verify messages conform to the contract. The adapter layer
translates between these CLI message formats and the meta-service
command handler interface, so CLI users see no change.

## Related Docs

1. `docs/wasm-services-user-guide.md`
2. `docs/runtime-ownership-rollout-runbook.md`
3. `.kiro/steering/architecture.md`
