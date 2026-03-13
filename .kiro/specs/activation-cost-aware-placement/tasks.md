# Implementation Plan: Activation-Cost-Aware Placement

## Overview

Implementation is organized in three phases: Phase 0.5 (CLI tooling, no runtime changes), Phase 1.0 (core runtime: image presence tracking, activation class, admission gating, workflow step, readiness dimension, placement scoring), and Phase 2.0 (logistics: pre-pull, layer sharing, image GC, registry locality, pull progress). Each phase builds incrementally on the previous one. Property-based tests are integrated alongside their implementation tasks.

## Tasks

### Phase 0.5 — CLI Tooling (No Runtime Changes)

- [ ] 1. Implement activation class constants and classifier
  - [ ] 1.1 Create `src/runtime/activation-class-constants.js` with `ACTIVATION_CLASS` enum (A/B/C/D), `ACTIVATION_CLASS_THRESHOLD_MS` thresholds, and `ACTIVATION_CLASS_DEFAULT` pull throughput/overhead constants
    - Define all scalars as named constants
    - _Requirements: 2.1, 2.4_

  - [ ] 1.2 Create `src/runtime/activation-class-classifier.js` implementing `ActivationClassClassifier`
    - `classify(compressedSizeBytes)` → `{activationClass, estimatedColdActivationMs, pullDurationMs}`
    - `validateDeclaredClass(declaredClass, compressedSizeBytes)` → `{effectiveClass, warning}`
    - `estimateActivationTime(options)` → estimated ms accounting for presence and shared layers
    - Read `activation_pull_throughput_bytes_per_ms` and `activation_overhead_ms` from `configProvider`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 1.3 Write property tests for activation class classifier
    - [ ]* 1.3.1 **Property 3: Activation class derivation matches threshold ranges**
      - File: `test/runtime/activation-class-classifier.property.test.js`
      - Generator: `fc.nat()` for compressed size, `fc.integer({min: 1})` for throughput
      - **Validates: Requirements 2.1, 2.4**

    - [ ]* 1.3.2 **Property 4: Effective activation class resolution**
      - File: `test/runtime/activation-class-classifier.property.test.js`
      - Generator: `fc.oneof(fc.constant('A'), ..., fc.constant('D'))` for declared class, `fc.nat()` for size
      - **Validates: Requirements 2.2, 2.3, 14.2, 14.3, 14.4**

    - [ ]* 1.3.3 **Property 25: Manifest activation_class field validation**
      - File: `test/runtime/activation-class-classifier.property.test.js`
      - Generator: `fc.string()` for arbitrary class values
      - **Validates: Requirements 14.1**

  - [ ]* 1.4 Write unit tests for activation class classifier edge cases
    - File: `test/runtime/activation-class-classifier.test.js`
    - Test zero-size image (class A), exact boundary values (2000ms, 10000ms, 30000ms)
    - Test declared class more optimistic than derived emits warning
    - Test declared class more conservative than derived emits no warning
    - _Requirements: 2.1, 2.2, 2.4_

- [ ] 2. Implement `lagrange service analyze` CLI command
  - [ ] 2.1 Create `src/cli/core/service-analyze-command.js` implementing `ActivationAnalyzeCommand`
    - Accept local directory path or OCI registry reference as input
    - Inspect OCI image metadata: compressed size, uncompressed size, layer count
    - Use `ActivationClassClassifier.classify` for activation time and class derivation
    - Output: compressed size, uncompressed size, layer count, estimated cold activation time, activation class
    - For class C/D: emit packaging recommendation (multi-stage builds, smaller base, WASM alternative)
    - Return descriptive error for invalid artifact format
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 2.2 Register `service analyze` in CLI command parser
    - Wire into existing `src/cli/core/command-parser.js` registration pattern
    - _Requirements: 11.4_

  - [ ]* 2.3 Write property test for CLI analyze output
    - [ ]* 2.3.1 **Property 21: CLI analyze output contains all required fields**
      - File: `test/cli/service-analyze.test.js`
      - Verify output contains all five required fields for any valid OCI image
      - Verify class C/D output includes packaging recommendation
      - **Validates: Requirements 11.1, 11.2**

  - [ ]* 2.4 Write unit tests for `service analyze` edge cases
    - File: `test/cli/service-analyze.test.js`
    - Test invalid artifact format returns descriptive error
    - Test local path and registry reference inputs
    - _Requirements: 11.4, 11.5_

- [ ] 3. Implement dev-install activation feedback
  - [ ] 3.1 Extend `lagrange service dev-install` to display activation feedback after artifact preparation
    - Use `ActivationClassClassifier.classify` for consistent derivation
    - Display compressed size, estimated cold activation time, activation class
    - For class C/D: display warning with recommendation to reduce image size
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]* 3.2 Write property test for activation analysis consistency
    - [ ]* 3.2.1 **Property 20: Activation analysis consistency across surfaces**
      - File: `test/query/show-service-activation.property.test.js`
      - Verify identical results from `classify`, CLI analyze, dev-install feedback, and SQL command
      - **Validates: Requirements 11.3, 12.3, 13.4**

- [ ] 4. Checkpoint — Phase 0.5 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify CLI commands work with local paths and registry references
  - Verify activation class derivation is consistent across all surfaces

### Phase 1.0 — Core Runtime

- [ ] 5. Create `node_image_presence` system table and CDC integration
  - [ ] 5.1 Add `NODE_IMAGE_PRESENCE` constant to `src/constants/tables.js`
    - _Requirements: 1.1, 1.4_

  - [ ] 5.2 Add `node_image_presence` schema to `src/bootstrap/system-table-schemas-constants.js`
    - Columns: `node_id`, `image_ref`, `image_digest`, `compressed_size_bytes`, `uncompressed_size_bytes`, `cached_at`, `last_used_at`, `layer_count`
    - Primary key: `(node_id, image_digest)`
    - Indices: `idx_nip_image_digest` on `image_digest`, `idx_nip_node_id` on `node_id`
    - _Requirements: 1.1_

  - [ ] 5.3 Add CDC table policy for `node_image_presence` in `src/cache/cdc-table-policy.js`
    - Policy class: `CDC_POLICY_CLASS.CONTROL_INTERNAL_PROPAGATION`
    - Authority class: `CDC_AUTHORITY_CLASS.CONTROL`
    - `internalCachePropagation: true`, `readinessRelevant: false`
    - Bootstrap hydration mode: `BOOTSTRAP_ONLY`
    - Classify in `CDC_PROPAGATED_TABLES`
    - _Requirements: 1.4_

  - [ ] 5.4 Add `node_image_presence` to `SystemTableCache` cache registration
    - Ensure CDC events for this table update the cache
    - _Requirements: 1.4_

- [ ] 6. Implement `ImagePresenceWriter`
  - [ ] 6.1 Create `src/runtime/image-presence-writer.js`
    - `recordPresence(record)` — insert row via SQL/CDC on pull completion
    - `removePresence(nodeId, imageDigest)` — delete by primary key on eviction
    - `touchPresence(nodeId, imageDigest)` — partial update `last_used_at` by primary key
    - `reconcileOnRestart(nodeId, localDigests)` — remove rows for images not in `localDigests`
    - Single owner for `node_image_presence` row lifecycle (insert/update/delete)
    - All mutations primary-key-addressed per system guidelines §1.4.13
    - _Requirements: 1.2, 1.3, 1.5_

  - [ ]* 6.2 Write property tests for `ImagePresenceWriter`
    - [ ]* 6.2.1 **Property 1: Image presence round trip**
      - File: `test/runtime/image-presence-writer.property.test.js`
      - Generator: random image records with valid fields
      - **Validates: Requirements 1.1, 1.2, 1.3**

    - [ ]* 6.2.2 **Property 2: Restart reconciliation preserves only local images**
      - File: `test/runtime/image-presence-writer.property.test.js`
      - Generator: random row sets and random local digest sets
      - **Validates: Requirements 1.5**

  - [ ]* 6.3 Write unit tests for `ImagePresenceWriter` edge cases
    - File: `test/runtime/image-presence-writer.test.js`
    - Test reconciliation with empty local store (all rows removed)
    - Test reconciliation with all images present (no rows removed)
    - Test `touchPresence` updates only `last_used_at`
    - _Requirements: 1.2, 1.3, 1.5_

- [ ] 7. Extend `service_definitions` schema with activation fields
  - [ ] 7.1 Add `activation_class`, `compressed_size_bytes`, `estimated_cold_activation_ms` columns to `service_definitions` schema in `src/bootstrap/system-table-schemas-constants.js`
    - _Requirements: 2.3_

  - [ ] 7.2 Wire `ActivationClassClassifier` into service creation/update path
    - When `runtime_kind = oci_container`, compute and store activation fields in `service_definitions` row
    - `ActivationClassClassifier` owns these fields exclusively
    - _Requirements: 2.3, 2.5_

- [ ] 8. Implement manifest activation class declaration and validation
  - [ ] 8.1 Add optional `activation_class` field to `RuntimeDescriptorValidator`
    - Accept values A, B, C, D or omitted
    - Reject any other value with `INVALID_ACTIVATION_CLASS` validation error
    - _Requirements: 14.1_

  - [ ] 8.2 Wire declared `activation_class` through `ActivationClassClassifier.validateDeclaredClass`
    - Use declared value as effective class when present
    - Emit warning when declared is more optimistic than derived
    - Accept without warning when declared is equal or more conservative
    - _Requirements: 14.2, 14.3, 14.4_

- [ ] 9. Implement placement policy knobs
  - [ ] 9.1 Add activation placement constants to `src/rebalancer/activation-placement-constants.js`
    - `CLASS_PENALTY` map (A=0, B=0.15, C=0.40, D=0.80)
    - `WARM_RECENCY_WINDOW_MS`, `WARM_NODE_BONUS`, `DEFAULT_STICKY_PREFERENCE_STRENGTH`
    - _Requirements: 3.2, 15.1_

  - [ ] 9.2 Add `stickyPreferenceStrength`, `warmNodeBias`, `prePullEligible`, `warmStandbyCount` fields to `placementConstraints` in `src/policy/policy-constants.js`
    - Add defaults to `DEFAULT_TABLE_POLICY.placementConstraints`
    - Add validation: strength in [0.0, 1.0], bias/prePull boolean, standbyCount non-negative integer
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.6_

  - [ ]* 9.3 Write property test for placement policy field validation
    - [ ]* 9.3.1 **Property 23: Placement policy field validation**
      - File: `test/policy/activation-policy-validation.property.test.js`
      - Generator: `fc.double()` for strength, `fc.boolean()` for bias, `fc.integer()` for standby count
      - **Validates: Requirements 15.1, 15.2, 15.3, 15.4**

- [ ] 10. Extend `MovePlanner` with image locality scoring
  - [ ] 10.1 Add `hasImageCached(nodeId, imageDigest)` and `isWarmNode(nodeId, imageDigest)` helper methods to `MovePlanner`
    - Read from `SystemTableCache` (`node_image_presence` rows)
    - Warm = image cached AND `last_used_at` within `WARM_RECENCY_WINDOW_MS`
    - _Requirements: 3.1, 3.4_

  - [ ] 10.2 Extend `sortNodesBySuitability` with image locality scoring dimension
    - Only for `runtime_kind === RUNTIME_KIND.OCI_CONTAINER` services
    - Penalty = `CLASS_PENALTY[activationClass] * stickyPreferenceStrength`
    - Nodes with cached image get zero penalty
    - Warm node bias: subtract `WARM_NODE_BONUS` for recently-used warm nodes when enabled
    - Preserve all existing scoring dimensions (CPU, memory, disk, latency group, topology diversity)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 10.3 Write property tests for MovePlanner image locality scoring
    - [ ]* 10.3.1 **Property 5: Image locality penalty is class × strength**
      - File: `test/rebalancer/move-planner-activation.property.test.js`
      - Generator: `fc.oneof` for class, `fc.double({min: 0, max: 1})` for strength
      - **Validates: Requirements 3.1, 3.2, 3.3**

    - [ ]* 10.3.2 **Property 6: Warm node bias improves score for recently-used images**
      - File: `test/rebalancer/move-planner-activation.property.test.js`
      - Generator: random node pairs with varying `last_used_at`
      - **Validates: Requirements 3.4**

    - [ ]* 10.3.3 **Property 7: Zero strength preserves original scoring**
      - File: `test/rebalancer/move-planner-activation.property.test.js`
      - Generator: random node sets with strength fixed at 0.0
      - **Validates: Requirements 3.5, 15.5**

- [ ] 11. Extend `StorageAdmissionService` with activation-cost gating
  - [ ] 11.1 Add `ACTIVATION_TIMEOUT_EXCEEDED` and `NO_ADMISSIBLE_COHORT_ACTIVATION` reason codes to `src/rebalancer/storage-admission-constants.js`
    - _Requirements: 4.2_

  - [ ] 11.2 Add `estimateActivationTime(options)` method to `StorageAdmissionService`
    - If node has image in `node_image_presence`: return `ACTIVATION_OVERHEAD_MS`
    - If node lacks image: return `(compressedSizeBytes / pullThroughputBytesPerMs) + ACTIVATION_OVERHEAD_MS`
    - Read image presence from `SystemTableCache`
    - _Requirements: 4.1, 4.3_

  - [ ] 11.3 Extend `evaluateProvisioning` to include activation-cost admission check
    - For OCI container services: estimate activation time per candidate after existing readiness/capacity checks
    - Deny candidate with `ACTIVATION_TIMEOUT_EXCEEDED` if estimated time exceeds remaining budget
    - Evaluate full candidate set before rejecting (§1.4.11 compliance)
    - If no candidate satisfies activation constraint: fail with structured diagnostics per candidate
    - _Requirements: 4.2, 4.4, 4.5_

  - [ ]* 11.4 Write property tests for activation-cost admission
    - [ ]* 11.4.1 **Property 8: Activation time estimation accounts for image presence**
      - File: `test/rebalancer/storage-admission-activation.property.test.js`
      - Generator: `fc.nat()` for size, `fc.boolean()` for image presence
      - **Validates: Requirements 4.1, 4.3**

    - [ ]* 11.4.2 **Property 9: Activation timeout denial with correct reason code**
      - File: `test/rebalancer/storage-admission-activation.property.test.js`
      - Generator: random candidate sets with varying budgets
      - **Validates: Requirements 4.2, 4.4**

  - [ ]* 11.5 Write unit tests for admission edge cases
    - File: `test/rebalancer/storage-admission-activation.test.js`
    - Test empty candidate set
    - Test all candidates denied by activation timeout (structured diagnostics)
    - _Requirements: 4.4, 4.5_

- [ ] 12. Checkpoint — Core admission and scoring complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify MovePlanner scoring and admission gating work together

- [ ] 13. Implement `imageReady` readiness dimension
  - [ ] 13.1 Add `IMAGE_READY` constant to `src/control-plane/control-plane-readiness-constants.js`
    - _Requirements: 6.1_

  - [ ] 13.2 Add `isImageReady(nodeId, imageDigest)` method to `ControlPlaneReadinessService`
    - Return `true` iff `SystemTableCache` contains a `node_image_presence` row with matching `(node_id, image_digest)`
    - Per-service dimension, not global node dimension
    - _Requirements: 6.1, 6.3_

  - [ ] 13.3 Implement readiness transition event emission on `node_image_presence` cache changes
    - In `handleCacheChange`, detect `imageReady` transitions from not-ready to ready
    - Emit readiness transition events for affected service definitions
    - Feed events into owner-key reconcile queue for pending `WAIT_IMAGE_READINESS` steps
    - _Requirements: 6.4_

  - [ ]* 13.4 Write property tests for image readiness
    - [ ]* 13.4.1 **Property 12: Image readiness dimension reflects cache state**
      - File: `test/control-plane/image-readiness.property.test.js`
      - Generator: random `(nodeId, imageDigest)` pairs with random cache state
      - **Validates: Requirements 6.1**

    - [ ]* 13.4.2 **Property 13: Image readiness transition emits reconcile event**
      - File: `test/control-plane/image-readiness.property.test.js`
      - Verify transition from not-ready to ready emits event into reconcile queue
      - **Validates: Requirements 6.4**

- [ ] 14. Implement `WAIT_IMAGE_READINESS` workflow step
  - [ ] 14.1 Add `WAIT_IMAGE_READINESS` to `WORKFLOW_STEP` enum in `src/constants/workflow.js`
    - Add `IMAGE_READINESS_TIMEOUT` timeout classification constant
    - _Requirements: 5.1_

  - [ ] 14.2 Implement step insertion logic in `RebalanceCoordinator`
    - For ADD operations targeting a node lacking the required image: insert `WAIT_IMAGE_READINESS` between `SENDING` and `CREATING`
    - For ADD operations where target has image cached: skip step, transition directly `SENDING` → `CREATING`
    - Step timeout derived from remaining budget via `createChildTimeoutBudget` — never a fresh default
    - Timeout produces typed `IMAGE_READINESS_TIMEOUT` classification
    - Completion triggered by `imageReady` readiness transition event via reconcile queue
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 14.3 Write property tests for workflow step
    - [ ]* 14.3.1 **Property 10: WAIT_IMAGE_READINESS step insertion and skip**
      - File: `test/rebalancer/rebalance-image-readiness.property.test.js`
      - Generator: `fc.boolean()` for image presence on target
      - **Validates: Requirements 5.1, 5.5**

    - [ ]* 14.3.2 **Property 11: WAIT_IMAGE_READINESS timeout derives from remaining budget**
      - File: `test/rebalancer/rebalance-image-readiness.property.test.js`
      - Generator: random elapsed times within budget range
      - **Validates: Requirements 5.2**

  - [ ]* 14.4 Write unit tests for workflow step edge cases
    - File: `test/rebalancer/rebalance-image-readiness.test.js`
    - Test timeout at exact budget boundary (typed `EXACT_BOUNDARY_HIT` classification)
    - Test step completion on `imageReady` transition event
    - _Requirements: 5.2, 5.3, 5.4_

- [ ] 15. Implement `OciPullService` (core pull execution)
  - [ ] 15.1 Create `src/runtime/oci-pull-service.js`
    - `pull(options)` — pull OCI image to local node, record presence via `ImagePresenceWriter` on completion
    - `existsLocally(imageDigest)` — check local container store for restart reconciliation
    - Single owner for pull execution
    - Inject `ImagePresenceWriter` for presence recording (no direct row writes)
    - Inject `registryLocalityConfig` for mirror selection (Phase 2 wiring, stub for Phase 1)
    - _Requirements: 1.2, 16.3, 16.4_

- [ ] 16. Implement `SHOW SERVICE ACTIVATION` SQL command
  - [ ] 16.1 Add `SHOW SERVICE ACTIVATION` handler to `SqlCore`
    - Return per-service row: `service_id`, `runtime_kind`, `activation_class`, `compressed_size_bytes`, `estimated_cold_activation_ms`, `warm_node_count`, `total_node_count`
    - Support `WHERE service_id = ?` filter
    - Derive `warm_node_count` from `node_image_presence` rows in `SystemTableCache`
    - Derive `estimated_cold_activation_ms` using `ActivationClassClassifier`
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [ ]* 16.2 Write property test for SHOW SERVICE ACTIVATION
    - [ ]* 16.2.1 **Property 22: SHOW SERVICE ACTIVATION returns correct warm node count**
      - File: `test/query/show-service-activation.property.test.js`
      - Verify `warm_node_count` equals distinct `node_id` count matching service image digest
      - **Validates: Requirements 13.1, 13.3**

- [ ] 17. Wire Phase 1 components into composition root
  - [ ] 17.1 Wire `ImagePresenceWriter`, `ActivationClassClassifier`, `OciPullService` into `ControlPlaneSetup` / bootstrap setup
    - Inject dependencies following existing owner wiring patterns
    - Wire `ControlPlaneReadinessService` `imageReady` dimension
    - Wire `RebalanceCoordinator` `WAIT_IMAGE_READINESS` step logic
    - Wire `MovePlanner` image locality scoring with `SystemTableCache` access
    - Wire `StorageAdmissionService` activation-cost gating
    - _Requirements: 1.2, 1.4, 3.1, 4.1, 5.1, 6.1_

  - [ ] 17.2 Update `architecture.md` with activation-cost-aware placement component ownership
    - Document `ImagePresenceWriter`, `ActivationClassClassifier`, `OciPullService` ownership
    - Document `node_image_presence` table ownership and CDC propagation
    - Document `imageReady` readiness dimension
    - Document `WAIT_IMAGE_READINESS` workflow step
    - _Requirements: 1.1, 1.4, 2.1, 5.1, 6.1_

- [ ] 18. Checkpoint — Phase 1.0 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify end-to-end: image presence tracking → admission gating → workflow step → readiness transition → step advance

### Phase 2.0 — Image Logistics

- [ ] 19. Implement `RegistryLocalityConfig`
  - [ ] 19.1 Create `src/runtime/registry-locality-config.js`
    - Read `registry_locality_mapping` from `config` system table
    - Map registry endpoints to latency groups
    - Resolve mirror selection by lowest estimated latency to pulling node's latency group
    - _Requirements: 10.1, 10.4_

  - [ ] 19.2 Extend `OciPullService` with registry mirror selection
    - Select mirror with lowest latency based on `RegistryLocalityConfig`
    - Fall back to next-nearest mirror on failure with `REGISTRY_FALLBACK` reason code
    - _Requirements: 10.2, 10.3_

  - [ ]* 19.3 Write property test for registry mirror selection
    - [ ]* 19.3.1 **Property 19: Registry mirror selection by lowest latency**
      - File: `test/runtime/oci-pull-service.property.test.js`
      - Generator: random node latency groups and mirror latency group mappings
      - **Validates: Requirements 10.2**

- [ ] 20. Implement pull progress reporting
  - [ ] 20.1 Extend `OciPullService` with progress event emission
    - Emit structured progress events at configurable interval (default 5s via `pull_progress_interval_ms`)
    - Fields: `node_id`, `image_ref`, `bytes_pulled`, `total_bytes`, `elapsed_ms`, `estimated_remaining_ms`
    - Terminal completion event: `durationMs`, `throughputBytesPerMs`
    - Terminal failure event: typed `reasonCode`
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [ ]* 20.2 Write property test for pull progress events
    - [ ]* 20.2.1 **Property 24: Pull progress events contain required fields**
      - File: `test/runtime/oci-pull-service.property.test.js`
      - Verify all progress events contain required fields
      - Verify terminal events contain additional required fields
      - **Validates: Requirements 16.1, 16.3, 16.4**

- [ ] 21. Implement `node_image_layers` table and `LayerSharingAnalyzer`
  - [ ] 21.1 Add `NODE_IMAGE_LAYERS` constant to `src/constants/tables.js` and schema to `src/bootstrap/system-table-schemas-constants.js`
    - Columns: `node_id`, `image_digest`, `layer_digest`, `layer_size_bytes`, `layer_index`
    - Primary key: `(node_id, image_digest, layer_digest)`
    - Classify in `CDC_NON_PROPAGATED_TABLES` (high-cardinality, queried on-demand)
    - _Requirements: 8.1_

  - [ ] 21.2 Create `src/runtime/layer-sharing-analyzer.js`
    - Query `node_image_layers` from owning partition on-demand
    - Compute layer overlap fraction per node per service image
    - Expose overlap fraction for `MovePlanner` and `StorageAdmissionService` consumption
    - No ad-hoc caching — derived view only, not stored in `SystemTableCache`
    - _Requirements: 8.2, 8.3, 8.4_

  - [ ] 21.3 Extend `MovePlanner` to reduce image locality penalty by shared layer fraction
    - Reduce penalty proportionally to fraction of required layers already present on node
    - _Requirements: 8.2_

  - [ ] 21.4 Extend `StorageAdmissionService` to subtract shared layer size from estimated pull size
    - Reduce `compressedSizeBytes` by size of already-present shared layers when estimating activation time
    - _Requirements: 8.3_

  - [ ]* 21.5 Write property test for layer sharing
    - [ ]* 21.5.1 **Property 18: Layer sharing reduces penalty and estimated pull size**
      - File: `test/rebalancer/move-planner-activation.property.test.js`
      - Verify penalty reduction proportional to shared layer fraction
      - Verify admission time reduction by shared layer size
      - **Validates: Requirements 8.2, 8.3**

- [ ] 22. Implement `PrePullService`
  - [ ] 22.1 Create `src/runtime/pre-pull-service.js`
    - `evaluatePrePulls()` — identify candidate nodes from `MovePlanner` scoring, trigger background pulls via `OciPullService`
    - `getStatus()` — return pre-pull queue state for diagnostics
    - Per-node concurrent pull limit from `pre_pull_max_concurrent_per_node` config
    - Priority: class D before class C; class A and B not pre-pulled
    - Record presence through standard `ImagePresenceWriter` write path on completion
    - Retry failed pulls with exponential backoff up to configurable max retry count
    - Called periodically by control-plane reconcile loop
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 22.2 Write property tests for `PrePullService`
    - [ ]* 22.2.1 **Property 14: Pre-pull concurrency limit**
      - File: `test/runtime/pre-pull-service.property.test.js`
      - Verify concurrent pulls per node never exceed configured limit
      - **Validates: Requirements 7.2**

    - [ ]* 22.2.2 **Property 15: Pre-pull priority ordering**
      - File: `test/runtime/pre-pull-service.property.test.js`
      - Verify class D scheduled before class C; class A/B not pre-pulled
      - **Validates: Requirements 7.3**

- [ ] 23. Implement `ImageGCService`
  - [ ] 23.1 Create `src/runtime/image-gc-service.js`
    - `sweep(nodeId)` — evict LRU images exceeding `image_gc_budget_bytes` per node
    - `isPinned(nodeId, imageDigest)` — check if image is referenced by active service or within `warmStandbyCount`
    - LRU ordering by `last_used_at` from `node_image_presence`
    - Pin images used by active services on the node
    - Pin images on up to `warmStandbyCount` additional nodes for warm standby
    - Remove presence rows through `ImagePresenceWriter` on eviction
    - Delete image data from local store
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 23.2 Write property tests for `ImageGCService`
    - [ ]* 23.2.1 **Property 16: Image GC preserves budget invariant**
      - File: `test/runtime/image-gc-service.property.test.js`
      - Generator: random image sets with varying sizes, random budget
      - Verify total remaining size ≤ budget after sweep
      - **Validates: Requirements 9.1**

    - [ ]* 23.2.2 **Property 17: Image GC evicts LRU first and never evicts pinned images**
      - File: `test/runtime/image-gc-service.property.test.js`
      - Generator: random image sets with varying `last_used_at` and active service refs
      - Verify LRU ordering and pinned images never evicted
      - **Validates: Requirements 9.2, 9.3, 9.5**

  - [ ]* 23.3 Write unit tests for `ImageGCService` edge cases
    - File: `test/runtime/image-gc-service.test.js`
    - Test all images pinned (nothing to evict)
    - Test `warmStandbyCount` exceeds total node count (pin on all available)
    - _Requirements: 9.3, 9.5_

- [ ] 24. Wire Phase 2 components into composition root
  - [ ] 24.1 Wire `PrePullService`, `LayerSharingAnalyzer`, `ImageGCService`, `RegistryLocalityConfig` into `ControlPlaneSetup` / bootstrap setup
    - Inject dependencies following existing owner wiring patterns
    - Wire `PrePullService` into control-plane reconcile loop
    - Wire `ImageGCService` sweep into periodic sweep schedule
    - Wire `RegistryLocalityConfig` into `OciPullService`
    - Wire `LayerSharingAnalyzer` into `MovePlanner` and `StorageAdmissionService`
    - _Requirements: 7.1, 8.4, 9.4, 10.1_

  - [ ] 24.2 Update `architecture.md` with Phase 2 component ownership
    - Document `PrePullService`, `LayerSharingAnalyzer`, `ImageGCService`, `RegistryLocalityConfig` ownership
    - Document `node_image_layers` table classification
    - _Requirements: 7.1, 8.1, 9.1, 10.1_

- [ ] 25. Checkpoint — Phase 2.0 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify pre-pull triggers pull on likely target, then rebalance skips `WAIT_IMAGE_READINESS`
  - Verify image GC evicts unused image, then rebalance to that node includes `WAIT_IMAGE_READINESS`

- [ ] 26. Integration tests
  - [ ]* 26.1 Write integration test: end-to-end rebalance with image pull
    - File: `test/integration/activation-cost-rebalance.integration.test.js`
    - Admission → `WAIT_IMAGE_READINESS` → pull → CDC propagation → step advance → `CREATING`
    - _Requirements: 1.2, 4.1, 5.1, 5.3, 6.4_

  - [ ]* 26.2 Write integration test: pre-pull then rebalance skips wait step
    - File: `test/integration/activation-cost-rebalance.integration.test.js`
    - Pre-pull completes on target → rebalance skips `WAIT_IMAGE_READINESS`
    - _Requirements: 5.5, 7.1, 7.4_

  - [ ]* 26.3 Write integration test: GC eviction triggers wait step on next rebalance
    - File: `test/integration/activation-cost-rebalance.integration.test.js`
    - Image GC evicts image → next rebalance to that node includes `WAIT_IMAGE_READINESS`
    - _Requirements: 5.1, 9.4_

  - [ ]* 26.4 Write integration test: SHOW SERVICE ACTIVATION warm_node_count after pull
    - File: `test/integration/activation-cost-rebalance.integration.test.js`
    - Pull completes on new node → `warm_node_count` increments in SQL output
    - _Requirements: 13.1, 13.3_

- [ ] 27. Final checkpoint — All phases complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 16 requirements are covered by implementation tasks
  - Verify all 25 correctness properties have corresponding property test tasks

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at phase boundaries
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All new constants go in dedicated constants files, never inline literals
- All system table mutations are primary-key-addressed per system guidelines §1.4.13
- `ImagePresenceWriter` is the single owner for `node_image_presence` row lifecycle
- `ActivationClassClassifier` is the single owner for activation class derivation fields
- `SystemTableCache` is the only read model for image presence in steady state
