# Requirements Document

## Introduction

This spec defines Kubernetes integration for runtime-managed replicated services
by introducing a Kubernetes-side endpoint sync controller.

The controller reads canonical endpoint metadata from the system control plane
(`service_endpoints`) and projects it into Kubernetes-native discovery objects
(selector-less `Service` + managed `EndpointSlice`).

This preserves ownership boundaries:

1. The system remains the only owner of service placement and replica lifecycle.
2. Kubernetes remains the owner of Pod scheduling and infrastructure lifecycle.
3. Endpoint publication source-of-truth remains SQL/CDC metadata.

## Goals

1. Provide a canonical Kubernetes integration path for runtime-managed services.
2. Avoid dual schedulers for runtime replica placement.
3. Let customers expose logical services through Kubernetes front-ends.
4. Ship a sample Helm chart under `examples/` for customer onboarding.

## Non-Goals

1. Replacing internal rebalancer/lifecycle ownership with Kubernetes workloads.
2. Adding a second endpoint metadata store outside `service_endpoints`.
3. Supporting mixed per-replica ports for a single externally stable Service in
   this version.
4. Implementing a full custom-resource API in this version.

## Requirements

### Requirement 1: Deployment and Packaging Model

**User Story:** As a platform operator, I want endpoint sync deployed as a
Kubernetes component so customers can install and manage it like other cluster
integrations.

#### Acceptance Criteria

1. The system SHALL provide endpoint sync as a Kubernetes controller Deployment,
   not as an in-node runtime service process.
2. Customers SHALL install it through a Helm chart.
3. The Helm chart SHALL include ServiceAccount and RBAC resources required for
   reconciliation.
4. The chart SHALL support configurable namespace and image settings.

### Requirement 2: Source-of-Truth and Ownership Boundary

**User Story:** As a maintainer, I want one authoritative endpoint source so
control loops cannot conflict.

#### Acceptance Criteria

1. Controller desired state SHALL be derived only from canonical
   `service_endpoints` metadata.
2. Runtime replicas SHALL continue to publish endpoint intent only through
   `ServiceRuntimeLifecycle` endpoint writer ownership.
3. Controller SHALL NOT perform internal placement or lifecycle actions.
4. Controller SHALL NOT write system tables directly.

### Requirement 3: Source Endpoint Selection

**User Story:** As an operator, I want to scope which endpoints are exported to
Kubernetes.

#### Acceptance Criteria

1. Controller SHALL support protocol allowlist filtering (for example,
   `postgresql`).
2. Controller SHALL support optional service-id allowlist filtering.
3. Controller SHALL support health-status filtering (`healthy` only mode).
4. Filter behavior SHALL be deterministic and documented.

### Requirement 4: Kubernetes Projection Model

**User Story:** As a Kubernetes consumer, I want discoverable native resources
for logical service access.

#### Acceptance Criteria

1. For each exported logical service, controller SHALL reconcile one
   selector-less Kubernetes `Service`.
2. For each exported logical service, controller SHALL reconcile managed
   `EndpointSlice` object(s) bound to that Service.
3. Reconciled resources SHALL include stable labels/annotations identifying the
   source service/protocol.
4. Controller SHALL set `ownerReferences` and labels so stale managed resources
   are discoverable and removable.

### Requirement 5: Port Semantics

**User Story:** As an operator, I want deterministic Service port behavior for
front-end integrations.

#### Acceptance Criteria

1. In strict mode, controller SHALL require one unique port per exported
   logical service.
2. When strict mode detects mixed ports for one logical service, reconcile SHALL
   fail that service export and emit a typed warning/event.
3. In strict mode, the Kubernetes Service port SHALL match source endpoint port.
4. Strict mode SHALL be enabled by default.

### Requirement 6: Health and Readiness Mapping

**User Story:** As an operator, I want endpoint health reflected in Kubernetes
routing decisions.

#### Acceptance Criteria

1. `service_endpoints.health_status = healthy` SHALL map to ready endpoint
   conditions.
2. Unhealthy endpoints SHALL be excluded or marked not-ready based on a single
   configurable policy.
3. Health transitions SHALL update EndpointSlice conditions on subsequent
   reconcile cycles.
4. Health mapping behavior SHALL be documented in chart values.

### Requirement 7: Reconciliation and Drift Correction

**User Story:** As an SRE, I want eventual consistency between source metadata
and Kubernetes resources.

#### Acceptance Criteria

1. Controller SHALL execute periodic reconciliation at configurable interval.
2. Controller SHALL upsert managed Services and EndpointSlices to desired state.
3. Controller SHALL remove stale managed EndpointSlices/Services that are no
   longer present in source metadata.
4. Reconcile loop SHALL be idempotent.

### Requirement 8: Naming and Resource Identity

**User Story:** As an operator, I want predictable object names that avoid
collisions.

#### Acceptance Criteria

1. Resource naming SHALL be deterministic from service identity + protocol.
2. Naming SHALL respect Kubernetes DNS-1123 length limits.
3. When identifiers exceed limits, controller SHALL apply deterministic hash
   suffixing.
4. Naming algorithm SHALL be documented and covered by tests.

### Requirement 9: Security and Access

**User Story:** As a security owner, I want least-privilege access for endpoint
sync.

#### Acceptance Criteria

1. RBAC SHALL grant only required verbs/resources (`services`,
   `endpointslices`, optional `events`, `leases`).
2. Source control-plane authentication credentials SHALL be provided through
   Kubernetes Secret references.
3. Controller SHALL not require cluster-admin privileges.
4. Chart SHALL support pod security context hardening defaults.

### Requirement 10: Observability

**User Story:** As an SRE, I want logs and metrics to diagnose sync issues.

#### Acceptance Criteria

1. Controller SHALL emit structured reconcile logs with service identity and
   result counts.
2. Controller SHALL expose metrics for reconcile duration, exported services,
   exported endpoints, and failures.
3. Controller SHALL emit Kubernetes Events for per-service reconciliation
   failures.
4. Metrics endpoint configuration SHALL be exposed through chart values.

### Requirement 11: Example Helm Chart Deliverable

**User Story:** As a customer, I want a concrete chart example in the repository
so I can deploy this integration quickly.

#### Acceptance Criteria

1. Repository SHALL include
   `examples/kubernetes-endpoint-sync-controller/helm/system-endpoint-sync-controller/`.
2. Example chart SHALL include `Chart.yaml`, `values.yaml`, and template files
   for Deployment, RBAC, and optional metrics Service.
3. Example chart SHALL include documented values for admin endpoint URL,
   protocol allowlist, and leader election settings.
4. Example folder SHALL include a README with install and template commands.

### Requirement 12: Verification and Test Coverage

**User Story:** As a maintainer, I want automated checks for planning and
projection correctness.

#### Acceptance Criteria

1. Unit tests SHALL cover source filtering, naming, strict-port validation, and
   desired-state planning.
2. Integration tests SHALL cover Kubernetes reconciliation for create/update/
   delete lifecycle.
3. Integration tests SHALL cover unhealthy endpoint handling behavior.
4. Chart template rendering SHALL be validated in CI with deterministic values.
