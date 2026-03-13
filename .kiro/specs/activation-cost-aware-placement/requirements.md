# Requirements Document

## Introduction

Lagrange's placement and rebalancing system today is purely storage-dimensional.
Before OCI container services go live, the system must factor compute readiness
cost — dominated by container image pull time — into placement, admission, and
rebalance decisions. This feature introduces image presence tracking per node,
activation-cost-aware scoring in MovePlanner, a durable "wait for image
readiness" workflow step, admission gating against timeout budgets, background
pre-pull logistics, image garbage collection, and developer feedback tooling so
service authors understand the cost of their packaging choices.

The key metric is the **mobility penalty ratio**: `T_image_ready / T_data_move`.
When this ratio exceeds 1.0, compute packaging dominates rebalance
responsiveness and the system must adapt placement strategy accordingly.

### Activation Class Taxonomy

| Class | Cold Activation Time | Placement Behavior |
|-------|---------------------|--------------------|
| A | < 2 s | Freely movable |
| B | 2–10 s | Movable with normal rebalance |
| C | 10–30 s | Prefer cached targets |
| D | > 30 s | Move only deliberately; maintain warm standbys |

### Phasing

- **Phase 0.5**: `lagrange service analyze` CLI, dev-install activation feedback
- **Phase 1.0**: Image presence tracking, activation-cost admission, readiness dimension
- **Phase 2.0**: Pre-pull logistics, layer sharing, GC policy, full activation-class-aware placement

## Glossary

- **Activation_Cost**: The estimated wall-clock time for a node to become ready
  to run a service, dominated by image pull duration for OCI container services.
- **Activation_Class**: A categorical classification (A/B/C/D) of a service's
  cold activation time, derived from compressed image size and estimated pull
  throughput.
- **Image_Presence_Cache**: A CDC-propagated system table (`node_image_presence`)
  tracking which OCI images are locally cached on each node, with size and
  last-used metadata.
- **Mobility_Penalty_Ratio**: The ratio `T_image_ready / T_data_move`; when
  greater than 1.0, image pull time dominates rebalance responsiveness.
- **MovePlanner**: The single placement planning owner that scores candidate
  nodes by load, latency group, topology diversity, and (with this feature)
  image locality.
- **StorageAdmissionService**: The single admission gate owner for placement
  decisions; activation cost becomes an additional input dimension.
- **ControlPlaneReadinessService**: The single readiness owner providing
  `repairEligible` and `serveEligible` dimensions; image readiness becomes a
  new dimension input.
- **DurableWorkflowCoordinator**: The reusable workflow runtime for durable
  owner-key workflow state and monotonic step transitions.
- **Pre_Pull**: A background operation that fetches an OCI image to a node
  before a placement decision requires it, reducing cold activation time.
- **Warm_Node**: A node that already has the required OCI image cached locally.
- **Image_GC_Policy**: A garbage collection policy for cached OCI images on
  nodes, using LRU eviction with pinning for images used by active services.
- **Registry_Locality**: Configuration that maps OCI registries to latency
  groups or node affinity for optimizing pull throughput.
- **Service_Manifest**: The declarative service definition including runtime
  kind, artifact reference, and activation class declaration.

## Requirements

### Requirement 1: Image Presence Tracking

**User Story:** As a cluster operator, I want the system to track which OCI
images are cached on each node, so that placement decisions can factor in
image locality.

#### Acceptance Criteria

1. THE Image_Presence_Cache SHALL record each cached OCI image per node with
   fields: `node_id`, `image_ref`, `image_digest`, `compressed_size_bytes`,
   `uncompressed_size_bytes`, `cached_at`, `last_used_at`, and `layer_count`.
2. WHEN an OCI image is successfully pulled to a node, THE Image_Presence_Cache
   SHALL insert a row for that node and image within the same operation that
   completes the pull.
3. WHEN an OCI image is evicted from a node, THE Image_Presence_Cache SHALL
   remove the corresponding row within the same operation that completes the
   eviction.
4. THE Image_Presence_Cache SHALL be a CDC-propagated system table so that
   MovePlanner and StorageAdmissionService on every node observe image locality
   without direct SQL queries during steady-state placement decisions.
5. WHEN a node restarts, THE Image_Presence_Cache SHALL reconcile its rows
   against the actual local image store and remove rows for images no longer
   present on disk.

### Requirement 2: Activation Class Derivation

**User Story:** As a service author, I want the system to classify my service's
cold activation cost, so that placement decisions reflect the real cost of
moving my service.

#### Acceptance Criteria

1. THE Activation_Class_Classifier SHALL derive an activation class (A, B, C,
   or D) from the compressed image size and a configurable estimated pull
   throughput parameter.
2. WHEN a service manifest declares an explicit `activation_class`, THE
   Activation_Class_Classifier SHALL validate the declared class against the
   measured image size and emit a warning if the declared class is more
   optimistic than the derived class.
3. WHEN a service manifest omits `activation_class`, THE
   Activation_Class_Classifier SHALL compute the class from the image artifact
   metadata and store the result in the `service_definitions` row.
4. THE Activation_Class_Classifier SHALL use the following thresholds: class A
   for estimated cold activation under 2 seconds, class B for 2–10 seconds,
   class C for 10–30 seconds, and class D for over 30 seconds.
5. WHEN the configurable pull throughput parameter changes, THE
   Activation_Class_Classifier SHALL recompute activation classes for all
   affected service definitions.

### Requirement 3: Activation-Cost-Aware Placement Scoring

**User Story:** As a cluster operator, I want the placement planner to prefer
nodes that already have the required image cached, so that rebalance operations
complete faster and service availability improves.

#### Acceptance Criteria

1. WHEN MovePlanner scores candidate nodes for an OCI container service,
   THE MovePlanner SHALL include an image locality score component that
   penalizes nodes lacking the required image in their Image_Presence_Cache.
2. THE MovePlanner SHALL weight the image locality penalty proportionally to
   the service's activation class: class A receives zero penalty, class B
   receives a low penalty, class C receives a moderate penalty, and class D
   receives a high penalty.
3. WHERE the placement policy specifies a `sticky_preference_strength`, THE
   MovePlanner SHALL multiply the image locality penalty by the configured
   strength factor.
4. WHERE the placement policy specifies `warm_node_bias`, THE MovePlanner
   SHALL apply an additional preference bonus to nodes that have the required
   image cached and have used it within a configurable recency window.
5. THE MovePlanner SHALL preserve existing scoring dimensions (CPU load,
   memory load, disk usage, latency group preference, topology diversity) and
   add image locality as an additional dimension, not a replacement.

### Requirement 4: Activation-Cost Admission Gating

**User Story:** As a cluster operator, I want the admission gate to reject
candidate nodes when the estimated image pull time would exceed the operation's
remaining timeout budget, so that rebalance operations do not time out waiting
for image readiness.

#### Acceptance Criteria

1. WHEN StorageAdmissionService evaluates a candidate node for an OCI container
   service placement, THE StorageAdmissionService SHALL estimate the activation
   time by computing the image pull duration from compressed image size and
   the configurable pull throughput parameter, adding a fixed activation
   overhead constant.
2. IF the estimated activation time exceeds the remaining timeout budget for
   the operation, THEN THE StorageAdmissionService SHALL deny the candidate
   with a typed `ACTIVATION_TIMEOUT_EXCEEDED` reason code.
3. WHEN a candidate node already has the required image in its
   Image_Presence_Cache, THE StorageAdmissionService SHALL set the estimated
   activation time to the fixed activation overhead only, bypassing the pull
   duration estimate.
4. THE StorageAdmissionService SHALL evaluate the full candidate set before
   rejecting the operation, consistent with the existing admission planning
   contract that evaluates all candidates rather than failing on the first
   denial.
5. IF no candidate node can satisfy the activation time constraint within the
   remaining timeout budget, THEN THE StorageAdmissionService SHALL fail the
   admission with structured rejection diagnostics including the estimated
   activation time per candidate and the remaining budget.

### Requirement 5: Image Readiness Workflow Step

**User Story:** As a cluster operator, I want rebalance and split workflows to
include a durable "wait for image readiness" step, so that the system tracks
image pull progress as part of the operation lifecycle rather than timing out
silently.

#### Acceptance Criteria

1. WHEN a rebalance or split operation targets a node that lacks the required
   OCI image, THE DurableWorkflowCoordinator SHALL insert a
   `WAIT_IMAGE_READINESS` step between the admission step and the data
   movement step.
2. WHILE the `WAIT_IMAGE_READINESS` step is active, THE
   DurableWorkflowCoordinator SHALL derive the step timeout from the
   remaining operation budget, not from a fresh default budget.
3. WHEN the target node confirms image presence in the Image_Presence_Cache
   via CDC propagation, THE DurableWorkflowCoordinator SHALL advance the
   workflow past the `WAIT_IMAGE_READINESS` step.
4. IF the `WAIT_IMAGE_READINESS` step exceeds its derived timeout, THEN THE
   DurableWorkflowCoordinator SHALL fail the step with a typed
   `IMAGE_READINESS_TIMEOUT` classification and transition the operation to
   a terminal failure state.
5. WHEN the target node already has the required image cached, THE
   DurableWorkflowCoordinator SHALL skip the `WAIT_IMAGE_READINESS` step
   entirely and proceed directly to the data movement step.

### Requirement 6: Image Readiness as a Readiness Dimension

**User Story:** As a cluster operator, I want image readiness to be visible as
a readiness dimension in ControlPlaneReadinessService, so that dispatch and
rebalance decisions account for nodes that are pulling images.

#### Acceptance Criteria

1. THE ControlPlaneReadinessService SHALL expose an `imageReady` readiness
   dimension per node per service definition, indicating whether the node has
   the required image cached.
2. WHILE a node is actively pulling an image for a pending operation, THE
   ControlPlaneReadinessService SHALL report the `imageReady` dimension as
   not ready for that service on that node.
3. THE ControlPlaneReadinessService SHALL derive the `imageReady` dimension
   from the Image_Presence_Cache via SystemTableCache, consistent with the
   existing cache-based readiness evaluation pattern.
4. WHEN the `imageReady` dimension transitions from not-ready to ready, THE
   ControlPlaneReadinessService SHALL emit a readiness transition event so
   that pending workflow steps can be notified through the existing
   owner-key reconcile queue.

### Requirement 7: Background Pre-Pull

**User Story:** As a cluster operator, I want the system to pre-pull images to
candidate nodes before placement decisions require them, so that activation
class C and D services can be moved without excessive delay.

#### Acceptance Criteria

1. WHERE a service's placement policy enables `pre_pull_eligible`, THE
   Pre_Pull_Service SHALL identify candidate nodes that are likely placement
   targets based on current MovePlanner scoring and initiate background image
   pulls to those nodes.
2. THE Pre_Pull_Service SHALL limit concurrent pre-pull operations per node to
   a configurable maximum to avoid saturating node network bandwidth.
3. THE Pre_Pull_Service SHALL prioritize pre-pull targets by activation class,
   pulling images for class D services before class C services.
4. WHEN a pre-pull operation completes, THE Pre_Pull_Service SHALL update the
   Image_Presence_Cache through the standard image presence write path.
5. IF a pre-pull operation fails, THEN THE Pre_Pull_Service SHALL log the
   failure with a typed reason code and retry with exponential backoff up to
   a configurable maximum retry count.

### Requirement 8: Layer Sharing Awareness

**User Story:** As a cluster operator, I want the placement planner to
recognize when multiple services share base image layers, so that co-locating
those services reduces total image pull cost.

#### Acceptance Criteria

1. THE Image_Presence_Cache SHALL track individual layer digests per cached
   image so that shared layers between images are identifiable.
2. WHEN MovePlanner scores a candidate node for an OCI container service, THE
   MovePlanner SHALL reduce the image locality penalty proportionally to the
   fraction of required layers already present on the node.
3. WHEN StorageAdmissionService estimates activation time for a candidate node,
   THE StorageAdmissionService SHALL subtract the size of already-present
   shared layers from the estimated pull size.
4. THE Layer_Sharing_Analyzer SHALL compute layer overlap between service
   images and expose the overlap fraction per node per service through
   SystemTableCache.

### Requirement 9: Image Garbage Collection

**User Story:** As a cluster operator, I want unused cached images to be
evicted from nodes according to a configurable policy, so that disk space is
reclaimed without removing images needed by active services.

#### Acceptance Criteria

1. THE Image_GC_Service SHALL evict cached images from a node when the total
   cached image size exceeds a configurable per-node image cache budget.
2. THE Image_GC_Service SHALL use LRU ordering based on the `last_used_at`
   field in the Image_Presence_Cache to select eviction candidates.
3. THE Image_GC_Service SHALL pin images that are referenced by any active
   service on the node and exclude pinned images from eviction.
4. WHEN an image is evicted, THE Image_GC_Service SHALL remove the
   corresponding Image_Presence_Cache row through the standard write path
   and delete the image data from the local store.
5. WHERE the placement policy specifies `warm_standby_count` for a service,
   THE Image_GC_Service SHALL pin the image on up to `warm_standby_count`
   additional nodes beyond those running the service, preventing eviction of
   warm standby images.

### Requirement 10: Registry Locality Configuration

**User Story:** As a cluster operator, I want to configure registry locality
so that image pulls prefer registries that are topologically close to the
pulling node, reducing pull latency.

#### Acceptance Criteria

1. THE Registry_Locality_Config SHALL allow mapping OCI registry endpoints to
   latency groups so that nodes prefer pulling from registries in the same or
   nearest latency group.
2. WHEN multiple registry mirrors are configured for the same image, THE
   OCI_Pull_Service SHALL select the mirror with the lowest estimated latency
   based on the pulling node's latency group assignment.
3. IF the preferred registry mirror is unavailable, THEN THE OCI_Pull_Service
   SHALL fall back to the next-nearest mirror and log a typed
   `REGISTRY_FALLBACK` reason code.
4. THE Registry_Locality_Config SHALL be stored in the `config` system table
   and propagated via CDC so that all nodes observe the same registry
   topology mapping.

### Requirement 11: Service Analyze CLI Command

**User Story:** As a service author, I want a CLI command that reports the
activation cost of my service package, so that I can make informed packaging
decisions before deploying.

#### Acceptance Criteria

1. WHEN `lagrange service analyze` is invoked with a path to a service
   artifact, THE CLI SHALL report: compressed size, uncompressed size,
   layer count, estimated cold activation time, and derived activation class.
2. WHEN the estimated activation class is C or D, THE CLI SHALL emit a
   recommendation suggesting packaging optimizations such as multi-stage
   builds, smaller base images, or WASM as an alternative runtime.
3. THE CLI SHALL compute the estimated cold activation time using the same
   algorithm and default pull throughput parameter as the
   Activation_Class_Classifier.
4. THE CLI SHALL support both local directory paths and OCI registry
   references as input.
5. WHEN the artifact is not a valid OCI image or WASM module, THE CLI SHALL
   return a descriptive error identifying the expected artifact format.

### Requirement 12: Dev-Install Activation Feedback

**User Story:** As a service author, I want `lagrange service dev-install` to
report activation cost immediately, so that I get fast feedback on the impact
of my packaging choices during development.

#### Acceptance Criteria

1. WHEN `lagrange service dev-install` completes artifact preparation, THE
   CLI SHALL display the compressed size, estimated cold activation time, and
   derived activation class before proceeding with installation.
2. WHEN the derived activation class is C or D, THE CLI SHALL display a
   warning with a recommendation to reduce image size.
3. THE CLI SHALL use the same activation class derivation logic as the
   Activation_Class_Classifier to ensure consistency between dev-install
   feedback and runtime placement behavior.

### Requirement 13: SQL Activation Metrics

**User Story:** As a cluster operator, I want to query per-service activation
metrics via SQL, so that I can monitor activation cost across the cluster using
standard tooling.

#### Acceptance Criteria

1. WHEN `SHOW SERVICE ACTIVATION` is executed, THE SQL_Engine SHALL return
   one row per service definition with: `service_id`, `runtime_kind`,
   `activation_class`, `compressed_size_bytes`, `estimated_cold_activation_ms`,
   `warm_node_count`, and `total_node_count`.
2. WHEN `SHOW SERVICE ACTIVATION` is executed with a `WHERE service_id = ?`
   filter, THE SQL_Engine SHALL return the row for the specified service only.
3. THE SQL_Engine SHALL derive `warm_node_count` from the Image_Presence_Cache
   by counting nodes that have the service's required image cached.
4. THE SQL_Engine SHALL derive `estimated_cold_activation_ms` using the same
   algorithm as the Activation_Class_Classifier.

### Requirement 14: Manifest Activation Class Declaration

**User Story:** As a service author, I want to declare an activation class in
my service manifest, so that the system respects my intent for placement
stickiness without re-deriving the class from image size alone.

#### Acceptance Criteria

1. THE Service_Manifest SHALL accept an optional `activation_class` field with
   valid values A, B, C, or D.
2. WHEN a manifest declares `activation_class`, THE
   Activation_Class_Classifier SHALL use the declared value as the effective
   class for placement and admission decisions.
3. WHEN a manifest declares an `activation_class` that is more optimistic than
   the size-derived class, THE Activation_Class_Classifier SHALL emit a
   validation warning but accept the declared class.
4. WHEN a manifest declares an `activation_class` that is more conservative
   than the size-derived class, THE Activation_Class_Classifier SHALL accept
   the declared class without warning.

### Requirement 15: Placement Policy Knobs

**User Story:** As a cluster operator, I want configurable placement policy
parameters for activation cost behavior, so that I can tune the tradeoff
between placement optimality and activation speed per table or service.

#### Acceptance Criteria

1. THE Placement_Policy SHALL accept a `sticky_preference_strength` parameter
   (numeric, 0.0 to 1.0) controlling how strongly MovePlanner prefers nodes
   with cached images.
2. THE Placement_Policy SHALL accept a `warm_node_bias` parameter (boolean)
   enabling additional preference for nodes that have recently used the
   required image.
3. THE Placement_Policy SHALL accept a `pre_pull_eligible` parameter (boolean)
   enabling background pre-pull for the service.
4. THE Placement_Policy SHALL accept a `warm_standby_count` parameter
   (non-negative integer) specifying how many additional nodes beyond active
   replicas should keep the image pinned.
5. WHERE `sticky_preference_strength` is set to 0.0, THE MovePlanner SHALL
   apply zero image locality penalty, making placement purely
   storage-and-load-dimensional as it is today.
6. THE Placement_Policy parameters SHALL be stored in the `table_policies`
   or `service_definitions` row and propagated via CDC.

### Requirement 16: Pull Progress Reporting

**User Story:** As a cluster operator, I want to observe image pull progress
for in-flight operations, so that I can diagnose slow activations and estimate
remaining wait time.

#### Acceptance Criteria

1. WHILE an OCI image pull is in progress on a node, THE OCI_Pull_Service
   SHALL emit structured progress events via the Event Emission API with
   fields: `node_id`, `image_ref`, `bytes_pulled`, `total_bytes`,
   `elapsed_ms`, and `estimated_remaining_ms`.
2. THE OCI_Pull_Service SHALL emit progress events at a configurable interval,
   defaulting to every 5 seconds.
3. WHEN an image pull completes, THE OCI_Pull_Service SHALL emit a terminal
   completion event with the final pull duration and throughput.
4. WHEN an image pull fails, THE OCI_Pull_Service SHALL emit a terminal
   failure event with a typed reason code.
