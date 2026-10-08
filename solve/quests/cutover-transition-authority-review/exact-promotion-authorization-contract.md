# Exact promotion authorization boundary (review response 4217048455)

Status: proposed implementation contract under the operator-approved J1
choice. Not a claim that the parked 82b54ef9 product implements it. The receipt
is false pending review. No existing sealed Quest is edited by this document.

## Existing source and the missing interaction

At 82b54ef9, the actual carrier is the replicated `replica_operations` row.
Its membership columns are owned by
`src/bootstrap/replica-operation-message-group-membership-schema-constants.js`;
ordinary repository updates preserve those columns. The owner lease is the
same row's `lease_expires_at`, mapped to `ownerLeaseExpiresAt` by
`replica-operation-repository-row-methods.js`. `resolveOperationOwnerNodeId`
defines who currently owns the operation; the new code must call it, not infer
ownership from target placement.

The saved cd366cc0 candidate introduces `message_group_membership_permit` and
`ReplicaOperationMessageGroupMembershipPermitOwner.advanceStage`, reached as
a subordinate repository operation. That column/method is NOT in the
integrated product. Reuse/repair that already-proposed interaction in the
FreshMG Quest; do not invent another store. Its recorded stage names include
`learner_committed`, `promotion_proposal_in_flight`, and `voter_committed`.
Its present REMOVE subject and failure-branch rules are rejected and cannot
be adopted unchanged.

## Durable carrier and exact linearization

The J1 boundary is ONE committed conditional update of the operation row:

- prior `message_group_membership_phase = learner_committed`;
- prior exact encoded ADD_LEARNER permit is COMMITTED, with a non-null exact
  committed learner stamp bound to O/group/T;
- next phase `promotion_proposal_in_flight`;
- next permit is PROMOTE, IN_FLIGHT, sequence prior+1, proposalIndex null,
  preserving O/transitionIdentity/group/S/T, and naming T as effect subject;
- obligation becomes `unknown`; the same unique group lane stays held.

The existing ReplicaOperationRepository persistence/gateway path owns that
update. A repaired `advanceStage` (or its narrow existing-owner successor)
performs it. `OperationWorkflowOwner` is the only runtime driver and may ask
for PROMOTE only after the committed row is established by the canonical
write answer or exact authoritative winner observation.

This row commit is the authorization boundary. It is NOT a local queue entry,
permit construction, proposal index, elapsed lease, runtime-local
staleTransitionFence, acknowledgement, or later committed-voter observation.
The SQL row's Raft-backed commit and the subsequent membership Raft commit
are separate commits, recovered idempotently rather than called one atomic
cross-group transaction.

The UPDATE predicate must match: operation id and REPLACE type; group/entity;
immutable S/T replica and node identities; exact encoded membership identity
and source lifecycle claim; lane key; prior phase, obligation and permit;
exact learner stamp; current canonical owner binding and exact live owner
lease/fence; and ordinary nonterminal state (`completed_at IS NULL` plus the
repository's canonical nonterminal status/step predicate). No caller chooses
which generation or subject counts. A generic terminal writer may win first,
in which case promotion is not authorized. A terminal writer after this CAS
must preserve the membership columns and cannot undo authorization.

The next permit must bind the effect subject using the runtime's existing
`replicaIdentity`/`peerId` dimensions. Permanent target identity fields keep
meaning T. ADD/PROMOTE use T; successful REMOVE uses S. Failed-learner REMOVE
uses T only in its pre-promotion branch. The encoded request/receipt must
carry the exact derived subject; never accept REMOVE plus targetPeerId as a
substitute for source-retirement evidence.

## Monotonic branch selection, not an erasable flag

`promotion_proposal_in_flight` and all its legal successors permanently select
forward recovery for this O. Legal successors include voter committed, source
removal in flight, source removal committed and resolved source absence.
A terminal operation state, lease renewal/takeover, retry, unknown response,
missing cache entry or restart cannot rewrite that chain back to a
pre-promotion/failed-target-removal phase. Conflicting or unreadable phase /
permit / stamp combinations refuse; they never default to pre-promotion.

The alternate pre-promotion failed-target branch must itself be selected by a
mutually exclusive conditional update from the same exact learner-committed
basis, recording target-removal intent. It competes with the promotion CAS;
both cannot win. That target-removal branch forbids later PROMOTE or source
removal under O. These are transitions in the existing membership phase and
permit columns, not another workflow or a new compensation coordinator.
Pruning cannot erase a still-unresolved membership obligation. A resolved old
operation never grants authority to a late request: its operation context and
configuration/lifecycle fences remain necessary at the runtime boundary.

## Unknown answer and restart decision table

| Observation after an uncertain authorization UPDATE | Permitted next action | Forbidden action |
| --- | --- | --- |
| Exact requested PROMOTE permit/phase or a valid forward successor exists | Adopt the committed winner, retain forward direction; current runtime/configuration owner decides whether to retry or observe the membership change | Mint a second O, reset the sequence, or remove T as compensation |
| Exact old learner-committed basis is observed | No PROMOTE grant. Retry the same conditional authorization; to abandon, win the mutually exclusive pre-promotion target-removal CAS first | Treat one old-state read as cancellation of a delayed promotion authorization |
| Pre-promotion target-removal CAS has committed | Reconcile exact T removal only under that branch; delayed authorization SQL using the old basis must lose | Send PROMOTE from a previously constructed local permit |
| Another owner/sequence has advanced | Adopt only after exact O/S/T and canonical owner validation; remain forward if promotion could have been authorized | Use local wall-clock expiry as permission to roll back |
| Row/read/write outcome unavailable or internally inconsistent | Retain lane and exact obligation; existing owner schedules authoritative reread/retry, with explicit reason | Infer absence, release lane, delete a replica, or dispatch a new irreversible action |

A crash before the row commit leaves no grant; after commit it leaves the
sticky forward intent even before PROMOTE is sent. After a sent request loses
its response, current committed configuration/context and the same O/permit
resolve completion; configuration absence alone does not disprove an in-flight
request. Runtime generation/term/configuration fencing and exact request
identity remain required on retries. The current runtime-local stage fence
is an optimization, never the durable recovery authority.

## Concrete proof obligations for the existing FreshMG implementation

Use real repository SQL/CAS with the existing canonical schemas and runtime
port, not a test that only supplies a copied grant:

1. Race promotion authorization with ordinary terminal settlement and with
   pre-promotion target-removal selection; exactly one admissible branch wins.
2. Lose the authorization answer before/after its actual commit; reopen with
   no volatile state and prove the table above, including delayed SQL retry.
3. Advance owner lease/sequence after an old request was built; prove no
   regressed authorization, wrong subject or stale-runtime admission.
4. Lose PROMOTE / REMOVE S answers; target rollback remains forbidden and
   exact committed subject/context settles only its own obligation.
5. Preserve the lane after ordinary terminal settlement until the existing
   membership owner proves its exact release condition; cleanup/reservations
   retain their separate contracts.

The existing eight-receipt FreshMG acceptance still requires actual CREATE,
state transfer, promotion, two replacements, restart and physical off-seed
proof. This document defines the missing durable interaction so it can be
implemented and falsified; it does not certify those later product steps.
