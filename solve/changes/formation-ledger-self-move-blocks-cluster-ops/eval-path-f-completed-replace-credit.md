# Eval — FIX PATH F ("credit the fresh leader's OWN recently-COMPLETED REPLACEs against the deficit — extend `drainPhaseReplacementCredit` off the local ledger, no cross-partition watermark")

Scope: evaluation only, no src changed. Companion to `research-selfmove-limit-cycle.md`,
`eval-path-a-root.md`, `eval-path-b-hysteresis.md`, `eval-path-c-incumbent-hysteresis.md`,
`eval-path-d-view-completeness.md` (authoritative OPS read = wrong table, circular),
`eval-path-e-services-freshness.md` (services-ROW watermark; GO-WITH-CAVEATS, HIGH effort;
it named F as the cheaper alternative to weigh head-to-head). All claims file:line-cited.

Path F: instead of E's services-cache raft watermark, extend
`computeInFlightAwareReplicaAccounting`'s `drainPhaseReplacementCredit`
(`in-flight-aware-replica-count.js:160-226`) so the fresh leader ALSO credits the
replacements of RECENTLY-COMPLETED REPLACEs it can see in its OWN `replica_operations`
ledger but which have not yet appeared as ACTIVE rows in the stale SERVICES cache. Premise:
the fresh leader IS the new leader of `replica_operations-p1`, so its committed raft
log/ledger rows for that partition are LOCAL and lag-free (no cross-partition read, no CDC
lag, no watermark), whereas the SERVICES replica rows lag.

---

## HEADLINE VERDICT — NO-GO (confidence HIGH)

**F's lag-free-local-ledger premise is FALSE at the layer that matters, and it is a DUAL
kill.** The planner never reads the local committed ledger. Its ONLY in-flight-ops source
is `getEntityTopologyBlockingInFlightOperations()` → `getTopologyBlockingInFlightOperations()`
→ `getInFlightOperations()` → `systemTableCache.filter(REPLICA_OPERATIONS, …)`
(`unified-rebalancer-replica-state.js:544-554, 632-635`) — the **same CDC-fed cache that
lags**, exactly the source D was killed for reading. There is **no** local, synchronous,
lag-free completed-ops accessor wired into the sync planner: `getCommitIndex` /
`getLastDeclaredCommitIndex` (`raft/sqlite-log-adapter.js:304,838`) are async and return a
raft **index**, not operation rows. So on the source axis **F == D**.

On top of that, F's target op is **filtered out of the set F would extend, twice over:**
1. **Completed == terminal == excluded.** `isTrackedInFlightOperation` drops any op with
   `terminal === true` (`unified-rebalancer-replica-state.js:320-322`), and
   `isReplicaOperationInFlight` drops terminal-success / observed-completed ops
   (`replica-operation-liveness.js:527-528,538`). A genuinely **COMPLETED** REPLACE — the
   literal thing F wants to credit — is therefore **never in `inFlightOperations`**. F
   iterating that set (`in-flight-aware-replica-count.js:175`) has nothing to credit →
   **INERT**.
2. **Drain-phase (ACTIVE/STOPPING) REPLACEs are ALSO excluded** by
   `isTopologyBlockingInFlightOperation = !isReplaceRemoveDispatchPhaseOperation`
   (`:622-623`, `:604-615`). So even the *non-terminal* drain-phase REPLACE F might
   reinterpret toward is filtered out of the accounting input.

The only op that survives into the credit set is a REPLACE still in a topology-blocking
(pre-remove-dispatch) step whose replacement is a **materialized non-active learner row** —
which is **precisely what c78833f0 already credits** (`:190-211`, keyed on
`nonActiveOccupiedByNode`). F's premise is the case where that row is **absent** from the
stale cache. To credit it, F must drop the materialized-row binding and credit off the op's
`target_node_id` alone — **re-entering the exact count-heuristic class c78833f0's own commit
message says "is why it bounds where 3 prior count-based approximations were refuted."**

Net: F is either **INERT** (completed ops filtered out; local ledger not on the planner
path) or, if forced to fire, a **refuted node-based count heuristic** — and it touches only
`deficitEffectiveCount`, the **ADD/deficit leg**, never the phantom REMOVE. Risk MED
(masks genuine deficits), effort MED-HIGH once the missing lag-free source + caller re-wire
are counted — **not the LOW-effort pure-function extension the premise assumes.**

---

## 1. Is the premise TRUE — lag-free local visibility of the fresh leader's OWN completed REPLACEs? → **FALSE (decisive; dual kill).**

Trace the exact bytes that feed the planner's in-flight ops:

- `computeInFlightAwareReplicaAccounting({… inFlightOperations: this.getEntityTopologyBlockingInFlightOperations()})`
  (`move-planner-move-calculation-methods.js:312-316`).
- `getEntityTopologyBlockingInFlightOperations()` prefers
  `moveStateProvider.getTopologyBlockingInFlightOperations()`
  (`move-planner-state-methods.js:228-242`).
- `getTopologyBlockingInFlightOperations()` = `getInFlightOperations().filter(isTopologyBlockingInFlightOperation)`
  (`unified-rebalancer-replica-state.js:632-635`).
- `getInFlightOperations()` = `systemTableCache.filter(REPLICA_OPERATIONS, op => isTrackedInFlightOperation(op) && isOperationForEntity(op))`
  (`:544-554`), tagged `@readModel … READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE` (`:540-541`).

So the source is the **CDC-materialized `systemTableCache`** — the lagging view. **This is
the same source D read** (eval-D §1: "both halves lag from the SAME cache on a fresh
leader"). F does NOT read the local committed raft log; there is no sync local-ledger
completed-ops accessor on this path. `getCommitIndex(callback)` and
`getLastDeclaredCommitIndex()` (`raft/sqlite-log-adapter.js:304,838`) are async and return
a scalar index, not operation records — they cannot supply a completed-REPLACE list to a
sync planner. **F's "LOCAL and lag-free" claim does not correspond to any code the planner
touches.**

**Completion visibility itself lags AND is filtered.** Even setting lag aside, a
**COMPLETED (terminal)** REPLACE is removed from the set at two independent gates:
- `isTrackedInFlightOperation`: `operationProgress.terminal === true → return false`
  (`unified-rebalancer-replica-state.js:320-322`).
- `isReplicaOperationInFlight`: `isReplicaOperationTerminalSuccess(record) → false`
  (`replica-operation-liveness.js:527-528`) and `!hasObservedCompletedReplicaOperation`
  (`:538`).

**Decisive:** the fresh leader does NOT see completed REPLACE ops in the planner's
accounting input — completion is both lagged (CDC) and, once observed, filtered as
terminal. **F has nothing to credit → INERT** for its literal target.

## 2. Row-op-linked, or the refuted count heuristic? → **REFUTED HEURISTIC.**

c78833f0 is row-op-linked *because* it binds each drain-phase REPLACE to a **specific
materialized non-active learner ROW** on the op's target node (`nonActiveOccupiedByNode`,
`in-flight-aware-replica-count.js:106-128, 190-210`), and it excludes replacements already
ACTIVE, stale learners, and net-neutral REPLACEs (`:186-208`). Its commit message
(`c78833f0`): *"ROW-OP-LINKED … This is a read-path correctness fix, not a count heuristic,
which is why it bounds where 3 prior count-based approximations were refuted."*

F's whole premise is the state where **that materialized row is ABSENT** from the stale
cache (the replacement voter "NOT YET in that cache"). With no row, F cannot use
`nonActiveOccupiedByNode` (candidates `null` → `continue`, `:196-197`). F would have to
credit off the op's `target_node_id` alone. But:
- The REPLACE op's `replica_id` is the **SOURCE**, not the replacement (`:155`, `:183-185`).
  Without a materialized row F has **no replacement replica_id** to key on.
- So F can exclude only by **node**, not by replica identity — the exact
  multiple-replicas/ops-per-node ambiguity that refuted the 3 prior count approximations,
  and that the memory pins: "Do NOT re-chase with a count heuristic."

**F is NOT row-op-linked** — it is precisely the count-based node approximation c78833f0
was engineered to avoid.

## 3. Double-count / overshoot across cache catch-up → **the feared phantom-REMOVE does NOT occur, but the INVERSE hazard (masking a genuine deficit) does.**

`deficitEffectiveCount` is consumed at **only** two sites, both `>= targetReplicaCount`
gates that **suppress count-increasing (`INCREASE_REPLICA_COUNT`) ADDs**
(`move-calc:560-564` serialization-cap reconcile, `:625-629` spread-vs-count reconcile).
It **never** drives a REMOVE. The phantom REMOVE / over-creation cap key on **`activeCount`**
(`move-calc:333`) and per-node **row `currentCount - targetCount`** (`:360`) — terms F does
not touch.

Consequence for the catch-up transition: the instant the replacement lands ACTIVE,
`activeCount += 1`; if F still credits the same (still-cache-visible, still-non-terminal)
REPLACE by node, `deficitEffectiveCount = target + 1`. That over-count only makes the ADD
gate read "no deficit" harder — **it cannot manufacture a REMOVE.** So the specific
double-count → spurious-REMOVE hazard the brief flagged is **ABSENT** (deficit and surplus
paths are disjoint).

**But the inverse is the real hazard:** a fail-toward-suppress term computed by node
approximation will **mask a GENUINE deficit.** If a voter genuinely dies (activeCount →
target−1, a real deficit) while F's node-based credit is over-counting an unmaterialized
replacement, `deficitEffectiveCount = target` → the legitimate deficit-fill ADD is
suppressed (`move-calc:563/628`) → a **real** recovery is frozen. That directly fails
binding-observable (ii) ("a genuine deficit STILL spreads"). This is strictly worse than
c78833f0, whose row-linkage guarantees it only credits a replacement that actually exists.

## 4. Circularity vs D → **F avoids D's owner-RPC/defer circularity, but inherits D's core structural flaw (reads the same lagging cache).**

F is **not** the owner-RPC/`OWNER_RPC_REQUIRED` deferral path
(`rebalance-coordinator-operation-read-methods.js`), so it does not have D's
"flapping-owner reads its own ledger mid-election → DEFERRED → becomes Path B" circularity
(eval-D §2). On that narrow axis F is better than D. **However**, F reads the **same
`systemTableCache` (`unified-rebalancer-replica-state.js:544`)** whose staleness D was
faulted for — so F inherits D's decisive flaw: it operates on a lagging source, not the
authoritative local ledger the premise imagines. A genuinely lag-free local completed-ops
accessor **does not exist** on the sync planner path (§1); building one is new plumbing, not
a pure-function tweak.

## 5. Exact minimal change site + is it sync? → **Two-part change; the required lag-free source does NOT exist, so the "supply completed ops" half cannot be satisfied today.**

- **Pure-function half:** relax `in-flight-aware-replica-count.js:190-210` to credit a
  drain-phase/completed REPLACE even when `nonActiveOccupiedByNode` has no row (credit by
  `target_node_id`). This is the heuristic regression of §2.
- **Caller half (the blocker):** `move-calc:312-316` must pass a lag-free, **unfiltered**
  completed/drain REPLACE feed for `replica_operations-p1`. Today it passes
  `getEntityTopologyBlockingInFlightOperations()`, which (a) reads the lagging cache, (b)
  filters terminal ops (`isTrackedInFlightOperation:320-322`), and (c) filters drain-phase
  ACTIVE/STOPPING REPLACEs (`isTopologyBlockingInFlightOperation:622-623`). **c78833f0
  changed ONLY the pure function + tests — it did NOT re-wire the caller** (`git show
  c78833f0 --stat`: `in-flight-aware-replica-count.js` + 1 test + dt:prove artifact). So F
  needs a NEW sync local-ledger accessor returning this partition's completed/drain REPLACEs
  and must thread it into the sync planner — the SAME "build a new reader end-to-end"
  category as E, minus E's correctness.

**Verdict:** F is **not** a cheap pure-function extension. The sync lag-free source it
depends on is absent; supplying it is comparable plumbing to E.

## 6. Head-to-head vs E → **Implement E (or Path-A driver removal). F is NO-GO.**

| Axis | E (services-ROW watermark) | F (completed-REPLACE credit) |
| --- | --- | --- |
| Correct axis | **YES** — stale `activeCount`/`currentReplicas` rows (the dominant term, eval-D §1) | Partial — only `deficitEffectiveCount` (ADD leg) |
| Fixes phantom **REMOVE**? | **YES** — gates *count-CHANGING* ADD **and** REMOVE on row freshness | **NO** — REMOVE keys on `activeCount` (`move-calc:333,360`), untouched by F |
| Fixes phantom **ADD**? | YES (fresh rows → correct deficit) | Only via a refuted node heuristic (§2) that can mask genuine deficits (§3) |
| Reads a lag-free source? | Builds a real raft-index watermark on SERVICES (non-flapping, non-priority) | **NO** — reads the same lagging `systemTableCache` as D (§1,§4) |
| Row-op-linked / non-heuristic? | Freshness gate, not a count | **NO** — node approximation, refuted class (§2) |
| Circular on the driver? | No (SERVICES ≠ flapping partition) | No owner-RPC circularity, but inherits D's stale-cache flaw |
| Effort | HIGH (watermark producer + contiguous frontier + sync reader + async preload) | MED-HIGH (missing lag-free accessor + caller re-wire + multi-node DT) — **not** the LOW the premise claims |
| Risk | MED (bounded deferral) | MED (masks genuine deficits; partial ADD-only fix) |

E is on the **correct axis and complete** (both phantom legs), non-circular, with a bounded
release keyed on a real data event. F is **partial (ADD leg only), heuristic, and not
actually cheap** once its missing lag-free source is accounted for. The memory's own steer
is decisive here: the over-target ADD leg was SPLIT into
`formation-ledger-over-target-accounting-drain-phase-replace-blind-spot` (P2) with the
explicit directive **"Do NOT re-chase with a count heuristic; … needs a ROW-OP-LINKED
fix … the voter-visibility read-path class."** F is a count heuristic on exactly that leg.
The row-op-linked, voter-visibility fix is E's axis (row freshness), not F's.

## 7. Interactions / risk / effort / DT

- **c78833f0** — F would *loosen* c78833f0's row-linkage (the very property that made it
  bound where 3 approximations failed). Direct regression risk, not a complement.
- **c7a3bf19 ghost re-verify** — cache-bypassing owner-RPC read of the interlock's self-move
  *blocker state*; a different read than a replica-count credit. The c7a3bf19 pathology
  (fresh leader sees the prior REPLACE frozen at STOPPING though terminalized) actually
  *predicts* F's inertness: the op the fresh leader sees is a non-terminal STOPPING row that
  `isTopologyBlockingInFlightOperation` already filters out of F's input (`:622-623`).
- **over-creation cap (`move-calc:329-347`) / REPLACE serialization / deficit reconcile
  (`:560-582,625-646`)** — all key on `activeCount` or `deficitEffectiveCount`; F only
  nudges the latter toward suppression, so its only reachable effect is over-suppressing
  ADDs (§3). No effect on the surplus/REMOVE side that also flaps.
- **run-20/22 self-move serialization + interlock admission** — untouched; no benefit.
- **Multi-node DT + binding observable:** multi-node mandatory (single-instance shares one
  cache and false-passes, eval-b §5). Substrate:
  `dt6-rebalancer-formation-self-move-interlock.test.js` +
  `dt6-ledger-leader-durability-fitness.test.js` +
  `dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js`; virtual
  clock past the 60s legal hold + 3× 1s strikes; seeded RNG for leadership jitter. The pair
  F must move — (i) fresh leader emits no phantom ADD/REMOVE; (ii) a genuine deficit still
  spreads — is **unsatisfiable by F**: (i) needs the completed-REPLACE credit, which is
  filtered out of F's input (§1), and forcing a node-based credit breaks (ii) by masking
  genuine deficits (§3). A faithful multi-node DT would expose the contradiction, not
  confirm a fix. Risk MED, effort MED-HIGH.

---

## Ratings

| Axis | Rating |
| --- | --- |
| Lag-free-local-ledger premise TRUE? | **FALSE** (§1 — planner reads the lagging `systemTableCache`, not the local ledger; no sync completed-ops accessor exists) |
| Sees COMPLETED REPLACEs without lag? | **NO** — terminal ops filtered (`unified-rebalancer-replica-state.js:320-322`; `replica-operation-liveness.js:527-538`) AND source lags (§1) |
| Inert or heuristic? | **INERT** for literal completed ops; **refuted node heuristic** if forced to fire (§2) |
| Row-op-linked? | **NO** (§2 — no materialized row → node approximation, drops c78833f0's binding) |
| Double-count → phantom REMOVE? | **No** (deficit/surplus paths disjoint, §3) — but **masks genuine deficits** instead (worse for observable (ii)) |
| Circular like D? | No owner-RPC circularity, but **inherits D's lagging-cache source flaw** (§4) |
| Change site sync/cheap? | **No** — needs a new lag-free local-ledger accessor + caller re-wire; comparable plumbing to E (§5) |
| Head-to-head | **E (or Path-A) wins**: correct axis, both legs, non-heuristic (§6) |
| Risk / Effort | **MED / MED-HIGH** |

## VERDICT: **NO-GO** (confidence HIGH)

F's load-bearing premise — that the fresh leader has authoritative, lag-free, sync
visibility of its OWN completed REPLACEs — is **FALSE**. The planner's only in-flight-ops
source is the CDC-fed `systemTableCache` (`unified-rebalancer-replica-state.js:544`, the
same source D was killed for), and completed/terminal REPLACEs are filtered out of it
(`:320-322`; `replica-operation-liveness.js:527-538`). No sync local-ledger completed-ops
accessor is wired into the planner (`getCommitIndex` is async and returns an index, not
rows). So F is **INERT** for its literal target; the only way to make it fire is to drop
c78833f0's materialized-row binding and credit by `target_node_id` alone — the **refuted
count-heuristic class** the memory explicitly forbids on this leg, which additionally
**masks genuine deficits** and touches only the ADD leg (the phantom REMOVE keys on
`activeCount`, which F never changes). It is **not** the LOW-effort pure-function extension
the premise assumes: the missing lag-free source + caller re-wire make it comparable to E's
plumbing but without E's correctness.

**Recommendation:** implement **E** (services-ROW freshness watermark) if a count-path fix
is pursued — it is on the correct axis, fixes both phantom legs, is non-circular for the
driving `replica_operations-p1` flap, and its deferral is bounded by CDC catch-up. The
cleaner root remains **Path A** (remove the orphaned-session durability-demotion driver).
Do NOT implement F.
