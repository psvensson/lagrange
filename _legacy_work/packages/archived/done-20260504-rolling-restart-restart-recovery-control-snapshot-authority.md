# Rolling Restart Restart Recovery Control Snapshot Authority

Closed by migration on May 4, 2026.

Opened on May 4, 2026 after the review-fix rerun moved the representative
`rolling-restart --fast-local` path out of publication ACK, missing-published
membership, selected-snapshot coverage, and priority-recovery operation
creation, then back into restarted-node recovery readiness.

## Closure Evidence

The bootstrap-init control-snapshot authority gap is closed in focused
coverage and no longer appears as the representative terminal blocker:

1. Failing-first focused proof:
   `npm test -- test/bootstrap/bootstrap-api.test.js` failed before the fix on
   `BootstrapAPI - bootstrap join readiness uses seed-contact authority during
   bootstrap INIT runtime wiring`.
2. Runtime fix: `src/bootstrap/startup-recovery-coordinator.js` now treats the
   canonical `BOOTSTRAP_NOT_READY` / runtime-wiring reason as bypassable only
   inside the existing seed-authorized bootstrap `INIT` priority-recovery
   projection.
3. Strict `/readyz` remains closed in the focused proof while
   `/bootstrap/ready` projects `controlPlaneRecoveryReady=true` from retained
   seed-contact startup authority.
4. Representative rerun:
   `test-output/reports/rolling-restart-restart-recovery-control-snapshot-authority-20260504-codex.report.json`
5. Result: failed, `0/1` passed after `130.5s`, but the terminal blocker
   migrated to startup active-gate publication/priority-recovery coordination.
6. The rerun contains no terminal
   `control_snapshot_authority_unavailable`, no terminal
   `admin_reachability_refused`, and no terminal recovery-readiness snapshot.
7. New dominant reason:
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`.
8. New active package:
   [Rolling Restart Startup Publication Membership Priority Recovery Coordination](./done-20260504-rolling-restart-startup-publication-membership-priority-recovery-coordination.md).

## Opening Evidence

1. Representative report:
   `test-output/reports/rolling-restart-next-work-package-20260504-codex-after-review-fixes.report.json`
2. Result: failed, `0/1` passed after `302.4s`.
3. Terminal barrier: restarted node
   `35a891b8-c1a0-5064-9c6e-2acfba61c2a7` did not become recovery-ready
   within `120000ms`.
4. Root cause class: `startup`.
5. Dominant reason: `admin_reachability_refused`.
6. Failure class: `startup_recovery_blocked`.
7. Failover and convergence gates are closed.
8. `restart_recovery` is open with blocker `admin_reachability_refused`.
9. Publication epoch `4` is `PUBLISHED`.
10. Pending ACK count is `0`; missing published count is `0`.
11. Priority recovery blocked and unresolved partition counts are both `0`.
12. Terminal node is reachable by `bootstrap_health`, but
    `adminReady=false`, `controlPlaneRecoveryReady=false`,
    `readinessPhase=INIT`, `readinessStage=alive`, and
    `bootstrapJoinProjectionBlocker=control_snapshot_authority_unavailable`.
13. Terminal readiness reasons include `BOOTSTRAP_PHASE_INCOMPLETE`,
    `SQL_ENGINE_UNAVAILABLE`, `LEADER_METADATA_INCOMPLETE`,
    `BOOTSTRAP_NOT_READY`, and `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.

This was not an operation-transition / over-target trim failure. That package
remains queued until the startup publication / priority-recovery coordination
boundary no longer preempts the representative path.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## Depends On

1. [Rolling restart durable rejoin admin reachability](./done-20260425-rolling-restart-durable-rejoin-admin-reachability.md)
2. [Rolling restart restart recovery admin reachability regression](./done-20260430-rolling-restart-restart-recovery-admin-reachability-regression.md)
3. [Rolling restart publication ACK snapshot reachability regression](./done-20260430-rolling-restart-publication-ack-snapshot-reachability-regression.md)
4. [Priority recovery actuation contract under load](./done-20260430-priority-recovery-actuation-contract-under-load.md)

## In Scope

1. Preserve strict admin-readiness honesty: an admin socket refusal must remain
   `adminReady=false`.
2. Make bootstrap-join recovery readiness consume seed-contact startup authority
   while durable rejoin is still in bootstrap `INIT`.
3. Treat bootstrap `INIT` runtime-wiring incompleteness as bypassable only when
   the same snapshot also carries explicit startup authority and priority
   control-plane recovery evidence.
4. Keep `/bootstrap/ready` ownership on the bootstrap readiness owner and
   startup recovery coordinator, not caller-local harness exceptions.
5. Re-run focused bootstrap/startup recovery tests and one representative
   `rolling-restart --fast-local` scenario.

## Out Of Scope

1. Increasing restart-recovery or convergence timeouts.
2. Treating bootstrap health as admin readiness.
3. Operation transition cleanup or over-target voter trim.
4. Broad matrix reruns before the representative path passes or migrates.
5. Pro or Enterprise behavior.

## Shared Boundary Contract

Semantic owner:

1. `src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js`
2. `src/bootstrap/startup-recovery-coordinator.js`
3. seed-contact startup authority captured by the durable rejoin contact path

Consumer:

1. strict restart-recovery observation in the distributed harness

Contract:

1. `/readyz` remains strict runtime/admin readiness.
2. `/bootstrap/ready` may project bootstrap-join recovery readiness only from
   one canonical snapshot that includes startup authority and one normalized
   readiness reason set.
3. `control_snapshot_authority_unavailable` remains the canonical blocker when
   no usable local or seed-contact startup authority exists.
4. `BOOTSTRAP_NOT_READY` may not block the bootstrap-join projection by itself
   when all remaining reasons are bootstrap-init priority recovery reasons and
   startup authority is available.

## Progress Grammar

1. `control_snapshot_authority_unavailable` means the restarted node has no
   usable local or seed-contact startup authority for bootstrap-join
   projection.
2. `init_priority_bypass` means seed-contact startup authority authorizes
   bootstrap `INIT` control-plane recovery projection while strict admin
   readiness remains false.
3. `admin_reachability_refused` means the admin socket is not accepting strict
   probes and may still be the terminal owner state.
4. `closed` means restart recovery no longer blocks the representative path.
5. `migrated` means the rerun reaches a new named owner boundary.

## Residual Closure Inventory

- [x] Focused regression covers seed-contact startup authority during bootstrap
      `INIT` with `BOOTSTRAP_NOT_READY`.
- [x] Startup recovery reason normalization lets that authorized `INIT`
      snapshot project `controlPlaneRecoveryReady=true`.
- [x] Strict admin readiness remains false while the admin API is refused.
- [x] A representative rerun no longer fails on
      `control_snapshot_authority_unavailable`.
- [x] The next blocker is either closed or migrated to a named package before
      re-entering operation-transition trim.

## Validation

1. `npm test -- test/bootstrap/bootstrap-api.test.js`
2. `npm test -- test/bootstrap/startup-authority-consumption.test.js`
3. `node --check src/bootstrap/startup-recovery-coordinator.js`
4. `node --check test/bootstrap/bootstrap-api.test.js`
5. `node --check test/bootstrap/startup-authority-consumption.test.js`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

## Execution Log

1. `npm test -- test/bootstrap/bootstrap-api.test.js`
2. Result before fix: failed as expected in the new bootstrap `INIT`
   seed-contact authority regression; `/bootstrap/ready` returned `503`, kept
   the bootstrap-init reasons, and did not mark the projection ready.
3. `npm test -- test/bootstrap/bootstrap-api.test.js`
4. Result after fix: passed, `143/143`.
5. `npm test -- test/bootstrap/startup-authority-consumption.test.js`
6. Result: passed, `20/20`.
7. `node --check src/bootstrap/startup-recovery-coordinator.js`
8. Result: passed.
9. `node --check test/bootstrap/bootstrap-api.test.js`
10. Result: passed.
11. `node --check test/bootstrap/startup-authority-consumption.test.js`
12. Result: passed.
13. `git diff --check`
14. Result: passed.
15. `npm run audit:runtime-grammar`
16. Result: passed, `0` runtime-grammar-contract violations.
17. `npm run audit:guideline:literals`
18. Result: passed, `0` new literal-guideline violations.
19. `npm run audit:guideline:decision-boundaries`
20. Result: passed, `0` decision-boundary guideline violations.
21. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/rolling-restart-restart-recovery-control-snapshot-authority-20260504-codex.report.json --verbose`
22. Result: failed/migrated, `0/1` passed after `130.5s`.
23. New blocker: startup active-gate publication/priority-recovery
    coordination with `active=4/5`, best progress `active=5/5`,
    snapshot coverage `3/5`, pending ACK `0`, missing published active nodes
    `2-3`, and priority recovery `coordination_mismatch`.
