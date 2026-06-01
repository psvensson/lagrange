# Canonical Leader Identity Recovery Owner Collapse

## Why

The latest seven-node rerun moved past the earlier control-plane mutation
ingress timeout and exposed a new systemic boundary:

1. system-table partition service rows remain visible
2. `leader_node_id` is unresolved for those partitions
3. query routing still reports the partition as generally routable
4. write owners still refuse to pick a canonical leader target
5. local ingress keeps treating that mixed state as usable

That leaves routing, message-group ingress, and `NODE_STATE_UPDATE` delivery
working from different interpretations of the same snapshot.

This package exists to collapse that split onto one explicit leader-identity
state model.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one canonical routing-snapshot leader-gap state for:
   `none`, `owner_missing`, and `service_missing`.
2. Use that state to widen only recovery-owned system-table writes on
   `controlPlaneRecoveryEligible` through the existing redirect/recovery path.
3. Use the same state to keep local `NODE_STATE_UPDATE` ingress from reusing a
   local target when required-table routing has no canonical leader identity.
4. Add focused unit coverage for the new owner-missing recovery behavior and
   preserved fail-closed steady-state behavior.
5. Record the owner-path change in architecture docs.
6. Validate unit gate first, seven-node harness second.

## Out Of Scope

1. Broadening all writes to non-canonical routing.
2. Reworking message-group forwarding semantics outside the shared leader-gap
   state.
3. Retuning harness thresholds or timing budgets.
4. Changing readiness dimensions.

## Invariants

1. Steady-state writes still fail closed when canonical leader identity is not
   established.
2. Only recovery-owned system-table writes on
   `controlPlaneRecoveryEligible` may widen to live recovery candidates.
3. `NODE_STATE_UPDATE` ingress must not treat leaderless required-table
   routing as locally healthy.
4. Unit gate must be green before the next seven-node rerun.

## Hotspots

1. `src/query/query-executor.js`
2. `src/query/canonical-leader-routing.js`
3. `src/control-plane/control-plane-kernel-ingress.js`
4. `test/query/query-executor.test.js`
5. `test/control-plane/control-plane-kernel-ingress.test.js`
6. `architecture/current-owner-maps.md`
7. `architecture.md`

## Analysis Tasks

- [x] Confirm the remaining failure is the unresolved canonical leader identity
  state rather than the earlier visibility timeout.
- [x] Confirm the system already has an existing recovery-candidate/redirect
  path that can be reused.
- [x] Identify the shared cutover: snapshot leader-gap state must be owned once
  and consumed by both write routing and local ingress selection.

## Implementation Tasks

- [x] Add a canonical leader-gap state helper for routing snapshots.
- [x] Route recovery-owned system-table writes through existing recovery
  candidates when the gap state is `owner_missing`.
- [x] Keep steady-state/user-table writes fail-closed on the same state.
- [x] Use the shared state in control-plane kernel ingress for local target
  eligibility.
- [x] Add focused unit tests.
- [x] Run focused suites and the full unit-only gate.
- [ ] Rerun the seven-node harness.
- [x] Record architecture/package outcomes.

## Validation

1. `node test/query/query-executor.test.js`
2. `node test/control-plane/control-plane-kernel-ingress.test.js`
3. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
4. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. Routing snapshots expose one canonical leader-gap state.
2. Recovery-owned system-table writes reuse the existing recovery-candidate
   path when leader identity is unresolved.
3. Local `NODE_STATE_UPDATE` target selection consumes that same state.
4. The unit-only gate is green.
5. The seven-node rerun either passes or moves to a later, clearly different
   boundary.

## Progress Notes

1. The unit-only gate is green:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
2. Architecture records belong in `architecture/current-owner-maps.md` and
   `architecture.md`; no doctrine or steering change is needed for this
   package because the repository-wide rule already exists in
   `.kiro/steering/system guidelines.md` and `.kiro/steering/doctrine.md`:
   execution owners must emit one canonical outcome instead of layer-local
   interpretation.
3. Control-plane mutation readiness now consumes the shared canonical
   leader-gap recovery contract instead of vetoing retryable system-table
   writes that `QueryExecutor` already widens on
   `controlPlaneRecoveryEligible`. That removed the synthetic
   `transaction_control_owner_missing` defer from the latest focused
   regressions in `test/control-plane/control-plane-mutation-readiness.test.js`
   and `test/query/sql-query-engine.test.js`.
4. A bounded seven-node rerun on April 16, 2026 moved materially later: the
   cluster reached `cluster_active`, recovery created/moved `sql_transactions`
   and `replica_operations` replicas beyond the earlier owner-gap stop, and
   the live event stream reached benchmark table partition creation before the
   rerun was stopped. The remaining live boundary is now seed-side admin
   snapshot/service-query timeout under transport backpressure plus repeated
   `NODE_STATE_UPDATE` / heartbeat publication pressure, not the old mutation
   readiness veto.
