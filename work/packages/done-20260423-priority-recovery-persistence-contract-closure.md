# Priority Recovery Persistence Contract Closure

## Why

Recent `node-join-under-load` probes repeatedly found priority recovery rows
escaping through the wrong persistence lane:

1. transition persistence used a hand-maintained priority partition subset
2. durable snake-case operation rows bypassed the classifier until row-shape
   normalization was added
3. the latest logs still showed generic SQL-routed participant failures around
   priority recovery operation updates

The immediate transition bug is fixed, but the boundary needs explicit
contract proof across create, update, transition, readback, and diagnostics so
new row shapes cannot reopen a legacy route.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Inventory the priority recovery operation persistence entry points touched
   by create, update, transition, readback, and diagnostics.
2. Add focused contract proof that every priority control-plane partition uses
   the canonical classifier-owned recovery persistence lane.
3. Delete or fence any remaining hand-maintained priority partition subset in
   the touched persistence path.
4. Preserve non-priority operation persistence behavior.

## Out Of Scope

1. Replacing the operation workflow owner.
2. Rewriting unrelated SQL transaction persistence.
3. Scenario-only log filtering.

## Shared Boundary Contract

- Semantic owner:
  operation workflow owner persistence for priority control-plane recovery
  operations.
- Canonical contract:
  operation identity is normalized once, classified with
  `isPriorityControlPlanePartition`, and persisted through the recovery lane
  when it belongs to any priority control-plane partition.
- Allowed consumers:
  operation workflow owner segments, rebalance coordinator tests, priority
  recovery diagnostics, and the harness failure bundle.
- Prohibited reinterpretations:
  hard-coded priority subsets, casing-specific paths, SQL-routed transition
  writes for priority partitions, or diagnostics rebuilding persistence
  meaning from failed participant logs.
- Primary proof:
  atomic transition tests plus targeted owner-path persistence tests.

## Hotspots

1. `src/rebalancer/operation-workflow-owner-segment-1.js`
2. `src/rebalancer/operation-workflow-owner-segment-2.js`
3. `src/rebalancer/operation-workflow-owner-segment-3.js`
4. `src/rebalancer/operation-workflow-owner-shared.js`
5. `test/rebalancer/rebalance-coordinator-atomic-transitions-tail-test-cases.js`

## Detection / Analysis Tasks

- [x] Inventory create, update, transition, and readback paths for priority
      operation persistence.
- [x] Prove transition persistence uses the classifier for camel-case and
      snake-case rows.
- [x] Prove there is no remaining hand-maintained priority partition subset in
      the touched persistence owner.

## Implementation Tasks

- [x] Add or extend owner-path tests for durable row shape normalization.
- [x] Add contract proof for all priority control-plane partition IDs, not just
      the partition subset seen in one harness run.
- [x] Fix any discovered persistence-lane drift inside the touched owner
      boundary.

## Residual Closure Inventory

- [x] Owner path: priority operation persistence selection is one normalized
      decision.
- [x] Tail consumers: diagnostics and tests consume the same normalized
      operation identity.
- [x] Superseded path: partition allowlists and casing-specific alternate
      routes are absent from the touched owner.
- [x] Proof: atomic transition suite, expanded focused suite, metrics, and
      sprint-level representative harness rerun.

## Progress Notes

1. Added transition persistence contract proof for every priority control-plane
   partition ID using durable snake-case rows.
2. The focused proof confirms priority transitions persist once through the
   recovery lane and do not mint a routed system-write session.
3. Focused proof run:
   `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js --grep "every snake-case priority"`.
4. Remaining proof is the full atomic-transition suite, expanded focused
   suite, metrics, and sprint representative harness rerun after all packages
   are implemented.
5. Full proof is now complete:
   `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js`,
   the expanded sprint-focused suite, `npm run test:metrics`, and the
   representative rerun.
6. The latest rerun no longer fails on priority transition persistence. The
   scenario now reaches publication gate readiness and later stops on
   `nodeAdmissionBlocked`, so the persistence lane closure is holding.

## Validation

1. `npx tap test/rebalancer/rebalance-coordinator-atomic-transitions.test.js`
2. Expanded focused recovery/readiness/rebalancer/publication suite from the
   sprint.
3. `npm run test:metrics`
4. Sprint-level `node-join-under-load` rerun after all work packages are
   implemented.

## Done When

1. Priority operation persistence lane selection is classifier-owned for every
   priority control-plane partition.
2. Durable and in-memory row shapes cannot select different persistence lanes.
3. Focused contract proof covers the touched persistence boundary.
