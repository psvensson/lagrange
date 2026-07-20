# Post-attempt-1 live blocker attribution

## Immutable evidence

- Report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T10-30-41-823Z.report.json`
- Report SHA-256:
  `6c12e5ffea080ec1d5de91e8d6a0eb8a713367f2eac5d7d96b989802f29f1a16`
- Raw run archive:
  `data/examples/service-data-affinity-demo-archive/quest-executor-active-services-cache-handoff-post-attempt1-cache-stale-watermark-2026-07-19T10-30-41-823Z.tar.gz`
- Archive SHA-256:
  `07541909acee4b5bee8404efaa3bd3872f67a82b2a5208515f78d8d6753e6de1`

## Attempt-1 movement

The report's critical-system topology is ready:

- `totalSpreadGap: 0`
- `prioritySpreadGap: 0`
- no blocked or leaderless priority partitions
- `stabilityWindowHeld: true`

This rules out the pre-attempt `replica_operations-p1` spread gap and confirms
that the executor ACTIVE-to-authoritative-SERVICES handoff changed the live
frontier as intended.

## Current blocker

Schema admission is denied by:

`snapshot_query_error=control snapshot observation failed (stale_usable): cache_stale_watermark`

The seed log records four successful nine-table authoritative discovery
repairs:

- `2026-07-19T10:30:19.248Z`
- `2026-07-19T10:30:19.268Z`
- `2026-07-19T10:30:26.771Z`
- `2026-07-19T10:30:26.792Z`

Each repaired `nodes`, `partitions`, `services`, `tables`,
`control_plane_publications`, `node_endpoints`, `service_definitions`,
`service_endpoints`, and `replica_operations`, with `repairedTableCount: 9`
and no failure.

The freshness consumer in
`AdminPreflightSnapshot.buildPreflightCacheFreshnessSummary` measures only the
`service_endpoints` mutation-or-authoritative-observation watermark.
`CACHE_STALE_WATERMARK` alone nevertheless maps to the default nine-table
repair set. The successful repair groups are about 7.5 seconds apart, while
the stale threshold is 5 seconds and preflight waits at most 1 second for a
repair. A stale-only snapshot can therefore repeatedly return the old
watermark while an unrelated full repair remains in flight, preventing a
continuous admission window even though the topology owner is ready.

## Ownership decision

Do not broaden `executor-active-services-cache-handoff` into admin/cache
freshness policy. Route the residual failure to a bounded successor of
`movielens-observation-watermark-churn-consolidation`:

- deterministic red case: stale-only preflight must request only the table
  whose watermark it consumes;
- preserve the full repair set whenever another trigger requires topology,
  discovery, or replica-operation authority;
- preserve complete-table receipts, fail-closed observation publication, and
  every unchanged live budget;
- rerun the unchanged MovieLens scenario only after the focused policy and
  preflight composition are green.
