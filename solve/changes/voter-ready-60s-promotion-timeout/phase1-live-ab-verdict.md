# Phase 1 (Part 1) live A/B verdict: safe improvement, necessary-not-sufficient — KEEP

Mandatory 2-pre/2-post live A/B for the hot-path over-creation-cap change
(`bf535665`). Ran 3 POST (HEAD, with fix) + 3 PRE (fix reverted to parent
`fed9a555` via `git checkout`, restored after). Affinity demo
(`examples/service-data-affinity/run-affinity-demo.js`, 5-node local, MovieLens-100k).

## Results

PRE1 was an INFRASTRUCTURE flake ("Timed out waiting for seed admin endpoint
after 60000ms" at [1/4] — never reached the root); discarded. Representative:

| observable | PRE (reverted) | POST (fix) |
|---|---|---|
| voter-ready-60s timeouts (TARGET) | 23, 16 | 0, 0, 13 |
| would_exceed_target guard defers | 461, 268 | 0, 3, 345 |
| self-move interlock rejections | 524, 342 | 82, 244, 128 |
| quorum_concentrated | 368, 174 | 781, 752, 88 |
| converged | 0/2 | 1/3 (POST2) |

Mechanism confirmed live: POST logs show the cap firing on `replica_operations-p1`
with `activeCount:3, activeVoterCount:4, raftRoleAuthoritativeFire:true,
deferredAdds:2` — the exact promotion-window catch the status-only cap missed
(POST1 13 authoritative fires, POST3 4).

## Verdict — KEEP (commit `bf535665` stands)

1. **Target symptom materially improved.** voter-ready-60s timeouts {23,16} →
   {0,0,13}; over-target guard defers {461,268} → {0,3,345}. Part 1 does exactly
   what it was designed to.
2. **No load-amplification regression** (the s9 `692c9dbb` failure mode the A/B
   existed to rule out): interlock churn is LOWER with the fix, not higher.
3. **Necessary-not-sufficient.** Does not reliably green the demo (1/3) because the
   durable surplus still forms via the UNCAPPED REPLACE path (POST3
   activeVoterCount=5, 345 defers, 13 timeouts). Matches the adversarial vet
   (attack 5) AND the industry direction-check
   (`industry-direction-check.md`): the surplus needs a COUPLED/atomic replace,
   not prevention-of-adds alone.
4. **Watch-item:** quorum_concentrated higher in 2/3 POST (Part 1 defers some
   spread ADDs) but did NOT correlate with failure (POST2 converged at 752) and is
   within demo variance. Phase 2's actual drain should relieve it.

## Why KEEP and not REVERT (contrast s9)
s9 `1ce80391`/`692c9dbb` was reverted because it REGRESSED live despite green DTs.
Part 1 does the opposite: green DTs AND a live improvement on the target symptom
with no churn regression. It is also industry-correct (authoritative membership
count = CRDB/TiKV/PD) and a necessary foundation for Phase 2 (the coupled drain
needs the authoritative count to know when to act).

## Next: Phase 2 direction (research-backed)
NOT a standalone drain REMOVE (vetted-dead: interlock + hasPendingMove; and no
mature system drains a surplus with an independent op). Instead COUPLE the
old-voter removal to the new-voter promotion — vet Alt-3 (re-drive the wedged
REPLACE's own remove-leg / promote-then-demote ordering), approximating joint
consensus within our liferaft add-then-remove constraint. Deepest fix =
joint-consensus/ConfChangeV2 atomic replace in the raft layer for critical
partitions (large, separate quest). See `industry-direction-check.md`.
