# Post-attempt-1 live boundary

Date: 2026-07-19

## Measurement

- Command: `npm run demo:movielens`
- Source checkout boot fingerprint:
  `87da0861c1897542`
- Primary report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T12-21-27-140Z.report.json`
- Primary report SHA-256:
  `2f8d84f4e6ad46234508593b2efe48120b0fc2c3dcdb51c43ab6f794d9a58ab9`
- Comparison report:
  `test-output/reports/movielens-three-way-affinity-demo-live-2026-07-19T12-21-27-140Z.report.json`
- Comparison report SHA-256:
  `fbdea623f2bc2db07225be0b4a0e4cb2c33c254ed95466c8425a243bfeb17f42`
- Immutable log archive:
  `data/examples/service-data-affinity-demo-archive/quest-movielens-stale-only-preflight-post-attempt1-service-deploy-admin-timeout-2026-07-19T12-21-27-140Z.tar.gz`
- Archive SHA-256:
  `9d31eac93133c9dc6f8a1dd91138d6a3b6c39f81fc8a814bf980b9e857cf0cd5`

The run was measuring. It used freshly booted local Node processes, formed all
five nodes, admitted schema creation after two stable confirmations, loaded
100,000 ratings, distributed the ratings table over three partitions on all
five nodes, and completed the distributed SQL query with 1,682 result groups.

## Sealed stale-preflight boundary

The original `cache_stale_watermark` blocker did not recur. Schema admission
reported:

- `state=quiescent`
- `criticalSystemTopology.ready=true`
- `totalSpreadGap=0`
- `prioritySpreadGap=0`
- `effectiveInFlightCount=0`
- `stableElapsedMs=65337`
- `stableConfirmationCount=2`

This is evidence that the attempt-1 repair engaged on the unchanged MovieLens
scenario and moved the live boundary. It is not a green Quest result: the
sealed priority metric remains `1` because the later demo phase failed.

## Later residual

Service definition `svc-movielens-topn` was inserted and its rebalancer was
started. The run then timed out waiting for the initial service-placement
admin query:

`Timed out waiting for admin response:
examples-1784463657134-4bae2882-c816-48d0-b887-a0c1e2d71bdf`

The raw logs identify a later priority-recovery condition:

- operation `8ee9d56b-1eba-4c31-95b8-364b252945e0` targeted
  `schema_operations-p1` and remained in the REMOVE workflow;
- `schema_operations-p1` had `requiredDistinctNodeCount=3`,
  `readyDistinctNodeCount=2`, `readyReplicaCount=2`, and `spreadGap=1`, with
  `status_removing:2`;
- the projection readiness owner denied service reads with
  `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`;
- publication was current and fully acknowledged, while its recovery state
  was `priority_spread_pending`;
- subsequent repair moves for the same partition were skipped as
  `budget_exceeded`.

The generic report analyzers classified the sparse terminal report as missing
phase evidence, so the immutable raw logs were inspected under the
analyzer-first exception. They place the active boundary at post-load
operation-workflow progress / priority-spread recovery, not at stale-only
preflight evidence repair.

## Routing decision

No further unchanged rerun or stale-preflight patch is an honest move within
this sealed Quest. This result is a boundary-moved finding for the parent
MovieLens demo. It also consumes the binding residual-child budget in
`solve/epics/formation-complexity-consolidation.md`: do not author another
instance-level residual Quest; pivot to the epic's O3 goal-state-planner work
and preserve this operation as a design input.
