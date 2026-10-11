---
audience: development
documentClass: current
---

# FreshMG 6.C slice C2: catch-up and promotion of the joined learner to voter

Quest: `message-group-fresh-identity-membership` (epic `raft-rs-full-cutover`).
Runbook: [local takeover](local-takeover-20261010.md) section 6.C, second slice.
Predecessors: [B1](design-create-b1-2026-10-10.md), [B2](design-create-b2-2026-10-10.md),
[C1](design-successor-c1-2026-10-10.md). Base: `b5e62dd0d` (6.C C1 landed).
Line numbers cite the working tree after this slice; files marked (C2) are new
or changed by it. raft-rs facts are the ones C1 cites from the locked crate
(C1 note, sections 1 and 2). Contract:
[promotion contract](../../../architecture/contracts/message-group-learner-promotion.md).
This note is a design and implementation record. It is not independent
approval, production wiring, leadership handoff or physical acceptance.

**Corrective round (2026-10-11, after the independent REJECT of the attempt at
`6d4132222`).** The review found two blockers: B1, five claimed write guards of
the promotion module unmeasured by the declared proof (the second instance of
the class after C1's B4), and B2, two pre-C2 contract sentences not superseded
for the promotion's absence vouch (R09). The repair is recorded in section 7
(the class-repair rule in 7.1, the guard-vs-mutation table over every clause
of the promotion module in 7.2, the clauses the table removed in 7.3), in
section 8 (the two supersessions) and in sections 9 to 11 (the review's minor
findings and routed findings). Two guard witness files were added beside the
promotion witness; line numbers for the promotion module below cite the
working tree after the repair.

**Owner guidance (2026-10-11, binding, from the cloud owner's review of
`b5e62dd0d`), and how C2 meets it.**

1. *Positive evidence only.* The selection consumes the recorded learner fact
   (shared predicate), the routed leader's committed learner origin with its
   reservation, and current promotion authority (leader, applied term, exact
   caught-up integers). C1's registry-absence vouch is used only to prove a
   fenced attempt noncommitted, never as a promotion prerequisite (section 2.1).
2. *An unresolved attempt holds the lane.* Promotion needs a recorded learner
   fact; an issued, unrecorded attempt is refused before any evidence is asked,
   also after its holder's lease expired, and the lane index refuses another
   target (section 2.1, witness 13).
3. *Bounded work for indefinite debt.* Discovery is unchanged: promotion debt is
   no periodic hint, so C2 adds no per-tick work (section 2.6 states what the
   1 s sweep does per debt row today; witness 11).
4. *Open completion items* name production dispatch and remote join wiring
   (section 10).
5. *Discovery files untouched.*
   `src/rebalancer/operation-workflow-message-group-membership-recovery.js`,
   `src/rebalancer/operation-workflow-recovery-reconcile.js` and
   `src/rebalancer/rebalance-coordinator-lifecycle.js` are byte-identical to
   `b5e62dd0d`; an earlier draft of this slice that made discovery own
   promotion debt was withdrawn before review. (The quest log has since
   recorded, at `6d4132222`, that the leader-metadata-validation red behind this
   guidance is a test-budget defect, not discovery's; the files stay untouched
   all the same.)

## 0. Where C1 stopped, and what C2 does

After B2 a recorded learner can be installed, opened and reported RUNNING; RUNNING
is an observation, never a promotion grant (B2 note, section 3, step 7). After C1
an in-flight learner attempt that a fencing leader proves noncommitted gets an
ordered successor. The landed branch selection (`selectMessageGroupMembershipBranch`,
`src/rebalancer/replica-operation-message-group-membership-authorization.js:127-188`)
could already CAS a promotion permit over a recorded learner fact, with no
caught-up proof at all, and nothing proposed, recorded or recovered a promotion:
the native turn had a PROMOTE stage (`src/raft/raft-rs-membership-transition-runtime.js:119-164`),
but no consumer drove it, the queued action read refused any stage but
ADD_LEARNER, and no writer of the voter stamp existed.

C2 adds, through the existing owners only:

1. the promotion selection over positive evidence: the landed branch selection,
   the routed leader's committed learner origin, and the leader's exact
   caught-up acknowledgement under its applied term (section 2.1); its RECORDED
   is the J1 boundary;
2. the promotion runtime consumer that hands the issued permit to the existing
   native turn with the target's own status (section 2.2);
3. the native answer to the transition's PROMOTE action and the voter stamp,
   recorded once by the one recorder (sections 2.3, 2.4);
4. C1's successor rule for a fenced, noncommitted promotion attempt, with the
   same fence and issuance owner (section 2.5);
5. two explicit workflow entries that record the voter stamp and issue that
   successor; discovery does not own promotion debt (section 2.6).

No new scheduler, ledger, protocol, table, column or message type.

## 1. Consumed surfaces (cite or it does not exist)

| Surface | Citation | Use in C2 |
| --- | --- | --- |
| Landed branch selection | `src/rebalancer/replica-operation-message-group-membership-authorization.js:127-188`: `permitsMatch` `:55-65` (next sequence, stage, IN_FLIGHT, no index), `newBranchFactRefusal` `:121-125` (the shared predicate first, then `nextPermitFollowsLearner` `:95-99`: the learner stamp's configuration, term at least the learner's), settlement `:73-82` (promotion only on an open operation), exact prior permit and UNKNOWN obligation `:148-152`, holder `:203-210`, boot, the row CAS `:158-172`, readback `:173-187` | Unchanged (complexity 29 kept). The promotion selection calls it last, with the permit it composed. |
| Recorded learner fact and its basis | same file `:615-624` (`recordedLearnerFactIsValid`), `:646-656` (`recordedLearnerCreateBasis`: the predicate, then UNKNOWN obligation; identity, stamp, committed permit and the exact committed origin bytes) | The promotion basis (C2 promotion module `:156-161`), the same basis current CREATE consumes. |
| Learner-action query | same file `:321-327` (`learnerOutcomeQuery`, exported by C2) | The selection's origin read at the routed leader asks the recorder's own query. |
| Promotion-progress predicate | `src/raft/learner-promotion-progress.js:156-199` (`evaluateLearnerPromotionProof`: an absent or non-integer index reads as 0, so absent commit and match grant 0/0) | Never consulted raw: only behind the exact entry (C2, `:201-225`). |
| Native promotion turn | `src/raft/raft-rs-membership-transition-runtime.js:298-312` (`proposeMembershipTransition`): runtime and lifecycle fences `:186-198`; leadership at the permit's exact term `:213-218` (STALE_LEADERSHIP); exact configuration key and generation `:219-224` (STALE_CONFIGURATION); target role `:54-76` (NOT_LEARNER, ALREADY_VOTER idempotent); target observation and exact progress `:119-164` (TARGET_OBSERVATION_STALE; PROMOTION_PROGRESS_UNAVAILABLE for a commit that is absent, non-canonical or 0 and for an unobserved match; PROMOTION_PROGRESS_BEHIND); the anchored proposal `:269-296`; the single-pending rule `src/raft/raft-rs-conf-change-admission.js:104-137` (`:127`) | Unchanged. It is the atomic turn the sealed `atomic-current-leader-promotion` constraint names; the consumer only supplies the permit's fences and the target observation. |
| Target observation shape | `src/raft/raft-rs-membership-transition.js:21-25` (`TARGET_STATUS_OBSERVATION_FIELDS`, exported by C2), `:84-112` (exact own-data snapshot) | The consumer picks exactly these fields from the target's status (`src/raft/raft-rs-group-membership-admission.js:397-401`, C2). |
| Runtime consumer and recipient observation | `src/raft/raft-rs-group-membership-admission.js:348-373` (C2: the learner consumer's observation steps, order unchanged, shared by stage), `:375-385` (learner), `:410-441` (promotion, C2); `src/rebalancer/replica-operation-message-group-learner-observation.js:84-131` (C2: the issued attempt in its stage's in-flight phase, a promotion row keeping the learner stamp), `:133-140` | The promotion consumer and its observation. |
| Queued action read | `src/raft/raft-rs-runtime-owner.js:1424-1425` (one queued turn: status, then registry); `src/raft/raft-rs-operation-port.js:360-367` (port normalization); `src/raft/raft-rs-committed-membership-read.js:182-189` (normalization, C2), `:204-224` (learner origin, unchanged), `:226-274` (promotion, C2), `:275-287` (dispatch by stage, C2); `src/raft/raft-rs-committed-membership-context.js:186-207` (C2: the read accepts ADD_LEARNER or PROMOTE; an origin stays ADD_LEARNER only) | The selection's origin evidence, the voter evidence and the promotion vouch. |
| Managed apply of a PROMOTE context | `src/raft/raft-rs-operation-port.js:229-235`: the committed context reserves the identity (committed mapping); only ADD_LEARNER records an origin | Why a promotion has no origin of its own, and why the witness's `identities` maps the target. |
| One recorder | same authorization file: `recordMembershipActionOutcome` `:526-542` (C2: the learner recorder's flow, by recording spec), `recordObservedAction` `:480-506`, `finishActionRecording` `:507-515`, `LEARNER_RECORDING` `:555-568`, absence classification and fence `:346-407` (unchanged) | The voter-stamp spec (`VOTER_RECORDING`, promotion module `:371-383`) reuses it. |
| C1 issuance | `src/rebalancer/replica-operation-message-group-learner-successor.js:199-217`; the attempt it owes `:57-87` (C2: by stage); `successorFollows` `:100-106` and `successorPermit` `:107-123` (unchanged, stage-generic) | The promotion successor. |
| Explicit workflow entries | `src/rebalancer/operation-workflow-message-group-native-read.js:73-83` (`withRecordingRecipient`: retained lane, invocation fence, the recipient read `:26-43`), `:111-119` and `:120-129` (C2), exposed at `src/rebalancer/operation-workflow-owner.js:97-105` (C2) | The voter-stamp and successor triggers. |
| Discovery and the periodic sweep (unchanged) | `src/rebalancer/rebalance-coordinator-lifecycle.js:681-699` (every `TIMEOUT_CHECK_INTERVAL_MS`, `src/rebalancer/rebalancer-constants.js:102`, 1000 ms, single-flight), through `src/rebalancer/rebalance-coordinator-recovery-helper.js:141-143` and `src/rebalancer/operation-workflow-recovery-reconcile.js:110-112` (cache-hint census; the restart scan's authoritative census `:116-118`); `src/rebalancer/operation-workflow-message-group-membership-recovery.js:312-331` (census), `:266-284` (the one hint filter: rows owing a learner turn only), `:206-236` (the turn), `:104-112` (only the learner action is owned) | Section 2.6: promotion debt is no hint, no per-tick work. |
| Permit vocabulary | `src/rebalancer/replica-operation-message-group-membership-permit.js:13-16` (VOTER_COMMITTED, C2), `:28-31` (NOT_CAUGHT_UP, ORIGIN_UNRECORDED, C2), `:151-169` (C2: per-stage phases and the one action matcher) | Typed states and the per-stage table consumed by successor, observation and the promotion module. |
| Caught-up decision | `src/raft/learner-catch-up-acknowledgement.js:22-96` (C2, moved from B2's `message-group-learner-join.js`), vocabulary `src/raft/learner-promotion-progress.js:76-90` | The selection's proof; B2's RUNNING consumes the same decision. |
| Leader status shape | `src/raft/raft-rs-status-observation.js:46-55` (peers), `:69-91` (follower progress by address), `:100-107` (`currentTermApplied`: a leader whose applied index is past its pending configuration index) | The decision's progress source; the applied-term evidence; the fence. |
| Lane | `src/bootstrap/replica-operation-message-group-membership-schema-constants.js:65-69` (the lane key is unique per group), `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js:179-192` (`MEMBERSHIP_LANE_CONFLICT` for another operation on a held lane) | Unchanged: an unresolved attempt holds the group's lane. |

Surfaces C2 creates (each subordinate to an owner above): the promotion module
`src/rebalancer/replica-operation-message-group-promotion.js` (C2, under
ReplicaOperationRepository); `src/raft/learner-catch-up-acknowledgement.js`
(C2, under learner-promotion-progress); repository facade methods
(`src/rebalancer/replica-operation-repository-message-group-membership-methods.js:99-123`);
the two explicit entries above.

**The O5 decision (said which).** The predicate's owner allows a fix, but not
in place: its partition consumer reports an unobserved match as 0 on purpose
(`src/partition/partition-service-learner-promotion-proof-methods.js:96-112`),
its PROGRESS_BEHIND triggers that consumer's replication nudge, and the
predicate's contract test pins absent progress as PROGRESS_BEHIND. So C2 fixes
it at the owner by adding the exact entry `evaluateExactLearnerPromotionProof`
(the B2 join's exactness guard, moved there verbatim: exact non-negative
integers, commit > 0, match >= commit, then the predicate) and leaves the raw
predicate unchanged for the partition path. The join and the selection both
consume the exact entry through the shared decision; nothing in C2 calls the raw
predicate. The native turn keeps its own exact canonicalization of raw core
values (`src/raft/raft-rs-membership-transition-runtime.js:140-152`) before the
same predicate.

## 2. Mechanism

### 2.1 Selection: positive evidence, the J1 boundary

`selectMessageGroupPromotion(request, readCommittedAction, observeCatchUp,
isInvocationCurrent)` (promotion module `:278-295`). The caller names the
operation and the routed leader (node and replica) and supplies the read
capability at that leader, an observation capability and its invocation
lifetime, never evidence or a permit.

1. A row that already carries this transition's promotion (in flight or
   recorded) answers RECORDED with no read and no write (`:143-150`).
2. The recorded learner basis must exist (`:156-161`): the recorded-fact
   owner's `recordedLearnerCreateBasis` (shared predicate, UNKNOWN obligation).
   An issued learner attempt whose outcome is not recorded (UNKNOWN debt of the
   lane holder) has none: CONFLICT before any evidence is asked, whether or not
   the attempt committed natively and whether or not the holder's lease
   expired (an expired holder is only replaced through the claim CAS; the
   obligation and the lane stay). The lane key is unique per group, so no other
   target's operation can be persisted meanwhile (MEMBERSHIP_LANE_CONFLICT), and
   an ordinarily settled operation is never promoted (the branch settlement
   guard). Witness 13.
3. **Origin evidence** (`:167-188`): the queued learner-action read at the routed
   leader, with the recorder's own query for the recorded action, must answer
   COMMITTED/APPLIED with exactly the recorded committed origin bytes (origin
   group, index, term and action, `recordedLearnerOrigin`, authorization
   `:659-669`). That answer exists only for registry coverage RECORDED, an
   origin stored on the target's reservation
   (`src/raft/raft-rs-peer-identity-constants.js:53-64`,
   `src/raft/raft-rs-committed-membership-read.js:204-224`), at or below the
   leader's applied, commit and generation indices: the leader applied the
   learner's legitimate commitment. A thrown or unavailable read is
   UNAVAILABLE; anything else (no origin there, an unvouched reservation,
   another origin, a malformed receipt) is ORIGIN_UNRECORDED.
4. **Caught-up acknowledgement** (`:193-207`): the leader's BOOTSTRAP-purpose
   committed answer, its status and the learner's own committed answer, judged
   by the shared decision (`src/raft/learner-catch-up-acknowledgement.js:82-96`)
   in order: one leader in one term (LEADER_UNAVAILABLE), the exact learner in its
   committed configuration (REMOVED), the learner's own view holding itself
   (LEARNER_UNOBSERVED), the exact entry granting with the two configuration
   generations as epochs and the commit at or past the learner fact's applied
   index (BEHIND, with the proof reason). A thrown observation is
   LEADER_UNAVAILABLE.
5. **Applied term** (`:215-219`): the leader applied an entry of its own term,
   by positive evidence only: its status says so (`currentTermApplied`), or the
   recorded learner action is itself an entry of the leader's current term that
   the leader applied (term equal to the permit's, applied index at or past its
   proposal index). The native flag alone reads false right after the leader's
   own configuration change applies (applied equals the pending configuration
   index), so it would block an idle group (witness 2); a leader of a newer
   term is authority through the flag once it applied an entry of its own term
   (witness 6). Otherwise LEADER_TERM_UNAPPLIED. Steps 4 and 5 answer
   NOT_CAUGHT_UP with the state and write nothing (`:220-223`).
6. The acknowledging leader must be the routed replica (CONFLICT), the routed
   node's canonical boot readable and the invocation still current
   (UNAVAILABLE), the holder local and live (STALE_OWNER).
7. The permit (`:224-243`) is the next sequence, stage PROMOTE, IN_FLIGHT, bound
   to the acknowledgement's term and committed configuration, the leader status's
   lifecycle and runtime, the routed node and boot, and the holder's fences.
8. The landed branch selection re-checks everything on its own read and CASes
   (`selectOverCaughtUpLearner`, `:244-266`); a permit the codec refuses is its
   INVALID, answered before any read.

RECORDED is the durable promotion authorization. The abandonment branch needs
the recorded learner fact, which the CAS moved past, so it is no longer
selectable (J1). C1's registry-absence vouch appears nowhere in these steps.

### 2.2 Native proposal

`proposeAuthorizedGroupPromotion` (`src/raft/raft-rs-group-membership-admission.js:410-441`)
takes the same host-bound delivery and repository observation as the learner
consumer (`:348-373`, steps and order unchanged for the learner), now at the
PROMOTE stage: the exact in-flight promotion on the row, both canonical boots,
the live sender claim. It asks the host for the target's own status, keeps
exactly the seven observation fields (an unanswered target is a typed retryable
refusal, `:389-408`), re-checks the delivery and calls the native turn with the
permit's own fences. The turn decides; the consumer never refreshes a fence and
reserves nothing (the leader reserved the target when it applied the learner).

### 2.3 Native answer to the PROMOTE action

`answerCommittedPromotionAction` (`src/raft/raft-rs-committed-membership-read.js:247-274`),
in the same queued turn as every learner-action read:

- COMMITTED/APPLIED when the applied configuration names the target a voter
  under its own reserved identity and the registry holds the target's learner
  origin of the same operation and transition, earlier in it (`:237-246`). The
  receipt is that origin; the membership is the same-read witness answer.
- NOT_RECORDED with the same observation as C1 otherwise; its
  `originRegistryComplete` is true only when the target is a learner (not a
  voter, not absent, no joint configuration) under its own identity
  (`:226-236`). It is consumed only by the fence of section 2.5.

### 2.4 Voter stamp

`recordMessageGroupVoterOutcome` (promotion module `:386-395`) is the one
recorder with the voter spec (`:297-383`). Evidence (`:355-370`): the shared
classification first (NONCOMMITTED, UNKNOWN, UNAVAILABLE, CONFLICT); then the
receipt must decode under the origin codec and be the transition's learner
origin, earlier in the transition (`:332-351`); a JOINT or held witness is
UNAVAILABLE; the witness stamp must validate, carry the read's applied index,
and be the recorded learner configuration with exactly the target promoted
(voters = the learner configuration's plus the target, learners = its learners
minus the target; the stamp validator binds every member to the identity its
peer id derives from, so the target and the source are voters under their own
identities by the validator), at a configuration generation past the permit's
and a term at least the permit's (`:91-104`). The receipt is phase
VOTER_COMMITTED, the permit committed at that generation, and the stamp; the
CAS basis is the full observed row; the readback is the exact recorded voter
of this input carrying this evidence's stamp (`:377-382`). The recorded fact's
pure predicate is `recordedVoterFactIsValid` (`:115-128`), exported for the
later stages that consume the fact and witnessed directly.

### 2.5 Ordered successor of a promotion attempt

C1's issuance (`src/rebalancer/replica-operation-message-group-learner-successor.js:199-217`)
now owes the row's in-flight attempt of either recorded action (`:57-87`), with
the same read, fence (`absenceFencesLearnerAction`, authorization `:378-381`),
CAS and readback. Why a vouched promotion absence at a fencing leader R is
noncommitment: an attempt P of leader term T can only be appended at its own
term's leader; R leads T_R > T and applied an entry of T_R, so a committed P
would sit in R's applied prefix (C1 note, section 2, steps 1 to 3). R applying
P makes the target a voter. Nothing in R's applied history after P can make it
a learner again: AddLearnerNode of the target is only ever the transition's
learner action, whose attempts the runtime consumer and the native turn refuse
once the fact is recorded (MISMATCH, STALE_CONFIGURATION, ALREADY_VOTER); and the
only remover of the target is the transition's abandonment branch, which J1
excludes after promotion authorization. So R holding the target as a learner
proves P never committed. An absent target vouches for nothing (a removal could
follow a committed P).

### 2.6 Triggers: explicit entries; the periodic sweep unchanged

`recoverMessageGroupVoterOutcomeFromRecipient` and
`issueMessageGroupSuccessorFromRecipient` (`src/rebalancer/operation-workflow-owner.js:97-105`;
`src/rebalancer/operation-workflow-message-group-native-read.js:111-129`) take an
operation ID and an explicitly selected witness and run in the retained
operation lane through the same recipient read as the learner's explicit entry.
Discovery is unchanged and owns only the learner action
(`src/rebalancer/operation-workflow-message-group-membership-recovery.js:104-112`).

**What the periodic sweep does per debt row today** (owner guidance 3; every
citation in this paragraph is the discovery file at `b5e62dd0d`, unchanged).
Every `TIMEOUT_CHECK_INTERVAL_MS` (1000 ms; `src/rebalancer/rebalance-coordinator-lifecycle.js:681-699`,
single-flight: a tick that finds the previous chain still running does nothing)
the coordinator runs the timeout check, the orphan reconcile, then
`reconcileMessageGroupMembershipDebt` with the cache-hint census (`:312-331`).

- *Census.* With a replicated-operation cache (`hasReplicaOperationCacheObservationBoundary`)
  the census is a cache filter with no round trip, listing only rows owing a
  learner turn: a message-group row with the UNKNOWN obligation whose
  learner-action permit and phase are both in flight (`:266-284`). Without a
  cache it is one authoritative query per tick that lists every UNKNOWN row.
- *Per listed row.* One authoritative row read (`:323-325`); the operation's
  lane turn, single-flight (a turn already running is LANE_BUSY, `:239-247`);
  then the turn (`:206-236`): a recorded learner fact is settled with no I/O; a
  promotion, removal or otherwise unowned phase is PHASE_NOT_OWNED with no I/O;
  an in-flight learner attempt costs the holder check (a live foreign claim
  waits with no I/O, an expired one costs one claim CAS, `:144-157`), a witness
  chosen from the services cache with no round trip (`:87-98`), and one
  recorder turn: up to three authoritative row reads, one canonical boot read
  and one queued native read at the witness, a message bounded by the dispatch
  timeout (`src/rebalancer/operation-workflow-message-group-native-read.js:26-43`).
  Only on NONCOMMITTED does one issuance follow (its own native read, boot
  reads and one CAS with readback). A debug log line records every retained
  outcome (`:248-260`).
- *Not listed.* Recorded, invalid, promotion-phase and removal-phase rows are
  no hint: zero work per tick with a cache. Without a cache each UNKNOWN row
  costs one authoritative row read and one local lane turn per tick, a
  promotion row exactly what the recorded learner row it advanced from cost.
- *Restart.* The restart scan's authoritative census (`src/rebalancer/operation-workflow-recovery-reconcile.js:116-118`)
  reaches every UNKNOWN row once per restart and reports promotion debt
  PHASE_NOT_OWNED (visible, retained).

C2 adds no per-tick work: promotion debt is no hint, its replicated changes
wake nothing, and its only triggers are the explicit entries (witness 11). An
indefinitely UNKNOWN promotion stays retained and visible, at the cost above.
An indefinitely UNKNOWN learner attempt costs one native read per second per
row with no backoff: bounded by the tick and the lane, but constant
(section 11).

## 3. Decision table: promotion

| State observed | Selection | Native turn | Recorder (explicit entry) | Debt | Witness |
| --- | --- | --- | --- | --- | --- |
| Caught up, origin evidenced, term applied, routed leader | RECORDED: one CAS, phase PROMOTION_IN_FLIGHT, permit k+1 | PROPOSED once (ADD_NODE) | RECORDED once (voter stamp) after commit; replay with no native read | UNKNOWN obligation, lane held for the later stages | 2 |
| A leader of a newer term that applied its own term | RECORDED, bound to that leader's fences | PROPOSED once | RECORDED once | as above | 6 |
| Unresolved learner attempt (lane holder owes UNKNOWN), committed natively or not, lease expired or not | CONFLICT, nothing asked; another target refused by the lane index | n/a | n/a | retained | 13 |
| No committed origin at the routed leader (absent, another, unreadable) | ORIGIN_UNRECORDED (UNAVAILABLE when the read fails), no write | n/a | n/a | retained | 12 |
| Leader term not applied | NOT_CAUGHT_UP leader_term_unapplied, no write | (native: CONF_CHANGE_PENDING while pending) | n/a | retained | 12 |
| Behind (match < commit, or progress unobserved) | NOT_CAUGHT_UP behind (progress_behind or progress_unobserved), no write | PROMOTION_PROGRESS_BEHIND, nothing proposed; permit unrefreshed | n/a | retained; proposes once caught up | 3, 12 |
| Removed before selection | NOT_CAUGHT_UP removed, no write; the learner fact stays recorded and valid | n/a | n/a | UNKNOWN for its abandonment owner | 4 |
| Removed after selection | RECORDED stays (J1) | STALE_CONFIGURATION, nothing proposed | NOT_RECORDED unvouched: UNKNOWN, no successor, no stamp, even at a fencing newer-term leader | retained; operator-required (J1) | 4 |
| Stale permit after a leader change | already selected: RECORDED, nothing rewritten; a refreshed permit is refused | STALE_LEADERSHIP at the demoted leader, STALE_LIFECYCLE at the new one | NOT_RECORDED vouched at the new leader of its own term: NONCOMMITTED; the successor entry issues k+2 | retained until k+2 is recorded | 5 |
| UNKNOWN: same-term leader or a follower witness | n/a | n/a | UNKNOWN, nothing written; the successor entry issues nothing | retained | 10 |
| Promotion debt at the periodic sweep and the wakes | n/a | n/a | not triggered: no hint, no wake, no native read | retained, visible to the restart scan (PHASE_NOT_OWNED) | 11 |
| Duplicate selections, deliveries or recordings | one CAS applies | one core proposal (CONF_CHANGE_PENDING or ALREADY_VOTER for the rest) | one receipt | | 7 |
| Lost proposal answer, lost receipt answer | | the proposal may have committed | exact read, then readback: RECORDED once | | 8 |
| Process loss between selection and proposal | the restarted holder finds RECORDED, no second CAS | proposed once; the redelivery reaches no core | recorded once by the new owner | | 9 |

## 4. Typed failure edges

Every refusal leaves the row unchanged unless stated, and none proposes.

| Edge | Typed outcome | Fails closed | Caller observes |
| --- | --- | --- | --- |
| Request not own data, empty route, missing capability or lifetime | INVALID | yes | no read |
| Invocation not current, row unreadable, destination boot unreadable | UNAVAILABLE | yes | retained |
| Row lacks a valid recorded learner fact with UNKNOWN debt (an unresolved attempt, a forged stamp, an abandonment selected, a later phase) | CONFLICT | yes | no evidence asked |
| Another operation for a group whose lane is held | MEMBERSHIP_LANE_CONFLICT at insert (unchanged owner) | yes | the held lane's operation |
| Origin read thrown or unavailable | UNAVAILABLE | yes | no write |
| No committed origin of the recorded learner at the routed leader, an unvouched reservation, another origin, a malformed receipt | ORIGIN_UNRECORDED | yes | no write |
| Observation thrown or of no single leader in one term | NOT_CAUGHT_UP leader_unavailable | yes | no write |
| Leader configuration without the exact learner | NOT_CAUGHT_UP removed | yes | the fact stays recorded |
| Learner's own view absent or not holding itself | NOT_CAUGHT_UP learner_unobserved | yes | no write |
| Commit or match absent, non-integer, or commit 0 | NOT_CAUGHT_UP behind, progress_unobserved | yes | never 0/0 |
| match < commit, unequal configuration generations, commit below the fact | NOT_CAUGHT_UP behind (progress_behind, epoch_mismatch) | yes | no write |
| Leader has applied no entry of its own term | NOT_CAUGHT_UP leader_term_unapplied | yes | no write |
| Acknowledging leader is not the routed replica | CONFLICT | yes | no write |
| Holder not local and live, or renewed before the CAS | STALE_OWNER (selection or branch CAS) | yes | no write |
| Permit refused by the codec or the branch rules | INVALID | yes | no write |
| Branch CAS answer lost | branch readback | n/a | RECORDED if the permit is on the row, else UNKNOWN |
| Consumer: delivery missing or stale, port unavailable, observation not exact, wrong recipient | the existing typed learner-consumer refusals | yes | nothing proposed |
| Consumer: target status not answered | UNAVAILABLE (retryable) | yes | nothing proposed |
| Native: stale term, lifecycle, runtime, configuration; target not a learner; target observation stale or invalid; progress unavailable or behind; change pending | the native turn's reasons | yes | nothing proposed |
| Recorder: committed answer whose stamp is not the learner configuration with exactly the target promoted, another transition's origin, a moved applied index | CONFLICT | yes | nothing written |
| Recorder: joint or held witness, native unavailable, thrown read | UNAVAILABLE | yes | retained |
| Recorder: absence unvouched, follower, same term, unapplied newer term | UNKNOWN | yes | retained |
| Recorder: absence vouched at a fencing leader | NONCOMMITTED; the explicit successor entry issues | yes | successor permit only |
| Recorder: malformed observation | CONFLICT | yes | nothing written |
| Recorder: receipt answer lost | readback | n/a | RECORDED or UNKNOWN |
| Already recorded voter, exact replay | RECORDED, no native read, no write | n/a | settled |

## 5. Cached-view audit

- **Leader status, follower progress, committed answers.** Volatile and
  leader-local, read once per selection through the capabilities; never
  persisted, never a grant. The native turn re-reads its own core progress in the
  proposal turn, so a stale acknowledgement cannot promote a behind learner
  (witness 3).
- **The origin evidence.** One queued native read at the routed leader per
  selection, compared byte for byte with the origin the recorded fact implies;
  never cached.
- **The applied-term evidence.** The same leader status as the acknowledgement
  (its flag, term and applied index), against the recorded permit's term and
  proposal index, which are immutable durable facts; never cached.
- **The learner's own committed answer.** A witness of its applied configuration,
  read per selection; the native turn re-checks the target's own observation
  against the permit.
- **B2's RUNNING report.** Never read by C2: the selection makes its own
  observation (mutation M8 takes the RUNNING-time view and is killed).
- **Replicated operation cache.** Not read by C2. Discovery's hint census passes
  over promotion debt (witness 11).
- **Native volatile STALE_PERMIT fence.** Per replica, lost on reconstruction;
  C2 does not rely on it (the process-loss witness relies on the single-pending
  rule and ALREADY_VOTER).
- **Nothing caches a caught-up proof or a fence.** Process loss between
  selection and proposal re-reads the row; the authorization is durable, the
  proof is re-derived by the native turn.

## 6. Identity anchoring

| Artifact | Pinned by | Source | When the anchor moves |
| --- | --- | --- | --- |
| Promotion permit | operation, transition, target replica and peer (immutable identity), stage PROMOTE, sequence = learner permit + 1 | the row's recorded learner permit and identity | identity never moves; a row that does not decode is CONFLICT |
| Origin evidence | the recorded learner action (operation, transition, sequence, stage, target, peer, index, term) as the exact origin bytes | `recordedLearnerCreateBasis`, compared with the routed leader's queued read | another origin is ORIGIN_UNRECORDED |
| Leader term, committed configuration, lifecycle, runtime | the acknowledging leader's committed answer and status, equal to the learner stamp's configuration | the selection's observation | the native turn refuses (STALE_*); the attempt is fenced and gets a successor |
| Destination node and boot | the routed leader's node, its canonical boot | route hint plus authoritative nodes read | the recipient observation refuses a stale binding |
| Holder fences | the live claim on the row | claim owner | a renewed or adopted claim defeats the branch CAS |
| Caught-up proof | one leader in one term with its term applied, match >= commit > 0 exact, equal generations | leader status and committed answer, learner's own answer | re-derived atomically by the native turn |
| Voter stamp | configuration = the row's recorded learner configuration, validated as this transition's (exact learner target, source voter: `learnerConfigurationOf`), with exactly the target promoted (voters plus the target, learners minus it), generation > the permit's, term >= the permit's; member identities are the stamp validator's (each the identity its peer id derives from) | the witness's same-read committed answer, the transition's learner origin at the witness, the row's learner stamp | a configuration that moved further is CONFLICT, never recorded; a forged learner stamp is CONFLICT, never a basis |
| Committed promotion permit | proposal index = the voter stamp's configuration generation | the voter stamp | see the premise below |

**Premise of the proposal index.** The generation is the index of the last
applied configuration change. The voter stamp equals the learner configuration
with exactly the target promoted, and the group's membership changes are
serialized by the transition (the lane), so the last change applied is the
PROMOTE itself; the witnesses assert the recorded index equals the native
PROPOSED index or the PROMOTE entry's log index. A premise violation (another
change that keeps exactly this configuration) is not detectable from one stamp
and is recorded as a finding (section 11).

## 7. Witnesses, red-first and mutation controls

**Witness file.** `test/integration/message-group-learner-promotion.integration.test.js`
(C2), integration-classified with an exact subsystem override
(`scripts/checks/test-subsystem-classification-constants.js`, bootstrap and
membership, like B2's join), on the fixture
`test/test-helpers/message-group-learner-promotion-fixture.js` (C2): the B1
create fixture and B2 learner-join world (a real RUNNING learner) plus C1's two
routers, registered handler and a real-lane workflow owner whose explicit
entries record and issue. Supplied physics: the caught-up observation route, the
selection's origin read and the target status route (no production route
exists, B2 note section 8), node rows, the services census, operation SQL, a raw
native REMOVE, leadership transfers, held learner inbound, crafted native
answers. Witness 13 uses the bare learner-operation fixture.

| # | Test (file order) | Pins |
| --- | --- | --- |
| 1 | the predicate owner's exact entry never grants a synthetic 0/0 | O5 at the owner: the raw predicate grants absent indices; the exact entry refuses absent, zero, string and match-absent progress (progress_unobserved), refuses behind, grants exact caught-up |
| 2 | C2 owner path | RUNNING learner caught up; positive origin evidence at the routed leader; one branch CAS; permit k+1 PROMOTE bound to the acknowledging leader's fences; selection changes only phase and permit; one native proposal; every founder and the target's own ConfState name it a voter; the explicit entry records the voter stamp once, changing only the three receipt columns, the permit committed at the PROPOSED index; replay with no native read; one PROMOTE entry per founder log; obligation UNKNOWN; learner stamp unchanged; a repeated selection writes nothing; no executor outcome, admission MATERIALIZED |
| 3 | a learner behind its leader | selection NOT_CAUGHT_UP behind/progress_behind with no CAS; positive control once caught up; held behind again the native turn answers PROMOTION_PROGRESS_BEHIND with nothing at the core and the permit unrefreshed; proposes once caught up (safe progression) |
| 4 | removed natively (two subtests) | before selection: NOT_CAUGHT_UP removed, no CAS, the recorded learner fact still valid, debt UNKNOWN; after selection: STALE_CONFIGURATION with nothing at the core; the recorder UNKNOWN at a follower, at the same-term leader and at a fencing newer-term leader (unvouched); the successor entry UNKNOWN; no successor, no voter stamp; abandonment refused (J1) |
| 5 | a stale promotion permit after a leader change | STALE_LEADERSHIP at the demoted leader, STALE_LIFECYCLE at the new one, nothing proposed; a repeated selection rewrites nothing; a refreshed permit at the same sequence is refused; the recorder proves the attempt noncommitted and records nothing; the successor entry issues k+2 (only the permit column) through C1's issuance; a delayed delivery of k+1 is MISMATCH and reaches no core; k+2 proposed, committed, recorded; one PROMOTE entry, k+2's |
| 6 | a leader of a newer term | after a real transfer the new leader (its own term applied, the learner entry of an older term) selects with its own fences, proposes, and the voter stamp is recorded |
| 7 | duplicate promotion requests | concurrent selections apply one branch CAS; concurrent deliveries reach the core once; concurrent recordings write one receipt; one entry |
| 8 | lost answers | a lost PROPOSED answer and a lost receipt answer are resolved by the explicit entry's exact read and readback, at the PROMOTE entry's log index; a settled fact is never written again |
| 9 | process loss between selection and proposal | a reopened repository: RECORDED with no second CAS; one proposal; a redelivery reaches no core; the new owner records once; one entry |
| 10 | UNKNOWN keeps the promotion debt | after the permit's own-term leader applied a later entry of its term (so only the strict newer-term rule withholds the fence), at a follower witness and at that leader both explicit entries answer UNKNOWN; nothing written |
| 11 | promotion debt adds no periodic work | the replicated-row wake answers null; the cache-hint sweep finds nothing; the restart scan's authoritative census finds and retains it, logged PHASE_NOT_OWNED; no native read; row unchanged |
| 12 | selection refusals | no origin at the leader and another operation's origin are ORIGIN_UNRECORDED; a thrown read is UNAVAILABLE; absent commit and match never grant (progress_unobserved); an unapplied leader term is leader_term_unapplied; a route to another replica is CONFLICT; a mixed leader observation is leader_unavailable; no own view is learner_unobserved; nothing written; a forged learner stamp is CONFLICT; an abandonment selected first excludes the promotion; only that CAS applies |
| 13 | an unresolved learner attempt holds the lane | on the bare learner-operation fixture: CONFLICT while the attempt is in flight, after it committed natively unrecorded, and after the holder's lease expired, with no evidence asked; obligation UNKNOWN; a second operation on the lane is MEMBERSHIP_LANE_CONFLICT |
| 14 | the voter stamp is only the exact committed outcome | crafted native answers: a stamp still naming a learner, a configuration changed beyond the promotion, another transition's origin, a moved applied index are CONFLICT; an unvouched or follower absence UNKNOWN; a malformed observation CONFLICT; a vouched fenced absence NONCOMMITTED; nothing written; the real committed answer RECORDED; replay writes nothing |

**Guard witness files (corrective round).** Two sibling files with the same
subsystem override, on the same world, one per half of the promotion module:
`test/integration/message-group-learner-promotion-selection-guards.integration.test.js`
(8 tests) and `test/integration/message-group-learner-promotion-recording-guards.integration.test.js`
(9 tests). Shared helpers (leader, catch-up, transfer, the recorder's query,
forged-row runner, the typed-or-thrown settle) live in the promotion fixture,
so the three files duplicate nothing. The five B1 guards are the tests named
V1, V2 (two tests: crafted, real schedule), V11 and V12 and the REMOVED case of
the voter row guards (V15).

| # | Selection guards (file order) | Pins |
| --- | --- | --- |
| S1 | selection input guards | a request that is no record, no operation, no destination node or replica, a read or observation capability that is no function, no invocation lifetime: INVALID with no authoritative read and no evidence asked; a lapsed invocation before the first read is UNAVAILABLE and reads no row; an unreadable row is UNAVAILABLE, never a missing fact |
| S2 | origin evidence guards | a refused-unavailable native answer is UNAVAILABLE; an unresolved kind under an applied reason with the genuine receipt, a committed kind beyond the applied boundary, a receipt the origin codec refuses and a receipt claiming the promotion stage are ORIGIN_UNRECORDED, never a thrown selection; no CAS; positive control |
| S3 | observation guards | a thrown observation route is leader_unavailable (typed, not thrown); an own view naming the target a voter is learner_unobserved; an applied index that is no safe integer is no own-term witness (leader_term_unapplied); nothing written |
| S4 | V1 | a real leadership transfer isolated before the new leader's no-op commits: strictly newer term, the learner entry applied, currentTermApplied false, the learner acknowledging it: not_caught_up/leader_term_unapplied, nothing written; healed, its no-op commits and the same leader selects |
| S5 | V12 | the destination node row deleted: UNAVAILABLE, nothing written; restored with boot 7: the permit binds destination boot 7 |
| S6 | V11 | a lifetime that lapses during the observation: UNAVAILABLE, no branch CAS |
| S7 | an undecodable holder claim | STALE_OWNER, never a thrown selection, nothing written; the restored row selects |
| S8 | corrupt rows at selection | the promotion phase over the learner permit, identity columns disagreeing with the encoded identity, the promotion permit under the learner phase, a permit or identity that does not decode: CONFLICT, never RECORDED or thrown; the restored row is the recorded promotion |

| # | Recording guards (file order) | Pins |
| --- | --- | --- |
| R1 | recording input guards | the learner action as recording input, a read capability that is no function, a lifetime that is no function, an empty operation id: INVALID with no row read; recovery of an unreadable row is UNAVAILABLE, of an absent row CONFLICT, never thrown; no evidence asked |
| R2 | voter row guards | on the in-flight promotion with the real committed answer: identity columns disagreeing, another holder claim in the request, an obligation other than UNKNOWN, no learner stamp (no native read asked), a removal stamp, a REMOVED-terminal operation (V15), a committed permit on a row still in flight (readback-only), a promotion permit that is not the row's attempt, a voter stamp already present, a phase other than in flight: CONFLICT, nothing written; positive control once; a recorded fact answers only its own attempt (another sequence CONFLICT); a tampered voter stamp is no exact replay; exact replay writes nothing |
| R3 | voter evidence guards | a receipt the codec refuses, another group's, operation's, transition's or replica's origin, a peer id that does not derive from its replica identity, an origin not earlier than the promotion, a membership that is no committed stamp, a moved applied index, a stamp at the permit's own generation or of an earlier term: CONFLICT; a held or joint witness: UNAVAILABLE; a learner stamp on the row that does not decode, that does not hold the source as a voter or that already names the target a voter: CONFLICT; nothing written; positive control |
| R4 | the recorded voter fact is one pure predicate | `recordedVoterFactIsValid` on the recorded row (true) and on sixteen forgeries (permit undecodable or non-canonical, identity columns, phase, in-flight state, another action, removal stamp, learner or voter stamp undecodable or non-canonical, another proposal index, an extra voter, an exchanged voter, an extra learner, the permit's own generation, an earlier term, the target still a learner, a learner stamp naming the target a voter or lacking the source): false, never thrown |
| R5 | an expired holder | STALE_OWNER, no native read asked, nothing written |
| R6 | holder replacement around the receipt | the holder replaced between the basis read and the CAS: the CAS applies nothing, UNKNOWN, the row in flight; the holder replaced between the receipt and the readback: UNKNOWN to the obsolete caller though the receipt is on the row; the live holder replays RECORDED without a write |
| R7 | concurrent recordings with disagreeing evidence | lockstep over the in-flight row: one receipt applies, the first recorder RECORDED, the second UNKNOWN (its stamp is not the row's) |
| R8 | V2 (crafted) | a committed answer whose stamp carries one extra voter or one extra learner: CONFLICT, nothing written; positive control |
| R9 | V2 (real schedule, F1) | an unrelated learner joins before the ordered successor commits: STALE_CONFIGURATION at the issued attempt, UNKNOWN at the same-term leader, NONCOMMITTED at the fencing leader, the successor issued, proposed and committed, then CONFLICT at every founder: the voter stamp carrying the unrelated learner is never recorded; phase PROMOTION_IN_FLIGHT, obligation UNKNOWN (the J1 operator blocker) |

### 7.1 The rule this slice and C3+ carry: every guard is measured

Every refusal branch and every precondition of a write in a membership owner
has (a) a named mutation that removes or weakens exactly that clause and (b) a
declared witness assertion that the mutation fails, named in the owner's
design note as one table (7.2 below). A clause whose mutation survives the
whole declared witness set is not a guard: either a distinguishing input
exists and the witness is added, or the clause is implied by an authority the
module already consumes (a codec, a validator, another clause of the same
decision) and the clause is removed, with that authority named (7.3). A typed
refusal whose only distinguishing path is an enclosing catch is restructured
so the typed path is measurable (the catch narrowed to the codec it exists
for). Nothing is kept as "defence in depth" without a witness: the review's B1
(this slice) and C1's B4 were exactly such clauses, claimed as write guards in
the design tables and measured by nothing. The table is re-run on the final
code after every change to the module, on the lab, over all three witness
files, and each row names the file and the first failing assertion.

A note on what a kill proves: a mutant killed at a named assertion proves the
clause is reachable and that the witness measures it; a mutant that survives
proves no declared witness distinguishes it, which is either a missing
witness or a redundant clause, and the table says which and why.

**Red-first.** The witness file and its fixture were run against a mirror
whose `src/` is `git archive b5e62dd0d src` (the test tree otherwise this
slice's). The file loads and every leaf is red at a named assertion: 16
node:test entries (14 top-level, one parent with two subtests), 15 leaves.
In the corrective round the two guard files were run the same way on the lab
(tv-dator, `b5e62dd0d` sources): 9 entries, 0 pass, 9 fail (the selection
file's eight tests at the fixture's surface guard, the recording file as one
failed load: the promotion module does not exist there). That is the surface
red the review's N9 names; the behavioural red-first of each guard witness is
its mutant in 7.2, which fails exactly the new assertion with the guard
removed and passes with it present.

- Test 1: "the promotion-progress owner offers the exact entry C2 consumes".
- Tests 2 to 14 (the two subtests included): "the repository owns the
  promotion selection over the exact caught-up proof" (test 13 from its own
  bare-fixture guard, the rest from the promotion fixture's surface guard).

The owners whose reverts keep the module graph loadable were also reverted to
`b5e62dd0d` bytes alone (rows R1 and R2 of the mutation table).

On the working tree the file is 16/16 green: 4491 ms and 7818 ms in two runs
through the classified runner (`npm run -s test:file`, exclusive lane; the
second after a thermal hold), against the 30 s integration budget.

**Mutation controls (the attempt's 25).** Each control was applied alone in a
scratch copy of this working tree (never in the worktree itself), the witness
file was run, and the file was restored and compared byte for byte with the
worktree. M1 to M8 are the brief's defect classes; M12 and M14 to M20 pin the
owner guidance; M21 and M22 pin C1's fence as the promotion consumes it. M18,
M19, M21 and M22 mutate owners C2 does not change (the persistence owner,
discovery and C1's fence), only in the scratch copy. The corrective round
re-ran all 25 (adapted to the final text where the module changed) together
with the guard table; their final results are the I-rows of 7.2 and the table
below is the attempt's record.

| Id | Defect class | Mutation | Killed at (first failing assertion) |
| --- | --- | --- | --- |
| M1 | promote on 0/0 | the shared decision consults the raw predicate | test 12: "absent commit and match never grant" |
| M2 | promote while behind | the exact entry grants an exact but behind match | 7 entries: test 1 (the exact entry grants behind), test 3 "a RUNNING learner that fell behind is no promotion basis", and tests 2, 7, 8, 9 and 14, where a selection granted over a behind learner meets the native turn's PROMOTION_PROGRESS_BEHIND |
| M3 | skip the branch-selection predicate | the shared recorded-fact predicate accepts a non-canonical stamp | test 12: "a forged learner stamp is no basis" |
| M4 | refresh the stale permit | the promotion consumer takes the port's current term, configuration, lifecycle and runtime | test 4: "the removal moved the configuration the permit is fenced to"; test 5: "the old permit is not refreshed into the new leader's fences" |
| M5 | reuse the sequence | the promotion permit keeps the learner's sequence | 12 entries, first test 2: the branch selection answers INVALID |
| M5b | reuse the sequence | the promotion's ordered successor keeps the attempt's sequence | test 5: "C1's issuance issues the ordered successor" |
| M6 | second proposal after process loss | the port no longer defers a change while one is pending | test 7: "one native proposal"; test 9: "the redelivery reaches no core" |
| M7 | record the stamp without the exact outcome | any committed stamp naming both identities is a voter fact | test 14: "a stamp still naming the target a learner" |
| M8 | treat RUNNING as the grant | the selection takes the learner as caught up to the leader's commit, not its observed match | test 3: "a RUNNING learner that fell behind is no promotion basis" |
| M9 | an absent target fences | the promotion vouch accepts a target that is not a voter | test 4: "the absent target vouches for nothing even at that leader" |
| M10 | proof from another replica | the selection does not bind the proof to the routed leader | test 12: "the proof must be the routed leader's" |
| M11 | another transition's voter | the recorder accepts any learner origin | test 14: "another transition's learner origin" |
| M12 | no positive origin evidence (guidance 1) | the selection ignores the routed leader's learner-action answer | test 12: "no origin at the leader" |
| M13 | learner's own view skipped | any own answer holds | test 12: the unobserved own view is no longer learner_unobserved |
| M14 | no applied-term authority (guidance 1) | any acknowledging leader is current | test 12: "no promotion authority before the leader applied an entry of its own term" |
| M15 | applied term from the native flag only | the recorded learner entry of the leader's own term is ignored | 11 entries, first test 2: an idle leader right after its own configuration change answers leader_term_unapplied |
| M16 | applied term from the recorded entry only | the native flag is ignored | test 6: "the new leader is promotion authority" |
| M17 | C1's absence vouch as a promotion prerequisite (guidance 1) | the origin evidence also demands the registry-absence vouch | 14 entries, first test 2: ORIGIN_UNRECORDED for a legitimately committed learner |
| M18 | another target takes the held lane (guidance 2) | the insert skips the lane conflict | test 13: the second operation is no MEMBERSHIP_LANE_CONFLICT ("Authoritative replica operation not confirmed: other-target-operation") |
| M19 | promotion debt as periodic work (guidance 3) | the one hint filter lists every UNKNOWN row | test 11: "the promotion row's replicated change wakes nothing" |
| M20 | remote work for a row that cannot be promoted (guidance 2, 3) | the observation is asked before the lane's basis | test 13: "no origin read and no observation is asked for" |
| M21 | the permit's own term fences | C1's fence accepts a leader of the permit's own term | test 10: at the own-term leader the vouched absence becomes NONCOMMITTED (assertion message: the witness, "consumer-a") |
| M22 | a follower fences | C1's fence drops the leader role | test 14: "absence at a follower" |
| R1 | the read at `b5e62dd0d` | native read and context codec reverted | 10 entries, first "the explicit entry recovers the promotion's exact outcome through the recorder" |
| R2 | the workflow entries at `b5e62dd0d` | native-read entries and workflow owner reverted | 9 entries, first "workflow.recoverMessageGroupVoterOutcomeFromRecipient is not a function" |

All 25 are killed; none survives.

### 7.2 Guard-vs-mutation table (final code, lab run)

Every guard clause of `src/rebalancer/replica-operation-message-group-promotion.js`
(each refusal branch and each precondition of the branch CAS or the voter
receipt, the pure fact predicate's clauses included), in source order, with the
mutation that removes or weakens exactly that clause, the result on the lab,
and the declared file and first failing assertion that killed it. The I-rows
are the attempt's 25 mutation controls adapted to the final text; the rows
marked (V1), (V2), (V11), (V12), (V15) are the review's five B1 guards. Each
mutant ran the three declared witness files (`promotion` = the 16-entry
promotion witness, `promotion-selection-guards`, `promotion-recording-guards`)
sequentially in a throwaway detached worktree at `b5e62dd0d` with the
working-tree change applied as a patch, one textual edit per run, the file
restored and sha256-verified after each run (`scratchpad/c2g/tools/mutate.mjs`,
spec `scratchpad/c2g/guard-mutations.mjs`, results `scratchpad/c2g/round3/`).
Three lab rounds were run: round 1 on the attempt's clauses (120 run, 117
killed; the three survivors are the codec-implied clauses of 7.3), round 2 on
the final code with the first forged-learner witnesses (120 run, 118 killed;
the two `learnerConfigurationOf` clauses survived because the voters-length
clause masked their forgeries), round 3 on the final code and witnesses, the
table below: **120 run, 120 reported killed, 0 survived** (historical report;
independent review below excludes I-R2 from behavioral kills), 14 killed in the promotion
witness, 38 in the selection guards, 68 in the recording guards (adam-laptop,
carinas-windows and tv-dator, 40 mutants each, 2026-10-11 08:38 to 08:57 UTC).

| Id | Guard clause | Mutation | Result | Killed in: first failing assertion |
| --- | --- | --- | --- | --- |
| G01 | recordedStamp: a column the stamp codec refuses is null (catch) | replaced by `function recordedStamp(encoded) { return committedStampOfAnswer(JSON.p...` | killed | promotion-recording-guards: a learner stamp on the row that does not decode |
| G02 (V2) | sameMembers: equal length | replaced by `return right.every((peer) => left.includes(peer));` | killed | promotion-recording-guards: a voter stamp with an extra voter |
| G03 | sameMembers: every member of the expected set is in the stamp | replaced by `return left.length === right.length;` | killed | promotion-recording-guards: a voter stamp with a voter exchanged for another peer |
| G04 | voterStampFollows: the voters are the learner voters plus the target | replaced by `return true &&` | killed | promotion-recording-guards: a voter stamp with an extra voter |
| G05 | voterStampFollows: the learners are the learner configuration's minus the target | clause removed | killed | promotion-recording-guards: a voter stamp with an extra learner |
| G06 | voterStampFollows: the configuration generation moved past the permit's | clause removed | killed | promotion-recording-guards: a stamp at the permit's own configuration generation |
| G07 | voterStampFollows: the stamp term is at least the permit's | replaced by `;` | killed | promotion-recording-guards: a stamp of a term before the permit's |
| G08 | recordedVoterPermit: the permit decodes | replaced by `return membershipRowIdentityMatches(row, identity, encodedIdentity) &&...` | killed | promotion-recording-guards: a permit that does not decode |
| G09 | recordedVoterPermit: the row's identity columns match its encoded identity | replaced by `return permit !== null && row.messageGroupMembershipPhase === PROMOTIO...` | killed | promotion-recording-guards: identity columns disagreeing with the encoded identity |
| G10 | recordedVoterPermit: the phase is VOTER_COMMITTED | replaced by `promotionActionMatches(permit, identity) && row.messageGroupRemovalSta...` | killed | promotion-recording-guards: a phase other than voter committed |
| G11 | learnerConfigurationOf: the learner stamp names the exact learner target | replaced by `return learner !== null && learner.voters.includes(deriveRaftRsPeerId(...` | killed | promotion-recording-guards: a learner stamp that never held the target as its learner |
| G12 | recordedVoterPermit: the permit is this transition's promotion of the exact target | replaced by `row.messageGroupRemovalStamp === null &&` | killed | promotion-recording-guards: a committed permit of another action of the transition |
| G13 | recordedVoterPermit: no removal stamp | replaced by `promotionActionMatches(permit, identity) && row.messageGroupMembership...` | killed | promotion-recording-guards: a removal stamp present |
| G14 | recordedVoterPermit: the permit column is the canonical encoding | replaced by `promotionActionMatches(permit, identity) && row.messageGroupRemovalSta...` | killed | promotion-recording-guards: a non-canonical permit encoding |
| G15 | recordedVoterFactIsValid: the learner configuration and the voter stamp decode (null propagation) | replaced by `const learner = learnerConfigurationOf(row, identity) ?? recordedStamp...` | killed | promotion-recording-guards: a voter stamp already on the in-flight row |
| G78 | learnerConfigurationOf: the learner stamp holds the source as a voter | replaced by `return learner !== null && namesExactLearner(learner, identity) ? lear...` | killed | promotion-recording-guards: a learner stamp that dropped the source, against a configuration that dropped it too |
| G16 | recordedVoterFactIsValid: the voter stamp column is the canonical encoding | replaced by `return voter !== null && voter.membershipGenerationIndex === permit.pr...` | killed | promotion-recording-guards: a recorded row whose voter stamp was tampered is no exact replay |
| G17 | recordedVoterFactIsValid: the stamp's generation is the committed permit's proposal index | replaced by `voterStampFollows(voter, learner, identity, permit);` | killed | promotion-recording-guards: an in-flight permit state |
| G18 | recordedVoterFactIsValid: the voter stamp follows the learner configuration | replaced by `voter.membershipGenerationIndex === permit.proposalIndex;` | killed | promotion-recording-guards: a voter stamp with an extra voter |
| G19 | promotionRequest: the request is a strict own-data record | replaced by `if (!nonempty(data.operationId) || !nonempty(data.destinationNodeId) |...` | killed | promotion-selection-guards: a request that is no data record |
| G20 | promotionRequest: a nonempty operation id | replaced by `if (!data || !nonempty(data.destinationNodeId) ||` | killed | promotion-selection-guards: no operation |
| G21 | promotionRequest: a nonempty destination node | replaced by `if (!data || !nonempty(data.operationId) ||` | killed | promotion-selection-guards: no destination node |
| G22 | promotionRequest: a nonempty destination replica | replaced by `) return null;` | killed | promotion-selection-guards: no destination replica |
| G23 | promotionSelected: the identity decodes | replaced by `return permit !== null && membershipRowIdentityMatches(row, identity, ...` | killed | promotion-selection-guards: an identity that does not decode |
| G24 | promotionSelected: the permit decodes | replaced by `return identity !== null && membershipRowIdentityMatches(row, identity...` | killed | promotion-selection-guards: a permit that does not decode |
| G25 | promotionSelected: the row's identity columns match its encoded identity | replaced by `[PROMOTION.inFlight, PROMOTION.committed].includes(row.messageGroupMem...` | killed | promotion-selection-guards: identity columns disagreeing with the encoded identity |
| G26 | promotionSelected: a promotion phase | replaced by `promotionActionMatches(permit, identity);` | killed | promotion-selection-guards: the promotion permit under the learner phase |
| G27 | promotionSelected: the permit is this transition's promotion of the exact target | replaced by `[PROMOTION.inFlight, PROMOTION.committed].includes(row.messageGroupMem...` | killed | promotion-selection-guards: the promotion phase over the learner permit |
| G28 | recordedLearnerBasis: no recorded learner fact is no basis | clause removed | killed | promotion-selection-guards: the promotion phase over the learner permit |
| G29 | learnerOriginUnproven: a thrown read is UNAVAILABLE (catch) | replaced by `const observed = await readCommittedAction(query);` | killed | promotion: fixture: read unavailable |
| G30 | learnerOriginUnproven: a refused-unavailable answer is UNAVAILABLE | clause removed | killed | promotion-selection-guards: a refused-unavailable native answer |
| G31 | learnerOriginUnproven: the answer kind is COMMITTED | replaced by `return observed.reason === ACTION_REASON.APPLIED &&` | killed | promotion-selection-guards: an unresolved kind under an applied reason with the genuine receipt |
| G32 | learnerOriginUnproven: the answer reason is APPLIED | replaced by `return observed?.kind === ACTION_KIND.COMMITTED &&` | killed | promotion-selection-guards: a committed kind beyond the applied boundary |
| G33 | learnerOriginUnproven: the receipt is exactly the recorded origin bytes | replaced by `Boolean(encodeCommittedLearnerAdmission(observed.receipt)) ?` | killed | promotion: another operation's origin |
| G34 | learnerOriginUnproven: a receipt the origin codec refuses is ORIGIN_UNRECORDED (catch) | replaced by `return observed?.kind === ACTION_KIND.COMMITTED && observed.reason ===...` | killed | promotion-selection-guards: a receipt the origin codec refuses |
| G35 | observeCaughtUp: the own view counts only when it names the exact learner | replaced by `own, identity,` | killed | promotion-selection-guards: an own view naming the target a voter is no view of the exact learner |
| G36 | observeCaughtUp: a thrown observation is LEADER_UNAVAILABLE (catch) | replaced by `} catch (error) { throw error; }` | killed | promotion-selection-guards: a thrown observation is no leader observed, never a thrown selection |
| G37 | leaderTermApplied: the native currentTermApplied flag (first witness) | replaced by `return false || (status?.term === basis.prior.leaderTerm` | killed | promotion-selection-guards: positive control: authority once its own term is applied |
| G38 (V1) | leaderTermApplied: the recorded learner entry is an entry of the leader's own term | replaced by `(Number.isSafeInteger(status?.appliedIndex) &&` | killed | promotion-selection-guards: no promotion authority before its own term is applied: the learner entry is an entry of an older term |
| G39 | leaderTermApplied: the applied index is a safe integer | replaced by `(status?.term === basis.prior.leaderTerm &&` | killed | promotion-selection-guards: an applied index that is no safe integer is no own-term witness |
| G40 | leaderTermApplied: the leader applied the learner entry | replaced by `true);` | killed | promotion: no promotion authority before the leader applied an entry of its own term |
| G41 | selectOverCaughtUpLearner: an acknowledgement other than ACKNOWLEDGED is NOT_CAUGHT_UP | clause removed | killed | promotion-selection-guards: a thrown observation is no leader observed, never a thrown selection |
| G42 | selectOverCaughtUpLearner: the leader's own term applied | clause removed | killed | promotion-selection-guards: an applied index that is no safe integer is no own-term witness |
| G43 | selectOverCaughtUpLearner: the acknowledging leader is the routed replica | clause removed | killed | promotion: the proof must be the routed leader's |
| G44 (V12) | selectOverCaughtUpLearner: the destination's canonical boot is read | replaced by `const bootIncarnation = 1;` | killed | promotion-selection-guards: an absent destination boot is unavailability, never a guessed binding |
| G45 | selectOverCaughtUpLearner: an unreadable destination boot is UNAVAILABLE | replaced by `if (!isCurrent()) return result(OUTCOME.UNAVAILABLE, row);` | killed | promotion-selection-guards: an absent destination boot is unavailability, never a guessed binding |
| G46 (V11) | selectOverCaughtUpLearner: the invocation is still current after the evidence reads | replaced by `if (bootIncarnation === null) return result(OUTCOME.UNAVAILABLE, row);` | killed | promotion-selection-guards: a lifetime that lapsed during the observation never reaches the branch CAS |
| G47 | selectOverCaughtUpLearner: the holder is local and live | clause removed | killed | promotion-selection-guards: an undecodable owner claim |
| G48 | selectMessageGroupPromotion: the request decodes | replaced by `if (typeof readCommittedAction !== 'function' || typeof observeCatchUp...` | killed | promotion-selection-guards: a request that is no data record |
| G49 | selectMessageGroupPromotion: the read capability is a function | replaced by `if (!input || typeof observeCatchUp !== 'function'` | killed | promotion-selection-guards: a read capability that is no function |
| G50 | selectMessageGroupPromotion: the observation capability is a function | replaced by `typeof isInvocationCurrent !== 'function') {` | killed | promotion-selection-guards: an observation capability that is no function |
| G51 | selectMessageGroupPromotion: the invocation lifetime is a function | replaced by `typeof observeCatchUp !== 'function') {` | killed | promotion-selection-guards: no invocation lifetime: a selection without a lifetime predicate is INVALID |
| G52 | selectMessageGroupPromotion: the invocation is current before the first read | replaced by `const before = await observeMembershipOperation(repository, input.oper...` | killed | promotion-selection-guards: a lapsed invocation is UNAVAILABLE before the first read |
| G53 | selectMessageGroupPromotion: an unreadable row is UNAVAILABLE | replaced by `if (promotionSelected(before.row))` | killed | promotion-selection-guards: an unreadable authoritative row is UNAVAILABLE, never a missing fact |
| G54 | selectMessageGroupPromotion: an already selected promotion is RECORDED without a write | clause removed | killed | promotion-selection-guards: the restored row is the recorded promotion |
| G55 | selectMessageGroupPromotion: no recorded learner basis is CONFLICT before any evidence | clause removed | killed | promotion-selection-guards: the promotion phase over the learner permit |
| G56 | selectMessageGroupPromotion: missing origin evidence is the typed refusal | clause removed | killed | promotion-selection-guards: a refused-unavailable native answer |
| G57 | voterRowMatches: the row's identity columns match the request identity | replaced by `return row.messageGroupMembershipOwnerClaim === input.executionClaim &...` | killed | promotion-recording-guards: identity columns disagreeing with the encoded identity |
| G58 | voterRowMatches: the row's holder claim is the request's | replaced by `row.messageGroupMembershipObligationState === MEMBERSHIP_OBLIGATION.UN...` | killed | promotion-recording-guards: a request carrying another holder claim than the row's |
| G59 | voterRowMatches: the membership obligation is UNKNOWN | replaced by `row.messageGroupLearnerStamp !== null && row.messageGroupRemovalStamp ...` | killed | promotion-recording-guards: an obligation other than UNKNOWN |
| G60 | voterRowMatches: the learner stamp is kept | replaced by `row.messageGroupRemovalStamp === null && recordingSettlementAllowed(re...` | killed | promotion-recording-guards: no learner stamp on the row: native reads asked |
| G61 | voterRowMatches: no removal stamp | replaced by `row.messageGroupLearnerStamp !== null && recordingSettlementAllowed(re...` | killed | promotion-recording-guards: a removal stamp on the row |
| G62 (V15) | voterRowMatches: an open or exactly failed operation (settlement) | replaced by `row.messageGroupLearnerStamp !== null && row.messageGroupRemovalStamp ...` | killed | promotion-recording-guards: an ordinarily completed operation (REMOVED, not an exact failure) |
| G63 | promotionIntent: the phase is PROMOTION_IN_FLIGHT | replaced by `return row.messageGroupMembershipPermit === input.encodedPermit &&` | killed | promotion-recording-guards: a phase other than promotion in flight |
| G64 | promotionIntent: the row's permit is the request's in-flight attempt | replaced by `row.messageGroupVoterStamp === null;` | killed | promotion-recording-guards: a promotion permit that is not the row's attempt |
| G65 | promotionIntent: no voter stamp yet | replaced by `row.messageGroupMembershipPermit === input.encodedPermit;` | killed | promotion-recording-guards: a voter stamp already on the in-flight row |
| G66 | exactRecordedVoter: the row is a valid recorded voter fact | replaced by `return permit !== null && row.messageGroupMembershipPermit === committ...` | killed | promotion-recording-guards: a recorded row whose voter stamp was tampered is no exact replay |
| G67 | exactRecordedVoter: the recorded permit is this request's attempt committed | replaced by `return recordedVoterFactIsValid(row, input.identity, input.encodedIden...` | killed | promotion-recording-guards: a recorded fact answers only the attempt it records: another sequence is CONFLICT |
| G68 | voterBasisRefusal: a row the recording may not write is CONFLICT | clause removed | killed | promotion-recording-guards: identity columns disagreeing with the encoded identity |
| G69 | voterBasisRefusal: the request's holder is local and live | replaced by `if (input.permit.permitState === STATE.COMMITTED) {` | killed | promotion-recording-guards: an expired holder is no live local holder |
| G70 | voterBasisRefusal: a COMMITTED permit is readback-only | clause removed | killed | promotion-recording-guards: a committed permit on a row still in flight is readback-only |
| G71 | voterBasisRefusal: an in-flight input needs the exact intent or the exact recorded voter | replaced by `return null;` | killed | promotion-recording-guards: a promotion permit that is not the row's attempt |
| G72 | voterBasisRefusal: the exact recorded voter admits the replay of an in-flight input | replaced by `return promotionIntent(row, input) ? null : OUTCOME.CONFLICT;` | killed | promotion-recording-guards: positive control |
| G73 | decodedLearnerOrigin: a receipt the origin codec refuses is null (catch) | replaced by `return decodeCommittedLearnerAdmission(encodeCommittedLearnerAdmission...` | killed | promotion-recording-guards: a receipt the origin codec refuses |
| G74 | learnerOriginPrecedes: the origin's group | replaced by `return context.operationId === action.operationId &&` | killed | promotion-recording-guards: an origin of another group |
| G75 | learnerOriginPrecedes: the origin's operation | replaced by `return origin.groupId === query.groupId &&` | killed | promotion-recording-guards: another operation's origin |
| G76 | learnerOriginPrecedes: the origin's transition | replaced by `context.replicaIdentity === action.replicaIdentity &&` | killed | promotion-recording-guards: another transition's origin |
| G77 | learnerOriginPrecedes: the origin's target replica | replaced by `context.permitSequence < action.permitSequence;` | killed | promotion-recording-guards: another replica's origin |
| G79 | learnerOriginPrecedes: the origin is earlier in the transition than the promotion attempt | replaced by `; } // The voter stamp a COMMITTED` | killed | promotion-recording-guards: an origin not earlier in the transition than the promotion |
| G80 | voterOutcomeEvidence: the shared classification refuses first (NONCOMMITTED/UNKNOWN/UNAVAILABLE/CONFLICT) | clause removed | killed | promotion-recording-guards: the same-term leader fences nothing |
| G81 | voterOutcomeEvidence: a receipt the codec refuses or that is not the preceding learner origin is CONFLICT | clause removed | killed | promotion-recording-guards: a receipt the origin codec refuses |
| G82 | voterOutcomeEvidence: a held or joint witness is UNAVAILABLE | clause removed | killed | promotion-recording-guards: a held witness |
| G83 | voterOutcomeEvidence: the witness membership is a committed stamp | replaced by `if (learner === null || stamp.appliedIndex !== observed.observedApplie...` | killed | promotion-recording-guards: a membership that is no committed stamp |
| G84 | voterOutcomeEvidence: the row's learner stamp decodes | replaced by `if (stamp === null || stamp.appliedIndex !== observed.observedAppliedI...` | killed | promotion-recording-guards: a learner stamp on the row that does not decode |
| G85 | voterOutcomeEvidence: the stamp is the read's own applied configuration | replaced by `!voterStampFollows(stamp, learner, input.identity, input.permit)) {` | killed | promotion-recording-guards: a moved applied index |
| G86 | voterOutcomeEvidence: the stamp follows the recorded learner configuration | replaced by `stamp.appliedIndex !== observed.observedAppliedIndex) {` | killed | promotion-recording-guards: a stamp at the permit's own configuration generation |
| G87 | readback: the row is this input's exactly recorded voter fact (basis refusal null) | replaced by `row.messageGroupVoterStamp === evidence.stamp,` | killed | promotion-recording-guards: an obsolete caller reports UNKNOWN even when its receipt committed |
| G88 | readback: the row carries this evidence's stamp | replaced by `voterBasisRefusal(repository, row, input) === null,` | killed | promotion-recording-guards: the receipt on the row is the first recorder's; the second proves nothing of its own |
| G89 | readback: proves the receipt (never true without the row) | clause replaced by true | killed | promotion-recording-guards: a defeated receipt CAS is UNKNOWN, never RECORDED |
| G90 | recordMessageGroupVoterOutcome: the request is this transition's promotion (action matcher) | replaced by `const input = actionRecordingInput(request, () => true);` | killed | promotion-recording-guards: the learner action is no promotion recording input |
| G91 | recordMessageGroupVoterOutcome: the read capability is a function | replaced by `if (!input || (isInvocationCurrent !== undefined && typeof isInvocatio...` | killed | promotion-recording-guards: a read capability that is no function |
| G92 | recordMessageGroupVoterOutcome: a supplied lifetime is a function | replaced by `if (!input || typeof readCommittedAction !== 'function') {` | killed | promotion-recording-guards: an invocation lifetime that is no function |
| G93 | recoverMessageGroupVoterOutcome: a nonempty operation id | replaced by `const observed = await observeMembershipOperation(repository, operatio...` | killed | promotion-recording-guards: recovery needs an operation id |
| G94 | recoverMessageGroupVoterOutcome: an unreadable row is UNAVAILABLE | replaced by `if (!observed.row) return result(OUTCOME.CONFLICT);` | killed | promotion-recording-guards: an unreadable row is UNAVAILABLE, never a missing promotion |
| G95 | recoverMessageGroupVoterOutcome: an absent row is CONFLICT | replaced by `if (!observed.available) return result(OUTCOME.UNAVAILABLE);` | killed | promotion-recording-guards: an absent row is CONFLICT, never a thrown recovery |
| I-M1 | the shared decision consults the raw predicate | replaced by `evaluateExactLearnerPromotionProof, evaluateLearnerPromotionProof} fro...` | killed | promotion: absent commit and match never grant |
| I-M2 | the exact entry grants an exact but behind match | replaced by `return evaluateLearnerPromotionProof({...facts, learnerMatchIndex: Mat...` | killed | promotion-recording-guards: Expected values to be strictly equal: |
| I-M3 | the shared recorded-fact predicate accepts a non-canonical stamp | replaced by `return stamp !== null;` | killed | promotion: a forged learner stamp is no basis |
| I-M4 | the promotion consumer refreshes the stale permit from the port | replaced by `{...observed.transition, ...((s) => ({leaderTerm: s.term, replicaLifec...` | killed | promotion-recording-guards: the issued attempt is fenced to the configuration before the unrelated change |
| I-M5 | the promotion permit keeps the learner's sequence | replaced by `permitSequence: prior.permitSequence, permitStage: STAGE.PROMOTE,` | killed | promotion-recording-guards: Expected values to be strictly equal: |
| I-M5b | the promotion's ordered successor keeps the attempt's sequence | replaced by `permitSequence: prior.permitSequence + (prior.permitStage === 'promote...` | killed | promotion-recording-guards: the ordered successor |
| I-M6 | the port no longer defers a change while one is pending | replaced by `if (true || (!hasPendingConfChange(status) && !(joint && !leavesJoint)...` | killed | promotion: one native proposal |
| I-M7 | any committed stamp naming the target under its identity is a voter fact | replaced by `return stamp.identities[target] === identity.targetReplicaId;` | killed | promotion-recording-guards: a stamp at the permit's own configuration generation |
| I-M8 | RUNNING as the grant: the match is the leader's commit | replaced by `committedIndex: status.commitIndex, learnerMatchIndex: status.commitIn...` | killed | promotion-recording-guards: Expected values to be strictly equal: |
| I-M9 | the promotion vouch accepts a target that is not a voter (an absent target fences) | replaced by `{observation: absenceObservation(status, !view.voter)});` | killed | promotion: a learner removed natively before promotion is refused and its recorded fact stays; removed after the promotion was authorized, the native turn propos |
| I-M10 | the proof is not bound to the routed leader | clause removed | killed | promotion: the proof must be the routed leader's |
| I-M11 | the recorder accepts any learner origin | replaced by `return true || origin.groupId === query.groupId && context.operationId...` | killed | promotion-recording-guards: an origin of another group |
| I-M12 | the selection ignores the routed leader's learner-action answer | replaced by `const unproven = null;` | killed | promotion-selection-guards: a refused-unavailable native answer |
| I-M13 | any own answer holds (the learner's own view skipped) | replaced by `learnerHolds: true,` | killed | promotion-selection-guards: an own view naming the target a voter is no view of the exact learner |
| I-M14 | any acknowledging leader is current (no applied-term authority) | replaced by `return true || status?.currentTermApplied === true ||` | killed | promotion-selection-guards: an applied index that is no safe integer is no own-term witness |
| I-M15 | applied term from the native flag only | replaced by `return status?.currentTermApplied === true || false && (status?.term =...` | killed | promotion-recording-guards: Expected values to be strictly equal: |
| I-M16 | applied term from the recorded entry only | replaced by `return false || (status?.term === basis.prior.leaderTerm` | killed | promotion-selection-guards: positive control: authority once its own term is applied |
| I-M17 | C1's absence vouch as a promotion prerequisite | replaced by `return observed?.observation?.originRegistryComplete === true && obser...` | killed | promotion-recording-guards: Expected values to be strictly equal: |
| I-M18 | another target takes the held lane (the insert skips the lane conflict) | replaced by `if (false && conflictingMembershipOperation) {` | killed | promotion: Authoritative replica operation not confirmed: other-target-operation |
| I-M19 | promotion debt as periodic work (the hint filter lists every UNKNOWN row) | replaced by `return Boolean(operation);` | killed | promotion: the promotion row's replicated change wakes nothing |
| I-M20 | remote work before the lane's basis (an observation asked first) | replaced by `await Promise.resolve().then(() => observeCatchUp(Object.freeze({group...` | killed | promotion: no origin read and no observation is asked for |
| I-M21 | C1's fence accepts a leader of the permit's own term | replaced by `observation.originRegistryComplete === true && observation.term >= per...` | killed | promotion: consumer-a |
| I-M22 | C1's fence drops the leader role (a follower fences) | replaced by `return observation.currentTermApplied === true &&` | killed | promotion: absence at a follower |
| I-R1 | the native read and context codec reverted to b5e62dd0d | file reverted to b5e62dd0d | killed | promotion-recording-guards: {"kind":"refused-action","reason":"learner-action-invalid"} |
| I-R2 | the native-read entries and workflow owner reverted to b5e62dd0d | file reverted to b5e62dd0d | structural negative only; excluded from behavioral count | promotion-recording-guards: workflow.recoverMessageGroupVoterOutcomeFromRecipient is not a function |

### 7.3 Clauses the table removed, and the authority that carries each

The review's rule treats an unmeasured guard as a defect. For these clauses
of the attempt's module no declared witness could distinguish their removal
(their mutants survived the whole witness set in the first lab round, or no
input exists that reaches them): each restated a decision an authority the
module already consumes makes first. They were removed; the authority is
named; the final module passes the full witness set without them, and the
remaining clauses of each decision are measured in 7.2.

| Removed clause (attempt's text) | Carried by | Evidence |
| --- | --- | --- |
| `voterStampFollows`: `stamp.identities[target] === identity.targetReplicaId`, `stamp.identities[source] === identity.sourceReplicaId`, `stamp.voters.includes(source)` | The stamp validator maps every member to the identity its peer id derives from (`raft-committed-membership-stamp.js` `canonicalIdentities`: `deriveRaftRsPeerId(identity) === peerId`), so a member's identity is forced; that the target and the source are voters follows from the voters clause (the learner configuration's voters plus the target) once the learner configuration is this transition's, which the module now checks itself (`learnerConfigurationOf`: `namesExactLearner` from the acknowledgement owner, plus the source peer among its voters) instead of trusting the column. The one real content of the three clauses, the source still a voter when the learner stamp column is forged, is now a measured guard of the recorder and of the fact predicate (R3 "does not hold the source as a voter", R4 "lacking the source"). | no distinguishing stamp exists: a valid stamp cannot map a member to another identity; the recorder and the predicate are measured through the learner configuration instead (7.2 G11 and G78, the two clauses of `learnerConfigurationOf`; their first witnesses were masked by the voters-length clause until each forgery was paired with the matching configuration) |
| `promotionSelected`: `identity.operationId === operationId`; `recordedLearnerBasis`: `fact.identity.operationId !== operationId` | The row is read by the request's operation id (`observeMembershipOperation`) and both decisions match the row's identity columns to its encoded identity (`membershipRowIdentityMatches`, which compares `row.operationId` with the identity's); the operation id of the identity is therefore the request's | no row returned for one operation id can carry another; `membershipRowIdentityMatches` is measured (7.2 G25, and the shared predicate's own witnesses) |
| `leaderTermApplied`: `Number.isSafeInteger(status?.term)` before `status.term === basis.prior.leaderTerm` | The permit codec admits only a safe-integer leader term (`replica-operation-message-group-membership-permit.js` `decodeMembershipPermit`), so equality with it is the integer check | the equality clause is measured (7.2 G38, V1) |
| `selectOverCaughtUpLearner`: `if (next === null) return INVALID` after `promotionPermit` | The branch selection decodes the next permit before any read and answers INVALID itself (`authorization.js:134-135`) | identical typed outcome, no read either way; the branch selection's own witnesses measure it |
| `exactRecordedVoter`: `permit !== null &&` before `recordedVoterFactIsValid` | The fact predicate is false for a permit that does not decode (its first step) and the conjunction short-circuits before the index is read | measured as the fact predicate's permit clause (7.2 G08) |
| `learnerOriginPrecedes`: `origin === INVALID_COMMITTED_LEARNER_ADMISSION` and `context.stage === STAGE.ADD_LEARNER` | The origin codec: `encodeCommittedLearnerAdmission` admits only an ADD_LEARNER context and `decodeCommittedLearnerAdmission(encode(x))` is never the invalid sentinel (`raft-rs-committed-membership-context.js:186-230`); the module decodes through `decodedLearnerOrigin`, whose catch is measured | 7.2 G73 (a receipt the codec refuses), R3 "a receipt claiming the promotion stage" on the selection side |
| `learnerOriginPrecedes`: `context.peerId === action.peerId` | The context codec binds the peer id to the replica identity on both sides (`encodeCommittedMembershipContext` throws BINDING otherwise; the permit codec does the same for the action's identity), so the replica-identity clause carries it | first lab round (120 mutants, 117 killed): the peer-clause mutant survived 33/33 and the replica-clause mutant survived only while the peer clause masked it; the final code keeps the replica clause, measured (7.2 G77) |
| `recordedVoterPermit`: `permit.permitState === STATE.COMMITTED` | The permit codec admits a proposal index only on a COMMITTED permit (an IN_FLIGHT permit's index is null), and the fact predicate binds the voter stamp's generation to that index (7.2 G17) | first lab round: its mutant ("recordedVoterPermit: the permit is COMMITTED") survived 33/33: an in-flight permit can never be a recorded voter fact |
| `VOTER_RECORDING.readback`: `recordedVoterFactIsValid(row, ...)` and `row.messageGroupMembershipPermit === evidence.committedPermit` | The readback's basis refusal is the exact recorded voter of this input (the fact predicate plus the committed permit at the recorded index), and the committed permit is a function of the input and the stamp's generation, so the stamp equality that remains implies the permit equality | the remaining two clauses are measured by the holder-replacement and disagreeing-evidence interleavings (7.2 G87, G88, G89) |
| `voterOutcomeEvidence`: one try/catch around the codec, the stamp and the configuration comparison | Narrowed to the codec (`decodedLearnerOrigin`); a null stamp or learner configuration is now a measured typed CONFLICT rather than a caught TypeError (7.2 G83, G84) | the narrowed catch is measured (G73) |

## 8. Supersessions (R09), recorded explicitly

- **The queued learner-action read accepts the transition's PROMOTE action.**
  `architecture/contracts/message-group-committed-learner-origin.md`, read
  contract: "accepts group id plus the existing exact managed ADD_LEARNER action
  tuple" gains the narrow PROMOTE exception (a voter fact, never an origin). The
  origin codec stays ADD_LEARNER-only
  (`src/raft/raft-rs-committed-membership-context.js:199-201`).
- **The recorder writes a second receipt.**
  `architecture/contracts/message-group-learner-outcome-recording.md` gains the
  voter stamp section (its three receipt columns).
- **The promotion's absence vouch is a second, premised exception (B2 of the
  review, R09).** `message-group-committed-learner-origin.md` no longer says
  "with the one exception below": its recovery table names two premised
  exceptions and a second supersession paragraph states the PROMOTE vouch (the
  applied configuration still holding the target as a learner,
  `raft-rs-committed-membership-read.js` `answerCommittedPromotionAction`),
  its fence (the same strictly-newer applied term) and its premise (a
  committed promotion makes the target a voter; only the transition's later
  branches, which wait for the recorded outcome, demote or remove it; an
  absent target, a voter without the origin or a joint configuration vouches
  for nothing). `message-group-learner-outcome-recording.md` "Native refusals
  retain their meaning" now reads "a leader that vouches for the absence: for
  the learner action its registry ..., for the promotion its applied
  configuration ...", with the premise. Neither sentence was rewritten away:
  the exceptions were added with their premise, consistent with the
  registered-read contract (`:202-209`) and the promotion contract.
- **The promotion contract's refusal list is complete.** "Anything missing is
  a typed refusal" now also names STALE_OWNER (the holder not local and live)
  and INVALID (a request, capability or permit the codecs or the branch rules
  refuse, a recorded learner configuration that has since moved included).
- **Two explicit workflow entries.**
  `architecture/contracts/message-group-registered-learner-read.md` names them
  beside the learner's explicit entry and states the promotion vouch in its
  ordered-successor section; discovery's text is unchanged (it does not own
  promotion debt).
- **The `originRegistryComplete` observation key** now means "this replica
  vouches that no application of the queried action is in its history"; for
  the learner action unchanged (no reservation of the target), for the
  promotion the target held as a learner. It feeds only the fence; the fence
  predicate is unchanged.
- **The B2 join's acknowledgement moved, unchanged in behaviour,** to
  `src/raft/learner-catch-up-acknowledgement.js` with its vocabulary in
  `src/raft/learner-promotion-progress.js`
  (MESSAGE_GROUP_LEARNER_ACKNOWLEDGEMENT and MESSAGE_GROUP_LEARNER_PROGRESS
  left the join's constants). One fact was added for C2 (the learner's own view
  held, LEARNER_UNOBSERVED) and one state (LEADER_TERM_UNAPPLIED, judged by the
  selection); the join always supplies a held view, so its states are unchanged
  (the B2 witness, 46 entries, stays green).
- **`test/shards/impact-contracts.json`:** the successor-ordering description
  names the promotion attempt; the registered-read description names the
  explicit entries; the join contract owns the shared decision; the new
  contract and pair `message-group-learner-promotion`.
- **Census.** `test/raft/raft-rs-backend/committed-membership-census.test.js`
  declares the two new committed-answer validators with reasons; its two
  inherited reds keep their substance (section 11).

## 9. Key decisions

1. **Exact entry at the predicate's owner, not a fourth guard.** Section 1, the
   O5 decision.
2. **One caught-up decision.** The B2 RUNNING decision and the C2 selection are
   the same predicate; moving it under the progress owner avoids a copy (R01)
   and an import of the join module (and its MessageGroupService closure) into
   the rebalancer.
3. **One recorder.** The learner recorder became a flow by recording spec; the
   voter stamp is a spec, not a second recorder (R01, and no duplicated block).
4. **Positive evidence only** (owner guidance 1). The origin read and the
   applied-term evidence are positive facts; the absence vouch is confined to the
   fence.
5. **Applied term without blocking idle groups.** C1's `currentTermApplied` is
   strict and reads false right after the leader's own configuration change
   applies; the recorded learner action, an entry of the leader's term that the
   leader applied, is the second positive witness (section 2.1, step 5).
6. **No per-attempt promotion origin.** A PROMOTE apply reserves only; adding
   an origin column would change the registry schema and the image format
   (C1 note, section 9). The voter fact is attributed to the row's attempt by
   the successor rule (at most one attempt per transition can commit) and bound
   to the transition by the target's learner origin and its fresh identity.
7. **Explicit entries, not discovery** (owner guidance 3 and 5): no new
   periodic work, and the discovery files stay untouched.
8. **"Removed before promotion refused and the fact recorded"** is read as: the
   selection is refused with the typed REMOVED state and writes nothing, and the
   recorded learner fact stays recorded and valid with its UNKNOWN debt for the
   abandonment owner. A target removed after authorization keeps the debt
   (J1); no removal or abandonment is selected and no successor is issued.
9. **STALE_LIFECYCLE at the new leader.** The native turn checks the permit's
   lifecycle and runtime fences before its term; an old permit names the old
   leader replica's lifecycle, so the new leader refuses it STALE_LIFECYCLE and
   the demoted one STALE_LEADERSHIP. Both are refusals of an unrefreshed permit.
   The order is runtime, then lifecycle, then term
   (`raft-rs-membership-transition-runtime.js:186-198`, `:213-218`): witness 5
   and the review's probe observe STALE_LIFECYCLE because every founder of the
   fixture has the same runtime generation; in production the two replicas may
   differ in runtime generation and the new leader then answers STALE_RUNTIME
   first. Which stale fence speaks is not a claim of this slice; that an
   unrefreshed permit is refused at both leaders and never proposed is.
10. **Every guard of a membership owner is measured (class repair).** Section
   7.1 states the rule; section 7.2 lists every clause of the promotion module
   with its mutation and the declared assertion that kills it; section 7.3
   lists the clauses the table proved redundant and removed, each with the
   authority that carries its meaning. A clause kept only as "defence in
   depth" without a witness is the defect the review named, not a safety
   margin.

## 10. What C2 leaves to C3 and later

Open completion items, explicitly:

- **Production dispatch.** No production root drives the selection, delivers
  the issued promotion (or its successor) to its destination's runtime consumer,
  or calls the explicit recording and successor entries; C2 is inert in
  production, like B1, B2 and C1.
- **Remote join wiring.** The B2 descriptor route, the image transfer between
  nodes and the remote leader observation (B2 note, section 8), and production
  routes for C2's caught-up observation, origin read and target status. A
  production leader observation must not poll remotely at the B2 join's rate
  (B2 note, N7).
- **Discovery ownership of promotion debt**, if wanted, belongs to the discovery
  owner, under the bounded-work rule (no per-tick
  remote work for indefinitely UNKNOWN debt).
- **The target after promotion.** Its join suppression, deferred election and
  participation gate stay as B2 opened it; releasing them, CREATE_ACTIVE and the
  services row publication belong to the handoff slice.
- **Leadership handoff** to the target, then **source removal** and the
  source's **own applied absence**, **quorum absence**, **exact-generation
  cleanup** and **reservation release**, each through its existing owner, and
  the membership obligation's release.
- **J1 operator blocker.** A target removed after promotion authorization keeps
  the debt and the lane; exposing an explicit operator-required blocker is not
  built. The review's F1 is a second case of the same blocker: after an
  unrelated membership change on the group (a voter removed, an unrelated
  learner added) the issued promotion is STALE_CONFIGURATION at its own
  leader, a fencing newer-term leader proves it noncommitted, and C1's
  issuance binds the ordered successor to the fencing observation's
  configuration, which the native turn then proposes and commits; but the
  voter stamp is never recorded, because the committed configuration is not
  the recorded learner configuration with exactly the target promoted
  (CONFLICT forever, phase PROMOTION_IN_FLIGHT, obligation UNKNOWN; recording
  guard witness "V2 (real schedule, F1)"). This is fail-closed and needs an
  operator. Owner decision for the issuance and the J1 blocker: refuse a
  promotion successor whose configuration does not follow the recorded
  learner stamp (as `nextPermitFollowsLearner` does for the first attempt), or
  name the state as the operator-required blocker.
- **Physical proof.** The two serial off-seed replacements and seed-storage loss
  (section 11 reports how far the acceptance witness gets).

## 11. Findings outside C2 (R17)

- **A fenced promotion attempt on an ordinarily FAILED operation gets no
  successor.** C1's issuance refuses any settled operation
  (`src/rebalancer/replica-operation-message-group-learner-successor.js:63-73`,
  the settlement owner named). For a learner that is right (definitive
  non-admission is the settlement owner's); after promotion authorization J1
  asks for forward recovery, which would want the next promotion attempt even
  after ordinary failure. The voter recorder and the promotion runtime
  observation do accept an exactly FAILED row. Owner decision: the settlement
  owner with J1 (operator-required blocker, or successor after failure).
- **Indefinite UNKNOWN learner debt is retried every tick without backoff
  (the review's F2, measured).** Over ten cache-hint sweep ticks a promotion
  row and a recorded learner row cost zero authoritative reads and zero native
  reads; one indefinitely UNKNOWN in-flight learner attempt costs one
  cross-node critical-priority native read plus three authoritative
  `replica_operations` reads per tick (per second), with no backoff and no
  end: rate-bounded by the single-flight tick, the lane and the dispatch
  timeout, but not total-bounded, growing linearly with stuck rows (section
  2.6). C2 adds nothing to it and does not touch it. Routed to the discovery
  owner (owner guidance 3: indefinite debt must stay visible with bounded
  work; a per-row backoff or decay is its decision).
- **`currentTermApplied` is conservative after the leader's own configuration
  change (the review's F3)** (`src/raft/raft-rs-status-observation.js:100-107`:
  applied must pass the pending configuration index, which a leader sets to
  its own last configuration change). C1's fence keeps the strict flag (it
  fails closed); C2's selection adds the recorded learner entry of the
  leader's own term as its second positive witness instead of changing the
  status owner; the review confirmed the second witness sound (the committed
  learner permit's proposal index and leader term are the native entry's
  index and term; only the leader of a term appends entries of it) and
  witness "V1" now measures its term binding on a real isolated newer-term
  leader. Routed to the raft-rs status observation owner, if an exact "applied
  an entry of its own term" fact is wanted.
- **The recorded proposal index rests on the serialization premise**
  (section 6). A per-attempt promotion origin would need a registry column and
  an image format change. Owner: the native committed-membership read and the
  peer-identity registry.
- **The partition consumer of the raw predicate still grants 0/0 on a commit
  index of 0 (the review's F4)** (`src/partition/partition-service-learner-promotion-proof-methods.js:96-112`
  passes the raw commit and an unobserved match as 0, so a leader whose status
  reports commit 0 or omits it grants `progress_proven` at 0/0 and issues no
  replication nudge). Latent: under raft-rs a leader with a configured learner
  always has a commit at or past the learner's add entry, and the review found
  no live state that reaches it. C2 did not change it: its replication nudge
  keys on PROGRESS_BEHIND. Routed to the partition promotion proof owner with
  the promotion-progress owner (the exact entry is now available).
- **Inherited reds, unchanged in substance.** `committed-membership-census` tests 1
  and 4 (test 4's listing gains the two declared C2 validators on both sides;
  the missing entry is still only the recorder's
  `replica-operation-message-group-membership-authorization.js`) and
  `evidence-o1-static` (two enumerations, failure lines identical to base). The
  seed-loss acceptance witness
  (`test/integration/message-group-fresh-identity-replacement.integration.test.js`)
  fails at its first assertion after setup, "two serial production REPLACEs
  must leave real voter state on distinct off-seed storage before seed loss"
  (line 114), identically on `b5e62dd0d` sources: no production dispatch
  drives a REPLACE. Ratchets already red on `b5e62dd0d` and not worsened:
  complexity 1760 at base and 1759 here against 1755 (C2 removes
  `recordMessageGroupLearnerOutcome`, complexity 13, from the list; no new
  entry); unused exports 1421 at base and here against 1416 (C2 de-exported
  the two exports it left without a consumer); test duplication 698 groups and
  26410 lines at base and here against 697 and 26369; the literal (264, in
  `scripts/quest-evidence/` and the owner claim), decision-boundary (1) and
  silent-catch (3) guideline hits are identical at base.
- **Unbaselined guideline hits left alone.**
  `src/raft/raft-rs-membership-transition-runtime.js` (a comment-only catch)
  and `src/rebalancer/replica-operation-message-group-membership-owner-claim.js`
  (a literal, two silent catches) fail their checkers at base; C2 does not
  touch either file (the native turn needed no change).
- **Timing under shared IO pressure.** The witness runs 4.5 to 7.8 s through the
  classified runner. `message-group-membership-claim-cache` (3 entries) times out in its
  cluster bootstrap under this machine's shared load (another worktree's suites
  ran concurrently): in alternating runs its bootstrap phase took 26.0 s and
  51.4 s on this tree and 55.4 s and 54.5 s on `b5e62dd0d` sources, against a
  30 s budget; it passed 3/3 on the tree once and failed twice at base. C2 does
  not touch the bootstrap path. Owner: the claim-cache witness budget, if the
  shared-host variance matters.
- **C1's liveness bound does not apply to promotion.** C1's N1 (a target
  reserved on every replica can never be fenced) concerns the learner action's
  registry vouch; the promotion's vouch is the applied configuration, which a
  refused proposal does not change.


## 2026-10-11 takeover review and correction

Independent review `subagent:/root/review_freshmg_c2` rejected the captured C2
bytes at `f4eaf37b006772454d6d9aca040be3b4f5f4d799` plus the 33-path draft.
B1 reproduced five schedules in which the branch owner submitted durable
promotion authorization after invocation, lease or canonical boot invalidation.
The operation selector now carries its invocation to the existing branch owner;
every submission/retry checks canonical boot and synchronously rechecks its
invocation/live claim after the asynchronous admission read. Exact row CAS,
uncertain admitted-write semantics and retained membership debt remain intact.
The idempotent selector also rechecks its invocation after reading the row.

The selection-guard witness now exercises six late invalidation schedules,
already-admitted write completion with UNKNOWN followed by exact recovery, and
idempotent-read expiry. Red controls on the inherited source: 8/14 (all six new
submission schedules red); after initial correction: 15/16 (idempotent-read
expiry red). Final current-byte proof and independent re-review are pending.

B2 corrects the inherited mutation claim: I-R2 is a missing-method TypeError,
not a behavioral kill. Its raw artifact is preserved and excluded from the
semantic count. The other 119 entries lack that invalid mechanism; this is not
new certification of them on corrected bytes. An API-preserving mutation that
routes voter recovery through learner recovery must fail the named voter
receipt assertion before replacing I-R2's semantic proof.

The separately reviewed F1/J1 configuration-drift successor conflict, absent
production C3 trigger, physical two-replacement proof and all sealed receipts
remain open. C2 component results certify none of those obligations.

### Current correction verification

Independent round 2 (`subagent:/root/review_freshmg_c2`) **APPROVE C2 only**:
baseline 162/162, final declared selection witness 22/22, ten mutations killed
by behavior assertions with all source restored. The API-preserving I-R2
voter-to-learner routing mutation failed the exact voter receipt assertion;
the historical missing-method control remains excluded. B1 and B2 are closed.
The final source manifest hash is
`10f1bfa101135b25440fd359b1cc443d638c69623d48a12ccf09f035656ce559`;
the category-complete report hash is
`182e842b014080a5186f2b2c490402024ea2d33c1fd55e79ee195908e7e360d3`.
The Quest log retains its canonical evidence location. The separate F1/J1
configuration conflict and all production/whole-Quest obligations remain open.
