# Eval — FIX PATH C ("wire in-score incumbent-movement-cost hysteresis for the ledger quorum-spread")

Scope: evaluation only, no src changed. Companion to
`research-selfmove-limit-cycle.md` (the cycle), `eval-path-a-root.md` (driver is
structurally the demotion), `eval-path-b-hysteresis.md` (timing lever is
node-boundary-inert). All claims file:line-cited.

Path C: make the placement planner reluctant to move a healthy incumbent replica
via an in-score movement-cost term — a WHICH lever evaluated fresh each plan from
placement state, meant to damp the A→B→A flip at the planner instead of via
timing. Candidate levers: `INCUMBENT_MOVEMENT_COST`
(`placement-owner-decision.js:174-177`, DATA_AFFINITY-only today) and
`retainHealthyIncumbents` (`placement-owner-evidence.js:165`, dead).

---

## HEADLINE VERDICT — NO-GO (confidence HIGH)

**C does NOT break the oscillation. Decisive: the pathology is a COUNT flip, and
the incumbent-cost term is a SCORE term that only reorders WHICH nodes fill a
fixed slot count — it never gates whether an ADD or a REMOVE is emitted.** The
count target is a policy constant, the flip is a CDC-lagged deficit/surplus
miscount on the ADD/REMOVE count path, and the driver (orphaned-session →
durability demotion → leadership flap) is a scorer-invisible transaction-lifecycle
event. C would additionally introduce the *opposite* failure it is warned about —
freezing the concentrated ledger seed so the FIRST legitimate spread never fires.
Risk MED, effort MED. **What remains is a COUNT/accounting-path or re-plan-view-
settle fix, not a scorer term.**

---

## 1. DOES IT ACTUALLY BREAK THE OSCILLATION? — **NO (decisive)**

The count of replicas is decided **before** and **independently of** scoring; the
incumbent term lives **only** in scoring. Three code facts prove it:

**(a) The target COUNT is a policy constant, untouched by any score term.**
`calculateTargetState` sets `targetReplicaCount = policy.targetReplicaCount ||
policy.replicaCount || 3` (`move-planner.js:260-261`). It does not read the
scorer. So "add a 4th / shed to 3" is never a scoring outcome — the scorer only
chooses WHICH `targetCount` nodes fill the slots (`buildPlacementOwnerDecision`
returns `targetNodeIds` of length `min(targetCount, rankedNodeIds.length)`,
`placement-owner-decision.js:278,405-408`).

**(b) The ADD/REMOVE decisions are per-node COUNT deltas on the lagged view — no
score consulted.** In `calculateMoves`:
- ADD: `needed = targetCount(node) - currentCount(node)`, one ADD per unit
  (`move-planner-move-calculation-methods.js:295-303`, reason
  `INCREASE_REPLICA_COUNT`).
- REMOVE: `excess = currentCount - targetCount(node)`, one REMOVE per unit
  (`:357-361`, reason `SPREAD_REPLICAS`/`NODE_NOT_IN_TARGET`).
Both are pure arithmetic over `targetNodes` (the scored set) vs `currentCounts`
(the CDC-lagged `currentReplicas`). The score value never enters this arithmetic.
`INCUMBENT_MOVEMENT_COST` is added at `placement-owner-decision.js:174-177` and
summed into `score` at `:246` / `sumPrimaryScore:222-229`; its only effect is the
sort at `:251-259` → rank order → which nodes are in `targetNodeIds`. **A
movement-cost penalty is consulted on WHERE (node selection), never on WHETHER to
add or remove.** So it cannot stop a deficit-ADD/surplus-REMOVE flip. Direct
answer to the brief's critical sub-question: it only affects node selection, so it
will NOT stop the count oscillation.

**(c) The driver is invisible to the scorer, and the incumbent set is derived from
the very lagged view that causes the flip (circular).** The flip's driver is the
orphaned ACTIVE participant session → durability-fitness demotion → leadership hop
(`research §3`; `partition-service-durability-fitness.js:181-217,316-322`) — a
transaction-lifecycle event no placement score term observes. The flap keeps
firing every ~60s. Worse, `isIncumbent` is computed over `evidence.currentReplicas`
(`placement-owner-decision.js:170-172`), the SAME CDC-lagged rows that produce the
miscount (`eval-path-a §1`, `eval-path-b §1a`). On a fresh post-demotion leader the
lagged view undercounts, so replicas that exist-but-are-invisible are not even
recognized as incumbents → they receive no retention bonus exactly when it would
be needed. The lever's signal is undermined by the bug's root.

**Decisive code path proving NO:**
`policy.replicaCount` (fixed) → `calculateTargetState` (`move-planner.js:260`) →
`calculateMoves` ADD `needed = target−current` (`move-calc:296`) / REMOVE
`excess = current−target` (`move-calc:360`), both over CDC-lagged
`currentReplicas`. `INCUMBENT_MOVEMENT_COST` enters only at `decision.js:174` →
`sort:251`, changing `targetNodeIds` membership, never the ADD/REMOVE count math.

## 2. RESIDUAL: COUNT flip (C can't fix) or WHERE flip (C could)? — **COUNT**

Re-derived from run-5 (`research §2`): leader node-1 emits **standalone `add`
(`increase_replica_count`)** then leader node-0 emits **standalone `remove`**
(`CREATE_REPLICA` 5×, `REMOVE_REPLICA` 4×). Standalone count-increasing ADD on one
leader and standalone REMOVE on another is a **deficit-vs-surplus COUNT
divergence**, not a count-neutral REPLACE (which is the WHERE swap signature). One
leader reads its lagged `currentReplicas` as under target → ADDs; the next reads it
as over target → REMOVEs.

`c78833f0`'s `deficitEffectiveCount` credit + the in-flight-aware accounting guards
(over-creation cap `move-calc:329-347`; deficit reconcile `:625-646`; REPLACE
serialization `:507-582`) already closed the **steady** count-signal divergence
(over-target deferrals 148 → 4, `research §1`). The residual ~4 is the
**leadership-flap window**: a fresh leader re-plans (`unified-rebalancer-
lifecycle-base.js:475-483`, immediate, no settle) **before** its
`computeInFlightAwareReplicaAccounting` (`move-calc:312-316`) has loaded the prior
epoch's in-flight ops, so the guards see an empty in-flight set and don't suppress
the spurious count move. That is a COUNT/accounting-completeness problem on the
count path — **C's score term cannot touch it.**

There is a genuine WHERE component, but it is the *legitimate first spread* off the
concentrated seed (node-0 ×3 `replace`, `research §2`) — the thing C would *freeze*
(§4), not the pathology. So the residual C could theoretically damp is the healthy
signal; the residual that is the bug is a COUNT flip C cannot reach.

## 3. IF C WERE VIABLE — exact lever + why both options fail here

- The existing `INCUMBENT_MOVEMENT_COST` term is gated on
  `preferDataAffinity === true` (`placement-owner-decision.js:155`), and **nothing
  sets `preferDataAffinity` for the ledger quorum-spread path** (grep: no non-
  affinity setter in `src/`). So "generalize it" means authoring a **NEW,
  unconditional (or spread-gated) incumbent term** in
  `calculateScoreDimensions` (`decision.js:182-220`), not flipping a flag. That is
  a new scoring dimension on the hottest control-plane path.
- `retainHealthyIncumbents` / `resolveIncumbentRetentionNodeIds`
  (`placement-owner-evidence.js:165-179`) is **dead** (grep: no caller passes
  `true`) and is **explicitly rejected** by the epic for this role: reservations
  seed the intent FIRST in the reserve phase (`decision.js:294-299,312-314`), which
  **freezes movement regardless of gradient** — "the sim's symmetric-high freeze"
  (epic Open-questions, decision-log 2026-07-03). It also collides with the
  existing reservation precedence (transition → leader-retention → incumbent,
  `decision.js:306-314`; `leaderRetentionNodeId` `evidence.js:141-150`), which
  already retains the leader on over-target drain. So the only "safe" form is the
  in-score term — and per §1 the in-score term does not help.

## 4. DOES IT FREEZE LEGITIMATE MOVES? — **YES, and it is the OPPOSITE failure**

At cold formation the ledger seed is **concentrated** (bootstrap-local, one node);
the first legitimate spread REQUIRES moving replicas OFF the incumbent seed node
(`research §2`: node-0 ×3 `replace node_not_in_target`). An incumbent-retention
term makes the seed node sticky, so a large-enough cost **freezes the ledger
concentrated** — the epic's "symmetric-high freeze at hit rate 0, stable but
useless" (Tier-1a sweep C, decision-log) and memory's "opposite failure: leaving
the ledger concentrated (never spreading)".

Sizing does not rescue it. The published 0.05–0.6 band (sweep E) was measured
against the **DATA_AFFINITY gradient** (`AFFINITY_WEIGHT=10`,
`constants.js:100`). The ledger spread has **no affinity gradient at all** — its
"pull" is the `SAME_LATENCY_GROUP`/spread topology term
(`decision.js:83-113`), a different, smaller and differently-shaped signal. The
band does not transfer; it would need fresh measurement. And even perfectly sized,
the term only trims marginal WHERE re-ranking (the load self-shadow), which §1–§2
show is not the driver. So: too weak → no effect on the COUNT flip; too strong →
freezes the seed. There is no window where it both damps the flip and permits the
first spread, because the flip and the spread are not the same lever.

## 5. INTERACTIONS

- **Over-creation cap / deficit reconcile / REPLACE serialization**
  (`move-calc:329-347,507-582,625-646`) and **c7a3bf19 ghost re-verify** and
  **c78833f0 over-target credit** are all COUNT/accounting-path or interlock-path
  mechanisms. C is a score-path change — **orthogonal**, so no direct correctness
  conflict, but it attacks the problem from the wrong layer and adds a freeze
  hazard those guards do not carry.
- **Reservation precedence** (`decision.js:277-360`) already reserves in-flight
  transitions and the raft leader on over-target drain. A generalized incumbent
  RESERVATION (the `retainHealthyIncumbents` variant) would collide with that
  ordering; the in-score variant does not, but also does not help (§1).
- **run-20/22 self-move serialization** and the interlock admission path
  (`rebalance-coordinator-ledger-interlock-admission.js`) are untouched by a
  scorer change — structurally intact, no benefit.
- **Priority-recovery path** (`move-calc:156-168,329-333`,
  `isControlPlanePriorityPartition`): C must not add retention stickiness that
  blunts genuine priority recovery — another freeze surface.

## 6. DT SUBSTRATE + BINDING OBSERVABLE — and why C fails it

Multi-node is mandatory (single-instance rigs false-pass, `eval-path-b §5`).
Compose: `dt6-rebalancer-formation-self-move-interlock.test.js` (real
`RebalanceCoordinator` + interlock + `setLeader` re-plan) +
`dt6-ledger-leader-durability-fitness.test.js` (demotion signal) +
`dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js`
(spread completion), virtual clock past the 60s legal hold + 3× 1s strikes.

Binding observable: (i) a demotion/leadership-gain with a recently-moved incumbent
does NOT produce an opposing count move; (ii) a genuine deficit STILL spreads.
**C cannot satisfy this pair**: the opposing move in (i) is emitted by the COUNT
path regardless of score (§1), and (ii) is in direct tension with (i) — the only
knob strong enough to suppress the flip is the same knob that suppresses the
spread (§4). The test would expose the contradiction, not confirm a fix.

---

## Ratings

| Axis | Rating |
| --- | --- |
| Breaks the oscillation? | **NO** (§1 — count path is score-invisible; driver untouched) |
| Residual class | **COUNT flip** (§2 — deficit/surplus lag-miscount, not a WHERE swap) |
| Freeze risk | **HIGH / opposite-failure** (§4 — freezes concentrated seed) |
| Node-boundary-immune? | Yes (score is derived from shared placement rows), but immaterial given §1 |
| Risk | **MED** (wrong-layer + freeze hazard on hottest path; no correctness win) |
| Effort | **MED** (new unconditional score dimension + fresh band measurement + multi-node DT) |

## VERDICT: **NO-GO** (confidence HIGH)

The oscillation is a COUNT flip driven by CDC-lagged deficit/surplus accounting on
the ADD/REMOVE count path (`move-calc:296,360`) plus a scorer-invisible leadership
flap; `INCUMBENT_MOVEMENT_COST` is a WHERE lever
(`decision.js:174→251`) that changes node selection within a policy-fixed slot
count and cannot gate the count decision. Wiring it risks the opposite failure
(freezing the concentrated seed) and does not remove the driver.

### What actually remains

1. **Driver** = orphaned ACTIVE session → durability demotion → flap
   (`research §3`, `eval-path-a`). Removing it (Path A root) is the only thing that
   stops the flap, but it is HIGH-risk and formation-vs-steady-state circular
   (`eval-path-a §3`).
2. **Residual COUNT flip** = a fresh post-demotion leader re-plans
   (`lifecycle-base.js:475-483`, immediate) **before** its in-flight-aware
   accounting (`move-calc:312`) has loaded the prior epoch's in-flight ops, so the
   count guards see an empty in-flight set. The honest forward is on the
   **count/accounting path**: gate the first post-leadership-gain re-plan on
   **in-flight-accounting-view completeness** (a shared, node-boundary-immune
   "count view is consistent" predicate), NOT a scorer term and NOT a Path-B timer.
   This extends the existing `computeInFlightAwareReplicaAccounting` /
   `deficitEffectiveCount` line (`c78833f0`, `c7a3bf19`) rather than adding a new
   score dimension or cache — consistent with [[avoid-secondary-tertiary-caches]]
   and the memory directive "Do NOT re-chase with a count heuristic" (the fix is a
   view-completeness gate, not a count threshold).
