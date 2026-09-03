# A3 repair v2 — production-shaped effectiveness measurement (local docker formation, 2026-09-03)

Fixture: `LAGRANGE_LOOP_GAP_PROFILE=1 npm run demo:movielens` (local docker,
5 nodes, MovieLens) — the A-characterization fixture. Every run carries ONLY a
measurement wrapper (`projection_readiness_sync_read_build` sync section around
`buildNodeReadinessSyncCurrent`; reverted before the attempt was recorded),
no stack sampling. Same machine, same day, runs serialized under the thermal
gate.

- BEFORE: published `d072cece0`, 19:33–19:49Z (formation, schema admission,
  100k ratings loaded; failed at the ratings split/spread wait).
- v1 candidate (per-node stamps + whole-table publication version + planning
  segment): 19:50–19:54Z; failed at schema admission (`control_plane_pressure`).
  Details: `projection-readiness-per-node-generation-granularity.effectiveness-measurement.md`.
- v2 (this quest: fully content-covered key): 20:12–20:18Z. Formation and
  schema admission passed, ratings load admitted; failed during the load on
  a ratings-partition write (`Partition service not found`, p1) — the same
  downstream ratings-partition family BEFORE died in (BEFORE also logged 13
  transient participant failures), not a readiness signal.

## Seed (node-0), 60 s watchdog windows, first ~5.5 min of each run

| metric | BEFORE (6 windows) | v1 (5 windows) | v2 (6 windows) |
| --- | --- | --- | --- |
| sync reads | 85,163 (≈14.2k/min) | 35,182 | 69,960 (≈12.7k/min) — **caller count unchanged** |
| owner builds | 47,402 (≈7.9k/min) | 24,717 | **7,627 (≈1.4k/min, −84%)** |
| owner reuse | 4,475 (8.6%) | 4,201 (14.5%) | **33,469 (81.4%)** |
| builds / sync read | 0.56 | 0.70 | **0.11** |
| owner build CPU | 8,168 ms | 4,663 ms | **1,844 ms (−77%)** |
| unowned (fail-closed) builds | 0 | 0 | 0 |
| event-loop gaps | 43 / 92.1 s / max 7.7 s (first 5 min) | 50 / 108.5 s / max 5.8 s | 44 / 87.4 s / max 5.7 s (26.8% of wall) |

Joiners (whole run, v2): reuse 74% / 79% / 81% / 65% (BEFORE 34% / 21% / 49% / 48%),
builds per sync read 0.03–0.08 (BEFORE 0.21–0.38).

## Build attribution (v2, seed; per-cause sync sections)

| cause (first rotated key segment) | builds | share |
| --- | --- | --- |
| nodeEvidence (the node's own row/transport evidence — heartbeats) | 5,735 | 75.2% |
| priorityControlPlaneRecovery (verdict content) | 1,115 | 14.6% |
| runtimeAuthority (verdict content) | 321 | 4.2% |
| initial | 260 | 3.4% |
| membershipPublication (semantic content of the publication) | 144 | 1.9% |
| dimensions | 52 | 0.7% |
| cluster-wide version / planning segments | 0 | 0% (no longer exist) |

Sealed LIVE bar: seed owner reuse ≥ 50% with builds per sync read ≤ 0.35 in
the formation window — measured **81.4% and 0.11** (per window: 85–86% reuse
in the two formation windows, 0.12/0.11 builds per read).

## Reading

1. The strongest evidence the operator asked for holds: the caller count is
   unchanged (≈13–14k sync reads/min either way), the semantic outputs are the
   same owner-built cores, and the unaffected nodes stopped rebuilding — the
   owner was fixed, not the caller suppressed.
2. What remains is legitimate: three quarters of the residual builds are each
   node's OWN heartbeat/transport evidence changing (node-local by
   construction), the rest are real verdict changes; the membership
   publication now rotates the cluster 144 times in 5.5 minutes instead of
   ~19 times per second.
3. Event-loop starvation on the seed moved only modestly (largest gap 7.7 s →
   5.7 s; blocked share 38–40% → 27% of wall in comparable windows). The
   readiness-family normalize was one of several owners in the seed's
   blocked time; the remaining gap owners (raft follower commit apply slice
   ~25 s/window in the characterization run, candidate derivation, storage
   reservation reconcile) are outside this quest — this is the "profile
   again and take the new dominant owner" branch of the operator tree.
