# Architecture Phased Plan: Control-Plane Publication Convergence Hardening

Date: 2026-03-24

## Purpose

Define a concrete architecture path to eliminate restart-churn convergence
failures by introducing one durable control-plane publication contract,
priority recovery mode, and staged readiness cutover.

This plan complements:

1. `requirements.md`
2. `design.md`
3. `tasks.md`

## Problem Summary

Current instability is dominated by an ownership gap between authoritative
writes and cluster-wide convergence:

1. nodes reconnect and send state updates,
2. authoritative discovery repair can refill observational cache state,
3. priority control-plane partitions remain under-spread,
4. CDC replay backlog delays metadata observation,
5. no single owner publishes a cluster-wide membership epoch that all
   consumers share,
6. harness and runtime consumers correctly detect disagreement.

## Architectural Goals

1. Make convergence completion depend on one durable publication artifact.
2. Move priority control-plane recovery ahead of all optional control-plane
   work.
3. Serialize publication and priority recovery progression through one owner
   model.
4. Distinguish published convergence from repaired observation everywhere.
5. Make readiness, benchmark admission, and harness checks key off the same
   publication epoch.

## Core Invariants

### Invariant A: Single Publication Owner

1. Exactly one owner publishes cluster membership convergence.
2. The publication owner derives state from canonical topology owners.
3. No consumer may publish or infer completion independently.

### Invariant B: Durable Completion Barrier

1. Publication completion requires a durable publication row.
2. Publication completion requires durable acknowledgement from the required
   acknowledgement set.
3. Local cache repair alone never satisfies publication completion.

### Invariant C: Priority Recovery First

1. Priority control-plane partitions recover before non-critical rebalancing.
2. Publication cannot close while priority partitions are under-spread.
3. Optional background work yields while priority recovery mode is active.

### Invariant D: Readiness Staging

1. Recovery readiness cannot become true before publication convergence.
2. Serve readiness remains stricter than recovery readiness.
3. Benchmark-ready admission uses the same publication convergence gate as
   restart recovery.

### Invariant E: Observation vs Convergence Separation

1. `SystemTableCache` remains the steady-state observational model.
2. Authoritative repair may improve observation.
3. Only the durable publication artifact defines convergence completion.

## Canonical State Machines

## 1. Publication Lifecycle State Machine

States:

1. `IDLE`
2. `DERIVING`
3. `OPEN`
4. `ACK_PENDING`
5. `PUBLISHED`
6. `ABANDONED`
7. `SUPERSEDED`

Allowed transitions:

1. `IDLE -> DERIVING`
2. `DERIVING -> OPEN`
3. `OPEN -> ACK_PENDING`
4. `ACK_PENDING -> PUBLISHED`
5. `OPEN -> SUPERSEDED`
6. `ACK_PENDING -> SUPERSEDED`
7. `OPEN -> ABANDONED`
8. `ACK_PENDING -> ABANDONED`
9. `PUBLISHED -> DERIVING` when canonical topology changes

Rules:

1. Each open or superseding publication allocates a strictly larger
   publication epoch.
2. Only the publication owner may move a publication row to `PUBLISHED`.
3. A stale executor may not advance a publication row past a newer fence
   token.

## 2. Priority Recovery Mode State Machine

States:

1. `INACTIVE`
2. `RECOVERY_REQUIRED`
3. `QUORUM_REPAIR`
4. `SPREAD_REPAIR`
5. `PUBLICATION_REPAIR`
6. `READY_TO_EXIT`

Rules:

1. Enter `RECOVERY_REQUIRED` when publication is degraded, priority partitions
   are under-spread, or restart recovery is active.
2. `READY_TO_EXIT` requires quorum, spread, writable publication path, and a
   durable published epoch.
3. Exit to `INACTIVE` only after the latest required epoch is published.

## 3. Readiness Projection State Machine

External readiness classes:

1. `live`
2. `member-healthy`
3. `control-plane-writable`
4. `publication-healthy`
5. `control-plane-published`
6. `recovery-ready`
7. `serve-ready`

Projection source order:

1. durable publication artifact
2. authoritative control snapshot / owner reads
3. local readiness cache snapshot

Disallowed:

1. treating authoritative discovery repair as equivalent to publication
   completion
2. using cache-only disagreement windows as successful convergence

## Missing Capabilities To Implement

1. Durable `control_plane_publications` table and schema wiring.
2. Publication owner workflow and acknowledgement path.
3. Publication-aware priority recovery mode.
4. `controlPlanePublished` readiness dimension.
5. Publication-aware active-node projection and benchmark admission.
6. Harness and admin cutover to published convergence.

## Phased Rollout Plan

## Phase 0: Instrument The Boundary

Scope:

1. Add publication diagnostics to control snapshot and readiness surfaces.
2. Add failing tests for publication epoch agreement and published active-node
   set agreement.
3. Preserve existing behavior while instrumentation is added.

Entry criteria:

1. Existing focused suites pass.

Exit criteria:

1. Failure artifacts can distinguish repaired observation from published
   convergence.

## Phase 1: Introduce The Durable Publication Artifact

Scope:

1. Add `control_plane_publications`.
2. Implement the publication owner workflow.
3. Add acknowledgement persistence and epoch monotonicity.

Entry criteria:

1. Phase 0 diagnostics in place.

Exit criteria:

1. One durable publication epoch can be opened, acknowledged, and closed in
   focused tests.

## Phase 2: Add Priority Recovery Mode

Scope:

1. Introduce explicit priority recovery mode.
2. Reuse existing priority partition spread blockers.
3. Add dedicated lanes and budget plumbing for publication and priority
   recovery work.

Entry criteria:

1. Publication artifact exists.

Exit criteria:

1. Non-critical rebalancing yields while priority recovery mode is active.
2. Priority partitions converge before general rebalancing resumes.

## Phase 3: Readiness And Projection Cutover

Scope:

1. Add `controlPlanePublished`.
2. Make recovery readiness depend on publication convergence.
3. Cut active-node projection, restart readiness, and benchmark admission over
   to published state.

Entry criteria:

1. Publication workflow and priority recovery mode are available.

Exit criteria:

1. Focused restart readiness tests use the published epoch.
2. Benchmark-ready node selection uses the published active-node set.

## Phase 4: Harness And Admin Cutover

Scope:

1. Extend admin control snapshot with publication and acknowledgement details.
2. Update harness convergence assertions to require agreement on published
   epoch and active-node set.

Entry criteria:

1. Readiness and projection cutover complete.

Exit criteria:

1. Harness failures now refer to publication disagreement, not cache-only
   disagreement.

## Phase 5: Distributed Validation Ladder

Scope:

1. Run focused suites.
2. Run rolling restart.
3. Run node join under load.
4. Run seed restart under load.
5. Run transaction recovery under restart churn.
6. Rerun the broader harness matrix.

Entry criteria:

1. All earlier phases complete.

Exit criteria:

1. Published convergence replaces repaired observation as the success boundary
   in distributed scenarios.
2. The previously failing restart-churn scenarios run green.

## Rollback Strategy

1. The publication artifact is additive and can coexist with current cache-only
   convergence logic during phased rollout.
2. Admin and harness consumers can temporarily dual-read old and new signals
   during cutover.
3. Final success criteria switch only after the new publication path is proven
   in focused and scenario validation.
