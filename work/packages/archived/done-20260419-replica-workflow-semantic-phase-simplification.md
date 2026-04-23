# Replica Workflow Semantic Phase Simplification

## Status

Complete on 2026-04-19 after landing the shared replica semantic-phase
contract, witness derivation, and rebalancer read-path cutovers on focused
proof. Named harness reruns remain intentionally deferred until the completed
package set is handed back to the harness lane.

## Why

Replica workflow durable rows still mix semantic phase with dispatch and
transport substeps. The system needs a smaller semantic phase model so replay,
reconcile, and proof all talk about the same lifecycle.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Shrink durable replica-operation phases to semantic lifecycle only.
2. Move dispatch/retry/reconnect substeps out of durable workflow meaning.
3. Add explicit witnesses for activation, source retirement, settlement, and
   failure.

## Scenario Targets

1. `node-join-under-load`
2. `seven-node-load-during-partitioning`
3. `seven-node-read-write-load-transaction-recovery`

## Residual Closure Inventory

- [x] Rebalancer read paths now expose one shared semantic phase plus explicit
      lifecycle witnesses for activation, retirement, settlement, and failure.
- [x] In-flight and terminal reasoning now prefers semantic phase over raw
      status/step fallback in repository, liveness, and unified rebalancer
      diagnostics.
- [x] Dispatch/reconcile callers can prove target-ready versus
      source-retiring versus settled work without restating the old raw step
      lattice locally.

## Validation

1. `test/rebalancer/replica-status-completeness.property.test.js`
2. `test/rebalancer/replica-operation-repository.test.js`
3. `test/rebalancer/unified-rebalancer.test.js`
4. `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
5. `npm run test:metrics`
