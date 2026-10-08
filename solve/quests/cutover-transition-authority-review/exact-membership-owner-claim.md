# Membership owner claim - response to 4217392058

Status: proposed bounded completion of the C0 owner contract. No new runtime
permission or independent approval. This document supersedes the use of the
ordinary structural owner/lease as a membership successor fence in
exact-promotion-authorization-contract.md. Its branch CAS and J1 decision
otherwise remain unchanged. The existing expiry-only orphan sweep is NOT a
single-winner membership takeover protocol and must not be used as one.

## One fact in the existing operation row

ReplicaOperationRepository owns a nullable JSON field
`message_group_membership_owner_claim` in replica_operations, registered by
the existing membership schema constants and upgrade loop. It carries exactly:
version, operationId, transitionIdentity, ownerNodeId, ownerBootIncarnation,
generation, expiresAt. All identity strings are nonempty; boot, generation and
expiry are positive safe integers. The generation cannot wrap or decrease.
This is the holder/fence of the existing membership obligation, not another
ledger, queue, coordinator, or general operation lease. It remains with the
same row/lane until the membership obligation resolves, including after
ordinary terminal settlement. Generic updates cannot overwrite this field.

The action permit and holder claim express DIFFERENT facts. The permit records
which irreversible action was authorized under which identity/context. The
claim names who may next advance that operation. Taking over a claim NEVER
erases, cancels, rewrites, or fabricates a pending action permit. The immutable
O/group/S/T/source-generation tuple remains in the existing membership fields.

## Initial claim

The current admitted operation's structural owner may initialize a null claim
only before membership authorization: exact nonterminal REPLACE, lane, full
identity, source lifecycle claim, intent_recorded/learner_requested state,
null permit and no committed membership stamps. The repository uses its own
node identity, bound boot incarnation and clock, and reads the canonical nodes
boot row through the authoritative gateway. It does not trust a requested
claimant node, boot, expiry or generation from the command payload.

One conditional UPDATE changes only null owner_claim to the first encoded
claim. Its predicate includes the exact O/group/S/T/source claim, lane,
ordinary nonterminal status/step/completed_at, and exact pre-admission state.
The same existing repository/gateway SQL commit is the linearization point.
A winner observation must match the exact requested encoded claim. A null
claim on an operation that already has a permit/stamp is inconsistent, not
permission to adopt historical work. Such state fails closed for explicit
reconciliation; no invented owner is recovered from an expiry alone.

## Renewal and successor takeover

Renewal and takeover use the same existing repository operation and field.
Read the full row authoritatively. Require exact immutable identity, retained
membership lane/debt, valid old claim and current claimant boot evidence.

- Renewal requires the still-live old claim's owner and boot to equal the
  executing repository binding.
- Takeover requires the old claim to be expired at the repository's observation
  time. A current eligible operation-owner instance on another live node may
  compete; structural source ownership is NOT required for a successor.
- Both set generation=old+1 and expiry=repository-now+the existing membership
  ownership window. Reject non-increasing or overflowing values. The action
  phase, permit, stamps, terminal state and cleanup debt are not rewritten.

The UPDATE predicate contains the EXACT old encoded claim, immutable identity,
lane, phase, obligation, permit, source claim and membership stamps. Null is
compared as null, not a wildcard. If a phase or action changes between read and
write, renewal/takeover loses and rereads. Competing successors with the same
expiry still have different node/boot identities; only one exact prior-claim
CAS can win. Re-reading another winner does not grant ownership to the loser.
Generic orphan-sweep lease touches cannot match or alter this claim.

The canonical nodes row is checked before and after the claim commit by the
existing authoritative gateway. These are separate replicated reads, not a
fictional atomic cross-table/cross-group transaction. A changed or unreadable
boot after the CAS returns no actionable claim. A later runtime/CREATE action
must also validate current source/destination boot and exact claim identity;
a retained claim record alone is not permission for a stale process to act.

## Binding branch selection and previously issued commands

The promotion/abort selection CAS must match the exact CURRENT owner claim,
not `lease_expires_at` or a source/target-derived owner. The executing node/boot
must own that claim and its lease must be live when the request is considered.
It also matches the existing exact learner-committed phase, permit and stamp.
The one selected branch is monotonic under J1. A successor keeps pending action
permits, proposal anchors and original authorizing context intact and resolves
those exact effects before issuing a next-stage permit under its new claim.

A lost old owner's already-authorized action may still arrive. Claim takeover
is NOT cancellation of that authorization. The same durable operation/branch,
permanent peer identity and native term/configuration/lifecycle fence constrain
its result. A successor cannot choose the opposite branch while an old action
can still commit. Its pending-outcome reconciliation is an existing membership
runtime interaction, not inferred from lease expiration or current absence.
The request wrapper carries current execution-claim context separately from
the immutable action context. Never repurpose the effect subject as claimant.

## Lost result, restart and refusal

| Observation after uncertain claim CAS | Meaning and next owner action |
| --- | --- |
| Exact requested claim, still current boot | Candidate owns that recorded claim; revalidate live claim and immutable action before any progression |
| A different valid claim | This candidate lost; adopt observations only, never permission; current winner retains work |
| Exact old claim | Outcome is unresolved; repeat the same exact CAS or let a competing exact CAS settle it; an old read does not cancel delayed SQL |
| Unavailable or inconsistent row/boot | No grant; preserve lane and action, schedule authoritative reread through the existing owner |
| Ordinary terminal row with unresolved membership obligation | Claim takeover remains possible on expired exact claim; only membership recovery, never new ordinary CREATE/admission |
| Released lane/resolved obligation | No claimant may revive it; late requests remain fenced by exact operation/action context |

Expiry permits competition; CAS identity provides single-winner authority.
Clock skew may cause an earlier competing attempt but cannot make two prior-
claim updates win. No claim proves that an external effect executed once.
Reconstruction reads the committed claim and immutable action from the same
operation row; process-local maps and old scheduling ownership do not survive
as grants.

## Required tests and increment boundary

Prove two competing successor nodes (including equal expiry), same-node new
boot, live remote-claim refusal, exact old-claim mismatch, lost answer before/
after commit, delayed losing SQL, generation overflow, terminal debt retention,
phase mutation racing takeover, and old claimant branch CAS losing after a
successor claim commit. Boot unreadability/change and released lane must
produce zero authorized effects.

The first source increment may establish and test these row operations without
activating planner, handler, transport or physical effects. It is not complete
FreshMG. The driver must obtain actual prior learner authority and the existing
CREATE/worker claim; only then can those parks be lifted. Independent review
of the code, original eight FreshMG receipts, lost-action reconciliation and
physical off-seed proof remain required. No current C0 receipt is promoted by
writing this contract.
