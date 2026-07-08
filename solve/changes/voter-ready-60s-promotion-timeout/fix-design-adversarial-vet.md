# Adversarial vet — voter-ready-60s fix design (planner voter-read + surplus drain)

READ-ONLY review of `fix-design-planner-voter-read-and-drain.md`. HEAD state as
checked. **Verdict: REFUTE** (Part 1 salvageable; Part 2 cannot fire in the
failing topology). Two independent, code-confirmed kills converge on the same
core defect, and the required fix is precisely the two alternatives (Alt-1 +
Alt-3) the design explicitly rejected.

---

## KILL 1 — the interlock blocks the drain REMOVE at creation (attack 1, HOLDS)

The Part 2 drain is a **REMOVE of `replica_operations-p1`**. Two facts make it a
disruptive ledger self-move that admits **only into an idle ledger**:

- `OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES = {REPLACE, REMOVE}`
  (`rebalance-coordinator-ledger-interlock-admission.js:25-27`). REMOVE is
  disruptive — **not** exempt (only ADD is exempt, :116-121, :136-141).
- `isOperationLedgerPartition` matches exactly `replica_operations`
  (`src/bootstrap/system-partition-classification.js:136-139`). The binding
  failing partition IS `replica_operations-p1` (s13 run3: 229 of 258 guard
  defers).

Creation path for the drain REMOVE:
`runOperationLedgerInterlockAccountedCreate` (:437) → isDisruptiveSelfMove=true →
`assertOperationLedgerSelfMoveGateOpen` (throws if any other create in flight)
AND the async `ensureOperationLedgerSelfMoveSerialized` (:129) →
`resolveDisruptiveSelfMoveConflict(liveOperations, 'replica_operations-p1')`
(:248). That method returns the **first live operation of any kind** (it only
*skips* a same-partition self-move that an owner-RPC read proves terminal, :261-266).

During the stuck window there is ALWAYS a live op: the paired learner r7's
in-flight ADD/REPLACE promotion op (that is why the guard is deferring). So
`resolveDisruptiveSelfMoveConflict` returns it → throws
`operation_ledger_self_move_waiting_for_idle_ledger`. **The drain REMOVE is
emitted-but-blocked.** Deadlock: the wedged REPLACE holds the ledger → blocks the
drain REMOVE → surplus never drains → learner never promotes → REPLACE never
terminates. The only escape is the CL-043 staleness exclusion
(`isLiveOperationLedgerInterlockOperation`, :83-97) after the REPLACE goes stale
past its ~60s step timeout — but that is the exact instant the REPLACE times out
and re-plans a fresh op, so the drain must win a narrow race (attack 2). The fix
at best changes WHICH iteration succeeds; it does not reliably shorten the loop.

For the non-ledger CP partitions (`sql_transaction_participants-p1`,
`sql_write_operations-p1`) the REMOVE is not a self-move, but the failing window
is defined by ledger quorum-concentration → `ensureOperationLedgerQuorumSpreadFirst`
(:315-338) throws `operation_ledger_quorum_concentrated`. Blocked either way,
via a different reason code, in exactly the window the drain is needed.

The design's open question (lines 138-145) flags this but defers it to
"implementation." It is load-bearing, not a detail.

## KILL 2 — hasPendingMove skips the only correct voter (attacks 4/6, HOLDS, independent of the interlock)

`hasPendingMove(replicaId)` matches an in-flight op's replicaId **OR its REPLACE
SOURCE replicaId** (`unified-rebalancer-move-execution.js:132-149`, source via
`getReplaceSourceReplicaIdFromOperationRow`). The surplus 4th voter is the
un-drained REPLACE **source** (`why-no-surplus-drain.md` lines 60-65, case (a)) →
`hasPendingMove` = TRUE → the design's own gate 2 (":368 skip") **skips it**.

The only voters WITHOUT a pending move are the 3 legitimate targets that ARE in
`targetNodes`. The design's "prefer node ∉ targetNodes" therefore finds no
eligible candidate, or falls back to draining a NEEDED voter → the guard re-adds
it → net churn increase (attack 6). In the actual failing topology Part 2 selects
**nothing, or the wrong voter.**

This compounds with the guard's arithmetic (attack 4): draining 4→3 then
promoting the paired learner gives votersAfterPromotion=4 > target 3 AND even
(`partition-service-learner-promotion-methods.js:525-533`). That is tolerated
only when `replacementPromotionAllowed` — i.e. the drained voter WAS the REPLACE
source. So "4→3 unblocks the guard" is true **only if you drain the source** — the
one voter `hasPendingMove` forbids. Drain any other voter and the guard still
refuses (4>3) or you dropped a needed member.

## Attacks 3 and 5 (do NOT independently kill)

- **Attack 3 (3×-refuted trap):** Part 1 changes the OVER-creation cap trigger,
  a different computation than `deficitEffectiveCount` (the mint-side read
  `c78833f0` touched). The anti-regression tuples pin `deficitEffectiveCount`
  (`in-flight-aware-replica-count.js:116` active set; test file header), which the
  design leaves untouched → they stay green. Part 1's `isVoterRole` excludes
  learners, mirroring the guard's `isActiveVoterServiceRowForPromotion` — it is
  the surviving authoritative-read class, not a count approximation. **Part 1 is
  sound.** Minor caution: reading raft_role makes the cap fire EARLIER (promotion
  window), zeroing legitimate spread ADDs sooner — needs the DT + live A/B to
  confirm it doesn't defer honest deficit fills.
- **Attack 5 (two-part framing):** Part 1 alone is insufficient — the 4th voter
  is durable and does not self-clear (confirmation doc). Part 2 is gated ON Part
  1's liveVoters read, so they are coupled and the framing is directionally
  right. But Part 2 is INERT given kills 1+2.

## Why the kills are the SAME defect

Attacks 1, 2, 4, 6 all reduce to: **the fix must drain the wedged REPLACE's
source**, but (a) the interlock blocks a new self-move REMOVE while that REPLACE
is live, and (b) `hasPendingMove` skips the source. The design rejected Alt-1
(interlock owned-drain allowance) and Alt-3 (drive the REPLACE's own remove-leg)
— the two mechanisms it structurally requires. A standalone new planner REMOVE
is exactly the shape both the interlock and hasPendingMove are built to refuse.

## Single most important required change

Part 2 must NOT be a standalone new REMOVE. Break the promote↔drain circular wait
at its source instead: either (Alt-3) reap/re-drive the wedged REPLACE's stalled
remove-leg so the source drains under the existing operation (no new self-move,
no hasPendingMove conflict), or invert the ordering to promote-then-drain; OR
(Alt-1) grant the interlock an explicit owned-surplus-drain allowance AND exempt
the REPLACE source from `hasPendingMove` for that owned drain. Without one of
these, Part 2 is necessary-but-not-sufficient and the doneWhen stays red. Keep
Part 1 (authoritative raft_role count) — it correctly stops further stacking and
is low-risk — but ship it knowing it does not, alone, drain the existing surplus.
