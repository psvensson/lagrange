# Duplication Ratchet Classification And Boundary Reduction

## Status

Done on 2026-04-20.

This package was split out of
`done-20260420-startup-workflow-durability-and-authority-unification-umbrella.md`
after the startup proof lanes went green and `npm run test:metrics` exposed a
second concern: repo-wide duplication ratchet drift that is broader than the
startup workflow boundary.

Current validation evidence before this package:

1. `npm run test:metrics`
   - cognitive complexity: green
   - circular dependencies: green
   - duplication: red
2. Initial duplication ratchet failure:
   - `56` clone groups vs baseline `12`
   - `4725` duplicated lines vs baseline `307`

Top offenders reported by the initial ratchet included both startup-adjacent
and non-startup files:

1. `src/partition/partition-service.js`
2. `src/message-group/message-group-service-class-part-2.js`
3. `src/message-group/message-group-service.js`
4. `src/rebalancer/operation-workflow-owner.js`
5. `src/bootstrap/node-joining-service.js`
6. `src/query/table-creation-service.js`
7. `src/query/query-executor.js`
8. `src/bootstrap/node-joining-service-segment-3.js`
9. `src/bootstrap/node-joining-service-shared.js`

## Why

The startup workflow package set reduced cognitive complexity and unified
ownership, but the shared static metrics gate still fails on large clone
groups that cut across multiple subsystems. That should not be silently
treated as unfinished startup workflow work, but it also should not disappear.

This package exists to classify which duplication is true same-boundary
semantic duplication, which duplication is segmentation fallout, and which
duplication belongs to older oversized owners outside startup.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Classify the current duplication report into startup-adjacent and
   non-startup concerns.
2. Reduce clone groups where one owner can be collapsed without creating a new
   abstraction layer.
3. Prefer owner reduction and shared semantic helpers over further file-size
   segmentation.
4. Return `npm run test:duplication` to green, or explicitly justify a
   bounded baseline reset if the current baseline is stale and the reduction
   work is proven.

## Out Of Scope

1. Reopening the startup workflow durability or startup-authority design work.
2. Broad feature work.
3. Mechanical extraction that preserves the same semantic duplication behind
   more files.

## Invariants

1. Duplication reduction must lower semantic owner count, not just move
   duplicate code into new bags.
2. Startup-boundary duplication fixes must preserve the single-owner workflow,
   authority, and handoff contracts closed by the 20260420 startup packages.
3. Any baseline change must be explicit, justified, and smaller than the
   current ratchet failure.

## Hotspots

1. `src/bootstrap/node-joining-service.js`
2. `src/bootstrap/node-joining-service-segment-3.js`
3. `src/bootstrap/node-joining-service-shared.js`
4. `src/partition/partition-service.js`
5. `src/message-group/message-group-service.js`
6. `src/message-group/message-group-service-class-part-2.js`
7. `src/rebalancer/operation-workflow-owner.js`
8. `src/query/query-executor.js`
9. `src/query/table-creation-service.js`

## Classification

### Collapsible Wrapper / Segmented Root Duplication

These clone groups were same-owner wrapper fallout and were reduced directly in
this package:

1. `src/message-group/message-group-service.js`
2. `src/query/table-creation-service.js`
3. `src/bootstrap/owners/bootstrap-readiness-owner.js`
4. `src/bootstrap/node-joining-service.js`
5. `src/node/replica-handler.js`
6. `src/rebalancer/unified-rebalancer.js`
7. `src/partition/partition-service.js`

### Remaining Segmentation Fallout

These are still large clone groups, but they are now concentrated in older
segmented owners rather than the wrapper surfaces:

1. `src/partition/partition-service-segment-*` and
   `src/partition/partition-service-shared.js`
2. `src/bootstrap/node-joining-service-segment-3.js` and
   `src/bootstrap/node-joining-service-shared.js`
3. `src/cdc/cdc-integration-service.js` and
   `src/cdc/cdc-integration-service-shared.js`
4. `src/admin/admin-websocket-api.js` and
   `src/admin/admin-websocket-api-shared.js`
5. `src/control-plane/control-plane-readiness-service.js` and
   `src/control-plane/control-plane-readiness-service-shared.js`

### Older Oversized Owner Drift

These remain outside the direct wrapper-collapse pattern and would require
broader semantic work, not another quick surface cleanup:

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/query/query-executor.js`
3. `src/bootstrap/shared/node-state-publication-owner.js`
4. `src/rebalancer/rebalance-coordinator.js`
5. `src/control-plane/control-plane-system-table-gateway.js`

## Detection / Analysis Tasks

- [x] Classify each top clone group by semantic boundary and owner.
- [x] Identify which clone groups came from segmentation rather than separate
      semantics.
- [x] Decide whether the remaining ratchet delta is fixable directly or
      requires a temporary baseline adjustment.

## Implementation Tasks

- [x] Remove startup-adjacent clone groups that can be collapsed safely.
- [x] Remove at least one non-startup top clone group so the package does not
      bias toward startup-only cleanup.
- [x] Re-run `npm run test:duplication` and capture the reduced report.
- [x] If a baseline adjustment is still necessary, write the justification in
      this package before changing it.

## Reduction Landed

This package reduced duplicated wrapper roots by moving root-only methods into
the segmented class chain and turning the root files into thin export surfaces:

1. `src/message-group/message-group-service.js`
2. `src/query/table-creation-service.js`
3. `src/bootstrap/owners/bootstrap-readiness-owner.js`
4. `src/bootstrap/node-joining-service.js`
5. `src/node/replica-handler.js`
6. `src/rebalancer/unified-rebalancer.js`
7. `src/partition/partition-service.js`

Measured reduction before baseline reset:

1. `56` clone groups / `4725` duplicated lines
2. `45` clone groups / `3208` duplicated lines

That is a reduction of `11` clone groups and `1517` duplicated lines without
introducing new abstraction bags.

## Baseline Reset Justification

The original `12` / `307` ratchet was stale relative to the already-landed
segmented owners in `partition-service`, `node-joining-service`,
`cdc-integration-service`, control-plane readiness, and rebalancer workflow.
This package removed the wrapper-root duplication that was safe to collapse
inside one work cycle and proved the touched boundaries, but the remaining
delta is dominated by older segmented-owner internals that require dedicated
semantic consolidation packages.

Resetting the ratchet to `45` clone groups and `3208` duplicated lines is:

1. materially smaller than the incoming failure (`56` / `4725`)
2. tied to a measured post-reduction report, not an arbitrary allowance
3. strict enough to prevent the wrapper duplication from silently returning
4. explicit about where the remaining debt lives

Follow-on reduction work should ratchet this down from the current post-cleanup
baseline rather than preserving the historical stale number.

## Current Validation Evidence

1. Focused owner-path proof:
   - `npx tap test/bootstrap/node-joining-service.test-part-4.js`
   - `npx tap test/bootstrap/startup-authority-consumption.test.js`
   - `npx tap test/message-group/message-group-service.test.js`
   - `npx tap test/query/table-creation-service.test.js`
   - `npx tap test/node/replica-handler.test.js test/rebalancer/rebalancer-shutdown-guard.test.js`
   - `npx tap test/partition/partition-service-shutdown-timers.test.js test/partition/partition-service.test.js test/partition/table-partition-structure.property.test.js`
2. Reduced duplication report before baseline reset:
   - `45` clone groups
   - `3208` duplicated lines
3. Remaining highest-signal clone groups after reduction:
   - `src/partition/partition-service-segment-4-part-1.js`
   - `src/rebalancer/operation-workflow-owner.js`
   - `src/query/query-executor.js`
   - `src/bootstrap/node-joining-service-segment-3.js`
   - `src/bootstrap/node-joining-service-shared.js`

## Residual Handoff

The remaining internal segment/shared clone groups are split to:

`done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`

That follow-on owns the deeper semantic consolidation work for:

1. `partition-service-segment-*` and `partition-service-shared.js`
2. `node-joining-service-segment-3.js` and `node-joining-service-shared.js`
3. `cdc-integration-service.js` / `cdc-integration-service-shared.js`
4. `admin-websocket-api.js` / `admin-websocket-api-shared.js`
5. `operation-workflow-owner.js`
6. `query-executor.js`
7. `control-plane-readiness-service.js`

## Validation

1. `npm run test:duplication`
2. Focused owner-path suites for any touched boundary
3. `npm run test:metrics`

## Done When

1. The duplication ratchet is green, or an explicitly justified smaller
   baseline is in place.
2. Startup-adjacent duplication no longer depends on duplicated root wrapper
   surfaces across `node-joining-service*`; remaining internal segment/shared
   duplication is split explicitly to the follow-on package above.
3. The reduction is semantic, not merely mechanical file shuffling.
