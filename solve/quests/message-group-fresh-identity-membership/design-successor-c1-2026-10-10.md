---
audience: development
documentClass: current
---

# FreshMG 6.C slice C1: ordered successor of the learner action

Quest: `message-group-fresh-identity-membership` (epic `raft-rs-full-cutover`).
Runbook: [local takeover](local-takeover-20261010.md) section 6.C, first slice.
Base: `e93c65f4d` (source identical to the CREATE B2 head `36dc704b1`; the later
commits touch only the Quest log). Line numbers cite the working tree after this
slice unless marked (base); raft-rs lines cite the locked crate `raft-0.7.0/src`
in the cargo registry. This note is a design and implementation record. It is
not independent approval, production wiring, promotion proof or physical
acceptance.

**Review round (2026-10-11).** The independent verification rejected the first
attempt on four blockers: unrecorded supersessions (B1), a fence whose premise a
NULL-origin reservation breaks (B2), the witness file's unit classification (B3)
and three guards no witness measured (B4). The repairs are folded into the
sections below and summarised in section 11.

## 0. The problem C1 solves, and the one it does not

An issued learner attempt (permit sequence k, ADD_LEARNER, in flight) can end
with no committed origin anywhere. Its native turn may have been refused because
the leader term moved. Its leader may have crashed before replication. Or its
entry may have been overwritten by a newer leader. Before C1 such a row kept
UNKNOWN debt forever. Absence of an origin proves nothing
(`message-group-learner-outcome-recording.md`, "Native refusals retain their
meaning"). Refreshing the permit in place to escape STALE_LEADERSHIP is forbidden
(runbook section 2; safety-first ruling, "Current effects keep their own
authority").

C1 issues the next attempt (sequence k+1) of the same transition only when three
things hold together:

- the predecessor is definitively fenced;
- it is authoritatively noncommitted, as vouched by the fencing replica's own
  peer-identity registry;
- the successor is ordered against any delayed execution of the predecessor.

C1 records nothing about the predecessor and proposes nothing itself. It grants
no CREATE, promotion, removal, cleanup or lane release. The existing runtime
consumer proposes the successor; the next discovery turn records its exact
outcome through the existing recorder.

## 1. Consumed surfaces (cite or it does not exist)

Native owner (raft-rs, the runtime owner, the registry):

- **Single pending configuration change in raft-rs.**
  - `pending_conf_index` is defined at `raft.rs:205-216`.
  - `become_leader` sets it to the last log index (`raft.rs:1227-1232`), then
    appends the leader's own empty entry (`raft.rs:1234-1238`).
  - It is raised for every admitted conf change (`raft.rs:2077`) and on
    auto-leave (`raft.rs:980`). It is reset only with the term
    (`raft.rs:986-1000`).
  - A conf change is dropped while `pending_conf_index > applied`
    (`raft.rs:2062-2090`; `has_pending_conf` at `raft.rs:2742-2744`).
  - A leader commits only entries of its own term (`raft_log.rs:498-510`).
- **The port refuses before the core does:** NOT_LEADER, and CONF_CHANGE_PENDING
  while a change is pending (`raft-rs-conf-change-admission.js:83-85, 104-137`).
- **The membership transition turn** (`raft-rs-membership-transition-runtime.js`):
  - stale runtime or lifecycle (`:186-198`);
  - leadership at exactly the permit's term (`:213-218`, STALE_LEADERSHIP);
  - exact configuration key and generation (`:219-224`, STALE_CONFIGURATION);
  - role (`:54-76`, ALREADY_LEARNER);
  - the volatile same-generation permit-sequence fence (`:166-184`, STALE_PERMIT);
  - the anchored proposal (`:269-296`).
- **Generation and applied order.** The generation is the index of the last
  applied conf-change entry (`raft-rs-runtime-owner.js:960-970`). The runtime
  applies entries before advancing the core's applied index
  (`raft-rs-runtime-owner.js:1016-1024`).
- **The learner-action read runs in one queued turn:** a fresh status, then the
  registry (`raft-rs-runtime-owner.js:1424-1425`,
  `raft-rs-committed-membership-read.js:204-216`).
- **Origin and reservation writes.** Applying a managed ADD_LEARNER reserves the
  identity and records its origin in one transaction
  (`raft-rs-operation-port.js:229-235`). Reservations are append-only and
  write-once (`raft-rs-peer-identity.js`).
- **Other ways a registry learns an identity.** A COMMITTED stamp bootstrap
  registers every configured identity without an origin
  (`raft-rs-bootstrap-membership.js:63-71`). Address hints and local proposals
  register identities (`raft-rs-operation-port.js:164-171, 188`;
  `raft-rs-group-membership-admission.js:295-306`). An older registry gains the
  origin column by migration, its rows NULL (`raft-rs-peer-identity.js`
  constructor). An image install swaps in the producer's registry file
  (`snapshot-install.js:403-409`).
- **(C1) `learnerOriginEvidence`** (`raft-rs-peer-identity.js:241-257`, states in
  `raft-rs-peer-identity-constants.js:53-64`): RECORDED with the origin, ABSENT
  when the registry holds no reservation of the replica, or UNVOUCHED when it
  holds one without an origin.
- **(C1) Wiring.** The port's `readLearnerOriginEvidence` capability
  (`raft-rs-operation-port.js:236-237`) replaces `readCommittedLearnerAdmission`;
  the runtime owner forwards it by the same one-line field
  (`raft-rs-runtime-owner.js:1678`).
- **(C1) `currentTermApplied` in the shaped status**
  (`raft-rs-status-observation.js:93-107, 141`): the replica leads, and its
  core's `applied` exceeds `pendingConfIndex`. A status missing either index
  answers false.
- **(C1) A NOT_RECORDED answer carries its same-turn observation**
  (`raft-rs-committed-membership-read.js:160-176, 207-213`):
  - replica identity, role and term;
  - `currentTermApplied`;
  - `originRegistryComplete`, meaning the registry's evidence for the target is
    ABSENT;
  - applied index;
  - configuration key and generation;
  - lifecycle incarnation and runtime generation.

Operation owners (all subordinate to `ReplicaOperationRepository`):

- **Permit codec** (`replica-operation-message-group-membership-permit.js`):
  - decoder (`:82-101`);
  - (C1) canonical encoder `encodeMembershipPermit` (`:102-110`);
  - outcome NONCOMMITTED (`:16-21`);
  - debt outcome SUCCESSOR_ISSUED (`:24-33`).
- **Claim owner** (`replica-operation-message-group-membership-owner-claim.js`,
  untouched):
  - `observeMembershipOperation` (`:48-57`);
  - `membershipClaimIsLocalAndLive` (`:58-65`);
  - `membershipBootIsCurrent` (`:66-80`);
  - the full-row CAS basis `membershipRowWhere` over `CLAIM_FIELDS` (`:116-146`).
- **Recorder and predicates** (`replica-operation-message-group-membership-authorization.js`):
  - (C1) `learnerActionMatches` (`:191-200`) replaces the sequence-1 pin of the
    recorded learner action. Initial issuance stays at sequence 1
    (`initialLearnerPermitMatches`, `:201-205`).
  - (C1) The absence classification (`:347-408`): `canonicalAbsenceObservation`,
    the fence `absenceFencesLearnerAction` (`:369-382`), `learnerActionAbsence`
    and `learnerObservationRefusal`.
  - (C1) The issuance's own read, `observeLearnerActionAbsence` (`:450-465`).
  - The leader role constant comes from the native owner
    (`raft-rs-runtime-owner-constants.js`).
  - The recorded-fact predicate `recordedLearnerFactIsValid` (`:587-596`) is
    consumed by discovery, the recorder, branch selection and the CREATE basis.
- **(C1) Successor issuance** `replica-operation-message-group-learner-successor.js`
  (`issueMessageGroupLearnerSuccessor`, `:184-207`), exposed by the repository
  facade (`replica-operation-repository-message-group-membership-methods.js:85-90`).
- **Runtime consumer's observation**
  (`replica-operation-message-group-learner-observation.js:27-33`): (C1) accepts
  any in-flight learner attempt of the transition whose exact permit is on the
  row (`exactIssuedIntent`, `:81-94`, unchanged).
- **Discovery** (`operation-workflow-message-group-membership-recovery.js`):
  - the learner-action permit (`:107-112`);
  - the hint filters renamed from "initial" (`owesLearnerAttemptTurn`,
    `replicatedRowOwesLearnerTurn`, `laneOwesLearnerTurn`);
  - (C1) NONCOMMITTED routes the same turn to the issuance (`:177-203, 231-235`),
    classified on the issuance's own final row;
  - logging (`:253-254`).
- **Transport capability** (`operation-workflow-message-group-native-read.js`):
  (C1) `issueMessageGroupLearnerSuccessorInline` shares the inline lane-turn
  check with the recorder (`:99-121`).
- **Runtime consumer** `proposeAuthorizedGroupLearner` and its no-refresh rule
  (`raft-rs-group-membership-admission.js:295-306, 344-372`), unchanged. It
  reserves the target at the proposer before its native turn (`:299`).

## 2. The fence, the noncommitment proof and the ordering

**Fence (definitive).** The predecessor P (permit sequence k, leader term T) is
fenced when one queued native observation of a replica R shows all of the
following:

- R leads a term T_R > T;
- `currentTermApplied` holds;
- the target's origin is absent from R's registry;
- `originRegistryComplete` holds: R's registry holds no reservation of the
  target at all.

The predicate is `absenceFencesLearnerAction` (`authorization.js:369-382`).

**Why that proves P can never commit.**

1. **P can exist only as an entry of term T.** P's native turn admits it only at
   a leader whose current term equals T (`transition-runtime.js:213-218`), and
   raft-rs appends a proposal at the leader's term.
2. **R has applied an entry of term T_R.** `currentTermApplied` means R's core
   applied past `pending_conf_index`. That index is at least R's last index E at
   election and only rises while R leads. Every entry after E is R's own, so the
   entry at E+1, of term T_R, is applied, hence committed, at R.
3. **A committed P would lie inside R's applied prefix.** Terms never decrease
   along the committed log, and that log is one sequence. If P were ever
   committed at index i, term(i) = T < T_R = term(E+1), so i < E+1.
4. **R's registry would then hold the target's reservation, and it holds none.**
   P inside R's applied prefix means one of two things:
   - R applied it. That reserves the target and records P's origin in one
     transaction.
   - R folded it through a stamp or image bootstrap. That names the target while
     it is still configured. The registry is append-only, and the transition's
     own branches are the only removers of its fresh target; they run only after
     its learner fact is recorded, and the per-group lane serializes membership
     changes.

   Either way R's registry would hold the target's reservation.
   `originRegistryComplete` says it holds none, so P never commits.

**Premise and guard (review B2).** Step 4 is the completeness premise, and it
fails exactly where a registry holds the target's reservation without an
origin:

- a registry migrated from the pre-origin schema (`d22c39192` to `6255634c7`);
- a stamp or image bootstrap that folded the action;
- a local proposal or address-hint reservation.

The registry owner reports that shape UNVOUCHED, and the fence then fails
closed: UNKNOWN, retained, with no successor. The committed fact stays
recordable at any witness whose registry holds the origin. An observation that
carries no vouch at all (a native owner that cannot vouch) never fences either:
the recorder classifies an absent vouch like a false one, UNKNOWN, and only a
vouch that is not a boolean, like any other malformed observation, CONFLICT.

The guard costs liveness, never safety. A replica that reserved the target (the
proposer of an earlier attempt, a hinted or stamped replica) can never fence
later attempts. A successor then waits for a leader that never reserved the
target.

The stamp case is a hole the first attempt had with current code, not only with
migrated registries: a COMMITTED-stamp joiner's registry lacks origins for
learners added before its stamp.

**Ordering against a delayed predecessor.** After the fence P can never commit,
so no delayed execution of it can produce a second learner:

- at R, or any replica past term T, P's native turn is refused STALE_LEADERSHIP
  (or NOT_LEADER);
- a stale leader still at term T may append it but cannot commit it.

Independently, the successor S carries R's term, configuration key and
generation, lifecycle and runtime fences from the same observation. S's native
turn therefore passes only at a leader of term T_R with that exact configuration
and no pending conf change:

- if P were ever applied there, the generation would have moved
  (STALE_CONFIGURATION);
- while P sat unapplied in that leader's log, the single-pending rule defers S
  (CONF_CHANGE_PENDING);
- raft-rs drops any second pending change itself.

The two attempts are mutually exclusive by the native owner's rules. C1 relies on
the fence and keeps this exclusion as defence in depth (witness 4; mutations M6a
and M6b).

**Issuance** (`issueMessageGroupLearnerSuccessor`):

1. Reads the authoritative row. The attempt must be the row's in-flight learner
   attempt of an open ordinary operation, with UNKNOWN obligation and no stamp
   (`inFlightAttempt`, `:65-77`; `owesLearnerAttempt`, `:57-64`).
2. Performs its own exact read through the caller's read capability, classified
   by the recorder (`observeLearnerActionAbsence`). Anything but NONCOMMITTED is
   returned as is. A caller never supplies evidence.
3. Requires the fencing observation to come from the routed destination's
   replica (`:201-204`).
4. Reads the destination's canonical boot and its own (`:162-165`). Re-reads the
   row, using the final row as the CAS basis and re-checking it in flight
   (`:168-174`). Requires a live local holder claim (`:175-178`).
5. Composes S (`successorPermit`, `:96-112`): sequence k+1; the same transition,
   stage, target and peer; the observation's term, configuration stamp,
   lifecycle and runtime fences; the current holder's fences; this node as
   proposer; the destination node and boot. `successorFollows` (`:87-95`)
   refuses anything else, so there is no refresh and no reused sequence.
6. Applies one exact CAS over the full observed row, owner claim included, that
   changes only the permit column (`:138-160`). Submission admission checks the
   live holder and canonical boot before every attempt. Readback answers
   RECORDED only when the row carries the successor of this predecessor, ours or
   a concurrent issuer's (`successorIssued`, `:78-86`). An obsolete invocation
   answers UNKNOWN.

## 3. Predecessor-outcome decision table

| Predecessor outcome (recorder read at the witness) | Recorder outcome | Successor | Debt | Witness |
| --- | --- | --- | --- | --- |
| Committed: exact origin present | RECORDED (fact recorded, 3 receipt columns) | none | UNKNOWN (later owners) | 2 |
| NOT_RECORDED, observation fences (leader, T_R > T, currentTermApplied, originRegistryComplete) | NONCOMMITTED, nothing written | issued once (sequence k+1) through the repository's own re-read | UNKNOWN, SUCCESSOR_ISSUED | 1 |
| NOT_RECORDED, fencing leader but its registry holds the target without an origin (migrated, stamped, proposed, hinted) | UNKNOWN | none | RETAINED; a committed fact is recorded at another witness | 11 |
| NOT_RECORDED, not fenced: same term (P's own leader still leads) | UNKNOWN | none | RETAINED | 3 |
| NOT_RECORDED, not fenced: a follower of a newer term | UNKNOWN | none | RETAINED | 3 |
| UNKNOWN: newer-term leader with no entry of its term applied (P may sit unapplied in its log) | UNKNOWN | none | RETAINED; P later commits and is recorded | 1 (window), 4 |
| NOT_RECORDED without an observation (older native) | UNKNOWN | none | RETAINED | 10 |
| NOT_RECORDED whose observation carries no registry vouch, or a false one | UNKNOWN | none | RETAINED | 10 |
| Malformed observation (any other key missing, an extra key, a wrong type, a vouch that is not a boolean) | CONFLICT (warn) | none | RETAINED | 10 |
| Native UNAVAILABLE, transport loss | UNAVAILABLE | none | RETAINED, witness rotated | existing discovery suite |
| Fenced, but the ordinary operation is settled FAILED (before or inside the issuance) | NONCOMMITTED | refused (CONFLICT, no write) | RETAINED with the settlement owner named (debug, not warn) | 9, 13 |
| Delayed old execution after the successor was issued | n/a | the successor stands | the predecessor request is refused MISMATCH at the runtime consumer (row moved), its native turn STALE_LEADERSHIP; it never commits; one learner, the successor's | 1 |
| Delayed old execution racing a successor bound to an unfenced observation | n/a | not issued (witness 4 shows why) | a successor-shaped proposal is refused CONF_CHANGE_PENDING, then STALE_CONFIGURATION once P applied; P is recorded; no second learner | 4 |

## 4. Typed failure edges

| Edge | Typed outcome | Fails closed? | Caller observes |
| --- | --- | --- | --- |
| Request not an own-data record, empty node/replica, missing read or lifetime callback | INVALID | yes, no read | discovery INVALID_INPUT (warn) |
| Invocation not current (shutdown, ownership epoch moved) before the first read | UNAVAILABLE | yes | RETAINED |
| Row unreadable | UNAVAILABLE | yes | RETAINED |
| Row is not an in-flight learner attempt of an open operation (recorded, later phase, terminal, stamped, wrong identity) | CONFLICT, no native read | yes | settled operation: RETAINED (settlement owner, judged on the issuance's final row); otherwise CONFLICT (warn) |
| Own read: committed origin | CONFLICT (recording belongs to the recorder) | yes | CONFLICT; the next turn's recorder records it |
| Own read: not fenced, an unvouched registry, an absent or false vouch, or no observation | UNKNOWN | yes | RETAINED |
| Own read: malformed observation | CONFLICT | yes | CONFLICT (warn) |
| Own read: transport or native unavailable, thrown read | UNAVAILABLE | yes | RETAINED |
| Fencing observation from a replica other than the routed destination | CONFLICT | yes | CONFLICT (warn) |
| Destination or own canonical boot unreadable or stale | UNAVAILABLE | yes | RETAINED |
| Row changed across the awaits to a successor of this predecessor | RECORDED, no write | n/a (one permit) | SUCCESSOR_ISSUED |
| Row settled or otherwise changed across the awaits | CONFLICT, no write | yes | as above |
| Holder claim not local and live | STALE_OWNER | yes | RETAINED |
| Composition fails the codec or `successorFollows` | INVALID | yes | INVALID_INPUT |
| Submission admission refused (holder, boot, lifetime) | write not submitted, then UNKNOWN | yes | RETAINED |
| CAS answer lost or failed | readback decides | n/a | RECORDED if the successor is on the row, else UNKNOWN |
| A held old CAS after a newer claim or successor | matches nothing (claim and permit in the basis) | yes | one permit |
| Native status missing `applied` or `pendingConfIndex` | `currentTermApplied` false | yes | UNKNOWN |
| Absent, empty or already-satisfied input | a recorded fact is CONFLICT before any read; an existing successor of this predecessor is RECORDED with no write; an issued successor is never fenced at its own term | yes | no second permit |

## 5. Cached-view audit

- **Replicated `replica_operations` cache.** It is a hint census for the
  periodic sweep and the wakes only. The turn re-reads the row authoritatively;
  the issuance reads it twice more, authoritatively, and uses the final row as
  the CAS basis. A lagging cache row can delay a turn but never decides one
  (witness 8; mutation M8 reads the cache in the issuance and is killed).
- **Services census.** It is a route hint naming the witness. The native answer
  at that node is the evidence: the recipient checks the replica and node
  binding, and the issuance requires the fencing observation's replica to equal
  the routed replica.
- **Native status observation.** `currentTermApplied` is read in the same queued
  turn as the registry evidence, from the core's status at that moment; it is
  not cached.
- **Peer-identity registry.** It is durable and append-only, not a cache. Its
  ABSENT evidence is read in the same turn as the status.
- **The native volatile STALE_PERMIT fence** (`raft-rs-runtime-owner.js:1704`) is
  per replica and lost on reconstruction. C1 does not rely on it.
- **The witness rotation map** is a scheduling hint. It is reset when the
  recorder answers NONCOMMITTED and never gates issuance.
- **Nothing in C1 caches the fence.** Process loss between the fence and the CAS
  re-proves it after restart (witness 7).

## 6. Identity anchoring

| Artifact | Pinned by | Source | When the anchor moves |
| --- | --- | --- | --- |
| Successor permit | operation id and transition identity (immutable identity), target replica and peer id, ADD_LEARNER stage | the authoritative row's identity and predecessor permit | the identity never moves; a row whose identity differs is CONFLICT |
| Permit sequence | predecessor sequence + 1, monotonic per transition | the predecessor on the final row (CAS basis) | a concurrent successor makes the CAS miss; readback answers RECORDED for it, never a third value |
| Leader term, configuration key and generation, lifecycle incarnation, runtime generation | the fencing observation of the destination replica | the issuance's own native read | the native turn refuses S (STALE_*); S is then itself fenced later and gets S+1 |
| Destination node and boot | the routed witness that answered, its canonical nodes row | services census route, authoritative nodes read | the runtime consumer refuses a stale binding (witness 14 binds boot 7) |
| Holder fences and CAS basis | the live claim on the final row | claim owner | a renewed or adopted claim defeats the CAS (witness 12) |
| Native origin of S | operation, transition, sequence k+1, stage, target, peer | the replicated conf-change context | P's origin can never coexist (section 2) |

## 7. Witnesses, red-first and mutation controls

**The witness file** is
`test/integration/message-group-learner-successor-ordering.integration.test.js`.
It runs as an integration file (test/guidelines/harness.md), like its
message-group learner siblings, and uses:

- the real three-founder raft-rs group (`PartitionNodeCluster`);
- the real repository on file-backed canonical operation SQL;
- two real routers with a registered MessageGroupServiceHandler;
- the production discovery turn on the real lane;
- the existing runtime consumer.

Operation SQL, node rows and the services census are explicit fixtures.

1. **Owner path** (`:165`). P is proposed at the cut-off old leader, and a
   survivor wins a newer term.
   - Window (its own entry not yet applied): no successor.
   - After it applies its term: exactly one successor, sequence k+1. Only the
     fences, sequence and destination moved; phase and debt are unchanged.
   - The delayed predecessor request is refused MISMATCH; its native turn,
     STALE_LEADERSHIP.
   - The runtime consumer proposes S. Every founder then holds exactly one
     committed learner entry, sequence k+1.
   - The next turn records it once, changing only the three receipt columns. The
     obligation stays UNKNOWN.
2. **Committed predecessor** (`:316`): recorded with its exact fact; no
   successor.
3. **Not fenced** (`:345`): the same-term leader and a newer-term follower keep
   the debt; the fencing leader then issues (positive control).
4. **UNKNOWN window** (`:379`): P sits unapplied in the new leader's log.
   - No successor.
   - A successor-shaped proposal is refused CONF_CHANGE_PENDING, then
     STALE_CONFIGURATION after P applies.
   - P is recorded; there is one learner entry.
5. **STALE_LEADERSHIP** (`:430`).
   - The old permit is refused at its own replica and through the new leader's
     port.
   - A refreshed sequence-1 permit is refused by the initial authorizer.
   - The refused attempt reserved the target at the new leader, so that leader
     never fences (fail closed).
   - After a named leadership transfer, the founder that never reserved the
     target issues sequence k+1.
6. **Duplicates** (`:483`): two issuers race over the same predecessor and one
   CAS applies; a lost CAS answer is resolved by readback, and repeated turns
   write nothing more.
7. **Process loss** (`:535`). This is close and reopen with new repository and
   owner objects, not SIGKILL.
   - An owner stopped before its CAS submits nothing, and a restarted owner
     issues once.
   - A held old submission cannot overwrite the successor that a new holder
     issued after takeover.
8. **Cache** (`:577`): a lagging replicated cache row neither issues nor blocks.
9. **Settled operation** (`:594`): FAILED stays FAILED, no successor, typed
   retained diagnosis.
10. **Classification** (`:616`). It covers the native observation shape; an
    absent observation, an absent or false vouch and the other non-fencing
    observations (UNKNOWN); malformed observations, a vouch that is not a
    boolean included (CONFLICT); and the issuance refusal edges. Nothing is
    written.
11. **Unvouched absence** (`:679`, review B2), two cases:
    - a committed predecessor whose new leader's reservation lost its origin
      (the migrated shape) keeps the debt, with no successor, and is then
      recorded at another founder;
    - a noncommitted predecessor whose new leader reserved the target locally
      keeps the debt (fail closed).
12. **Claim in the CAS basis** (`:731`, X4): a competing claim adopted after the
    old holder submitted (no new permit yet) defeats the held CAS.
13. **Final-row re-check** (`:752`, X14): an operation settled FAILED inside the
    issuance window gets no successor, and the turn names the settlement owner.
14. **Destination boot** (`:775`, X7): an unreadable destination row is
    UNAVAILABLE with no write; a restarted destination's boot (7) is the one
    bound.

`test/rebalancer/message-group-membership-branch-authorization.test.js` carries
the superseding O1 test (section 8). Its stage subtest now asserts the shared
predicate directly (`recordedLearnerFactIsValid`), with a positive control.

**Red-first.** The witness file was copied, with the test-side `connectRouters`
export, into an export of `HEAD` (`git archive e93c65f4d`, node_modules linked).
There it is 20/20 red at named assertions; 17 leaves fail, and the three parent
tests fail through their subtests. Examples:

- "the successor carries the next permit sequence of the same transition";
- "the native owner states whether the registry vouches for the absence";
- "a proposal or hint reservation vouches for nothing either";
- "the settlement landed inside the issuance window";
- "the old holder submitted its successor CAS before its process stopped";
- "once the destination boot is readable the successor is issued".

On the working tree it is 20/20 green: 3070 ms through the runner, inside the
30 s integration budget.

**Mutation controls.** Each mutation was applied alone in a scratch mirror,
never in the worktree. The witness file and the branch file were run, and the
file was restored. The mirror's source hashes were compared before and after
the whole campaign.

| Id | Defect class | Mutation | Killed at |
| --- | --- | --- | --- |
| M1 | issue on UNKNOWN | fence without `currentTermApplied` | witnesses 1, 4 and 10: "no successor while the predecessor may still commit", "no successor while the outcome is unresolved" |
| M2 | issue without the fence | fence without the term supersession | witness 3: "the predecessor's own term still leads"; witness 6: "the issued successor is not fenced at its own leader term"; witnesses 7 and 10 |
| M3 | reuse the permitSequence | successor composed with sequence k | witness 1 "the issued successor keeps the debt until its exact outcome is recorded"; witnesses 3, 5 to 8, 12 and 14 |
| M4 | refresh the old permit on STALE_LEADERSHIP | runtime consumer refreshes term, configuration, lifecycle and runtime from the port | witness 5: "the old permit is not refreshed into the new leader's fences" |
| M5 | skip the recorder read | discovery goes straight to issuance | witnesses 1, 2, 4 and 11: "the committed outcome is recovered through the existing recorder", "the committed fact stays recordable through the recorder" |
| M6a | let both commit | drop the port's single-pending deferral | witness 4: "the leader's one pending configuration change defers any successor" |
| M6b | let both commit | drop the native configuration-generation check | witness 4: "once the predecessor applied, a successor bound to the absence is refused" |
| M7 | second permit after process loss | successor CAS keyed by operation id only | witnesses 6, 7 and 12: "exactly one CAS applied", "the late old submission matches nothing", "the old successor CAS matches nothing after the claim moved" |
| M8 | treat a cache row as evidence | issuance reads the replicated cache row | witnesses 1, 3, 5 to 8, 10 and 12 to 14, including the witness 8 summary and "an unreadable answer is UNKNOWN, never success or a reason to write again" |
| M9 | native fence off by one | `applied >= pendingConfIndex` | witness 1 window |
| M10 | native fence for followers | drop the leader conjunct | witness 3: "a follower never fences" |
| M11 | successor of a successor at the same term | fence with `term >=` | witnesses 3, 6, 7 and 10 |
| M12 | absence without its observation | NOT_RECORDED without the observation | 12 of the 14 witnesses (all but 2 and 4), including witness 10 "the native owner attaches its same-turn observation to an absent origin" |
| R1 | fence without the registry vouch (B2) | drop `originRegistryComplete` from the fence | witness 11 "no successor over an attempt that may have committed"; witnesses 5 and 10 |
| R2 | native read claims a complete registry | `originRegistryComplete: true` | witnesses 5 and 11: "the registry owner does not vouch for a reservation without an origin" |
| R3 | registry vouches for a NULL origin | UNVOUCHED reported as ABSENT | witnesses 5 and 11 (both cases): "a proposal or hint reservation vouches for nothing either" |
| R4 | native fence fails open without the pending index | `pendingConfIndex ?? 0` | survives: equivalent in reachable states, since the pinned binding always serializes the field (`vendor/raft-rs-wasm/src/lib.rs:333, 710`). This is the hardening the review asked for. |
| R5 | settlement diagnosed from the turn-start row | `isOperationTerminal(operation)` | witness 13 summary |
| R6 | an absent vouch is malformed | the vouch counted as a required key | witness 10, the case without the vouch (expected UNKNOWN, got CONFLICT) |
| R7 | an absent vouch fences (fail open) | fence with `originRegistryComplete !== false` | witness 10, the case without the vouch (expected UNKNOWN, got NONCOMMITTED) |
| R8 | a vouch that is not a boolean is accepted | boolean check without the vouch | witness 10, the `"true"` vouch case (expected CONFLICT) |

The verifier's 19, adapted where the text moved (X3 to the new helper; X20 to
`ROLE_LEADER`; X21 to the vouch-aware key count), each run on the witness file
and the branch file:

| Id | Result |
| --- | --- |
| X1 | killed: witness 10 "the fencing observation must be the routed destination's own replica" |
| X2 | killed: witness 1 "a strictly newer leader term"; witnesses 5, 6 and 7 ("no second permit") |
| X2b | survives 15 suites; equivalent (the fence already forces the observed term above the predecessor's) |
| X3 | survives 15 suites; equivalent in reachable states: the learner-action read always takes the group's queue (`raft-rs-runtime-owner.js:1632-1642`), and a turn applies and advances every Ready it takes before its command runs, or fails without answering (`:980-1033, 1517-1570`; a held Ready keeps the queue, `raft-rs-persistence-admission.js:41-69`), so a leader's commit equals its applied index at every answered read. The applied form is the one the vouch needs. |
| X4 | killed: witness 12 "the old successor CAS matches nothing after the claim moved" |
| X5 | killed: witnesses 9 and 13 |
| X6 | killed: witness 1 "the fences of the fencing leader observation"; witness 14 |
| X7 | killed: witness 14 "nothing is submitted without the destination boot" |
| X7b | survives 15 suites; near-equivalent (`beforeAttempt` re-checks the own boot before every submission; only the typed answer moves from UNAVAILABLE to UNKNOWN) |
| X8 | killed: witnesses 1, 3, 5 to 8 and 14: "the successor carries the next permit sequence of the same transition" |
| X9 | killed: the branch file's superseding O1 stage subtest "the predecessor stage is part of the shared predicate", and "initial learner permit cannot substitute the source or select a later stage" |
| X10 | killed: 11 witnesses (all but 2, 4 and 11), including witness 3 "positive control: the fencing leader issues the successor" |
| X12 | killed: witnesses 1 and 4 |
| X14 | killed: witness 13 "no successor on an operation settled inside the window" |
| X15 | killed: witness 7 "no submission after the owner stopped" |
| X17 | killed: witnesses 1, 3, 5 to 8 and 14, including witness 7 "the new holder proves the fence itself; takeover alone grants nothing" |
| X19 | killed: witness 1 "a delayed predecessor request finds the successor on the row and is refused" |
| X20 | killed: witness 10 (the follower case) |
| X21 | killed: witness 10 (the extra-key case); adapted to the vouch-aware key count |

In total, 36 of 40 are killed. The four survivors (R4, X2b, X3, X7b) also
survive the 15 broad suites: the witness and branch files; discovery, recipient,
runtime authorization and process loss; handler membership; create-admission
recovery and replica-create-admission recovery; learner join; fresh-learner
snapshot; semantic port; operation-port status observation; conf-change pending
deferral; and committed-membership read. Each survivor is an equivalent or
hardening mutation, as stated.

## 8. Supersessions (R09), recorded explicitly

- **The D1 recorded-fact predicate is widened.** `recordedLearnerFactIsValid`
  now accepts a committed ADD_LEARNER permit of the transition at any permit
  sequence; at HEAD it was pinned to sequence 1. The predicate stays pure (no
  clock, claim or boot read) and remains the one predicate that discovery, the
  recorder, branch selection and the CREATE basis consume.
  - Reason: C1 introduces the only writer of a sequence above 1, the ordered
    successor. It is issued by CAS over a fenced in-flight attempt and recorded
    only on an exact native origin match, and the CREATE basis binds those exact
    origin bytes.
  - Initial issuance stays pinned to sequence 1 (`initialLearnerPermitMatches`).
- **The branch-authorization O1 test is superseded in place.** "O1 an initial
  learner permit whose sequence is not 1 is refused before any branch CAS"
  (branch-selection change `3259d3d5f`) is replaced by "O1 (superseded by C1)
  ...":
  - a recorded ordered-successor fact selects either branch once, only with the
    next sequence after it;
  - a next permit that does not follow it is refused with no CAS;
  - a recorded non-learner stage is refused by the shared predicate itself, and
    at the request shape.

  The original assertion stays in history.
- **`message-group-committed-learner-origin.md`:**
  - line 19, "Neither current absence nor a missing record proves
    non-commitment", gains the one exception, together with its premise and
    guard;
  - lines 80-82, "NULL cannot resolve an issued action", are kept and extended:
    a NULL-origin reservation is UNVOUCHED and never fences.
- **`message-group-registered-learner-read.md`:**
  - lines 88, 101 and 104 move from "initial" to the transition's learner action
    at any permit sequence;
  - step 7 and the ordered successor section state the fence, the registry
    vouch, its premise and its fail-closed cost;
  - "None of them dispatches ... a successor attempt" and "No successor attempt
    is issued" are replaced. Absence alone still establishes nothing.
- **`message-group-learner-outcome-recording.md`:** "Exact UNRESOLVED /
  NOT_RECORDED stays UNKNOWN" gains the fenced, registry-vouched exception
  (NONCOMMITTED, which records nothing).
- **`test/shards/impact-contracts.json`:**
  - the `message-group-committed-learner-origin` descriptions (contract and
    pair) said "Missing evidence remains unresolved; no current CREATE or
    reissue authority";
  - the `message-group-registered-learner-read` descriptions said "... or
    CREATE/successor permission".

  Both now name the ordered successor as the one, fenced and registry-vouched,
  exception.
- **Classification (review B3).** The witness moved from `test/rebalancer/`
  (unit) to
  `test/integration/message-group-learner-successor-ordering.integration.test.js`.
  The B2 learner-join file, a unit file of about 18 s under `test/node/`, moved
  the same way, unchanged, to
  `test/integration/message-group-learner-join.integration.test.js`.
  - Both received exact subsystem overrides, like their siblings
    (`scripts/checks/test-subsystem-classification-constants.js`): placement and
    rebalance, and bootstrap and membership, their previous homes.
  - The shards were regenerated by the producers, and the registry witness lists
    were repointed.
  - The B2 design note's witness-file reference is repointed to the new path
    (`audit:documentation-current` requires referenced paths to exist); nothing
    else in it changed.
- The safety-first ruling's successor rule is satisfied, not changed.

## 9. What C1 leaves to C2 and later

- **Production wiring.** No production root issues an initial learner attempt
  or drives the runtime consumer, so C1 is inert in production, like B1 and B2.
  A dispatcher that delivers the issued successor to its destination's runtime
  consumer is still open, as is the remote descriptor route (B3).
- **Per-row reservation provenance.** Without it, a replica that reserved the
  target for a local proposal or hint can never fence a later attempt (fail
  closed). After several attempts, successors may wait for a leader that never
  reserved the target. Distinguishing provenance would need a schema and image
  format change.
- **Definitive non-admission settlement** for a settled operation whose learner
  attempt is definitively noncommitted (lane release without a learner). C1 only
  names it.
- **The rest of the replacement**, each through its existing owner:
  - state transfer and replay for the successor's CREATE (the B2 path, through
    production routes);
  - catch-up and promotion, never through the 0/0-granting
    `evaluateLearnerPromotionProof` (review O5);
  - leadership handoff;
  - source removal and source-own applied absence;
  - quorum absence;
  - exact-generation cleanup and reservation release.
- **Successors of later stages** (promotion or removal attempts) are not
  covered.
- **A configuration-generation-only fence** (same term, a later conf change
  applied) is not used: the per-group membership lane makes it unreachable.
- **Physical proof:** the two serial off-seed replacements and seed-storage loss.

## 10. Findings outside C1 (R17)

- **Witness latency.** The witness rotation asks the source first and one
  witness per turn, while the fence needs the current, vouching leader as
  witness. Issuance may therefore take several triggers. This costs latency,
  not safety. Owner: discovery.
- **Inherited reds.** Each fails with the same tests and the same messages on
  the tree and on the HEAD export (`git archive e93c65f4d`). For the census
  file, the caller and stamp-origin lists behind its masked later asserts are
  identical as well.
  - `committed-membership-census`
  - `evidence-o1-static`
  - `peer-identity` (its static address scan already matches the identity
    owner's "address-as-identity" at HEAD; C1 adds no such word)
  - `message-group-membership-change-parked`
  - `rebalance-coordinator-outcome-routing`
  - `rebalance-coordinator-operation-ownership`
  - `monotonic-workflow-regression` (`updateStep` persists twice; owner
    RebalanceCoordinator)

  `node-joining-rebalance` timed out its 120 s budget under local load, on the
  tree and on the HEAD export alike (different subtests). Re-run on the idle
  machine after the thermal gate, it passed on the tree: 38 assertions, 49 s.
- **Complexity.** `decodeMembershipPermit` (15),
  `selectMessageGroupMembershipBranch` (29) and `recordMessageGroupLearnerOutcome`
  (13) remain above the scoped threshold, unchanged by C1.
- **Ratchets.** Unused exports stay at the inherited 1421/1416, and test
  duplication at the inherited 698/26410. No C1 file appears in either list.

## 11. Review round (2026-10-11)

The independent verification found that the fence and the issuance held where
their premise held, and rejected on four blockers. The lead decided each, and
this is what changed:

- **B2, fail closed.** The fence now also requires `originRegistryComplete`,
  computed from the peer-identity registry owner. The registry holding no
  reservation of the target vouches for its absence; a reservation without an
  origin never does. Witness 11 is the verifier's P5 shape and its fail-closed
  counterpart; P5b is no longer reachable. Working through the premise also
  exposed the stamp-bootstrap case, which the guard closes as well.
- **B1, supersessions.** Section 8 now records the origin contract's lines 19
  and 80-82, the two registry descriptions, the registered-read lines 88, 101
  and 104, and the widening of the D1 predicate.
- **B3, classification.** Both real-group files moved into the integration set.
- **B4, witnesses.** Witnesses 12, 13 and 14 kill X4, X14 and X7.
- **Nits.**
  - `currentTermApplied` fails closed when an index is missing.
  - The leader role constant comes from the native owner.
  - The "initial" names and comments in discovery are fixed.
  - A settlement landing inside the turn is diagnosed from the issuance's own
    final row.
  - The superseding O1 stage subtest now measures the shared predicate.
  - An absent registry vouch classifies UNKNOWN, as the B2 decision reads
    ("false or absent"), not CONFLICT. A vouch that is not a boolean stays
    CONFLICT (witness 10; mutations R6 to R8).
  - The attempt's design note path is this file.
