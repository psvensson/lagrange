# F1 static investigation: enumerations, cached state, timing arithmetic, temporal relationships

- Worktree: `.claude/worktrees/f1-step-down`, branch `quest/f1-step-down-port`. `git diff bc8e1118d HEAD -- src vendor` is empty, so production is frozen at bc8e1118d.
- Read-only. No repository edits, no git writes, no test suites run.
- Two read-only helper scripts sit next to this file:
  - `parse-enums.mjs` parses the enumerations from lib.rs, raw_node.rs and the owners' constant modules.
  - `timing.mjs` evaluates the owners' own timing functions (`tuningOf`, `recoveryRetryWindowMsOf`, `computeReplicaElectionTimeouts`).
- raft-rs semantics are cited from `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0/src/raft.rs`, called **raft.rs** below. Its version is pinned by `vendor/raft-rs-wasm/Cargo.lock`, but the file is not vendored.
- Only three raft files are vendored: `vendor/raft-rs-wasm/raft-0.7.0/src/{lib.rs,raft_log.rs,raw_node.rs}`, called **raw_node.rs** below.
- **lib.rs** below means the fork's binding source, `vendor/raft-rs-wasm/src/lib.rs`.

Paths starting with `src/` are relative to the worktree.

---

## 1. Authoritative enumerations (Phase 5)

### 1.1 Raft message types

**Authority.**
- `lib.rs:1226-1251`, `num_to_msg_type`: the numbers the binding decodes. This is the only universe the port can step.
- The proto enum `raft-proto-0.7.0/proto/eraftpb.proto:49-69` holds the same 19 values. It is not vendored, so tests must not depend on it.

**How a test imports it:**
- Parse `num_to_msg_type` with `/(\d+)\s*=>\s*(Msg\w+)/g` over the function body. Two tests already parse it for one member:
  - `test/raft/raft-rs-backend/transfer-leadership-write-path.test.js:43-47`;
  - `test/partition/partition-write-leadership-transfer.test.js:63-65`.
- Parse the local set from `raw_node.rs:57-66` (`is_local_msg`) and the response set from `raw_node.rs:68-77` (`is_response_msg`).
- Assert that the parsed maximum equals `RAFT_RS_MESSAGE_TYPE_RANGE.MAX`, imported from `src/raft/raft-rs-ingress-constants.js:132-135`. That way a new binding member fails visibly.
- `parse-enums.mjs` does all three and prints 19 types, local = {Hup, Beat, Unreachable, SnapStatus, CheckQuorum}, and response = {AppendResponse, RequestVoteResponse, HeartbeatResponse, Unreachable, RequestPreVoteResponse}.

**Path from a peer to the core.**
1. Transport, then `PartitionService.handleTransportMessage`: `await this.raft.step(payload)` (`src/partition/partition-service-entry-apply-base.js:206-212`).
2. The port's `step` is `enqueueStep` (`src/raft/raft-rs-operation-port.js:205-206, 240`).
3. `admitRaftRsMessage` runs (`src/raft/raft-rs-runtime-owner.js:1377-1390`).
4. The envelope goes to `group.inbound`, and a drain is scheduled (`:1397-1398`).

**What ingress does.**
- Ingress (`src/raft/raft-rs-ingress.js:222-348`) checks only routing (group and recipient) and schema (a type in 0..18, decimal 64-bit fields, entry types). It admits **every type 0..18 from any sender** (`:271-277`). There is deliberately no membership rule (`raft-rs-ingress-constants.js:100-104`).
- An envelope is dropped without queueing only while its group is held inside its recovery retry window (`raft-rs-runtime-owner.js:1394-1396`).

**What the core then does.**
- `RawNode::step` (`raw_node.rs:402-411`) refuses local types with `StepLocalMsg`. It refuses response types whose `from` has no progress with `StepPeerNotFound`.
- `Raft::step` (raft.rs:1324-1514) then applies the term rules:
  - term 0 is treated as local and skips the term check (:1326);
  - a higher term makes the node a follower (:1328-1392). For MsgAppend, MsgHeartbeat and MsgSnapshot the new leader is `from` (:1384-1388). For every other type, including MsgTransferLeader, MsgAppendResponse, MsgHeartbeatResponse and a *rejecting* MsgRequestPreVoteResponse, the leader becomes 0 (:1390).
  - A lower term is ignored, because check_quorum and pre_vote are off (:1393-1455). The binding tuning is `raft-rs-group-constants.js:69-74`.
- Every reset (`become_*` → `reset`, raft.rs:986-1015) aborts a running transfer (:996) and resets progress (:1008-1014).

**Pre-existing and cross-cutting: an inbound step error answers the queued command.**
- `drainInbound` (`raft-rs-runtime-owner.js:1235-1248`) returns the first failing inbound step's refusal (`CORE_REFUSED`, phase `step`, `retryable:false`, from `invokeCore` at `:360-369`) *as the answer to whatever command is queued*.
- That command never runs, and the remaining envelopes stay in `group.inbound`. Nothing reschedules them; the next tick or step drains them.
- Round 1 recorded this as non-blocking finding 1. Under the frozen claim it is a cell for **every** decision:
  - With the bad envelope pending: `transferLeadership`, `propose` and `proposeConfChange` answer `step: raft: …`, and the dropped-write classification is never applied (it lives only in `performCommand`, `:1230-1232`).
  - With the envelope processed first, the refusal goes to the earlier turn (for example DRAIN_INBOUND) and the command runs.
- The texts come from raft `errors.rs:14-21`: "raft: cannot step raft local message", "raft: cannot step as peer not found", "raft: proposal dropped".

In the table below, "Inputs changed" names the decision inputs processing can change:

| # | Type | Peer-deliverable through ingress | Local-only (RawNode refuses) | What processing does | Inputs changed |
|---|---|---|---|---|---|
| 0 | MsgHup | admitted | **yes**: StepLocalMsg, which answers the queued command | nothing in core | none, but the queued command's answer is replaced |
| 1 | MsgBeat | admitted | **yes**, same | nothing | none, same answer effect |
| 2 | MsgPropose | admitted. A follower whose port `propose`/`proposeConfChange` is called while it knows a leader forwards it (raft.rs:2312-2322; raft-rs 0.7 has no `disable_proposal_forwarding`) | no. Term 0 is not attached (raft.rs:655-662), so no term check | Leader: appends; a conf-change entry sets `pending_conf_index` (:2076-2077). Leader in transfer or self-removed: Err ProposalDropped (:2026-2041). Candidate: dropped (:2260-2266). Leaderless follower: dropped (:2313-2319). An empty entry list is `fatal!` (:2023-2024), a panic that surfaces as CORE_FATAL | log last index (the transferee catch-up test); pending conf. A drop Err answers the queued command |
| 3 | MsgAppend | admitted | no | Higher term: follower with lead = from. Follower: lead = from, `election_elapsed` = 0, append, commit advance (:2324-2328). Candidate at the same term: follower (:2268-2272). Leader at the same term: ignored | role, term, leader; membership (a committed conf change is applied in the same drain by `resolveCommittedEntryConfState`, `raft-rs-runtime-owner.js:785-807`) |
| 4 | MsgAppendResponse | admitted | no. Response type: StepPeerNotFound if `from` has no progress, which answers the queued command | Leader: progress matched and next (:1608-1823), `maybe_commit` (conf-change apply), MsgTimeoutNow when the transferee reaches `last_index` (:1811-1821). Higher term: follower, lead 0 | **progress**, membership (via commit), role, term and leader (higher term) |
| 5 | MsgRequestVote | admitted | no | Higher term: follower, lead 0, transfer aborted (:1390). Vote granted or refused (:1462-1506) | role, term, leader |
| 6 | MsgRequestVoteResponse | admitted | no. Response type: StepPeerNotFound | Candidate: poll, possibly leader (raft.rs:2283-2296). Higher-term reject: follower | role, leader, term; progress reset on becoming leader |
| 7 | MsgSnapshot | admitted | no | Follower: lead = from, restore (conf state, commit) | membership, leader, term, role |
| 8 | MsgHeartbeat | admitted | no | Higher term: follower with lead = from. Follower: lead = from, elapsed 0, commit advance (:2329-2333). Candidate at the same term: follower | role, term, leader; membership (via commit) |
| 9 | MsgHeartbeatResponse | admitted | no. Response type: StepPeerNotFound | Leader: `recent_active`, resume, `send_append` to a lagging peer (:1825-1851). matched does **not** change here | progress indirectly (it triggers the appends whose responses move matched); role, term, leader on a higher term |
| 10 | MsgUnreachable | admitted | **yes**, StepLocalMsg | none | none; answer replaced |
| 11 | MsgSnapStatus | admitted | **yes** | none | none; answer replaced |
| 12 | MsgCheckQuorum | admitted | **yes** | none | none; answer replaced |
| 13 | MsgTransferLeader | admitted; followers forward it with their term set (raft.rs:2339-2349, `send` :659-662) | no (not in `is_local_msg`) | Leader: `handle_transfer_leader` (:1869-1937) sets `lead_transferee` (hidden: not in the binding `status`, `lib.rs:683-716`), resets `election_elapsed`, aborts a different running transfer, may send MsgTimeoutNow. Follower: forwards. Candidate: ignored. Higher term: follower, lead 0 | **hidden `lead_transferee`**, the ground truth of the drop classification and of repeat or retarget; role, term, leader (higher term) |
| 14 | MsgTimeoutNow | admitted | no | Promotable follower: `hup(true)`, then candidate at term+1, lead 0 (:2351-2371, :1516-1574). A lone voter becomes leader at once. Leader and candidate: ignored (:2298-2304) | role, term, leader |
| 15 | MsgReadIndex | admitted (Lagrange never issues it) | no | Leader: read_only bookkeeping. Follower: forwards | none of the five |
| 16 | MsgReadIndexResp | admitted | no | Follower: `read_states` and `raft_log.maybe_commit(m.index, m.term)` (:2384-2403) | membership (a commit advance can apply a conf change) |
| 17 | MsgRequestPreVote | admitted | no | pre_vote is off, but it is still answered. A higher-term pre-vote does not change the term (:1363-1374) | none |
| 18 | MsgRequestPreVoteResponse | admitted | no. Response type: StepPeerNotFound | A higher-term **rejecting** response makes the node a follower (:1363-1364 exempts only non-reject). Pre-candidate: poll | role, term, leader |

The five decision inputs, and the hidden ones:
- **Role** is `status.raftState`. `ROLE` in `src/raft/raft-rs-runtime-owner-constants.js:30-35` maps 0..3, matching raft `StateRole` (raft.rs:62-71) and `raft_state as u32` at `lib.rs:705`.
- **Term** is `status.term`.
- **Leader** is `status.lead`.
- **Progress** is `status.progress[].matched`. It is only present on a leader (raft `status.rs:48-49`).
- **Membership** is `conf_state`.
- **Hidden** inputs that no decision can read:
  - `lead_transferee`;
  - `election_elapsed`, which sets where the transfer window stands;
  - `last_index`, which decides whether TimeoutNow goes now or after catch-up.
- **Exposed but unused**: `promotable`, `pending_conf_index`, `progress[].state/paused/recent_active/next_idx` (`lib.rs:686-712`).
  - With check_quorum off, `recent_active` is set by responses and never cleared, so it is not a liveness signal (raft.rs:1840, `check_quorum_active` :2826-2829).
  - The progress-ordering function (`src/raft/raft-rs-leadership-transfer.js:106-113`) uses matched plus the lowest id only. A voter with the highest matched but unreachable is accepted, and then aborts after one window.

### 1.2 Runtime commands and the dispatcher

**Authority.**
- `RUNTIME_COMMAND` (`src/raft/raft-rs-runtime-owner-constants.js:41-52`) has 5 members:
  - READ_STATUS `read-status`;
  - CAMPAIGN `campaign`;
  - DRAIN_INBOUND `drain-inbound`;
  - PROBE_PEER_PROGRESS `probe-peer-progress`;
  - TRANSFER_LEADERSHIP `transfer-leadership`.
- The dispatcher `performCommand` (`raft-rs-runtime-owner.js:1209-1233`) also serves three string-literal commands that are **not** in `RUNTIME_COMMAND`:
  - `'tick'`, `'propose'` and `'propose-conf-change'` (`:1213-1217`, `PROPOSAL_COMMANDS` at `:1207`);
  - the port issues them as literals (`raft-rs-operation-port.js:218, 241-243, 247, 269`).
- `COMMAND_OPERATION` (`:1195-1206`) and `PROPOSAL_COMMANDS` are not exported (the exports are at `:1430-1436`).

**Enumeration gap (Phase 5):**
- A test cannot import the full command universe. It can import `RUNTIME_COMMAND` only, or parse the owner's `performCommand` primitive map.
- An unknown type answers `CORE_REFUSED unknown-operation` (`:1218-1224`).
- Recommendation for the evidence author: parse `COMMAND_OPERATION` keys plus the primitive-map keys from the source, or ask the owner to export one frozen command list. Do not write the three literals in a test.

**Commands whose answer depends on core state read in the turn.** Every one runs after `drainInbound` in `perform` (`:1250-1267`).

| Command | State read in turn | Answer depends on | Site |
|---|---|---|---|
| TRANSFER_LEADERSHIP | status and conf_state (`readGroupObservation`) | role, term (via role), lead, progress, voters | `:1160-1180`, decision in `raft-rs-leadership-transfer.js:87-147` |
| propose, propose-conf-change (on refusal) | status and conf_state *after* the core refused | role, membership | `:1185-1193`, `raft-rs-leadership-transfer.js:162-167` |
| CAMPAIGN | status and conf_state | self voter, not learner, `promotable`: NOT_ACTIVE_VOTER or campaign | `:1054-1076` |
| PROBE_PEER_PROGRESS | status and conf_state | peer in config, role leader, `matched >= commit`: observed vs heartbeat driven | `:1125-1151` |
| READ_STATUS | status and conf_state | everything (the answer is the state) | `:986-990` |

**Decisions made outside the post-drain command slot** (candidate decisions beyond the three):
- **Reconstruction resume.** `ensureExecution`, then `reconstructGroup`, then `resumeAfterReconstruction` (`:466-477`, `:605-632`). It reads `conf_state` and decides sole voter → **campaign**, or else announce.
  - This runs in `perform` *before* `drainInbound` (`:1259-1265`). The resume decision is therefore taken while the group's inbound is still pending.
  - `replaceRuntime` (`:501-532`) makes the same decision for **every other** restored group, whose inbound is not drained at all in that turn.
- **The persistence gate** in `perform` (`:1254-1258`) reads the store's admission, not raft state. It refuses the command with a retryable `user-transaction-open` HOST_FAILURE before anything drains.
- **At dispatch, before the command is queued:**
  - `normalizedTransferRequest` resolves the named target through the registry (`raft-rs-operation-port.js:259-265`, `raft-rs-leadership-transfer.js:64-81`). It gives `target-unreserved` (non-retryable), `transfer-unknown-successor` or `transfer-without-replica-identity`.
  - `normalizedConfChange` gives `membership-change-peer-unreserved` (`:100-125`, `:244-255`).
  - These are taken **before** the queued turn, not merely before the drain.
- **`readStatusNow` / `readStatusObserved`** (`:1027-1052`). The port's synchronous status answers:
  - a fresh core read when the queue is idle with nothing pending;
  - otherwise the **cached `statusObservation`** of the last announce, when the queue is busy or when the READ_STATUS it enqueues goes asynchronous (see 2.1).

### 1.3 Core entry types used by the runtime

**Authority.**
- `RAFT_RS_CORE_PRIMITIVES` (`src/raft/raft-rs-core-constants.js:64-92`) has 19 members:
  - `create_node`, `free`, `tick`, `step`, `propose`;
  - `has_ready`, `take_ready`, `persist_ready`, `advance_append`, `advance_apply`;
  - `campaign`, `status`, `export_persisted_state`, `conf_state`, `set_conf_state`;
  - `persist_commit_index`, `apply_conf_change`, `decode_conf_change_entry`, `propose_conf_change_v2`.
- `facadeOf` (`raft-rs-runtime-owner.js:114-128`) exposes exactly these.
- Binding exports outside the facade (`lib.rs` `#[wasm_bindgen] pub fn`, or `pkg/raft_wasm.d.ts:3-26`):
  - `wasm_start`, `seed_storage`, `advance`, `wasm_memory_bytes`, `handle_count`.
- `CORE_CALL_WITHOUT_HANDLE` = {create_node, decode_conf_change_entry} (`raft-rs-runtime-owner-constants.js:36-39`).
- Only `conf_state` has a named constant (`CORE_OPERATION`, `:40`). Every other entry is a string literal in the owner.
- A test can observe the actual order through `setActualCoreEntryObserver` (`raft-rs-runtime-owner.js:1426-1428`, record at `:348-354`: `{sequence, operation, groupId, runtimeGeneration}`).

Entry sites in `raft-rs-runtime-owner.js`:

| Entry | Sites |
|---|---|
| `create_node` | `:427` (open, restore, reconstruct) |
| `free` | `:617` (reconstruct), `:1419` (close) |
| `tick` | `:1214` (tick command), `:1106` (`driveOneHeartbeat`, probe) |
| `step` | `:1240` (inbound drain), `:1170` (transfer) |
| `propose` | `:1215` |
| `propose_conf_change_v2` | `:1216` |
| `has_ready` | `:897`, `:1110` |
| `take_ready` | `:909` |
| `persist_ready` | `:836` |
| `advance_append` | `:852` |
| `persist_commit_index` | `:865` |
| `advance_apply` | `:877` |
| `campaign` | `:1073` |
| `status` | `:941` (announce), `:967` (`readGroupObservation`), `:1055` (`campaignGroup`), `:1371` (first status at creation) |
| `conf_state` | `:434`, `:468`, `:806`, `:973`, `:1059` |
| `decode_conf_change_entry`, `apply_conf_change`, `set_conf_state` | `:789`, `:794`, `:799` (committed conf-change application inside a drain) |
| `export_persisted_state` | no call in the runtime owner (in the facade only) |

Entry order within one turn: `perform` does the gate, then `ensureExecution` (possibly `free`, `create_node`, drain, resume), then `drainInbound` (each envelope: `step`, then the drain loop `has_ready` / `take_ready` / `persist_ready` / sends / apply / `advance_append` / `persist_commit_index` / `advance_apply` / … / `status` + `conf_state` in `announce`), then the command.
- For a transfer the command is `status`, `conf_state`, `step(13)` and a drain (`:1161-1179`).
- For a refused proposal it is `propose*`, then `status` and `conf_state` (`:1225-1232`, `:1189`).

### 1.4 Answer vocabularies

- **`RAFT_OPERATION_OUTCOME`** (`src/raft/raft-operation-port-constants.js:12-17`): CORE_OK, CORE_REFUSED, CORE_FATAL, HOST_FAILURE.
- **`RAFT_LEADERSHIP_TRANSFER_REASON`** (`:75-88`, 12 members):
  - `transfer-requested`, `transfer-forwarded`, `already-leader`;
  - `no-known-leader` (the only retryable refusal), `target-not-voter`, `target-unreserved`, `no-eligible-successor`, `not-leader`;
  - `transfer-unknown-successor`, `transfer-without-replica-identity`;
  - `leadership-transfer-in-progress` (the drop answer, HOST_FAILURE retryable, `raft-rs-leadership-transfer.js:169-177`);
  - `leadership-transfer-unsupported-backend` (Liferaft).
  - `RUNTIME_REASON` spreads them (`raft-rs-runtime-owner-constants.js:121`), so `NOT_LEADER` is shared with `RAFT_PEER_PROGRESS_PROBE_REASON.NOT_LEADER` (`:45-50`), with the same value.
- **`RAFT_LEADERSHIP_TRANSFER_SUCCESSOR`** (`:57-60`): `named`, `most-caught-up`.
- **Transfer answers that arrive with other outcomes:**
  - the port's closed answer `{CORE_REFUSED, reason 'closed'}` (`raft-rs-operation-port.js:197-199`);
  - the lifecycle's retired refusal (`raft-rs-replica-lifecycle-owner.js:99-103`);
  - HOST_FAILURE `user-transaction-open` (`raft-rs-runtime-owner.js:1256-1257`);
  - recovery outcomes (`:544-562`);
  - CORE_FATAL (`:371-380`);
  - `CORE_REFUSED phase step`, when an inbound step refused (1.1);
  - a drained failure *after* the step (see 4.2).
- **The drop-classification input:** `RAFT_RS_CORE_REFUSAL_TEXT.PROPOSAL_DROPPED = 'raft: proposal dropped'` (`src/raft/raft-rs-core-constants.js:126-128`), matched by `endsWith` (`raft-rs-leadership-transfer.js:164`).
- **Write-path deferral** (`src/partition/partition-service-raft-write-commit.js`):
  - `WRITE_DEFERRAL_MESSAGE` keys (`:46-51`, not exported): `user-transaction-open` (`RAFT_RS_PERSISTENCE_ADMISSION.USER_TRANSACTION_OPEN`, `src/raft/raft-rs-durable-store-constants.js:207-210`) and `leadership-transfer-in-progress`.
  - `portDeferralOf` (`:53-58`) accepts only HOST_FAILURE, `recoveryRequired:false`, with a key of that map.
  - `WRITE_PROPOSAL` = accepted, refused, not-made (`:31-35`, not exported).
  - The budget-exhaustion answer is `{…failure, deferRetry:true}` with `PARTITION_LEADERSHIP_TRANSFER_MESSAGE.WRITE_DEFERRED` (`src/partition/partition-service-leadership-transfer.js:20-22`) (`:102-109`).
  - Released-write answers come from `buildReleasedPendingWriteAnswer` (`src/partition/partition-write-kernel.js:310-327`). The codes are `PARTITION_WRITE_LEADERSHIP_REFUSAL` (`:32-41`), including OUTCOME_UNKNOWN, NOT_LEADER and COMMIT_DEADLINE_EXCEEDED. The causes are `PARTITION_WRITE_RELEASE_CAUSE` (`:69-73`). `PROPOSAL_QUEUE_PROPOSAL_STATE` is queued or proposed (`src/partition/proposal-queue-constants.js:54-57`).
- **Membership admission:** `RAFT_MEMBERSHIP_ADMISSION_OUTCOME` (`raft-operation-port-constants.js:99-106`) is PROPOSED, REFUSED, DEFERRED, QUEUED, NOT_LEADER, ALREADY_MEMBER. It is mapped by `admissionOfPortAnswer` (`src/partition/partition-service-raft-membership-administration.js:36-46`).
- **Handler:** `REPLICA_HANDLER_LEADER_HANDOFF_STATE` and `_BRANCH` (`src/node/replica-handler-leader-handoff-methods.js:30-45`, exported `:166-170`).
- **Partition:** `NO_CONSENSUS_PORT` (`src/partition/partition-service-leadership-transfer.js:14-16,24-29`, not exported), CORE_REFUSED retryable.

---

## 2. Cached and derived state a decision could read instead of a fresh core read

The "drain" column says whether the state is updated before or after `drainInbound`, relative to a command's decision.

| State | Where | Written by, and when | Read by | Could stand in for |
|---|---|---|---|---|
| `group.lastStatus` (raw core status) | `raft-rs-runtime-owner.js:1348` | `announce` (`:946-947`) at the end of every completed drain (`:901-903`); `announceNoRole` (`:193`) on host failure; creation (`:1373`). Updated **during** `drainInbound` (each envelope's drain ends in announce), so at decision time it reflects the last envelope's drain. The command's own effects are recorded only in its own drain's announce | `announce` (diffing), `announceNoRole` | role, term, lead, progress. Round-3 Y1 read `lastStatus.progress` *before* the drain. Stale by exactly the pending envelopes when read before `drainInbound` |
| `group.statusObservation` ({status, confState}) | `:1349` | `recordStatusObservation` (`:994-1000`) from announce (`:948`), `readGroupStatus` (`:987`), creation (`:1374`) | `readStatusObserved` (`:1034-1052`), which answers it while the queue is busy or the enqueued READ_STATUS goes async | every partition-level decision that calls `raft.readStatus()` |
| `SHAPED_STATUS` WeakMap (shaped status memo) | `:159`, `:1048-1051` | the first shaping of each observation object | `readStatusObserved` | the peer address and identity resolution, and `peerDelivery`, as of first shaping |
| `group.peerDelivery` | `:1357`, `:707-714` | every send outcome, during Ready drains | status shaping (`raft-rs-status-observation.js:52`) | peer reachability (not an input of the three decisions) |
| `group.timing` | `:1337` | construction; `configureTiming` (`:1404-1407`) from `port.configureTick` (`raft-rs-operation-port.js:272-285`) | `createNodeArguments` (`:409`, only at open or reconstruct); `recoveryRetryWindowMsOf` (`:237`, `:261`, `:585`) | "one election timeout". **It diverges from the core's actual `election_timeout`** after `configureTick`: the core's `electionTick` is fixed at `create_node` until reconstruction. See 3.7 |
| Port `tickIntervalMs` and the timer | `raft-rs-operation-port.js:158-159`, `:216-220`, `:276-283` | construction; `configureTick({tickIntervalMs})` | the tick `setInterval` | the wall-clock length of a window (ticks × current tick length) |
| `group.health`, `group.recovery` | `:1350-1351` | `groupFailed` (`:250-267`), `reconstructGroup` / `settle*` | `ensureExecution` (**before** drainInbound), `enqueueStep` drop (`:1394`), `readStatusNow` | not a raft input. A reconstruction recreates the node from the durable record, which **loses the volatile `lead_transferee`**; that aborts the transfer |
| `group.inbound`, `inboundDrainScheduled`, `inboundDrainDeadline` | `:1354-1356` | `enqueueStep` (`:1397`), `drainInbound` shift (`:1239`), the scheduled drain (`:1280-1319`) | `perform`, `readStatusObserved` | defines what "pending" means for the claim |
| `RaftRsPeerIdentityRegistry` (a durable SQLite table, **no in-memory memo**) | `src/raft/raft-rs-peer-identity.js:74-164` | `registerReplica`, only at port construction (`raft-rs-operation-port.js:137-140`) and from the reservation owner (`:144-149`, reached from `partition-service-raft-peer-cache-reconciliation.js:276` via `setImmediate`/timer, `partition-service-core-base.js:847-865`). Append-only. **No inbound drain writes it** | `normalizedTransferRequest` / `normalizedConfChange` **at dispatch, before the queued turn**; in-turn `resolvePeerIdentity` / `resolvePeerAddress` (announce `:926-938`, shaping) | named-target resolution (`target-unreserved`). It is decided pre-queue, so a reservation that lands while the command waits in the queue still gets `target-unreserved`. Round-3 Y3 class; not a raft-message input |
| raft id to address | the port closure `resolvePeerAddress` (`raft-rs-operation-port.js:173-179`) over the registry plus the partition resolver | fresh per call | progress probe, sends, shaping | – |
| Partition role projection `service.role` | written by `applyReplicaLeadership` / `applyReplicaDemotion` (`src/raft/replica-leadership-state.js:3-4, 36-37`) on port role events | port events are emitted **inside** announce, i.e. during `drainInbound` of the turn that processes the message. Filtered: a joining catch-up learner ignores FOLLOWER and CANDIDATE and keeps `LEARNER` (`src/partition/partition-service-raft-init-base.js:515-535`) | the handler's `getTrackedReplicaRole` (`src/node/replica-handler-runtime-methods.js:635-647`); the write gate `this.role === RaftRole.LEADER` (`src/partition/partition-service-write-metrics-base.js:463`) | **role**, for the STEP_DOWN branch choice and for "propose or refuse NOT_LEADER". Pre-drain by construction: it is read before the port turn that would process the pending envelopes |
| Partition `leaderId` | `reconcileReplicaLeaderChange` (`replica-leadership-state.js:46-64, 145-166`) | the LEADER_CHANGE event | leader rows, rebalancer | leader |
| Partition `raftTimingConfig` | `partition-service-raft-init-base.js:429-436`; recomputed in `applyRaftTimingConfig` (`:681-749`) | init; the dynamic-config sweep (`src/config/dynamic-config-startup-wiring.js:370-383, 429`) | the port request; evidence R3.10's precondition (`recoveryRetryWindowMsOf(leader.raftTimingConfig)`, `test/partition/partition-write-leadership-transfer-committed.test.js:251-253`) | the transfer window, and inherits the `group.timing` divergence above |
| Partition `replicaIds` | `partition-service-raft-init-base.js:421-428`; mutated at `partition-service-raft-peer-cache-reconciliation.js:232` | cache retirement | the election-jitter index (3.1) | replica index, hence the window length |
| Proposal-queue state per entry (queued or proposed) | `src/partition/proposal-queue.js:41, 107-114`; `markCommittedWriteProposal` (`partition-service-cdc-stream-base.js:359-360`) | the write path before and after each proposal turn (`partition-service-raft-write-commit.js:64-75`) | the release answer (`partition-write-kernel.js:312-326`) | "was it handed to consensus" |

**Hazard in derived-state ordering. This is static reading only, unprobed; for challenger B.**

1. The role listeners call `getCurrentTerm()`, which is `service.raft.readStatus()` (`src/partition/partition-service-raft-lifecycle-wiring.js:56`; `replica-leadership-state.js:119, 128, 138, 155, 164`). They do this synchronously *inside* `announce`'s emits (`raft-rs-runtime-owner.js:949-960`).
2. If the outer turn is still synchronous (`group.tail === null`, `enqueue` at `:671-685`) and ≥ 2 envelopes were pending, then `readStatusObserved` sees `inbound.length > 0`. It calls `enqueue(perform READ_STATUS)`, which runs **nested and synchronously** (`:1039-1044`). That drains the remaining envelopes and runs its own `announce`.
3. The outer `announce` then continues emitting TERM_CHANGE and LEADER_CHANGE computed from its older `now` (`:952-960`).
4. Example: a pending vote request, then the new leader's heartbeat. The nested announce emits LEADER_CHANGE(B). The outer one then emits LEADER_CHANGE(null). The partition's `leaderId` ends null, while `lastStatus.lead = B` suppresses any later correction.
5. **Divergence between harness and production:**
   - The harness sends synchronously (`test/raft/raft-rs-backend/partition-node-cluster.js:153-160` queues), so drains stay synchronous and nesting is common.
   - Production's `sendToPeer` is `transport.deliver` (`partition-service-raft-init-base.js:461-469`), a promise. A Ready with messages makes the turn async and sets `group.tail`. Nested reads are then queued, and `readStatus` returns the **cached** `statusObservation`.
   - If a nested READ_STATUS itself goes async while the outer turn continues synchronously, the outer command enters the core while the nested turn's Ready continuation is pending. `take_ready` overwrites `pending_ready` (`lib.rs:577-579`). This is a hypothesis about single-flight; I did not verify it.

---

## 3. Timing arithmetic (Phase 6)

### 3.1 Constants and derivation

- **Base configuration.** `DEFAULT_CONFIG.raft` (`src/config/config-definitions.js:35-41`): electionTimeoutMinMs 1000, max 3000, heartbeatIntervalMs 50, tickIntervalMs 20. `ConfigurationManager` starts from a deep clone of the defaults (`src/config/configuration-manager.js:96`) and applies overrides on top (`:157`), so **tickIntervalMs 20 survives every test that sets only election and heartbeat values**.
- **Partition timing** (`src/partition/partition-service-raft-init-base.js:411-436`):
  - `heartbeatMs = config || RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS` (150, `src/raft/constants.js:50`);
  - `baseElectionMinMs = config || 1000` (`constants.js:51`);
  - `tickIntervalMs = config.get(raft.tickIntervalMs)`.
- **Per-replica jitter** (`src/raft/replica-election-timeouts.js:22-49`): `electionMinMs = base + index × 2500` (`JITTER_PER_REPLICA_MS`, `src/raft/constants.js:58`; `PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS`, `src/partition/partition-service-constants.js:752`).
  - `index = replicaIds.indexOf(replicaId)`.
  - If the id is absent: `index = replicaIds.length + (charCodeSum % 10)` (`:34-41`), so 3..12 for a 3-replica list.
  - The REPLACE target's cohort order is built at `src/node/replica-handler-runtime-metadata-methods.js:219-275`. I did not determine the target's index.
- **Core tuning** (`src/raft/raft-rs-runtime-tuning.js:14-38`):
  - `tickMs = tickIntervalMs` if set, else `max(1, floor(heartbeatMs / 3))`;
  - `electionTick = max(4, ceil(electionMinMs / tickMs))`;
  - `heartbeatTick = 3` (`raft-rs-group-constants.js:70-71`);
  - pre-vote and check-quorum off.
  - `electionMaxMs` is **unused** by rs-raft.
  - A second authority for the divisor 3 is `HEARTBEAT_TICK_DIVISOR` in `raft-rs-operation-port.js:48,74-80`.
- **Follower election timeout.** It is randomized in [electionTick, 2·electionTick − 1] ticks (raft.rs:2800-2819; `config.rs:136-155` defaults min = election_tick and max = 2·election_tick; the binding sets neither, `lib.rs:453-461`).
- **Leader transfer window** = exactly `election_timeout` ticks of the leader, the non-randomized value.
  - `handle_transfer_leader` sets `election_elapsed = 0` (raft.rs:1924).
  - `tick_heartbeat` aborts at `election_elapsed >= election_timeout` (:1097-1109).
  - A repeat of the same transferee does not reset it (:1889-1898). A retarget does (:1900, :1924).
  - `recoveryRetryWindowMsOf` = `electionTick × tickMs` (`raft-rs-runtime-tuning.js:52-54`) is the same span in ms.
- **Heartbeat interval** = `heartbeatTick × tickMs` = 60 ms whenever tickIntervalMs = 20. The configured `heartbeatIntervalMs` is ignored once a tick interval is configured.

Evaluated by `timing.mjs` with the owners' functions. The window equals the leader's `recoveryRetryWindowMsOf`; indices are 0..3.

| Configuration | tick | index 0 window | index 1 | index 2 | index 3 | heartbeat |
|---|---|---|---|---|---|---|
| Production default (1000 / 20) | 20 ms | 50 ticks, **1000 ms** | 175 ticks, **3500** | 300 ticks, **6000** | 425 ticks, **8500** | 60 ms |
| Adaptive IDLE profile (3000; `src/config/raft-adaptive-timing-controller.js:109-113`; adaptive timing is off by default, `config-definitions.js:41`) | 20 | 3000 | 5500 | 8000 | 10500 | 60 |
| SLO test (`electionTimeoutMinMs` 300, heartbeat 75; `test/integration/node-join-convergence-slo.integration.test.js:444-448`; tick 20 inherited) | 20 | 15 ticks, **300** | 2800 | 5300 | 7800 | 60 |
| Same, if no tick interval were configured | 25 | 12 ticks, 300 | 2800 | 5300 | 7800 | 75 |
| `partition-node-cluster.js` (`PARTITION_TIMING` `:39-44`: 150 / 10; one shared timing for every replica, **no jitter**; ticks are test-driven on a never-advanced `VirtualTimeSource`, `transfer-leadership-driver.js:146-150`) | 10 | 15 ticks, 150 | 150 | 150 | – | 30 |
| `formAdmittedGroup` with `GROUP_TIMING` (150 / heartbeat 20; `test/partition/partition-write-leadership-transfer.test.js:56-60`). The leader is built with `replicaIds=[r1]` (index 0), joiner *i* with `members.slice(0,i+1)` (index *i*) (`test/partition/partition-admitted-group-fixture.js:94-101`) | 20 | 8 ticks, **160** (ceil) | 2660 | 5160 | – | 60 |
| R3.10 (`PRODUCTION_INDEX_ONE_TIMING` = base 3500; `…-committed.test.js:83-94`) | 20 | 3500 | 6000 | 8500 | – | 60 |
| Cluster integration default (100 / 50; `test/integration/helpers/cluster-test-helpers.js:138-143`) | 20 | 5 ticks, 100 | 2600 | 5100 | 7600 | 60 |

- The hash fallback (id absent from `replicaIds`, n = 3) gives production electionMin 8500 to 31000 ms.
- **A correction to a record:** `finding-slo-residual-remove-safety.md:194` says "tick 75/3 = 25 ms, electionTick 12". With `DEFAULT_CONFIG.raft.tickIntervalMs = 20` inherited, it is 20 ms and 15 ticks. The window is 300 ms either way, but the heartbeat is 60 ms, not 75 ms. Whether a node process in the SLO run sees another tick configuration was not traced.
- **The jitter's stagger assumption does not hold on rs-raft.** The comment at `src/raft/constants.js:53-57` says index N's max is below N+1's min. Under rs-raft the follower range is [min, 2·min):
  - production index 1 is [3500, 6980];
  - index 2 is [6000, 11980];
  - they overlap.

### 3.2 Write deferral budget and cadence

- **Budget.** `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS = 2000` (`src/partition/partition-service-constants.js:49`). The retry interval is 10 ms, the maximum delay 100 ms (`:47-48`).
- **The loop** is `runRetryableControlPlaneWrite` (`src/bootstrap/shared/retryable-control-plane-write.js:72-137`). The delay is `min(remaining, min(100, max(10, next)))` and next doubles (`:40-69`). It retries only while `now < deadline` (`:18-23`).
- **Proposal instants** (ms after the first): 0, 10, 30, 70, 150, 250, …, 1950, 2000. That is **24 proposals**, each its own queued port turn. After the attempt at 2000 the loop returns the deferral, and the write is answered `deferRetry` (`partition-service-raft-write-commit.js:158-167, 102-109`).
- **Commit deadline** of the pending write is `PENDING_REQUEST_TIMEOUT_MS = 30000` (`partition-service-constants.js:19`; `partition-service-cdc-stream-base.js:266-287`). It is registered before the loop (`write-commit.js:139`). Since 2000 < 30000, the budget always ends first.

**Boundary.** A write whose first proposal is at offset *s* ≥ 0 into a window of length W is answered `deferRetry` iff every proposal is dropped, which is iff the window is still open at s + 2000. So it crosses iff **W − s > 2000**.

| Configuration | index 0 | index 1 | index 2 | index 3 |
|---|---|---|---|---|
| Production (W = 1000 / 3500 / 6000 / 8500) | never | when s < 1500 | when s < 4000 | when s < 6500 |
| SLO (W = 300 / 2800 / 5300) | never | when s < 800 | when s < 3300 | – |
| `formAdmittedGroup` `GROUP_TIMING` (W = 160 / 2660 / 5160) | never | when s < 660 | when s < 3160 | – |
| R3.10 leader (W = 3500) | crosses when s < 1500; this is the witness | | | |

- **Crossing product:** `{success:false, deferRetry:true}` and nothing stored. The router retries.
- **No crossing:** the transfer either completes or aborts.
  - Completion means leadership is lost: `onFollower` → `releasePendingWrites` (`partition-service-raft-lifecycle-wiring.js:36-38, 79`). The next `markCommittedWriteProposal` returns false, which gives `PROPOSAL_NOT_MADE`. The answer is the release answer, which is OUTCOME_UNKNOWN if the write was marked PROPOSED at release (`partition-write-kernel.js:312-316`).
  - Abort means the next proposal is accepted.

### 3.3 Membership admission deferral

- A dropped conf change in the window gives HOST_FAILURE retryable → `DEFERRED` (`partition-service-raft-membership-administration.js:36-46`).
- **There is no timer retry.** A deferred admission is not counted as current (`partition-service-raft-peer-cache-reconciliation.js:13-16, 288-292`) and is re-attempted only on the next services-cache change → `scheduleRaftPeerReconciliation` (`partition-service-core-base.js:840-865`).
- So the crossing of a window W with admission is unconditional: any admission inside the window is deferred until an unrelated cache event, with no bound derived from W.
- The admission's role and membership pre-check reads `raft.readStatus()` (`:120-132`). That is the cached `statusObservation` whenever the queue is busy or asynchronous (2).
- The raft-rs conf-change rule adds a silent case: an admission proposed while `has_pending_conf()` is true (or in an incompatible joint state) is **replaced by an empty normal entry and answered Ok** (raft.rs:2062-2090). It is recorded PROPOSED with no effect. That is pre-existing, not a drop.

### 3.4 Rebalancer cadence and safety retry

- `checkRebalance` refuses a check less than 1000 ms after the previous one on a priority partition, and 5000 ms on others (`src/rebalancer/rebalancer-planning-gate-methods.js:716-733`). `scheduleNextCheck` floors every override at 1000 ms (`:42-58`).
- The periodic default is 60000 ms (`src/rebalancer/rebalancer-constants.js:96,100`). The SLO test uses 4000 ± 500 (`slo test :449-453`).
- `SAFETY_DEFERRED_RETRY_DELAY_MS = TIME_MS.SECOND = 1000` (`src/rebalancer/operation-workflow-owner-shared.js:339`; armed at `operation-workflow-dispatch-rearm-evidence.js:509, 587`).
- **Crossing with W ≥ 1000** (production, any index; SLO index ≥ 1). A check or safety retry lands inside a transfer window of the partition whose rows it writes, such as the ledger. Its writes then take the 3.2 path (deferred, or `deferRetry` beyond 2 s).
- **The transfer itself** moves the rebalancer's leadership: the old leader's `updateRebalancerLeadership` runs in `onFollower` (`partition-service-raft-lifecycle-wiring.js:81`), and the new leader's `setLeader(true)` enqueues an immediate check (`finding-slo-residual…:150`). That check consumes the 1000 ms interval (the recorded SLO residual).

### 3.5 Readiness and ready-lease expiry, and other leases

- **Ready lease.** `CONTROL_PLANE_READY_LEASE = 15000` (`src/constants/time.js:5`). It is renewed with `now + readyLeaseMs` (`src/control-plane/heartbeat-service-publication-methods.js:131`) by the control-plane heartbeat every `CONTROL_PLANE_HEARTBEAT_INTERVAL = 5000` (`time.js:6`; `heartbeat-service-constants.js:16-17`).
- **Heartbeat attempt timeout** = min(max(5000, 15000/3, `MESSAGE_TIMEOUT_MS` 5000 + 1000), 15000 − 5000) = **6000 ms** (`heartbeat-service-lifecycle-methods.js:75-84`; `src/constants/transport.js:74`). Its write-query timeout is 5000 ms (`:93-97`).
- **Condition for expiry.** A lease expires only if the renewal attempts for 15 s all fail.
  - A renewal write inside a transfer window of the partition holding the `nodes` rows fails only if the window stays open through its 2000 ms deferral budget.
  - Expiry would need the window to cover three consecutive attempts' budgets: **W > 2·5000 + 2000 = 12000 ms**. This assumes no retry inside an attempt beyond the deferral; I did not trace the gateway's own retry.
  - Production indices 0..3 (≤ 8500) cannot cross. The hash-fallback indices ≥ 5 (≥ 13500) and adaptive IDLE index ≥ 4 (13000) can.
- **Replica-operation owner lease** is 30000 ms (`src/rebalancer/replica-operation-owner-lease.js:41, 138-144`), renewed on each persisted transition. Only W ≥ 30000 could matter (hash-fallback index 12, 31000).
- **Raft leader lease: none.** check_quorum is off, so `in_lease` (raft.rs:1333-1335) is never true and MsgCheckQuorum never runs.
- **Persistence admission.** Poll 10 ms, bound 120000 ms (`raft-rs-runtime-owner-constants.js:140-143`). While a user transaction holds the connection:
  - `tick` is refused (`raft-rs-runtime-owner.js:1254-1258`), so **the leader's transfer window is frozen in ticks and stretches in wall time** by the hold (the partition's legal hold is 60 s, per the comment at `:132-137`);
  - proposals get the `user-transaction-open` deferral, the same 2 s budget class.
- **Recovery retry window** = `recoveryRetryWindowMsOf(group.timing)`, the same formula as the transfer window. A group failing mid-transfer is reconstructed at most once per window, and reconstruction drops `lead_transferee` (2).

### 3.6 STEP_DOWN timeout

- The STEP_DOWN senders call `messageRouter.deliver` with no `timeoutMs`:
  - `priority-publication-handoff.js:266-269`;
  - `user-table-leader-placement-cure.js:397-401, 430-434`.
- The timeout is therefore `router.messageTimeoutMs`, default **5000 ms** (`src/transport/message-router-delivery-behaviors.js:144-148`; `src/constants/transport.js:74`).
- The handler answers on acceptance (`replica-handler-remove-request-methods.js:334-372`; `replica-handler-leader-handoff-methods.js:143-146`). **The window does not delay the answer.** Only the port queue wait does.
- **Crossing.** The queue can be held by a Ready waiting for persistence admission, up to 120000 ms (3.5), or by any async drain. With a wait of 120000 > 5000, the caller times out and gets null (`priority-publication-handoff.js:281-283`) while the transfer command stays queued. It is **decided and stepped later**, against the state at that later turn.

### 3.7 The timing authority diverges from the core

- `configureTick` updates `group.timing` (`raft-rs-runtime-owner.js:1404-1407`) and the partition's `raftTimingConfig` (`partition-service-raft-init-base.js:711-729`). It does not update the core's `electionTick`, which is fixed at `create_node` (`raft-rs-runtime-owner.js:403-410`) until a reconstruction.
- `applyRaftTimingConfig` runs at startup over existing partitions (`dynamic-config-startup-wiring.js:429`), on every watched change (`:370-383`), and from the adaptive controller.
- **Consequence:** the real transfer window = electionTick(create-time timing) × the *current* tick interval. `recoveryRetryWindowMsOf(current timing)`, which R3.10's precondition uses, can differ from it.
- Also, under event-loop starvation `setInterval` ticks fire late and are not replayed. The wall-clock window is then ≥ electionTick × tickMs, with equality only when nothing delays the loop.

### 3.8 Boundary cases derived statically

| # | Relationship | Holds when (production) | What the crossing produces |
|---|---|---|---|
| T1 | window > write deferral budget (2000) | leader index ≥ 1 (3500 / 6000 / 8500), s < W − 2000. SLO: index ≥ 1. `formAdmittedGroup`: joiner-led (index ≥ 1). R3.10 by construction | write `deferRetry`, nothing stored |
| T2 | window > 0, with admission retried only on a cache event | always | admission DEFERRED with no timer retry |
| T3 | window ≥ checkRebalance minimum (1000 priority / 5000 other) and ≥ `SAFETY_DEFERRED_RETRY_DELAY_MS` (1000) | index ≥ 0 at 1000 ms (equal at index 0); index ≥ 1 exceeds 5000 only at index ≥ 2 (6000) | rebalancer ledger writes deferred or `deferRetry`; the leadership move re-arms the new leader's check |
| T4 | window vs follower election timeouts | the old leader's window (W_L) vs the target's randomized [W_t, 2W_t). Unreachable target: the other followers keep receiving heartbeats every 60 ms during the window, so no stray election | none; abort after W_L |
| T5 | window vs STEP_DOWN deliver timeout (5000) | the answer is not window-bound; the queue wait is | caller null; transfer stepped later |
| T6 | window vs ready lease (15000 at a 5000 cadence) | W > ~12000 only (hash fallback, adaptive IDLE index ≥ 4) | lease expiry, node not ready |
| T7 | window frozen by a user transaction | any open transaction on the leader | window extended by the hold (≤ 60 s legal hold; admission bound 120 s); every T1-T6 crossing becomes reachable at any index |
| T8 | `configureTick` after creation | dynamic config or adaptive timing | window = old electionTick × new tick; the recovery window formula disagrees |
| T9 | commit deadline (30000) vs budget (2000) | never crosses | – |

---

## 4. Temporal relationships

### 4.1 Within the port: one turn per decision

**Transfer.**
- `perform` runs the gate, `ensureExecution`, `drainInbound`, then `transferLeadership`: `readGroupObservation` → `decideLeadershipTransfer` → `step(13)` → `drainReady` (`raft-rs-runtime-owner.js:1250-1267, 1160-1180`).
- Observation, decision and step are one synchronous block with no core entry between them, so no envelope can arrive between decide and step.
- `drainInbound` re-checks `group.inbound` after every awaited Ready (`:1245-1247`), so an envelope that arrives during an async drain is processed before the command.
- An envelope that arrives during the command's own async `drainReady` is after the decision, as intended.

**Dropped-write classification.**
- `propose*` is invoked, and on CORE_REFUSED `readGroupObservation` runs immediately (`:1225-1232, 1185-1193`). It is synchronous, in the same turn, with no core entry between the drop and the read. The propose call changes neither role nor membership.
- **Divergence between the classifier and the core:**
  - The core's check 1 is "self in the progress map", which covers voters and **learners** (raft.rs:2026). The classifier's member check is `transferableVoters(confState)`, which covers voters ∪ outgoing voters − learners (`raft-rs-leadership-transfer.js:50-55, 166`).
  - They differ only when the leader is itself a learner (demoted). Then a transfer's drop (check 2) is answered raw non-retryable.
  - This is reachable through the port's own ADD_LEARNER on a sitting voter (`raft-rs-operation-port.js:105-124`) or a raw ConfChangeV2. raft-rs keeps a demoted leader leading (`post_conf_change` raft.rs:2674-2684), and that early return also **skips the transferee-removal abort** (:2729-2734).
- The uncommitted-size limit is `NO_LIMIT` (`config.rs:121`). The conf-change decode drops (raft.rs:2047-2056) are unreachable from the port because the binding encodes the change itself.

**Most-caught-up.** It is the same single turn. `status.progress` exists only on a leader, and the decision refuses `not-leader` otherwise (`raft-rs-leadership-transfer.js:118-121`).

**The claim's "pending" boundary.** Only envelopes in `group.inbound` are drained. The claim cannot cover:
- messages still inside the transport, before `handleTransportMessage` → `step`;
- messages in flight;
- messages pending at **another** replica, for example the leader that a `transfer-forwarded` request reaches.

For a forwarded request, the validity checks (voter, role) are made on the **follower's** configuration and view, which may lag the leader's. The acting core is the leader's, and the pending messages there are outside the requester's drain. This dimension needs to be named explicitly, either in or out of scope (round-1 non-blocking 4).

### 4.2 Answer vs effect inside the transfer turn

After `step(13)` succeeded, the answer is `decision.accepted` only if the drain answered CORE_OK (`:1178-1179`). Otherwise:
- **`READY_DEFERRED`** (the store refuses persistence mid-turn, `:906-908`) is CORE_OK. The answer is `transfer-requested` although MsgTimeoutNow/MsgAppend were not sent. They go when admission returns; ticks are refused meanwhile, so the window is frozen (round-1 non-blocking 2).
- **A host failure after the sends**, in application, persistence or `advance_*`, gives HOST_FAILURE, while the core already holds `lead_transferee` and may already have sent MsgTimeoutNow (sends precede application, `:842-848`). Leadership can move even though the answer is a failure. Reconstruction later drops `lead_transferee`.
- **`READY_DRAIN_BOUND_EXCEEDED`** (64 cycles, `:891-896`; `raft-rs-group-constants.js:83`) gives HOST_FAILURE retryable with the transfer stepped.

### 4.3 Multi-step operations and what can arrive between their steps

| # | Operation | Steps | Between steps |
|---|---|---|---|
| M1 | Write-path deferral (`proposeWithinDeferralBudget`, `partition-service-raft-write-commit.js:63-98`) | mark PROPOSED (partition) → queued propose turn → answer → mark QUEUED → sleep 10..100 ms → repeat, up to 24 times over 2000 ms | Inbound envelopes (drained at each turn start): acks, a vote request or heartbeat of the new term (the transfer completes, then FOLLOWER → release → `PROPOSAL_NOT_MADE`), a committed self-removal (drop becomes raw non-retryable), a peer's MsgTransferLeader (retarget: window restarts). Ticks (window advances or aborts). User transactions (`user-transaction-open` deferral, same budget). **Inside one turn:** the write is marked PROPOSED before the turn, and a role event from the turn's drained envelopes can release it (OUTCOME_UNKNOWN) *before* the propose runs. The propose then either forwards (follower with a known leader: CORE_OK, and the entry can commit through the new leader) or is dropped (raw refusal). |
| M2 | Partition write gate → proposal | `this.role === LEADER` (`partition-service-write-metrics-base.js:463`), read on the **projection**, then the port turn | Pending envelopes are processed only in the port turn. With them processed first the gate answers NOT_LEADER (`partition-write-kernel.js:278-285`). With them pending the write reaches the port: see M1's in-turn case. |
| M3 | Replica handler STEP_DOWN | `getTrackedReplicaRole` (projection, `replica-handler-leader-handoff-methods.js:126-127`) picks the branch or a role no-op → `await requestLeadershipTransfer` → port dispatch (registry resolution) → queued turn (drain, decide) | Pending envelopes can change the role after the branch choice. Source branch: tracked LEADER with a pending higher term → the port refuses `not-leader`, and STEP_DOWN answers REFUSED/ERROR. With the envelope processed first, the tracked role is FOLLOWER → `source_demotion_role_no_op` COMPLETED (round-1 non-blocking 5). Target branch: tracked LEADER or CANDIDATE, or **LEARNER** (a joining learner keeps LEARNER, `partition-service-raft-init-base.js:515-535`), gives `target_election_role_no_op` COMPLETED without a transfer. |
| M4 | Port dispatch → queued turn | `normalizedTransferRequest` / `normalizedConfChange` read the registry at dispatch (`raft-rs-operation-port.js:244-265`) → `enqueue` waits behind `group.tail` (`raft-rs-runtime-owner.js:671-694`) | Any number of turns (ticks, drains, other proposals), reconstruction, and registry reservations (async, not raft-driven). The decision in the turn is on fresh post-drain state; the reservation verdict is not. |
| M5 | Membership admission | `readStatus()` (cached while busy) decides NOT_LEADER, ALREADY_MEMBER or propose (`partition-service-raft-membership-administration.js:120-135`) → queued `proposeConfChange` → QUEUED → settled | Everything in M4. The port answer after the drain is authoritative for PROPOSED, REFUSED or DEFERRED. NOT_LEADER and ALREADY_MEMBER come from the cached status. |
| M6 | Leader-placement cure | the source's own `most-caught-up` STEP_DOWN, then the target's named STEP_DOWN (`user-table-leader-placement-cure.js:423-434`), two transfers on two nodes in sequence | X's MsgTimeoutNow and election; T's forwarded request reaching an ex-leader that knows no leader and drops it silently (raft.rs:2340-2347), while T answered `transfer_forwarded` (round-1 non-blocking 3) |
| M7 | Priority-publication REPLACE handoff | the source and target STEP_DOWN (`priority-publication-handoff.js:160-163, 216-219`) → response → continuation snapshot (`:286-330`) | leader-row publication, operation-row transitions; gate re-check at effect (`finding-slo-residual…:263`) |
| M8 | Reconstruction resume | `ensureExecution`: the sole-voter decision (campaign or announce) → then `drainInbound` (`raft-rs-runtime-owner.js:1259-1265, 466-477`) | Pending inbound is processed **after** the resume decision. `replaceRuntime` resumes other groups whose inbound is not drained in that turn (`:501-532`). |
| M9 | Inbound step error | an envelope's step refused → the queued command is answered with it, not executed → the remaining envelopes wait for the next tick or step (`:1235-1248`) | the next tick (≥ 1 tick interval), a new step (scheduled drain) |
| M10 | Nested drain from role listeners (hypothesis) | an outer announce emits → a listener's `readStatus` → a nested synchronous drain + announce → the outer continues with stale events (`:940-961`, `:1034-1044`; `replica-leadership-state.js:119-164`) | the remaining pending envelopes, processed mid-announce |

### 4.4 Temporal classes for the coverage model

1. **Pending before the decision.** In `group.inbound` at `perform`. It is drained first by construction for the transfer, most-caught-up, the drop classification, campaign and probe. It is **not** drained first for M8 (resume), for pre-queue registry verdicts (M4), or for projection-based decisions (M2, M3, M5).
2. **Arriving mid-turn.** During async `drainInbound`: drained before the command. During the command's own async drain: after the decision. During nested announces: M10.
3. **Arriving between the steps of a multi-step operation.** M1-M7 above.
4. **A timeout crossed.** T1-T8 in 3.8. The window is frozen by user transactions (T7) and stretched by lost ticks (3.7).
5. **Pending at another replica.** The forwarded transfer (4.1) and the cure's second request (M6). This is outside the requester's drain, so the model must name it explicitly as in scope or out of scope.
