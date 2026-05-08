# Rolling Restart Durable Rejoin Admin Reachability

April 25 update: The owner-path fix moved `rolling-restart`
past restart readiness and back to the post-active topology convergence
boundary.

## Why

The April 25 `rolling-restart` continuation after the cache-visible
source-removal admission fence moved the blocker back to the restarted-node
readiness barrier:

1. `test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-join-projection-diagnostics.report.json`
2. the restarted durable-rejoin node is reachable by bootstrap health
3. the admin API remains closed with `ECONNREFUSED` on port `8081`
4. `/bootstrap/ready` reports `DEGRADED` with
   `LEADER_METADATA_INCOMPLETE` and `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
5. the newly exposed projection blocker is
   `control_snapshot_authority_unavailable`
6. the local bootstrap runtime has no SQL query engine and no message router
   at that point, so the node cannot expose admin recovery diagnostics before
   seed contact progresses
7. peer logs still show transport backpressure, query routing timeouts, CDC
   participant failures, and bounded bootstrap admission deferral

The previous operation-drain package remains valid, but the current execution
barrier is now durable rejoin startup reachability: the process is alive, but
the owner path that would make admin or recovery diagnostics reachable is not
yet available.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling restart in-flight operation drain and CDC pressure](./todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md)
2. [Critical recovery pressure reserve and admission contract](./done-20260424-critical-recovery-pressure-reserve-and-admission-contract.md)

## In Scope

1. Preserve the bootstrap join projection decision in `/bootstrap/ready`.
2. Carry the projection blocker into restart-readiness failure diagnostics.
3. Let seed contact obtain enough startup authority while priority recovery is
   still pending, so durable rejoin stays on the startup-authority owner path
   instead of creating an early parallel admin runtime.
4. Keep strict restart admin readiness honest; do not mark admin-ready while
   the admin API is still unreachable.
5. Rerun `rolling-restart` after the owner-path fix and record whether the
   blocker closes or moves to priority operation creation/drain.

## Out Of Scope

1. Increasing restart readiness or convergence timeouts.
2. Harness-only exemptions for `adminReady=false`.
3. Treating bootstrap liveness as admin readiness.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  bootstrap readiness owner, startup-authority snapshot owner, and durable
  rejoin startup owner.
- Canonical contract:
  a durable-rejoin process that is bootstrap-reachable but admin-closed must
  expose one canonical startup blocker, then obtain startup authority through
  seed contact before strict admin readiness is allowed to pass.
- Allowed consumers:
  restart recovery gate, failure bundles, bootstrap readiness probes, and
  durable rejoin startup diagnostics.
- Prohibited reinterpretations:
  `ECONNREFUSED` from the admin API must not hide a bootstrap join projection
  blocker; bootstrap health must not satisfy strict admin readiness; an early
  diagnostics/admin runtime must not become a second startup-authority path.

## Progress Grammar

1. `bootstrap_only_alive` means `/health` answers but admin diagnostics are not
   reachable.
2. `join_projection_blocked` means `/bootstrap/ready` has an explicit
   projection blocker.
3. `startup_authority_unavailable` means the durable rejoin path lacks the
   seed-contact authority needed to project join readiness.
4. `admin_diagnostic_reachable` means strict restart readiness can observe the
   admin or recovery diagnostic surface.
5. `closed` means the restarted node reaches strict admin readiness or moves to
   a later, named priority recovery operation blocker.

## Residual Closure Inventory

- [x] `/bootstrap/ready` exposes the bootstrap join projection decision.
- [x] Restart-readiness timeout messages include the projection blocker.
- [x] Focused bootstrap and harness tests cover the projection diagnostic.
- [x] Representative rerun confirms the current blocker is
      `control_snapshot_authority_unavailable`.
- [x] Durable rejoin startup obtains seed-contact startup authority while
      priority control-plane recovery is pending.
- [x] The next `rolling-restart` run either passes restart readiness or moves
      to a named priority operation creation/drain blocker with admin
      diagnostics available.

## Validation

1. `node --check src/bootstrap/bootstrap-api-constants.js`
2. `node --check src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js`
3. `node --check test/distributed/harness/cluster-segment-3.js`
4. `node --check test/distributed/harness/cluster-segment-7-class-2.js`
5. `node --check test/bootstrap/bootstrap-api.test.js`
6. `node --check test/distributed/harness/__tests__/cluster.test-part-2.js`
7. `npm test -- test/bootstrap/bootstrap-api.test.js`
8. `npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js`
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-bootstrap-join-projection-diagnostics.report.json --fast-local --verbose`

Executed on April 25, 2026:

1. Syntax checks passed for all changed bootstrap and harness files.
2. `npm test -- test/bootstrap/bootstrap-api.test.js`
3. Result: passed, `125/125`.
4. `npm test -- test/distributed/harness/__tests__/cluster.test-part-2.js`
5. Result: passed, `27/27`.
6. `rolling-restart` rerun failed at restart readiness, but now the terminal
   evidence includes
   `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.
7. `node --check src/bootstrap/owners/bootstrap-request-owner.js`
8. Result: passed.
9. `node --check src/bootstrap/bootstrap-api.js`
10. Result: passed.
11. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-seed-startup-authority.report.json --fast-local --verbose`
12. Result: failed later with `topology_unstable` /
    `convergence_timeout`; restart readiness, publication convergence, and
    restart recovery were closed, and admin diagnostics were available.
    Terminal evidence moved to in-flight replica operations plus over-target
    partitions.

## Done When

1. Restarted durable-rejoin nodes no longer remain bootstrap-only with the
   projection blocker `control_snapshot_authority_unavailable`.
2. Strict restart readiness either reaches admin-ready through seed-contact
   startup authority or reports the next owner blocker with admin/recovery
   diagnostics available.
