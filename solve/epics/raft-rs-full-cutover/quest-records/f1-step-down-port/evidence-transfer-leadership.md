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
