# Placement owner tenure: contract-first transition record (stage 1)

Writer: implementer `claude:placement-repair`, 2026-11-21. Base `974320ad3` (witness branch head),
branch `work/placement-owner-repair-20261121`. Authorised by the executed red tenure witnesses 3, 4, 5, 6, 8,
11, 12 (lab `pow-run3-bf0c6310`) and the owner's binding transfer contract (brief
`briefs/placement-owner-repair.md`). Markers: VERIFIED = read at the path named; INFERRED = reasoned.

## 1. Tenure identity and its owner

- Identity: the ledger replica's `leadershipTenure`, the frozen `{term}` object minted by
  `mintReplicaLeadershipTenure` at every leadership edge (`applyReplicaLeadership`) and on every term the replica
  observes while it leads (`renewReplicaLeadershipTenureOnTerm` on TERM_CHANGE), set to null by
  `endReplicaLeadershipTenure` on demotion (`applyReplicaDemotion`) and shutdown
  (`partition-service-lifecycle-methods.js:198`). VERIFIED `src/raft/replica-leadership-state.js:38-60,94-103,203-206`.
  It IS the owner-defined leadership tenure of the ledger replica (process-local, compared by identity; the CDC
  delivery owner and obligation lane of the same service already fence on it: `partition-cdc-delivery.js:67-71`,
  `partition-cdc-obligation-lane.js:57-69`). No second tenure notion is created.
- Owner of the identity: the ledger `PartitionService` (`replica_operations-p1`), producer
  `replica-leadership-state.js`. The placement owner only consumes it.
- How the placement owner obtains it: it reads `ledgerPartitionService.leadershipTenure` (the producer's single
  fact, null when not leading) (a) when the leadership sink activates it (`setLeader(true)`, driven by
  `driveRebalancerLeadershipSink` after the activation gate) and (b) when the ledger port announces TERM_CHANGE
  while the owner holds a custody (a renewal without a role edge). The owner wraps the token in a CUSTODY
  `{tenure, termStart, reconciled, running}`; a new token (by identity) is a new custody with its own
  LEADERSHIP_START. Not leading: no custody (`custody === null`); `isLeader` is derived: a custody whose tenure is
  the ledger's live tenure. The collaborator check requires the ledger to expose `leadershipTenure`
  (PartitionService sets it to null in its constructor, `partition-service-core-base.js:224`).
- TERM_CHANGE ordering (VERIFIED): the service subscribes its renewal at port creation
  (`wirePartitionRaftLifecycleEvents`), the owner subscribes when a custody begins (later); both ports iterate a
  listener Set in insertion order (`raft-rs-operation-port.js:406-418`, controllable port `subscribe`), so the
  renewal has run when the owner's listener reads the token. No partition wiring file changes.
- Tenure identity is never part of a durable identity: entry ids, attempt keys, intent keys and command bodies
  are unchanged; the pass hands the boundary a request `{entryId, body, pass}` and the boundary strips `pass`
  before the kernel call.

## 2. Where a pass captures it

`runPass` captures `this.custody` (and through it the tenure) at its first statement. The drain loop only calls
`runPass` while that custody is current, so the captured custody is the drain's own. Continuations keep the
`pass` object; every check compares `pass.custody === this.custody && pass.custody.tenure ===
ledger.leadershipTenure`.

## 3. Checkpoints (every one is a synchronous `isPassCurrent(pass)`; failing stops the pass, counted stale)

| Point | Where | What it prevents |
| --- | --- | --- |
| P0 pass start | first statement of `runPass` | a pass with no tenure (witness 12) |
| B barrier | before any census read | planning on an unapplied predecessor entry (witness 8) |
| A1 | after the LEADERSHIP_START CDC drive, before the reconciliation census | witness 3/4 work |
| A2-pre | before the hold-release attempt is resolved (local attempt row) | authoritative action |
| A2 | after the hold release, before the census re-read and s5-s8 | construction/capacity work |
| C per candidate | `shouldStopPlacementPass` reads `isPassCurrent(pass)` instead of the boolean | next candidate |
| A3r1, A3r2, A3r3 | after each `canAdmitRemove` await (rows, projection, floor) | the next workflow read |
| A3 | after `isCandidateAdmissibleNow` returns | the admission attempt |
| A4 | after the admission answer, before the retained-REFUSED re-admission and before A5 | A4', A5 |
| A4' | after the re-admission answer | loop continuation |
| A5-pre | before the ledger-class hold-release attempt is resolved | authoritative action |
| A5 | after the hold release (the loop's next C check; the pass stops anyway after a ledger admission) | |
| F fence | admission boundary and release boundary (below) | the proposal itself |

## 4. The fence at the actual admission boundary

`this.admitPlacement` and `this.releasePlacementHold` become `(request) => this.proposeWithinTenure(request,
propose)` where `propose` is the injected submitter or the default `requestPlacementAdmission` /
`requestPlacementHoldRelease`. `proposeWithinTenure` checks `isPassCurrent(request.pass)` and then calls
`propose({entryId, body})` in the same synchronous turn. VERIFIED no await lies between that check and the
native `raft.propose`: `requestPlacementCommand` (async, no await) -> `proposePlacementCommand` (sync:
leadership refusal, committed-command admission, settled-outcome read, pause, pending check) ->
`startPartitionRaftWriteCommit` (sync) -> `executePartitionRaftWriteCommit` -> `executeHandedOffWriteCommit` ->
`waitForCommittedWrite` (sync) -> `handOffToConsensus` -> `proposeWithinDeferralBudget` ->
`runRetryableControlPlaneWrite` (calls its executor synchronously on the first attempt,
`retryable-control-plane-write.js:136-165`) -> `proposeUnlessDeferred` -> `service.raft.propose(entry)`; every
async function on that chain runs synchronously up to its first await, which is after `raft.propose`
(`partition-placement-admission.js:221-280`, `partition-service-raft-write-commit.js:83-96,242-262,313-371,465-484`).
The fence answer is the write kernel's typed NOT_LEADER refusal (`PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER`,
clearing trigger LEADERSHIP_START in the existing table) with `tenureFence: 'TENURE_ENDED'`, nothing proposed:
the deciding tenure is not the ledger's leadership. The fixture's admission hold sits inside the wrapper of
`owner.admitPlacement`, i.e. between the last planning check and this fence: the fence runs after the hold.

STOP item for the kernel's writer (not edited; `partition-service-raft-write-commit.js` is another writer's): a
write the port DEFERS (`TRANSFER_IN_PROGRESS`, `USER_TRANSACTION_OPEN`) or PARKS (reserved partition) is proposed
again after an await (`proposeWithinDeferralBudget` sleep; `readmitReservedWrites`). A role edge releases it
(`releasePendingWrites` on FOLLOWER/CANDIDATE), but a tenure renewed WITHOUT a role edge does not, so the
re-proposal enters consensus under the renewed tenure. Exact edit needed: release the never-handed-over pending
writes on a renewal as on leadership loss, e.g. in `wirePartitionRaftLifecycleEvents` pass
`onTermChange: ({term}) => { if (service.isLeader === true) service.releasePendingCommittedWrites((pending) =>
pending.proposalState === QUEUED ? buildReleasedPendingWriteAnswer(pending, service.partitionId, {cause:
LEADERSHIP_LOST}) : KEEP); }` (or the kernel's equivalent: refuse `markCommittedWriteProposal(PROPOSED)` for a
write registered under another tenure). Not demonstrated by an executed witness; recorded, not repaired.

## 5. Term-start barrier

- Fact: `ledger.raft.readStatus().currentTermApplied` (VERIFIED `raft-rs-status-observation.js:96-110,143`): the
  replica leads and the core's applied index passed its pending-configuration index, which raft-rs sets to the
  last log index when it becomes leader, so an entry of the current term has committed and been applied. The
  core's applied index advances only after the partition applied the committed entries
  (`raft-rs-runtime-owner.js finishReady`: `applyEntries` precedes `advance_apply`), so it is LOCAL application.
  The barrier also requires `status.term === custody.tenure.term`.
- Wake: `RAFT_EVENT.APPLIED_PROGRESS` of the same port (emitted after a newly applied position is published,
  `raft-rs-runtime-owner.js:1423-1430`), subscribed for the custody, notifying a new trigger
  `PLACEMENT_TRIGGER.TERM_START_APPLIED` (a trigger, not a waiting reason: no row is added to
  `PLACEMENT_CLEARING_TRIGGER`).
- Per custody: `termStart` PENDING -> APPLIED once; while PENDING every pass stops at B (`stoppedAt:
  TERM_START_BARRIER`); the LEADERSHIP_START reconciliation runs in the first pass past the barrier
  (`custody.reconciled`), not only in the pass whose trigger set names LEADERSHIP_START.
- After the barrier the pass re-checks the custody (same tenure still current) before reading the census.
- No dependence on SERVICES publication, PARTITIONS rows or formation readiness: the read is the ledger's own
  port status (witness 9 becomes non-vacuous).
- STOP item for the shared test double (`test/test-helpers/controllable-consensus-port.js`, not edited): its
  `readStatus` omits `currentTermApplied`, so every test that leads a ledger with the double and attaches a
  placement owner stops at the barrier. Exact edit needed (one field, the double's lone-leader semantics: it
  applies every command it commits): in `readStatus` add
  `currentTermApplied: this.currentTermApplied ?? this.role === RAFT_ROLE.LEADER,` and initialise
  `this.currentTermApplied = null` in the constructor (a suite modelling a term start sets it). The authority
  fixture (in scope) models the term start itself (section 9).

## 6. Obsolete continuations: termination and the bound

- An obsolete pass never acts: every action is behind a checkpoint, the proposal behind the fence.
- Work between two checkpoints: zero planning steps after any await. The checkpoint is the first statement after
  every await in `runPass` and its callees (A1, A2, A3r1-3, A3, A4, A4', A5), so an obsolete continuation
  executes at most: the resolution of its awaited promise, one `isPassCurrent` read, the stale count, return.
- Where an obsolete pass can be suspended and how the wait ends:
  (i) A1, the LEADERSHIP_START CDC drive: single-flight per owner. A custody starts a drive only if no drive this
  owner requested is still unanswered; otherwise the request is JOINED (the CDC owner's own single-flight
  contract, `partition-cdc-obligation-delivery.js:600-615`) and the pass does not wait. So at most ONE pass per
  node is suspended at A1, whatever the number of transfers; it ends when the drive answers.
  (ii) A2/A4/A4'/A5, the ledger write answers: released by the write kernel on leadership loss (role edge) or
  answered at commit/deadline (renewal without role edge), bounded by the kernel's commit deadline.
  (iii) A3r1-3, the workflow owner's authoritative reads: bounded by the control-plane read's own timeout
  (`REMOVE_SAFETY_READ_QUERY_OPTIONS`, INFERRED from `buildControlPlaneQueryOptions`).
- Bound after N transfers on one node: outstanding obsolete passes <= 1 (A1) + those in (ii)/(iii), each of which
  ends within its own bounded wait; no trigger, timer, listener or attempt row is added per transfer (listeners
  and triggers are custody-scoped and removed when the custody ends). Witness: tenure 13 (N = 6, every drive
  held) and the await-point witnesses.

## 7. The successor is not queued behind an obsolete pass (witness 5)

The drain is per custody: `custody.running`. A new custody starts its own drain at once; an obsolete drain's loop
condition (`isCustodyCurrent`) is false, so it takes no trigger and exits after its current pass, which stops at
its next checkpoint. `pendingTriggers` is cleared when a custody begins or ends. `awaitCurrentWorkIdle` awaits the
current drain and every obsolete drain still running.

## 8. Demotion ordering (witness 12)

VERIFIED `applyReplicaDemotion` ends the tenure (`endReplicaLeadershipTenure`) BEFORE it clears the local leader
projection (`clearReplicaLeaderUpdateState`), whose cache apply raises PARTITIONS_CHANGED. The defect was the
owner keying on its boolean, lowered later by the sink. Fix in the owner: `notify`, `handleCacheChange` and the
drain start only for a custody whose tenure is the live tenure, so the projection's change after the tenure ended
starts no pass. No change to the producer's order is needed.

## 9. Inherited work

Operations already admitted are census rows; a successor's pass past its barrier sees them as busy and never
recreates them. Earlier proposals that commit before the barrier are applied before it (the barrier requires an
own-term entry applied after them) and are reconciled by `reconcilePlacementAttempts` under their own entry ids;
an unresolved attempt fenced at the boundary was never proposed and is reused under the same id by the next
same-intent pass. Admission identity (entryId, fingerprint, operation id from the log index) is unchanged.

Fixture model (in scope, `placement-owner-authority-fixture.js`, evidence ceiling extended): the ledger log
appends an empty TERM-START entry when a leader is elected or renews its term; a node applies it in order (a
held node applies an empty entry only when nothing earlier is unapplied, so `hold` keeps delaying COMMAND
application); each ledger replica's port status reports `currentTermApplied` from that log; APPLIED_PROGRESS is
emitted when a node's applied position advances. Records are attributed to the pass by async context
(AsyncLocalStorage), exact under concurrent passes.

## 10. Observation (diagnostic only, never read by a decision)

`lastPassSnapshot` keeps `state`, `reason`, `clearingTrigger`, `admitted`, and adds `passSequence`, `triggers`,
`tenureTerm`, `stoppedAt`, `evaluated`, `candidates`, `waiting` (reason -> partition ids), `capacityChecks`,
`proposals`, `refused` (reason -> n) and `totals` (cumulative: passes, completed, stale stops by checkpoint,
fenced (rejected at the boundary), proposals, admitted, refused by reason, capacity checks, constructions). Stale
work and rejected attempts are counted apart from proposals and admitted operations.

## 11. Checklist (solver-quests contract-first)

1 producer `applyReplicaLeadership`/`renewReplicaLeadershipTenureOnTerm`/`applyReplicaDemotion`; port status
`currentTermApplied`, APPLIED_PROGRESS, TERM_CHANGE; consumer `ReplicaPlacementOwner`. 2 shapes: tenure token
(producer's), custody and pass (owner-private), observation (owner). 3 identity: tenure by object identity, term
inside; entry id unchanged. 4 ordering: one raft log; barrier = own-term entry applied locally. 5 absent: no
custody (named `NO_TENURE`), barrier pending (`TERM_START_BARRIER`), fenced (`TENURE_ENDED`). 6 commit:
apply of the placement entry (unchanged). 7 retained: unresolved attempts (local table, reconciled once per
custody), admitted operations (ledger). 8 wake/cleanup: custody-scoped listeners (cache, ledger, node authority,
storage, TERM_CHANGE, APPLIED_PROGRESS) removed when the custody ends.

Files changed outside `replica-placement-owner*.js`: none in `src`. Tests: `placement-owner-authority-fixture.js`,
the new `placement-owner-authority-await-points.test.js`.

## 12. As implemented (commits on `work/placement-owner-repair-20261121`)

- `c30195b7d` witnesses first: `test/rebalancer/placement-owner-authority-await-points.test.js` (A4->A5, A2, A3
  REMOVE) and the fixture model of section 9; expected red on that commit.
- `aae3106ad` the repair: `replica-placement-owner.js` (custody, checkpoints, fence, barrier, per-custody drain,
  single-flight A1), new `replica-placement-owner-tenure.js` (custody, barrier read, fence answer),
  `replica-placement-owner-pass-observation.js` (lastPassSnapshot observation), `-collaborators.js` and
  `-capacity.js` (pure moves to stay under 800 lines; the ledger collaborator must expose `leadershipTenure`),
  `-constants.js` (trigger `TERM_START_APPLIED`; no clearing-table row). No partition or raft file changed: the
  owner reads the token from the ledger service and subscribes TERM_CHANGE / APPLIED_PROGRESS on the ledger port
  for the custody's lifetime.
- Observation detail: `totals.admitted` counts ADMITTED answers received (a settled entry replayed under its id
  is counted again); `fenced` counts submissions stopped at the boundary; `refused` the kernel's and the
  applier's refusals by code; `staleStops` per checkpoint; `waits` per wait (TERM_START_BARRIER, NODE_AUTHORITY);
  `leadershipStartDrivesJoined`.

## 13. Stop items: edits needed in files outside this writer's scope (not made)

1. Write kernel (`partition-service-raft-write-commit.js` / lifecycle wiring), section 4: release never-proposed
   (QUEUED or parked) pending writes on a tenure renewal without a role edge, or refuse their later
   `markCommittedWriteProposal(PROPOSED)`; otherwise a deferred or parked write is proposed under the renewed
   tenure. Not witnessed.
2. Shared double `test/test-helpers/controllable-consensus-port.js`, section 5: `readStatus` must report
   `currentTermApplied` (e.g. `currentTermApplied: this.currentTermApplied ?? this.role === RAFT_ROLE.LEADER,`,
   constructor `this.currentTermApplied = null;`). Without it every placement owner on a plain double waits at
   the barrier for ever: `test/rebalancer/replica-placement-owner-test-support.js` (all its onLedgerLeader
   owners), `test/raft/raft-rs-backend/formation-placement-lease-authority-fixture.js`,
   `test/raft/raft-rs-backend/formation-learner-placement-reversal.test.js`,
   `test/partition/placement-retained-row-repair-fixture.js`, `test/convergence/formation-placement-drain-scenario.js`
   (INFERRED from their construction; to be measured).
3. Stub ledgers without a tenure now fail construction with REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID
   (ledgerPartitionService): `test/rebalancer/replica-placement-owner-core.test.js` `createRealSqlLedgerHarness`
   and `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js` (~line 1432) need
   `leadershipTenure: Object.freeze({term: 1})` and `raft: {readStatus: () => ({term: 1, currentTermApplied: true}),
   subscribe: () => () => {}}` on the stub (and leadership given through `owner.setLeader(true)`).
4. `test/partition/placement-growth-dispatch-identity.test.js:317` assigns `owner.isLeader = true` (now a
   derived getter: TypeError) and calls `runPass` without a custody: replace with `owner.setLeader(true)` and
   `await owner.awaitCurrentWorkIdle()` (with item 2 in place).

## 14. Executed (tv-dator, check base 0dbed1718)

- `lab/por-red-c30195b7` (witness commit, pre-repair src): await-points 3/3 RED for the intended properties;
  tenure verdicts identical to `pow-run3-bf0c6310` (3,4,5,6,8,11,12 red; 1,2,7,9,10,13 green).
- `lab/por-repair-aae3106a` (repair): tenure 1-12 GREEN, 13 RED on `timers` only (4 after transfer 3, 5 after
  5; passes 2/2, drives 2/2, triggers 0, writes 0, attempts 0 flat); await-points 3/3 GREEN; negatives,
  disruptions, five-nodes GREEN; wakes 1 GREEN, 2-5 RED (stage 2, unchanged); construction 1-3 GREEN, 4-5 RED
  (stage 3, unchanged); provisioner RED (unchanged, not established).
- `lab/por-diag-6d443fd7` (timer census, diagnostic only): every live timer after transfers 3-6 is the admitted
  operation's execution (workflow `deferDispatchRetry` 100 ms, replica-dispatch deferred retry 250 ms x3, and
  from transfer 4 one workflow `deferTransitionRetry` 250 ms); none from a `replica-placement-owner*` module;
  constant at 5 from transfer 4 to 6. The deficit is now admitted at transfer 3 (inside the loop), so the
  witness's transfer-3 versus transfer-5 comparison straddles the admitted operation's start. Ruling needed.
- `lab/por-outofscope-base-974320ad` vs `lab/por-outofscope-6d443fd7`: regressions caused by the contract change
  (sections 13.2-13.4 plus the drain scenario's stub ledger): dt-placement-owner-formation-drain 3->11 red,
  placement-growth-dispatch-identity 0->1, formation-learner-placement-reversal 0->3,
  formation-placement-lease-authority 0->4, formation-placement-native-retirement 0->24,
  growth-promote-authoritative-completion-and-progress 1->2, replica-placement-owner-core 1->7. Unchanged
  (pre-existing): placement-retained-leadership 3, placement-retained-row-repair 30, clearing-triggers F11 1
  (`retained_*` rows mapped to null; not touched here).

## 15. Stage-1 follow-ups (lead rulings 2026-11-21)

### Witness 13 re-staged (for the verifier): the changed assertion, before and after
Before (`974320ad3`..`6d443fd7a`): for the pairs (transfer 3, 5) and (4, 6), each of `inFlightPasses`,
`pendingTriggers`, `pendingWrites`, `unresolvedAttempts`, `heldDrives` and `timers` (every live Timeout of the
process, `process.getActiveResourcesInfo()`) must not grow.
After: the five fields keep exactly that assertion; `timers` is replaced by two assertions over the fixture's
timer census (`aliveCreators`, every ref'd timer created during the world, with its synchronous creation stack,
64 frames):
(a) the number of live timers whose creation stack holds a frame of a `src/rebalancer/replica-placement-owner*`
module is the same after EVERY transfer (1..6);
(b) the total number of live timers is the same after every transfer from the one after the deficit's admission
through the last (at least two transfers; if no admission happens inside the loop, from transfer 3 as before).
What the attribution cannot see (stated in the test): a timer a collaborator arms after an await on the owner's
behalf (its stack starts at the collaborator's continuation), and unref'd timers.

### Invalidated callers (scope extended by the lead)
`test/test-helpers/controllable-consensus-port.js`: `currentTermApplied` in `readStatus`
(`this.currentTermApplied ?? this.role === RAFT_ROLE.LEADER`, field initialised to null), header: "the term-start
entry is treated as already applied whenever the double leads; a test that needs the barrier sets
currentTermApplied explicitly"; and `leadingLedgerStubFields(term)`, the one stub shape
(`{leadershipTenure, raft: {readStatus, subscribe}}`) used by the core harness, the growth-promote stub and the
drain scenario (which keeps its richer port and takes the tenure and `subscribe` from it, adding
`currentTermApplied` to its own status). `placement-growth-dispatch-identity.test.js`: `owner.setLeader(true)` +
`await owner.awaitCurrentWorkIdle()` instead of assigning `isLeader` and calling `runPass`. No assertion changed.

### Kernel witness (stop item 1)
`test/rebalancer/placement-owner-authority-write-kernel.test.js`: the port defers the old tenure's admission once
(TRANSFER_IN_PROGRESS), the deficit is satisfied, the tenure is renewed without a role edge; the entry must not
be proposed under the renewed term. Parked (reserved-partition) writes are the same kernel path
(`readmitReservedWrites`) and are not witnessed separately. Exact kernel edit needed (kernel writer): on a tenure
renewal while leading, release the pending writes not yet handed to consensus (proposal state QUEUED, and parked
ones) with the LEADERSHIP_LOST answer, exactly as `releasePendingWrites` does on FOLLOWER/CANDIDATE; e.g. in
`wirePartitionRaftLifecycleEvents` pass `onTermChange` that, when `service.isLeader === true`, releases those
writes; or make `proposeUnlessDeferred` refuse to re-propose a write registered under an earlier tenure.

## 16. Stage 2 (wakes): transition record

Authorised by the red wake witnesses (P1 LEADER_UNKNOWN explicit, P3(ii) missed wake, P3(i) a pass that throws,
P8 start path) and the lead's stage-2 ruling (scope: `src/rebalancer/replica-placement-owner*.js` and the
production factory in `src/bootstrap/shared/control-plane-setup.js`).

- Sealed contract (quest `replica-placement-admission-owner`, constraint `no-timer-no-bound-no-retry`, quoted):
  "No timeout, bound, retry count, delay or polling interval is added or changed to obtain liveness. The
  placement owner arms exactly one timer, the resync (PLACEMENT_RESYNC_INTERVAL_MS, declared once), and the
  reproducer runs with it never firing; every admission in the reproducer is caused by a committed change
  delivered in the same step. [...] In acceptance runs the counter placementResyncAdmissions is 0."
- Resync: the production factory (`ControlPlaneSetup` placement-owner factory, ~:415) passes
  `setIntervalFn`/`clearIntervalFn` over the ledger's own `timeSource` (the owner's time source); the owner arms
  it at custody begin (`attachListeners`, cadence `PLACEMENT_RESYNC_INTERVAL_MS` = 60 s, declared once in the
  owner) and clears it at custody end (`detachListeners`: demotion, renewal, shutdown, detach). Its fire is
  `notify(RESYNC)`, gated like every wake by the custody (`isLeader`); a fire after the custody ended starts
  nothing. No second scheduler. Not covered: the coordinator's factory-less fallback
  (`rebalance-coordinator-operation-creation-support.js` ~:639) arms no resync; it is removed in stage 3 (stop
  item, not edited).
- A pass that throws: `runPass` records it (stoppedAt `ABORTED`, `failure`, `retainedTriggers` in the snapshot,
  `totals.failedPasses`), the drain retains its triggers in the custody (`retainedTriggers`), logs at warn and
  ends; the next pass of the custody (started by the next wake: any trigger or the resync) runs with them. The
  bound on repeated throwing: a pass starts only from a wake, and a throw ends the drain, so at most one throwing
  pass per wake; in a quiet cluster one per resync interval (60 s). No spin, no new timer. Retained triggers die
  with their custody (a new custody starts with LEADERSHIP_START).
- LEADER_UNKNOWN: the pass observation names the wait (`waiting.LEADER_UNKNOWN: [partitionIds]`, stage 1); its
  declared clearing trigger becomes `PARTITIONS_CHANGED` (the target's PARTITIONS `leader_node_id` publication
  is the fact that ends it; SERVICES rows carry follower roles only). One row of `PLACEMENT_CLEARING_TRIGGER`;
  no other reader of that row in `src`.
- Start path: the custody's one leadership-start reconciliation requests the ledger's CDC drive and does not wait
  for it (single-flight per owner kept: an unanswered request is joined); a drive failure is counted
  (`totals.leadershipStartDriveFailures`) and logged; the first pass plans from live custody right after its
  term-start barrier. Consequence for stage 1: await A1 no longer exists. Tenure witnesses 3, 4 and 5 hold the
  LEADERSHIP_START drive to suspend a pass at A1; that suspension no longer happens, so their schedules lose
  their premise (see the executed result). They need the lead's ruling (re-stage at another await or retire with
  the await); not re-staged here.
- Moved for the size threshold: `canAdmitRemove`'s body to `replica-placement-owner-remove.js` (unchanged
  checkpoints).

## 17. Executed after the rulings (tv-dator, check base 0dbed1718)

- `lab/por-followup-7d678b8a` (stage-1 follow-ups): tenure 1-13 GREEN (13 with the re-staged timers);
  await-points 3/3 GREEN; kernel witness RED as predicted (entry deferred at term 2, re-proposed by the kernel at
  term 3, ADMITTED although the deficit had been satisfied); the seven files back to their exact base red sets
  (core [18], drain [4,10,11], growth-promote [7], dispatch-identity / learner-reversal / lease-authority /
  native-retirement green), base `lab/por-outofscope-base-974320ad`.
- `lab/por-wakes-red-9687e4d1` (stage-2 witness commit, stage-1 src): wakes 2-6 RED (6 = resync/custody:
  `intervals: []`, production armed no resync), 1 GREEN.
- `lab/por-stage2-b92a5d6c` (stage-2 repair): wakes 1-6 GREEN; tenure 1, 2, 4-13 GREEN, 3 RED ("the admitting
  entry was proposed by n2": n1 admitted under its own live tenure before the transfer, because the start path
  no longer waits on the held CDC drive: witness 3's premise, a pass suspended at A1, no longer exists; 4 and 5
  still pass but their A1 hold now suspends nothing); await-points GREEN; negatives, disruptions, five-nodes
  GREEN; the seven at their base verdicts; clearing-triggers F11 RED as at base (other writer's rows);
  construction 4-5 RED (stage 3); provisioner RED (not established); kernel witness RED (kernel writer).

## 18. Tenure witnesses 3, 4, 5 re-staged (lead ruling: re-stage, do not retire)

Only where the pass is held changed; every assertion is kept. Fixture: `holdNextAdmissibilityCheck(node)` holds
the owner's next `isCandidateAdmissibleNow` (await A3) after recording it.

| Witness | Before (`aae3106ad`..`b92a5d6ce`) | After |
|---|---|---|
| 3 (suspended across a graceful transfer: no construction/capacity after the tenure ended; successor n2 admits) | `holdNextLeadershipStartDrive(a)`: A1, the leadership-start CDC drive | `holdNextAdmissibilityCheck(a)`: A3. n1 is held BEFORE it can admit, so the successor still proposes the admitting entry (assertion kept) |
| 4 (A->B->A: the pass started under the first tenure admits nothing under the later one) | `heldAcrossABA(world, 'A1')`: drive held | `heldAcrossABA(world, 'A3')`: admissibility read held |
| 5 (the current tenure starts its own pass while the obsolete one is suspended) | same, `'A1'` | same, `'A3'` |

Why A3 and not A2 for witness 3: in the tenure world no await precedes construction any more (A1 is not awaited
since stage 2; A2 exists only with an engaged ledger copy hold, and seeding one makes `ledgerIncomplete` stop
every pass of both owners before the deficit, so the successor could not admit and the world would change). Held at
A3 the pass has constructed and read capacity under its live tenure; the kept assertions then require that
nothing of either follows the wait and that no admission attempt follows it (the check that would turn red).
A2 itself is witnessed in `placement-owner-authority-await-points.test.js` (A2 test). New in the tenure file:
"A1 request answered late": the drive the start path requests (not awaited) is answered after the custody
ended; no pass and no attempt follow on the deposed owner.

## 19. Merge note: the LEADER_UNKNOWN row of PLACEMENT_CLEARING_TRIGGER (lead ruling: confirmed)

`[PLACEMENT_WAITING_REASON.LEADER_UNKNOWN]: TRIGGER.PARTITIONS_CHANGED` (`b92a5d6ce`). `LEADER_UNKNOWN` is a
WAITING state (not a definite refusal: it never maps to null), and its trigger is `PARTITIONS_CHANGED`, the
target's `leader_node_id` publication that ends the wait (executed: wakes P1 green on `b92a5d6c`). Branch
`work/placement-outcome-format-20261121` also edits this table and pins the "definite" (null) codes in
`replica-placement-owner-clearing-triggers.test.js`; a merge keeps this row as a waiting state with trigger
PARTITIONS_CHANGED.

## 20. For the kernel's writer: the re-proposal gap (do not lose this)

Probe: `test/rebalancer/placement-owner-authority-write-kernel.test.js`, RED on `7d678b8a` and `b92a5d6c`
(entry deferred at term 2, re-proposed by the kernel at term 3 and ADMITTED although the deficit had been
satisfied). Mechanism (VERIFIED read, `partition-service-raft-write-commit.js`): `proposeUnlessDeferred`
(:83-96) marks the write PROPOSED, proposes, and on a typed port deferral marks it QUEUED again;
`proposeWithinDeferralBudget` (:105-121) re-runs it after `runRetryableControlPlaneWrite`'s sleep for up to
`USER_TRANSACTION_WRITE_DEFER_BUDGET_MS` (2 s); a parked write (reserved partition, `parkReservedWrite` :265)
is handed over later by `readmitReservedWrites` (:280-291). The only release that stops both is
`releasePendingWrites` in `partition-service-raft-lifecycle-wiring.js` (:49-54), wired to FOLLOWER/CANDIDATE
(:87-114). A tenure renewed without a role edge (`renewReplicaLeadershipTenureOnTerm`,
`replica-leadership-state.js` :53-60, TERM_CHANGE :203-206) releases nothing: `wirePartitionRaftLifecycleEvents`
passes no `onTermChange` (:61-128).

Candidate edits:
(A) `partition-service-raft-lifecycle-wiring.js` (:61-128): add `onTermChange` that, when
    `service.isLeader === true`, releases every pending write whose proposal state is QUEUED (never handed to
    consensus: deferred or parked) with `PARTITION_WRITE_RELEASE_CAUSE.LEADERSHIP_LOST`; writes already PROPOSED
    stay (their outcome is decided by the log). Needs a release filtered by proposal state (today
    `releasePendingCommittedWrites` releases all) and the parked map cleared for those entries.
(B) `partition-service-raft-write-commit.js`: record the replica's `leadershipTenure` on the hand-off when the
    write is registered (`executePartitionRaftWriteCommit` :313-322), and before every later hand-over
    (`proposeUnlessDeferred` :83-96 on a retry; `readmitReservedWrites` :280-291) refuse when
    `service.leadershipTenure !== handoff.tenure`: release that one write with the LEADERSHIP_LOST answer.
RECOMMENDED: (B). It states the invariant where it is violated ("a write registered under one leadership
tenure is never handed to consensus under another"), touches only writes that are actually re-proposed after an
await, needs no state filter over the whole pending set on every TERM_CHANGE, and covers a renewal that happens
while the write is between two attempts or parked. (A) is equivalent in effect for QUEUED writes but couples the
kernel to an event and needs a new filtered release.

Callers of the write kernel that can be deferred (every `startPartitionRaftWriteCommit` hand-over goes through
`proposeWithinDeferralBudget`) or parked (`park: isPartitionReserved(...)`), and what "released with the
LEADERSHIP_LOST answer" means for each (an unproposed release answers `failureCode` NOT_LEADER,
`partition-write-kernel.js` :95-116 and `buildReleasedPendingWriteAnswer` :391-408; a write already proposed
would answer OUTCOME_UNKNOWN, which (A)/(B) never produce here because they act only on unproposed writes):
1. Placement admission / hold release / repair, `partition-placement-admission.js:258` (deferred and parked):
   the owner gets NOT_LEADER (clearing trigger LEADERSHIP_START); the retained attempt stays and the current
   custody re-proposes it under the same entryId if it still wants it. Fencing here is REQUIRED (the probe).
2. Ordinary SQL writes, `partition-service-write-metrics-base.js:736` (`startAdmittedPartitionWrite`: deferred
   and parked): the requester gets the retryable NOT_LEADER and routes again (to the same node, now leading the
   new term). A user write encodes no tenure decision, so the release costs one retry and protects nothing; it is
   harmless (INFERRED from `RETRYABLE_WRITE_FAILURE_CODES`, `partition-write-kernel.js` :79; router retry not traced).
3. CDC acknowledgements (CDC_DELIVERED), `partition-cdc-obligation.js:410` (deferred, not parked): the lane is
   itself tenure-fenced (`partition-cdc-obligation-lane.js` :57-69: a new tenure resets it); NOT_LEADER ends the
   old lane's flush, the new lane re-derives owed acknowledgements. Harmless (INFERRED).
4. Coordinator settlement, `partition-coordinator-settlement.js:68` (deferred and parked): the settling
   coordinator gets NOT_LEADER and must retry the settlement until applied (durable-retry owner not traced).
5. Participant PREPARE / DECISION, `partition-participant-transaction-request.js:220,749` (deferred): the
   coordinator gets NOT_LEADER for that participant; PREPARE is retried or the transaction aborts; DECISION is
   retried until applied (not traced).
6. Formation transition command, `membership-publication-formation-transition-command.js:548` (deferred and
   parked, through `registerFormationPartitionApplyHooks`, `partition-service-entry-apply-base.js:73-82`):
   its caller gets NOT_LEADER and re-drives the transition (not traced).
Judgement for the next writer: only (1) carries a decision of the proposing tenure; for (2)-(6) the release is a
retry, not a correctness change. If any of (4)-(6) cannot tolerate an extra NOT_LEADER, apply (B) only to
placement commands (`PLACEMENT_ADMIT_TYPE`, `PLACEMENT_RELEASE_HOLD_TYPE`, `PLACEMENT_REPAIR_TYPE`) via an
option on `startPartitionRaftWriteCommit` set by `proposePlacementCommand`.

## 21. For stage 3's writer: construction

- Factory-less fallback: `rebalance-coordinator-operation-creation-support.js` (~:628-649,
  `attachLedgerReplicaPlacementOwner`; constructor call ~:639-648) builds the owner itself when no factory is
  bound; it passes no `setIntervalFn`/`clearIntervalFn`, so that owner arms NO resync (stage 2 armed it only in
  the production factory, `control-plane-setup.js` ~:415-433). Removing the optional-factory branch (stage B of
  the design) removes this gap.
- Who uses the fallback today: any coordinator built with `new RebalanceCoordinator` and never bound, e.g.
  `test/simulation/formation-sim-node-hosts.js:441` (used by the drain world). When binding becomes required,
  those hosts must bind the factory, and their ledger stub must then expose `timeSource.setInterval` /
  `clearInterval` (the drain scenario's stub timeSource has only `now`/`setTimeout`,
  `test/convergence/formation-placement-drain-scenario.js` ~:315), plus `leadershipTenure` and
  `raft.readStatus().currentTermApplied`/`raft.subscribe` (already given there via `leadingLedgerStubFields`).
- The owner now requires its ledger collaborator to expose `leadershipTenure` (construction fails typed
  otherwise) and reads `ledger.raft` only while it holds a custody (so attaching before the port opens is fine).
- Construction-order witnesses (`test/partition/placement-owner-construction-orders.test.js`): 1-3 GREEN, 4-5
  RED on every head of this branch (existing coordinator with partitions initialised before the factory binding:
  the existing-rebalancer branch precedes the placement guard; and ledger-first: the ledger builds a
  `UnifiedRebalancer` and later an owner because the attach returns null while the coordinator's
  `serveEligibilityOwner` is not yet instantiated). Those plain-double services never pass the barrier unless the
  double leads (it now reports `currentTermApplied` while leading), which those tests do not need.
- Shared double default (`controllable-consensus-port.js`): `currentTermApplied` is "applied whenever the double
  leads"; a construction witness that needs the barrier pending sets `port.currentTermApplied = false`.
