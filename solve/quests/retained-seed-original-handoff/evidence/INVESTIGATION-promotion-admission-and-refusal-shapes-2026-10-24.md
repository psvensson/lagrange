---
audience: development
documentClass: evidence
---

# Investigation: promotion admission (Q-A) and consensus-init refusal shapes (Q-B), 2026-10-24

Read-only. The subject is the lineage head worktree
`/mnt/data/peter/projects/.worktrees/mg-delivery-resume-r2-20261023`, branch
`work/mg-delivery-resume-r2-20261023`, HEAD `a334068f3`. I edited and committed
nothing. The only things I ran were one demonstration script and its scratch
SQLite files under
`/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/ratchet-src/qa-demo/`.
The script imports the real modules from the worktree by absolute path. All
file:line citations refer to that HEAD unless they name another commit.

## Summary

- **Q-A: there is no unauthorised-promotion safety gap today. There is a real
  defect, and it is a half-transplanted feature, not a missing line.**
  - `promotionAdmission` is "option D", the immutable apply-time PROMOTE fact.
  - It reached this lineage through the unreviewed snapshot `4151a3ab4`
    (2026-10-12). That snapshot copied 11 of option D's 19 source files.
  - The snapshot half was never copied. That half is the descriptor shape, the
    descriptor match check, the payload equality and the install equality.
    Because of this, `promotionAdmissionMatchesReservation` has had no caller on
    this lineage at any commit.
  - Measured consequences:
    1. **(liveness, fail-closed)** After one managed PROMOTE applies, every honest
       checkpoint of that group is `corrupt_descriptor`. No compaction, transfer,
       install or image catch-up is possible.
    2. **(integrity hole, not reachable by an honest writer)** A payload's
       `promotion_admission` column is never compared with the descriptor. A
       checkpoint whose payload carries an undescribed fact beyond the image
       boundary reads as `valid`, and the fact is installed verbatim.
  - On this lineage, no production `src` path proposes a managed PROMOTE. The
    only managed-transition proposer admits ADD_LEARNER only. Both consequences
    are therefore latent. They become live once C2 promotion runs on this
    lineage, or once any peer replicates a managed PROMOTE entry.
  - On 2026-10-17 the owner ruled **option A**: option D is removed at
    composition and goes back to the FreshMG quest as design work. This lineage
    descends from the lane and not from the composed candidate, so it still
    carries the fragment.
  - The owner-shaped fix is **deletion of the fragment** (option A), not adding
    the call. If option D is revived, the check belongs in
    `snapshot-checkpoint-format.js` `validRaftRsDescriptor`, beside the learner
    analogue. It needs a third shape constant and **one** reservation-equality
    function that replaces the two hand-copied comparisons.
- **Q-B: the three refusal factories are one concern with three spellings.**
  - The shared owner already exists. `src/raft/raft-operation-port.js` owns
    `isRaftOpeningFailure` and `withRaftOpeningCleanupFailure`, and
    `OPENING_ERROR_METADATA` lists every per-domain identity key. Its own
    comment says "Every service kind consumes the same failure vocabulary"
    (`raft-operation-port.js:61-63`).
  - The typed refusal and the held-at-open predicate belong there:
    - one `consensusInitRefusedError({domain, identity, answer})`;
    - one code, `consensus_init_refused`;
    - `domain` from the existing `ENTITY_TYPE` (`src/constants/addresses.js:6-13`);
    - no top-level `phase`, which is a copy of `consensus.phase` (R03).
  - Exactly one `src` reader branches on the code value
    (`node-joining-publication-activation.js:28-32`). No `src` reader uses the
    top-level `phase` or any identity field.
- **`isPositiveSafeInteger`:** there is no existing numeric-guard module.
  `src/constants/numbers.js` only holds `NUM`. The language-level predicate
  belongs in a new `src/utils/safe-integer.js`, beside `strict-own-data.js`.
  The census found about 30 inline copies, so moving them all is an explicit
  widening (R16).

---

## Q-A. `promotionAdmission`

### A1. What it is, who produces it, who was meant to consume the match check

**What it is.** The design is
`solve/quests/message-group-fresh-identity-membership/design-promotion-history-2026-10-11.md`.
That file exists only at `bfd5611e7`; read it with `git show bfd5611e7:<path>`.
It describes option D: "one immutable committed PROMOTE fact per fresh target,
beside its existing immutable ADD_LEARNER origin, in the same permanent peer
reservation". Its status line reads: "Owner accepted option D for implementation
on 2026-10-11. No implementation approval or merge-readiness claim."

It authorises one decision: **recording that a managed learner→voter promotion
(FreshMG 6.C C2, stage `promote`, native `AddNode` on a learner;
`raft-rs-committed-membership-context.js:22-29`) committed at an exact index k
with an exact before/after configuration.** It fixes F1/J1. In that defect a
successor-attempt promotion P(n+1), issued under configuration L', could never
be recorded because the recorder compared against the original L (design §2,
§5.D). It does not authorise proposing a promotion. That stays with the permit,
the native proposal fences (`raft-rs-membership-transition-runtime.js:55-135`)
and raft-rs itself.

**Codec (owner: committed-membership context).**
`src/raft/raft-rs-committed-membership-context.js:242-382`.

- `canonicalPromotionFact` has exact keys `version, groupId, index, term,
  context, learnerAdmission, before, after`.
- `validatePromotionDelta` (`:326-347`) proves that only the target moved from
  learner to voter, that the reversed configuration's key equals
  `before.configurationKey`, and that the chronology holds.
- `promotionOriginMatches` (`:310-317`) binds the fact to the learner origin's
  transition with a lower permit sequence.

**Producer (the only writer).** The committed-apply transaction:

1. `raft-rs-runtime-owner.js:1014-1044` (`resolveCommittedEntryConfState`)
   captures `membershipBeforeConfState` in the native apply turn.
2. `:1076-1094` passes `committedMembershipApplication` to
   `applyCommittedEntryTransaction` (`raft-rs-application-transaction-owner.js:51-93`).
3. In the same SQLite transaction, `raft-rs-operation-port.js:277-305`, PROMOTE
   branch `:282-304`, calls `registry.recordCommittedPromotionAdmission`
   (`raft-rs-peer-identity.js:259-273`). The write is immutable: a conflicting
   overwrite throws `PROMOTION_ADMISSION_CONFLICT`.
4. For a PROMOTE folded into a joiner's bootstrap prefix (`application === null`,
   `raft-rs-runtime-owner.js:1010-1028`), no fact is written. The port instead
   requires an already-retained fact that matches
   (`retainedFoldedPromotionMatches`, `raft-rs-operation-port.js:88-95`) and
   otherwise **throws** `PROMOTION_ADMISSION_CONFLICT` (`:284-294`).

**Storage.**

- `raft-rs-peer-identity-constants.js:8,16,20-30,37-38,42-44` defines the column
  `promotion_admission`, the `ALTER TABLE ... ADD COLUMN` migration and
  `RECORD_PROMOTION_ADMISSION`.
- `raft-rs-peer-identity.js:139-148` runs the migration on open.
- `:70-108` surfaces the column as `reservation.promotionAdmission`.
- Correction to the lead's 2026-10-17 check (closeout plan, around line 230,
  "ALTER TABLE migration claim is NOT confirmed in the lane"): the migration
  **is** present at this HEAD. It was introduced by `4151a3ab4`. Confirmed with
  `git log -S "ADD COLUMN promotion_admission"`.

**Consumers that exist today.**

- `raft-rs-committed-membership-read.js:238-283`:
  `answerCommittedPromotionAction` and `promotionFactRefusal` decode the fact
  and bind it to the query's action tuple and to the live status boundary
  (`appliedIndex`, `commitIndex`, `membershipGenerationIndex`, `term`). This is
  the read-side analogue of the orphaned check, bound to live status instead of
  an image boundary.
- `raft-rs-original-allocation-preparation.js:85-92` requires
  `promotionAdmission === undefined` for cold founders.

**The consumer that was meant to exist.** At `bfd5611e7` (and its sibling
`54006d65f`) on
`origin/checkpoint/rs-raft-preservation-20261012T040836Z/freshmg-wip`, the match
check was called from `src/raft/snapshot-checkpoint-format.js`
`validRaftRsDescriptor`, beside `learnerAdmissionMatchesReservation`:

```js
raftRs.peerReservations.every((reservation) => learnerAdmissionMatchesReservation(
  reservation.learnerAdmission, reservation, raftRs) &&
  promotionAdmissionMatchesReservation(
    reservation.promotionAdmission, reservation, raftRs));
```

It came with:

- a third shape `RAFT_RS_CHECKPOINT_PROMOTED_PEER_FIELDS` (snapshot-checkpoint-constants);
- `promotionAdmission` in the payload-vs-descriptor comparison (snapshot-checkpoint-store `:523` at bfd5611e7);
- the staging-lifecycle comparison (`raft-rs-snapshot-staging-lifecycle-operation.js:236` at bfd5611e7, a file absent at HEAD).

The design names this explicitly: "Checkpoint / compatibility consequence (part
of D, **not optional**): extend existing reservation image enumeration, strict
descriptor shape, actual payload comparison, install verification and recovery
to preserve and validate the promotion fact against the image's group/applied
boundary and original ADD origin."

### A2. History: introduced, and why the consumer "disappeared"

`git log --all -S promotionAdmissionMatchesReservation`:

| commit | date | branch | carries the function | carries the snapshot consumer |
| --- | --- | --- | --- | --- |
| `54006d65f` | 2026-10-12 01:46 | `checkpoint/rs-raft-preservation-20261011T234630Z/freshmg-wip` (parent `50a003b86` = reviewed C2) | yes | **yes** (format.js:25,158; constants:53; store:523) |
| `bfd5611e7` | 2026-10-12 06:08:47 | `checkpoint/rs-raft-preservation-20261012T040836Z/freshmg-wip` (parent `50a003b86`) | yes | **yes** |
| `ee7c94ee7` | 2026-10-12 02:05 | `.../tx1-owner-wip` | no | no |
| `4151a3ab4` | 2026-10-12 06:08:40 | `.../20261012T040836Z/tx1-owner-wip` = `origin/review/rs-raft-runtime-recovery-base-20261012`, parent `e7c89f4b5`; **ancestor of HEAD** | yes | **no** |
| `dbf2e0f3f`, `c6006c745`, ..., `a334068f3` (HEAD) | 2026-10-14 to 2026-10-24 | lane, then this lineage | yes, byte-identical at :384 | no |

So the consumer never "disappeared" from this lineage; it never arrived.
`git grep` at `4151a3ab4`, `dbf2e0f3f`, `c6006c745` and `a334068f3` finds only
the definition and the export.

The root cause is recorded in
`solve/epics/raft-rs-full-cutover/composition-conflict-analysis-2026-10-17.md`
§0. `4151a3ab4` ("Ephemeral exact-byte proof snapshot only; not reviewed or
landed", 1338 files) copied 11 of option D's 19 source files from `bfd5611e7`.
It did **not** copy the 8 files that carry the fact through images:
snapshot-checkpoint-constants, snapshot-checkpoint-format,
snapshot-checkpoint-store, snapshot-install(-constants),
raft-rs-replica-lifecycle-owner, raft-rs-snapshot-staging-lifecycle-operation,
and part of runtime-owner. It also copied none of the new C2 files.

The lane quest `message-group-c2-orphan-removal-alpha` (`406ceac1c`) then judged
the promotion/successor island "unreachable" and deleted
`replica-operation-message-group-promotion.js` and `-learner-successor.js`. It
kept the raft-side option-D fragment.

Decisions on record:

- `closeout-plan-2026-10-17.md` around line 240: "OWNER DECISION (2) RULED:
  option A. The candidate's reviewed C1/C2 wins at composition; ... option D
  returns to the FreshMG quest as design work".
- `solve/quests/message-group-fresh-identity-membership/log.ndjson:144` (decision,
  2026-10-17T12:13:41Z): "the creation lane's partial option-D fragments are
  removed at composition".
- `solve/quests/message-group-c2-orphan-removal-alpha/log.ndjson:14`: the
  premise is superseded.
- `composition-verifier-verdict-2026-10-17.md:32`: the option-D grep at the
  composed `99d145ace` is **0**.

**Why HEAD still has it.** `git merge-base --is-ancestor` reports that
`99d145ace`, `1efdfc723`, `e7a3525a5` (the composed candidate,
`integrate/rs-raft-candidate-20261017`) and `10c2f0610` are **not** ancestors of
HEAD. `89e70949f` (the lane) and `c6006c745` are. The merge-base of HEAD and the
composition is `c6006c745`. This R2 lineage forked from the lane before the
option-A composition, so the ruling has not reached it.

The previous ratchet investigation
(`solve/quests/retained-seed-original-handoff/evidence/INVESTIGATION-ratchet-reds-2026-10-24.md:183,297`)
proposed "De-export". That would hide the symptom (R04). The real finding is the
half-transplant.

### A3. Can the missing check admit an unauthorised promotion today?

**Trace.**

- *Proposal.* The only place that attaches a managed context is
  `raft-rs-membership-transition.js:157`, reached through
  `proposeMembershipTransition` (`raft-rs-membership-transition-runtime.js:298`;
  port entry `raft-rs-operation-port.js:455`).
- The only production caller of that port entry is
  `reserveAndProposeAuthorizedLearner`
  (`raft-rs-group-membership-admission.js:293-306`). It is guarded by
  `learnerRecipientMatches` (`:289-291`), which requires
  `transition.stage === ADD_LEARNER`.
- `selectMessageGroupMembershipBranch` (PROMOTE permit) is called only from
  `test/rebalancer/message-group-membership-branch-authorization.test.js`.
- Generic `proposeConfChange` (`raft-rs-operation-port.js:406`;
  `raft-rs-group-membership-admission.js:120`; partition administration
  `partition-service-raft-membership-administration.js:121,281`) carries no
  managed context, so it never writes a fact.
- **No production `src` path on this lineage proposes a managed PROMOTE.** A
  managed PROMOTE entry can still arrive by replication from a leader running a
  build with C2 promotion, such as the candidate lineage. Mixed builds are ruled
  unsupported (rs-raft closeout rulings, "upgrade unsupported").
- *Apply.* See A1. The fact is written in the apply transaction. A folded
  PROMOTE without a retained fact throws.
- *Checkpoint creation.* `snapshot-checkpoint-store.js:244-260`
  (`readRaftRsCheckpoint`) takes `peerReservations` from
  `readRaftRsPeerIdentityReservations(copyDb)`. After a PROMOTE, these include
  the `promotionAdmission` key. Creation itself does not validate
  (`:398-423` builds and writes the descriptor).
- *Checkpoint read.* Used by every consumer: `snapshot-compaction.js:74`,
  `snapshot-transfer.js:224`, `snapshot-install.js:427,536`,
  `snapshot-receiver-admission.js:36` and `snapshot-transfer-receiver.js:320,404`.
  The read is `readCheckpoint` (`snapshot-checkpoint-store.js:510-540`), which
  runs `validateCheckpointDescriptor` and then `raftRsDescriptorMatchesEnvelope`
  and `validRaftRsDescriptor` (`snapshot-checkpoint-format.js:138-150`).
  - `validRaftRsReservationShapes` (`:124-136`) uses exact keys:
    `{replicaIdentity, peerId}` or `{..., learnerAdmission}`. A reservation with
    `promotionAdmission` fails.
  - Then `validatePayloadAgainstDescriptor` (`:452-491`) compares payload and
    descriptor reservations on `replicaIdentity`, `peerId` and `learnerAdmission`
    **only** (`:480-485`).
- *Install match.* `snapshot-install.js:424-452` (`raftRsInstalledImageMatches`)
  compares the same three fields only (`:440-446`).

**Measured.** Script
`/tmp/claude-1000/-mnt-data-peter-projects-lagrange/c74561e1-2969-4696-bd5a-1d3a410f38a7/scratchpad/ratchet-src/qa-demo/promotion-admission-gap.mjs`,
output in `.../qa-demo/run.txt`.

The fixture is a real `RaftRsPeerIdentityRegistry` over SQLite with three
reservations. The target has a codec-valid learner origin and a codec-valid
promotion fact. The real `buildCheckpointDescriptor` and `writeAtomicDurable`
produce the descriptor, and the real `readCheckpoint` reads it. Only the
descriptor fields were hand-assembled; the creation path from a raft-rs durable
record was not exercised.

```
S0 learner-only image: readCheckpoint                                      "valid"
S1 reservation keys read from the image                                    ["replicaIdentity","peerId","learnerAdmission","promotionAdmission"]
S1 honest post-PROMOTE image: validateCheckpointDescriptor                 {"outcome":"corrupt_descriptor","reasons":["raftRs"]}
S1 honest post-PROMOTE image: readCheckpoint                               "corrupt_descriptor"
S2 descriptor w/o fact, payload fact index 50 > applied 10: readCheckpoint "valid"
S2 payload promotion_admission column (installed verbatim)                 "50"
S3 promotionAdmissionMatchesReservation(honest fact, image boundary)       true
S3 promotionAdmissionMatchesReservation(future fact, image boundary)       false
S3 ...(honest fact, other learnerAdmission)                                false
S3 ...(honest fact, foreign group boundary)                                false
```

**Answers to the specific hypotheses.**

- *An unauthorised promotion admitted (a learner counted as a voter)?* **No.**
  - Voter or learner status in Lagrange comes only from raft-rs ConfState: the
    snapshot descriptor `confState` and the core. The fact is never an input to
    ConfState.
  - The descriptor cannot carry the fact at all (S1).
  - The read path re-binds any stored fact to the live status and the query
    tuple (`raft-rs-committed-membership-read.js:238-249`). A stale or future
    fact is refused there as `BEYOND_APPLIED`, `MISMATCH` or `CORRUPT`, not
    admitted as committed.
  - The fact's only decision consumer, the C2 repository recorder of the
    promotion's outcome, was deleted on this lineage (`406ceac1c`).
- *R07-style fail-closed?* **Yes, latent: S1.**
  - After any managed PROMOTE applies, every checkpoint of that group is
    `corrupt_descriptor`. Compaction stops (`snapshot-compaction.js:74`), and
    transfer and install refuse.
  - A new learner whose leader has compacted cannot be caught up by image.
  - A learner that would receive the folded prefix by log replay throws
    `PROMOTION_ADMISSION_CONFLICT` (`raft-rs-operation-port.js:284-294`),
    because no image can carry the retained fact.
  - So after one managed PROMOTE, the group can accept no further joiner by
    either route. That is safe but permanently stuck: a one-way liveness trap.
    The 2026-10-17 analysis inferred it from code; S1 measures it.
- *A stale reservation accepted after restart from a snapshot?* **Yes, for the
  payload column only: S2. This is the integrity hole the missing check, plus
  the missing payload equality, would close.**
  - A payload whose `promotion_admission` holds a fact the descriptor does not
    describe (here index 50 beyond applied 10) validates as `valid`.
  - On install the payload becomes the replica DB, so the fact is installed
    verbatim.
  - An honest creator cannot produce this, because descriptor and payload come
    from the same `copyDb` read (`snapshot-checkpoint-store.js:249` before the
    scrub at `:262-275`). The digest is computed by the same creator.
  - It needs a bug or a non-honest sender. After install, the read side refuses
    such a fact as `BEYOND_APPLIED` or `MISMATCH`. If the fact is in bounds and
    tuple-equal it is the genuine one (fresh identity, at most one promotion).
  - The effect is a fail-closed refusal of the PROMOTE action read, not a false
    COMMITTED answer. This last step is inferred from
    `promotionFactRefusal` and was not executed end to end.
- **Unknown.** I did not execute a folded-prefix replay through a real runtime
  owner to observe the `PROMOTION_ADMISSION_CONFLICT` throw. Its consequence (an
  application failure that holds the group) is inferred from
  `raft-rs-runtime-owner.js:1076-1101` and
  `raft-rs-application-transaction-owner.js:51-93`.

### A4. Tests

- `git grep -nE 'promotionAdmission|promotion_admission|readPromotionAdmission|PROMOTION_ADMISSION' -- test` at HEAD finds **0** hits.
- No test asserts the check, the shape, the payload equality or the folded-replay
  throw. The analysis's §1.1 "Witnesses: ours: none for the option-D additions"
  still holds.

**Witness under option A (deletion).**

- A static census test asserts that no `src` module names `promotion_admission`,
  `promotionAdmission` or `PROMOTION_ADMISSION`.
- A behavioural test drives a managed PROMOTE through the real port. The
  candidate's `test/integration/message-group-learner-promotion-*.integration.test.js`
  already does this on the composed tree. Then:
  - the next `createSqliteStateMachineCheckpoint` with `raftRsGroupId` returns
    `readCheckpoint(...).outcome === 'valid'`;
  - a joiner opens from that image.
- At HEAD the second assertion is red: S1 shows `corrupt_descriptor`.

**Witness under option D-complete.**
A file `test/raft/snapshot-checkpoint-promotion-fact.test.js` with four
subtests. The fixture is the demo's, plus a real creation over a
`RaftRsDurableStore` record.

1. An honest post-PROMOTE image reads `valid` (red today).
2. A described fact beyond `appliedIndex`, from a foreign group, or with a
   different `learnerAdmission` reads `corrupt_descriptor`, reason `raftRs`
   (red until the consumer exists).
3. A payload fact that differs from, or is absent from, the descriptor reads
   `corrupt_payload`, reason `peer_reservations` (red today, S2).
4. `raftRsInstalledImageMatches` is false for the same payload/descriptor
   mismatch (red today).

### A5. Owner-shaped fix and size

**The root is systemic.** A preservation snapshot was treated as a reviewed
source, and a feature that spans owners (committed apply, reservation registry,
read, checkpoint format, store, install, lifecycle) landed on one side of an
owner interaction. That violates R02: the interaction is the change boundary.
The same root explains 8 of the 9 composition conflicts (analysis §0) and the
orphan-removal quest's false premise.

Two contributing systemic defects:

- (i) The reservation-list equality is hand-copied twice:
  `snapshot-checkpoint-store.js:480-485` and `snapshot-install.js:440-446`.
  Both enumerate fields, so a new reservation field silently drops out of both.
  This is an R08 / one-version finding.
- (ii) The descriptor reservation shape is a closed key list in
  `snapshot-checkpoint-constants.js:45-50`. The registry's shape
  (`raft-rs-peer-identity.js:96-99`) is maintained separately, so the two can
  disagree.

**Recommended (per the 2026-10-17 ruling, R09: do not reinterpret it): option A
on this lineage.** Remove the option-D fragment. The bytes already exist on
`integrate/rs-raft-candidate-20261017` (`e7a3525a5`; resolutions in
`composition-report-2026-10-17.md:64-101`). Per file:

- `raft-rs-committed-membership-context.js:242-394` and the export lines
  `:400-406` (promotion codec and both matchers; about -155 lines);
- `raft-rs-committed-membership-read.js:238-283` (back to the candidate's C2
  PROMOTE answer);
- `raft-rs-operation-port.js:25-26,76-95,277-308` (`promotionAfter`,
  `retainedFoldedPromotionMatches`, the `application` parameter, the PROMOTE
  branch with its throw, `readPromotionAdmission`);
- `raft-rs-runtime-owner.js:1040-1043,1084-1090,1898`
  (`membershipBeforeConfState`, `committedMembershipApplication`, the
  `readPromotionAdmission` mapping);
- `raft-rs-application-transaction-owner.js:53-74` (the third argument);
- `raft-rs-peer-identity.js:70-79,96-99,108,259-279`;
- `raft-rs-peer-identity-constants.js:8,16,20-30,37-38,42-44`. This also removes
  the ALTER TABLE migration that the alpha single-path decision forbids;
- `raft-rs-original-allocation-preparation.js:89`.

That is about -270 src lines, net deletion, with no new test machinery beyond
the census assertion. It is the same work the composition step will do when this
lineage composes with the candidate. If that composition is imminent, this fix
is that composition and is not separate work.

**If the owner revives option D (D-complete; a FreshMG design item, not
ratchet work).** The match check belongs in **descriptor validation**,
`snapshot-checkpoint-format.js` `validRaftRsDescriptor` `:138-150`, beside the
learner analogue. The committed-membership context stays the owner of the
predicate; the format module consumes it (R03). The committed-membership
admission at apply time is already the producer, and the read already re-binds
to live status, so neither is the place for an image-boundary check.

Minimal snapshot half, about 40 src lines plus about 150 test lines:

- `RAFT_RS_CHECKPOINT_PROMOTED_PEER_FIELDS` (constants, 3 lines);
- shape selection plus the `&& promotionAdmissionMatchesReservation(...)` call
  (format, about 10 lines; byte-equal to `bfd5611e7`'s 24-line diff);
- **one** exported `samePeerReservations(a, b)` in `raft-rs-peer-identity.js`,
  the owner of the reservation shape. It compares the validated frozen records
  key by key, including absent keys, and replaces store `:480-485` and install
  `:440-446` (about 15 lines net);
- the witness in A4.

That alone does not complete option D. The design also needs the retained-fact
recovery for folded prefixes and the C2 recorder that consumes the fact
(`promotionFactFollows`, which exists only at `bfd5611e7`). `bfd5611e7`'s
option-D delta was 19 files, +1448/-322, and its log ends in REJECT findings.

**Comparable systems** (from my knowledge of upstream sources; not re-read in
this session):

- *raft-rs / etcd-raft.* The membership authority inside a snapshot is
  `SnapshotMetadata.conf_state` itself. `RaftCore::restore` and etcd's
  `confchange.Restore` rebuild the progress tracker from it, and the tracker
  refuses inconsistent sets. Learner→voter promotion is an `AddNode` on an
  existing learner, validated by the conf-change `Changer`. etcd's server gates
  it before proposal (`isLearnerReady`: the learner's match index is close to
  the leader's). Nothing about the decision rides on side data in the image.
  When etcd did keep membership in two places (v2 store vs the v3 backend
  `members` bucket), the two diverged. The fix made one store authoritative and
  cross-checked the other on recovery.
- *TiKV.* Membership facts travel as the region's epoch (`conf_ver`) and peer
  list inside the snapshot's region state. `check_snapshot` and apply refuse a
  snapshot whose epoch is stale, or whose peer list lacks the receiver, as a
  typed rejection.
- *The lesson for Lagrange.* Any membership fact in an image must either be
  derivable from the described ConfState (then do not store it), or be described
  and validated against the same boundary as the rest of the descriptor, with
  payload equal to description by one equality function. The lane fragment
  meets neither condition.

---

## Q-B. `consensusInitRefusedError` × 3

### B1. The three copies and their history

| | partition | message-group | wasm-service |
| --- | --- | --- | --- |
| factory | `src/partition/partition-consensus-port-opening.js:25-32` | `src/message-group/message-group-consensus-port.js:47-56` | `src/wasm-service/wasm-service-consensus-port.js:99-105` |
| message | dynamic, `PARTITION_SERVICE_ERROR_MSG.consensusInitRefused(partitionId, answer)` (`partition-service-constants.js:661-666`) | static, `MESSAGE_GROUP_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED` (`message-group/constants.js:122-123`) | static, `WASM_SERVICE_ERROR_MSG.CONSENSUS_INIT_REFUSED` (`wasm-service-constants.js:68`) |
| code | `partition_consensus_init_refused` (`partition-service-constants.js:192-198`) | `message_group_consensus_init_refused` (`message-group/constants.js:90-95`) | **none** |
| identity | none (in the message only) | `groupId`, `replicaId` | `serviceDefinitionId`, `replicaId` |
| `phase` | `answer?.phase ?? null` | `answer?.phase ?? null` | none |
| `consensus` | `answer` (no null default) | `answer ?? null` | `answer ?? null` |
| call sites | `:46` (constructor), `:54-57` (via `refusePartitionConsensusStartup`, called from `partition-service-raft-init-base.js:601` campaign and `:660` held-at-open) | `:163` constructor, `:168` held-at-open, `:188` lone campaign | `:214` constructor, `:219` held-at-open |
| exported, importers | exported `:78`, **no importer** | exported `:249`, **no importer** | not exported |

History (`git log -S`):

- The partition original came in `1aea11baf`, 2026-09-30, "rs-raft cutover:
  replica-lifecycle durable generation (0.2.6) (#63)".
- The message-group copy came in `462a8e25c` and the WASM copy in `18728280b`,
  both 2026-10-01 ("WIP: checkpoint zero-Liferaft cutover" and "... WASM replica
  on raft-rs port"). Each service was cut over by copying the partition's shape,
  and the copies drifted.
- `5b2d26f18` (2026-10-12, "preserve typed startup failure ...") extracted
  `partition-consensus-port-opening.js` and created the **shared** seam in
  `src/raft/raft-operation-port.js`: `isRaftOpeningFailure` at `:64-69` and
  `withRaftOpeningCleanupFailure` at `:74-83`.
- `e2c7435b7` (2026-10-12) added `OPENING_ERROR_METADATA` (`:8-11`). That list
  already enumerates the union of every domain's identity keys
  (`partitionId, groupId, replicaId, serviceDefinitionId`). This is the
  per-domain shape leaking into the shared owner.

The held-at-open predicate is copied the same way:

- `isHeldByHostFailure` lives in `src/partition/partition-write-kernel.js:357-360`,
  which is the wrong owner: it is a port-answer predicate. Its importers are
  `partition-service-raft-init-base.js:55,657`,
  `partition-consensus-hold-log.js:14,59,75` and
  `node/replica-handler-release-recovery.js:16,67`.
- It is inlined at `message-group-consensus-port.js:166-167` and
  `wasm-service-consensus-port.js:217-218`.

The constructor try/catch around `isRaftOpeningFailure` also appears three times
(partition `:43-47`, MG `:159-164`, WASM `:210-215`).

### B2. Consumers of `code`, `phase`, `consensus` and identity

**src (complete greps: `consensus_init_refused`, `CONSENSUS_INIT_REFUSED`,
`(error|failure|cause|primary)?.consensus`, `.phase`, `.code`, and identity
reads on errors):**

- `src/bootstrap/node-joining-publication-activation.js:28-32`
  (`isDurableRecordMissingRefusal`) is **the only value-branching consumer**. It
  checks `code === PARTITION...CONSENSUS_INIT_REFUSED &&
  consensus.reason === DURABLE_RECORD_MISSING` (owner decision O4). `:152` logs
  `error.consensus.phase`, not the top-level `phase`.
- `src/raft/raft-operation-port.js:65` (`isRaftOpeningFailure`) reads
  `error.consensus.outcome` of the **port's** opening error, the input to all
  three factories, not their output. `:77-81` copies the metadata keys onto the
  `AggregateError` when cleanup also fails.
- `src/node/replica-runtime-cleanup-custody.js:49` forwards `cause.consensus`
  onto a cleanup-pending error.
- Generic code propagation, not branching:
  - `src/node/message-group-create-activation.js:35-43,52-56` forwards
    `error.code` into the executor outcome `errorCode`
    (`message_group_consensus_init_refused`). No src reader matches that value:
    `git grep message_group_consensus_init_refused -- src` hits only the
    constant.
  - `src/node/runtime-service-bound-creation-route.js:283,619,635` uses
    `errorCode: error?.code ?? OUTCOME.UNKNOWN`. If a WASM open refusal reaches
    this catch, it is recorded as `UNKNOWN`, because the WASM error has no code
    (an R07 gap). **Unknown:** I did not trace whether the WASM open failure
    reaches this catch or is settled first by
    `wasm-service-replica-lifecycle.js:146-155` (`releaseFailedOpen`).
- **No src reader** of the top-level `.phase`, `.groupId`, `.replicaId`,
  `.partitionId` or `.serviceDefinitionId` on these errors exists. The only uses
  are the copies in `OPENING_ERROR_METADATA`.

**Tests pinning the per-domain shape:**

- `test/raft/raft-rs-backend/startup-cleanup-native-fixture.js:131-140` has three
  per-kind branches: partition code, MG code, WASM **message** plus `replicaId`.
- `test/partition/partition-port-refusal-outcomes.test.js:156-161` (partition
  code, `consensus` deep-equal, top-level `phase`, the only `phase` pin) and
  `:193-194`.
- `test/partition/partition-unreadable-durable-record.test.js:245-248`.
- `test/partition/committed-statement-outcome.test.js:677`.
- `test/raft/raft-rs-backend/committed-membership-target-validation.test.js:257-261`.
- `test/raft/raft-rs-backend/durable-rejoin-record-refusal.test.js:116,174,255`.
- `test/raft/raft-rs-backend/stampless-opening-refusal.test.js:145`.
- `test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js:481`.
  Correction to the brief: lines `:124-130` of that file are reservation
  assertions, not code pins.
- `test/raft/raft-rs-backend/message-group-on-raft-rs.test.js:519-522`: the MG
  code plus `DURABLE_RECORD_MISSING`. The O4 refusal is pinned for message
  groups too, but only the partition rejoin consumes it in src.
- `test/message-group/message-group-service-lifecycle-and-ledger.test.js:179`
  (MG code).
- `test/bootstrap/message-group-activation-handler-boundary.test.js:149` uses a
  literal fixture code `'CONSENSUS_INIT_REFUSED'`. It is a stand-in that matches
  no real code; it does not pin the shape.

### B3. One opening contract, one typed refusal

All three services open through the same provider seam:

- `createOperationPort(request)` / `createRaftRsOperationPort` with a
  `RAFT_OPERATION_PORT_REQUEST` (`src/raft/raft-operation-port-request.js`);
- the same three refusal moments: constructor refusal, held at open, and a
  refused lone campaign (partition and MG only);
- the same shared vocabulary (`isRaftOpeningFailure` and
  `withRaftOpeningCleanupFailure`, both in `raft-operation-port.js`).

What differs is the service-specific **cleanup**:

- partition: `cleanupRefusedPartitionStartup`, which shuts down inside;
- message-group: the caller releases;
- WASM: `releaseFailedOpen`.

The shared module says explicitly that "no resource, retry, deadline, or cleanup
permission lives in the public port module" (`raft-operation-port.js:71-73`).
So the refusal **value** is shared, and cleanup stays with each lifecycle owner.

**The owner is `src/raft/raft-operation-port.js`,** the public opening contract.
`raft-rs-runtime-owner.js` is the wrong owner: it produces the `answer`, and the
refusal is the service-facing interpretation of that answer at the port seam.
The code belongs in `src/raft/raft-operation-port-constants.js`, beside
`RAFT_OPERATION_OUTCOME`.

**Shape (R08, one canonical; R06, reuse vocabulary; R03, no copies):**

```js
// raft-operation-port-constants.js
const RAFT_CONSENSUS_STARTUP_OUTCOME = Object.freeze({
  CONSENSUS_INIT_REFUSED: 'consensus_init_refused'});

// raft-operation-port.js
/** domain: ENTITY_TYPE.PARTITION | MESSAGE_GROUP | WASM_SERVICE (src/constants/addresses.js:6-13)
 *  identity: {groupId, replicaId}  (groupId = the Raft group id the port was opened with:
 *            partitionId / message groupId / wasm consensus group id, wasm-service-consensus-port.js:149-150) */
function consensusInitRefusedError({domain, identity, answer}) {
  const error = new Error(consensusInitRefusedMessage(domain, identity, answer)); // one dynamic message (partition's format, generalised)
  error.code = RAFT_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED;
  error.domain = domain;
  error.identity = Object.freeze({groupId: identity.groupId, replicaId: identity.replicaId});
  error.consensus = answer ?? null;          // phase/reason/outcome live only here
  return error;
}
function isConsensusHeldAtOpen(status) {     // moved from partition-write-kernel.js:357
  return status?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE && status.recoveryRequired === true;
}
const OPENING_ERROR_METADATA = ['code', 'domain', 'identity', 'consensus'];
```

The top-level `phase` is dropped; readers use `consensus.phase`, as the only
production reader (`node-joining-publication-activation.js:152`) already does.

**Open shape decision.** The WASM factory names `serviceDefinitionId`, but the
port is opened with `consensusCreation.identity.groupId ?? serviceDefinitionId`.
`identity.groupId` should be the group the port actually opened. If the owner
wants the service definition visible, it goes in the message, not in a second
identity key.

### B4. Migration list

**src:**

1. `src/raft/raft-operation-port-constants.js`: add
   `RAFT_CONSENSUS_STARTUP_OUTCOME`.
2. `src/raft/raft-operation-port.js:8-11`: replace `OPENING_ERROR_METADATA`. Add
   `consensusInitRefusedError`, its message builder and `isConsensusHeldAtOpen`,
   and export them.
3. `src/partition/partition-consensus-port-opening.js:15-32,46,56,78`: delete the
   factory. Call the shared one with
   `{domain: ENTITY_TYPE.PARTITION, identity: {groupId: service.partitionId, replicaId: service.replicaId}}`.
   Drop the dead export.
4. `src/partition/partition-service-constants.js:192-198,661-666`: delete
   `PARTITION_CONSENSUS_STARTUP_OUTCOME` and `consensusInitRefused`. Check their
   re-export through `PARTITION_SERVICE_SHARED`
   (`partition-consensus-port-opening.js:10-14`).
5. `src/partition/partition-write-kernel.js:357-360`: delete
   `isHeldByHostFailure`. Repoint `partition-service-raft-init-base.js:55,657`,
   `partition-consensus-hold-log.js:14,59,75` and
   `node/replica-handler-release-recovery.js:16,67` to `isConsensusHeldAtOpen`.
   Decide the name, because the hold-log and release-recovery readers are
   "held", not "at open": name it `isHeldByHostFailure` and move it.
6. `src/message-group/message-group-consensus-port.js:32-56,163,166-168,188,249`:
   delete the factory, the inline held check and the dead export. Use the shared
   functions with `ENTITY_TYPE.MESSAGE_GROUP`.
7. `src/message-group/constants.js:90-95,122-123`: delete
   `MESSAGE_GROUP_CONSENSUS_STARTUP_OUTCOME` and the message.
8. `src/wasm-service/wasm-service-consensus-port.js:92-105,214,217-219`: delete
   the factory and the inline held check. Use the shared functions with
   `ENTITY_TYPE.WASM_SERVICE`. WASM refusals gain a code (R07).
9. `src/wasm-service/wasm-service-constants.js:68`: delete the message.
10. `src/bootstrap/node-joining-publication-activation.js:11,28-32`: import the
    shared code. Add `error.domain === ENTITY_TYPE.PARTITION`; the O4 path is
    the partition rejoin.
11. No change at `message-group-create-activation.js` or
    `runtime-service-bound-creation-route.js`: they forward `error.code`
    generically. Their recorded `errorCode` values change, from the MG code to
    `consensus_init_refused` and, for WASM, from `UNKNOWN` to
    `consensus_init_refused`. Grep receipt/journal fixtures for the old MG
    string before landing.

**tests** (they pin the shared code plus `domain`, not per-domain codes or
messages):

- `startup-cleanup-native-fixture.js:131-140`: collapse the three branches into
  one assertion: `code === RAFT_CONSENSUS_STARTUP_OUTCOME.CONSENSUS_INIT_REFUSED`,
  `domain === <kind's ENTITY_TYPE>`, `identity` deep-equal
  `{groupId, replicaId}`, `Object.isFrozen(consensus)`.
- `partition-port-refusal-outcomes.test.js:156-161,193-194`: remove the
  top-level `phase` pin, keeping `consensus.phase`.
- Mechanical constant swaps plus a `domain` assertion in
  `partition-unreadable-durable-record.test.js:245`,
  `committed-statement-outcome.test.js:677`,
  `committed-membership-target-validation.test.js:257`,
  `durable-rejoin-record-refusal.test.js:116,174,255`,
  `stampless-opening-refusal.test.js:145`,
  `runtime-opening-refusal.integration.test.js:481`,
  `message-group-on-raft-rs.test.js:519-522` and
  `message-group-service-lifecycle-and-ledger.test.js:179`.
- `message-group-activation-handler-boundary.test.js:149`: use the real code
  constant instead of the literal stand-in.

**Proof:**

- Static: `git grep -n "function consensusInitRefusedError" -- src` returns
  exactly 1. `git grep -nE "_CONSENSUS_STARTUP_OUTCOME|CONSENSUS_INIT_REFUSED" -- src`
  returns only the raft owner and its importers. The unused-export count drops
  by at least 2, the two dead factory exports.
- Behavioural: the native fixture runs one assertion over all three kinds.
- O4: the partition rejoin still skips a DURABLE_RECORD_MISSING replica
  (`durable-rejoin-record-refusal.test.js`).
- A cleanup failure still yields an `AggregateError` carrying
  `code`, `domain`, `identity` and `consensus`
  (`runtime-opening-refusal.integration.test.js:475-483`).
- Size: src about +35/-75; tests about 14 files, mostly one-line swaps.

**The same pattern elsewhere** (recorded, not absorbed, R17). Proposal-refusal
factories carry `error.consensus = answer ?? null` with per-domain codes:
`message-group-proposal-routing.js:100` and
`wasm-service-committed-command-codec.js:104`. They are a second instance of
"per-domain copy of a port-answer error" and need a census of their own.

**Comparable systems.** raft-rs has one `raft::Error` enum and etcd-raft has
sentinel errors such as `ErrProposalDropped`, shared by every caller. TiKV's
`raftstore::Error` carries identity as fields (for example
`RegionNotFound(region_id)` or `NotLeader(region_id, leader)`) instead of one
error type per caller. In both, the caller's domain is data on one typed error,
never a different type. (From knowledge; not re-read here.)

---

## `isPositiveSafeInteger` × 2

**The copies:**

- `src/rebalancer/spread-cure-transition-authorization.js:133-135` (with
  `isNonNegativeSafeInteger` at `:129-131`; used at `:177,182-183,431,453`).
  Introduced in `ee8b47800` (2026-09-19, critical-spread-transition-authority-carry).
- `src/query/distributed/distributed-transaction-prepare-evidence.js:9-11`, used
  at `:23-24` and **exported with no importer** (`:34`). It arrived on this
  lineage through `4151a3ab4`, the same unreviewed snapshot.
- The bodies are identical: `Number.isSafeInteger(value) && value > 0`.

**Census.** About 30 inline `Number.isSafeInteger(x) && x >/>= 0|1` predicates
across src (rg output in this session). They include:

- named predicates: `group-retirement-evidence.js:230` `isPartitionEpoch`,
  `replica-operation-message-group-learner-observation.js:24` `positiveInteger`,
  `wasm-writer-state.js:40` `validCounter`,
  `service-instance-contract.js:29` `instanceCounter`,
  `admin-write-receipt.js:9`, `snapshot-checkpoint-format.js:43`
  `isNonNegativeInteger`, and `constants/transactions.js:29`
  `isCanonicalTransactionEpoch` (a domain-named variant that also rejects -0);
- coercing forms such as `snapshot-boundary.js:23` and `call-cell-invoker.js:134`.

There is **no existing numeric-guard module**. `src/constants/numbers.js` exports
only `NUM`, and `src/utils/` has `strict-own-data.js`, `deep-freeze.js` and
similar, but no number guard.

**Owner.** This is a language-level predicate, not domain vocabulary (see
`src/constants/README.md`, "Choose The Owner First"). It belongs in a new
`src/utils/safe-integer.js` exporting `isPositiveSafeInteger` and
`isNonNegativeSafeInteger`, beside `strict-own-data.js`. Domain-named predicates
that carry meaning (`isCanonicalTransactionEpoch`, `isPartitionEpoch`) stay in
their owners, implemented over the utility.

**Migration (minimal, in scope).**

- `spread-cure-transition-authorization.js:129-135`: delete both and import.
- `distributed-transaction-prepare-evidence.js:9-11,34`: delete it and the dead
  export, and import. This clears one unused export and one source-duplication
  clone.

**Widening (owner decision, R16).** Fold `learner-observation.js:24`,
`wasm-writer-state.js:40`, `service-instance-contract.js:29`,
`admin-write-receipt.js:9` and `snapshot-checkpoint-format.js:43` onto the
utility. Each is a one-line import swap.

**Proof.** `git grep -nE "function (isPositiveSafeInteger|isNonNegativeSafeInteger)" -- src`
returns only the utility. `npm run -s test:duplication` and the unused-export
check both tighten (memory: both run outside the land static gate, so run them
explicitly). The existing tests of spread-cure authorization and
prepare-evidence stay green.

---

## Systemic root (both questions)

One root, two faces:

- **Q-A.** A cross-owner feature (option D) was copied file by file from an
  unreviewed preservation snapshot (`4151a3ab4`) into a lane. Half its owners
  received it and half did not. The orphan check is the visible seam of an
  unowned interaction (R02). The defects it hides are the liveness trap and the
  missing payload equality.
- **Q-B and `isPositiveSafeInteger`.** Each rs-raft cut-over (partition on
  09-30, MG and WASM on 10-01) copied the previous service's local shape instead
  of consuming the shared port seam. When the seam was created later
  (`5b2d26f18`, `e2c7435b7`, 10-12), it absorbed the union of per-domain keys
  instead of one canonical shape (R08). That is the "no legacy; one version of
  any logic" finding.
- **The common detector gap.** The unused-export ratchet flags the symptom: an
  exported, uncalled matcher and two dead exported factories. The ratchet's
  recommended remedy ("de-export") would erase the evidence. Each unused export
  touching a safety owner needs a consumer census before de-export.

## Open decisions for the owner

1. **Q-A on this lineage.** Apply option A now: delete the fragment, taking the
   composed candidate's bytes as in A5. Or leave it for the pending composition
   with `integrate/rs-raft-candidate-20261017`, which already does this. Which
   is chosen depends on whether this R2 lineage will compose with that candidate
   (**unknown** from the records I read).
   - Either way, do **not** de-export `promotionAdmissionMatchesReservation`
     alone.
   - Do not wire it into the format module alone either. That would fix S2 but
     not S1, because the shape gate rejects every honest promoted image first.
2. **If F1/J1 still stands on the composed head.** Does FreshMG revive option D,
   with the snapshot half as part of its scope, red-first witnesses (A4) and the
   shared `samePeerReservations`? Or does it choose another closure (design
   options A, B or C)?
3. **Independent of 1 and 2: the duplicated reservation equality.** Should it
   become one function now? It is a latent one-version defect for any future
   reservation field.
4. **Q-B shape.**
   - `identity.groupId` should name the opened Raft group (recommended) or the
     WASM service definition.
   - Dropping the top-level `phase` changes one partition test pin (recommended).
   - Should the O4 consumer require `domain === PARTITION`, or is O4 meant for
     every domain? MG pins it in tests at `message-group-on-raft-rs.test.js:519`,
     but src has no MG consumer.
5. **Q-B widening.** Should the proposal-refusal factories
   (`message-group-proposal-routing.js:100`,
   `wasm-service-committed-command-codec.js:104`) be included or recorded
   separately?
6. **Numeric guard widening.** Migrate the two duplicates only, or also the five
   named single-use predicates?

## Unknowns

- Whether a folded managed PROMOTE without a retained fact actually holds a
  group through the runtime owner's application-failure path. This is inferred
  and was not executed.
- Whether a WASM open refusal reaches
  `runtime-service-bound-creation-route.js:283` and is recorded as `UNKNOWN`.
- Whether this R2 lineage is planned to compose with
  `integrate/rs-raft-candidate-20261017`.
- The comparable-system details (raft-rs, etcd, TiKV) are cited from knowledge
  and were not re-verified against upstream sources in this session.
