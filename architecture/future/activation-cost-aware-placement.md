# Activation-Cost-Aware Placement

## Status

Planned. Spec at `.kiro/specs/activation-cost-aware-placement/`.

## Problem

Lagrange's placement and rebalancing system is purely storage-dimensional.
When OCI container services go live, image pull time becomes the dominant
factor in compute readiness. A node lacking the required image may need
tens of seconds to pull it, making image locality the primary determinant
of rebalance responsiveness.

The key metric is the mobility penalty ratio: `T_image_ready / T_data_move`.
When this ratio exceeds 1.0, compute packaging dominates rebalance
responsiveness and the system must adapt placement strategy accordingly.

## Approach: External Registry with Metadata Tracking

This is the near-term implementation. Images are pulled from external OCI
registries to each node's local container runtime store. The system tracks
image locality metadata in system tables to inform placement decisions.

### Activation Class Taxonomy

Services are classified by cold activation time:

| Class | Cold Activation | Placement Behavior |
|-------|----------------|--------------------|
| A | < 2 s | Freely movable |
| B | 2–10 s | Movable with normal rebalance |
| C | 10–30 s | Prefer cached targets |
| D | > 30 s | Move deliberately; warm standbys |

### Component Ownership

| Concern | Owner | Extension Point |
|---------|-------|-----------------|
| Image presence metadata | `ImagePresenceWriter` | `node_image_presence` system table |
| Activation class derivation | `ActivationClassClassifier` | `service_definitions.activation_class` |
| Image locality scoring | `MovePlanner` | New dimension in `sortNodesBySuitability` |
| Activation-cost admission | `StorageAdmissionService` | Budget check in `evaluateProvisioning` |
| Image readiness workflow | `DurableWorkflowCoordinator` | `WAIT_IMAGE_READINESS` step |
| Image readiness dimension | `ControlPlaneReadinessService` | `imageReady` per-service dimension |
| Background pre-pull | `PrePullService` | Reads MovePlanner scoring |
| Image GC | `ImageGCService` | LRU with pinning |
| Pull execution | `OciPullService` | Wraps container runtime pull |

### Data Flow

```
External OCI Registry
        │
        ▼ (pull)
Node Local Container Store (filesystem)
        │
        ▼ (metadata)
ImagePresenceWriter → node_image_presence (system table)
        │
        ▼ (CDC)
SystemTableCache (every node)
        │
        ├──▶ MovePlanner (image locality scoring)
        ├──▶ StorageAdmissionService (activation-cost gating)
        └──▶ ControlPlaneReadinessService (imageReady dimension)
```

### Key Design Decisions

1. Images stored on local filesystem, not in system tables. Only metadata
   is tracked in `node_image_presence` (CDC-propagated).

2. `node_image_presence` is `readinessRelevant: false` because image
   presence is a per-service dimension, not a global readiness gate.

3. `WAIT_IMAGE_READINESS` workflow step uses budget-derived timeouts,
   never fresh defaults. Follows the existing timeout budget tree contract.

4. Layer-level tracking (`node_image_layers`) is non-propagated due to
   high cardinality. Queried on-demand by `LayerSharingAnalyzer`.

### Limitations

- Requires external registry availability for initial pulls.
- Each node pulls independently — no intra-cluster image sharing.
- Large images still incur full pull cost on cold nodes.
- No deduplication of layer storage across the cluster.

These limitations motivate the future native artifact store design.

## Future Extension: Access-Pattern-Aware Placement

This document focuses on **activation cost** as an additional placement
dimension. A separate (future) dimension is **data-access affinity**:
placing replicas of a service nearer to the partitions it reads/writes most.

If/when implemented, the extension should follow existing ownership rules:

- **Telemetry**: derive per-service/partition access statistics from query
  execution metrics (high-churn data should remain non-propagated and
  queryable on demand).
- **Policy surface**: add policy knobs in `TablePolicyService` to control the
  weight of access affinity relative to capacity and activation cost.
- **Planner integration**: extend `MovePlanner.sortNodesBySuitability()` to
  incorporate affinity scoring while keeping a single placement path.
- **No parallel planner**: access-aware scoring must remain a dimension of the
  existing planner, not a new placement mechanism.

This is intentionally orthogonal to activation-cost scoring and should compose
with it as a weighted dimension rather than replacing storage or activation
gates.

### Phasing

- Phase 0.5: CLI tooling (`service analyze`, dev-install feedback)
- Phase 1.0: Image presence tracking, admission gating, workflow step,
  readiness dimension, placement scoring
- Phase 2.0: Pre-pull, layer sharing, GC, registry locality

## Relationship to Native Artifact Store

This design is intentionally compatible with the future native artifact
store (see `architecture/future/native-artifact-store.md`). When the
native store is implemented:

- `OciPullService` gains an internal source (cluster blob store) in
  addition to external registries.
- `node_image_presence` metadata remains the same — the source of the
  image changes, but the tracking model does not.
- `PrePullService` becomes simpler — distributing chunks from internal
  partitions rather than pulling from external registries.
- The activation class taxonomy and placement scoring are unchanged.
