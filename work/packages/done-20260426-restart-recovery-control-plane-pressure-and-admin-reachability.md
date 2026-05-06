# Restart Recovery Control-Plane Pressure And Admin Reachability

## Why

The publication recovery package closed the ACK and missing-published active
membership blockers. The next `rolling-restart --fast-local` representative
run migrated to restarted-node recovery readiness before post-active trim or
quiescence.

The restarted node
`11601fe0-72d6-5853-8590-ec2881853e72` remained reachable by bootstrap health,
but did not become admin-ready or control-plane recovery-ready within
`120000ms`. Its terminal probe reported readiness phase `INIT`,
`bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`, and
admin probe `ECONNREFUSED` on `172.19.0.4:8081`.

Surrounding owner evidence shows control-plane pressure at the same boundary:
`control_plane_pressure_degraded` while writing
`control_plane_publications`, plus message-router saturation for
`query:insert:control_plane_publications` with critical pending work at the
source limit.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Restart-recovery readiness ownership for durable rejoin nodes that are
   bootstrap-reachable but not admin-reachable.
2. Control-plane pressure behavior for membership publication writes during
   restart recovery.
3. Transport/source-limit pressure classification for critical publication and
   restart-recovery work.
4. Focused tests that prove pressure/admission outcomes are canonical and
   retryable where the owner contract says they are.
5. One representative `rolling-restart --fast-local` rerun after the owner
   path is repaired.

## Out Of Scope

1. Increasing restart-recovery or convergence timeouts.
2. Harness-only exemptions for bootstrap-reachable but admin-dead nodes.
3. Broad matrix reruns before the 5-node representative path stabilizes.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owners:
  restart-recovery readiness owner, control-plane workload profile, and
  membership publication owner.
- Canonical contract:
  restart-recovery must distinguish bootstrap reachability, admin reachability,
  control-snapshot authority, and pressure-deferred publication work as named
  owner outcomes.
- Allowed consumers:
  node join readiness, bootstrap/admin probes, membership publication
  acknowledgement, pressure governor, failure bundles, and the distributed
  harness restart-recovery barrier.
- Prohibited reinterpretations:
  caller-local pressure bypasses, treating bootstrap health as admin readiness,
  or hiding control-plane pressure behind generic `restart_recovery_timeout`.

## Latest Evidence

1. Command:
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
2. Result:
   first failed, `0/1` passed after `269.1s`, at
   `restart_recovery_timeout`.
3. Report:
   `test-output/report.json`
4. Failure bundle:
   `test-output/.playback/report/rolling-restart/failure-bundle.json`
5. Triage:
   `test-output/.playback/report/rolling-restart/triage-summary.json`
6. Dominant reason:
   `restart_recovery_timeout`
7. Publication recovery:
   epoch `4`, status `PUBLISHED`, pending ACK count `0`,
   missing published count `0`, priority recovery blocked count `0`.
8. Restarted node:
   `11601fe0-72d6-5853-8590-ec2881853e72`, bootstrap reachable,
   `adminReady=false`, `controlPlaneRecoveryReady=false`, readiness phase
   `INIT`, readiness stage `alive`.
9. Pressure evidence:
   `control_plane_pressure_degraded` for `control_plane_publications` upserts
   and `query:insert:control_plane_publications` source-limit saturation with
   critical pending work.
10. Repair:
    publication mutations now use the shared
    `PUBLICATION_MUTATION` workload class as critical, deferrable
    control-plane work and carry the workload-owned resource key through the
    system-table gateway into routed SQL admission.
11. Focused proof:
    pressure-governor, control-plane system-table gateway, and CDC integration
    tests prove the publication mutation admission contract and resource-key
    propagation.
12. Representative rerun:
    after the publication pressure repair, `rolling-restart --fast-local`
    passed the restart-recovery barrier. Publication epoch `46` was
    `PUBLISHED`, pending ACK count was `0`, blocked publication node count was
    `0`, and the `restart_recovery` gate closed at
    `control_plane_recovery_ready`.
13. Migrated blocker:
    the rerun failed later at `Convergence timeout after 120000ms` with
    post-rebalance closure open on operation drain, membership trim, and
    no-over-target evidence. The remaining in-flight operation count was `4`,
    stale in-flight count was `0`, and over-target voters were limited to
    `replica_operations-p1` and `sql_transaction_participants-p1`.
14. Follow-on owner:
    [Rolling restart operation transition pressure and over-target trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
    owns the migrated post-active operation lifecycle and durable trim
    boundary.

## April 29 Classification Repair

The quiescence-classification continuation rerun migrated back to this
restart-recovery boundary before reaching quiescence:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
2. Result: failed, `0/1` passed after `273.6s`.
3. Terminal barrier: restarted node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` did not become recovery-ready
   within `120000ms`.
4. The node was reachable by bootstrap health, but `adminReady=false`,
   `controlPlaneRecoveryReady=false`, readiness phase was `INIT`, and
   `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.
5. Publication recovery remained closed: epoch `4`, status `PUBLISHED`,
   pending ACK count `0`, blocked node count `0`, and missing published count
   `0`.
6. Priority-recovery blocker counts were closed, but stale retained
   `recoveryProtocolState=priority_spread_pending` made the failure bundle
   report `priority_spread_pending`.

The April 29 repair fences restart-recovery failure-barrier classification so
stale `priority_spread_pending` protocol state only wins when canonical
publication/priority-recovery blockers are still open. Closed priority spread
now leaves bootstrap/admin readiness as the restart-recovery blocker instead
of reviving stale priority evidence. Regenerating the failure bundle for
`test-output/report.json` now reports `startup_recovery_blocked` /
`restart_recovery_timeout` with `startupMode=durable_rejoin`.

## Residual Closure Inventory

- [x] Confirm whether publication mutation pressure should defer, retry, or
      reject during restart recovery.
- [x] Confirm whether restart-recovery readiness should surface
      control-snapshot authority and admin reachability as separate owner
      states.
- [x] Add focused pressure/readiness regression tests before changing runtime
      behavior.
- [x] Remove or fence any caller-local pressure exception found on the active
      path.
- [x] Rerun `rolling-restart --fast-local`.

## Closure Notes

1. Publication mutation pressure now has one canonical outcome at the shared
   workload/admission boundary: critical work may defer under exhausted
   control-plane reserve instead of rejecting or bypassing pressure locally.
2. Restart-recovery evidence already surfaces bootstrap reachability, admin
   reachability, control-snapshot authority, and recovery readiness as named
   states. The representative rerun confirms that this boundary no longer owns
   the terminal failure.
3. The affected-area review found no remaining restart-recovery pressure
   exception in the publication mutation path. The remaining failure is a
   different owner boundary: post-active replica operation drain and durable
   over-target trim under control-plane pressure.

## Validation

April 26 closure results:

1. `node --test test/control-plane/pressure-governor.test.js test/control-plane/control-plane-system-table-gateway.test.js test/cdc/cdc-integration-service.test.js`
   passed with `350/350` assertions.
2. `node --test test/rebalancer/quorum-conditioned-remove-safety.test.js test/rebalancer/replace-replica-workflow.test.js`
   passed with `442/442` assertions for the migrated operation-transition
   safety slice.
3. `npm run audit:runtime-grammar` passed, including
   `audit:state-machine-pressure`.
4. `npm run audit:guideline:decision-boundaries` passed.
5. `npm run audit:guideline:literals` passed with `0` new violations.
6. `npm run test:metadata-gateway:audit` passed.
7. `git diff --check` passed.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`
   migrated out of restart recovery and failed later at post-active
   convergence.

April 29 classification repair results:

1. `node --check test/distributed/harness/failure-bundle-segment-4.js`
2. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
3. Result: passed.
4. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
5. Result: passed, `53/53`.
6. `npm run audit:guideline:literals`
7. Result: passed with `0` new literal-guideline violations.
8. `npm run audit:guideline:decision-boundaries`
9. Result: passed with `0` decision-boundary guideline violations.
10. `npm run audit:runtime-grammar`
11. Result: passed with `0` runtime-grammar-contract violations and
    state-machine pressure `issues=0`.
12. `npm run test:metadata-gateway:audit`
13. Result: passed.
14. `git diff --check`
15. Result: passed.
16. Failure-bundle regeneration for `test-output/report.json`
17. Result: `failureClass=startup_recovery_blocked`,
    `rootCauseClass=startup`, dominant reason `restart_recovery_timeout`.
18. Review follow-up:
    `npm test -- test/control-plane/system-metadata-owner-modules.test.js`
19. Result: passed after updating the publication-owner assertion to the
    critical deferrable `PUBLICATION_MUTATION` workload contract.

## Done When

1. Restart-recovery failure bundles name the owner state that blocks admin or
   control-plane recovery readiness.
2. Publication write pressure during restart recovery has one canonical
   admit/defer/retry/reject outcome.
3. Focused proof and static guardrails pass.
4. The representative `rolling-restart` run either passes or migrates to a new
   named owner boundary.
