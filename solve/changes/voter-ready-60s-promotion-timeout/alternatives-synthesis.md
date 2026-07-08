# Voter-ready-60s fix alternatives — parallel analysis synthesis (s13)

Four alternatives analyzed in parallel (one per link in the causal chain), each
with its own report in this directory. Main-agent verified the crux against
run3 logs + source. HEAD `f83032da`.

Causal chain:
`REPLACE planning under-counts → group stacks to 4 voters (>target 3) → promotion
guard refuses 4→5 → 60s timeout → REPLACE churn → ledger quorum-concentrated →
provisioning starved → [2/4] abort`

## The verified root (all four analyses + first-hand forensics converge here)

**A planner/guard voter-count READ DISAGREEMENT during the REPLACE drain-phase
leader handoff.** Two reads of "how many voters does this group have" disagree:

| reader | source | value during drain | file:line |
|---|---|---|---|
| promotion **guard** | `countActiveVoters` — service rows where `isActiveVoterServiceRowForPromotion` (raft voter role); a draining source in `STOPPING` is STILL a raft voter | **4** | `partition-service-learner-promotion-methods.js:644` |
| move **planner** | `inFlightAccounting.activeCount` — committed ACTIVE-*status* rows; a draining source has flipped to `removing`/`STOPPING`, leaving activeCount | **3** | `move-planner-move-calculation-methods.js:332` (over-creation cap), `in-flight-aware-replica-count.js` |

Consequences of the planner reading 3 while the truth is 4:
1. The over-creation cap `activeCount > targetReplicaCount` is **false** → the
   planner keeps admitting replacements → **stacking** (run3: r4@11:45:30,
   r5@11:45:34, r6@11:45:46 promoted in a 21s burst, sources un-drained;
   telemetry `naturalReplaceCount:3`). The REPLACE serialization cap
   (`:523-540`) is also fed this blind count and its counter transiently reads 0
   during the handoff (`No row found for CDC update`, `Cache/authoritative
   divergence`), admitting r6 ~1.4s before the tick that would have serialized it.
2. The planner sees "target satisfied" (`target_replica_count_already_satisfied`,
   12×) → **never plans the surplus-voter drain** (no REMOVE targets an
   over-target voter r1–r4 in the entire run; the only REMOVEs target r7, the
   failed learner).
3. The guard reads 4 → **refuses promotion** of the paired learner (4+1=5 > the
   already-credited ceiling 4) → 60s timeout.

This is the **drain-side twin of the just-closed mint-side quest**
(`formation-ledger-over-target-accounting-drain-phase-replace-blind-spot`,
`c78833f0` adjusted `deficitEffectiveCount` on the ADD/deficit path). Same fix
**class** (authoritative row-op-linked voter read), different **read** (the
over-creation/serialization caps + the missing surplus-drain, not the deficit
fill). Critically, the mint-side metric `DEFER_ADD_OVER_TARGET` is 0 precisely
because it reads `activeCount`=3 — it is structurally blind to this promotion-
side overflow.

## The four discrete levers — ranked

| # | lever | verdict | why | blast radius |
|---|---|---|---|---|
| **Alt-1** | exempt the drain REMOVE from the self-move idle-ledger interlock | **DEAD-END** | The interlock DOES skip 9 REMOVEs — but they all target **r7 (the failed learner)**, not an over-target voter. Removing a learner doesn't reduce activeVoterCount 4→3. There is NO voter-drain REMOVE for the interlock to block, so a narrow carve fires on zero relevant moves — and spends the run-20/22 "most-dangerous seam" budget for nothing. | HIGH (wasted) |
| **Alt-3** | break the promote↔remove circular wait / drive the drain from the promotion defer | **DEAD-END** | The remove-safety voter-ready gate (`operation-workflow-remove-safety-evaluator.js:522`) runs at DISPATCH, only on an op that already exists — it never gates the (non-existent) voter drain. The circular wait is real only for r7's own remove leg and is a symptom. "Actively drive the REMOVE" just lands the driven REMOVE back on the (irrelevant) interlock. Promotion defer is a pure passive re-poll (no reap signal) — a real but downstream gap. | HIGH (wrong wall) |
| **Alt-4** | make provisioning tolerate the transient ledger quorum-concentration | **MASKING standalone; complement-only** | The tolerance **already exists** (`waitOutWholeClusterTransientProvisioningHold`, `sql-query-engine-initial-partition-provisioning.js:691`, 30s budget), **already fired** in run3 (11:54:15), and **still aborted** 20s later — the concentration persisted ~9 min (`OPERATION_LEDGER_QUORUM_SPREAD_HOLD` 11:45:33→11:54:29). Waiting longer just defers the abort; violates `internal-pacing-not-client-fidelity`. Honest only paired with a root fix that clears the concentration in seconds — and then the existing wait already absorbs it with no code change. | n/a |
| **Alt-2** | cap the overshoot upstream (anti-stacking) | **viable-but-risky; INSUFFICIENT alone** | The anti-stacking gate ALREADY EXISTS (`:523-540`, `:329-347`); it failed because its INPUT is the blind cache/committed-row read. Fixing the read stops runaway churn (r5/r6/r7) — but capping overshoot at +1 still leaves the **persistent 4th voter**, which still concentrates the ledger → still starves provisioning. Caps the bleeding; does not drain the wound. | LOWER (planner mint gate, fails safe by deferring; does NOT touch the interlock seam) |

## Recommended path — the convergent root fix (not any single discrete lever)

**Fix the planner's over-target voter accounting to read the TRUE (authoritative,
handoff-stable) raft voter count instead of committed ACTIVE-status rows.** One
read-path change simultaneously:
- (a) makes the over-creation + REPLACE-serialization caps SEE the 4th voter →
  stops the stacking (Alt-2's goal, done at the read not the cap), and
- (b) makes the planner SEE `activeVoters=4 > target=3` → plan the surplus-voter
  drain REMOVE that currently never gets emitted (the actual missing corrective).

This is the **voter-visibility read-path class** memory flags as the ONLY
surviving class (`c7a3bf19` cache-bypassing owner-RPC read; `c78833f0` row-op-
linked). It is the drain-side counterpart of the closed mint-side quest.

### Hard constraints / traps to honor (from memory + the four analyses)
- **NOT a count heuristic.** Count-based move-planner fixes were refuted 3× (memory
  s5/s6). Must be a row-op-linked / authoritative read (cache-bypassing), matching
  the surviving class.
- **NOT the interlock** (Alt-1/3 dead) and **NOT downstream tolerance** (Alt-4
  masking).
- **Anti-stacking alone is insufficient** — the fix MUST also cause the surplus
  drain to be planned, or the 4th voter persists and provisioning still starves.
- **Mandatory aggregate live A/B** (2-pre/2-post) — hot path, load-amplification
  risk (s9 `692c9dbb`). DT red-on-revert first; observable =
  `would_exceed_target_replica_count` deferrals → 0 AND voter-ready-60s timeouts
  → 0 AND a surplus-voter REMOVE actually planned+executed on a stacked CP
  partition.
- **Add a direct counter** `voter_over_target_promotion_block` keyed on the
  guard's over-target deferral so this promotion-side overflow is MEASURED, not
  inferred (the mint-side metric is blind to it).

### Open question to resolve during design (cheap, decides the exact read)
Which authoritative source does the planner adopt — the same `countActiveVoters`
raft-role read the guard uses, or a cache-bypassing owner-RPC read like
`c7a3bf19`? The guard and planner reading the SAME source is the cleanest
(eliminates the disagreement by construction) — confirm the planner has that
source in scope at the accounting site.
