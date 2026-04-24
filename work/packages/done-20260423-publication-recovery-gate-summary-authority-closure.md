# Publication Recovery Gate Summary Authority Closure

## Why

The representative `node-join-under-load` rerun on April 23, 2026 still failed,
but the blocker moved again.

The fresh artifact reports:

1. `recoveryProtocolState = steady_published`
2. `priorityPartitionSummary.satisfied = true`
3. no blocked or unresolved priority partitions
4. `priorityRecoveryPartitionIdsBySemanticState.converged` contains the
   priority partitions
5. `prioritySpreadPending = true`
6. `publicationConvergenceGateReasons = priority_partitions_not_spread`

That shape means the publication recovery gate can keep stale spread-pending
state after the normalized priority partition summary has already closed.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## Dominant Blocker

`node-join-under-load` is now blocked by stale publication recovery gate spread
state, not by missing priority recovery scheduling evidence.

The gate has a normalized priority partition summary proving spread is
satisfied, but stale incoming protocol state or reason codes can still emit
`priority_spread_pending` / `priority_partitions_not_spread`.

## In Scope

1. Make the publication recovery gate treat a present priority partition
   summary as the authority for priority spread.
2. Prevent stale incoming spread reason codes from surviving when the summary
   proves spread is satisfied.
3. Add focused gate proof for the stale-input / satisfied-summary case.
4. Extend the bounded runtime grammar guardrail for this hotspot.
5. Rerun the representative scenario and record blocker movement.

## Out Of Scope

1. Harness-side repair or new pass/fail grammar.
2. Replacing membership publication planning or priority recovery derivation.
3. Broad publication-row persistence refactors.

## Shared Boundary Contract

- Semantic owner:
  `src/control-plane/publication-recovery-gate.js`.
- Canonical contract:
  when `priorityPartitionSummary` is present, priority-spread pending state and
  spread reason emission derive from that summary.
- Allowed consumers:
  recovery protocol snapshots, startup authority snapshots, readiness
  diagnostics, failure bundles, and harness diagnostics may consume the gate.
- Prohibited reinterpretations:
  consumers must not revive spread-pending state from stale protocol strings or
  stale reason-code arrays once the summary is present and satisfied.
- Primary diagnostics and proof:
  gate unit tests, runtime grammar audit, publication replay output, and the
  representative scenario rerun.

## Progress Grammar

1. `summary_absent` means legacy protocol/reason signals can describe priority
   spread because the authoritative summary is unavailable.
2. `summary_blocked` means the summary proves spread is still pending.
3. `summary_satisfied` means the summary proves spread is closed and stale
   spread-pending protocol/reason inputs are diagnostic history only.

## Hotspots

1. `src/control-plane/publication-recovery-gate.js`
2. `src/control-plane/recovery-protocol-snapshot.js`
3. `src/control-plane/priority-recovery-observation-snapshot.js`
4. `test/control-plane/publication-recovery-gate.test.js`
5. `scripts/check-runtime-grammar-contracts.js`

## Detection / Analysis Tasks

- [x] Reproduce stale spread-pending input with a satisfied priority summary.
- [x] Confirm the failure is inside gate derivation, not replay tooling.

## Implementation Tasks

- [x] Add the focused failing gate regression.
- [x] Make priority summary presence authoritative for spread state.
- [x] Filter stale spread reason emission when summary authority is satisfied.
- [x] Add a hotspot contract to the runtime grammar audit.

## Residual Closure Inventory

- [x] Gate owner emits one canonical spread decision.
- [x] Recovery protocol snapshots continue consuming the gate owner.
- [x] Observation/failure-bundle consumers receive no revived stale spread
      blockers when the summary is satisfied.
- [x] Static guardrail covers the summary-authority contract.
- [x] Representative scenario rerun is recorded.

## Validation

1. `npx tap test/control-plane/publication-recovery-gate.test.js`
2. `npx tap test/scripts/check-runtime-grammar-contracts.test.js`
3. `npm run audit:runtime-grammar`
4. `npx eslint src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js scripts/check-runtime-grammar-contracts.js test/scripts/check-runtime-grammar-contracts.test.js`
5. `node test/distributed/harness/publication-evidence-replay.js test-output/.playback/report/node-join-under-load`
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. The gate regression proves stale spread-pending inputs close when the summary
   is satisfied.
2. The runtime grammar audit fails if the gate stops using summary-authority
   derivation.
3. The representative scenario either passes or the next blocker is named and
   split explicitly.

## Progress Notes

1. Added the failing regression for a satisfied priority partition summary with
   stale incoming `priority_spread_pending` and
   `priority_partitions_not_spread`.
2. `buildPublicationRecoveryGateSnapshot(...)` now builds one priority spread
   decision where a present `priorityPartitionSummary` is authoritative.
3. Stale provided spread reason codes are filtered when the summary-derived
   decision is not pending.
4. Extended `scripts/check-runtime-grammar-contracts.js` so the publication
   recovery gate is a runtime grammar hotspot.
5. Focused proof:
   `npx tap test/control-plane/publication-recovery-gate.test.js`.
6. Guardrail proof:
   `npx tap test/scripts/check-runtime-grammar-contracts.test.js`.
7. Runtime grammar proof:
   `npm run audit:runtime-grammar`.
8. Lint proof:
   `npx eslint src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js scripts/check-runtime-grammar-contracts.js test/scripts/check-runtime-grammar-contracts.test.js`.
9. Existing artifact replay remained diagnostic-only and still showed the
   pre-fix durable stale flag.

## Blocker Migration

The representative rerun after this package still failed:

1. command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
2. result:
   `0/1 passed`, failed after `150.5s`
3. fresh failure:
   `failureClass = publication_convergence_blocked`
4. dominant reason:
   `priority_recovery_operation_scheduling_event_driven`
5. durable publication summary:
   blocked `sql_transactions-p1`, `priorityPartitionSummary.satisfied = false`
6. replayed runtime derivation:
   `steady_published`, satisfied priority spread, no blocked partitions
7. replay classification:
   `durable_stale_replayed_satisfied`

That is not the gate summary-authority bug fixed here. It is the publication
owner evidence-refresh blocker already owned by:

1. [Membership publication planning evidence union closure](./active-20260423-membership-publication-planning-evidence-union-closure.md)

## Closure Deep Dive

Reviewed the affected gate owner and its direct consumers:

1. `src/control-plane/publication-recovery-gate.js`
2. `src/control-plane/recovery-protocol-snapshot.js`
3. `src/control-plane/priority-recovery-observation-snapshot.js`
4. `test/control-plane/publication-recovery-gate.test.js`
5. `scripts/check-runtime-grammar-contracts.js`

The change stays inside the existing owner path. Consumers still read the gate
snapshot; they do not gain a new repair route or second publication grammar.
