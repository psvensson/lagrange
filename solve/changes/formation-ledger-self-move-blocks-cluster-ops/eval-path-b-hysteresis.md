# Eval — FIX PATH B ("leadership-gain re-plan cooldown / hysteresis")

Scope: evaluation only, no src changed. Companion to
`research-selfmove-limit-cycle.md` (the cycle) and commit `69c7039c`.
Target bug: cold 5-node formation stall — `replica_operations-p1` in a ~2-min
leadership-flap LIMIT CYCLE. Feedback edge:
demotion → immediate re-plan on CDC-lagged view → OPPOSING move → new orphaned
ACTIVE participant session → demotion.

Path B: at `setLeader(true)`, if THIS partition self-moved very recently, defer
the immediate re-plan (`unified-rebalancer-lifecycle-base.js:481`) and let the
scheduled check (`:483`) run after the CDC view settles, so the new leader does
not mint the opposing ADD/REMOVE.

---

## HEADLINE VERDICT

**B does NOT break the cycle. It is a timing band-aid, and the literal
"recent self-move for THIS partition" version is very likely INERT because of a
node-process boundary the proposal overlooks.** GO-WITH-CAVEATS only as
post-Path-A defense-in-depth, and even then the in-score hysteresis wire
(retainHealthyIncumbents / INCUMBENT_MOVEMENT_COST) is the cleaner lever than a
leadership-gain cooldown.

---

## 1. Does it actually break the cycle? — NO (decisive)

The demotion driver is **untouched**. B acts on the re-plan (step 5→6 of the
research §3 chain); the driver is step 1 — an orphaned ACTIVE 2PC participant
session held on the ledger leader past `LEADER_DURABILITY_LEGAL_HOLD_MS`
(60000ms; `partition-service-durability-fitness.js:230`, legal hold
`control-plane/timeout-budget.js:21`). The zombie still expires every ~60s and
the leader still demotes (`durability-fitness.js:316-322`). B only tries to keep
each NEW leader from minting the OPPOSING move.

Three independent reasons it fails to convert "slow the bleed" into "converge":

**(a) NODE-PROCESS BOUNDARY — the proposal's fatal gap.** The per-partition
rebalancer is created per node inside the local partition service
(`partition-service-rebalancer-methods.js:223`) and `setLeader` is driven by the
local raft role (`partition-service-core-base.js:496,507` →
`resolveRebalancerLeadership()`). So `setLeader(true)` fires on **whichever node
just won raft leadership** — a *different process* from the leader that executed
the self-move. In the cycle, leadership hops node-0 → node-1 → node-0 → node-1
(research §3), and the move that must be suppressed at epoch N was executed by
the leader of epoch N-1 on a *different node*. Any in-memory
`this.lastSelfMoveCompletionMs` on the new leader is **empty for a move it did
not execute** → the cooldown never engages → the opposing move mints anyway. The
naive in-memory implementation does not even damp; it is inert. To engage, B must
read a SHARED signal (the operations ledger / CDC view) — which is the *same
lagged source that is the root of the bug*. Circular.

**(b) THE `:483` FALLBACK IS TOO FAST TO SETTLE.** Deferring to the scheduled
check does not buy a settled view: for a control-plane priority partition
`getLeadershipStartDelayMs()` returns `max(1, random*getPriorityRetryDelayMs())`
and `getPriorityRetryDelayMs()` floors at 1000ms
(`unified-rebalancer-policy-scheduler-methods.js:165-171,150-157`). So the
"delayed" re-plan fires within ~1s — far below the seconds-to-tens-of-seconds
CDC/session settle — and re-plans on a still-lagged view, minting the same
opposing move. B only damps if the cooldown is EXPLICITLY extended to a
tens-of-seconds settle window, which directly delays real recovery (§3).

**(c) THE ZOMBIE IS NOT ONLY MINTED BY p1's OWN RE-PLAN.** The orphaned ACTIVE
session is "a coordinator operation-lifecycle write / 2PC participant on
`replica_operations`" (research §6/A). ANY partition's operation using the ledger
as a 2PC participant can orphan a session on the ledger leader. Today those are
gated behind the interlock while the self-move/concentration hold is engaged
(`rebalance-coordinator-ledger-interlock-admission.js:195-222,315-338`); the
moment B quiets p1 and the hold releases, other partitions admit and create their
own ledger participant sessions — any of which can orphan and re-trigger the
demotion. B starves ONE zombie source, not the class.

**Verdict:** B converts an active A→B→A oscillation (at best, and only with a
shared signal + a long cooldown) into a slower "leadership hops on each zombie
expiry; the view maybe settles before the next orphan." That is a timing race,
not a cycle break. The research itself frames B as "damps the cross-epoch
oscillation *even if a demotion still occurs*" (§6-B) — i.e. it concedes the
driver survives.

## 2. Exact implementation

Site: `unified-rebalancer-lifecycle-base.js:475-483` (`setLeader`, the
`isLeader && !wasLeader` branch). The change: gate the immediate
`enqueueRebalanceCheck(PERIODIC_CHECK)` at `:481` behind
`!recentSelfMove(this.entityId)`, leaving `scheduleNextCheck(:483)` as the
fallback (and lengthening it to a settle window for priority partitions).

`enqueueRebalanceCheck` (`rebalancer-planning-gate-methods.js:101-106`) pushes
onto the single-flight `rebalanceCheckQueue` — effectively immediate — so `:481`
is the immediate re-plan and `:483` the timer.

State required — this is where B breaks down:
- Clock: `this.nowFn` already exists and is virtual-clock-aware
  (`lifecycle-base.js:84-87`). Fine.
- "recent self-move for THIS partition": **no such durable state exists on the
  rebalancer today.** The nearest existing state is interlock admission state
  (`heldSelfMoveOperationId` / `selfMoveCreateInFlight` /
  `heldSelfMovePartitionId`, `interlock-admission.js:472-477,570-573`) — but that
  lives on the `RebalanceCoordinator` (node-level), is cleared on completion, and
  (critically) is on the node that *executed* the move, not the new leader.
- A NEW field (`this.lastSelfMoveCompletionMs`) set where a self-move completes
  (`rebalance-coordinator-lifecycle.js:493` OPERATION_COMPLETED emit /
  `operation-workflow-owner-execution-lane.js:490`) would be **per-node and
  invisible to the new leader** (§1a). A correct signal must be shared: read the
  operations table for "last completed self-move of `entityId` + its
  `completedAt`" — i.e. read the CDC-lagged ledger (§1a, circular/fragile).
- Cooldown window: must exceed the CDC+session settle (order tens of seconds),
  NOT the ~1s priority retry (§1b). This is exactly the band that harms recovery.
- Distinguishing a demotion-triggered gain from a legit gain: **`setLeader` has
  no reason code** for *why* leadership was gained (`:464`, bare boolean). B
  cannot tell "gained after a durability demotion" from "gained after a real node
  loss" without new plumbing from the demotion path.

Net: the LOW-effort in-memory version is inert (§1a); the CORRECT version needs
a shared ledger read + a demotion-reason plumb + a tens-of-seconds window =
MED-HIGH effort on a fragile, lagged signal.

## 3. Does it slow legitimate recovery? — YES

The immediate `enqueueRebalanceCheck` at `:481` exists precisely so control-plane
priority partitions re-plan promptly on leadership gain (recovery). A blanket or
long cooldown delays a genuinely-needed re-plan — e.g. a real node loss during
formation that also happens to follow a recent self-move. Scoping strictly to
"recent self-move for THIS partition" is the intended narrowing, but with no
node-local shared signal it either over-fires (blind → suppresses real recovery)
or reads the lagged ledger. And because the cooldown must be tens of seconds to
outlast the CDC settle (§1b), any recovery that lands inside the window eats the
full delay. The interlock interaction makes this worse (§5): a longer self-move
settle keeps `self_move_in_flight`/`quorum_concentrated` engaged longer, deferring
*other* partitions' admission longer — the exact formation-budget starvation B is
meant to relieve.

## 4. Principled hysteresis or a hack? — TIMING BAND-AID (separate class)

B is a **WHEN** lever (delay the re-plan and hope the view settles). The intended
hysteresis is a **WHICH** lever (change which placement wins so the opposing move
is never PLANNED). They are different classes; B is the band-aid.

- **retainHealthyIncumbents** — `placement-owner-evidence.js:165-179`, read at
  `:359-361`. Confirmed DEAD: no caller in `src/` passes `true`
  (grep: only self-references). It reserves CURRENT valid incumbent nodes into
  the target cohort, feasibility-gated downstream (only keeps a node still in
  `rankedNodeIds`). This is the *principled* fix for the A→B→A: keep the incumbent
  voter set stable across re-plans so the new leader's placement does not flip.
  Node-boundary-immune (it's in the planner, evaluated fresh each plan from shared
  placement rows). Caveat: its charter comment (`:152-164`) is written for the
  load-churn/over-replication case, not durability-demotion; wiring it for
  quorum-spread priority partitions needs its own verification but is the same
  class as the intended lever.
- **INCUMBENT_MOVEMENT_COST** — `placement-owner-constants.js:105` (=4), applied
  at `placement-owner-decision.js:176` inside the DATA_AFFINITY dimension builder
  only. In-score challenge margin so a marginal delta does not flip the winner.
  Extending it to the quorum-spread dimension is also in-score, node-boundary-
  immune, and strictly cleaner than a cooldown.
- **getLeadershipStartDelayMs** — `policy-scheduler-methods.js:165-171`: a random
  jitter to avoid thundering herd, NOT a flap debounce. Irrelevant; does not
  suppress the opposing re-plan.

Conclusion: if any timing/hysteresis mitigation is warranted, wire the in-score
lever (retainHealthyIncumbents for the quorum-spread cohort, or extend
INCUMBENT_MOVEMENT_COST), not a leadership-gain cooldown. B is the weaker,
node-boundary-fragile member of the family.

## 5. Risk + DT

**Risk: MED-HIGH.**
- *Inert-fix hazard (highest):* the plausible LOW-effort in-memory version does
  nothing across the node boundary (§1a) — the worst outcome: looks like a fix,
  passes a single-instance DT, ships, and the cycle recurs live. Burns a
  verification cycle and pollutes the frontier.
- *Delayed recovery:* §3 — a real node loss inside the settle window waits it out.
- *Masks the real bug:* the orphaned ACTIVE session (Path A) survives; steady-
  state durability demotions also get slower to recover from once the immediate
  re-plan is gated.
- *Interlock/serialization interaction:* B does not touch the interlock, so the
  c7a3bf19 ghost re-verify and run-20/22 serialization are structurally intact
  (admission path unchanged, `interlock-admission.js:195-222,283-302`). BUT a
  longer self-move settle window keeps the hold engaged longer → other partitions
  deferred longer → can WORSEN the formation-budget starvation. Net interlock risk
  is a timing-worsening, not a correctness break.

**DT substrate + binding observable.** Compose the two existing bases (research
§7): `dt6-ledger-leader-durability-fitness.test.js` (demotion signal) +
`dt6-rebalancer-formation-self-move-interlock.test.js` (real coordinator +
interlock + setLeader re-plan). Virtual clock (advance past the 60s legal hold +
3× 1s strikes) + seeded RNG (the `getLeadershipStartDelayMs` jitter). Binding
observable: inject an orphaned ACTIVE hold → demote → assert (i) with a recent
self-move signalled, the new leader's `setLeader(true)` does NOT immediately mint
an opposing move type; (ii) a legit recovery (real node loss, NO recent self-move)
still re-plans promptly. **Critical DT design note:** the harness MUST be
MULTI-NODE (distinct rebalancer instances per node), or the node-boundary
blindness (§1a) is hidden — a single-instance DT shares one in-memory state and
would FALSELY pass. This is the make-or-break test for B and the reason a naive
in-memory implementation must not be trusted on a single-instance rig.

---

## RECOMMENDATION

- **NO-GO as a primary fix.** It does not break the cycle (§1); the driver is the
  orphaned ACTIVE session = Path A.
- **GO-WITH-CAVEATS only as post-A defense-in-depth**, and if any hysteresis is
  wired, prefer the in-score lever (retainHealthyIncumbents / INCUMBENT_MOVEMENT_
  COST extension, §4) over a leadership-gain cooldown — same intent, node-boundary
  immune, no recovery-delay band.
- If B is nonetheless attempted, it MUST use a shared self-move signal (not
  in-memory), a tens-of-seconds settle window, and a multi-node DT.

**Confidence:** HIGH that B does not break the cycle; HIGH that the literal
in-memory "recent self-move for THIS partition" version is inert across the node
boundary. Effort: LOW (inert version) / MED-HIGH (correct shared-signal version).
