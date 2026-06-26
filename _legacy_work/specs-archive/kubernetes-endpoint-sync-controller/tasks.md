# Implementation Plan: Kubernetes Endpoint Sync Controller

## Overview

Deliver a Kubernetes-side controller that projects canonical
`service_endpoints` metadata into selector-less `Service` and managed
`EndpointSlice` resources.

Execution order:

1. Controller contracts and configuration
2. Source read path and desired-state planner
3. Kubernetes reconciler and garbage collection
4. Observability and safety gates
5. Example Helm chart and documentation

## Tasks

- [x] 1. Define canonical constants and config contract
  - Add controller config keys for source URL, interval, allowlists, strict
    port mode, health policy, and leader election.
  - Add label/annotation constants for managed resources.
  - Add metrics and event reason constants for reconciliation outcomes.
  - _Requirements: 1.4, 3.4, 8.1, 10.1_

- [x] 2. Implement source query client over admin stream
  - Implement WebSocket query request/response handling for
    `/api/admin/stream`.
  - Add typed parsing for `query_result` row payloads.
  - Add auth token injection and connection retry policy.
  - _Requirements: 2.1, 2.4, 7.1, 9.2_

- [x] 3. Implement endpoint row normalization and filtering
  - Parse endpoint metadata safely and derive logical service name.
  - Apply protocol allowlist, service allowlist, and health filtering.
  - Add deterministic sorting for stable reconcile outputs.
  - _Requirements: 3.1, 3.2, 3.3, 7.4_

- [x] 4. Implement strict port policy validation
  - Validate unique port per logical service group.
  - Emit typed failure result for conflicting groups.
  - Continue reconciling non-conflicting groups.
  - _Requirements: 5.1, 5.2, 5.4, 10.3_

- [x] 5. Implement deterministic naming strategy
  - Add DNS-1123 normalization and truncation with hash suffix.
  - Generate stable Service and EndpointSlice names from service key.
  - Add unit tests for collisions and long identifiers.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6. Implement Service reconciliation
  - Reconcile selector-less Service with canonical labels and ports.
  - Preserve managed ownership labels and idempotent updates.
  - Support configurable namespace and naming prefix.
  - _Requirements: 4.1, 4.3, 7.2, 7.4_

- [x] 7. Implement EndpointSlice reconciliation
  - Build EndpointSlice payloads with endpoint conditions and ports.
  - Split slices by address type and max endpoint count.
  - Bind slices to Service via `kubernetes.io/service-name`.
  - _Requirements: 4.2, 6.1, 6.3, 7.2_

- [x] 8. Implement managed resource garbage collection
  - Discover managed Services and EndpointSlices by label selector.
  - Remove stale managed resources absent from desired state.
  - Ensure only managed-labeled resources are eligible for cleanup.
  - _Requirements: 7.3, 4.4, 7.4_

- [x] 9. Add leader election support
  - Add lease-based leader election for multi-replica Deployment safety.
  - Ensure only leader performs reconcile writes.
  - Add tests for follower no-op behavior.
  - _Requirements: 1.1, 1.2, 9.1_

- [x] 10. Add observability and failure diagnostics
  - Emit structured reconcile summaries and per-group error logs.
  - Expose reconcile and export metrics.
  - Emit Kubernetes Events for group-level projection failures.
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 11. Add sample Helm chart under examples
  - Add chart files at
    `examples/kubernetes-endpoint-sync-controller/helm/system-endpoint-sync-controller/`.
  - Include Deployment, ServiceAccount, ClusterRole, ClusterRoleBinding,
    optional metrics Service, and configurable values.
  - Add chart values for source URL, allowlists, strict port mode,
    leader election, and secret refs.
  - _Requirements: 1.2, 1.3, 11.1, 11.2, 11.3_

- [x] 12. Add examples README and usage guide
  - Add `examples/kubernetes-endpoint-sync-controller/README.md` with install,
    template render, and value override examples.
  - Document scope/limitations (strict port mode, selector-less Service model).
  - _Requirements: 11.4, 5.4, 6.4_

- [x] 13. Add tests for planner and reconciler
  - Unit tests for filtering, naming, strict-port policy, and desired state.
  - Integration tests with fake Kubernetes API for create/update/delete
    converge behavior.
  - Add health mapping tests for `exclude` and `not_ready` policies.
  - _Requirements: 12.1, 12.2, 12.3_

- [x] 14. Add chart rendering check in CI
  - Add deterministic render/lint command for example chart.
  - Validate key value combinations (default, multi-service allowlist,
    secret ref).
  - _Requirements: 12.4_

## Notes

- Controller is projection-only. It does not own service placement.
- Source reads use one canonical path (admin stream query execution).
- Strict port mode is default for stable Service semantics.
