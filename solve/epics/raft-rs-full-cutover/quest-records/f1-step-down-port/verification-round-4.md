verdict: approve

# F1 round 4: fresh final verifier (Agent C), protocol v2

- Candidate: `quest/f1-step-down-port` at **24fcf0df5**. production_sha is **895034825**.
- `git diff --name-only 895034825..24fcf0df5 -- src/` prints nothing (0 lines). The candidate's delta over production is the anchors file, the evidence record, the impact-graph seal and the debt inventory.
- I made no repository edits and no git writes, and the worktree is clean. All mutants and probes live under `verify-f1-r4/` (`prod/` is a `git archive` of 24fcf0df5; `mutants/<name>/` are hard-link copies with the target file unlinked before it was rewritten; `mutate.py` holds every patch, `mutants/<name>.diff` records each one, and `out/` holds every TAP output).

## Why approve

- **No missing dimension.** I derived the dimensions from the code and from raft-rs 0.7 myself: the decisions from `COMMAND_OPERATION` and the primitive map, the inputs from what each decision reads, the events from `num_to_msg_type` and `raw_node.rs`, the receiver predicates from `step_leader`, `step_follower` and `step_candidate`, and the temporal relations from every await in a turn. Every one is in the amended model.
- **No production violation.** Production is correct on every route I exercised, and on the new D5 cell below.
- **Item 5 is green:** 78 of 78 files, with every cheap gate and ratchet at its baseline.
- **One generic-evidence defect (G1).** It is a variant inside a modelled dimension, so under Phase 9 it is fixed directly in the generator and is not a new round. It touches evidence only and does not move production_sha. It must be fixed before the record's statements about D5 and F2 are true (see G1).

## Findings

### G1. Generic-evidence defect: the decision axis never moves D5's own inputs, so every D5 cell is vacuous for D5

- **Classification:** generic-evidence defect, a known mechanism in a new shape. It is F2 (a decision on cached pre-event state) at D5. It is not a missing dimension, because D5, I5 and the self-removal event are all in the amended model.
- **Where:**
  - `test/raft/raft-rs-backend/transfer-leadership-drain-oracle-cells.js:179` (`INPUT_EVENTS`) and `:507` (`decisionCells`). Every decision is crossed with the same six events, which were chosen for the inputs of D1-D4.
  - `test/raft/raft-rs-backend/transfer-leadership-drain-oracle.test.js:124-137` (`assertMoved`). Anti-vacuity accepts "some requester input moved", not "an input of *this* decision moved".
  - The production decision is `src/raft/raft-rs-runtime-owner.js:1093-1113` (`campaignGroup`). It reads self ∈ voters, self ∉ learners, and `promotable`.
- **What the census shows:**
  - None of the six events moves the requester's own membership or `promotable`.
  - All six sync D5 cells answer `CORE_OK/drained` (`out/vacuity.out`), so the refusal branch `not-an-active-voter` is never reached.
  - The record's statements "Each is crossed with one pending event per decision input" (`evidence-transfer-leadership.md:548`) and "F2 … caught by the oracle" are therefore false for D5.
- **Mutant F2c2** (`campaignGroup` reads the whole pre-drain observation, status and ConfState) **survives all 15 F1 witness files** (`results.txt`).
- **Scenario (reproduced in `probes/d5-probe.test.js`, which uses the oracle's own `runCell` and comparisons):**
  - Leader A proposes REMOVE_PEER A. B's and C's acknowledgements, which commit the removal, are left pending at A. Then `campaign()` is asked at A.
  - **Production (24fcf0df5):** PENDING and PROCESSED both answer `CORE_REFUSED not-an-active-voter`. The cell is green, and the precondition that the voters moved holds.
  - **F2c2:** PENDING answers `CORE_OK drained` and PROCESSED answers `not-an-active-voter`. The cell is red.
- **Fix, evidence only:**
  - Generate each decision's events from that decision's own inputs. For D5 that is at least the committed self-removal at the leader and a committed promotion or removal at a follower requester.
  - Make anti-vacuity per decision: the moved input must be one the decision reads.
  - Correct the two record statements.
  - Then re-run the oracle, the anchors and F2c2, which must go red. No new verification round.
- **Impact:** production is correct. D5's only production caller is the single-replica initialization campaign (`src/partition/partition-service-raft-init-base.js:598`), a sole voter with no peers, so pending peer envelopes at D5 are practically unreachable today.
- I checked every other decision for the same gap. D1, D2, D3, D4 and D6 each have cells that move their own inputs, and my pre-drain mutants for D1 (whole observation, F2a; ConfState only, F5b), D2 (progress, F4c), D3 and D4 (classification, F2b) and D6 (F2d) are all killed (table below). D5 is the only decision with no such cell.

### No production violation found

- **CA1 and CA5 preserve one turn at a time.**
  - `enqueue` sets `group.tail` from the turn's first instant and releases it only when the result settles (`raft-rs-runtime-owner.js:678-709`).
  - A listener's read inside a turn answers the observation recorded by that announce, which is recorded before it emits. A listener's command queues behind the turn.
  - Mutant Q1 (the async turn releases the queue early) is killed by the B1/F9b anchor.
- **No deadlock.** No in-turn await depends on work queued behind the turn:
  - sends go to other groups' `enqueueStep`, which is not queued;
  - admission waits poll the store;
  - listener results are never awaited;
  - `lifecycle.retire` waits on `activeCount` but is never awaited from inside a turn.
- **Admission (B1).** Every await in `finishReady` is followed by `whenPersistenceAdmitted`, and `drainReady` re-checks admission before `take_ready`. So no core mutation follows an await without re-admission. Mutant F9b is killed by the B1/F9b anchor.
- **CA9 matches raft-rs.**
  - `step_leader` MsgPropose drops for exactly two reachable reasons (raft.rs 2026-2040): the leader has no progress for itself, or a transfer is in progress. The uncommitted-size limit is NO_LIMIT, and the binding encodes conf changes itself.
  - `droppedByLeadershipTransfer` keys on the first of those, and it is read in the same synchronous block as the refusal.
- **`inboundStepRefusals` is bounded.** It is a Map keyed per sender with an LRU cap of 256 (`:736-753`, `INBOUND_STEP_REFUSAL_OBSERVATION_LIMIT`). The only unbounded value is the per-sender numeric count.

## Non-blocking findings

1. **The `inboundStepRefusals` bound has no witness.** Mutant Q2 removes the eviction and survives all 15 F1 files. The bound is correct by reading (`raft-rs-runtime-owner.js:748-752`). A one-leg anchor would pin it (R13).
2. **Anti-vacuity on the REFUSED pair cells is not asserted.** The record says the build asserts the receiver predicate, but for the five pair cells with `moves: REFUSED` it cannot, because the predicate only arises after the mover. `assertMoved` returns `true` for them unconditionally (`oracle.test.js:131-132`). Empirically, on 24fcf0df5 all 27 REFUSED cells did record a refused step (`out/vacuity.out`, `refusal=true`), so no cell is vacuous today. The check should assert that the requester's `inboundStepRefusals` changed.
3. **A transfer to the sitting leader itself.**
   - This is outside the frozen claim; it concerns D1 semantics against raft-rs.
   - raft-rs `handle_transfer_leader` (raft.rs 1889-1913) **aborts** a running transfer to another voter before it ignores a transfer to self.
   - `decideNamedTransfer` answers `already-leader` without stepping (`raft-rs-leadership-transfer.js:88-89`), so a running transfer continues, and leadership can still move after an `already-leader` answer.
   - The module comment's "ignores … the leader itself" (`:6-8`) is inexact.
   - Through production callers it is reachable only when the handler's tracked role is stale (the target branch asks only a FOLLOWER-tracked replica).
   - Record it for the D1 owner; it is not an F1 claim violation.
4. **Record naming.** The brief's equivalence arguments "A2b" and "S5/S6" do not occur anywhere in the quest records (coverage model, amendment, synthesis files, evidence, round records). I checked the nearest meanings instead:
   - A2's substituted path (D8 answered by a refused step) is CA1: F12 is killed by 27 oracle cells, 5 anchors and 4 rti legs.
   - SI M5/M6 (membership-admission pre-check, cure) are excluded pre-turn projection readers or "pending at another replica", per amendment 1.
5. **F13 record detail.** Reintroducing the old `enqueue` exactly fails the D7/CA5 anchor (re-entry on) only, not B1/F9b as the record states. The family is still killed: oracle 20 cells, rti 1, anchors 1.
6. **Tick is not on the decision axis.** A tick-only drain skip (mutant P_tick) is killed anyway, by rti (5), drop-classification (2) and write-path (2). The single drain-first path in `perform` covers every command.
7. **The learners filter in `transferableVoters` is redundant.** raft-rs keeps learners disjoint from voters and outgoing voters. My mutants F5a and F5a2 were therefore equivalent. The real membership mutant F5a3 (learners transferable) is killed by attack-matrix and decision-inputs.

## Equivalence arguments checked

| Claim | Check | Result |
|---|---|---|
| Z2: MsgHeartbeatResponse processed after the decision is equivalent | Z2 mutant: oracle 3 cells and drain-order 2, all on the structural rule "the turn begins with a delivered step". With that one assertion removed in a scratch copy, the oracle is **147/147 green** | confirmed (semantic outputs equal) |
| MH1: role check removed | survives all 15 files; raft-rs `Status::new` fills `progress` only for a leader (`status.rs:48-50`), and the binding's `status` uses `rn.status()` (`lib.rs:684-716`) | confirmed equivalent |
| X3: role widened to candidate | survives all 15; the same argument (a candidate has no progress) | confirmed equivalent |
| Y4 (F6): decided in one turn, stepped in a later queued turn | killed: F6 anchor, plus property 5, attack 4, decision-inputs 1, drain 2 | confirmed caught (the oracle is blind by design) |
| A2b, S5/S6 | not defined in the records | see non-blocking 4 |

## Oracle checks (step 3)

- **Independence.** The reference drains through the same `drainInbound`, so I planted shared-path mutants (every command, including READ_STATUS):
  - S1 (MsgHeartbeat never stepped): oracle 18 red, through "the reference stepped every delivered envelope";
  - S2 (MsgHeartbeat stepped, its Ready not drained): oracle 7 red, through the per-run D7 projection anchor.

  A defect common to both runs is caught by the anti-vacuity and the per-run anchors, not by the comparison, as designed.
- **Anti-vacuity is real for every generated cell except the 7 D5 cells** (6 decision cells and 1 admission cell). The census measured what processing moved in each of the 144 generated cells. For the D5 cells something moved, but nothing D5 reads (G1). The REFUSED cells all recorded refusals.
- **The nondeterminism list is closed.** The only random input is raft-rs's election timeout. The harness adds none: a never-advanced virtual clock and deterministic delivery. `exactRounds` = the minimum election tick − 1. Timeout-driven cells are compared by class only where declared.
- **`synchronous = OFF` hides nothing the claim compares.**
  - Production runs WAL with `synchronous = NORMAL` (`partition-service-constants.js:271-272`). OFF and NORMAL differ only in fsync on power loss. The content is identical, and so is a process-crash recovery, which is what the anchor restarts.
  - better-sqlite3 is synchronous, so the pragma introduces no await and changes no runtime path.
  - The oracle compares content read on an independent read-only connection; persistence ordering is the same in both runs.

## Family table (mutants of the real production at 24fcf0df5, each run against all 15 F1 witness files)

- The files are: oracle, anchors, property, attack-matrix, decision-inputs, drain-order, pwrite, committed, rti, dropcls, write-path, handler, census, h-main and h-already.
- The prod baseline is rc 0 on all 15.

| Family | Mutant | Oracle | Killing legs outside the oracle | Verdict |
|---|---|---|---|---|
| F1 pending not processed | F1a decide before drain | 138 | decin 1, drain 7 | killed |
| F1 | F1b defer MsgTransferLeader | 20 | – | killed |
| F1 | F1c defer vote responses + MsgTimeoutNow | 6 | – | killed |
| F1 | F1d defer MsgRequestVote | 19 | drain 1 | killed |
| F1 | F1e defer MsgAppendResponse | 38 | decin 1, drain 4 | killed |
| F2 cached pre-event state | F2a transfer on the pre-drain observation | 78 | decin 1, drain 1 | killed |
| F2 | F2b classification on pre-drain | 8 | drain 3 | killed |
| F2 | F2d probe (D6) on pre-drain | 5 | – | killed |
| F2 | F2c promotable only, pre-drain (D5) | 0 | none | survives: near-equivalent (fresh ConfState subsumes it) |
| **F2** | **F2c2 D5 on the full pre-drain observation** | **0** | **none** | **SURVIVES → G1** (red in the D5 probe cell) |
| F3 higher term ignored | F3 higher-term envelopes deferred past the decision | 51 | drain 1 | killed |
| F4 progress | F4a ascending order | 0 | property 1 (W1c) | killed (anchor) |
| F4 | F4b learner eligible (D2) | 0 | decin 1 (R2.2) | killed (anchor) |
| F4 | F4c progress pre-drain | 4 | – | killed |
| F5 membership | F5a3 learners transferable | 0 | attack 1, decin 1 | killed (anchor) |
| F5 | F5b ConfState pre-drain | 5 | decin 1 | killed |
| F5 | F5a, F5a2 (filter no-ops) | 0 | none | equivalent (my own; non-blocking 7) |
| F6 split turn (Y4) | F6 | 0 | anchors 1 (F6), property 5, attack 4, decin 1, drain 2 | killed (anchor) |
| F7 success without effect | F7a accepted without step (MA) | 24 | anchors 3, property 5, attack 7, decin, drain, committed 2, rti, dropcls, write-path, handler 2 | killed |
| F7 | F7b write deferral answered success | 0 | pwrite 1, committed 2 | killed (anchor) |
| F8 drop cause | MH2 progress check removed | 0 | decin 1, drain 1, dropcls 1 | killed (anchor) |
| F8 | MH7 keyed on transferable voter (CA9) | 0 | anchors 1 (CA9), dropcls 1 | killed (anchor) |
| F8 | MH1 role check removed | 0 | none | equivalent (confirmed) |
| F8 | X3 role widened to candidate | 0 | none | equivalent (confirmed) |
| F9 gates | MG admission gate removed | 6 | attack 1 | killed |
| F9 | MF closed port admitted | 0 | attack 1 | killed (anchor) |
| F9b | admission re-check removed | 0 | anchors 1 (B1/F9b) | killed (anchor) |
| F10 second path | handler bypasses `requestLeadershipTransfer` | 0 | census 1, h-main, h-already | killed (anchor) |
| F11 stale registry (Y3) | not planted | – | – | out of claim, as recorded |
| F12 refused step answers | CA1 reintroduced | 27 | anchors 5, rti 4 | killed |
| F13 nested turn | CA5 `enqueue` reintroduced | 20 | anchors 1 (D7/CA5), rti 1 | killed |
| Async axis | no inbound re-check after an awaited Ready | 3 (mid-turn) | – | killed |
| Timing axis | constant election tick | 0 | anchors 1 (per-index), committed 1 | killed (anchor) |
| Z2 | defer MsgHeartbeatResponse | 3 (structural only) | drain 2 | equivalent (confirmed) |
| Own probe | P_tick: tick skips the drain | 0 | rti 5, dropcls 2, write-path 2 | killed |
| Own probe | Q1: async turn releases the queue early | 0 | anchors 1 (B1/F9b) | killed |
| Own probe | Q2: refusal record unbounded | 0 | none | survives → non-blocking 1 |
| Own probe | Q3: refusal not recorded | 0 | rti 2 | killed |
| Shared path | S1 heartbeat never stepped (every command) | 18 | – | killed (reference anti-vacuity) |
| Shared path | S2 heartbeat Ready not drained (every command) | 7 | – | killed (per-run D7 anchor) |

## Commands run and results

| Command | Result |
|---|---|
| `git diff --name-only 895034825..24fcf0df5 -- src/ \| wc -l` | 0 |
| `git archive 24fcf0df5 src test scripts vendor package.json` → `verify-f1-r4/prod` (plus the node_modules symlink); the 7 mutated source files were compared with `git show` after every build | identical |
| `verify-f1-r4/run.sh prod` (15 F1 witness files, `node --import=@tapjs/mock …`) | all rc 0; oracle 147/147 |
| `python3 mutate.py` + `run.sh <40 mutants>`, one process at a time, each thermal-gated | `results.txt` / `batch1.log`; table above |
| `probes/p1 …/zz-vacuity-probe.test.js` (a PROCESSED census of all 144 generated cells) | `out/vacuity.out` |
| `probes/…/zz-d5-probe.test.js` on prod, and on F2c2 | prod green; F2c2 red (answer differs) |
| Z2 with the structural assertion removed (scratch copy) | 147/147 green |
| `node scripts/run-test-files.js --jobs=2 <78 files>`: all of `test/raft/raft-rs-backend/*.test.js` (31), the port and provider tests in `test/raft` (the provider contract and control, backpressure-mute, transport-adapter, packet round-trip, replica-base, liferaft conflict ×2, single-path), `test/partition` raft/write/leadership (20), the replica-handler tests (8; this includes the single files `test/bootstrap/shared/replica-handler-setup.test.js` and `test/integration/replica-handler-metadata-propagation.integration.test.js`, not those directories as wholes), and the rebalancer R1, R3 and cure tests | **78/78 pass**, 1759 assertions, 53 s (`out/item5.out`) |
| `npm run -s test:duplication` | OK; src+scripts 56/56 groups, 1815/1815 lines; test 791/791 groups, 30451/30451 lines |
| `node scripts/check-fast-static.js` | ok (19.5 s) |
| `npm run -s audit:guidelines` | rc 0; 0 new violations |
| `npx eslint <46 js files touched e148c13e6..24fcf0df5>` | 0 errors; 2 ignored-file warnings |
| `npm run -s test:complexity` | OK, 1813/1813 |
| `npm run -s test:complexity:cognitive` | OK, 159/159 |
| `npm run -s audit:file-size` | source 27/27, test 21/21 |
| `npm run -s test:unused:ratchet` | OK, 1437/1437 |
| Not run, per the brief | membership-consistency, seed-node-bootstrap, node-join-convergence-slo, and `test/bootstrap` and `test/integration` as wholes. The one A2 gate follows approval |
