# Alt-2 analysis: upstream anti-stacking (prevent the 4-voter stack)

READ-ONLY analysis of the s13 run3 binding blocker. Verdict at top; evidence
and code trace below. HEAD `33e0026d`. Ground truth:
[`diagnosis-s13-run3.md`](diagnosis-s13-run3.md).

## VERDICT: viable-but-risky — a churn-reducer, NOT a sufficient root fix

**Alt-2 is real and the gate it needs ALREADY EXISTS** — the critical-partition
REPLACE serialization cap (`move-planner-move-calculation-methods.js:523-540`)
and the over-creation cap (`:329-347`). The group did not stack because those
gates are missing or mis-designed; it stacked because their **INPUT is a
cache-visibility read that goes transiently blind during the REPLACE
drain-phase leader handoff**. So Alt-2 is not "add a serialization gate" (it's
there); it is "make the existing gate's count authoritative."

- **LOWER blast radius than Alt-1.** Alt-2 touches the planner's *mint* decision
  (`calculateMoves`), which is level-triggered and fails safe by deferring to the
  next tick. It does **not** touch the self-move / remove-safety interlock seam
  that memory repeatedly flags unsafe to narrow (runs 20/22, "most-dangerous
  seam").
- **But insufficient alone.** Capping the overshoot at +1 stops the *runaway*
  churn (r5→r6→r7) but leaves a **persistent 4th voter**; every REPLACE is
  transiently +1 by design (add→promote→remove), and the remove is what the
  interlock skips. The residual 4-voter group is still over-target /
  quorum-concentrated → still starves the ratings provisioning cohort
  (`diagnosis §4`). **Only the drain (Alt-1) returns the group to 3.**
- **Biggest risk:** implementing it as a *count heuristic* on the move-planner
  repeats the memory-documented refuted-fix pattern (s5: "3 adversarial verifies
  refuted all count-based move-planner fixes — it's the voter-visibility
  read-path class"). The honest fix is a read-path fix (handoff-stable /
  cache-bypassing authoritative in-flight-REPLACE or voter-overshoot count),
  same *class* as the shipped `c7a3bf19` (interlock cache-bypass) and `c78833f0`
  (row-op-linked credit) — **not** the same *read* as `c78833f0`.

---

## 1. How the group actually reaches 4 voters (run3, replica_operations-p1)

The temporary-overflow model (add→promote→remove, transient 4) is correct in
theory, but here **three replacements promoted in a 21-second burst while none
of their sources drained**, and the serialization gate that should have
one-at-a-timed them went momentarily blind:

| replica | REPLACE op | CREATE_REPLICA dispatch | reached voter-ready |
|---|---|---|---|
| `…-p1-r4` | `219476c0…` | 11:45:25.663 | **11:45:30.976** |
| `…-p1-r5` | (burst)     | —            | **11:45:34.640** |
| `…-p1-r6` | `92360fd0…` | 11:45:40.797 | **11:45:46.053** |
| `…-p1-r7` | `2ce6372f…` | 11:48:11.293 | **never** (60s timeout 11:49:12) |

Serialization-cap telemetry on this partition:

```
11:45:18.270  inFlightReplaceCount:0  naturalReplaceCount:3  replaceCount:1   <- planner WANTED 3, capped to 1 (dispatched r4)
11:45:42.158  inFlightReplaceCount:1  naturalReplaceCount:1  replaceCount:0   <- correctly blocked
11:45:50.331  inFlightReplaceCount:1  naturalReplaceCount:1  replaceCount:0   <- correctly blocked
```

Two decisive facts:

1. **`naturalReplaceCount:3` at 11:45:18** — the rebalancer wanted to fire three
   REPLACEs at once (mechanism (a), over-issuing: the spread objective saw 3
   nodes to re-place). The cap correctly held it to 1.
2. **r6 was dispatched at 11:45:40.797, ~1.4s BEFORE the 11:45:42 tick read
   `inFlightReplaceCount:1`.** At r6's planning tick the counter read **0**,
   even though r4's op (`219476c0`) was mid-drain. r4's op lifecycle shows why:
   it went `CREATING → SYNCING → ACTIVE` (replacement promoted 11:45:30) `→
   STOPPING/removing` with a `STEP_DOWN_REPLICA` + `Replica leader handoff
   completed` at **11:45:31.394**, and during that handoff the op row logged
   **`Cache/authoritative divergence detected during reconciliation`** and
   **`No row found for CDC update`** (11:45:31.567–31.943). During the
   drain-phase leader handoff the op is **transiently invisible** to the
   planner's `getEntityInFlightOperations()` view, so `inFlightReplaceCount`
   momentarily drops to 0 and the cap admits the next REPLACE.

So the answer to "which of (a)/(b)/(c)": it is **(a) over-issuing desire (3) +
(c) leadership-flux/cache-visibility hole in the serialization counter's
input**, producing the effect the task framed as (b) — a REPLACE whose drain is
incomplete failing to hold the serialization slot. The remove leg was *not*
skipped at the op level (r4's op did enter STOPPING); it was **the drain-phase
op row that flickered out of the cache the gate reads**. r7 is then the 4th
replacement, correctly serialized (2.5 min later, one-at-a-time) but planned
against an already-4-voter group, so it can never promote:
`votersAfterPromotion = 4+1 = 5 > maxAllowed = 4`
(`partition-service-learner-promotion-methods.js:531-533`).

## 2. Why the over-creation cap (`:329-347`) did not catch it either

The over-creation cap zeroes `addMoves` when
`inFlightAccounting.activeCount > targetReplicaCount`. Its input `activeCount`
counts committed **ACTIVE-status rows** (`in-flight-aware-replica-count.js:116`).
When a drained source flips to `removing`/`STOPPING` (r4 at 11:45:31) it leaves
`activeCount` **while still being a raft voter until the config change commits**.
So the planner reads `activeCount = 3` while raft has 4 voters. That is the same
divergence the promotion guard sits on the other side of: the guard counts raft
voters (`countActiveVoters`, `:481`) and sees 4; the planner counts ACTIVE rows
and sees ≤3, so neither the over-creation cap nor the serialization cap fires,
and r7 gets minted. The 383 uniform `activeVoterCount:4,…` deferrals and the 225
on this partition (all `activeVoterCount:4,learnerCount:1`) confirm the guard
saw a stable 4 the planner never did.

## 3. Narrowest upstream fix + hook site

**Predicate.** Do not admit a new critical-partition REPLACE while the group is
already at (or above) `target` *voters* net of not-yet-drained replacements —
read from a **handoff-stable / authoritative** count, not committed ACTIVE rows
and not the cache-flickering in-flight-op list.

Two concrete shapes, in increasing fidelity:

- **(3a) Harden the serialization counter.** At `:523-540`, replace the
  `getEntityInFlightOperations().filter(type==REPLACE)` count with a count that
  also includes the pending **drain REMOVE** spun off from a prior REPLACE
  (run3's drain settled as a *separate* op `c02d2af4` "Priority recovery drain
  settled operation", created 11:45:50, completed 11:52:04 — a REMOVE, so the
  REPLACE-typed filter never saw it), read through a cache-bypassing/authoritative
  path so the drain-phase handoff hole (`No row found for CDC update`) cannot
  zero it. This is the direct fix to the observed hole.
- **(3b) Gate on authoritative voter overshoot.** Add, alongside the over-creation
  cap at `:329`, a block when the **raft voter count** (the same authority the
  promotion guard reads) `>= target + inFlightReplaceCount`, rather than
  `activeCount(rows) > target`. This closes the planner/guard read disagreement
  at its source.

**Hook site:** the `serializeCriticalReplace` block,
`move-planner-move-calculation-methods.js:523-540` (and the sibling
over-creation cap `:329-347`). Both are already critical-partition-scoped and
already fail-safe (defer to next tick), so the change is narrow.

**Contrast with `c78833f0` (`drainPhaseReplacementCredit`).** That fix adjusts
`deficitEffectiveCount` (`in-flight-aware-replica-count.js:173-211,225-226`) so
the planner does not mint a spurious count-increasing **ADD** to fill a slot a
drain-phase learner already occupies. It is a **DEFICIT/mint read** on the ADD
path. Alt-2 is a **distinct serialization/overshoot gate on the REPLACE path** —
not the same accounting read. They share a *root* (planner committed-row view
lags raft voter reality) and a *fix class* (row-op-linked / authoritative read),
but `c78833f0` does not bound REPLACE serialization by voter overshoot, so Alt-2
is genuinely new code, not a re-tune of `c78833f0`.

## 4. Safety — would it starve a genuine repair? Livelock risk?

- **Genuine under-replication is safe.** A voter-overshoot predicate
  (`voters >= target + inFlight`) does not trigger when the group is truly
  *below* target (real voter loss → `voters < target`), so a needed replacement
  still fires. The gate only suppresses minting *above* target.
- **The refuted-fix trap is the real risk.** Memory (s5,
  `service-data-affinity-placement.md`) records that **count-based move-planner
  fixes were refuted 3×**; the surviving class is the **voter-visibility
  read-path** (e.g. `c7a3bf19` cache-bypassing owner-RPC read on the interlock;
  `136aebbc`). If Alt-2 ships as a naive committed-row count it will be refuted
  the same way — it must read an authoritative/handoff-stable count.
- **Livelock:** if the authoritative voter count over-counts a voter raft is
  about to drop, Alt-2 would wrongly block the replacement that would repair it →
  a stall. Mitigated because the gate is level-triggered (re-evaluates every
  tick) and the memory-noted danger is specifically about *narrowing the
  interlock* (runs 20/22), which Alt-2 does not touch. This is materially safer
  than Alt-1.
- **Sufficiency caveat (the load-bearing one):** Alt-2 caps overshoot at +1 but
  cannot remove the +1. The persistent 4th voter still concentrates the ledger
  quorum and starves provisioning (`diagnosis §4`, terminal cascade at
  11:54:36). **Alt-2 reduces churn (r5/r6/r7 never planned) but does not, by
  itself, green the demo's `[2/4]` abort** — the drain (Alt-1) is still required
  to return to 3. Best framing: Alt-2 shrinks Alt-1's job (fewer stacked voters
  to drain, less thrash), or is the correct *second* gate, not the root fix.

## 5. Proof plan

- **DT red-on-revert (planner gate):** construct a move-planner fixture where a
  critical partition has one REPLACE mid-drain (source in `removing`/still a raft
  voter, replacement `ACTIVE`) and the spread objective wants another REPLACE.
  Assert the planner emits **0** new REPLACE with the fix and **1** on revert
  (`dt:prove --test <planner test> --src move-planner-move-calculation-methods.js`).
  Must move the binding observable: `naturalReplaceCount>0` but `replaceCount==0`
  when `voters>=target`.
- **Live A/B (mandatory, hot-path — s9 `692c9dbb` load-amplification lesson):**
  2-pre / 2-post affinity-demo runs. Observables: (i) max `activeVoterCount` in
  `would_exceed_target_replica_count` deferrals never exceeds `target+1` on CP
  partitions; (ii) `did not become voter-ready within 60000ms` count → 0; (iii)
  per-CP-partition distinct replacement-ordinal span (r4..r7 = 4 in run3) → ≤2.
  Note (from diagnosis §6): add a `voter_over_target_promotion_block` counter so
  the promotion-side overshoot is measured directly rather than inferred.

## Appendix — commands used

- REPLACE dispatches: `grep '"explicitOperationType":"REPLACE"' … '"Handling CREATE_REPLICA request"'`
- Voter activations: `grep -iE "voter-ready activation state|did not reach voter-ready"`
- Cap telemetry: `grep -E '"overCreationCap":true|"replaceSerializationCap":true'`
- Deferral distribution: `grep would_exceed_target_replica_count | uniq -c` → 225× `activeVoterCount:4,learnerCount:1` on this partition
- r4 op lifecycle: `grep 219476c0` → CREATING→SYNCING→ACTIVE→STOPPING + "No row found for CDC update" @11:45:31
