# Post-attempt 1 live boundary: candidate readiness

## Evidence

- Ordered gate: `node scripts/run-live-repetitions.js demo`
- Stable source fingerprint: `ff15a6dbebbca7bd`
- Session summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T16-14-11-616Z.summary.json`
- Passing repetition 1:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T15-58-15-644Z.report.json`
- Failing repetition 2:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T16-14-11-463Z.report.json`
  (`sha256:cd840f179b852b3bfa33431c4a45fa13809b41259b3fb2d6cfd4459eeba5f174`)
- Immutable stopped-state archive:
  `data/examples/service-data-affinity-demo-archive/quest-runtime-service-active-outcome-remote-owner-handoff-demo2-initial-placement-timeout-2026-07-19T16-14-11-463Z.tar.gz`
  (`sha256:9be93dc0a0e2c555afccf60b34c89ffd82754ba8f3088c4f565e6848253f23b9`)

Repetition 1 passed the full unchanged MovieLens contract: 100,000 ratings,
1,682 distributed aggregate rows, two ACTIVE service replicas, weighted
locality 1.000, 20 merge candidates, and the exact top-10. Repetition 2 passed
schema admission, ratings-load admission, data spread, and distributed SQL,
then failed after the unchanged 600,000 ms initial-placement budget with
`service replicas were not initially placed`.

## Exact runtime-service lineage

The stopped `replica_operations-p1` and `services-p1` replicas contain exactly
one MovieLens runtime operation and one MovieLens runtime service:

| Field | Value |
| --- | --- |
| operation | `6e1d8115-6b7f-4e79-8155-1041a7ecd93f` |
| type / entity | `ADD` / `runtime_service` |
| source / target | `93833a66-8d8c-46db-b271-17a06c4d18b9` / same node |
| replica | `svc-movielens-topn-r1` |
| final status / step | `active` / `ACTIVE` |
| service row | `svc-movielens-topn-r1`, ACTIVE on `93833a66-8d8c-46db-b271-17a06c4d18b9` |

The source log records:

1. `16:07:10.831Z`: operation `6e1d…` created for the local target.
2. `16:07:13.875Z`: runtime replica creation completed.
3. `16:07:15.239Z`: operation completed.
4. `16:07:14.221Z`: the same rebalance cycle selected a second ADD target,
   `8fe06107-e779-4322-befc-c70976796bb2`.
5. `16:07:14.288Z`: that move was skipped as `budget_exceeded`; no second
   operation row was created.
6. From `16:08:16.127Z` through `16:13:46.749Z`, periodic cycles continued to
   observe `healthyReplicaCount=1` but selected
   `19eb1497-4db7-4fbc-a04f-455d57845d6f` and rejected it before execution as
   `node_not_ready` / `repair_ineligible`.

This repetition therefore does not exercise a remote runtime ACTIVE outcome:
there is no remote MovieLens operation whose handoff could be dropped.

## Moved owner boundary

All durable `nodes-p1` copies agree that target `19eb…` had:

- `status=active`
- `connection_state=ready`
- `last_heartbeat=1784477085886`
- `ready_lease_expires_at=1784477100886`

Its ready lease had expired before the first later periodic service cycle.
At that cycle, the durable rows for `6a39…`, `7e411…`, and `8fe…` still carried
unexpired leases. The source also continued to log transport-connected and
capacity-admitted evidence for `19eb…`; this was not an ordinary disconnect
classification.

`UnifiedRebalancerAvailableNodes.getAvailableNodesConstrainedToNodeIds()`
selects ordinary placement candidates from the published membership using the
canonical `repairEligible` dimension. `UnifiedRebalancerReplicaState.isNodeReady()`
then applies the current node-record lease and transport predicate before
execution. A node may remain `repairEligible` during a short ready-lease lapse,
so candidate discovery can repeatedly select a node that pre-execution must
reject. Existing tests already state that an expired-lease node is unavailable;
they do not cover the production-shaped split where `repairEligible=true` and
the cached ready lease has expired.

The next bounded Quest belongs to ordinary candidate admission: require both
canonical `repairEligible` and a currently ready node record when discovering
ordinary placement candidates, while preserving the existing startup-authority
exception for critical control-plane recovery. It must prove that an
expired-lease preferred target is excluded and a healthy alternative receives
the runtime-service ADD.

## Quest disposition

Attempt 1 fixed and deterministically proved the sealed remote
`RUNTIME_SERVICE_CREATE_ACTIVE` handoff classification. The fresh ordered gate
moved to a different mechanism before any remote second operation existed.
The current Quest's bounded-active-create constraint leaves no honest source
change for candidate admission, so it should be exhausted and succeeded by a
new candidate-readiness Quest rather than widening its seal.
