# Conflict analysis: lane 89e70949f x candidate 10c2f0610

This is analysis only. Nothing in the repository was edited, and no composition has been done or claimed.

- Ours (the lane): `origin/work/rs-raft-event-reconciliation-20261016` @ 89e70949f (381 commits past the base).
- Theirs (the candidate): `origin/integration/rs-raft-candidate-20261011` @ 10c2f0610 (59 commits past the base).
- Merge base: e7c89f4b5 ("tx1: regenerate the receipt after increment 4 ...").

I reproduced the 9 diff3 merges with `git merge-file` on copies in the scratchpad `m3/` directory (see section 6). The hunk counts match the lead's capture.

## 0. Root cause: one finding explains 8 of the 9 conflicts

The lane did not get FreshMG from the candidate. It got it from **unreviewed snapshot 4151a3ab4**, "Ephemeral exact-byte proof snapshot only; not reviewed or landed". That commit's parent is the base, it touches 1338 files, and it is the same commit as `origin/checkpoint/rs-raft-preservation-20261012T040836Z/tx1-owner-wip`.

For the files in question, that snapshot carries the bytes of `origin/checkpoint/.../freshmg-wip` **bfd5611e7**. bfd5611e7 is an unreviewed WIP child of the candidate's own C2 commit 50a003b86. It implements "option D" from `solve/quests/message-group-fresh-identity-membership/design-promotion-history-2026-10-11.md`, which exists only at bfd5611e7. That design's status line reads: "Owner accepted option D for implementation on 2026-10-11. No implementation approval or merge-readiness claim."

Option D is one immutable, apply-owned committed **PROMOTE fact**, stored in a new `promotion_admission` column of the permanent peer reservation. It is the proposed fix for the F1/J1 defect of reviewed C2. The candidate pins that defect as stuck in `test/integration/message-group-learner-promotion-recording-guards.integration.test.js:467` ("V2 (real schedule, F1) ... debt stays for an operator (J1)").

The option-D delta from 50a003b86 to bfd5611e7 covers 19 src files. The snapshot copied 11 of them byte for byte:

- the raft fact files: context, read, operation-port, peer-identity, peer-identity-constants, application-transaction-owner;
- the rebalancer files: authorization, permit, owner-claim, promotion, successor.

It did **not** copy the other 8. These are the ones that carry the fact through images (snapshot-checkpoint-constants, snapshot-checkpoint-format, snapshot-checkpoint-store, snapshot-install(-constants), raft-rs-replica-lifecycle-owner, raft-rs-snapshot-staging-lifecycle-operation, and part of runtime-owner). It also left out the new C2 files: `learner-catch-up-acknowledgement.js`, `message-group-learner-join*.js` and `message-group-service-handler-create-admission.js`.

Because of that, the lane's promotion island imported a module it did not have. Lane quest `message-group-c2-orphan-removal-alpha` (406ceac1c, sealed at e6d43bc1a) then judged it "unreachable" and deleted `replica-operation-message-group-promotion.js` and `-learner-successor.js`, together with their exclusive exports and vocabulary in authorization.js and permit.js. It kept the raft-side option-D fragment.

In the candidate, that island is the **reviewed C2 component** (10c2f0610 "integrate: reviewed FreshMG C2 component"). It is reachable through `replica-operation-repository-message-group-membership-methods.js:15-18`, and its helper exists. So the orphan premise is an artifact of the incomplete snapshot, and it is false for the composed tree.

What happens in the composed tree:

- The candidate's promotion.js, learner-successor.js, learner-observation.js, repository bindings, CREATE admission and learner join all merge in cleanly as added or theirs-only files.
- All of them import exports that the lane deleted: `recordedLearnerCreateBasis`, `observeLearnerActionAbsence`, `noteUncertainMembershipWrite`, `actionRecordingInput`, `recordMembershipActionOutcome`, `recordingInvocation`, `recordingSettlementAllowed`, `learnerObservationRefusal`, `learnerWitnessUnavailable`, `learnerOutcomeQuery`, `encodeMembershipPermit` and `membershipActionPhases`. I found 17 broken named imports by a static check; one of them is in `test/node/message-group-create-admission-recovery.test.js`.
- So keeping "ours" on authorization.js or permit.js gives a tree that does not load.

### Decision the lead or owner must make

**Option A (recommended for this composition).** The candidate's reviewed C1/C2 wins. Option D is removed from the composition entirely and goes back to its owner, the `message-group-fresh-identity-membership` quest (F1/J1 increment), from the preserved bytes at bfd5611e7.

Reasons:

1. The lane's option-D fragment has **zero witnesses**. `git grep` finds no test that references `readPromotionAdmission`, `promotionAdmission`, `promotion_admission` or `promotionFact`.
2. It is unreviewed.
3. It is **unsafe once C2 is reachable**:
   - After any managed PROMOTE applies, `readRaftRsPeerIdentityReservations` returns a reservation with a `promotionAdmission` key.
   - The lane's `snapshot-checkpoint-format.js:124-136` `validRaftRsReservationShapes` uses exact keys (`RAFT_RS_CHECKPOINT_ADMITTED_PEER_FIELDS`, 3 keys). So every image sealed after a promotion fails descriptor validation.
   - `snapshot-checkpoint-store.js:478-482` and `snapshot-install.js:435-445` compare only learnerAdmission.
   - The lane's port also **throws** `PROMOTION_ADMISSION_CONFLICT` (`raft-rs-operation-port.js:258-269`) on a folded-prefix replay of a managed PROMOTE without a retained fact.
   - The candidate's learner join (fresh learner opens from its installed image alone) and C3 cleanup depend on exactly that image path.
4. It adds an `ALTER TABLE ... ADD COLUMN promotion_admission` migration, which goes against `solve/epics/raft-rs-full-cutover/alpha-single-path-closeout-20261013.md` ("No compatibility parser ... do not build migration machinery").
5. Its only consumer, the option-D promotion.js, was deleted by the lane. In the composed tree the consumer would be the candidate's C2 promotion.js, which never reads the fact (`promotionFactFollows` exists only at bfd5611e7). The result is a durable writer whose fact no reader uses for its decision, which conflicts with R01 and R11.

**Option D-complete (not a composition step).** Keep the lane's raft-side fact and also bring in bfd5611e7's checkpoint, snapshot-install and lifecycle files and its promotion.js/successor.js. That is new implementation work: those files diverge from the lane's later snapshot-receiver and lifecycle commits (7d91de9ff, eb7af113a), and bfd5611e7's own log ends in REJECT findings. It belongs to the FreshMG quest with design review, red-first F1 witness and independent verification.

Everything below gives Option A resolutions, with the Option D-complete consequence noted where it differs.

## 1. Per-file analysis (9 conflicted files)

Throughout, "C1" means b5e62dd0d (6.C C1 ordered successor), "C2" means 50a003b86 + 10c2f0610 (6.C C2 promotion component), and "B1/B2" means 6046cdf81 / 36dc704b1 (CREATE).

### 1.1 `src/raft/raft-rs-committed-membership-context.js` (base 234, ours 411, theirs 251 lines; 1 hunk)

- **Ours** (4151a3ab4 = bfd5611e7 bytes): theirs' C2 change, byte for byte (`LEARNER_ORIGIN_STAGES`, `READABLE_ACTION_STAGES`, `canonicalContextOfStages`, `canonicalMembershipActionContext`), plus the option-D promotion-fact codec:
  - `INVALID_COMMITTED_PROMOTION_ADMISSION`, `PROMOTION_FACT_*`, `exactRecord`, `canonicalPeerIds`, `canonicalPromotionBoundary`, `validatePromotionDelta`, `canonicalPromotionFact`, `encode/decodeCommittedPromotionAdmission`, `promotionAdmissionMatchesReservation`;
  - an import of `raftRsConfStateKey`.
  - `promotionAdmissionMatchesReservation` has no importer (it is listed in the lane's own unused-export logs).
- **Theirs** (50a003b86, C2): the export rename `canonicalLearnerContext` -> `canonicalMembershipActionContext`, so the queued action read can answer PROMOTE.
- **Hunk 1 (export list):** the C2 rename is identical on both sides. The extra lines are option D.
- **Which is newer:** ours (2026-10-12, unreviewed). It extends theirs; it does not supersede it.
- **Resolution (Option A):** keep theirs, as the whole file (10c2f0610 bytes). The lane changed nothing else in this file.
- **Owner:** committed-learner-origin contract (`architecture/contracts/message-group-committed-learner-origin.md`) under the FreshMG quest.
- **Witnesses:**
  - theirs: `test/raft/raft-rs-backend/participation-gate.test.js`, `stampless-opening-refusal.test.js`, `committed-membership-oracles.js`, `evidence-o1-static.test.js`, and the C2 integration tests (1.2);
  - ours: none for the option-D additions.
- **Both green after resolution?** Yes; nothing on our side pins the removed code.

### 1.2 `src/raft/raft-rs-committed-membership-read.js` (base 216, ours 304, theirs 296 lines; 2 hunks)

- **Hunk 1 (import):** both sides import `canonicalMembershipActionContext` (C2). Ours also imports the option-D codec.
- **Hunk 2 (an add/add block: `answerCommittedLearnerOrigin`, `promotionTargetView`, `answerCommittedPromotionAction`):**
  - The C1 parts (`answerCommittedLearnerOrigin` over `readLearnerOriginEvidence` coverage, and `promotionTargetView`) are byte-identical on both sides.
  - The difference is the PROMOTE answer:
    - **Theirs (C2, reviewed):** COMMITTED when the applied configuration names the target a voter and the retained learner origin binds this transition at an earlier permit sequence (`learnerOriginBindsPromotion`). Which attempt committed is left to the operation owner.
    - **Ours (option D):** COMMITTED only with a stored apply-owned fact (`group.readPromotionAdmission`) that passes `promotionFactRefusal` (CORRUPT / MISMATCH / BEYOND_APPLIED). A current voter without a fact is UNRESOLVED NOT_RECORDED.
  - Ours closes the F1-H1/H2 schedules (design section 4) but depends on a writer and image carriage that are incomplete in the lane (section 0).
- **Which is newer:** ours. It is meant to supersede the C2 PROMOTE rule, but that supersession was never sealed or recorded in a contract on either branch's mainline.
- **Resolution (Option A):** keep theirs, as the whole file. The lane changed nothing else here.
- **Owner:** registered learner read contract (`architecture/contracts/message-group-registered-learner-read.md` + `message-group-learner-promotion.md`), FreshMG quest.
- **Witnesses:**
  - theirs: `test/integration/message-group-learner-promotion.integration.test.js`, `-promotion-recording-guards` (including the F1-stuck pin at :467), `-promotion-selection-guards`, `-successor-ordering`, `test/raft/raft-rs-backend/message-group-membership-semantic-port.test.js`, `committed-membership-census.test.js`;
  - ours: none.
- **Both green?** Yes under Option A. Under Option D-complete, the F1 pin at :467 must be superseded red-first, as the design's section 2 requires.

### 1.3 `src/raft/raft-rs-operation-port.js` (base 437, ours 494, theirs 437 lines; 1 hunk)

- **Theirs (C1):** `readCommittedLearnerAdmission` -> `readLearnerOriginEvidence: (id) => registry.learnerOriginEvidence(id)`.
- **Ours:** the same C1 line (from the snapshot), plus `readPromotionAdmission`. In regions that merge cleanly, ours also carries:
  - **option D:** the extra imports, `sortedPeerIds`, `promotionAfter`, `retainedFoldedPromotionMatches`, the PROMOTE branch in `applyCommittedMembershipContext(context, position, application)`, and the `raftRsConfStateKey` import;
  - **real lane work, to keep:** the `RAFT_EVENT.APPLIED_PROGRESS` event (lane commits 5b2d26f18, ff177c43c, 3ebc7da41), `readOpeningHistory`/`recordOpeningHistory`, publishing the membership owner only after construction, the `close()` refactor and `ALREADY_CLOSED`.
- **Resolution (Option A): combine.** Take theirs' two lines for the hunk and remove the option-D residue from the clean regions. I built the exact text as `m3/raft-rs-operation-port.js.resolved-optionA` (`node --check` OK). Its diff against theirs is exactly the lane's own changes (+32/-22, the same size as the lane-vs-bfd5611e7 difference). The key edits:

```js
import {encodeCommittedLearnerAdmission} from './raft-rs-committed-membership-context.js';
// (drop: import {raftRsConfStateKey} ...; drop sortedPeerIds/promotionAfter/retainedFoldedPromotionMatches)
    applyCommittedMembershipContext: (context, position) => {
      registry.reserveCommittedReplica(context.replicaIdentity, context.peerId);
      if (context.stage === RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER) {
        registry.recordCommittedLearnerAdmission(context.replicaIdentity,
          encodeCommittedLearnerAdmission({groupId, ...position, context}));
      }
    },
    readLearnerOriginEvidence: (replicaIdentity) =>
      registry.learnerOriginEvidence(replicaIdentity),
```

- **Owner:** the raft-rs operation port (impact contract `partition-raft-operation-port` / `raft-rs-runtime-application-transaction`).
- **Witnesses:**
  - ours: `test/raft/raft-rs-backend/operation-port-boundary.test.js`, `test/raft/snapshot-lifecycle-staging.test.js`, the opening-history tests;
  - theirs: `peer-identity.test.js` and the C1/C2 integration tests.
- **Both green?** Expected yes. The lane's tests do not reach the PROMOTE branch.

### 1.4 `src/raft/raft-rs-peer-identity-constants.js` (base 79, ours 105, theirs 93 lines; 1 hunk)

- **Hunk:** the export list. Both sides add `RAFT_RS_LEARNER_ORIGIN_COVERAGE` (C1, identical definition). Ours adds `RAFT_RS_PROMOTION_ADMISSION_COLUMN`.
- In clean regions, ours also adds the `promotion_admission` column to CREATE_TABLE and the SELECTs, `ADD_PROMOTION_ADMISSION` (ALTER TABLE), `RECORD_PROMOTION_ADMISSION`, and two PROMOTION_ADMISSION error messages.
- **Resolution (Option A):** keep theirs, as the whole file. The lane-vs-candidate difference is only option D.
- **Owner:** the peer-identity registry (the R06 vocabulary owner for coverage and error messages).
- **Witnesses:** theirs: `test/raft/raft-rs-backend/peer-identity.test.js`. Ours: none.
- **R06:** `RAFT_RS_LEARNER_ORIGIN_COVERAGE` must stay defined once. It is: the same bytes on both sides.

### 1.5 `src/raft/raft-rs-peer-identity.js` (base 266, ours 329, theirs 289 lines; 2 hunks)

- **Hunk 1 (import):** as in 1.4.
- **Hunk 2:** an add/add block. `learnerOriginEvidence` (C1) is identical on both sides. Ours adds `recordCommittedPromotionAdmission` and `committedPromotionAdmission`.
- In clean regions, ours also has: the `validatedReservation` / `validatedAdmissionFields` split (bfd5611e7 complexity refactor that carries `promotionAdmission` through reservations), `promotionAdmission` in `readRaftRsPeerIdentityReservations`, the ALTER-TABLE migration, and a comment rewording ("address-as-identity" -> "placement-derived identity", also bfd5611e7; no guideline script references either wording).
- **Resolution (Option A):** keep theirs, as the whole file.
- **Owner:** the peer-identity registry.
- **Witnesses:** as in 1.4.

### 1.6 `src/raft/raft-rs-runtime-owner.js` (base 1809, ours 2074, theirs 1809 lines; 1 hunk)

- **Hunk:** the group request map. Theirs: `readLearnerOriginEvidence: request.readLearnerOriginEvidence,` (C1). Ours: the same line plus `readPromotionAdmission: request.readPromotionAdmission,`.
- **Clean-region option-D residue in ours:**
  - `resolveCommittedEntryConfState` does an extra `CORE_OPERATION.CONF_STATE` core read (`before`) on every non-folded conf-change entry and returns `membershipBeforeConfState` (ours ~:1028-1044);
  - `applyEntryDurablyOrFailure` passes `committedMembershipApplication` (ours ~:1086-1092).
- Everything else in the lane's 597-line delta is real lane native-inbound work (6aa68d2de ... 4aa8780cf) and is kept.
- **Resolution (Option A): combine.** Built as `m3/raft-rs-runtime-owner.js.resolved-optionA` (`node --check` OK). It applies four edits to ours:
  1. drop the `before` read;
  2. return `{...applied, decoded: decoded.value, membershipContext}`;
  3. drop the `committedMembershipApplication:` property;
  4. take theirs' single line in the hunk.
- **Companion clean file:** revert `src/raft/raft-rs-application-transaction-owner.js` to theirs/base (it is 4151a3ab4 bytes: the `committedMembershipApplication` parameter and third argument). Otherwise it is a dead parameter.
- **Owner:** the native runtime owner.
- **Witnesses:**
  - ours: `test/raft/raft-rs-backend/inbound-drain-owned-timer.test.js`, `runtime-captured-inbound-service-native.test.js`, `runtime-*-companion-fixture.js`, `test/partition/participant-release-native-application-order.test.js` (they import `setNativeInboundStageObserver` / `NATIVE_INBOUND_STAGE`, which the lane added and keeps);
  - theirs: the C1/C2 integration tests.
- **Both green?** Expected yes. Removing the extra core read changes the bytes the lane's lab runs executed, so those native tests must be re-run.

### 1.7 `src/rebalancer/replica-operation-message-group-membership-authorization.js` (base 500, ours 631, theirs 684 lines; 10 merge-file hunks)

- **Ours** (= bfd5611e7 + 406ceac1c):
  - **(a) bfd5611e7 restructuring, behavior-neutral and unreviewed:** `selectMessageGroupMembershipBranch` split into `selectedBranchMatches`, `decodedBranchSelectionRequest`, `observationIsCurrent` and `submitSelectedBranch`.
  - **(b) 406ceac1c orphan removal:**
    - deleted `observeLearnerActionAbsence`, `recordedLearnerCreateBasis`, `recordedLearnerOrigin` and `RECORDED_LEARNER_FACT_COLUMNS`;
    - de-exported `noteUncertainMembershipWrite` and the shared-recorder group;
    - reworded comments to "current initial authorization admits only sequence 1", "The learner outcome recorder uses one internal recording spec" and "at the sequence carried by its persisted permit".
- **Theirs** (85744ed29, f9f59335c, 3259d3d5f, 6046cdf81, 36dc704b1, b5e62dd0d, 50a003b86):
  - the shared recorded-fact predicate;
  - branch selection consuming it first;
  - the CREATE basis (`recordedLearnerCreateBasis`, B1/B2);
  - `observeLearnerActionAbsence` (C1 successor);
  - the shared recorder exported for the C2 voter recorder;
  - the matching comments.
- **Newer:** ours by date. But (b) rests on a false premise for the composed tree (section 0), and (a) is unreviewed WIP.
- In the merge, the clean regions already restore theirs' deleted exports (ours removed text its own snapshot had added, so the net change from base is empty). The conflict hunks are the restructured select function and the comments.
- **Resolution (Option A):** keep theirs, as the whole file (10c2f0610 bytes). This drops (a) and reverses (b). The lane has no other commits on this file.
  - If the lead wants to keep (a) for cognitive complexity, it can be grafted onto theirs unchanged. Theirs' version passed its C2 gates without it, so (a) is optional and needs its own verification.
- **Do not keep ours' comments.** They state that the owner never issues successors or promotions, which is false once C1/C2 are composed; keeping them would misdescribe the composed behavior (R09).
- **Owner:** `message-group-learner-outcome-recording` / `message-group-learner-promotion` / `message-group-learner-create-admission` contracts (FreshMG quest).
- **Witnesses:**
  - theirs: `test/rebalancer/message-group-membership-branch-authorization.test.js` (O1 cases), `test/node/message-group-create-admission-recovery.test.js` (imports `recordedLearnerCreateBasis`), `test/integration/message-group-learner-successor-ordering.integration.test.js`, `-promotion*.integration.test.js`, `-learner-join.integration.test.js`;
  - ours (the orphan-removal receipts): `message-group-learner-runtime-authorization`, `-membership-claim-cache`, `-learner-process-loss`, `-learner-recipient`, `-learner-discovery` integration tests, `message-group-fresh-learner-promotion.test.js`, `learner-promotion-progress-proof-contract.test.js`, `partition-service-learner-promotion(-wake).test.js`, `dt6-learner-promotion-progress-proof.test.js`, `node-bootstrap-consistency.property.test.js`.
- **Both green?** Expected yes. Ours pins the initial learner, branch, later-phase and native promotion behavior, which C1/C2 keep. The receipt `orphan-import-graph-closed` becomes vacuous, because the import closes through theirs' `learner-catch-up-acknowledgement.js`.
- **Clean-merge red to fix by hand:** the lane's 406ceac1c edit to `test/rebalancer/message-group-membership-branch-authorization.test.js:46-52,189` (`learnerStamp = committedStampOfAnswer(...)`) and theirs' `CANONICAL_LEARNER_STAMP` (:64) merge cleanly together. The candidate's O1 "key order" negative (:1135) then compares `JSON.stringify(learnerStamp)` with the canonical encoding, which are now equal, so `assert.notEqual` should fail.
  - Fix: take theirs' version of those two lines (raw `Object.freeze({...})` fixture and `assert.ok(committedStampOfAnswer(learnerStamp), ...)`). Theirs already seeds canonical bytes, so the lane's reason for the edit is covered.

### 1.8 `src/rebalancer/replica-operation-message-group-membership-permit.js` (base 132, ours 154, theirs 182 lines; 5 hunks)

- **Ours:**
  - (a) bfd5611e7 split of `decodeMembershipPermit` into `permitHeaderIsValid` / `permitBindingIsValid` / `permitStampIsValid` / `permitOutcomeIsValid` (behavior-neutral);
  - (b) 406ceac1c deleted `encodeMembershipPermit` + `inKeyOrder`, `MEMBERSHIP_ACTION_PHASES` / `membershipActionPhases`, and the outcomes `NOT_CAUGHT_UP` and `ORIGIN_UNRECORDED`, and rewrote the comments ("does not produce or advance them", "grants no later action").
- **Theirs:** C1 `NONCOMMITTED` + the successor comment; C2 `NOT_CAUGHT_UP`, `ORIGIN_UNRECORDED`, `MEMBERSHIP_ACTION_PHASES`, `membershipActionPhases`, `encodeMembershipPermit`.
  - `SUCCESSOR_ISSUED` in `MEMBERSHIP_DEBT_RECOVERY_OUTCOME` merges cleanly from theirs. `operation-workflow-message-group-membership-recovery.js:186,253` consumes it.
- **Resolution (Option A):** keep theirs, as the whole file (the same remark about (a) as in 1.7).
- **R07:** keep the union of named outcomes. All of `NONCOMMITTED`, `NOT_CAUGHT_UP`, `ORIGIN_UNRECORDED` and `SUCCESSOR_ISSUED` have consumers in the composed tree (`learner-observation.js:85`, promotion.js, learner-join).
- **R06:** permit.js stays the single owner of this vocabulary.
- **Owner:** the membership permit codec (FreshMG).
- **Witnesses:** as in 1.7, plus `test/integration/message-group-learner-promotion-selection-guards.integration.test.js` (`ORIGIN_UNRECORDED`).

### 1.9 `test/shards/impact-contracts.json` (base 1748, ours 2390, theirs 1986 lines; 2 hunks)

- **Structure (checked as a three-way JSON comparison):** both hunks are pure add/add collisions at the end of `contracts` and `coupledPairs`. **No key was changed by both sides, and no key was removed by either.**
  - **Ours added** (contracts and coupledPairs): `distributed-transaction-coordinator-participant-protocol`, `transaction-workflow-recovery-ownership`, `snapshot-receiver-lifecycle-staging`, `replica-host-cleanup-custody`, `wasm-writer-v1-application-completion`, `service-instance-selection-resource-state`, `service-consensus-original-intent-admission`, `service-consensus-retained-native-bootstrap`.
  - **Theirs added:** `message-group-learner-create-admission`, `message-group-learner-join`, `message-group-learner-successor-ordering`, `message-group-learner-promotion`.
  - **Changed by ours only:** 7 contracts (5 pairs), including `raft-rs-runtime-lifecycle-entry`, `raft-rs-runtime-application-transaction` and `partition-raft-operation-port`.
  - **Changed by theirs only:** `message-group-committed-learner-origin`, `message-group-registered-learner-read`.
- **Resolution: combine** as a union, with ours' block first and then theirs' block (theirs' leading `    },` closes ours' last object). Built and validated as `m3/impact-contracts.json.resolved-escaped`: valid JSON, 70 contracts and 41 pairs, equal to the union, and every value matches its single changing side. Every owner and test path in the union exists in the merged file set.
- **Byte churn, not semantic:** 50a003b86 re-serialized 3 base descriptions from `§` to a literal `§`, and that change merges cleanly. Base and ours use the escape (the lead restored it at commit time on 89e70949f). The `-escaped` file restores the escapes; `m3/impact-contracts.json.resolved` keeps theirs' literal form.
- **Option-A follow-ups inside this file (the R09 hazard):**
  - Theirs' `message-group-learner-promotion` description describes the C2 voter-stamp rule. That is correct under Option A and would need superseding under Option D-complete.
  - Theirs' `message-group-committed-learner-origin` and `-registered-learner-read` changes are C1/C2 and stay.
- **Owner:** the impact-contract audit (hand-curated manifest).
- **Witnesses:** the impact-contract checker, and the shard and metadata refresh.

## 2. Clean auto-merges that may still be semantically wrong

Of the candidate's 131 changed files, 122 merge cleanly. 28 of those are under src/, and 5 of the 28 were changed by **both** sides. A static named-import check over all candidate-changed js against the lane's exports found the 17 broken imports listed in section 0. Running the same check in reverse found nothing new: every lane import from a candidate-changed file is a lane-only addition.

The src files at risk:

1. **Island and wiring** (theirs-only, but each depends on the authorization/permit resolution): `src/rebalancer/replica-operation-message-group-promotion.js`, `...-learner-successor.js`, `...-repository-message-group-membership-methods.js`, `...-message-group-learner-observation.js`, `src/node/message-group-service-handler-create-admission.js`. Under "keep ours" in 1.7/1.8 they do not load.
2. **Clean but carrying unreviewed bfd5611e7 bytes:** `src/rebalancer/replica-operation-message-group-membership-owner-claim.js` (lane = bfd5611e7 refactor, theirs = base; behavior-neutral split) and `src/raft/raft-rs-application-transaction-owner.js` (option-D parameter). Recommend reverting both to theirs under Option A.
3. **Both sides changed these five** (orthogonal at the text level; behavior interacts):
   - `src/message-group/message-group-consensus-port.js`: theirs `bootstrapMembership` + read purpose (B2); ours `closeMessageGroupConsensus` became a single-flight async settlement, plus `isRaftOpeningFailure`.
   - `src/message-group/message-group-service-state.js`: theirs `bootstrapMembership`; ours startup/shutdown/initialization settlements (1952cd4b2, 48f15d953, e2c7435b7). Theirs' `message-group-learner-join.js:264,272,300` calls `service.initialize()` / `service.shutdown()` on the lane's rewritten lifecycle.
   - `src/node/replica-create-admission-owner.js`: theirs admission basis + entity-typed `snapshotTargetAdmissions(entityType)` (its only caller was updated by theirs); ours `authorizeParticipantRelease` uses `rowMatchesAdmission(row, req)` with the default `NO_ADMISSION_BASIS`, which is compatible.
   - `src/raft/raft-rs-status-observation.js`: theirs `currentTermApplied` (C1 fence); ours `lastIndex`. Any exact-shape consumer must accept both.
   - `src/raft/snapshot-install.js`: theirs `createAdmissionBasis` in `commitPreparedInstall`; ours receiver admission (`inspectSnapshotReceiver`, `snapshotReceiverStillAdmitted`). The learner join's image install now also passes the lane's receiver-lifecycle guard.
4. **Host cleanup custody (R01 risk):** the candidate's learner CREATE path (`message-group-service-handler.js`, `-create-admission.js`, `bootstrap/shared/message-group-service-handler-setup.js`, `message-group-learner-join.js`) creates and tears down a MessageGroupService outside the lane's `replica-host-cleanup-custody` owner list (`src/node/replica-runtime-cleanup-custody.js` etc.). Failed learner CREATE must use the same custody owner; otherwise there are two cleanup paths. This needs an owner check, not a textual fix.
5. **Option-D writer reachability:** theirs' `src/raft/raft-rs-group-membership-admission.js:433` (C2 PROMOTE delivery) makes managed PROMOTE proposals real. That is what activates the lane's option-D writer and the image refusal if section 0 is not applied.
6. Theirs-only and low risk: `learner-catch-up-acknowledgement.js`, `learner-promotion-progress.js`, `raft-rs-membership-transition.js`, `operation-workflow-message-group-{membership-recovery,native-read}.js`, `operation-workflow-owner.js`, `rebalancer-constants.js`, `replica-operation-constants.js`, `replica-create-process-owner.js`, `replica-handler-create-admission-methods.js`, and 0103e08cc's de-exports (no lane importer of the de-exported names).

Also changed by both and clean, but these are generated or ratchet files to **regenerate, not trust**: `test/shards/impact-graph-seal.json`, `primary-classes.json`, `resource-classes.json`, `subsystem-classes.json`, `solve/changes/global-owner-debt-inventory/inventory.json`, `scripts/checks/test-subsystem-classification-constants.js` (union of entries), `scripts/check-duplication.js`, and `test/test-helpers/participant-transaction-fixture.js` (theirs de-exports `ROWID_CEILING`, `ELSEWHERE`, `SESSION`; no lane importer found).

## 3. Risks

- **R09 (superseded, never reinterpreted):**
  - The composition contradicts the sealed lane quest `solve/quests/message-group-c2-orphan-removal-alpha` (sealed at e6d43bc1a; 3/5 receipts; constraints "subtraction-only", "No historical C2 cherry-pick"). Record an explicit supersession entry there, or have the owner retire the quest: its premise (an unreachable island and a missing `learner-catch-up-acknowledgement.js`) came from the incomplete 4151a3ab4, and the reviewed C2 at 10c2f0610 is reachable.
  - Do not just drop its receipts.
  - Option D, if kept, must supersede theirs' F1 pin (recording-guards :467) and the C2 PROMOTE clause in `message-group-committed-learner-origin.md` / `-registered-learner-read.md` / `-learner-promotion.md` explicitly. bfd5611e7 has the draft contract text; neither branch has it.
  - The lane's reworded comments in authorization/permit would misdescribe C1/C2; take theirs.
- **R06/R07:** permit.js owns `MEMBERSHIP_AUTHORIZATION_OUTCOME` and `MEMBERSHIP_DEBT_RECOVERY_OUTCOME`; peer-identity-constants owns `RAFT_RS_LEARNER_ORIGIN_COVERAGE` (one identical definition) and the error messages. Option A removes the option-D vocabulary (`PROMOTION_ADMISSION_*`, `INVALID_COMMITTED_PROMOTION_ADMISSION`) along with its owner code, so no dead names remain.
- **R01/R11:** keeping the lane's raft-side fact next to theirs' C2 promotion.js would leave two promotion-evidence authorities (voter stamp versus apply fact) with only one consumer. Do not mix them.
- **Ratchets (one-way; never raise):**
  - The merged baselines come out as: unused exports **1415** (theirs; the lane is at 1416), source duplication **47/1462** (the lane's tightening), test duplication **696/26345** (theirs' tightening).
  - The lane's orphan-removal checkpoint already measured test duplication at 697/26415, 46 lines over its own baseline, so the composed tree is likely red on test duplication. Fix by dedup.
  - Unused exports: Option A removes `promotionAdmissionMatchesReservation`. The lane's many new modules may still exceed 1415; fix by de-exporting.
  - Run `npm run -s test:duplication` and `check-unused-exports` explicitly; they run outside the land static gate.
- **impact-contracts:** a union with no value collisions; `§` byte churn only. Path existence is verified against the merged file set.
- **Census:** `test/raft/raft-rs-backend/committed-membership-census.test.js` (theirs' version merges cleanly) lists exact reader, asker and stamp-origin file sets. The lane added readers (`src/wasm-service/wasm-creation-genesis.js`: `readCommittedMembership` + `committedStampOfAnswer`; `src/partition/partition-participant-transaction-pause.js`) without changing this test from base, so it is probably already red on the lane and will be red after composition until each new reader is justified in the census. My comment-stripped emulation is approximate (section 5).

## 4. Tests to run after composition

**Raft and identity:**

- `test/raft/raft-rs-backend/{peer-identity,participation-gate,stampless-opening-refusal,evidence-o1-static,committed-membership-census,message-group-membership-semantic-port,operation-port-boundary}.test.js`
- `test/raft/snapshot-lifecycle-staging.test.js`
- `test/raft/raft-rs-backend/{inbound-drain-owned-timer,runtime-captured-inbound-service-native}.test.js`
- `test/partition/participant-release-native-application-order.test.js`

**FreshMG (theirs):**

- `test/integration/message-group-learner-{successor-ordering,promotion,promotion-recording-guards,promotion-selection-guards,join}.integration.test.js`
- `test/node/{message-group-create-admission-recovery,message-group-service-handler-membership,replica-create-admission-owner,replica-create-admission-recovery}.test.js`
- `test/message-group/message-group-fresh-learner-snapshot.test.js`
- `test/rebalancer/{message-group-membership-branch-authorization,spread-cure-transition-authorization-row,replica-operation-membership-epoch-binding}.test.js`

**Orphan-removal receipts (ours):**

- `test/integration/message-group-{learner-runtime-authorization,membership-claim-cache,learner-process-loss,learner-recipient,learner-discovery}.integration.test.js`
- `test/message-group/message-group-fresh-learner-promotion.test.js`
- `test/raft/learner-promotion-progress-proof-contract.test.js`
- `test/partition/partition-service-learner-promotion{,-wake}.test.js`
- `test/convergence/dt6-learner-promotion-progress-proof.test.js`
- `test/bootstrap/node-bootstrap-consistency.property.test.js`

**Lane interactions:**

- `test/message-group/message-group-native-custody-handoff.test.js`
- `test/node/replica-runtime-cleanup-custody.integration.test.js`
- `test/bootstrap/message-group-activation-handler-boundary.test.js`
- the lane's retained 21-file acceptance set plus the stage-1 publication set

**Static:**

- metadata refresh (seal and classes)
- impact-contract audit
- unused exports, test duplication, source duplication
- dependency-cruiser, file-size, complexity, guideline literals

Following the lab-first rule, run the heavy integration files on lab hosts.

## 5. Not read, or not verified (bounded and counted)

- **Tests:** none run. `node --check` (syntax only) was run on 2 scratch files.
- **Clean files:** of the 122, I read the full base-to-side diffs for the 5 both-touched src files and 2 both-touched test or helper files. I did not read the bodies of the other 23 theirs-only src files or the roughly 92 non-src files; they were covered only by the static named-import and path checks.
- **runtime-owner:** of the lane's 597-line delta, I read only the option-D regions (about 70 lines) and the hunk. The native-inbound work was not read.
- **impact-contracts:** compared as whole JSON values. The text of the 12 added contract descriptions was not reviewed.
- **Witness test bodies:** I read parts of branch-authorization (the O1 cases and fixtures), the test titles of recording-guards, and the census T7 header. The other roughly 35 listed witness files were not read. The branch-authorization red in 1.7 is inferred from the code, not observed.
- **Documents read in full:** the alpha decision, and the orphan-removal quest.json, design.md, checkpoint-hold.md and log summaries (13 entries).
- **Documents read in part:** design-promotion-history (about 150 of 300 lines), and one contract diff (committed-learner-origin, bfd5611e7 vs theirs).
- **Documents not read:** the C1 and C2 design notes, the C3 design (1098 lines), the FreshMG quest log bodies (175 / 143 / 217 lines; grep only), and the 4 candidate contract documents in full.
- **Census emulation:** approximate (crude comment stripping); its result is labeled "probable".

## 6. Scratch artifacts (scratchpad only; nothing written to the repository)

- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/m3/<file>.{base,ours,theirs,merged}`: reproduced diff3 merges.
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/m3/raft-rs-operation-port.js.resolved-optionA`
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/m3/raft-rs-runtime-owner.js.resolved-optionA`
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/m3/impact-contracts.json.resolved-escaped` (recommended) and `.../m3/impact-contracts.json.resolved` (theirs' literal `§`)
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/compose/m3/bat.test.js.merged`: the clean merge of the branch-authorization test, showing the coexistence described in 1.7.
- For the 6 "keep theirs, whole file" resolutions (context, read, peer-identity, peer-identity-constants, authorization, permit) and the 2 clean reverts (application-transaction-owner, owner-claim), the text to use is the file at 10c2f0610.
