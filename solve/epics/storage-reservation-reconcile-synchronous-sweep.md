---
id: storage-reservation-reconcile-synchronous-sweep
roadmapRow: null
status: active
graduatesTo: null
---

# storage_reservation_reconcile — synchronous sweep starvation owner

## Measured (instrumented GCP run, 2026-09-03, seed node-0)

The first per-call-site attribution of the seed's gap windows (sync-section
tags, run recorded in
solve/evidence/projection-readiness-evidence-amplification-v3.effectiveness-measurement.md)
ranks `storage_reservation_reconcile` as the LARGEST single tagged owner on
the seed during cold formation:

- 34 calls, **28.5s total**, ~838ms average, max **2141ms in one
  synchronous call** — individually macrotask-hostile (compare: the readiness
  normalize storm was 38,980 calls totalling 19.8s; this is 34 calls).
- Seed blocked 54.1s / 17.34% of wall in that run; this owner alone accounts
  for over half the tagged share.

## Why this is its own quest (not folded into readiness work)

The readiness-evidence quests (v3/v4) collapse per-evaluation normalize
amplification — many cheap calls. This owner is the opposite shape: few calls,
each an ~1-2s synchronous sweep. Different mechanism, different owner,
different fix class (likely slicing/queueing through the macrotask-bounded
heavy-work scheduler that the `readiness-freshness-macrotask-bound` coupled
pair already mandates for readiness heavy work — see
test/shards/impact-contracts.json).

## First implementation questions (unanswered — measure before repair)

1. What does one 800ms+ sweep actually DO (row count, SQL shape, allocation)?
   Profile one sweep's interior before proposing a fix.
2. Is the sweep already routed through `owner-key-reconcile-queue.js`
   (macrotask-heavy-work bound), and merely oversized per slice — or is it an
   unbounded inline loop that bypasses the scheduler?
3. Does sweep frequency (34 calls in the window) match its contract, or is it
   re-triggered redundantly during formation churn?

## Sequencing (user decision 2026-09-03)

Finish the v4 semantic-core/envelope repair and its GCP baseline re-profile
FIRST; take this owner next if it remains dominant in that clean profile —
its share may change once the readiness normalize storm stops competing for
the same windows. Do not raise gap budgets to accommodate it.
