# Canonical Leader Identity Owner Unification

## Why

Leader identity is materially better than it was, but it is still not owned in
one place across all consumers:

1. admin discovery and control-plane gateway now consume the shared routing
   gap state
2. bootstrap topology still stabilizes leader identity from retained partition
   rows
3. query router and query executor still rebuild canonical leader identity from
   a mix of bootstrap owner rows, retained leaders, service roles, and overlay
   evidence

That is safer than before, but still leaves adjacent boundaries with different
leader stories. This package makes canonical leader identity one owned contract
for bootstrap, query routing, admin, control-plane gateway, and forwarding
diagnostics.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one canonical leader-identity owner and gap-state contract for
   partitions.
2. Route bootstrap topology, query routing, query executor, admin discovery,
   control-plane gateway, and related diagnostics through that owner.
3. Make retained/stabilized bootstrap leaders explicit as owner states instead
   of consumer-local fallback semantics.
4. Remove remaining local leader reconstruction paths where the shared owner
   can answer directly.
5. Align message-group/control-plane forwarding diagnostics with the same
   leader-identity vocabulary where they surface partition leader state.

## Out Of Scope

1. Rewriting general query planning or transport routing beyond leader
   identity.
2. Raft algorithm changes.
3. Broader message-group forwarding fixes not caused by leader-identity
   inconsistency.

## Invariants

1. Every boundary that exposes partition leader identity must consume the same
   owner contract and gap reasons.
2. Leader unknown, owner missing, service missing, retained bootstrap leader,
   and confirmed owner leader must be explicit states, not reconstructed from
   neighboring data.
3. No consumer may leak a stale partition-row leader once the owner contract
   reports a gap.
4. Bootstrap stabilization rules must be visible through the same contract
   instead of hidden behind row mutation.

## Hotspots

1. `src/query/canonical-leader-routing.js`
2. `src/bootstrap/owners/bootstrap-topology-snapshot-owner.js`
3. `src/query/query-router.js`
4. `src/query/query-executor.js`
5. `src/admin/admin-service-discovery.js`
6. `src/control-plane/control-plane-system-table-gateway.js`
7. `src/message-group/message-group-forwarding-owner.js`
8. `test/bootstrap/bootstrap-topology-snapshot-owner.test.js`
9. `test/query/query-executor.test.js`
10. `test/admin/admin-service-discovery.test.js`
11. `test/control-plane/control-plane-system-table-gateway.test.js`

## Analysis Tasks

- [ ] Inventory every current leader-identity consumer and the local fallback
  it still applies.
- [ ] Define one explicit canonical leader-identity state model including
  retained bootstrap owner semantics.
- [ ] Confirm where message-group or forwarding diagnostics must reuse the same
  state vocabulary.
- [ ] Decide which retained bootstrap behaviors remain valid and which should
  become deferred or failed owner states instead.

## Implementation Tasks

- [ ] Add one canonical leader-identity owner surface.
- [ ] Route bootstrap topology, query router, and query executor through that
  owner.
- [ ] Delete consumer-local stale-leader leakage where the owner contract can
  answer directly.
- [ ] Update diagnostics so all boundaries report the same leader state and gap
  reasons.
- [ ] Add focused regressions for owner-gap, service-gap, retained-bootstrap,
  and confirmed-owner cases.

## Progress Notes

1. `QueryExecutor` now preserves `retained_runtime` as an explicit shared
   leader-identity state instead of masquerading retained priority
   control-plane ownership as `owner_confirmed`.
2. `QueryRouter` has focused coverage proving it prefers the richer bootstrap
   leader-identity owner surface over stale service-role witnesses.
3. Message-group forwarding now surfaces explicit pending-versus-persisted
   leader publication identity states instead of treating them as anonymous
   cache-local hints.
4. `SQLQueryEngine` bootstrap overlay reuse/install now consult the shared
   bootstrap leader owner before reviving cached `leader_node_id`, so owner-gap
   state no longer reanimates stale cached leader metadata during cache-gap
   routing.
5. Bootstrap topology, admin discovery, control-plane gateway, query router,
   query executor, and forwarding diagnostics now report one leader-identity
   vocabulary for owner-confirmed, retained-runtime, and owner-gap states.

## Validation

1. `node test/bootstrap/bootstrap-topology-snapshot-owner.test.js`
2. `node test/query/query-router.test.js`
3. `node test/query/sql-query-engine.test.js`
4. `node test/query/query-executor.test.js`
5. `node test/admin/admin-service-discovery.test.js`
6. `node test/control-plane/control-plane-system-table-gateway.test.js`
7. `npm run test:distributed:boundary:transition`

## Done When

1. Bootstrap, query, admin, and control-plane gateway use one leader-identity
   owner contract.
2. Retained bootstrap leader behavior is explicit and diagnosable.
3. No boundary still reports a stale leader while another reports leader gap
   for the same partition.
4. Remaining forwarding or convergence failures are narrower than leader
   identity ownership.
