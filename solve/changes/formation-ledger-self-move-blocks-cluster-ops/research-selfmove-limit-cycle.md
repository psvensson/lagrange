# Rung-0 research — why replica_operations-p1 self-moves ~25× (run-5)

Repo `/media/.../projects/something`. Post-`c78833f0` demo run "run-5"
(`data/examples/service-data-affinity-demo/node-{0..4}.log`, span 21:00:41 →
21:16:45). Adversarial; file:line + log-timestamp cited. Companion to
`research-interlock-serialization.md` (run-4).

## TL;DR VERDICT

The ~25 self-moves are **NOT 25 distinct legitimate relocations** and **NOT a fast
electoral flap**. They are a **slow (~2-min-period) leadership-flap LIMIT CYCLE**,
driver = the **durability-fitness leadership demotion**
(`src/partition/partition-service-durability-fitness.js:181-217`) forced by an
**orphaned ACTIVE participant write-session held on the ledger leader past its legal
window** (run-23 "zombie" class; `expiredActiveSessionCount:1`). The heal of that
session is *deferred until demotion by design*
(`src/partition/partition-service-constants.js:322` — a leader must not bare-rollback,
it would re-mint acked raft indices). Each demotion hands leadership to a new node,
which **immediately re-plans the ledger spread from a CDC-lagged view**
(`src/rebalancer/unified-rebalancer-lifecycle-base.js:475-483`) and mints
**opposing move types** (REPLACE → ADD `increase_replica_count` → REMOVE), never
converging. Within each leadership epoch the scheduler additionally re-emits
budget-skipped moves. Net: **25 "Executing rebalancing move", 17 skipped, only 4
"Creating operation" / 6 "Operation completed"** — a re-plan storm layered on a
leadership-flap cycle, not 25 real moves.

There is **no damping wired for the ledger quorum-spread self-move**:
`retainHealthyIncumbents` is dead (`placement-owner-evidence.js:165`, never passed
`true`), and the in-score `INCUMBENT_MOVEMENT_COST` hysteresis
(`placement-owner-constants.js:94`) exists only for the `DATA_AFFINITY` dimension,
not for quorum-spread. The only flap guard is `deferCandidacy`
(`durability-fitness.js:308`), which stops the *unfit* node re-winning but does
nothing to damp the *new* leader's immediate re-plan.

---

## 1. What actually moved — decisive count (refutes "25 legit moves")

`grep '"entityId":"replica_operations-p1"'` message tallies, run-5:

| signal | count | meaning |
| --- | --- | --- |
| `Executing rebalancing move` | 25 | planning-dispatch attempts (the "25 self-moves") |
| `Rebalancing move skipped` | 17 | skipped: `budget_exceeded` (majority), `conflicting_operation_in_flight`, `safety_blocked` |
| `Creating operation` | **4** | operations actually minted |
| `Operation completed` | **6** | operations actually completed |
| `Deferring spread-driven count-increasing ADD … at/over target` | 4 | over-target symptom (was ~148 pre-`c78833f0` → the fix held) |

So the "25" is **25 attempts, ~4 real operations**. `c78833f0` DID work
(over-target deferrals 148 → 4) — the residual churn is a *different* mechanism.

## 2. The move-type oscillation — the limit-cycle signature

`Executing rebalancing move` timeline (node, moveType, reason):

- `21:01:10–12` **node-0** ×3 `replace` (`node_not_in_target` / `replace_replica`) — legit first spread off the seed.
- `21:01:28–59` **node-1** mix of `add` (`increase_replica_count`) + `replace` — **over-creates voters**.
- `21:03:55–04:11` **node-0** ×6 `remove` — **sheds** the voters node-1 added.

REPLACE → ADD → REMOVE across three leadership epochs = the classic
"plan on a stale view, move, view flips, plan the opposite" A→B→A oscillation.
Real churn confirmed: `CREATE_REPLICA` handled 5×, `REMOVE_REPLICA` handled 4× —
the cluster created replicas then removed them. Net convergence: none.

## 3. The driver — durability-fitness demotion (exact correlation)

`replica_operations-p1` raft + rebalancer leadership timeline (both move together):

```
21:01:07  node-0 Became   (seed, bootstrap-concentrated)
21:01:28  node-0 Lost → node-1 Became      ← SELF-MOVE spread relocates leadership (legit, run-4 pattern)
21:03:49  node-1 Lost → node-0 Became      ← DURABILITY DEMOTION
21:04:13  node-0 Lost → node-1 Became      ← DURABILITY DEMOTION
21:16:45  node-1 Lost (teardown)
```

Demotions 2 and 3 correlate to the millisecond with the stuck-transaction /
unfit sweep:

```
node-1:  21:03:46.970, 21:03:48.605, 21:03:49.605  "Stuck transaction heal deferred … waiting for durability-fitness demotion"  (3 strikes, 1s apart)
         21:03:49.606  "Replica local durability is unfit for leadership …"      → 21:03:49.606 Lost leadership
         21:03:55.614  "Replica local durability recovered"   (AFTER losing leadership — the session rolled back once non-leader)
node-0:  21:04:11.132, 21:04:12.391, 21:04:13.706  "Stuck transaction heal deferred …"  (3 strikes)
         21:04:13.706  "unfit for leadership"                 → 21:04:13.707 Lost leadership
```

The stuck line carries `"role":"leader","expiredActiveSessionCount":1` — an
**ACTIVE** (not prepared) write session held past its legal window. Post-demotion
it is reclaimed: `"Active transaction held beyond its legal window; rolled back
(orphaned participant hold — run-23 zombie class)"` ×3 (once per demotion).

### Causal chain (the cycle)

1. A participant write-session (2PC ACTIVE hold) on the ledger leader is held open
   past its legal window (`LEADER_DURABILITY_LEGAL_HOLD_MS = PREPARED_HOLD_TIMEOUT_MS
   = 60000`, `durability-fitness.js:31-32`, `control-plane/timeout-budget.js:21`).
2. `enforceLeaderDurabilityFitness` (`durability-fitness.js:181`) accrues 3 strikes
   (`LEADER_DURABILITY_STRIKE_LIMIT=3`, :33; :203-206) at 1 Hz → `unfit`.
3. Heal cannot roll back on a leader (would re-mint acked indices), so it is
   **deferred until demotion** (`partition-service-constants.js:322`).
4. `resolveLeaderDurabilityUnfitConsequence` → `performTrackedLeaderDemotion`
   (`durability-fitness.js:316-321`) sheds leadership.
5. New leader's `setLeader(true)` fires
   `enqueueRebalanceCheck(PERIODIC_CHECK)` + `scheduleNextCheck`
   (`unified-rebalancer-lifecycle-base.js:475-483`) — **immediate re-plan, no debounce**.
6. New leader re-plans the ledger spread from its own CDC-lagged voter-count view →
   mints an OPPOSING move (`add` where the last leader `replace`d, `remove` where the
   last `add`ed) → creates a new replica operation → new ACTIVE participant session
   on the ledger → back to (1).

Period ≈ the 60s legal hold + 3s strikes + election ≈ ~2 min. Within a 120s
formation budget that is 2–3 cycles: enough to burn the budget, never converge,
and (via the §1 interlock research) hold every other partition's ops behind
`self_move_in_flight` / `quorum_concentrated`. After 21:04:23 node-1 holds
leadership to teardown, but the cluster stays wedged (completions plateau 53→54,
12–13 ops in flight) — the flap early in formation left the residual stuck state.

## 4. Mechanism verdict (answering the 4 candidates)

1. **Leadership flap** — CONFIRMED as the driver. 3 handoffs; #1 is legit
   self-move-induced, #2 and #3 are durability-fitness demotions (exact correlation §3).
2. **Re-planning oscillation** — CONFIRMED and *caused by* (1). Each demotion →
   immediate re-plan (`lifecycle-base.js:475-483`) → opposing move type. Plus
   within-epoch re-emission of budget-skipped moves inflates the "25".
3. **Interlock interaction** — the 17 skips include `conflicting_operation_in_flight`
   / `safety_blocked`; the interlock is the *victim/amplifier* (§1 research) but not
   the driver of the self-move count.
4. **Genuine limit cycle vs many legit moves** — TRUE LIMIT CYCLE. Decisive: only
   4 ops created / 6 completed, and the move type reverses across leaders
   (replace→add→remove). Not 25 distinct relocations.

## 5. Existing damping — none engages for the ledger self-move

- `retainHealthyIncumbents`: dead (`placement-owner-evidence.js:165-166,361`; no
  caller passes `true`). Epic §64-70 already flags this.
- In-score hysteresis `INCUMBENT_MOVEMENT_COST` (`placement-owner-constants.js:94`,
  `placement-owner-decision.js:121`): scoped to `DATA_AFFINITY`, not quorum-spread.
- `getLeadershipStartDelayMs` (`unified-rebalancer-policy-scheduler-methods.js:165-171`):
  a random 0..priorityRetryDelay *jitter*, NOT a flap debounce — does not suppress
  a re-plan that immediately re-mints the opposing move.
- `deferCandidacy` (`durability-fitness.js:308`): stops the *unfit* node re-winning;
  irrelevant to the *new* leader's re-plan.

## 6. Recommended fix direction (must not weaken run-20/22 or c7a3bf19)

Two layers; primary is (A) — it removes the driver, not the symptom.

**(A) PRIMARY — stop the ledger leader's ACTIVE participant session from orphaning
during formation (transaction-lifecycle fix).** The demotion is a *correct* safety
response (run-23); the bug is that an ACTIVE 2PC write session on the ledger is left
open >60s. Root-cause where that session comes from — most likely a coordinator
operation-lifecycle write / 2PC participant on `replica_operations` whose commit is
stranded while the interlock defers ledger writes or a lane starves. Make that
session **COMMIT or cleanly close within its budget** (not bare-rollback on the
leader — that is the exact hazard the deferral exists to avoid). This breaks the
cycle at (1): no orphaned hold → no demotion → single leadership epoch → the spread
converges. Does NOT touch the interlock (run-20/22 intact) or the c7a3bf19 ghost
re-verify.
*Risk: HIGHEST blast radius (run-23 transaction-lifecycle area). Must verify no
leader bare-rollback reintroduced (re-mints acked indices → follower truncation).*

**(B) DEFENSE-IN-DEPTH — re-plan hysteresis / self-move cooldown on leadership
gain.** At `setLeader(true)` for a control-plane priority partition, if a
same-partition self-move completed within a recent window, defer the fresh spread
re-plan (a leadership-gain settle keyed on recent self-move, not a blanket delay) so
a new leader does not immediately re-mint an opposing ADD/REMOVE from a CDC-lagged
view. Damps the cross-epoch oscillation even if a demotion still occurs.
*Risk: MODERATE. Must not stall a legitimate first spread — gate strictly on
"recent self-move for THIS partition", never a blanket leadership-start delay.*

**Do NOT** (per the run-4 research + memory): narrow the interlock (weakens
run-20/22, and `quorum_concentrated` would still gate everything); add a count
heuristic to the move planner (3 prior adversarial verifies refuted count-based
fixes); add a new buffering/cache path.

## 7. Deterministic reproduce (DT substrate)

Compose existing bases:
- `test/convergence/dt6-ledger-leader-durability-fitness.test.js` — demotion signal
  (detection + `performTrackedLeaderDemotion`).
- `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js` — real
  `RebalanceCoordinator` + interlock + `setLeader` re-plan path.

Binding observable (red-on-revert): with virtual clock (advance past the 60s
`LEADER_DURABILITY_LEGAL_HOLD_MS` + 3× 1s strikes) and seeded RNG (the
`getLeadershipStartDelayMs` jitter), inject an orphaned ACTIVE participant hold on
the ledger leader mid-self-move → assert (i) durability-fitness demotes, (ii) the
NEW leader's `setLeader(true)` re-plans and mints an OPPOSING move type
(add-after-replace / remove-after-add) = the cycle, (iii) count-of-distinct-ops keeps
rising without the voter set converging to ≤target/de-concentrated. With fix (A) the
session commits before the legal hold → no demotion → spread converges in a single
leadership epoch with no move-type reversal and the dependent other-partition op
admits. The live-demo observable: cold formation quiesces (no plateau at 53–54; the
12–13 in-flight drain) and ratings load completes — scenario 3× consecutive.

## Key file:line index
- Durability demotion (driver): `src/partition/partition-service-durability-fitness.js:181-217` (strike limit :33, legal hold :31-32), consequence/demote :274-323, `deferCandidacy` :308.
- Heal-deferred-until-demotion rule: `src/partition/partition-service-constants.js:322` (+ unfit msg :250-254).
- Legal hold value: `src/control-plane/timeout-budget.js:21` (`PREPARED_HOLD_TIMEOUT_MS: 60000`).
- Re-plan on leadership gain (no debounce): `src/rebalancer/unified-rebalancer-lifecycle-base.js:475-483`; jitter-only delay `unified-rebalancer-policy-scheduler-methods.js:165-171`.
- Dead hysteresis: `src/rebalancer/placement-owner-evidence.js:165-166,361` (`retainHealthyIncumbents`); DATA_AFFINITY-only margin `placement-owner-constants.js:94`.
- Interlock (amplifier, not driver): `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:195-222` (`self_move_in_flight`), `:315-338` (`quorum_concentrated`).
