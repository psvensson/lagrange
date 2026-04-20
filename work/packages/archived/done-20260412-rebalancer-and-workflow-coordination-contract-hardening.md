# Rebalancer and Workflow Coordination Contract Hardening

## Why

The rebalancer and workflow owners turn state contracts into cluster actions.
If they consume nullish or ambiguous state, the system amplifies that ambiguity
into unstable runtime behavior.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Hotspots

1. `src/rebalancer/unified-rebalancer.js`
2. `src/rebalancer/replica-operation-repository.js`
3. `src/rebalancer/operation-workflow-owner.js`

## Invariants

1. Repository outputs distinguish explicit absence from observation failure.
2. Rebalancer/workflow code does not treat `null` as a meaningful state bucket.
3. Actionability is based on explicit workflow/result states.

## Analysis Tasks

- [ ] Inventory null/undefined use in repository outputs and workflow state handoff.
- [ ] Separate “not observed”, “observed absent”, and “blocked” explicitly.

## Implementation Tasks

- [ ] Normalize repository outputs before they reach coordination logic.
- [ ] Replace nullish workflow/result signaling with named variants.
- [ ] Add unit coverage proving coordination logic consumes explicit states only.

## Done When

1. Rebalancer/workflow coordination no longer depends on nullish state semantics.
2. Repository/owner handoff is explicit and non-ambiguous.
3. Runtime actions follow explicit workflow states.

## 2026-04-12 execution update

Implemented slice:
1. `ReplicaOperationRepository` now exposes
   `getActualReplicaObservation(...)` with explicit states:
   `observed`, `absent`, and `unavailable`.
2. Successful authoritative no-row reads now remain explicit `absent`
   observations instead of silently falling through to stale cache rows.
3. `OperationWorkflowOwner.getReconciledReplicaStatus(...)` now prefers the
   explicit observation contract before falling back to legacy status-only
   compatibility.

Focused validation passed:
1. `node test/rebalancer/replica-operation-observation-contract.test.js`
2. `node test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`

Remaining gap in this package:
1. broader rebalancer/workflow code still contains legacy null-return
   compatibility beyond the repository/workflow seam hardened here.
