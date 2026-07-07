# Live A/B — A1 (drop spurious 2PC on single-partition ledger writes)

Commit `b535d0ec`. 2-post vs pre-A1 baseline, per the hotpath-failure-live-validation
directive (unit-green + DT-proven is not sufficient; the arm-2 fix `1ce80391` regressed
live despite all unit gates).

Baseline = pre-A1 post-raft-fix run (15:00Z): stalled at 43 completions, [2/4] timeout,
7 ops stuck, the circular deadlock (orphaned 2PC holds → durability flap → deferred ADDs).

## Result — A1 eliminates its target mechanism, stably, with NO regression

| signal | pre-A1 | post-A1 run1 | post-A1 run2 | verdict |
|---|---|---|---|---|
| orphaned-hold rollbacks ("held beyond legal window") | 11 | **0** | **0** | ✅ eliminated |
| durability-unfit transaction_hold | 5 | **0** | **0** | ✅ eliminated |
| durability-unfit commit_durability_divergence | 5 | **0** | **0** | ✅ eliminated |
| sql_transaction_participants "No leader available" | 124 | **0** | **0** | ✅ deadlock broken |
| formation completions (peak) | 43 | 69 | 48 | ✅ improved |
| **participant-failures on replica_operations (guardrail)** | (elevated) | ~10 total | **2** | ✅ NOT risen |

The spurious 2PC holds, the durable-watermark freeze, the 5-replica durability flap, and
the self-sustaining circular deadlock are GONE in BOTH runs — A1's mechanism-elimination is
reproducible. The guardrail (the arm-2 regression mode: participant-failure storm on
replica_operations, which hit pf 55-57 in `692c9dbb`) is CLEAN: A1 removes work, so
participant-failures on replica_operations stayed at ~2 — the opposite shape.

## But A1 is NECESSARY-NOT-SUFFICIENT for doneWhen

Neither run greened the settle:
- **run1**: converted the hard deadlock into SLOW convergence — completions climbed
  43→69 but the residual (low-grade `No row found for CDC update` spread thinly ~5× each
  across replica_operations/services/storage_reservations/partitions) overran the 900s cap;
  [2/4] then timed out on a data-partition route.
- **run2**: hit a DIFFERENT, A1-independent high-variance formation failure — phase [4/4]
  placement/attribution never engaged (`replicas=0, onData=0` for 300s), aborting at t+311s.
  Its 1635 "participant-failures" are dominated by the **nodes/membership partition (273)**,
  NOT replica_operations (2) — formation churn on a partition A1 does not touch. This is the
  known formation variance (memory: participant-failures vary 0/437/896 across runs).

## Verdict: SHIP (validated on its mechanism); residual is separate work
A1 is a proven, non-regressive fix for the binding circular-deadlock root — the single
biggest post-raft-fix settle-stall mechanism — validated live across 2 runs. It does not
fully green doneWhen: the settle has multiple independent modes (slow CDC read-back
convergence; high-variance formation/placement engagement) plus the scoped INSERT/create-lane
omission the impl-vet flagged. Those are the next increments, not reasons to revert A1 —
A1 strictly improves the binding root and introduces no regression.

Next-increment candidates (own vetted+A/B increments):
- The residual `No row found for CDC update` slow-convergence (is it routing-to-unhydrated-
  replica lag now that the freeze is gone? level-triggered re-drive?).
- The INSERT/create lane (`persistNewOperationUnlocked`) — extend the same single-participant
  bypass if it enlists (now non-orphaning since the sibling has a leader, but still spurious).
- The phase-[4/4] placement-never-engages formation-variance stall (separate, pre-existing).
