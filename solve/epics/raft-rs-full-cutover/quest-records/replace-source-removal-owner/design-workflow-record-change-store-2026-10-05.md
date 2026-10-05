# Design: the workflow record store accepts only changes (owner option A), 2026-10-05

Quest: zero-liferaft-active-runtime, group retirement as a unit. Supersedes the
"compare-and-swap on the record as read + acknowledged-chain rebase" store of
f5f5e649c/ddbb7aa8f (round-5 rejection H5-A).

## Why

Rounds 4 and 5 rejected the same mechanism: a write whose *content* was
derived from one version of the workflow record was compared against another.
Round 4: a stale executor's registration overwrote a DISPATCHED mark. Round 5:
the store's rebase rule let an owner's own lease renewal (or participant
flush), built from the in-memory workflow before a concurrent
`markTargetProvisioningDispatched` advanced it, be compared against the flip's
version; the CAS matched and wrote the pre-flip metadata back
(DISPATCHED -> NONE). A successor then deleted a live child's row.

Owner decision (binding): "Writes become functions of the stored version. The
record store accepts only 'apply this change to the record'; at its turn in a
per-workflow queue, each change is applied to the latest acknowledged record
and compared against exactly that. No caller can pass a pre-built record. The
rebase rule is deleted." Not option C (refuse/re-derive per caller), not
option B (SQL field updates).

## The API (src/partition/managed-workflow-record-store.js)

    applyRecordChange(owner, workflowId, change, {tableId, kind}) ->
      {outcome, accepted, workflow, refusal}

- `change` is a pure function `(workflow, stored) => next | RECORD_UNCHANGED |
  RECORD_CLEARED | refuseRecordChange(reason, {superseded})`:
  - `workflow` is the record DECODED by the owner (`owner.decodeWorkflowRecord`)
    into its workflow shape, overlaid with this process's non-durable runtime
    fields (step history, attempt count); `null` when the record does not hold
    this workflow (absent, cleared, another workflow id).
  - `stored` is the decoded record itself (`{exists, workflowId, state,
    metadata, claim}`), for the changes that look at a record that is not
    (yet) this workflow (registration, claim).
  - The caller's expectation is a precondition INSIDE the change ("I am the
    owner at fence F", "the record is still the one I planned on", "mark is
    NONE or DISPATCHED", "every source is caught up"). No caller passes a
    record, metadata or bytes to write: `updateWorkflow`, `transitionStep`,
    the claim, the acknowledgement, the progress checkpoint all take change
    functions; the coordinator (managed-workflow-record-coordinator.js)
    throws on a pre-built update object and has no participant/workflow
    "persist the in-memory state" entry point.
- `kind`: TRANSITION (the owner's full transition payload, epoch fields
  included - every phase/participant/mark write), CLAIM (metadata only - a
  claim or renewal), or a change returning RECORD_CLEARED (terminal clear).
- Outcomes: ACCEPTED (written by this change, or a lost acknowledgement the
  authoritative re-read recognises byte for byte), ALREADY_APPLIED (the
  change returned RECORD_UNCHANGED on the current record: its postcondition
  already holds; nothing written), REFUSED (the change's precondition is
  false on the authoritative record; nothing written), SUPERSEDED (the record
  is no longer this workflow, or the change refused it as another owner's:
  this owner relinquishes - stops its re-drive, drops its copy, logs one
  WARN), UNCONFIRMED (no authoritative answer, a lagging read, or the bounded
  attempts spent: nothing decided, nothing adopted; a must-land caller fails
  its step and nothing irreversible follows).

## The turn

Per (owner, workflow) the store runs changes strictly one at a time (a
promise queue). At its turn:

1. Base = the latest ACKNOWLEDGED record of this owner's lineage (the exact
   stored bytes: transition metadata string + state). With no lineage yet
   (registration, recovery, a re-claim after a relinquish) the base is the
   owner's view row as read - a read, never content: a stale base can only
   refuse (step 4).
2. `next = change(decode(base), stored(base))`. A refusal or UNCHANGED ends
   the turn with no write.
3. Encode `next` with the owner's encoder; CAS `UPDATE tables ... WHERE
   table_id = ? AND partition_transition_metadata = <base bytes> AND
   partition_transition_state = <base state>` (proposed through the table
   partition's Raft log; SQLite evaluates the WHERE at apply; the proposer
   gets that apply's `changes` - verified sound in round 5).
4. One row changed: the acknowledged record becomes the written bytes, and
   the in-memory workflow is rebuilt as a projection (durable fields decoded
   from the written bytes, runtime fields from `next`) BEFORE the queue
   releases the next change.
5. Zero rows, a refused or failed submission: the AUTHORITATIVE re-read
   (below). Then:
   - re-read = the bytes this change wrote: lost acknowledgement, ACCEPTED;
   - re-read does not answer: UNCONFIRMED;
   - re-read LAGS the base (same bytes as the base; or this workflow at a
     lower fence; or, while the base is this owner's record with a lease live
     by this owner's clock, anything that is not this workflow at the base's
     fence or later - no other owner can have replaced a live lease's record):
     the base is kept; after a failed submission the same CAS is retried
     (bounded), otherwise UNCONFIRMED;
   - otherwise the re-read becomes the base (and the projection, when it is
     this workflow) and the SAME change function is applied to it again: its
     own precondition decides (REFUSED / SUPERSEDED / UNCHANGED =
     ALREADY_APPLIED / a new CAS). Bounded: 3 CAS attempts per change.
   There is no rebase, no "resynced" outcome, no adoption from the local
   view, and no path that writes bytes derived from a record other than the
   one compared.

## The authoritative read

`owner.readAuthoritativeWorkflowRecord(tableId)` when the owner has one, else
the control plane's `readAuthoritativeControlPlaneRows` with
OWNER_RPC_REQUIRED + leader REQUIRED + CRITICAL work class: the table
partition leader's applied state. The local view (`listTableInfos`) is never
used to decide a refused write (it may lag this owner's own acknowledged
write: round-5 false RESYNCED / SUPERSEDED). A lagging authoritative read
(leader change before the new leader applied) is detected by the lag rule
above and costs only liveness: every write is a CAS on the exact bytes it was
derived from, so a stale read can make a write refuse, never land wrong.

## Projection

The coordinator's workflow object is a projection of the last acknowledged
record plus non-durable runtime fields (step, transitionHistory,
attemptCount, createdAt/updatedAt, identity). Durable fields - status,
metadata (incl. participants, source checkpoint, claim triple), participants
Map, fenceToken, workflowOwnerId, leaseExpiresAt - are only ever assigned
from a decoded record. Nothing durable is derived from the projection for a
write: callers may read it (plans, logs, in-memory early exits) but every
write is a change applied to the record at its turn.

## Writers (all converted)

| Writer | Change and precondition |
| --- | --- |
| registration (split, merge) | REGISTER: record unchanged since the caller's read (CAS-on-read precondition: the registration content is derived from that read) and no live foreign lease; fence = record fence + 1 |
| claim (fresh, resume re-claim) | CLAIM: this workflow, not terminal, no live foreign lease; fence = record fence + 1 |
| lease renewal (timer, step, assertWorkflowRecordHeld) | CLAIM: owner = me at the projection's fence (+ state set for held checks) |
| updateWorkflow (deferral, admission denied, PREPARING, BACKFILLING, failure, post-admission deferral, merge provisioning) | TRANSITION: owner = me at fence; delta merged onto the record's metadata |
| provisioning mark flip | TRANSITION: owned; DISPATCHED already = UNCHANGED; else mark -> DISPATCHED |
| transitionStep (phase advance, cutover, abort) | TRANSITION: record fence/owner = the step's renewed ownership, lease live; the step's own precondition (predecessor states, every source caught up for the cutover) re-evaluated on the record |
| acknowledgeParticipant (owner and non-owner) | TRANSITION: this workflow; participant exists in the record; fence/duplicate/graph checks against the RECORD's participant |
| group-retirement progress (frozen set, answered ids, never-provisioned) | TRANSITION: owned; participant fence rule; frozen set immutable once written; answered/dissolved ids only grow; never-provisioned sticky |
| terminal clear | CLEAR: owned at fence, state is the terminal state the caller cleared from |
| merge owned-abort fallback, same-owner resync retry | DELETED (they existed for the same-owner race the queue removes) |

## Merge cutover #10 (the reason the rebase existed)

The failure acknowledgement is a change queued behind the in-flight MERGE_CATCHUP
write; it applies to the then-current record. The cutover step renews its
lease first (a change queued after the acknowledgement), re-checks the
projection, and its CUTOVER_ACTIVE change re-checks "every source caught up"
on the record: the failure wins by ordering, assertion unchanged.

## Residuals

- A refused write's authoritative re-read that lags is UNCONFIRMED (no
  decision); if the lag shows another workflow while this owner's lease is no
  longer live by its own clock, the outcome is SUPERSEDED: the owner stops
  driving and its lease lapses (liveness cost only; nothing is written).
- Clock skew: "live by my clock" is this owner's judgement; another owner may
  judge it expired earlier and claim; the CAS orders the two.
