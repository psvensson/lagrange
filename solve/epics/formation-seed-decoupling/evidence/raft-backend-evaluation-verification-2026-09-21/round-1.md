VERDICT: REJECT

The subject is unchanged: `git write-tree` = 2346faa5a3c7d64c2e69961fd8f92290cbc378ca before and after, and the index is still all A/M. All mutation was done in copies under scratchpad/verifier-raft/. I did not rebuild the Rust crate and did not touch raft-logic.

I think the raft-rs core is good. The evaluation that claims to prove it is not yet sound:
- The restart matrix misses an unsafe host ordering that raft-rs documents by name.
- The artifact declares that hazard "not a gap".
- The restore check is circular.
- Several receipts stay green under the owner's required attacks.
- One sealed receipt is flaky.

## Blocking defects

**B1. Unrestartable durable record from the honest host loop.** Evaluation-claim defect plus harness defect. It is a hosting-model obligation, not a raft-rs defect.
- What is wrong:
  - The loop in forked-core-harness.js:353-416 applies committed entries, writing a durable applied index at :438-440, before it persists that Ready's HardState at :391.
  - Every matrix row has the conf entry alone in its batch, so the matrix never sees the consequence.
- Reproduction (a2b.mjs):
  - I proposed one normal entry and then the conf change, with the unmodified harness.
  - I stopped a follower at committed-not-applied and again at conf-state-recorded-not-advanced. The durable record had applied 2, commit 1, last 3.
  - `restart` died with: "panicked at raft-0.7.0/src/raft_log.rs:314:13: applied(2) is out of range [prev_applied(0), min(committed(1), persisted(3))], raft_id: 2". JS sees only "unreachable".
- raft-rs documents this hazard at src/lib.rs:304-310: "apply index can be larger than commit index and cause panic. To solve the problem, persisting commit index with or before applying entries."
- What the evaluation says instead:
  - build-evaluation-document.js:717-747 records the named gap `durable-commit-lags-the-applied-effect-inside-one-cycle` with `isAGap: false` and "the commit index is volatile by design ... not a defect".
  - The INTENTIONALLY_INDISTINGUISHABLE exemption (core-scenarios.js:521-558) rests on the same reasoning.
  - hostMustGuarantee omits the obligation.
- Corrected-order variant (copy `ord`, HardState persisted before apply):
  - The mixed-batch restart succeeds.
  - committed-not-applied becomes a distinct durable state (commit 2, applied 1).
  - The isolated restart re-applies the conf entry from its own log (applyCalls ["2"], restored voters 1,2,3,4).
- In the submitted artifact `recoveredFromOwnLogAlone` is false and `applyConfChangeCalls` is [] in all 18 rows. The defining path of "restart reconstructs membership from durable state alone" was therefore never exercised. The exemption is an artefact of a host order raft-rs warns against, not something the raft-rs contract proves.

**B2. ConfState and the applied index are not atomic, and the resulting core refusals are swallowed and unreported.** Evaluation-claim defect.
- At conf-state-recorded-not-advanced, joint-committed and joint-left the honest loop leaves a new durable ConfState with durable applied below confIndex.
- The harness's own mutant classifier labels exactly that state unsafe: "the durable configuration is ahead of the durable applied index (1 < 2)".
- After reconnecting (probe1/v2.mjs):
  - joint-committed, both roles: `{"index":"2","error":"apply_conf_change: config is already joint"}`.
  - joint-left, leader: `{"index":"3","error":"apply_conf_change: can't leave a non-joint config"}`.
- The catch at forked-core-harness.js:474-484 advances past the refusal. The restart record surfaces `applyRefusals` only for the isolated window, where they are empty.
- The host contract never says ConfState and applied index must be written atomically.

**B3. `localRestoreCorrectness` is circular (question B).** Harness defect.
- `entitledConfState` is the same `create_node` call on the same record. It proves only that `create_node` returns the ConfState it was handed. The one semi-independent check is the coarse old/new classification.
- Corrupting the durable record before restart (a4.mjs):
  - add voter 9: red locally ("classification") in 8 of 18 rows; red only by convergence in 10 of 18.
  - drop a voter: the same 8 and 10 split.
  - learner into voter: silently accepted on joint-entered for both roles, 8 rows red, 8 not applicable.
  - drop the outgoing set: red on joint-committed only, the one place it applies.
  - applied behind (0): silently accepted in 16 of 18.
  - applied ahead of the log, or ahead of commit: core panic at raft_log.rs:314.
  - HardState vote dropped or term 0: silently accepted in all 18.
- In-loop attack 6:
  - omitting all HardState is caught only incidentally ('unreachable', plus "a Ready must have been advanced at least once").
  - persisting commit but never term or vote leaves all 14 core tests green.
- So the evaluation cannot see, in its own adapter, the term/vote defect that part A charges liferaft with.

**B4. Boundaries assert no distinguishing facts (attack 1).** Harness defect.
- The test checks only that the nine signatures differ.
- I shifted each trigger one Ready earlier and one later, for both roles, 36 cases in all. 32 went red, by "HOST signature collision" or "could not be driven honestly". 4 stayed green:
  - joint-entered +1, both roles. Signature `false|false|true|...`, which is really committed-not-applied for the enter entry.
  - joint-left −1, both roles. Signature `true|false|false|false|false|true|true|old|old|no-entry|true`: the victim crashed while still joint, before the leave entry existed, and the "joint-left" receipt passed.

**B5. Not deterministic, and one sealed receipt is flaky.** Harness defect. This violates `deterministic-drives`.
- 40 runs of the core files: 3 failures, each on "a change no durable log records may never take effect / null !== false".
- 200 runs of `runLostProposal`: 13 had no leader.
- Cause (300 runs, 17 no-leader):
  - `cluster.tick(30)` ticks every peer 30 times with no delivery in between.
  - Both survivors campaign in lockstep: "2:state1/term13/lead0 3:state1/term13/lead0".
- Regenerating the artifact changes `newLeaderAfterCrash` in 6 leader-victim rows, including to and from null. raft-rs's election RNG cannot be seeded through the binding.

**B6. The derivation and core-read receipts check shape, not substance (J and attack 11).** Harness defect.
- I set every consensus and WASM input to false in a copy of the JSON, falsified a scenario, left `value: viable` and left the .md alone. The derivation test stayed green.
- No receipt regenerates the artifact, and the .md is not compared to the .json.
- Attack 11:
  - the direct literal is caught: "core-restart-and-ordering.test.js:95 declares the membership it then checks".
  - routing the literal through a const stays green.
  - using `deepStrictEqual` stays green.
  - using `.length` or `.join()` stays green.
  - a scenario whose `after` is a declared object stays green on both this receipt and the caches receipt.
  - the tagging binds only where a scenario chooses to call `coreField`, and the runtime half reads the static artifact.

## The 11 owner attacks
- **1. Shift each trigger one Ready:** succeeded for 4 of 36 cases (B4).
- **2. Boundary tied to the conf entry:** robust.
  - With a normal, conf, normal batch every stop fired on entry 3.
  - An armed stop under normal-only traffic never fired (`stoppedAt` undefined, last index 6).
  - This attack exposed B1.
- **3. Leak a message during isolation:** the counter is sound but the window is never challenged.
  - A one-message leak, and isolation disabled entirely, both left the nine-boundary test green. No traffic exists in that window: every counter is 0 in all 18 rows.
  - With ticks forced, the leak gives 'a message crossed the isolation boundary of peer 2', and disabled isolation gives "no message may be delivered during the isolated restore window".
  - `delivered` counts cluster-wide, so a live window cannot pass even honestly.
  - Convergence alone cannot satisfy the restore assertions, but it is the only guard in 10 of 18 ConfState corruptions.
- **4. Corrupt durable ConfState:** succeeded (B3).
- **5. Corrupt the applied index:** behind is silently accepted; ahead is refused by a core panic (B3).
- **6. Omit HardState persistence:** omitting term and vote is undetected (B3).
- **8. Learner into voter on restore:** succeeded on joint-entered (B3).
- **7. Reuse a removed peer id:**
  - The core enforces nothing. It re-added removed id 3, and an amnesiac empty replica under id 3 was caught up to commit 5.
  - Identity is entirely a host obligation, and the contract says so.
  - The mapping half is a test double with tautologies (`stableAcrossRestart` and `stableAcrossAddressChange` are the same expression) and an in-memory retired set.
  - The `stablePeerIdentity` input is only `mapping.deterministic`, and it is filed under consensusCore, where it does not belong.
- **9. Second pending ConfChangeV2:** the observation is confirmed.
  - Both proposals return ok, the leader commits types [2,0], the second never takes effect even after 40 ticks, and the test asserts only consistency.
  - A second change proposed after the first is applied takes effect. `pendingConfIndex` stays at 2 after the apply, so it is not a change-in-progress signal on its own.
  - A follower's proposal is forwarded and works. Two followers forwarding gives [2,0] with both returning ok.
  - With no leader the call throws "raft: proposal dropped".
- **10. Alter the service caches:** the claim is true by my reading. The harness has no ambient input, only node builtins and the glue. The test of it is weak:
  - The caches are a constant that nothing reads.
  - The regex inspects one parameter list.
  - My `globalThis`-driven cache leak restored peer 2 as ["1","2","9"] with all three invariants tests green.
- **11. Replace a core membership read with a declared set:** succeeded four ways (B6).

## Questions A to L
- **A. Distinctness and the exemption.**
  - I recompute 6 of 9 per role, and the identical-restore check is real.
  - Every citation I checked is genuine; the crate checksum is f12688b2…5bae. But the citations do not prove the exemption (B1).
  - joint-entered ("enter entry durable, not applied") is a defensible Raft-paper reading.
  - Missing boundaries:
    - durably committed but not applied.
    - joint with the leave entry durable but not applied.
    - the auto-leave entry self-appended before any tick.
    - a retained follower while joint. The follower joint rows use the removed peer.
    - any lightReady-phase apply.
    - any batch containing normal entries.
- **B. Is the restore check circular?** Yes, it is (B3).
- **C. Lost proposal and the one-follower variant.**
  - The withholding is read from durable records, and the change never takes effect when a leader is elected.
  - In the one-follower variant (40 runs) the change usually commits, which is legitimate. The old leader restores 1,2,3 and later learns 1,2,3,4. There was no divergence in any run.
- **D. Host-order mutants.**
  - Three are refused, two fail restart equivalence, four are recorded unsafe. None passes silently.
  - The honest-loop control returns passed-silently, so the labels are real checks. The flag call does hardcode `durableIsNew || true`.
  - My own mutants:
    - sending persisted messages before persisting passed silently.
    - dropping the conf entry from persistence was refused.
    - double advance passed silently. The extra `advance_append` is refused with "advance_append called without pending ready", but the classifier ignores that refusal.
- **E. Host contract and citations.**
  - I checked 8 or more citations and all are real. raft.rs:206-216 supports "one pending", not "neutralised".
  - The write-log assertion has only three order pairs.
  - A deferred ConfState write goes red: "the returned ConfState must be recorded before the apply index advances...".
  - Persisting after advance goes red, by panic.
  - Message order is unguarded.
  - The "nothing may be sent..." measurement is vacuous: no route call exists between the apply and that stop.
- **F. Consensus logic in JavaScript.** No JS decides quorum, commit, leadership or log matching. Catch-up is read from the core's progress, but the promotion is not gated on it.
- **G. The fork.**
  - The new exports are thin pass-throughs.
  - Ids up to 2^64−1 cross exactly as strings through conf change, progress, vote and lead.
  - A JS number id is refused.
  - `pending_conf_index` crosses as a JS number.
  - Corrupt base64 conf-entry data decodes as {transition 0, changes []}, which is a leave-joint request. This comes from `.unwrap_or_default()` at lib.rs:758.
  - Panic poisoning, the most serious finding here:
    - A raft-rs `fatal!` inside `with_node` ("to_commit 2 is out of range [last_index 1]") leaves NODES borrowed.
    - Every later call on any handle then traps "RefCell already borrowed". This includes `free` (lib.rs:543) and `create_node` (lib.rs:476).
    - In the one-runtime hosting shape, one group's fatal kills all groups until the module is re-instantiated.
    - Those panic line numbers match the checked-in lib.rs, which is evidence the wasm was built from it.
- **H. Part A (liferaft).**
  - 3 of 3 tests are green on the real production owners. LifeRaft is constructed directly rather than through the init closure, which does not touch term or vote.
  - My grep confirms that `persistTerm`, `persistVotedFor`, `setTerm` and `setVotedFor` have no callers in src.
  - The only durable term writer is snapshot-install.js:179.
- **I. Contract census.**
  - The census is mechanical: 7, 4, 40 and 12 names.
  - The forecast counts only the 4 membership-local names.
  - I would move `leader`, `state`, `commitEntries` and `prepareCommitApply` to MUST SERVE.
  - `change` (init-base.js:605 forces LEADER) has no raft-rs equivalent. It should be listed as a production gap.
- **J. Verdict derivation.**
  - B6 covers the derivation check.
  - Migration has no part-A inputs.
  - The .md has no false statements or placeholders.
  - It omits:
    - the Multi-Raft preliminary statement, which is in the JSON only.
    - the narrowed re-application statement.
    - any sequential-against-joint section.
  - It says "nine DISTINCT host states" without giving the 6 of 9 durable figure.
  - Several verdict inputs are just "was driven".
- **K. Constraints.**
  - Clean against HEAD 7e63c9363.
  - Only ignore-list edits.
  - Root package.json is unchanged.
  - The digests match.
  - The toolchain and checksums are pinned.
  - Reproducibility is reported as `differs`.
  - The decision record shows as a deletion only when diffing against a newer main.
- **L. Sanity re-measure.** At N=1000: tick 93 ns per group, create 5.5 µs, has_ready 155 ns, Ready cycle 763 ns, one conf change 185.5 µs. These match the artifact.

## The three verdicts, from my own measurements
- **Consensus core: viable.** In everything I measured the core handled commit, joint consensus, pending-change neutralisation and re-delivery from its own log correctly, and it refused inconsistent restores loudly.
- **WASM RawNode boundary: viable only with named gaps, not unqualified.** Panic poisoning, the base64 default, `pendingConfIndex` as a JS number, and no RNG seeding are all fixable in the binding.
- **Migration: undetermined.** I found no decisive incompatibility.

## What a future backend implementer must know that the artifact omits
- Persist the commit index with or before applying (raft-rs src/lib.rs:304-310).
- Write ConfState and the applied index atomically; never swallow `apply_conf_change` errors.
- Assert that term and vote survive a restart.
- A raft-rs fatal traps the shared runtime and can be triggered by a peer's message.
- `propose_conf_change` returning ok means nothing, and `pendingConfIndex` does not clear.
- A proposal whose leader died before persisting it can still commit.
- The core does not check id reuse; the retired set needs durability.
- Elections cannot be seeded.
- The forced-leader `change` call has no raft-rs equivalent.

## Not verified
- The WASM rebuild and reproducibility.
- The sequential-failure-matrix, joint-quorum and auto-leave scenarios individually.
- The spike census.
- The edits to test/shards/*.json.
- BUILD.md checksums other than raft 0.7.0.