# A3 repair v1 — production-shaped effectiveness measurement (local docker formation, 2026-09-03)

Fixture: `LAGRANGE_LOOP_GAP_PROFILE=1 npm run demo:movielens` (local docker,
5 nodes, MovieLens), the same A-characterization fixture. Both runs carry ONLY
a measurement wrapper (`projection_readiness_sync_read_build` sync section
around `buildNodeReadinessSyncCurrent`, no stack sampling); the earlier
characterization run's stack sampler inflated its CPU/gap numbers, so BEFORE
was re-run clean on this machine.

- BEFORE: published `d072cece0` tree, 19:33–19:49Z. Formation completed,
  schema admitted, 100k ratings loaded; failed later at the known ratings
  split/spread phase.
- AFTER (v1 candidate = per-node content stamps + GLOBAL whole-table
  publication version + retained planning segment): 19:50–19:54Z. Formation
  completed; failed at schema admission (`control_plane_pressure`, the known
  family), so the run is shorter (5 windows vs 16).

## Seed (node-0), 60 s watchdog windows

| metric | BEFORE first 5 windows (formation+admission+load start) | AFTER 5 windows (formation+admission) |
| --- | --- | --- |
| sync reads | 69,589 | 35,182 |
| owner builds | 38,143 | 24,717 |
| owner reuse | 3,677 (8.8%) | 4,201 (14.5%) |
| builds / sync read | 0.55 | 0.70 |
| owner build CPU | 6,728 ms | 4,663 ms |
| volatile skips | 150 | 80 |
| event-loop gaps (first ~5 min) | 43 / 92.1 s / max 7.7 s | 50 / 108.5 s / max 5.8 s (40% of wall) |
| whole-run (BEFORE 16 windows) | 239,993 reads / 136,333 builds / 13,206 reuse (8.8%) / 21.8 s build CPU / 61 gaps 116 s | — |

Joiners (whole run): BEFORE reuse 21–49%, AFTER 29–65% (node-2/node-4 also
show 704/864 `unowned_build_global_revision_unavailable` — see finding 3).

## Build attribution (AFTER, seed; per-cause sync sections landed in v1)

| cause (first rotated key segment) | builds | share |
| --- | --- | --- |
| global (CONTROL_PLANE_PUBLICATIONS whole-table version) | 12,376 | 50.1% |
| planning (retained planning derivation version key) | 10,659 | 43.1% |
| priorityControlPlaneRecovery (verdict content) | 784 | 3.2% |
| runtimeAuthority (verdict content) | 547 | 2.2% |
| initial | 260 | 1.1% |
| nodeEvidence (node-scoped stamp) | 89 | 0.4% |
| dimensions | 2 | 0.0% |

## Verdict

1. The mechanism engages exactly as the receipts say: node-local rotation is
   gone (node-scoped + verdict causes ≈ 6% of builds). But 93% of the
   remaining builds come from the two RETAINED cluster-wide segments, which
   still rotate every node ~14–19 times per second each, so production reuse
   moved only 8.8% → 14.5%. As sealed, v1 is semantically correct but nearly
   inert in production — the exact class the ENGAGEMENT rule exists to catch.
2. `global`: the CONTROL_PLANE_PUBLICATIONS table version rotates ~19/s on the
   seed — far more often than the membership publication's SEMANTIC content
   changes (acks/epoch/status). The diagnostics object is ~6 KB / depth 5 with
   only `createdAt`/`updatedAt` as time-like fields (observedAt-derived in
   production, since production rows carry neither) and costs ~22 µs to digest
   — and on the sync path it is already memoized per version, so a digest
   cached per frozen diagnostics object is computed once per version change.
   ⇒ membershipPublication can be CONTENT-covered; no table version needed.
3. `planning`: rotates ~14/s per node on the seed although its latch bounds it
   to 4/s. Cause: `readMembershipPlanningDerivationVersionKey(cache, nowMs)`
   is fed ISO `observedAt` strings by the readiness service (→ `Date.now()`)
   and NUMERIC `observedAt` values captured at pass start by the rebalancer
   (`unified-rebalancer-priority-readiness.js:472,379`); a refresh with an
   older `now` moves `refreshedAtMs` backwards and the latch flaps. Every
   consumer of that key (planning-snapshot memo, candidate-derivation memo,
   placement-observation memo, and this readiness key) misses at that rate —
   a separate owner (the planning latch, explicit non-scope here). For the
   readiness key the segment is PROVABLY REDUNDANT: the planning snapshot
   reaches the core only through digested verdicts (runtimeAuthority.
   recoveryEligible/visibility, priorityControlPlaneRecovery, dimensions,
   runtimeServeEligible), so a planning tick that changes no verdict cannot
   change any core.
4. Joiner fail-closed engagement: during join, node-2/node-4's cache exposed
   no version surface, so v1's fail-closed path built 704/864 cores unowned.
   In v3/v4 the same window memoized on a constant token with
   membershipPublication UNCOVERED (latent under-invalidation on joiners);
   content coverage needs no version surface at all.

Consequence: v1 is parked EXHAUSTED on this measurement (sealed mechanism for
the global segment falsified as insufficient); successor v2 seals a fully
content-covered key (membershipPublication digested with a per-frozen-object
digest cache; no cluster-wide version segment; planning segment removed with a
redundancy receipt) and re-measures on this fixture.
