# Narrowed scope: correct the owner-availability lease verdict (2026-09-25)

## Owner decision (2026-09-25)

The owner chose "narrow now, full epic after".

**Before the publish:** fix only the inverted owner-availability verdict (census H2 in `design-replace-source-removal-owner-2026-09-25.md`). A live owner lease means the owner is available and fences remote settlement. The three callers are witnessed, and the locking test is superseded (R09), not weakened.

**Moved to the next epic** (REPLACE lifecycle ownership), with this quest's design and both challenger reports as its model input:
- the full "a REPLACE never completes while its source is a voter" contract, with its decisions: owner liveness, ordinary-partition ownership (A1), dead-source retirement (A3, BR13), the 300 s budget (BR5), removal of a FAILED REPLACE's target (A7, BR7), the re-add guard (A4), epoch-fence scope (BR6), the FAILED fence (A8), and R-1a..f, R-2;
- the S2, S5.2 and S9 owner decisions, which are recorded for the epic;
- the single-attempt handoff rule (B5). This is a lead scope decision, stated to the owner. Its attempt identity depends on the open port answer-shape question (BR9: the transfer answer carrying `{term, transferee}`). The SLO does not depend on it: in all 39 recorded REPLACE handoffs there was exactly one named transfer and no retarget (finding-slo-residual-remove-safety.md §3).
- S10 stays out of scope, because of the fail-closed reseed.

## Frozen claim (phase 0, narrow)

**L1.** While a REPLACE's owner holds a live owner lease, no remote actor treats that owner as unavailable. In particular:
- no remote drain releases the REPLACE (`OWNER_UNAVAILABLE_RELEASED` → REMOVED);
- no remote stale-FAIL settle fails it;
- the re-entry wake does not skip its owner as no longer repair-eligible.

**L2.** When the lease is expired or absent, the verdict is exactly today's routing-heuristic verdict. The un-wedge path for a genuinely unavailable owner of a target-owned priority REPLACE therefore keeps working.

Other definitions for the claim:
- **Owner and oracle.** The semantic owner is `operation-owner-availability-policy.js`. Its oracle is the module's own contract (`:7-15`) and the lease record (`replica-operation-owner-lease.js`).
- **Externally relevant outputs.** These are the verdict (`unavailable`, `state`), and, for each caller, whether the REPLACE ends REMOVED, FAILED or woken, and whether its source is removed by the REPLACE's own STOPPING step or by the planner.
- **Excluded.** The planner-side compensator, the 300 s budget, the absence of an ACTIVE bound, and everything in the epic. A lease that expires while a healthy owner waits (A5) keeps today's behaviour. This fix does not change lease semantics, only the polarity of the verdict drawn from a live lease.

## Coverage model (small, from the verdict's own inputs)

**Decision:** `unavailable` for (owner lease: live / expired / absent) × (routing heuristic: ready / unready). The authority is the verdict function, with its inputs imported from the lease module.

**Callers.** These are the census, which the implementer confirms with its own complete census:
1. the release at `operation-workflow-recovery-timeout.js:694-724` / `reconcile-shared.js:634-645`;
2. the stale-FAIL remote settle at `operation-workflow-recovery-drain.js:385-397`;
3. the re-entry wake at `operation-workflow-owner-priority-recovery-reentry.js:326-340`.

For each caller, cross the verdict inputs with the REPLACE phase (ACTIVE, STOPPING, SYNCING with the target ACTIVE).

**Class properties:**
- **L1:** live lease ⇒ no remote settle, release or skip.
- **L2:** expired or absent lease ⇒ unchanged behaviour. This must hold for the un-wedge path.
- **Causal:** with the owner alive and a remote drain sweep during ACTIVE, the REPLACE completes through its own STOPPING step, and the source is removed by the REPLACE, not by a planner REMOVE. The SLO path is gone.

**Mutation families:**
- polarity reverted;
- a caller that reads the heuristic directly and bypasses the verdict;
- an expired lease treated as live, which is the wedge regression and must be caught;
- a live lease on the wrong owner accepted, where the lease holder is not the recorded owner.

**Challenger input used.** Challenger A reported the S1 consequences: the priority drain holds longer for a live owner, and more remote wakes fire in the first 30 s, so search for further pinning tests. Challenger B's BR4 does not arise here, because S9 is not adopted in this scope and ACTIVE keeps today's bounds.
