# Owner constraints for the REPLACE source-removal owner quest (2026-09-25, binding)

Keep the synthesis-first plan. These constraints apply before implementation begins.

1. **Completion is measured against authoritative Raft membership.** "A REPLACE never completes while its source replica is still a voter" means voter in the committed Raft membership state.
   - It does not mean the topology cache, placement intent, readiness state, the REPLACE row's desired state, or a locally predicted ConfChange result.
   - In a joint configuration it includes every voter-bearing part, the outgoing voters included.
   - The census must establish exactly which raft-rs ConfState fields are that authority in this implementation.
   - Do not silently strengthen the contract to "the source replica must not exist at all" unless existing REPLACE semantics already require that.
2. **REPLACE owns the whole causal chain:** add target, then establish target safety, then hand off leadership if required, then remove source, then observe committed membership, then complete. The chain "REPLACE closes, the generic planner notices the surplus, a separate REMOVE" is not allowed while the REPLACE is causally responsible. For the source of an active REPLACE, the planner either does nothing or wakes/routes work to the REPLACE owner. It never creates an independent source-removal operation. Census this structurally before implementation.
3. **Idempotence if reality gets there first.** If the owner resumes and finds the source already not a voter, it recognises the authoritative state and continues safely.
   - The invariant: REPLACE owns deciding when its source may be removed and when REPLACE may complete.
   - It does not have to personally emit every configuration change.
   - This covers restart, recovery, operator intervention and states created before this repair.
4. **Readiness events are wake-ups, not authority.** Use level-triggered semantics: an event means "re-evaluate the authoritative condition". Solve the lost-wakeup race (read not-ready, readiness changes, the event is emitted, the waiter subscribes, the event is lost). Use an existing generation/version mechanism, or subscribe-before-recheck or an equivalent owner-controlled ordering. No bespoke event ledger if an existing readiness revision/epoch can give the same guarantee.
5. **Event-driven must survive restart and missed notifications.**
   - Readiness events are the fast wake-up. The durable REPLACE state plus a reread of authoritative membership and readiness is the source of truth. Startup/recovery reconciliation is the liveness backstop.
   - A low-frequency reconciliation path is acceptable if it invokes the same REPLACE owner.
   - Prove both: (a) normal progress is no longer bounded by the old one-second cadence; (b) missed events or a restart cannot leave the operation stuck.
6. **Revalidate safety immediately before source removal.** Any async boundary between the safety decision and the membership change triggers a fresh check of: target readiness and liveness, current membership, current leader, transfer state, and the current REPLACE identity/revision.
7. **Leadership handoff is an attempt with immutable identity.**
   - Each attempt has an immutable target and a known initiating term and configuration. No other caller can silently retarget it, and its completion or failure belongs to it.
   - Only after a terminal outcome does the owner reread leader, membership and readiness, decide, and possibly create a new attempt.
   - A late result from attempt A must not complete or mutate attempt B.
   - Use an existing operation or epoch identity rather than a new ID namespace.
8. **No huge Cartesian-product test.** Derive the REPLACE state machine and test:
   - every legal transition, with its preconditions and postcondition;
   - every completion edge, which must establish the completion invariant;
   - every async resume edge (after an await, wake-up, timer, callback or recovered continuation), which must decide on current authoritative state;
   - every competing-authority edge (planner, reconciliation, readiness and membership callbacks), which must converge on the same owner.

   Add pairwise combinations only where two dimensions interact semantically.
9. **Three class-level properties, plus direct anchors.**
   - **P1, completion implication.** For every path to COMPLETE: REPLACE == COMPLETE implies source ∉ effective voter membership (authoritative committed). Any close-before-removal mutant must fail.
   - **P2, scheduling equivalence.** With a relevant readiness or membership event pending, deciding before processing it gives the same safe outcome as processing it first. Where the first answer is legitimately WAIT, encode the safe refinement: stale information may defer, but it never permits an unsafe removal or completion. Do not only assert call order.
   - **P3, recovery equivalence.** For each durable intermediate phase, "continue uninterrupted" converges to the same authoritative topology and result as "persist, destroy the runtime, recreate, recover, continue".
10. **Challenger scenarios.** Challengers look for missing semantic dimensions, not examples, and cover at least:
    - the target becomes ready just before waiter registration;
    - the target becomes unready after remove-safety passes;
    - the source, the target, or a third replica is leader;
    - leadership changes without the REPLACE initiating it;
    - a transfer succeeds but its completion callback is delayed;
    - a transfer fails after another leader already exists;
    - the source removal commits while the callback or event delivery is delayed;
    - the source is already removed when the owner resumes;
    - a restart after the target add but before source removal;
    - a restart after the source-removal proposal but before its commit is observed;
    - a planner sweep during every major REPLACE phase;
    - a stale or recomputing readiness answer;
    - joint configuration, if supported;
    - duplicate wake-ups and duplicate reconciliation.
11. **Scope planner suppression to the source of an active REPLACE.** Never suppress the planner globally. The census proves the split has no overlap and no uncovered case: an active REPLACE's source goes to the REPLACE owner, and an ordinary unrelated surplus goes to the existing planner owner.
12. **Measure latency at the causal boundary.** Once all authoritative prerequisites are true, normal progress does not wait for the old one-second planner or remove-safety cadence. Show this causally with controlled events and clocks; node-join-convergence-slo is end-to-end confirmation only.
13. **The acceptance gate runs exactly once:** synthesize, challenge, implement plus evidence, fresh verifier, ONE A2 gate on seed parity + F1 + REPLACE, merge, the original blocker checks on the exact merge, one publish. Never start A2 with an evidence or verifier finding still open. If A2 fails, classify the failure before acting: a violation of this mechanism, a previously known unrelated mechanism, a newly exposed mechanism, or infrastructure/noise shown with actual evidence. Do not automatically add a round.
14. **Completion criteria, all required before the fresh verifier approves:**
    - every COMPLETE edge implies the source is absent from effective voter membership;
    - one semantic owner removes the source of an active REPLACE;
    - the planner does not race that removal independently;
    - safety is revalidated at the effect boundary;
    - readiness events cannot be the sole cause of progress;
    - a restart recovers a pending source removal;
    - a handoff cannot be retargeted mid-attempt;
    - a stale handoff completion cannot affect a later attempt;
    - an already-removed source is handled idempotently;
    - normal removal is event-driven, not one-second-poll-driven;
    - the generic planner is intact for unrelated surplus.

    If the census shows that satisfying one of these requires changing a different established product contract, that specific decision goes back to the owner. Otherwise proceed autonomously.
