REJECT

Two of the same four defects remain: forgeable membership evidence (item 2) and the hosting claim and re-instantiation measurement (item 4). Items 1 and 3 are closed. I found no new substantive incompatibility in raft-rs, WASM hosting, persistent-state recovery, configuration membership or Multi-Raft viability. I did find a substantive defect in one recorded host obligation: the ingress validator's sender rule drops legitimate Raft traffic.

The subject is unchanged. `git write-tree` = 1e7a3e2d72d2adfb06a8e11bb6f7c814509f957d before and after. The index is still only A/M entries, with no unstaged or untracked files. All mutation happened in copies under scratchpad/verifier-raft3/ (base, a1, a2, a2b, a2c, a3, a4, a5, a6). I did not rebuild the crate, did not touch raft-logic, and used no network.

Baseline in the unmodified copy: 30 of 31 tests green. The one red is "no production file changed", because the copy is not a git checkout. Run in the subject, that test is green.

==================================================
FIRST JOB 1: RESTORE ORACLE. CLOSED.
==================================================

- **The oracle is independent of create_node.** restore-oracle.js never calls create_node. It picks its oracle by the durable commit/applied relation, not by the boundary's name:
  - Entry durably committed and not durably applied (restore-oracle.js:72-85): expected = the surviving leader's full ConfState read.
  - Otherwise (:94-100, :117-127): expected = the durable ConfState captured before the crash AND the victim's own pre-crash core read.
  - Term and vote are checked against the pre-crash core status (core-scenarios.js:1217-1229).
- **Oracle use in the honest matrix (45 rows):**
  - 12 rows take the survivors branch: committed-not-applied, conf-applied-not-recorded, joint-leave-entry-durable-not-applied.
  - 33 rows take the durable-plus-pre-crash branch.
  - The single-voter fallback at :86-92 (re-apply with no survivor) is dead code. No row reaches it. If one did, it would compare the new restored configuration with the old durable one and fail honestly.
- **The round-2 create_node patch, re-applied verbatim** (env-var cacheLearner, learners, outgoing1, learnerToVoter) at forked-core-harness.js:1341:
  - Every variant turns "a restart at each of the nine boundaries reconstructs membership from durable raft state alone" red.
  - Example message: "restart-proposed-not-persisted-follower-mixed: the restored configuration is not what durable-conf-state-and-the-pre-crash-core-read says it must be ... restored voters=[1,2,3] ... learners=[4,9] ... vs expected ... learners=[4]", plus "is not the one the victim's own core reported before the crash".
- **Per-row through localRestoreViolations, all 45 specs:**
  - In every case convergence-only = 0 and green = 0. Every catch was `restored-conf-state-matches-an-independent-oracle`, inside the isolated window.
  - Counts per fault:
    - cacheLearner: 45 local, 0 inert.
    - learners dropped: 13 local, 32 inert.
    - outgoing truncated: 5 local, 40 inert.
    - learnerToVoter: 13 local, 32 inert.
- **A module-level hook on the glue itself** (`--require`, replacing `create_node` on raft_wasm.js exports): the same receipt goes red, along with the permanent negative control.
- **A universal lie** (hooking `conf_state` for every handle at all times) turns the three-voter, sequential and nine-boundary receipts red.
- **Corruption table through the receipt's own checks, 240 rows:**
  - 24/24 caught: add-a-voter, drop-a-voter, applied-ahead ×2, vote-dropped, term-zero.
  - learner-into-voter: 7 caught, 17 inert.
  - drop-outgoing: 5 caught, 19 inert.
  - commit-rewound: 17 caught, 7 inert.
  - applied-behind: 5 caught, 11 inert, 8 missed. I confirmed every miss restores exactly the honest configuration.
- **The seam `setRestoreFaultForNegativeControl`:**
  - It can only mutate a restored read or corrupt a record. It cannot supply an expectation.
  - It is disarmed in a `finally` and asserted unarmed at core-restart-and-ordering.test.js:851 and :867.
  - Each test file is its own process, so it cannot leak across files.
  - The comment at forked-core-harness.js:1218-1219 ("no scenario function touches it") is false. core-scenarios.js:2076-2089 arms it inside `runDurableRecordCorruptions`, which the artifact build runs. Wording only.
- **Weakness, not blocking:** the two binding-bug controls assert only `missed == []`, so an all-inert run would pass. In fact 13 and 5 rows are caught.
- **Term and vote are "1"/"1" in every matrix row**, so the term/vote oracle is exercised at a single value.

==================================================
FIRST JOB 2: PROVENANCE. NOT CLOSED. BLOCKING, SAME DEFECT.
==================================================

**The six round-2 launderings, re-run (p1.mjs):** all six refused.
- Empty-and-refill and push: the value is frozen.
- Spread clone: DECLARED_EXPECTATION.
- Invented change through `changedNodeIds`, and a derivation over it: NOT_PROPOSED.
- In-place mutation of a core read: frozen.

**New paths from a literal to trusted evidence:**

- **(a) The `durable-record` source kind is never checked.** `ledgerViolation` returns null for it unconditionally (forked-core-harness.js:839-844).
  - `cluster.durableSnapshotOf(id)` (:1602) returns a JSON copy whose confState is branded and not frozen.
    - `s.confState.voters = ['7','8','9']; membershipArray(s.confState,'voters')` mints a frozen, branded array of 7,8,9 that passes `assertMembershipEqual`.
    - It also passes `auditAgainstLedger`: violations [], byOrigin {"durable-record":1}.
    - This is the "mutation after branding" the third addendum lists as closed.
  - `cluster.corruptDurableRecord(id, why, rewrite)` (:1615) brands any rewritten literal the same way.

- **(b) The proposal ledger binds nothing to a group or scenario.**
  - It is process-global and keyed by canonical content (:422, :578).
  - `recordProposal` runs before the core call (:1630), so a proposal is recorded whether or not the core accepts it.
  - `ledgerViolation` for a proposed-conf-change checks only that the operation id exists (:835-838). It never compares values.
  - I proposed AddNode 1,2,3 on a throwaway cluster. A fresh literal `changedNodeIds(confChangeV2([...same]))` built elsewhere then minted branded [1,2,3] with audit violations [] and everyCitedProposalWasProposed true.
  - The count bound is `cited <= proposals seen in the process`. It is vacuous.

- **(c) `cluster.witness.tag(literal, ...)` (:596-603) brands a literal as a core read with no operation id.**
  - The assert helpers accept it, because `isFromCore` checks only that a brand exists.
  - The artifact audit refuses it ("names no ledger operation").

- **(d) A test file can mint evidence while importing no accessor the census lists.**
  - `corruptDurableRecord`, then `crash`, then `restart` returns `created.learners`: a branded [7,8,9] with audit violations [].
  - `rawMembershipAssertions` saw 0 refusals in that source.
  - `importsNoEvidenceMintingAccessor` does not imply what the artifact says it implies. core-restart-and-ordering.test.js imports `createDeterministicCluster`, which exposes all of the above.

**Owner attack 11, literally.** I replaced `runThreeVoterGroup`'s `confStateByPeer(cluster)` (core-scenarios.js:136) with a declared set, regenerated the artifact, and ran all 31 tests. Both receipts stayed green before regeneration. Only the document-sync receipt (23) went red, because the artifact file differed.
- Via (a), declaring 1,2,3: after regeneration 30 of 31 green, the one red being the git-less copy.
- Via (b), declaring 1,2,3: the same.
- Via (a), declaring the FALSE set 7,8,9: after regeneration 30 of 31 green.
  - The artifact records `three-voter-group.confStateByPeer` = voters ["7","8","9"] on peers 1, 2 and 3.
  - Its own status block in that record shows progress for 1, 2 and 3.
- Only traces in the audit record, and nothing bounds them:
  - byOrigin.durable-record 715 → 727, or
  - proposed-conf-change 2 → 14 with cited 2 → 3.

This is the round-2 result reproduced ("after regenerating the artifact, all receipts green; the only trace is a count nothing bounds"), reached through two new doors. The attempt note's claim that "owner attack 11 fails the audit and the artifact cannot be built from it" holds only for an unbranded literal.

**The six syntactic comparison shapes left open:**
- A test can reach raw membership values. `record.confStateByPeer['1'].voters` is a plain frozen array.
- The implementer's argument (each shape compares a real core read with a literal, so it asserts a truth) is sound only if the actual side cannot be forged. Above, it can.
- Taken alone I judge this non-blocking: a literal expectation against a genuine core read cannot pass on a false membership.
- It is still unmet owner text. The addendum lists destructuring, if/throw and JSON paths as closed, and a literal in a test is textually "declaring the membership it then checks".
- The blocking part is the laundering.

==================================================
FIRST JOB 3: MUTANT CLASSIFIER. CLOSED.
==================================================

- **Honest control and inert switch (m.mjs):** `passed-silently` with message null at all three stops. `everyControlSafe` is true.
- **All eleven mutants caught, with findings true for the stop where they fire:**
  - advance-append-before-persist: unsafe at all three stops ("entries or hard state were written after advance_append").
  - hard-state-omit-entries: refused at all three (raft.rs:2786 "hs.commit 4 is out of range [0, 0]").
  - apply-conf-before-entry-durable: refused (storage.rs:493).
  - conf-state-in-memory-only: restart-equivalence-failed at ready-advanced, safe at the other two.
  - persist-conf-state-leave-applied-behind: unsafe only at recorded-not-advanced ("2 < 3").
  - advance-apply-before-persisting-applied: unsafe at two stops ("0 < 3").
  - restore-applied-ahead-of-log: refused (raft_log.rs:314 "applied(9)").
  - restore-new-conf-old-applied: unsafe at two stops.
  - restore-old-conf-applied-past-entry: equivalence failed at all three.
  - apply-before-persisting-commit: unsafe / refused / refused.
  - confstate-and-applied-written-separately: unsafe at two stops.
- **Each mutation neutered in a copy:** all eleven become `passed-silently` at all three stops and appear in `survivors`. The sealed receipt goes red: "update-conf-state-in-memory-only was not caught at any stop".
- **Re-introducing `|| true`** turns the receipt red.
- **`mutantsKilled` requires both halves:** `survivors.length === 0 && classifierCanFail === true` (build-evaluation-document.js:716-717). The control runs inside `runHostOrderMutants` and is asserted at core-restart-and-ordering.test.js:593 and :602.
- **Stale sentence:** the host contract says the separately-written mutant "fails restart equivalence". It is classified `unsafe-recorded`.
- **`restoredEqualsEntitled` inside the classifier** still uses the replay entitlement. That is acceptable here, because the restore mutants alter only the restart side.

==================================================
FIRST JOB 4: HOSTING. NOT CLOSED, IN TWO RESPECTS.
==================================================

**(i) The .json still asserts the withdrawn claim, and a receipt requires it.**
- raft-backend-evaluation.json:29119-29121, scenario `panic-isolation`, reads:
  - `"runtimeStillUsableAfterRepeatedFatals": true`
  - `hostingShapeConclusion: "one runtime holding many RawNodes stands: a fatal costs exactly the group that caused it, other groups keep running a full scenario, and the dead group is rebuilt from its durable record in the same runtime"`
- It is produced at core-scenarios.js:3890-3892.
- core-identity-and-cost.test.js:134 and :138 require it: `runtimeStillUsableAfterRepeatedFatals` true, and the conclusion matching `/^one runtime holding many/`.
- The .md does not render it, so a grep for the exact withdrawn phrases missed the rewording. The record of truth both withdraws and asserts a single-group blast radius.

**(ii) The "restore" measurement restores nothing from durable state.**
- `measureRuntimeRecovery` (core-scenarios.js:3660-3710) calls `create_node({id:'1', peers:['1','2','3'], learners:[], applied:'0'})`. There is no bootstrap, no hard state, no entries and no ConfState.
- My reproduction of exactly that shape gives the artifact's own figures:
  - 1.2 ms and 262144 bytes at 100 groups.
  - 8.3 ms and 3145728 bytes at 1000 groups.
- The table header "Groups restored into a fresh instance" is therefore not true.
- The owner's minimum fact is "restore a representative set of groups from durable state".
- Two recorded facts are literals, not measurements:
  - `freshInstanceHandleCountAtStart: 0` (:3708).
  - `damagedGroupRetriedForever: false` (:3704), which is asserted at the test's line 189.
- The "restored" groups are never driven.
- The decisive input `acceptableHandleHosting` rests on this, through `trapIsRecoverable`.

**What is genuine (r1.mjs):**
- **Fatal budget:** 304 fatals, then "memory access out of bounds" on every call, including `handle_count` and `create_node`.
- **The re-instantiation is a real new instance:**
  - new exports object, new `__wasm`, new `WebAssembly.Memory`.
  - `handle_count` 0.
  - Memory back to 1245184 from 2818048.
  - `loadForkedCore()` returns the new one.
- **Dead instances do not leak:** after 8 kill/replace cycles and gc, arrayBuffers +0.0 MiB.

**My own restore, from real durable records** (8-entry log, hard state, a changed configuration), four replicas per group:

| | 100 groups | 1000 groups |
| --- | --- | --- |
| nodes restored | 396 of 400 | 3996 of 4000 |
| time | 11.5 ms | 75.2 ms |
| memory | +1.2 MiB | +16.5 MiB |
| one node per group from a real record | 3.8 ms, 327680 bytes | 19.7 ms, 4194304 bytes |

**Damaged groups among healthy ones:**
- Several damaged groups (applied 99 at groups 5 and 37, commit 99 at group 60, truncated log at group 72) were each reported "unreachable", and the runtime stayed healthy.
- On a sample of ten groups (positions 0, 1, 36, 38, 59, 61, 70, 71, 72 and the last) I drove an election, a proposal and a committed RemoveNode. All converged except group 70.
- Group 70 carried a record `create_node` accepts but which is internally inconsistent (ConfState voters rewritten to 1,2,9 on one replica). It diverged silently. That is the integrity obligation already recorded.
- Group 71 (vote=77) was harmless.

**What a host still needs that the measurement does not show:**
- Trap detection.
- Quiescing in-flight Readys.
- Durable reads from SQLite rather than memory.
- Logs longer than 8 entries, and snapshots.
- A policy for the damaged group.

==================================================
ATTACKS a TO h
==================================================

**a. Provenance laundering:** see job 2. A derived value over a laundered durable-record operand works whenever all three operands are branded. An omitted `removing` defaults to an unbranded `[]` and is refused.

**b. Runtime recovery with damaged groups:** see job 4.

**c. Ingress validator (envelope only).**
- **Shape results (c2.mjs):**
  - Still FATAL with the validator passing the message:
    - MsgReadIndex with empty entries to the leader (recorded).
    - MsgReadIndex with empty entries to a follower (NOT recorded).
  - A properly contiguous-prefix non-contiguous append (index 2, entries 3 and 9) passes the validator, is accepted by `step`, and reaches a LATER FATAL on settle.
    - The artifact's row "append with non-contiguous entries | passed | accepted" uses prev index 4 against a follower whose last index is 1.
    - The core simply rejects that as a mismatch. It never exercises non-contiguity, so the residue sentence understates.
  - Passed by the validator and accepted by the core, with effect:
    - Cross-group heartbeat at a higher term from a member id: term 1→7, lead 1→3.
    - Cross-group append likewise.
    - RequestVote from a learner: term 1→5.
    - Heartbeat from self: lead→2.
    - RequestVote from a votersOutgoing-only peer.
    - MsgTimeoutNow from a non-leader: the follower became leader at term 2.
    - MsgTransferLeader from a follower: the leader stepped down.
  - The group check fails open. `message.groupId !== undefined &&` (forked-core-harness.js:273):
    - A misrouted heartbeat with plausible indexes and no groupId passes.
    - With a groupId on the envelope it is refused.
- **The validator DROPS LEGITIMATE TRAFFIC (c1.mjs).**
  - Setup:
    - Voters 1,2,3; node 5 is added as a voter while 3 is partitioned.
    - 5 is elected with the votes of 1 and 2.
    - Peer 1 dies; 3 is reachable again. Three of four voters are alive.
  - Without the validator: commit 6 on 5, 2 and 3, and 3's configuration becomes [5,1,2,3].
  - With the validator:
    - Peer 3 refused all 8 messages from 5: "the sender is not a member of this peer's own ConfState".
    - Commit stays 5 on the leader and 2 on peer 3.
    - 3's configuration stays [1,2,3].
    - Entry 6 never commits.
  - raft-rs itself accepts non-response messages from unknown peers (raw_node.rs:407). Only responses get StepPeerNotFound.
  - The artifact's "rejects nothing in honest traffic" is true only of the one scenario driven, and it feeds `acceptableHandleHosting`.
  - This is a substantive defect of the recorded obligation (md:135, md:421).
  - Caveat: I did not tick peer 3. With ticks it would eventually disrupt, and the outcome depends on who wins.
- **The heartbeat-commit rule itself is legitimate.** raft.rs:868 is `min(pr.matched, committed)`.

**d. Campaigning. CONFIRMED (d1.mjs).**
- `campaign` on learner 4: it becomes leader, all voters vote for 4, and a proposal commits.
- Removed peer 2 (own configuration 1,3, promotable false):
  - 400 ticks: nothing happens.
  - A host `campaign`: voters 1 and 3 granted their votes, the leader was deposed, and the peer panicked at raft.rs:1225:36.
- md:364 and md:438 still state the withdrawn mechanism ("a quorum over an empty voter set is trivially satisfied"), contradicting md:148.

**e. Omitted term/vote persistence. RED.**
- In-loop (commit persisted, never term or vote): the nine-boundary receipt goes red with "term and vote must survive the restart ({"beforeCrash":{"term":"1","vote":"1"},"durable":{"term":"0","vote":"0"},...".
- On restore: 24 of 24 for both vote-dropped and term-zero.

**f. ConfState/applied mismatch, 45 rows through the receipt's checks.**

| Corruption | caught | inert | missed |
| --- | --- | --- | --- |
| old ConfState, applied kept | 24 | 21 | 0 |
| new ConfState, applied rewound | 14 (core refused) | 16 | 15 |
| both rewound consistently | 7 | 16 | 22 |

- Every missed row restored exactly the honest configuration.
- At joint-left with applied rewound to 0, the core re-applies BOTH the enter and the leave entry with no refusal and reaches the same configuration.
- So the obligation sentence "re-applying an enter-joint or leave entry is REFUSED" is over-general. It is refused only when the peer is already joint, or not joint.

**g. Snapshot gap.**
- It is recorded as the named gap `snapshot-and-compaction-surface-is-incomplete`.
- The verdict input is honestly named `readyLifecycleExposed`.
- BUT the wasmBoundary rule sentence still reads "the full RawNode lifecycle is exposed".
  - It appears at md:24 and in `verdicts.wasmBoundary.rule` in the .json.
  - It contradicts the snapshot obligation section, which says the evaluation "does NOT claim the full RawNode lifecycle".

**h. Verdict falsification and ceilings. HOLDS.**
- Each of the 13 inputs set false: red ("the committed artifact is not what the scenarios produce now").
- wasmBoundary.value = viable: red, even with a consistently re-rendered .md.
- Migration set to viable or not-viable: red ("may not be inflated").
- A required gap removed or closed: red.
- In the pure function:
  - All-true inputs with 5 gaps → viable-with-named-gaps.
  - With any one gap missing → not-viable.
  - Consensus is capped at viable.
- A flipped scenario fact: red.
- .md edits: red.
- Under redacted keys, with a consistently re-rendered .md:
  - `fatalsBeforeTheRuntimeDied=5` stays GREEN.
  - `recoveryNanos=9e12` stays GREEN.
  - `groupsRestored=3` goes red.
  - `damagedGroupReported=null` goes red.
- No verdict input reads the redacted values, and the artifact says so. Non-blocking.

==================================================
RE-CONFIRMATIONS
==================================================

- **Host order:** entries and HardState before apply in the Ready phase (forked-core-harness.js:1051-1057), and `persistLightCommit` before the light apply (:1075-1079). ConfState and applied are one write (:1099-1118).
- **Trigger shifts:** 42 of 42 red. 38 are contradicted by named facts and 4 have no such position.
- **Determinism:** 20 of 20 runs of the core files at 20/20. Three artifact builds differ from the committed one only in generatedAt and the nanos keys, 22 leaves each.
- **Isolation leak of one message:** red, "a message crossed the isolation boundary of peer 2".
- **Part A:** 3 of 3 on src/raft/liferaft.js, liferaft-provider.js and sqlite-log-adapter.js. The migration verdict's scenarios are the contract census, peer identity, cost and host surface, so part A is excluded.
- **Constraints:**
  - Nothing under src, examples, .github or .githooks.
  - package.json untouched.
  - Outside test/ and solve/ there are only ignore-list additions (.gitignore, eslint.config.js, knip.json, the two complexity checkers) plus the quest-evidence script.
  - wasm sha256 ae5b1803…d33b matches artifact-digest.json and the artifact.
- **`renderMarkdown(committed json)` equals the committed .md.**
- **The eight obligation sections are present and say what the addendum requires:**
  - pre_vote and check_quorum: "NOT EVALUATED HERE".
  - Promotion gating is Lagrange's.
  - Joint re-application is refused.
  - raft.rs:962 is "upstream behaviour requiring integration testing".

==================================================
DOCUMENT DEFECTS
==================================================

- md:24: "full RawNode lifecycle is exposed".
- md:364-366 and md:438: the withdrawn campaign mechanism.
- md ~372: "caught at every boundary except joint-entered, where they are undetectable" is stale against the table (0 misses).
- Host contract: "confstate-and-applied-written-separately host mutant fails restart equivalence", which is measured as unsafe-recorded.
- The PRODUCTION GAP list has `change` and `forcedLeadership` as duplicates of one fact. 14 counts it twice.
- Multi-Raft table: "Incremental bytes (upper bound)" is 0 at 100 groups, while the recovery table shows 262144 bytes for 100 empty nodes.
- md:208 residue sentence is incomplete (see c).
- md:135 and md:421 validator claims (see c).
- md:186-188 "Groups restored" (see job 4).

==================================================
MY JUDGMENT OF THE THREE VERDICTS
==================================================

- **Consensus core: viable.** Nothing I measured contradicts it.
- **WASM boundary: viable with named gaps.** The recovery gap is real and cheap to cover: about 20 ms and 4 MiB per 1000 single-replica groups from small records.
- **Migration: undetermined.** No decisive incompatibility.

The rejection is of the receipts and the artifact, not of raft-rs.

==================================================
WHAT AN IMPLEMENTER MUST KNOW THAT THE ARTIFACT OMITS
==================================================

- Do not filter non-response messages by the receiver's own ConfState. A lagging follower must accept appends and votes from a member it has not yet learned of. Sender filtering is safe only for responses, which raft-rs already does.
- The group id must travel on the transport envelope, and a missing one must be refused. A same-id cross-group heartbeat or append otherwise moves term, leader and possibly commit.
- MsgReadIndex with empty entries is fatal on followers too.
- A contiguous-prefix non-contiguous append is fatal at the next Ready.
- Any member can depose the leader with MsgTimeoutNow or MsgTransferLeader.
- Restore cost scales with record size. The published figures are for empty nodes.
- A ConfState rewrite on one replica restores silently and diverges.

==================================================
NOT VERIFIED
==================================================

- A crate rebuild, and BUILD.md checksums.
- The test/shards edits.
- The `npm test` corpus and `solve probe`.
- N=1000 functional checks beyond a ten-group sample.
- The MsgSnapshot shape, which was accepted with no visible effect. I did not confirm it decoded.
- An appendResponse beyond the last index. There was no fatal in my run, though round 2 saw a later one.
- The ticked variant of the validator stall.
- The shadow-stack cause of the fatal budget.
- The individual sequential-failure and joint-quorum scenarios.

Subject final `git write-tree`: 1e7a3e2d72d2adfb06a8e11bb6f7c814509f957d.