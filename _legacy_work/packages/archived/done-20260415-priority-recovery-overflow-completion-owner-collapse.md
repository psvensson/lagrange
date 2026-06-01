# Priority Recovery Overflow Completion Owner Collapse

## Why

The canonical leader-gap fix moved the seven-node failure later, but the next
rerun exposed a different shared-owner split:

1. critical control-plane partitions schedule multiple replacement learners
2. `PartitionService` still vetoes promotion on local target-count math
3. `PriorityRecoveryCompletion` reports `converged` too early for that case
4. `RebalanceCoordinator` then blocks source removal because the learner never
   becomes voter-ready
5. benchmark table bootstrap stalls because `replica_operations` and other
   priority partitions never finish recovery

This is not a benchmark bootstrap helper bug. It is one owner-path gap in the
priority-recovery completion contract.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Make `PriorityRecoveryCompletion` own the bounded temporary-overflow budget
   for critical replace/remove completion, including the multi-learner case.
2. Make `PartitionService` consume that owned budget for learner-promotion
   admission instead of hard-coded local overflow assumptions.
3. Add focused unit coverage for the multi-learner replacement deadlock that
   the seven-node harness exposed.
4. Record the owner-path update in architecture docs and this package.
5. Revalidate unit gate first, then rerun the seven-node harness.

## Out Of Scope

1. Retuning benchmark helper timeouts.
2. Broadening overflow promotion outside critical control-plane recovery.
3. Reworking unrelated admin snapshot or harness failure classification.
4. Changing message routing or canonical leader-gap behavior from the previous
   package.

## Invariants

1. Only bounded critical-partition recovery may authorize temporary overflow.
2. Steady-state learner promotion must keep the existing fail-closed target and
   even-voter guards.
3. The temporary-overflow budget must come from one completion owner contract,
   not duplicated target-count branches.
4. Unit gate must be green before the next seven-node rerun.

## Hotspots

1. `src/control-plane/priority-recovery-completion.js`
2. `src/partition/partition-service.js`
3. `test/control-plane/priority-recovery-completion.test.js`
4. `test/partition/partition-service.test.js`
5. `architecture/current-owner-maps.md`
6. `architecture.md`

## Analysis Tasks

- [x] Confirm the new seven-node failure is downstream of priority-partition
  recovery completion rather than benchmark bootstrap helper logic.
- [x] Confirm `replica_operations-p1` deadlocks because replace learners stay
  non-voter while removal safety waits on voter readiness.
- [x] Confirm the shared owner gap is the bounded overflow completion contract,
  not one more local rebalancer or helper branch.

## Implementation Tasks

- [x] Extend `PriorityRecoveryCompletion` to own one explicit temporary
  overflow voter budget for critical recovery completion.
- [x] Make learner promotion use that owned budget for the multi-learner
  replacement case.
- [x] Add focused unit tests.
- [x] Run focused suites and the full unit-only gate.
- [ ] Rerun the seven-node harness.
- [x] Record architecture/package outcomes.

## Validation

1. `node test/control-plane/priority-recovery-completion.test.js`
2. `node test/partition/partition-service.test.js`
3. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
4. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. Critical recovery completion owns the bounded overflow budget explicitly.
2. Learner promotion consumes that owned budget instead of local duplicated
   assumptions.
3. Unit-only gate is green.
4. The next seven-node rerun either passes or moves to a later, clearly
   different boundary.

## Progress Notes

1. `PriorityRecoveryCompletion` now owns the bounded
   `temporaryOverflowVoterBudget` for active critical replace/remove recovery,
   including the multi-learner case that the seven-node rerun exposed.
2. `PartitionService` now consumes that owned budget for learner-promotion
   admission instead of duplicating a separate local overflow assumption.
3. Focused validation is green:
   `node test/control-plane/priority-recovery-completion.test.js`
   `node test/partition/partition-service.test.js`
4. The full unit-only gate is green:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
   with `# { total: 28017, pass: 28017 }`.
5. Architecture records belong in `architecture/current-owner-maps.md` and
   `architecture.md`; no steering or doctrine change is needed for this
   package because the existing generation contract already requires one
   explicit state model and one canonical owner outcome.
