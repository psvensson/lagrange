# Priority-Recovery Completion Owner Collapse

## Why

The seven-node rerun on April 15, 2026 moved again.

The old leader/service-gap failure is gone. The new failure reaches benchmark
load, then stalls at:

1. `Timed out waiting for table "benchmark_events" to add at least 2 partitions`
2. `partition_growth_stalled`
3. repeated background-rebalance waits on
   `publication_epoch_pending` / `priority_partitions_not_spread`
4. repeated priority `REPLACE` remove defers with
   `replace_remove_safety_blocked`

The important shape is that the system already has one canonical completion
contract for this state:

`priority-recovery planner/admission/operation evidence -> completion state`

The latest rerun shows one remaining handoff inside that boundary: priority
remove-safety still falls back to stale durable published membership even when
that same planning owner already projects the current voter-ready recovery
cohort.

That contract lives in:

1. `src/control-plane/priority-recovery-completion.js`
2. `src/control-plane/priority-recovery-snapshot.js`

But the remaining execution owner for priority source-removal safety still
decides from local projected spread arithmetic instead of that shared
completion outcome. Diagnostics say the partition is
`spread_satisfied_in_flight`; execution still says "blocked".

This package exists to collapse that gap so priority source removal,
coordinator planning, and diagnostics use one canonical completion answer.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Route priority replace/remove safety through the canonical completion
   contract.
2. Reuse the shared priority-recovery assessment/completion builders instead of
   re-deriving partial spread truth inside `OperationWorkflowOwner`.
3. Preserve defers when completion is still canonically blocked.
4. Preserve recovery-projection membership as the canonical remove-safety
   cohort when it fully covers the current projected voter-ready set even if
   the last durable published membership row still lags.
5. Add focused unit coverage for:
   - allow remove when completion is `spread_satisfied_in_flight`
   - preserve defer when target is outside the eligible cohort
   - allow remove when projected voter-ready coverage is fully explained by
     the recovery projection after the published row lags
6. Rerun the unit-only gate first, then the seven-node harness.
7. Record architecture/package updates for the remove-safety membership
   boundary and any later harness movement.

## Out Of Scope

1. Retuning harness thresholds or load levels.
2. Broad benchmark admission redesign.
3. Reworking unrelated control-plane readiness dimensions.
4. Inventing a second priority-recovery state model beside the existing
   completion contract.

## Invariants

1. Priority recovery emits one canonical completion state.
2. Execution owners consume that completion state instead of restating local
   partial spread rules.
3. Source removal still defers when completion is canonically blocked.
4. Unit-only gate must be green before the next seven-node rerun.

## Hotspots

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/control-plane/priority-recovery-completion.js`
3. `test/rebalancer/quorum-conditioned-remove-safety.test.js`
4. `test/control-plane/priority-recovery-completion.test.js`
5. `architecture/current-owner-maps.md`
6. `architecture.md`

## Analysis Tasks

- [x] Confirm the new harness failure moved beyond the leader/service-gap fix.
- [x] Confirm diagnostics already classify eligible ACTIVE replace work as
  `spread_satisfied_in_flight`.
- [x] Confirm priority remove safety still ignores that canonical outcome.

## Implementation Tasks

- [x] Add one owner helper that resolves priority-recovery completion for the
  current operation from the canonical planning snapshot.
- [x] Use that helper in priority source-removal safety so
  `spread_satisfied_in_flight` can proceed without reopening local spread math.
- [x] Preserve recovery-projection membership as the canonical remove-safety
  cohort when it fully covers the projected voter-ready set even after the
  last durable published membership row lags.
- [x] Add focused regression coverage for the new owner contract.
- [ ] Run focused unit tests and the full unit-only gate.
- [ ] Rerun the seven-node harness.
- [x] Record architecture/package updates for the remove-safety membership
  boundary.

## Validation

1. `node test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. `node test/control-plane/priority-recovery-completion.test.js`
3. Focused regression: priority REPLACE remove dispatches when recovery
   projection fully covers projected voter-ready nodes after durable
   published membership lags.
4. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
5. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. Priority source-removal safety consumes the canonical completion contract.
2. Eligible ACTIVE replace/remove recovery is no longer blocked by redundant
   local projected-spread checks.
3. Canonically blocked recovery still defers.
4. The unit-only gate is green.
5. The seven-node rerun either passes or fails at a later, clearly different
   boundary.
