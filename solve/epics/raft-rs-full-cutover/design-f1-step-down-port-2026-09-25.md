# Design and feasibility: leader step-down as a port operation (F1), 2026-09-25

Measured on `quest/f1-step-down-port` at 070bd07e5 (worktree
`.claude/worktrees/f1-step-down`). Read-only for `src/`. The probe scripts and
their outputs are in the session scratchpad under `f1/`:
`probe-transfer-leader.mjs` and `probe-transfer-leader.out`.

Short answer: **the core can do it without a rebuild.** The vendored raft-rs
0.7 binding already accepts `MsgTransferLeader` through its existing `step`
primitive, and leadership moves to the named voter. The operation is
leadership **transfer to a named voter** (raft-rs has no "step down to
nobody"). One port operation serves both STEP_DOWN_REPLICA branches, and the
branch that actually fails the join SLO is the **target-election** branch,
not the source demotion.

## 1. Feasibility in the core

### The binding we ship

- The binding is `vendor/raft-rs-wasm/pkg/raft_wasm.js` plus `raft_wasm_bg.wasm`,
  a fork of raft-logic 0.3.14's `native/raft-wasm` on raft 0.7.0
  (`vendor/raft-rs-wasm/BUILD.md`).
- The runtime owner loads it after a digest check
  (`src/raft/raft-rs-runtime-owner.js:73-128`). It exposes only
  `RAFT_RS_CORE_PRIMITIVES`, and `step` is one of them
  (`src/raft/raft-rs-core-constants.js`, `STEP: 'step'`).
- The probe loaded the same artifact through the digest-checking test loader
  (`test/raft/raft-rs-backend/raw-raft-rs-test-core.js`). The wasm sha256 is
  `b285c5ec…9e5ad`, which equals `wasmSha256` in `artifact-digest.json`.

### No `transfer_leader` export, but its message steps through `step`

- The binding exports no `transfer_leader` (`pkg/raft_wasm.d.ts`).
- raft-rs's `RawNode::transfer_leader(transferee)` does exactly one thing: it
  steps a `MsgTransferLeader` whose `from` is the transferee
  (`vendor/raft-rs-wasm/raft-0.7.0/src/raw_node.rs:753-758`).
- The binding's `step` (`vendor/raft-rs-wasm/src/lib.rs:888-896`) decodes
  message type 13 as `MsgTransferLeader` (`lib.rs:1242`). It then calls
  `RawNode::step`, which refuses only local messages (MsgHup, MsgBeat,
  MsgUnreachable, MsgSnapStatus, MsgCheckQuorum; `raw_node.rs:57-66,402-411`).
  `MsgTransferLeader` is not among them, so it reaches `Raft::step`.

### Core semantics

Cited from `raft-0.7.0/src/raft.rs` in the cargo registry. This is the crate
whose checksum `Cargo.lock` pins. That file is not vendored here; only
`lib.rs`, `raft_log.rs` and `raw_node.rs` are.

- **Leader** (`handle_transfer_leader`, raft.rs:1870-1936):
  - It ignores a transferee with no progress (not in the configuration), a
    learner, a repeat of the in-progress transferee, and itself.
  - A request for a different transferee aborts the in-progress transfer.
  - It resets `election_elapsed` ("should be finished in one electionTimeout").
  - It sends `MsgTimeoutNow` at once if the transferee's log is caught up.
    Otherwise it sends an append, and sends `MsgTimeoutNow` on the append
    response that reaches `last_index` (raft.rs:1810-1820).
- **During a transfer the leader drops every proposal**, including
  configuration changes (raft.rs:2032-2041, `ProposalDropped`).
- **The transfer aborts** on election timeout (raft.rs:1107-1108), on any term
  reset (raft.rs:996), and when a committed configuration removes the
  transferee (raft.rs:2729-2734).
- **Follower** (raft.rs:2339-2350): it forwards the message to the leader it
  knows, and silently drops it when it knows none.
- **Target on `MsgTimeoutNow`** (raft.rs:2351-2371): it campaigns at once,
  without pre-vote, but only if promotable.

### Probe: three voters on the real binding, production tuning

The probe used `RAFT_RS_GROUP_TUNING`: election tick 10, heartbeat tick 3,
pre-vote off, check-quorum off.

| Case | What was stepped | Observed |
|---|---|---|
| S1 | leader 1, transferee 3 (caught up) | at once: 3 leader at term 2, 1 follower with `lead=3`. Over the next 200 ticks (20 election timeouts): 0 ticks with 1 as leader, 0 leader changes. A write on 3 commits |
| S2 | follower 2, transferee 2 (target-side request) | forwarded to leader 1; 2 leads at term 2 |
| S3 | leader, transferee a learner | `step` Ok; nothing changes (leader 1, term 1) |
| S4 | leader, transferee 9 (not a member) | `step` Ok; nothing changes |
| S5 | leader, transferee itself | `step` Ok; nothing changes |
| S6 | transferee down | a write during the transfer is refused with `propose: raft: proposal dropped`. The leader accepts writes again after exactly 10 ticks (= election tick). 1 stays leader |
| S7 | transferee lagging | the leader sends appends (`3:1->3` ×3), then `14:1->3` (MsgTimeoutNow); 3 wins |
| S8 | the same request twice, then again at the old leader after completion | idempotent: 3 leads, and the term is unchanged by the repeat |
| S9 | conf change proposed during a transfer | refused with `propose_conf_change: raft: proposal dropped` |
| S10 | leader crashes right after the request | no transfer. Survivors elect by timeout (13 ticks); the old leader returns as a follower |
| S11 | leader crashes after MsgTimeoutNow was sent | the target still wins |
| S12 | follower that knows no leader | `step` Ok; silently dropped, no leader |
| S13 | transfer while a conf change (add learner) is uncommitted | the target is caught up to the conf-change entry before TimeoutNow. It wins and commits it (`pendingConfIndex=3`, commit 4) |
| S14 | retarget (3, then 2) while the first transfer is in progress | 2 wins |

### Verdict: feasible, no rebuild

The operation is a runtime-owner call of the existing `step` primitive with
`{msgType: 13, from: <transferee raft id>}`.

The one limit is that **`step` answers Ok in every ignored case** (S3, S4, S5
and S12). The fork's `status` does not expose `lead_transferee` (`lib.rs:683-725`;
`JsStatusOut` has no such field). So:

- The port must decide "accepted or refused" itself, from `conf_state` and
  `status` read in the same queued turn before it steps.
- Completion is observed through the port's existing role and leader events
  and `readStatus`.
- "Transfer in progress" cannot be read directly. That needs a rebuild, which
  is only necessary if the owner wants it; see §7.

## 2. The property

> When a replica of a partition is asked to transfer that partition's
> leadership to a named voter (or, when no successor is named, to the voter
> whose log is most caught up), then, if the request is accepted, leadership
> reaches that voter through the operation port within one election timeout
> as the core counts it (election tick × tick length). The old leader then
> holds no leadership, and never regains it while the new leader keeps
> reaching it. If the request cannot succeed, the port says so as a typed
> refusal and changes nothing: the target is not a voter, the replica knows
> no leader, or no successor exists. A transfer the core aborts leaves the
> leader in place and fit to take writes after that one election timeout.

Why this refinement:

- **Named target.** raft-rs transfers only to a named transferee. The failing
  SLO caller names one: the replacement replica. "Step down to anyone" is not
  a core operation.
- **"Never regains while the new leader keeps reaching it."** raft-rs has no
  candidacy hold. S1 shows no regain across 20 election timeouts, because the
  handover is leader-mediated: there is no leaderless timer race. A regain
  after the new leader fails is ordinary Raft, and not a violation.
- **Refused changes nothing.** The core silently ignores bad targets (S3, S4,
  S5, S12). The port must refuse with a type (R07/R11), not answer Ok with no
  effect.
- **"Fit to take writes after one election timeout."** The core drops writes
  while a transfer is in progress (S6, S9). That window is bounded and must
  surface as a named retryable outcome, never as a terminal refusal.

## 3. Census of consumers (src, at 070bd07e5)

| # | Site | What it needs | Behaviour on the port today |
|---|---|---|---|
| C1 | `src/raft/tracked-leader-demotion.js:18-41` `performTrackedLeaderDemotion`: `deferCandidacy` :33, `raft.change({state: FOLLOWER})` :35, `raftProvider.startElectionTimer` :39 | Step down to anyone, plus a candidacy hold so the ex-leader does not re-win a leaderless timer race | Dead. It returns false: the port has no `change`, and a partition has no `raftProvider` (retired option, `partition-service-core-base.js:59-61`). Its only caller is C2, since the durability path no longer calls it (see C5) |
| C2 | `src/node/replica-handler-leader-handoff-methods.js:99-163` `requestTrackedPartitionLeaderHandoff`, **source branch** (reason ≠ target election, tracked role LEADER): the gate at :141-153 checks `raft.change`, then calls C1 at :157 | Leadership leaves this (source) replica. The request carries no target | Always `NOT_SUPPORTED/PROVIDER_UNSUPPORTED` (:148-152) |
| C3 | Same file, :56-91 `requestTrackedReplacementLeaderElection`, **target branch** (reason `REPLACE_TARGET_LEADER_ELECTION`, tracked role FOLLOWER, :111-127): `raftProvider.requestElectionNow` :68, `startElectionTimer` :85 | Leadership moves TO this (target) replica | Always `NOT_SUPPORTED/PROVIDER_UNSUPPORTED` (:57-62), because `service.raftProvider` is undefined. **This is the SLO failure** (see below) |
| C4 | `src/node/replica-handler-remove-request-methods.js:290-395` `handleStepDownReplica` (dispatched from `replica-handler-lifecycle-methods.js:65`) | Carries C2 or C3 as an answer | `NOT_SUPPORTED` → ERROR response "STEP_DOWN_REPLICA requires a tracked partition service with raft ownership" (:341-358) |
| C5 | `src/partition/partition-service-durability-fitness.js` | Demote an unfit leader and hold its candidacy while unfit | Surface only. Since 439adeb04 there is no `deferCandidacy` call. The typed outcomes `CANDIDACY_DEFERRAL_UNSUPPORTED` / `DEMOTION_UNSUPPORTED` (:57-61, :225-227) replace it. `demoteDurabilityUnfitLeader` (:270-282) only calls `leaderDurabilityUnfitHook`. **Neither `setLeaderDurabilityUnfitHook` (:86) nor `setLeaderDurabilitySuccessorProbe` (:99) has a production caller** (tests only). F1's `:358 deferCandidacy` citation is stale on this head |
| C6 | Rebalancer issuers of STEP_DOWN_REPLICA. `priority-publication-handoff.js:160-163` (target election, dispatched to the replacement node) and `:216-219` (source handoff, dispatched to the source node, with no target in the request). `user-table-leader-placement-cure.js:338-362` (the target request and the paired source-demotion request, sent at :401 and :434). `priority-publication-safety-topology.js:437,496,533` (handoff evidence records). `priority-publication-leader-safety.js` (R1/R3 escalation) | Issue the request. Completion is judged from leader rows and election ACKs | Unchanged callers. Their design comments describe Liferaft timer races ("heartbeat clobber", "undirected timer wins") that transfer does not have. Recorded, not in scope |
| C7 | Provider contract: `raft-provider-contract-constants.js:6-7` (`START_ELECTION_TIMER`, `REQUEST_ELECTION_NOW`); `liferaft-provider.js:527` (`startElectionTimer`) and `:543` (`requestElectionNow`) | Liferaft election controls | `requestElectionNow`'s only consumer is C3. `startElectionTimer` is also used by `raft-group.js:431` and `raft-replica-base.js:329` (message-group / WasmServiceReplica, R3/R4) |
| C8 | Liferaft internals: `liferaft.js:204` `deferCandidacy`; `liferaft-incoming-data.js:123-194` (timeout inflation, `raft.change`) | Liferaft's candidacy hold | Its only production caller is C1 |
| C9 | `raft-group.js:441-458` and `message-group/constants.js:81` (`raft.change({state: LEADER})` single-replica promotion) | Promotion, not step-down | Out of scope (message groups, R3). **Owner question 12:** message-group services are never demoted through C1. The replica handler's `localServices` holds only partition services (`replica-handler-create-methods.js:477`), and `message-group-service-handler.js` has no STEP_DOWN handling. F1 does not block R3 |
| C10 | `src/raft/spike/raft-logic-spike-cluster.js:247` `node.stepDown` | n/a | Production-unreachable: nothing outside `src/raft/spike` imports it |
| C11 | `port.campaign` (`raft-rs-operation-port.js:259` → `raft-rs-runtime-owner.js:1046-1068`, election-safety gated); consumer `partition-service-raft-init-base.js:598` (single-replica bootstrap); sole-voter resume `raft-rs-runtime-owner.js:458-465` | Immediate election of this replica | Works. It is not a handoff primitive: it gives a disruptive term bump and no catch-up of the target |
| C12 | Role consequences on rs-raft: `partition-service-raft-lifecycle-wiring.js:70-94` | Cancel leader-owned activation and release writes on leaving leadership | Already driven by the port's FOLLOWER/CANDIDATE events. C1's manual `cancelLeaderOwnedActivation` is redundant on the port |

**The SLO red is C3, not C2.** Every failing request in the A2 classification
logs names `replicaId replace-replica-804a4438…` on the joining node `…440202`
(scratchpad `slo/base-*.out`, `cand-{1,3}.out`). That id is
`buildReplicaId('replace-op-b0b98821…')` (`rebalance-replace-intent-identity.js:33`;
the sha256 prefix was verified). It is the REPLACE's **replacement** replica, so
the request is `REPLACE_TARGET_LEADER_ELECTION`, and it fails at C3 `:57-62`
because `service.raftProvider` is undefined.

## 4. Is candidacy deferral the same operation?

**No. It is deletable.** The two needs it served are both covered on rs-raft:

1. **Drain / handoff re-win (C1's reason).** The 68% "undirected timer wins"
   were a Liferaft artifact: demoting to a leaderless follower and re-arming
   a timer race. Transfer is leader-mediated. The target campaigns at once
   on `MsgTimeoutNow` in a higher term, and the old leader is a follower of
   that term from the first vote request. Probe S1: 0 regains, 0 leader
   changes across 20 election timeouts at production tuning. No hold is
   needed.
2. **Durability fitness (C5).** Its trigger is `db.inTransaction` held beyond
   the legal hold (`partition-service-durability-fitness.js:186-205`). That
   is the same predicate by which the rs-raft store refuses persistence
   (`raft-rs-durable-store.js:188-192`, in a transaction it did not open).
   While it holds, the runtime owner enters no core for this replica:
   - `perform` refuses tick, campaign and every command
     (`raft-rs-runtime-owner.js:1190-1200`);
   - the inbound drain is deferred too (:1249).

   So the unfit replica cannot campaign, which is a structural candidacy
   hold. It also cannot execute a step-down: any transfer would answer
   HOST_FAILURE `user-transaction-open`. Its followers stop receiving
   heartbeats and elect a successor after their election timeout.

   What C5 still lacks is outside this quest's property:
   - its partition's role projection stays LEADER while the group moves on;
   - its hook and successor probe are unwired.

   Recommendation: a separate finding for the durability-fitness owner,
   which also re-certifies `test/convergence/dt6-ledger-leader-durability-fitness.test.js`
   on rs-raft. It is not a port operation.

**Recommendation (not a silent widening):**

- Do not add a deferral operation.
- In this quest, delete C1 wholesale, together with its `deferCandidacy` call.
- Delete `deferCandidacy` itself and its Liferaft timeout inflation (C8),
  with their liferaft-substrate witnesses
  (`test/convergence/dt6-candidacy-reluctance-drain-stepdown.test.js`,
  `dt6-directed-election-heartbeat-clobber.test.js`), **only if the owner
  widens scope.** Their only production consumer disappears with C1.
  Otherwise record them for the RaftGroup/Liferaft deletion unit.

## 5. The operation on the port

### Name and shape

`transferLeadership(request)` joins `RAFT_OPERATION_PORT_METHODS`
(`src/raft/raft-operation-port.js:5-18`). It is an operation that returns a
frozen outcome record, like `proposeConfChange`, and never an object.

The canonical request, with one named field set (R07/R08, mirroring the
membership request's `{type, replicaIdentity}`):

- `{successor: 'named', replicaIdentity}` transfers to that Lagrange replica.
  The raft id is resolved through the port's own `RaftRsPeerIdentityRegistry`,
  as `normalizedConfChange` does (`raft-rs-operation-port.js:99-124`).
- `{successor: 'most-caught-up'}`: the runtime owner picks the voter other
  than itself, not a learner, with the highest `matched` in the leader's own
  `status.progress`. Ties go to the lowest raft id. This is the raft-rs
  expression of "step down". It is decided from core state in the same queued
  turn, so no second successor authority is created.

  Owner alternative: require a named successor everywhere, and add the
  replacement id to the source-branch STEP_DOWN request (a rebalancer
  protocol change).

### Runtime

- A new `RUNTIME_COMMAND.TRANSFER_LEADERSHIP` in
  `raft-rs-runtime-owner-constants.js:40-48`.
- `performCommand` (`raft-rs-runtime-owner.js:1145-1173`) reads status and
  conf state (`readGroupObservation`, as `probePeerProgress` does at
  :1117-1143), validates, then invokes the core `step` with
  `{msgType: RAFT_RS_MESSAGE_TYPE.TRANSFER_LEADER, from: targetId, to: selfId}`
  and drains the Ready.
- The message-type number goes in a constants owner and is parsed in its
  witness from `lib.rs`'s match arm (`lib.rs:1242`), never written as a test
  literal.
- The core is still entered only by the runtime owner, so the operation-
  boundary audit (`scripts/checks/raft-rs-operation-boundary-audit.js`) holds.

### Answer vocabulary

The reasons are a new frozen `RAFT_LEADERSHIP_TRANSFER_REASON` in
`raft-operation-port-constants.js`.

| Outcome | Reason | When |
|---|---|---|
| CORE_OK | `transfer-requested` | Leader; target is a voter other than self; stepped. Completion is not implied |
| CORE_OK | `transfer-forwarded` | Follower that knows a leader; the core forwards it (S2) |
| CORE_OK | `already-leader` | The named target is the replica that currently leads (idempotent; covers the "already leader" invariant of `test/node/replica-handler-replacement-election-already-leader.test.js`) |
| CORE_REFUSED, retryable | `no-known-leader` | Follower or candidate with `lead = 0` (S12 would otherwise drop silently) |
| CORE_REFUSED | `target-not-voter` | Target is a learner or not in `conf_state` (S3, S4) |
| CORE_REFUSED | `target-unreserved` | The identity has no reserved raft id |
| CORE_REFUSED | `no-eligible-successor` | `most-caught-up` in a group with no other voter |
| existing | `closed`, HOST_FAILURE `user-transaction-open`, CORE_FATAL | The port's existing gates, unchanged |

### How completion is observed

- **Not** from the answer.
- The leader-publication path sees it through the existing port events
  (`LEADER_CHANGE`, `FOLLOWER`, `LEADER`) and `readStatus().leaderId`, which
  are already wired (`partition-service-raft-lifecycle-wiring.js:60-110`).
- An abort is visible as the same leader after one election timeout
  (`recoveryRetryWindowMsOf`, `raft-rs-runtime-tuning.js:52-54`, is exactly
  that span).
- The replica handler answers on acceptance and does not wait: the leader
  rows stay the single completion authority for the REPLACE workflow (R01).

### Proposal refusal during a transfer

S6 and S9 show the core dropping proposals during a transfer. Today that
surfaces as CORE_REFUSED `propose: raft: proposal dropped` with
`retryable:false` (`invokeCore`, `raft-rs-runtime-owner.js:348-358`). The
partition write path returns it as-is (`partition-service-raft-write-commit.js:45-50`),
and membership admission would record REFUSED.

The runtime owner must name this state. When `propose` or
`propose_conf_change_v2` is dropped while the core reports itself leader and
still a voter, the only core cause is an in-progress transfer (raft.rs:2025-2041).
The runtime owner answers `HOST_FAILURE`/`leadership-transfer-in-progress`
with `retryable:true` and `recoveryRequired:false`, which the canonical
retry owner re-runs.

### One authority

- A `PartitionService.requestLeadershipTransfer(successor)` method over
  `this.raft.transferLeadership` is the one partition-side issuer.
- C2 and C3 route to it:
  - source branch: `{successor: 'most-caught-up'}`, only when the tracked role
    is LEADER;
  - target branch: `{successor: 'named', replicaIdentity: <self>}`, when
    FOLLOWER, and still a no-op when already LEADER or CANDIDATE.
- `requestTrackedReplacementLeaderElection` and its provider branches are
  deleted.
- Handoff branches become:
  - `transfer_requested`;
  - `transfer_forwarded`;
  - `already_leader`;
  - `transfer_refused`, carrying the typed reason;
  - the existing role no-ops;
  - `replica_not_tracked`.
- NOT_SUPPORTED stays reachable only for a tracked service that has no port.
  It becomes async, because port operations may return a promise.

### Deletions (one path, R11)

- `src/raft/tracked-leader-demotion.js` (C1).
- The `raft.change` and `raftProvider` gates in the handoff methods (C2, C3).
- `REQUEST_ELECTION_NOW` from the provider contract, and
  `LiferaftProvider.requestElectionNow` (C7). Its only consumer is C3.
- `START_ELECTION_TIMER` stays until RaftGroup deletion.
- No `change` compatibility method is added.

### Liferaft behind the port on this head

- Partitions cannot select it: `refuseBackendSelection` refuses `raftBackend`
  and `raftProvider` (`partition-service-core-base.js:56-80`), and
  `createOperationPort` always uses `RAFT_RS_PROVIDER` (:468-470).
- `LiferaftProvider.createPartitionPort` (`liferaft-provider.js:190-300`)
  still exists and is constructed only by tests:
  - `backend-seam.test.js`;
  - `partition-construction-seam.test.js`;
  - `raft-packet-round-trip.property.test.js`.
- Adding a port method makes `createRaftOperationPort` throw on it
  (`raft-operation-port.js:37-41`). So it either answers `transferLeadership`
  with CORE_REFUSED `leadership-transfer-unsupported-backend`, typed and
  never a no-op, or it is deleted with its three tests.
- Recommendation: delete it if the owner accepts the widening; otherwise the
  typed refusal.
- Message groups still run Liferaft through RaftGroup and MessageGroupService.
  That is untouched, and C9 shows they never receive STEP_DOWN.

## 6. Witness plan

Tiers per the verification protocol:

- **E0:** the property test on a frozen `production_sha`.
- **P1:** the focused suites.
- **A2:** the SLO batch.

**W1: property, red-first, real rs-raft ports**
(`test/raft/raft-rs-backend/partition-node-cluster.js`, three voters).

- Setup: elect, commit writes, then
  `transferLeadership({successor:'named', replicaIdentity: r3})` on the leader.
- Assert, by the core's own report through `readStatus`, with ids resolved
  through the backend's registry and never literals:
  - r3 leads within one election timeout of ticks (`recoveryRetryWindowMsOf`);
  - the term advanced;
  - r1 is a follower whose leader is r3;
  - over ≥10 further election timeouts, r1 emits no `LEADER` event;
  - a write proposed on r3 commits.
- Red on this head: the method is absent.
- Mutants that must each be red:
  - the op answers CORE_OK without stepping;
  - the op steps with `from` = self;
  - the op uses `campaign` at the target instead;
  - a refusal answered as CORE_OK.

**W2: the target-side request.** `named self` on follower r2 answers
`transfer-forwarded`, and r2 leads. The same request on the new leader
answers `already-leader` with an unchanged term.

**W3: the attack matrix** (minimum; each must be caught):

| Attack | Required observation |
|---|---|
| Issued to a non-leader with a known leader | `transfer-forwarded`, and leadership reaches the target |
| Issued to a follower with no known leader | CORE_REFUSED `no-known-leader`, and no term change |
| Target not a voter (learner) / not a member / unreserved | typed refusal; leader and term unchanged; a write proposed at once succeeds (proves nothing was stepped: no drop window) |
| Target is the current leader | `already-leader`, no term change |
| `most-caught-up` in a solo group | `no-eligible-successor` |
| Leader crashes before MsgTimeoutNow leaves | survivors elect normally; the old leader on return is a follower (S10) |
| Leader crashes after MsgTimeoutNow | the target leads (S11) |
| Target crashes or partitions mid-transfer | after one election timeout the leader is unchanged and writes succeed. During the window, `propose` answers `leadership-transfer-in-progress` retryable, never a raw non-retryable refusal (S6) |
| Transfer racing a conf change | proposeConfChange during a transfer answers retryable (S9). A transfer with an uncommitted conf change converges and commits it (S13). A committed removal of the transferee aborts the transfer and the leader stays |
| Repeated request (same target, in progress and after completion) | a single term change; answers idempotent (S8) |
| Retarget while in progress | the second target leads (S14) |
| Closed port / user transaction open | `closed` / HOST_FAILURE `user-transaction-open`, with no core entry (actual-core-entry observer) |

**W4: replica handler on real PartitionServices on rs-raft.**

- `handleStepDownReplica(REPLACE_TARGET_LEADER_ELECTION)` for a follower
  replica answers COMPLETED `transfer_forwarded`, and that replica leads
  within one election timeout.
- `REPLACE_SOURCE_LEADER_HANDOFF` on the leader answers COMPLETED
  `transfer_requested`, and leadership leaves it.
- Already-leader target: a COMPLETED no-op with the term unchanged. This
  keeps the invariant the current double-based test pins.
- Rewrite `test/node/replica-handler-replacement-election-already-leader.test.js`
  and `test/node/replica-handler*.test.js` off the Liferaft doubles
  (`raft.change`, `requestElectionNow`).

**W5: structural census.**

- No src reference remains to `performTrackedLeaderDemotion`,
  `requestElectionNow`, or `raft.change`/`deferCandidacy` outside Liferaft
  internals.
- `RAFT_OPERATION_PORT_METHODS` includes `transferLeadership`, and every
  constructed port implements it. The three list witnesses must be updated:
  - `operation-port-lifecycle.test.js:13`;
  - `operation-port-boundary.test.js:25`;
  - `partition-construction-seam.test.js:117,170`.
- The operation-boundary audit is green.

**W6: SLO (A2).**

- Run `test/integration/node-join-convergence-slo.integration.test.js` on the
  landing candidate (seed parity + F1). Run it 10 times, one at a time,
  thermal-gated, and stop at the first red.
- Each run must show:
  - the assertion at `:639` green (over-target ≤ 2000 ms);
  - **zero** `Replica leader handoff failed` lines;
  - at least one STEP_DOWN answered COMPLETED with a transfer branch.

  That last point proves the path was exercised, not skipped.
- Why 10 runs: the candidate's current red rate is 2/5. Ten greens bound
  the chance that rate still holds at 0.6^10 ≈ 0.6%. Five would leave 7.8%.
- Attribution (optional, E-level): 5 runs on F1 alone without seed parity.

**P1 adjacent suites:**

- `test/raft/raft-rs-backend/*`;
- `test/node/replica-handler*.test.js`;
- `test/rebalancer/{user-table-leader-placement-cure,r1-leader-election-ack-proof-starved-rejoiner,r3-handoff-escalate-replacement-election}.test.js`;
- `test/rebalancer/quorum-conditioned-remove-safety-tail*.js`;
- `npm run -s test:duplication`.

## 7. Risks and stop conditions

- **WASM rebuild:** not required (§1). This would become a stop condition
  only if the owner wants in-progress or abort state read directly
  (`lead_transferee` in `status`). The design does not need it.
- **Seam:** not broken. One operation joins the frozen method list and
  returns a frozen record; the core is still entered only by the runtime
  owner. This is a boundary change to a contract (R02/R08) with three
  literal-list witnesses to update. It changes no sealed quest record.
- **Sealed authorities:** none changed.
  - The durability-fitness outcomes (C5) stay as they are unless the owner
    takes the finding.
  - The rebalancer's R1/R3 gates are not touched. R1 already trusts a
    target-election ACK that meant "armed", not "won". With transfer the ACK
    means "entered the core" or "forwarded", which is no weaker.
- **Write-path exposure:** a transfer makes the leader refuse writes and conf
  changes for up to one election timeout (S6, S9). This must ship as the
  named retryable outcome in §5, or partition writes and membership admission
  will record terminal refusals for a transient state. The classification
  (leader + voter + ProposalDropped ⇒ transfer in progress) comes from
  raft.rs:2025-2041. A property test must pin it.
- **Ingress (pre-existing, recorded):** peers may already deliver type 13
  (`raft-rs-ingress-constants.js:36-39`, range 0..18). Follower forwarding
  depends on it. Any configured peer can therefore ask the leader for a
  transfer, which is raft-rs's own semantics.
- **Scope decisions for the owner:**
  - `most-caught-up` versus a named successor in the source-branch request;
  - deleting `LiferaftProvider.createPartitionPort`, `deferCandidacy` and the
    two liferaft dt6 witnesses;
  - the durability-fitness finding (C5: unwired hook and probe, role
    projection while persistence-refused).
- **No stop condition found.**

## Lead decisions (2026-09-25)

1. **Source branch successor.** The source branch uses `{successor: 'most-caught-up'}`, so the rebalancer's STEP_DOWN request is unchanged. The target branch uses `named` self.
2. **Liferaft.** No deletion in this quest; it stays with the Liferaft deletion unit. `LiferaftProvider.createPartitionPort` must refuse `transferLeadership` with a typed `leadership-transfer-unsupported-backend` answer, never a no-op. `tracked-leader-demotion.js`, the `raft.change`/`raftProvider` gates and `REQUEST_ELECTION_NOW` / `requestElectionNow` are deleted as designed. `LiferaftProvider.deferCandidacy` and the Liferaft dt6 witnesses stay with the Liferaft unit.
3. **Scope.** The write-path retryable `leadership-transfer-in-progress` outcome ships with the operation. Candidacy deferral gets no operation (section 4).
4. **Durability fitness (C5)** is recorded as a finding for the durability owner. It is not in this quest.
