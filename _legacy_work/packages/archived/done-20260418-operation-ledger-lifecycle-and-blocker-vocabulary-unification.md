# Operation Ledger Lifecycle And Blocker Vocabulary Unification

## Why

The codebase still describes one topology operation through several partially
overlapping languages:

1. planner-local reasons
2. executor-local step and retry behavior
3. gateway failure classifications
4. harness and report vocabulary

That forces operators and code to translate the same stall repeatedly.

The system needs one operation lifecycle model with one canonical blocker and
closure vocabulary.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/packages/archived/done-20260417-priority-recovery-operator-controller-and-step-witnesses.md`
3. `work/packages/archived/done-20260417-canonical-convergence-diagnostics-emission.md`

## Sprint Umbrella

[Runtime Boundary Simplification And Contract Unification Sprint](../../sprints/archived/done-2026-q2-runtime-boundary-simplification-and-contract-unification.md)

## In Scope

1. Define one shared lifecycle model for topology and recovery operations.
2. Define one canonical vocabulary for:
   - operation kind
   - target
   - current step
   - step age
   - blocked reason
   - retry class
   - closure reason
3. Make planner, executor, diagnostics, and reports consume the same model on
   the touched boundaries.
4. Delete superseded per-layer synonyms on the touched area.

## Out Of Scope

1. New user-facing SQL operation categories.
2. Broad rebalancer redesign beyond the touched lifecycle contract.
3. Replacing distributed test harnesses outside the vocabulary cutover.

## Invariants

1. One in-flight topology operation must have one canonical lifecycle snapshot.
2. A stall must surface one blocked reason rather than several loosely related
   hints.
3. Reports and diagnostics must read the same lifecycle vocabulary the executor
   uses.
4. Closure and retryability must not be inferred independently by each layer.

## Hotspots

1. `src/rebalancer/unified-rebalancer.js`
2. `src/rebalancer/rebalance-coordinator.js`
3. `src/control-plane/priority-recovery-completion.js`
4. `src/control-plane/control-plane-error-classification.js`
5. `test/distributed/harness/failure-bundle.js`
6. `test/distributed/harness/report-writer.js`
7. `test/rebalancer/rebalance-coordinator-diagnostics.test.js`

## Detection / Analysis Tasks

- [ ] Inventory the current step, retry, blocked-reason, and closure vocabularies
      on the touched operation path.
- [ ] Detect synonym drift between planner, executor, gateway, and report
      layers.
- [ ] Define one canonical lifecycle snapshot and one canonical reason set.
- [ ] Detect diagnostics or reports that still derive lifecycle semantics
      indirectly instead of consuming the shared model.

## Implementation Tasks

- [ ] Introduce the shared lifecycle and blocker vocabulary for the touched
      operation family.
- [ ] Cut planner, executor, and diagnostics to the shared lifecycle model.
- [ ] Emit one canonical step-age and blocked-reason surface for operator
      visibility.
- [ ] Delete superseded synonym paths and stale per-layer translation logic.
- [ ] Update architecture and boundary-catalog records for the operation
      boundary.
- [ ] Perform the required closure deep dive across the touched lifecycle
      boundaries before closure.

## Validation

1. Targeted rebalancer, control-plane, and diagnostics tests.
2. Focused distributed harness checks for blocked-reason and closure reporting.
3. Seven-node acceptance reruns for the touched recovery scenarios.

## Done When

1. Touched operation paths use one shared lifecycle snapshot.
2. Planner, executor, gateway, and report layers speak one blocked-reason and
   closure vocabulary.
3. Step age and retry class are emitted canonically.
4. Superseded synonym layers are removed from the touched area.
