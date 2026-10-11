---
audience: development
documentClass: current
---

# Promotion of the joined learner to voter

Existing Quest: `message-group-fresh-identity-membership` (runbook 6.C, slice C2).
Design record: [design note C2](../../solve/quests/message-group-fresh-identity-membership/design-promotion-c2-2026-10-11.md).
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
Its committed outcome is the immutable versioned promotion fact that native
apply wrote beside the unchanged learner origin in the permanent reservation,
atomically with ConfState and the applied boundary. The fact binds the exact
entry index and term, managed action, original ADD bytes, before key and
generation, and ordinary target-only after configuration at that exact
generation. The queued answer also carries current membership as a separate
witness. The one recorder
records it with its own three receipt columns: the phase (voter committed),
the permit (committed, at the configuration change that made the target a
voter) and the voter stamp, which is that canonical promotion fact. Recording
requires the current permit and its exact before configuration, target-only
delta and original-origin binding. Later unrelated membership drift, restart,
or an ABA return to the same configuration key cannot relabel its index.
Ordinary history, the learner stamp, the holder, the lane and the
UNKNOWN obligation are untouched. A lost answer is resolved by exact readback;
a recorded voter fact is replayed without a native read and never rewritten.

## Absence and the ordered successor

A NOT_RECORDED promotion answer carries the same queued observation as the
learner action. Only absence of the retained promotion fact plus a current
configuration holding the target as a learner vouches that no
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

An exact ordinary FAILED row may finish an already authorized PROMOTE only:
status FAILED, workflow step FAILED, positive completed time, UNKNOWN debt,
the same live holder and exact permit. A strictly newer-term NONCOMMITTED fence
may issue its ordered successor. This cannot issue the initial promotion,
resurrect status, select abandonment or change ordinary failure history.

## Not in this contract

Production dispatch (a driver that selects, delivers the permit to its
destination's runtime consumer and calls the explicit entries), remote join
wiring (the B2 descriptor, image transfer and leader observation routes) and a
production route for the caught-up observation and the target status;
leadership handoff, source removal and the source's own applied absence, quorum
absence, exact-generation cleanup, reservation release, CREATE_ACTIVE and the
services row; the physical two-replacement seed-loss proof.
