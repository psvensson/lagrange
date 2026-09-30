# Design: the committed-membership bootstrap read (epic raft-rs-full-cutover)

**Scope and conditions**
- Read-only design, protocol v2 phases 0 and 2, written on worktree `replace-d1`, branch `quest/replace-d1-bootstrap-membership`, HEAD d6a5b941e.
- Every file:line is at that head.
- It is triggered by the D1 skew classification (`quest-records/replace-source-removal-owner/`, commit d6a5b941e): a replica bootstrapped from services rows that omit a committed voter leads and commits on an invalid quorum. With two voters omitted it produces two leaders in one term and divergent acknowledged writes at the same (index, term).
- Under the owner's rule, the authoritative committed-membership read is a **pre-publish blocker**. The membership/replica owner owns it, and ADD, REPLACE and formation reuse it. There is no REPLACE-only RPC.
- One read-only raw-core probe sits beside this file: `design-committed-membership-bootstrap-read-2026-09-25.replay-probe.{mjs,out}`.
- No src changed.

---

## 0. Measured facts this design rests on

- **F1. A new replica replays the whole committed log over its bootstrap ConfState.**
  - rs-raft never compacts. The only log deletion is suffix truncation on conflict (`src/raft/raft-rs-durable-store.js:247`, `DELETE_LOG_FROM`).
  - There is no snapshot catch-up (census-snapshot-catchup-ownership §0 item 5).
  - A fresh group is created with `peers: group.voters` and persists that ConfState as applied at index 0 (`src/raft/raft-rs-runtime-owner.js:404-444`).
  - Every committed conf-change entry is applied over the current configuration (`:824-846`).

- **F2. The only membership fact the log does not carry is the genesis configuration** (the founders' bootstrap).
  - A founding voter is never named by a ConfChange until it is removed.
  - A bootstrap therefore yields the right final configuration iff, for every peer never named in the log, it agrees with genesis.
  - Any committed configuration C_j has that property. Rows do not (D1 skew M and D).

- **F3. Replaying over a later configuration C_j is not the same as replaying over genesis at intermediate indices.** Raw raft-rs probe, beside this file:

  | History (single simple changes) | Bootstrap | Replayed configurations |
  |---|---|---|
  | H1: genesis {1}; +2, -2, +2, -1 | genesis {1} | {1,2} {1} {1,2} {2}, exact |
  | H1 | C_j = {2} (self excluded) | **ERROR `removed all voters`** at the second step |
  | H1 | C_j ∪ {self 9} | {2,9} **{9}** {2,9} {2,9}: a transient **sole-voter** configuration |
  | H2: genesis {1,2,3}; +4, -1 | {2,3,4} | {2,3,4} {2,3,4}, correct |
  | H2 | rows omitting founder 2: {3,4} | {3,4} {3,4}, **never corrected** (skew M) |

  - A hazard needs a history that removes a replica and later re-adds the same identity.
  - Challenger A4 shows the row-driven ADD_PEER re-adds a reappearing source with the same peer id (`src/partition/partition-service-raft-peer-cache-reconciliation.js:249-293`).
  - Before a replica's applied index reaches j, its local configuration is not the group's configuration at that index. A replica must not campaign or count a quorum in that window.

- **F4. raft-rs only accepts simple changes outside a joint configuration.** `Changer::simple` refuses when the configuration is joint (`raft-0.7.0/src/confchange/changer.rs:135-157`); `enter_joint` refuses an already-joint configuration (`:69-81`).
  - Replaying a joint enter/leave over a later bootstrap would fail.
  - Production emits only single simple changes: the port maps `{type, replicaIdentity}` to `{transition: 0, changes: [one]}` (`src/raft/raft-rs-operation-port.js:103-123`).
  - The port still passes a raw `changes` array through (`:100-102`); only tests use it (R2 design C13).

- **F5. A replica with self ∉ its voters cannot campaign.**
  - raft-rs sets `promotable` from the configuration (`raft-0.7.0/src/raft.rs:2672-2673`).
  - The runtime refuses `campaign` for a non-voter with `NOT_ACTIVE_VOTER` (`raft-rs-runtime-owner.js:1093-1112`).
  - `create_node` with the own id absent from `peers` succeeds with `promotable: false` (R2 design M6).
  - Today every join includes itself (`src/node/replica-handler-runtime-metadata-methods.js:278-289`).

- **F6. Two paths campaign without being asked.**
  - A reconstructed runtime campaigns at once for a sole voter (`raft-rs-runtime-owner.js:456-478`).
  - `PartitionService.initialize` campaigns when `replicaIds.length === 1` (`src/partition/partition-service-raft-init-base.js:587-603`).
  - Both are unsafe during the F3 window.

- **F7. The existing seam.**
  - The rebalancer reaches a node's replica handler with `messageRouter.deliver(<node>/service/replica-handler, request, {targetNodeId})` (`src/rebalancer/user-table-leader-placement-cure.js:89,395-400`).
  - The handler dispatches by message type (`src/node/replica-handler-lifecycle-methods.js:51-79`).
  - Types are `CREATE_REPLICA`, `REMOVE_REPLICA` and `STEP_DOWN_REPLICA` (`src/constants/messages.js:1-7`, `src/rebalancer/replica-operation-constants.js:7-11`).
  - None of them reads raft state (D1 census).
  - `port.readStatus()` returns the core's `confState`, `commitIndex`, `term`, `role`, `leaderId` and `leaderAddress`, and `peers[]` with `replicaIdentity` per reserved id (`src/raft/raft-rs-status-observation.js:101-134`).
  - Nothing outside `src/raft` reads `confState` today.

- **F8. Identity.**
  - A raft peer id is a digest of the replica name and cannot be inverted (`src/raft/raft-rs-peer-identity.js:58-69`).
  - A replica resolves only ids it reserved (`:154-163`).
  - Reserved ids are: self plus the bootstrap list (port `:134-140`), plus row-driven reservations on every replica that saw the row (`partition-service-raft-peer-cache-reconciliation.js:330-333`).

---

## 1. Frozen claim (phase 0)

**Claim**
- A new replica's bootstrap configuration equals its group's authoritative committed configuration at the point it was read.
- No replica participates in consensus (campaigns, or counts a quorum as leader) while its local configuration can omit a committed voter; that is, before its applied index reaches the index at which its bootstrap configuration was committed.
- If the committed configuration cannot be read, the bootstrap fails closed with a typed outcome. It never falls back to services rows.

**Semantic owner.** The membership/replica owner. Concretely there are three parts:
- the read's answering half, in the replica handler beside `handleStepDownReplica` (`src/node/replica-handler-remove-request-methods.js:333-380`);
- the stamp, in the creation owner (`buildOperationBootstrapTopology`, `src/rebalancer/rebalance-coordinator-operation-creation.js:488-587`);
- the consuming half and the participation gate, in the rs-raft port and runtime owner.

These three are one contract, the "committed bootstrap stamp". It gets a coupled pair in `test/shards/impact-contracts.json` (§3.8).

**Oracle.** A live group member's committed ConfState, read through the operation-only port (`readStatus().confState`), cross-checked against the durable `_raft_rs_applied_state` on an independent connection.

**Outputs**
- the stamp: kind, group id, answering replica, term, applied index j, commit index, the full ConfState and the replica identity of every id;
- the target's ConfState at creation, after restart, and after every applied index;
- whether the target campaigned or led before its applied index reached j;
- the typed refusals: `MEMBERSHIP_UNREADABLE`, `NOT_LEADER` with a hint, `MEMBERSHIP_IN_JOINT_TRANSITION`, `MEMBERSHIP_IDENTITY_UNRESOLVED`, `STAMP_INVALID`.

**Allowed nondeterminism**
- which leader answers, and j: any committed configuration is valid (F2);
- the stamp's age relative to dispatch;
- leadership changes during the read;
- the timing of admission after creation.

**Exclusions**
- *Phantom voters in genesis* (founders planned but never created). They fail closed: the target's quorum is only stricter (D1 case 1b). This goes to the post-publish membership-owner quest.
- *Churn from an unadmitted voter* (D1 case 2). This is liveness only and goes to the same quest together with CA3. The design here removes it as a side effect (§3.5, self excluded) but does not claim it.
- *Message groups.* They run on liferaft (`src/message-group/message-group-service-state.js:137`), which has no committed ConfState. R3 moves them (`design-r3-r4-message-groups-worker-wasm-2026-09-23.md`).
- *Snapshot install* (F5 quests). A snapshot carries its own ConfState, which supersedes the stamp.

---

## 2. Census

### 2.1 Bootstrap paths (the D1 census; letters as in the D1 report)

| # | Path, call site | What decides the voters today | Class | Needs the read? When |
|---|---|---|---|---|
| A | ADD/REPLACE creation stamp: `rebalance-coordinator-operation-creation.js:752` → `buildOperationBootstrapTopology` `:488-587` (rows `:506-530`); dispatched `operation-workflow-dispatch-response-reconcile.js:417-430`; consumed by `replica-handler-create-methods.js:72-76,416-467` and `replica-handler-runtime-metadata-methods.js:116-380`; reaches the port at `partition-service-raft-init-base.js:456` | Services rows (cache merged with services-owner) plus target; the target handler unions its cache | Join to an existing group | **Yes.** At creation, in place of the row stamp (`:752`), before `persistNewOperation`, so no operation persists without a committed stamp. The target consumes it at CREATE (§3.4) |
| B | Table-create provisioning: `sql-query-engine-initial-partition-provisioning.js:558-617` stamps `buildInitialPartitionBootstrapTopology` (`sql-query-engine-provision-target-methods.js:290-355`: current rows ∪ planned) | Rows ∪ planned ops | **Genesis only when the partition has no replica at all.** It plans `targetReplicaCount - routable` new replicas (`initial-partition-provisioning.js:258-264`), so a retry, or `reconcileExistingInitialPartition` (`table-creation-service-existing-table-reconciliation.js:32-120`), adds replicas to a **live group** | Genesis: no read, stamp kind GENESIS. Existing group: **yes**, at `:558` (a read fails closed when rows exist but no member answers) |
| C | Split/merge children: `managed-split-workflow.js:533,554`, `managed-merge-workflow.js:661` → the B provisioning | Planned child cohort | Genesis, with the same retry rule as B | As B |
| D | Seed system partitions: `bootstrap/phases/seed-partitions-phase.js:87,197-204` (`INITIAL_REPLICA_IDS`, all on the seed node) | Constant | Genesis by construction (one process, one list) | No. Stamp kind GENESIS. A seed restart is a restore (row F-restore) |
| A-formation | Joiner nodes receive system-partition replicas only through A (ADD from the seed coordinator) | As A | Join | **Yes**, as A. This is the join-core coupling (§3.9) |
| E | Durable rejoin: `bootstrap/node-joining-publication-activation.js:56-119,169,195` with `bootstrap/shared/durable-rejoin-partition-restore-planner.js:205-215` (ACTIVE rows) | Ignored when a durable record exists (`raft-rs-runtime-owner.js:292-300,404-424`; `raft-rs-durable-store.js:467-471`) | Restore; the durable record governs | No, **but** a missing record must not become a row bootstrap (§3.6). Today it silently does |
| F | Snapshot-catchup replacement: `raft/snapshot-catchup.js:325-336,387` (`service.replicaIds`) | Ignored when the installed DB holds a record | Restore | No. The same missing-record rule as E |
| MG | Message groups: `node/message-group-replica-options.js:104-140` | Rows ∪ stamp (liferaft) | Out of scope (§1 exclusions) | No. The creation read is gated to `SERVICE_TYPE.PARTITION`; the MESSAGE_GROUP branch at `creation.js:497-503` keeps the rows stamp until R3 |

### 2.2 Row-skew sources (D1 classification) and whether the read closes them

| Source | Site | Closed? |
|---|---|---|
| Null stamp leading to cache fallback | Partitions return null on empty rows, ≤ 1 id, or missing addresses (`creation.js:534-583`); the target then resolves from cache (`runtime-metadata-methods.js:236-289`) | **Closed.** A join without a COMMITTED stamp is refused at the target (§3.4); there is no cache fallback for membership |
| Priority viable-peer filter | `runtime-metadata-methods.js:181-185,248-253` | **Closed for membership.** The filter still shapes address hints only |
| Row deleted or left before its RemoveNode commits | `partition-service-raft-peer-cache-reconciliation.js:146-236` (DELETE path; address resolution fails after the row is gone) | **Closed.** Rows are not read for membership |
| Durable rejoin keeps ACTIVE rows only | `durable-rejoin-partition-restore-planner.js:73-87,205` | **Closed** by §3.6: a missing record is refused, never bootstrapped from rows |
| Existing-group provisioning (B/C retry or reconciliation) | `initial-partition-provisioning.js:258-264,558-617` | **Closed** when routed through the read (row B) |
| Phantom rows (a never-admitted replica) | Rows ∪ target | Closed for new stamps. Genesis phantoms (planned, never created) remain: an exclusion, fail-closed |
| **Replicas already bootstrapped from rows** (every existing rs-raft group) | Their ConfStates may already omit a committed voter | **Not closed.** An answer from such a replica propagates its skew. Owner decision O3 |

---

## 3. Design

### 3.1 Message and answer
- There is one new replica-handler message, `READ_COMMITTED_MEMBERSHIP`. It is added to `MESSAGE_TYPE` (`src/constants/messages.js`), `ReplicaOperationMessageType` (`replica-operation-constants.js:7-11`) and the dispatch (`replica-handler-lifecycle-methods.js:61-67`).
- The request is `{partitionId, requestId}`.
- The handler reads each local tracked replica of `partitionId` (`localServices`; the seed node hosts several) through `port.readStatus()` and answers from the one whose `role === leader`. The answer is:
  ```
  {status: COMMITTED, groupId, answeredBy: {replicaIdentity, peerId, nodeId},
   term, appliedIndex, commitIndex,
   confState: {voters, votersOutgoing, learners, learnersNext, autoLeave},
   identities: {<peerId>: <replicaIdentity>, ...}}
  ```
- `appliedIndex` is the index the ConfState was applied at. It is read in the same queued turn as the status, and needs a small `readStatus` addition: the runtime already holds it for `putAppliedState`.
- Typed non-answers:
  - `NOT_LEADER {leaderId, leaderAddress}`, when a local member is not the leader;
  - `NOT_HOSTED`;
  - `MEMBERSHIP_IN_JOINT_TRANSITION`, when `votersOutgoing` is non-empty (F4);
  - `MEMBERSHIP_IDENTITY_UNRESOLVED`, when any id in the ConfState is UNRESERVED in the leader's registry (F8).
- The handler never reads rows.

### 3.2 Which member is asked, and why the leader
**Safety needs any committed configuration (F2); freshness is not a safety input.**
- Every applied ConfState of a correctly bootstrapped replica at an applied index ≥ its bootstrap index equals the group's committed configuration at that index. This holds by induction from genesis (the base case) and §3.5 (the step).
- A lagging member's configuration is therefore an older committed configuration. Replay from index 1 applies every later change (F1), so staleness is safe.
- A deposed leader that does not know it has been deposed still holds a committed configuration (applied ⊆ committed).

**The leader is asked for three reasons that are not freshness:**
1. **An unadmitted replica must never answer.** Its configuration can contain itself, which is a phantom if it is never admitted. A leader has been elected by a quorum of its configuration, so it is a member.
2. The answer is the most recent committed configuration available. This minimises the F3 window the target must wait out (§3.5).
3. The leader reserved every id it admitted (`partition-service-raft-membership-administration.js:17-26,120-134`), so `identities` is complete on the leader when it is complete anywhere.

**Routing**
- First target: the node in the partition row's `leader_node_id` hint (`runtime-metadata-methods.js:294-297`).
- On `NOT_LEADER`, one redirect to the node parsed from `leaderAddress`.
- Otherwise `MEMBERSHIP_UNREADABLE`.
- Hints only route the question. The answer's `role === leader` is the check.

**Rejected alternative.** "Any member with applied ≥ X". It needs a way to exclude unadmitted members that the ConfState cannot express (self-inclusion, F5), and it adds no safety.

### 3.3 What the creator does with the answer
- **Stamp (partitions, joins).** `{kind: COMMITTED, ...answer}` is persisted in `stepsHistory[0]` as today (`creation.js:760-771`).
- **Separate names at the boundary** (D1 constraint 5):
  - `bootstrapCommittedMembership`: the stamp, which feeds the port;
  - `replicaIds` / `peerAddresses`: transport and address hints, which are no longer membership.
  - `REPLICA_IDS` stays the address-hint list, derived from `identities` plus the target. Nothing reads it as membership.
- **Genesis stamps.** B, C and D (genesis) carry `{kind: GENESIS, founders}` with bootstrap index 0.
- **Refusal.** The creation throws a typed error before persistence (`creation.js:752`, before `persistNewOperation` at `:815`). No operation row exists; the move is re-planned (§4.4 timing). This is never a fallback to rows (R11).
- **Scope.** Gated to `SERVICE_TYPE.PARTITION` with ADD/REPLACE (`creation.js:497-503`).

### 3.4 How the target validates the stamp on arrival
The validation sits in `resolveReplicaContext` (`runtime-metadata-methods.js:116-380`) for a join (explicit ADD or REPLACE outside the fresh window, `:354-363`), and in a new `RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_COMMITTED_MEMBERSHIP` port field (`src/raft/raft-provider-contract-constants.js:25` area). These are the refusal classes:
- **No stamp, or not COMMITTED/GENESIS:** `STAMP_INVALID`, retryable. It never resolves from the cache.
- **An id that does not match:** `deriveRaftRsPeerId(identity) !== peerId` for any entry (`raft-rs-peer-identity.js:58-69`) gives `STAMP_INVALID`.
- **A joint configuration:** `MEMBERSHIP_IN_JOINT_TRANSITION`.
- **Otherwise the port creates the group from the stamp**:
  - `create_node` with `bootstrap.confState` equal to the stamp's full ConfState (the fork already honours it; `vendor/raft-rs-wasm/src/lib.rs:392-401`);
  - **self excluded** unless the committed configuration names it;
  - each identity registered;
  - `putAppliedState(0, confState)` plus a durable **bootstrap index j** (§3.5).

### 3.5 The participation gate (F3, F5, F6)
- **Self is not added to a joiner's bootstrap.**
  - The target stays non-promotable until the leader's AddNode(target) applies.
  - That entry is proposed after CREATE, so its index a > j, where j is the leader's applied index at the read.
  - So the target cannot campaign during the F3 window, and it never contributes the unadmitted churn of D1 case 2.
- **A retried target is already a committed voter** (a deterministic REPLACE intent id whose earlier AddNode committed; see `creation.js:690-705` allocation). C_j names the target, so it is promotable from creation. For this case, and to make the gate unconditional:
  - the runtime refuses `campaign`, suppresses the sole-voter resume campaign (`raft-rs-runtime-owner.js:467-478`) and does not start election ticks while `applied < bootstrapIndex`;
  - the partition's `replicaIds.length === 1` campaign (`raft-init-base.js:587-603`) moves to the port's gate.
- `bootstrapIndex` is durable, in the same transaction as the index-0 applied state (`runtime-owner.js:433-443`), so a restart during catch-up keeps the gate.
- Genesis stamps have bootstrapIndex 0, which leaves formation's founders unchanged.
- **Replay error (F3, H1 without self).** A history that removes and later re-adds one identity makes the target's replay fail with `removed all voters`. The group is held RECOVERY_REQUIRED: fail-closed, liveness only.
  - Its only producer is the A4 re-add, a defect owned by the REPLACE/membership owners.
  - The R2 design's "log carries every membership fact" (founding AddNode entries) removes it. See O1.

### 3.6 Restart and durable rejoin
- **A replica with a durable record restores from it.** The stamp and `replicaIds` are ignored (`runtime-owner.js:404-424`). This is already witnessed (`test/raft/raft-rs-backend/restart-from-durable-record.test.js`).
- **The E and F paths open with no durable record** (lost or partial DB).
  - Today they bootstrap from ACTIVE rows (E) or from the old in-memory list (F).
  - The design refuses them typed (`DURABLE_RECORD_MISSING`), and the replica is left to the rebalancer's ADD/REPLACE (path A, with a read).
  - This changes rejoin behaviour (O4).

### 3.7 RF = 1
- The only member is the source, and it is the leader, so the read goes to it.
- The stamp is {s} and does not contain t; t is non-promotable. From there the path is:
  1. AddNode(t) gives {s,t};
  2. t's applied index reaches j, and the AddNode applies;
  3. leadership transfers to t;
  4. RemoveNode(s) gives {t}.
- This is the path the D1 RF = 1 witness proved, now with no pre-admission campaign.
- If the source is dead, no member can answer. The result is typed `MEMBERSHIP_UNREADABLE`, so a REPLACE of a dead sole voter is refused. Its data is unrecoverable anyway.

### 3.8 The new coupled pair
- **Pair:** `committed-bootstrap-stamp`, in `test/shards/impact-contracts.json`.
- **Endpoints:**
  - reader: `src/node/replica-handler-*` (the answer), `src/rebalancer/rebalance-coordinator-operation-creation.js`, `src/query/sql-query-engine-initial-partition-provisioning.js`;
  - consumer: `src/node/replica-handler-runtime-metadata-methods.js`, `src/raft/raft-rs-operation-port.js`, `src/raft/raft-rs-runtime-owner.js`.
- **Witnesses:** W1 and W3 (§4.5).
- **Registered pairs the change touches** (re-run both witnesses of each):
  - `critical-create-hold-topology-guard-order` (creation.js): `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`, `test/control-plane/replica-dispatch-atomic-claim.integration.test.js`;
  - `partition-raft-operation-port` (port, raft-init-base): `partition-construction-seam`, `operation-port-boundary`, `test/partition/partition-port-refusal-outcomes.test.js` and the rest of that pair;
  - `raft-rs-runtime-application-transaction` (runtime-owner, durable store): `operation-port-ready-recovery` and that pair's list;
  - `spread-cure-transition-authorization` (creation.js): `spread-cure-transition-authorization{,-row}.test.js`, `learner-promotion-count-check-inputs.test.js`.

### 3.9 Join-core coupling (memory join-core-systemic-coupling)
- A-formation is the only way joiner nodes receive system partitions. Every formation ADD from the seed coordinator now performs a read.
- **Wide net before any attempt is recorded:** `node-joining|operation-ledger|formation|spread|replica-recovery|learner-promotion` globs (~87 files, run on the lab).
- **Pair witnesses:** `formation-release-seed-contract-joiner-consumer` (`formation-release-handoff-closure.test.js`, `formation-release-handoff-consumer-parity.test.js`), in addition to §3.8.
- **Hot-path cost:**
  - one RPC per ADD/REPLACE creation, local when the coordinator is on the leader node (the seed during formation);
  - no new poll.
- **Local formation:** the 5-process local formation (memory lab-formations-and-placement) runs before any acceptance. Join SLO and A2 run once, on the approved SHA (protocol v2 phase 10).

---

## 4. Coverage model (phase 2)

### 4.1 Decisions
1. **Which member answers:** leader, redirect, or unreadable.
2. **Answer or refuse:** COMMITTED, NOT_LEADER, NOT_HOSTED, JOINT, IDENTITY_UNRESOLVED.
3. **Creation:** stamp or typed refusal.
4. **Target:** accept or refuse the stamp (the §3.4 classes).
5. **Target participation:** campaign, tick-election or resume-campaign allowed, as a function of applied index, bootstrap index and promotability.
6. **Provisioning:** genesis or join (B/C).
7. **Rejoin:** restore or refuse (E/F).

### 4.2 Inputs (authoritative sources in brackets)
- The answerer's role, term, applied index, commit index and `pending_conf_index` [core status, `vendor/raft-rs-wasm/src/lib.rs:684-687`].
- The answerer's ConfState: voters, voters_outgoing, learners, learners_next, auto_leave [core `conf_state`, `lib.rs:802-807`].
- The answerer's registry resolution per id [`raft-rs-peer-identity.js:154-163`].
- The target's applied index and bootstrap index [durable store].
- The target's promotability [core].
- The existence of a durable record [`raft-rs-durable-store.js:467-471`].
- Whether the partition has any replica (B/C) [rows, *routing only*].
- The history shape of the log: simple changes only, and whether an identity is re-added [log].

### 4.3 Events and temporal relations
Each event is placed at each point in the sequence: read, then persist, then dispatch, then CREATE, then target replay (applied < j / = j / > j), then admission.

| Event | Before the read | During the read | Between the read and CREATE | During replay | After admission |
|---|---|---|---|---|---|
| Conf change committed | answered in C_j | answer is C_j or C_j+1 (either is committed) | replay applies it (F1) | applied in order | normal |
| Leader change | redirect | NOT_LEADER or a stale answer (safe, §3.2) | irrelevant | target gate holds | normal |
| Answerer failure | unreadable, refused | timeout, refused | irrelevant | irrelevant | irrelevant |
| Identity re-added (A4) | in C_j | in C_j | replay | **H1 hazard: replay error, fail-closed** | O1 |
| Joint entered (future) | JOINT refusal | JOINT refusal | replay error, fail-closed | as before | out of scope (F4) |
| Target restart | n/a | n/a | n/a | gate from the durable bootstrap index | restore |
| Runtime reconstruction | n/a | n/a | n/a | sole-voter resume suppressed (§3.5) | normal |

### 4.4 Timing arithmetic
- **The read bound** equals `REPLICA_OPERATION_DISPATCH_TIMEOUT_MS`, 5 s (`src/rebalancer/operation-workflow-owner-shared.js:347`). That is at most two deliveries (first target plus one redirect), about 10 s worst case.
- **Creation budgets:** pending timeout 30 s, creating timeout 60 s (`src/rebalancer/rebalancer-constants.js:86-87`).
  - The read happens before persistence, so it consumes none of them.
  - One refused read costs one re-plan. The periodic rebalance check is 60 s (`rebalancer-constants.js:97,100`); priority wakes are sooner.
- **Formation.** With the 90 s join budget (memory failed-add-retry-latency), one refused read (≤ 10 s) plus one 60 s periodic re-plan fits once, and two do not.
  - A creation refused with `MEMBERSHIP_UNREADABLE` or `NOT_LEADER` must re-plan on the partition's next leader-change or publication wake, not the 60 s periodic.
  - The static investigator must name the wake, or the design must add it. See the risks in §5.
- **The gate window** runs from j to the replayed applied index. It is bounded by the target's catch-up time and is already inside today's SYNCING budget of 300 s (`rebalancer-constants.js:88`).

### 4.5 Planned evidence (protocol v2 phases 4-7)
**Relational witnesses**
- **W1** `missing-committed-voter-cannot-lead-or-commit`. D1 skew probe M through the production chain, promoted from scratch into `test/raft/raft-rs-backend/`. The rows omit founder s. **Red on d6a5b941e:** the target leads with 2 of 4 and commits. Green on the fix: the stamp comes from the read, so the target's view equals the leader's, and it cannot lead with 2 of 4.
- **W2** `two-omitted-voters-no-split-brain`. Probe D. **Red on d6a5b941e:** two term-2 leaders and divergent (index, term) writes. Green: exactly one leader, and no index committed with different entries on the two sides.
- **W3** Differential. For every committed prefix j of a generated simple-change history (from the port's own change types), a target bootstrapped from the leader's committed ConfState at j:
  - equals the leader's ConfState at every applied index ≥ j;
  - never campaigns while applied < j;
  - restart at any applied index gives the same membership.
  - Histories come from the binding's ConfChangeType match arms (as in `real-partition-on-raft-rs.test.js:47-60`), not literals.
- **W4** Fail-closed:
  - leader unreachable: creation refused, no operation row;
  - stamp missing at the target, rows present: `STAMP_INVALID`, no replica built;
  - joint ConfState: JOINT;
  - unresolved identity: refused;
  - E/F with no durable record: `DURABLE_RECORD_MISSING`.
- **W5** Gate. The H1 history plus a retried already-admitted target with a runtime reconstruction during replay: no campaign, no sole-voter leadership. The H1 fresh target (self excluded) is held RECOVERY_REQUIRED (the typed replay error), never leading.

**Anchors against a vacuous oracle.** Plain ADD, REPLACE, RF = 1 REPLACE and seed genesis formation, each showing the target's ConfState equals the durable `_raft_rs_applied_state` of the leader on an independent connection. The existing `bootstrap-committed-membership.test.js` is tightened from `withoutPeer(t)` to exact equality with no self.

**Mutation families (each must turn a witness red)**
- stamp from rows instead of the read;
- a non-leader or unadmitted answerer accepted;
- a stale answer rejected, which is a liveness mutation that W3 must catch as over-refusal;
- self added to the bootstrap;
- the gate removed, or the bootstrap index not persisted across restart;
- a cache fallback on a missing stamp;
- the joint check removed;
- the identity check removed.

**Static census.** Exactly one src producer of a COMMITTED stamp, and no reader of services rows inside the stamp or the port bootstrap (in the style of `production-raft-call-census.js`).

---

## 5. Risks, stop conditions and owner decisions

- **O1 (owner decision): current-committed read versus genesis in the log.**
  - This design follows D1's "current committed" letter. Its residual is F3 H1: re-adding one identity makes a fresh target's replay fail closed. That is liveness only, and it needs the gate for safety.
  - The alternative is the R2 design's model (`design-r2-committed-membership-2026-09-23.md` §2): the founding set is committed into the log, and every joiner opens with an empty configuration.
    - Replay is then exact at every index (probe H1, genesis row).
    - It needs no read, no stamp and no gate, and it covers formation for free.
    - It needs the founding entries, which existing groups lack, and a membership request owner that R2 did not land.
  - The stop condition: if the owner wants replay exactness rather than a gate, this design is superseded by R2 step A, not extended.
- **O2 (owner decision): excluding self from a joiner's bootstrap** (§3.5).
  - It changes what a joiner is: a raft non-voter until admitted, where today it is a self-listed voter (`runtime-metadata-methods.js:278-289`; R2 design M3).
  - Consumers that read `replicaIds.length`, promotability or self-as-voter are listed in the D1 census (`raft-init-base.js:547,587,658`; the learner-promotion local role flip `partition-service-learner-promotion-methods.js:416-422,559`).
  - These must be re-read against the committed configuration. It overlaps R2 D7 (formation quorum during joins).
  - Rejecting O2 keeps self in the bootstrap and relies on the gate alone. That is still safe, but the churn of D1 case 2 stays.
- **O3 (owner decision): existing groups bootstrapped from rows.**
  - The read propagates whatever the leader holds. A leader whose own ConfState omits a committed voter is unrecoverable without an operator repair.
  - The decision is either (a) declare rs-raft groups created before this change unsupported (every rs-raft group is re-created from genesis; the liferaft DBs are already refused at open, `raft-init-base.js:385-398`), or (b) specify a verification or repair step.
- **O4 (product contract): durable rejoin without a record** (§3.6).
  - Today the replica silently bootstraps from ACTIVE rows. The design refuses it and hands the replica to ADD/REPLACE.
  - This changes node-rejoin behaviour after data loss, and it may interact with the formation-release contract.
- **Formation timing.** A refused read during formation re-plans on the 60 s periodic unless a leader-change wake exists (§4.4).
  - The stop condition: if no existing wake can be named and adding one is not accepted, the read threatens the 90 s join budget. That is an owner question, not something to tune.
- **Identity completeness (F8).** The leader holds identities for ids it admitted and for its bootstrap list. A leader elected after a leader change may lack an identity it never reserved (F17 residual, R2 M4).
  - `MEMBERSHIP_IDENTITY_UNRESOLVED` makes that fail closed. If it happens in practice, the stamp must carry identities from the log (R2 context-in-log), which is O1 again.
- **Joint configurations.** Refused (F4). Enabling joint changes later invalidates replay over a later bootstrap and requires O1's genesis model.
- **Stamp age.** Safe only because rs-raft never compacts (F1). Any log compaction without snapshot install is a stop condition for this design.
- **Scope overlap.** The REPLACE workflow owner is changing `operation-workflow-dispatch-response-reconcile.js`. This design reads at creation and does not touch dispatch; the dispatch only carries the persisted stamp (`:417-430`).
