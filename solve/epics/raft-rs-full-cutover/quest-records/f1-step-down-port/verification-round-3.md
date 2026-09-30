verdict: reject

# F1 step-down port: fresh verifier, round 3 (E0, evidence only)

- **Candidate:** 7c63f52db on `quest/f1-step-down-port`, in worktree `.claude/worktrees/f1-step-down`.
- **production_sha:** bc8e1118d. `git diff --name-only bc8e1118d..7c63f52db -- src/` is empty.
- **No repository edits and no git writes.** `git status` is clean before and after, and every gate ran on the clean tree.
- **Scratch root:** `verify-f1-r3/`. It holds:
  - `prod/`: a `git archive` of 7c63f52db, with `node_modules` symlinked;
  - `mutants/`:
    - `mutate.py` and `mutate2.py`, the round-2 verifier's files with only `V` changed;
    - `mutate3.py`, the author's file with only `V` changed;
    - `mutate4.py`, my route mutants;
    - `run.sh` (11 witness files) and `run-y.sh` (the same 11 plus my probe);
    - one `<M>.<file>.out` per run;
  - `probes/`: `verifier-r3-probe.test.js`, plus a property-only variant, `verifier-r3-probe-property.test.js`;
  - result files: `catalogue.txt`, `route-mutants.txt`, `probe-property.out`, `determinism.txt` with `det-*.out`, and `gate-*.txt`.

## Summary

**What holds:**
- **Production is correct on every route I attacked.** All my probes are green on 7c63f52db.
- **Every catalogued mutant is red.** That is round 1's 16, round 2's X1 to X6, and the author's X7 and X8. My numbers match the author's catalogue cell for cell.
- **R3.8, R3.9 and R3.10 test the property.** R3.10's timing is really derived from the owner's constants.
- **Determinism is 15/15 green**, and every cheap gate is green.

**Why I reject:** the class witness does not close the class it claims. It states: "in a turn that begins with delivered-but-unprocessed messages, every decision is taken on the core as those messages left it". Two real-implementation mutants violate the property itself with a false outcome. They survive all 11 witness files, and a semantic leg for each is constructible (I built one). Both routes are ones the author's round-3 Limits (evidence-transfer-leadership.md:413 and :416) name as uncovered:
- **Y1:** cached progress with no core read;
- **Y2:** a higher-term append or heartbeat instead of a vote request.

The author says a semantic leg for Y1 is impossible (:413); it is not.

## Blocking findings (evidence only; production is correct on each)

### B1. Cached progress with no core read: most-caught-up hands leadership to the lagging voter (Y1)

- **The decision's site:**
  - `src/raft/raft-rs-runtime-owner.js:1160-1166`: `transferLeadership` calls `decideLeadershipTransfer` on `observed.value`.
  - `src/raft/raft-rs-leadership-transfer.js:118-131`: `decideMostCaughtUpTransfer` ranks `status.progress`.
- **Mutant Y1 (`mutate4.py`):**
  1. `perform` (`raft-rs-runtime-owner.js:1261-1265`) captures `group.lastStatus.progress`, the runtime's cached status from the previous turn, before `drainInbound`. This is not a core entry.
  2. `transferLeadership` ranks that cached progress. Role, term and configuration are still read fresh after the drain.
- **Property violated:** an accepted most-caught-up request moves leadership to the voter whose log is most caught up.
- **Scenario** (probe P-a, `verifier-r3-probe.test.js`):
  1. The group is formed with A leading. Name the two followers by raft id: L has the lower id and K the higher.
  2. `port(A).propose(x)` runs, then `deliverOnly([K])`. K appends and acknowledges; L never receives the append.
  3. `stepUndrained(A)` leaves K's acknowledgement pending at A.
  4. `port(A).transferLeadership(mostCaughtUp())` is called.
- **Before the drain,** K and L tie on progress, so the lowest raft id wins and L is picked. **After the drain,** K is ahead.
- **Production:** `transfer-requested`, and after 1 round K leads (`{"leadsK":true,"leadsL":false}`).
- **Y1:** `transfer-requested`, and after 1 round **L leads** (`{"leadsK":false,"leadsL":true}`). Leadership went to the voter that never received the latest write.
- **Why no witness catches it:** Y1 survives all 11 witness files (`route-mutants.txt`).
  - It makes no core read before the drain, so the structural rule passes:
    - rule 1, the first entry is `step`;
    - rule 2, the reads before the transfer step follow the last delivered step.
  - R3.2 (`transfer-leadership-drain-order.test.js:178-191`) makes both followers' acknowledgements pending, so progress is equal before and after the drain and the pick cannot differ.
  - Its assertion is only `transfer-requested`, never which voter leads.
- **The Limits line is wrong on two counts** (evidence-transfer-leadership.md:413).
  - It claims the leg "would need unequal progress created by the pending messages themselves" and that none exists. P-a creates that unequal progress with one partial `deliverOnly`.
  - It claims the route "is witnessed structurally only (X7)". That holds only for X7's core-read variant. The cached variant evades the structural rule, so nothing witnesses it.

### B2. A higher-term append or heartbeat pending at the request: the transfer is accepted and never happens (Y2)

- **Site:** `src/raft/raft-rs-runtime-owner.js:1250-1266` (`perform` and `drainInbound`), which feeds the decision at `:1160`.
- **Mutant Y2 (`mutate4.py`):** for a transfer command, the pre-command drain steps every envelope except MsgAppend (3) and MsgHeartbeat (8). Those are drained right after the command in the same turn.
  - Pending acknowledgements, vote requests and heartbeat responses are all still drained first.
  - It is a real "serve control ahead of replication" ordering.
- **Property violated:** an accepted request moves leadership to the named voter within one election timeout; a request that cannot succeed is a typed refusal.
- **Scenario** (probe P-b):
  1. The group is formed with A leading at term t.
  2. `isolate(A)` runs, and `elect(B)` makes B leader at term t+1 with C.
  3. `heal(A)` runs, while A still believes it leads.
  4. B ticks until its heartbeat is in A's inbox, and `stepUndrained(A)` hands it to A undrained.
  5. `port(A).transferLeadership(named C)` is called.
- **Production:** `CORE_OK transfer-forwarded`. A is a follower at t+1. After 1 round C leads (`{"leadsA":false,"leadsB":false,"leadsC":true}`).
- **Y2:** `CORE_OK transfer-requested`, decided on A's term-t leadership. A's MsgTimeoutNow is a term-t message, so C ignores it, and then A steps down. After one election timeout of rounds, `rounds = null`: C never leads, and B still does (`{"leadsA":false,"leadsB":true,"leadsC":false}`). The request was accepted and had no effect. This is the X1 false answer, reached through a different message class.
- **Why no witness catches it:** Y2 survives all 11 witness files.
  - The only higher-term leg, R3.4 (`drain-order.test.js:211-233`), pends a vote request, which Y2 still drains first.
  - The structural rule is applied only in R3.1 to R3.7, and none of those pends a MsgAppend or MsgHeartbeat at the requester. Rule 1 is therefore never exercised against this message class.
  - The author's Limits (:416) name this gap ("an append or heartbeat of a higher term ... was not constructed").

### The class, finished

Both blockers are decisions taken on a state some delivered message has not yet reached, with no core read before the drain. The class splits along two axes. I also planted Y5, a message-type-agnostic partial drain (only the first envelope is drained before a transfer or proposal).

| Axis | Instance | Covered by | Status |
|---|---|---|---|
| Cached state, per input | role, term, leader (X8) | R3.4, semantic | covered |
| Cached state, per input | configuration | R3.7 and R2.1 | covered |
| Cached state, per input | **progress (Y1)** | nothing | **B1** |
| Pending message class (the decision's inputs change before a class is drained) | acknowledgements | R3.1 to R3.3, R3.7 | covered |
| Pending message class | vote request | R3.4 | covered |
| Pending message class | heartbeat responses | R3.5 and R3.6 | covered |
| Pending message class | **higher-term MsgAppend or MsgHeartbeat (Y2)** | nothing | **B2** |
| Pending message class | message-type-agnostic partial drain (Y5) | R3.7 only, and only structurally (`the proposal was made after the drain`) | killed, see note |

Y5's semantic legs all pass on it. It is caught only because R3.7 happens to pend two envelopes, a thin but real kill.

Two further message classes can in principle change an input:
- MsgTimeoutNow, which makes the requester a candidate;
- a vote response to a candidate.

I did not build those, per protocol item 12. A leg for a higher-term append or heartbeat at the requester, with the structural rule applied to it, would also give those classes the rule-1 check in one more shape.

### What would close this (one evidence round, owner-level, not a leg per mutant)

1. **A semantic leg for progress created by the pending messages:** P-a's shape, where one voter's acknowledgement is pending, the lagging voter has the lower raft id, and the leg asserts which voter leads. This kills Y1 and also gives X7 a semantic kill.
2. **A semantic leg (with the structural rule applied) for a higher-term replication message pending at the requester:** P-b's shape, asserting `transfer-forwarded` and that C leads within one election timeout. This kills Y2.
3. **Correct the Limits line at :413.**

## Non-blocking findings

1. **Y3, the registry lookup (route c).**
   - Production resolves a named target at dispatch, before the queued turn (`raft-rs-operation-port.js:259-266`, `normalizedTransferRequest`). That is outside the drain by design.
   - It is sound because the registry (`raft-rs-peer-identity.js`) is an append-only, derivation-keyed reservation map. No inbound message writes to it: its only writers are port construction and the reservation owner (`raft-rs-operation-port.js:137-149`), never the runtime drain.
   - Mutant Y3 memoizes lookups, including null. It survives all 11 files; only my probe P-c kills it (`target-unreserved` instead of `target-not-voter` after a later reservation).
   - Its only possible effect is a stale refusal that changes nothing. A memoized non-null id is always correct, so it can never produce a false acceptance. That is outside the stated property, so it does not block.
   - **For the owner:** `TARGET_UNRESERVED` is `retryable:false`. A request that waits in a busy queue while the reservation lands would get a non-retryable refusal for a transient condition. This is production behaviour, not F1 evidence.
2. **Y4, a decision split across two turns (route d).**
   - The mutant decides and answers in one turn, then steps MsgTransferLeader in a queued turn a microtask later.
   - It survives all 11 files. My structural probe P-d kills it (the answer arrives before any `step`).
   - It is unreachable as a false answer. Between the decide turn and a microtask-later step turn, no macrotask (so no transport delivery) can run. `drainInbound` re-checks the inbound after every awaited Ready, so an envelope that arrives during an async decide turn is drained before the decision.
   - This agrees with the author's limit at :415. Not blocking.
3. **R3.10 tests the property, and its timing is genuine.**
   - `INDEX_ONE_TIMEOUTS` (committed test :83-89) comes from `computeReplicaElectionTimeouts` with `PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS`, `..._MAX_DEFAULT_MS` and `ELECTION_JITTER_PER_REPLICA_MS`. These are exactly the owner and constants production's `partition-service-raft-init-base.js:411-428` uses. The result is 3500 to 5500 ms.
   - The precondition (:251-253) checks the leader's actual `raftTimingConfig` through the owner's `recoveryRetryWindowMsOf`: election tick × tick length. That is raft-rs's leader `election_timeout`, the span that bounds `lead_transferee`, so it is the transfer window. It must exceed `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS` (2000).
   - The assertions are property-level:
     - the answer is not success and is `deferRetry`;
     - no row, and no normal log entry with its `entryId`;
     - the write met the window (proposed more than once);
     - after the abort a later write is served, and the deferred write is still absent;
     - leader and term are unchanged.
   - MI2 is red on it (`committed rc1/f1`). It passed 5/5 on production.
4. **R3.8 and R3.9** kill X3 (`decin rc1/f1`) and MH1 (`decin f2`). Their preconditions assert the candidate role and a null leader.
5. **Structural-rule quirk.** For a refused transfer (`EFFECT.NONE`), rule 2 is satisfied by the drain's own `announce` reads (status and conf_state follow every delivered step), whenever the decision was actually taken. The EFFECT.NONE legs are therefore carried semantically, not structurally. This does not block on its own; it is part of why Y2 escapes.

## Catalogue: rounds 1 and 2, plus the author's X7 and X8, on 7c63f52db (11 witness files)

**Files:** h-already, h-main, property, attack-matrix, handler, write-path, pwrite, census, decin, committed, drain.

**Reading the table:** each entry is rc/fail count. h-already and h-main are tap-style, so only their rc is shown. On PROD every file is rc 0. Full rows are in `catalogue.txt`.

| Mutant | Killed by | Status |
|---|---|---|
| MA | property 5, attack 7, handler 2, write-path 1, decin 1, committed 2, drain 4 | killed |
| MB | property 4, attack 7, handler 1, write-path 1, decin 1, committed 2, drain 2 | killed |
| MC1 | attack 2, decin 1, drain 1 | killed |
| MC2 | h-already, h-main | killed |
| MD | decin 1, drain 4 | killed |
| ME1 | property 1 | killed |
| ME2 | decin 1 | killed |
| MF | attack 1 | killed |
| MG | attack 1 | killed |
| MH1 | write-path 1, decin 2 | killed |
| MH2 | decin 1, drain 1 | killed |
| MI1 | committed 2 | killed |
| MI2 | committed 1 (R3.10) | killed |
| MJ1 | h-already, h-main, census 1 | killed |
| MJ2 | h-already, h-main | killed |
| MK | attack 1, census 1 | killed |
| X1 | drain 4 | killed |
| X2 | decin 1 | killed |
| X3 | decin 1 | killed |
| X4 | drain 3 | killed |
| X5 | committed 1 | killed |
| X6 | committed 1 | killed |
| X7 | drain 1 (structural only) | killed |
| X8 | drain 1 (R3.4, semantic) | killed |

All 24 are red, identical to the author's catalogues.

## Route mutants (`mutate4.py`; each is one real-implementation change on 7c63f52db)

| Mutant | Route | 11 witness files | Probe (PROD green) | Property-level effect | Status |
|---|---|---|---|---|---|
| **Y1** | a: cached progress (`lastStatus.progress` taken before the drain), with no core read | all rc 0 | P-a red | the lagging voter L leads instead of K | **SURVIVES the evidence (B1)** |
| **Y2** | b: MsgAppend and MsgHeartbeat drained after the transfer decision | all rc 0 | P-b red | accepted `transfer-requested`; C never leads within one election timeout | **SURVIVES the evidence (B2)** |
| Y3 | c: registry lookup memoized, including null | all rc 0 | P-c red | stale `target-unreserved` refusal only; no false acceptance is possible | survives; not a property violation (non-blocking 1) |
| Y4 | d: decide in one turn, step in a later queued turn (a microtask later) | all rc 0 | P-d red (structural) | none reachable (non-blocking 2) | survives; unreachable |
| Y5 | class completion: only the first envelope drained before the command | drain 1 (R3.7, structural) | P rc 0 | – | killed |

## Commands and results

- `git diff --name-only bc8e1118d..7c63f52db -- src/` gave empty output. `git status --short` was empty before and after, with HEAD at 7c63f52db.
- `git archive 7c63f52db src vendor test scripts package.json | tar -x -C verify-f1-r3/prod` made the export, and `diff -r src prod/src` shows it identical.
- The catalogue was planted with `python3 mutants/mutate.py <16>`, `mutate2.py X1..X6` and `mutate3.py X7 X8`; every substitution matched once. It was run with `mutants/run.sh PROD <24>`, thermal-gated per mutant, one process at a time. Output: `catalogue.txt`, where PROD is all green and all 24 are red.
- The route mutants were planted with `python3 mutants/mutate4.py Y1..Y5`. They were run with `mutants/run-y.sh PROD Y1..Y5` (the 11 files plus my probe). Output: `route-mutants.txt`.
- For the property-level consequence, `node --test --test-name-pattern='P-a|P-b' verifier-r3-probe-property.test.js` was run on PROD, Y1 and Y2 (`probe-property.out`).
- Determinism, on production and thermal-gated (`determinism.txt`), was 15/15 green with no red to stop at:
  - drain-order: 5/5 green, 7 tests each;
  - decision-inputs: 5/5 green, 5 tests each;
  - committed: 5/5 green, 2 tests each.
- The gates were run in the worktree on 7c63f52db:
  - `npm run -s test:duplication`: rc 0. src+scripts 56/56 groups and 1815/1815 lines; test 791/791 groups and 30451/30451 lines.
  - `npx eslint` on drain-order, decision-inputs, committed, the driver, property and attack-matrix: rc 0.
  - `node scripts/check-fast-static.js`: rc 0, "fast-static: ok in 16252ms".
  - `npm run -s audit:guidelines`: rc 0, with 0 new violations (only inherited baseline matches).
- Not run, per E0: heavy suites.
