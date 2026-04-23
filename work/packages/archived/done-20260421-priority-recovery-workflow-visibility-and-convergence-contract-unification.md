# Priority-Recovery Workflow, Visibility, And Convergence Contract Unification

## Why

The latest `node-join-under-load` artifacts still force readers to infer one
priority-recovery state from three different truths:

1. workflow truth from owner-path `replica_operations` progression
2. visibility truth from cache/admin/report surfaces
3. convergence truth from spread/admission/publication state

Those truths are currently mixed together in downstream summaries. That is why
the same run can look like `SENDING` in one surface, `CREATING` in logs, and
`recovering_in_flight` or `operation_stalled` in a report without a clear way
to say whether the problem is workflow execution, visibility lag, or real
convergence blocking.

This package creates one reasoning grammar for that boundary before the
remaining observation and harness packages continue their cutovers.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Sequencing dependency:

1. [Priority-recovery completion and remove-safety under load closure](./done-20260421-priority-recovery-completion-and-remove-safety-under-load-closure.md)

## In Scope

1. Define one partition-level contract that keeps workflow truth, visibility
   truth, and convergence truth separate.
2. Add provenance to the priority-recovery decision snapshot so consumers can
   tell which source produced the current view.
3. Preserve that contract through the first harness normalization layer
   instead of dropping it during summary construction.
4. Make current partition witnesses select one latest snapshot explicitly
   instead of unioning history into an implicit present-tense state.
5. Update
   [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
   in the same work cycle.

## Out Of Scope

1. Full owner-RPC or authoritative-read cutover for every admin snapshot
   consumer
2. Broad runtime transport/remove-safety redesign already owned by the active
   runtime package
3. Report-writer, scenario, and playback tail-consumer cutover beyond the
   touched witness/normalization seam
4. Unrelated startup, rolling-restart, or decomposition work

## Invariants

1. Workflow execution state must not be inferred from cache visibility state.
2. Visibility lag must remain explicit instead of being collapsed into
   `blocked`, `stalled`, or `unknown`.
3. Convergence blocking must remain explicit instead of being inferred only
   from workflow progress.
4. One consumer may summarize the canonical contract, but it may not merge
   current state and history into the same field.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/admin/admin-control-snapshot-class-part-5.js`
3. `test/distributed/harness/failure-bundle-segment-1.js`
4. `test/distributed/harness/failure-bundle-segment-2.js`
5. `architecture/current-owner-maps.md`

## Shared Boundary Contract

- Semantic owner:
  priority-recovery partition observation emitted from the shared snapshot
  builder
- Canonical contract shape / vocabulary:
  `PriorityRecoveryPartitionObservation { workflowState, visibilityState, convergenceState, provenance }`
  where
  `workflowState` is one of `none`, `in_flight`, `remove_phase`, `terminal`;
  `visibilityState` is one of `none`, `cache_visible`, `deferred`, `unknown`;
  `convergenceState` is one of `converged`, `spread_satisfied_in_flight`, `spread_gap`;
  and
  `provenance { capturedAt, workflowSource, timelineSource, semanticSource }`
- Allowed consumers:
  priority-recovery snapshot summaries,
  admin/control-snapshot diagnostics,
  harness normalization,
  failure-bundle partition witnesses,
  and the sequenced observation/reporting follow-on packages
- Prohibited reinterpretations:
  treating cache-visible workflow rows as authoritative workflow truth,
  merging current state with history into one witness field,
  or re-inferring current state from mixed per-operation snapshots when the
  contract already carries it
- Primary diagnostics / proof surfaces:
  priority-recovery snapshot tests,
  failure-bundle tests,
  architecture record update,
  and the sequenced observation/reporting packages

## Detection / Analysis Tasks

- [x] Inventory where current code conflates workflow, visibility, and
      convergence semantics on the touched path.
- [x] Identify which priority-recovery fields are lost in harness
      normalization before operator-facing witnesses are built.
- [x] Identify where current partition witnesses use history aggregation in
      place of one explicit latest snapshot.

## Implementation Tasks

- [x] Add failing tests first for the unified partition observation fields.
- [x] Add `PriorityRecoveryPartitionObservation` to the shared snapshot
      builder.
- [x] Preserve `completion`, spread/completion evidence, and observation
      provenance through harness normalization.
- [x] Update partition witness construction to select one latest snapshot
      explicitly and keep history in the existing history fields only.
- [x] Update
      [architecture/current-owner-maps.md](../../architecture/current-owner-maps.md)
      in the same work cycle.

## Residual Closure Inventory

- [x] The shared snapshot carries separate workflow, visibility, and
      convergence axes.
- [x] Harness normalization no longer drops the touched contract fields.
- [x] Partition witnesses use one current snapshot and separate history.
- [x] The sequenced observation and harness/reporting packages consume this
      unified contract instead of rebuilding it.

## Execution Notes

1. Added the canonical `PriorityRecoveryPartitionObservation` contract in
   `src/control-plane/priority-recovery-snapshot.js` with separate
   `workflowState`, `visibilityState`, `convergenceState`, and `provenance`.
2. Preserved `completion`, `spreadCompletion`, and `observation` through the
   first harness normalization layer and updated partition witnesses to choose
   one latest snapshot explicitly.
3. Validated with:
   - `node --test test/control-plane/priority-recovery-snapshot.test.js`
   - `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   - `node --test test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js`
4. Reran `node-join-under-load` and captured the fresh artifact at
   `test-output/reports/node-join-under-load-20260421T175240Z-local-observation-strict.report.json`.
   The scenario still fails, but the report now preserves the unified contract
   and exposes the remaining blocked partitions through one current witness per
   partition.

## Validation

1. `node --test test/control-plane/priority-recovery-snapshot.test.js`
2. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
3. `node --test test/distributed/harness/__tests__/failure-bundle-playback-test-cases.js`

## Done When

1. Priority-recovery snapshots expose one explicit workflow/visibility/
   convergence grammar with provenance.
2. The first harness normalization layer preserves that grammar.
3. Partition witnesses report one current snapshot and keep history separate.
4. The remaining observation/reporting packages have one contract to consume
   instead of inventing another local state model.
