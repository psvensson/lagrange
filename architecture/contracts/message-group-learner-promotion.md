---
audience: development
documentClass: current
---

# Promotion of the joined learner to voter

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "message-group-learner-promotion",
  "status": "active",
  "owners": [
    {
      "owner": "replica_operation_repository_owner",
      "boundary": "learner_promotion"
    }
  ],
  "failureClasses": [
    "promoting a learner before committed origin and caught-up progress are proven can stall or split message-group quorum",
    "allowing abandonment after promotion authorization violates the J1 forward-recovery boundary",
    "stale promotion permits can propose ADD_NODE against a moved configuration or leadership term"
  ],
  "stateVariables": [
    "recordedLearnerFact",
    "leaderCaughtUpProof",
    "promotionPermit",
    "voterStamp",
    "obligationState"
  ],
  "safetyInvariants": [
    {
      "id": "learner-promotion-requires-recorded-origin-and-caught-up-proof",
      "statement": "Promotion authorization requires a recorded learner fact, exact committed origin at the routed leader, caught-up match/commit progress in the applied leader term, and a full-row CAS."
    }
  ],
  "livenessExpectations": [
    {
      "id": "learner-promotion-fenced-successor-recovery",
      "statement": "When an issued promotion attempt is fenced by a newer applied leader term whose configuration still holds the target as a learner, the repository issues an ordered successor promotion attempt."
    }
  ],
  "knownResiduals": [
    "Promotion recording establishes the voter stamp; source removal and cleanup remain governed by their subsequent transition phases."
  ],
  "runtimeBindings": [
    {
      "path": "src/rebalancer/replica-operation-repository.js",
      "owner": "replica_operation_repository_owner",
      "boundary": "learner_promotion",
      "transition": "selects promotion branch, issues fenced promotion permits, and records committed voter stamps"
    },
    {
      "path": "src/raft/raft-rs-committed-membership-read.js",
      "owner": "raft_rs_committed_membership_owner",
      "boundary": "learner_promotion",
      "transition": "answers committed PROMOTE outcomes and configuration-based noncommitment vouches"
    }
  ],
  "modelBindings": [
    {
      "kind": "property-test",
      "artifact": "test/integration/message-group-learner-promotion.integration.test.js",
      "properties": "verifies J1 promotion selection, native ADD_NODE execution, voter stamp recording, and ordered successor issuance"
    }
  ],
  "metrics": [
    {
      "name": "message-group learner promotion integration suite",
      "probe": "npm run test:file -- test/integration/message-group-learner-promotion.integration.test.js"
    }
  ],
  "questRefs": [
    "solve/quests/message-group-fresh-identity-membership/quest.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "promotion authorized without caught-up learner or before leader term is applied",
        "severity": "high - promotes an behind learner into voter quorum",
        "detectability": "high - selection guard tests verify NOT_CAUGHT_UP and ORIGIN_UNRECORDED refusals",
        "mitigation": "require positive committed origin and exact caught-up acknowledgement at the current applied leader before CAS",
        "probe": "npm run test:file -- test/integration/message-group-learner-promotion-selection-guards.integration.test.js"
      }
    ],
    "stpa": [
      {
        "controller": "replica_operation_repository_owner",
        "unsafeAction": "authorizes promotion without positive caught-up evidence or selects abandonment after promotion authorization",
        "feedbackSignal": "recorded learner stamp, leader learner-action read, and promotion-progress caught-up decision",
        "ownerBoundary": "replica_operation_repository_owner / learner_promotion"
      }
    ]
  }
}
-->

Existing Quest: `message-group-fresh-identity-membership` (runbook 6.C, slice C2).
Design record: [quest definition (`message-group-fresh-identity-membership`)](../../solve/quests/message-group-fresh-identity-membership/quest.json).
This is a bounded owner interaction, not independent approval, production
wiring or physical acceptance. Registered as the impact contract and coupled
pair `message-group-learner-promotion`.

## Selection consumes positive evidence only: the J1 boundary

Trigger: the membership holder asks the repository to promote the transition's
recorded learner at a routed group leader. Every fact is read by the repository
at that moment, and each is positive evidence:

- the authoritative row carries the recorded learner fact (its one shared
  predicate) with the UNKNOWN membership obligation of a lane holder that owes
  no unresolved attempt: an issued learner attempt whose outcome is not recorded
  holds the group's lane, and neither expiring that debt nor choosing another
  target (the lane index refuses a second operation) is a way around it;
- the routed leader's queued learner-action read answers COMMITTED with exactly
  the recorded learner's committed origin (its reservation with that origin);
- the leader's caught-up acknowledgement, judged by the shared exact decision
  of the promotion-progress owner: committed answer and status of one leader in
  one term naming the exact learner, the learner's own committed view holding
  itself, commit and match exact non-negative integers with match >= commit > 0,
  equal configuration generations (the predicate's exact entry; the raw
  predicate reads an absent index as 0 and is never consulted on missing values);
- that leader's own term applied: its native observation says so, or the
  recorded learner action is itself an entry of its current term it applied.

C1's registry-absence vouch is not among them: it only proves a fenced attempt
noncommitted and is never a promotion prerequisite.

Anything missing is a typed refusal that writes nothing: ORIGIN_UNRECORDED,
NOT_CAUGHT_UP with the acknowledgement state (behind, removed, leader
unavailable, learner unobserved, leader term unapplied) and proof reason,
UNAVAILABLE, CONFLICT (no recorded fact, a proof from another replica),
STALE_OWNER (the holder is not local and live) or INVALID (a request,
capability or permit the codecs or the branch rules refuse, a recorded learner
configuration that has since moved included).
Otherwise the promotion permit is the next permit sequence of the transition,
bound to that leader's term, committed configuration, lifecycle and runtime
fences, the routed node's canonical boot and the live holder's fences, and the
landed branch selection applies the one row CAS (fact predicate, settlement,
exact prior permit, obligation, holder, boot). RECORDED is the durable promotion
authorization: from here J1 forward recovery holds, and the abandonment branch
is no longer selectable. A repeated selection over a row that already carries
the promotion answers RECORDED and writes nothing. RECORDED is not a proposal,
a voter, CREATE_ACTIVE or a lane release.

## Native proposal

The runtime consumer at the destination (raft-rs group membership admission)
proposes only the row's exact in-flight promotion: the repository's recipient
observation checks the permit, phase, holder, settlement and both canonical
boots; the target's own status reaches the turn through a host capability; the
native turn alone then requires leadership at the permit's term, its exact
configuration, lifecycle and runtime, the target still a learner whose own
observation matches the permit, and the leader's own exact caught-up progress,
and proposes ADD_NODE in the same synchronous turn. The permit is never
refreshed: a stale one is refused (STALE_LEADERSHIP, STALE_LIFECYCLE,
STALE_CONFIGURATION, PROMOTION_PROGRESS_BEHIND) and a redelivery after commit or
while pending reaches no core.

## Recording the voter stamp

The queued learner-action read also answers the transition's PROMOTE action.
Its committed outcome is the replica's applied configuration naming the target
a voter while the replica's registry holds the target's learner origin of the
same transition (a promotion retains no origin of its own). The one recorder
records it with its own three receipt columns: the phase (voter committed),
the permit (committed, at the configuration change that made the target a
voter) and the voter stamp, the witness's same-read committed configuration,
which must be the recorded learner configuration with exactly the target
promoted. Ordinary history, the learner stamp, the holder, the lane and the
UNKNOWN obligation are untouched. A lost answer is resolved by exact readback;
a recorded voter fact is replayed without a native read and never rewritten.

## Absence and the ordered successor

A NOT_RECORDED promotion answer carries the same queued observation as the
learner action. A replica that holds the target as a learner vouches that no
promotion of it is in its applied history; an absent target, a voter without
the transition's origin or a joint configuration vouch for nothing. With that
vouch, the slice C1 fence (a leader of a strictly newer term that applied an
entry of it) is noncommitment, and the same issuance owner issues the next
promotion attempt; otherwise the debt stays UNKNOWN.

## Triggers: explicit entries, no periodic work

The workflow owner's explicit entries, an operation ID and an explicitly
selected witness in the retained lane, record the voter stamp
(`recoverMessageGroupVoterOutcomeFromRecipient`) and issue the ordered successor
(`issueMessageGroupSuccessorFromRecipient`). Discovery does not own promotion
debt: its hint filter, the replicated-row wakes and the 1 s periodic sweep pass
over it, so promotion adds no per-tick work; the restart scan's authoritative
census still finds it and reports it retained (PHASE_NOT_OWNED). Unresolved
promotion debt stays UNKNOWN and visible until its explicit caller acts.

## Scope of this contract slice

This contract defines the learner-promotion selection, native `ADD_NODE`
proposal, voter-stamp recording, and ordered-successor boundary slice (`6.C`
slice `C2`). The downstream `FreshMG` slices (`6.A`-`6.D`: production dispatch,
remote join and state-transfer wiring, caught-up and target-status routes,
leadership handoff, source removal, quorum absence, exact-generation cleanup,
reservation release, `CREATE_ACTIVE`, and `services` row updates) are owned by
their respective boundary slices and wired in production (`0.2.6`).

## Failure Classes

Premature promotion of an uncaught-up learner, stale permit proposal after term
or configuration change, or post-J1 abandonment can violate quorum safety.

## Invariants

Promotion selection requires positive committed learner origin and caught-up
leader progress, locks in J1 forward recovery, and proposes ADD_NODE only under
exact permit fences.

## Runtime Bindings

`replica-operation-repository.js` and `raft-rs-committed-membership-read.js`
own promotion selection, voter stamp recording, and fenced successor issuance.

## Model Bindings

Integration suites `message-group-learner-promotion.integration.test.js` and
its selection and recording guard companions verify the J1 boundary and
successor ordering.

## Operational Analysis

FMEA and STPA enforce positive caught-up and committed-origin evidence before
issuing a promotion permit and prevent stale permits from mutating membership.
