# Permanent voter loss during plain CREATE

Source base d6a96b34b. This is an implementation contract in progress. The
physical acceptance case remains pgwire-schema-owner-loss.integration.test.js.

## Observed boundary

In 8b the placement leader and follower had applied index 552. Neither
contained a REPLACE or REMOVE for the three affected metadata partitions.
The successor could claim the same job, but partitions-p1 needed release in
a new term. Its control INSPECT addressed the lost member. In 844 the same
interaction blocked schema_operations before a grant. 0007 establishes the
successful independent schedule, including surviving public INSERT/SELECT.
43afb's native known-empty control shows the cyclic fresh-admission refusal.

## Scope of authorization

The affected group's previous committed voting configuration must authorize
the change in its log. A missing INSPECT, process exit, lease expiry,
placement refusal, or leader-local read can wake the owner but supplies no
permission to change membership. Existing REPLACE STOPPING intent continues
through its existing owner. A completed membership transition or explicit
retiring lifecycle record is reconciled first. Avoid two simultaneous owners
for the same placement effect.

A recovery decision must name the group, old configuration key and membership
generation, source peer, replica identity and creation generation, source node
and boot incarnation, and replacement target identity and generation. The
decision needs a stable identity across elections. A committed nodes loss
row is an eligibility input. It cannot prove that a previously admitted Raft
identity belonged to that boot, or exclude a concurrent return of the source.
The existing partition membership context records peer, replica and node.
The existing voter retirement receiver checks the old host's ownerIncarnation.
A new surviving owner must obtain a durable binding and enforce a logical
generation fence at rejoin and ingress before it can exercise such authority.
Unavailable or contradictory binding leaves the operation pending.

## Ordering and recovery

1. Stage only a membership intent. Validate the old configuration and
   generation at the log entry, bound to the same group. An observation at
   enqueue or leader selection is insufficient. A replay returns the exact
   committed intent; a different payload for that identity is a conflict.
   Nothing in this step authorizes ordinary SQL or application publication.
2. Admit the exact replacement as a learner, obtain its applied catch-up
   proof and use the existing promotion and leadership-handoff owner. Preserve
   the RF target and ordinary replacement ordering. Refuse a new transition
   during pending or joint configuration. An incumbent transition must finish
   using its own recorded identity, including an outgoing voter.
3. Reconstruct on unknown acknowledgement, crash or leadership change from
   committed configuration, membership generation and operation record.
   Only committed exclusion of the old birth discharges removal; retain
   lifecycle cleanup separately. Fence a returning old process before it can
   serve, stage, rejoin or recreate its membership.
4. Preserve prepared rows, decision identities, pending outcomes, lock and CDC
   obligations while membership changes. Retain a committed log catch-up path
   when checkpoint creation refuses pending PREPARED work. A prior decision
   may be replayed through the transaction owner while ordinary admission is
   closed. Reopen only after the existing current-cohort/control census and
   matching replicated origin are established.

## Required discriminators

* Native RF3 loss: real old-quorum entry, two surviving voters, named source
  and target; committed removal and current-cohort release. The existing
  known-empty case must continue to reject fresh placement *as authority*.
* One voter out of three, noncurrent boot/birth, absent binding, joint or
  pending configuration, or target below the required applied boundary:
  no new authorized effect. A delayed write from the retired source cannot
  cross the fence even after restart.
* PREPARED before loss: both survivors retain the same prepare index and
  digest. A missing decision cannot synthesize a rollback. An incompatible
  decision is refused. Replay of the immutable coordinator decision after a
  lost reply preserves the decision index and applies user data exactly once.
* Original public SIGKILL case: same job/table, original unexpired lease
  exclusion, higher successor fence, RF3 and fresh public INSERT/SELECT.
  Passing the native custody or refusal case cannot certify this condition.

## Prior owners

* raft-rs-full-cutover / replace-source-removal-owner, R-1f and D2
* participant-release-current-control-replay under operation-integrity-and-reliable-formation
* raft-snapshot-atomic-install under raft-snapshot-transfer-install
* priority-surplus-remove-authoritative-placement-fence and the scoped
  voter/learner REMOVE receiver in replica-handler-learner-retirement-authority.js
