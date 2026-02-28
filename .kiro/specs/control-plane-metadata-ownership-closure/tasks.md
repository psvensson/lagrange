# Implementation Plan: Control-Plane Metadata Ownership Closure

## Overview

This plan removes control-plane metadata deviations from the system guidelines
by consolidating ownership, propagation, cache application, and read-model
contracts for all affected table families.

The work must proceed in owner-first order:

1. define the owner matrix
2. make all paths delegate to those owners
3. tighten propagation and cache handoff semantics
4. correct read models and diagnostics
5. prove parity with production-path tests

No benchmark-only fixes, no per-table ad hoc exceptions, and no fallback paths
that keep old and new behavior active in parallel are allowed.

## Tasks

- [ ] 1. Establish the canonical owner matrix and baseline evidence
  - Create and publish the owner matrix for:
    - `nodes` + `node_endpoints`
    - `service_definitions` + `service_endpoints`
    - `services`
    - `tables` + `partitions` + `replica_operations`
  - Capture baseline behavior and current failures with targeted startup, join,
    discovery, and parity diagnostics.
  - Record current deviations from the system guidelines as explicit migration
    targets rather than hidden tribal knowledge.
  - _Requirements: 1.1, 1.2, 1.3, 10.5_

- [ ] 2. Consolidate node and endpoint registration ownership
  - Introduce or finalize shared owners for `nodes` and `node_endpoints`.
  - Convert bootstrap and join node registration code into delegation adapters.
  - Remove duplicate inline mutation bodies for node identity and endpoint row
    creation.
  - Add owner-path tests proving bootstrap and join both use the same owner.
  - _Requirements: 1.1, 2.1, 2.2, 3.3, 10.1_

- [ ] 3. Consolidate service catalog ownership
  - Introduce or finalize `ServiceCatalogOwner` for
    `service_definitions` and `service_endpoints`.
  - Convert built-in meta service registration helpers into delegation-only
    adapters or absorb them into the shared owner.
  - Ensure runtime endpoint writes use the same service-endpoint family
    contract.
  - Add tests proving `sys-postgres-wire` definition and endpoint rows are
    created through the same family owner in bootstrap, join, and runtime.
  - _Requirements: 1.1, 2.1, 2.2, 3.2, 7.1, 10.1_

- [ ] 4. Close replica lifecycle ownership for `services`
  - Enforce `ReplicaStateMachine` as the only `services` row creation owner.
  - Remove any remaining implicit row creation, repair upsert, or stale-cache
    field preservation in non-owner code.
  - Document and test explicit field ownership for identity, lifecycle, and
    consensus-role fields.
  - Add regression tests preventing non-owner rewrites of foreign-owned fields.
  - _Requirements: 2.1, 2.4, 3.1, 3.4, 10.1_

- [ ] 5. Consolidate table topology metadata ownership
  - Introduce or finalize a shared `TableTopologyMetadataOwner` for `tables`,
    `partitions`, and `replica_operations`.
  - Route bootstrap-time and later-created table metadata through the same
    owner path.
  - Remove benchmark-specific or table-specific topology row creation logic.
  - Add integration tests proving later-created table metadata converges using
    the same owner model as bootstrap-time control-plane metadata.
  - _Requirements: 1.1, 2.1, 2.3, 7.2, 9.3, 10.3_

- [ ] 6. Tighten control-plane CDC propagation semantics
  - Make `CDCGroupPropagationService` the single propagation owner for all
    affected table families.
  - Preserve authoritative event metadata end-to-end:
    - `timestamp`
    - `causeId`
  - Change zero-target or indeterminate safe fallback from silent success to
    explicit degraded/failure reporting.
  - Remove table-specific propagation differences between bootstrap-time and
    later-created partitions.
  - Add propagation contract tests for metadata preservation and zero-target
    failure behavior.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.2_

- [ ] 7. Implement one generic pre-subscription cache handoff
  - Add a shared handoff mechanism for writes to `CDC_PROPAGATED_TABLES` before
    local subscriptions are active.
  - Route the handoff through the same cache-application owner used by normal
    CDC.
  - Remove existing table-specific direct-cache exceptions once the generic
    handoff is verified.
  - Add startup/join tests proving the generic handoff works for all affected
    control-plane families.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.2_

- [ ] 8. Enforce one cache-application owner
  - Audit and remove any non-owner mutation of `SystemTableCache` for
    propagated control-plane rows.
  - Ensure immediate apply, replay, catchup, and handoff all use the same
    `CDCHandler` semantics.
  - Add contract tests proving ordering, dedupe, and schema watermark behavior
    are identical across all apply modes.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.2_

- [ ] 9. Correct discovery and readiness read models
  - Refactor `service_discovery_local()` and admin/preload diagnostics to use
    `service_definitions` + `service_endpoints` as the authoritative
    `sys-postgres-wire` family.
  - Remove any root-cause logic that treats `services` as the authoritative
    pgwire source.
  - Document and test the source-table contract for discovery, topology
    readiness, and schema-readiness reporting.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 10. Add generic SQL-vs-cache parity diagnostics
  - Implement a reusable per-node parity probe for all affected table families.
  - Include parity output in distributed diagnostics and baseline reports.
  - Update root-cause labeling to prioritize concrete parity mismatches over
    generic timeout-style categories.
  - Add tests for SQL-only, cache-only, key mismatch, and field mismatch cases.
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 11. Remove per-table CDC subscription deviations
  - Audit subscription/catchup registration for `CDC_PROPAGATED_TABLES`.
  - Replace ad hoc per-table branching with shared family-level wiring.
  - Document any unavoidable temporary exception in the owner matrix and add a
    sunset task for it.
  - Add regression tests proving later-created topology rows and startup-time
    control-plane rows share the same subscription semantics.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 12. Update steering docs and architecture artifacts
  - Add the control-plane owner matrix to `.kiro/steering/architecture.md`.
  - Align `.kiro/steering/system guidelines.md` and
    `.kiro/steering/testing-guidelines.md` with the concrete rules in this
    spec.
  - Add explicit no-exception statements for:
    - undocumented field ownership
    - silent propagation success
    - table-specific startup/join cache seeding
  - _Requirements: 1.3, 1.4, 10.5_

- [ ] 13. Add production-path regression coverage
  - Add integration tests proving `sys-postgres-wire` rows become visible and
    admin-ready on every node after bootstrap and join.
  - Add integration tests proving later-created user-table topology metadata is
    present in local SQL and local cache on every node.
  - Add distributed scenario assertions that fail on SQL/cache divergence rather
    than only on elapsed time.
  - _Requirements: 7.5, 8.4, 9.3, 10.2, 10.3_

- [ ] 14. Final closure checkpoint
  - Re-run targeted unit, integration, and distributed diagnostics.
  - Confirm no affected control-plane family retains an undocumented non-owner
    write path or direct-cache exception.
  - Mark tasks complete only after production-path evidence shows owner,
    propagation, cache, and read-model parity.
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

## Non-Negotiable Guardrails

1. No benchmark-only fixes.
2. No new local shadow caches.
3. No whole-row lifecycle overwrites for shared control-plane rows.
4. No cache reconstruction writes from stale observed state.
5. No silent propagation success without resolved remote delivery semantics.
6. No undocumented startup/join direct-cache exceptions.
7. No completion claims without production-path evidence.
