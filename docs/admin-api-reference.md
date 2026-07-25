---
audience: human
---

# Admin API Reference

How admin commands are structured and routed. All admin mutations are owned
by two replicated meta-services; the WebSocket endpoint is an adapter ingress
only, never a node-local mutation owner:

- `sys-admin-meta` — cluster/node state queries, cache dumps
- `sys-wasm-meta` — WASM module and service lifecycle

Ingress defaults to `ws://<host>:8081/api/admin/stream` (REST port + 1) and can
be overridden with `ADMIN_WS_PORT`. Dispatchable admin messages
(`query`, `partition_callback`, `refresh`) are translated into
canonical `Service_Message` envelopes (`messageId`, `serviceId`,
`serviceType`, `operation`, `payload`, `traceId`) by
`adaptAdminMessageToServiceMessage(...)` before execution, so one envelope
contract holds across ingress protocols. Every metadata write flows through
SQL/CDC.

Admin ingress supports the current `observe` and `enforce` enforcement modes
from `ADMIN_ENFORCEMENT_MODE`; the configured default is `enforce`. Observe mode
logs deprecated-path use without permitting a second mutation owner. Enforce
mode rejects deprecated direct mutations with `BYPASS_REJECTED`. Runtime
ownership remains with the replicated meta-services in both modes.

OCI runtime descriptors are recognized only when
`oci_container_enabled` is enabled. The default is disabled, and the current
OCI implementation is a descriptor and in-memory lifecycle scaffold rather
than real container activation.

## sys-admin-meta Actions (ADMIN_META_ACTION)

Defined in `src/admin/admin-meta-command-handlers.js`:

| Action | Handler | Purpose |
|--------|---------|---------|
| `executeQuery` | `handleExecuteQuery` | Run arbitrary SQL |
| `getCacheDump` | `handleGetCacheDump` | Dump system tables |
| `getNodeStatus` | `handleGetNodeStatus` | Query nodes table |
| `listServices` | `handleListServices` | Query services |
| `listNodes` | `handleListNodes` | List all nodes |
| `listPartitions` | `handleListPartitions` | List partitions |

WASM actions received by `sys-admin-meta` are auto-delegated via
`AdminMetaDelegator` (`src/admin/admin-meta-delegator.js`), which checks
`WASM_DELEGATION_ACTIONS` and routes through `MetaServiceRouter` to the
`sys-wasm-meta` leader. The `sys-wasm-meta` command surface
(`publishModule`, `createService`, `scaleService`, ...) is internal substrate
for embedders and diagnostics, documented in
`docs/wasm-services-user-guide.md` (section "Internal Meta Command
Surface"). It is not the deployment path: services are deployed through the
lifecycle SQL statements (`INSTALL SERVICE`, `CREATE BINDING`,
`CONFIGURE SERVICE ACCESS`) described in that guide's section 5.

## Operational Diagnostics Endpoints

Admin ingress exposes unified operational diagnostics:

- `GET /api/admin/diagnostics/services`
- `GET /api/admin/diagnostics/cdc`
- `GET /api/admin/diagnostics/partitions`
- `GET /api/admin/diagnostics/sql`

Payloads and interpretation are covered in
`docs/runtime-resource-diagnostics.md`.

## CLI WebSocket Message Contract

`AdminCliCompat` (`src/admin/admin-cli-compat.js`) defines the CLI
WebSocket message contract, validated in both directions:

**Incoming** (CLI -> server):

- `query` — requires `type`, `queryId`, `sql`; optional `params`
- `refresh` — requires `type`

**Outgoing** (server -> CLI):

- `query_result` — requires `type`, `queryId`, `timestamp`
- `cache_dump` — requires `type`, `timestamp`, `nodeId`, `data`
- `cdc_event` — requires `type`, `timestamp`, `table`,
  `operation`, `record`
- `error` — requires `type`, `timestamp`, `error`, `errorCode`

Use `validateIncomingMessage()` and `validateOutgoingMessage()` to verify
messages conform to the contract. The adapter layer translates between
these CLI message formats and the meta-service command handler interface.

## Related Docs

1. `docs/wasm-services-user-guide.md`
2. `docs/runtime-resource-diagnostics.md`
