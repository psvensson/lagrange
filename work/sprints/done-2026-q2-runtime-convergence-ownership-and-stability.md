# Runtime Convergence Ownership and Stability Sprint (AGPL)

## Goal

Understand and eliminate the three residual runtime instability families from
the focused distributed rerun pass:

1. selected-seed startup snapshot and admin readiness collapse
2. post-load publication and readiness divergence
3. late admin and control-plane collapse under sustained recovery pressure

## Status

Closed on 2026-04-11. The evidence-alignment slice is complete, the
publication and late-pressure exploratory slices were superseded by newer
runtime-completion packages, and the remaining selected-seed startup work was
folded into the runtime-completion sprint so only one active runtime sprint
remains.

## Why This Sprint Exists

The readiness-classification sprint separated timeout-shaped delay from
terminal failure, but the April 11, 2026 focused reruns still failed in three
repeatable runtime families:

1. startup active-gate waits can still hinge on a selected seed whose control
   snapshot is not survivable
2. publication and readiness can still diverge after load, drain, and repair
   pressure
3. control-plane recovery pressure can still collapse owner-RPC, transport,
   discovery-repair, and admin table-visibility paths together

This sprint moves from report-shape cleanup to runtime ownership, invariants,
and pressure containment. The target is not another timeout tweak. The target
is a structure in which the system either converges or fails behind one
explicit owner path per runtime invariant.

## Sprint Umbrella

1. [Runtime failure reproduction and trace alignment pack](../packages/done-20260411-runtime-failure-reproduction-and-trace-alignment.md)
2. [Selected-seed readiness and control-snapshot survivability](../packages/active-20260411-selected-seed-readiness-and-control-snapshot-survivability.md)
3. [Publication and readiness convergence invariant ownership](../packages/done-20260411-publication-readiness-convergence-invariant-ownership.md)
4. [Recovery-pressure containment and admin visibility stability](../packages/done-20260411-recovery-pressure-containment-and-admin-visibility-stability.md)

## Execution Snapshot (2026-04-11)

Implemented runtime-owner changes in:

1. `src/control-plane/membership-publication-coordinator.js`
2. `src/admin/admin-service-discovery.js`
3. `src/admin/admin-control-snapshot.js`
4. `test/distributed/harness/cluster.js`

Focused regression coverage was added in:

1. `test/control-plane/active-node-projection.test.js`
2. `test/control-plane/membership-publication-coordinator.test.js`
3. `test/admin/admin-service-discovery.test.js`
4. `test/admin/admin-control-snapshot.test.js`
5. `test/distributed/harness/__tests__/cluster.test.js`

Focused validation snapshot:

1. `test/control-plane/active-node-projection.test.js`: pass
2. `test/admin/admin-service-discovery.test.js`: pass
3. `test/admin/admin-control-snapshot.test.js`: pass
4. `test/control-plane/membership-publication-coordinator.test.js`: new path passes, but the suite still contains one unrelated existing failure in `getDispatchRetryRowsForNode refreshes through the replica-operation owner when priority recovery leaves cache empty`
5. `test/distributed/harness/__tests__/cluster.test.js`: new snapshot-selection path passes, but the suite still contains existing failures around CL-004 / CL-006 timeout diagnostics

Focused distributed rerun snapshot against the 7 previously failing scenarios:

1. `seven-node-load-during-partitioning`: pass
2. `node-join-under-load`: fail, startup ACTIVE timeout with selected snapshot `3/5`
3. `postgres-baseline-comparison`: fail, startup ACTIVE timeout with selected snapshot `0/5`
4. `seven-node-postgres-baseline-partition-split`: fail, startup ACTIVE timeout with selected snapshot `0/7`
5. `seven-node-table-partition-distribution`: fail, startup ACTIVE timeout with selected snapshot `0/7`
6. `seven-node-read-write-load-distribution`: fail, split-policy visibility / participant-failure path
7. `seven-node-read-write-load-transaction-recovery`: fail, `table_id` visibility timeout after control-lane timeout

Net effect:

1. one startup/load scenario now stabilizes
2. startup-selected-seed collapse remains the dominant unresolved family
3. late admin visibility and control-lane pressure remain unresolved
4. the post-load publication-divergence scenario no longer failed at the previous drain/verify symptom; it now fails earlier in startup, so that invariant still needs direct owner work after startup authority is stabilized

## Closed Packages

1. [Runtime failure reproduction and trace alignment pack](../packages/done-20260411-runtime-failure-reproduction-and-trace-alignment.md)
2. [Publication and readiness convergence invariant ownership](../packages/done-20260411-publication-readiness-convergence-invariant-ownership.md)
3. [Recovery-pressure containment and admin visibility stability](../packages/done-20260411-recovery-pressure-containment-and-admin-visibility-stability.md)

## Active Queue

None. Closed.

## Follow-On Work

1. [Runtime Completion Contracts and Owner Simplification Sprint](./active-2026-q2-runtime-completion-contracts-and-owner-simplification.md)
2. [Selected-seed readiness and control-snapshot survivability](../packages/active-20260411-selected-seed-readiness-and-control-snapshot-survivability.md)
3. [Membership publication planning snapshot simplification](../packages/active-20260411-membership-publication-planning-snapshot-simplification.md)
4. [Pressure-owned visibility and repair containment](../packages/active-20260411-pressure-owned-visibility-and-repair-containment.md)

## Out-of-Scope for This Sprint

1. New product feature work outside AGPL runtime stabilization scope.
2. Harness report polish that does not improve runtime ownership or failure
   diagnosis.
3. Unbounded timeout increases or retry inflation used to hide instability.
4. Pro or Enterprise-only operational features not mapped to AGPL ownership in
   `edition-matrix.md`.

## Rollout Order

1. Build one scenario-to-signature evidence table from the failing rerun set.
2. Stabilize selected-seed control-snapshot survivability so startup gating
   cannot depend on a seed that is not authoritatively usable.
3. Install one publication and readiness convergence invariant across startup,
   load, drain, and repair phases.
4. Contain recovery pressure so transport, discovery repair, CDC retry, and
   admin visibility paths cannot recursively collapse each other.
5. Re-run the focused scenario set before broadening the matrix again.

## Exit Check

Closed. The exploratory runtime-family split was completed, and the remaining
useful structural work now continues under the runtime-completion sprint.
