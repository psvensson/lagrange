# Control-Plane Recovery And Publication Cluster

## Why This Cluster Was Seeded First

This cluster is already on the active critical path because the current
priority-recovery and topology-settling work exposed several caller-owned
fallback policies directly in the control-plane publication and rebalancer
lanes.

## Classified Fallback IDs

1. `FB-CP-001`
2. `FB-CP-002`
3. `FB-CP-003`
4. `FB-CP-004`
5. `FB-CP-005`
6. `FB-CP-006`
7. `FB-CP-007`
8. `FB-CP-008`

## Current Assessment

### `FB-CP-001`

Files:

1. [operation-workflow-owner.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/rebalancer/operation-workflow-owner.js#L3914)
2. [control-plane-readiness-service.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/control-plane-readiness-service.js#L2504)

Assessment:

1. The caller currently owns `sync snapshot -> async refresh with timeout ->
   sync fallback`.
2. That is duplicated policy, not a legitimate semantic owner boundary.

### `FB-CP-002`

Files:

1. [rebalance-coordinator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/rebalancer/rebalance-coordinator.js#L1700)
2. [control-plane-readiness-service.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/control-plane-readiness-service.js#L2516)

Assessment:

1. The coordinator currently rebuilds a planning decision from diagnostics when
   the planning snapshot is missing.
2. That should be one readiness-owner API, not caller-level repair logic.

### `FB-CP-003`

Files:

1. [replica-dispatch-service.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/replica-dispatch-service.js#L2143)
2. [membership-publication-coordinator.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/membership-publication-coordinator.js#L1700)

Assessment:

1. Dispatch owns sync fetch, async refresh, and row selection policy for
   publication acknowledgement.
2. That reconstructs publication-owner truth outside the publication owner.

### `FB-CP-004`

Files:

1. [control-plane-readiness-service.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/control-plane-readiness-service.js#L2465)
2. [control-plane-readiness-service.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/control-plane-readiness-service.js#L2489)

Assessment:

1. The async diagnostics path may repair stale spread-pending publication state
   before use.
2. The sync path cannot safely enter that owner lane today.
3. This is a real boundary for now, but it still needs explicit documentation
   and a future collapse plan.

### `FB-CP-005`

Files:

1. [control-plane-system-table-gateway.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/control-plane-system-table-gateway.js#L2425)
2. [authoritative-control-plane-view.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/authoritative-control-plane-view.js#L300)
3. [cdc-integration-service.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/cdc/cdc-integration-service.js#L1143)

Assessment:

1. The codebase already has one canonical authoritative control-plane read
   ingress.
2. The remaining work is to shrink the option surface rather than to add yet
   another caller-local fallback.

### `FB-CP-006`

Files:

1. [control-plane-system-table-gateway.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/control-plane-system-table-gateway.js#L1668)
2. [bootstrap-api.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/bootstrap/bootstrap-api.js#L557)

Assessment:

1. Startup and bootstrap still keep a direct-SQL mutation bridge alive.
2. That violates the one write ingress rule and should be removed rather than
   normalized.

### `FB-CP-007`

Files:

1. [active-node-projection.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/active-node-projection.js#L343)
2. [recovery-protocol-snapshot.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/control-plane/recovery-protocol-snapshot.js#L281)

Assessment:

1. The recovery spread fallback is now explicit and shared.
2. It is still degraded evidence, but it is no longer a scattered local
   special case.

### `FB-CP-008`

Files:

1. [leader-readiness-gate.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/cache/leader-readiness-gate.js#L186)
2. [query-router.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/query-router.js#L321)
3. [query-executor.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/query-executor.js#L3443)

Assessment:

1. Several consumers still keep a bounded services-row bridge while owner-row
   leader identity converges.
2. This is not obviously permanent, but it is also not just caller noise.
