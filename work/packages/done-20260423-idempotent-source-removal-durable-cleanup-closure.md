# Idempotent Source Removal Durable Cleanup Closure

## Why

The representative `node-join-under-load` rerun moved the failure forward.
Priority operations were created, but two priority REPLACE operations remained
in source-removal state while their source handlers had logged
`Replica already removed`.

That exposed a grammar defect: an executor can consider local replica state
already removed while a stale authoritative `services` row is still visible.
The remove response must not complete from local state alone; it must first
drive the canonical services-row owner cleanup.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Add a focused regression for already-removed partition replicas with a
   local cache miss.
2. Make idempotent partition replica removal issue the canonical
   `services` owner delete before returning `COMPLETED`.
3. Preserve retryable failure behavior when the durable cleanup cannot be
   written.
4. Re-run the representative harness only after the focused and sprint suites
   are green.

## Out Of Scope

1. Treating stale service rows as diagnostics-only.
2. Adding a harness exception for locally removed replicas.
3. Changing the source-removal ownership model for REPLACE operations.

## Shared Boundary Contract

- Semantic owner:
  partition replica removal owns local runtime teardown, while the
  `services` row owner owns durable service truth.
- Canonical contract:
  local `REMOVED` state is not sufficient to complete a remove request until
  the canonical service-row delete has been attempted through the owner path.
- Allowed consumers:
  `ReplicaHandler.handleRemoveReplica`, REPLACE source-removal replay, and
  priority control-plane recovery.
- Prohibited reinterpretations:
  local removed state as durable truth, cache presence as a precondition for
  authoritative cleanup, or target-owner operation completion without source
  durable cleanup.
- Primary proof:
  replica-handler idempotent removal regression plus the sprint-level
  `node-join-under-load` rerun.

## Hotspots

1. `src/node/replica-handler-class-part-1.js`
2. `src/node/replica-handler-class-part-2.js`
3. `test/node/replica-handler.test.js`
4. `test/node/replica-handler-tail-test-cases.js`

## Detection / Analysis Tasks

- [x] Confirm the post-package harness failure shifted to source-removal
      cleanup and operation scheduling/progress.
- [x] Verify final snapshots contained priority recovery operations even
      while stale durable service rows kept spread blocked.
- [x] Identify the idempotent already-removed cache-miss path that returned
      `COMPLETED` without issuing the service-row delete.

## Implementation Tasks

- [x] Add a focused test for an already-removed local replica with no cached
      service row.
- [x] Fix idempotent partition removal to always call the canonical
      service-row owner delete before local cleanup completion.

## Residual Closure Inventory

- [x] Unit proof: replica-handler removal cache-miss cleanup.
- [x] Expanded focused recovery/readiness/rebalancer/publication suite.
- [x] Metrics and whitespace checks.
- [x] Sprint-level representative harness rerun.

## Progress Notes

1. Harness rerun after the first package set failed with
   `priority_recovery_operation_scheduling_event_driven`.
2. Failure artifact showed existing operations for priority partitions, while
   `sql_transactions-p1` and `sql_write_operations-p1` still had stale source
   removal/service-row state.
3. Added regression:
   `handleRemoveReplica cleans durable service truth for already removed cache miss`.
4. Fixed `reconcileRemovedReplicaCleanup(...)` to route the canonical
   `services` delete even when the local cache has no row.
5. Focused proof passed:
   `npx tap test/node/replica-handler.test.js`.
6. Expanded sprint validation, `npm run test:metrics`, and the representative
   rerun all completed on the current branch.
7. The latest rerun no longer stops on idempotent source-removal durable
   cleanup. Publication gate readiness is now `true`, and the scenario fails
   later on `nodeAdmissionBlocked`.

## Validation

1. `npx tap test/node/replica-handler.test.js`
2. Expanded focused recovery/readiness/rebalancer/publication suite from the
   sprint.
3. `npm run test:metrics`
4. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. Idempotent source removal cannot complete from local removed state while
   skipping canonical durable cleanup.
2. Priority REPLACE source-removal replay has a single durable service-truth
   boundary.
3. The representative harness is green, or the next blocker is explicitly
   split from a fresh failure bundle.
