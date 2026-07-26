---
audience: human
---

# Storage Capacity Operations Guide

Operator reference for node storage budgets, capacity diagnostics,
and admission mode management.

The budgets configured here feed storage-capacity-aware placement in the
rebalancer (see [../architecture/rebalance.md](../architecture/rebalance.md));
the diagnostics are served through the admin ingress described in
[admin-api-reference.md](admin-api-reference.md).

## Configuring Node Storage Budgets

Each node declares a storage budget at startup. The budget determines
how much data (partition replicas, message groups, service replicas)
the node is willing to host.

### Startup Configuration

Set one of the following in node configuration:

- `node.storageBudgetBytes` — absolute byte budget (e.g., `107374182400`
  for 100 GiB)
- `node.storageBudgetRatio` — fraction of physical disk capacity
  (e.g., `0.8` for 80%)

If both are provided, `storageBudgetBytes` takes precedence.

Invalid values (non-positive, exceeding physical disk, malformed) cause
a startup failure with a descriptive error. Nodes without a resolved
budget are not eligible for replica placement.

### Budget Persistence

On startup, `NodeStorageBudgetService` resolves the budget and writes
it to the `nodes` system table:

- `storage_budget_bytes` — resolved value in bytes
- `storage_budget_source` — `absolute` or `ratio`
- `storage_budget_updated_at` — resolution timestamp

## Capacity Diagnostics

### Viewing Capacity Snapshots

Capacity snapshots are derived per-node projections showing current
storage utilization. Query via admin SQL:

```sql
SELECT node_id, storage_budget_bytes, storage_budget_source
FROM nodes
WHERE storage_budget_bytes IS NOT NULL;
```

### Viewing Active Reservations

In-flight storage reservations are tracked in the
`storage_reservations` system table:

```sql
SELECT reservation_id, operation_id, node_id,
       estimated_bytes, status, created_at, expires_at
FROM storage_reservations
WHERE status != 'released';
```

### Metrics

`StorageCapacityMetrics` exposes per-node counters:

- `storage_budget_bytes` — configured budget
- `storage_used_bytes` — bytes consumed by active replicas
- `storage_reserved_bytes` — bytes reserved by in-flight operations
- `storage_available_bytes` — remaining allocatable bytes
- `storage_pressure_state` — current pressure classification
- `storage_admission_allowed_total` — admission allow count
- `storage_admission_denied_total` — admission deny count

### Structured Logs

Admission decisions are logged with reason codes:

- `admission_allowed` — operation admitted with projected utilization
- `admission_denied` — operation rejected with reason code and
  projected utilization
- `reservation_created` / `reservation_released` — lifecycle events
- `pressure_state_changed` — node pressure transition

## Admission Mode Management

Storage admission supports two operational modes controlled by
`rebalancer.storageAdmissionMode`:

### Observe Mode

In observe mode, admission checks run and log decisions but do not
block operations. This is an explicit diagnostic mode; it is not the default.
Use it when:

- Validating budget values against real workloads
- Auditing admission decisions before enforcement

Admission logs in observe mode include the decision that would have
been enforced, allowing operators to verify correctness.

### Enforce Mode

In enforce mode, admission denials block storage-increasing
operations. This is the default. Before retaining or restoring enforce mode,
confirm:

1. All nodes have valid `storage_budget_bytes` values
2. Observe-mode logs show expected admission behavior
3. Reservation reconciliation has run at least once

Set `rebalancer.storageAdmissionMode` to `observe` or `enforce` in the cluster
configuration. Treat observe mode as a temporary operator choice because it
does not enforce storage safety decisions.

## Troubleshooting Low-Space Conditions

### Symptoms

- Replica ADD operations rejected with `insufficient_capacity`
- Split operations deferred with capacity reason codes
- Node pressure state at `hard` or `exhausted`

### Diagnosis

1. Check per-node utilization via capacity snapshot queries
2. Review `storage_reservations` for stale or orphaned entries
3. Check admission deny logs for reason codes and projected usage

### Resolution

- **Increase budget**: Update `node.storageBudgetBytes` and restart
  the affected node
- **Add nodes**: Scale the cluster to distribute storage load
- **Clear stale reservations**: Reconciliation runs periodically;
  verify via `storage_reservations` query that expired entries are
  cleaned up
- **Review pressure thresholds**: Adjust
  `rebalancer.storageSoftPressurePercent` and
  `rebalancer.storageHardPressurePercent` if defaults are too
  aggressive for the workload

### Pressure State Reference

| State | Utilization | Effect |
|-------|-------------|--------|
| normal | < 70% | All operations allowed |
| soft | 70–85% | Non-critical moves deprioritized |
| hard | 85–100% | Only critical operations with headroom |
| exhausted | >= 100% | Only critical operations with headroom |

## Configuration Reference

All storage capacity configuration keys and their defaults:

### Node Startup Keys

| Key | Type | Description |
|-----|------|-------------|
| `node.storageBudgetBytes` | integer | Absolute budget in bytes |
| `node.storageBudgetRatio` | float | Fraction of physical disk (0–1) |

If both are set, `storageBudgetBytes` takes precedence.

### Rebalancer/Storage Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `rebalancer.storageSoftPressurePercent` | integer | 70 | Soft pressure threshold |
| `rebalancer.storageHardPressurePercent` | integer | 85 | Hard pressure threshold |
| `rebalancer.storageReservationTtlMs` | integer | 300000 | Reservation expiry TTL (ms) |
| `rebalancer.storageEmergencyHeadroomPercent` | integer | 5 | Critical-only headroom |
| `rebalancer.minimumReplicaBytes` | integer | 1 MiB | Floor for size estimation |
| `rebalancer.splitAmplificationFactor` | integer | 2 | Split write-amplification multiplier |
| `rebalancer.partitionReplicaOverheadBytes` | integer | 10 MiB | Per-partition overhead |
| `rebalancer.messageGroupReplicaOverheadBytes` | integer | 1 MiB | Per-message-group overhead |
| `rebalancer.serviceReplicaOverheadBytes` | integer | 5 MiB | Per-service overhead |
| `rebalancer.storageAdmissionMode` | string | `enforce` | `observe` or `enforce` |
