# Slice 1 receipt — ReadinessPlanningSnapshotOwner liveness under post-formation churn (measurement only)

Fixture: local docker 5-node formation (`LAGRANGE_LOOP_GAP_PROFILE=1 npm run
demo:movielens`, the GCP-shaped churn; the stall signature reproduces locally:
175–383 settle-waits vs 601 on GCP). Three runs, measurement-only probe
(uncommitted; patch in the session scratchpad `planning-liveness-probe.patch`),
seed node-0. Ownership map: `readiness-planning-snapshot-liveness.ownership-map.md`.

```text
PLANNING WINDOW:
    start:      seed boot (+~5 s) through schema-admission timeout
    duration:   ~330 s per run (runs 2026-09-04 04:5xZ / 05:0xZ / 05:1xZ local)

source semantic changes:        ~13.5 authoritative table writes/s reaching each owner
                                (per-owner token rotations 4,446 ≈ 13.5/s; 100% table-caused:
                                services 75.9k, partitions 61k, replica_operations 30.7k,
                                control_plane_publications 28k, nodes 21.6k, storage_reservations 9.2k,
                                node_endpoints 4.7k summed over 52 owners; non-semantic 0)
planning token rotations:       exact token: ~13.5/s per owner (by design, per write)
                                floored generation (250 ms latch key): 310 / 319 / 243 per run ≈ 0.7–1.0/s
rebuild starts:                 owner#1 2,179 (run 2) / 2,061 (run 3); duplicates #2–#52 ~1,131 each
rebuild completions:            == starts (no failures; 0.17–0.25 ms each; 0 token rotations during builds)
completed snapshots accepted:   all published CURRENT (publishStale 0 in every run)
completed snapshots rejected:   run 2: 29,729 reads rejected; run 3: 30,164 (owner#1)
reuses:                         run 2: 12,033 of 43,469 reads (28%); seed key 25%
                                run 3: 43,749 of 74,371 reads (59%); seed key 63%  (run-to-run variance)

rejection reasons (canReuseCompletedSnapshot, owner#1):
    token_rotated_after_current_build + floored_generation_advanced   29,700  (99.9%)
    live_veto_changed                                                     29
    saturated_generation / build_options_key_mismatch / no_completed        0 / 0 / 1,706 (first read of a variant)

rotation causes (floored generation, the currency the predicate actually uses):
    semantic (a covered table version changed):     319 / 319   (every key change)
    latch/time (>= 250 ms since last refresh):      306
    mixed-clock-only (<250 ms, backwards domain):    10  (3%)  — 35 backwards refreshes of 483; latch holds
    other:                                            0
rotation causes (exact token): 100% authoritative table mutations; 0 clock/latch; 0 owner-dependency
    replacement (1 per owner at boot); transport fingerprint 54 total.

FIRST LIVENESS BREAK:
    floored generation G_k rotates (any write to any of the 6 latch tables, ~1/s)
      -> every completed record of owner#1 (5 nodes x 6 buildOptions variants = ~30) is now
         stamped G_{k-1} and fails `matchesCompletedSourceGeneration`
      -> each is rebuilt only on demand (deferred read -> LIVE_VETO enqueue), one record per
         macrotask drain (drain gaps 1–100 ms typical; 0.25–5 s under event-loop gaps),
         so a hot seed variant is current for only part of the ~1.3 s window
         (rejected records aged 0.25–30 s; per-variant re-publish every 0.25–5 s;
          122–132 publishes per variant vs 243 rotations)
      -> the critical-topology settling gate's all-five-nodes conjunction at its 5 s pass
         almost never sees every node current -> node_ready_lease_incomplete (601x GCP / 175x local)
    The owner DOES make progress toward each generation; currency moves ~2x faster than
    per-variant completion and never pauses because writes never stop.

OWNER:
    ReadinessPlanningSnapshotOwner — its floored generation currency
    (readPlanningProjectionSourceGeneration -> the whole-table 6-table latch key) is a
    cluster-wide over-approximation of each node's semantic dependencies, and its
    completion breadth is one record per drain over node x variant.
    Multiplier (separate ownership defect): 52 planning owners in the seed process —
    unified-rebalancer-lifecycle-base.js:251 constructs a private ControlPlaneReadinessService
    per hosted partition because partition-service-rebalancer-methods.js:223 injects none;
    51 of them serve zero reads yet do 57.7k rebuilds and 52x the cache-change fan-out.

MECHANISM:
    P1 on the floored generation: publication is sound (every build CURRENT), the exact token
    is irrelevant under churn by design, and the floored currency — the only reuse path under
    churn — rotates cluster-wide for every write while the owner refreshes ~30 records serially.
    Publication (P2), live veto (P4) and write rate/mixed clock (P5) are excluded by measurement.

classification:
    P1  (floored-generation currency rotates faster than per-record completion; the
         over-broad scope of that currency is the semantic defect — P3's characterization —
         not the write rate and not the clocks)
```

## Liveness invariant as measured against the current design

- SAFETY holds: no stale record was ever reused (rejections are correct under the current currency).
- SUPERSESSION holds: no generation is minted without an authoritative cause (0 non-semantic rotations).
- LIVENESS fails under continuing churn: the deferral duty cycle per read is 37–74%, and the
  gate's conjunction turns that into an indefinite `node_ready_lease_incomplete`.

## Stop here (slice 1). Repair belongs to the planning generation owner, not callers or clocks.
