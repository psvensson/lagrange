# Evidence: leadership transfer through the operation port (F1, W1-W3)

Author: Agent A (the evidence author), 2026-09-25. This record describes the evidence. It does not approve it. A fresh verifier attacks it.

- **Frozen production:** e148c13e6. Before this quest the port has no `transferLeadership`.
- **Contract:** `design-f1-step-down-port-2026-09-25.md`, sections 2, 5 and 6 and the lead decisions.
- **Independence:** the witnesses were written without reading the implementer's worktree (`.claude/worktrees/f1-step-down`).
- **Witness files:**
  - `test/raft/raft-rs-backend/transfer-leadership-property.test.js`: the property statement, W0, W1 and W2.
  - `test/raft/raft-rs-backend/transfer-leadership-attack-matrix.test.js`: W3.
  - `test/raft/raft-rs-backend/transfer-leadership-driver.js`: a tick-exact driver over `PartitionNodeCluster`, the contract vocabulary, and the shared assertions.
- **Scratch material:** everything is in the session scratchpad under `f1/evidence/`:
  - `ref/`: the reference export of e148c13e6, with the reference implementation;
  - `reference.diff`;
  - `mutants/`: `mutate.py`, plus one `M*.diff` and one `M*.out` per mutant;
  - `red-e148c13e6.out`;
  - `repeat-{1..5}.out`;
  - `run-witnesses.sh`.

## Property (as written at the top of the property file)

> When a replica of a partition is asked to transfer that partition's leadership to a named voter (or, when no successor is named, to the voter whose log is most caught up), then, if the request is accepted, leadership reaches that voter through the operation port within one election timeout as the core counts it (election tick x tick length). The old leader then holds no leadership, and never regains it while the new leader keeps reaching it. If the request cannot succeed, the port says so as a typed refusal and changes nothing. A transfer the core aborts leaves the leader in place and fit to take writes after that one election timeout.

## How time and truth are read

- **Real ports.** Every peer is a real rs-raft operation port. Each one is what `RaftRsWasmProvider.createPartitionPort` built for a PartitionService-shaped request, through `PartitionNodeCluster`.
- **Frozen clock.** Every port gets one `VirtualTimeSource` that is never advanced, so no runtime timer fires by itself. There are no sleeps and no raised timeouts.
- **A round.** A round is one `tick()` of every live replica, followed by delivery until the transport is quiet. Delivery calls `step()` and then `readStatus()`, which drains without ticking. One round is therefore one tick length.
- **The election timeout** is `tuningOf(<the replica's own timing>).electionTick` rounds. The harness timing gives 15.
- **A crash** cuts the replica off and rebuilds it from its durable record: the in-memory core, including any transfer in progress, is lost. It is not ticked until it recovers. An isolated replica keeps ticking.
- **Oracles.** Every expectation comes from one of these:
  - `readStatus`, the core's own role, term, `leaderId`, `peerId` and `confState`;
  - ids resolved through the backend's `RaftRsPeerIdentityRegistry`;
  - the application's applied commands;
  - the actual-core-entry observer;
  - the binding's own message-type table, parsed from `vendor/raft-rs-wasm/src/lib.rs` (MsgTransferLeader, MsgTimeoutNow) and never written as a literal.

## Witness legs, and their result on e148c13e6

The result column is the result of running the witnesses on e148c13e6 itself (`red-e148c13e6.out`): 0 passed, 24 failed. "Missing method" means `TypeError: ... transferLeadership is not a function`.

| # | Leg | What it asserts | Red on e148c13e6 |
|---|---|---|---|
| W0 | Vocabulary owner | `raft-operation-port-constants.js` exports a frozen `RAFT_LEADERSHIP_TRANSFER_REASON` carrying the seven reasons | Fails on its assertion: the constant is absent |
| W1a | Named, caught-up target | 1. On the leader, answers `transfer-requested` (frozen CORE_OK). 2. The target leads within one timeout, in a later term. 3. The old leader is a follower, and its `leaderId` resolves through the registry to the successor's `peerId`. 4. Over 10 more timeouts, with every replica ticking, the successor keeps leading, the old leader never leads, emits 0 LEADER events, and the term stays the same. 5. A write on the successor commits and a follower applies it | Missing method |
| W1b | Named, lagging target | Same as W1a. The target missed 3 writes; it is caught up and then handed over within one timeout | Missing method |
| W1c | Most-caught-up | The follower with the lower raft id lags and stays cut off. The other follower leads within one timeout, and the laggard does not lead. Then W1a's hold and write | Missing method |
| W1d | Most-caught-up, tie | Both followers are caught up. The lower raft id leads (the design's tie rule) | Missing method |
| W2 | Target-side request | 1. A lagging follower names itself and gets `transfer-forwarded`. 2. It leads within one timeout, at exactly term + 1. 3. The same request on the new leader gets `already-leader`, with the term unchanged. 4. Hold and write | Missing method |
| W3.1 | Non-leader, leader known | `transfer-forwarded`. The target leads within one timeout, at term + 1. Hold | Missing method |
| W3.2 | Non-leader, no leader known | `no-known-leader`, with `retryable: true`. No core `step`, no term moves, nobody leads | Missing method |
| W3.3 | Target is a committed learner | `target-not-voter`. No core `step`, no term moves, the leader stays, and an immediate write commits | Missing method |
| W3.4 | Target reserved but not a member | Same as W3.3 | Missing method |
| W3.5 | Target unreserved | `target-unreserved`, with the same checks as W3.3. The identity is still unreserved afterwards | Missing method |
| W3.6 | Target already leading | `already-leader`, with the term unchanged and a write accepted | Missing method |
| W3.7 | Solo group | `most-caught-up` gets `no-eligible-successor`, with the W3.3 checks. Naming itself gets `already-leader` | Missing method |
| W3.8 | Leader crashes before MsgTimeoutNow leaves | Precondition: the target's inbox is empty. The survivors elect (bounded at 10 timeouts). The old leader recovers as their follower, then the hold | Missing method |
| W3.9 | Leader crashes after MsgTimeoutNow left | Precondition: the target's inbox holds MsgTimeoutNow. The target leads after 0 rounds (it campaigns on MsgTimeoutNow, not on a timeout), at term + 1. The old leader recovers as its follower, then the hold | Missing method |
| W3.10 | Target crashes mid-transfer | 1. `transfer-requested`. 2. An immediate write and a `proposeConfChange` both answer HOST_FAILURE `leadership-transfer-in-progress`, with `retryable: true` and `recoveryRequired: false`. 3. Each round's write answers the same until the first CORE_OK, which comes within one timeout. 4. The leader and term are unchanged | Missing method |
| W3.10b | Window opened by a transfer forwarded over the transport | A MsgTransferLeader envelope (the type parsed from lib.rs) is stepped into the leader, as raft-rs follower forwarding delivers it. Writes then answer the retryable outcome, and are writable again within one timeout | **Fails on its behavioural assertion:** the write answers `{"outcome":"CORE_REFUSED","reason":"propose: raft: proposal dropped","retryable":false}` |
| W3.11 | Transfer with a pending conf change (add learner) | The target leads within one timeout, and its `confState` then carries the learner, so the change was committed | Missing method |
| W3.12 | Committed removal of the transferee | 1. The removal is proposed first, uncommitted. 2. The transfer is `transfer-requested`, and a write answers the retryable outcome. 3. The removal commits in fewer rounds than one timeout. 4. A write then commits at once. 5. The leader and term are unchanged. So the removal aborted the transfer, not the timeout | Missing method |
| W3.13 | Repeated request | 1. Twice while in progress: `transfer-requested` both times. 2. The target leads at exactly term + 1. 3. A repeat on the old leader after completion gets CORE_OK, `already-leader` or `transfer-forwarded`. 4. Hold: the term is still + 1 | Missing method |
| W3.14 | Retarget | C, then B. B leads within one timeout of the second request, at term + 1. C follows B. Hold, and C never leads | Missing method |
| W3.15 | Closed port | Both request kinds answer CORE_REFUSED `closed`. Zero core entries, nothing sent | Missing method |
| W3.16 | User transaction open | HOST_FAILURE `user-transaction-open`, with `retryable: true` and zero core entries. After ROLLBACK the leader and term are unchanged, the target does not lead, and a write commits | Missing method |
| W3.17 | Liferaft partition port | Both request kinds answer frozen CORE_REFUSED `leadership-transfer-unsupported-backend` | Missing method |

## Reference implementation (scratch; not a proposal for src)

`reference.diff` is 165 added lines over six files. The export is `git archive e148c13e6 src vendor test/raft/raft-rs-backend package.json` with node_modules linked.

- **Port methods.** `transferLeadership` joins `RAFT_OPERATION_PORT_METHODS`. `RAFT_LEADERSHIP_TRANSFER_REASON` joins the port constants.
- **Operation port.** It normalises the request through its registry: `target-unreserved`, or an unknown shape. It then dispatches `TRANSFER_LEADERSHIP` inside the lifecycle and closed gate.
- **Runtime owner.** In the queued turn it reads status and conf state, then decides:
  - `no-known-leader` (retryable);
  - `most-caught-up`: highest `matched` among the other voters, ties to the lowest id, or `no-eligible-successor`;
  - `already-leader`;
  - `target-not-voter`.

  Otherwise it steps `{msgType: 13, from: target, to: self}` and drains. It answers `transfer-requested` on a leader and `transfer-forwarded` on a follower.
- **Dropped proposals.** A `propose` or `propose_conf_change_v2` refused with "proposal dropped", while the core is leader and a voter, answers HOST_FAILURE `leadership-transfer-in-progress` with `retryable: true` and `recoveryRequired: false`.
- **Liferaft.** Its port answers the typed CORE_REFUSED `leadership-transfer-unsupported-backend`.

On the reference, the 24 witnesses were green in **5 of 5 consecutive runs** (`repeat-1..5.out`), one process at a time and thermal-gated.

## Mutant table (each planted alone on the reference; `mutants/M*.diff`)

| Mutant | Semantic escape route | Result | Killed by |
|---|---|---|---|
| M1 | Answers Ok without stepping | RED (12/24) | W1a-d, W2, W3.1, W3.9 (precondition), W3.10, W3.11-14 |
| M2 | Steps MsgTransferLeader with `from` = self | RED (11/24) | W1a-d, W3.1, W3.9, W3.10, W3.11-14 |
| M3 | Target-side request answered by `campaign` at the target | RED (1/24) | W2: the lagging target cannot win by campaign within one timeout |
| M4 | Every refusal answered CORE_OK `transfer-requested` (a silent no-op) | RED (5/24) | W3.2, W3.3, W3.4, W3.5, W3.7 |
| M5 | In-progress answered terminal (CORE_REFUSED, `retryable: false`) | RED (3/24) | W3.10, W3.10b, W3.12 |
| M6 | The old leader re-campaigns on its first tick after handing over | RED (5/24) | W1a, W1b, W1c (hold), W3.13, W3.14 |
| M7 | Most-caught-up ignores progress (lowest id wins) | RED (1/24) | W1c |
| M8 | The Liferaft port answers a silent Ok | RED (1/24) | W3.17 |
| M9 | The port holds its own in-progress latch for a full timeout, whatever the core says | RED (1/24) | W3.12: after a committed removal the core has aborted, so the write must commit at once |
| M10 | The transfer skips the open-transaction admission gate | RED (1/24) | W3.16: the core was entered |

The lead's six required mutants are M1 to M6. M7 to M10 are further semantic routes, one each. No syntactic variants were planted.

## Attacks not run, and why

- **CORE_FATAL on a transfer.** This needs the shared core trapped. The fatal path is the port's generic containment, which existing witnesses cover (`runtime-trap-and-restore`, `operation-port-throw-containment`). No transfer-specific route to it was found.
- **Unnamed answers.** These are not asserted because the contract names no answer for them:
  - `most-caught-up` asked of a non-leader;
  - a malformed request (no successor, or no identity).

  The reference answers `no-eligible-successor` and `unknown-successor` respectively.
- **A follower naming the leader it already follows.** The design admits either `already-leader` or `transfer-forwarded`. Only W3.13 touches it, and it accepts both.
- **Joint consensus.** A transfer during an entered joint configuration (ConfChangeV2 enter-joint), and a learner promoted mid-transfer, were not constructed.
- **The new leader stops reaching the old leader.** A regain is then ordinary Raft, and the property excludes it.
- **pre-vote and check-quorum on.** Production tuning fixes both off, and nothing varies them.
- **Out of this deliverable:**
  - W4: the replica handler, `PartitionService.requestLeadershipTransfer` and STEP_DOWN routing;
  - W5: the structural census;
  - W6: the SLO batch.
- **Syntactic variants, deliberately not planted.** These are the refusal-as-Ok and retryable-flag variants for single reasons (for example `no-known-leader` with `retryable: false`, which W3.2 asserts directly), and `already-leader` implemented by a self-transfer step.

## Limits

- **Reference, not implementation.** The reference is my own. A green result on it shows the witnesses can be satisfied by a contract-faithful implementation. It says nothing about the implementer's code.
- **Harness, not production timing.** Delivery is synchronous and in-process, and messages are lost only by isolation or crash. Every live replica ticks exactly once per round, so no clocks drift.
  - The bound is the harness's own election tick (15, from electionMinMs 150 at a 10 ms tick), not the production tuning of 10.
  - "Within one election timeout" means within that many rounds, as the replica's `tuningOf` derives it.
- **The core's randomized election timeouts are not seeded.** Only W3.8 (the survivors' election) depends on them, and it asserts only outcomes that hold for any draw. The 5 of 5 greens bound this; they do not prove it.
- **The hold is finite.** It covers 10 election timeouts of fault-free ticking; it is not an unbounded proof of "never regains".
- **The in-progress window has an upper bound only.** Its end is checked as ≤ one election timeout; equality with the election tick is not asserted. That the window exists is asserted by the immediate retryable answer.
- **"Nothing stepped" is read from the actual-core-entry observer.** No `step` entry is allowed during a refused call. `status` and `conf_state` reads are allowed.
- **W0 pins a name and a location.** It requires `RAFT_LEADERSHIP_TRANSFER_REASON` in `raft-operation-port-constants.js`, as the design names it. It checks only the seven transfer reasons, not where `leadership-transfer-in-progress` or `leadership-transfer-unsupported-backend` live.
- **Three contract readings are asserted beyond the lead's binding facts:**
  - HOST_FAILURE as the outcome of the in-progress answer, from design section 5;
  - `recoveryRequired: false` on that answer;
  - W1d's lowest-raft-id tie rule.

  If the lead holds any of these not binding, the matching assertion or leg is the one to drop.
- **Answers are awaited.** A port that answers with a promise is accepted. The runtime answers synchronously when idle.
- **The Liferaft leg checks the answer only.** It builds the retired backend with a stub durable log.

## E0 gates (on the evidence worktree, e148c13e6 plus the three new files)

- `eslint` on the three files: clean.
- `npm run -s test:duplication`: OK. src+scripts 56/56 groups and 1815/1815 lines; test 791/791 groups and 30451/30451 lines.
- `node scripts/check-fast-static.js`:
  - **With the generated metadata as committed:** FAIL. `audit:shards` reports the two new test files as unclassified, and `audit:impact-contracts` fails its primary-classification check as a result.
  - **After `npm run -s test:metadata:refresh`:** ok. Both new test files classify as `unit`, and `audit:shards` and `audit:impact-contracts` pass.
  - **Restored.** The four generated files (`test/shards/{impact-graph-seal,primary-classes,resource-classes,subsystem-classes}.json`) were put back to HEAD, for the lead to regenerate on commit.

## Round 2 (evidence only), 2026-09-25

Author: Agent A (the evidence author). This section responds to `verification-round-1.md` (REJECT on the evidence only). Round 1 above stays as written.

- **Frozen production:** bc8e1118d. The evidence worktree is at 88b1bfb22, and `git diff bc8e1118d 88b1bfb22 -- src` is empty.
- **The implementation is now visible.** I read it to name the sites. The new witnesses are still written from the property.
- **Nothing under `src/` changed, and I made no git writes.**
- **Scratch material:** the session scratchpad under `f1/evidence/`:
  - `r2/prod/`: an export of 88b1bfb22 with the round-2 witnesses;
  - `r2/mutants/`: the verifier's `mutate.py` and `run.sh`, one `<M>.<witness>.out` per mutant, and `catalogue.txt`;
  - `r2-prod-repeat/`: the 5 runs on production;
  - `r2-ref-mutants/`: the round-1 reference mutants.

### Files

- **New: `test/raft/raft-rs-backend/transfer-leadership-decision-inputs.test.js`.** Three legs on what the port decides from.
- **New: `test/partition/partition-write-leadership-transfer-committed.test.js`.** A write served during a transfer is a committed write. The implementer's `partition-write-leadership-transfer.test.js` is not edited.
- **Changed: `test/raft/raft-rs-backend/transfer-leadership-driver.js`.** It adds `deliverOnly(replicaIds)` and `stepUndrained(replicaId)`. The second hands envelopes to a port's `step()` without the runtime processing them, so a request can meet delivered but unprocessed messages. Every existing method is unchanged.

### New legs

| Leg | Semantic route | What it asserts | Production (bc8e1118d) | Kills |
|---|---|---|---|---|
| R2.1: a transfer meets delivered but unprocessed messages | The check and the step in different turns | 1. C is cut off and the leader A proposes REMOVE_PEER C. 2. B processes the append, and its acknowledgement is handed to A's `step()` but not processed (precondition: A's ConfState still names C). 3. `transferLeadership(named C)` answers `target-not-voter`. 4. The core's `step` entries during the call equal the delivered count, so nothing but the delivered messages was stepped. 5. A's ConfState now lacks C, so the removal committed in that turn. 6. A still leads, the term is unchanged, and an immediate write commits | green | MD: `{"outcome":"CORE_OK","reason":"transfer-requested"}` |
| R2.2: most-caught-up with a learner ahead of every voter | Most-caught-up picks a learner | 1. A real learner replica is committed. 2. The voters B and C are cut off while A appends three entries only the learner receives (precondition: the learner's `followerProgress` exceeds every voter's). 3. `most-caught-up` answers `transfer-requested`. 4. A write then answers HOST_FAILURE `leadership-transfer-in-progress`, so the core really runs a transfer. 5. After B and C heal, a voter leads within one election timeout in a later term. 6. The learner never leads, and A has stepped down | green | ME2: the write answers `{"outcome":"CORE_OK","reason":"drained"}`, meaning no transfer runs |
| R2.3: a self-removed leader drops a proposal | The in-progress answer given for a drop with another cause | 1. A's REMOVE_PEER A commits (precondition: A has left the voters and raft-rs keeps it leading). 2. A write on A answers CORE_REFUSED, its reason is not `leadership-transfer-in-progress`, and it has `retryable: false` | green | MH2: `{"outcome":"HOST_FAILURE","reason":"leadership-transfer-in-progress","retryable":true}` |
| R2.4: a write served during a transfer is committed | The deferral answered as success without a commit | 1. Real PartitionServices on rs-raft (`formAdmittedGroup`). 2. The leader asks its own port `transferLeadership(named r3)`, with r3 cut off and unscheduled, so the transfer can only abort. 3. A write is issued in the window. 4. The answer has `success: true`. 5. The row is in the leader's table. 6. `answer.logIndex` names a position in the leader's durable `_raft_rs_log`, read on the test's own connection, that decodes to this write's `entryId` and is at or below the durable commit index. 7. The reached follower applies the row. 8. The write was proposed more than once (the actual-core-entry observer), so it did meet the window. 9. The leader and term are unchanged | green | MI1: `the served row is in the leader's table` fails, with `undefined` |

On e148c13e6 (`r2-base-*.out`):

- R2.1 and R2.2 fail on the missing method.
- R2.4 fails at module link, because `RAFT_LEADERSHIP_TRANSFER_REASON` is not exported.
- **R2.3 is green.** It is a negative leg for a classification that e148c13e6 does not have: its raw `retryable:false` refusal is already the correct answer. R2.3 is not red-first. Its discriminating power is shown by MH2.

### The verifier's catalogue, all 16 mutants

The run is `r2/mutants/run.sh`. It is the verifier's run.sh with only `V` changed and the two round-2 files appended to its FILES. The mutants were planted in an export of 88b1bfb22 with the verifier's own `mutate.py`, whose substitutions are unchanged.

Labels in the "Killed by" column:
- h-already, h-main: the two rewritten replica-handler test files;
- handler, write-path, pwrite, census: the implementer's new witnesses;
- property, attack-matrix: my round-1 files;
- decision-inputs, committed: my round-2 files.

Production (`PROD`) is rc 0 on all ten files.

| Mutant | Route | Killed by (rc 1, failures) | Round 1 |
|---|---|---|---|
| MA | Ok without a step | property 5, attack-matrix 7, handler 2, write-path 1, decision-inputs 1, committed 1 | killed |
| MB | Wrong `from` | property 4, attack-matrix 7, handler 1, write-path 1, decision-inputs 1, committed 1 | killed |
| MC1 | Refusal answered Ok (decision) | attack-matrix 2, decision-inputs 1 | killed |
| MC2 | Refusal answered Ok (handler) | h-already, h-main | killed |
| **MD** | **Validation before the inbound drain** | **decision-inputs 1 (R2.1)** | survived |
| ME1 | Most-caught-up picks the least caught up | property 1 | killed |
| **ME2** | **Most-caught-up includes learners** | **decision-inputs 1 (R2.2)** | survived |
| MF | Closed-port bypass | attack-matrix 1 | killed |
| MG | User-transaction bypass | attack-matrix 1 | killed |
| MH1 | In-progress without the role check | write-path 1 | killed |
| **MH2** | **In-progress without the membership check** | **decision-inputs 1 (R2.3)** | survived |
| **MI1** | **Deferral answered success in the retry loop** | **committed 1 (R2.4)** | survived |
| MI2 | Deferral answered success at budget exhaustion | survives: unreachable (below). **Corrected in round 3: reachable, and now killed by R3.10** | survived |
| MJ1 | Handler bypasses the partition authority | h-already, h-main, census 1 | killed |
| MJ2 | Target branch uses `campaign` | h-already, h-main | killed |
| MK | Liferaft answers a silent Ok | attack-matrix 1, census 1 | killed |

Every blocking mutant is now red, and each is killed on the property assertion named in the table of new legs, not on setup.

**MI2 is recorded, not chased.** *(Corrected in round 3. The reasoning below is wrong for production's default timing: see "Round 3, correction: MI2 is reachable".)*
- It changes only the site where a write is still deferred once the whole deferral budget has run out.
- A single transfer's window is at most one election timeout (the core aborts it). The implementer's `partition-write-leadership-transfer.test.js` (pwrite) asserts that this timeout is less than `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`.
- So no single-transfer scenario reaches the site.
- Reaching it would take back-to-back transfers for longer than the budget, or a changed budget. That is a question for the write-path owner, not an F1 route.

### Round-1 reference mutants with the round-2 witnesses

The ten mutants of my round-1 scratch reference were re-run on the three raft-level files (property, attack-matrix, decision-inputs):
- The reference itself: 27/27 green.
- Every mutant is still red: M1 13, M2 12, M3 1, M4 6, M5 4, M6 5, M7 1, M8 1, M9 1, M10 1 failing tests.
- R2.1 and R2.2 additionally kill M1, M2, M4 and M5.
- The partition file (R2.4) cannot run on that reference, because the reference has no partition write-path deferral. It is exercised only on production and on the verifier's catalogue.

### Determinism

- Production (the 88b1bfb22 worktree, src identical to bc8e1118d): 5 of 5 runs green, one process at a time and thermal-gated, with no red to stop at. Each run is property 6, attack-matrix 18, decision-inputs 3 and committed 1 (`r2-prod-repeat/`).
- R2.1 to R2.3 run on the driver's never-advanced virtual clock.
- R2.4 runs on the replicas' own clocks: formation, the scheduled ticks that abort the transfer, and the write path's deferral retry. It adds no sleep and raises no timeout (the test budget is 60 s, as the implementer's sibling uses). Its outcome assertions hold for any schedule. The window precondition (proposed more than once) depends on the first proposal landing inside a window of one election timeout, which it did in 5 of 5 runs.

### Limits (round 2)

- **R2.1 covers one pending-message shape.** The delivered message is an acknowledgement that commits a removal of the transferee. Other messages that would change the decision in the same turn were not constructed, for example a vote or heartbeat of a higher term that demotes the leader, or an append that tells a follower its leader. They go through the same drain-then-decide order, which the leg pins by the count of `step` entries.
- **R2.1 cuts C off on purpose.** A late acknowledgement from the removed C would instead trigger the pre-existing N1 behaviour below.
- **R2.2 accepts either voter.** B and C are equally caught up. The tie rule is pinned only by W1d (round 1).
- **R2.3 checks one other cause of a drop:** a self-removed leader. raft-rs's third cause, the uncommitted-size limit, cannot occur (the binding sets `NO_LIMIT`). The no-leader drop is the implementer's write-path test 3.
- **R2.4 is a single write on real timers.** It does not cover budget exhaustion (MI2), writes on the follower that is cut off, or the membership admission's DEFERRED answer, which the implementer's sibling covers.

### Finding recorded as a limit: the verifier's non-blocking N1 (not F1-specific; owner: the rs-raft runtime owner, R17)

- **Behaviour.** `drainInbound` (`raft-rs-runtime-owner.js:1235-1247`) processes delivered envelopes at the start of a queued command's turn. When the core refuses one of them, it returns that envelope's refusal as the answer to the queued command, and the command never runs.
- **Observed** by the verifier on production: C's acknowledgement arrived after C was removed, and a `transferLeadership` then answered CORE_REFUSED `step: raft: cannot step as peer not found` (phase `step`, not retryable), with nothing stepped.
- **Why it does not violate F1's property.** That answer is still a typed refusal that changed nothing.
- **Why it matters beyond F1.** A queued command can be answered by a refusal that is not its own, and a write can meet a non-retryable refusal for a transient condition.
- **Scope.** It is unchanged by F1: e148c13e6 has the identical code. None of the round-2 legs asserts it, and R2.1 cuts C off to stay clear of it.

### E0 gates (round 2)

- `eslint` on the four evidence test files and the driver: clean.
- `npm run -s test:duplication`: OK. src+scripts 56/56 groups and 1815/1815 lines; test 791/791 groups and 30451/30451 lines.
- `node scripts/check-fast-static.js`, after `npm run -s test:metadata:refresh`: ok. Both new files classify as `unit`.
- The four `test/shards/*.json` files were then put back to HEAD for the lead to regenerate on commit.
- As committed, without the refresh, `audit:shards` reports the two new files as unclassified, as in round 1. *(Stale; corrected in round 3. The round-2 commit d9fa5284e carries the regenerated `test/shards`, and `check-fast-static` is ok on it.)*

## Round 3 (evidence only, class repair), 2026-09-25

Author: Agent A (the evidence author). This section responds to `verification-round-2.md` (REJECT on the evidence only). Rounds 1 and 2 above stay as written; their two wrong statements are marked inline as corrected here.

- **Frozen production:** bc8e1118d. The evidence worktree is at bdfc049c2, whose src is identical to bc8e1118d.
- **Nothing under `src/` changed, and I made no git writes.**
- **Scratch material:** the session scratchpad under `f1/evidence/`:
  - `r3/prod/`: an export of bdfc049c2 with the round-3 witnesses;
  - `r3/mutants/`: the verifier's `mutate.py` and `mutate2.py` with only `V` changed, my own `mutate3.py`, and `run3.sh`;
  - `r3/catalogue-round1.txt` and `r3/catalogue-round2-and-own.txt`: the runs;
  - `r3-prod-repeat/`: the 5 runs on production.

### Why this is a class repair

Round 1's MD, and round 2's X1 and X4, are one mechanism: a decision input read before the turn's drain of delivered messages. Two same-root rejections forbid another single leg (protocol item 10). So round 3 witnesses the class:

> In a turn that begins with delivered-but-unprocessed messages, every decision is taken on the core as those messages left it.

This covers both decisions the port makes from the core's facts: the transfer decision, and the classification of a dropped proposal or configuration change.

### Files

- **New: `test/raft/raft-rs-backend/transfer-leadership-drain-order.test.js`.** The class witness, R3.1 to R3.7.
- **Changed: `test/raft/raft-rs-backend/transfer-leadership-decision-inputs.test.js`.** Adds R3.8 and R3.9, the drop causes on a replica that does not lead. `'leader'` is now read through `RAFT_ROLE.LEADER`.
- **Changed: `test/partition/partition-write-leadership-transfer-committed.test.js`.**
  - Adds R3.10.
  - The shared setup moves into one helper, `withTransferToCutOffVoter`. R2.4's assertions are unchanged.
  - The raft table names come from `RAFT_RS_TABLE`; only normal entries are decoded (`RAFT_RS_ENTRY_TYPE.NORMAL`).

### The class witness: every case pairs a structural leg with a semantic leg

**The structural leg is read by order within the turn, not by count.**
- The source is the actual-core-entry observer: every binding call of the turn, in order.
- Delivered messages are handed to the port's `step()` and left unprocessed on the never-advanced virtual clock (`stepUndrained`).
- Two rules apply:
  1. **The turn's first core entry is `step`, the first delivered message.** Nothing, not a `status` and not a `conf_state`, is read before the drain.
  2. **The decision's reads come after the last delivered message's `step`.**
     - For a transfer, the last `status` and the last `conf_state` before the transfer's own `step` both follow it, and nothing but reads lies between them and that step.
     - For a dropped proposal, a `status` and a `conf_state` follow the refused `propose` or `propose_conf_change_v2`: the classification is read after the refusal.
     - For a refused transfer, the last `status` and `conf_state` of the turn follow the last delivered step.

**Observed order on production.** For a named transfer with 2 delivered acknowledgements the turn is:
`step,has_ready,take_ready,persist_ready,conf_state,advance_append,advance_apply,has_ready,status,conf_state,step,has_ready,status,conf_state,status,conf_state,step,…`

The final `status,conf_state,step` is the decision followed by the transfer's step. For a dropped proposal in a transfer window with 1 delivered response it is:
`step,has_ready,status,conf_state,propose,status,conf_state`

| Leg | Input class | Pending (delivered, unprocessed) | Semantic assertion | Structural rule |
|---|---|---|---|---|
| R3.1 | configuration, role | acknowledgements of a write | named C: `transfer-requested` | transfer |
| R3.2 | progress (most-caught-up) | acknowledgements of a write | `transfer-requested` | transfer |
| R3.3 | configuration | acknowledgements of a write | named reserved non-member: `target-not-voter` | refused transfer |
| R3.4 | **role, term, leader** | B's higher-term vote request | not CORE_OK: `no-known-leader`, `retryable: true`. A no longer leads, and its term advanced in that turn | refused transfer |
| R3.5 | drop classification (transfer cause) | B's heartbeat responses inside a transfer window | `propose` answers HOST_FAILURE `leadership-transfer-in-progress` | refused proposal |
| R3.6 | drop classification, conf change | the same | `proposeConfChange` answers the same | refused proposal |
| R3.7 | **drop classification (removal cause)** | acknowledgements that commit A's own removal in the proposal's turn | CORE_REFUSED, not in-progress, `retryable: false`. The removal committed in that turn | refused proposal |

Precondition reads (for example "A leads", or "the removal is not yet committed at A") are taken before the hand-over, because a port's `readStatus` drains delivered messages itself.

### The drop causes on a replica that does not lead (X3)

The route is bounded by raft-rs's own drop causes on a non-leader:
- `step_candidate` drops a proposal;
- `step_follower` drops one when it knows no leader, and forwards it when it knows one;
- a pre-candidate cannot arise, because production tuning leaves pre-vote off.

| Leg | Scenario | Assertion |
|---|---|---|
| R3.8 | B is cut off and campaigns (precondition: `role` is `RAFT_ROLE.CANDIDATE`) | its dropped proposal is CORE_REFUSED, not in-progress, `retryable: false` |
| R3.9 | a fresh group, with no leader known (precondition: `leaderId` is null) | the same |

A removed leader (R2.3) and a leader in a transfer window (W3.10) cover the leader side.

### Round 3, correction: MI2 is reachable (R3.10)

Round 2 said that no single transfer reaches the budget-exhaustion site. That holds only for the test timing. Under production's defaults the window is longer than the budget:
- the election timeout floor is `LIFERAFT_ELECTION_MIN_DEFAULT_MS` (1000 ms);
- `ELECTION_JITTER_PER_REPLICA_MS` (2500 ms) is added per replica index;
- the deferral budget is `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS` (2000 ms).

**R3.10's setup:**
- The leader's timing is derived by `computeReplicaElectionTimeouts` from those owner constants for a replica at index 1: 3500 to 5500 ms. No literal is used.
- Precondition: `recoveryRetryWindowMsOf(leader.raftTimingConfig)` exceeds the budget.
- The transfer targets a voter that is cut off, so it can only abort, one election timeout later.

**R3.10's assertions:**
- A write issued in the window answers `success !== true` and `deferRetry: true`.
- Its row is not in the leader's table, and no normal entry of the leader's durable raft log carries its `entryId`.
- It met the window: it was proposed more than once.
- Once the leader takes writes again (a later write is served after the abort), the deferred write's row and log entry are still absent, so it was not proposed again behind its answer.
- The leader and term are unchanged.

On production it answers deferRetry after about 2 s, and the test takes about 3.7 s. On MI2 it answers `{"success":true,…}`, which is red.

### Catalogue 1: round 1's 16 mutants, with the 11 witness files

- **Planting:** the verifier's `mutate.py`, with only `V` changed.
- **Run:** `run3.sh`, which is the verifier's round-2 `run2.sh` with `V` changed and its probe file replaced by `transfer-leadership-drain-order.test.js`. So no column below is the verifier's probe.
- **Production** is rc 0 on all 11 files.
- **Columns:** the 11 files are h-already, h-main, property, attack-matrix, handler, write-path, pwrite, census, decin (decision-inputs), committed and drain (drain-order).

| Mutant | Killed by (rc 1, failures) |
|---|---|
| MA | property 5, attack-matrix 7, handler 2, write-path 1, decin 1, committed 2, drain 4 |
| MB | property 4, attack-matrix 7, handler 1, write-path 1, decin 1, committed 2, drain 2 |
| MC1 | attack-matrix 2, decin 1, drain 1 |
| MC2 | h-already, h-main |
| MD | decin 1, drain 4 (rule 1: the turn opens with `status,conf_state`) |
| ME1 | property 1 |
| ME2 | decin 1 |
| MF | attack-matrix 1 |
| MG | attack-matrix 1 |
| MH1 | write-path 1, decin 2 (R3.8, R3.9) |
| MH2 | decin 1, drain 1 |
| MI1 | committed 2 |
| **MI2** | **committed 1 (R3.10: `a write never committed is not served ({"success":true,…})`)** |
| MJ1 | h-already, h-main, census 1 |
| MJ2 | h-already, h-main |
| MK | attack-matrix 1, census 1 |

All 16 are red.

### Catalogue 2: the verifier's round-2 route mutants (`mutate2.py`) and my own

| Mutant | Route | Killed by | Failing assertion |
|---|---|---|---|
| X1 (MD2) | status read before the drain (configuration fresh) | drain 4 | R3.1 to R3.3 on rule 1 (the turn opens with `status`); R3.4 semantically (`{"outcome":"CORE_OK","reason":"transfer-requested"}`) |
| X2 (ME3) | non-learner judged against `learnersNext` | decin 1 | R2.2 |
| X3 (MH6) | a candidate's drop counted as a leader's | decin 1 | R3.8 |
| X4 (MH5) | classification inputs read before the drain | drain 3 | R3.5 and R3.6 on rule 1 (`status,conf_state,step,…`); R3.7 semantically (`HOST_FAILURE leadership-transfer-in-progress`) |
| X5 (MI3) | the served answer names another log index | committed 1 | R2.4 |
| X6 (MI4) | served before commit, at a predicted index | committed 1 | R2.4 |
| **X7 (mine)** | **a different input through a core read:** most-caught-up ranks the `progress` of a `status` read before the drain; role, term and configuration stay fresh | drain 1 | R3.2 on rule 1 (the turn opens with `status`). No semantic leg sees it: equally acknowledged voters rank the same either way |
| **X8 (mine)** | **the same class with no core entry:** the transfer is decided on the runtime's cached `lastStatus`, captured before the drain | drain 1 | R3.4 semantically (`{"outcome":"CORE_OK","reason":"transfer-requested"}`). No structural rule can see it, because nothing is read from the core before the drain |

- **Every mutant is red.** None was judged equivalent.
- **X7 and X8 are why the pairing is needed.** X7 is visible only structurally, and X8 only semantically.
- **My first plant of X7 was inert.** It tested `command.successor` where the runtime command carries `command.transfer.successor`, so it survived as a no-op. After the fix (`mutate3.py`) it is red. It is recorded because an inert plant can look like a surviving mutant.

### Round-1 reference mutants

These were not re-run in round 3. The round-3 witnesses need the partition write path and production's runtime vocabulary, which my round-1 scratch reference does not have. Their round-2 result stands: all ten were red on the raft-level files. Round 3 changed only additively the files those results were measured on (property and attack-matrix are unchanged; decision-inputs gains two tests).

### Determinism

- On production (the bdfc049c2 worktree), 5 of 5 runs were green, one process at a time and thermal-gated, with no red to stop at. Each run was property 6, attack-matrix 18, decision-inputs 5, drain-order 7 and committed 2 (`r3-prod-repeat/`).
- R3.1 to R3.9 run on the never-advanced virtual clock.
- R3.10 runs on the replicas' own clocks, like R2.4. It adds no sleep, and its outcome assertions hold for any schedule.

### Limits (round 3)

- **The structural rule sees core reads only.** A decision taken on state cached before the drain, with no core entry (my X8), passes it. The semantic legs carry that route: R3.4 for role, term and leader; R3.7 and R2.1 for configuration. There is no semantic leg for cached progress, because most-caught-up would need unequal progress created by the pending messages themselves. That route is witnessed structurally only (X7). *(Wrong; corrected after round 3. A semantic leg for cached progress is constructible: one follower's acknowledgement pending at the leader creates the unequal progress, as the verifier's P-a showed, and the verifier's Y1, cached progress with no core read, survived. The differential oracle below has that cell: the most-caught-up × MsgAppendResponse unequal-progress cell kills Y1.)*
- **The structural rule identifies the decision's reads by position**, as the reads right before the transfer's step or right after the refused proposal. An implementation that legitimately interleaved other core calls there would need the rule restated. Production's order is recorded above.
- **The rule pins order within one turn.** It does not cover a decision spread over two turns (for example, a read in one command and a step in a later one). No such path exists in production, where decide and step are one synchronous block.
- **R3.4 covers one higher-term message** (a vote request). An append or heartbeat of a higher term takes the same drain-then-decide path and was not constructed. *(Y2, which drains an append or heartbeat only after the decision, survived. The oracle's MsgAppend and MsgHeartbeat stale-leader cells now kill it.)*
- **Pre-candidate drops are unreachable** under production tuning (pre-vote off), and are not witnessed.
- **R3.10 covers one timing derivation**, production's replica at index 1. The adaptive IDLE profile (a 3000 ms minimum) was not constructed. It covers a single write; the router's retry after the deferral is outside the port.
- **N1 is unchanged** (recorded in round 2): a stale delivered-message refusal can answer a queued command. The round-3 legs keep clear of it: no removed peer's message is pending in them.

### E0 gates (round 3)

- `eslint` on the five evidence test files and the driver: clean.
- `npm run -s test:duplication`: OK. src+scripts 56/56 groups and 1815/1815 lines; test 791/791 groups and 30451/30451 lines.
- `node scripts/check-fast-static.js`, after `npm run -s test:metadata:refresh`: ok. The new drain-order file classifies as `unit`.
- The four regenerated `test/shards/*.json` files were then put back to HEAD, for the lead to regenerate on commit.

## Evidence against the amended model (2026-09-25)

Author: Agent A (the evidence author). This section builds the evidence for `coverage-model.md` **as amended by `coverage-model-amendment-1.md`**; where the two differ, the amendment wins. Both are committed at 7298af46b. Rounds 1 to 3 above stand as written, apart from the two corrections marked there.

- **Production.**
  - bc8e1118d is the frozen head before the P1 fix. It is the red side.
  - 79d81621c is the P1 runtime-turn-integrity fix (CA1 and CA5) and the new production_sha. It is the green side.
  - The only src difference between them is in `raft-rs-runtime-owner.js`, `raft-rs-runtime-owner-constants.js` and `raft-rs-status-observation.js`.
- **Worktree.** At 1e64d5a57, whose src equals bc8e1118d. The green runs use a scratch export of 79d81621c carrying these test files.
- **Constraints kept.**
  - No src edits and no git writes.
  - I did not read the implementer's direct witness (`runtime-turn-integrity.test.js`).
- **Scratch.** The session scratchpad under `f1/evidence/`:
  - `r5/prod/`: the 79d81621c export;
  - `r5/mutants/`: the catalogue mutate scripts, with `V` changed; `mutate6.py`, the new families; `run5.sh`, the round-3 verifier's run.sh with the oracle and anchors files added; one `.out` per mutant and file; and `catalogue-*.txt`;
  - `r5-bc8e1118d-*.out` and `r5-fix-*.out`.

### Files

| File | What |
|---|---|
| `test/raft/raft-rs-backend/transfer-leadership-drain-oracle.test.js` | The property: 3 census tests and 144 generated cells, each run PENDING and PROCESSED and compared |
| `test/raft/raft-rs-backend/transfer-leadership-drain-oracle-cells.js` | The cell generator: the event axis (type × receiver predicate), the decision axis D1-D6 × harness modes, the pairs, and the special cells |
| `test/raft/raft-rs-backend/transfer-leadership-drain-oracle-harness.js` | `OracleRun` (the send, timing and re-entry axes; the outbound, event-stream, durable and crash-recover readings) and `runCell` |
| `test/raft/raft-rs-backend/transfer-leadership-drain-anchors.test.js` | Direct anchors: CA1, D7/CA5, B1/F9b, per-index window, F6 one-turn, and CA9 (todo) |
| `test/raft/raft-rs-backend/partition-node-cluster.js` | Adds an optional `timingFor(replicaId)` hook. Default unchanged |
| `test/raft/raft-rs-backend/transfer-leadership-driver.js` | Passes through the `timingFor`, `sendFor` and `wrapDatabase` hooks, adds `electionTickOf`, and de-exports `SUCCESSOR` |

The round-4 scaffolding in the oracle file was replaced.

### The oracle

**Construction.** Each cell builds one cluster state and leaves envelopes in the requester's inbox. It then runs twice from scratch, with the same identities and the same delivery order:

- **PENDING:** the envelopes are handed to the requester's `step()`, unprocessed, and the request is made.
- **PROCESSED:** the envelopes are processed first by the requester's own `readStatus`, a drain that never ticks, and then the same request is made.

This is the amendment's definition: "pending" means delivered to `group.inbound` and not yet stepped.

**Compared, PENDING against PROCESSED, never against a literal:**

| Output | How |
|---|---|
| Answer record | every field, exactly |
| Outbound | the requester's (type, to) sends, in order, from hand-over to the end of the request's turn. Admission-closed cells compare only the request turn's sends: both are empty, because the gate refused before any drain |
| Leader, term and ConfState | every connected replica's role, term, leaderId, voters, learners and `inboundStepRefusals` (P1's per-sender refusal record; null before P1), at the smallest election tick − 1 rounds, exactly |
| Settled outcome | only for declared timeout-driven cells: at twice the largest election tick, by class (how many lead). Exact instead when the answer names a transferee |
| Event stream | every replica's role, term and leader events with payloads, in order |
| Durable record | per connected replica: hard state (term, vote, commit), applied state (index, voters, learners), and the log (index, term, type, data), read on an independent connection |

**Direct anchors checked inside every cell, in both runs:**

- **D7:** the subscriber projection built from the event stream equals the core after the request's turn, and again at the observation.
- **Crash and recover:** the requester is restarted from its durable record and must report the term and ConfState it reported running.

**Closed nondeterminism.**

- The core's only random input is the follower election timeout (raft.rs 2810). FxHasher makes iteration order deterministic.
- The harness adds none: a virtual clock that is never advanced, and a deterministic delivery loop.
- So any A/B difference is a red, except in the one declared place: the settled observation of timeout-driven cells. Those are the candidate receiver and the leaderless-follower receiver of a forwarded proposal.

**Anti-vacuity:**

- The PROCESSED reference drain's own answer must be a status record, and its core-entry log must show one `step` per delivered envelope.
- The PENDING request's turn must begin with a `step` and step every delivered envelope. The PROCESSED request must meet nothing pending.
- Processing must have moved something:
  - a decision input, or an outbound send, or both, as the cell declares;
  - or, for the refused-step cells, the build asserts the receiver predicate under which raft-rs refuses the step: local type, sender without progress, or a MsgPropose drop state.
- Every observation and every input read rejects a refusal-shaped status.

**Cost.** The harness sets `PRAGMA synchronous = OFF` on the cluster's files through the `wrapDatabase` hook. The durable readings are unaffected, since they are read back through the OS cache. One whole run of the property file takes about 5 s.

### Coverage the test ranges over

**Census, generated from authorities; each fails visibly on a new member.**

- The message types are parsed from `num_to_msg_type` in `lib.rs`.
- The local-only and response sets are parsed from `raw_node.rs` `is_local_msg` and `is_response_msg`.
- The parsed maximum must equal `RAFT_RS_MESSAGE_TYPE_RANGE.MAX`, and the types must run contiguously from 0 to that maximum.
- Every type has a cell or a recorded reason.
- Every non-local response type has a sender-without-progress cell.
- The pairs are generated as movers × readers per predicate and must include the challengers' P1, P2, P3, P5, P6 and P7. Every generated pair must have a construction.
- D1-D6 and every harness mode must be exercised.

**Event axis: 46 cells, message type × receiver predicate.** The decision in brackets is the one run.

| Type | Receiver predicate [decision] |
|---|---|
| MsgHup, MsgBeat, MsgUnreachable, MsgSnapStatus, MsgCheckQuorum (local-only, parsed) | local-only, crafted from a peer [D1, D3] |
| MsgPropose | leader (forwarded) [D1, D3]; leader with a transfer in progress [D3]; leader removed from its configuration [D3]; candidate (timeout-driven) [D3]; follower with a leader [D1]; follower without a leader (timeout-driven) [D3] |
| MsgAppend | stale leader, higher term [D1, D2] |
| MsgAppendResponse | sender without progress [D1, D3]; unequal progress [D2]; commits the target's removal [D1]; commits the leader's own removal [D3, D4] |
| MsgRequestVote | leader, higher term [D1, D2] |
| MsgRequestVoteResponse | sender without progress [D1, D3]; candidate collects the votes [D1 named self] |
| MsgHeartbeat | stale leader, higher term [D1, D2] |
| MsgHeartbeatResponse | sender without progress [D1, D3]; lagging follower [D1] |
| MsgTransferLeader | leader, a transfer to another voter [D1 different target, D1 same target, D2, D3, D4]. These are the second-transfer cells |
| MsgTimeoutNow | the transferee, a follower [D1] |
| MsgRequestPreVote | leader, higher term (crafted; pre-vote is off) [D1] |
| MsgRequestPreVoteResponse | sender without progress [D1, D3]; higher-term rejection (crafted) [D1] |
| MsgReadIndex | leader (crafted; the port never reads by index) [D1] |

**Types and predicates with no cell, each with its recorded reason:**

- **MsgSnapshot:** no production sender, because the binding exports no compaction. A crafted snapshot would fabricate a log prefix and configuration.
- **MsgReadIndexResp:** no sender. A crafted one would fabricate a commit index.
- **MsgTimeoutNow at a leader** and **MsgTransferLeader at a candidate:** raft-rs ignores them, so nothing moves.
- **MsgTransferLeader at a follower with a leader:** unreachable from a raft-rs peer, by the term rules.
  - A lower term is ignored, and a higher term resets the leader.
  - Crafted, it makes `step_follower` re-forward it, and raft-rs `send()` is fatal on a set term (raft.rs 647-653). The result is CORE_FATAL, which falls under exclusion 4.
  - It is recorded as a finding of the crafted census, not as a production path.

**Decision axis: 78 cells.** The decisions are:
- D1: named transfer, target C;
- D2: most-caught-up;
- D3: `propose`;
- D4: `proposeConfChange` add-learner;
- D5: `campaign`;
- D6: `probePeerProgress(C)`.

Each is crossed with one pending event per decision input, all at the leader A:
- a higher-term vote request;
- a new leader's append at a stale leader;
- a new leader's heartbeat at a stale leader;
- unequal acknowledgements (progress);
- an acknowledgement committing C's removal (configuration);
- a forwarded MsgTransferLeader (transfer in progress).

The cells run in these harness modes:

| Mode | Decisions | Cells |
|---|---|---|
| Synchronous sends, listener re-entry on (the default) | D1-D6 | 36 |
| Asynchronous sends (every send a promise released next microtask) | D1-D3 | 18 |
| Production per-index timing (`computeReplicaElectionTimeouts` over the owner's defaults: election ticks 20/70/120) | D1-D3 | 18 |
| Listener re-entry off | D1 | 6 |

**Pairs: 10 cells, generated.** One predicate row gives no pair: pending-conf, P4, is CA3 and out of the claim.

| Predicate | Movers × readers |
|---|---|
| Transfer in progress | MsgTransferLeader × MsgPropose (P1) |
| Sender has progress | MsgAppendResponse (commits C's removal) × {MsgAppendResponse (P2), MsgHeartbeatResponse} from C |
| Follower without a leader | MsgRequestVote × {MsgPropose (P6), MsgTransferLeader} |
| Candidate | MsgTimeoutNow × {MsgPropose (P7), MsgTransferLeader} |
| Leader identity (announcement) | MsgRequestVote × {MsgAppend (P3), MsgHeartbeat} |
| Transferee caught up | MsgTransferLeader × MsgAppendResponse (P5) |

**Special cells:**

- **Window (1 cell):** D1 with the acknowledgements of an uncommitted add-learner conf entry pending.
- **Admission (6 cells):** D1-D6 with a vote request pending and a real `BEGIN` on the requester's database at the request.
- **Mid-turn (3 cells):** D1-D3.
  - The request's turn awaits a send the test holds.
  - A higher-term vote request is delivered during the await.
  - The decision must equal the one taken after both envelopes are processed.

**Anchors: 11 tests, each with a direct expectation.**

| Anchor | Expectation |
|---|---|
| CA1 (×5) | Each parsed local-only type pending does not answer the proposal queued behind it. The proposal commits |
| D7/CA5 (×2) | A vote request then the new leader's append pending: the projection equals the core after the turn. Listener re-entry on and off |
| B1/F9b | After a send await with a `BEGIN` opened meanwhile, nothing enters the core until `ROLLBACK`. The turn then resumes on the admission poll |
| Per-index timing | A transfer the core cannot complete holds proposals for exactly the leader's own election tick (20). The other replicas' ticks differ |
| F6 | An accepted transfer's MsgTransferLeader is stepped before the port answers |
| CA9 (todo) | A leader demoted to learner answers its transfer's dropped proposal as in-progress. See the findings below |

### Red on bc8e1118d, green on 79d81621c

| File | bc8e1118d | 79d81621c |
|---|---|---|
| Oracle (147) | 102 pass, **45 fail** | **147 pass**, 5 of 5 runs |
| Anchors (11) | 4 pass, **6 fail**, 1 todo | **10 pass**, 1 todo (CA9), 5 of 5 runs |

**The 45 red oracle cells on bc8e1118d are the CA1 and CA5 cells.**

- **CA1, 25 cells.** Failure: the reference drain's answer is a refusal record, not a status; a refused inbound step answered the read. The cells:
  - 10 local-only type cells;
  - 10 sender-without-progress cells (4 response types, D1 and D3);
  - the four MsgPropose drop states: transfer in progress, self-removed leader, candidate, leaderless follower;
  - P1, P2 and P2'.
- **CA5, 20 cells.** Failure: the event projection differs from the core; a nested drain inside an announce emitted a stale leader. Every cell where a replica processes a higher-term vote request followed by the new leader's append in one drain:
  - the vote-request decision cells (sync, and per-index);
  - the MsgRequestVote event cells;
  - P3 and P3';
  - P6 and P6';
  - the 6 admission cells.

**The 6 red anchors on bc8e1118d** are the 5 CA1 local-type anchors and D7/CA5 with re-entry on. The re-entry-off D7 anchor is green on both heads, which shows the re-entry axis is the one that matters.

### Mutation families (planted on 79d81621c; `r5/mutants`)

- Every mutant was run against the round-3 verifier's 11 witness files plus the oracle and anchors files (13 files).
- PROD is rc 0 on all 13.
- The table names the leg that catches each family, and which members are killed where.

| Family (dimension) | Members | Caught by |
|---|---|---|
| F1: pending event not processed before the decision | MD, X1, X4, Y2, Y5, Z1 (own) | **Oracle:** MD 78 cells, X1 78, X4 48, Y2 20, Y5 3, Z1 4. The drain-order structural legs also catch MD, X1, X4 and Y5 |
| F2: decision on cached pre-event state | X8, Y1, X7 | **Oracle:** X8 40, Y1 4, X7 24. drain-order catches X7 and X8 |
| F3: higher term ignored | X1, Y2, X8 | Oracle, as F1/F2 |
| F4: progress ignored or misranked | ME1, ME2, X2, Y1 | **Anchors:** ME1 by property W1c; ME2 and X2 by decision-inputs R2.2. **Oracle:** Y1 (unequal-progress cell). ME1, ME2 and X2 are wrong the same way in both runs, so the oracle is blind to them by design |
| F5: membership ignored | MC1, MH2, MD | **Anchors:** MC1 by attack-matrix and decision-inputs; MH2 by decision-inputs R2.3 and drain R3.7. **Oracle:** MD |
| F6: decision split across processing steps | Y4 | **Anchor:** F6 one-turn (new). The oracle is blind: both runs split alike. It is unreachable as a false answer (verifier round 3, non-blocking 2), but the anchor pins it |
| F7: success or retryable without the durable effect | MA, MB, MI1, MI2, X5, X6 | **Anchors:** committed (R2.4, R3.10) for MI1, MI2, X5, X6; property, attack-matrix, handler and write-path for MA and MB. **Oracle:** MA 24 cells, MB 3 |
| F8: drop cause misattributed | MH1, MH2, X3 | **Anchors:** decision-inputs (R2.3, R3.8, R3.9) and write-path |
| F9: gates bypassed | MF, MG | **Anchors:** attack-matrix W3.15/16. **Oracle:** MG 2 cells (admission) |
| F9b: admission re-check after an in-turn await removed (new) | `F9b_admission_recheck_removed` | **Anchor:** B1/F9b. The oracle's admission cells close admission before the request, not mid-turn |
| F10: second authority or path | MC2, MJ1, MJ2, MK | **Anchors:** handler and census tests (h-already, h-main, census, attack-matrix) |
| F11: stale registry (Y3) | Y3 | Survives, recorded. It is out of the claim: only a stale refusal is possible (verifier round 3, non-blocking 1) |
| **F12: a refused inbound step answers the command (new; CA1 reintroduced)** | `F12_refused_step_answers_command` | **Oracle:** 27 cells. **Anchors:** 5 (CA1) |
| **F13: nested announce, stale diff (new; CA5 reintroduced)** | `F13_nested_announce` | **Oracle:** 20 cells. **Anchors:** 2 (D7/CA5, plus the B1/F9b anchor) |
| Async-send axis: no inbound re-check after an awaited Ready | `AX_async_no_inbound_recheck` | **Oracle:** the 3 mid-turn cells only |
| Per-index timing axis: the core built with the constant election tick | `AX_timing_constant_election_tick` | **Anchor:** per-index window. Also write-path 2, committed 1 and oracle 11 cells. The oracle kills here come from follower timeouts inside the exact window once the core's tick is shorter than the configured one. They are nondeterministic, so the anchor is the designed leg |
| Equivalent under the claim: MsgHeartbeatResponse processed after the decision | Z2 (own) | Oracle: 2 cells, through the structural anti-vacuity only ("the turn begins with a delivered step"). Its semantic outputs are equal, since it moves no decision input |

- **Every family is red.** Its designed leg is noted in the table.
- **Y3 is the only survivor**, and it is recorded as out of the claim.
- **Y4 is red only through the new F6 anchor.**

### Exclusions (from amendment 1; not built)

| Item | Owner or disposition |
|---|---|
| CA3, lost conf change (`has_pending_conf` or joint nulls a conf change answered CORE_OK) | Its own membership-admission quest after the publish. No F1 anchor |
| A1, the handler's branch from the tracked role | Projection and readiness owner |
| A2's cached path (the membership admission pre-check) | Projection and readiness owner. A2's substituted path is covered through D8's substitution, which is CA1 |
| A5, the partition write gate `this.role === LEADER` | Projection and readiness owner |
| B13, a transferee held by a host failure | Exclusion 4 (host failure) |
| B5, the alternating-retarget loop | The REPLACE single-source-removal owner quest |
| B4, the unbounded tick queue | Runtime owner |
| B6, a host failure answered after the effect | Write path and runtime owners |
| Also recorded | the draft's exclusions (handler tracked role, Y3, Liferaft, CORE_FATAL, pre-vote and check-quorum); CA7's shared `runtimeHealth` under exclusion 4; B14 |

### Findings

- **CA9 is reachable, and red on 79d81621c.**
  - The canonical request `proposeConfChange({type: ADD_LEARNER, replicaIdentity: <the sitting leader>})` demotes the leader, and raft-rs keeps it leading (`post_conf_change`).
  - Its transfer then drops proposals, and `droppedByLeadershipTransfer` answers the raw `CORE_REFUSED ... proposal dropped`, `retryable:false`. The drop is the transfer's.
  - This is because the classification keys on "transferable voter" where raft-rs keys on "has progress".
  - It is not reachable through the current production callers: admission skips existing members (ALREADY_MEMBER).
  - The anchor is committed as `todo`, so the red is reported without failing the suite. The lead or owner decides whether it is F1's to fix, or a record for the classification owner.
- **A crafted MsgTransferLeader at a follower with a leader is CORE_FATAL**, because raft-rs `send()` is fatal on a set term. It is unreachable from a raft-rs peer (term rules), and it falls under exclusion 4. Recorded.

### Limits

- **Blind spot to shared bugs.** The oracle is blind, by design, to a bug that is the same in both runs: F4's ME1/ME2/X2, F8, F10, F7's commit legs, and F6.
  - Those families are carried by the anchors named in the table.
  - The oracle's own anchors (D7 projection, crash-recover) are per-run checks, not comparisons.
- **Reference processing is the harness B.** The envelopes are processed by the requester's own status read, with nothing between it and the request. A production "processed earlier" with ticks or commands in between is not what the claim compares.
- **Crafted envelopes stand in for types a peer never sends here:**
  - the five local types;
  - responses from a non-member;
  - MsgPropose at a candidate or at a leaderless follower;
  - the pre-vote pair;
  - MsgReadIndex.

  They are shaped as the runtime's own sends: a forwarded proposal carries term 0, like raft-rs's `send()`. They are admissible by ingress. Their semantics are raft-rs's own.
- **The asynchronous mode releases every send on the next microtask.** Mid-turn arrival is exercised only through held sends, in the three mid-turn cells and the B1/F9b anchor. A slow-peer mode (one peer never acknowledging) was not built.
- **Per-index timing is built through the harness hook** with production's defaults and jitter (ticks 20/70/120, at a 50 ms tick from the default heartbeat). The adaptive IDLE profile was not built.
- **Clock mode (lockstep) is not a separate axis.** Time moves only by explicit ticks, one round being one tick of every live replica. The recovery window and the admission bound are therefore pinned at t = 0, except in the B1/F9b anchor, which advances the virtual clock by one admission poll.
- **The settled observation is a class count**, and only for the three declared timeout-driven cells. All other cells are compared exactly at the smallest election tick − 1 rounds, and never at the settled time.
- **The durable comparison reads the files through the OS cache** (`synchronous = OFF`). It compares content, not crash durability across a power loss. The crash-and-recover anchor is a process restart.
- **The event-axis decision choice is one or two decisions per cell** (see the table), not all six. The decision axis crosses all six only with the six representative events.

### E0 gates

- `eslint` on the five new or changed test files, the cluster harness and the driver: clean.
- `npm run -s test:duplication`: OK. src+scripts 56/56 groups and 1815/1815 lines; test 791/791 groups and 30451/30451 lines.
- `npm run -s test:unused:ratchet`: OK, 1437/1437. `SUCCESSOR` is de-exported.
- `node scripts/check-fast-static.js`, after `npm run -s test:metadata:refresh`: ok. The oracle and anchors files classify as `unit`. The four `test/shards/*.json` files were restored to HEAD afterwards, for the lead to regenerate on commit.
