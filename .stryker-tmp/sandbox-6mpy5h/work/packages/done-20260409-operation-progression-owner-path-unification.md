# Operation Progression Owner-Path Unification

## Why

`OperationWorkflowOwner` was the nominal owner, but progression still entered
through several paths that each reached execution from different wake causes
and ownership contexts.

That increased the chance of stalled operations, duplicated transitions, and
state semantics that differed between created, observed-progress, timeout, and
recovery paths.

## Scope Basis

Phase 0.1 roadmap scope: topology workflow stabilization and deterministic
control-plane progression.

## In Scope

1. Collapse operation progression to one canonical progression entry point.
2. Keep multiple wake causes, but route them through one explicit transition
   model.
3. Reduce direct progression calls that bypass the canonical ingress shape.

## Out Of Scope

1. Priority admission semantics.
2. Active-membership / recovery cohort semantics.
3. Transport late-response cleanup.

## Invariants

1. One locally owned operation may have many wake causes but one legal next
   state machine.
2. Recovery, timeout, and observed-progress paths must not mutate through
   parallel progression semantics.
3. Deferred retry behavior must remain owned and bounded.

## Hotspots

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/rebalancer/replica-operation-repository.js`
3. Relevant coordinator-created and replace-workflow tests

## Implementation Tasks

- [x] Introduce one shared owner-lane runner for dispatch and execute wake
      causes.
- [x] Replace reconcile-path direct execute re-entry with the shared owner
      ingress.
- [x] Express lifecycle reconciliation as named owner actions instead of
      branching order.
- [x] Validate coordinator-created, timeout, and REPLACE reconciliation paths
      against the unified owner path.

## Outcome

Completed as the owner-path simplification batch. The remaining recovery reds
still show unresolved spread obligations around in-flight `ACTIVE` replace
operations, but that is now a higher-level completion-invariant problem rather
than a basic multi-ingress owner-path drift problem.

## Validation

- [x] Owner-path progression tests
- [x] Created-operation progress tests
- [x] Replace/remove workflow tests
- [x] Partial distributed verification completed; residual in-flight recovery
      deadlocks moved to the recovery-architecture sprint

## Done When

1. The owner has one canonical progression entry point.
2. Wake causes enqueue into that path instead of carrying separate progression
   semantics.
3. Operation lifecycle tests assert the unified path explicitly.
4. Remaining recovery-completion issues, if any, are tracked separately.
