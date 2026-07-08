# Fix design: authoritative voter-count read + surplus-voter drain (voter-ready-60s root)

> **ADVERSARIAL VET OUTCOME (verdict REFUTE on Part 2; both kills verified against
> source): see `fix-design-adversarial-vet.md` and the "Revised plan" section at
> the top. Part 1 SURVIVES and should be tried ALONE first; Part 2 as drafted
> (standalone new REMOVE) is INERT and is superseded by the revised plan.**

## Revised plan (post-vet — this supersedes Part 2 below)

The vet killed the standalone surplus-REMOVE (Part 2) with two independent,
source-verified defects:

1. **Interlock kill.** REMOVE ∈ `OPERATION_LEDGER_DISRUPTIVE_SELF_MOVE_TYPES`
   (`rebalance-coordinator-ledger-interlock-admission.js:25-27`; only ADD exempt).
   A new REMOVE of `replica_operations` "admits only into an idle ledger"; during
   the stuck window a live op always exists → `self_move_waiting_for_idle_ledger`
   → the drain is never created.
2. **hasPendingMove kill.** `hasPendingMove` matches a REPLACE's SOURCE id
   (`unified-rebalancer-move-execution.js:142-146`). The surplus voter IS the
   un-drained REPLACE source → the design's own gate 2 skips exactly the voter it
   must drain.

Both reduce to: the existing durable surplus can only be cleared by draining the
wedged REPLACE's source, which the interlock forbids (new self-move) and
hasPendingMove skips — the two seams (Alt-1 interlock, Alt-3 remove-leg) the
analysis had rejected.

**Revised recommendation — a phased plan:**

- **Phase 1 (SAFE, do first): ship Part 1 alone — authoritative `raft_role` voter
  count in the over-creation cap.** This is low blast-radius (a read change on a
  level-triggered cap that fails safe by deferring) and it attacks the STACKING
  CAUSE: with the cap counting by role, it fires DURING the promotion window and
  stops admitting the extra replacements that pile the group past target. **The
  durable 4-voter surplus in run3 is a downstream CONSEQUENCE of the blind cap —
  if the cap never lets the group over-admit, the durable surplus need never
  form.** So Part 1 alone may green the demo without any drain. This is the
  hypothesis to test with live A/B FIRST.
- **Phase 2 (only if Phase 1 live A/B still shows a durable surplus + timeouts):**
  the existing-surplus drain genuinely requires touching a dangerous seam —
  either re-drive the wedged REPLACE's stalled remove-leg / invert to
  promote-then-drain (Alt-3), or grant an interlock owned-drain allowance AND
  exempt the paired source from `hasPendingMove` (Alt-1). High blast radius (runs
  20/22 "most-dangerous seam"); design separately, only if the data demands it.

Net: the low-risk half (Part 1) is worth implementing and A/B-testing on its own;
the high-risk half (drain) is deferred until proven necessary. Everything below
is the pre-vet draft, kept for the Part-1 detail and the rejected-lever record.

---

Draft design (NO code yet — for review). Root, mechanism, and the two-defect
structure are empirically confirmed (see `instrumented-confirmation-s13.md`,
`why-no-surplus-drain.md`, `alternatives-synthesis.md`). Scope: the demo's binding
blocker — critical control-plane partitions stack at 4 active voters vs target 3,
the paired REPLACE learner can never promote (4→5 > ceiling 4), times out at 60s,
churns the ledger to quorum-concentration, and starves provisioning → `[2/4]`.

## The two defects (both at one site)

`src/rebalancer/move-planner-move-calculation-methods.js:329-347` — the
control-plane over-creation cap:

```
if (!cleanupOnlyWhilePending && addMoves.length > 0 &&
    this.isControlPlanePriorityPartition() &&
    inFlightAccounting.activeCount > targetReplicaCount) {
  ... log DEFER_ADD_OVER_TARGET ...
  addMoves.length = 0;               // <-- only stops ADDs; emits no REMOVE
}
```

- **Defect 1 (stacking):** `inFlightAccounting.activeCount`
  (`in-flight-aware-replica-count.js:116`) counts `status === ACTIVE` rows. During
  the promotion window a promoted voter reads `raft_role = follower` but
  `status = creating|syncing` — so the cap under-counts (2–3 while the true voter
  count is 4) and keeps admitting replacements → the group over-creates. (run3:
  374 creating + 113 syncing divergent rows; under-count up to 2.)
- **Defect 2 (no drain):** once the surplus reaches `status = active` (run3: all
  258 guard defers show 4 all-active voters on distinct nodes), the cap DOES see
  `4 > 3` — but only zeroes `addMoves`. No REMOVE is ever emitted. There is **no**
  global "voterCount > target → remove surplus" path anywhere in `calculateMoves`
  (the only REMOVE sites are failed-cleanup `:216` and per-node spread-excess
  `:455`, both keyed on `status===ACTIVE` placement; run3 confirms neither drains
  an over-target voter). So the overshoot is durable → 60s promotion timeout.

## The fix — one authoritative read + one new drain branch

### Part 1 — count voters authoritatively (fixes defect 1)

Introduce an authoritative raft-voter count for the control-plane over-target
decision, matching the promotion GUARD's own source
(`partition-service-learner-promotion-methods.js:644` `countActiveVoters`, which
counts rows where `raft_role ∈ ACTIVE_VOTER_ROLES {leader,follower,candidate}` and
status is live/not-removing). The rebalancer rows ALREADY carry `raft_role`
(`move-planner-move-calculation-methods.js:238`). Compute:

```
liveVoters = currentReplicas.filter(r =>
  r.node_id &&
  r.status ∉ {removing, failed, removed} &&
  isVoterRole(r.raft_role))        // leader|follower|candidate, NOT learner
```

Use `liveVoters.length` (NOT `inFlightAccounting.activeCount`) as the over-target
trigger. This is a **row-op-linked authoritative read**, not a count heuristic —
it reads the same durable raft role the guard enforces on, so the two reads agree
by construction (closes the disagreement at the source). It is the surviving fix
class (`c7a3bf19` cache-bypass, `c78833f0` row-op-linked); the 3× refuted forms
were all count APPROXIMATIONS (occupied-count, all-phase-inflight, min-heuristics)
— this is not one of them.

### Part 2 — plan a surplus-voter drain (fixes defect 2, verdict B: new branch)

When `liveVoters.length > targetReplicaCount` on a control-plane priority
partition, additionally emit **exactly one** surplus-voter REMOVE per planning
tick:

- **Which voter:** a non-leader voter (`raft_role ≠ leader`) preferring one whose
  `node_id ∉ targetNodes` (`:232` set); tiebreak deterministically (e.g. lowest
  replicaId) for idempotence across ticks.
- **Safety gates (reuse existing):**
  1. `buildPriorityStandaloneRemoveSafety(replicaId)` (`:88-113`) — refuses if
     removal breaks the required priority spread.
  2. `hasPendingMove(replicaId)` and `replicasInRemoving` skips (`:368`,`:200`) —
     never double-schedule; never touch a replica already draining.
  3. Dispatch-time quorum floor `projectQuorumAfterRemoval`
     (`operation-workflow-remove-safety-evaluator.js:47-102`) — the authoritative
     backstop that removal keeps a healthy quorum.
  4. **Odd-count preservation:** only drain when `liveVoters > target` AND the
     post-removal count is the target (draining 4→3 restores the odd at-target
     group the guard is waiting to promote INTO; never drain 3→2).
- **One drain per tick** (mirror the REPLACE serialization cap `:523-540`) so a
  transient overshoot is not over-drained; level-triggered — re-evaluated each
  tick until the group is back at target.

4→3 removes the surplus → the guard's `activeVoterCount` drops to 3 → the paired
learner promotes (3→4 within the ceiling) → no 60s timeout → no ledger
quorum-concentration → provisioning admits.

## Scope boundary

Control-plane priority partitions only (`isControlPlanePriorityPartition()`),
matching the existing cap's scope. Data partitions do not gate activation on
voter-readiness and never hit this path. SPLIT/other flows untouched.

## Why not the rejected levers (recap)

Interlock exemption (Alt-1) and remove-safety coupling (Alt-3) are dead-ends — no
voter-drain REMOVE exists for them to gate. Downstream provisioning tolerance
(Alt-4) already exists, already fired, already failed — masking-only. This fix is
the planner read+plan change all four analyses converged on.

## Risks & mitigations

| risk | mitigation |
|---|---|
| Standalone REMOVE races the guard's re-promotion or a stuck REPLACE leg → double-drain below quorum | `hasPendingMove` + `replicasInRemoving` skips + `projectQuorumAfterRemoval` floor + one-drain-per-tick + odd-count guard (never 3→2) |
| Hot-path churn amplification (s9 `692c9dbb` load-regression precedent) | Level-triggered single drain (fails safe by NOT acting); mandatory 2-pre/2-post live A/B before keeping |
| Re-treads a 3×-refuted count heuristic | Trigger is the authoritative `raft_role` read (guard's own source), not a count approximation; keep the 3 refuted-form anti-regression DTs from the mint-side quest green |
| Draining the wrong voter (removing a needed spread member) | `buildPriorityStandaloneRemoveSafety` spread gate + prefer node ∉ targetNodes |

## Proof plan

1. **DT red-on-revert (deterministic):**
   - Defect 1: a control-plane partition with a `raft_role=follower / status=creating`
     row + `addMoves` present ⇒ over-target cap FIRES on the authoritative count
     (asserts `addMoves` zeroed); reverts to blind on the old `status===ACTIVE` read.
   - Defect 2: `liveVoters=4 / target=3 / all status=active` ⇒ exactly one surplus
     REMOVE emitted for a non-leader non-target voter; none when `liveVoters=3`;
     none when the only surplus is leader / has pending move / fails spread.
   - Keep green the 3 refuted-form anti-regressions
     (`in-flight-aware-drain-phase-replace-credit.test.js` tuples).
2. **`npm run dt:prove`** on both new tests over the touched src.
3. **Instrumented re-confirm (optional):** the `voter_over_target_promotion_block`
   counter + `TEMP` voter-read diag show the over-target-defer count trend to 0.
4. **Mandatory aggregate live A/B (2-pre/2-post):** observables —
   `would_exceed_target_replica_count` deferrals → 0, voter-ready-60s timeouts → 0,
   AND a surplus-voter REMOVE actually planned+executed on a stacked CP partition
   (proving the drain fires, not just that the symptom disappeared). Hot-path
   load-amplification is the specific regression to rule out.

## Open implementation sub-questions

- Does `isVoterRole` need `candidate` included? (guard's `ACTIVE_VOTER_ROLES` has
  it; a candidate is a transient voter — include for parity with the guard.)
- Confirm the drain REMOVE, once emitted, actually DISPATCHES (Alt analyses showed
  in-flight REMOVEs targeted only the failed learner; verify the new surplus REMOVE
  is not itself caught by `cleanupOnlyWhilePending` or the self-move interlock at
  creation — it is a REMOVE of `replica_operations`, a ledger self-move, so it MAY
  hit `ensureOperationLedgerSelfMoveSerialized`; if so, the drain must be created
  in a window the interlock permits, or the design needs the interlock's
  owned-drain allowance after all — RESOLVE during implementation with a targeted
  DT + the first live A/B).
