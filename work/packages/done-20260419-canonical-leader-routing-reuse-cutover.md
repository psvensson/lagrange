# Canonical Leader Routing Reuse Cutover

## Status

Complete on 2026-04-19 after the shared leader-routing cutover plus focused
bootstrap/partition tests and repo metrics. Named harness reruns remain
intentionally deferred until the full reuse-first tranche is closed.

## Why

Canonical leader identity is already modeled in one reusable helper, but
neighboring runtime owners still re-derive it locally. That leaves the same
owner-row versus service-role question encoded differently in query, bootstrap,
partition, and join paths.

This package makes those callers reuse one leader-identity grammar so the
system answers leader-routing questions through one canonical contract.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Cut local leader-identity derivation in `src/partition/partition-service.js`
   over to `src/query/canonical-leader-routing.js`
2. Cut neighboring cache-based leader checks in
   `src/bootstrap/node-joining-service.js` over to the same helper
3. Touch direct collaborator tests and diagnostics only where needed to verify
   the shared leader-routing contract

## Out Of Scope

1. New leader-election or routing features
2. Broad bootstrap or query redesign outside the touched leader-identity paths
3. Message routing or transport retry redesign

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`
4. `seven-node-read-write-load-distribution`

## Invariants

1. Owner rows still outrank service-role witnesses when canonical leader
   metadata is present.
2. Callers must not re-encode the leader-node versus leader-service fallback
   lattice after the cutover.
3. Focused partition and bootstrap tests plus metrics must remain green.

## Shared Boundary Contract

- Semantic owner: `src/query/canonical-leader-routing.js`
- Canonical contract shape / vocabulary: one leader-identity snapshot with
  `state`, `source`, `leaderReference`, `leaderNodeId`, and witness counts
- Allowed consumers: query, bootstrap, partition, and diagnostics owners that
  need canonical leader identity
- Prohibited reinterpretations: raw owner-row versus `raft_role` branch piles
  in individual consumers
- Primary diagnostics / proof surfaces: bootstrap leader-routing tests,
  partition leader-resolution tests, focused scenario evidence

## Detection / Analysis Tasks

- [x] Inventory the remaining local leader-identity derivations around the
      active hotspots.
- [x] Mark consumers that only need `leaderNodeId` versus full identity state.
- [x] Preserve the stale-owner-row fallback behavior explicitly in tests.

## Implementation Tasks

- [x] Cut `PartitionService` over to the shared leader-identity helper.
- [x] Cut bootstrap join leader-visibility checks over to the shared helper.
- [x] Delete superseded local leader-identity branch logic.

## Residual Closure Inventory

- [x] Partition and bootstrap leader-identity reads share one reusable grammar.
- [x] Local leader-identity fallback branches are deleted where superseded.
- [x] Diagnostics still explain missing owner metadata versus missing service
      witnesses clearly.

## Validation

1. `test/partition/partition-service.test.js`
2. `test/bootstrap/node-joining-service.test.js`
3. Focused scenario evidence for the named join/restart lanes
4. `npm run test:metrics`

## Done When

1. The touched callers reuse the shared leader-identity helper.
2. Owner-row and service-role precedence are proven by tests.
3. The named scenario lanes keep green or fail with one obvious typed routing
   blocker story.
