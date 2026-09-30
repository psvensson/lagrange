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

---

# Round 2 (2026-09-27): the evidence under F1, F2, F3 (production frozen at d46777ecf)

**Author:** the same evidence author, round 2 (worktree `evidence-replace-r2`, branch `evidence/evidence-replace-r2-2026-09-27`, evidence base `fc9861157`). No `src/` change. Production `d46777ecf` = `ab7669fd0` + F1 (completion authority = the leader-answered current committed configuration through the one port read, one redirect; no leader / unnamed leader => typed wait, nothing written), F2 (a removed replica keeps participating until its own applied configuration drops it, then retires; the REMOVING row triggers the RemoveNode), F3 (every post-intent send re-runs remove safety; a FAIL-class answer after the intent is a typed safety wait), the per-leg machinery deletion (`LEADERSHIP_PENDING`), the S9 label fix, V1a (absent stamp refused; founders carry an explicit GENESIS stamp), V2 (a conf change the core would drop is answered DEFERRED and re-driven on CONF_CHANGE_APPLIED), F4 readiness.

## R2.1 What changed in the evidence

- **Harness** (`replace-real-group-harness.js`): `sourceHandler: true` runs the PRODUCTION `ReplicaHandler` over the source's real port (fix-f2's fixture `test/node/replica-removal-consensus-exit-fixture.js`); its row writes reach the owner's node as observed remote rows (the CDC change feed that wakes the owner on its source's row: `observeRemoteRow` / `observeRemoteDelete`), so the REMOVING row wakes the owner without the fallback. `electAmongLive` and the typed leaderless reasons (`LEADERLESS_AUTHORITY_WAITS`) are exported.
- **Choice of source model, recorded.** Every cell whose source lives runs the production handler (P1 sink, STOPPING owner, executor outcome, repair, ordinary partition, target gone, P1', P6 b/b'/c, B13). The kill simulation (`sourceStopsAtEffect`) stays only where the cell is about a source that died: AN10 (failure-detector-dead source), AN6 (leader-source dies at the effect), ACTIVE adoption (a source whose lifecycle retired without an intent), stop-phase COMPLETED (a source already gone), AN11 recorded form (the source dies, then returns). With F2 the two models differ only in whether the source acks its own removal, which is exactly what those dead-source cells hold fixed.
- **Re-expressed under F1** (all green on d46777ecf): completion #9 (target gone), #13 (B12 live), #16 (P1'); d2 P6(b), P6(c), AN6. With the target dead after the handoff (it led), the group is leaderless: the owner waits typed - the diagnostic reason is `TARGET_DEAD_WITNESS_UNAVAILABLE` (target gone) or `WITNESS_UNAVAILABLE` (AN6, target alive), the verdict `UNAVAILABLE`, the observation's reason one of `completion_authority_leader_{unknown,unreachable}` - and writes nothing; once the survivors elect and learn the leader (heartbeats), the leader's own answer decides: P6(b) FAILED `replace_target_dead_source_retained` with the fold holding the source at the write; P6(c) REMOVED with the fold absent at the write (never a rollback), including when the removed source leads until it applies its own removal (F2); #9 likewise; AN6: the dead leader-source is proposed nothing (0 retirements while leaderless: no proposal to a dead leader is counted as issued), the election's relayed leader/term wakes the owner, R-1f proposes, REMOVED with 0 fallback timers.
- **B12.** Under F1 the below-gate target's transient view is a route, never the verdict. Pinned: `evidence-o1-anchors.test.js` B12 (H1 + self, H5 + self) now asserts exactly `STILL_VOTER` from the leader's own answer (`observation.replicaId === leaderReplicaId`, `gateOpen` true) below and above the target's gate; the target's own answer (WITNESS_BELOW_GATE-shaped ABSENT / UNRESOLVED) stays asserted as setup. The live B12 cell (a never-admitted target, no traffic, no leader named) pins `UNAVAILABLE` with `completion_authority_leader_unknown`: the target's view decides nothing. The two are one rule: the verdict is the leader's answer when the target names a leader, a typed wait otherwise.
- **S11 repair confirmed legitimate** (fix-f1 `b7827763e`): the concurrent REMOVE row is stamped on the owner's clock. The PENDING step timeout is 30 s; a row stamped on the wall clock before the cell's +61 s advance was 61 s old by the owner's clock and CL-043 rightly excludes a stale operation (`isPriorityRecoveryOperationDrainStepStale`) from the serialization gate, so the old ordering asserted nothing about F3. The property (a LIVE concurrent operation defers the first send and every re-send) is asserted unchanged; S11 x2 green on d46777ecf and red under M11 below. Not a weakening.
- **`test/integration/ack-delivery.integration.test.js`** (red since V1a): its CREATE_REPLICA joins the existing group {p1-r1}, so it now carries the COMMITTED stamp read from the leader's own port (`READ_COMMITTED_MEMBERSHIP`, BOOTSTRAP purpose, `committedStampOfAnswer` + `validateBootstrapMembershipStamp`, the creation owner's way) in `bootstrap_membership`; never a GENESIS override. 5/5 green.

## R2.2 Per-cell verdicts on d46777ecf (local)

| File | Result | Notes |
|---|---|---|
| replace-real-group-completion.test.js | 121/121 | AN11 x2 GREEN (F1 closed F1); target-gone, B12 live, P1' re-expressed |
| replace-real-group-d2.test.js | 73/73 | P6(b), P6(c), AN6 re-expressed; new P6(b') observation cell |
| replace-real-group-latency.test.js | 20/20 | unchanged |
| replace-real-group-scheduling.test.js | 60/60 | S11 x2 GREEN (F3 closed F3; repair confirmed) |
| replace-real-group-handoff.test.js | 40/40 | B13 production order GREEN (F2 closed F2; the source leaves on its applied removal, retires, the partition keeps quorum) |
| evidence-o1-anchors.test.js | 7/7 | B12 pinned |
| ack-delivery.integration.test.js | 5/5 | proper join |

**P6(b') observation (not a violation of a stated property; for the lead).** With the target (leader) dying after R-1f's proposal was appended and replicated but not yet committed, the survivors' logs hold the RemoveNode. The outcome is nondeterministic: if the new leader commits it before the owner's decision the REPLACE completes (observed in the recorded run: REMOVED, the source no longer a voter); if the decision comes first, FAILED `source_retained` is written with the fold holding the source at that instant, and the new leader then commits the entry - the source is not retained after all, and the partition is left with a FAILED REPLACE and one voter fewer for the planner to repair. The FAILED decision reads the committed configuration, not the survivors' uncommitted logs. P1' holds either way (FAILED only with a dead target; the write-instant oracle is exact). The deterministic P6(b) cell loses the dying leader's in-flight appends.

## R2.3 Mutation matrix on d46777ecf (`scratchpad/mutate-ev2.sh`, scratch copies)

| Mechanism (what F1-F3 changed) | Mutation | Red |
|---|---|---|
| membership from rows | `completionVerdictOf` answers SOURCE_RETIRED on a gone/retiring row | completion 58 red, d2 41 red |
| completion authority = the target's own view (F1 undone) | `readReplaceCompletionAuthority` returns the first answer, no redirect | completion 14 red: AN11 x2, target gone, B12 live, P1' |
| R-1a ignores the gate | gateOpen check removed | `replace-source-removal-owner.test.js` W3 (double) only; participation-gate B12 and the anchors stay green (E3) |
| safety skipped post-intent (F3 undone) | evaluator gates on `isReplaceRemovePhase` (ACTIVE only) | scheduling S11 x2; `replace-remove-safety-post-intent.test.js` |
| source retires before its removal commits (F2 undone) | `awaitReplicaConsensusExit` resolves BACKSTOP at once | handoff B13 production order (4 red); `test/node/replica-removal-consensus-exit.test.js` (7 red) |

**E3 (evidence finding):** under F1 the `gateOpen` branch of `completionVerdictOf` is unreachable on a real chain - the verdict is always a leader's answer and a leader's gate is open by construction - so only the double witness (W3) can turn its removal red. Not a defect; the branch is a fail-closed guard on the answer contract.

## R2.4 Timing table (round 2)

| Relationship | Value | Where it shows |
|---|---|---|
| F2 consensus-exit backstop vs the former REMOVING budget | 30 s (`REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS`) < 60 s (`REMOVING_TIMEOUT_MS`): a source whose removal nobody proposed retires before the REMOVE's step budget; the REPLACE owner is budget-exempt post-intent and re-drives R-1f regardless | B13 production order (exit `own-removal-applied`, no backstop); the exit witnesses (node) |
| V2 deferral vs the SYNCING budget | event-driven (re-driven on CONF_CHANGE_APPLIED, no timer) inside the joiner's 300 s `SYNCING_TIMEOUT_MS`; a deferred AddNode resolves at the next applied configuration change | fix-f2's admission re-drive witnesses; not a REPLACE-owner cell |
| leaderless wait -> resolution | one election (150-300 ms group timing) plus the heartbeats the survivors need to learn the leader; each owner entry re-reads the authority | #9, P6(b), P6(c), P1', AN6 (0 fallback timers in AN6) |
| CL-043 staleness of a concurrent PENDING operation | 30 s (`PENDING_TIMEOUT_MS`) by the owner's clock | S11 (a row stamped on the owner's clock is live; the +61 s cell) |

## R2.5 Findings

None new against production in round 2: F1, F2, F3 are closed on d46777ecf by the same witnesses that were red on ab7669fd0. Observation P6(b') and evidence finding E3 above are for the lead.

---

# Round 3 (2026-09-28): the evidence under V1 corroboration, leader-only conf changes, the durable-row rule (production frozen at 659b7db95)

**Author:** the same evidence author, round 3 (worktree `evidence-replace-r3`, branch `evidence/evidence-replace-r3-2026-09-28`). No `src/` change. Production `659b7db95` = `d46777ecf` + V1 corroboration (the leader's answer counts only when applied == commit and a majority of its voters, per half when joint, confirm term_A naming leaderId_A or none; else typed `completion_authority_not_corroborated` / `completion_authority_applied_behind_commit`), conf changes leader-only at the port (a follower's port answers typed NOT_LEADER with the leader hint; the row-driven owner proposes a leader source's own RemoveNode; R-1f routes RETIRE through the corroborated leader, `replaceRetirementRouteOf`), a removal never proceeds without a durable REMOVING row (typed deferral, port live), the exit awaited whenever the port is live, readiness F4 round 2. Inputs: `verification-replace-owner-round-1.md` (REJECT; items 3-5, V3-V6, V10), `verification-o1-round-2.md` F-3, the fix-f7/f5/integration-3 notes.

## R3.1 What changed in the evidence

- **Harness.** `holdInbox(replicaId)` / `releaseInbox` (a replica whose inbox is not drained: envelopes queue, including those produced in the same delivery pass; a held follower does not tick, a held leader keeps ticking so its heartbeats and appends leave and only what it is sent waits); `replicaCount: 2` groups; `removingWriteFails` (the production source handler's REMOVING write throws the retryable control-plane error while the flag holds, as fix-f5's fixture does); `retirementRoutes` (the group's leader at the instant each RETIRE arrives); `runToQuiescenceWithSweeps` (the 1 s fallback and the K1 sweep in every round); `STALE_AUTHORITY_WAITS`.
- **V3 - P2 regenerated with the dimension "authority currentness"** (`replace-real-group-scheduling.test.js` S14, S15). The model's inputs gain the answering leader's currentness: {current (corroborated), stale-partitioned (an isolated ex-leader), stale-stalled (an ex-leader that has not drained the deposing heartbeat), lagging voters (commit behind the leader's)}. `leader change x R-1a` is generated over the two stale shapes x the two orders (4 cells): the event is the target-leader's deposition by a new leader that re-admits the source (BR16/A4) while the target still believes it leads; decide-first (R-1a reads while the answerer is stale) answers WAIT typed `completion_authority_not_corroborated`, writes nothing and issues no RETIRE; process-first (the deposition processed) decides STILL_VOTER from the corroborated new leader's own answer; both converge to REMOVED with the oracle absent at the write, and every RETIRE after the deposition went to the group's leader of that instant (never a follower, never while the answerer was stale). The direct anchor "a stale leader's answer never retires the source" is fix-f7's `replace-real-group-deposed-leader.test.js` (2 shapes), which the generated cells range over both orders. **The retire route crossed with corroboration:** on the priority partition the post-intent re-send re-runs the named handoff (F3 x BR11), so the deposed target regains leadership before the effect is re-sent and the RETIRE then goes to it as the leader of the moment; on the ordinary partition (the target a follower throughout) every RETIRE goes to the corroborated leader that is NOT t (`replace-real-group-retire-route.test.js`, fix-f5, and S15 here). S15 pins what corroboration is: election safety over terms, not the voters' commit indexes - RF=2, the target's inbox held so it lags the leader's commit, the removal committed with the source's ack, the leader's ABSENT answer corroborated by the lagging target at the term (2 of 2): SOURCE_RETIRED, REMOVED; a commit clause on the confirmations waits here forever (red under that mutation).
- **The two cells whose premise died** (fix-f5 made a follower's RETIRE reach the leader's port instead of the transport): latency `backstop W_max` now holds the LEADER's inbox before the RETIRE (it appends and replicates, its followers' acks never arrive, check_quorum off keeps it leading): inside the window nothing is re-issued, past the window the backstop re-drives once (to the same leader, the level did not move), the release commits and completes. d2 AN7 now isolates the leader after it accepted the RETIRE (its appends lost with the network), the owner restarts in Φ5, the survivors elect: BR10 rebuilds the attempt as outstanding (no re-issue inside the window), the backstop re-drives to the corroborated new leader, REMOVED with the oracle absent. The properties are unchanged: bounded re-drive, 0 timers on the causal path (AN6, latency 1-2), W_max recovers.
- **V2 REPLACE-shaped cell** (`replace-real-group-handoff.test.js`): RF=1 REPLACE, the production source handler, the REMOVING write failing retryable at the first effect: the effect is deferred typed - no REMOVING row durable, nothing retired (durable lifecycle row unchanged), no consensus exit awaited, the source still a committed voter, R-1f proposes nothing; once the write can land the re-sent effect (T5') drives the row, the removal commits with the source's ack, the source leaves on its applied removal, retires, and the REPLACE completes with the target alone. Red under the "removal proceeds without a durable row" mutation (with fix-f5's `replica-removal-deferred-row-write.test.js`).
- **V4** S9 pre-intent x elapsed budgets (d2): ACTIVE with an unresolved attempt survives +61 s, +301 s and an hour of every sweep, no terminal write - green, kept as an anchor. **V10** RF=1 x ordinary partition x source leads (handoff): no handoff; R-1f routes the RETIRE to the leader - the source itself - which takes its own RemoveNode, commits it with the target's ack, leaves on its applied removal (`own-removal-applied`) and retires; the target completes the REPLACE alone. Measured green. **V5** the double-only P3 cells (17 of 21) remain uncovered live (recorded). **V6** E1 updated: the section-3.2 level compare (check 5) is load-bearing after F3 (S11 decide-first red with the revalidation removed); its terminal and failure-detector checks stay shadowed (S12, S13).

## R3.2 Per-cell verdicts on 659b7db95 (local)

| File | Result |
|---|---|
| replace-real-group-completion.test.js | 121/121 |
| replace-real-group-d2.test.js | 86/86 (AN7 re-premised; S9 pre-intent anchor) |
| replace-real-group-latency.test.js | 25/25 (W_max re-premised) |
| replace-real-group-scheduling.test.js | 117/117 (S14 x4, S15) |
| replace-real-group-handoff.test.js | 61/61 (RF=1 ordinary source-leads; V2 REPLACE) |
| replace-real-group-deposed-leader.test.js (fix-f7) | 22/22 |
| replace-real-group-retire-route.test.js (fix-f5) | 10/10 |

## R3.3 Mutation matrix on 659b7db95 (`scratchpad/mutate-ev3.sh`)

| Mechanism | Mutation | Red |
|---|---|---|
| corroboration removed (V1 undone) | `currentLeaderAnswer` returns the leader's answer unchecked | deposed-leader 7 red; scheduling S14 x4 (14 red) |
| commit clause reinstated (the fix's first version) | `confirmsLeaderAnswer` also requires the voter's commit >= the leader's | scheduling S15 red (3 assertions): the lagging target no longer corroborates, NOT_CORROBORATED forever - a liveness loss; S11 green here (its voters keep up) |
| follower forwards conf changes (F-1 undone) | the port's NOT_LEADER refusal skipped | `conf-change-leader-only.test.js` red; retire-route red (the follower target took the RETIRE) |
| removal proceeds without a durable row (V2 undone) | the deferred branch skipped | `replica-removal-deferred-row-write.test.js` 5 red; handoff V2 REPLACE 4 red |
| membership from rows | as round 2 | completion 58 red, d2 40 red |
| authority = the target's own view (F1 undone) | as round 2 | completion 13 red, scheduling 6 red (S14) |
| safety ACTIVE-only (F3 undone) | as round 2 | scheduling S11 x2, post-intent witness |
| source retires before its removal commits (F2 undone) | exit resolves BACKSTOP at once | handoff 12 red (B13, RF=1 ordinary, V2), node exit witness 7 red |
| planted old timeout transition | as round 1 | d2 33 red (P4, S9 pre-intent), completion 49 red |

## R3.4 Observations for the lead (not property violations)

- **O2 (liveness, sweep cadence).** After a T5' re-send of the removal effect the owner's turn ends with no fallback armed and no waiter registered (`operation-workflow-replace-owner.js:589-594` records the wait without arming and hands the re-send to the effect path; the answer's nested STOPPING-owner run cannot re-enter the operation's lane), so the REMOVING row's wake is lost; the K1 timeout sweep reaches the owner and R-1f proceeds. Seen in the V2 REPLACE cell and the S14 convergence (both run with the sweep). Not a terminal route; the design's K1 backstop holds.
- On a priority partition the post-intent re-send re-runs the named handoff (F3 x BR11), so a deposed target regains leadership before the effect is re-sent (S14). Correct under the ruling (the RETIRE goes to the corroborated leader of the moment); recorded because it moves leadership twice.
- F-3 (applied behind commit): typed `completion_authority_applied_behind_commit` exists; the construction (a leader lagging exactly one conf entry under persistence admission) is not built here - uncovered, recorded.

## R3.5 Timing table (round 3 additions)

| Relationship | Value | Where |
|---|---|---|
| held-leader W_max backstop | the R-1f attempt is re-issued only after `transferWindowMaxMs` (7 650 ms at the group timing) since the answer; the +100 ms fire re-issues nothing, the +61 s fire re-issues once | latency W_max |
| restart in Φ5 with a deposed leader | the rebuilt attempt is outstanding for the window; the re-drive goes to the corroborated new leader | AN7 |
| corroboration | term equality and leader naming only; no commit-index clause (S15: a lagging voter still corroborates) | S15 |
| T5' re-send window | 60 s (`REPLACE_REMOVAL_PENDING_ESCALATION_MS`); a re-admitted source's ACTIVE row returns the REPLACE to the re-send after it (S14 convergence, 61 s rounds) | S14 |
