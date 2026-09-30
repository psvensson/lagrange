# F1 coverage model: amendment 1 (the lead's union of the synthesis)

Recorded 2026-09-25 under the owner's verification protocol v2 (synthesis). This amends `coverage-model.md` once. It joins the evidence author's draft with three read-only reviews: `synthesis-static-investigation.md` (S), `synthesis-challenger-a.md` (CA1-CA12) and `synthesis-challenger-b.md` (B1-B14). Where this file and the draft disagree, this file wins.

## Frozen claim (unchanged)

A decision made when relevant raft messages are already pending must produce the same externally relevant result as that decision made after those messages have first been processed.

**Definition of "pending".** "Pending" means envelopes delivered to `group.inbound` and not yet stepped (B, question 5). The processed-first reference is the harness construction: the same virtual time, zero ticks, the same delivered envelopes stepped first. Messages in transport or pending at another replica are outside the requester's drain (S §4).

## Owner decisions (2026-09-25)

1. **Runtime turn integrity: fixed now in F1** (production P1). The claim is kept, not narrowed.
   - **CA1, answer substitution.** When a delivered envelope's step is refused, that refusal must never answer the queued command. Today it does (`drainInbound`, `raft-rs-runtime-owner.js:1235-1248`). A refused inbound step is recorded with a type and dropped, the drain continues, and the queued command runs on the post-drain state.
   - **CA5 / S M10, nested re-entry.** Announcing a role change must never re-enter message processing inside that announce. Today role listeners call `readStatus` synchronously inside `announce`, which triggers a nested drain, and the outer announce then emits stale diffs. The event stream after a turn must match the core.
   - **Timing arithmetic.** The claim still reads status after the drain. The pre-drain `ensureExecution` resume (S M8) stays under exclusion 4 (reconstruction).
2. **Lost conf change (CA3): its own quest after the publish.** When raft-rs silently replaces a conf change with an empty entry (`has_pending_conf` or a joint configuration), the port answers `CORE_OK` and admission records PROPOSED. This is pre-existing, and outside F1's claim. It is recorded for the membership-admission quest; there is no F1 anchor.
3. **Excluded from the claim, and recorded (owner acknowledged):**
   - the pre-turn projection readers: the handler's branch choice (A1), the membership admission pre-check (A2's cached path) and the partition write gate (A5, `partition-service-write-metrics-base.js:463`). Their staleness (B2's "processed but not yet announced" state) belongs to the projection and readiness owner;
   - a transferee held by a host failure, which is accepted with no effect because MsgTimeoutNow is never resent (B13). It sits under exclusion 4, host failure;
   - the draft's exclusions for the handler's tracked role, the dispatch-time registry lookup (Y3), Liferaft, CORE_FATAL, and pre-vote and check-quorum;
   - the shared module-level `runtimeHealth` (CA7), named explicitly under exclusion 4.
4. **Alternating retargets (B5): the REPLACE single-source-removal owner quest.** A rebalancer re-request every 5000 ms, shorter than an index-2 window, alternating between most-caught-up X and target T, can keep a window open indefinitely.
5. **Pre-existing, outside the claim, recorded for other owners:**
   - B6: a host failure answered after the effect was taken, where OUTCOME_UNKNOWN belongs (write path and runtime);
   - B4: the unbounded, uncoalesced tick queue (runtime);
   - CA9 and S: the D3 classification uses "transferable voter" where raft-rs uses "has progress", which matters for a leader demoted to learner. Either add an anchor or record it as unreachable, whichever the evidence author can prove;
   - B14: the STEP_DOWN caller timeout equals the inner acknowledgement timeout.

## Amended dimensions

**Decisions in the claim.** D1 named transfer, D2 most-caught-up, D3 dropped-propose classification and D4 dropped-conf-change classification. D5 campaign eligibility and D6 the progress probe join them (CA11). D8's substituted read and A3 (write-path deferral) and A4 (admission outcome mapping) are covered through their answers. D7 becomes an output checked by a direct anchor.

**Inputs.** I1-I15, plus:
- I16, whether the sender has progress at the receiver (CA2);
- I6, transfer in progress, which also decides the step outcome of a pending MsgPropose (CA2);
- I18, `election_elapsed` and the transferee's matched index against the last index, since D6 ticks the core inside its own turn (CA4 / B3).

I17 (`has_pending_conf`) is recorded with CA3 and is out of the claim.

**Events.**
- The event axis is **message type × receiver predicate**. The predicates are: sender has progress; local-only type; ProposalDropped conditions, meaning a transfer in progress, self removed, candidate, or follower without a leader (CA1, CA8).
- Message types are parsed from `lib.rs:1226-1251`, local-only types from `raw_node.rs:57-66`, and response types from `:68-77`. The parsed maximum must equal `RAFT_RS_MESSAGE_TYPE_RANGE.MAX` (S §1).
- Pairwise cells are generated as "an event that moves predicate p" × "an event whose step or announcement reads p" (CA8). The known pairs are P1-P7; the generated set must include them.
- Add the cells D1 × pending type 13, for the same transferee and a different one, and D2 × pending type 13 (B5). Also add D1 with a conf entry that is pending but not yet committed (B, question 3).
- The draft's `NO_DECISION_INPUT` entries for MsgPropose and MsgHeartbeatResponse are wrong, because the receiver predicate changes the step outcome (CA1). Correct them.

**Temporal and harness axes (B8), with no new tooling:**
- **send mode:** synchronous or asynchronous, via the cluster's `sendFor` hook (CA6 I20);
- **clock mode;**
- **timing per replica index,** from `computeReplicaElectionTimeouts`;
- **listener re-entry on or off;**
- **admission closed:** a real `BEGIN` on the replica database. B1's invariant is that admission is re-checked after every in-turn await; add mutation F9b, which removes that re-check.

**Observation (B9, B10, B11):**
- Observe twice: at election tick − 1, compared exactly, and at twice the largest election tick or more, compared by class.
- When the answer names transferee T, the outcome is message-driven, so compare it exactly: T leads at exactly t+1, with the same number of elections, and completed or aborted.
- Class comparison applies only to declared, timeout-driven events, chosen mechanically.
- The allowed nondeterminism is closed. The only random input in the core is the election timeout (`raft.rs:2810`). raft-rs uses FxHasher, so iteration is deterministic. Any other A/B difference is a real red.

**Outputs compared (CA10, CA11, B6):**
- the answer record;
- leader, term and ConfState;
- the requester's outbound (type, to) trace in the decision turn, which covers I6: retarget against ignore;
- the event stream after the turn, which must match the core;
- the durable-write outcome;
- durable hard state and ConfState after a crash-and-recover anchor.

**Anti-vacuity (B12, CA10):**
- The processed run's core-entry log must show one `step` per delivered envelope.
- In the pending run, every delivered envelope must be stepped before any decision read.
- The inputHidden and control scenarios must also check that processing moved something, or that the step outcome differs.
- `observe()` must reject a status that looks like a refusal.

**Mutation families.** F1-F11 from the draft, plus:
- F12, a refused inbound step answers the command;
- F13, a nested announce or stale diff;
- F9b, the admission re-check removed;
- one per new axis (asynchronous send, per-index timing).

Each family must be red through the oracle, an anchor, or both, and the record states which.

## Order of work

1. **Production P1, runtime turn integrity (CA1 and CA5).** It unfreezes production once and defines the new production_sha. Its direct witnesses are red on bc8e1118d.
2. **The evidence author builds, in parallel against this amended model:** the differential property over the model's dimensions; the anchors; and the mutation families. The CA1 and CA5 cells must be red on bc8e1118d and green on the P1 fix.
3. **One fresh verifier, given this model.** It first attacks coverage completeness. A variant inside a modelled dimension means fixing the generic evidence; it is not a new round.
4. **The A2 acceptance gate, once,** on the approved SHA. Then merge, rerun the original blockers and the SLO on the merge, and publish once.
