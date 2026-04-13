# Rollout Packages

This file maps classified fallback IDs to follow-on implementation packages.

Sprint umbrella:

1. [Control-Plane Recovery Architecture Sprint](../sprints/done-2026-q2-control-plane-recovery-architecture.md)

## Concrete Follow-On Packages

### 1. Control-Plane Planning Snapshot Fallback Collapse

Package file:

1. `work/packages/done-20260410-control-plane-planning-snapshot-fallback-collapse.md`

Fallback IDs:

1. `FB-CP-001`
2. `FB-CP-002`
3. `FB-CP-004`

Intent:

1. Move best-effort planning-snapshot degradation policy into one readiness
   owner API.
2. Stop caller-local reconstruction of planning state from diagnostics.
3. Keep the remaining sync/async boundary explicit and documented.

### 2. Membership Publication Fetch And Ack Fallback Collapse

Package file:

1. `work/packages/done-20260410-membership-publication-fetch-and-ack-fallback-collapse.md`

Fallback IDs:

1. `FB-CP-003`

Intent:

1. Move publication-row freshness selection and refresh policy behind the
   membership-publication owner.
2. Remove dispatch-local publication fetch and refresh orchestration.

### 3. Authoritative Control-Plane Ingress And Admin Snapshot Rationalization

Package file:

1. `work/packages/done-20260410-authoritative-control-plane-ingress-and-admin-snapshot-rationalization.md`

Fallback IDs:

1. `FB-AD-001`
2. `FB-CDC-001`
3. `FB-CDC-002`
4. `FB-CP-005`

Intent:

1. Keep authoritative read and repair policy owned by the existing control-plane
   ingress.
2. Reduce the ingress option surface instead of letting callers grow new local
   fallback policy.
3. Keep admin diagnostics observation-only and routed through the same owner
   surfaces.

### 4. Control-Plane Mutation Ingress Bridge Removal

Package file:

1. `work/packages/done-20260410-control-plane-mutation-ingress-bridge-removal.md`

Fallback IDs:

1. `FB-CP-006`

Intent:

1. Remove the startup/bootstrap direct-SQL mutation bridge.
2. Ensure control-plane mutation handoff completes before mutation callers
   become active.

### 5. Bootstrap Runtime-Surface Bridge Removal

Package file:

1. `work/packages/done-20260410-bootstrap-runtime-surface-bridge-removal.md`

Fallback IDs:

1. `FB-BS-001`
2. `FB-BS-002`
3. `FB-BS-003`

Intent:

1. Collapse bootstrap cache/runtime surface access to one owner.
2. Remove bootstrap-local recovery snapshot reconstruction.
3. Keep probe timeout fallback inside one explicit readiness-owner surface.

### 6. Bootstrap Topology Snapshot Owner Cutover

Package file:

1. `work/packages/done-20260410-bootstrap-topology-snapshot-owner-cutover.md`

Fallback IDs:

1. `FB-BS-004`
2. `FB-CP-008`

Intent:

1. Provide one active-node / leader-identity owner surface during bootstrap.
2. Remove evaluator-local and service-row bridges once owner-row convergence is
   guaranteed.

### 7. Bootstrap Join Ingress And Peer-Mesh Fallback Reduction

Package file:

1. `work/packages/done-20260410-bootstrap-join-ingress-and-peer-mesh-fallback-reduction.md`

Fallback IDs:

1. `FB-BS-005`
2. `FB-BS-006`
3. `FB-BS-007`
4. `FB-MG-001`

Intent:

1. Reduce join-time dependence on local targeting and bootstrap hints.
2. Finish runtime handoff for peer location and reconnect authority.
3. Keep only the bounded bootstrap-specific degraded transport that is still
   demonstrably necessary.

### 8. Rebalancer Read-Model Fallback Policy Collapse

Package file:

1. `work/packages/done-20260410-rebalancer-read-model-fallback-policy-collapse.md`

Fallback IDs:

1. `FB-RB-001`
2. `FB-RB-002`
3. `FB-RB-005`

Intent:

1. Hide read degradation policy behind repository-owned APIs.
2. Remove caller tuning of cache-empty and read-failure fallback choices.
3. Decide whether critical partition safety can consume one stronger owner
   snapshot instead of a best-available row set.

### 9. Rebalancer Recovery-Path Guardrail Cleanup

Package file:

1. `work/packages/done-20260410-rebalancer-recovery-path-guardrail-cleanup.md`

Fallback IDs:

1. `FB-RB-003`
2. `FB-RB-004`
3. `FB-RB-006`

Intent:

1. Keep explicit recovery sweeps separated from steady-state coordinator reads.
2. Burn down remaining legacy row-shape bridges.
3. Remove snapshot-shape compatibility once new producers are universal.

### 10. Critical Partition Classification Owner Cutover

Package file:

1. `work/packages/done-20260410-critical-partition-classification-owner-cutover.md`

Fallback IDs:

1. `FB-RB-007`

Intent:

1. Cut move planning over to one critical-partition classifier contract.
2. Remove the older priority-control-plane fallback detector.

### 11. Query Provisioning Cohort Unification

Package file:

1. `work/packages/done-20260410-query-provisioning-cohort-unification.md`

Fallback IDs:

1. `FB-QR-001`
2. `FB-PT-001`

Intent:

1. Make degraded provisioning and split-admission cohort selection use one
   topology-admission evidence contract.
2. Stop mixing strict readiness and weaker service/discovery evidence in
   several planners.

### 12. Partition-Service Owner-Dependency Fallback Removal

Package file:

1. `work/packages/done-20260410-partition-service-owner-dependency-fallback-removal.md`

Fallback IDs:

1. `FB-PT-002`

Intent:

1. Require an explicit raft owner or test double for single-replica leadership.
2. Remove the local leader-election bridge from `PartitionService`.

### 13. CDC Grouped-Delivery Safe Fallback Review

Package file:

1. `work/packages/done-20260410-cdc-grouped-delivery-safe-fallback-review.md`

Fallback IDs:

1. `FB-TP-001`

Intent:

1. Keep grouped-to-safe-fanout fallback explicit and bounded.
2. Decide whether repeated grouped-delivery failures mean the dissemination
   boundary still needs to shrink.

### 14. Transport Reconnect Authority Cleanup

Package file:

1. `work/packages/done-20260410-transport-reconnect-authority-cleanup.md`

Fallback IDs:

1. `FB-TR-001`
2. `FB-TR-002`

Intent:

1. Keep transport fallback policy inside MessageRouter.
2. Remove bootstrap-only reconnect/address bridges once runtime dissemination is
   fully converged.

### 15. Projected Voter-Ready Topology Settling

Package file:

1. `work/packages/done-20260409-priority-recovery-completion-and-topology-settling.md`

Fallback IDs:

1. `FB-CP-007`

Intent:

1. Keep the liveness-based recovery projection explicit and shared.
2. Decide when degraded evidence may satisfy topology-settling and spread
   obligations.
3. Avoid scattering projected-voter-ready logic into additional local
   fallbacks.

## Notes

1. Every fallback ID in `fallback-register.csv` is now assigned to a concrete
   package file.
2. `FB-TR-002` is owned by the transport reconnect package; bootstrap join
   packages that touch bootstrap-side registration or hints must coordinate
   with it rather than claim the same ID twice.
3. `FB-CP-007` is already represented by an existing completion package because it is
   part of the ongoing priority-recovery/topology-settling work rather than a
   new follow-on concern.
4. Rows classified as `unclear` in the register should usually become one of
   the packages above before local cleanup continues elsewhere.
