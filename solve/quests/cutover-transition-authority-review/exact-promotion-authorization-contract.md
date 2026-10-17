# Exact promotion authorization boundary

Status: proposed implementation contract under the operator-approved J1
choice, awaiting independent acceptance. The inherited 82b54ef9 runtime does
not implement it. No existing sealed Quest is edited. Read
[the exact holder claim](exact-membership-owner-claim.md) with this contract;
it is the authority for initial claiming, orphan recovery and successor fencing.

## Existing owner and durable carrier

The carrier is the replicated replica_operations row, owned by
ReplicaOperationRepository. Its membership schema constants and existing
upgrade loop own the fields. Ordinary operation updates preserve them.
`message_group_membership_owner_claim` identifies the current membership
holder, including node, boot, monotonic generation and expiry. It is distinct
from the immutable pending action permit. The ordinary `lease_expires_at`
and structural source/target owner are NOT successor membership authority.

The preserved cd366cc0 permit candidate is rejected design/code input, not
accepted runtime. The new bounded source increment remains in the existing
FreshMG Quest. Its subordinate repository methods are
claimMessageGroupMembershipOwner and selectMessageGroupMembershipBranch;
no second database, generic coordinator, scheduling queue or log is created.
A repository method is not automatically a network authorization boundary.

## One branch-selection commit

J1 is selected by ONE committed conditional update:

- Prior phase is learner_committed, obligation unknown, and the exact stored
  ADD_LEARNER permit is COMMITTED with a non-null committed learner stamp.
- O/group/S/T/source-generation tuple and the unique group lane are immutable.
- The executing repository owns the exact current membership holder claim,
  has the same current canonical boot, and observes its claim live.
- Next phase is promotion_proposal_in_flight; next action permit is PROMOTE,
  IN_FLIGHT, sequence=prior+1 and proposalIndex=null, naming exact T as subject.
- The same lane and unknown obligation remain held.

The UPDATE matches operation id/type/group/entity, immutable S/T replica and
node identities, exact encoded identity/source claim, exact holder claim,
prior phase/obligation/permit and learner stamp, absent voter/removal stamps,
and canonical ordinary nonterminal status/step plus completed_at IS NULL.
The next permit's proposer/owner context matches the current holder, NOT the
old structural owner. Exact current boot is observed through the existing
authoritative gateway before and after the row write. The full runtime driver
must bind that context again before an external membership action.

The operation-row SQL/Raft commit is authorization; the subsequent membership
Raft configuration commit is a DIFFERENT commit. They are not an atomic
cross-group transaction. Local progress, permit construction, a proposal
index, elapsed lease, runtime-local stage fence or an acknowledgement cannot
substitute for the durable row. Unknown write results are re-observed, not
assumed absent. Claim expiry permits competition; only the exact row CAS
identifies the holder/branch winner. A new claimant makes an old holder's
pending branch-selection predicate lose if it commits first.

## Mutually exclusive pre-promotion abandonment

From the SAME exact learner-committed basis, a separately justified failed-
learner branch may select target_removal_proposal_in_flight with REMOVE T.
It competes with promotion on phase, prior permit and holder claim: both
cannot win. That branch cannot later promote T or retire S under O.
Promotion authorization and all its legal successors permanently select
forward recovery: voter committed, source removal in flight/committed, resolved
source absence. Generic terminal settlement, takeover, restart or cache loss
cannot change it back into failed-target removal.

ADD/PROMOTE always names T. Successful replacement REMOVE names S. Failed-
learner REMOVE names T only before promotion authorization and under the
exclusive abort branch. An exact response binds the same subject and full
operation/stage/sequence context. Never repurpose targetPeerId to mean S.
Ordinary terminal state, membership-lane release, source-own applied absence,
physical cleanup and storage accounting keep their separate existing owners.

## Unknown outcomes and recovery

| Observed durable row | Next action |
| --- | --- |
| Exact requested PROMOTE phase/permit or valid forward successor | Recognize the durable direction, then validate current holder/runtime context before reconciling the action |
| Exact old learner basis | No new grant; retry the conditional authorization or win its exclusive abort alternative; an old read does not cancel delayed SQL |
| Pre-promotion abort branch | Reconcile T only; delayed promotion authorization against the old basis must lose |
| Another claimant/sequence | Losing actor has no execution grant; current holder reconciles the immutable action without regressing its branch |
| Unavailable/inconsistent row or boot | No irreversible dispatch; retain lane/action and let the existing owner reread/retry |
| Terminal operation with retained membership debt | Ordinary execution stays terminal; claimed membership recovery retains and resolves the separate obligation |

A crash before commit leaves no branch grant. After commit, forward intent
survives even if PROMOTE was not sent. A lost membership reply is settled by
exact committed configuration/context, not configuration absence alone.
Holder takeover does not cancel an already-authorized action. Old late
requests remain subject to the existing native term/configuration/lifecycle
fences and permanent identity. Runtime generation/term progress is not a
replacement for the durable operation and current claimant.

## Required product proofs

Test promotion versus terminal settlement and abort selection; old holder
versus winning successor; loss before/after authorization commit; delayed
losing SQL; exact replay after volatile-state loss; wrong S/T subject; stale
boot/claim/configuration; retained terminal debt and competing group operation.
The actual producer of the committed learner basis, runtime request admission,
promotion/removal settlement and exact CREATE worker remain separate unfinished
parts of the same FreshMG Quest. Its eight original receipts, including two
replacements and physical off-seed restart/seed loss, are not satisfied by
these row-only tests or by this contract.
