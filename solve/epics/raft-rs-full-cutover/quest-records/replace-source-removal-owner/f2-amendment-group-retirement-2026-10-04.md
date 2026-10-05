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

## Addendum (2026-10-04, later): the lost REMOVE

Lead decision on the item recorded above as open: "the WORKFLOW OWNER owns
completion of its own durable step - one owner, no second mechanism - with
the replica's own open/restart path as the fail-closed safety net."

- Owner side (`src/partition/group-retirement-redrive.js`): a dissolution or
  aborted teardown delivers to every member in one pass; when some did not
  acknowledge, the progress is recorded on the failed acknowledgement and the
  step is re-run by events - its own failed outcome (once, at once), a
  nodes-row change showing a ready heartbeat for a node hosting an
  unacknowledged member, and the finished source re-delivering its final
  acknowledgement on leader activation (owner restart or ownership change;
  the DISSOLUTION_FAILED -> CLEANUP_COMPLETED edge that was designed but had
  no producer, and a duplicate of the persisted status after an owner died
  mid-dispatch). A bounded backoff is only the fallback for a node no event
  reports ready, and each fallback run is a WARN naming the workflow, group
  and unacknowledged replicas. A superseded owner (evidence refused for
  workflow or fence) stops. The partition row is deleted and completion
  reported only after every member acknowledged.
- Replica side: a replica registered on open/restart reads its table's
  durable record authoritatively and, when the record retires its group,
  takes the same verified group-retirement REMOVE path. An absent or
  unreadable record is never evidence.
- Still open: an aborted child/target teardown has no durable step state, so
  its re-drive lives only in the owner process; after an owner restart it is
  resumed only by the replicas' own restart net. A lone un-notified survivor
  whose owner also restarted is listed nowhere until either restarts.

Witnesses: `test/node/group-retirement-redrive.test.js` (W4a-W4f).

## Addendum (2026-10-04, re-verification B1-B3): the frozen member set

Owner ruling (binding, fail-closed): absence, timeout, a deleted services or
nodes row, node eviction or NOT_FOUND is never proof a replica is gone, and
the workflow never completes on it. A member that never answers stays listed
with its alarm and the table stays blocked. Its only future exit is an
explicit durable operator retirement fact (a separate quest; it does not
exist yet).

- Members (`src/partition/group-retirement-members.js`): at the first
  dispatch of a retirement step the owner freezes the group's COMMITTED
  configuration (voters and learners), read from the group's leader through
  the committed-membership read the creation owner already uses
  (`readCommittedMembershipStamp` over the node's rebalance coordinator).
  Services rows are discovery only (decision O1). The set is stored on that
  group's participant checkpoint (`requiredReplicaIds`, beside
  `dissolvedReplicaIds`, with the members' addresses `memberNodeIds`)
  through the coordinator's participant persistence, under the participant
  fence rule. A member is done only on its own positive answer, recorded
  durably as it arrives. The step completes only when required is a subset
  of dissolved. An unreadable or empty configuration is "membership
  unavailable" (listed, re-run by the group's services/partitions row
  changes), never "no members". A member with no address is listed. A row
  only adds an address and never removes one. A record written before the
  set existed freezes it before anything completes.
- Re-drive: a services row change (written or deleted) of an unacknowledged
  member only re-runs the step. The earlier "member row deleted ends the
  step" semantics are removed.
- Replica side: a group-retirement REMOVE of a replica this node already
  removed (its own verified REMOVE or the open-time safety net) answers
  COMPLETED: the member's own answer, with its cleanup reconcile left as
  deferred debt. An ordinary REMOVE keeps answering that ERROR.
- Resume: split recovery restores the claim triple through the decode merge
  uses (`durableOwnershipClaimOf`). A resume never claims against a live
  foreign lease. A refused claim re-reads the durable row. A live foreign
  lease arms one timer at its expiry: logged once when armed, and a WARN
  spent wait when it fires on a still-retiring record. Otherwise one WARN
  per record version, and the next record change resumes it. A resume that
  throws is a WARN.

Consequences stated plainly:
- An aborted split whose child was never provisioned (no group, unreadable
  configuration) keeps that child listed as membership-unavailable. Its
  partition row is never deleted on that.
- A member that retired and released its row before any set was frozen
  (records written by earlier code) has no address and no recorded answer,
  so it stays listed (W4g).
- A member whose node restarted after it retired answers NOT_FOUND, which
  is not an answer. If its positive answer was not recorded first, it stays
  listed.

Witnesses: `test/node/group-retirement-liveness.test.js` (L1-L5 with the
production recovery, L3 inverted, B1, B2, B2b, B2c, B4, B5),
`test/node/group-retirement-redrive.test.js` (W4c, W4d, W4g),
`test/partition/group-retirement-resume-claim.test.js` (B3a, B3b, Mi, Mj,
Mk, RC, RF), all red on fd424741b except B3a merge, which was already
correct there.

## Addendum (2026-10-04, re-verification round 3): never-provisioned targets, membership fences, COMPLETED-only

Same binding ruling (fail-closed). It supersedes the first and third
"Consequences stated plainly" bullets of the previous addendum.

- Never-provisioned fact (`src/partition/target-provisioning-mark.js`): the
  workflow record carries `targetProvisioning` keyed by target partition id,
  written with the target ids. `none` is written only for ids the attempt
  minted itself; `dispatched` is made durable BEFORE the target's first
  replica create is sent (a failed write sends nothing). A retried plan
  carries the prior record's own marks; a reused id without one gets none.
  The teardown of an aborted child/target whose mark is durably `none`
  freezes an EMPTY required set with `neverProvisioned: true` on its
  participant and deletes its partitions row. `dispatched`, or no mark (a
  record written before the mark existed), stays "membership unavailable".
  A crash between the durable `dispatched` and the create leaves a row with
  no group listed forever: fail-closed by design. The event that can resolve
  it is the target's own group appearing (a services row of that group: a
  create that did land registers one and re-runs the teardown); if no create
  landed, nothing will, and its only future exit is the operator retirement
  fact (which does not exist yet).
- Membership fence: the frozen set comes from a RETIREMENT committed-
  membership read, which refuses a joint configuration and a pending
  configuration change (`pendingConfIndex > applied`) - "membership
  unavailable", re-run by the group's row events. Every membership change
  of a group its durable record retires is refused typed
  (`membership-change-group-retiring`) at the partition's one conf-change
  admission (`admitPartitionRaftPeer`, `proposePeerRetirement`,
  `retirePartitionRaftPeer`); the rebalancer skips planning for it
  (`group_retiring`) and its one creation boundary refuses it before
  persisting. The fence reads the durable record as the node's view holds
  it: a proposal at a leader whose view has not yet seen the record turn
  retiring is the residual window.
- A member is done only on COMPLETED (its replica durably retired):
  INITIATED and IN_PROGRESS keep it listed (typed
  `group-retirement-removal-in-progress`) and re-driven by its row events.
  A member still removing, or a node that no longer tracks it after a
  restart, answers COMPLETED from its own durable raft-rs lifecycle row:
  `retired` with reason `group-retired`, for the exact replica identity and
  group. No database, no row, another state or another reason (a
  `reseed-required` hold) answers nothing from it (NOT_FOUND stays
  NOT_FOUND). Ordinary REMOVE answers are unchanged.
- Resume: a refused claim with no live foreign lease re-claims once at once
  with the refreshed witness, at most once per record version.
- Re-drive: the group gaining a leader (its leader's services row, the
  partitions row's leader publication) is the named trigger for a
  membership-unavailable step. Only the fallback's own runs spend its bound.

Recorded, not changed:
- P8: the driver never renews its lease during a long retirement, so any
  record write after its lease lapsed lets another node claim (at most one
  claim per record change). Follow-up: renew during the re-drive.
- Participant persistence is an unconditional whole-metadata UPDATE (not
  compare-and-swap; pre-existing). A stale owner can roll back the fence,
  lease, frozen set or answered set. Wrongful completion stays impossible
  (answered ids come only from COMPLETED answers; required = ConfState
  united with answered), but it can cause redundant REMOVEs, a member listed
  forever, or "membership unavailable" forever. Follow-up: CAS on participant
  persistence.
- The removed-replica cleanup sweep deletes a row-less replica database at
  startup, and with it the lifecycle row the restart answer reads: a member
  whose database was swept before its answer was recorded answers NOT_FOUND
  and stays listed.
- Mid-flight upgrade caveat (text for the epic's unsupported-upgrade
  section): "A split or merge record written by code before the frozen
  member set (3626bdf43, fd424741b) that is mid-dissolution at upgrade, with
  a majority of the retiring group already retired and no frozen set on its
  participant, has no leader left to answer the committed-membership read:
  its step stays 'membership unavailable' forever. Likewise an aborted
  split/merge record written before the provisioning mark keeps a target
  that was never provisioned listed forever. Finish or abort every split and
  merge before upgrading; there is no in-place migration."

Witnesses: `test/partition/group-retirement-provisioning-mark.test.js`
(P1-P7, split and merge through `execute`), `test/node/group-retirement-
fences.test.js` (G2b-L learner, G2b-P pending change, G2b-A admission,
G2b-R rebalancer, C1 INITIATED, P5 lifecycle answer, P3 leader),
`test/partition/group-retirement-resume-claim.test.js` (P6), the
split-aborted-child (W5) and L4 sibling assertions now on the
never-provisioned fact; red on 74edc3d49 except G2b-L and P3 (already
held; they kill the mutants "learners ignored" and "leader event removed").
