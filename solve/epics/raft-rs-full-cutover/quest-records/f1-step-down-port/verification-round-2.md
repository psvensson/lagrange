verdict: reject

# F1 step-down port: fresh verifier, round 2 (E0, evidence only)

- **Candidate:** d9fa5284e, on `quest/f1-step-down-port`.
- **production_sha:** bc8e1118d. `git diff --name-only bc8e1118d..d9fa5284e -- src/` is empty, so this round has no src diff.
- **Scope of my work:** I made no repository edits and no git writes, and the worktree is clean.
- **Scratch root:** `verify-f1-r2/`. It holds:
  - `prod/`: a `git archive` of d9fa5284e;
  - `mutants/`: `mutate.py`, which is the round-1 file with only `V` changed; `mutate2.py` for my route mutants; `run.sh`, which is round 1's with the two new files added; `run2.sh`, which also adds my probe; one `<M>.<witness>.out` per run;
  - `probes/`: `verifier-r2-probe.test.js` and `mi2-reachability.test.js`;
  - `catalogue.txt`, `extra-mutants.txt`, `det-*.out` and `mi2-*.out`.

## Summary

**Production.** Production (bc8e1118d) is correct on every route I attacked. All my probes are green on it.

**Round 1's four survivors.** MD, ME2, MH2 and MI1 are now red. Each is killed on a property assertion of the new legs.

**The new legs.** R2.2 and R2.4 test the property, not a shape: every alternative route I tried against them was killed. R2.1 and R2.3 are too narrow:
- Two further mutants of round 1's MD mechanism survive every witness. Each is a decision input read before the turn's inbound drain: one for the transfer, one for the drop classification.
- A candidate's drop dressed as a transfer also survives.

**MI2 is reachable.** It was claimed unreachable, but with production's default timing a single transfer's window outlasts the 2 s deferral budget. The site is reached, and MI2 then answers success for a write that never committed. No witness catches it.

## Blocking findings (evidence; production is correct on each)

### B1. R2.1 route: the transfer's role, term and leader are read before the turn's drain (X1, MD2)

- **Site:** `src/raft/raft-rs-runtime-owner.js:1160` reads the observation in `transferLeadership`. The inbound drain happens in `perform` at `:1264`.
- **Mutant:** `perform` reads the core `status` before `drainInbound`. `transferLeadership` passes that status to `readGroupObservation`, which still reads the configuration fresh after the drain.
- **Property:** a request the core would ignore at step time is refused, never answered accepted. It is decided on every delivered but unprocessed message.
- **Scenario (probe PA):**
  1. The group is formed with A leading at term 1.
  2. `port(B).campaign()` runs, and `stepUndrained(A)` leaves B's higher-term vote request in A's runtime inbound.
  3. A is asked for `transferLeadership(named C)`.
- **Production:** `{"outcome":"CORE_REFUSED","reason":"no-known-leader","phase":"leadership-transfer","retryable":true}`. A is a follower at term 2.
- **X1:** `{"outcome":"CORE_OK","reason":"transfer-requested"}` while A is a follower. raft-rs drops a MsgTransferLeader on a follower that knows no leader, so this is an accepted answer with no effect.
- **Why no witness catches it:** X1 survives all ten witness files (`extra-mutants.txt`). R2.1 (`transfer-leadership-decision-inputs.test.js:66-100`) makes the pending message an acknowledgement, which changes only the configuration input. Its guard at `:85` counts `step` entries and ignores their order relative to core reads, so a pre-drain `status` read passes. The evidence record's own limits admit that a higher-term message was not constructed. It says the count "pins" the order; it does not.

### B2. R2.3 route: the drop classification reads its inputs before the turn's drain (X4, MH5)

- **Site:** `src/raft/raft-rs-runtime-owner.js:1185-1193`, `answerRefusedProposal`.
- **Mutant:** for proposal commands, `perform` reads the observation before `drainInbound`, and the classification uses that observation.
- **Property:** a proposal dropped for a cause other than a transfer (here, a leader its committed configuration removed) keeps the core's non-retryable refusal.
- **Scenario (probe PB):**
  1. A proposes `REMOVE_PEER A`.
  2. `deliverOnly([B, C])` runs, and `stepUndrained(A)` leaves their acknowledgements in A's inbound.
  3. `port(A).propose(...)` is called. Its own turn commits the removal, and then the core drops the proposal.
- **Production:** `{"outcome":"CORE_REFUSED","reason":"propose: raft: proposal dropped","retryable":false}`.
- **X4:** `{"outcome":"HOST_FAILURE","reason":"leadership-transfer-in-progress","retryable":true}`. This is a false retryable.
- **Why no witness catches it:** X4 survives all ten witness files. R2.3 (`decision-inputs.test.js:144-168`) delivers everything first (`driver.deliver()` at `:153`), so its proposal's turn has nothing pending.

**B1 and B2 are one class.** Together they are the second and third instances of round 1's MD mechanism: a decision input read before the turn's inbound drain. Protocol item 10 therefore applies: repair the class in the evidence, and do not add one leg per site. What would close it:
- **An owner-scoped ordering witness.** In a turn with delivered envelopes, every delivered `step` (and its Ready drain) precedes any `status` or `conf_state` read the command makes. The cluster's `coreEntries` already records the operations in order. This kills MD, X1 and X4 at once.
- **One semantic leg per input class**, for both the transfer decision and the drop classification:
  - configuration (as R2.1 does now);
  - role, term and leader (a pending higher-term message).

### B3. R2.3 route: a candidate's drop is answered as a transfer in progress (X3, MH6)

- **Site:** `src/raft/raft-rs-leadership-transfer.js:162-166`. The role check is `roleOf(status) === ROLE_LEADER`.
- **Mutant:** the role check becomes `!== ROLE_FOLLOWER`, so candidates and pre-candidates count.
- **Property:** the retryable in-progress answer is given for a transfer's drop and for no other drop. The leg's own header (`decision-inputs.test.js:13-16`) states this.
- **Scenario (probe PC):**
  1. B is isolated and `port(B).campaign()` runs, so B is a candidate.
  2. `port(B).propose(...)` is called. raft-rs `step_candidate` drops it.
- **Production:** `CORE_REFUSED "propose: raft: proposal dropped"`, `retryable:false`.
- **X3:** `HOST_FAILURE leadership-transfer-in-progress`, `retryable:true`.
- **Why no witness catches it:** X3 survives all ten witness files. Only two other drop causes are witnessed:
  - a follower with no leader (write-path test 3, which kills MH1);
  - a removed leader (R2.3).

  The candidate and pre-candidate drop is unwitnessed.

### B4. MI2 is reachable, so its survival is a real gap

The claim is that "a single transfer's window is at most one election timeout < `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`". That holds only for the test timing (150 ms), not for production's defaults:

- **The budget is 2000 ms.** `src/partition/partition-service-constants.js:49`.
- **Election timeouts per replica** (`computeReplicaElectionTimeouts`, used by `src/partition/partition-service-raft-init-base.js:421-433`):
  - the default `raft.electionTimeoutMinMs` is 1000 (`src/config/config-definitions.js:37`);
  - `JITTER_PER_REPLICA_MS` adds 2500 per replica index (`src/raft/constants.js:58`);
  - so replica index 1 gets 3500 ms and index 2 gets 6000 ms.
- **How rs-raft uses it:** it builds `electionTick = ceil(electionMinMs / tickMs)` (`src/raft/raft-rs-runtime-tuning.js:31-32`). raft-rs keeps `lead_transferee` until `election_elapsed` reaches `election_timeout`, and it resets `election_elapsed` when a transfer starts.
- **The resulting window:** a leader at replica index 1 or 2 (after any failover, or after the transfers F1 introduces) holds the window for 3.5 s or 6 s when the target is unreachable or slow to catch up. That exceeds the budget.
- **The adaptive IDLE profile** also sets a minimum of 3000 ms (`src/config/raft-adaptive-timing-controller.js:111`).

**Probe:** `probes/mi2-reachability.test.js` is R2.4 cloned with the leader's timeout set to 2600 ms and the target cut off.
- **Production:** `{"success":false,"deferRetry":true,"error":"Write deferred: a leadership transfer is in progress"}` after 24 proposals. The budget-exhaustion site (`partition-service-raft-write-commit.js:102-109`) is reached by a single transfer, and production answers it correctly.
- **MI2:** `{"success":true}`, and the row is absent. That is a false success without a commit.
- **Result:** MI2 survives every witness, so the "deferral never becomes success" route at budget exhaustion is unwitnessed on a reachable site. The evidence record's "unreachable" statement is factually wrong. The pwrite assertion that "timeout < budget" constrains only its own test timing.

## Non-blocking findings

1. **R2.2 route space.**
   - raft-rs's progress map holds only voters (incoming ∪ outgoing) and learners, and `learners_next ⊆ voters_outgoing`. So a learner is the only non-voter most-caught-up can meet.
   - A voter being removed is either still a voter, or its progress is deleted when the removal applies.
   - X2 (non-learner judged against `learnersNext`) is killed by R2.2 on the right assertion (`HOST_FAILURE` expected, `CORE_OK` actual: no transfer runs).
   - Side note: the learner exclusion in `transferableVoters` (`raft-rs-leadership-transfer.js:50-55`) can never remove anything under raft-rs semantics.
2. **R2.4 is a property-level leg.** Two alternative routes were both killed:
   - X5 (a served answer names the previous log index): the durable entry at the named index is `before`, not this write;
   - X6 (the write is answered success with a predicted index once re-proposed, before it commits): the row is not in the leader's table.
3. **`stepUndrained` really leaves envelopes unprocessed in production, not in a test double.**
   - The port's `step` goes to `group.inbound.push` plus `scheduleInboundDrain` on the never-advanced `VirtualTimeSource` (`raft-rs-runtime-owner.js:1397-1398`, `:1280-1286`).
   - Probe PD: `stepUndrained` adds 0 core `step` entries, and the next read of A adds exactly `delivered` step entries and applies the removal.
4. **Determinism.** decision-inputs (3 tests) and committed (1 test) each ran 5 times on production, one process at a time and thermal-gated: 5/5 green, with no red to stop at. R2.1 to R2.3 run on a never-advanced virtual clock. R2.4 runs on real timers, but its outcome assertions hold for any schedule.
5. **Literals.**
   - The committed test copies the table names `_raft_rs_log` and `_raft_rs_hard_state`, the columns, and `'base64'`. The table names are exported as `RAFT_RS_TABLE` (`src/raft/raft-rs-durable-store-constants.js:15-16`); the encoding is private to the store.
   - Drift would fail loudly (an SQL error or a decode failure), not pass silently. Importing `RAFT_RS_TABLE` would still follow R06.
   - `decision-inputs` uses `'step'` and `'leader'` inline (the driver has `LEADER_ROLE`).
   - The expected values are otherwise the core's own reports, not copied code.
6. **A stale line in the evidence record.** Its "E0 gates" section says that as committed, `audit:shards` reports the two new files as unclassified. d9fa5284e carries the `test/shards` updates, and `check-fast-static` is ok.
7. **R2.3 is not red-first on e148c13e6.** The author acknowledges this. Its discriminating power is shown by MH2.
8. **For the write-path owner (production behaviour, not an F1 violation).** Under default timing, a write on a leader at replica index ≥ 1 during a slow transfer is answered `deferRetry` after 2 s, while the window runs 3.5 to 6 s. This is correct per the design (the router retries). But the comment at `partition-service-raft-write-commit.js:39-45` ("aborts within one election timeout") suggests the window fits the budget, and it does not.

## Catalogue: round 1's 16 mutants on d9fa5284e, 10 witness files

Files: h-already, h-main, property, attack-matrix, handler, write-path, pwrite, census, decision-inputs (decin) and committed. On PROD every file is rc 0. The entries are rc/fail count from `catalogue.txt`; h-already and h-main are tap-style, so only their rc is shown.

| Mutant | Route | Killed by | Status |
|---|---|---|---|
| MA | Ok without a step | property 5, attack 7, handler 2, write-path 1, decin 1, committed 1 | killed |
| MB | Wrong `from` | property 4, attack 7, handler 1, write-path 1, decin 1, committed 1 | killed |
| MC1 | Refusal answered Ok (decision) | attack 2, decin 1 | killed |
| MC2 | Refusal answered Ok (handler) | h-already, h-main | killed |
| MD | Validation before the inbound drain | decin 1 (R2.1: `CORE_OK` instead of `CORE_REFUSED`) | killed (new) |
| ME1 | Most-caught-up picks the least caught up | property 1 | killed |
| ME2 | Most-caught-up includes learners | decin 1 (R2.2: `CORE_OK` instead of `HOST_FAILURE`) | killed (new) |
| MF | Closed-port bypass | attack 1 | killed |
| MG | User-transaction bypass | attack 1 | killed |
| MH1 | In-progress without the role check | write-path 1 | killed |
| MH2 | In-progress without the membership check | decin 1 (R2.3: `HOST_FAILURE` instead of `CORE_REFUSED`) | killed (new) |
| MI1 | Deferral answered success in the retry loop | committed 1 (row undefined) | killed (new) |
| **MI2** | **Deferral answered success at budget exhaustion** | **none; reachable (B4); `mi2-reachability` kills it** | **SURVIVES** |
| MJ1 | Handler bypasses the authority | h-already, h-main, census 1 | killed |
| MJ2 | Target branch uses `campaign` | h-already, h-main | killed |
| MK | Liferaft silent Ok | attack 1, census 1 | killed |

This matches the author's catalogue exactly, apart from the reachability of MI2.

## Extra mutants: one per semantic route, on the real implementation (`mutate2.py`)

The probe is `verifier-r2-probe.test.js`: PD (undrained is real), PA (a higher-term message is pending), PB (a self-removal is committed in the proposal's own turn), and PC (a candidate's drop). All four are green on PROD.

| Mutant | Route | Site | Witness files (10) | Probe | Status |
|---|---|---|---|---|---|
| **X1 MD2** | R2.1: a stale input other than an ack (the status is read before the drain, the configuration fresh) | runtime-owner `:1160`, `:1264` | all rc 0 | PA red | **SURVIVES the evidence (B1)** |
| X2 ME3 | R2.2: learner-like non-voter (non-learner judged against `learnersNext`) | leadership-transfer `:125` | decin 1 (R2.2) | – | killed |
| **X3 MH6** | R2.3: another drop cause (a candidate's drop counted as a leader's) | leadership-transfer `:165` | all rc 0 | PC red | **SURVIVES the evidence (B3)** |
| **X4 MH5** | R2.3: the classification's inputs read before the drain | runtime-owner `:1190` | all rc 0 | PB red | **SURVIVES the evidence (B2)** |
| X5 MI3 | R2.4: the served answer names another log index | write-commit | committed 1 (entry at the index is `before`) | – | killed |
| X6 MI4 | R2.4: the served answer comes before the commit, naming a predicted index | write-commit | committed 1 (row absent) | – | killed |
| MI2 (catalogue) | R2.4: success at budget exhaustion | write-commit `:102-109` | all rc 0 | `mi2-reachability` red | **SURVIVES the evidence (B4)** |

## Commands and results

- `git diff --name-only bc8e1118d..d9fa5284e -- src/` gave empty output, and `git status` is clean.
- The export was made with `git archive d9fa5284e src vendor test scripts package.json | tar -x -C verify-f1-r2/prod`, with `node_modules` symlinked.
- The catalogue was planted with `python3 mutants/mutate.py <M>` for all 16 (every substitution matched once). It was run with `mutants/run.sh PROD <16 mutants>`, thermal-gated per mutant, one process at a time. Output: `catalogue.txt`.
- The extra mutants were planted with `python3 mutants/mutate2.py X1..X6` and run with `mutants/run2.sh X1..X6`. Output: `extra-mutants.txt`.
- The probes on PROD:
  - `node --test verifier-r2-probe.test.js` passed 4/4. The logged answers are PA `no-known-leader` refusal, and PB and PC the raw `proposal dropped` with `retryable:false`.
  - `mi2-reachability.test.js` gave rc 0 on PROD (`deferRetry`) and rc 1 on MI2 (`success:true`, row absent).
- Determinism: decision-inputs and committed were each run 5 times on PROD, and all 10 runs were green (`det-*.out`).
- The cheap gates, all run in the worktree:
  - `npm run -s test:duplication`: OK. src+scripts 56/56 groups and 1815/1815 lines; test 791/791 groups and 30451/30451 lines.
  - `node scripts/check-fast-static.js`: ok (48.5 s).
  - `npx eslint` on decision-inputs, committed, the driver, property and attack-matrix: rc 0.
  - `npm run -s audit:guidelines`: rc 0, with 0 new violations.
- Not run, per E0: heavy suites.

## What would close this

Another evidence-only round on the frozen bc8e1118d, with:

1. **A class witness for "decide after the drain",** instead of a leg per site. The core-entry order within the turn must put every delivered `step` before any `status` or `conf_state` read, for a transfer, for most-caught-up, and for a refused proposal. Add a semantic leg with a pending higher-term message for both the transfer (PA) and the classification (PB). This kills MD, X1 and X4.
2. **A drop-cause leg for a candidate or pre-candidate,** which kills X3. The property's full negative list is: follower with no leader, candidate, pre-candidate, removed leader.
3. **An R2.4 variant whose leader's election timeout exceeds `USER_TRANSACTION_WRITE_DEFER_BUDGET_MS`.** It should be derived from the owner's constants, not the literal 2600: for example, the budget plus one tick, or production's default timing on a leader at replica index ≥ 1. It must assert that a write deferred to budget exhaustion is answered `deferRetry`, never `success`. This kills MI2. Also correct the "unreachable" statement in the evidence record.
