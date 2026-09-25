# F1 coverage model: challenger A (state and event dimensions)

Finding ids are **CA1-CA12**. A1-A5 are the model's adjacent decisions; A5, the partition write gate, is new and proposed in CA7.

- **Role:** model challenger A (Phase 3 of the verification protocol v2). Read-only. No repository edits, no git writes, no test suites run.
- **Read against:** the worktree `.claude/worktrees/f1-evidence` at 1e64d5a57. Its `src/` is identical to bc8e1118d. raft-rs 0.7 is read from `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0/src/raft.rs`, called **raft.rs** below. Paths starting with `src/`, `test/` or `vendor/` are relative to that worktree.
- **Reproductions.** I ran three one-scenario scripts on the existing driver (`TransferLeadershipDriver`), outside the repository:
  - `scratchpad/f1/synthesis/repro/step-refusal.mjs`
  - `scratchpad/f1/synthesis/repro/nested-announce.mjs`
  - `scratchpad/f1/synthesis/repro/pending-conf.mjs`

  Each one builds PENDING and PROCESSED exactly as `runScenario` does: `stepUndrained`, then an optional `readStatus`, then the request. They are not tests, and their output is quoted below.
- **Overlap.** The static investigator lists M9 (inbound step error) and M10 (nested drain, which it marks as a hypothesis). Below, M9 is reproduced as a **violation of the frozen claim on production**, and M10 is reproduced as real.

## Headline

**Finding CA1 is a production counterexample to the frozen claim, not only an evidence gap.**
- When a pending envelope's own `step` is refused by the core, that refusal becomes the answer to the queued command, and the command never runs.
- The PROCESSED run then answers the real decision.
- One shape of this is F1-specific: a forwarded proposal that arrives during a transfer turns a leader write that would be deferred and retryable into a non-retryable refusal.

Round 1 recorded the mechanism as non-blocking N1, under the old property "a typed refusal that changed nothing". The v2 claim compares the *externally relevant result*, and under it N1 is a violation. The coverage model neither includes it nor lists it among its exclusions, and the scaffolding avoids it on purpose (`evidence-transfer-leadership.md` R2.1 "cuts C off on purpose").

**Owner decision needed (Phase 9, because it changes the guarantee):** either fix production, which is a separate production change because production is frozen, or narrow the claim to exclude it explicitly.

---

## Findings

### CA1. The pending envelope's own processing outcome is an input to the turn's answer (answer substitution)

- **Dimension added:** a new **output of processing each pending event**, the step outcome. It is not only "which inputs the event moves". The claim fails whenever a pending envelope's processing yields a non-OK result, because that result replaces the command's answer.
- **Evidence:**
  - `src/raft/raft-rs-runtime-owner.js:1239-1244`: `drainInbound` shifts the envelope, and `if (!stepped.ok) return stepped.result;`. The continuation (`performCommand`) is never called. The same happens at `:1245-1247` for a non-OK `drainReady`.
  - `vendor/raft-rs-wasm/raft-0.7.0/src/raw_node.rs:402-411`: `RawNode::step` returns `Err(StepPeerNotFound)` for a *response* type (`is_response_msg`, `:68-77`: MsgAppendResponse, MsgRequestVoteResponse, MsgHeartbeatResponse, MsgUnreachable, MsgRequestPreVoteResponse) whose sender has no progress.
  - raft.rs `step_leader`, `:2026-2041`: a MsgPropose to a leader removed from its own configuration, or to a leader with `lead_transferee` set, returns `Err(ProposalDropped)`. `step_candidate`, `:2258-2266`: a candidate returns `Err(ProposalDropped)`. `step_follower`, `:2312-2319`: a follower with no leader returns `Err(ProposalDropped)`.
  - `vendor/raft-rs-wasm/src/lib.rs:889-897` (`step`) and `:1265-1275` (`jserr`, kind `raft-rs-refusal`) turn these errors into refusals. `raft-rs-runtime-owner.js:360-369` makes them `CORE_REFUSED`, `phase:'step'`, `retryable:false`.
  - `src/raft/raft-rs-ingress.js:171-183` admits by routing and schema only, deliberately never by membership, so these envelopes do reach the core.
- **Reproduced on production** (`repro/step-refusal.mjs`):

  | Scenario | PENDING answer | PROCESSED answer |
  |---|---|---|
  | Leader A with a transfer in progress (target C cut off); follower B's `propose` forwards a MsgPropose to A; then A proposes | `CORE_REFUSED "step: raft: proposal dropped"`, `phase step`, `retryable:false` | `HOST_FAILURE leadership-transfer-in-progress`, `retryable:true` |
  | A removes C; B's and C's MsgAppendResponse are both pending; A makes a named transfer to B | `CORE_REFUSED "step: raft: cannot step as peer not found"`; nothing stepped | `CORE_OK transfer-requested` |
  | The same, but A proposes | the same refusal; nothing proposed | `CORE_OK drained` |

  In each PROCESSED run, the reference drain (`readStatus`) itself returned the `CORE_REFUSED` step refusal instead of a status. The harness discards that value.
- **Partition effect:**
  - `partition-service-raft-write-commit.js:53-58` (`portDeferralOf`) does not recognise the substituted refusal as a deferral. The write fails where PROCESSED defers it (A3).
  - `partition-service-raft-membership-administration.js:121-125` reads `readStatus()`. When that read is substituted, `status.role` is undefined, so the check answers NOT_LEADER on the real leader (A2).
  - A4 maps the substituted refusal to REFUSED, not DEFERRED.
- **New or instance:** a **new dimension**. The model's event axis (section 4.1, column "Inputs it can change") records only the *state* an event moves. It never records that an event's processing can *fail*, or what that failure does to the turn.
  - The scaffolding's `NO_DECISION_INPUT` for MsgPropose and MsgHeartbeatResponse (`transfer-leadership-drain-oracle.test.js:81-90`) is false as stated. Both can decide the answer.
  - The "control" scenarios (`:286-305`) put them only where the step succeeds.
- **Amendment:**
  1. Add a model column, **step outcome at the receiver**, derived from raw_node.rs `is_response_msg` and the raft.rs `Err` sites listed above. The events axis then becomes *type × receiver predicate*, where the predicate is one of:
     - the sender is in the receiver's progress, or not (response types);
     - receiver is leader, leader with transferee, leader removed from its configuration, candidate, follower with a leader, or follower without one (MsgPropose).
  2. The census fails for a type/predicate cell that has no scenario and no reason.
  3. Add a new mutation family **F12, the answer substituted by a pending event's processing outcome**.
  4. The PROCESSED result records the reference drain's own answer, and the oracle asserts that answer is a status. Otherwise the reference silently absorbs the substitution.
  5. Section 1.5 must say whether this is in the claim. It cannot stay implicit.

### CA2. Receiver-state predicates that the step-outcome dimension needs are missing from I1-I15

- **Dimension corrected:** the inputs.
- **Missing inputs:**
  - **I16, sender membership in the receiver's progress** (`prs.get(m.from)`). It is not I5 as modelled. It changes the moment a conf change is *applied* in the drain of an **earlier envelope in the same batch**. That is how the removal scenario above arises.
  - **I6 (lead_transferee), as an input to another envelope's step.** The model treats it only as an input to D3 and D4.
  - **Self-membership of a leader.** raft.rs `:2026-2030` keys on `self.id` having progress, not on being a voter. A leader demoted to learner still has progress. See CA9 for the classification side.
- **New or instance:** an **instance** of the inputs axis, required by CA1.
- **Amendment:** add I16 and extend I6's "read by" column to "the step outcome of a pending MsgPropose". Extend I5's "read by" column to "the step outcome of pending response types".

### CA3. D4 has a third raft-rs outcome, "accepted but nulled", driven by inputs the model omits

- **Dimension added:**
  - inputs: **I17, `has_pending_conf` (`pending_conf_index` greater than `applied`) and the joint state** (`votersOutgoing`, `auto_leave`);
  - output: **the type of the appended entry** (the conf change, or an empty normal entry).
- **Evidence:**
  - raft.rs `step_leader` `:2062-2090`: a conf change is replaced by `Entry::default()` when there is a possible unapplied conf change, or when it must leave joint first, and the result is `Ok`.
  - `raft-rs-runtime-owner.js:1225-1228`: Ok leads to `drainReady`, whose answer is `CORE_OK`.
  - A4 (`membership-administration.js:35-46`) records it as PROPOSED.
  - The binding exposes both inputs (`lib.rs:684-712`: `pending_conf_index`, `applied`, `promotable`).
  - **Reproduced** (`repro/pending-conf.mjs`). Follower B's `proposeConfChange(ADD_LEARNER D)` is forwarded and pending at A. A then calls `proposeConfChange(ADD_LEARNER E)`. Both runs answer `CORE_OK drained`, and after an election timeout the learners are `[D]` only. E is silently lost.
- **New or instance:** a **new input and a new output**. The model's D4 "Result" column lists only the in-progress failure and the raw refusal.
  - For the claim this is **a mistake common to both runs**. PENDING equals PROCESSED, and both are wrong against the durable effect, so the A/B oracle is blind to it by construction.
  - It is pre-existing and not F1's.
- **Amendment:**
  1. Add I17 to section 3.
  2. Add "entry appended as a conf change, or nulled" to D4's compared outputs.
  3. Add an **anchor**: `proposeConfChange` answered `CORE_OK` implies that the change is in ConfState once committed, or that the answer is typed. This anchor is red on production today, so the owner decides whether it is F1's.
  4. Add D4 to family F7.
  5. The pair "pending forwarded conf-change MsgPropose + local D4" belongs in the pairwise set (CA8).

### CA4. The progress probe ticks the core inside its own turn

- **Dimension corrected:** events. Section 4.2 says a tick is "a queued command, never inside another turn". That is false.
- **Evidence:** `raft-rs-runtime-owner.js:1104-1119`. `driveOneHeartbeat` calls `tick` up to `HEARTBEAT_TICK` times inside the PROBE_PEER_PROGRESS turn. In raft.rs, `tick_heartbeat` advances the leader's `election_elapsed`, which bounds `lead_transferee` (the abort at `:1107-1108`). So a probe shortens the transfer window by up to 3 ticks. It changes I6, and the timing of A3, without any scheduled tick.
- **New or instance:** an **instance** of the event axis (a non-message event inside a turn). Challenger B owns the timing arithmetic.
- **Amendment:**
  1. Add the event "in-turn ticks (D6 probe)" to section 4.2, changing I6 and `election_elapsed`.
  2. Add the hidden input **I18, raft-rs's transfer bookkeeping**. This is `election_elapsed` (reset by a transfer start or retarget, raft.rs `:1908-1925`, and advanced by any tick), and the transferee's `matched` against `last_index` (whether MsgTimeoutNow is sent at once, `:1926-1936`).

### CA5. The role/term/leader event stream is an output, and the reproduced nested drain corrupts it identically in both runs

- **Dimension added:** output, **the event stream** (ROLE, TERM_CHANGE, LEADER_CHANGE with payload, in order) and the partition projection built from it. Environment input: **I21, subscribers that re-enter `readStatus`**.
- **Evidence:**
  - Every production role listener calls `getCurrentTerm()`, which is `service.raft.readStatus()` (`src/raft/replica-leadership-state.js:114-164`; `partition-service-raft-lifecycle-wiring.js:56`). It does so inside `announce`'s emits (`raft-rs-runtime-owner.js:949-960`).
  - While the outer turn is still synchronous (`enqueue` `:673-684` leaves `tail` null during a synchronous run) and more envelopes are pending, `readStatusObserved` (`:1039-1044`) runs a **nested** `perform(READ_STATUS)` that drains them. The outer `announce` then emits the rest of its diff, computed from the older `now`.
  - **Reproduced** (`repro/nested-announce.mjs`: a listener reading status, then a pending [MsgRequestVote(B), MsgAppend(B)] at A). The event sequence in **both** runs is `leader-change nb, follower, term-change 2, leader-change null`. The core says the leader is nb. A subscriber-built leader projection ends null, and `lastStatus.lead = nb` suppresses any later correction.
- **New or instance:** a **new output dimension**. It confirms the static investigator's M10 hypothesis.
  - The A/B comparison cannot catch it (CA10a), because both runs nest identically.
  - It is reachable in production only when the outer turn stays synchronous: no Ready in the turn has an async send, for example sends that are all skipped or failed synchronously (`:743-750`, `:779`).
  - The harness makes it common (CA10e).
- **Amendment:**
  1. Add to 1.3 per requester: the ordered event stream, and the final subscriber projection (role, term, leaderId).
  2. Add an **anchor**: after every turn, the subscriber projection equals the core's status. This is a direct property, not A/B.
  3. Add a mutation family **F13, stale or duplicated announcement diff**.
  4. The partition-layer legs also compare the in-turn side effects of those events: `releasePendingWrites`, `cancelLeaderOwnedActivation` and `updateRebalancerLeadership` (`partition-service-raft-lifecycle-wiring.js:70-93`).

### CA6. Transport synchrony is an unmodelled input that selects which code path runs

- **Dimension added:** environment input **I20, whether `sendToPeer` resolves synchronously**. It decides:
  - whether a turn is synchronous;
  - whether D8 answers a fresh drain, the cached pre-drain observation, or a substituted refusal (`:1035-1051`);
  - whether subscribers nest (CA5);
  - whether an envelope can arrive mid-turn and be re-checked (`:1245-1247`).
- **Evidence:**
  - Production `sendToPeer` is `transport.deliver` (`src/partition/partition-service-raft-init-base.js:461-469`), which is async (`src/transport/message-router-delivery-delegation.js:60`).
  - The harness queues synchronously and returns `undefined` (`test/raft/raft-rs-backend/partition-node-cluster.js:153-161`).
  - So every oracle turn is synchronous, and production turns with messages are async.
- **New or instance:** a **new dimension** for the model. It overlaps challenger B's temporal axis. Section 5 (T3) reasons about awaits that the oracle never executes.
- **Amendment:**
  1. The oracle ranges over I20 ∈ {sync, microtask-async, macrotask-async} using the existing `sendFor` hook (`partition-node-cluster.js:154-158`).
  2. Add a mid-turn arrival leg: an envelope delivered during the decision turn's awaited send must be processed before the decision.

### CA7. Cached or derived state beyond `lastStatus` and `statusObservation`

- **Dimension:** cached state (F2's axis).
- **Found:**
  - **a) `SHAPED_STATUS`** (`raft-rs-runtime-owner.js:159`, `:1047-1051`) caches the identity-resolved shape per observation. A registry reservation after shaping is not reflected in it, for example `status.peers[].replicaIdentity`. A2's ALREADY_MEMBER check (`membership-administration.js:126-127`) reads that shape. Not message-driven (I9 class); record it with I9.
  - **b) The LEADER_CHANGE payload** is resolved through the registry at emission (`:926-938`). An unreserved leader is announced as null, and the `lastStatus` diff never re-emits it. The partition's leader projection stays null until the lead changes. I9 class; record it.
  - **c) The partition projections.** The model covers `service.role` as I14. It omits two consumers of it and one further projection:
    - the partition's leader id, from LEADER_CHANGE;
    - the **write gate** `this.role === RaftRole.LEADER` (`src/partition/partition-service-write-metrics-base.js:463`);
    - `getCurrentTerm`.

    The write gate is a decision (propose here, or forward or refuse) that the A-list lacks.
  - **d) `group.recovery.durableProgress`** is "as last read" (`:208-219`, `:257-263`), and `retryAfterMs` is clock-derived. Both are fields of the recovery answer. Only the containment exclusion covers them.
  - **e) Module-level `runtimeHealth` and `runtimeGeneration`, shared across groups** (`:151-153`, `:387-399`). Another group's CORE_FATAL during this group's awaited drain turns this group's answer into `GENERATION_CHANGED` with `recoveryRequired:true`. I12 lists them; the cross-group event should be named under exclusion 4.
  - **f) `inboundDrainScheduled` and `inboundDrainDeadline`** (`:1280-1319`). After an inbound step refusal (CA1), or once the admission bound has passed, the remaining envelopes are **not rescheduled**. They stay pending until the next `step()` or command. This is a scheduling state that lengthens the "pending" interval (challenger B).
- **Amendment:**
  1. Add a) and b) under I9 as recorded, not message-driven.
  2. Add c) as **A5, the write-path leader gate** (adjacent, tracked role), and add the leader projection to I14.
  3. Name e) in exclusion 4 as "another group's core failure during this group's await".
  4. Hand f) to B.

### CA8. Pairwise events: concrete pairs, and whether the single-type grid misses them

- **Dimension:** pairwise interactions (open question 3).
- **The order question.** The claim compares PENDING with PROCESSED under the **same** delivery order, so permuting a pair is not what the claim tests. A pair matters when **the first envelope changes the receiver predicate that decides the second envelope's step outcome, or its announcement**. Such pairs follow mechanically from CA1/CA2: X moves a predicate, and Y's step outcome reads that predicate.

| Pair (in delivery order) | Mechanism | Each alone | Grid today |
|---|---|---|---|
| P1: MsgTransferLeader (forwarded), then MsgPropose (forwarded) at a leader | X sets `lead_transferee`; Y's step then returns Err(ProposalDropped), and the turn is substituted (CA1). Reproduced with a local transfer in place of X | harmless: X gives in-progress; Y at a leader with no transfer appends | missed. The MsgPropose row is a control at a healthy leader |
| P2: MsgAppendResponse(B) that commits C's removal, then MsgAppendResponse(C) | the drain of X applies the removal, so Y is StepPeerNotFound | harmless | missed. The scaffolding cuts C off on purpose. Reproduced |
| P3: MsgRequestVote (higher term), then MsgAppend(new leader) | X's FOLLOWER listener nests the drain of Y; the outer diff then emits LEADER_CHANGE(null) (CA5) | harmless | missed; both runs identical, so it needs an anchor. Reproduced |
| P4: MsgPropose(forwarded ConfChange), then local D4 | X sets `pending_conf_index`; D4 is nulled and answered CORE_OK (CA3) | harmless | missed; both runs identical, so it needs an anchor. Reproduced |
| P5: MsgTransferLeader(forwarded, to X), then MsgAppendResponse(X caught up) | the leader sends MsgTimeoutNow inside the drain; the D3 answer is unchanged, but the leader observation's timing changes | harmless | covered by the observation window; no gap for the claim |
| P6: MsgRequestVote (higher term), then MsgPropose (forwarded) | X demotes to a follower without a leader; Y then gets Err(ProposalDropped) (raft.rs `:2313-2319`), and the turn is substituted | harmless | missed |
| P7: MsgTimeoutNow, then MsgPropose (forwarded) | X makes the receiver a candidate; Y gets Err(ProposalDropped) (`:2260-2266`), and the turn is substituted | harmless | missed |

- **New or instance:** P1, P2, P6 and P7 are **instances of CA1**. P3 is an instance of CA5 and P4 of CA3.
- **Amendment:** generate the pairs as (X in the types that move predicate p) × (Y in the types whose step outcome or announcement reads p). The predicates come from CA2, and the pair set is then finite and derived rather than hand-picked. Triples add nothing new: every predicate listed can be reached by one X.

### CA9. The D3 classification reads "transferable voter"; raft-rs keys on "has progress"

- **Dimension:** an input-definition mismatch (F8's axis).
- **Evidence:**
  - `raft-rs-leadership-transfer.js:162-167` treats a drop at a leader as the transfer's only if self is a *transferable voter*, so not a learner.
  - raft.rs `:2026-2041` drops for a self-removal only when self has *no progress*. A leader that is a learner in the configuration (reachable through a multi-change or joint ConfChangeV2, which `normalizedConfChange` passes through at `raft-rs-operation-port.js:101-103`) still has progress. Its transfer drop would then be answered with the raw non-retryable refusal.
- **New or instance:** an **instance of F8**. The value is the same in both runs, so it needs an anchor. Production only proposes single changes, so it is reachable only through an array-shaped change.
- **Amendment:** add "a leader in the configuration but not a voter (learner, or outgoing only)" to the I5 cells for D3/D4, with an anchor. Or record it as unreachable through the canonical request shape, with the pass-through named.

### CA10. Oracle independence (open question 5)

Both runs drain through `perform`, `drainInbound`, `drainReady`, `announce` and `readStatusObserved`. The A/B comparison is blind to every mistake that is the same in both runs. The mistakes it misses, and whether the anchor set covers each:

| # | Shared mistake | Why A/B misses it | Covered by a listed anchor? | Amendment |
|---|---|---|---|---|
| a | The announcement diff or event emission is wrong (CA5, reproduced) | both runs nest identically | **no.** W2 counts LEADER events only | the projection-equals-core anchor (CA5) |
| b | A drain step skipped or reordered, for example stepping LIFO, or deduplicating by type | the reference drains the same way | **no.** The structural rule checks only `entries[0] === 'step'` (`:411`) | extend the structural rule: the stepped sequence equals the delivered sequence, envelope by envelope, using `setActualCoreEntryObserver` |
| c | Wrong application of a committed conf change: `set_conf_state` skipped, or ConfState taken from `conf_state` instead of `apply_conf_change` | the in-memory `prs` agrees in both runs; the durable record is never compared | **no** | add the durable record (hardState term, vote, commit; the stored ConfState) to 1.3, plus an anchor: a crashed and recovered replica reports the same ConfState and term |
| d | Classification logic (F8, CA9) | the same function in both | yes for self-removal and no-leader (R2.3, R3.8, R3.9); **no** for a learner leader | the CA9 anchor |
| e | The async path: the inbound re-check after an awaited Ready (`:1245-1247`), D8's cached answer, `tail` bookkeeping, `whenPersistenceAdmitted` | the harness is synchronous, so neither run executes these (CA6) | **no.** R2.4 and R3.10 use the partition clocks but test outcome, not mid-turn arrival | the I20 axis plus the mid-turn arrival leg (CA6) |
| f | A reference drain that processed nothing: an admission gate closed, or substituted (CA1) | the inputHidden scenarios (`:240`, `:250`) and the controls skip the "processing moved an input" precondition (`:401`) | **no** | precondition for every scenario: the reference turn's core-entry trace contains every delivered envelope's `step`, and the reference drain's answer is a status |
| g | The observation itself is a substituted refusal | `observe()` (`:322-337`) reads `readStatus` and takes `.role`, `.term` and so on. A refusal-shaped value gives `undefined` in both runs and compares equal | **no** | `observe` and `decisionInputs` assert the read is a status record, not an outcome |
| h | Success without the durable effect for D4 (CA3) | nulled identically in both runs | **no** | the CA3 anchor |
| i | The answer substituted by a pending envelope's host failure (persistence or application failing in the drain of a pending envelope, `:913-917`, `:827-830`) | not shared: the runs differ (the reference fails the group, and the request then reconstructs) | outside exclusion 4, which names only CORE_FATAL and replacement | either an explicit exclusion ("a host failure while processing a pending envelope answers the command; containment-owned") or a cell. Owner's choice |

### CA11. Scope (open questions 1 and 2)

**Q1: D5 to D9 and A1 to A5.**

- **D5 (campaign eligibility):** **in scope.** It is the same turn and the same fresh read after the drain. A promotion or removal that is committed and applied while pending changes `promotable` and ConfState.
- **D5 when reached from `resumeAfterReconstruction`:** its sole-voter campaign (`:466-477`) runs inside `ensureExecution`, **before** `drainInbound` (`:1259-1265`). Name it in exclusion 4 (reconstruction), not in the claim.
- **D6 (the probe):** **in scope**, with CA4's in-turn ticks as an event.
- **D7 (announce):** not a decision. It is the producer of the **output** added in CA5, and is covered by a direct anchor rather than A/B.
- **D8 (a cached read):** its contract is "the last completed entry" (`:1002-1004`), so a pre-drain answer is by design. Its **substitution mode** (CA1: a read answered with a step refusal) **is** in the claim, because it comes from the turn's drain.
- **D9 (the gates), with open question 4:** the I11 re-entry is a host-state gate read before an await. The claim is about raft messages, so this is **outside the claim's letter**. Record it as a separate class (host gates across awaits), not F1.
- **A1 (handoff branch) and A5 (write gate):** both decide on the tracked role, which is before the drain by construction. They are outside the runtime turn. Narrowing the claim to exclude them **changes the guarantee's letter**, so the owner must acknowledge the exclusion (Phase 9). It is not the evidence author's choice.
- **A2 (admission pre-check):** the same, for its cached path. Its substituted path follows D8's substitution mode and is **in**.
- **A3 and A4:** **in.** They are pure consumers of D3 and D4, and CA1 shows them diverging.

**Q2: is I6 covered by the answer alone? No.** I6 has four effects, and only the first shows in the answer:

1. D3/D4 classification. This is in the answer.
2. D1 retarget or "ignored, same node" (raft.rs `:1889-1906`). The answer is `transfer-requested` in all three cases: started, retargeted and ignored. It shows only in *who receives MsgTimeoutNow*, and in the leader one timeout later only when the winner changes.
3. The step outcome of a pending forwarded MsgPropose (CA1/P1).
4. The window end (`election_elapsed` reset, CA4).

**Amendment:**
- Add to 1.3 **the requester's outbound messages in the decision turn**, as (type, to) in order. That trace is deterministic within a turn and exposes effect 2.
- Add P1 for effect 3.
- Hand effect 4 to challenger B.

### CA12. Minor corrections to the model text

- **4.1, MsgHeartbeatResponse row, "No I1 to I6":** true for state, but it is a response type and can therefore be StepPeerNotFound (CA1). Reclassify it from "control" to "control when the sender is in progress; substitution otherwise".
- **4.1, MsgPropose row:** add the four Err cells (CA1).
- **4.1, rows 4 and 6:** add StepPeerNotFound.
- **4.2, the event "Persistence completion":** `READY_DEFERRED` is `CORE_OK` (`:906-907`), so `drainInbound` keeps stepping later envelopes with the earlier Ready untaken. Those envelopes' role, term and progress effects are live in the core, but conf application, `applied` (I17) and `announce` (I7/I8, events) are not. State this explicitly: it splits I5 and I17 into "stepped" and "applied" phases.

## Summary of amendments (union for the evidence author)

- **Inputs:**
  - I16: sender in progress;
  - I17: `has_pending_conf` and the joint state;
  - I18: `election_elapsed` and the transferee's matched against `last_index`;
  - I20: send synchrony;
  - I21: re-entrant subscribers;
  - extend I6 and I5 to "read by the step outcome";
  - record SHAPED_STATUS and the LEADER_CHANGE identity under I9.
- **Events:**
  - the step outcome column, with the four Err shapes;
  - in-turn probe ticks;
  - a nested drain from subscribers;
  - the stepped and applied split under READY_DEFERRED.
- **Outputs:**
  - the ordered event stream and the subscriber projection;
  - the requester's outbound (type, to) trace;
  - the durable record;
  - D4's entry type (conf change or nulled);
  - the reference drain's own answer.
- **Decisions:**
  - add A5, the partition write gate;
  - move D5 and D6 into scope;
  - keep D8's substitution mode in scope;
  - D7 becomes an output;
  - put the reconstruction resume (sole-voter campaign) under exclusion 4.
- **Pairs:** generated as (moves predicate p) × (step outcome or announcement reads p). The concrete pairs are P1-P4, P6 and P7.
- **Oracle guards:**
  - every scenario asserts the reference processed every envelope and returned a status;
  - `observe` asserts a status shape;
  - the structural rule checks the whole stepped sequence.
- **Anchors to add:**
  - the projection equals the core after each turn (CA5);
  - a D4 answered OK implies the change is committed (CA3; red on production);
  - a crashed and recovered replica reports the same ConfState and term;
  - a learner-leader drop is classified correctly (CA9, or recorded as unreachable).
- **Mutation families:**
  - F12, the answer substituted by a pending event's processing outcome;
  - F13, a stale or duplicated announcement diff;
  - D4 added to F7.
- **Owner decisions (Phase 9):**
  1. CA1 is a production violation of the frozen claim. Fix production, or narrow the claim.
  2. A1/A5 and A2's cached path: exclude them from the claim, with explicit acknowledgement.
  3. CA3's anchor is red on production and pre-existing. Decide whether it is F1's.
