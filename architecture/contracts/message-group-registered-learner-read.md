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

The remaining PR113 finding 4231684822 about lease/boot changes during an awaited
operation-row mutation remains OPEN. This route does not make independent group
reads and writes globally atomic and does not claim commit-time lease revocation.
Do not unpark CREATE or recurring ordinary dispatch on the strength of this
historical-read increment. Record and review the eventual commit authority at
its existing writer owner rather than adding another metadata reread loop.

The full ordinary driver still needs owned discovery/reentry and original-request
reconstruction after a committed permit, initial learner action execution, and
current CREATE using the existing leader descriptor/generation/sole-worker checks.
These cannot be replaced by fixture-driven SENDING or a historical ADD receipt.
No successor attempt is issued: absence of origin does not establish definitive
predecessor fencing AND noncommitment. J1 forward recovery remains unchanged.

## Required bounded proof

Use actual MessageRouter IDENTIFY and SERVICE_MESSAGE/SERVICE_RESPONSE transport,
actual registered MessageGroupServiceHandler, real native operation ports and
file-backed ReplicaOperationRepository. A supplied host service descriptor and
local operation-SQL fixture must remain explicit; in-process sockets are not a
physical network or replicated-SQL failover claim.

Prove ordinary remote success and no-effect replay; uncommitted UNKNOWN;
payload-forged context refusal; wrong group/action/replica refusal; replacement
of the actual handler registration or native port during a held real read;
workflow shutdown; and continued CREATE/bootstrap-purpose refusal. Preserve
exact row/debt and no proposal/physical-worker effects. Include permanent joint
classification controls and preserve all existing process-loss/regression tests.
Run new tests on the original source, then exact-source positive and named
assertion mutation controls with normal dependencies and unchanged budgets.

Independent review, full changed-path/static gates, original full-lab FAIL,
timing debt, physical replacement/seed-loss and exact-main/A1-v13 gates remain.
