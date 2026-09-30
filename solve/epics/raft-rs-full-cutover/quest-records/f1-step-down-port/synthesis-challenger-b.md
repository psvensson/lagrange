# F1 coverage model v1: challenger B (temporal, timing, interleaving)

Read-only. No repository edits, no git writes, no suites run.

**What I read**
- Worktree `.claude/worktrees/f1-evidence` at 1e64d5a57. `git diff bc8e1118d -- src` is empty, so production is bc8e1118d.
- raft.rs is the crate at `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0/src/raft.rs`.

**Abbreviations**
- `RO` = `src/raft/raft-rs-runtime-owner.js`.
- `ROC` = `src/raft/raft-rs-runtime-owner-constants.js`.
- `ORACLE` = `test/raft/raft-rs-backend/transfer-leadership-drain-oracle.test.js`.
- `DRIVER` = `test/raft/raft-rs-backend/transfer-leadership-driver.js`.
- `CLUSTER` = `test/raft/raft-rs-backend/partition-node-cluster.js`.

**Relation to the static investigation**
- The static investigator's `static-investigation.md` appeared while I worked, and I read it. Its timing table (3.1 to 3.8) and multi-step table (4.3, M1 to M10) stand.
- I do not repeat them. I cite them as **SI §x**, and add or correct only where the temporal dimension changes the model.
- Challenger A holds the nested-announce repro (`repro/nested-announce.mjs`). B7 below adds only its temporal reachability.

## 0. Findings at a glance

| ID | Dimension | Kind | Effect on the claim |
|---|---|---|---|
| B1 | I11 "gate read before an await" (T4, open question 4) | **Correction** of an existing dimension | Closed by construction for D1-D4: admission is re-verified after every in-turn await. Round-1 non-blocking 2's consequence is unreachable. Keep it as an invariant plus a mutation |
| B2 | Third temporal state: processed by the core, not yet announced | **New** temporal relationship | Adjacent decisions (A1/M3, A2/M5, M2) read projections that lag through the turn's awaited sends. D1-D4 are unaffected |
| B3 | Ticks inside a turn (probe) | **Correction** of T5 | "No tick interleaves a turn" is false for D6. Probe ticks shorten the transfer window |
| B4 | Core clock ≠ wall clock (tick queueing, lost ticks) | New factors on an existing contract (T5) | Window length in wall time. The A3 budget crossing is reachable at replica index 0 |
| B5 | Second transfer: same-transferee repeat vs retarget, and re-request cadence | Instance (round-1 non-blocking 3 and 6, design S14), plus a **new crossing** (5000 ms < W) | Oracle cells D1 and D2 × pending type 13 are missing. Liveness hazard: the window is held open indefinitely |
| B6 | Answer vs effect after the step (failure answered while the effect is taken) | **New** output dimension (the inverse of F7) | Outside pending-vs-processed. The write path answers a durable, sent entry as `CONSENSUS_HOST_FAILURE` |
| B7 | Re-entrant nested turn: reachability in time | Instance of challenger A / SI M10 | Harness-common; production-narrow. Worst case: the nested drain goes async mid-way |
| B8 | The oracle's time model: frozen clock, synchronous sends, homogeneous timing | **New** oracle axes | The oracle cannot construct T3, T4, T5, B1, B2, B4 or the async case of B7 |
| B9 | Observation window placed exactly at `electionTick` | **New** (oracle timing boundary) | Nondeterministic false red, or masking |
| B10 | "Modulo the class of outcome" can hide real differences | Correction of §1.4 | Which transferee, how many elections, completed vs aborted |
| B11 | Nondeterminism inventory | Confirmation and tightening of §1.4 | Only the core's election timeout is random. The list must be closed |
| B12 | Vacuity of the reference run in time | Instance (open question 5) | The inputHidden cells lack a processing precondition. B's own drain has a gate |
| B13 | Transferee held by a host failure drops MsgTimeoutNow | Instance ("pending at another replica", SI §4.4 item 5) | Accepted with no effect. Exclusion 4 must say whether a hold at the transferee is in or out |
| B14 | STEP_DOWN caller timeout equals the inner ack timeout | Refinement of SI T5 | The caller always loses the answer when the transferee is connected but unresponsive |

## 1. Question 1: multi-step operations and every boundary near a decision

### 1.1 The decision blocks are synchronous (verified)

- **D1 and D2.** `transferLeadership` runs `readGroupObservation` → `decideLeadershipTransfer` → `invokeCoreAt('step', 13)` with no await or core entry in between (`RO:1160-1177`). Its `drainReady` (`:1178-1179`) is after the step.
- **D3 and D4.** `invokeCoreAt(propose*)` is followed synchronously by the refusal classification `readGroupObservation` (`RO:1225-1232`, `:1185-1193`).
- **Nothing reaches the core between the last inbound check and the decision.**
  - `drainInbound` calls `continuation()` in the same synchronous frame as its `inbound.length === 0` check (`RO:1235-1238`).
  - After an awaited envelope it re-enters through `thenMaybe` and re-checks (`:1245-1247`).
- **Conclusion:** T3's "arrival during an await before the decision is drained first" holds. The single exception is B7.

### 1.2 Boundary inventory

| # | Boundary | Where | What can arrive or change across it | Does the claim apply? |
|---|---|---|---|---|
| K1 | Port dispatch → queued turn | `raft-rs-operation-port.js:204, 259-265`; `enqueue` `RO:671-694` | Any number of turns: ticks, drains, other commands. Registry reservations, which are pre-queue (SI M4) | Yes: the decision is post-drain and fresh. The registry verdict at dispatch is exclusion 2 |
| K2 | Gate → `ensureExecution` → `drainInbound` | `RO:1254-1265` | Synchronous unless the drain awaits | Yes (T1) |
| K3 | In-turn send await | `sendMessages` `RO:774-783`, sequential, one message at a time. Production `deliver` resolves on the peer's ack or at `messageTimeoutMs` 5000 (`src/transport/websocket-transport.js:606-626`; `src/constants/transport.js:74`) | New `step()` deliveries join `group.inbound` (`RO:1397`). Tick and command turns queue behind. A user transaction can BEGIN. Other groups' failures can change `runtimeGeneration` | Deliveries: yes, drained by the re-check. Admission: **re-verified at K4 before any further core entry** (B1). Generation: exclusion 4 |
| K4 | Admission wait after every send batch | `whenPersistenceAdmitted` `RO:846`, `:870`; poll 10 / bound 120000 (`ROC:140-143`) | The same as K3, for up to 120 s | Yes. The decision always runs in the microtask chain that follows an ADMITTED observation (B1) |
| K5 | The command's own post-step drain | `RO:1178-1179`, `:1228` | Everything in K3 and K4, **after** the decision | The decision is fixed. The **answer** can still flip to a failure after the effect was sent (B6) |
| K6 | Role-listener re-entry during an announce | `RO:949-960` → `replica-leadership-state.js:119, 128, 138, 155, 164`; `partition-consensus-hold-log.js:58, 74` → `readStatusObserved` `RO:1039-1044` | The rest of the pending inbound, processed in a nested turn | B7 |
| K7 | The A3 retry sleep | `partition-service-raft-write-commit.js:85-98`; 24 proposals over 2000 ms (SI §3.2) | Everything, including the transfer's completion or abort, a retarget, admission changes | Each attempt is its own D3 decision, so the claim applies per attempt. The **operation's** result is a timing contract (T5) |
| K8 | Handler role read → `await requestLeadershipTransfer` | `replica-handler-leader-handoff-methods.js:126-146` | Pending inbound, **and** already-processed but unannounced core changes (B2) | Not satisfied by production (A1). The model must place it (B2) |
| K9 | Admission `readStatus()` → `proposeConfChange` | `partition-service-raft-membership-administration.js:120-135` | As K8. `readStatus` answers the cached observation whenever the queue is busy or the READ_STATUS drain goes async (`RO:1039-1051`) | Not satisfied by production (A2). The model must place it (B2) |
| K10 | Scheduled inbound drain | `RO:1280-1319`; delay 0 (`ROC:139`); while not admitted, retry every 10 ms up to 120000 ms, then stop (`:1289-1301`) | After the bound, pending inbound waits for the next operation | Yes: the next command drains it first |

## 2. Question 2: timing boundaries a transfer window can cross

### 2.1 Derivation

The derivation is SI §3.1, checked independently.

- **Tick:** 20 ms (`src/config/config-definitions.js:40`; `tickMsOf`, `raft-rs-runtime-tuning.js:17`).
- **Election minimum:** `electionMinMs(i) = 1000 + 2500·i` (`config-definitions.js:37`; `src/raft/constants.js:58`; `src/partition/partition-service-constants.js:752`; `replica-election-timeouts.js:43-46`).
- **Election tick:** `electionTick(i) = max(4, ceil(electionMinMs/20)) = 50 + 125·i` (`raft-rs-runtime-tuning.js:32`).
- **Nominal window:** `W(i) = electionTick·20 = 1000 + 2500·i` ms. That is 1000, 3500, 6000, 8500, 11000 for i = 0..4 (`:52-53`).
- **When the window ends:** the leader aborts on the `electionTick`-th tick after the transfer started. `election_elapsed` is reset at the start (raft.rs:1923-1925) and checked at raft.rs:1100-1109.
- **Follower timeout:** randomized in [et, 2et) (raft.rs:2807-2819). The binding sets only `election_tick` (`vendor/raft-rs-wasm/src/lib.rs:453-461`).

**The window in wall time (B4 and B3):**

```
W_wall(i) = electionTick(i)·tick
          + (time admission is closed on the leader)   [ticks refused at the gate RO:1254-1257: lost]
          + (setInterval fires lost to event-loop starvation)   [SI §3.7]
          − tick·(ticks driven by probes during the window)   [≤ 3 per probe, RO:1104-1119]
```

A queue stall (K3 or K4) **delays** ticks. It does not lose them: each `setInterval` fire enqueues a tick turn (`raft-rs-operation-port.js:216-219`, `RO:686-693`). After the stall they run as a burst.

### 2.2 Crossings

Where SI already derived a row, I cite it and add only what changes.

| # | Budget (file:line) | Crosses when | Externally relevant result | Covered by the model? |
|---|---|---|---|---|
| X1 | Write deferral budget 2000 (`partition-service-constants.js:49`); loop `write-commit.js:85-98`, 24 attempts (SI §3.2) | `W_wall − s > 2000` (SI). **Also at index 0** whenever admission is closed ≥ 1000 ms during the window, or ≥ 50 ticks are lost to starvation (B4) | `{success:false, deferRetry:true}`, nothing stored (`write-commit.js:102-109, 161-167`) | A3 is covered at both ends (R2.4, R3.10). The **stretch factors are not modelled**. Add an index-0 row driven by an open user transaction |
| X2 | Membership admission: no timer retry; re-attempt only on a services-cache change (`partition-service-core-base.js:847-864`; SI §3.3) | Any admission inside a window | DEFERRED, with liveness left to an unrelated cache event | Not modelled. It is a timing contract, outside the claim |
| X3 | Rebalancer minimum check interval 1000 (priority) / 5000 (other) (`rebalancer-planning-gate-methods.js:723-724`); override floor 1000 (`:55-56, 63-64`); periodic 60000 (`rebalancer-constants.js:96`) | W(0) = 1000 is **equal** to the priority floor, a boundary equality. W(i ≥ 2) > 5000 | The rebalancer's writes to the transferring partition (ledger) are deferred or `deferRetry`. The new leader's start check consumes its interval (SLO finding) | Not modelled (SI T3) |
| X4 | Remove-safety retry 1000 (`operation-workflow-owner-shared.js:339`) | W(0) = 1000: equality. W(i ≥ 1): 3 to 8 retries per window | Repeated deferrals; each evaluation reads leader rows that still name the source | Not modelled |
| X5 | Handoff re-request 5000 (`REQUEST_RETRY_AFTER_MS`, `operation-workflow-owner-shared.js:388`) | **W(2) = 6000 > 5000**, and W(3) | The re-request lands inside the first window. A same transferee is ignored with no reset. A different one resets the window (B5) | **Not modelled. New** |
| X6 | Ready lease 15000, renewed every 5000 (`src/constants/time.js:5-6`); heartbeat attempt 6000 (SI §3.5) | A single window > ~12000 (SI T6). **Or a chain of retargets of any length** (B5) | Ready lease expires, and the node is not ready (the formation-blocker family) | Not modelled |
| X7 | Persistence admission: poll 10, bound 120000 (`ROC:140-143`); partition legal hold 60000 (`control-plane/timeout-budget.js:21` via `partition-service-durability-fitness.js:27-28`) | Any open transaction on the leader during the window | The window freezes in ticks and stretches in wall time. A command queued behind a paused Ready waits ≤ 120 s | Listed. B1 corrects what it can do to a decision |
| X8 | Recovery retry window = W (`raft-rs-runtime-tuning.js:52-53`; `RO:235-237, 257-263`) | The transferee is held within its window | Deliveries are dropped (`RO:1394-1396`), so no MsgTimeoutNow is taken, and the transfer aborts at W_leader (B13) | Leader side: SI. **Transferee side: not modelled** |
| X9 | STEP_DOWN deliver timeout 5000 (`messageTimeoutMs`; SI §3.6) | The queue wait plus the transfer turn's awaited sends exceed 5000. **Equality case:** the transferee is connected but unresponsive, so the inner ack wait is also 5000 (B14) | The caller gets null. The transfer is stepped and may still complete | SI T5, plus the equality (B14) |
| X10 | Probe ticks (`RO:1104-1119`, `HEARTBEAT_TICK` 3, `raft-rs-group-constants.js:15`), from learner-promotion proof requests (`partition-service-learner-promotion-proof-methods.js:161-167`) | ⌈et/3⌉ probes during one window: 17 at index 0 | Early abort, so proposals are accepted sooner than W | **Not modelled. New** (B3) |

## 3. Question 3: interleavings the model does not cover

1. **A message arriving while the core is mid-Ready.**
   - On the normal path this cannot happen. Deliveries go to `group.inbound` (`RO:1397`), and the next envelope is stepped only after the previous envelope's whole drain has resolved (`RO:1245-1247`). The command's step comes only after `drainInbound` finishes.
   - **The only in-turn path into a mid-Ready core is the nested re-entry (B7).**
   - The model's T3 should name this as the one exception, not assert "a turn is a unit".
2. **A transfer racing a conf change being applied.** The per-case detail is in the list below.
   - Application runs inside `finishReady` after the sends (`RO:846-851`).
   - A decision in the same turn always follows complete application, and a queued decision waits behind a paused Ready (K4).
   - So a decision sees committed-but-unapplied configuration only through B7, or through B1's mutation.
   - Across turns every case reduces to a drop, an abort, or a message-driven outcome, and the oracle can compare all of those exactly.

   Per case:
   - The transferee's removal is committed during the window: raft-rs aborts it (raft.rs:2728-2733). The oracle's `MsgAppendResponse`/NAMED scenario covers this.
   - A conf change is proposed during the window: it is dropped (D4, covered).
   - A conf change is proposed but not committed when the transfer is asked for: raft-rs transfers anyway. The transferee holds the uncommitted conf entry, because it is caught up to the last index. `hup` counts only committed-unapplied conf entries (raft.rs:1529-1561), so the campaign proceeds. **Cell missing:** D1 × a pending, uncommitted conf entry. Its observation must include the resulting ConfState.
   - A demoted-to-learner leader (SI §4.1).
3. **A second transfer while the first is in progress** (B5).
   - Local retarget: the port steps 13 again.
   - Forwarded: a pending type 13 from a follower.
   - Rebalancer pairs: the cure's source-then-target sequence (`user-table-leader-placement-cure.js:426-432`), and priority-publication's two branches.
   - The scaffolding has type 13 only × D3 and D4. The cells D1 × pending 13 (same and different transferee) and D2 × pending 13 are missing.
4. **A tick crossing `electionTick` in the same turn as the decision.**
   - Scheduled ticks cannot do this: each is its own queued turn.
   - Probe ticks can. `driveOneHeartbeat` ticks up to 3 times inside a D6 turn (B3), so a transfer can abort inside a probe turn.
   - No D1-D4 turn ticks.
5. **Persistence admission closing or opening mid-turn** (B1).
   - Closing mid-turn: the turn waits at the next K4 (≤ 120 s). It **cannot** reach the decision while closed. `READY_DEFERRED` (`RO:906-908`) is unreachable in a command turn after an await.
   - Opening mid-turn: irrelevant. A closed gate refused the command at entry (`RO:1254-1257`), so no turn was running.
   - What is left is **delay**: X7 and X9.

## 4. Question 4: nondeterminism

- **The core's only random input** is the follower election timeout: `rand::thread_rng` at raft.rs:2810, through `getrandom` with `js` (`vendor/raft-rs-wasm/Cargo.toml:20`). A grep of the crate finds no other `rand::` use.
- **Iteration order is deterministic.**
  - raft-rs maps and sets use `FxHasher` (raft-0.7.0 `lib.rs:602-604`), so `status.progress` order and message order within a Ready follow deterministically from the same ids and history.
  - JS `Map`s are insertion-ordered.
  - D2's ranking is a total order: matched descending, then id ascending (`raft-rs-leadership-transfer.js:106-113`). It is order-independent in any case.
- **Harness-level nondeterminism: none besides the timeout.** Sends are synchronous, delivery order is the driver's loop, and the clock is frozen.
- **Consequence for the model.** In ORACLE, any A/B difference other than one caused by a timeout-driven election inside the observation window is a **real** red. §1.4 must state this as a **closed list**, so that "nondeterminism" cannot be cited to excuse a difference.
- **Production-only nondeterminism.** None of it is in the harness, and it matters only when B8's axes are added:
  - ack latency and completion order of the sequential sends (K3);
  - the positions of tick turns relative to commands in the queue (B4);
  - rebalancer jitter of ±25% (`rebalancer-planning-gate-methods.js:60-66`);
  - the number of A3 attempts;
  - the stagger ranges, which overlap on rs-raft (SI §3.1): index 1 [3500, 7000) and index 2 [6000, 12000). Split votes are therefore possible, and the class comparison must allow more than one term bump.
- **Class comparison hides real differences.** See B10.

## 5. Question 5: is the reference run like-for-like in time?

- **In the harness, yes.**
  - Both runs sit at virtual t = 0 with zero ticks before the request (DRIVER `:146-150`; ORACLE `:339-362`).
  - B's extra READ_STATUS turn reads only `status` and `conf_state`. It evaluates `forgetExpiredRecovery` against a frozen `now` (`RO:636-641`), which crosses no boundary.
  - Both runs tick exactly `electionTick()` rounds after the request.
- **In production, "process first" is not the harness's B.** It is a separate earlier turn (scheduled drain or tick), and ticks, commands and listener actions can sit between it and the decision.
- **The harness B is the right definition of the claim's reference:** processed with nothing else in between. The model should say so, so that nobody compares against a production-shaped B.
- **The time model hides reachable classes and has an equality boundary.** B8 and B9 explain how.
- **Vacuity.** See B12.

## 6. Findings, evidence and amendments

### B1. The admission gate is re-verified after every in-turn await (correction of T4, open question 4, round-1 non-blocking 2)

**Evidence**
- `perform` checks `persistenceAdmitted` once at entry (`RO:1254`).
- Every await inside a drain is a send batch (`RO:842-846`, `:869-870`). Each is followed by `whenPersistenceAdmitted`, which polls until ADMITTED before it runs the continuation (`raft-rs-persistence-admission.js:41-69`).
- Reconstruction checks admission before it starts (`RO:609-612`).
- From the resolution of the last K4 to `performCommand` there is only a microtask chain (`thenMaybe`, `RO:696-699`, `:919-920`, `:1245-1247`). A user session's BEGIN arrives as a macrotask, so it cannot interleave there.
- **So the decision always runs with admission open.** `READY_DEFERRED` at `RO:906-908` is reachable in a command turn only in two ways:
  - (a) synchronous code inside the chain closes admission, that is listener or application code, which I found none of;
  - (b) `replaceRuntime` resumes *other* groups outside their queues (`RO:521-529`), which is exclusion 4.

**Consequences**
- Round-1 non-blocking 2 says the command "still enters the core". It does, but only after admission is re-verified.
- Its stated consequence, `transfer-requested` answered with a deferred Ready, is **unreachable**.
- The residual is delay: X7 and X9.

**Kind:** a correction of an existing dimension. It is not a new mechanism.

**Amendment**
- In T4, mark I11 "closed by construction". Record the invariant: "no core entry after a macrotask boundary inside a turn without an admission check (`RO:846`, `:870`, `:609`)".
- Add mutation **F9b**: remove the `:846`/`:870` re-check.
- Make it load-bearing with one oracle axis: **BEGIN on the requester's database during an in-turn send await** (B8's async send mode).
  - On production, the PENDING run waits and then equals PROCESSED.
  - Under F9b, PENDING answers accepted with a deferred Ready while PROCESSED is refused at the gate, so the oracle goes red.
- Open question 4's answer: it is the same class, but unreachable. Keep it as an invariant, not as a cell.

### B2. A third temporal state: processed by the core but not yet announced (new temporal relationship)

**Evidence**
- Role, leader and term events are emitted only by `announce`, at the end of a drain chain (`RO:901-903`, `:940-961`).
- In production each send awaits the peer's ack, one message at a time (`RO:774-783`; `websocket-transport.js:606-626`), for up to 5000 ms per message (`transport.js:74`).
- A slow but connected peer costs 5000 ms per Ready until the connection is quarantined after two ack timeouts (`transport.js:75`).
- Throughout that span:
  - `readStatus` answers the **pre-turn** `statusObservation` (`RO:1034-1051`);
  - `service.role`, the tracked role and `leaderId` hold the pre-turn values (SI §2).

**Consequence:** the model's T1 (pending) / T2 (processed) split misses T2b, "processed and unannounced".

**Who is affected**
- D1-D4 are not: they read the core fresh.
- A1/M3 (the handler's branch), A2/M5 (admission NOT_LEADER or ALREADY_MEMBER) and M2 (the partition write gate) decide on T1 **or T2b** state. Their results differ from process-first. Examples:
  - The source handler's role no-op answers COMPLETED while the core already leads.
  - An admission is skipped as NOT_LEADER while the core already leads.
  - A demoted core still admits a conf change, which a follower then forwards to its leader.

**Kind:** a new temporal relationship. It extends F2, "cached state", from runtime caches to partition projections.

**Amendment**
- Add a row **T2b** to §5. Its staleness bound is: pending inbound + Σ(awaited sends of in-flight Readies) + queued turns.
- Exclusion 1 must then say one of two things, and it is an owner decision:
  - either A1/A2/M2 are **outside** the claim because they are pre-existing projection readers with named owners, so production violates the property there by design;
  - or they are inside, and production fails.
- F1 does not introduce the projection. But F1's transfer is now what the handler's branch gates, so the decision is live.

### B3. Probe ticks run inside a turn (correction of T5)

**Evidence**
- `probePeerProgress` → `driveOneHeartbeat` calls `tick` up to `HEARTBEAT_TICK` = 3 times inside one queued turn (`RO:1104-1119`; `raft-rs-group-constants.js:15`).
- On a leader each tick increments `election_elapsed`. On reaching `election_timeout` it aborts a running transfer (raft.rs:1100-1109).
- Probes come from learner-promotion proof requests (`partition-service-learner-promotion-proof-methods.js:161-167`), so they coincide with REPLACE, the same operation that issues handoffs.

**Arithmetic:** k probes shorten a window to `(et − 3k)·tick`. At index 0, 17 probes during one 1000 ms window end it at once.

**Kind:** an instance of the tick event. The model's statement "no tick interleaves a turn" is wrong for D6.

**Amendment**
- Add a §4.2 event row: "probe ticks (in-turn, D6)", which changes I6 (abort) and sends heartbeats.
- Replace T5's sentence with: "scheduled ticks are queued turns; probe ticks are in-turn core ticks".
- Put the shrink term into the Phase 6 W_wall formula (§2.1).
- No new oracle cell is needed, because D6 is not one of the claim's decisions. A D3-after-probe case is the ordinary D3 × tick class.

### B4. The core clock is not the wall clock (new factors on T5)

**Evidence**
- Ticks are enqueued unconditionally on the port's `setInterval` (`raft-rs-operation-port.js:216-219`) and queue behind a stalled turn (`RO:686-693`). The queue has no bound and does not coalesce ticks.
- A stall of S ms therefore produces S/20 tick turns, which run back to back afterwards.
- Ticks are **refused**, and lost, while admission is closed (`RO:1254-1257`).
- `setInterval` fires are lost under event-loop starvation (SI §3.7).

**Consequences**
- W_wall is given by §2.1.
- A decision's position relative to the abort tick is its **enqueue position** among tick turns, not its wall time.
- The A3 budget crossing (X1) is reachable at index 0 when W_wall > 2000. The model and round 2 place it only at index ≥ 1.

**Kind:** new factors inside an existing timing contract.

**Amendment**
- Replace nominal W with W_wall in the Phase 6 table.
- Add a Phase 6 boundary row: "index 0, user transaction held ≥ 1000 ms inside the window → write `deferRetry`". This is an A3 anchor variant, not an oracle cell.
- Record for the runtime owner (pre-existing): tick turns are neither bounded nor coalesced.

### B5. Second transfer and re-request cadence (instance plus a new crossing)

**Evidence**
- raft-rs `handle_transfer_leader` treats a repeat request by transferee:
  - the same transferee is ignored, with no reset (raft.rs:1889-1898);
  - a different transferee aborts the running transfer and restarts, resetting `election_elapsed` (raft.rs:1899-1906, :1923-1925).
- A follower forwards type 13 to its leader. With no known leader it drops it (raft.rs:2339-2347).
- The port cannot see `lead_transferee` (I6). Its answer is `transfer-requested` whether raft-rs ignored the request or retargeted.

**Crossing X5:** `REQUEST_RETRY_AFTER_MS` = 5000 < W(2) = 6000, and W(3) = 8500.
- A re-issued handoff lands inside the first window.
- The rebalancer's two legs name different successors: X, the most caught-up voter, and T, the placement target. X = T only by chance. In a quiet group, ties break to the lowest raft id (`raft-rs-leadership-transfer.js:106-113`).
- Alternating X and T legs, re-issued within W, reset the window every time. `lead_transferee` then never clears.
- Every proposal is dropped, so every write gets `deferRetry` at 2000 ms, and ready-lease renewals fail once the hold exceeds ~12000 ms (X6).

**Kind:** an instance of round-1 non-blocking 3 and 6 and design S14, plus a new timing crossing (X5) that the model does not list.

**Amendment**
- Add a §4.2 event: "a second type-13 at the leader (a local step or a forward), with the same or a different transferee".
- Add its output: "window reset: yes or no". I6 is hidden, so measure it as the interval during which proposals are dropped.
- Add oracle cells:
  - D1 × pending type 13, same transferee;
  - D1 × pending type 13, different transferee;
  - D2 × pending type 13.
  PENDING must equal PROCESSED, including the **observed window**, meaning which transferee is leading one window later.
- Add X5 to Phase 6.
- The liveness hazard is for the rebalancer owner, outside the claim.

### B6. A failure answered after the effect was taken (new output dimension, the inverse of F7)

**Evidence**
- **Transfer:** after the step, a later failure in the same drain replaces `accepted` (`RO:1178-1179`) while MsgTimeoutNow may already have been sent (SI §4.2). The sites are:
  - application (`RO:827-830`);
  - light persistence (`:856-862`);
  - the Ready drain bound (`:891-896`).
- **Write (new here):** a propose whose first Ready was persisted (`RO:914`) and sent (`:842-845`), and then fails later in the drain, answers HOST_FAILURE with `recoveryRequired: true`.
  - `portDeferralOf` rejects that answer (`write-commit.js:53-58`), and `assertRaftOperationSucceeded` throws. The proposal is recorded REFUSED (`:171-173`).
  - The answer is `CONSENSUS_HOST_FAILURE` (`partition-write-kernel.js:332-338`, `:345`). **Not** OUTCOME_UNKNOWN, which is reserved for CORE_FATAL (`:350-353`).
  - The entry is durable and was sent, so it can still commit after reconstruction.
- The handler's comment "anything else is REFUSED ... and nothing changed" (`replica-handler-leader-handoff-methods.js:65-68`) is false for this case.

**Kind:** a new output dimension. It is outside pending-vs-processed, and pre-existing.

**Amendment**
- Add to §1.3 the output "answer class versus whether the effect was taken, meaning the step or the entry was persisted and sent".
- Add mutation family **F12**: "failure answered as nothing-changed after the effect".
- Record it for the write-path and runtime owners. The F1 claim does not need a cell for it.

### B7. The nested re-entrant turn: reachability in time (instance of challenger A and SI M10)

**Evidence: why it nests**
- `enqueue` sets `group.tail` only **after** `run()` returns (`RO:671-684`).
- So an announce reached before the turn's first await runs listener `readStatus` calls with `tail === null`. With inbound non-empty, that makes a **nested synchronous** perform (`RO:1039-1044`).
- The comment on `withinGroup` (`RO:659-661`) says a re-entrant read "answers from the group's state". With pending inbound it does not.

**Reachability**
- **Harness:** whenever a listener reads status, because sends are synchronous (`CLUSTER:153-160`).
- **Production:** only if the Ready chain up to the announce made no async send. That means the Ready had no messages, or every one of its sends failed synchronously. An unreserved peer's address resolution throws (`raft-rs-operation-port.js:173-178` → `RO:745-750`).
  - Every role, term or leader change I traced emits a message. Examples: a vote response, a heartbeat or append response, the new leader's appends, TimeoutNow's vote requests.
  - So in production it is **narrow**: during membership changes, when the peers are unreserved.

**The dangerous temporal variant**
- The nested drain goes async mid-way while the outer turn continues synchronously.
- The outer turn then steps envelopes and **decides while the nested Ready is taken but not advanced**. SI notes that `take_ready` overwrites `pending_ready`.
- That is the only path to "decision on committed-but-unapplied configuration". It is also the only path to the transferee's `hup` refusing because of unapplied conf entries (raft.rs:1529-1561).

**Amendment**
- In T3, name "re-entrant turn" as the one exception to turn atomicity, with the reachability conditions above.
- Add an oracle axis: "listener re-entry: off | readStatus on role/leader events", as the production wiring does, crossed with B8's send mode, including "async only from the second envelope on".
- Add a mutation that proves the axis matters: let `readStatusObserved` answer from state whenever `group.entered > 0`, which makes the axis inert.

### B8. The oracle's time model cannot reach the temporal classes (new oracle axes)

**Evidence**
- The virtual clock never advances (DRIVER `:146-150`), so every wall-clock contract is pinned at t = 0:
  - the recovery window: a second failure holds forever, because `now − heldAt` stays 0 (`RO:235-237`, `:257-263`);
  - the admission poll and bound;
  - the A3 budget;
  - the inbound drain retry.
- Sends are synchronous, so no turn ever awaits.
- Timing is homogeneous (`CLUSTER:39-44`: et = 15 for every replica, no jitter). The heterogeneity of production windows (1000/3500/6000) is absent.
- The hooks needed already exist:
  - `sendFor` is read at send time (`CLUSTER:153-160`), so a driver can return promises it releases itself;
  - admission can be closed by a real `BEGIN` on the replica's database (`raft-rs-durable-store.js:188-192`).
- No new tooling is needed.

**Amendment:** add three axes to §6 step 1.
- **Send mode:** synchronous | async, released by the driver | async with one peer that never acks.
- **Clock:** frozen | lockstep, where `round()` advances the clock by one tick length.
- **Timing:** homogeneous | per-index production jitter.

The claim's cells run in every combination whose preconditions hold. T3, B1, B2 (for adjacent decisions, if they are included), B4 and B7-async become constructible.

### B9. The observation window sits exactly on `electionTick` (new, an oracle timing boundary)

**Evidence**
- The oracle observes after exactly `driver.electionTick()` rounds (ORACLE `:357-360`; DRIVER `:157-161`).
- That is the leader's abort tick (raft.rs:1100-1109, reset at :1923-1925). It is **also** the lower bound of the follower's randomized timeout [et, 2et) (raft.rs:2807-2819).
- A follower with no leader and `election_elapsed` 0 at the request campaigns on round 15 with probability 1/15 per run.
- The term and leader in the observation then differ at random. That is a false red under exact comparison, and masking under class comparison.
- The window also uses the first replica's `electionTick` only. With per-index timing (B8) the question "whose timeout?" is ambiguous.

**Amendment:** take two observations.
- **t_exact** = min over live replicas of et, minus 1 rounds. No timeout-driven event can occur, so comparison is exact.
- **t_settled** ≥ 2·max over live replicas of et, plus the rounds for the transfer to complete. The class comparison of B10 applies here.

### B10. "Modulo the class of outcome" hides real differences (correction of §1.4)

**Evidence.** The class "some connected voter leads at a term ≥ t+1, and the old leader follows" is satisfied by all of these:
- (a) the named transferee leads;
- (b) a different voter wins by timeout after the transfer was dropped;
- (c) two elections, which is possible because the stagger ranges overlap (SI §3.1);
- (d) a completed transfer and an aborted one followed by a timeout election.

A PENDING bug that drops the transfer while PROCESSED completes it would pass.

**Amendment**
- The class always includes the exact answer record.
- When the answer is accepted with transferee T, the **named** outcome is message-driven and deterministic: "T leads at exactly t+1". Compare it exactly at t_exact or t_settled.
- A class comparison is allowed only for a declared timeout-driven event, such as a crash of the old leader. Then the class keeps:
  - the set of voters ever leading;
  - an upper bound on the number of term bumps;
  - "no leader regains".
- Make the choice mechanical. A scenario may use class comparison only if two PROCESSED runs differ under exact comparison in some of N repetitions, or it names the timeout event that forces it.

### B11. The nondeterminism list must be closed (tightening of §1.4)

**Evidence:** see §4. The only random input is raft.rs:2810, and FxHasher (raft-0.7.0 `lib.rs:602-604`) makes iteration deterministic.

**Amendment.** §1.4 states: "Legitimate A/B differences in the harness are only those caused by a follower election timeout firing inside the observation window. Every other difference is a red."

The production-only sources listed in §4 enter the model only with B8's axes, and each needs an explicit tolerance.

### B12. Vacuity of the reference run in time (instance of open question 5)

**Evidence**
- For the inputHidden cells (type 13), ORACLE `:401-405` skips the precondition "processing moved an input". If B's drain silently did not happen, A = B holds vacuously.
- B's drain is `readStatus` → `perform(READ_STATUS)`. With admission closed, its gate turns that into an undrained read (`RO:1254-1256`), and nothing is processed. Any future scenario that closes admission, including B1's axis, makes B identical to A.
- A `drainInbound` mutant that defers or drops envelopes for every command changes both runs alike.

**Amendment: a precondition on the core-entry log, independent of status and of `drainInbound`'s answer.**
- PROCESSED: the number of `step` entries between `stepUndrained` and the request equals `delivered`, and the request's first entry is not a `step`.
- PENDING: the first `delivered` entries of the request turn are `step`s. This generalizes the round-3 structural rule from "the first entry" to "every delivered envelope before any status read".
- It catches drop and defer mutants that both runs share. It does not rely on status, so it also covers I6.

### B13. A transferee held by a host failure drops MsgTimeoutNow (instance of "pending at another replica")

**Evidence**
- Inside its retry window a held group drops every delivery (`RO:1394-1396`). The window is the transferee's W (`raft-rs-runtime-tuning.js:52-53`).
- raft-rs re-sends MsgTimeoutNow only on a MsgAppendResponse from the transferee with `matched == last_index` (raft.rs:1811-1820). The appends are dropped too, so it never re-sends.
- The leader aborts at W_leader. The request was answered accepted and has no effect.

**Amendment**
- Exclusion 4 names CORE_FATAL and runtime replacement only. Extend it, or the model, to "the transferee is held (RECOVERY_REQUIRED) during the window".
- If it is in scope, it is an anchor: accepted, and the leader stays within W.
- If it is out of scope, record why: acceptance, not completion.
- Name SI's "pending at another replica" dimension explicitly in §5.

### B14. The STEP_DOWN caller's timeout equals the inner ack timeout (refinement of SI T5)

**Evidence**
- The caller's `deliver` times out at 5000 (SI §3.6).
- The transfer turn's answer waits for the acks of its own Ready: MsgTimeoutNow or MsgAppend to the transferee (`RO:842-846`). For a connected but unresponsive transferee, that ack wait is exactly 5000 (`websocket-transport.js:615-618`; `transport.js:74`).
- The caller's clock started earlier: it includes the network hop, the handler, and the queue wait behind tick turns whose heartbeat Readies also stall on that peer.
- **So the caller always times out first** in exactly the case where the transfer cannot complete. It gets null, and the priority handoff records a failure (`priority-publication-handoff.js:281-283`, per SI).

**Amendment.** Add a Phase 6 row: "caller timeout (5000) ≤ inner ack timeout (5000) + RTT + queue wait: this always crosses when the transferee is unresponsive". It belongs to the rebalancer owner and is outside the claim.

## 7. Consolidated amendments to the model

1. **§5, temporal relationships.**
   - Keep T1 and T2, with T2 defined as the harness reference: processed with nothing in between.
   - Add:
     - **T2b**, processed and unannounced (B2);
     - **T3′**, the re-entrant turn exception (B7);
     - **T4′**, I11 closed by construction, as an invariant plus F9b (B1);
     - **T5′**, W_wall with its stretch and shrink factors (B3, B4);
     - **T6**, a second transfer (same transferee or retarget) inside a window (B5);
     - **T7**, pending at, or held at, another replica (B13, SI §4.4 item 5).
2. **§4.2, events.**
   - Probe ticks (in-turn).
   - A second type-13 at the leader.
   - The transferee held.
   - Tick bursts and lost ticks, as clock events.
3. **§1.3, outputs.**
   - Answer class vs effect taken (B6).
   - Window reset yes or no, measured through the proposal-drop interval (B5).
4. **§1.4.** A closed nondeterminism list (B11), and mechanical rules for when class comparison applies (B10).
5. **§6, the oracle.**
   - Axes: send mode, clock mode, per-index timing, listener re-entry (B8, B7).
   - Two observation points, t_exact and t_settled (B9).
   - The core-entry-log precondition (B12).
   - New cells:
     - D1 × pending 13, same and different transferee;
     - D2 × pending 13;
     - D1 × a pending, uncommitted conf entry (§3 item 2);
     - BEGIN during an in-turn send (B1).
6. **§7, mutations.** Add:
   - F9b, the admission re-check removed (B1);
   - F12, failure answered after the effect (B6);
   - a re-entry mutant that makes B7's axis inert;
   - a drop-or-defer mutant in `drainInbound`, caught only by B12's precondition.
7. **Phase 6 table.** Add X1 (with the stretch factors), X3, X4 (equality at index 0), X5, X6, X8 on the transferee side, X9/B14, and X10, next to SI T1-T9.
8. **Owner decisions.** Under the protocol, only these change the guarantee or an owner boundary:
   - whether A1/A2/M2, the projection readers under B2, are inside the claim;
   - whether a transferee held by a host failure (B13) is inside exclusion 4.

   Everything else is evidence design, or a record for another owner:
   - B5's liveness, for the rebalancer;
   - B6, for the write path and runtime;
   - B4's unbounded tick queue, for the runtime.
