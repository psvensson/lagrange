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

## Staged Rollout

### Phase 1: Deploy with `observe` enforcement mode

Set `AdminWebSocketAPI` enforcement mode to
`ADMIN_ENFORCEMENT_MODE.OBSERVE`. This maps to
`MUTATION_GUARD_MODE.WARN` in the adapter guard.

```javascript
import {
  guardMutation, MUTATION_GUARD_MODE,
} from './admin-mutation-guard.js';

const check = guardMutation(action, MUTATION_GUARD_MODE.WARN);
// check.allowed === true even for deprecated paths
// check.warning is set for deprecated paths
```

In this phase:
- All existing code paths continue to work
- Deprecation warnings are logged for bypass paths
  (`DEPRECATION_WARNING.DIRECT_MUTATION`,
   `DEPRECATION_WARNING.DIRECT_CACHE_WRITE`,
   `DEPRECATION_WARNING.LEGACY_ADMIN_HANDLER`)
- `isDeprecatedPath()` from `src/admin/admin-deprecation.js`
  identifies any action not in the known meta-service action set
- Monitor logs for deprecation warnings to find remaining callers

### Phase 2: Switch to `enforce` enforcement mode

Once all callers have migrated, set
`ADMIN_ENFORCEMENT_MODE.ENFORCE`. This maps to
`MUTATION_GUARD_MODE.REJECT`:

```javascript
const check = guardMutation(action, MUTATION_GUARD_MODE.REJECT);
// check.allowed === false for deprecated paths
// check.error === 'Direct mutation path is rejected.
//   Use meta-service commands.'
// check.code === 'BYPASS_REJECTED'
```

In this phase:
- Deprecated paths return hard errors
- Any missed callers surface immediately as failures
- Meta-service commands are the only working path

### Phase 3: Remove deprecated code

- Remove direct partition write call sites
- Remove node-local admin handlers that bypassed the adapter
- Remove `warn` mode branches from guard logic
- The adapter layer (`AdminApiAdapter`) remains as the stable
  entry point forwarding to meta-service handlers

## CLI Compatibility

`AdminCliCompat` (`src/admin/admin-cli-compat.js`) preserves the
existing CLI WebSocket message contract during the transition.

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

## Deprecation Timeline

| What | Status | Removal |
|------|--------|---------|
| Direct partition writes for system data | Deprecated | Phase 3 |
| Node-local admin mutation handlers | Deprecated | Phase 3 |
| Direct cache writes | Deprecated | Phase 3 |
| `AdminApiAdapter` (compatibility layer) | Active | Retained |
| `AdminCliCompat` (CLI contract) | Active | Retained |
| `MUTATION_GUARD_MODE.WARN` | Active | Phase 3 |

Actions identified as deprecated by `isDeprecatedPath()` are any
action string not present in `ADMIN_META_ACTION` or
`WASM_META_ACTION`. The known action sets are defined in:
- `src/admin/admin-meta-command-handlers.js` (ADMIN_META_ACTION)
- `src/constants/wasm-meta.js` (WASM_META_ACTION)

## Related Docs

1. `docs/wasm-services-user-guide.md`
2. `docs/runtime-ownership-rollout-runbook.md`
3. `.kiro/steering/architecture.md`
