# Phase 1 (Part 1 alone): authoritative raft_role voter count in the over-creation cap

Implements the SAFE half of the vetted phased plan
(`fix-design-planner-voter-read-and-drain.md` "Revised plan"): make the
control-plane over-creation cap count voters by the authoritative `raft_role`
the promotion guard enforces on, instead of the lagging `status===ACTIVE` read.
Ship ALONE, gate on live A/B, before considering the risky Phase-2 surplus drain.

## The change (two files, one behavior)

1. `src/rebalancer/in-flight-aware-replica-count.js` — the single-owner replica
   accounting now also returns `activeVoterCount`: live rows
   (`status ∉ {failed, removing, removed}`) whose `raft_role ∈ {leader, follower,
   candidate}` (learner excluded). This is a byte-for-byte mirror of the
   promotion guard's `isActiveVoterServiceRowForPromotion`
   (`partition-service-learner-promotion-methods.js:267-274`) /
   `ACTIVE_VOTER_ROLES` (`partition-service-shared.js:201-205`), so the two reads
   agree by construction. `activeCount` (status===ACTIVE) is left untouched — the
   deficit-side `deficitEffectiveCount` the mint-side quest (`c78833f0`) pins is
   unchanged, so its anti-regression tuples stay green.

2. `src/rebalancer/move-planner-move-calculation-methods.js:329-364` — the
   over-creation cap trigger is now
   `Math.max(activeCount, activeVoterCount) > targetReplicaCount`.
   **MAX, not replace**: strictly non-regressive — the cap never fires LESS than
   the status-only read did (covers the `status=ACTIVE, raft_role=null/unreported`
   edge), and fires MORE (earlier) exactly when raft_role reveals a promoted voter
   whose status still lags. The `DEFER_ADD_OVER_TARGET` log now carries
   `activeVoterCount` and `raftRoleAuthoritativeFire` (true when the raft_role
   count tripped the cap while the status count was still ≤ target) — the A/B
   discriminator.

## Why this attacks the root

Root (f83032da / b6181f69): critical CP partitions stack at 4 raft-voters vs
target 3. The promotion GUARD reads voters by `raft_role` → sees 4 → defers the
paired learner (4→5 > ceiling 4) → 60s timeout → ledger churn → provisioning
starves → `[2/4]`. The move-planner over-creation cap, the one guard that should
stop the group over-admitting, read voters by `status===ACTIVE` → saw only 3
during the promotion window (a just-promoted voter reads `raft_role=follower`
while `status=creating/syncing`) → stayed blind → kept minting the replacement
ADDs that pile the group past target. Part 1 closes that read disagreement at the
cap: it now sees the same 4 the guard does and stops the over-admission.

## Deterministic proof (complete)

- `dt:prove` **red-on-revert PROVEN** both files:
  - `test/rebalancer/move-planner-over-creation-cap.test.js` (new falsifier:
    promotion-window surplus — raft_role voter with lagging status — trips the cap
    that status-only counting misses).
  - `test/rebalancer/in-flight-aware-replica-count.test.js` (new unit tests:
    `activeVoterCount` reads raft_role not status; excludes learners / non-live /
    role-less rows; documents the MAX safety edge).
- Anti-regression GREEN: `in-flight-aware-drain-phase-replace-credit.test.js`
  10/10; `dt6-voter-surplus-promotion-drain-livelock.test.js` 34.
- Full rebalancer suite: **162/162 files pass**. Lint clean.

## A/B is the gate (this is a hot-path change — green DT ≠ live)

Prior ground truth (`33e0026d`, source-identical to parent `fed9a555`) already
showed `DEFER_ADD_OVER_TARGET=0` in all 3 runs — because it was measured by the
status read that is BLIND to the raft_role surplus. The A/B decides Phase 2:

| post-fix observation | verdict |
|---|---|
| `raftRoleAuthoritativeFire` fires (>0) AND voter-ready-60s timeouts → 0 AND demo converges | **Part 1 SUFFICIENT** — no Phase 2 |
| `raftRoleAuthoritativeFire` fires (>0) but timeouts persist | surplus arrives via an uncapped REPLACE → **Phase 2 required** |
| `raftRoleAuthoritativeFire` = 0 | the disagreement window never coincides with an ADD in the cap → Part 1 is a no-op for this demo → rethink |

Load-amplification (s9 `692c9dbb` precedent) is the specific regression to rule
out. Status: **deterministic proof done; live A/B pending** (this commit is a
proven checkpoint, NOT a SOLVED claim).
