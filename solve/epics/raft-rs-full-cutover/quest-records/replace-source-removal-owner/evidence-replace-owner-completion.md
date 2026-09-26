# Evidence: the REPLACE source-removal owner on a real rs-raft group (2026-09-26)

**Author:** independent evidence author (verification protocol v2, phases 4-7), not the implementer. No `src/` change.
**Frozen production SHA:** `ab7669fd0` (the REPLACE owner merged with the committed-membership read and the participation gate). Every red below is red on exactly that SHA; every mutation ran on a scratch copy of it.
**Specification:** `coverage-model-amendment-1.md` section 3 (P1, P1', P2, P3, causal latency, AN1-AN12), owner decisions D1/D2 (P4-P6, the terminal-transition class rule), `committed-read-amendment-1-2026-09-26.md` B12/B13, the owner directive of 2026-09-25 points 3-7.
**Not reopened:** the R-2 readiness wake (`evidence-remove-safety-wake.md`) and the lease verdict (`evidence-lease-verdict.md`); both cited where they cover a cell.

## 1. Claim

Over every success edge of the code, a REMOVED write on a partition REPLACE implies that the source is absent from the voters and outgoing voters of the committed configuration of a real multi-replica rs-raft group at the instant of the write; a FAILED after the durable removal intent happens only with a failure-detector-dead target; the owner's decisions are scheduling-independent (decide-first answers WAIT or equals process-first); progress is causal (0 owner-clock ms from the event) with the fallback as the only backstop; the D2 witnesses P4-P6 hold; the anchors hold.

**Verdict:** the claim holds on every cell the harness reaches except three, each red on the frozen SHA with its mechanism located in production (section 7): F1 (a lagging witness completes over a re-admitted source), F2 (RF=1 cannot complete under the source's retirement order), F3 (the re-send at STOPPING runs no remove-safety check). Everything else, including every D2 witness, the causal-latency cells, the backstops and the anchors AN1-AN10, AN12, B12, is green.

## 2. The apparatus (not the implementation's own value)

`test/rebalancer/replace-real-group-harness.js`:
- **The group:** `PartitionNodeCluster` (real rs-raft operation ports from `provider.createPartitionPort`, one database file each, a transport the harness drives). Founders {r1 = source, r2, r3} (or {r1} for RF=1); the target r4 created from an oracle-built COMMITTED stamp (fold of the leader's durable log over the test's founders, the leader's durable identity reservations) and admitted by a real AddNode; it holds the source until a real RemoveNode commits (D1/O1).
- **The owner:** a real `RebalanceCoordinator` (`createTestCoordinator`, `replaceWitness: false`) on the target's node (priority partition `sql_transactions-p1`) or the source's node (ordinary partition `users-p1`, A1). Its READ_REPLICA_MEMBERSHIP / RETIRE_REPLICA_PEER messages are answered by the production seam over the named replica's own port (`readPartitionReplicaMembership`, `retirePartitionRaftPeer`, the same functions the replica handler calls); STEP_DOWN by the port's `transferLeadership` with the handler's answer shape; REMOVE_REPLICA by the source node's retirement (row REMOVING, port stops stepping: the production order, section 7 F2).
- **The relay:** `relayPartitionConsensusObservations` on the target's port -> `TrackedServiceRegistry` -> `attachReplicaConsensusEvents` (the node's production relay chain).
- **The clocks:** every owner timer held and fired only by the test (frozen fallback); the owner clock an offset.
- **The oracle:** the committed configuration = the fold of the durable `_raft_rs_log` (binding decoder, independent connection) of the member with the highest durable commit index, at that index (O-a); cross-checked at every completion by a caught-up founder's durable applied ConfState (O-b). The source's raft peer id is the one the backend registered. Every terminal write is captured with the oracle read at that instant (`terminalWrites`).

## 3. Model table

| Input | Authority in the harness | Moved by |
|---|---|---|
| committed membership | real rs-raft ports (fold oracle) | AddNode/RemoveNode through the ports; `group.advance()` |
| leader, term | the ports | real transfer (named handoff), elections after a kill |
| source row | the node's cache rows | the effect (REMOVING), `setSourceRow` |
| target row | the node's cache rows | `setTargetRow` (failure detector FAILED / REMOVED) |
| readiness | published, all nodes active (`createPublishedPlanningReadinessService`) | R-2 evidence covers the readiness dimension |
| concurrent operations | cache rows | upserted rows |
| remote terminal writes | the gateway with the `completed_at IS NULL` CAS | `replicateRemoteTerminal` |
| time | owner clock offset + held timers | `enterOwnerAfter`, `fireFallbackTimers` |

## 4. Properties, files, results (frozen SHA ab7669fd0)

| Property | File (test/rebalancer/) | Cells | Result |
|---|---|---|---|
| P1 census | replace-real-group-completion.test.js | terminal persist sites {transition-persistence x2, terminal-transition-repair x1}; completeOperation callers (8 files, 11 sites); failOperation caller files (9); REPLACE terminal steps; 4 completion verdicts | green (goes red on the planted-route mutation M7: a new failOperation caller) |
| P1 sink | same | completeOperation refused STILL_VOTER while the fold holds the source; REMOVED only after the real RemoveNode; O-b agrees | green |
| P1 edges | same | STOPPING owner (R-1e/R-1f), ACTIVE adoption (BR7), stop-phase satisfied answer, lagging pre-intent copy at the stop-phase handler, executor outcome REPLICA_REMOVE_COMPLETED, terminal-transition repair (A11.1), target REMOVED after the intent (surviving-member ports), ordinary partition (owner on the source node, witness remote) | green |
| P1' (D2) | same | +1 h sweeps, stale ACTIVE copy, executor REPLICA_REMOVE_FAILED, failed T5' re-send: all STOPPING; target FD-dead + source voter: FAILED `replace_target_dead_source_retained`, source retained | green |
| AN3, AN10 | same | target gone before the intent -> FAILED typed; dead source -> intent `sourceUnreachable`, no REMOVE_REPLICA, completes only after the committed removal | green |
| B12 (live) | same (+ `test/raft/raft-rs-backend/participation-gate.test.js` B12, real chain) | unadmitted target: closed gate carried, never SOURCE_RETIRED, never leads, no effect | green |
| AN11 (live) | same | two forms: adopted intent; recorded intent (ordinary partition, follower witness) | **RED - F1** |
| P4 | replace-real-group-d2.test.js | 60 s, 300 s, 1 h of every sweep: STOPPING, no terminal write, severity elevated; then completes | green (red under M7) |
| P5 | same | immediate vs after every budget: same step, committed configuration, terminal writes, effects, removal authority, planner output; diagnostic differs | green |
| P6 | same | (a) alive/slow: STILL_VOTER from t's port, waits; (b) dead + voter: FAILED from a surviving member's port; (c) dead + absent: REMOVED, no rollback | green |
| AN2, AN6, AN7, AN9 | same | 31 s at ACTIVE and STOPPING not FAILED; leader = source, proposal lost, election wakes R-1f with 0 timers; restart in Φ5 with the proposal lost: BR10 outstanding, backstop re-drives, completes; AN9 = P6(b) | green |
| latency | replace-real-group-latency.test.js | handoff answer -> next decision (E11), real leader change -> SAFE -> intent -> REMOVE_REPLICA in one turn; applied on the witness -> completion; each 0 owner-clock ms, 0 timers | green |
| backstops | same | events suppressed: K2 (1 s fallback), K1 (timeout sweep), W_max (lost R-1f proposal re-driven once past the window) each alone recover | green |
| P2 | replace-real-group-scheduling.test.js | S1 membership x R-1a; S2 membership x R-1f (row-driven removal, lost proposal: no double authority); S3 leader change x handoff attempt; S5 STEP_DOWN answer in flight (the lane holds the decision); S6 source-row delete x T5'/R-1f; S7 remote terminal x completion (first terminal wins, BR17); S8/AN1 planner; S12 target death between SAFE and effect; S13 terminal between SAFE and effect | green |
| P2 S11 | same | concurrent operation between SAFE and the effect; concurrent operation at the T5' re-send | **RED - F3** |
| handoff | replace-real-group-handoff.test.js | named-target only, served by the target's port (forwarded transfer), removal only after a fresh read of t leading; B13 control order | green |
| B13 (production order) | same | RF=1, target below its admission index | **RED - F2** |
| P3 | (implementer) replace-owner-recovery-equivalence.test.js | 18 phase x restart cells + 3 DISPATCH cells | double oracle; AN7 and the restart-after-budget cells re-done live here |

Cited, not re-run: R-2 W1-W6 (publication -> evaluation, lost wakeup, 27 readiness cells), lease verdict L1/L2 and the R-1b/R-1c drain cells (`operation-ownership-lease-fencing.test.js`, `replace-drain-hand-back.test.js`), AN4/AN8 (`replace-named-handoff-attempt.test.js`: routed attemptSeq echo, F-b), AN5 (R-2 W3), AN12 (`replace-dispatch-epoch-gate-scope.test.js` + P3 DISPATCH cells).

## 5. Mutation matrix (scratch copies of ab7669fd0 + these tests; `scratchpad/mutate-ev.sh`)

| Mechanism | Mutation | Red cells |
|---|---|---|
| pending event not processed | `handleConsensusObservation` returns | latency 1, 2; d2 AN6 |
| cached pre-event state | `readReplaceWitnessMembership` memoised per operation | completion sink/edges; latency 1, 2, K2 |
| higher term ignored | `retirementLevelOf` drops leader and term | d2 AN6 |
| membership ignored (R-1a from rows) | `completionVerdictOf` answers SOURCE_RETIRED on a gone/retiring row | completion sink, STOPPING owner; d2 P4/P5/P6 (30 red) |
| decision between two processing steps | `revalidateReplaceSourceRemovalEffect` answers SEND | **silent** (E1 below) |
| success answered without the durable effect | intent write skipped, STOPPING precondition dropped | completion (24 red: effect before STOPPING) |
| timer-driven FAILED reinstated | `isReplaceExemptFromTimeBudget` false + admission always true | silent alone (the sweep never reaches the budget for a post-intent REPLACE) |
| planted old timeout transition | + `routeTimeoutSweepToReplaceOwner` FAILs past 60 s | d2 P4 (the planted route), completion census + P1' |
| planner counts the source | `excludeNonTerminalReplaceSources` returns the input | `replace-source-planner-set-exclusion.test.js` (12 red); S8 here does not isolate it (E2) |
| retarget reinstated | the handoff names the source with REPLACE_SOURCE_LEADER_HANDOFF | handoff named-target; `replace-named-handoff-attempt.test.js` (7 red) |
| R-1a ignores the gate | gateOpen check removed | `participation-gate.test.js` B12; `replace-source-removal-owner.test.js` W3 |

**E1 (evidence finding):** the section 3.2 revalidation (`revalidateReplaceSourceRemovalEffect`) cannot be isolated: its terminal check is shadowed by the dispatch's own terminal check (S13 stays green with it removed), its failure-detector check by the witness read at the intent (S12), and its level compare only delays the effect by one turn because the immediate redrive re-sends at STOPPING without any check (F3). It is not currently a load-bearing barrier.
**E2:** S8 does not isolate the planner exclusion (the real REPLACE row and the retiring source row keep the planner's count at the target on their own); the planner cell is the implementer's `replace-source-planner-set-exclusion.test.js`, which goes red under the mutation.

## 6. Timing relationships used

- Raft advances only when a test calls `group.advance()` / `settle`; `GROUP_TIMING` (heartbeat 50 ms, election 150-300 ms, tick 10 ms) gives the witness a finite transfer window (W_max) read from the observation.
- Owner clock: `+61 000`, `+300 000`, `+3 600 000` ms for the former budgets; `+31 000` for the lease; `+1 100` per fallback round; `+61 000` for the W_max backstop (the escalation fallback when no window is known).
- Frozen fallback = no held timer fired (`firedTimerCount`), and the owner clock unchanged.

## 7. Findings against production (red on ab7669fd0; the lead decides)

**F1 - a lagging witness completes the REPLACE over a re-admitted source** (`replace-real-group-completion.test.js`, AN11 live x2). After the source's removal commits and the group re-admits the source (BR16/A4: the leader's row-driven admission of a row that reads ACTIVE again), a target whose deliveries lag at the removal reports the source ABSENT with `gateOpen` true and its own `commitIndex >= C0`. R-1a answers SOURCE_RETIRED and REMOVED is written while the fold at the group's commit index holds the source (adopted intent: C0 3 = witness commit 3, committed at 4; recorded intent: C0 2, witness commit 3, committed at 4). Mechanism: `completionVerdictOf` (`src/rebalancer/operation-workflow-replace-owner.js:195-209`) bounds the witness's staleness only against C0 (the intent's own read), never against the group's current committed index, so "absent in a committed configuration" is taken for "absent in the committed configuration". The design's own rule for this case is the opposite ("a reappearing admissible row returns the REPLACE to its removal path", A4). Construction: the target capped at the removal index; the wake lost and recovered by the fallback (recorded form).

**F2 - RF=1 cannot complete under the source's retirement order** (`replace-real-group-handoff.test.js`, B13 production order; control order green). The source handler's REMOVE_REPLICA execution (`src/node/replica-handler-remove-execution-methods.js:196-206`) calls `retireReplica` before the REMOVING row, and the port's `dispatch` (`src/raft/raft-rs-operation-port.js:223-230`, `lifecycle.execute`) refuses every step once retiring. In the two-voter group {s, t} the RemoveNode(s) proposed afterwards (R-1f through t, or the row-driven path) needs s's ack and never commits: 21 re-drives, committed voters stay 2, the REPLACE waits `SOURCE_MEMBERSHIP_REMOVAL_PENDING` forever and the partition has no quorum. With the source's port stepping until its removal commits (the D1 anchor's order) the same REPLACE completes. D1 constraint 7 ("RF=1 has a valid path") is not met by the effect-before-removal order; the same hazard exists for any group at two voters.

**F3 - the re-send at STOPPING runs no remove-safety check** (`replace-real-group-scheduling.test.js`, S11 x2). `evaluateRemoveSafety` answers SAFE without any check unless `isReplaceRemovePhase` (`src/rebalancer/replica-operation-repository-row-methods.js:310-315`, ACTIVE only; `src/rebalancer/operation-workflow-remove-safety-evaluator.js:440-446`). A concurrent partition operation that appears between SAFE and the effect makes the section 3.2 revalidation answer WAIT, but the immediate redrive re-enters the STOPPING owner, whose T5' re-send (`operation-workflow-replace-owner.js:578-583`, "through the same remove-safety evaluation") sends the effect under a concurrent operation; a concurrent operation active at a later T5' re-send is likewise ignored. The CL-043 serialization and the voter-ready floor therefore hold for the first send only.

Not a finding, recorded: S5 shows the owner's per-operation lane holding a second decision behind an in-flight answer (BR2), which is the mechanism that makes "decide-first" a WAIT there.

## 8. Uncovered cells and why

- P3's 21 cells stay on the implementer's double; the harness re-does Φ5 restart (AN7), the after-budget restart (P4/P5) and the lost-event backstops live. A full live P3 needs the phase drivers ported (feasible, not done in this session).
- Readiness publication x remove safety: R-2 (approved) only; the harness's readiness is always published.
- The remote-owner wake hop (`wakeCoordinatorCreatedRemoteOwner` from the target's node to another node's coordinator) is not exercised: the ordinary-partition cells attach the target's relay to the owner directly (one coordinator). The message hop itself has no live cell here.
- S7 decide-first: the double's SQL fallback answers a terminal statement without its affected-row count, so the durable outcome is judged by the authority read only.
- P2 "remote terminal write x R-1f" and "readiness x R-1a" cells are not built (no input moved by them that R-1a/R-1f read).
- AN4, AN8, AN5, AN12: cited witnesses only (answer-seam and double cells).

## 9. Deliverable 7: the dead per-leg evidence maps

`test/rebalancer/replace-remove-safety-wake-harness.js` no longer plants replacement-election evidence (the fixture witness reports the target leading, BR11); `replace-remove-safety-wake-property.test.js` is green (136 pass, 0 fail) with its meaning unchanged. No operation now reaches the maps: the only recording sites (`priority-publication-handoff.js:388-407`) run for a non-`replaceAttempt` handoff request, which no REPLACE path produces (`:113-118` returns before `:163-240` for every partition REPLACE, and only partition REPLACEs reach a non-NOT_APPLICABLE state, `priority-publication-leader-safety.js:395-398`). Deletable in production (file:line at ab7669fd0), for the lead:

- `src/rebalancer/priority-publication-safety-topology.js:281-320` (`getPriorityPublicationLeaderHandoffEvidenceMap`, `getPriorityPublicationLeaderHandoffEvidence`), `:322-421` (`getPriorityPublicationReplacementLeaderElectionEvidenceMap`, `getPriorityPublicationReplacementLeaderElectionEvidence`, `getFreshPriorityPublicationReplacementLeaderElectionEvidence`), `:424-493` (`getPriorityPublicationSourceLeaderHandoffRequestedAtMap`, `recordPriorityPublicationSourceLeaderHandoffRequested`, `getPriorityPublicationSourceLeaderHandoffStallMs`), `:495-597` (`recordPriorityPublicationLeaderHandoffEvidence`, `recordPriorityPublicationReplacementLeaderElectionEvidence`), `:598-` (`isPriorityPublicationLeaderHandoffRetrySuppressed`), the three fields they own, and `PRIORITY_PUBLICATION_SOURCE_LEADER_HANDOFF_STALL_TTL_MS` (`:35`).
- `src/rebalancer/priority-publication-handoff.js:384-411` (the recording calls and the non-attempt dispatch), `:163-240` (the REQUEST_REPLACEMENT_LEADER_ELECTION, FAIL_REPLACEMENT_REPLICA_NOT_FOUND, WAIT_REPLACEMENT_LEADER_OWNERSHIP and REQUEST_SOURCE_LEADER_HANDOFF answers), `:425-491` (the continuation snapshot and its states).
- `src/rebalancer/priority-publication-leader-safety.js:210-237, 303-312, 495-611` (the evidence reads, the stall escalation and the four leg states) and `PRIORITY_PUBLICATION_SOURCE_HANDOFF_ESCALATE_AFTER_MS` (`:50`); the leg states in `operation-workflow-owner-shared.js:379-383` once no reader is left. `PRIORITY_PUBLICATION_LEADER_HANDOFF_EVIDENCE` (`:390`) stays: `user-table-leader-placement-cure.js:60-79` reads its retry interval.
- Tests that stub or plant the maps and would need superseding with the deletion: `test/rebalancer/{colocated-follower-remove-safety, priority-recovery-planning-read-scope, cl-038-source-removed-handoff-terminates, r1-leader-election-ack-proof-starved-rejoiner, r3-handoff-escalate-replacement-election, rebalance-coordinator-stopping-reconcile-terminal-visibility}.test.js`, `test/convergence/dt6-replacement-leader-pending-spike.test.js`.

## 10. Runs

- Local, one file at a time through `node --test` (each file 3-40 s; real rs-raft groups are fast): completion 104/106, d2 50/50, latency 20/20, scheduling 58/60, handoff 33/35; R-2 property 136/136.
- Lab cone run: see the commit message and the progress note (`lab test changed --base-sha ab7669fd0 --lane all --split`).
