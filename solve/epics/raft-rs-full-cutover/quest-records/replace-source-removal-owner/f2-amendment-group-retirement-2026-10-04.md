# Amendment of ruling F2: a group retired by a durable cutover exits as a unit (2026-10-04)

**Status:** owner decision, 2026-10-04. It supersedes ruling F2 (2026-09-26)
for one class of removal and leaves it unchanged for every other one (R09:
superseded, never reinterpreted).

## The decision, quoted

> "All previous cases where a timeout was fully spent hid true bugs."
> A backstop is never an acceptable normal exit.
> DECISION (2026-10-04): amend ruling F2 - a group retired by a durable
> cutover exits AS A UNIT.

## What F2 said, and what stays

Ruling F2 (2026-09-26, landed in 1aea11baf, #63; owner contract in
`src/node/replica-removal-consensus-exit.js`): a replica being removed keeps
participating in consensus until the committed configuration no longer names
it, and only then retires its port; the REMOVING row makes the group's leader
propose the RemoveNode. Its purpose is the quorum of a CONTINUING group. That
rule stays exactly as it was for every removal of a replica from a group that
goes on: rebalancing REMOVE, REPLACE source removal, and every other REMOVE
that does not carry verified group-retirement evidence.

## What is superseded

F2 is superseded for a removal that retires its WHOLE group at a durable
workflow transition. There are four such paths, and one rule covers them all
(`src/partition/group-retirement-evidence.js`):

| Path | Durable record | Role of the retiring group | Epoch |
|---|---|---|---|
| split source dissolution | `tables` row at `split_cutover_active` / `split_source_dissolving` | `sourcePartitionId` | promoted (active = target) |
| merge source dissolution | `tables` row at `merge_cutover_active` | in `sourcePartitionIds` | promoted |
| aborted split child teardown | `tables` row at `failed` | in `targetPartitionIds` | not promoted |
| aborted merge target teardown | `tables` row at `failed` | `targetPartitionIds[0]` | not promoted |

For these paths:

1. The workflow owner puts the evidence on each REMOVE:
   `{kind, workflowId, fenceToken, tableId, reason: group-retired}`.
2. The replica verifies it at acceptance against the durable workflow record
   (the `tables` row, through the authoritative control-plane read): the
   workflow id, the workflow fence token, the transition state, the group's
   role, the target epoch, and (sources) that the persisted source
   participant finished mirroring. A missing partition or services row is
   never evidence. The dissolution checkpoint `DISSOLVED_REPLICA_IDS` is never
   read (it is written after the removals are dispatched). A refusal is
   typed; nothing is fenced or retired, and the replica keeps serving.
3. On verified evidence the replica marks its REMOVING row
   `trigger_reason = group-retired`, leaves consensus at once with the exit
   reason `group-retired`, and retires through the existing durable
   retirement owner (lifecycle reason `group-retired`). No conf change is
   proposed for the group: the row-driven reconcile skips a group-retired
   row. No member is ever removed down to a last voter.
4. A source whose persisted participant finished mirroring never resumes its
   replication worker (no orphaned leader re-runs the workflow).

## The backstop

The 30 s consensus-exit bound stays, as an alarm only. If it ever fires it
logs at ERROR ("Consensus exit backstop elapsed ...") with the group, the
replica, the operation and the last witness read, and the removal proceeds
as before. Its firing on any group-retirement path is a defect.

## Recorded with this amendment

- Table drop has no distributed partition teardown at all (DROP exists only
  in the parser and the pgwire mapper). Out of scope; a finding for its
  owner.
- Message-group and WASM-service removal close the port; they have no conf
  change and are unaffected.
- A DISSOLUTION_FAILED dissolution is designed to be re-attempted when the
  source re-delivers CLEANUP_COMPLETED, but nothing produces that
  re-delivery: the only source-side path (leader resume) re-ran the whole
  replication and was rejected (run 3: `stale_fence`), and now does not run
  at all for a finished source. A REMOVE lost in transit therefore leaves
  its replica running until something re-dispatches the dissolution. The
  re-dispatch itself, when it comes, retires it as a unit (witness W4). The
  re-dispatch trigger is an open owner decision (owner-side retry of a
  failed dissolution, or a restart-time check against the same record).
- "Replica canonical leader clear deferred" after a dissolution (run 3) is a
  separate owner (`settleCanonicalLeaderClearDebt`); not changed here.

Witnesses: `test/node/group-retirement-as-a-unit.test.js` (W1-W5, W7),
`test/partition/retiring-source-resume-refusal.test.js`, all red on
3626bdf43. Ordinary REMOVE unchanged: `replica-removal-consensus-exit.test.js`,
`replica-removal-leader-source.test.js`, and a recorded trace differential
against 3626bdf43.
