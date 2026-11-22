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

## 22. Corrective round after independent verification (verify-placement-owner-tenure-wakes.md)

Corrections to earlier claims (section 3 and section 6 were not true of `b92a5d6ce`): there was no tenure check
after `await readPassCensus`, and after the barrier the custody was not re-checked (the A1 checkpoint that did it
was removed in stage 2). Both are added in the corrective repair commit. The await table at head (function
names; every await, with the check that follows it before the next authoritative action):

| # | Await (where) | Check that follows |
|---|---|---|
| 0 | none: pass start, then the term-start barrier's status read (synchronous; may run a consensus turn) | `PASS_START` before; `TERM_START_BARRIER` re-check after the latch (new) |
| 1 | `runPassSteps`: `await readPassCensus(pass)` | `AFTER_CENSUS` (new) |
| 1a | inside it, `submitReleaseIfCopyIdle`: `await submitHoldRelease` (A2; `BEFORE_HOLD_RELEASE` precedes, the fence is in the submitter) | in `submitPlacementAttempt`: `isPassCurrent` before any attempt bookkeeping; then `A2_AFTER_HOLD_RELEASE` |
| 1b | (A1 is no await since stage 2: the CDC drive is requested; its late answer only clears the owner's request slot) | witness "A1 request answered late" |
| 2 | `admitOrderedCandidates`: per candidate `CANDIDATE` check, then `await proposeCandidateIsolated` -> `proposeOrderedCandidate` | |
| 2a | `await isCandidateAdmissibleNow` (A3; for a REMOVE: `canAdmitRemoveUnderPass` awaits rows, projection, floor) | REMOVE: `A3_AFTER_REMOVE_ROWS`, `A3_AFTER_REMOVE_PROJECTION`, `A3_AFTER_REMOVE_FLOOR` after each read; then `A3_AFTER_ADMISSIBILITY` |
| 2b | `submitCandidateAdmission`: `await submitPlacementAttempt` (A4; fence in the submitter) | `isPassCurrent` before bookkeeping; `A4_AFTER_ADMISSION` |
| 2c | retained-REFUSED re-admission: `await submitPlacementAttempt` (A4') | `A4R_AFTER_READMISSION`; then `proposeOrderedCandidate` returns null unless current |
| 2d | `releaseAdmittedLedgerHold`: `await submitHoldRelease` (A5; `BEFORE_HOLD_RELEASE` precedes) | `A5_AFTER_LEDGER_HOLD_RELEASE` |

Witnesses per row: 0 tenure 12 and drain-start (barrier file); 1 census-read (await-points); 1a A2 (await-points);
1b tenure "A1 request answered late"; 2a A3 first read and third read (await-points), tenure 3/4/5 (A3 hold);
2b A4->A5 (await-points), tenure 6/11 (boundary); 2c none (no schedule produces a retained REFUSED across a
transfer here); 2d A4->A5 (await-points).

Drain start (verifier finding 3b): `drainQueue` now assigns the custody's running promise before calling the
drain, so no status read (foreign code) lies between deciding to drain and marking it; stated in the code.
Witness: barrier file, "drain start" (a status read that announces applied progress inside the first pass's
barrier); red before (`maxInFlight` 2), green after.

Throw path (typed: `proposeCandidateIsolated` answers the named `CANDIDATE_FAILED`, never a default): (i) P3(i) now makes retention observable: after the throw a SERVICES change (any wake, well before
the 60 s resync) runs the next pass, which must carry the failed pass's triggers and admit, with
`placementResyncAdmissions` 0; removing retention fails it. (ii) Per-candidate isolation: a failure thrown while
proposing ONE candidate (`proposeCandidateIsolated` around `proposeOrderedCandidate`) is recorded for that
partition (`failedCandidates` in the snapshot, `totals.failedCandidates`, warn log) and the pass goes on with
the others; the pass's triggers are retained for the next wake. A failure outside the candidate loop (census,
node inputs, capacity read, construction) still aborts the pass as before. Bound on repeated failures per
candidate: one per pass, a pass only per wake, so at most one per wake and, on a quiet ledger, one per resync
interval (60 s); retention never starts a pass by itself (the drain loop continues only on new triggers).
Witness: wakes "poisoned candidate" (red before: the whole pass aborted, the other partition starved).

Re-staged 3, 4, 5 (premise asserted, second candidate added) and 13: section 18 table plus: 3, 4, 5 use
`SPEC_TWO` (a user partition ordered after the priority deficit) and assert the held pass is not done when the
successor is measured; 4 also asserts one stale stop at `A3_AFTER_ADMISSIBILITY` on the same node and that the
admission's deciding tenure is the current one; 5 asserts the admission while the held pass is outstanding.

Witness 13, restated bound at head (asserted): A1 no longer suspends a pass. An obsolete pass can be suspended
only at a write answer (A2/A4/A4'/A5) or a REMOVE read (A3). On a role-edge transfer the write kernel releases
every pending write of the deposed replica at once (`releasePendingWrites`, LEADERSHIP_LOST), so an obsolete
pass suspended at a write answer ends at the transfer: after each transfer exactly one pass and one write are
outstanding (the current custody's), no obsolete pass. 13 now drops the leader's admission of the deficit at
every transfer (proposed, never committed) and asserts that bound at all six transfers, keeps the five
outstanding-work fields' comparison and the timer assertions, then admits on a seventh transfer. Not bounded by a
constant (stated): a renewal without a role edge does not release the write (kernel gap, section 20: ends at
commit or the commit deadline); a REMOVE read ends at its read timeout (INFERRED, not executed).

## 23. Barrier: its wake, and the fact it reads (verifier finding 1)

- Wake witness (barrier file, "barrier wake"): the custody's term start is withheld; its passes stop at the
  barrier with no construction and the snapshot names `TERM_START_BARRIER`; then only APPLIED_PROGRESS (the
  port's announcement, nothing else) starts the first planning pass, which admits.
- The fact: unchanged in the owner (`currentTermApplied`, read only while PENDING, latched on the first true
  read). Production defines it as leader and applied > pendingConfIndex
  (`raft-rs-status-observation.js:106-113`), false again while the leader's last applied entry is its own
  configuration change. The authority fixture now models exactly that (`LedgerLog.currentTermApplied`,
  `appendConfigurationChange`); the shared double's header states both definitions and that the raft owner is
  correcting the field to "the leader has applied an entry of its own term" (applied term == current term).
- Acceptance witness for the raft owner (barrier file, "barrier and the production definition"): the leader's
  configuration change applies inside the activation holdoff, the custody then begins on a quiet ledger; the
  first planning pass must start. RED today for the stated reason (the barrier reads false, nothing advances the
  applied index, so no APPLIED_PROGRESS). Hosted on the fixture's port, not a real raft group: no cheap fixture
  hosts the owner on a real rs-raft ledger group (`PartitionNodeCluster` gives real ports but no
  PartitionService). When the raft owner changes the field, the fixture's model must change with it
  (drop the pendingConf floor: true once an entry of the current term applied), and this witness turns green.

## 24. Additions for the kernel's writer (verifier finding 2 and 3a)

- Third unfenced case: a proposal queued INSIDE the port because the group was busy
  (`src/raft/raft-rs-runtime-owner.js:2146-2150`, per the verifier; not traced here) is handed to the core later
  and is not released by a renewal without a role edge either. Edit (B) of section 20 covers it only if the
  tenure comparison happens where the port finally proposes; otherwise the raft owner must refuse a queued
  proposal whose submitting tenure is no longer current.
- Between the owner's fence and `raft.propose` there is no await, but `proposePlacementCommand` begins with
  `partitionWriteLeadershipRefusalOf` -> `service.raft.readStatus()`
  (`src/partition/partition-placement-admission.js:222`, `partition-service-raft-write-commit.js:420-431`),
  and a status read can run a full consensus turn synchronously (drain inbound, apply, announce). A demotion
  inside it is caught by the kernel's role check on the returned status; a renewal inside it is not (judged
  unreachable for a multi-voter group by the verifier, INFERRED). The kernel's writer should compare the
  submitting tenure after that read, at the propose, if it takes edit (B).
- Classification (verifier): the gap violates "no fresh placement decision authorized by an expired tenure",
  not "no duplicate admitted operation".

## 25. Executed, corrective round (tv-dator, check base 0dbed1718)

| Item | Witness | Red before (`lab/por-corrective-red-87a34cb4`, src at `b92a5d6c`+tests) | After (`lab/por-corrective-8e84e280`) |
|---|---|---|---|
| A | tenure 3, 4, 5 (A3 hold, premise, second candidate), 13 (A4 suspension at every transfer, bound asserted) | green (re-staging, no behaviour change) | green |
| B | await-points "census read" | RED (construction after the tenure ended) | green |
| B | await-points "A3 REMOVE, third read" | green (the check existed) | green |
| C | barrier "drain start" | RED (max in flight 2) | green |
| D(i) | wakes P3(i) with retention observable | green (retention existed) | green |
| D(ii) | wakes "poisoned candidate" | RED (the other deficit starved) | green |
| E | barrier "barrier wake" | green | green |
| F | barrier "production definition" | RED (custody never plans) | RED, expected until the raft owner corrects the field |
| - | write-kernel probe | RED | RED (kernel writer) |

Unchanged elsewhere on `8e84e280`: negatives, disruptions, five-nodes, growth-dispatch green; construction 4-5 RED
(stage 3); core [18] and drain [4, 10, 11] RED as at base `974320ad3`. Earlier: `lab/por-restage-abd8506f`
(re-staging at A3 without premises) tenure, await-points, wakes green; superseded by this round. Passing files
print no per-case lines in the runner log (verifier condition 7 open: the runner prints subtests only for
failing files).

## 26. Stage 3: transition record (writer: stage-3 writer, from head 8e84e2801; rule set and owners as loaded from
## CLAUDE.md, docs/steering/rules.md, test/guidelines/INDEX.md)

Decision affected: who constructs the scheduler of PARTITION placement on a node, and when. Production path:
`ControlPlaneSetup.create` -> `RebalanceCoordinator` -> PartitionService `maybeInitializeRebalancer` /
`ensureReplicaPlacementOwnerAttached` -> `attachLedgerReplicaPlacementOwner` -> owner. Requirement (owner, binding):
one scheduler per node for partition placement, the placement owner on the ledger replica, in every construction
order, by construction (not by flag); the per-partition scheduler is not reactivated; no fallback or optional factory.

### 26.1 Construction census (every site that constructs or attaches a partition-placement scheduler)

| # | Site (head 8e84e2801) | What it constructs / attaches | Order hazard |
|---|---|---|---|
| C1 | `partition-service-rebalancer-methods.js:144-192` `maybeInitializeRebalancer` -> `:200-265` `initializeRebalancer` -> `new UnifiedRebalancer` `:247` | a per-partition scheduler on ANY leading, background-ready partition (ledger included) whose coordinator flag is false | the guard is the flag (`:181`), read AFTER the existing-rebalancer branch (`:149-180`): a rebalancer built while the coordinator was unbound is kept after binding (witness 4); with the ledger first the ledger builds one too (witness 5) |
| C1 entries | `partition-service-raft-init-base.js:438` (initialize), `partition-service-core-base.js:466` (readiness-transition fan-out), `partition-service-split-accessor-base.js:677/691/713/764/783` (dependency setters, coordinator rebind), `partition-service-leader-activation-methods.js:82` (leadership edge) | every one re-runs C1 and C2 | each is an event at which C1 could build |
| C2 | `partition-service-rebalancer-methods.js:126-142` `ensureReplicaPlacementOwnerAttached` | asks the coordinator for the ledger's owner | capability probe `:137`; silent skip on any foreign sink `:131`; no `db` precondition (an attach before initialize throws the owner's typed collaborator error: reachable only if a setter runs before initialize, INFERRED) |
| C3 | `rebalance-coordinator-operation-creation-support.js:628-649` `attachLedgerReplicaPlacementOwner` | factory (`:636-637`) or the factory-less fallback (`:639-648`, no timer: no resync) | returns null silently while `controlPlaneReadinessService.serveEligibilityOwner` is not yet created (lazy getter, `control-plane-readiness-serve-eligibility-methods.js:14-38`) or the coordinator has no cache: nothing retries (witness 5, late binding) |
| C4 | `rebalance-coordinator-operation-creation-support.js:603-608` `bindReplicaPlacementOwnerFactory` | sets factory + flag | silent no-op for a non-function; does NOT attach a ledger that met the coordinator before the binding (witness "late binding, no rebind") |
| C5 | `control-plane-setup.js:415-432` (optional call `?.`) -> static `:637-659` `ControlPlaneSetup.attachReplicaPlacementOwner` | the production factory (timer since stage 2) | optional binding; reads the lazy `serveEligibilityOwner` FIELD; registration behind an `instanceof Set` probe (duplicate of C3's) |
| C6 | `registerLedgerPartitionService` `:610-619` | sets the flag true on ledger registration | the flag has two writers (binding, registration) |
| C7 | `partition-service-lifecycle-methods.js:91-120` `quiesceRebalancing` | detaches and unregisters | `seed-cleanup-handler.js:463` quiesces WITHOUT `isShutdown`: a later C1/C2 entry on the ledger re-attaches during node teardown (not witnessed; noted) |

Coordinators in production: the ONLY `new RebalanceCoordinator` in src is `control-plane-setup.js:353`, inside
`create`, which binds at `:415` with no await between (synchronous). Both callers pass `this.rebalanceCoordinator`,
null on their first call (`bootstrap-service-control-plane-runtime-methods.js:146`, assigned `:161`;
`node-joining-publication-activation.js:438`, assigned `:462`). An unbound coordinator is therefore observable only
when built outside setup (tests, `test/simulation/formation-sim-node-hosts.js:441`): witnesses 4, 5 and late binding.
Partition services get the coordinator at construction (`bootstrap-service-replica-registration-methods.js:157`,
`node-joining-publication-activation.js:257`, `seed-partitions-phase.js:229`; null before setup) or from the binder
(`startup-runtime-surface-owner.js:46`). Other leadership sinks (`runtime-service-rebalancer-setup.js:511`,
`service-installation-reconciler-setup.js:71`) bind service_definitions / service_installations, never the ledger.
`new UnifiedRebalancer` in src: partition (`:247`) and message group
(`message-group-service-rebalancer-runtime-methods.js:81`) only; runtime services use
`RuntimeServiceRebalancerOwner` (`runtime-service-rebalancer-setup.js:485`), not UnifiedRebalancer.

### 26.2 Orders and witnesses (`test/partition/placement-owner-construction-orders.test.js`)
Every order now asserts the COUNT (zero per-partition schedulers; one owner on the node while it hosts a live
ledger replica, zero otherwise) and that placement proceeds (`owner.observation.totals.proposals` grows: the owner
reaches the admission boundary for the user/priority deficits). The node's own lazily created ServeEligibilityOwner
is kept (its committed read answered on the readiness service), so the ordering hazard is not masked.
Orders: 1 seed, 2 join, 3 late ledger replica, 4 existing coordinator (user/priority first), 5 existing coordinator
(ledger first), 6 late factory binding with no rebind (census C3/C4), 7 ledger leadership lost and regained (C1
entry: leadership edge), 8 ledger replica shut down and restarted (C7, C2), 9 join while formation is in progress
(C1 entry: readiness-transition fan-out). Predicted today: 4, 5, 6 RED; others green.

### 26.3 Design of 3a (construction only; owner pass/tenure/wake untouched)
- C1: the partition path never constructs a scheduler (the `initializeRebalancer` call goes; nothing in src calls it
  afterwards, so the existing-rebalancer branch becomes unreachable from production: deleted in 3b).
- C2: no probe, no foreign-sink skip; preconditions each with an OWNED retry: ledger initialized (`db`): retried by
  initialize's own call (`raft-init-base.js:438`); cache: `setSystemTableCache`; coordinator: `rebindCoordinator`;
  factory: the binding (below).
- C3: one path: typed refusal for a non-ledger; registers; unbound -> pending (null), and the BINDING attaches every
  registered ledger (owned event); bound -> the factory. Fallback constructor removed.
- C4: typed refusal for a non-function; attaches pending ledgers.
- C5: binding not optional; the factory hands the owner `nodeAuthority = readiness.getServeEligibilityOwner()` (the
  owning getter creates it: exists by construction at attach), `workflowOwner`, the ledger's timer; the static
  requires the timer pair (typed `REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID`, collaborator `resyncTimer`); no
  registration in the static (C3 registers).
Why no order is left out: an owner is constructed at the first moment ALL of {ledger initialized, cache,
coordinator, bound factory} hold, and each of the four becomes true only through an event that re-runs the attach
(initialize, the cache setter, the coordinator setter/rebind, the binding). The node authority and the timer are
not preconditions: they exist by construction at attach time.

## 27. Corrective round 2 (verify-placement-owner-corrective.md, lead's addition to the stage-3 writer)

### 27.1 Item 6: bounds and the await table (record corrections)
- Cases WITHOUT a constant bound on an outstanding write of an ended custody, now four (section 22 listed two:
  a renewal without a role edge, and a REMOVE read ending at its read timeout):
  3. a custody ended WITHOUT a raft edge: `attachment.detach()` (`replica-placement-owner.js:783-788`),
     `shutdown()` (`:206-208`) or a leadership-sink re-drive end the custody, but nothing releases the write the
     ended custody has pending (same mechanism as the renewal: the kernel releases only on LEADERSHIP_LOST);
  4. the write's answer is delivered only after its post-commit side effects
     (`partition-service-raft-write-commit.js:404`); no edge releases that wait (INFERRED, plan not traced).
  In all four the obsolete continuation is harmless at its next checkpoint (every await is followed by a tenure
  check before any authoritative action, section 22); what is unbounded is how long it stays outstanding.
- Await table, missing row F2 (the verifier's): `requestLeadershipStartCdcDrive`'s synchronous prefix is foreign
  code (`replica-placement-owner-tenure.js:93-94` -> `partition-cdc-obligation-delivery.js:610-618`), followed
  by `reconcilePlacementAttempts` (`replica-placement-owner.js:458-462`) and `custody.reconciled = true` (`:463`)
  with no tenure check; the next check is `BEFORE_HOLD_RELEASE` (`:409`) or `AFTER_CENSUS` (`:740`). Harmless,
  no check added: the reconciliation proposes nothing; it deletes attempt records whose entry has a SETTLED
  committed outcome (a fact independent of any tenure), and `reconciled` is a field of the captured custody,
  which can never be current again once ended (custody identity, section 22). INFERRED from the code.

### 26.4 Stage 3b census (proposal; NOTHING deleted): the flag `placementAdmissionEnabled`
Writers: `rebalance-coordinator-lifecycle.js:340` (false at construction), `:499-500` (copied to the workflow
owner), `rebalance-coordinator-operation-creation-support.js:606-607` (binding), `:617-618` (ledger registration).
Read sites (14, file:line at 8e84e2801, what TRUE selects / what FALSE selects):
| # | Site | TRUE selects | FALSE selects; reachable in production? |
|---|---|---|---|
| R1 | `partition-service-rebalancer-methods.js:181` | no per-partition UnifiedRebalancer | builds one (C1); only with an unbound coordinator: not in production |
| R2 | `rebalance-coordinator-operation-creation.js:495` | operation creation through placement admission | the legacy creation (concurrent create budget turn); only an unbound coordinator: not in production |
| R3 | `sql-query-engine-initial-partition-provisioning.js:357` | founding-target provisioning | non-founding path; FALSE while the engine has no coordinator (before `startup-sql-runtime-handoff.js:155`): reachability not traced |
| R4, R5 | `replica-handler-voter-readiness-methods.js:641`, `:652` | ADD voter readiness waits for learner-first semantics | voter path; FALSE when the handler and every local service of the partition lack a coordinator (join before binding) unless the row carries a placement admission: REACHABLE before binding |
| R6 | `partition-replica-admission.js:272` | conf-change peers include learners | voters only; FALSE on a service without a coordinator: REACHABLE before binding |
| R7 | `partition-replica-admission.js:310` | ADD admitted as learner growth | voter ADD; same reachability as R6 |
| R8 | `partition-replica-admission.js:404` | reads the committed conf-change state for an ADD | null; same reachability as R6 |
| R9 | `partition-service-raft-lifecycle-wiring.js:154` | promoted-learner voter observation owned by growth-promote | not owned; same reachability as R6 |
| R10 | `partition-service-learner-promotion-methods.js:459` | defers odd-voter promotion to the placement owner | promotes locally; same reachability as R6 |
| R11 | `operation-workflow-recovery-observation.js:180-181` | every ADD is a learner-target ADD | only ADDs that carry learner/placement markers; workflow owner exists only with a coordinator (flag true after setup) |
| R12 | `operation-workflow-replace-terminal-admission.js:170-171` | ADD target liveness allows an active learner | does not; as R11 |
| R13 | `operation-workflow-dispatch-wake-preemption.js:208-209` | same as R12 at dispatch | as R11 |
| R14 | `rebalance-coordinator-lifecycle.js:499-500` | (propagation to the workflow owner) | - |
Finding: only R1 (and R2) select the retired scheduler; R3-R13 select PLACEMENT-ADMISSION / LEARNER-FIRST semantics,
and R4-R10 have a production FALSE arm (a partition service or replica handler without a coordinator, i.e. before
`bindControlPlaneServices`). Deleting "the flag and its read sites" therefore is NOT a pure removal for R3-R13: it
fixes the TRUE arm for a state (no coordinator yet) that today takes the FALSE arm. Needs the lead's ruling per site
(proposal: R1 and R2 delete the FALSE arm; R3-R13 take TRUE unconditionally only with a witness per site that the
pre-binding state is either unreachable for the operation or correct under TRUE; otherwise keep them out of 3b).

### 26.5 Executed: stage-3 witnesses (`500a98513`, src = 8e84e2801; tv-dator, check base 0dbed1718)
`lab/por-s3-witnesses-500a9851` (18 files). Construction orders: 1 seed, 2 join, 3 late ledger, 7 leadership
lost/regained, 8 ledger restart, 9 formation in progress GREEN (counts and placement proceeds); 4, 5 RED (as
before, now also stated with the count), 6 late binding with no rebind RED (new: before binding the ledger itself
holds a UnifiedRebalancer and nothing attaches an owner). As predicted in 26.2.

### 27.2 Item 7: the six files not re-run at 8e84e2801, at head 500a98513 (src identical to 8e84e2801)
Same run `lab/por-s3-witnesses-500a9851`. GREEN (confirmed at FILE level only; the runner prints per-case lines only
for failing files): `formation-learner-placement-reversal`, `formation-placement-lease-authority`,
`formation-placement-native-retirement`. RED, attributed: `growth-promote-authoritative-completion-and-progress`
(subtest 7, asserts 40 and 42) red identically at `974320ad3` (base) and `b92a5d6c`: pre-existing, not this
owner's rounds; `replica-placement-owner-clearing-triggers` F11 red identically at base and `b92a5d6c`
(pre-existing, section 14: `retained_*` rows mapped to null); `placement-owner-authority-provisioner` red as at
`b92a5d6c` (witness NOT ESTABLISHED, fixture gap). Rest of the set as at `lab/por-corrective-8e84e280`: barrier 2
and write-kernel red (other writers), core [18] and drain [4, 10, 11] red as at base; everything else green.

### 27.3 Items 2-5: NOT done by this writer (context budget); what the next writer needs
- Item 2 (classify a candidate failure by what is KNOWN about its proposal, never by position;
  `proposeCandidateIsolated` `replica-placement-owner.js:~636-645`, `submitPlacementAttempt` `:~388-406`): proposed
  shape: a per-candidate progress record created in `proposeCandidateIsolated` and filled by
  `submitPlacementAttempt` (`handedOver` set immediately before `await submitFn`, `answer` on return). In the catch:
  (a) not handed over, or a definite non-admission answer -> `CANDIDATE_FAILED`, pass continues; (b) an ADMITTED
  answer received and a later local step threw (e.g. `deleteUnresolvedPlacementAttempt` `:399`) -> push the operation
  id to the pass's admitted set, record the local failure separately (a new observation key, not
  `failedCandidates`), rethrow typed so the pass ABORTS (drain retains its triggers; census re-read next pass);
  (c) handed over, no answer (submitFn threw) -> the attempt stays in `uncertainEntryIds` and the durable store
  (it is removed only on a committed answer, `:397-400`) and the existing `reconcilePlacementAttempts` settles it;
  pass aborts. Merge point: on the outcome-format branch the reconciliation settles through
  `readSettledOwnerCommandIn`. Red witnesses: (b) fault `deleteUnresolvedPlacementAttempt` (instance-level: wrap
  the owner's `uncertainEntryIds.delete` or the db prepare) after an ADMITTED answer and assert the pass aborts,
  admitted counts the operation, no second proposal in that pass; (c) make the admit submitter throw after the
  fixture's port accepted the proposal and assert the attempt is retained and reconciled, the pass aborted.
- Item 3 (per-partition evaluation isolation, `evaluateAllPartitions` `:~500-527`): wrap the per-row body
  (`resolveDesiredReplicationFactor`, `buildPartitionReplicaRows`, `evaluatePartitionDeficit`) per partition; a
  throw becomes a typed per-partition state (new `PLACEMENT_DEFICIT_STATE.INVALID_ROW` in
  `replica-placement-owner-deficits.js`, carried through `recordPassEvaluations` into the snapshot's `waiting`), the
  loop continues; `readPartitionPlacementRows`, `readPassCensus`, `readPlacementNodeInputs` and
  `readStorageExcludedTargets` stay pass-aborting (global authority: no decision for anyone). Which row value
  actually throws was not established (`resolveDesiredReplicationFactor` does not throw); a witness may need an
  instance-level fault on the owner (as the poisoned-candidate witness does) if no malformed cache row reaches a
  throw.
- Item 4 (A4' checkpoint `:~442` discards its result): make it decide (`if (!this.checkpoint(pass,
  CHECKPOINT.AFTER_READMISSION)) return null;`); witness per verifier N5 (dropped admission, A->B->A with
  `heldAcrossABA`, hold at A3 via `holdNextAdmissibilityCheck`, a competing admission committed through
  `requestPlacementAdmission` on A's ledger, REFUSED PARTITION_BUSY, fresh proposal dropped, transfer); correct the
  record's section-22 row 2c ("none") to that schedule once executed.
- Item 5 (barrier re-check `:~707` unwitnessed): a witness in the barrier file that changes the tenure between the
  latch and the first use (e.g. the status read re-mints the token at the same term via the fixture's
  `statusReadWake` hook, or a sink re-drive inside the read) and asserts no construction under the old custody.

### 27.4 Item 1: executed (tv-dator, check base 0dbed1718)
- Witness `a5aacf97e` (wakes, "poisoned candidate over several wakes and a resync"): RED at
  `lab/por-cr2-item1-red-a5aacf97` for the intended reason (after the first pass the custody retained
  `LEADERSHIP_START`); wakes 1-7 green.
- Fix `3b182f42f` (`drainCustody`: the candidate-failure retention removed; only the catch of an aborting pass
  retains): `lab/por-cr2-item1-3b182f42` (18 files) wakes GREEN (file level); red set identical to
  `lab/por-s3-witnesses-500a9851` (construction 4, 5, 6; growth-promote 7; drain 4, 10, 11; barrier 2; provisioner;
  write-kernel; clearing-triggers F11; core 18).
- Classification rule as implemented: a pass that THROWS (any failure outside the candidate loop) keeps its
  triggers; a candidate failure (recorded under `failedCandidates`) keeps nothing; the next wake, at the latest the
  resync, re-derives the candidate from the census.

## 28. State of the branch at this writer's stop (head 3b182f42f, pushed)
`500a98513` stage-3 witnesses; `a5aacf97e` item-1 witness; `3b182f42f` item-1 fix. Stage 3a NOT implemented
(design in 26.3, census 26.1, 3b flag census 26.4); corrective items 2-5 NOT done (27.3); item 6 recorded (27.1);
item 7 run and attributed (27.2). Next: items 2-5 red-first, then 3a per 26.3 (expected: construction 4, 5, 6 green;
test-support/core-test static callers switch to `nodeAuthority`/`workflowOwner` and pass a timer pair), then the
3b stop with the lead's ruling on 26.4.

## 29. Stage 3a as implemented (writer: stage-3 continuation writer, from head 3b182f42f; rule set and owners as loaded from CLAUDE.md, docs/steering/rules.md, test/guidelines/INDEX.md; lead brief "STAGE 3 continuation")

Decision affected: who constructs the scheduler of partition placement on a node and when (record 26). Production
path: `ControlPlaneSetup.create` -> `RebalanceCoordinator.bindReplicaPlacementOwnerFactory` ->
PartitionService `maybeInitializeRebalancer` / `ensureReplicaPlacementOwnerAttached` ->
`attachLedgerReplicaPlacementOwner` -> factory -> `ControlPlaneSetup.attachReplicaPlacementOwner` -> owner.

| Census row | Change |
|---|---|
| C1 | `maybeInitializeRebalancer` no longer calls `initializeRebalancer` (the R1 flag guard and the build went with it). Nothing in src calls `initializeRebalancer` now; the existing-rebalancer branch is unreachable from production (no src writer of a partition `rebalancer` other than `initializeRebalancer`); both are left for 3b. |
| C2 | Preconditions: ledger, not shut down, not attached, `raft` (the replica opened: initialize opens its database at `raft-init-base.js:237`, then its consensus port at `:305`; the port, not `db`, is read so the precondition set does not mix a cache and a database read, the static decision-boundary rule), `systemTableCache`, `rebalanceCoordinator`. Probe (`attachLedgerReplicaPlacementOwner` exists) and the skip on any leadership sink removed. Owned retries: opened by initialize's own call (`raft-init-base.js:438`), cache by `setSystemTableCache`, coordinator by `setRebalanceCoordinator`/`rebindCoordinator`, factory by the binding (C4). |
| C3 | One path: non-ledger -> typed `REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID` (collaborator `ledgerPartitionService`); registers; factory null -> null (the ledger waits registered); bound -> the factory. The node-authority/cache precondition and the factory-less fallback constructor (no resync timer) are removed; the `instanceof Set` probes are removed (the constructor creates the set, `rebalance-coordinator-lifecycle.js:338`). |
| C4 | Non-function -> typed refusal (collaborator `replicaPlacementOwnerFactory`); after binding, `ensureReplicaPlacementOwnerAttached()` on every registered ledger (the owned retry of a ledger that met the coordinator before the binding). |
| C5 | `create` binds unconditionally (no `?.`) the factory `ControlPlaneSetup.createReplicaPlacementOwnerFactory({nodeId, controlPlaneReadinessService, rebalanceCoordinator, systemTableCache, storageAccountingService})`; at attach time it hands `nodeAuthority = controlPlaneReadinessService.getServeEligibilityOwner()` (the owning getter creates it: it exists whenever the attach runs), `workflowOwner = rebalanceCoordinator.workflowOwner`, the ledger's `timeSource` interval pair. The static `attachReplicaPlacementOwner` takes the owner's collaborators directly, requires the timer pair (`requireResyncTimerCollaborators`, typed, collaborator `resyncTimer`) and no longer registers (C3 does). |
| C6 | unchanged (the flag's two writers stay; R3-R14 out of 3a). |
| C7 | unchanged in 3a; teardown witness added (section 29.2). |

The other leadership sink (what the removed skip guarded against): in production two other owners use
`setRebalancerLeadershipSink`, `RuntimeServiceRebalancerOwner` on `service_definitions-p1`
(`runtime-service-rebalancer-setup.js:486-511`) and `ServiceInstallationReconciler` on `service_installations-p1`
(`service-installation-reconciler-setup.js:44-71`); neither binds `replica_operations-p1`. On the ledger the skip could
fire only for a placement owner attached outside the attachment field (tests that hand-attach) or an attachment field
cleared without a detach. Skipping was wrong: it left the ledger silently without its production owner and with no typed
answer. Replaced by required wiring: `attachReplicaPlacementOwner` (`replica-placement-owner.js`) refuses typed
(collaborator `ledgerPartitionService`) when the ledger's sink slot is occupied, i.e. a second scheduler on one ledger.

Why no order is left unattached or attached twice: an owner is constructed at the first moment all of {ledger opened,
cache, coordinator, bound factory} hold; each becomes true only through an event that re-runs the attach (initialize,
cache setter, coordinator setter/rebind, binding). The attachment field guards a second attach until quiesce clears it.

Test fixture changes (no assertion weakened): the static's callers (`replica-placement-owner-test-support.js` x3,
`replica-placement-owner-core.test.js`) pass `nodeAuthority`/`workflowOwner` and `INERT_RESYNC_TIMER` (a timer pair that
arms nothing that fires, stated as substituted: those witnesses ran with no resync before); the drain scenario
(`formation-placement-drain-scenario.js`) binds the production factory on the sim host's coordinator (the sim hosts build
the coordinator without the setup) and gives its ledger stub the host's virtual-time interval pair (sim hosts now export
`setIntervalFn`/`clearIntervalFn`); the census fake ledger (`placement-removed-mechanism-and-caller-census.test.js`)
carries `raft` (an opened replica).

### 29.2 Teardown witness (census C7)
`placement-owner-construction-orders.test.js` "P0 teardown": seed order, one owner placing; `SeedCleanupHandler
.quiesceRebalancers()` (the step both cleanup paths run: `seed-cleanup-handler.js:272, :532`) with the node's
services; premise: the ledger replica is not shut down, its attachment is cleared, the old owner does not lead; then a
leadership edge (follower, new term, leader) and a readiness transition fan-out on the ledger. Asserts: no attachment
handed out by the coordinator after the quiesce, no attachment field, no sink, the old owner stays ended, the ledger
not registered again. Predicted RED at 3a (C2's preconditions all hold after the quiesce; the coordinator still has its
factory).

### 29.3 Executed: stage 3a (`5a1f66105`; tv-dator, check base 0dbed1718), `lab/por-s3a-5a1f6610` (24 files)
- Construction orders: all ten GREEN (file level: 10 assertions = 10 cases): 1 seed, 2 join, 3 late ledger, 4 existing
  coordinator user/priority first, 5 existing coordinator ledger first, 6 late binding with no rebind, 7 leadership
  lost/regained, 8 ledger restart, 9 formation in progress, and the teardown witness. 4, 5, 6 were RED at
  `lab/por-s3-witnesses-500a9851` and `lab/por-cr2-item1-3b182f42`.
- Teardown witness GREEN at 3a: the census hazard (C7) is NOT reproducible, so no repair (seed-cleanup-handler
  unchanged). Cause, read after the run: `quiesceRebalancing` ends with `this.rebalanceCoordinator = null`
  (`partition-service-lifecycle-methods.js:134`), and for a ledger that does not own its coordinator (every
  production ledger: the coordinator comes from the setup) the whole quiesce is synchronous, so after it C2's
  coordinator precondition fails and every later entry attaches nothing. Only a partition that OWNS its coordinator
  awaits between the detach and that null (not a production construction).
- Owner files: red set identical to `lab/por-cr2-item1-3b182f42` minus construction 4, 5, 6: drain [4, 10, 11],
  growth-promote 7 (asserts 40, 42), barrier 2 (production definition), provisioner 1, write-kernel 1,
  clearing-triggers F11, core [18]; same test names as before (all attributed earlier: other writers or base).
- Added to this run (not in earlier sets), RED at 3a:
  - `placement-founding-and-runtime-service-admission` (10 cases): all one fixture gap, `TypeError reading 'add'` in
    `registerLedgerPartitionService`: `placement-create-with-ledger-fixture.js` builds the coordinator with
    `Object.create(RebalanceCoordinator.prototype)`, so it lacked the constructor's `ledgerPartitionServices` set that
    the removed `instanceof Set` probe papered over. Fixture now sets the constructor's state (set, null factory).
    Same fixture serves `placement-creation-terminal-replay`, `placement-founder-origin`,
    `schema-provisioning-native-admission` (to re-run).
  - `partition-rebalancer-dependency-wiring-characterization` (many), `partition-rebalancer-readiness-edge-gate`
    (1-3), `partition-service-role-metadata-publication` 8, 9, 16, 17: each pins the per-partition
    `UnifiedRebalancer` construction or its existing-rebalancer branch (stage 3b's subject; listed there). 9 builds a
    UnifiedRebalancer on the LEDGER partition with a fake coordinator that has no attach (now a TypeError: required
    wiring).
  - GREEN: `placement-removed-mechanism-and-caller-census`, `control-plane-setup.test`.

## 30. Corrective round 2, items 2-5 (this writer)

### 30.1 Witnesses, red-first run (`c9ff75c7f`, src = `5a1f66105`; tv-dator, check base 0dbed1718), `lab/por-cr2-witnesses-c9ff75c7`
| Item | Witness (file) | At `c9ff75c7f` (before any item 2-5 source change) |
|---|---|---|
| 2 (b) | wakes "admitted, then a local step throws" (the durable attempt-record delete after an ADMITTED answer fails; substituted fault on the ledger db's `prepare`) | RED for the intended reason: no aborted pass; pass 1 proposed both deficits (`attempts: [sql_transactions-p1 pass 1, tbl-second-p1 pass 1]`); premise held (the faulted admission committed) |
| 2 (c) | wakes "handed over with no answer" (the submitter throws after the port accepted the proposal) | RED for the intended reason: no aborted pass, pass 1 proposed the second deficit; premises held (attempt retained in memory and durably) |
| 4 | tenure "A4' retained-REFUSED re-admission across a transfer" (verifier N5 schedule: E dropped, A->B->A, held at A3, competing admission through `requestPlacementAdmission` on A's ledger, E re-proposed and REFUSED, fresh F proposed and dropped, transfer A->B) | GREEN (file level): the schedule is reachable in the fixture; the pass stops at `A4R_AFTER_READMISSION`; one admission per replica |
| 5 | barrier "barrier re-check" (a sink re-drive false->true inside the barrier's status read, fixture hook `statusHookAtNextPass`) | GREEN (file level): stale at `TERM_START_BARRIER`, no census read and no reconciliation by the obsolete pass |
Also green there: the `placement-create-with-ledger-fixture` users (`placement-founding-and-runtime-service-admission`,
`placement-creation-terminal-replay`, `placement-founder-origin`, `schema-provisioning-native-admission`) after the
fixture now carries the constructor's registry state (section 29.3). Barrier 2 (production definition) red as before.

### 30.2 Item 4: no source change (owner rule: a repair only where an executed witness shows the defect)
The witness executes the verifier's schedule and is green before any change: the A4' checkpoint's discarded result is
behaviour-neutral, because `proposeOrderedCandidate` returns null for a pass that is not current
(`replica-placement-owner.js`, the `isPassCurrent` check after `submitCandidateAdmission`) before any use of the fresh
answer. Making the check decide (`return null`) would change no observable outcome on the pass path; on the direct path
(`submitAdmission`, test-only caller) it would hide the committed answer of a proposal F that was made under a current
tenure. Left unchanged; the lead decides. Record correction (section 22, row 2c): "none" is wrong; the schedule above
reaches A4' across a transfer (fixture-level, the ledger log is the fixture's). Kill power of the witness: removing the
A4' checkpoint changes the stale label to `CANDIDATE` (INFERRED from the code; no mutation run).

### 30.3 Item 5
Witness green with the re-check in place. Without it (INFERRED from the code, no mutation run): the obsolete pass would
call `readPassCensus`, request the leadership-start CDC drive (joined) and run `reconcilePlacementAttempts` under the
ended custody (`reconciled = true` on it), then stop at `AFTER_CENSUS`; the witness asserts none of these and the stale
label `TERM_START_BARRIER`, so it fails. The schedule (a sink re-drive inside a status read) is constructed; production
reachability stays near-unreachable (verifier, section 5 of the re-verification).

### 30.4 Item 3: not reproducible; nothing changed (bounded reading)
No PARTITIONS or SERVICES row the cache can hold makes the per-partition evaluation throw. The cache does NOT refuse
malformed rows at admission (it validates table name, operation, mutation mode and key presence only,
`system-table-cache.js:275-291`), so that is not the reason; the reason is that every reader of the per-row body is
type-guarded: `readLowerStateField` (`state-field-read.js:21-38`, non-strings -> STATE_ABSENT),
`resolveDesiredReplicationFactor` (`replication-target-authority.js:93-113`, non-object -> UNDECLARED, strict own data
property), `buildPartitionReplicaRows` / `classifyServiceRow` (`replica-placement-owner-deficits.js:148-208`, typeof
checks, `durableRowVersion` Number.isFinite, `isFailedCreateCleanupToken` typeof), the leader id (`typeof === string`),
and the orderings (`compareText`, `<` on any values: no throw). Not read in full: `evaluatePartitionDeficit`'s body
(`deficits.js:250-480`), which works on the already-typed replica rows (arithmetic on Map lookups yields NaN, not a
throw). INFERRED; no witness written. The verifier's other example (a failing capacity read,
`readStorageExcludedTargets`) is a node-level read and stays pass-aborting by design (27.3).

### 30.5 Item 2 repair (`replica-placement-owner-proposal-knowledge.js`, owner, pass observation)
As in the commit message: per-candidate proposal progress (handed over immediately before the submission, answered on
return); NOT_PROPOSED or REFUSED -> `CANDIDATE_FAILED`, pass goes on; ADMITTED then a local throw -> recorded admitted
(`snapshot.admitted`), `localFailures[partition] = {operationId, failure}`, typed abort `REPLICA_PLACEMENT_PASS_ABORTED`;
UNCERTAIN (handed over, no answer, or outcome unknown) -> `uncertainCandidates[partition]`, attempt retained (never
deleted without a committed answer), typed abort. The drain's existing abort path keeps the triggers. A5 (the admitted
ledger move's hold release) stays outside the isolation: its throw aborts the pass as before, and the admitted
operation is now recorded on the pass before it.

## 31. Stage 3b (lead ruling: delete R1 and R2's selections and the partition-side construction; R3-R14 untouched)

### 31.1 Deleted (source), with the necessity proof (grep of every caller, src at the 3b commit)
| What | Where | Why unreachable / why it may go |
|---|---|---|
| R1 guard (`placementAdmissionEnabled` read before the build) and the `initializeRebalancer` call | `partition-service-rebalancer-methods.js` (3a, `5a1f66105`) | the build itself is retired |
| `initializeRebalancer` (the per-partition `new UnifiedRebalancer`) | same file | no src caller after 3a (`grep -rn initializeRebalancer src`: only message-group's own method of that name, a different class) |
| existing-rebalancer branch of `maybeInitializeRebalancer` (and its `readinessTransitionOnly` edge gate) | same file | `initializeRebalancer` was the only src writer of a partition's `rebalancer` field other than `= null` (`partition-service-core-base.js:240`, `partition-service-lifecycle-methods.js:119`) |
| `applyRebalancerDependencies` | same file | only caller was the existing-rebalancer branch |
| optional-factory branch (`bindReplicaPlacementOwnerFactory?.`) and the factory-less fallback constructor | `control-plane-setup.js`, `rebalance-coordinator-operation-creation-support.js` | removed in 3a: binding required; the attach has one path |
| R2's selection (`placementAdmissionEnabled === true &&` before `isPlacementAdmissionManagedEntityType`) | `rebalance-coordinator-operation-creation.js:495` (the ruling named `...-creation-support.js`; the site is in `...-creation.js`) | FALSE arm only on an unbound coordinator; the only production `new RebalanceCoordinator` is in `ControlPlaneSetup.create`, which binds before returning (census 26.1). Managed types (PARTITION, RUNTIME_SERVICE) now always go through placement admission; the record path stays for the others (message groups). |
Kept: `buildRebalancerDependencyBundle` (caller `setSqlQueryEngine`, `partition-service-split-accessor-base.js`).

Unreachable after 3b but in files outside this writer's scope (listed, NOT changed; R16): every read of a partition's
`rebalancer` field, which is now always null: `partition-service-core-base.js:320-321, :345-346` (setters),
`partition-service-split-accessor-base.js:214` (`this.rebalancer?.controlPlaneSystemTableGateway`), `:675, :687, :709`
(setters), `:745-750` (rebind), `partition-service-lifecycle-methods.js:110-120` (quiesce),
`partition-service-metadata-delivery-methods.js:474-475` (`recordStateChange`),
`partition-service-leader-activation-methods.js:39, :81-88` (`updateRebalancerLeadership`'s rebalancer arm), the
`{readinessTransitionOnly: true}` argument at `partition-service-core-base.js:466` (now ignored), and
`PARTITION_SERVICE_SHARED.UnifiedRebalancer`/`EntityType` exports if no other partition module uses them (not
censused). The record path of operation creation (`createOperationRecordInternal`, the concurrent-create budget turn)
still serves message groups; whether partition-specific branches inside it became unreachable was NOT censused.

### 31.2 R3-R14: the FALSE branch in the pre-bind window (a decision for later; nothing changed)
"Pre-bind window": a partition service or replica handler on a joining node before
`StartupRuntimeSurfaceOwner.bindControlPlaneServices` hands it the coordinator (it has none, so `?.placementAdmissionEnabled`
reads undefined); on the coordinator itself the flag is false only between its construction and the binding inside
`ControlPlaneSetup.create` (synchronous: no event in between).
| # | Site | FALSE branch does (pre-bind) | Executed in production construction by a witness? |
|---|---|---|---|
| R3 | `sql-query-engine-initial-partition-provisioning.js:357` | no founding-target provisioning: the non-founding path (the engine has no coordinator before `startup-sql-runtime-handoff.js:155`) | no witness; reachability of provisioning before the handoff not traced |
| R4, R5 | `replica-handler-voter-readiness-methods.js:641, :652` | an ADD's voter-readiness wait does not use learner-first semantics unless the row's `steps_history` names a placement admission (`:642-645`) or a local service has `learnerFirstAdmission` | no witness; reachable on a joiner whose handler and local services have no coordinator yet; placement-owner ADDs carry the admission in `steps_history`, so they take TRUE regardless |
| R6 | `partition-replica-admission.js:272` | conf-change peers = voters only (learners excluded) | no witness; reachable before binding |
| R7 | `:310` | an ADD is admitted as a voter, not as learner growth (unless `as_learner` or `learnerFirstAdmission`) | no witness; reachable before binding |
| R8 | `:404` | no committed conf-change state read for an ADD (null) | no witness; reachable before binding |
| R9 | `partition-service-raft-lifecycle-wiring.js:154` | a promoted learner's voter observation is not owned by growth-promote | no witness; reachable before binding |
| R10 | `partition-service-learner-promotion-methods.js:459` | odd-voter promotion is done locally, not deferred to the placement owner | no witness; reachable before binding |
| R11 | `operation-workflow-recovery-observation.js:180-181` | only ADDs with learner/placement markers are learner-target ADDs | no witness; the workflow owner exists only with a coordinator, whose flag is true after setup: FALSE not reachable in production (INFERRED) |
| R12 | `operation-workflow-replace-terminal-admission.js:170-171` | an ADD target's liveness does not accept an active learner | as R11 |
| R13 | `operation-workflow-dispatch-wake-preemption.js:208-209` | same as R12 at dispatch | as R11 |
| R14 | `rebalance-coordinator-lifecycle.js:499-500` | propagation of the coordinator's flag to the workflow owner (false at construction) | as R11 |
None of the construction-order witnesses exercises an admission, a learner promotion or a provisioning in the pre-bind
window, so no witness shows any FALSE branch executing in production construction.

### 30.6 Executed: item 2 repair (`536d024ac`; tv-dator, check base 0dbed1718), `lab/por-cr2-item2-536d024a` (20 files)
Wakes GREEN (10 assertions = 10 cases, including item 2 (b) and (c), red at `c9ff75c7f`); tenure GREEN (15, item 4);
barrier: only 2 (production definition) red, item 5 green; construction orders GREEN (10). Red set identical to
`lab/por-s3a-5a1f6610`'s owner files: drain [4, 10, 11], growth-promote 7 (40, 42), barrier 2, provisioner 1,
write-kernel 1, clearing-triggers F11, core [18]. `placement-founding-and-runtime-service-admission` and
`placement-removed-mechanism-and-caller-census` green.

### 31.3 Executed: 3b (`376592b8b`), before/after on the same files (tv-dator, check base 0dbed1718)
Before: `lab/por-s3b-before-536d024a` (144 files: every `*.test.js` outside integration/distributed/e2e that calls
`createOperation(`, `new UnifiedRebalancer(` or `createTestRebalancer(`, plus the three partition construction files):
22 red. After: `lab/por-s3b-376592b8` (the same 144 plus the 20-file owner set): 70 red.
- Owner set at 3b: same red cases as at `536d024ac` (drain 4, 10, 11; growth-promote 7; barrier 2; write-kernel 1;
  clearing-triggers F11; core 18; provisioner 1); construction orders, wakes, tenure GREEN. Nothing the deletion touched
  is used by the placement owner's path.
- Fixed by 3b: none. Still red, red before 3b too: the 22 (19 not attributable to this branch's stage-3 work by file
  name: `membership-publication-first-epoch-members`, `dt6-priority-surplus-remove-authoritative-placement-fence`,
  `admission-real-size-estimates`, `coordinator-created-operation-progress`,
  `duplicate-operation-prevention.property`, `formation-runtime-service-create-lane-budget-starvation`,
  `message-group-membership-operation-lane`, `message-group-operation-routing.integration`,
  `placement-admission-cross-coordinator-target-census`, `placement-owner-authority-provisioner`,
  `quorum-conditioned-remove-safety`, `rebalance-coordinator-topology-guard`, `rebalancer-entity-interaction-contract`,
  `rebalancer-own-create-memory-duplicate-replace`, `replace-in-flight-blocks-planning`, `replace-named-handoff-attempt`,
  `replica-operation-membership-epoch-binding`, `storage-reservation-lost-outcome-idempotency`, `strict-operation-outcomes`;
  NOT attributed here, no base run of these files exists in this record; plus the 3 partition files red since 3a).
- Newly red at 3b: 42 files, every first failure from R2 (the unbound test coordinator now creates PARTITION /
  RUNTIME_SERVICE operations through placement admission): `Cannot route PLACEMENT_ADMIT: ledger leader unreachable`,
  `Placement waits for committed formation`, `placement_remove_intent_unscoped`, `placement_admission_bytes_invalid`,
  or a reservation-insert expectation of the record path.

### 31.4 Tests: NOT migrated (well over ten files; the ruling says stop and list)
Category D (delete: they pin only the retired per-partition construction): `partition-rebalancer-readiness-edge-gate`
(whole file); `partition-service-role-metadata-publication` cases 8, 9, 16, 17;
`partition-rebalancer-dependency-wiring-characterization` (most of its 49 cases; the bundle-builder, setter
propagation into the coordinator and rebindCoordinator ownership/shutdown cases assert still-live behaviour and need
case-by-case rewriting onto a service without a rebalancer).
Category M (migrate, assertions intact: the record path for a managed type was only the fixture's way to seed an
operation for another owner's property; seed it through placement admission on a ledger fixture, or the repository):
REPLACE owner: `replace-owner-recovery-equivalence`, `replace-owner-wake`, `replace-real-group-d2`,
`replace-real-group-scheduling`, `replace-source-removal-owner`, `replace-replica-workflow`,
`recent-completed-replace-target-visibility`; convergence: `dt6-formation-ledger-quorum-spread-first`,
`dt6-operation-ledger-terminal-hold`, `dt6-priority-recovery-add-dispatch-cadence`,
`dt6-rebalancer-formation-self-move-interlock`, `dt6-rebalancer-timeout-failure-virtual-clock`,
`dt6-voter-surplus-promotion-drain-livelock`, `dt-formation-priority-placement-before-active`,
`dt-ledger-completion-continuity-discriminator`; workflow/properties: `add-workflow-step-progression.property`,
`remove-workflow-step-progression.property`, `operation-log-persistence.property`,
`operation-record-completeness.property`, `timeout-triggers-failure.property`; others: `assignment-epoch-fencing`,
`existing-group-add-topology-guard`, `readiness-snapshot-persistence`, `rebalance-coordinator-operation-ownership`,
`critical-spread-terminal-stall-repro`, `spread-cure-at-target-minting-gap`, `spread-cure-transition-authorization-row`,
`spread-cure-transition-authorization-production-path`, `ledger-quorum-spread-hold-cure-drain-admission`,
`formation-ledger-spread-voter-ready-readiness`, `partition-policy-remove-retry`,
`replica-removal-deferral-dispatch-reconcile`, `replica-retirement-terminal-actuals-coherence`,
`terminal-failed-add-target-cleanup`, `runtime-service-replace-canonical-target-handoff`, `runtime-service-target-claim`.
Category R (decide per test: they assert the record path's creation-time behaviour for a managed type: reservation
INSERT, dedupe, fail-closed reservation; migrate if placement admission must hold the same property, else delete):
`coordinator-dedup-gap`, `coordinator-reservation-lifecycle`, `reservation-fail-closed-dispatch-gate`,
`reservation-file-backed-restart`, `formation-cure-reservation-progress-obligation`,
`formation-cure-reservation-progress-successor`.
Categories are INFERRED from each file's first failure line and name, not from reading every case. Not run: integration,
distributed and e2e files (9 match the grep; full nodes bind through the setup, so R2's FALSE arm never ran there).
Decision for the lead: R2's deletion turns 42 files red that were green; the alternative is to keep R2's deletion and
migrate (M) in a follow-up, or to land 3b without R2 until M is done.

## 32. State of the branch at this writer's stop (head 376592b8b, pushed)
`5a1f66105` stage 3a (construction; teardown witness, green: no repair); `c9ff75c7f` corrective-round-2 witnesses
(items 2, 4, 5) and the 3a fixture follow-up; `536d024ac` item 2 repair; `376592b8b` stage 3b source deletion. Done: A;
C items 2 (red -> green), 3 (not reproducible, nothing changed), 4 (witnessed, green, no source change: decision for the
lead), 5 (witnessed, green); B source deletion with the necessity proof and the R3-R14 table. Remaining: the 3b test
handling (31.4: D delete, M migrate, R decide), the out-of-scope unreachable reads of a partition's `rebalancer` field
(31.1), and the attribution of the 19 pre-existing reds of 31.3.

## 33. Stage 3b test migration (writer: stage-3b migration writer, from head 376592b8b; rule set and owners as loaded from CLAUDE.md, docs/steering/rules.md, test/guidelines/INDEX.md + fixtures.md; lead brief "stage 3b test migration"; coordinator amendment after `reports/verify-placement-stage3.md`)

Standing statement (verifier condition 6, F8): this branch carries the 49 files 3b turned red (42 newly red + 7 of
the 19 "red before" that now fail earlier on R2) until the migration and the proof transfers are done. Count after
each commit is kept in 33.9.

### 33.1 Merge of the fixture producers
True merge of `origin/work/line-regression-fixtures-b-20261121` (cfd056019). That line stands on 23344cddc, which
this line did not contain, so the merge also brings 23344cddc's five commits (the leader-role dead-arms deletion
`4adfe1a42`, its witnesses `65ca4c2c3`, `e1e239d30`, `df7be8270`, and the merge): src files
`bootstrap-topology-snapshot-owner-{contract,published-views}.js`, `group-retirement-redrive.js`,
`partition-service-row-owner.js`, `operation-workflow-remove-safety-evaluator.js`,
`priority-publication-{leader-safety,safety-shared,safety-topology}.js` and three scripts. Conflicts: none in any source
or test file; changed on both sides only the four generated files (inventory.json, src/partition/INDEX.md,
impact-graph-seal.json, subsystem-classes.json), kept ours by the repository's merge driver and regenerated by the
pre-commit hook.

### 33.2 F6 (verifier): the leadership-sink readiness hysteresis is not a dead read. Red-first
Witness `test/partition/partition-rebalancer-leadership-readiness-hysteresis.test.js` (five cases), tv-dator, check
base 0dbed1718, one file each:
| sha | dir | result |
|---|---|---|
| 8e84e2801 (before stage 3) | `lab/por-s3b-f6-8e84e280-tv-dator` | GREEN, 18 assertions |
| 23344cddc (base of the other lines) | `lab/por-s3b-f6-23344cdd-tv-dator` | GREEN, 18 assertions |
| 376592b8b (3b head) | `lab/por-s3b-f6-376592b8-tv-dator` | RED, `not ok 1 - rebalancer created` |
Why green before stage 3: the witness's coordinator (`createReadinessHoldingCoordinator`) is unbound, so the R1 guard
let the per-partition `UnifiedRebalancer` be built and its `isLeader` carried the retention. In production the
build was skipped since `ab901b40f` (2026-11-19 19:14, "resolve es6-owner-safety P1-P5 review findings (durable
generation history, placement replay, and real drain wiring)": guard `placementAdmissionEnabled === true &&
classifySystemPartition(...).systemTable === true` before the build, i.e. every system-table partition, which
includes both sink hosts `service_definitions-p1` and `service_installations-p1`), widened to all partitions by
`4ef9423c0` (2026-11-19 20:41, Review 2 "user partition placement cutover"). So on a bound production node every
non-draining readiness dip has demoted and re-promoted the runtime-service owner and the service-installation
reconciler since `ab901b40f`; the witness turned red only at `5a1f66105` (3a), when the unbound fixture lost the
build too. `git log -S 'rebalancer.isLeader !== true'`: the hysteresis itself came from `e9f1c8bb4` (2026-06-21,
"readiness gates rebalancer-leadership acquisition, raft gates retention").

### 33.3 Seal classification of the 49 red files (coordinator amendment item 1)
Method: each file name grepped in `solve/quests/**` (quest.json fields and log entries, evidence receipts),
`architecture/contracts/invariants.json`, `docs/specs/decision-tables/`; every quest's `doneWhen.requiredReceipts`
matched against each file's text (case titles). invariants.json: no hit. Mentions only inside verifier entries'
reviewed-file manifests (sha lists, file lists) or in finding/attempt entries are NOT counted as proof (listed as O
with the note "manifest only").
(S) sealed, NOT migrated, restated or deleted (24): proof-transfer plans in 33.4.
(O) ordinary (25): `readiness-snapshot-persistence` (manifest only), `dt-ledger-completion-continuity-discriminator`
(manifest only), `dt6-rebalancer-timeout-failure-virtual-clock`, `add-workflow-step-progression.property`,
`remove-workflow-step-progression.property`, `operation-log-persistence.property` (manifest only),
`operation-record-completeness.property`, `timeout-triggers-failure.property`, `coordinator-dedup-gap`,
`critical-spread-terminal-stall-repro` (manifest only), `formation-cure-reservation-progress-obligation`,
`formation-cure-reservation-progress-successor`, `partition-policy-remove-retry` (cited as passing in a
`partition-placement-declared-target` attempt verification, not in its receipts), `recent-completed-replace-target-
visibility` (manifest only), `replace-owner-recovery-equivalence`, `replace-owner-wake` (manifest only),
`replace-real-group-scheduling`, `replace-source-removal-owner` (fixture-custody verification only),
`replica-removal-deferral-dispatch-reconcile`, `reservation-file-backed-restart`, `runtime-service-target-claim`
(manifest only), `coordinator-created-operation-progress` (manifest only), `quorum-conditioned-remove-safety`
(manifest only), `replace-in-flight-blocks-planning`, `replace-named-handoff-attempt`.

### 33.4 The 24 sealed (S) files: quest, sealed sentence, what the old path staged, proof-transfer plan
Placement-owner path vocabulary (what replaces the record path's creation-time mechanisms; all in the real ledger
applier, `partition-placement-admission-decision.js`, and the owner `replica-placement-owner*.js`): PARTITION_BUSY
(one incomplete row per entity), LEDGER_TRANSITION_UNRESOLVED (the ledger entity admits only into an idle ledger,
unless its statement carries `dispatchHold LEDGER_AWAITING_COPY_IDLE`), PLACEMENT_RELEASE_HOLD / COPY_PHASE_NOT_IDLE
(the held ledger move's release), SOURCE/TARGET_AT_CAPACITY (K_SRC 3, K_TGT 2 copy occupancy), TARGET_CLAIM_TAKEN
(runtime target claim), the owner's candidate order (system-first rank, formation-gated classes waiting
FORMATION_NOT_LATCHED), REMOVE scoped by `voterRetirement`/`learnerRetirement`, observation on `lastPassSnapshot`
(admitted/refused/waiting by reason). Transfer hosts: `placement-owner-authority-fixture.js` (real owner, real
applier, controllable ledger log), `formation-placement-drain-scenario.js` (sim hosts, virtual time), or the bound
coordinator harness (33.6) when the sealed property lives after creation.

Group L, the ledger self-move interlock / hold / create budget (the old path staged the ledger self-move and its
siblings through `coordinator.createOperation`, whose creation-time interlock `ensureOperationLedgerSelfMoveSerialized`
and budget turn were the subject; on a bound coordinator the interlock still runs before admission, but the
admission's ledger rule now decides first):
| File | Quest(s) | Sealed sentence (abridged) | Transfer plan |
|---|---|---|---|
| dt6-priority-recovery-add-dispatch-cadence | priority-recovery-add-dispatch-cadence (statement, constraint `deterministic-first`, 8 receipts by case title) | "siblings woken by the self-move terminal ... are admitted instead of being refused as operation_ledger_self_move_in_flight; every sibling still excluded while the self-move is in flight" | owner pass on the drain host: self-move admitted with the hold, sibling priority deficits refused LEDGER_TRANSITION_UNRESOLVED while it is incomplete (exclusion), admitted on the pass after its terminal (no spurious refusal), counted on lastPassSnapshot; budget-lane receipts become K_SRC/K_TGT occupancy receipts (supersession: the create-budget turn no longer exists for managed types) |
| dt6-rebalancer-formation-self-move-interlock | operation-ledger-self-move-hold-engagement, -hold-fairness, formation-ledger-quorum-spread-first, lone-seed-formation-admission-livelock-closure, formation-grace-parallel-start-hardening (constraints: "must pass verbatim") | IDLE_ONLY and quorum_concentrated deferral "byte-for-byte preserved"; hold engaged only when dispatch-admissible | IDLE_ONLY = LEDGER_TRANSITION_UNRESOLVED; fairness/engagement = the held ledger move admitted with dispatchHold and released by PLACEMENT_RELEASE_HOLD when copy-idle; "verbatim" constraints need an R09 supersession (the interlock is not the admission authority any more) |
| dt6-formation-ledger-quorum-spread-first | rebalancer-owner-clock-dt6-regression (statement), formation-grace-parallel-start-hardening, formation-ledger-leader-local-persistence-wedge (constraints), formation-ledger-quorum-spread-first | "formation never leaves the operation ledger's quorum concentrated on the seed while dependent control-plane moves proceed" | owner order on the drain host: ledger spread deficit ranked first, dependents refused LEDGER_TRANSITION_UNRESOLVED until the ledger move's terminal; same event trace as the DT6 witness at the owner |
| dt6-voter-surplus-promotion-drain-livelock | rebalancer-owner-clock-dt6-regression (statement), formation-replace-dispatch-deferred-retry-hold (constraint) | "the two DT6 formation falsifiers are green on the owner clock" | surplus REMOVE scoped by voterRetirement through the owner's remove path (`replica-placement-owner-remove.js`), promotion drain on the virtual clock of the drain host |
| dt6-operation-ledger-terminal-hold | movielens-operation-ledger-terminal-hold (quest-identity, repro in its log; doneWhen is a scenario harness) | "a locally created operation-ledger REPLACE keeps the serialized self-move hold engaged until authoritative terminal" | ledger REPLACE admitted with the hold; dependents refused until its committed terminal; step-age timeout alone releases nothing (the applier reads committed steps) |
| dt-formation-priority-placement-before-active | formation-barrier-release-snapshot-coherence (statement: guard cases :680, :715, :752 stay green) | barrier/latch guards keep exact semantics | the creation in this file only stages a ledger move; restage it as an admitted owner move, guard cases unchanged |
| ledger-quorum-spread-hold-cure-drain-admission | v1, v2 (doneWhen), decision table `operation-ledger-hold-engagement.json`, red-main-multi-join receipt, replica-placement-admission-owner (constraint) | "the operation-ledger quorum-spread hold cannot defer its own documented cure" | the fenced surplus REMOVE as an owner candidate with voterRetirement while the hold is engaged; decision-table rows restated on the applier's refusals |
| formation-ledger-spread-voter-ready-readiness | formation-ledger-spread-voter-ready-readiness-closure (quest), committed-node-remove-safety-wake, replica-retirement-terminal-actuals-coherence (constraints) | "cold-formation operation-ledger spread converges under readiness-gated voter-readiness" | ledger REPLACE/REMOVE admitted by the owner (scoped), the voter-readiness wait unchanged in the workflow owner |

Group C, coordinator creation-time properties of managed types (the property itself was decided in the record
path, which managed types no longer take):
| File | Quest | Sealed sentence (abridged) | Transfer plan |
|---|---|---|---|
| assignment-epoch-fencing | assignment-epoch-fencing (receipts unreadable-epoch-defers, executor-rejects-stale-epoch) | an unreadable membership epoch defers creation; the executor rejects a stale epoch | admission statement carries `membershipPublicationEpoch`; `assertCreationRequestEpoch` still runs before admission on the coordinator path (bound harness), executor receipt unchanged |
| replica-operation-membership-epoch-binding | membership-epoch-null-rehydration (receipts E1-E8) | one decoder of the durable epoch column | rows from the admission applier (bound harness); decoder receipts unchanged |
| existing-group-add-topology-guard | existing-group-add-topology-guard (receipts self-only-cohort-add-deferred, cohort-stamp-authoritative-read) | a self-only cohort ADD is deferred | the guard (`ensureCreateTopologyGuardAllowed`) still runs before admission on the bound coordinator; restage through the bound harness |
| reservation-fail-closed-dispatch-gate | reservation-fail-closed-dispatch-gate (3 receipts) | creation fails closed when the reservation insert fails; dispatch gate repairs | does creation-time reservation exist for managed types at all on the admission path? (none found in `createPartitionOperationViaPlacementAdmission`): if not, supersession (capacity moved to K_SRC/K_TGT at admission) |
| coordinator-reservation-lifecycle | formation-reservation-reconcile-premature-orphan-release (statement) | the reconcile never releases an active reservation without an authority read | as above: transfer if reservations still exist for managed types, else supersession |
| rebalancer-own-create-memory-duplicate-replace | rebalancer-own-create-memory-duplicate-replace (doneWhen) | "a planned move is executed by at most one creator cluster-wide" | PARTITION_BUSY + single owner per ledger tenure (the tenure witnesses) |
| formation-runtime-service-create-lane-budget-starvation | formation-runtime-service-create-lane-budget-starvation (doneWhen), wasi receipt | runtime-service ADDs create replicas post-formation | runtime-service admission (TARGET_CLAIM_TAKEN, formation latch) through the bound harness |
| terminal-failed-add-target-cleanup | fresh-create-failure-after-committed-admission v1/v2 (receipt failed-create-without-owner-not-protected), failed-create-cleanup-settlement-separation, failed-create-target-authoritative-cleanup (receipts) | a failed create never leaves an orphaned configured member | workflow-after-creation: rows from the admission applier (bound harness), same assertions |

Group W, the sealed property lives after creation (the old path only produced the row):
| File | Quest | Transfer plan |
|---|---|---|
| replica-retirement-terminal-actuals-coherence | replica-retirement-terminal-actuals-coherence (doneWhen) | REMOVE/REPLACE rows from the admission applier (scoped), same assertions |
| runtime-service-replace-canonical-target-handoff | runtime-service-replace-canonical-target-handoff and -integrity-reseal (doneWhen) | runtime REPLACE row from runtime-service admission (claim key), same assertions |
| spread-cure-at-target-minting-gap | spread-cure-at-target-minting-gap (doneWhen) | the cure ADD as an owner candidate; check whether the cure's authorization is carried by the admission statement (gap to check before transfer) |
| spread-cure-transition-authorization-row, -production-path | critical-spread-transition-authority-carry (receipt "authorization-rides-the-operation-row") | the authorization must ride the ADMISSION row: `operationOf` builds the first step from the statement only; if the statement cannot carry the authorization this is a product gap on the owner path, not a fixture question: report before transfer |
| rebalance-coordinator-operation-ownership, replace-real-group-d2, replace-replica-workflow | failed-create-cleanup-settlement-separation (receipt) | rows from the admission applier (bound harness), same assertions |

### 33.5 Attribution of the 19 files red before 3b (task item 6)
Run at this line's base 974320ad3 (`lab/por-s3b-attr-974320ad-adam-laptop`, 19 files): all 19 RED with the
IDENTICAL first failure line as at 536d024ac (`lab/por-s3b-before-536d024a`), so none is caused by this branch's
stage 1-3a work: membership-publication-first-epoch-members (11), dt6-priority-surplus-remove-authoritative-placement-
fence (2), admission-real-size-estimates (1, visibility deferred), coordinator-created-operation-progress (5),
duplicate-operation-prevention.property (1), formation-runtime-service-create-lane-budget-starvation (20),
message-group-membership-operation-lane (5), message-group-operation-routing.integration (1),
placement-admission-cross-coordinator-target-census (1, W-T), placement-owner-authority-provisioner (1),
quorum-conditioned-remove-safety (9), rebalance-coordinator-topology-guard (1), rebalancer-entity-interaction-contract
(1), rebalancer-own-create-memory-duplicate-replace (2), replace-in-flight-blocks-planning (45),
replace-named-handoff-attempt (1), replica-operation-membership-epoch-binding (8),
storage-reservation-lost-outcome-idempotency (1), strict-operation-outcomes (7). At 23344cddc: see 33.9 (run
pending at the time of writing; `placement-owner-authority-provisioner` does not exist there, so it is run on 18).
At the merge c7991efa8 (`lab/por-s3b-merge-c7991efa-tv-dator`): the fixture line's 20 files: 17 GREEN; 3 now RED
on R2 ("Placement waits for committed formation": admission-real-size-estimates, duplicate-operation-prevention.
property, storage-reservation-lost-outcome-idempotency): the merge cleared their old fixture failures, so their
first failure is now 3b's. With them the R2-red set is 52 files (49 + 3). Classified: admission-real-size-
estimates (S, its own quest's doneWhen), storage-reservation-lost-outcome-idempotency (S, its own quest's doneWhen
and receipt), duplicate-operation-prevention.property (O, manifest only). F7 files at the merge:
cl-036-local-leader-row-seed, partition-service-learner-promotion, split-rebalance-trigger GREEN.

### 33.6 The bound coordinator harness (`test/rebalancer/placement-bound-coordinator-fixture.js`)
What it wires (as `ControlPlaneSetup.create` does): `bindReplicaPlacementOwnerFactory(ControlPlaneSetup.
createReplicaPlacementOwnerFactory({nodeId, controlPlaneReadinessService, rebalanceCoordinator, systemTableCache,
storageAccountingService}))`; this node's ledger replica = a real `replica_operations-p1` PartitionService leader
(`startLeader`, production `REPLICA_OPERATIONS_SCHEMA`, file-backed temp db), registered with
`registerLedgerPartitionService`; every proposal commits through `applyCommitted` (the partition's committed apply),
so `requestPlacementAdmission` -> `applyPlacementCommand` -> `decidePlacementAdmission` (PARTITION_BUSY,
LEDGER_TRANSITION_UNRESOLVED, capacity, claim) answers every creation; the coordinator's production-schema SQL store
opens the SAME database file (`openLedgerDatabase`), so admitted rows and later workflow writes are one table, and
the store mirrors rows the ledger committed into the fixture cache before each statement (as CDC would); the node
authority (the mock readiness port) answers a latched committed formation (FORMED, latch 1). Variants:
`createPlacementBoundTestCoordinator` (createTestCoordinator) and `createPlacementBoundTimeoutTestCoordinator`.
`committedVoterWorld` gives a REMOVE the facts production scopes it by (the replica's SERVICES row from
`PartitionServiceRowOwner.buildServiceRow`, its node's boot incarnation). The inert fresh-create arm of
`createTestCoordinator` now also covers the admission path (a fresh create rests at PENDING, as it did on the record
path). Not attached: the placement owner itself (the ledger replica is not handed the coordinator, so its attach
precondition holds; no autonomous pass). Substituted: consensus (controllable port, one voter); the coordinator's
own later writes are executed on the shared table by its store, not proposed (as in every coordinator fixture).
No unbound creation path, flag or optional factory was added to src.
Item 6 completed at 23344cddc (`lab/por-s3b-attr2-23344cdd-tv-dator`, 18 files, the provisioner witness does not
exist there): 17 RED with the identical first failure as at 974320ad3; `replace-named-handoff-attempt` GREEN there
(fixed on that line by df7be8270, which the merge brought here; here it now stops at R2 instead). Attribution: none
of the 19 is caused by this branch; all 19 are base debt (18 present at 23344cddc too, the provisioner witness is
this line's own and red since it was written).

### 33.7 F6 repair and the other reads of the partition's `rebalancer` field (coordinator item 2 (b), (c); task item 5)
Owner of the sink's leadership: the PartitionService sink driver (`partition-service-leader-activation-methods.js`;
`runtime-service-rebalancer-setup.js:497-498` already names the partition service "the single owner of that
decision"). One implementation: `resolveRebalancerLeadership` retains on `rebalancerLeadershipSinkHeld`, the
leadership the partition last drove to its sink (written by `driveRebalancerLeadershipSink`; reset to false when a
sink is attached/detached and on quiesce; initialised false in the constructor). Acquisition (background ready) and
the drain/raft-loss demotions are unchanged. Witness restated (subject: the sink), assertions' values and messages
unchanged; the one premise `t.ok(ps.rebalancer, 'rebalancer created')` restated as `t.equal(ps.rebalancerLeadership
Sink, sink, 'leadership sink attached')` (the per-partition rebalancer no longer exists); new sixth case: both live
sinks attached through `attachRuntimeServiceRebalancerOwner` / `attachServiceInstallationReconcilerOwner` on real
`service_definitions-p1` / `service_installations-p1` PartitionServices; two non-draining dips through the readiness
fan-out (`handleMetadataPublicationReadinessTransition`): zero demotions of either owner; a drain then demotes each
exactly once (the counter is in the path).
(c) The other reads, each re-examined (src at the F6 commit; "never taken" = no writer of the field remains: its
only writers were `initializeRebalancer` (deleted at 3b) and the `= null` resets):
| Site | What the branch did | Why it is unreachable / null changes nothing |
|---|---|---|
| core-base constructor `this.rebalancer = null` | declares the field | no reader left in the five files except `triggerRebalanceCheck` (kept, below), which reads it truthily: `undefined` behaves as `null` |
| core-base `systemTableCache` setter `if (this.rebalancer) ...systemTableCache =` | propagated the cache | field never set: branch never taken |
| core-base `cdcIntegrationService` setter | propagated CDC | same |
| core-base `handleMetadataPublicationReadinessTransition` `maybeInitializeRebalancer({readinessTransitionOnly: true})` | argument for the deleted edge gate | `maybeInitializeRebalancer()` takes no argument since 3b: dead argument removed |
| split-accessor `submitPartitionSizeMutation` `this.rebalancer?.controlPlaneSystemTableGateway \|\| this.controlPlaneSystemTableGateway` | preferred the rebalancer's gateway | optional chain on a never-set field always yields the partition's own gateway: now read directly |
| split-accessor `setSystemTableCache` / `setCdcIntegrationService` / `setTablePolicyService` `if (this.rebalancer) ...` | propagated each dependency | never taken |
| split-accessor `rebindCoordinator` `if (this.rebalancer) {assertCritical(setRebalanceCoordinator)...}` | rebound the rebalancer's coordinator | never taken; `assertCritical` import now unused there and removed |
| lifecycle `quiesceRebalancing` `if (this.rebalancer) {setLeader(false); shutdown(); = null}` | ended the rebalancer | never taken |
| leader-activation `updateRebalancerLeadership` `if (!this.rebalancer) {...; return}` + `this.rebalancer.setLeader(...)` | drove the rebalancer | the guard is always true: the method is now its former early branch (`maybeInitializeRebalancer(); driveRebalancerLeadershipSink();`), byte-identical behaviour |
| leader-activation `resolveRebalancerLeadership` `const rebalancer = this.rebalancer ...` | the retention state | NOT dead (F6): replaced by the driver's own record (above), not deleted |
NOT changed (finding, outside the five files' authority): `partition-service-metadata-delivery-methods.js`
`triggerRebalanceCheck` reads the field and is now a no-op, but its caller
`bootstrap-node-ready-rebalance-owner.js:92` (`triggerRebalancingOnAllPartitions`, every leader partition on node
ready) is outside this scope: the method and the whole partition arm of the node-ready trigger are dead and need the
caller's removal (owner: bootstrap). Also dead, outside scope: `entrypoint-runtime-admin-composition.js:337-341`
(split-completed `recordStateChange` on child partitions' `rebalancer`), `PARTITION_SERVICE_SHARED.UnifiedRebalancer`
(`partition-service-shared.js`), the `REBALANCER_*_REQUIRED` messages and `REBALANCER_DEPENDENCIES_APPLIED`
(`partition-service-constants.js`). Branch overlap check (`git diff --stat 23344cddc origin/<branch> -- <five
files>`): empty for write-kernel-tenure-fence (eb281f314), owner-fact-read (d358ab712), placement-outcome-format
(dc7f80b7f), retained-ledger-observation-repair (f615921f5), raft-owner-authority (692336b45): no merge note needed.
Tests that observed the field on a real PartitionService and would read `undefined` now: the construction-orders
`schedulersOf` and `placement-owner-authority-negatives` (`target.rebalancer, null`): both restated to "absent or
null is no per-partition scheduler" (`?? null` / `=== undefined`), meaning unchanged.

### 33.8 Item 4: the delete group (each case checked against the preserved requirements first: none is about
ownerless recovery, five-node operation, single-owner scheduling or duplicated placement work; the single-owner
property is held by the construction-orders and negatives witnesses, which stay)
- `test/partition/partition-rebalancer-readiness-edge-gate.test.js`: whole file deleted. Pins the
  `readinessTransitionOnly` edge gate of the existing-rebalancer branch (dependency re-wiring only on a readiness
  edge); the branch is deleted and `maybeInitializeRebalancer` re-wires nothing at all (verifier attack 1: property
  kept trivially; the quest entry `rolling-restart-core-stability/log.ndjson:1150` is an attempt, not a seal).
- `partition-service-role-metadata-publication`: case 8 (defers rebalancer initialization until traffic ready) and
  case 9 (priority control-plane rebalancer starts once metadata publication opens): pin the retired construction;
  the ledger's placement owner attaches independent of readiness (C2) and is covered by construction orders.
  Cases 16, 17 (initializeRebalancer / maybeInitializeRebalancer pass sqlQueryEngine to the rebalancer's gateway): the
  rebalancer's gateway no longer exists. Case 15 kept, restated: its stub rebalancer and the one assertion
  "Should be set on rebalancer" deleted (pins the deleted propagation); partition and coordinator assertions kept.
- `partition-rebalancer-dependency-wiring-characterization` (49 cases -> 23): deleted 26: initialization gate 1-8
  (rebalancer not created when a dependency is missing) and 9 (created when all present); 10 (rebind routes through
  rebalancer.setRebalanceCoordinator); 18 (active rebalancer leader RETAINED across a dip: the property now lives on
  the sink and is witnessed by the restated hysteresis file, case 1); 19, 20 (rebalancer setLeader true/false: the
  sink cases 21-22 hold the same gate); 25, 26 (maybeInitializeRebalancer updates/routes into an existing rebalancer);
  30, 31 (initializeRebalancer throws on a missing dependency); 35-39 (applyRebalancerDependencies, deleted at 3b);
  40 (maybeInitializeRebalancer uses the bundle for an existing rebalancer); 41 (initializeRebalancer accepts a
  pre-built bundle); 43, 44 (rebind updates/routes the rebalancer's coordinator). Kept 23: 11-17 (coordinator
  rebinding and UnifiedRebalancer dependency sync: the class lives on for message groups and runtime services),
  21-24 (leadership sink), 27-29 (UnifiedRebalancer constructor gates), 32-34 (dependency bundle and coordinator
  sync; case 34's two `ps.rebalancer === null` gate assertions deleted), 42, 45-49 (rebind path; the premise
  `t.ok(ps.rebalancer, 'rebalancer created')` deleted in 42, 45, 46, 48, 49).

### 33.9 Executed (tv-dator, check base 0dbed1718) and the 3b red count after each commit
| Commit | What | Lab | Result |
|---|---|---|---|
| c7991efa8 | merge of the fixture line | `por-s3b-merge-c7991efa-tv-dator` (fixture line's 20 + F7 3) | 17/20 GREEN, 3 now on R2 (33.5); F7 files GREEN. R2-red: 52 |
| 31fe55acf | F6 repair + restated hysteresis witness + production-sink case | `por-s3b-f6b1-04c35e7c-tv-dator` (at 04c35e7cd) | hysteresis GREEN (26 assertions; red at 376592b8b); construction orders, negatives, wakes, runtime-service-rebalancer-owner, service-installation-reconciler-setup, node-ready-rebalance-trigger, learner-promotion, cl-036, split-rebalance-trigger GREEN |
| 04c35e7cd | harness + batch 1 | same run | add-workflow, remove-workflow, operation-record-completeness GREEN; timeout-triggers-failure RED at cases 1, 2, 9, 10, 12 and dt6-rebalancer-timeout-failure-virtual-clock RED at case 1 (CREATING, SYNCING, STOPPING, REMOVE, completed, failed cases GREEN): an admitted create at PENDING/SENDING awaits its bootstrap authority and its deadline is the operation budget (5 min from creation), not the step timeout (`isPlacementBootstrapAwaitingAuthority`, `operation-workflow-placement-bootstrap-phase.js`; `reconcileTimeoutOperation`): restated in the next batch. R2-red: 52 - 3 = 49 |

### 33.10 Item 3 of the coordinator amendment (placement owner findings)
- F1: witness added to construction orders ("re-entry during the attach"): join order; after initialize the ledger's
  `raft.readStatus` delivers one `updateRebalancerLeadership()` while the factory is on the stack (anti-vacuity
  asserted: the hook fired at depth > 0); expected RED before the fix (second factory call, typed refusal thrown into
  the event). Fix: `ensureReplicaPlacementOwnerAttached` sets `replicaPlacementOwnerAttachInProgress` before calling
  the coordinator and clears it in `finally`; re-entry is a precondition miss (no-op).
- F2 (who handles the typed refusal): `REPLICA_PLACEMENT_OWNER_COLLABORATOR_INVALID` can arise in production only from
  a wiring error: non-ledger caller (excluded: the attach checks the ledger id first), a non-function factory
  (`ControlPlaneSetup.create` passes one), a missing timer pair (always passed), or an occupied ledger sink (no other
  sink binds the ledger; the one reachable case was the F1 re-entry, fixed). Where it surfaces: inside
  `ControlPlaneSetup.create` (the binding: startup fails, acceptable for a wiring error), `initialize`
  (`partition-service-raft-init-base.js:438`: the ledger replica fails to open), the binder sweep (aborts mid-loop),
  a leadership edge or the readiness fan-out (thrown into the event). After F1 no witness shows a throw into a
  leadership event; no further change (owner rule).
- F4: the teardown witness now also runs the binder sweep (`StartupRuntimeSurfaceOwner.bindControlPlaneServices`)
  after the quiesce and asserts no attachment, no ledger attachment field, the old owner still ended.
- F9: witness added to wakes (TWO_DEFICITS; SECOND inadmissible throughout, TARGET unblocked only for the resync;
  the attempt-record delete faulted for that pass): expected RED (`placementResyncAdmissions` 0). Fix: the count is
  taken once per pass when it ends (`resyncAdmissionsOf(pass, triggers)` in the pass-observation module: the
  admissions a resync-only pass recorded, including one recorded on the local-failure path), replacing the
  per-candidate increment; `planAndAdmit`/`runPassSteps` lose their now unused `triggers` parameter.
- F10: characterization witness added to wakes (ruling pending, no source change): a submitter that throws
  deterministically for TARGET; asserts the same retained entryId is re-submitted on every wake, every pass that
  reaches TARGET aborts there, SECOND is not admitted (head of line for the tenure). Its lab result decides whether
  the verifier's inference holds (33.11).
- Record correction (26.1): a third `new UnifiedRebalancer` exists, `runtime-service-rebalancer-setup.js:124` (the
  runtime-service owner's default `createRebalancer`), out of scope. Re-check of "the partition path can no longer
  reach the class": `grep -rn 'new UnifiedRebalancer' src` gives `message-group-service-rebalancer-runtime-methods.js`
  (message groups) and `runtime-service-rebalancer-setup.js` (runtime services) only; no file under `src/partition`
  constructs or imports a constructor call of it (the remaining partition reference is the
  `PARTITION_SERVICE_SHARED.UnifiedRebalancer` re-export, dead, listed in 33.7).

### 33.11 The "decide per test" group (task item 3) and the per-file list
Fact the decisions rest on: a creation-time storage reservation is inserted only on the record path
(`createOperationRecordInternal`, `rebalance-coordinator-operation-creation.js` ~:794-799: message groups and every
non-managed type); the admission path (`...-creation-support.js`) and the applier insert none (capacity for partition
copies is the applier's K_SRC/K_TGT occupancy). Creation-time dedupe (`queryExistingInFlightOperation`, the intent
single-flight) still runs before admission for managed types, and the applier adds PARTITION_BUSY.
| File | Class | Property | Where it lives now | Decision |
|---|---|---|---|---|
| coordinator-dedup-gap | O | a move already in flight is never created twice | coordinator dedupe before admission (unchanged) + PARTITION_BUSY | property exists: restate on the bound harness (remaining; its ADDs name a physical replica, refused BYTES in production: inputs to restate) |
| reservation-file-backed-restart | O | a lost strict-authority reservation answer leaves durable rows fail closed | record path only (message groups) | property exists for non-managed types: restate onto a message-group create, or delete for partitions: RULING (not deleted in doubt) |
| formation-cure-reservation-progress-obligation | O | one durable reservation identity independent of INSERT spelling | record path only | as above: RULING |
| formation-cure-reservation-progress-successor | O | the owned SQL boundary observes one reservation INSERT | record path only | as above: RULING |
| coordinator-reservation-lifecycle | S | (sealed, 33.4) | record path only | proof transfer / supersession: RULING |
| reservation-fail-closed-dispatch-gate | S | (sealed, 33.4) | creation-time insert: record path only; the dispatch gate's `ensureReservationForOperation` still repairs any row | proof transfer / supersession: RULING |

Per-file state of the 52 R2-red files (S = sealed, not touched; see 33.4):
- Migrated (O): timeout-triggers-failure.property, dt6-rebalancer-timeout-failure-virtual-clock (restated deadline,
  next commit), add-workflow-step-progression.property, remove-workflow-step-progression.property,
  operation-record-completeness.property (GREEN at 04c35e7cd), duplicate-operation-prevention.property (next commit).
- Remaining O, with the restatement each needs: REPLACE tests that overwrite the admitted operation's target replica
  by hand and build their world around a fixed target id (the admission mints `placementReplicaIdOf(operationId)`):
  replace-owner-recovery-equivalence, replace-owner-wake, replace-source-removal-owner, replace-named-handoff-attempt,
  replace-in-flight-blocks-planning, recent-completed-replace-target-visibility, dt-ledger-completion-continuity-
  discriminator (ledger REPLACE); REMOVE tests whose worlds lack the scoped voter facts (registered SERVICES row with
  created_at, node boot incarnation): replica-removal-deferral-dispatch-reconcile, coordinator-created-operation-
  progress, quorum-conditioned-remove-safety (11 coordinators), partition-policy-remove-retry; own coordinator
  builders: readiness-snapshot-persistence, operation-log-persistence.property (ADD with a physical replica id,
  REMOVE unscoped); runtime-service-target-claim (runtime admission; its explicit-replica case asserts the record
  path's refusal shape); critical-spread-terminal-stall-repro and replace-real-group-scheduling (harnessed planner and
  real-group worlds: need the bound harness threaded through their builders); coordinator-dedup-gap and the three
  reservation files above.
- S (26, incl. admission-real-size-estimates and storage-reservation-lost-outcome-idempotency): untouched; transfer
  plans in 33.4.

### 33.12 Executed after batches 2-4 (tv-dator, check base 0dbed1718)
- Red-first at 6aebc7389 (before the fixes; `lab/por-s3b-witnesses-6aebc738-tv-dator`): F9 RED for the predicted
  reason (`resyncAdmissions` 0; passes LEADERSHIP_START, RESYNC (ABORTED, admitted `pl-sql_transactions-p1-3-0`),
  RESYNC+LEDGER_COMMIT: the retained-trigger pass is not resync-only, as the verifier read). F10 characterization
  GREEN: the verifier's inference holds (one retained entryId re-submitted on every wake, every pass reaching TARGET
  aborts there, SECOND never admitted: head of line for the tenure; ruling needed). F1: the witness failed on a fixture
  error (the opened port is frozen: `Cannot assign to read only property 'readStatus'`), fixed in the next commit
  (delegating port). F4 extension RED: with the binder holding `node.coordinator` after the quiesce it attaches an
  owner (actual 1); the cleanup's delegate had cleared only its own variable, so that schedule models a coordinator
  re-bound after the quiesce (the startup's assignment after its `await ControlPlaneSetup.create`): split into its
  own case (finding, schedule not traced), the teardown case now sweeps with the cleared coordinator.
- Final selection at 4dbd6091c (`lab/por-s3b-final-4dbd6091-tv-dator`, 168 files = the 3b selection minus the
  deleted edge-gate file plus the hysteresis witness and the F7/sink files): 107 GREEN, 61 RED.
  - GREEN that were red at 3b: timeout-triggers-failure.property, dt6-rebalancer-timeout-failure-virtual-clock,
    add-workflow-step-progression.property, remove-workflow-step-progression.property,
    operation-record-completeness.property, duplicate-operation-prevention.property (also red before 3b),
    message-group-operation-routing.integration (merge), partition-rebalancer-dependency-wiring-characterization
    (23 cases), partition-service-role-metadata-publication, partition-rebalancer-leadership-readiness-hysteresis,
    placement-owner-authority-wakes (F9 fixed, F10 characterization).
  - RED caused by stage 3, by class: 46 files whose first failure is R2 (the remaining O list and the S files of
    33.4/33.11); `partition-service-learner-promotion` case 3 (introduced by the dead-read deletion: it pinned the
    deleted rebind arm; restated in the next commit); `placement-owner-construction-orders` (witness fixture, next
    commit).
  - RED in the known list (unchanged first failures): drain 4 (`dt-placement-owner-formation-drain`),
    growth-promote 40, barrier 2, write-kernel 1, clearing-triggers F11, core 18, provisioner 1; base debt (33.5):
    membership-publication-first-epoch-members 11, dt6-priority-surplus-remove-authoritative-placement-fence 2,
    message-group-membership-operation-lane 5, placement-admission-cross-coordinator-target-census 1,
    rebalance-coordinator-topology-guard 1, strict-operation-outcomes 7.
  - R2-red count after each commit: 49 (3b) -> 52 (merge c7991efa8) -> 49 (04c35e7cd: three property files) -> 46
    (4dbd6091c: the two timeout files and the dedupe property); plus the one file the dead-read deletion turned red
    (restated next).

### 33.13 Commits of this writer (all through tools/heavy.sh, pushed) and every changed expectation
`c7991efa8` merge of the fixture producers; `31fe55acf` F6 (sink hysteresis in its driver + witness); `04c35e7cd`
bound harness + batch 1; `6aebc7389` dead reads deleted, delete group, witnesses F1/F4/F9/F10 (red first);
`85000364d` F1 and F9 fixes; `4dbd6091c` timeout restatement + dedupe property; `5986b79b7` F1 witness port by
delegation, F4 schedules split, learner-promotion restatement.
Changed expectations (old -> new, reason):
1. hysteresis witness: subject `ps.rebalancer.isLeader` -> the driven sink's `isLeader` (values and messages
   unchanged); premise `t.ok(ps.rebalancer, 'rebalancer created')` -> `t.equal(ps.rebalancerLeadershipSink, sink,
   'leadership sink attached')`: the per-partition rebalancer is retired; the property is the sink's.
2. timeout-triggers-failure cases PENDING, SENDING, statistics, multiple, event and
   dt6-rebalancer-timeout-failure-virtual-clock cases 1 and 3: the deadline of an admitted create at PENDING/SENDING is
   the operation budget from creation (`REBALANCE_OPERATION_BUDGET_MS`, 300 s; `isPlacementBootstrapAwaitingAuthority`)
   instead of the step timeout: backdate of `updated_at` by 100 ms -> backdate of `created_at` by budget + 100 ms;
   virtual advance 100 ms -> budget + 100 ms. Assertions (FAILED, message names Timeout and the step) unchanged.
3. Inputs restated, no assertion changed: a REMOVE names a replica its world holds (`committedVoterWorld`: remove
   property, record-completeness REMOVE cases and its "statistics" REMOVE now `replicaId 'test-replica-2'`, timeout
   STOPPING cases' services rows from `buildServiceRow`); a partition ADD names no physical replica (record-completeness
   generator: `replicaId: fc.option(...)` -> `fc.uuid()` used only by REMOVE).
4. Assertions deleted with the mechanism they pinned: role-metadata case 15 "Should be set on rebalancer";
   learner-promotion "Rebalancer should receive shared coordinator"; characterization case 34's two
   `ps.rebalancer === null` gates and the premise `rebalancer created` in cases 42, 45, 46, 48, 49; the 26
   characterization cases and role-metadata 8, 9, 16, 17 and the edge-gate file (33.8).
5. Owner witnesses read an absent field as "no per-partition scheduler": construction-orders `schedulersOf`,
   negatives `target.rebalancer ?? null`.
Not executed red-first: F1 with the corrected witness (the 6aebc7389 run stopped on the frozen-port fixture error;
the corrected witness exists only after the fix); its red is INFERRED from the factory/sink code (a second factory
call refused typed), its green is executed (33.14).

### 33.14 Executed at 5986b79b7 (`lab/por-s3b-b5-5986b79b-a1-adam-laptop`; tv-dator and adams-gamla not ready)
partition-service-learner-promotion GREEN (46); placement-owner-authority-wakes GREEN (12: F9 counted, F10
characterization holds); construction orders: cases 1-11 GREEN (teardown with the binder sweep on the cleared
coordinator: F4 excluded for the production schedule; F1 re-entry: one factory call, no throw, one owner), then the
split-out F4 case (sweep holding the node's coordinator after the quiesce) did not finish: the file was SIGKILLed
(40 s). That case is removed in the next commit; its finding stands on the 6aebc7389 execution (the sweep attached an
owner after the quiesce, actual 1).
FINDING F4 (owner: bootstrap, not changed here): `StartupRuntimeSurfaceOwner.bindControlPlaneServices` has no
shutting-down check, and the startup assigns the coordinator after `await ControlPlaneSetup.create`
(`bootstrap-service-control-plane-runtime-methods.js:161`, `node-joining-publication-activation.js:462`): if a cleanup
quiesces the node during that await and the assignment and sweep follow, the ledger gets a placement owner again
after the quiesce (executed at fixture level; whether `settleInfrastructureAcquisitions` excludes this order in
production was not traced).
