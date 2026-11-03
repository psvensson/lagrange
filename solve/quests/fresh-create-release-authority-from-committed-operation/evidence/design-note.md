---
audience: evidence
recorded: 2026-11-02
quest: fresh-create-release-authority-from-committed-operation
status: proposal awaiting lead decision (no src change; quest declared, not sealed)
---

# Design note: release authority of a fresh CREATE from the committed create operation

This note follows `docs/development/verification-templates/design-note-template.md`. Evidence and history are in `research-2026-11-02.md` in the same directory.

## Claim, scope and current evidence

**Invariant.** The permission to release a partition that has no write origin rests on a committed fact that every leader of that partition can read and validate. A fresh founding CREATE carries that permission as the identity of its committed create operation, never as an object that exists only in the issuing node's memory. Any leader of the founding group answers the same question the same way.

**Failing witness.** Run `fresh-create-b-5d7469476-20261102T113540Z`, 11:41:55.388:

1. The founder `schema-job-…:replica:aa201722` of `tbl-…-p1` asked the seed's leader to release the group.
2. The seed refused with `release_operator_required{fresh_storage_or_operator_authority}`, because the token arrived as `{}`.
3. aa201722's create failed terminally.
4. The two-member group lost quorum, and `d-user-table-routable` was never met.

**Interaction.** The fresh founding CREATE of an initial table partition:

1. The provisioning job writes the operations.
2. Each founder runs `createReplicaAsync`, then `releaseFreshCreate`, then the completion loop.
3. Each release request is answered either by the local replica or, after `NOT_LEADER`, by the remote leader.
4. On a no-origin group, the leader's `localReleaseRefusal` checks the authority.

**Claim boundary.**

- This note repairs where the authority of a fresh CREATE is checked, and what that check reads.
- It does not change seed or operator authority, the cohort or census rules, the release algorithm, the deadline, or provisioning target selection (C6).
- It does not claim the user-table predicate green.

**Status of the evidence.**

- Observed: the witness above.
- Source: the token's JSON loss across the redirect, and the leader-side check (research §2).
- Precedent: the TX1 proposal names the create operation/job identity as the authority (research §3).
- Not yet observed: whether the seed founder's own create would have completed.

## Owner, committed fact, typed outcomes

### Owner

The participant-release authorization owner (`participant-release-authorization-owner.js`) remains the one decision point. It changes from minting volatile tokens for FRESH_CREATE to deciding from a committed fact. Two consumers stay unchanged in structure:

- `localReleaseRefusal` (`replica-handler-participant-cutover.js:269-284`) asks the owner;
- the client carries the request.

### Committed fact

The founding create operation row in `replica_operations`, read authoritatively by the answering leader through its own create-admission owner (`readOperation`). The authority holds only if **all** of (a)-(d) hold, and (f) orders the check:

- (a) the row matches the request's create identity: `operationId`, `replicaId`, `partitionId`, `targetNodeId`, `admissionToken`, `attemptToken`, `attemptSeq`, `replicaCreatedAt`, as `rowMatchesAdmissionIdentity` already checks;
- (b) `type` is ADD, `entity_type` is partition, and `partition_id` is the leader's partition;
- (c) `create_admission_state` is MATERIALIZED (or ACTIVE) and `completed_at` is null;
- (d) `steps_history[0][BOOTSTRAP_MEMBERSHIP]` is a GENESIS stamp whose founders include the leader's own replica identity.
- (f) **NOT_LEADER is answered first**, before any row read. A non-leader never grants or refuses on authority.

#### Condition (e): considered and rejected (lead decision, 2026-11-02)

The proposal was: every member of the leader's committed configuration must be a GENESIS founder.

Rejected as a grant condition. A legitimately fresh group whose committed configuration changed before its release would fail it, for example:

- a learner admitted by the rebalancer;
- a founder that was replaced.

Such a group would get a permanent `OPERATOR_REQUIRED`. That is a new orphan path of exactly the class this work removes (R11/R12).

Conditions (a)-(d) already discriminate. A restored legacy group has no non-completed GENESIS founding create row that names the answering leader's replica. It therefore fails (a)-(d) and stays `OPERATOR_REQUIRED`, as the TX1 proposal requires.

### What the request carries

The request carries `createAdmissionIdentity`: plain data with the identity fields of (a). That data is discovery only. The leader re-reads the row, and the carried data never authorizes anything by itself.

The FRESH_CREATE object token and its `AUTHORIZATION` entry are deleted. The first ask goes to the local node, as today, and the local node is checked the same way.

### Typed outcomes, all on the existing vocabulary

| Situation | Answer |
| --- | --- |
| Authority read unavailable | `UNAVAILABLE{missingFact: create_admission_authority, retryAfterMs: PAUSE_RETRY_AFTER_MS, authorityOutcome, authorityError}`. The existing completion loop retries it under the existing create deadline. This is quest B's L2 answer, now produced by the leader that decides. |
| Row absent, or it fails any of (a)-(d) | `OPERATOR_REQUIRED{fresh_storage_or_operator_authority, reason: <which condition>}`. This is today's permanent typed refusal, with the reason now named. The explicit operator release remains the reconsideration path. |
| Origin present | No authority needed; unchanged. |
| Not leader | `NOT_LEADER`; unchanged. |

### Seed and operator

`FRESH_SEED` and `OPERATOR` keep their current carriers: the startup owner's local FRESH_SEED outcome, and the explicit operator request at the leader. Both are recorded as residual consumers of the same class (an R17 finding). This quest does not change them.

## Contract and failure analysis

1. **Consumed surfaces (existing):**
   - `ReplicaCreateAdmissionOwner.readOperation`;
   - `rowMatchesAdmissionIdentity` and `requestFromAdmissionRow`;
   - `getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP)`;
   - the GENESIS stamp kind (`raft-committed-membership-constants.js`);
   - `readCommittedMembership` in `runCutoverAttempt` (already read there);
   - `localReleaseRefusal`;
   - `completeParticipantRelease` and `requestParticipantRelease`, unchanged.
2. **Failure edges:**
   - **Lost reply.** The next attempt re-reads the authority.
   - **Leader change mid-attempt.** The new leader decides from the same row.
   - **Founding completed between attempts.** The origin exists by then, or (c) refuses.
   - **Crash before the origin.** The provisioning job's retry reuses the same operation identity (TX1 proposal :298-300).
   - **Deadline.** The existing create deadline governs. A failure keeps quest B's cleanup claim.
3. **Cached views.** None used for the decision. The services cache and the cached `replica_operations` rows are never consulted. Only the authoritative row and the committed configuration are.
4. **Identity.** The authority is bound to:
   - the operation identity and admission generation (from the row);
   - the partition (from consensus). The leader's committed configuration is used only by the release identity; it is not a grant condition (see the rejected condition (e)).
   A change of the configuration or the generation between the read and the release is `STALE`, as the existing release identity already does.

## Deletions

- In `participant-release-authorization-owner.js`:
  - the FRESH_CREATE kind's object token and `AUTHORIZATION` entry;
  - quest B's `PENDING_FRESH_CREATE` WeakMap and the per-attempt `confirmFreshCreate` on the local receive. These are superseded: the read moves to the deciding leader, with the same typed answers.
  - The `validates()` branch for FRESH_CREATE.
- In `releaseFreshCreate`, the up-front `authorizeFreshCreate` read. The local prerequisites stay: `identityExisted === false` and the evidence's partition. The authority is decided per attempt by the answering leader.
- **Audit.** `scripts/participant-release-completion-audit.js` pins the `releaseFreshCreate` body (`FRESH_CONTRACT`). Changing that body requires an explicit reviewed update of that contract string under R09. It is a supersession of quest `participant-release-completion-owner`'s fresh-CREATE prerequisite clause ("fresh CREATE keeps its prerequisites and exact answer identity"), not a widening. The completion loop itself (`OWNER_CONTRACT`, `REQUEST_CONTRACT`) stays byte-identical. **This is a decision for the lead.**
- **Rejected remedies, not reintroduced:**
  - a `fresh: true` boolean;
  - a GENESIS request/stamp alone as proof (conditions (a)-(d) read the committed row, never the request);
  - RESTART_CREATE or a table lookup as authority;
  - a new authority record;
  - serializing the token, or a cross-node token registry;
  - a carve-out that lets a no-origin group release without authority;
  - turning OPERATOR_REQUIRED into a retry.

## Blast radius (test files that reference the symbol)

| Symbol | src files | test files |
| --- | --- | --- |
| `participantReleaseAuthorizationOwner` | 4 | 5 |
| `authorizeFreshCreate` | 2 | 0 |
| `confirmFreshCreate` | 2 (quest B) | 0 (exercised through quest B's witnesses) |
| `FRESH_STORAGE_OR_OPERATOR_AUTHORITY` / `fresh_storage_or_operator_authority` | 2 / 1 | 1 / 1 |
| `releaseFreshCreate` | 2 | 4 |
| completion audit `FRESH_CONTRACT` | `scripts/participant-release-completion-audit.js` | `test/scripts/participant-release-completion-owner.test.js` |

Counts are of files that reference the symbol on `96dce8ad4` (`grep -rlF`).

## Red tests (written first, before any src change)

1. **Cross-node founding release (production-bound).** Fixture: a real two-node founding group, on the loopback transport with JSON-encoded remote delivery, with real ReplicaHandlers per node, real PartitionServices and the raft-rs port. Each founder's create operation row is MATERIALIZED with a GENESIS first step, through the gateway.
   - The leader is on node A. Node B's founder runs `releaseFreshCreate`.
   - Today: `OPERATOR_REQUIRED{fresh_storage_or_operator_authority}`, and B's create fails.
   - Expected: CUT_OVER within the deadline.
2. **Legacy no-origin group stays refused.** Same fixture, but the leader's committed configuration names a non-founder, or the founding operation is completed.
   - Expected: `OPERATOR_REQUIRED` with the named reason; never CUT_OVER.
3. **Join ADD is not founding authority.** The first step carries a COMMITTED stamp.
   - Expected: `OPERATOR_REQUIRED`.
4. **Leader-side authority unavailability is typed and retried.**
   - The leader's gateway refuses the read N times: the create completes within the deadline.
   - The gateway refuses forever: the create fails at the deadline with a cleanup claim.
   - This is quest B's witness, moved to the cross-node setting.
5. **No token survives.**
   - An AST/grep assertion that `participant-release-authorization-owner.js` holds no FRESH_CREATE `WeakMap` and that release requests carry no object token for FRESH_CREATE.
   - The completion audit test (`test/scripts/participant-release-completion-owner.test.js`) updated under R09 for the new `FRESH_CONTRACT` only.
6. **Leader change between attempts.** The new leader decides from the same row.

7. **Negative control: a forged identity is refused.** A hand-built request names a create identity that is foreign to this partition: an open founding row of another partition, or a row whose stamp does not name the leader's replica.
   - Expected: `OPERATOR_REQUIRED`. The carried identity is a lookup key, never authority.
8. **A fresh group whose configuration changed still releases.** A learner is admitted, or a founder is replaced, before the release.
   - Expected: CUT_OVER. This guards the rejected condition (e).

Red test 1 is the production-bound witness (named `cross-node-founding-release-cut-over`).

## Why this quest is separate from quest B

Quest B lands first, on its own verification. Its L2 pending token closes the permanent-failure defect now: an unavailable authority read is a typed retry under the create deadline, not a terminal create failure.

This quest then deletes, as superseded:

- the FRESH_CREATE token;
- its WeakMap;
- the up-front `authorizeFreshCreate` read;
- quest B's pending-token mechanism.

An explicit R09 note goes in both quest logs.

The two steps are kept as bounded units, each independently verified. Quest B's claim (a typed unavailability never orphans a committed obligation) and this quest's claim (the release authority is a committed fact any leader reads) are different invariants with different witnesses. Merging them would put an unverified authority redesign on the path of an already-verified liveness repair. The deletion is the planned second step of a supersession, not churn.

## R17 residuals (out of scope, with owners)

- **FRESH_SEED authorization carrier.** The startup owner's FRESH_SEED outcome, held as a local token for the seed's own lone groups. Owner: the seed/startup release lineage (`fresh-seed-activation`, `seed-release-once-per-partition-cohort`).
- **OPERATOR authorization carrier.** The explicit operator release at the leader. Owner: the participant-release operator entry (TX1 proposal :323-337).

No witness of a cross-node failure exists for either.

## Evidence and closure

- **Safety.** A no-origin group releases only when an open, committed GENESIS founding create operation of that partition names the answering leader's replica and matches the request's create identity; a non-leader never decides.
- **Progress.** Under finite failures, any leader can decide. Unavailability is retried within the deadline; a refusal is permanent and typed, with the operator release as the reconsideration path.
- **Proof.**
  - The red tests above.
  - The live reproducer, with `d-user-table-routable` as the measured predicate. Expect other links: C6 provisioning targets (Group A), C1/C10 (Stream B).
  - Independent verification.

## Recommendation (one)

Seal `fresh-create-release-authority-from-committed-operation` with the design above:

- the leader decides the fresh-create release authority from the committed founding create-operation row, conditions (a)-(d), with NOT_LEADER answered first (f);
- the FRESH_CREATE token and quest B's pending-token mechanism are deleted;
- the existing typed outcomes are kept;
- the completion audit's `FRESH_CONTRACT` is updated by an explicit R09 supersession.

FRESH_SEED and OPERATOR are left as recorded residuals. Quest C (`participant-release-permanent-refusal`) follows.

## Stream B dependency and quest B coverage gaps (lead decisions, 2026-11-02)

**Stream B dependency.** Quest B (landed as fresh-create-failure-after-committed-admission-v2, bba206ddd) carries the admission-input anchors RUNTIME_OPENED and ADMISSIBLE_ROW_RESUMED (`src/node/replica-create-admission-input.js`). Stream B's `replica-admission-from-committed-operation` deletes the SYNCING-row admission producer and admits from the committed operation through `requestReplicaAdmission`. That quest lands on its own.

Once both quests are on main, this quest moves the admission-input boundary to the first `requestReplicaAdmission` send, the only admission input that will remain. The move is a change to `ADMISSION_INPUT_BY_PHASE` in that one owner. It happens in this quest because this quest also replaces the pending-token mechanism.

**Coverage gaps from quest B's verification.** These are R17 findings in this quest's log, to be closed here:

- **C1.** Add a witness with a local CREATING replica over a durable SYNCING row. Today, dropping the resume report survives every witness.
- **C2.** Add a PENDING-restart control. Today, ignoring admissibility in `replicaCreatePhaseAfterResume` survives every witness.
- **C3.** The two rules treat a row without a status differently: `isPeerRowStatusAdmissible` treats it as live, while the phase rule leaves the phase unchanged. Unify them when the boundary moves.

## Decisions recorded (lead, 2026-11-02)

1. **Completion audit: approved.** `FRESH_CONTRACT` in `scripts/participant-release-completion-audit.js` is updated at implementation. The fresh-CREATE prerequisite clause of `participant-release-completion-owner` is superseded explicitly under R09, by an appended statement in that quest's log; recorded text is never edited. `OWNER_CONTRACT` and `REQUEST_CONTRACT` stay identical, and the audit proves it.
2. **Condition (e): rejected.** The reason is recorded above. Condition (f) is added.
3. **Scope.** FRESH_SEED and OPERATOR are out of scope, recorded as R17 residuals with their owners.
4. **Sequencing.** Quest B first; this quest deletes its pending-token mechanism as superseded.
5. **Red tests.** Tests 1-6 approved. Test 1 is the production-bound one. Test 7 (forged identity) and test 8 (configuration change) are added. This quest is sealed only after quest B is verified and merged with Stream B.
