# Eval — FIX PATH E ("gate a fresh leader's first count-CHANGING move on SERVICES-replica-ROW view freshness via a raft index/term watermark")

Scope: evaluation only, no src changed. Companion to `research-selfmove-limit-cycle.md`
(the cycle), `eval-path-a-root.md` (driver = orphaned session, circular),
`eval-path-b-hysteresis.md` (leadership-gain cooldown, node-boundary-inert),
`eval-path-c-incumbent-hysteresis.md` (score term, count-invisible),
`eval-path-d-view-completeness.md` (authoritative OPS read = wrong table; explicitly
recommended E: "pin the replica ROWS, not the operations ledger"). All claims file:line-cited.

Path E: before a fresh leader of a control-plane priority partition emits its first
count-CHANGING move (ADD/REMOVE), require its **SERVICES-replica-ROW view** (the
`currentReplicas` source) to be fresh — at-or-past a raft index/term watermark reflecting
the prior epoch's committed REPLACE completion — so it does not mint a phantom count move
on a stale row view.

---

## HEADLINE VERDICT — GO-WITH-CAVEATS (confidence MEDIUM ~0.6)

**E is the first path aimed at the CORRECT axis** — the fresh leader's stale committed
replica ROWS (`activeCount` from `currentReplicas`, the input D proved dominant,
`in-flight-aware-replica-count.js:213,225-226`; `move-calc:333,360`) — **and it is NOT
killed by the B/C/D structural flaws** (wrong axis / node-boundary inertness /
circular-on-the-flapping-partition). The SERVICES table is a **different ownership domain
than the flapping `replica_operations-p1`** *and* is **not even a priority control-plane
partition** (`system-partition-classification.js:17-23,128-131` — `SERVICES` is absent
from `PRIORITY_CONTROL_PLANE_TABLE_IDS`), so reading its freshness is non-circular for the
driver and is **not** subject to the durability-demotion flap. That makes E's deferral
**bounded** (CDC catch-up), not the unbounded freeze that killed B/C/D.

**But E is NOT cheap reuse and it has a real residual flaw:**
1. **The watermark machinery does NOT exist.** No per-table applied raft index/term is
   tracked anywhere. The only cache "watermarks" are a schema/DDL version, a wall-clock
   `lastAppliedAtMs` (Date.now, not virtual-clock), and an opaque `causeId` — all consumed
   solely by `admin-preflight-snapshot.js` diagnostics, never by any planner. E must
   **build a raft-index-carrying CDC watermark end-to-end** (producer stamp + contiguous
   cache frontier + sync planner reader). HIGH effort.
2. **The target watermark ("fresh enough") requires an async authoritative SERVICES
   owner-read on `setLeader`**, not a cheap sync check — new leadership-gain plumbing.
3. **Residual deferral flaw (bounded, not fatal):** in the narrow early-formation window
   where SERVICES (a non-priority partition, which spreads *after* the priority ones) is
   itself unconverged, the target read can DEFER → E degrades to a Path-B-style wait.
   Strictly less severe than D's *always*-circular read of the flapping partition's own
   ledger.

Risk MED, effort HIGH. E does not remove the driver (Path A), but — unlike B — if it
reliably delivers a fresh row view it **breaks the re-plan→phantom-ADD edge**, so the
cycle can converge.

---

## 1. Does the services-row freshness machinery EXIST? — **NO. A raft-index watermark must be built end-to-end (decisive).**

Grepped `src/cache/`, `src/partition/`, `src/rebalancer/`. What exists on the
`systemTableCache` / CDC feed:

- **Schema/version watermark** — `appliedSchemaVersions` per table
  (`system-table-cache.js:103,128-152`). It is a **schema/DDL version**, kept monotonic,
  and is **only ever written from the message-group CDC handler** with a *timestamp* as
  the "version" (`message-group/cdc-handler.js:478-479`). It is **not written for the
  SERVICES table on the general CDC apply path** and is not a per-row raft index.
- **Wall-clock apply time** — `lastAppliedAtMsByTableName`, set to **`Date.now()`**
  (`system-table-cache.js:104,671,857`). Not virtual-clock-aware → a DT-fidelity hazard,
  and a wall-clock timestamp is not a committed-index proxy.
- **Cause correlation ID** — `lastAppliedCauseIdByTableName`, an opaque `causeId`
  (`:105,858`).

**Consumers:** the getters `getAppliedSchemaVersion` / `getLastAppliedAtMs` /
`getLastAppliedCauseId` are read **only** by `admin/admin-preflight-snapshot.js:509-532`
(diagnostics/preflight). **No planner, no rebalancer, no move-calc path reads any of
them.**

**The CDC apply carries no raft index.** `applySystemTableChange(tableName, op, data,
{causeId})` (`system-table-cache.js:691`) takes only a `causeId` in options — never the
source partition's commit index/term. The rebalancer's own local-progress apply likewise
passes only `{causeId}` (`replica-operation-repository-row-methods.js:224-230`), as does
the MG handler (`cdc-handler.js:466-467`). And the cache merge orders by **HLC/updatedAt
timestamps + DELETE tombstones** (`system-table-cache-row-merge.js:3,47-68`;
`system-table-cache.js:99-102,708-719`), explicitly to tolerate **out-of-order** CDC
delivery — which means a naive "max applied index" would advance past gaps and would NOT
prove all rows ≤X are applied. A correct freshness gate needs a **contiguous** applied
frontier, i.e. more plumbing than a single max-index field.

**Verdict:** the machinery E needs does **not** exist. E must build: (a) the SERVICES CDC
**producer** stamps each row change with services-p1's raft commit index/term; (b) the
cache records a **contiguous** per-table applied-index frontier (not just max, given §
out-of-order delivery); (c) a **synchronous reader** the planner can call. This is new
cross-layer plumbing, not a flag flip. HIGH effort.

## 2. How does the fresh leader learn the TARGET watermark? — **async authoritative SERVICES owner-read; available but not free, and can lag in formation.**

The fresh leader of `replica_operations-p1` needs "the SERVICES index that includes the
prior epoch's completed REPLACE (the new voter row)." There is **no cross-partition
commit-index accessor** today: `getLastDeclaredCommitIndex` / `getCommitIndex`
(`raft/sqlite-log-adapter.js:304,838`; used at `partition-service-durability-fitness.js:248`)
report the **local** partition's own raft log only — useless for a *different* partition's
index.

The authoritative SERVICES read path **does** exist: `servicesOwner.listServices(...)`
(async RPC, `control-plane/control-plane-readiness-node-service-rows.js:55-88`). But it
returns **rows, not a commit index**, so E would additionally have to surface services-p1's
commit index/term through that owner surface. It is an **async round-trip**, and during
cold formation SERVICES — a **non-priority** partition (`system-partition-classification.js:17-23`),
which spreads *after* the priority partitions — may still be electing/spreading, so the
read can **DEFER**. Expensive: one owner RPC per leadership gain on the hottest path.

## 3. CRITICAL CIRCULARITY CHECK — **the DRIVING flap IS fixable by E; SERVICES is a non-circular, non-flapping target.**

- **(a) services-p1 unavailable mid-formation → degenerate to Path B?** Possible but
  **bounded**. SERVICES is a different partition than `replica_operations-p1` and is
  **not** a priority control-plane partition (`system-partition-classification.js:17-23,128-131`),
  so it does **not** ride the `self_move_in_flight`/`quorum_concentrated` interlock
  (`rebalance-coordinator-ledger-interlock-admission.js:195-222,315-338`) and is **not** in
  the durability-demotion flap that drives the cycle (research §3). Its rows advance via
  ordinary CDC. The only window where its owner-read defers is the **narrow early-formation
  span** where SERVICES itself has not yet spread. This is a *bounded* deferral (releases as
  soon as SERVICES converges and CDC delivers), **not** D's *permanent* circularity (D read
  `replica_operations-p1`'s own ledger mid-election — circular in exactly the failure window).
- **(b) Does SERVICES's own planner have the same bug (self-referential read)?** The SERVICES
  partition reads ITS replica rows from the SERVICES table = self-referential, so a
  freshness gate on the SERVICES partition itself would be circular there. **But the DRIVING
  flap is `replica_operations-p1`, not SERVICES** (research §1,§3: `replica_operations-p1`
  holds the interlock; SERVICES is not observed flapping and is non-priority). E is applied
  to `replica_operations-p1`'s planner, whose replica ROWS live in the **SERVICES** table —
  a *different* partition — so the read is **non-circular for the driver**. E does not need
  to fix SERVICES's own planner to unblock the demo.

**Verdict: the partition that actually stalls the cluster (`replica_operations-p1`) IS
addressable by E without circularity.** This is the decisive structural improvement over D.

## 4. Does "wait for freshness" degenerate into Path B? — **Bounded, not the B/C/D freeze — with one caveat.**

Because the completion the gate waits for (the prior REPLACE's new voter row) **is being
produced** and flows via normal CDC from a non-flapping producer, the local SERVICES cache
**does** catch up — bounded by CDC propagation latency (sub-second to seconds), not by an
election on the flapping partition. So the gate **releases** and legit spread proceeds.
That is the mechanism B/C/D lacked (they waited on the flapping partition / a wall-clock
timer / a scorer, none of which was guaranteed to release).

Caveat (the residual flaw): the *target-index acquisition* (§2) is the async part that can
lag. If E cannot obtain the target index it must either **block** (freeze/Path-B in the
early window) or **proceed** on stale rows (miscount, no fix). The honest design must (i)
bound the block to the SERVICES-converged window and (ii) fall back to today's behavior
(emit the move) once a max wait elapses, accepting a rare residual phantom rather than an
unbounded stall. Unbounded stall risk exists **only** if SERVICES itself is permanently
wedged — not the observed failure.

## 5. Sync-planner injection — **NOT a pure cheap sync check; needs an async pre-load on `setLeader`.**

`calculateMoves` is synchronous (`unified-rebalancer-rebalance-loop.js:161`, no `await`;
`computeInFlightAwareReplicaAccounting` runs sync over the cache, `move-calc:312-316`).
There IS a sync-freshness-read precedent already wired into this exact loop:
`resolvePublishedMembershipPlanningEpoch()` → `getCurrentPublishedMembershipEpochSync(...)`
(`unified-rebalancer-rebalance-loop.js:159-160,300-313`) — but it is a **membership** epoch,
not a replica-row watermark, and it only *stamps* moves (`:265-276`), it does not gate the
count decision.

So E is **(b) an async pre-load**, not **(a) a cheap sync check against an already-cached
watermark** — because neither the local services applied-index (§1) nor the target index
(§2) exists to check. Minimal viable shape:
- **Pre-load site:** `unified-rebalancer-lifecycle-base.js:475-483`, the
  `isLeader && !wasLeader && isControlPlanePriorityPartition()` branch, **before**
  `enqueueRebalanceCheck(...)@:481`. Kick an **async** authoritative SERVICES read → stash
  `targetServicesFrontier`. Must not block the event loop (fire-and-store; the gate
  consults the stashed value).
- **Gate site (sync):** in `calculateMoves` (`move-calc:272-361`), suppress the standalone
  count-CHANGING `addMoves`/`candidateRemoves` while
  `localServicesAppliedFrontier < targetServicesFrontier` **and** this is the fresh-leader
  window **and** `isControlPlanePriorityPartition()`. Count-neutral REPLACE spread is
  untouched. This sits alongside the existing over-creation cap (`move-calc:329-347`) as a
  sibling guard on the same count path.

Net: new **async** leadership-gain plumbing + new **sync** cache-frontier reader + the §1
watermark build. Not reuse-in-place.

## 6. Does it stall the legitimate first spread? — **Scoping is achievable (better than B/C/D), if the gate keys on a real target frontier.**

The freeze class is avoidable here because the gate can be scoped to fire **only** on
(fresh-leader window) ∧ (count-CHANGING move) ∧ (priority partition) ∧
(localFrontier < targetFrontier):
- The **first** formation plan off the seed has **no prior epoch**, so `targetFrontier`
  is the seed's own frontier → `local >= target` immediately → the first REPLACE spread is
  **not** gated. Good.
- The gate bites only on a fresh leader **after** a prior epoch dispatched REPLACEs and the
  local row view has not yet reflected them — **exactly** the phantom window.
- Count-neutral REPLACE spread and, once fresh, a genuine deficit ADD both pass.

Failure mode to avoid: setting `targetFrontier` to include *in-flight-but-uncommitted*
work would over-gate and freeze a genuine deficit. The target must be the **committed**
services index, and the gate must **release the moment the local frontier catches up**,
never on a blanket hold. With that discipline the freeze risk is **LOWER** than B/C/D
because the release condition is a concrete data event, not a timer or a score.

## 7. Simpler equivalent (reuse shipped machinery)? — **NO for the row view; the reusable helpers gate the wrong table.**

- `priority-budget-helper.js` `getIncompleteOperationObservation` /
  `shouldBlockOperationAdmissionOnIncompleteOperationObservation` /
  `resolveAuthoritativeAddAdmission` (`:397-431,414-419,526-540,604`) gate **OPERATION
  (ledger) observation**, not SERVICES-ROW freshness — the *same wrong-table* class D fell
  into. They cannot express "my replica rows reflect the prior REPLACE."
- The `getCurrentPublishedMembershipEpochSync` pattern (§5) is the right *shape* (a sync
  freshness read already in the loop) but the wrong *signal* (membership view, not replica
  rows). Extending it to a services-row watermark is exactly the §1 build — new plumbing,
  not reuse.

**A genuinely simpler, correct alternative exists but is NOT Path E:** the fresh leader
already OWNS the authoritative `replica_operations-p1` ledger and can see which prior
REPLACEs **completed**; crediting those completions against the deficit (extending
`drainPhaseReplacementCredit` to key on **ledger-completed** REPLACEs rather than on the
services-row having materialized, `in-flight-aware-replica-count.js:160-211`) would correct
`activeCount` **without any cross-partition read or new watermark**. That is a
row-op-linked count-path credit, not a "count heuristic," but it brushes the memory
directive "Do NOT re-chase with a count heuristic" and is a **different path** — flag it as
Path F, do not conflate with E.

## 8. Interactions, risk, effort, DT

- **c78833f0 / c7a3bf19 / over-creation cap (`move-calc:329-347`) / REPLACE serialization
  (`:507-582`) / deficit reconcile (`:625-646`)** all key on `activeCount` from
  `currentReplicas` (SERVICES rows). E gates **WHEN** those rows are read to guarantee
  freshness — **complementary**, the missing "read fresh rows" precondition for the
  accounting they already do. No correctness conflict.
- **run-20/22 self-move serialization + interlock admission** — untouched (E is on the
  planner count path, not admission). Structurally intact.
- **c7a3bf19 ghost re-verify** — the precedent D invoked; it cache-bypass-reads the
  interlock's self-move **blocker state**, a different read than a services-row frontier. E
  neither reuses nor conflicts with it.
- **Priority-recovery** — E must scope to the fresh-leader count-CHANGING window so it does
  not blunt genuine priority recovery (§6).
- **Risk: MED** — new raft-index CDC watermark across producer + cache + planner (contiguity
  correctness under out-of-order delivery, §1); async pre-load on `setLeader`; DT-fidelity
  trap if `lastAppliedAtMs` wall-clock is reused (use the raft index, not Date.now).
- **Effort: HIGH** — end-to-end watermark build + async leadership-gain plumbing +
  multi-node DT.

**Multi-node DT + binding observable.** Multi-node mandatory (single-instance shares one
cache and false-passes — `eval-path-b §5`). Compose
`dt6-rebalancer-formation-self-move-interlock.test.js` (real coordinator + interlock +
`setLeader` re-plan) + `dt6-ledger-leader-durability-fitness.test.js` (demotion) +
`dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js`; virtual clock
past the 60s legal hold + 3× 1s strikes; seeded RNG for the leadership-start jitter.
Binding observable pair E MUST move: (i) a fresh leader whose local SERVICES frontier is
**behind** the committed prior-epoch REPLACE does **NOT** emit a phantom count-changing
ADD/REMOVE; (ii) once its SERVICES frontier catches up (CDC delivered), a **genuine**
deficit STILL spreads — converging in a single epoch. Unlike B/C/D, this pair is
**satisfiable**: (i) and (ii) are separated by a concrete, reachable data event (local
frontier ≥ target), not a timer/score/flapping-partition read.

---

## Ratings

| Axis | Rating |
| --- | --- |
| Correct axis (services replica ROWS)? | **YES** (§1,§3 — the input D proved dominant) |
| Watermark machinery exists? | **NO — build raft-index CDC watermark end-to-end** (§1, decisive) |
| Driving flap (`replica_operations-p1`) fixable by E? | **YES, non-circular** (§3 — SERVICES is a different, non-priority, non-flapping partition) |
| Degenerates to Path-B deferral? | **Bounded only** (§4 — releases via CDC catch-up; unbounded only if SERVICES itself wedges) |
| Minimal viable site | pre-load `unified-rebalancer-lifecycle-base.js:475-483` (async) + gate in `calculateMoves`/`move-calc:272-361` (sync) |
| Async required? | **YES** — async authoritative SERVICES owner-read on `setLeader` (§2,§5) |
| Freeze risk | **LOW** (§6 — release keyed on a data event, scoped to fresh-leader count-CHANGING window) |
| Risk / Effort | **MED / HIGH** (§8) |

## VERDICT: **GO-WITH-CAVEATS** (confidence MEDIUM ~0.6)

E is the first path on the **correct axis** and the first **not** killed by a structural
flaw: it targets the stale committed replica ROWS (`currentReplicas`/`activeCount`) that D
proved dominant, and it reads freshness of the **SERVICES** table — a different ownership
domain, a **non-priority** partition (`system-partition-classification.js:17-23`), and
**not** the flapping partition — so it is **non-circular for the driving
`replica_operations-p1` flap** and its deferral is **bounded** by CDC catch-up rather than
the unbounded freeze that killed B/C/D.

**What remains before GO becomes unconditional:**
1. **Build the machinery — it does not exist.** No per-table raft index/term watermark is
   tracked or exposed to the planner (only schema-version/wall-clock/causeId, consumed by
   admin diagnostics). Requires: SERVICES CDC producer stamps commit index/term; cache
   tracks a **contiguous** applied frontier (not just max, given out-of-order delivery); a
   sync planner reader.
2. **Async target-index acquisition** on `setLeader` (authoritative SERVICES owner-read,
   surfacing services-p1's commit index), with a bounded fallback to today's behavior so
   the early-formation SERVICES-unconverged window degrades gracefully rather than
   freezing.
3. **Multi-node DT** proving the satisfiable (i)/(ii) observable pair.

If the effort of (1) is judged too high, the cheaper correct alternative is **Path F**
(credit the fresh leader's OWN authoritative ledger-completed REPLACEs against the deficit,
extending `drainPhaseReplacementCredit` — no cross-partition read, no new watermark), which
should be evaluated head-to-head with E before committing to the watermark build.
