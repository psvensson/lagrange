# Eval — FIX PATH D ("gate the fresh leader's first count-change on in-flight-accounting-view completeness via an authoritative owner-RPC read")

Scope: evaluation only, no src changed. Companion to `research-selfmove-limit-cycle.md`
(the cycle), `eval-path-a-root.md` (driver = orphaned session, circular),
`eval-path-b-hysteresis.md` (leadership-gain cooldown, node-boundary-inert),
`eval-path-c-incumbent-hysteresis.md` (score term, count-invisible). All claims file:line-cited.

Path D: before a fresh leader of a control-plane priority partition emits its first
count-CHANGING move (ADD/REMOVE), read the in-flight operations AUTHORITATIVELY
(owner-RPC, bypassing the cold local cache — the `resolveAuthoritativeAddAdmission` /
`OWNER_RPC_REQUIRED` discipline) and defer the count change until that view is authoritative.

---

## HEADLINE VERDICT — NO-GO (confidence HIGH)

**D reads the WRONG input.** The deficit/surplus miscount is dominated by the fresh
leader's stale `currentReplicas` (committed replica ROWS, `activeCount`), NOT by an
incomplete in-flight-OPS view. `computeInFlightAwareReplicaAccounting` derives
`deficitEffectiveCount = activeCount + inFlightAddCount + drainPhaseReplacementCredit`
(`in-flight-aware-replica-count.js:225-226`); in the run-5 REPLACE→ADD→REMOVE signature
the only in-flight terms an authoritative ops read could move are **zero or excluded**,
so an authoritative in-flight read adds no deficit-suppressing credit and touches neither
the surplus/REMOVE path (which keys 100% on `activeCount`). Worse, both inputs read from
the **same** `systemTableCache` (`unified-rebalancer-replica-state.js:227` rows, `:540`
ops), so D authoritatively refreshes one half of a two-halves-stale view. And on the one
partition that actually drives the stall — `replica_operations-p1`, whose own flap holds
the interlock — the authoritative read is **circular** (it is the flapping owner reading
its own ledger mid-election) and degenerates to a deferral, i.e. to the already-killed
Path B. Risk MED, effort MED-HIGH. **The real fix is a REPLICA-ROW view-freshness
watermark on the leadership handoff, or Path-A's driver removal — not an ops read.**

---

## 1. THE CRITICAL ADVERSARIAL QUESTION — which stale input causes the miscount? → **`currentReplicas` (committed rows), decisive; D does NOT fix it**

`computeInFlightAwareReplicaAccounting` takes both inputs, but they are **not
symmetric** in the count decision:

**deficitEffectiveCount** (the value that gates the phantom ADD at `move-calc:628` and
`:563`) is `activeCount + inFlightAddCount + drainPhaseReplacementCredit`
(`in-flight-aware-replica-count.js:225-226`). Trace each term for the run-5 REPLACE→ADD
transition (epoch1 node-0 dispatched 3× `replace` off the seed; epoch2 node-1 emits the
phantom `add increase_replica_count`, `research §2`):

- `activeCount` — from `currentReplicas` ACTIVE rows only (`:116-118,213`). This is the
  **dominant term** and the one a fresh leader reads stale-low.
- `inFlightAddCount` — counts in-flight `MoveType.ADD` ops (`:142-150`). At epoch2 plan
  time the prior epoch's in-flight ops are **REPLACEs, not ADDs**, so this is **0 even
  with a perfect authoritative read**.
- `inFlightReplaceInCreationCount` (the prior REPLACEs, `:151-156`) is **explicitly
  EXCLUDED from `deficitEffectiveCount`** (see the field list `:225-226`: it feeds only
  `creationEffectiveCount`). So the prior epoch's REPLACE creation work contributes
  **zero** deficit credit no matter how authoritative the read.
- `drainPhaseReplacementCredit` — nonzero only once the REPLACE source has LEFT
  `activeCount` AND a materialized non-active learner row sits on the target node
  (`:173-211`). During creation phase the sources are still active → **0**; and even when
  it would fire, it is built from `nonActiveOccupiedByNode` which comes from
  **`currentReplicas`** (`:106-128`), so authoritative-ops-without-authoritative-rows
  still can't credit it.

Net: the phantom ADD fires because `activeCount` (from `currentReplicas`) reads below
target; the only knob an authoritative in-flight read can turn (`inFlightAddCount`) is 0
here. **The phantom ADD is a `currentReplicas` miscount.**

The phantom REMOVE (epoch3) is even clearer: the over-creation cap keys on
`inFlightAccounting.activeCount > targetReplicaCount` (`move-calc:333`) and the REMOVE
`excess = currentCount - targetCount` (`:360`), both from `currentReplicas` / `activeCount`
exclusively. **The surplus path never consults the in-flight-ops set at all.**

**Where both inputs come from (the structural nail):** `getCurrentReplicas()` reads
`systemTableCache.filter(SERVICES,…)` (`unified-rebalancer-replica-state.js:230-278`,
`@readModel … SYSTEM_TABLE_CACHE`) and `getInFlightOperations()` reads
`systemTableCache.filter(REPLICA_OPERATIONS,…)` (`:544-554`, same
`SYSTEM_TABLE_CACHE` source). **Both halves lag from the SAME cache on a fresh leader.**
D authoritatively refreshes only the ops half and keeps trusting the stale rows half —
which is the half that actually drives the miscount.

**Verdict:** culprit = **`currentReplicas` (committed replica rows), dominant; in-flight
ops secondary/zero in the observed signature.** D is **INSUFFICIENT** — to fix the
miscount it would additionally (really, *instead*) need to authoritatively read the
replica ROWS.

## 2. Can the flapping partition authoritatively read its own in-flight ops mid-flap? → **NO — circular; and it IS the partition that matters**

Which partition's fresh-leader miscount drives the stall? Run-5: `replica_operations-p1`
had only **4** over-target deferrals; the 87/28/28/22 were other partitions
(`research §1`). But those other partitions are blocked **behind** `replica_operations-p1`
— its own flap holds the interlock (`self_move_in_flight` / `quorum_concentrated`,
`rebalance-coordinator-ledger-interlock-admission.js:195-222,315-338`;
`research §3`). So the fresh-leader miscount that must be suppressed to unblock the demo is
**`replica_operations-p1`'s own** — the exact partition with the self-read problem.

The authoritative owner-RPC read routes through
`repository.queryIncompleteOperations({visibilityReadMode: OWNER_RPC_REQUIRED})`
(`rebalance-coordinator-operation-read-methods.js:59-72`). During cold formation the
replica_operations control-plane partitions are the very ones gated behind the interlock /
quorum-concentration this quest must not narrow — the **formation-vs-steady-state circular
dependency** (`eval-path-a §3`; memory `circular-dependency-class-formation-vs-steady-state`).
A fresh leader of `replica_operations-p1`, mid-election, either (a) serves the read from
its own not-yet-settled local state (the stale cache — defeating D) or (b) the owner read
DEFERS/EMPTY-returns (`resolveIncompleteOperationObservation` state
`DEFERRED`/`EMPTY`, `replica-operation-repository-visibility-methods.js:346-366`) and
`shouldBlockOperationAdmissionOnIncompleteOperationObservation` blocks. Case (b) means D
can only **defer the count decision** during exactly the window it fires — which is Path B
(leadership-gain settle), already NO-GO for node-boundary inertness + a ~1s fallback too
fast to settle + the driver surviving (`eval-path-b §1`).

## 3. Detecting "view complete" without circularity → **signal EXISTS, reusable, but on the wrong layer**

The completeness machinery is real and would not need new state:
`getIncompleteOperationObservation` → `resolveIncompleteOperationObservation`
(`…visibility-methods.js:346-366`) yields a tri-state `PRESENT / DEFERRED / EMPTY`;
`reconcileIncompleteOperationEmptyQueryDelay` + `shouldBlockOperationAdmissionOnIncompleteOperationObservation`
+ the empty-query backoff (`…priority-budget-helper.js:741-761`) already distinguish
"owner pressured / can't tell" from "true zero." `resolveAuthoritativeAddAdmission`
(`…priority-budget-helper.js:397-431`) is the exemplar.

BUT all of it lives on the **coordinator/repository ADMISSION layer** and is **async**.
The deficit/surplus COUNT decision is in the **synchronous** move-planner:
`calculateMoves` is called with no `await` (`unified-rebalancer-rebalance-loop.js:161`)
and `computeInFlightAwareReplicaAccounting` runs sync over `systemTableCache`
(`move-calc:312-316`). There is no async owner-RPC seam on the count path. So D cannot
"reuse the signal" in place — it would have to make the whole move-calculation path async
and thread a coordinator RPC into the planner. New wiring, not reuse.

## 4. Does it stall the legitimate first spread? → **YES (same freeze class as B/C)**

Two ways:

1. When the authoritative read returns DEFERRED (the common case during `p1`'s own flap,
   §2), the only safe action is to defer the count change — which defers the **legitimate
   first spread off the concentrated seed** (`research §2`: node-0 ×3 `replace`) exactly
   as C froze the seed and B's cooldown delayed recovery. During the churn window the
   disambiguating input (an authoritative REPLICA-ROW view) is unavailable, so D cannot
   tell a phantom count move from a genuine one.
2. Scope does not rescue it: the count-neutral spread REPLACE is generated in the same
   `calculateMoves` pass; gating "first count-changing move" still catches the genuine
   under-target ADD when `activeCount` legitimately < target early in formation — the read
   can't confirm otherwise, so it defers a real deficit fill.

Latency: **one owner-RPC per plan** on the hottest control-plane path, plus converting a
currently-synchronous `calculateMoves` into an async round-trip per rebalance tick.

## 5. Simpler framing check → **NO on both readings; the honest minimal site is Path B (already killed)**

- "Just reuse `resolveAuthoritativeAddAdmission` for the COUNT decision too" — **fails**:
  that helper gates ADMISSION (mint-vs-not given concurrency budget), async on the
  coordinator; the deficit/surplus decision is sync in the planner (§3) and, more
  fatally, reads the **wrong table** (ops, not rows — §1).
- "The problem is `enqueueRebalanceCheck@:481` firing before ANY accounting is loaded, so
  delay/authoritative-load on leadership gain" — this is the accurate diagnosis, but the
  minimal site is then `setLeader`'s `isLeader && !wasLeader` branch
  (`unified-rebalancer-lifecycle-base.js:475-483`) = **Path B** (defer the first re-plan
  until the view settles), already NO-GO (node-boundary inertness, ~1s fallback,
  driver survives; `eval-path-b`). D dressed as an authoritative-read gate collapses into
  B the moment the read is unavailable.

## 6. Interactions

- **c78833f0 deficit credit / over-creation cap (`move-calc:329-347`) / REPLACE
  serialization (`:507-582`) / deficit reconcile (`:625-646`)** — all key on
  `activeCount` (`currentReplicas`). An authoritative in-flight read is **orthogonal** to
  every one of them and would double-gate the same `deficitEffectiveCount` line without
  moving it (§1).
- **c7a3bf19 ghost re-verify** is the real precedent the brief invokes — but it does a
  cache-bypassing owner-RPC read of the **interlock's self-move blocker (operation ledger
  STATE)**, not the replica-count rows. D on the count path neither reuses nor conflicts
  with it.
- **run-20/22 self-move serialization + the interlock admission path** are untouched by a
  planner-count read — structurally intact, no benefit.
- **Priority-recovery** already carries the DEFERRED/EMPTY observation plumbing D would
  lean on; no double-gate hazard, but no count-path win either.

## 7. Multi-node DT + binding observable

Multi-node mandatory (single-instance shares one cache/state and false-passes — same trap
as `eval-path-b §5`). Substrate: `dt6-rebalancer-formation-self-move-interlock.test.js`
(real coordinator + interlock + `setLeader` re-plan) +
`dt6-ledger-leader-durability-fitness.test.js` (demotion) +
`dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js`; virtual
clock past the 60s legal hold + 3× 1s strikes; seeded RNG for the leadership-start jitter.
Binding observable pair: (i) a fresh leader with prior-epoch in-flight ops does NOT emit a
phantom ADD/REMOVE; (ii) a genuine deficit STILL spreads in one epoch. **D fails the
pair** for the same structural reason B and C fail it: with the authoritative REPLICA-ROW
view unavailable during the flap, the gate cannot separate (i) from (ii); an authoritative
OPS read moves neither `activeCount` nor the surplus decision. A faithful multi-node DT
would expose the contradiction, not confirm a fix.

---

## Ratings

| Axis | Rating |
| --- | --- |
| Fixes the miscount? | **NO** (§1 — wrong input; miscount is `currentReplicas`/`activeCount`, ops read is 0/excluded) |
| Stale input culprit | **`currentReplicas` (committed rows), dominant**; in-flight ops secondary/zero |
| Circular on the partition that matters? | **YES** (§2 — `replica_operations-p1` reads its own ledger mid-flap → DEFERRED → becomes Path B) |
| Completeness signal | Exists + reusable (§3) but on async admission layer, not the sync count path |
| Freezes legit first spread? | **YES** (§4 — same freeze class as B/C) |
| Risk | **MED** (async-ifies the hot sync count path + freeze hazard; no correctness win) |
| Effort | **MED-HIGH** (thread owner-RPC into sync `calculateMoves` + multi-node DT) |

## VERDICT: **NO-GO** (confidence HIGH)

D authoritatively reads the **in-flight operations**, but the deficit/surplus miscount is
dominated by the fresh leader's stale **committed replica rows** (`activeCount` from
`currentReplicas`, `move-calc:333,360`, `in-flight-aware-replica-count.js:225-226`); the
in-flight terms an ops read can move are 0 (`inFlightAddCount`) or excluded from the
deficit (`inFlightReplaceInCreationCount`) in the observed REPLACE→ADD→REMOVE signature.
Both inputs share the one `systemTableCache`, so D refreshes the half that does not drive
the bug. On `replica_operations-p1` — the partition whose flap actually holds the interlock
— the authoritative read is circular (owner reading its own ledger mid-election) and
degenerates to a DEFERRED-then-wait, i.e. the already-killed Path B.

### What the real fix must be

1. **Driver removal (Path A root)** — the orphaned ACTIVE participant session →
   durability demotion → flap. This is the only thing that stops the flap, but it is
   HIGH-risk and formation-vs-steady-state circular (`eval-path-a`).
2. **If a count-path fix is pursued, gate on REPLICA-ROW view freshness, not an ops
   read.** The fresh leader must not emit a standalone count-increasing ADD or
   count-decreasing REMOVE until its committed **`currentReplicas`** view (the SERVICES
   cache, `unified-rebalancer-replica-state.js:230`) is confirmed at-or-past the raft
   index/term of the leadership handoff — a shared, node-boundary-immune **row-view
   watermark** so it plans on rows that already reflect the prior epoch's completed work.
   That corrects the memory directive "the fix is a view-completeness gate" by pinning
   WHICH view: the **replica rows**, not the operations ledger — and it is neither a count
   heuristic, nor a scorer term, nor a timer, nor an authoritative ops read. It still must
   clear the §2 circularity (the watermark source must be observable without an
   interlock-gated read of the flapping partition) and the §4 freeze (it must release the
   moment the row view catches up, never a blanket hold), which is why (1) remains the
   cleaner root.
