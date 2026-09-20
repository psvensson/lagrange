VERDICT: REJECT

I am rejecting `raft-backend-evaluation` at round 2: four blocking receipt or claim defects remain, three of them the same class as round 1. The consensus core and the WASM RawNode boundary both look viable from my own measurements, and I found no decisive incompatibility.

The subject is unchanged. `git write-tree` = e348fa2da1766cd3ad6e2f3371fb7a18938e8c37 before and after, and the index is still all A/M. All mutation happened in copies under scratchpad/verifier-raft2/. My scripts there are b1.mjs, b1b.mjs, b2.mjs, b3.mjs, b3b.mjs, b4.mjs, b6c.mjs, p2a.mjs, p2a2.mjs, p2b.mjs, p2c.mjs, p2d.mjs, p2e.mjs, al.mjs, snap.mjs and m.mjs. I did not rebuild the crate, did not touch raft-logic, and used no network.

The host-model half of round 1 is genuinely repaired: host order, atomic ConfState+applied write, refusals, trigger shifts, determinism, isolation and verdict derivation. Same class as round 1: the ConfState restore oracle, the core-read receipt and the host-order mutant classifier still pass while checking shape, and the mutant classifier is the one the repair said it had fixed. The repair's own new surface also overclaims the panic-isolation fix.

==================================================
PART 1: ROUND-1 DEFECTS RE-RUN AS ATTACKS
==================================================

**B1 host order: CLOSED.**
- Reading the loop:
  - Ready phase: forked-core-harness.js:734-740 persists entries and HardState before `applyCommittedEntries`.
  - LightReady phase: :758 `persistLightCommit` runs before :761.
- b1.mjs used the unmodified harness, 252 drives:
  - Stops: all 6 in-cycle stops. Roles: follower and leader.
  - Batches: (n,c,n), (n,n,c,n,n), (n,n,c), (c,n,n), (n, settle, c), (c).
  - Changes: simple, explicit joint, auto joint.
  - Shapes: 3-voter and single-voter. 24 rows reached the apply in the LightReady phase.
- Results:
  - 252 of 252 restarted. 0 core refusals. All converged. Durable applied was never above durable commit.
  - The isolated restart re-applied the entry exactly where durable commit >= confIndex and durable applied < confIndex. I saw 0 mismatches either way, with isolation on, so nothing was delivered.
- b1b.mjs: across 20 conf applies, every `confStateAndApplied` write was preceded by a durable commit and an entries write covering it, including 4 LightReady commit writes. 0 violations.
- A Ready carrying a snapshot (snap.mjs, hand-built MsgSnapshot to a learner):
  - It persisted and restarted OK.
  - The host loop leaves the durable `appliedIndex` at "0" after storing a snapshot at index 5. Only raft-rs's tolerance saves the restart. Non-blocking harness inaccuracy.
  - The snapshot path is outside the matrix, and the binding exports no snapshot or compaction primitive.
- Stale comment: the header at forked-core-harness.js:8-18 still describes the pre-repair order. Non-blocking.

**B2 atomicity and refusals: CLOSED for the honest loop. Two catch sites remain.**
- b2.mjs instrumented every swallowed refusal across all exported scenarios. The honest loop produced 0 `apply_conf_change` refusals anywhere.
- Catch 1, forked-core-harness.js:850-862:
  - It still catches an `apply_conf_change` error, records it, and advances applied past it.
  - Only the victim's list is asserted (core-restart-and-ordering.test.js:129), and only in the matrix and the mutants.
  - It fired 7 times, all inside the corruption table: applied-behind at joint-committed and joint-left, giving "config is already joint" ×5 and "can't leave a non-joint config" ×2.
  - Those rows record `refusal: null` and never surface the refusals.
  - The applied-behind host-obligation text says the core "re-delivers the entries above it and re-applies them". For joint entries the core refuses. Non-blocking evaluation-claim defect.
- Catch 2, forked-core-harness.js:1099-1108:
  - It catches every `step` error into `stepRejections`. The comment says "the scenarios report the count", but nothing in any scenario, test or the builder reads `stepRejections`.
  - Across the honest scenarios there were 42 entries, all "cannot step as peer not found" and benign.
  - In p2e.mjs this same catch swallowed a core FATAL ("2->3 t6: unreachable"). The run only got loud later, through "invalid handle". Non-blocking harness defect.
- Other catches:
  - core-scenarios.js:1175 (campaign in the isolation window) also wraps the `settle()`. An ISOLATION_BREACH thrown there would become `victimSpoke.refused`, and the test accepts any truthy `victimSpoke`. I could not make this fire with a real leak, because inbound traffic occurs outside that `try`.
  - :109, :1107, :571, :577, :2895 and :3206 record observed outcomes and are fine.
  - :2143, :2231, :2832 and :3576 treat a throw as the measured outcome and are fine.
  - :2239, :3643, :3711 and :3716 guard cleanup and are fine.

**B3 oracle: PARTLY CLOSED. BLOCKING. Harness defect, same class as round 1.**
- Closed locally:
  - Vote-dropped and term-zero go red on 24/24 rows: "term and vote must survive the restart (...)".
  - In-loop "commit persisted, never term/vote" goes red with the same message.
  - Applied-ahead-of-log and applied-ahead-of-commit are refused by the core, 24/24.
- Not closed:
  - The receipt's ConfState oracle is still `restoredConfState == entitledByDurableState` (core-restart-and-ordering.test.js:97-106). Both sides go through the same `create_node`.
  - The new corruption table has its own oracles: defining facts recomputed from the corrupted record, and the survivors' ConfState. The restore receipt does not apply them.
- b3.mjs patched each corruption into the real receipt path, between crash and restart, and ran `assertOneBoundaryRow`:
  - add-voter: caught by a local assertion in 4 of 24 rows and only by the convergence claim in 20 of 24. drop-voter: the same. The artifact claims 18 of 24 "caught locally", and the attempt note says "none caught by convergence".
  - learner→voter: 7 rows stay green, 4 of them benign because the change itself promotes that learner.
  - drop-outgoing: 3 joint-committed rows stay green in the receipt. The table says "caught-locally-everywhere".
- Decisive demonstrations (b3d):
  - A simulated binding restore bug that drops the learners set on every `create_node`: all 7 restart tests GREEN.
  - One that truncates the outgoing set passes all 45 matrix rows. It is caught only by the separate auto-leave boundary ("the restart must reconstruct exactly the durable configuration").
  - A service-row cache injecting learner 9 into every restored ConfState through an env var: all 15 core tests GREEN. Restored learners were ['9']; the durable record and the pre-crash core both had []. This is the owner's "no service-row cache may repair it" attack, and it succeeds.
- Are the "undetectable from durable state alone" rows genuinely undetectable? b3b.mjs says no:
  - At joint-entered and lightready the honest restored ConfState equals the pre-crash core read that is already recorded in `facts.inMemoryConfStateFull`. That oracle catches every add, drop and learner→voter row listed as undetectable. It was not wired.
  - At joint-leave-durable-not-applied, the survivors oracle catches add and drop. `survivorConfStateDisagrees` gates it off when applied < confIndex.
- The fix is small: assert the full restored ConfState (voters, outgoing, learners, learnersNext, autoLeave) in the receipt.
  - Where nothing is re-applied, compare with the pre-crash core read or the durable ConfState that `apply_conf_change` returned.
  - Where it is re-applied, compare with the survivors.

**B4 trigger shifts: CLOSED.**
- b4.mjs shifted every row's trigger by whole Ready cycles (−2, −1, +1, +2) for all 45 specs, 180 cases. 0 stayed green.
- 17 were driven and contradicted by named defining facts, including joint-entered +1 in both roles, which was a round-1 survivor. 163 could not be driven.
- The defining facts are real assertions (core-restart-and-ordering.test.js:346-353).
- A crash one Ready before proposed-not-persisted is durably identical to it. That is inherent, not a defect.

**B5 determinism: CLOSED.**
- 40 runs of the core test files: 40 of 40 at 15/15 pass.
- 5 artifact builds against the committed one: only generatedAt and 5 of the declared measurement keys differed. The .md differs only in those figures.
- What "only the leader ticks + forced campaign" loses (p2c.mjs, p2e.mjs):
  - A removed peer that has not learned of its removal and is ticked campaigns repeatedly. In my run it reached term 28, deposed the live leader on reconnect, and the group went to term 32.
  - The voters GRANTED their vote to a non-member (peers 1 and 2 showed vote=3). No pre_vote or check_quorum is configured or mentioned anywhere in the artifact.
  - No safety claim I found depends on followers never ticking. The disruptive-server behaviour is simply never observed or named.

**B6 substance: derivation CLOSED; core-read receipt NOT CLOSED. BLOCKING. Harness defect, same class as round 1.**
- Closed:
  - JSON input false with the value untouched → "the committed artifact is not what the scenarios produce now".
  - Migration value=viable → "the migration verdict may not be inflated by this quest".
  - Scenario fact flipped → red.
  - .md edited ("PRELIMINARY"→"FINAL", or a cost figure) → "the committed .md is not the rendering of the committed .json".
- Redaction:
  - A JSON-only edit of `growthBytes` and `bytesPerFatalBound` to 50 MB per fatal stays GREEN, because the key is redacted and not rendered.
  - No cost number feeds any verdict input: `handleHostingHolds` uses booleans only, so a 1000x regression cannot change a verdict. Non-blocking, but it should be said in the document.
- Brand (b6c.mjs):
  - Branded arrays are not frozen. Emptying one and refilling it with 7,8,9 keeps the brand and audits as "core-read".
  - A spread clone is refused. Good.
  - `changedNodeIds(confChangeV2([...ids I invent]))` mints a branded declared literal. A "requested change" is never checked against what was proposed to the core.
  - `derivedMembership` over an invented change is accepted.
  - Mutating a core-read ConfState in place and then reading it through `membershipArray` is accepted.
- Owner attack 11 on the real receipts (b6b):
  - I replaced the three-voter scenario's core read with a declared set laundered that way.
  - "a three-voter group elects..." and "membership in every scenario is reported by the core, not declared" both stay GREEN.
  - After regenerating the artifact, 25 of 25 receipts are green. The only trace is `"requested-change": 12` in the provenance audit, and nothing bounds it.
  - ATTACK SUCCEEDED.
- Static census:
  - On synthetic sources it does not see an aliased assert, a destructured `{voters}`, a JSON.stringify helper, if/throw, an indexed loop over a destructure, or a computed key.
  - In the real subject file, a destructure + if/throw against '1,2,3', plus a helper with a computed key, left all 9 receipts green. ATTACK SUCCEEDED.
  - A literal inside an assert is still caught, by the older lexical check: "core-membership-scenarios.test.js:51 declares the membership it then checks".

**Isolation: CLOSED.**
- Five variants, all red:
  - One-message leak: 'a message crossed the isolation boundary of peer 2'.
  - Leak with the guard removed: "no message may be delivered during the isolated restore window".
  - Isolation off: the same two messages.
  - Outbound-only leak: "the survivors no longer address this peer...", plus the lost-proposal receipt.
- Per-victim counters are real.
- `victimStillAddressedBySurvivors` (core-scenarios.js:1448-1450) is read from the core but ignores votersOutgoing. The joint-entered and joint-committed follower rows show addr=false with 1 inbound message blocked. That is non-blocking and only weakens the assertion. The rows with 0 inbound (joint-left, leave-durable, lightready) are genuine.

**Caches: PARTLY.**
- The live and poisoned caches scenario holds, but it only proposes normal entries. It contains no restart and no conf change.
- My env-var leak into the restore path passed everything (see B3).

==================================================
PART 2: NEW SURFACE INTRODUCED BY THE REPAIR
==================================================

**a. Panic isolation: PARTLY. BLOCKING as an evaluation-claim defect, and a finding about the WASM binding and hosting model.**
- `with_node` (raft-core/src/lib.rs:924-933) does fix the RefCell poisoning. After a fatal, bystander groups ran full joint scenarios with restarts, fatals inside `create_node` (raft_log.rs:314) left the table fine, and free, has_ready, status and tick on a dead handle behaved sanely.
- p2a2.mjs: after exactly 304 fatals (deterministic, two runs), EVERY call on EVERY group in the runtime traps "memory access out of bounds".
  - That includes `conf_state`, `status`, `tick`, `has_ready` and `take_ready` on a long-lived bystander, plus `create_node` and even `handle_count`.
  - I believe each abort leaks the shared shadow stack. 1 MiB / 304 ≈ 3.4 KiB, and the wasm exports `__wbindgen_add_to_stack_pointer`. I did not read the stack pointer directly.
- What the artifact says:
  - The leak bound rests on 20 fatals of linear-memory page growth (0 bytes), under a redacted key.
  - The .md says "The blast radius is exactly the group that caused the fatal", status `found-and-fixed-in-this-fork`, one-runtime "STANDS".
  - The decisive input `acceptableHandleHosting` includes `runtimeStillUsableAfterRepeatedFatals`.
- The correct statement is: "stands, with re-instantiation of the module as the recovery path; fatals are a finite per-instance budget, and they are remotely triggerable".
- Message shapes that reach a fatal through `step` (p2b.mjs):
  - Heartbeat with commit beyond last index: raft_log.rs:292. It fires from the leader, from a NON-leader, from an UNKNOWN peer at a higher term, and with `to != self`.
  - MsgReadIndex with empty entries to a leader: raft.rs:2125, index out of bounds.
  - An append with non-contiguous entries: a later fatal at storage.rs:493.
  - An AppendResponse claiming an index beyond the leader's last: the leader dies later.
- Refused cleanly: a response from an unknown peer, local message types, and an unknown msgType.
- In a Multi-Raft host, one misrouted heartbeat between groups is a fatal. The host must validate group and recipient before `step`. The artifact omits this.

**b. raft.rs:1225: CLOSED as a host obligation. The mechanism in the artifact is mis-stated. Non-blocking.**
- Ticks cannot reach it:
  - A removed peer that applied its removal never campaigned in 400 ticks (raft.rs:1083 requires `promotable`).
  - A removed peer restarted from its record: the same.
  - MsgTimeoutNow: no panic (raft.rs:2352).
- Only a host `campaign()` reaches it. Measured (p2e.mjs):
  - The real voters voted for the removed peer.
  - The leader was deposed.
  - The removed peer then panicked on the winning vote response.
- This is not the "quorum over an empty voter set" the document describes.
- A host `campaign()` on a LEARNER does not panic. The learner BECOMES LEADER (lead=4 on the voters) and commits. The artifact omits this.

**c. unstable-log gap:**
- It blocks only test-side and simulator observation.
- The host persists from `Ready.entries`, so nothing the host must persist is unobservable. Fine as named.

**d. Mutant classifier: NOT CLOSED. BLOCKING. Harness defect, same class, and the defect the repair said it fixed.**
- m.mjs ran the honest loop (`none`) and an inert mutant through the classifier: ready-advanced → passed-silently, recorded-not-advanced → passed-silently, conf-applied-not-recorded → unsafe-recorded.
  - The message at that third stop was "the durable configuration is ahead of the durable applied index (2 < 3); the restart was handed a configuration...".
  - At that stop the durable configuration is OLD, so that finding is wrong.
- Cause, core-scenarios.js:2808-2811:
  - `durableIsNew || true` is hardcoded.
  - `durableIsNew` compares a value with itself, so it is always false.
- `runHostOrderMutant` takes the worst of three stops, so ANY mutant, including one that changes nothing, scores `unsafe-recorded`.
  - `survivors: []`, and the decisive input `mutantsKilled`, cannot fail.
  - The receipt has no honest control.
- My measurement says the conclusion itself holds. Ignoring that stop, all 11 mutants are still caught at the other two.

**e. Boundary definitions:**
- Correct as durable positions: joint-entered (enter entry durable, uncommitted, unapplied), joint-committed (applied + joint ConfState durable, not advanced), and the four new ones.
- Still missing, at most three:
  - A Ready carrying a snapshot: its ConfState and applied index. The loop leaves applied at 0.
  - Leader change while joint with AUTO. My al.mjs shows the new leader does leave at 4 stops, but raft.rs:962 carries the TODO "it may never auto_leave if leader steps down before enter joint is applied", and nothing in the artifact mentions a fallback.
  - A removed peer's own restart and ticks after its removal. It was benign in my run, but no matrix row covers it.

**f. Exemption {committed-not-applied, conf-applied-conf-state-not-recorded}: LEGITIMATE.**
- The image and the re-apply are identical in all four role × batch rows of the artifact.
- In my 42 shape, change and role combos, the durable record, isolated re-apply calls, restored conf and status, and final state were identical. 0 differences.

==================================================
PART 3: CLAIMS AND DOCUMENT
==================================================

**Citations:**
- I checked 9 and all are genuine: main.rs:288-293 and :337-339; raft.rs:204-216 and :961-982; restore.rs:103; raw_node.rs:302-311 and :397-399; lib.rs:304-310; storage.rs:106-112.
- raft.rs:206-216 supports "one pending", not "neutralised".

**Document statements that are false or stronger than the measurements:**
- "add-a-voter, drop-a-voter and learner-into-voter are caught at every boundary except joint-entered" contradicts the artifact's own table. `notCaughtAt` also lists joint-leave-entry-durable-not-applied ×2 and lightready-phase-apply.
- The panic-isolation "blast radius" and "found-and-fixed" statements (Part 2a).
- "every host-order mutant killed" is vacuous (Part 2d).
- The campaign mechanism (Part 2b).

**Present and correct:**
- Multi-Raft is labelled PRELIMINARY with the no-extrapolation sentence.
- Re-application is narrowed to the one sentence.
- Sequential and joint replacement are separate, with NO recommendation.
- All three distinctness figures are present.
- Part A is 3/3 on the real src owners and excluded from the migration verdict.

**Contract census:**
- The .md does not render the four-category contract census at all. It is JSON-only.
- In the JSON: MUST SERVE 11, MEMBERSHIP-LOCAL DELETE CANDIDATE 4 (join, joinPeer, leave, nodes), DIFFERENT IMPLEMENTATION 36, PRODUCTION GAP 13. The forecast counts only the 4.
- `change` (forced leader) sits under DIFFERENT IMPLEMENTATION and has no raft-rs equivalent.

**Constraints: clean.**
- Nothing under src, examples, .github or .githooks is staged.
- package.json is untouched.
- Only ignore-list additions in eslint.config.js, knip.json and the two complexity checkers, plus the .gitignore target line.
- wasm sha256 ae5b1803…d33b matches artifact-digest.json and the artifact.
- The wasm contains the fork's strings ("conf change entry data is not valid base64") and all fork exports.
- The exported names equal upstream plus the 9 fork additions.

==================================================
MY JUDGMENT OF THE THREE VERDICTS
==================================================

- **Consensus core: viable.**
  - 252 of 252 restarts across batches I chose converged with zero refusals.
  - Re-apply from the peer's own log happened exactly where it should.
  - Joint and auto-leave survive leader death.
- **WASM RawNode boundary: viable with named gaps.** The artifact's list needs five additions:
  - a finite fatal budget per instance, about 300, with module re-instantiation as recovery;
  - remotely triggerable fatals, and the recipient and group validation that follows from them;
  - no snapshot or compaction primitive is exported, while `fullRawNodeLifecycleExposed` is claimed true;
  - pre_vote and check_quorum are neither exercised nor mentioned;
  - `campaign()` on any non-voter is hazardous, and a learner becomes leader.
- **Migration: undetermined.** No decisive incompatibility found.

==================================================
WHAT A REAL BACKEND IMPLEMENTER MUST KNOW THAT THE ARTIFACT STILL OMITS
==================================================

- Validate `to == self`, the group id and sender membership before `step`.
- Treat a trap as a dead group, and re-instantiate the module before fatals accumulate.
- Enable pre_vote or check_quorum, or stop removed replicas ticking, because voters grant votes to non-members.
- Never call `campaign()` on a learner or a removed peer.
- A snapshot moves the durable applied index and ConfState atomically.
- The binding needs a compaction or snapshot primitive.
- Re-applying a joint enter or leave is REFUSED, not idempotent.
- Integrity-check the full ConfState, not only the voters.
- `change` (forced leader) has no raft-rs equivalent.

==================================================
CLASS OF THE BLOCKING DEFECTS
==================================================

- "A host model that violates raft-rs's contract" (B1, B2) is closed.
- Three blockers are the SAME CLASS as round 1: evaluation receipts that pass while checking shape.
  - The B3 ConfState restore oracle is still circular in the receipt.
  - The B6 core-read brand can be laundered and the census bypassed.
  - The 2d mutant classifier still cannot fail.
- They are narrower than round 1, and each is fixable in tens of lines.
- The fourth blocker is new: the overclaimed panic-isolation conclusion.

==================================================
NOT VERIFIED
==================================================

- A crate rebuild and reproducibility.
- BUILD.md checksums.
- The test/shards/*.json edits.
- Each individual sequential-failure and joint-quorum scenario.
- The shadow-stack cause of the 304-fatal death. It is inferred, not read from the stack pointer.
- A snapshot produced by a real leader, because the binding cannot produce one.