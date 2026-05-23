# Operational Appendices And Archived Patterns

Error-handling, testing, Kubernetes endpoint sync, and discovery-surface appendix material retained from the former monolithic architecture document.

## Error Handling

- Try/catch errors MUST NOT be swallowed
- Errors must be re-thrown or clearly logged
- No try/catch for conditionals or communication flow
- Transient errors (no leader, cache unavailable) trigger retries

## Testing

- Node.js built-in test runner with tap
- Property-based testing with fast-check (max 10 iterations)
- Unit tests must remain within `UNIT_TEST_TIMEOUT_MS`
  (`src/test-helpers/test-timeout-constants.js`)
- No skipped tests allowed

## Kubernetes Endpoint Sync Controller

Kubernetes integration for runtime-managed replicated services uses a
projection controller model. Ownership remains split by concern:

1. Internal runtime ownership (`ServiceLifecycleManager`, `ServiceRuntimeLifecycle`,
   rebalancer, operation journal) remains authoritative for placement, lifecycle,
   and endpoint publication in `service_endpoints`.
2. Kubernetes endpoint sync is projection-only: it reads canonical endpoint rows
   via admin stream query execution and reconciles selector-less `Service` plus
   managed `EndpointSlice` resources.
3. The sync controller does not perform internal placement, does not mutate
   system tables, and does not introduce a parallel metadata store.

### Endpoint Sync Runtime Modules

Primary modules:

1. `src/runtime/endpoint-sync-config.js` — env contract parsing and validation.
2. `src/runtime/endpoint-sync-source-client.js` — admin stream source query with
   retries and typed failures.
3. `src/runtime/endpoint-sync-source-query.js` — source SQL builder and endpoint
   row normalization/filtering.
4. `src/runtime/endpoint-sync-naming.js` — deterministic DNS-1123 naming with
   hash truncation.
5. `src/runtime/endpoint-sync-planner.js` — logical service grouping, strict
   port validation, EndpointSlice chunk planning.
6. `src/runtime/endpoint-sync-k8s-reconciler.js` — upsert/GC reconciliation for
   managed `Service` and `EndpointSlice`, with per-group failure continuation.
7. `src/runtime/endpoint-sync-controller.js` — run-once orchestration of
   source -> filter -> plan -> reconcile with leader/follower write gating.
8. `src/runtime/endpoint-sync-leader-election.js` — Kubernetes Lease-based
   leadership election (`coordination.k8s.io/v1` Lease).
9. `src/runtime/endpoint-sync-metrics.js` — in-memory metric storage for
   reconcile duration/failures and exported object counts.
10. `src/runtime/endpoint-sync-k8s-client.js` — in-cluster Kubernetes API
    adapter implementing Service/EndpointSlice/Lease/Event operations.
11. `src/runtime/service-discovery-catalog.js` — reusable discovery catalog
    builder that reuses endpoint-sync normalization/filtering/grouping for
    non-Kubernetes consumers.

### Endpoint Sync Safety and Observability

1. Leader election is lease-backed. Only the lease holder performs reconcile
   writes; followers no-op for write safety in multi-replica deployments.
2. Structured logs include one reconcile summary per cycle and per-group
   projection failures with `serviceKey`, `serviceName`, `protocol`, and stage.
3. Group-level projection failures emit Kubernetes warning Events when the
   Kubernetes client provides `recordEvent(...)`.
4. Metrics snapshot includes:
   `endpoint_sync_reconcile_duration_ms`,
   `endpoint_sync_reconcile_failures_total`,
   `endpoint_sync_exported_services`,
   `endpoint_sync_exported_endpoints`,
   `endpoint_sync_port_conflict_total`.

### Managed Resource Identity

Managed Kubernetes objects are identified by labels:

1. `endpointsync.system/managed=true`
2. `endpointsync.system/source=service_endpoints`
3. `endpointsync.system/service-key=<logical-service|protocol>`

Garbage collection is scoped strictly to resources carrying managed labels.

### General Service Discovery Surface

The endpoint-sync discovery model is also exposed for general consumers:

1. `AdminWebSocketAPI` serves `GET /api/admin/discovery/services` from local
   `SystemTableCache` rows only (no distributed query fanout). This surface is
   diagnostics-only and must not be used for routing, leader discovery, or
   data-plane decisions.
2. `SELECT * FROM service_discovery_local()` is intercepted as a local-only
   admin query shortcut for compatibility clients on `/api/admin/stream`. It is
   likewise diagnostics-only and non-authoritative.
3. Both surfaces return the same catalog shape: logical service key
   (`logicalServiceName|protocol`), observed replicas, per-replica endpoint
   details, and desired replica counts sourced from `service_definitions`.
4. When authoritative discovery is required, callers must use the canonical
   replicated SQL/MessageRouter path rather than these local compatibility
   surfaces.
