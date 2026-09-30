verdict: reject

# F1 step-down port: fresh final verifier (Agent C), round 1

- Candidate head: ad3f57814 (`quest/f1-step-down-port`).
- production_sha: bc8e1118d.
- `git diff --name-only bc8e1118d..ad3f57814 -- src/` prints nothing (0 lines), so the evidence round has no src diff. The worktree is clean. I made no repository edits and no git writes.
- Scratch root: `verify-f1/`. It holds `prod/` (an export of ad3f57814), `base/` (an export of e148c13e6 plus the three evidence files), `mutants/` (`mutate.py`, `run.sh`, one `<M>.diff` and one `<M>.<witness>.out` per mutant), and `probes/` (`verifier-probe.test.js`, `p4-pwrite-committed.test.js` and their `.out` files).

## Summary

- **Production (bc8e1118d):** I found no property violation on any attacked route. Probes P1 to P4 are green on production.
- **Evidence:** four of my sixteen semantic mutants survive every witness file. They were planted in scratch copies of the real implementation, one per semantic route in the brief. Each surviving mutant breaks the binding property in a probe on which production is green.
- **Why this rejects:** four routes the brief lists are unwitnessed:
  - validation in a different turn from the step;
  - most-caught-up naming a learner;
  - the in-progress classification misfiring on the removed-leader drop;
  - the write-path deferral turning a dropped proposal into a success.
- **Next round:** evidence only. Keep production_sha frozen at bc8e1118d (protocol items 6-8). The item-3 suites and the cheap gates were not run, per the reject-fast rule.

## Blocking findings (evidence; production is correct on each)

Each finding names a production site, the mutant planted there, what the property requires, and the probe that shows the difference. In each case production is green and the mutant is red, while all eight witness files stay green on the mutant.

### B1. Validation and step in different turns (MD)

- **Site:** `src/raft/raft-rs-runtime-owner.js:1161`. The observation is read inside `performCommand`, after `perform` has drained pending inbound at `:1264`.
- **Mutant:** reads the observation in `perform` before `drainInbound`, then steps after it.
- **Property:** a request that cannot succeed is refused with a type and changes nothing.
- **Scenario (probe P2):**
  1. The leader A proposes `REMOVE_PEER C`.
  2. B's acknowledgement is stepped into A's port and left undrained.
  3. A is asked for `transferLeadership({successor:'named', replicaIdentity:C})`.
- **Production:** `{"outcome":"CORE_REFUSED","reason":"target-not-voter","phase":"leadership-transfer",...}`. The removal committed in the same turn, before the decision.
- **MD:** `{"outcome":"CORE_OK","reason":"transfer-requested"}`. C has left the configuration and raft-rs `handle_transfer_leader` ignores it (no progress), so this is an OK answer with no effect.
- **Why no witness catches it:** no witness ever holds pending inbound at the moment of the request. The driver drains eagerly through `readStatus`. W3.12 covers a removal that commits after the request (an abort), not the check-to-step race.
- **Output:** `probes/probe-MD_validate_before_inbound_drain.out` and `probes/probe-prod.out`.

### B2. Most-caught-up names a learner (ME2)

- **Site:** `src/raft/raft-rs-leadership-transfer.js:122-126`. The voter filter on `status.progress`.
- **Mutant:** keeps every progress entry except self, so learners are included.
- **Property:** an accepted request moves leadership to the most caught-up voter within one election timeout. A request the core would ignore is refused.
- **Scenario (probe P1):**
  1. Voters A, B and C, plus a real learner replica L that has caught up.
  2. B and C are isolated, and A appends three entries that only L receives.
  3. A is asked for `most-caught-up`.
- **Production:** `transfer-requested`, and a write during the transfer answers `HOST_FAILURE leadership-transfer-in-progress`, so the core really is transferring. After B and C heal, a voter leads within 3 rounds (the election tick is 15).
- **ME2:** `transfer-requested`, but the write answers `{"outcome":"CORE_OK","reason":"drained"}`. raft-rs ignored the learner transferee, so nothing runs and no voter ever takes over.
- **Why no witness catches it:** W1c and W1d have no learner in the group.
- **Output:** `probes/probe-ME2_most_caught_up_learner.out`.

### B3. The in-progress classification misfires on a removed leader (MH2)

- **Site:** `src/raft/raft-rs-leadership-transfer.js:162-166`. `droppedByLeadershipTransfer` requires self to be in the transferable voters.
- **Mutant:** drops that membership check and keeps the role check.
- **Why the check matters:** raft-rs 0.7 `step_leader` MsgPropose drops a proposal in three cases (`raft.rs:2026-2041, 2092-2099`):
  1. self is not in the progress map (removed while leading);
  2. `lead_transferee` is set;
  3. the uncommitted-size limit is hit. The binding leaves it at `NO_LIMIT` (`lib.rs:453-461`, `config.rs:121`), so this case cannot occur.

  So "leader and member" is exactly the transfer cause, and the member check is load-bearing.
- **Property:** a proposal dropped during a transfer answers the retryable reason, and only then. A drop for another reason must not be dressed as it.
- **Scenario (probe P3):**
  1. A proposes `REMOVE_PEER A`, and the removal commits.
  2. raft-rs keeps A as leader (`post_conf_change`, `raft.rs:2674-2684`).
  3. A write is proposed on A.
- **Production:** `{"outcome":"CORE_REFUSED","reason":"propose: raft: proposal dropped","retryable":false}`.
- **MH2:** `{"outcome":"HOST_FAILURE","reason":"leadership-transfer-in-progress","retryable":true}`. That is a false retryable. The write path would retry it for the whole deferral budget, and membership admission would record DEFERRED instead of REFUSED.
- **Why no witness catches it:** the only negative witness for the classification (write-path test 3, `transfer-leadership-write-path.test.js:158`) covers the no-leader drop. It kills MH1 (no role check) but not MH2.
- **Output:** `probes/probe-MH2_inprogress_no_member_check.out`.

### B4. The write-path deferral turns a dropped proposal into a success (MI1)

- **Site:** `src/partition/partition-service-raft-write-commit.js:63-76`, `proposeUnlessDeferred`.
- **Mutant:** on `leadership-transfer-in-progress`, answers the pending write `{success:true}` and returns accepted, so the write is never proposed again.
- **Property:** the brief's check that the write-path deferral never turns a dropped proposal into a success.
- **Scenario (probe P4):** a copy of `partition-write-leadership-transfer.test.js` test 1 with one added assertion: the row the write answered success for must be in the leader's table.
- **Production:** the row `{"value":"during-transfer"}` is present.
- **MI1:** the row is `undefined`.
- **Why no witness catches it:** `partition-write-leadership-transfer.test.js:147` asserts `answer.success === true` plus leader and term, but never that the write committed. MI1 passes it.
- **Output:** `probes/p4-prod.out` and `probes/p4-MI1_deferral_success_in_retry.out`.

## Non-blocking findings

1. **Pre-existing: a stale inbound refusal answers an unrelated command.** Recorded for the runtime-owner owner (R17).
   - Site: `raft-rs-runtime-owner.js:1235-1247`. `drainInbound` returns the first inbound envelope's refusal as the answer to the queued command, and the command never runs.
   - Observed on production in P2's first form: C's acknowledgement arrived after C's removal. `transferLeadership` then answered `CORE_REFUSED "step: raft: cannot step as peer not found"` (phase `step`, not retryable), and the transfer was not stepped.
   - This is still a typed refusal that changed nothing, so it does not violate F1's property. The same mechanism can answer a write with a non-retryable refusal for a transient condition.
   - It is unchanged by this delta: e148c13e6 has the identical code.
2. **Pre-existing: gate placement after an await.** Recorded, not F1-specific.
   - `perform` checks `persistenceAdmitted` once (`:1250-1258`). If `drainInbound` goes async (async `sendToPeer` or `whenPersistenceAdmitted`) and a user transaction opens meanwhile, the command still enters the core.
   - For a transfer, the MsgTransferLeader is stepped and its Ready is deferred (`READY_DEFERRED`, which is CORE_OK, so the answer is `transfer-requested`). The transfer stays pending until the transaction ends, because ticks are refused.
   - Nothing false is answered and nothing is lost. `lead_transferee` is volatile. This is the same class as propose. I did not probe it.
3. **Consumer composition (rebalancer, outside the port property; relevant to the SLO work).**
   - `user-table-leader-placement-cure.js:414-418` first demotes the source with `most-caught-up`, then sends the named target election.
   - When the most caught-up voter X is not the placement target T, two transfers are issued. X may already hold MsgTimeoutNow when T's forwarded request retargets. The result is a second election, or a split vote.
   - Worse, T's forwarded request can reach an old leader that has already stepped down and knows no leader. raft-rs drops it silently, yet T's STEP_DOWN answered COMPLETED `transfer_forwarded`.
   - The same concern applies to `priority-publication-handoff.js` when both of its branches fire for one REPLACE.
   - Recorded for the rebalancer owner. The lead's decision 1 accepted `most-caught-up`, and the cure's comment was updated.
4. **Acceptance semantics.** COMPLETED means accepted, not completed. `transfer_forwarded` in particular means only that the message was handed to the local core. A forward lost in transit, or dropped by a leaderless ex-leader (see 3), is still COMPLETED.
   - Callers judge completion from leader rows. The priority-publication continuation (`priority-publication-handoff.js:295-318`) and the cure both only continue or log.
   - So I found no caller misled beyond the pre-existing "armed" ACK semantics. Any caller that treats COMPLETED as "leads now" would be misled; none does today.
5. **A stale tracked role on the source branch answers ERROR.**
   - If the tracked role says LEADER but the core has already become a follower, the port refuses with `not-leader`, and STEP_DOWN answers ERROR `stepDownTransferRefused(not-leader)`.
   - The source's goal (leadership has left) is already achieved, and the old demotion path answered a role no-op COMPLETED.
   - This is honest and typed, but a caller may count it as a failed handoff.
6. **A named-self request on a leader with a transfer in progress** answers `already-leader` without stepping. raft-rs's own step would abort the running transfer (`raft.rs:1885-1905`), so leadership may still leave. No current caller reaches this (the target branch asks only when the tracked role is FOLLOWER); recorded.
7. **Transaction markers** (`partition-service-transaction-base.js:933-954`).
   - A marker proposed in a transfer window is dropped. It now answers HOST_FAILURE in-progress instead of CORE_REFUSED. Both throw in `assertRaftOperationSucceeded` and are logged at debug, with no retry.
   - The effect is unchanged: a follower applying TRANSACTION_COMMIT only records the outcome (`partition-service-entry-apply-base.js:1121-1137`). The same loss already happens on any leader change, and the transfer itself is one.
   - Frequency rises, from about zero on rs-raft (nothing issued transfers) to "COMMIT inside a transfer window". The transfer cannot start while the transaction is open (the perform gate), but a window opened just before BEGIN can straddle it.
   - Verdict: this is not a new correctness class. Markers did not get the write path's retryable deferral; record it for the transaction owner if marker durability matters.
8. **The implementer's extra vocabulary is honest and typed.**
   - `not-leader` is `most-caught-up` asked of a non-leader, which has no progress to rank. It is not retryable.
   - `transfer-unknown-successor` and `transfer-without-replica-identity` are shape refusals. They are not retryable, and nothing is stepped.
   - `RUNTIME_REASON.NOT_LEADER` receives `'not-leader'` from both the progress-probe and transfer spreads. They are the same value, so the collision is harmless.
9. **MI2 (the budget-exhaustion site answered as success)** survives. The witnesses assert that the transfer window fits inside the deferral budget, so this site is unreachable for a single transfer. Recorded, not blocking.
10. **Literals.**
    - The semantic expectations come from the core's own status, the registry, `tuningOf`, and the binding's `num_to_msg_type` parsed from `lib.rs`. They are not literals.
    - The vocabulary strings in the evidence driver are the design's contract names (design §5), not copied code.
    - `LEARNER_CHANGE {changeType: 2}` in the write-path test is raft-rs's own `AddLearnerNode` enum value, not a Lagrange literal. It would read better through `types.AddLearnerNode`, as `partition-node-cluster` does.

## Production attack classes (bc8e1118d)

| Route | Result |
|---|---|
| Ok without a step | Not present. The step is at `:1177-1184`, and the answer depends on its result (MA killed) |
| Step with the wrong `from` | Not present. `from` is the decided transferee, `to` is self, and the type is 13 (`lib.rs:1242`) (MB killed) |
| Refusal answered Ok | Not present at the decision module, the handler (`:69-80`), or the Liferaft port. `NO_CONSENSUS_PORT` is CORE_REFUSED, and the handler would neutralise an Ok there anyway |
| Validation in a different turn | Not present: observe, decide and step are one synchronous block after `drainInbound`, inside the group queue. Probe P2 is green |
| Most-caught-up lagging or learner | Not present: sorted by `matched` descending, lowest id on a tie, learners excluded. P1 and W1c are green |
| Closed or retired port | `dispatch` checks `closed` and the lifecycle refuses when retired, before normalisation. A transfer queued behind in-flight work when `close()` frees the handle was not attacked; that is a pre-existing class for every command |
| User transaction open | The synchronous gate is in place (W3.16). The post-await re-entry is pre-existing (non-blocking 2) |
| In-progress misfire | The classification is exact against raft-rs drop causes (see B3). The size limit is unreachable (NO_LIMIT). Follower, candidate and pre-candidate drops keep the raw refusal. P3 is green |
| Write-path deferral into success | Not present. The retry loop re-marks the write QUEUED. Budget exhaustion rejects the pending write and answers failure with `deferRetry`. A write released by leadership loss is never proposed again (`markCommittedWriteProposal` returns false). P4 is green |
| Single authority | Census: `.transferLeadership(` is called only from `partition-service-leadership-transfer.js:43`, and `.requestLeadershipTransfer(` only from `replica-handler-leader-handoff-methods.js:144`. `.campaign(` is used only for single-replica bootstrap (`partition-service-raft-init-base.js:598`) and the runtime sole-voter resume. `startElectionTimer`, `raft.change` and `deferCandidacy` remain only in Liferaft internals and RaftGroup / raft-replica-base (message groups, C9). `tracked-leader-demotion.js`, `REQUEST_ELECTION_NOW` and `requestElectionNow` are deleted. No compatibility method was added |
| The seam | `transferLeadership` returns a `deepFreeze` record on every path (`transferRefusal`, `transferAccepted`, `leadershipTransferInProgress`, the `closed` answer, the port answer). The core is still entered only by the runtime owner |

## Mutants: 16 planted, 8 witness files each

The witness files are:

- the evidence files: `property`, `attack-matrix`;
- the implementer's new witnesses: `handler`, `write-path`, `pwrite`, `census`;
- the implementer's rewritten tests: `h-already`, `h-main` (`replica-handler-replacement-election-already-leader`, `replica-handler`).

| Mutant | Route | Killed by |
|---|---|---|
| MA | Ok without a step | property 5, attack 7, handler 2, write-path 1 |
| MB | Wrong `from` (self) | property 4, attack 7, handler 1, write-path 1 |
| MC1 | Refusal answered Ok (decision: target-not-voter) | attack 2 |
| MC2 | Refusal answered Ok (handler maps every answer to COMPLETED) | h-already, h-main |
| **MD** | **Validation before the inbound drain** | **SURVIVES** (probe P2 kills it) |
| ME1 | Most-caught-up picks the least caught up | property 1 (W1c) |
| **ME2** | **Most-caught-up includes learners** | **SURVIVES** (probe P1 kills it) |
| MF | Bypass the closed-port dispatch | attack 1 (W3.15) |
| MG | Bypass the user-transaction gate | attack 1 (W3.16) |
| MH1 | In-progress without the role check | write-path 1 |
| **MH2** | **In-progress without the membership check** | **SURVIVES** (probe P3 kills it) |
| **MI1** | **Deferral answered success in the retry loop** | **SURVIVES** (probe P4 kills it) |
| MI2 | Deferral answered success at budget exhaustion | survives; unreachable (non-blocking 9) |
| MJ1 | Handler bypasses the partition authority | census, h-already, h-main |
| MJ2 | Target branch uses `campaign` (second path) | h-already, h-main |
| MK | Liferaft answers a silent Ok | attack 1 (W3.17), census 1 |

## Attack classes not tried

- CORE_FATAL during a transfer. It goes through the generic containment, which existing witnesses cover.
- Joint-consensus transfers (ConfChangeV2 enter-joint).
- pre-vote or check-quorum turned on.
- A transfer queued behind in-flight work when `close()` frees the handle (pre-existing, not F1-specific).
- The post-await user-transaction re-entry (reasoned, not probed).
- The SLO (out of scope).

## Commands and results

- `git diff --name-only bc8e1118d..ad3f57814 -- src/` gave empty output. `git diff --stat e148c13e6..bc8e1118d`: 37 files.
- `git archive ad3f57814 src vendor test scripts package.json` went to `prod/`; e148c13e6 went to `base/` with the three evidence files copied in. `node_modules` is symlinked in both.
- The evidence witnesses on e148c13e6: property 0/6, attack-matrix 0/18. All 24 are red (`transferLeadership is not a function`, plus W0 on the missing constant). Output: `base-*.out`.
- The evidence witnesses on bc8e1118d: property 6/6, attack-matrix 18/18.
- The implementer witnesses on bc8e1118d, all green:
  - `replica-handler-leadership-transfer` 3/3;
  - `transfer-leadership-write-path` 3/3;
  - `partition-write-leadership-transfer` 2/2;
  - `leadership-transfer-single-path` 4/4;
  - `replica-handler-replacement-election-already-leader` 21/21;
  - `replica-handler` 245/245.
- Mutants: `python3 mutants/mutate.py <M>`, then `mutants/run.sh <M...>`. Each batch was thermal-gated. Results are in the table above.
- Probes: `probes/verifier-probe.test.js` (P1, P2, P3) and `probes/p4-pwrite-committed.test.js`.
  - On prod: rc 0 and rc 0.
  - rc 1 on MD (P2), ME2 (P1), MH2 (P3) and MI1 (P4).
- Determinism: all six new witness files ran 5 times each on prod, and all 5 runs were green for every file (`det-*.out`).
- Not run (reject fast): the item-3 suites, `test:duplication`, `check-fast-static`, `audit:guidelines`, eslint and the ratchets.

## What would close this

An evidence-only round on the frozen bc8e1118d, with witnesses that kill MD, ME2, MH2 and MI1. The probe shapes above are one way to do it:

- **MD:** pending undrained inbound that commits the transferee's removal in the same turn as the request.
- **ME2:** a caught-up real learner that outranks the voters by `matched`.
- **MH2:** a self-removed leader's dropped proposal stays non-retryable.
- **MI1:** a write served during a transfer is actually in the table.
