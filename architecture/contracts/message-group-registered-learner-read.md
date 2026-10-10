---
audience: development
documentClass: current
---

# Registered learner read and workflow recording

Existing Quest: `message-group-fresh-identity-membership`.
Product base: `bcbf5e762ba2df9ea1e5bd12a78ecd1c728f0532` (PR113).
User-approved continuation after actual process-loss and holder recovery.
This is a bounded contract, not source approval, activation or completed proof.

## Trigger, authorities and result

An existing OperationWorkflowOwner is explicitly asked to recover an issued
learner action for its operation. It calls the existing repository recorder;
that recorder constructs the immutable original group/action query. The owner
supplies the transport capability itself, addressed to an existing local or
remote message-group handler and a discovered replica. Route fields are hints,
not committed evidence or membership authority.

The existing READ_COMMITTED_MEMBERSHIP message gains only the learner-action
purpose at MessageGroupServiceHandler. Its registered callback must forward the
router's actual host-only delivery argument; a payload field cannot substitute
for that context. The recipient resolves the actual local message-group service
and native port through its existing resolver. It checks the group/replica/node
binding, and uses the existing queued historical native read. The exact handler
registration, service/port and delivery lifetime must still be valid before the
result is returned. Invalid or retired receivers grant no evidence.

The workflow owner consumes the completed response through its existing router
and transport-outcome classifier. The responding node must be the addressed
recipient. It must not consume after its own shutdown. The repository remains
the sole decoder/validator and conditional writer of the learner phase/permit/
stamp. The durable commit point remains that existing operation-row CAS; this
increment adds no new authoritative write, proposal, coordinator or retry loop.

Ordinary workflow status, terminal history, membership debt/lane, reservation
and CREATE authority remain unchanged. Exact already-recorded replay must not
send another native read. Unresolved history remains UNKNOWN. Missing or retired
transport/recipient is UNAVAILABLE; contradictory responses remain CONFLICT.
A legitimate joint witness is temporarily unrecordable, not permanently corrupt;
use the existing stamp validator's JOINT defect and retain older-term recovery.

## Interruption and scope limits

A lost response may be retried through the same existing read/recording path.
A registration, socket/router lifetime or native port replacement while the
read is pending must invalidate the old invocation. A later fresh invocation
can recover the unchanged issued action. No delivery failure cancels that action.

The historical-recording interpretation of PR113 finding 4231684822 is narrowly
superseded by the operator-authorized
[safety-first ruling](../../solve/quests/message-group-fresh-identity-membership/safety-first-ruling-20261009.md).
An already-submitted exact receipt may commit after expiry/boot/lifetime change
when the full row-CAS basis is unchanged. It must alter only the three receipt
columns; it neither refreshes execution permission nor permits a next effect.
Competing claim or terminal/phase changes remain ordered by the existing row CAS.
This is not atomic revocation across different Raft groups. The original failed
strict-refusal evidence is retained under its original requirement.

Before EVERY new submission, including retries, the existing repository samples
canonical boot authority; immediately before the gateway call it checks local
invocation lifetime and claim expiry without another asynchronous wait. These
host checks do not purport to retract a previously submitted command. Their
callbacks are local-only and are never serialized into the write options.

The workflow now also has recoverMessageGroupLearnerOutcomeFromRecipient: supply
only an operation ID and an explicitly selected witness. In its retained owner
lane, the repository reconstructs recording inputs from the authoritative row.
A COMMITTED permit is accepted only for exact readback of a coherent recorded
phase, never reconstituted as IN_FLIGHT. The proposal authorizer stays unchanged
and rejects that committed input. Unavailable rows cannot be replaced by caches.

## Owned discovery and reentry

Three existing triggers converge on one algorithm, owned by OperationWorkflowOwner
(operation-workflow-message-group-membership-recovery): the restart scan
(handleRecovery), the periodic timeout/orphan sweep, and the replicated-row
observer (a replica_operations row still owing its obligation, or an ACTIVE
message-group services row for a group whose lane holder owes one). Each turn:

1. Censuses debt: the restart scan reads the repository's authoritative census
   of every message-group operation whose obligation state is UNKNOWN, whatever
   its ordinary status (ordinary failure does not hide debt); the periodic sweep
   reads the replicated cache as a hint, so a cache listing no debt costs no
   round trip. The periodic sweep and both replicated-row wakes share one hint
   filter: a row owing an initial learner turn (in-flight phase and permit).
   A services row reads its group's lane only when the cache lists such an
   operation on that lane; a recorded, invalid or later-phase row costs no read.
   When the repository has no replicated-operation cache observation boundary,
   a services row falls back to the authoritative lane read.
   Every candidate is re-read authoritatively before any decision.
2. Holds the operation lane for one turn (coalesced wakeups do not inherit a
   turn; the debt waits for the next trigger).
3. Recovers only the initial learner action (ADD_LEARNER, sequence 1, phase
   in-flight or committed); promotion and removal debt belong to later owners
   and are reported, not touched. A phase/permit pair other than in-flight/
   in-flight or committed/committed is INVALID_ROW (field: permit) before any
   claim work. An initial action whose exact outcome is already durable is
   settled for this owner: no claim is touched and no witness is asked. The
   recorder owns the one pure validity predicate of that recorded fact (row
   identity, committed initial permit, no voter/removal stamp, canonical permit
   and stamp encodings, coherent learner stamp); discovery and the recorder's
   readback both consume it. It carries no claim, lease or boot gate, so a
   settled fact stays settled after its lease expires.
4. Keeps a live local membership claim, waits on a live foreign one, and adopts
   an expired one through the existing claim CAS. Adoption is holder
   replacement, never a grant for a successor action.
5. Selects an explicitly hosted witness from the service census: ACTIVE rows
   of other replicas of the group, the source first, never the target the
   operation has not created; a witness that did not answer rotates out for the
   next turn. The census is a route hint; the native answer at the witness is
   the evidence. No hosted witness is a typed retained outcome whose wake is the
   services row of a hosted replica.
6. Calls the recorder's inline entry with the lane turn the operation lane
   handed it; the entry refuses a missing turn, a turn for another key, or a
   lane nobody holds. The retained-lane public entry stays for explicit callers.

RECORDED (new or settled), RETAINED (UNKNOWN/UNAVAILABLE/STALE_OWNER),
NO_HOSTED_WITNESS, HELD_ELSEWHERE, CLAIM_REFUSED, PHASE_NOT_OWNED, LANE_BUSY,
NOT_CURRENT, INVALID_ROW, INVALID_INPUT and CONFLICT are named states owned by
the permit module. Only RECORDED means the exact outcome is durable; INVALID_ROW,
INVALID_INPUT and CONFLICT are surfaced for owned repair. An INVALID_ROW keeps
its UNKNOWN obligation untouched and is re-diagnosed (warn) by its reentry
owner, the restart scan's authoritative census in OperationWorkflowOwner;
no repair is automated here. None of them dispatches
CREATE, promotion, removal, cleanup, a successor attempt or a lane release.
The membership owner claim is bound to the process's issued boot incarnation,
the one the router carries and the nodes row publishes.

The full ordinary driver still needs initial learner action execution, followed
by current CREATE through the existing leader descriptor/generation/sole-worker
checks. These cannot be replaced by fixture-driven SENDING or a historical ADD
receipt. No successor attempt is issued: absence of origin does not establish
definitive predecessor fencing AND noncommitment. J1 forward recovery remains
unchanged.

## Required bounded proof

Use actual MessageRouter IDENTIFY and SERVICE_MESSAGE/SERVICE_RESPONSE transport,
actual registered MessageGroupServiceHandler, real native operation ports and
file-backed ReplicaOperationRepository. A supplied host service descriptor and
local operation-SQL fixture must remain explicit; in-process sockets are not a
physical network or replicated-SQL failover claim.

Prove ordinary remote success and no-effect replay; uncommitted UNKNOWN;
payload-forged context refusal; wrong group/action/replica refusal; replacement
of the actual handler registration or native port during a held real read;
workflow shutdown; and continued CREATE/bootstrap-purpose refusal. For discovery,
prove recovery by operation ID alone from the restart scan, duplicate and stale
wakeups on the real lane, no witness followed by a hosted witness, the target and
a stopped replica never selected, ordinary-failed debt, holder replacement, lost
SQL answer resolved by readback, later-phase debt untouched, the services-row
wake, and the inline entry refusing outside the lane. Preserve
exact row/debt and no proposal/physical-worker effects. Include permanent joint
classification controls and preserve all existing process-loss/regression tests.
Run new tests on the original source, then exact-source positive and named
assertion mutation controls with normal dependencies and unchanged budgets.

Independent review, full changed-path/static gates, original full-lab FAIL,
timing debt, physical replacement/seed-loss and exact-main/A1-v13 gates remain.
