# Exact membership owner claim

Status: C0 contract response to 4217392058 and 4217554373, awaiting independent
acceptance. This defines the proposed repository interaction, not permission
to activate an incomplete runtime path. Ordinary structural ownership and the
expiry-only orphan sweep are not membership successor authority.

## Durable fact and existing owner

ReplicaOperationRepository owns nullable JSON
`message_group_membership_owner_claim` in the existing replica_operations row.
The existing membership schema/upgrade loop registers it. Exact fields are:
version, operationId, transitionIdentity, ownerNodeId, ownerBootIncarnation,
generation, expiresAt. Version is 1; boot/generation/expiry are positive safe
integers; identity strings are nonempty. Generation must increase without
wrapping. This is the holder of the existing membership obligation, not a new
ledger, queue, coordinator or generic operation lease.

The immutable operation O/group/source S/target T/source lifecycle tuple stays
in its existing fields. The action permit records an irreversible authorization;
the holder claim records who may next advance it. Renewal/takeover changes the
holder only. It never erases, cancels or rewrites a pending action permit.
Generic operation updates preserve both fields, including terminal settlement.

## Initial null claim, including loss of the structural owner

A null claim may be initialized only from an exact nonterminal REPLACE with
retained group lane, full immutable identity and source lifecycle claim,
learner_requested/intent_recorded phase, null permit and all membership stamps
null. The repository uses its own bound node/boot and timeSource, and checks
its canonical nodes boot row through the existing authoritative gateway.
It does not accept a claimant node, clock, generation or expiry from a payload.

Two cases may compete for that initial claim:

1. The canonical structural operation owner may initialize it while the
   ordinary operation lease is live.
2. If that owner disappears before claiming, another current eligible owner
   instance may initialize it when the existing owner-lease policy reports
   ADOPT_AS_FENCED_SUCCESSOR (expired or absent ordinary lease).

Neither case obtains authority from that eligibility check. ONE conditional
UPDATE from exact NULL claim to the repository-generated generation-1 claim
is the linearization point. Its WHERE matches the full identity/source claim,
lane, phase/obligation, null permit/stamps, exact nonterminal status/step and
completed_at, plus the observed ordinary lease (including IS NULL, not a
wildcard). If the original owner claims first, or an ordinary renewal changes
that lease before this UPDATE, the orphan attempt loses. Two successors with
the same deadline still have distinct node/boot claims and cannot both win.
The late structural owner cannot overwrite a winning successor's claim.

The membership recovery entry must attempt this claim BEFORE any generic
fail-soft orphan lease touch; such a touch is not a claimant grant and must
not manufacture a fresh structural-owner lease that blocks its own recovery.
After a membership claim exists, ordinary lease touches are irrelevant to
membership ownership. This ordering remains a required driver-integration
witness; the row-only increment does not implement that driver.

Null claim with an existing permit/stamp is inconsistent, not initial work.
It fails closed for explicit reconciliation. A terminal row with a null claim
cannot issue new admission: terminal-first non-admission settlement belongs
to its existing membership owner and must be proved separately.

## Renewal and successor takeover after a claim exists

Read the complete row authoritatively. Require exact immutable identity,
retained unresolved membership lane/debt, valid old claim and current claimant
boot. Renewal requires that the old live claim belongs to this node and boot.
Takeover permits another current eligible owner only after old claim expiry.
The new claim uses generation=old+1 and now+the existing ownership window;
reject overflow, non-increasing generation or non-increasing expiry.

The UPDATE matches the exact old encoded claim and exact identity, lane,
phase, obligation, permit, all membership stamps, source lifecycle claim and
ordinary status/step/completed_at observed. It changes only the claim. A phase
change or competing holder wins by making the stale predicate false. Existing
pending actions, terminal status, cleanup and reservation obligations survive.
Terminal membership debt may be claimed; resolved/released work may not revive.

Canonical claimant boot is checked before and after the commit. These are
separate authoritative reads, not an atomic cross-group transaction. Changed
or unreadable boot means no actionable result. Every later runtime/CREATE
request must also validate its current boots, exact claim and action context.
No claim/read-back alone guarantees that a process is still current when a
subsequent external effect executes.

## Promotion, abort and already issued actions

The promotion/abort selection CAS matches the exact CURRENT membership claim,
owned by the executing node/boot and live at consideration time. It does NOT
require a structural source owner or the ordinary lease_expires_at. It also
matches the exact committed learner basis/permit/stamp described in
[the branch contract](exact-promotion-authorization-contract.md).

Promotion and pre-promotion target-abandonment compete on the same prior row.
J1 makes promotion authorization and its successors a one-way forward branch.
A new holder preserves old permits/anchors and resolves their exact effects
before issuing the next stage. Holder expiry/takeover is not cancellation:
an already-authorized old request may still arrive. Native configuration,
term, lifecycle and permanent-peer fences, plus the durable branch, constrain
its result. A successor cannot choose the opposite branch while it can commit.
Current execution-claim context stays separate from original action context.

## Unknown result and reconstruction

| Authoritative observation | Owner response |
| --- | --- |
| Exact requested claim and current boot | Recognize the recorded holder; revalidate live claim/action before progression |
| Another valid claim | Losing candidate may observe but not act as winner |
| Exact old claim or NULL | Unresolved write; retry the same conditional basis or let competition settle it; a read is not cancellation |
| Unavailable/inconsistent row or boot | No grant; retain lane/action and schedule the existing owner's reread |
| Terminal row with unresolved claimed membership work | Expired-holder competition may resume membership work only |
| Released lane or resolved obligation | No claimant or old request may resurrect admission |

Expiry only permits competition; exact committed CAS identifies the winner.
Clock skew cannot make two updates against the same old claim both win, but
no lease argument establishes exactly-once external effects. Restart derives
holder and action from this row, not a process-local queue or projection.

## Proof scope

Required tests include equal-deadline successors, same-node new boot, live
remote claim, generation overflow, stale prior claim, delayed losing SQL,
phase change racing takeover, lost answers and terminal debt. Initial-null
controls include owner loss before claiming, successor/structural competition,
and an ordinary lease renewal defeating an already-read orphan attempt.

The first source increment may test these repository operations in isolation.
It must keep planner, handler and physical effects parked. The actual admission
producer, runtime authorization/settlement, boot composition, CREATE worker,
orphan driver ordering and eight original FreshMG receipts remain product
obligations. No C0 receipt or source approval follows from this document alone.
