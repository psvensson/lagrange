# Phase 1 Implementation Plan

## Goal

Phase 1 establishes a single membership lifecycle authority and removes the
most important ambiguity first: what lifecycle state the cluster believes a
member is in while a publication epoch is opening or closing.

This phase is intentionally split into four slices so implementation can move
from the existing publication owner outward rather than trying to rewrite join,
restart, and leave orchestration in one step.

## Slice A: Define And Persist The Lifecycle Taxonomy

### Outcome

Create the canonical membership lifecycle taxonomy in code and persist the
publication-facing lifecycle summary in `control_plane_publications` rows.

### Files

- `src/control-plane/membership-lifecycle-constants.js`
- `src/control-plane/membership-publication-coordinator.js`
- `src/control-plane/system-row-normalizers.js`
- `src/bootstrap/system-table-schemas-constants.js`
- `test/control-plane/membership-publication-coordinator.test.js`

### Scope

1. Define the lifecycle states:
   - `absent`
   - `admitted`
   - `provisioning`
   - `caught_up`
   - `publish_pending`
   - `published_active`
   - `draining`
   - `removed`
2. Define the valid transitions as one canonical map.
3. Persist a `membership_lifecycle_summary` on publication rows so the durable
   publication artifact carries explicit lifecycle semantics instead of only
   inferred publication status.
4. Update acknowledgement flow so the summary advances from
   `publish_pending` to `published_active` on final acknowledgement.

### Exit Criteria

1. Publication rows expose normalized lifecycle summary data.
2. Tests prove the lifecycle taxonomy and publication-state mapping.

## Slice B: Introduce A Lifecycle Owner Facade For Join And Restart Intent

### Outcome

Create a thin lifecycle owner facade so `NodeJoiningService` and restart paths
submit membership intent through one interface rather than embedding semantic
branching in multiple call sites.

### Files

- `src/control-plane/membership-lifecycle-controller.js`
- `src/bootstrap/node-joining-service.js`
- `src/index.js`
- supporting tests in bootstrap and control-plane suites

### Scope

1. Introduce the lifecycle owner API for:
   - join admission intent
   - restart re-entry intent
   - drain intent
   - removal intent
2. Route current join and restart entrypoints through the new facade first.
3. Preserve existing behavior while removing semantic branching from callers.

### Exit Criteria

1. Join and restart intent are submitted through one owner interface.
2. Existing callers become adapters rather than semantic owners.

## Slice C: Cut Active-Node Consumers To Published Membership

### Outcome

Make publication the sole active-set authority for runtime convergence and
distributed harness decisions.

### Files

- `src/control-plane/active-node-projection.js`
- `src/admin/admin-control-snapshot.js`
- `src/bootstrap/owners/bootstrap-cluster-view-owner.js`
- harness assertions and cluster utilities under `test/distributed/harness/`

### Scope

1. Update runtime and harness consumers to require published membership for
   active-set truth wherever the new hard-cutover boundary applies.
2. Restrict fallback projection logic to explicit degraded diagnostics only.

### Exit Criteria

1. No convergence or admission decision derives cluster membership outside the
   published membership artifact.

## Slice D: Delete Legacy Lifecycle Branches

### Outcome

Remove now-obsolete semantic branches from join and restart code after the new
owner path is verified.

### Files

- `src/bootstrap/node-joining-service.js`
- `src/bootstrap/shared/node-registration-owner.js`
- `src/bootstrap/owners/bootstrap-join-admission-owner.js`
- any remaining legacy lifecycle helpers identified during Slice B/C

### Scope

1. Remove duplicated restart/join semantic branching.
2. Remove legacy fallback paths that still infer lifecycle completion outside
   publication and the lifecycle owner.

### Exit Criteria

1. No old lifecycle semantic path remains active for Phase 1 concerns.

## Sequencing

1. Implement Slice A completely first.
2. Land Slice B next, but only after Slice A is test-covered.
3. Perform Slice C immediately after lifecycle owner ingress exists.
4. Do not mark Phase 1 complete until Slice D deletion inventory is finished.