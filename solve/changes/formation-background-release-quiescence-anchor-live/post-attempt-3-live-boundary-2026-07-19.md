# Post-attempt-3 live boundary (2026-07-19)

## Preserved evidence

- Live report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-19T14-13-43-444Z.report.json`
- Repetition summary:
  `test-output/reports/live-repetitions-demo-2026-07-19T14-13-43-560Z.summary.json`
- Cluster archive:
  `data/examples/service-data-affinity-demo-archive/quest-effective-placement-serial-priority-planner-demo1-schema-admission-2026-07-19T14-13-43-444Z.tar.gz`
- Archive SHA-256:
  `2fba1d505886c097687382f5bdad612f3751176b880ba2e71f42c7d06fdbe096`
- Source fingerprint:
  `bba9ca61e25cacc6` (stable for the complete run)

The ordered formation probe passed 5/5 before this run. The first full-demo
slot then failed before preload with schema admission denied on
`replica_operations_in_flight=1`. Its final current-priority placement
observation was available and satisfied: total spread gap zero, priority
spread gap zero, and no missing priority leader.

## Timeline

All times are UTC and come from the archived `service-data-affinity-demo`
cluster.

1. At 14:11:28.720 the snapshot lane's forced authoritative repair failed
   transiently for `control_plane_publications` with
   `authoritative_observation_cache_not_reconciled:
   pre_apply_unreconciled_cached_keys=2`.
2. The last two schema-table ADDs completed at 14:11:29.435. The release
   tracker retained 14:11:29.378 as its latest topology drain and clear
   anchor.
3. The release tracker remained active and reported 69,228 ms stable at
   14:12:38.607 and 69,396 ms stable at 14:12:38.774.
4. At 14:12:39.905 ordinary planning began. The first ordinary REPLACE was
   created at 14:12:39.924, after the configured 60,000 ms admission interval
   plus 10,000 ms observation handoff.
5. Ordinary work included REPLACE
   `replace-op-641c22a3a48c51c056d695bf90d615cf` for
   `package_registry_overrides-p1`. Its source removal completed at
   14:13:20.888.
6. At 14:13:34.055 the planner observed the resulting two-of-three deficit
   and correctly created repair ADD
   `747e1fad-a7ac-4796-933c-18a7b1f2b238`. It advanced
   PENDING -> SENDING -> CREATING -> SYNCING by 14:13:35.153. Node 4 created
   `package_registry_overrides-p1-r4`, joined all three peers, and was waiting
   for voter-ready activation when scenario shutdown began. Later
   `Router shutdown` errors are teardown effects, not evidence of an operation
   wedge.

## Boundary attribution

The completed priority planner and split-snapshot pacing changes are not the
current blocker. The final ADD was healthy foreground progress caused by
ordinary work that had already been released.

The production background fence and the schema-admission observer use
different maturity state. The fence proved its own topology-drain/priority
placement clock and released exactly at its sealed 70-second boundary, yet the
schema observer had not completed its independent 60-second quiet proof.
Therefore the live failure proves that the two clocks can diverge.

The artifacts do **not** retain the schema observer's poll transitions. The
final report preserves only the last snapshot after ordinary work began, so it
cannot establish which pre-release real condition reset or delayed the schema
window (operation count, pressure, leadership, or current-priority placement).
The 14:11:28.720 repair failure is observer-side and the admission code is
designed to hold, not reset, an already-started window through such failures;
it is not sufficient attribution by itself.

## Next discriminator

Preserve a bounded, change-only transition history in schema-admission
evidence without changing its predicate, budgets, polling, stability window,
or live behavior. A fresh run must then identify the exact real reset/delay
before ordinary release. Only that retained transition is sufficient evidence
for a production owner-boundary intervention.
