---
audience: development
documentClass: current
---

# FreshMG 6.B slice B2: the learner-join capability, through the real owners, up to a running learner

Quest: `message-group-fresh-identity-membership` (epic `raft-rs-full-cutover`).
Runbook: [local takeover](local-takeover-20261010.md) section 6.B, second slice.
Predecessor: [B1](design-create-b1-2026-10-10.md) (`6046cdf81`). Consumed
surfaces cite that base tree; lines marked (B2) cite the working tree after this
slice. This note is a design and implementation record. It is not independent
approval, production wiring, promotion proof or physical acceptance.

**Review rounds (2026-10-11).** An independent verification rejected the first
attempt on two blockers: an await between the install commit's row read and its
swap, and load-bearing checks no witness measured. Its second round confirmed
those repairs and found one more: the commit's last row read did not require
the admission's owner incarnation, so a newer boot's takeover during that read
went unseen. The repairs are recorded in place (section 3 steps 5 and 7 and the
deferRetry paragraph, sections 4 to 9) and summarised in section 10.

## 0. Where B1 stopped

B1 lets a message-group CREATE carrying a learner join package cross the handler
refusal only for the recorded learner fact, a bound package and the fenced
CREATE admission. Its sole worker calls `joinMessageGroupReplicaAsLearner` and
nothing else (B1 note section 2, step 7). No root composes that capability, so
every production CREATE is refused `message_group_create_learner_join_capability_unavailable`.
The activation blocker stays: every root composes `createMessageGroupReplica`,
which opens a lone self-electing founder (B1 note section 1, last row). B1 left
these items to the install slice (B1 note section 7). It also left the verifier's
N3 note: a terminal settlement after MATERIALIZED did not stop the queued worker.

- Read the leader's committed membership and an origin-bearing checkpoint at the
  slice's own effect boundary, and validate both against the recorded stamp.
- Install through `requestSnapshotInstall`, open as a joining learner, and only
  then report.
- Order a REMOVE recorded after MATERIALIZED against the worker.

B2 supplies the capability and composes it in the handler setup. It does not
wire it into any root. Nothing in production changes behaviour: a CREATE still
answers capability-unavailable there (section 3, step 0).

## 1. What a learner needs to join as a non-voting learner (deliverable a)

| Need | Where it already exists |
| --- | --- |
| The exact peer identity, reserved on the founders | The native ADD_LEARNER apply reserves the permanent identity and records the learner's committed origin on every replica that applies it (`src/raft/raft-rs-operation-port.js:229-235`). The operation row's recorded fact carries the identity (`targetReplicaId`, the derived `targetPeerId`), the committed permit (`proposalIndex`, `leaderTerm`) and the learner stamp (`src/rebalancer/replica-operation-message-group-membership-authorization.js:510-519`, `recordedLearnerFactIsValid`). |
| The current leader's committed ConfState naming it a learner | The BOOTSTRAP-purpose committed-membership read (`src/raft/raft-committed-membership-constants.js:51-56`). The native owner answers it on the leader alone: NOT_LEADER elsewhere (`src/raft/raft-rs-committed-membership-read.js:111-114`), never a joint configuration (`:120-124`), never with an unreserved identity (`:134-138`). It answers the COMMITTED stamp (`:139-153`). |
| The position to install from | An origin-bearing raft-rs replica image sealed from the leader's own durable record at its applied index j. The payload keeps only the peer reservations, origins included (`src/raft/snapshot-checkpoint-store.js:277-310`, `:339-357`, `:397-479`). The descriptor's raft-rs generation must equal its envelope epoch (`src/raft/snapshot-checkpoint-format.js:152-160`). The install rebuilds the receiver's hard state, applied state and snapshot metadata at j (`src/raft/snapshot-install.js:341-362`). Entries after j come from the leader's log. Native snapshot catch-up of a compacted log is a recorded, separate gap (`architecture/contracts/message-group-committed-learner-origin.md:82`). |

A learner needs no GENESIS stamp, services row or vote. raft-rs never campaigns
a non-promotable learner. The runtime owner refuses a learner's `campaign`
before the core is entered (`src/raft/raft-rs-runtime-owner.js:1279-1304`, `NOT_ACTIVE_VOTER`).

## 2. The join descriptor: what exists, and the producer (deliverable b)

**What exists upstream.**

- The partition creation owner reads its leader's COMMITTED stamp through the
  replica handler's READ_COMMITTED_MEMBERSHIP (`src/rebalancer/committed-membership-bootstrap-read.js:131-162`).
- The message-group recipient answers the LEARNER_ACTION purpose only
  (`src/node/message-group-membership-recipient.js:47`). Its contract requires
  "continued CREATE/bootstrap-purpose refusal"
  (`architecture/contracts/message-group-registered-learner-read.md:156`).
- Checkpoint creation with `raftRsGroupId`, the transfer owner
  (`src/raft/snapshot-transfer.js:321`, `:428`) and the CREATE-authorized install
  are exercised only by tests: `test/message-group/message-group-fresh-learner-snapshot.test.js:134-236`
  and `test/integration/message-group-learner-runtime-authorization.integration.test.js:775-800`.

No descriptor producer and no message-group bootstrap-read route exists in `src/`.

**The minimal owner-respecting producer (B2).**
`produceMessageGroupLearnerJoinDescriptor(leader, options, learner)`
(`src/message-group/message-group-learner-join.js:124-144`, B2) lives in a
module subordinate to the message-group consensus owner. It runs on the leader
replica's own port and database, a MessageGroupService-shaped `{groupId, raft, db}`.
It is never in the handler.

1. It reads BOOTSTRAP through the consensus port's one committed-membership
   reader. `readMessageGroupCommittedMembership` now takes a purpose
   (`src/message-group/message-group-consensus-port.js:188-206`, B2), so every
   message-group port read stays in that one reader.
   - The stamp is re-validated (`committedStampOfAnswer`, `src/raft/raft-committed-membership-stamp.js:559-566`).
   - A non-leader, joint, held or unresolved answer is `DESCRIPTOR_UNAVAILABLE`,
     with the native reason as its detail.
2. The stamp must name the exact learner: a learner, not a voter, under its own
   identity (`message-group-learner-join.js:85-89`). Otherwise the answer is
   `LEARNER_NOT_IN_CONFIGURATION`.
3. It seals an image from the leader's own record (`:97-114`). The checkpoint
   identity is `{clusterId, raftGroupId, entity {message_group, group}, membershipEpoch = stamp.membershipGenerationIndex}`.
   It re-reads the image with that identity. The checkpoint owner holds the
   image's own generation to that epoch, so a configuration that moved between
   the two reads leaves an invalid image. That outcome is `DESCRIPTOR_MOVED`,
   with the checkpoint owner's `corrupt_descriptor` as its detail (witnessed by
   the moved-configuration test, section 7).
4. The answer is a frozen `{kind, groupId, stamp, generationIndex, checkpointIdentity}`
   (`src/message-group/message-group-learner-join-constants.js:11-15`, B2).

The cross-node route is not built in B2: asking the leader's node and moving the
image to the target node. A message-group bootstrap-purpose route changes the
registered-read contract and needs its own owner decision (section 9).

## 3. The capability (deliverable c)

`createMessageGroupLearnerJoinCapability(host)` (`message-group-learner-join.js:472-488`, B2)
returns the `joinMessageGroupReplicaAsLearner` that the B1 worker calls. The host
supplies the cross-node routes and the node's registry:

- `requestJoinDescriptor`, `observeLeader` and `adoptLearner`;
- `dbPathOf`, `clusterId`, `messageRouter`, `serviceOptions` and `catchUp`.

Steps:

0. **Composition.** `MessageGroupServiceHandlerSetup.create` composes the
   capability, the operation owner and the boot incarnation only from a
   `messageGroupLearnerJoinHost` (`src/bootstrap/shared/message-group-service-handler-setup.js:40-48`,
   `:128-133`, B2). No root passes one:
   `bootstrap-service-control-plane-runtime-methods.js:182-187` and
   `node-joining-publication-activation.js:550-555` are unchanged. A production
   CREATE stays refused, capability unavailable. The lone-founder path stays
   unreachable.
1. **Input.** The worker's frozen options now also carry `createAdmissionBasis`
   and `messageGroupLearnerJoin.learnerOrigin`
   (`src/node/message-group-service-handler-create-admission.js:55-60`, `:220-240`, B2).
   - `createAdmissionBasis` is the fact's seven columns plus `completed_at IS NULL`
     plus `create_admission_state = MATERIALIZED`.
   - `learnerOrigin` is the recorded learner's exact committed origin bytes.
     `recordedLearnerOrigin` derives them in the recorded-fact owner, from the
     same action tuple, proposal index and term the recorder matched
     (`replica-operation-message-group-membership-authorization.js:541-564`, B2;
     recorder `:314-338`).

   Any other shape is `INPUT_INVALID` (`message-group-learner-join.js:146-169`).
2. **Never over a present generation.** If the target replica file, its
   sidecars, an install marker or a staging file exists, the answer is
   `TARGET_PRESENT`. The check runs before any descriptor request (`:174-181`, `:478-480`).
3. **Descriptor.** The capability calls
   `host.requestJoinDescriptor({groupId, targetReplicaId, targetPeerId, checkpointsRoot})`.
   The checkpoints root is the target's own (`resolveReplicaCheckpointsRoot`,
   `snapshot-install.js:95-101`). The host places the leader's sealed image there
   and answers `{descriptor}` or a producer refusal. Any other refusal code from
   the route is `DESCRIPTOR_UNAVAILABLE`. Validation (`:205-256`), each failure typed:
   - exact shape, re-validated stamp, same group, and a generation at or past
     the stamp's applied index (`DESCRIPTOR_MISMATCH`);
   - `checkpointIdentity` equal to this node's cluster, the group, the
     message-group entity and the stamp's generation (`DESCRIPTOR_MISMATCH`);
   - the stamp names the exact learner (`LEARNER_NOT_IN_CONFIGURATION`);
   - neither its term nor its generation is older than the recorded stamp's
     (`DESCRIPTOR_STALE`).
4. **Image binding** (`:223-235`). The local image is read with the expected
   identity, whose epoch floor is the recorded learner's generation. The
   staleness check is directional (`snapshot-checkpoint-format.js:254-293`).
   - The image's boundary must be the descriptor's generation.
   - Its epoch must equal the descriptor's.
   - The target's reservation must carry exactly `learnerOrigin`.

   Failures are `DESCRIPTOR_MISMATCH`, or `INSTALL_REFUSED` with the checkpoint
   owner's validation outcome.
5. **Install** through the install owner (`:258-276`). The capability calls
   `requestSnapshotInstall` with the CREATE admission owner, the MATERIALIZED
   evidence, the physical claim and the basis.
   - `admitsRaftRsInstall` revalidates the claim against the boot row and checks
     the reservation and the learner ConfState (`snapshot-install.js:364-380`).
   - The staged image is bound to the create authority (`:171-179`, `:461-474`).
   - The swap commits only through `owner.commitSnapshotInstall(claim, swap, basis)`
     (`snapshot-install.js:493-504`, B2).
   - The process owner reads its boot fence first and the operation row last,
     so the row read is the last await before the swap. It requires the exact
     create authority, its own owner incarnation **and** the caller's basis on
     that read, then runs the synchronous swap
     (`src/node/replica-create-process-owner.js:15-20`, `:189-220`, B2).

   Any of these recorded before that row read makes the install refuse
   (`create_generation_mismatch`), and nothing opens: a REMOVE selection, an
   ordinary terminal settlement, a rotated attempt, a closed admission (tokens
   kept), a moved fact column, a later fact phase. That includes a change
   recorded while the boot fence read is in flight, the window the first
   attempt left open.

   **The order and the owner check are shared with the partition path (review
   rounds).** The partition commit passes no basis, but it now reads boot before
   row too, and requires its owner incarnation on the row. Both reads stay
   authoritative (owner-RPC, leader-required, critical); their order changed.
   - A row change recorded while the boot read is in flight is seen.
   - A newer boot acts on the admission only after its takeover
     (`takeoverRetained`, `replica-create-admission-owner.js:497-512`) rewrites
     `create_admission_owner_incarnation`, which the row read requires to be
     this owner's. So a takeover recorded while the row read is in flight
     refuses the commit, and the newer boot's worker is the sole one.
   - A bare boot change without a takeover leaves this effect the sole worker:
     the newer boot gets no worker for the admission until it takes it over.

   The partition witness that pinned the old order (no effect after a boot
   change during the row read) is superseded by five tests. Its property, no
   old-boot effect overlapping a newer boot's ownership of the admission, is now
   carried through the row (section 10).
6. **Open** (`:288-329`). A `MessageGroupService` is constructed with:
   - `replicaIds = replicaIdsOfStamp(stamp, target)`, the stamp's identities plus
     itself (`raft-committed-membership-stamp.js:509-551`), never a lone list;
   - `isJoiningExistingGroup: true` and `deferElection: true`;
   - `bootstrapMembership: durableRecordBootstrap()` and no metadata publication.

   The service hands a supplied bootstrap to its port
   (`src/message-group/message-group-service-state.js:310-315`;
   `message-group-consensus-port.js:97-101`, B2). A durable-record source opens
   the installed record or refuses `durable-record-missing`. It is never founded,
   whatever the joining flag says (`src/raft/raft-rs-participation-gate.js:335-346`).

   Joining means three things:
   - no port scheduling (`message-group-consensus-port.js:62-66`);
   - role announcements ignored (`message-group-service-raft-lifecycle.js:257-262`, `:326-338`);
   - with a non-lone hint list, no `leadLoneMessageGroup` (`:236-240`).

   The real transport-handler registration is used
   (`src/bootstrap/shared/message-group-transport-handler.js:21-31`). After
   `initialize()`, the replica's own committed configuration (a witness read
   through its port) must name it the exact learner, its port must report it a
   follower, and it must be applied at or past the boundary (`:301-306`).
   Otherwise the replica is closed and the answer is `OPEN_NOT_LEARNER`. A
   refused open is closed and answered `OPEN_REFUSED`.
7. **Running** (`:333-456`). The capability polls `host.observeLeader(groupId)`.
   The poll answers the current leader's BOOTSTRAP-purpose committed answer and
   that leader's own `readStatus()`. It is bounded by `CATCH_UP_TIMEOUT_MS`,
   which ends when the group leader acknowledges the learner caught up
   (`message-group-learner-join-constants.js:75-81`). The acknowledgement is a
   decision table (`:66-70`, `:390-403`); the first unmet fact names the state:
   - **leads:** the committed answer and the status are one leader in one term
     (`:340-344`);
   - **holds the learner:** that committed configuration still holds the exact
     learner. Otherwise REMOVED;
   - **caught up:** first, the leader's commit index and its follower match for
     the learner must be present, exact non-negative integers with
     match >= commit > 0 (`progressUnproven`, `:346-359`, review round).
     Otherwise the state is BEHIND with `progress_unobserved` (an index absent
     or not an exact integer, or a commit of 0) or `progress_behind`. Only then
     is the existing promotion-progress predicate `evaluateLearnerPromotionProof`
     (`src/raft/learner-promotion-progress.js:126-169`) consulted, and it must
     grant on the leader's own observation (`:364-372`). Its inputs are those two
     indices (`:333-337`; `src/raft/raft-rs-status-observation.js:68-90`,
     `:135`), and the two observed epochs are the configuration generations of
     the leader and of the learner's own applied configuration. The leader's
     commit must also be at or past the installed boundary. The exactness check
     comes first because the shared predicate reads an absent or non-integer
     index as 0, so it grants 0/0 (`learner-promotion-progress.js:148-162`).
     The join does not depend on that normalization. The predicate is
     unchanged: it is 6.C's.

   No membership is taken from a status ConfState: the committed reads decide
   membership, and the status supplies role, term, commit and progress. The
   partition promotion proof reads its progress the same way
   (`src/partition/partition-service-learner-promotion-proof-methods.js:96-112`).

   **RUNNING** is frozen with `leaderReplicaId, term, commitIndex, matchIndex,
   configurationGeneration, installedIndex, appliedIndex`, after re-checking that
   the learner's own committed view still holds it and its term is not past the
   leader's. **REMOVED**, or a learner that stopped holding itself, closes the
   replica and answers `LEARNER_NOT_IN_CONFIGURATION` or `OPEN_NOT_LEARNER`.
   **A spent bound** answers NOT_CAUGHT_UP with the predicate's reason; the
   learner stays open as a learner. The node adopts it (`host.adoptLearner`)
   only after the answer.
8. **Worker.** It logs `CREATE_LEARNER_RUNNING`, or `CREATE_LEARNER_NOT_RUNNING`
   with the outcome (`message-group-service-handler-create-admission.js:166-181`,
   handler constants `:54-57`, B2), then releases its claim.
   - No CREATE_ACTIVE and no services row. MESSAGE_GROUP_CREATE_ACTIVE is a
     COMPLETE outcome (`src/rebalancer/executor-outcome-constants.js:91-93`);
     for a REPLACE it would move toward source retirement on a non-voter.
   - The admission stays MATERIALIZED and the obligation UNKNOWN.
   - A thrown refusal is B1's existing MESSAGE_GROUP_CREATE_FAILED, carrying the
     typed `errorCode`.

**Why this observation is "running target".** The leader's own observation is
the only progress source (`src/raft/learner-promotion-progress.js:19-22`). The
predicate that grants promotion is the one that says caught up. The quest's
`atomic-current-leader-promotion` constraint names the same inputs
(configuration generations, leader commit and follower match). RUNNING is an
observation, never a grant (R10). The 6.C promotion turn re-derives it in its
own turn.

**deferRetry.** Every refusal the capability makes itself is
`deferRetry: false` (`message-group-learner-join.js:72-81`). The worker runs
after MATERIALIZED and this slice has no attempt rotation, so a redelivery finds
the admission retained (B1 step 5). A retry promise would be an endless loop.
The cause, transient or not, stays in the code and detail.

An owner's error passing through the capability keeps its owner's
classification. The admission owner's `REPLICA_CREATE_ADMISSION_DEFERRED` stays
`deferRetry: true`, in two cases: the boot is replaced after MATERIALIZED, or
the commit read fails during the install. Either way, refused by the capability
or deferred by the owner, the admission stays MATERIALIZED with no worker, and a
redelivery finds it retained. Failure progression is open (section 8).

## 4. Typed failure edges (deliverable d)

No refusal the capability makes itself leaves a learner open. Every refusal
before the install commit leaves the target without a replica file. Unless
stated otherwise, the membership obligation stays UNKNOWN and the admission
stays MATERIALIZED. The last two rows are declared gaps, not edges the slice
handles.

| Edge | Outcome (code) | Caller observes | Witness (test file of section 7) |
| --- | --- | --- | --- |
| No host composed (every production root) | B1 `..._learner_join_capability_unavailable` | ERROR, no read or write | B1 membership test 5; setup test |
| Worker options not the admitted shape | `INPUT_INVALID` | CREATE_FAILED | red-first scenario 2, section 7 |
| Present target generation (replica file, sidecar, install marker or staging) | `TARGET_PRESENT` | CREATE_FAILED; no descriptor request; a running learner untouched | later-admission test; present-generation test (marker, staging, sidecar) |
| Descriptor from a demoted leader or a non-leader | `DESCRIPTOR_UNAVAILABLE`, detail `membership-read-not-leader` | CREATE_FAILED, `deferRetry` false; nothing installed | demoted-leader test |
| Descriptor older than the recorded fact, replayed (an older term, or an older configuration generation of the same term) | `DESCRIPTOR_STALE` | CREATE_FAILED; nothing installed | stale-descriptor test (two subtests) |
| A later REMOVE, recorded (abort-learner selection after MATERIALIZED) | `INSTALL_REFUSED`, `create_generation_mismatch`, decided on the install commit's row read | CREATE_FAILED; phase `target_removal_proposal_in_flight` kept | REMOVE-after-MATERIALIZED test |
| The same selection recorded while the install commit's last read before its swap is in flight | `INSTALL_REFUSED`, `create_generation_mismatch`: that read is the row read | as above | last-pre-swap-read REMOVE test |
| A later REMOVE, native, before the join | producer `LEARNER_NOT_IN_CONFIGURATION` | CREATE_FAILED; nothing installed | native-REMOVE test |
| Native REMOVE while the opened learner awaits the acknowledgement | ack REMOVED: `LEARNER_NOT_IN_CONFIGURATION` | CREATE_FAILED; learner closed and handler retired; installed files left for exact cleanup | removed-while-waiting test |
| The learner applies its own native REMOVE while no leader is observable | `OPEN_NOT_LEARNER` | CREATE_FAILED; learner closed and handler retired; nothing adopted | own-REMOVE test |
| Wrong group, cluster or target in the descriptor | `DESCRIPTOR_MISMATCH` | CREATE_FAILED; nothing installed | wrong group/cluster/target test |
| Image whose origin is another operation's | `DESCRIPTOR_MISMATCH` | CREATE_FAILED; nothing installed | identity-anchoring test |
| Configuration moved between the stamp and the image | producer `DESCRIPTOR_MOVED`, detail `corrupt_descriptor`; the target refuses with that code | CREATE_FAILED; nothing installed | moved-configuration test |
| Boot replaced after MATERIALIZED | the admission owner's `REPLICA_CREATE_ADMISSION_DEFERRED` (`deferRetry` true), from the install's claim revalidation | CREATE_FAILED from a stale process; nothing installed | replaced-boot subtest |
| Replacement admission generation (attempt rotated on the row) | `INSTALL_REFUSED`, `create_generation_mismatch` | CREATE_FAILED; nothing installed | replaced-generation subtest |
| One basis column moved alone after MATERIALIZED: the admission CLOSED with its tokens kept, or the recorded obligation | `INSTALL_REFUSED`, `create_generation_mismatch` | CREATE_FAILED; nothing installed | one-basis-column test (two subtests) |
| Competing terminal settlement after MATERIALIZED (B1's N3) | `INSTALL_REFUSED`, `create_generation_mismatch` (basis `completed_at IS NULL`) | CREATE_FAILED; `completed_at` set; debt UNKNOWN | terminal-after-MATERIALIZED test; last-pre-swap-read terminal test |
| A newer boot takes the admission over while the install commit's row read is in flight | refused on that read (the row's owner incarnation is the newer boot's); no effect | the newer boot's worker is the sole one; the old worker answers the install refused | partition takeover test (T1) |
| The boot changes without a takeover while that row read is in flight | not refused: the admission is still this owner's | the old effect is the sole worker; the newer boot gets no worker until it takes the admission over | partition bare-boot-change control (T1b) |
| A change recorded after the install commit's row read | not seen: no await separates that read from the swap, so the change is ordered after the install (section 8) | the learner opens | partition order witness; the V7 and old-order mutations die (section 10) |
| Install failure (corrupt image) | `INSTALL_REFUSED`, `corrupt_payload` | CREATE_FAILED; no replica file | corrupt-image test |
| Process loss during install, before the swap | commit read fails (`REPLICA_CREATE_ADMISSION_DEFERRED`); STAGING marker and staging left for `resolvePendingSnapshotInstall` and `recoverPendingSnapshotInstall` (`snapshot-install.js:685-751`) | restarted boot: IN_PROGRESS `admission_retained`, no descriptor request, no second learner | process-loss subtest 1 |
| Process loss after install, before open | installed image durable; open refused (`OPEN_REFUSED`) | restarted boot: retained, nothing reopened | process-loss subtest 2 |
| Process loss while the learner is open | learner gone with the process; the group still holds it | restarted boot: retained, no second learner | process-loss subtest 3 |
| Open refused | `OPEN_REFUSED` | CREATE_FAILED; replica closed and handler retired | process-loss subtest 2 |
| Learner held behind (never acked) | `NOT_CAUGHT_UP` (no failure), ack `behind`, `progress_behind` | warn log; learner open as a learner; no outcome | held-behind test |
| Learner acked the installed boundary, then held below the leader's commit | `NOT_CAUGHT_UP`, ack `behind`, `progress_behind` | as above | acked-boundary test |
| Leader's committed answer at another configuration than the learner applied | `NOT_CAUGHT_UP`, ack `behind`, `epoch_mismatch` | as above | older-configuration test |
| Leader observation whose committed answer and status are different leaders | `NOT_CAUGHT_UP`, ack `leader_unavailable` | as above | mixed-observation test |
| Leader commit or match index absent or not an exact integer | `NOT_CAUGHT_UP`, ack `behind`, `progress_unobserved` | as above | indices test (absent, not integers) |
| Founders' leader changes mid-join | none: the current leader acknowledges | RUNNING under the new leader and term | leader-change test (positive control) |
| Redelivered CREATE after RUNNING | B1 retained | IN_PROGRESS; one descriptor request, one learner | positive test |
| **Declared gap (review N6):** node shutdown during the join, after the install | no shutdown fence orders install, open and `host.adoptLearner` against a node stopping; a learner can open and be adopted after shutdown began. A `host.adoptLearner` that throws leaves the learner open | not handled in B2 | none: no production host exists. The production host owns `adoptLearner` and must fence it (section 8) |
| **Declared budget (review N7):** RUNNING detection | polling: one `host.observeLeader` per `CATCH_UP_POLL_MS` (50 ms) up to `CATCH_UP_TIMEOUT_MS` (30 s), at most about 600 observations per join. The budget is this module's own, tied to no existing owner budget | not handled in B2 | none: the leader route is test physics. A production route must answer from a local projection or slow the poll, never about 20 remote RPC/s per join (section 8) |

## 5. Cached-view audit (deliverable e)

- **Recorded fact read by the handler.** The repository observation is
  owner-RPC and leader-required, with absence confirmation (B1). It is stale by
  the next await, so the install commit re-reads the row through the admission
  owner (owner-RPC, leader-required, critical). It reads its boot fence first,
  so that row read is its last await. It requires the fact columns,
  `completed_at IS NULL` and MATERIALIZED on that read, and no await separates
  that read from the rename (witnessed in section 10). A change recorded after
  that read is ordered after the install. It does not undo it; its owner (6.C)
  stops and cleans the learner by exact generation (section 8).
- **Boot fence.** Read before the row, authoritative as before. A boot replaced
  while the row read is in flight is not seen by the fence, on both paths. The
  row's owner incarnation covers that read: a newer boot's takeover recorded
  before it is served refuses the commit, and without a takeover the newer boot
  has no worker (section 3, step 5).
- **Join descriptor.** A projection of the leader at production time.
  - It is validated against the recorded fact: no older term or generation, the
    exact learner, the exact origin bytes in the image.
  - It is never the running signal. RUNNING needs a fresh committed answer and a
    status from whichever replica currently leads.
  - A descriptor that went stale still describes committed content of a
    configuration naming the learner, so installing it is safe. A removed
    learner is never reported running; while waiting, it is closed.
- **Committed reads.** Each poll takes a fresh BOOTSTRAP answer from the leader
  and a fresh witness answer from the learner's own port. Neither is cached or
  persisted.
- **Leader follower progress.** Volatile and leader-local. It is read only for
  RUNNING, never persisted, and never a promotion grant. It counts only when the
  leader's commit index and its match for the learner are exact integers with
  match >= commit > 0.
- **The learner's services cache.** The founders' rows are address hints only
  (`message-group-service-peer-resolution.js`); membership comes from the
  installed record and the committed reads. The hint list absorbs them
  (`message-group-service-raft-lifecycle.js:139-151`).
- **Checkpoint generations.** Leader-local and target-local. They are sealed and
  digest-checked on every read and at install. The target re-reads the image
  locally before install. Retention is the existing sweep's.
- **Physical claim and process registry** (B1). Process-local, revalidated
  against the boot row inside `admitsRaftRsInstall` and again at the commit
  (before its row read). They only ever refuse.
- **Install marker and staging.** Durable. They feed `TARGET_PRESENT` and the
  existing install recovery owner.
- **`host.adoptLearner` registry and the fixture's `world.learners`.**
  Bookkeeping only.

## 6. Identity anchoring (deliverable e)

| Artifact | Anchors | Source |
| --- | --- | --- |
| Join descriptor | group; stamp (term, applied index, configuration key, membership generation, identities with the target's derived peer id, answering leader); image boundary (generation index); checkpoint identity (cluster, group, message-group entity, epoch = stamp generation) | the leader's native BOOTSTRAP read through the consensus port; the checkpoint store |
| Installed image | exact learner origin bytes (operation, transition, permit sequence 1, ADD_LEARNER stage, target identity and peer, index = recorded `proposalIndex`, term = recorded `leaderTerm`); epoch = descriptor epoch, floor = recorded generation; boundary = descriptor generation; create authority (admission token, attempt token and sequence, workflow `updatedAt`, `replicaCreatedAt`) bound into staging and the marker | `recordedLearnerOrigin`; install owner (`snapshot-install.js:171-179`, `:461-474`) |
| Install commit | create authority, the committing owner's incarnation, the seven fact columns, `completed_at IS NULL`, MATERIALIZED, on one authoritative row read: the last await before the swap, after the boot fence read | process owner (`replica-create-process-owner.js:189-220`, B2) |
| Open learner | group, replica (target), derived peer id, the lifecycle row minted at staging for the receiver (`snapshot-install.js:341-349`), its own record, its own committed view | install, port, witness read |
| RUNNING | acknowledging leader (committed answer and status agree on replica and term), exact commit and match indices (match >= commit > 0), configuration generation equal to the learner's own; installed boundary | the current leader's committed answer and status; the exactness check, then the promotion-progress predicate |

**When an anchor moves:**

- A later fact phase, a moved fact column, a terminal settlement, a rotated
  attempt or a closed admission before the commit's row read, including during
  its boot fence read: the install is refused.
- A replaced boot: the install's claim revalidation throws, and the restarted
  boot retains the admission.
- A configuration change between the stamp and the image: `DESCRIPTOR_MOVED`.
- A configuration change after the install: the learner applies it from the log,
  and the epoch check waits for it.
- A leader change: the descriptor stays valid, as committed content of the same
  configuration, and the new leader acknowledges.
- A native REMOVE: the descriptor is refused, or the waiting learner is closed.

The address is routing metadata (quest constraint `fresh-identity-and-permanent-mapping`)
and is deliberately not an anchor.

## 7. Witnesses, red-first and mutation controls

**Witness file.** `test/node/message-group-learner-join.test.js` (B2): 46
node:test entries, which are 27 top-level tests (9 of them with subtests) and 19
subtests, so 37 leaves. The first attempt reported "25 leaves"; those were 25
entries (17 top-level, 3 of them parents, plus 8 subtests), so 22 leaves. The
review round's ten top-level tests are listed in section 10.

**Fixture.** `test/test-helpers/message-group-learner-join-fixture.js` (B2) sits
on B1's create fixture. That fixture now accepts a real capability in place of
its stub. Its producer helper also takes a test's wrapper of the founder's port
(the moved-configuration test).

- **Founders.** The real three-founder `PartitionNodeCluster` of the
  learner-operation fixture: real raft-rs ports holding the operation-authorized,
  recorded ADD_LEARNER. No message-group cluster equivalent carries a recorded
  operation fact: the existing `MessageGroupService`-founder test
  (`message-group-fresh-learner-snapshot.test.js`) records none.
- **Target.** The real MessageGroupService that the capability builds.
- **Test physics:**
  - an in-process, MessageRouter-shaped transport to the founders' inboxes;
  - the descriptor route, which runs the real producer on a named founder's own
    port and database, and moves the image with the real transfer owner over
    in-process sockets;
  - the leader route, which reads the current leader port's BOOTSTRAP answer
    through the consensus port reader, plus its `readStatus()`;
  - a pump that ticks and delivers.
- **Fixture actuation:** SENDING, boot rows, a raw native REMOVE (of the
  learner, or of a follower voter for a newer configuration in the same term), a
  reset admission row, single-column row changes, leftover install files, and
  the altered or forged descriptors and images of the negatives.
- **Leader-route answers altered by a test** (review round): withheld for a
  while, a committed answer cached from before a leadership change or a
  configuration change, and status indices removed or stringified. Each stands
  for a route whose two reads straddle a change, or a wire encoding. The
  capability must not trust such a route.

None of this is a driver, MessageRouter or physical proof.

**Positive test assertions.**

- INITIATED, then RUNNING.
- Every founder's ConfState names the learner, never as a voter.
- Exactly one learner is open. Its own ConfState holds it as a learner, its
  role is follower, and it sent no vote or pre-vote request.
- Its term equals the leader's, and the founders' term is unchanged.
- Join suppression is held, `deferElection` is set, and the election timer was
  never armed.
- RUNNING names the current leader, with match >= commit >= installed boundary.
- The installed record's learner origin is byte-equal to the leader's, and its
  ConfState names the learner.
- A MESSAGE command committed after RUNNING is applied by the learner.
- A redelivered CREATE is IN_PROGRESS and retained, with one descriptor request.
- No executor outcome and no lone-founder create; the admission is MATERIALIZED,
  the phase `learner_committed`, the obligation UNKNOWN.

**Red-first.** Runs are retained in the implementer report.

1. **HEAD bytes, new modules absent.** The file fails at import
   (`ERR_MODULE_NOT_FOUND`), a new-surface red for every test.
2. **New modules present, every modified existing source file at HEAD bytes.**
   Every leaf is red:
   - every join refuses `message_group_learner_join_input_invalid`, because the
     B1 worker passes no install basis and the recorded-fact owner exposes no
     origin;
   - the setup test is red because HEAD's setup composes nothing from a host,
     the capability-unavailable cause;
   - the image-only open test is red with "Missing expected rejection:
     joining=false", because HEAD's MessageGroupService ignores the bootstrap and
     founds a GENESIS group.

**Mutation controls.** Each source mutation was applied alone, the witness file
rerun, and the bytes restored and checked by sha256.

| Id | Mutation | Killed by |
| --- | --- | --- |
| M1 | let the learner campaign: `completeJoinConvergence()` after open (suppression released, elections armed) | positive test, "join suppression is held until promotion" |
| M1b | lone hint list `[target]` (the lone-founder path) | survives (see below) |
| M2 | skip install | 16 leaves; positive: `open_refused: durable-record-missing` |
| M3 | descriptor via the WITNESS purpose (a demoted leader answers) | demoted-leader test (went RUNNING) |
| M3b | accept a descriptor older than the fact | stale-descriptor test |
| M4 | install basis without the fact columns (start after a later REMOVE) | REMOVE-after-MATERIALIZED test |
| M4b | the install owner ignores the basis | REMOVE-after-MATERIALIZED and terminal-after-MATERIALIZED tests |
| M5 | no present-target guard (a second worker starts a second learner) | later-admission test: the second worker installed over the live learner's file and went RUNNING |
| M6 | report running before caught up | held-behind, removed-while-waiting and positive (match >= commit) tests |
| M7 | install basis without `completed_at IS NULL` | terminal-after-MATERIALIZED test |
| M8 | the image need not carry the recorded origin | identity-anchoring test |
| M9 | accept another group or cluster | wrong-cluster subtest (the earlier typed refusal is pinned) |
| M10 | the port ignores `service.bootstrapMembership` | image-only open test |
| M11 | RUNNING ignores the leader's committed configuration | removed-while-waiting test (went NOT_CAUGHT_UP) |

**M1b survives** because the learner's services cache already names the
founders. `reconcileRaftPeersFromCache` pushes them into the hint list before
the lone check (`message-group-service-raft-lifecycle.js:139-151`, `:236-240`).
The node's cache holds those rows in production, and without them the learner
cannot address its group at all. Even on the lone path, the installed record
makes it a learner:

- a closed gate only arms ticks a learner never campaigns from
  (`message-group-consensus-port.js:177-180`);
- an open gate's campaign is refused `NOT_ACTIVE_VOTER`.

The survivor is recorded, not hidden (section 9).

**Census.** `test/raft/raft-rs-backend/committed-membership-census.test.js`
declares what B2 adds, with comments: the learner-join module as a
COMMITTED-answer and durable-record-bootstrap user, and the module plus the
service state as bootstrap carriers. The review round renamed the reader test
(the message-group port's one reader serves any purpose) and added a test that
enumerates the BOOTSTRAP purpose's askers outside `src/raft`: the learner-join
producer and the remote read's handler. A third asker turns it red, even behind
the purpose-generic reader. It is a separate test so that the inherited red of
the reader test cannot mask it. The census reds are exactly HEAD's two inherited
ones, with identical diffs (section 9).

**Impact contract.** Registered with its coupled pair as
`message-group-learner-join` in `test/shards/impact-contracts.json`.

## 8. What B2 leaves open (deliverable f)

- **Production wiring stays OFF.** No root composes a learner-join host.
  Building one needs four things:
  - a remote route to the leader's producer. The message-group bootstrap read is
    refused at the registered recipient by contract;
  - the image transfer between nodes over the existing transfer owner;
  - a remote leader observation (BOOTSTRAP answer plus status);
  - the node registry (`messageGroupServices`, `dbPathOf`, cluster identity).

  The dispatcher that builds the join package is also unwired. The positive path
  is proven only with test-physics routes.
- **Old-boot recovery.** An installed or staged learner after process loss is
  not reopened or resolved. `TARGET_PRESENT` and B1's retained admission refuse.
  The reopen (durable record, `identityExisted`) and
  `recoverPendingSnapshotInstall` belong to the message-group handler's old-boot
  recovery, open since B1. That recovery must not call
  `recoverPendingSnapshotInstall` as it stands: it commits through
  `owner.commitSnapshotInstall(claim, fn)` with no basis
  (`snapshot-install.js:729-748`), so a recovered message-group install would
  skip the fact, open-operation and MATERIALIZED re-check (review O4).
- **Failure progression.** CREATE_FAILED goes to the coordinator's existing
  FAIL. Attempt rotation, admission close, and exact-generation cleanup of a
  refused install's marker and staging or of transferred generations are all
  open. `deferRetry` stays false until rotation exists.
- **The hosted learner after the report.** The node registry owns it once the
  worker releases its claim. Stopping and exact-generation cleanup of an open
  learner (stop before delete) are 6.C's abandonment and REMOVE path. So is a
  learner closed while waiting for a native REMOVE, whose installed files stay.
- **Ordering after the commit.** A REMOVE selection or a terminal settlement
  recorded after the install commit's row read is not ordered against the open.
  No await separates that read from the swap. The learner opens, the group may
  remove it, and RUNNING is then never reported. Stopping it is 6.C's.
- **Production host obligations (review N6, N7, N8).**
  - Fence `adoptLearner` and the open against node shutdown, and close a
    learner whose adoption throws (section 4, declared gap).
  - Answer the leader observation without about 20 remote RPC/s per join: a
    local projection, or a slower poll (section 4, declared budget).
  - Choose the producer's checkpoints root and pins. The producer's checkpoint
    write runs `sweepCheckpointGenerations` on the leader's root with no
    in-process pins (`snapshot-checkpoint-store.js:463-469`). The sweep must not
    drop a generation that another transfer is using. The quest's "read-only
    exact join descriptor" holds for the leader's state, not that root's
    retention.
- **6.C.** Promotion needs the same predicate in its own runtime-owner turn.
  RUNNING is not that grant. 6.C also covers:
  - the participation gate of a learner opened from a durable-record bootstrap
    (`gateOpen` false while it is a learner);
  - leadership handoff and source removal;
  - the services-row publication and CREATE_ACTIVE.
- **Untouched B1 findings.** DEFERRED for non-matching CAS rows, any `attemptSeq`
  on the first claim, the partition ingress entity type (O9), and the
  `owner-claim.js` guideline hits.

## 9. Findings outside B2 (R17, not absorbed)

- **No message-group join-descriptor route.** The registered learner recipient
  answers LEARNER_ACTION only, and its contract requires bootstrap-purpose
  refusal (`message-group-membership-recipient.js:47`, contract `:156`). A route
  needs a contract decision. Owner: the registered-read contract.
- **Two inherited committed-membership census reds, unchanged by B2.**
  - T7 callers lacks `src/node/message-group-membership-recipient.js` (the
    registered learner read).
  - T7 stamp origins lacks `src/rebalancer/replica-operation-message-group-membership-authorization.js`
    (the recorder's `committedStampOfAnswer`). This first assert also masks the
    test's later asserts on HEAD.

  Owners: the registered-read slice and the recorder slice. The B1 lab
  classification already lists `committed-membership-census` and
  `evidence-o1-static` as inherited. `evidence-o1-static` (LEARNER_ACTION and
  CONFIGURATION_GENERATION_UNAVAILABLE unclassified) fails identically on HEAD
  and on B2.
- **The install commit does not check `create_admission_state`.** A CLOSED
  admission whose tokens still match would install
  (`replica-create-process-owner.js:49-67`). B2 adds the state only through the
  message-group basis, witnessed by the one-basis-column test; the partition
  path's check is unchanged. Owner: the CREATE admission and install owners.
- **The partition install commit's boot window (review O3), closed.** The
  commit now reads boot before row on both paths (section 3, step 5). Closing
  both windows needed one comparison, not a new read shape: the row read
  requires `create_admission_owner_incarnation` to be the committing owner's,
  and a newer boot can act on the admission only after its takeover rewrites
  that column. A bare boot change during the row read still lets the old effect
  run, as the sole worker. Owner: the replica create process owner.
- **The shared promotion-progress predicate grants 0/0 (review O5).**
  `evaluateLearnerPromotionProof` reads an absent or non-integer commit or
  match index as 0 and grants (`learner-promotion-progress.js:148-162`). B2
  checks exactness before consulting it. 6.C must not consume the predicate
  raw. Owner: learner-promotion-progress.
- **`rowMatchesAdmissionBasis(row, null)` throws a TypeError (review O6).**
  Default parameters do not cover null (`replica-create-process-owner.js:17-20`).
  It is unreachable today: the capability requires an object basis. Owner: the
  process owner.
- **The lone-founder path ignores the joining flag.** `leadLoneMessageGroup`
  campaigns, or arms ticks under a closed gate, for any lone hint list
  (`message-group-service-raft-lifecycle.js:237-240`). Gating it on the flag
  would stop a lone single-replica rejoin from ever leading, so it is unchanged
  (M1b). Owner: the message-group raft lifecycle.
- **A checker false positive.** The decision-boundary checker's mixed cache/SQL
  heuristic matches "cache" inside `resolveReplicaCheckpointsRoot`
  (repli-cache-ckpoints). B2 imports it under an alias. Owner: guideline audits.

## 10. Review round (2026-10-11)

The independent verification of the first attempt rejected it on two blockers
and eight notes. The safety core held: the learner never founds, never
campaigns, never pre-votes and never becomes a voter. The lead decided each
item. What changed:

**Blocker 1, option (a): the row read is the install commit's last await.**

- `commitReplicaCreateSnapshotInstall` reads the boot fence before the operation
  row (`replica-create-process-owner.js:197-207`). The authority and basis check
  and the swap follow the row read synchronously. Both reads stay authoritative;
  only their order changed. The code comment states the order and its partition
  effect (section 3, step 5).
- The commit's own boot read now directly follows the claim revalidation's boot
  read: one redundant owner-RPC. Folding the two would change the number of
  reads, which the decision excluded.
- **Partition witness superseded.** `cannot commit after boot ownership changes
  during durable reread` (`d7e9ab0ef`) pinned the old order. It went red under
  the reorder, as the trade predicts: a boot replaced during the row read is
  no longer seen by the fence. Five tests in
  `test/node/replica-create-admission-owner.test.js` replace it:
  - `cannot commit after boot ownership changes before durable reread`: a boot
    replaced at the commit's own boot fence read refuses DEFERRED, with no
    effect;
  - `reads the durable row last, after the boot fence, before the effect`: the
    call order ends `boot, row, effect`;
  - `sees an operation change recorded while its boot fence read is in flight`:
    a superseding admission token recorded during that read stops the effect;
  - T1 and T1b, from the second round (below).
- **B2 witnesses (the verifier's P1 and P1b).** A dry run of the same join finds
  the install commit's last gateway read before its swap. The measured run
  records the change while that read is in flight, before it executes.
  - A REMOVE selection there refuses the install (`create_generation_mismatch`):
    nothing installed or opened, phase `target_removal_proposal_in_flight`.
  - A FAILED settlement there does the same; `completed_at` is set and the debt
    stays UNKNOWN.
  - On the old order, or under V7, that last read is a boot read after the row
    check, so the install commits and the join answers RUNNING.
- The verifier's own probes no longer find their injection point: no read
  follows the commit's row read before its swap, so their `injected` assertion
  fails.

**Blocker 2: every load-bearing check measured.** The ten new top-level tests of
the B2 witness file (in file order) and what each pins:

| Test | Pins | Verifier probe or mutation |
| --- | --- | --- |
| REMOVE selection in the commit's last pre-swap read | the row read is the last await | P1; V7, old order |
| terminal settlement in the commit's last pre-swap read | the same, with `completed_at IS NULL` | P1b; V7, old order |
| one basis column moved after MATERIALIZED (admission CLOSED with tokens kept; obligation) | MATERIALIZED and the obligation column each alone | P5; V8, V19 |
| configuration moved between the committed read and the seal | the producer's sealed-image re-read (`DESCRIPTOR_MOVED`, `corrupt_descriptor`) | P2; V11 |
| acked the installed boundary, then held below the leader's commit | RUNNING needs match >= the leader's commit, not the boundary | P3; V2 |
| the learner applies its own native REMOVE while no leader is observable | the opened learner's own committed view (`OPEN_NOT_LEARNER`, nothing adopted) | P4; V1 |
| leader answer at an older configuration than the learner applied | the two configuration epochs are compared (`epoch_mismatch`) | V3 |
| committed answer of one leader, status of another | answer and status must be one leader in one term | V10 |
| present generation: install marker, staging, replica sidecar | each part of the present-target guard | V6 |
| commit or match index absent or not an exact integer | O5: exact progress before the shared predicate | O5 |

The stale-descriptor test gained a subtest: an older configuration generation
in the same term (a raw native REMOVE of a follower voter), for V12.

**O5: exact progress before the shared predicate.** `progressUnproven`
(`message-group-learner-join.js:346-359`) requires the leader's commit index and
its match for the learner to be present, exact non-negative integers with
match >= commit > 0. Only then is `evaluateLearnerPromotionProof` consulted.
Otherwise the acknowledgement is BEHIND with `progress_unobserved`
(`MESSAGE_GROUP_LEARNER_PROGRESS`) or `progress_behind`. The shared predicate is
unchanged; it is 6.C's. On the first attempt's source:

- indices sent as decimal strings went RUNNING: the predicate read them as 0/0
  and granted, and `'2' >= 2` passed the boundary check;
- absent indices were refused only by the boundary check, after the predicate
  had granted (`progress_proven`).

**Notes.**

- N1: the census test was renamed, and a separate BOOTSTRAP-asker test added
  (section 7).
- N2: the deferRetry wording narrowed in code and in section 3.
- N3: the leaf accounting corrected (section 7).
- N4: the inventory and import graph regenerated after the last edit.
- N5: the canonical change-proof cone is not run here; it runs at land or on the
  lab.
- N6 and N7: declared in section 4. N8: section 8.
- The verifier's out-of-scope findings O3 to O6 are recorded in sections 8 and 9.

**Red-first.** Each new witness was run against the code that lacks what it
pins. The first attempt's source is the old commit order plus no exactness
check.

| Witness | Red on | Failing assertion |
| --- | --- | --- |
| REMOVE in the last pre-swap read | first attempt's source; V7 | "REMOVE in the last pre-swap read: {...running...}" |
| terminal in the last pre-swap read | first attempt's source; V7 | "terminal in the last pre-swap read: {...running...}" |
| partition: reads the durable row last | first attempt's source; V7 | "no await separates the authoritative row read from the effect" |
| partition: sees a change during the boot fence read | first attempt's source; the commit without its own boot read | strict equal: the commit answered true |
| partition: boot changed before the durable reread | the commit without its own boot read (green on both orders: the fence it keeps) | "Missing expected rejection." |
| indices absent / not integers | first attempt's source | absent: proofReason `progress_proven`, expected `progress_unobserved`; not integers: "not integers: {...running...}" |
| one basis column moved | V8 (CLOSED), V19 (obligation) | "admission CLOSED, tokens kept: {...running...}"; "membership obligation moved: {...running...}" |
| configuration moved | V11 | "no image is sealed across a moved configuration: {descriptor...}" |
| acked boundary, held behind | V2 | "a match at the installed boundary below the leader's commit: {...running...}" |
| own REMOVE, no leader observable | V1 | "own REMOVE applied while no leader is observable: {...not_caught_up...}" |
| older leader configuration | V3 (and V2) | "an older leader configuration is no acknowledgement: {...running...}" |
| mixed leader observation | V10 | "a mixed leader observation is no acknowledgement: {...running...}" |
| present generation parts | V6 (and M5) | "install marker / install staging / replica sidecar: {...running...}" |
| stale, older generation, same term | V12 | "older configuration generation in the same term: ..._install_refused: stale_epoch" |
| census, BOOTSTRAP askers | a third asker; M3 (the WITNESS purpose) | deep-equal on the asker list |

The rows from "one basis column moved" down measure behaviour the first attempt
already had. They are green on its source, and their red is the mutation that
removes the behaviour.

**Mutations.** All mutations ran in a scratch mirror of this working tree. Each
was applied alone, its witness files were rerun, and the bytes were restored and
checked by sha256 (all restored). The witness is the B2 file. The V7, old-order
and M4b runs add the partition owner file; the census runs use the census file.

| Id | Mutation | Result: first killing test |
| --- | --- | --- |
| V1 | skip the opened learner's own-view confirmation | killed: own-REMOVE test |
| V2 | RUNNING on match >= installed boundary | killed: acked-boundary test; older-configuration test |
| V3 | learner epoch := leader epoch | killed: older-configuration test |
| V4 | drop leader commit >= installed boundary | survives: the exactness check and the predicate cover it except a new leader whose commit lags the image (not witnessed) |
| V5 | accept the learner named as a voter | survives: the install owner requires the image to name a learner (`snapshot-install.js:379`) |
| V6 | present-target guard checks the db file only | killed: present-generation test (3 subtests) |
| V7 | an await between the basis check and the swap | killed: both last-pre-swap-read tests; partition row-last test |
| V8 | install basis without MATERIALIZED | killed: one-basis-column test, CLOSED subtest |
| V9 | drop the own-term-not-past-leader check | survives: defence in depth |
| V10 | answer and status need not agree | killed: mixed-observation test |
| V11 | producer skips the sealed-image re-read | killed: moved-configuration test (at the producer) |
| V12 | staleness by term only | killed: stale test, same-term subtest |
| V13 | image epoch need not equal the descriptor epoch | survives: defence in depth (in the fixture, the transfer owner receives against the descriptor's identity) |
| V14 | opened learner need not be applied at the boundary | survives: defence in depth |
| V15 | recorded origin with term + 1 | killed: 28 failing entries; positive "...descriptor_mismatch" |
| V16 | learner opened without the joining flag | killed: positive test (join suppression) |
| V17 | descriptor generation may precede the stamp's applied index | survives: defence in depth |
| V18 | learner shape without the node binding | survives: defence in depth |
| V19 | install basis without the obligation column | killed: one-basis-column test, obligation subtest |
| V20 | install basis without phase and permit | killed: REMOVE-after-MATERIALIZED test; last-pre-swap-read REMOVE test |
| M1 | `completeJoinConvergence()` after open | killed: positive test (join suppression) |
| M1b | lone hint list | survives (section 7) |
| M2 | skip install | killed: 30 failing entries; positive "...open_refused: durable-record-missing" |
| M3 | WITNESS-purpose producer | killed: demoted-leader test; census BOOTSTRAP-asker test |
| M3b | accept an older descriptor | killed: stale test, both subtests |
| M4 | install basis without the fact columns | killed: REMOVE-after-MATERIALIZED, last-pre-swap-read REMOVE and obligation tests |
| M4b | the install owner ignores the basis | killed: six B2 tests |
| M5 | no present-target guard | killed: later-admission test; present-generation test |
| M6 | RUNNING whenever leading | killed: positive, held-behind, acked-boundary, removed-while-waiting and other tests |
| M7 | install basis without `completed_at IS NULL` | killed: both terminal tests |
| M8 | image need not carry the origin | killed: identity-anchoring test |
| M9 | any cluster | killed: cluster subtest |
| M10 | the port ignores `bootstrapMembership` | killed: image-only open test |
| M11 | RUNNING ignores the leader's configuration | killed: removed-while-waiting test |
| old order | row read, then boot read, then check and swap | killed: both last-pre-swap-read tests; partition row-last and boot-fence-change tests |
| no own fence | the commit drops its own boot read | killed: partition boot-before-reread and boot-fence-change tests |
| O5 off | no exactness check | killed: indices test, both subtests |
| O5 off + V4 | no exactness check, no boundary check | killed: indices test, both subtests (absent and not integers go RUNNING) |
| third asker | a third BOOTSTRAP asker outside `src/raft` | killed: census BOOTSTRAP-asker test |

Survivors are V4, V5, V9, V13, V14, V17, V18 and M1b. Each is defence in depth
that another owner holds, or is recorded in section 7.

**Second round: the owner incarnation on the last row read.** The second
verification confirmed the repairs above and O5, and found one blocker by
probing the reorder's premise. `takeoverRetained` rewrites only
`create_admission_owner_incarnation`
(`replica-create-admission-owner.js:497-512`). The commit's last row read
checked the twelve authority fields and the caller's basis, not that column.
So a newer boot (102) could take the admission over and claim a worker while
boot 101's row read was in flight, and both ran a physical effect (verifier
probe T1).

- **Fix, one comparison, both paths.** The commit's last row read also requires
  `nullableSafeInteger(row.create_admission_owner_incarnation) === owner.ownerIncarnation`
  (`replica-create-process-owner.js:207-210`). The claim and every advance
  write that column as the acting owner, so a commit by the admission's own
  owner always passes it.
- **T1** (`refuses the effect when a newer boot takes the admission over during
  the durable reread; the newer boot's worker is the sole one`): boot 102 takes
  the MATERIALIZED admission over and claims a worker while boot 101's row read
  is in flight. Boot 101's commit answers false with no effect, and boot 102's
  own commit is the one that runs.
- **T1b** (`keeps the old effect the sole worker when the boot changes without
  a takeover during the durable reread`), the control: the boot row changes but
  nobody takes the admission over. The old effect runs, and boot 102, even
  holding the exact evidence, gets no worker.
- **Red-first.** Without the comparison (the code the second verification
  reviewed), T1 alone is red, at "a takeover recorded during the durable reread
  refuses the old commit". T1b and the B2 file stay green. On the original order (row read,
  then boot read, no comparison), T1 and T1b are both red: that order refused
  any boot change with DEFERRED.
- So closing both one-read windows needed one comparison, not a new read shape
  (section 9, O3). The superseded `d7e9ab0ef` witness's property is now carried
  through the row: no old-boot effect overlaps a newer boot's ownership of the
  admission.

| Id | Mutation | Result: first killing test |
| --- | --- | --- |
| no owner check | the commit's row read without the owner-incarnation comparison | killed: T1 |
| original order | row read, then boot read, no comparison | killed: T1 and T1b, plus the two order tests |
