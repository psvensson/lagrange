# Service Catalog And Installation Reconciler

## Why

The repo already has `ServiceLifecycleManager`, `ServiceReconciler`, and
startup wiring for internal service activation, but the roadmap rows for
service catalog system tables and the installation reconciler are still open.
`architecture/lagrange-service-registry.md` is explicit that the cluster
catalog, not the registry, must own desired and actual install state.

Today the substrate exists, but the durable install model does not.

## Scope Basis

Roadmap Phase `1.0 — Real Product`:

1. `Service catalog system tables`
2. `Installation reconciler`

Architecture basis:

1. `architecture/lagrange-service-registry.md`

These rows are AGPL-scoped in `edition-matrix.md`.

## In Scope

1. Define the system-table schema for desired installations, resolved
   revisions, running instances, and recorded failures.
2. Move service reconciliation onto that durable catalog as the source of
   truth.
3. Preserve restart recovery so service convergence can resume from catalog
   state after node or process restart.
4. Keep fetch / validate / record / reconcile / observe as one explicit
   desired-state workflow.

## Out Of Scope

1. Registry auth and trust policy.
2. End-user CLI install UX beyond the catalog boundary needed by this package.
3. Upgrade rollout strategies beyond the first durable desired-state loop.
4. Broad container runtime implementation details.

## Invariants

1. The cluster catalog, not an external registry or CLI process, owns durable
   install intent.
2. One reconciler path owns convergence from desired state to running state.
3. Failure recording must be durable and queryable rather than transient log
   output.

## Hotspots

1. `architecture/lagrange-service-registry.md`
2. `src/bootstrap/system-table-schemas-constants.js`
3. `src/service/service-reconciler.js`
4. `src/service/service-lifecycle-manager.js`
5. `src/bootstrap/shared/startup-service-lifecycle-owner.js`
6. `test/service/`
7. `test/bootstrap/`

## Detection / Analysis Tasks

- [ ] Inventory the current ephemeral desired-state and actual-state readers.
- [ ] Define the minimum catalog table set needed for the first durable loop.
- [ ] Identify which reconciler behaviors already exist and which still rely on
      process-local state.
- [ ] Define restart-recovery expectations for non-terminal install work.

## Implementation Tasks

- [ ] Add the service catalog system tables and constants owners.
- [ ] Add catalog-backed desired-state and actual-state readers/writers.
- [ ] Cut the reconciler over to those durable owners.
- [ ] Add focused tests for install intent, reconciliation, failure recording,
      and restart recovery.

## Validation

1. Targeted service lifecycle and reconciler tests.
2. Targeted bootstrap/startup owner tests for reconciler wiring.
3. Any touched system-table schema and CDC propagation tests.
4. One focused restart-recovery scenario for non-terminal install work.

## Done When

1. Desired installation state is durable in system tables.
2. The reconciler converges from catalog state instead of process-local setup.
3. Failure and recovery state survive restart and remain queryable.

