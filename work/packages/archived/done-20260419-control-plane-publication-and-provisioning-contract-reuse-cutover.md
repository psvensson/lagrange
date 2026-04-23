# Control-Plane Publication and Provisioning Contract Reuse Cutover

## Status

Complete on 2026-04-19 after the shared publication/provisioning contract
cutover plus focused bootstrap/query tests and repo metrics. Named harness
reruns remain intentionally deferred until the full reuse-first tranche is
closed.

## Why

The codebase already has reusable ingress target selection, retryable
control-plane writes, and owner-contract outcomes. The main remaining hotspots
still shadow those contracts in node-state publication and table-partition
provisioning.

This package collapses those parallel defer/retry grammars toward the existing
shared control-plane contract instead of introducing more subsystem-local
outcomes.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reuse shared control-plane contract vocabulary in
   `src/bootstrap/node-joining-service.js`
2. Reuse shared defer/retry and outcome shaping in
   `src/query/sql-query-engine.js`
3. Touch ingress and helper modules only where needed to preserve one
   publication/provisioning contract

## Out Of Scope

1. New provisioning or publication features
2. Broad control-plane redesign outside the touched owner paths
3. Rebalancer lifecycle redesign outside direct collaborators

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`
4. `seven-node-load-during-partitioning`

## Invariants

1. Defer, wait, proceed, and stop outcomes must reuse the shared owner
   contract shape.
2. Ingress target selection must stay owned by the existing ingress helper.
3. Focused bootstrap and query tests plus metrics must remain green.

## Shared Boundary Contract

- Semantic owner: shared control-plane outcome and ingress helpers
- Canonical contract shape / vocabulary: one outcome carrying
  `contractState`, `nextAction`, `reasonCodes`, and `retryAfterMs`
- Allowed consumers: node-state publication, provisioning, diagnostics, tests
- Prohibited reinterpretations: bespoke deferred-publication and provisioning
  result bags that restate the same semantics differently
- Primary diagnostics / proof surfaces: join tests, provisioning tests,
  readiness diagnostics, named scenario evidence

## Detection / Analysis Tasks

- [x] Inventory subsystem-local defer/retry result shapes.
- [x] Mark call sites that can consume `OwnerContractOutcome` directly.
- [x] Prove adaptive retry and pressure defer behavior with focused tests.

## Implementation Tasks

- [x] Normalize node-state publication outcomes to the shared contract.
- [x] Normalize provisioning defer/retry outcomes to the shared contract.
- [x] Delete superseded local outcome vocabularies where safe.

## Residual Closure Inventory

- [x] Node-state publication and provisioning consume shared control-plane
      outcome grammar.
- [x] Ingress selection stays in one owner.
- [x] Superseded local defer/retry result shaping is deleted.

## Validation

1. Touched bootstrap tests
2. Touched query/provisioning tests
3. Focused distributed scenario evidence for the named lanes
4. `npm run test:metrics`

## Done When

1. Publication and provisioning reuse the shared contract vocabulary.
2. Callers no longer interpret competing defer/retry result bags.
3. The named scenario lanes keep green or fail with one obvious typed contract
   blocker story.
