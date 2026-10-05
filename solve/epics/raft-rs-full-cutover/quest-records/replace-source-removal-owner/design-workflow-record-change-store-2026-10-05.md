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
   A precondition refusal decided on an unconfirmed base (the acknowledged
   record or a view, possibly older than the record) is confirmed the same
   way once: the authoritative record, when it moved past the base, gets the
   change re-applied - a refusal never rests on a stale copy alone.
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

The in-memory workflow may therefore be DROPPED AT ANY TIME without
affecting any write: execute() releasing it in `finally`, a restart, a
relinquish, or any test dropping it between steps. Every later change starts
from the acknowledged record (or, with no lineage, a read that only a CAS can
confirm), so the fence, owner, lease, marks, participants and checkpoints a
write carries always come from the record. Witnesses:
workflow-record-projection-drop.test.js (a healthy split and merge driven
with the projection dropped before every step write the identical durable
sequence and reach the terminal clear) and the recovery-between-every-
acknowledgement case of managed-split-workflow-terminal-lifecycle.test.js.
The lost-fence defect of the writes-after-split diagnosis (recovery dropped
the claim triple; SOURCE_DISSOLVED was stamped fence 0 and silently refused)
cannot recur: no write takes a fence from memory, and every owner-recorded
outcome's answer is checked (acknowledgeOwnerOutcome: a refusal is one typed
ERROR and an incomplete, re-drivable step).

## Writers (all converted)

| Writer | Change and precondition |
| --- | --- |
| registration (split, merge) | REGISTER: record unchanged since the caller's read (CAS-on-read precondition: the registration content is derived from that read) and no live foreign lease; fence = record fence + 1 |
| claim (fresh, resume re-claim) | CLAIM: this workflow, not terminal, no live foreign lease; fence = record fence + 1 |
| lease renewal (timer, step, assertWorkflowRecordHeld) | CLAIM: owner = me at the projection's fence (+ state set for held checks) |
| updateWorkflow (deferral, admission denied, PREPARING, BACKFILLING, failure, post-admission deferral, merge provisioning) | TRANSITION: owner = me at fence; delta merged onto the record's metadata |
| provisioning mark flip | TRANSITION: owned; DISPATCHED already = UNCHANGED; else mark -> DISPATCHED |
| transitionStep (phase advance, cutover, abort) | TRANSITION: record fence/owner = the step's renewed ownership, lease live; the step's own precondition (predecessor states, every source caught up for the cutover) re-evaluated on the record |
| acknowledgeParticipant (a participant's own ack) | TRANSITION: this workflow; participant exists in the record; fence/duplicate/graph checks against the RECORD's participant |
| owner-recorded outcomes (SOURCE_DISSOLVED, DISSOLUTION_FAILED, TARGET_PROVISIONED) | the same, OWNED (owner at its fence); answer checked: anything but accepted/duplicate is a typed ERROR and an incomplete step |
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

## Round 7: the record is an incarnation, not bytes (2026-10-05)

Round-6 rejection (V6-A, same mechanism at the one content-taking entry):
"the record" was identified by bytes that REPEAT. The compare covered only
`partition_transition_metadata` + `partition_transition_state`; the terminal
clear nulls both; workflow ids are deterministic (`split-...-v2`) and the
fence restarted at 1 after a clear. So a cleared record of epoch n was
indistinguishable from the cleared record of epoch n+k (ABA): owner A's
registration derived from a pre-split read landed after owner B's whole split
cleared. One workflow id/fence also named two attempts (the name standing in
for an incarnation - the class behind the peer-id, tombstone and held-write
identity defects of this week; residual P4). And registration's content
depended on facts outside the compared bytes (`active_partition_version`, the
partitions rows). V6-B (post-cutover failure writing FAILED / DEFERRED over
SPLIT_CUTOVER_ACTIVE, and a re-drive re-registering the superseded source) is
the same root at the phase level: an unranked state compared as "not a
regression".

### D1 - the record generation (one carrier)

Carrier: a dedicated column on the `tables` row,
`partition_transition_generation INTEGER NOT NULL DEFAULT 0`, compared in the
same `UPDATE ... WHERE` as the transition columns. Not a retained minimal
record in the metadata column: every reader of the transition columns
(routing, epoch contract, group-retirement evidence, admin snapshots, the
overlap guard) reads "metadata/state null" as "no transition"; a retained
`{generation}` blob would change that meaning for all of them.

- Every accepted change advances it by exactly one in the same atomic write:
  registration, claim, renewal, every TRANSITION (phase, cutover promotion of
  `active_partition_version`, FAILED's pending withdrawal, participants,
  marks, progress) and the terminal clear. The store adds
  `partition_transition_generation = base + 1` to every encoded change (one
  place: the store's compare-and-swap), so no encoder can forget it.
- The compared record is the triple (metadata, state, generation). A cleared
  record is `{metadata: null, state: null, generation: n}`; generations never
  repeat, so a cleared record of generation n never equals one of n+k.
- Lag rule: a re-read whose generation is below the base's lags it (exact,
  replaces the fence/live-lease heuristics); same bytes = lags; anything else
  - an absent row included (the table is gone) - moved.
- Legacy: a row that predates the column reads generation 0 (the column is
  added `NOT NULL DEFAULT 0` by the tables-table column upgrade on open; a
  view row without the field decodes as 0) and gets 1 on its first write by
  the store. Any write leaves 0 behind for good, so the ABA cannot recur
  across the upgrade. Mixed-version clusters: an old node neither advances
  nor compares the column (see the epic's upgrade notes).

### D2 - registration derives only from covered inputs

Registration's change compares the caller's read by the full triple (so
every `tables`-row input is covered by the generation) and, at the change's
turn, re-validates every input taken from another row against the compared
record's own committed facts (`owner.registrationInputsRefusal(registration,
storedRow)`; production execute always passes it):

| Input (split / merge) | Source | Cover |
| --- | --- | --- |
| active_partition_version -> targetVersion | tables row | generation (CAS) |
| pending_partition_version, partition_count | tables row | generation (CAS) |
| existing transition (retry plan, workflow id, retry metadata, persisted split key/children, merged target id) | tables row | generation (CAS) |
| partition_key (primary key column), table id/name | tables row | generation (CAS); immutable after create |
| overlap guard (in-flight transitions' ranges) | tables row | generation (CAS) |
| source partition row(s): existence, partition_version, key range | partitions rows | (a) re-validated at the turn: each source row, read again from the view at the change's turn, exists, is NORMAL, has partition_version = the compared record's active_partition_version and the key range the registration persisted |
| sibling set (same-table partitions at the active epoch, carried forward at cutover) | partitions rows | (a) re-derived at the turn with the owner's own resolver against the compared record and compared as a set |
| merged target id / split children ids | the existing transition (tables row) or a fresh mint | generation (CAS) for a reused id; a fresh mint is not a read input |
| desired RF (source row policy), size bytes, leader, routable / discovered / candidate nodes, topology snapshot (`resolveTopologySnapshot`, awaited) | partitions / services / topology | advisory: not a safety input of the record. Each is re-checked by the step that acts on it (admission probe, child-provisioning precheck, provisioning convergence, cutover readiness); a stale value can only produce a deferral or a refused step, never a write over another record |

(b) "immutable while the generation is unchanged" holds for the structural
partitions-row facts (existence, version, range) only because every split
and merge of a table runs under that table's one record; it is NOT relied on
alone, because the partitions view can lag the tables view (the lagging-view
class): (a) is checked at the turn.

### D3 - the attempt identity

The registration change mints the attempt: `workflowAttempt` = the generation
the registration writes (base + 1), stored in the record's metadata, never
changed by later changes. Attempt id = (workflowId, workflowAttempt). The
registration fence = max(record fence + 1, workflowAttempt); claims add one
to both fence and generation, so post-upgrade every fence of attempt N is >=
N and every fence of an earlier attempt is < N: (attempt, fence) never
repeats. Carried by:
- START_SPLIT_REPLICATION / START_MERGE_REPLICATION (the record metadata)
  and every source acknowledgement (`attempt`, from that metadata);
- the acknowledgement check: an ack whose attempt differs from the record's,
  or whose fence is below the record's attempt, is STALE_FENCE; checked
  against the record the change is applied to, never the projection;
- owner-recorded outcomes (stamped with the projection's attempt; the owned
  change's fence check already pins the attempt);
- group-retirement evidence (`attempt`), REMOVE verification
  (ATTEMPT_MISMATCH refusal), the REMOVE's operation id
  (`<workflowId>#<attempt>:dissolve:<replica>`, one builder for the split
  owner, the merge owner and the member's own re-ask; the legacy attempt 0
  keeps the attemptless id), the tombstone (version 3 carries `attempt`; a
  version-2 tombstone reads as the legacy attempt 0) and its release (a
  record holding another attempt of the same workflow id releases it).

### D4 - phase monotonicity is total

One rule, applied by the coordinator to EVERY change it hands the store
(registration, claims, owned changes, transitions, acknowledgements, the
clear): with `from` the compared record's state (`stored.state`, whichever
workflow it holds) and `to` the change's next status:
- from FAILED: only FAILED (or the clear);
- from cutover-or-later (SPLIT_CUTOVER_ACTIVE, SPLIT_SOURCE_DISSOLVING,
  MERGE_CUTOVER_ACTIVE): only a phase of rank >= from's in that order (same
  phase for in-phase updates) or the clear; FAILED, DEFERRED, BLOCKED,
  ADMISSION_PENDING and every pre-cutover phase are refused;
- pre-cutover: the ranked order never moves backwards; DEFERRED / BLOCKED /
  FAILED are allowed from any pre-cutover state (they are pre-cutover only).
The failure, deferral, admission-denied and planning-deferral changes are one
change factory (`executionOutcomeChange`) with an explicit pre-cutover
precondition like `abortChange`. A failure that meets a record at
cutover-or-later is recorded as a typed post-cutover incident on the record
(metadata `postCutoverIncidents`, phase unchanged) and logged as ONE ERROR
naming workflow, attempt, phase and reason; the workflow continues forward
(the source's acknowledgements drive dissolution and the clear); execute
answers the step's failure.

### Lost acknowledgement and byte-identical retry

A retry of the same compare-and-swap after a failed submission resubmits the
SAME encoded bytes (encoded once per turn, not re-applied with a new `now()`),
so a first entry that lands late is the record the lost-acknowledgement rule
recognises as this change's own (ACCEPTED, not a false REFUSED).

### P5 - held member proof after an await

`provesHeldMemberRetirement` and `tombstoneGroupRetiredRow` re-read the
lifecycle row AFTER the `verifyGroupRetirement` await and write the
tombstone only if the same incarnation is still retired.

### R17

The acknowledgement change reads the participant only from the record it is
applied to (its argument); recovery's projection (adopted without lineage)
is never consulted. Witness: a recovered stale projection beside a moved
record.

### Is D1-D4 sufficient?

Residual (stated, not hidden): (1) during a rolling upgrade an old node's
writes neither advance nor compare the generation; the upgrade note requires
managed split/merge quiesced until every node runs this version. (2) A legacy
in-flight record (attempt 0) whose pre-upgrade fences exceed the generation
is distinguished from later attempts only by the explicit attempt field
(acks from upgraded sources, evidence, tombstones), not by the fence order.
(3) Advisory inputs are by design not covered (table above).
