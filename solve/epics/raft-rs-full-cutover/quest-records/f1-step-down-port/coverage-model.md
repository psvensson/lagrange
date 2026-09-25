# F1 coverage model: decisions on pending raft messages (synthesis gate, v1)

Author: Agent A (the evidence author), 2026-09-25, under the owner's verification protocol v2 (synthesis). This is the model **before** the challengers attack it.

- **Production** is frozen at bc8e1118d. Every file:line below is read on the worktree at 1e64d5a57, whose `src/` is identical to bc8e1118d.
- **Not done here, by order:** the Phase 6 timing arithmetic and the full enumeration audit. The static investigator's output is to be merged into sections 1.6 and 4.
- **Why this model exists:** rounds 2, 3 and 4 were rejected on one root (MD, X1, X4, Y1, Y2). The model is meant to make the next evidence range over the whole grid, instead of one more cell of it.

## 1. Frozen claim (Phase 0)

> **A decision made when relevant raft messages are already pending must produce the same externally relevant result as that decision made after those messages have first been processed.**

### 1.1 Semantic owner

The rs-raft runtime owner's **command turn**. That is `perform` (`src/raft/raft-rs-runtime-owner.js:1250-1266`), entered through the group queue (`enqueue`, `:671-694`) from the port's `dispatch` (`src/raft/raft-rs-operation-port.js`).

- A turn is admission, then `ensureExecution`, then `drainInbound`, then `performCommand` (`:1209-1233`).
- Pending messages are the port's `step()` deliveries. They sit in `group.inbound` (`enqueueStep`, `:1377-1402`) until a turn drains them.
- Two other things can drain them:
  - the scheduled inbound drain on the group's own clock (`scheduleInboundDrain`, `:1280-1286`, with `INBOUND_DRAIN_DELAY_MS = 0`);
  - a `readStatus` that meets pending inbound (`readStatusObserved`, `:1034-1052`).

### 1.2 Authoritative oracle

raft-rs itself, through the **process-first run**. The same cluster state is built again, the same pending messages are processed by the core first (a drain that never ticks), and then the same request is made. Nothing is written as an expected literal. What raft-rs does with those messages is the expectation.

### 1.3 Externally relevant outputs, per decision

| Decision | Compared outputs |
|---|---|
| Named transfer, most-caught-up transfer | 1. The port's frozen answer record (every field). 2. Who leads, at what term, and each connected replica's `leaderId` and ConfState (voters, learners), one election timeout later. |
| Dropped-write classification: `propose`, `proposeConfChange` | 1. The answer record (outcome, reason, `retryable`, `recoveryRequired`). 2. The same leader, term and configuration observation. 3. The durable-write outcome: whether the command is in the leader's durable log and committed. At the partition layer, whether the write is answered success, deferRetry or refusal, and whether its row exists. |
| The partition consumers of those answers (write path, membership admission, replica-handler handoff) | Their typed results: write success/deferRetry/failure and row presence; admission PROPOSED/DEFERRED/REFUSED; handoff branch and state. |

### 1.4 Allowed nondeterminism

- **raft-rs's randomized election timeout is unseeded.** It is drawn in [election tick, 2 × election tick) per follower (`raft.rs` `reset_randomized_election_timeout`). Only elections by timeout depend on it.
- **What is compared modulo it:** the scenarios are built so that every leadership change inside the observation window is message-driven: a vote request, MsgTimeoutNow, or a forwarded transfer. An isolated or crashed replica is left out of the observation, because its term moves by its own random timeouts.
- **Where an election by timeout is inherent** (a leader crash with survivors electing), only the class of outcome is compared: "some connected voter leads at a term ≥ t+1, and the old leader follows it". Which voter is not compared.
- **Real-timer partition legs** (the write path) are compared on outcome, never on how many retries were made or when. The one exception is "at least one retry", which is used as a precondition.

### 1.5 Explicit exclusions (proposed; the challengers should contest them)

1. **Decisions outside the rs-raft runtime turn that read cached projections are pre-existing, and not F1's claim:**
   - the replica handler's tracked role (`getTrackedReplicaRole`, `src/node/replica-handler-runtime-methods.js:635-647`, used at `replica-handler-leader-handoff-methods.js:126`);
   - membership admission's `readStatus` pre-check (`partition-service-raft-membership-administration.js:120-135`).

   They are modelled in section 2 as **adjacent**, so the challengers can decide whether they belong in the claim.
2. **The registry lookup of a named target at dispatch** (`raft-rs-leadership-transfer.js:64-85`, called at `raft-rs-operation-port.js:259-266`) happens before the turn by design. It is sound because no inbound message writes the registry (section 3, I9). The verifier's Y3 showed that a memoized lookup can only produce a stale refusal, never a false acceptance.
3. **Liferaft ports and message groups** (the design's C9). Liferaft refuses a transfer typed.
4. **CORE_FATAL and runtime replacement mid-turn.** These go through generic containment and have their own witnesses.
5. **Pre-vote and check-quorum.** The production tuning has both off (`RAFT_RS_GROUP_TUNING`). The pre-vote message types have no production sender.

### 1.6 Existing timing contracts (listed only; the Phase 6 arithmetic is the static investigator's)

| Constant or relation | Where |
|---|---|
| Transfer window (a leader's `lead_transferee` lifetime) = election tick × tick length = `recoveryRetryWindowMsOf(timing)` | `src/raft/raft-rs-runtime-tuning.js:52-54`; election tick `:26-39` |
| Election tick = `ceil(electionMinMs / tickMs)`, frozen per node at `create_node` | `raft-rs-runtime-owner.js:403-423` (`tuningOf(group.timing)` at `:409`) |
| Per-replica election floor = base + index × `ELECTION_JITTER_PER_REPLICA_MS` (2500) | `src/raft/replica-election-timeouts.js:22-49`; `src/raft/constants.js:49-58`; applied at `partition-service-raft-init-base.js:411-433` |
| Heartbeat tick = 3 | `src/raft/raft-rs-group-constants.js` |
| Write deferral budget 2000 ms; retry 10 ms, backing off to 100 ms | `src/partition/partition-service-constants.js:44-50`; `partition-service-raft-write-commit.js:84-98` |
| Inbound drain delay 0; persistence-admission poll 10 ms, bound 120 000 ms | `raft-rs-runtime-owner-constants.js` (`INBOUND_DRAIN_DELAY_MS`, `PERSISTENCE_ADMISSION_WAIT`) |
| Recovery retry window = the transfer window's span | `raft-rs-runtime-owner.js:235-262`, `:564-590` |
| Adaptive IDLE profile minimum election timeout 3000 ms | `src/config/raft-adaptive-timing-controller.js:111` |
| User-transaction legal hold (durability fitness) | `partition-service-durability-fitness.js:186-205` |

## 2. Decisions

The production dispatcher, confirmed:
- Port methods: `RAFT_OPERATION_PORT_METHODS` (`src/raft/raft-operation-port.js:5-19`).
- Runtime commands: `RUNTIME_COMMAND` (`raft-rs-runtime-owner-constants.js:41-52`), dispatched by `COMMAND_OPERATION` (`raft-rs-runtime-owner.js:1195-1206`), plus the primitive map `tick`, `propose` and `propose-conf-change` (`:1213-1217`).

**In-turn decisions that read state (the claim's scope):**

| # | Decision | Site | Inputs read in the turn | Result |
|---|---|---|---|---|
| D1 | Named transfer | `transferLeadership` `:1160-1183`, `decideNamedTransfer` (`raft-rs-leadership-transfer.js:87-104`) | status (role, lead), ConfState (`transferableVoters` `:50-55`); target from the registry at dispatch | already-leader, target-not-voter, transfer-requested, transfer-forwarded, no-known-leader |
| D2 | Most-caught-up transfer | the same, `decideMostCaughtUpTransfer` (`:118-141`) | status (role, progress `matched`), ConfState | not-leader, no-eligible-successor, transfer-requested with the chosen transferee |
| D3 | Dropped `propose` classification | `performCommand` `:1224-1232`, `answerRefusedProposal` `:1185-1193`, `droppedByLeadershipTransfer` (`:162-167`) | the core's refusal text; status (role); ConfState (self a transferable voter) | HOST_FAILURE in-progress, or the raw CORE_REFUSED |
| D4 | Dropped `proposeConfChange` classification | the same (`PROPOSAL_COMMANDS`, `:1207`) | the same | the same |

**Other in-turn decisions over the same inputs.** These are not introduced by F1, but they are in the same turn and the same mechanism. I propose they are **in the model** and range under the oracle; the challengers should confirm.

| # | Decision | Site | Inputs |
|---|---|---|---|
| D5 | Campaign eligibility | `campaignGroup` `:1054-1076` | status (`promotable`), ConfState |
| D6 | Progress probe | `probePeerProgress` `:1125-1158` | ConfState (configured peer), status (role, `matched`, commit) |
| D7 | Role, term and leader announcement (the partition's projection) | `announce` `:940-963` | fresh status against the cached `group.lastStatus` |
| D8 | Status read answered from the cache while busy | `readStatusObserved` `:1034-1052` | `group.statusObservation`, from the last completed entry |
| D9 | The gates: user-transaction admission, recovery | `perform` `:1254-1259`, `drainReady` `:902-904`, `ensureExecution` `:645-660`, `enqueueStep` `:1394` | `persistenceAdmitted` (`raft-rs-persistence-admission.js:26`), `group.health`, `group.recovery` |

**Adjacent decisions** (outside the turn, reading a projection or an earlier turn's result; see exclusion 1):

| # | Decision | Site | Inputs |
|---|---|---|---|
| A1 | Handoff branch (source: most-caught-up; target: named self; or a role no-op) | `replica-handler-leader-handoff-methods.js:84-97`, `:126-147` | tracked role (a partition projection of D7's events) |
| A2 | Membership admission pre-check (NOT_LEADER, ALREADY_MEMBER, or propose) | `partition-service-raft-membership-administration.js:120-135` | `readStatus()`, which can be D8's cache |
| A3 | Write-path deferral loop (success, deferRetry at budget exhaustion, or failure) | `partition-service-raft-write-commit.js:56-110` | D3's answer, over several turns |
| A4 | Admission outcome mapping (DEFERRED or REFUSED) | `…membership-administration.js:35-46` | D4's answer |

## 3. State inputs (every one a decision reads, with where it lives)

| # | Input | Kind | Where it is written | Where D1 to D9 read it |
|---|---|---|---|---|
| I1 | Role (`raftState`) | core, live | raft-rs | `readGroupObservation` `:965-979` (fresh `status`) |
| I2 | Term | core, live | raft-rs | the same |
| I3 | Leader (`lead`) | core, live | raft-rs | the same; the identity is resolved through `semanticLeaderIdentity` `:926-938` |
| I4 | Replication progress (`status.progress[].matched`, commit) | core, live | raft-rs | the same (D2, D6) |
| I5 | Membership: ConfState (voters, learners, outgoing, `learnersNext`) | core, live; also durable | `apply_conf_change` and `set_conf_state` in `resolveCommittedEntryConfState` `:785-807` | `conf_state` in `readGroupObservation` |
| I6 | A transfer in progress (`lead_transferee`) | core, live, **not exposed** by the binding's status (`lib.rs:683-725`) | raft-rs | only indirectly: the core's proposal drop, `:1224-1232` |
| I7 | Cached last status (`group.lastStatus`) | runtime cache across turns | `announce` `:946-947`, `announceNoRole` `:188-198` | D7 (event diffs). Y1 and X8 read it for decisions |
| I8 | Cached observation (`group.statusObservation`, `SHAPED_STATUS`) | runtime cache across turns | `recordStatusObservation` `:994-999`; `SHAPED_STATUS` `:159` | D8; A2 through `readStatus` |
| I9 | Peer-identity registry | durable, append-only | `registerReplica` (`raft-rs-peer-identity.js:111`), called at port construction (`raft-rs-operation-port.js:137-140`) and by the reservation owner (`:147-149`); no inbound message writes it | the named target at dispatch (`raft-rs-leadership-transfer.js:64-85`); `normalizedConfChange` (`raft-rs-operation-port.js:100-124`); leader identity (`:926-938`) |
| I10 | Timing (`group.timing`) and core tuning | runtime; tuning frozen per node | `configureTiming` `:1404-1407` (adaptive or `configureTick`); `tuningOf` at `create_node` `:409` | the recovery window `:237`, `:261`, `:585`. The core's election tick changes only at reconstruction |
| I11 | Persistence admission (a user transaction open on the connection) | host state | the partition's session transactions | D9: `perform` `:1254` (**once, before an async drain**), `drainReady` `:902` |
| I12 | Health, recovery record, runtime generation | runtime | `groupFailed` `:250-266`, `reconstructGroup` `:605-634`, `replaceRuntime` `:501-532` | D9; `invokeCoreAt` generation check `:387-400` |
| I13 | Lifecycle (closed, retired) | durable and runtime | the port's `closed`; `RaftRsReplicaLifecycleOwner` | `dispatch` before everything |
| I14 | Tracked role (partition projection) | partition cache | port role events (`partition-service-raft-lifecycle-wiring.js:60-110`) | A1 |
| I15 | Per-peer delivery observations (`group.peerDelivery`) | runtime cache | `recordPeerDelivery` `:707-714` | status shaping only. **Not** a decision input |

## 4. Events (derived from the binding; the full audit is the static investigator's)

### 4.1 Message types

The source is `num_to_msg_type` (`vendor/raft-rs-wasm/src/lib.rs:1225-1249`); the local-only set is raft-rs `is_local_msg` (`vendor/raft-rs-wasm/raft-0.7.0/src/raw_node.rs:57-66`). The inputs each type can change are read against `raft.rs` 0.7 semantics (not vendored; cited as the design does).

| Type | Peer can deliver it? | Inputs it can change at the receiver | Planned scenario (requester, decision) |
|---|---|---|---|
| 0 MsgHup | no (local; `RawNode::step` refuses it) | – | – |
| 1 MsgBeat | no (local) | – | – |
| 2 MsgPropose | yes: a follower forwards it to its leader | the leader's log (last index). An entry of type ConfChange sets the pending conf index. No role, term, leader, `matched` or ConfState change until acknowledgements commit it | control scenario; D1 and D3 on the leader |
| 3 MsgAppend | yes | I1, I2, I3 (a higher term demotes the receiver and names the leader); I5 on commit of a conf entry | stale leader, D1, D2 (Y2) |
| 4 MsgAppendResponse | yes | I4 (`matched`); commit leads to I5 (applied conf change) and I6 (a committed removal of the transferee aborts; a caught-up transferee gets MsgTimeoutNow) | D2 unequal progress (Y1); D1 transferee removal; D3 and D4 self-removal |
| 5 MsgRequestVote | yes | I1, I2, I3 (a higher term demotes) | D1, D2 at the leader |
| 6 MsgRequestVoteResponse | yes, to a candidate | I1, I3 (the candidate becomes leader) | D1 named self at the candidate |
| 7 MsgSnapshot | **unreachable here:** a leader sends it only for compacted entries, and the binding exports no compaction | would change I2, I3, I5 | none; recorded |
| 8 MsgHeartbeat | yes | I1, I2, I3 (higher term); commit | stale leader, D1 and D2 (Y2) |
| 9 MsgHeartbeatResponse | yes | recent_active and probe resumption only. With check-quorum and pre-vote off, a follower ignores a lower-term heartbeat, so a response never carries a higher term. No I1 to I6 | control scenario |
| 10 MsgUnreachable, 11 MsgSnapStatus, 12 MsgCheckQuorum | no (local) | – | – |
| 13 MsgTransferLeader | yes: a follower forwards it | I6 (a transfer starts or is retargeted at the leader); forwarded on at a follower | D3 and D4 during the pending transfer; D1 retarget |
| 14 MsgTimeoutNow | yes | I1, I2 (the receiver campaigns at once) | D1 at the transferee |
| 15 MsgReadIndex, 16 MsgReadIndexResp | no production sender (the port never calls `read_index`, and the binding exports none); ingress admits types 0 to 18 (`raft-rs-ingress-constants.js`) | read states only | none; recorded |
| 17 MsgRequestPreVote, 18 MsgRequestPreVoteResponse | no production sender (pre-vote off) | a pre-vote request never bumps the receiver's term; a response is read only by a pre-candidate | none; recorded |

### 4.2 Non-message events that change inputs within or between turns

| Event | Inputs it changes | Where |
|---|---|---|
| Tick (scheduled or explicit; a queued command, never inside another turn) | I1, I2 (a follower's election timeout); I6 (the leader aborts a transfer after the election tick); heartbeats go out | `performCommand` primitive `tick`; `scheduleTicks` in the port |
| The request's own effect | D1 steps MsgTransferLeader (I6); D3 and D4 append or are dropped | `:1175-1182`, `:1224-1232` |
| Conf-change application inside a Ready drain | I5; I4 (progress added or removed); I6 (removed transferee) | `applyEntries` `:809-833` through `resolveCommittedEntryConfState` `:785-807` |
| Persistence completion and admission (`whenPersistenceAdmitted`) | when application, and so I5, happens; READY_DEFERRED while a user transaction is open | `finishReady` `:835-888`, `drainReady` `:890-924` |
| An async send or a persistence wait inside a drain | lets new `step()` deliveries join `group.inbound` mid-turn | `sendMessages` `:774-783`; `drainInbound` re-checks inbound after each Ready `:1235-1248` |
| Reconstruction or core replacement | I1 to I6 reset from the durable record (a transfer is lost); I12 | `reconstructGroup` `:605-634`, `replaceRuntime` `:501-532` |
| Timing reconfiguration | I10 (the recovery window only; the core's tick is unchanged until reconstruction) | `configureTiming` `:1404-1407` |
| Registry reservation | I9 | the reservation owner, outside the turn |

## 5. Temporal relationships

| # | Relationship | Where it can occur | Model status |
|---|---|---|---|
| T1 | **Pending before the decision** (delivered, unprocessed at the start of the turn) | every D1 to D6 turn | the oracle's main axis |
| T2 | **Processed immediately before** (the same messages drained by an earlier turn, a scheduled drain, or a `readStatus`) | the oracle's reference run | the reference |
| T3 | **Arriving mid-decision** | the observe, decide and step steps of D1 are one synchronous block (`:1160-1183`); D3 and D4 classify synchronously after the refusal (`:1224-1232`). Awaits happen only inside `drainReady` (sends, persistence admission) and in `drainInbound`'s re-check between envelopes | a message arriving during an await **before** the decision is drained first (re-check); one arriving **after** the step is the next turn's. No production decision spans two turns (the verifier's Y4 found only a microtask-later split unreachable) |
| T4 | **The multi-step operations** | A1 (tracked role, then the port decision); A2 (`readStatus`, then a proposal in a later turn); A3 (deferral retries over many turns); I11 (the admission gate checked once at `perform` entry, then an async drain: verifier round-1 non-blocking 2) | A3 in scope (durable output). A1, A2 and I11 re-entry are adjacent; the challengers should decide |
| T5 | **A timeout or retry boundary crossed during the decision** | ticks are queued turns, so no tick interleaves a turn. Boundaries crossed **between** turns of one logical operation: the transfer window (abort) against the write deferral budget (A3; MI2's site, reachable per round 3); the recovery retry window; the persistence-admission bound | A3 at both ends of the budget (R2.4, R3.10); the others are timing contracts for Phase 6 |

## 6. Planned oracle and anchors

**The oracle (differential, Phase 4).** For each cell (decision × pending event type × the input it moves) that section 4 marks reachable:
1. Build the cluster state twice, on the never-advanced virtual clock, from the same identities (so the same raft ids) and the same harness delivery order.
2. **PENDING run:** the messages are handed to the requester's `step()` and left unprocessed.
3. **PROCESSED run:** the same messages are processed by a status read, which drains and never ticks.
4. Make the same request in both runs, then deliver and tick one election timeout of rounds in both.
5. Compare in full: the answer record; each connected replica's role, term, `leaderId` and ConfState; and, for D3 and D4 at the partition layer, the durable-write outcome.

**Guards on the oracle itself:**
- **Precondition:** in the PROCESSED run, processing actually moved the named input: the requester's role, term, leader, progress or ConfState differs before and after the drain. I6 is the exception, because it is invisible to status; its move is shown by the answer.
- **Census:** every binding message type is either local-only, has a scenario, or has a recorded reason. It fails when the binding gains a type.
- **The round-3 structural rule rides along.** In the PENDING run, the turn's first core entry is a delivered step.

**Anchors that stay (against a bug common to both runs):**
- W1 and W2 (the target leads; no regain);
- W3 (typed refusals, closed port, open transaction, Liferaft);
- R2.2 (learners never chosen);
- R2.3, R3.8 and R3.9 (drop causes that are non-retryable, with fixed expectations);
- R3.4 (a higher-term vote request gives `no-known-leader`);
- R2.4 and R3.10 (durable-write outcome at both ends of the budget);
- the round-3 drain-order structural legs.

The oracle compares PENDING with PROCESSED. A classification or transfer bug that is wrong in both runs is invisible to it, and only an anchor catches it.

**Scaffolding already in the worktree, unstaged, to be extended to the amended model:**
- `test/raft/raft-rs-backend/transfer-leadership-drain-oracle.test.js`: the census plus 14 scenarios over D1 to D4 and types 2, 3, 4, 5, 6, 8, 9, 13 and 14;
- the driver's `loseInTransit`;
- the de-exported `SUCCESSOR`.

## 7. Planned mutation families (one per semantic dimension, Phase 7)

| # | Family (dimension) | Known members, all planted so far | Must be caught by |
|---|---|---|---|
| F1 | A pending event not processed before the decision (the event axis; any subset of types) | MD, X1, X4, Y2, Y5, Z1 (vote responses and MsgTimeoutNow deferred) | the oracle; plus the structural rule |
| F2 | A decision on cached pre-event state (I7, I8) | X8, Y1, X7 (a core-read variant) | the oracle; X7 also by the structural rule |
| F3 | A higher term ignored (a stale I1, I2 or I3) | X1, Y2, X8 | the oracle; R3.4 |
| F4 | Progress ignored or misranked (I4) | ME1, ME2, X2, Y1 | the oracle (Y1); R2.2 and W1c (the anchors) |
| F5 | Membership ignored (I5) | MC1, MH2, MD | the oracle; W3 and R2.1 |
| F6 | A decision split across processing steps (T3 and T4) | Y4 | the structural rule; A1 and A2 as proposed in the model |
| F7 | Success or retryable answered without the durable effect | MA, MB, MI1, MI2, X5, X6 | the anchors R2.4 and R3.10; W1 |
| F8 | A drop cause misattributed (the classification's own logic) | MH1, MH2, X3 | the anchors R2.3, R3.8 and R3.9 (a bug in both runs) |
| F9 | Gates bypassed (I11, I13) | MF, MG | W3 |
| F10 | A second authority or path (single authority) | MC2, MJ1, MJ2, MK | handler and census tests |
| F11 | A stale registry (I9) | Y3 | recorded as out of the claim (only a stale refusal is possible) |

**Recorded as equivalent under the claim:** Z2 (MsgHeartbeatResponse deferred past the decision). It moves no decision input, and the oracle's control stays equal. Only the structural rule, which is stricter than the claim, flags it.

## Open questions for the challengers

1. Do D5 to D9 and A1 to A4 belong inside the claim, or in the exclusions?
2. Is I6 (a transfer in progress, invisible to status) covered adequately by the answer alone?
3. Pairwise events: two pending types whose order changes the decision, for example MsgTransferLeader followed by MsgAppendResponse, which catches the transferee up, versus the reverse. The single-type grid does not cover these.
4. I11 re-entry after an async drain (T4) is a gate read before an await. Is it the same class, and so in the claim?
5. Is the process-first reference independent of the mistakes it must catch? It drains through the same `drainInbound`, so a mutant that changes `drainInbound` itself for every command would change both runs.
