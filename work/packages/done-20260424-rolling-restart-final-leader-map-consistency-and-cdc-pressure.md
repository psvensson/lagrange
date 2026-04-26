# Rolling Restart Final Leader-Map Consistency And CDC Pressure

Status: done on April 24, 2026.

## Why

The `rolling-restart` secondary re-entry moved beyond strict post-restart
ACTIVE convergence in:

1. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-post-restart-active-classified.report.json`

The new terminal blocker is final leader-map consistency after active
readiness:

1. `activeNodeCount=5/5`
2. `snapshotCoverage=5/5`
3. `publicationStatus=PUBLISHED`
4. `pendingAck=0`
5. `prioritySpreadSatisfied=true`
6. `priorityRecoveryUnresolvedClassCount=0`
7. `priorityRecoveryUnresolvedSemanticStateCount=0`
8. `priorityRecoveryBlockedPartitionCount=0`
9. final leader maps disagree for `sql_transactions-p1`
10. logs still show CDC and transport pressure around the failure window.

Observed disagreement:

1. node `7493b0ab-a054-5fad-a91b-5e331db29304` reports
   `sql_transactions-p1` leader
   `8be8d30f-4499-5eed-865c-71b4d529a67a`
2. node `11601fe0-72d6-5853-8590-ec2881853e72` reports
   `sql_transactions-p1` leader
   `7493b0ab-a054-5fad-a91b-5e331db29304`

This package owns the final consistency blocker. It must not reopen the
completed post-restart ACTIVE convergence package.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Topology workflow stabilization`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Identify whether the leader-map disagreement is a real Raft leadership
   divergence, stale admin/cache observation, or CDC dissemination lag.
2. Tie the mismatch to the owning runtime boundary: Raft leader ownership,
   authoritative partition state, CDC propagation, system-table cache
   visibility, or final consistency observation.
3. Preserve strict final ACTIVE readiness before final consistency checks.
4. Improve final consistency diagnostics if they currently report only the
   mismatching maps without the owner evidence needed to choose a fix.

## Out Of Scope

1. Weakening final leader-map consistency assertions.
2. Treating publication or priority recovery readiness as sufficient for final
   consistency.
3. Increasing timeouts before the owner path is understood.
4. Broad matrix continuation while this blocker is active.

## Shared Boundary Contract

- Semantic owner:
  final leader-map consistency after all restart and active-readiness gates.
- Canonical contract:
  final consistency must compare owner-backed leader state and report whether
  disagreement comes from true Raft leadership, stale cache/admin observation,
  or CDC/transport dissemination delay.
- Allowed consumers:
  `rolling-restart`, final consistency assertions, failure bundles, and the
  representative matrix re-entry package.
- Prohibited reinterpretations:
  publication-ready or active-ready evidence must not be reinterpreted as
  final leader convergence; timeout-only readiness fallbacks must not mask a
  leader-map mismatch.

## Progress Grammar

1. `active_ready` means all strict ACTIVE, publication, and priority recovery
   gates are closed.
2. `leader_map_mismatch` means at least two nodes report different leaders for
   one partition at final consistency.
3. `raft_owner_diverged` means the authoritative Raft owner state itself names
   incompatible leaders.
4. `cdc_visibility_lag` means authoritative state has converged but one or more
   observers have not consumed the update.
5. `transport_delivery_deferred` means critical CDC or admin observations are
   delayed by bounded transport pressure.
6. `final_consistency_ready` means all final leader-map observers agree from
   owner-backed evidence.

## Residual Closure Inventory

- [x] Reproduce the final leader-map mismatch from the existing rolling-restart
      report with focused owner evidence.
- [x] Identify whether the next rerun is still owned by `sql_transactions-p1`
      final consistency or has moved to a different owner boundary.
- [x] Defer CDC pressure analysis because the next rerun failed before final
      consistency.
- [x] Add or update final consistency diagnostics so the owner path is visible
      without reading raw logs.
- [x] Rerun `rolling-restart` and record the next blocker movement.

## April 24 Continuation Notes

The latest report still names `leader_identities_disagree`, but the failure
bundle was allowing a stale readiness timeout to classify the final blocker as
startup recovery. The harness now attaches a `finalConsistency` diagnostic
snapshot on consistency mismatches, including the reason code, boundary,
reference and peer node ids, differing partition ids, and per-partition leader
evidence.

`waitForConsistencyConvergence` now escalates to an explicit authoritative
control snapshot repair after its force-repair threshold. This keeps ordinary
ACTIVE/readiness probes on their existing local-snapshot policy while giving
final consistency one owner-backed repair path for stale leader-map observers.

Current hypothesis: the observed `sql_transactions-p1` mismatch is stale
control-snapshot/cache observation rather than proven Raft owner divergence.
The next validation step is a `rolling-restart` rerun in an environment that can
open local admin sockets and run the distributed harness.

April 24 closure update: the follow-up `rolling-restart` rerun moved away from
final leader-map consistency and then migrated again to the per-node restart
recovery barrier. The current owner boundary is split into
[Rolling restart restart-recovery priority spread pending](./superseded-20260424-rolling-restart-restart-recovery-priority-spread-pending.md).

## Recommendation Split And Priority

The April 24 design review produced four follow-up packages. They are wired
into the current sprint in this order:

1. [Final consistency barrier and decision table](archived/done-20260424-final-consistency-barrier-and-decision-table.md)
   is complete with focused validation. It adds the immediate revision
   barrier, all-observer leader evidence, concurrent observer reads, and
   stale-observer classification.
2. [Control snapshot authority certificate](archived/done-20260424-control-snapshot-authority-certificate.md)
   is complete. It adds durable owner-backed leadership evidence.
3. [Admin observation mode and repair contract](archived/done-20260424-admin-observation-mode-and-repair-contract.md)
   is complete. It makes local, fresh, deferred, scheduled repair, and forced
   repair observation modes explicit.
4. [Final consistency failure classifier cutover](archived/done-20260424-final-consistency-failure-classifier-cutover.md)
   is complete. Structured diagnostics and observation modes now classify
   active final consistency before the legacy message compatibility path is
   considered.

## Validation

Executed before activation:

1. `node test/distributed/harness/__tests__/failure-bundle.test.js`
2. Result: passed.
3. `node test/distributed/harness/__tests__/cluster.test-part-6.js`
4. Result: passed.
5. `node test/distributed/harness/__tests__/cluster.test.js`
6. Result: passed.
7. `git diff --check`
8. Result: passed.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-post-restart-active-classified.report.json --fast-local --verbose`
10. Result: failed at final leader-map consistency after strict ACTIVE
    convergence passed.

Executed during April 24 continuation:

1. `node test/distributed/harness/__tests__/assert-consistency.test.js`
2. Result: passed, `34/34`.
3. `node test/distributed/harness/__tests__/failure-bundle.test.js`
4. Result: passed, `35/35`.
5. Direct NodeHandle authoritative-repair probe with
   `forceAuthoritativeRepair=true`.
6. Result: passed; the query path used `control_snapshot_local(true)`
   directly.
7. `git diff --check`
8. Result: passed.
9. `node test/distributed/harness/__tests__/cluster.test-part-3.js`
10. Result: environment-blocked in this sandbox because local
    `127.0.0.1` listen fails with `EPERM`; all failures occurred before
    harness assertions while constructing local WebSocket test servers.

Executed for the first-priority recommendation split:

1. `node --check test/distributed/harness/assertions-segment-3.js`
2. Result: passed.
3. `node --check test/distributed/harness/failure-bundle-segment-4.js`
4. Result: passed.
5. `node test/distributed/harness/__tests__/assert-consistency.test.js`
6. Result: passed, `35/35`.
7. `node test/distributed/harness/__tests__/failure-bundle.test.js`
8. Result: passed, `36/36`.
9. `git diff --check` on touched package, sprint, and harness files.
10. Result: passed.

Executed for the second-priority recommendation split:

1. `node --check src/admin/admin-control-snapshot-class-part-1.js`
2. Result: passed.
3. `node --check src/admin/admin-control-snapshot-class-part-7.js`
4. Result: passed.
5. `node --check src/admin/admin-control-snapshot.js`
6. Result: passed.
7. `node test/admin/admin-control-snapshot-response-contract.test.js`
8. Result: passed, `6/6`.
9. `node test/distributed/harness/__tests__/assert-consistency.test.js`
10. Result: passed, `37/37`.
11. `node test/distributed/harness/__tests__/failure-bundle.test.js`
12. Result: passed, `37/37`.
13. `git diff --check` on touched package, sprint, admin, and harness files.
14. Result: passed.

Executed for the third-priority recommendation split:

1. `node --check src/admin/admin-constants.js`
2. Result: passed.
3. `node --check src/admin/admin-control-snapshot-class-part-1.js`
4. Result: passed.
5. `node --check src/admin/admin-control-snapshot-class-part-2.js`
6. Result: passed.
7. `node test/admin/admin-control-snapshot-response-contract.test.js`
8. Result: passed, `10/10`.
9. `node test/distributed/harness/__tests__/assert-consistency.test.js`
10. Result: passed, `37/37`.
11. `node test/distributed/harness/__tests__/failure-bundle.test.js`
12. Result: passed, `37/37`.
13. `node test/admin/admin-websocket-api.test.js`
14. Result: passed, `51/51`.
15. `node test/admin/admin-websocket-api.test-part-4.js`
16. Result: not a valid standalone entry point in this worktree; it failed
    before assertions because split-local helpers are only present in the
    aggregate admin WebSocket API test.
17. `git diff --check` on touched package, sprint, admin, and harness files.
18. Result: passed.

Executed for the fourth-priority recommendation split:

1. `node --check test/distributed/harness/failure-bundle-segment-4.js`
2. Result: passed.
3. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
4. Result: passed.
5. `node test/distributed/harness/__tests__/failure-bundle.test.js`
6. Result: passed, `40/40`.
7. `git diff --check` on touched package, sprint, and failure-bundle files.
8. Result: passed.

Executed for closure:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun.report.json --fast-local --verbose`
2. Result: failed before final consistency at strict ACTIVE convergence with
   `inactive_nodes=1`.
3. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
4. Result: passed, `41/41`.
5. Regenerated the latest rolling-restart failure bundle and triage summary.
6. Result: final consistency is no longer the active blocker; the current
   owner boundary is split into the restart-recovery priority-spread package.

## Done When

1. `rolling-restart` passes final leader-map consistency, or the scenario moves
   to a freshly split blocker with owner evidence that is not final
   leader-map consistency.
2. Failure bundles and final consistency diagnostics name the owner boundary
   rather than falling back to stale publication or readiness labels.
