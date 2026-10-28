---
audience: human
---

# Admin API Reference

How admin commands are structured and routed. The WebSocket endpoint is an
adapter ingress; its commands route through replicated meta-services:

- `sys-admin-meta` - cluster/node state queries, cache dumps
- `sys-wasm-meta` - WASM module and service lifecycle

Ingress defaults to `ws://<host>:8081/api/admin/stream` (REST port + 1) and can
be overridden with `ADMIN_WS_PORT`. Dispatchable admin messages
(`query`, `refresh`) are translated into
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
for embedders and diagnostics (also described in `docs/wasm-services-user-guide.md`).
It is not the public deployment path: services are deployed and operated
through the public lifecycle SQL statements (`INSTALL SERVICE`,
`UPGRADE SERVICE`, `REMOVE SERVICE`, `SHOW SERVICE`, `SHOW SERVICES`,
`CONFIGURE SERVICE ACCESS`, `CREATE BINDING`, `CALL BINDING`) documented in
[`docs/service-deployment-guide.md`](service-deployment-guide.md) and specified
in [`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md).

## Operational Diagnostics Endpoints

`PUT /api/admin/config/:configKey` and
`PATCH /api/admin/tables/:tableId/policy` report applied success only after
their semantic owner confirms one affected row through the mutation gateway.
An observed zero-row effect returns HTTP 409 with
`CONFIG_MUTATION_OBSERVATION_CHANGED` or
`TABLE_POLICY_MUTATION_OBSERVATION_CHANGED`. An uncertain count or pending
visibility returns HTTP 503 with the corresponding
`*_MUTATION_OUTCOME_UNCONFIRMED` code; this does not establish that the write
failed to commit. Gateway refusals retain their original error and mutation
outcome. Unconfirmed writes do not publish successful-write statistics,
invalidate the policy cache, or emit a policy-updated event.

The operator-only built-in PostgreSQL wire scale operation is
`POST /api/admin/services/sys-postgres-wire/scale`, with JSON
`{"replicaCount": 1, "runtimeConfig": {"host": "127.0.0.1", "authMode": "password", "tlsMode": "disable"}}`.
It delegates to `ServiceDefinitionsOwner` and reports
`scaleState: "desired_state_persisted"`. Placement, running listeners, and their
current configuration must be observed separately. Configuration applies when
a replica next starts; this operation does not restart existing listeners.
See [PostgreSQL wire scale operations](../architecture/postgres-wire.md#postgresql-wire-scale-operations)
for outcomes and the existing ingress trust requirements.

`POST /api/admin/logs/markers` records a fixed diagnostic marker through
`LogsOwner`. Its body is exactly `{"markerId":"operator-probe-1","message":"probe"}`.
The server supplies its node identity, timestamps, level and metadata. A confirmed
answer includes `markerState: "recorded"`, `logId`, `nodeId` and the original
`timestamp`. Repeating the same marker on the same ingress preserves the first
row. Different content or ingress node returns `LOG_MARKER_IDENTITY_CONFLICT`
(409); malformed intent returns `LOG_MARKER_REQUEST_INVALID` (400). An uncertain
write or unavailable authoritative observation returns
`LOG_MARKER_OUTCOME_UNCONFIRMED` (503), which does not prove that no write occurred.
A disconnected or timed-out client also has an unknown outcome. The operation
inherits the admin ingress bind/trust configuration; it adds no authentication
layer and accepts no arbitrary log fields or SQL.

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

- `query` - requires `type`, `queryId`, `sql`; optional `params`
- `refresh` - requires `type`

**Outgoing** (server -> CLI):

- `query_result` - requires `type`, `queryId`, `timestamp`
- `cache_dump` - requires `type`, `timestamp`, `nodeId`, `data`
- `cdc_event` - requires `type`, `timestamp`, `table`,
  `operation`, `record`
- `error` - requires `type`, `timestamp`, `error`, `errorCode`

Use `validateIncomingMessage()` and `validateOutgoingMessage()` to verify
messages conform to the contract. The adapter layer translates between
these CLI message formats and the meta-service command handler interface.

## Related Docs

1. `docs/wasm-services-user-guide.md`
2. `docs/runtime-resource-diagnostics.md`
