# FreshMG implementation frontier - 2026-10-08

Inherited exact runtime: 82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af.
Measured checkout: 16bc20e7d1f2d71490d915144215e773ca610a56.
Actions/GCP run: 37754790964. Raw output and canonical evidence reference are
retained in evidence/frontier-37754790964.json and the append-only Quest log.
No runtime change, production unpark or acceptance claim in this first step.

## Measured first failures and preserved positives

- Planner closing condition fails at
  test/rebalancer/message-group-membership-change-parked.test.js:141: the real
  planner still returns message_group_membership_change_unsupported. Its
  three temporary-park/partition-control cases pass.
- Handler closing condition fails at
  test/node/message-group-service-handler-membership.test.js:126: the real
  handler returns ERROR rather than INITIATED. No physical CREATE is enabled.
- Existing unique membership-lane tests pass (8 reported assertions).
- Real fresh-learner promotion components pass (7 reported assertions).
- Real fresh-learner snapshot component passes (1 reported assertion).
- Semantic membership port tests pass (15 reported assertions).

Four files pass and two fail; the outer Action stays failed. A green component
is not the missing authorization chain. No repeated unchanged distributed run
is needed to rediscover these two exact blockers.

## Critical harness limitation before removing the handler park

The current positive handler fixture's makeHandler supplies empty authoritative
rows and unconditional mock mutation success. Its payload carries literal
admission and attempt tokens. Although its founding Raft cluster really commits
a learner, it does NOT create a canonical admitted operation row or prove the
handler obtained a real ReplicaCreateAdmissionOwner CAS/physical-worker claim.
Those copied request fields must not become permission merely to pass line126.

The implementation's positive control must use the existing actual operation
repository and CREATE owner/boot binding. Its physical callback must assert the
real committed admission and exact worker claim before recording an effect.
The same copied command without those authorities is a required negative.
Retain the original red witness as history, but strengthen the positive's
preconditions before using it as a source-repair acceptance test. This is not
permission to weaken committed-learner or zero-physical-work constraints.

Similarly, the planner file currently uses the same shape for a temporary
park control and the future closing condition. The supported owner-authorized
path and unsupported/unavailable-authority path must be distinguished by real
owner composition/evidence, never a caller-controlled test-only enable flag.
Do not just delete the park assertions and accept arbitrary cache-driven ADD.

## Next bounded source interaction

The operator-approved J1 decision is in the C0 packet. Its concrete durable
boundary is specified in exact-promotion-authorization-contract.md on the
classification branch. Independent review has not yet approved that revised
packet; no approval is inferred from the user's policy selection.

The first product interaction remains within ReplicaOperationRepository /
OperationWorkflowOwner and the existing raft-rs semantic port:

1. Preserve the immutable O/group/S/T tuple and per-group lane; admit fresh T
   using the permanent identity owner, not a reused max-rN address hint.
2. Repair the retained permit foundation with explicit subject binding and
   durable phase/permit CAS. Record authorization BEFORE ADD/PROMOTE/REMOVE;
   mutually exclusive pre-promotion abort versus forward recovery; lost-result
   recovery reads exact durable authority rather than guessing absence.
3. Pass the committed-learner join authority into the existing CREATE owner;
   physical work only follows the real generation/worker claim. The handler
   must not publish an admitted learner as an ACTIVE voter before the sealed
   promotion/committed-voter proof.
4. Only then make the planner's supported REPLACE path reach that complete
   chain. The unsupported, stale, copied, concurrent and unavailable-authority
   paths stay refused/parked with their existing owners.

This is one existing Quest, not a new generic workflow. The eight sealed
receipts, source verification, restart/lost-answer proof and final two-serial-
replacement distinct-off-seed acceptance remain required. Intact partition
application snapshot catch-up is a separate named cutover interaction, not
solved by forging a CREATE grant for its existing installer.
