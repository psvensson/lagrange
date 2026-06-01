# Readiness Planning Runtime Convergence Under Load

## Why

The publication-scoped simplification cut is complete, but the representative
`node-join-under-load` failure still shows one runtime contradiction inside
node readiness:

1. the direct membership publication row for a node can already be
   `PUBLISHED`
2. that same direct row can expose `publicationRecoveryGate.ready = true`
3. a same-epoch planning answer can still carry a retained or derived
   `priorityRecoveryClosureWitness`
4. readiness then reopens
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` from that witness and closes
   external serve admission

That routes runtime liveness pressure back through the publication gate even
though the current direct publication row is already closed. The next work is
to make the readiness-owned merge treat that witness as diagnostics-only in
this boundary while preserving the newer-epoch retention contract.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Make readiness-owned planning merges prefer the current direct ready
   publication gate when it is the same epoch or newer than the provided
   active planning answer.
2. Keep closure-witness diagnostics visible to readiness callers without
   letting them reopen serve admission in that direct-ready case.
3. Align runtime-authority reason reporting with the resolved planning answer
   instead of the raw pre-merge planning snapshot.
4. Add focused proof on the live `getNodeReadiness()` path.
5. Rerun `node-join-under-load` and record blocker movement.

## Out Of Scope

1. Rewriting membership-publication planning semantics for workflow owners or
   rebalancer consumers.
2. Transport quarantine or source-removal runtime fixes except where the rerun
   records the next blocker.
3. Harness-only exemptions.

## Shared Boundary Contract

- direct membership publication rows own current publication-gate truth for
  node readiness when they are ready and at least as fresh as the planning
  answer
- planning closure witnesses may remain diagnostics-only in readiness
  observations
- same-epoch or older planning closure witnesses must not reopen external
  serve admission once the direct gate is ready
- newer active planning epochs may still outrank older direct ready rows

## Hotspots

1. `src/control-plane/control-plane-readiness-service-segment-4.js`
2. `src/control-plane/control-plane-readiness-service-segment-3.js`
3. `test/control-plane/control-plane-readiness-service.test-part-4.js`
4. `test-output/.playback/report/node-join-under-load/failure-bundle.json`

## Status Update

Opened on April 24, 2026 after package `16` proved that the old
publication-state contradiction was gone in harness artifacts. The remaining
contradiction is runtime-local: node readiness can still carry a same-epoch
active planning closure witness while the direct membership publication row is
already ready, which misclassifies replacement-leader ownership and safe
source-removal churn as a publication-gate blocker.

Representative rerun results on April 24, 2026 show that this contradiction is
now closed:

1. final node readiness snapshots are `serveEligible = true`
2. final readiness-owned priority recovery projections are inactive for every
   node
3. final direct membership publication gates remain `ready`
4. same-epoch direct-ready versus planning-active contradictions in the final
   failure bundle = `0`
5. the next blocker has moved to critical in-flight runtime convergence and is
   split to
   [Critical replace remove safety and convergence timeout](./done-20260424-critical-replace-remove-safety-and-convergence-timeout.md)

## Detection / Analysis Tasks

- [x] Confirm the failing artifact still contains a direct ready membership
      publication row alongside an active readiness-owned priority-recovery
      projection.
- [x] Reproduce the same-epoch contradiction through the live
      `getNodeReadiness()` path with a focused local repro.
- [x] Confirm whether the new merge fix leaves closure-witness diagnostics
      visible without reactivating serve admission.

## Implementation Tasks

- [x] Add a failing live-path readiness regression for same-epoch direct-ready
      versus planning-active closure witness.
- [x] Update the readiness-owned merge so same-epoch or older planning
      witnesses do not reopen the direct ready gate.
- [x] Align runtime-authority reason reporting with the resolved planning
      answer.
- [x] Rerun the representative scenario and record blocker movement.

## Validation

1. `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`
2. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. A same-epoch direct ready publication row no longer reopens
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING` through a retained or derived
   planning closure witness.
2. Closure-witness diagnostics remain observable without reopening the
   publication gate.
3. The representative scenario is green, or the next blocker is explicitly
   recorded on the runtime seam.
