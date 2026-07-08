# Diagnosis: control-plane voter-ready-60s promotion timeout (s13 run3)

Forensic root-cause of the demo's current binding blocker. Read-only disk
forensics over `data/examples/service-data-affinity-demo/node-*.log` (the last
demo run = the `[2/4]` FAILURE). HEAD `33e0026d`.

**Headline (correction to the premise):** the 60s voter-ready timeout is NOT a
raft learner-catch-up stall, NOT a promoting-authority-inert problem, NOT a
re-armed 30s delay, and NOT a read-masking dedup bug. It is the
**learner-promotion over-target voter-count guard** refusing to promote because
the critical control-plane partition is **stuck at 4 active voters against a
target of 3** — the temporary +1 replacement overflow is already consumed and
the drain back to 3 never completes. The learner sits deferred for the full 60s,
the REPLACE fails, and the failure re-plans → churn. The drain that would clear
the 4th voter is itself **skipped by the self-move interlock**
(`self_move_waiting_for_idle_ledger`), so churn ≠ secondary here — it is a
load-bearing co-cause. Two further premise corrections: (i) the on-disk failures
are on `replica_operations-p1` and `sql_transaction_participants-p1`, **not**
`control_plane_publications`; (ii) the "reason" is
`would_exceed_target_replica_count`, not even-voter (the human msg string is a
misleading fixed constant).

---

## 1. What timed out

Grep of `"did not become voter-ready within 60000ms"` across all 5 node logs.
Only **two distinct operations** hard-failed (each logs ~3-5 lines; `"Operation
failed"` with a voter-ready error = 1 on node-1, 1 on node-4, 0 elsewhere):

| replica | partition | host node | op type | op id | timeout at | createReplica at |
|---|---|---|---|---|---|---|
| `replica_operations-p1-r7` | `replica_operations-p1` | node-4 (`dda43d3e…`) | REPLACE | `2ce6372f…` | 11:49:12.401Z | 11:48:11.293Z |
| `sql_transaction_participants-p1-r11` | `sql_transaction_participants-p1` | node-1 (`30065249…`) | REPLACE | `9d84aed7…` | 11:50:40.863Z | ~11:49:40 |
| `sql_transaction_participants-p1-r12` | `sql_transaction_participants-p1` | node-1 (`30065249…`) | REPLACE | `0a71e2a2…` | 11:51:45.812Z | ~11:50:45 |

(`sql_transaction_participants` fired twice back-to-back — r11 then r12 — the
churn signature: each failed REPLACE re-plans the next.)

**Role during the 60s: LEARNER the whole time, not flapping.** For
`replica_operations-p1-r7` the log goes `"Starting as learner (non-voting) - will
promote after catch-up"` (11:48:11.950) → `"Waiting for replica voter-ready
activation"` (11:48:12.221) → then **~50 consecutive** `"Learner promotion
deferred"` lines at ~1s cadence from **11:48:16.954** through the 60s deadline →
timeout at 11:49:12. It never becomes FOLLOWER; it never flaps back to a lower
role; there is exactly one `catch-up` mention (the initial banner), i.e. it is
**not** stuck acquiring the log.

**High replica ordinals (r7, r11, r12) = deep churn.** node-4 has cycled
`replica_operations-p1` through r1,r2,r3,r4,r7; node-1's participants partition is
on r11/r12. These control-plane partitions have been re-placed many times.

## 2. Mechanism — none of (a)-(d); it is (e) the over-target promotion guard

**Code path:** `waitForVoterReadyActivation`
(`src/node/replica-handler-voter-readiness-methods.js:144-189`) polls
`isReplicaVoterReady` (:196) every 250ms until `syncTimeoutMs`
(=`REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS` = `TIME_MS.MINUTE` = 60000, set at
`replica-handler-class.js:140`). `isReplicaVoterReady` returns false while the
replica's role is `LEARNER` (:198). The role is gated by
`checkLearnerPromotion` in
`src/partition/partition-service-learner-promotion-methods.js:456-564`.

**The deferral is uniform and decisive.** Every `"Learner promotion deferred"`
line carries a `reason` field. Across **all 383** deferrals (all nodes, all
partitions) the reason is identical:

```
"reason":"would_exceed_target_replica_count",
"activeVoterCount":4,"learnerCount":1,"targetReplicaCount":3,
"maxAllowedVotersAfterPromotion":4
```

Zero `even_voter_count` reasons; zero `leader_not_discovered`. Mapping to the
guard (`:525-546`): `maxAllowedVotersAfterPromotion = targetReplicaCount(3) + 1
(replacement credit) = 4`. `votersAfterPromotion = activeVoterCount(4) + 1 = 5`.
`5 > 4` ⇒ `wouldExceedTargetReplicaCount = true` ⇒ defer + reschedule
(`scheduleLearnerPromotion(DEFERRED_RECHECK)`). The group already sits at the
temporary overflow of 4 voters, so the new replacement learner can **never**
promote — the +1 credit is already spent by a prior, un-drained replacement.

Why the candidate mechanisms are **excluded**:
- **(a) catch-up stall — NO.** Deferrals begin 5s after create, with only the
  single "will promote after catch-up" banner; the guard is a count check, not a
  match-index check, and it is the thing firing.
- **(b) authority inert / leadership flux — NO (not the proximate cause).**
  `leaderId` is resolved (no `leader_not_discovered` deferrals). The learner is
  eligible except for the count. (Leadership churn contributes upstream to the
  over-target condition, see §4, but the guard itself is not blocked on a
  missing leader.)
- **(c) 30s LEARNER_PROMOTION_DELAY re-armed — NO.** Promotion checks run at ~1s
  cadence (the DEFERRED_RECHECK reschedule), well inside the 60s budget; the 30s
  min-delay is not the binding wait. `raft-replica-base.js:411`'s timer is not
  what holds this — the partition-service promotion path (`:558`) reschedules
  every ~1s.
- **(d) durable promotion masked by local read — NO.** The role genuinely stays
  LEARNER because the guard genuinely refuses; `resolveLearnerPromotionCounts`
  (`:314-353`) already adjusts for local-row visibility. This is a real refusal,
  not a stale read of a promoted replica.

**So the binding proximate mechanism is (e): the over-target voter-count
promotion guard, tripped by a persistent 4-voter overflow on a target-3
control-plane partition.**

## 3. Why control-plane partitions specifically (and NOT control_plane_publications)

- These are `CRITICAL_SYSTEM_PARTITION_IDS` — the only partitions that gate
  activation on voter-readiness (`shouldGateActivationOnVoterReadiness`,
  `replica-handler-voter-readiness-methods.js:38-89`). Data partitions do not
  wait on voter-ready, so they never emit this timeout. The blocker is
  structurally confined to the control-plane set.
- Control-plane partitions are the ones the rebalancer churns hardest during
  cold formation (self-moves, spread REPLACEs), so they are the ones that reach
  and get stuck at the +1 overflow.
- **Premise correction:** `control_plane_publications` did **not** hard-timeout
  in this run. It shows 42 `"Learner promotion deferred"` and 3 voter-ready waits
  (same mechanism) and churned r1-r6, but **zero** `"did not become
  voter-ready"` and zero `"Operation failed"`. Its learners cleared before 60s.
  The on-disk hard failures are `replica_operations-p1` and
  `sql_transaction_participants-p1`. The mechanism is shared across the whole
  critical set; *which* partition tips into the 60s hard-timeout is
  run-variable (trap-6, "N runs = N modes"). Do not over-fit to
  `control_plane_publications`.

## 4. Secondary / co-causal factors — the drain is interlock-blocked

The over-target 4-voter condition does not self-clear because the corrective
drain is being skipped:

- On `replica_operations-p1` the rebalancer logs repeated `"Rebalancing move
  skipped"` with `self_move_waiting_for_idle_ledger` at 11:45:56 and
  11:49:14-11:49:20 — i.e. across the exact window r7 is stuck. 32
  `self_move_waiting_for_idle_ledger` + 8 `self_move_in_flight` references touch
  this partition.
- Only **2** REMOVE ops ever run on `replica_operations-p1`; the one targeting
  node-4 (`c02d2af4`) does not complete until **11:52:04** — *after* r7's
  11:49:12 timeout, and it removes the *failed learner*, not the over-target
  voter. So during the binding window there is no successful drain of the 4th
  voter.

This makes the self-move interlock churn a **co-cause**, not merely "secondary"
as the ground-truth report framed it: the interlock is what prevents the drain
that would let promotion succeed.

**Terminal cascade → demo abort.** At **11:54:36.251** the ratings CREATE TABLE
provisioning fails: `Unable to satisfy minimum routable provisioning cohort …
required=2, provisionable=0, target=3`, with **all 5 candidate nodes rejected**
for `operation_ledger_quorum_concentrated` (`sql-query-engine` /
`table-creation-service`, partition `tbl-ba8b940f…-p1`). The operation ledger
(`replica_operations-p1`) being over-target/quorum-concentrated is exactly what
starves the admissible provisioning set → `[2/4]`. So: over-target voter guard →
stuck REPLACE churn on the ledger → ledger quorum-concentrated → new-table
provisioning rejected everywhere → demo abort.

## 5. Ranked candidate levers (diagnosis only — DO NOT implement)

1. **Unblock the drain of the over-target voter on churning control-plane
   partitions (highest-value, addresses the root).** The 4-voter overflow must
   clear. Investigate why the count-neutral drain REMOVE on
   `replica_operations-p1` is skipped by `self_move_waiting_for_idle_ledger`
   during formation and give the drain leg of an in-flight REPLACE priority over
   (or exemption from) the self-move idle-ledger interlock, so the group returns
   to 3 voters and the paired learner can promote.
   - *Fixes:* removes the persistent overflow → the promotion guard passes
     naturally → no 60s timeout → no ledger quorum concentration → provisioning
     admits.
   - *Blast radius:* HIGH — touches the interlock that runs 20/22 and the
     REPLACE ordering on the most-dangerous seam. Must be carved narrowly (drain
     leg of an owned in-flight replacement only).
   - *Proof:* DT that a drain REMOVE proceeds while a sibling self-move is
     in-flight (red-on-revert on the interlock exemption); then aggregate live
     A/B (2-pre/2-post) watching `would_exceed_target_replica_count` deferral
     count → 0 and voter-ready timeouts → 0. Live A/B is mandatory (hot-path,
     load-amplification risk per the s9 `692c9dbb` lesson).

2. **Make the replacement-overflow promotion path tolerate the transient +1
   correctly / promote-before-remove for owned replacements.** If the design
   intent is add→promote→remove (temporary 4 voters), the guard's
   `maxAllowedVotersAfterPromotion = target+1` is *consumed by a stale prior
   overflow*. Distinguish "this REPLACE's own overflow" from "a leftover
   overflow" so an operation-owned replacement can promote even when
   `activeVoterCount == target+1`, provided its own paired REMOVE is queued.
   - *Fixes:* lets the specific replacement complete, which then drives its own
     REMOVE, unwinding the overflow.
   - *Blast radius:* MEDIUM — changes raft voter-count safety on control-plane
     groups; risk of a genuine even/over-voter window. Needs the
     `operationOwnedCriticalReplacementPromotionAllowed` path (already at
     `:500-503`) audited — it exists but did not fire here (`hasOwnedAddLikeOperation`
     apparently false for r7; worth confirming why).
   - *Proof:* DT on `checkLearnerPromotion` with activeVoter=4/target=3/owned
     replacement ⇒ promote; red-on-revert; plus live A/B.

3. **Diagnose why `hasOwnedAddLikeOperation` was false for r7 (cheap, may be the
   real bug behind lever 2).** The guard grants a promotion credit for an
   operation-owned add-like op (`:487-491`, `getInFlightAddLikeOperationReplicaIds`).
   If r7's own REPLACE op row was not visible/terminal-classified at check time,
   the learner is denied its own credit. Verify from the SERVICES/REPLICA_OPERATIONS
   cache state at 11:48:16.
   - *Blast radius:* LOW if it's a visibility/classification fix.
   - *Proof:* DT red-on-revert on the operation-visibility read.

4. **Raise `syncTimeoutMs` (60000ms) — REJECT as a root fix.** Per project norm:
   the 60s never fires in healthy runs, so this is a real stall, not a tight
   budget. A longer timeout only lengthens the churn window; the overflow never
   clears on its own. Do not pursue except as a diagnostic to confirm the
   partition eventually settles.

**Recommended:** lever 3 first (cheap disambiguation), which decides between
lever 1 (interlock blocks the drain) and lever 2 (guard denies the owned
replacement its credit). They are not mutually exclusive.

## 6. Open questions / what a fresh instrumented run would need

- **Which of r1-r4 is the un-drained 4th voter, and is a REMOVE for it ever
  planned?** The on-disk logs show the drain move *skipped*, but not a clear
  "REMOVE planned then blocked" for a specific old voter. A run that logs, per
  promotion-defer, the *identities* of the counted active voters (not just the
  count) would confirm real-vs-phantom over-target definitively. (Current
  evidence strongly favors real: node-4 saw 4 distinct voter ordinals r1-r4.)
- **Why `hasOwnedAddLikeOperation` is false for the failing learner** — needs the
  REPLICA_OPERATIONS cache snapshot at check time (the op row's `type`/`status`
  as `getInFlightAddLikeOperationReplicaIds` sees it). This is the single most
  decision-relevant missing signal.
- **Is the 4-voter overflow durable or a local-cache artifact on the target
  node?** `countActiveVoters` reads the SERVICES cache; a cross-node membership
  snapshot (raft config quorum) at 11:49:00 would exclude the phantom-count
  hypothesis. Absence of a durable membership dump means I cannot 100% exclude a
  cache-count inflation, though the distinct-ordinal evidence argues against it.
- **Discrepancy with the ground-truth report** ("6 control_plane_publications
  replica failures; 4-voter overshoot=0"): the on-disk logs show 0
  control_plane_publications voter-ready timeouts and a live activeVoterCount=4,
  so the report's overshoot=0 metric (likely `DEFER_ADD_OVER_TARGET` mint-side,
  which genuinely is 0) does not observe this *promotion-side* transient
  overflow. A fresh run should add a `voter_over_target_promotion_block` counter
  keyed on `would_exceed_target_replica_count` deferrals so this overflow is
  measured directly rather than inferred.

## 7. Verification addendum (main-agent, disk + source re-check)

Re-verified the load-bearing facts directly:

- **Guard source matches** (`partition-service-learner-promotion-methods.js:525-546`):
  `maxAllowedVotersAfterPromotion = targetReplicaCount + (replacementPromotionAllowed
  || singleVoterExpansionPromotionAllowed ? 1 : 0) + priorityRecoveryAdditionalVotersAllowed`;
  `votersAfterPromotion = activeVoterCount + 1`; defer when `votersAfterPromotion >
  maxAllowedVotersAfterPromotion`. Log reason literal is `WOULD_EXCEED_TARGET_REPLICA_COUNT`.
- **Log distribution (run3, all 5 nodes):** 13 × "did not become voter-ready within
  60000ms"; **383** `would_exceed_target_replica_count` deferrals, **uniformly**
  `activeVoterCount:4, learnerCount:1, targetReplicaCount:3,
  maxAllowedVotersAfterPromotion:4`. 16 `self_move_waiting_for_idle_ledger`
  references on `replica_operations-p1`; only **1** REMOVE `operationType` ever runs.

- **CORRECTION to the lever ranking — lever 3 (`hasOwnedAddLikeOperation`) is a
  RED HERRING.** `maxAllowedVotersAfterPromotion` is **4** in every single deferral.
  With `targetReplicaCount=3`, a value of 4 means the **+1 replacement/recovery credit
  is ALREADY being granted** (the ceiling is target+1, not target). The refusal is
  therefore NOT a missing owned-replacement credit: even with the credit applied,
  `votersAfterPromotion = 4 + 1 = 5 > 4`. No per-replacement credit (which grants at
  most +1 over target) can ever admit a **5th** voter into a group that is already
  stacked at **4**. So investigating why `hasOwnedAddLikeOperation` is false (subagent
  lever 3, and half of lever 2) cannot green this — it would at best re-confirm a
  ceiling of 4 that is already in force.

- **Consequence:** the ONLY resolutions are (lever 1) **drain the stacked 4th voter**
  back to 3 so a subsequent promotion 3→4 is admitted, or a design change to the
  overflow model itself. Lever 1 is the true root fix, and its blocker is the
  self-move idle-ledger interlock skipping the drain REMOVE. This squarely implicates
  the existing self-move-interlock seam (quest `formation-ledger-self-move-blocks-cluster-ops`
  / `formation-control-plane-move-interlock`), NOT a new promotion-credit path.
  NOTE the memory-recorded danger: narrowing/exempting this interlock is repeatedly
  flagged unsafe (runs 20/22, "most-dangerous seam") — any lever-1 fix must be carved
  to the drain leg of an owned in-flight replacement ONLY, DT red-on-revert, and
  aggregate 2-pre/2-post live A/B (s9 `692c9dbb` load-amplification lesson).
```
