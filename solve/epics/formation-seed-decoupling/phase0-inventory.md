# Formation seed decoupling: Phase 0 evidence

Status: design input only. This is not certification evidence and no live run
was started for this inventory.

## Artifact identity

The measurements below come from one existing 2026-09-05 run. The timestamped
paths are ignored run output; their SHA-256 digests are the immutable identity.

| Artifact | SHA-256 | Relevant identity |
| --- | --- | --- |
| `test-output/reports/movielens-lagrange-service-affinity-live-2026-09-05T19-10-11-628Z.report.json` | `0588a3c0d4c7d96983a207294f3572ebc9c17e234269eeee07eb8350178af293` | timestamp `2026-09-05T19:10:11.628Z`; live producer `service-data-affinity-demo` |
| `test-output/reports/release-0-2-five-node-cold-formation-2026-09-05T19-10-11-703Z.report.json` | `ff7af41e2d0bca71cff3bdc6730ab7ebafb7b3dfe246712783d5ec012223a851` | source HEAD `103786ef31e228db949a029930e575d574ddac89`; source fingerprint `a9e9d45c0e613ff0`; embeds the first report's digest |
| `data/examples/service-data-affinity-demo-archive/run-2026-09-05T19-39-46-088Z.tar.gz` | `26d6d288c7c21cafbdaca67c264140f22bc06d1dd8f53bbc7e6679596eda7d2f` | playback start `1788634948399`, end `1788635275172`; contains `node-0.log` through `node-4.log` and all five compressed full logs |

The archive matches the report window: the seed starts at
`2026-09-05T19:02:33.565Z`; four joiners start at approximately
`19:02:50.933Z` through `19:02:50.998Z`; the seed observes the last remote
identification at `19:02:51.278Z`. Node identity is:

| Role | Runtime node id |
| --- | --- |
| seed / node-0 | `60998446-c67f-4b0b-a760-24b76ed756fe` |
| node-1 | `307939ce-c8b6-41a1-99e7-d645e33318a4` |
| node-2 | `2478f93b-8c3b-424d-ac61-783ca89dcd58` |
| node-3 | `4055af37-539f-4c7c-8892-1d5f3f11d0c9` |
| node-4 | `b713d352-b24f-48f8-8d3e-b3bd9ce3f5c6` |

## Reproduced live signature

- The report records 30 seed gaps, 66,486 ms total, 49,840 ms unexplained,
  and a 5,365 ms maximum gap. No joiner log records an event-loop gap.
- In the concentrated `19:02:43.000Z` through `19:04:16.000Z` formation
  interval, the seed records 26 gaps totalling 61,713 ms: 49,840 ms
  unexplained and 11,873 ms tagged-exclusive. The total gap fraction is about
  66.4% of this 93,000 ms interval; unexplained time alone is about 53.6%.
- The seed records 521 `node_ready_lease_incomplete` observations. In 425 the
  unready set contains all five node ids. Observed retry backoffs include
  5,000 ms, 75,000 ms, and 120,000 ms.
- Schema admission observes `critical_spread_open` 49 times from
  `1788635088376` through `1788635212931`, then 20 more times from
  `1788635218305` through `1788635265834`. Every available observation has
  `prioritySpreadGap: 6` and `effectiveInFlightCount: 0`.
- Admission ends at `1788635267876` in `control_plane_pressure` because the
  seed's admin snapshot websocket cannot open.
- Seed bootstrap records 45 system tables and 135 queued replicas. The initial
  replica placement in the logs is seed-concentrated.

## Seed work attribution available today

The watchdog `siteDeltas` in the formation interval provide these inclusive
totals. They are useful directionally, but nested sites overlap and therefore
must not be added or treated as exclusive owner CPU attribution.

| Instrumentation site | Owner class | Calls | Inclusive ms |
| --- | --- | ---: | ---: |
| `publication_recovery_gate_snapshot_build` | control/readiness snapshot building | 49,548 | 3,988 |
| `raft_follower_commit_apply_slice` | Raft apply | 14,155 | 3,970 |
| `priority_recovery_planning_projection_build` | readiness/rebalancer planning projection | 21,939 | 2,129 |
| `projection_readiness_owner_build` | readiness owner | 1,316 | 1,852 |
| `partition_replica_init` | bootstrap replica creation | 135 | 983 |
| `storage_reservation_reconcile` | storage admission/accounting | 18 | 497 |
| `membership_publication` nested readiness site | membership publication | 105 | 146 |

The same interval has 49,840 ms with no site attribution. The existing sites
also do not bind the totals to the input units required by the proposed cost
model (Raft entries, planning passes, snapshot rows/builds, and publication
reconciles). In particular, no stable duration observation identifies a
publication-reconcile pass. Dividing the inclusive totals by call counts would
produce overlapping fixed means, not defensible `{fixedMs, perUnitMs}`
coefficients.

## Phase 0 conclusion

The artifacts are enough to seal the failure predicate and to require the
simulator to reproduce it. They are not enough to rank the three fix mechanisms
by exclusive per-owner seed cost or to commit the required calibration table.
On 2026-09-08 the owner authorized exactly one later calibration run, contingent
on first landing independently verified, mutually exclusive per-turn owner
attribution whose unattributed bucket is then less than 10% of the formation
window. Phase 0 itself scheduled no run.

A scoped `rg` inventory over 146 authorized formation-path files found ambient
clock/timer/construction references in the readiness/publication, bootstrap,
rebalancer/operation, Raft, worker, local snapshot, and admission paths. The
complete `file:line` list is in the design note. No `performance.now`,
`process.hrtime`, socket constructor, or direct `new Worker` match was found;
`ReplicaWorkerManager` does construct Piscina. The inventory is the Quest 1
seam plan. Durable enforcement is a deterministic owner-dispatch guard, not a
change to the unrelated `check-guideline-ambient-intrinsics` checker.
