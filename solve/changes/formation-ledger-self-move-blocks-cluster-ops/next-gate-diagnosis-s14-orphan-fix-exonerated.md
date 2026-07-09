# [2/4] admin-timeout diagnosis — orphan-census fix EXONERATED; root is pre-existing REPLACE over-creation

Diagnosis of the layered next gate after the settle-deadlock fix (`1ff668b8`). Two
adversarial-verifier passes; both conclusions source- and log-grounded on the
post-fix run `data/examples/service-data-affinity-demo/node-0.log`.

## The gate (mechanism, verified)

`[2/4]` aborts with `Timed out waiting for admin response`. Chain:

1. `[2/4]` runs `loadRatingsIntoLagrange` → `CREATE_RATINGS_SQL`
   (`examples/movielens-access-affinity/lagrange-loader.js:31`, **no retry**;
   INSERT batches retry 4× but zero INSERTs ever issue).
2. The loader uses its OWN admin client (`lagrange-loader.js:23`, no `timeoutMs`
   → **30s** default). **NOT** the demo's 15s main client — the handoff/memory
   "timeoutMs:15000" is mis-attributed for this path.
3. The ratings CREATE goes through initial-partition-provisioning, which calls
   `waitOutWholeClusterTransientProvisioningHold` synchronously on the request
   thread (`src/query/sql-query-engine-initial-partition-provisioning.js:158`),
   able to block up to a 90s ceiling (3 × 30s, `query-constants.js:427,434`).
4. The block never clears within the client's 30s → CREATE throws → abort.

## Root: over-target voter surplus on `replica_operations-p1`, REPLACE-minted

Not "quorum concentrated on one node." The concentration snapshot during the CREATE:

| time | totalVoters | maxVotersOnOneNode | overTarget | feasibleTarget |
|---|---|---|---|---|
| pre-settle | 2 | 2 | false | present |
| 11:14:56 | **4** | **2** | **true** | present |
| 11:14:59 | **4** | **2** | **true** | **null** |

`maxVotersOnOneNode` never exceeds 2 → voters are spread 2/1/1. The ledger is
flagged concentrated purely because `overTarget = totalVoters(4) > target(3)`
(`operation-ledger-quorum-concentration.js:147`; `totalVoters` = raft voter rows,
`:125`). The surplus never drains (0 REMOVE), so dependent provisioning (the
ratings ADD) is deferred until the client deadline. This is the s13/s14
uncapped-REPLACE over-creation / no-drain root — the deferred "Phase 2
coupled-removal" work.

## Causality: the orphan-census fix `1ff668b8` did NOT cause the 4th voter

Verified INDEPENDENT (adversarial pass, agent a6a253df):

- **Fix touches ADD only.** Its sole behavioral delta is the
  `TARGET_REPLICA_COUNT_SATISFIED` count comparison
  (`rebalance-coordinator-topology-guard-methods.js:304`), gated to
  `TOPOLOGY_GUARD_TARGET_COUNT_OPERATION_TYPES = {ADD}` (`:29-31,97-101`). REPLACE
  is not in the set.
- **Surplus is REPLACE-minted with zero ADDs.** In the post-fix run, exactly ONE
  operation was created on `replica_operations-p1` — a **REPLACE** (opId
  `3d045c78`, 11:13:41). **Zero ADD creates.** Voters climbed 2→4 (11:13:56→
  11:14:26) purely via the REPLACE add-leg stacking during drain (undrained
  source r1 on coordinator + new target = `maxVotersOnOneNode:2`). The
  over-creation cap zeroes only `addMoves`, never `replaceMoves`
  (`move-planner-move-calculation-methods.js:357`).
- **`TARGET_REPLICA_COUNT_ALREADY_SATISFIED` blocks = 0** across the whole log —
  the fix-modified path produced no admission/block event here at all.
- **Surplus predates the fix** (memory only, not in these logs): s13 `b6181f69`
  documented this partition at `activeVoterCount=4 vs target=3`.

The fix broke the stuck-at-2 deadlock at [1/4] formation (ADD-gated, its job) and
**unmasked** the pre-existing stuck-at-4 REPLACE surplus at [2/4]. Layered-gate
structure, not a regression.

## Corrections folded in from verification

- The `"Deferring spread-driven count-increasing ADD…"` message (111×) is the
  **REPLACE-serialization cap** (`move-planner-move-calculation-methods.js:586-608`,
  payload `replaceSerializationCap:true`), NOT the Part-1 raft_role over-target cap
  (which emits `overCreationCap:true`/`raftRoleAuthoritativeFire` and fired **0×**
  this run). Conclusion (ADDs deferred, not surplus source) unaffected.
- **Latent watch-item (did NOT fire here):** the orphan-census over-drop is a
  theoretical route to a transient 4th voter IF a dropped orphan concurrently
  recovers to voter AFTER a fix-admitted spread ADD lands. Requires an admitted
  ADD; zero ADDs admitted this run, so it did not materialize. Keep on watch for
  runs where `TARGET_REPLICA_COUNT_ALREADY_SATISFIED` blocks drop >0 AND an ADD
  admits.

## Fix implications

- Raising the loader client deadline (Option B) or making CREATE retryable
  (Option A) are **palliative** — the concentration is wedged on an over-target
  surplus that needs a DRAIN, not a spread or more waiting. Both would fail-fast
  at the re-wait ceiling anyway.
- Real fix = the over-target **coupled-removal / REPLACE drain-leg** (s13/s14
  Alt-3 / Phase 2). Separate larger quest; scope next.
