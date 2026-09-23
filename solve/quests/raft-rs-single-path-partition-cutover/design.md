# Design: raft-rs-single-path-partition-cutover (attempt plan, 2026-09-23)

Produced by a read-only architect on the sealed head 19507fb7f (sealed at
6e4fe787c), reviewed and decided by the lead. Paths are repository-relative;
line numbers are on the sealed head. The frozen operation port keeps its twelve
operations throughout; only the request's callback contract changes.

## 0. Measured facts the design rests on

F1. Why a committed entry is never applied on rs-raft. The port encodes each
proposal as JSON bytes (`src/raft/raft-rs-operation-port.js:47-55,198`) and passes
the partition's APPLY_COMMITTED_ENTRY callback to the runtime unchanged (:137-138).
`applyEntries` (`src/raft/raft-rs-runtime-owner.js:378-385`) calls
`applyCommittedEntryTransaction`, which calls `applyCommittedEntry(Buffer.from(entry.data,'base64'))`
with one argument, raw bytes, inside `store.transaction`, then `putAppliedState`
(`src/raft/raft-rs-application-transaction-owner.js:6-13`). The partition callback
`(command, effects) => applyPartitionApplicationAndProgress(...)`
(`src/partition/partition-service-raft-init-base.js:452-457`) therefore hands a
Buffer to `applyCommittedEntry` (`src/partition/partition-service-entry-apply-base.js:963-1120`):
`command.type` is undefined, the SQL and TRANSACTION_COMMIT branches are skipped,
`effects` is undefined so every effect runs inside the transaction, and an
ENTRY_COMMITTED event carrying the Buffer is emitted. `recordAppliedAdvance` then
writes the legacy `_raft_state.lastAppliedIndex`. Latent second defect: the guard is
only `entry.data !== undefined`, so conf-change entries' protobuf bytes are also
handed to the application. The liferaft contract being replaced is
`prepareCommitApply(command, effects)` (`src/raft/liferaft-provider.js:219-220`) with
an `{afterCommit, afterRollback}` effect bag (`liferaft-commit-scheduler.js:18-20,106-117`).
rs-raft never emits RAFT_EVENT.COMMIT (`raft-rs-runtime-owner-constants.js:32-35`,
`raft-rs-runtime-owner.js:504-524`).

F2. A lone rs-raft leader commits and applies its own proposal
(`test/raft/raft-rs-backend/operation-port-ready-recovery.test.js:205-245`; lead's
scratch: commitIndex 1 -> 2 within 25 ms).

F3. The legacy append is a duplicate authority even under liferaft: `applyWrite`
appends via `storage.appendEntry` (`partition-service-write-metrics-base.js:691` ->
`partition-raft-storage.js:221-225`) and then the liferaft port's `propose`
(`node.command`) runs `raft.log.saveCommand` again. On rs-raft `storage.currentTerm`
is fed only by lifecycle wiring from `readStatus().term`, hence the census's NOT NULL
`_raft_log.term`.

F4. `readStatus()` returns a value when the group's queue is idle and a Promise
otherwise (`raft-rs-runtime-owner.js:278-300`); work becomes asynchronous whenever
`sendToPeer` returns a Promise (production `transport.deliver` does). Every
synchronous `this.raft?.readStatus?.().x` reads undefined on a busy multi-replica
group: write-metrics-base.js:671; transaction-base.js:468,920,956,990;
raft-init-base.js:118,504; learner-promotion-proof-methods.js:97,105,107;
peer-cache-reconciliation.js:21,160,324; lifecycle-wiring.js:38.

F5. The rs-raft store shares the partition's single SQLite connection
(`raft-init-base.js:434` -> `raft-rs-runtime-owner.js:705`) with interactive session
transactions (`BEGIN IMMEDIATE`, `partition-service-transaction-base.js:576`,
`partition-transaction-handler.js:81`).

## 1. Consumer census of the legacy durable consensus state (partition path)

Classes: OWNER, CONSUMER, DUPLICATE_AUTHORITY, DELETE, GAP. A1/A2/A3 = the attempt
that changes the site (section 5).

Construction and selection
- S1 `partition-service-core-base.js:12,99-103` `options.raftProvider || createRaftProvider(options)`: DELETE selector and injection; fixed rs-raft factory. A1.
- S2 `src/raft/raft-backend-selection.js`, `raft-backend-constants.js`: DELETE both. A1.

Durable log, term, applied watermark
- S3 `raft-init-base.js:367-373` constructs SQLiteLogAdapter (creates `_raft_log`/`_raft_state`) and PartitionRaftStorage (loads term/vote, writes appliedGapMarker): DUPLICATE_AUTHORITY, stop constructing. `_transaction_outcomes` DDL (`partition-raft-storage.js:77`, `partition-service-constants.js:69-76`) is participant state: move its DDL to PartitionServiceTransactionBase (its consumer, `transaction-base.js:880-882`). A3.
- S4 `raft-init-base.js:433,438-440` DURABLE_LOG / INITIAL_TERM: only liferaft reads them; DELETE from the request. A1.
- S5 `raft-init-base.js:452-457` + `applyPartitionApplicationAndProgress` (`recordAppliedAdvance`): the applied watermark's owner is `_raft_rs_applied_state` written in the same transaction (`application-transaction-owner.js:6-14`, `raft-rs-durable-store.js:214-222`); legacy `lastAppliedIndex` is DUPLICATE_AUTHORITY. DELETE `applyPartitionApplicationAndProgress`. A1.
- S6 `raft-init-base.js:460-462` APPLY_TRANSACTION_ROLLED_BACK -> `refreshAppliedWatermarkCacheFromStore`: rs applied state rolls back with the transaction; DELETE; pending-write rejection moves into afterRollback effects. A1.
- S7 `lifecycle-wiring.js:43,53,69,111` `storage.currentTerm = term`: DUPLICATE_AUTHORITY of `readStatus().term`; DELETE. A1.
- S8 `lifecycle-wiring.js:82-92` onCommit second application path: rs-raft never fires it; liferaft bypasses it. DELETE the handler; keep `events.COMMIT` in the map (subscribed unconditionally, `replica-leadership-state.js:141-143`; the rs port throws on an undefined event name). A1.

Write path
- S9 `write-metrics-base.js:691-697` legacy append + `buildDurableCommitWitness` from the pre-commit entry: the witness's owner is the committed entry the core hands to the application (index, term). DELETE, rebuild in the application. A1.
- S10 `write-metrics-base.js:669-674,713-756` commit-mode resolution and the DIRECT branch (`partition-write-kernel.js:117-153`): DELETE DIRECT and `executePartitionWriteStatement`; leadership from an awaited `readStatus().role`. A1.
- S11 `partition-service-raft-write-commit.js:23-26` pre-seeds logIndex and witness: stops. A1.
- S12 `entry-apply-base.js:963-1120` `applyCommittedEntry`: OWNER of application (SQL, replay skip :1003-1021, leader CDC :1033-1048, TRANSACTION_COMMIT :1096-1113); input contract changes. `:519` `buildRemoteReadAuthorityWitness` reads `storage.currentTerm`: CONSUMER of `readStatus().term`. A1.
- S13 unrecognised committed commands fall through silently (`:986-1119`); record-only types PREPARE_TRANSACTION/ROLLBACK are legitimate (`transaction-base.js:922,958,992`). GAP (R07). A1.

Transactions
- S14 `transaction-base.js:919,955,989` `storage.appendEntry(marker)` + synchronous role check + fire-and-forget propose: DELETE the append; propose-only with awaited role. `:644-657` stores `raftLogIndex` from the legacy append: no source at propose time (Q3). A1.
- S15 `transaction-base.js:58-100` `reconstructPreparedState` reads `storage.getEntriesFrom(1)`: GAP, no decoded committed-command read exists; CONSUMER of the new store read. A2.
- S16 `transaction-base.js:359-363` `refreshCommittedIndexCacheFromStore`: DELETE. A1.

Readers of the legacy log
- S17 `raft-init-base.js:285-298,422` `warmHlcFromCommittedLog` (`partition-hlc-warmup.js:31-51`): rs restore never re-applies, so HLC monotonicity after restart is unowned; CONSUMER of the new store read. A2. Snapshot-boundary HLC: GAP (snapshot quest).
- S18 `partition-mirror-replay-cursor.js:22-27,101-117`: barrier from the rs committed index; deltas from the new store read. A2.
- S19 `partition-snapshot-cadence.js:122-139` and checkpoint creation (`snapshot-checkpoint-constants.js:38-53`): GAP (snapshot quest); with no adapter the 1 s tick would throw into TICK_FAILED every second; return a typed unsupported outcome. A3.
- S20 `partition-service-durability-fitness.js`: `:4` imports tracked-leader-demotion (-> liferaft.js); legacy-only signal (b) at :113,183,297: DELETE; demotion at :358,:400 is already dead on rs-raft (finding F1 in the epic): typed unsupported outcome. Signal (a) `db.inTransaction` stays. A3.
- S21 `partition-service-split-accessor-base.js:615,638-639` `storage.currentTerm`, `getLogLength()`: term from readStatus; logLength has no rs-raft meaning, replace with commitIndex or delete. A3.
- S22 `partition-service-lifecycle-methods.js:29-31` `logAdapter.close()`: DELETE. A3.
- S23 `partition-service-shared.js:62,65,69-72,156-159` imports of SQLiteLogAdapter, LiferaftProvider (unused by partitions), raft-timing-utils, PartitionRaftStorage; `partition-service.js:7` re-export: DELETE; split the timing module (section 4). A3.
- S24 `raft-init-base.js:113-123` `resolveCurrentTermSafe` gates on raftProvider: port only. A1.
- S25 stay unchanged (port operations) but carry the F4 risk: `raft-init-base.js:503-506`, learner-promotion-proof-methods, peer-cache-reconciliation.

Snapshot catch-up, leader handoff, other
- S26 SNAPSHOT_CATCHUP_NEEDED (`raft-init-base.js:463-468`, `snapshot-catchup-wiring.js:110`): the rs port never calls it; delete the unused request field; the dispatcher stays wired and inert (recorded).
- S27 boot-time install (`raft-init-base.js:343-360`, `snapshot-install.js:54,146,163,179`) writes legacy rows incl. currentTerm; the detector runs after it on the opened DB (recorded for the snapshot quest).
- S28 `replica-handler-leader-handoff-methods.js:56-91,110-151`: already PROVIDER_UNSUPPORTED on rs-raft; stays typed NOT_SUPPORTED without `service.raftProvider`. GAP (leader transfer, F1).
- S29 `partition-replication-handler.js:284,322`: no importer in src; a second direct-apply path. DELETE module, constants and its three tests. A3.
- S30 worker partition path: not production-reachable; recorded for R4. S31 `lagrange-runtime-startup.js:717` process RAFT_PROVIDER gate: recorded for R4. S32 src/query, src/cdc, src/rebalancer: no legacy reads.

## 2. Write-path design

Contract: the port that encodes is the one that decodes. The codec lives in
`raft-rs-operation-port.js`: `encodeProposal` / `decodeCommittedProposal`, JSON-only
(drop the Uint8Array/Buffer pass-through so decoding is total; never a core-primitive
name, the boundary audit flags those). The port wraps the request's
APPLY_COMMITTED_ENTRY: the runtime calls `(bytes, {index, term, effects})`; the port
calls the partition with one frozen record `{command, index, term, effects}`; a decode
failure throws an Error with `.code = 'committed_proposal_undecodable'`.

`applyCommittedEntryTransaction` applies only NORMAL entries with data
(`raft-rs-ready-loop-constants.js:4-8`; conf changes stay with the runtime), builds
`effects = {afterCommit: [], afterRollback: []}`, calls the application with
`{index: entry.index, term: entry.term, effects}` then `putAppliedState`, all inside
`store.transaction`; after it returns, runs afterCommit with each effect isolated; on a
throw runs afterRollback and rethrows (the runtime marks RECOVERY_REQUIRED and returns
HOST_FAILURE phase application). DELETE `applyPartitionApplicationAndProgress`; the
partition callback becomes `(committed) => this.applyCommittedEntry(committed)`; the
store and the partition share one connection so one transaction covers SQL and
applied state (atomicity already proven at `operation-port-ready-recovery.test.js:180-200`).

`applyCommittedEntry({command, index, term, effects})`: SQL execution, replay skip,
INSERT replay suppression, migration defaults and TRANSACTION_COMMIT stay where they
are. New: the commit witness is built from the committed entry with
`buildDurableCommitWitness({partitionId, leaderNodeId: this.nodeId, leaderReplicaId:
command.proposedBy, logEntry: {term, index, data: command}})` (`partition-write-kernel.js:100-115`),
only when `command.proposedBy === this.replicaId` (only the proposer holds the pending
entry); resolve the pending write with `{success, changes, lastInsertRowid,
partitionId, logIndex: index, durableCommitWitness}` and `trackAppliedEntryKey` in
afterCommit. Unrecognised types: `PARTITION_COMMITTED_COMMAND_OUTCOME = {APPLIED,
REPLAYED, RECORDED_ONLY, UNRECOGNISED}` in partition-service-constants; UNRECOGNISED
throws a typed error inside the transaction (fails closed; decided, see section 6).

`applyWrite`: build the entry, pending-outcome and replay checks unchanged; then
`const status = await this.raft.readStatus()`; mode RAFT if `status.role === LEADER`
and not (`replicaIds.length <= 1 && hasKnownRemoteLeaderWitness()`), else REJECTED
(the CL-013 fork guard kept only as a REJECTED condition; `PARTITION_WRITE_COMMIT_MODE`
shrinks to `{RAFT, REJECTED}`); then `startPartitionRaftWriteCommit(this, {entry,
entryKey, phaseTimings, applyStartMs})`. `waitForCommittedWrite(entryId)` is registered
before `propose`; a lone leader applies synchronously inside `propose` and resolves
from afterCommit. CDC is emitted exactly once, in the leader's afterCommit. Deleted:
the DIRECT branch, `executePartitionWriteStatement`, `applyPartitionApplicationAndProgress`,
the legacy append, `onCommit`, the storage term writes, WRITE_PHASE_FIELD_LOG_APPEND_MS use.

Idempotency: `_raft_rs_applied_state` is the only applied watermark, atomic with the
SQL; the runtime restores `applied = appliedIndex` so a restart never re-delivers
applied entries; the dedupe set is updated only in afterCommit so a rolled-back apply
leaves no key and reconstruction re-applies once; a client whose pending write was
rejected by afterRollback but whose entry later committed succeeds on retry through
`buildAppliedEntryReplayResult`. Known limit (recorded): the in-memory dedupe set is
empty after restart (same on liferaft today).

## 3. Selection and refusal design

No production construction site sets raftBackend or raftProvider
(`seed-partitions-phase.js:197-223`, `bootstrap-service-replica-registration-methods.js:119-131`,
`node-joining-publication-activation.js:210-221`). In core-base: delete the selection
import and provider field; add `createOperationPort(request)` returning
`RAFT_RS_PROVIDER.createPartitionPort(request)` with a module-frozen
`new RaftRsWasmProvider()` (RaftRsWasmProvider stays: the boundary witness reads its
source); `raft-init-base.js:428` calls it. Test seam: tests subclass PartitionService
and override `createOperationPort` with the controllable provider's port; no production
option; a static guard asserts no src module overrides it. Typed refusal: in the
constructor, `options.raftBackend !== undefined || options.raftProvider !== undefined`
throws an Error with `.code = PARTITION_CONSENSUS_STARTUP_OUTCOME.BACKEND_SELECTION_REFUSED`
(`'partition_consensus_backend_selection_refused'`) whose message echoes the requested
name and says the backend is retired (no liferaft literal in src). Precedent for
`.code`: `src/raft/committed-entry-guard.js:21`.

Legacy-state detector: new `src/partition/partition-legacy-consensus-state.js` owns the
historical table and key names; called in raft-init-base's boot block right after the
Database is opened and the pragmas, before any DDL and before the port; read-only
(check `sqlite_master` first). Meaningful = any `_raft_log` row, or `_raft_state`
holding `currentTerm > 0`, non-empty `votedFor`, or `committedIndex > 0`; table
existence does not count. "No rs-raft record" comes from the store owner: a read-only
static `RaftRsDurableStore.hasDurableRecordIn(db, groupId)` with the same predicate as
`hasDurableRecord` and no DDL. On a match: close the db, keep `this.raft` null, throw
`.code = 'legacy_partition_consensus_state_detected'` with reason codes (naming
precedent: `install_state_conflict`, `_detected` suffix in invariant-constants). Update
`src/partition/README.md` (still names the selector and PartitionRaftStorage as owners).

## 4. What must keep working outside this quest

LiferaftProvider stays constructed by message groups, RaftGroup, RaftReplicaBase and
WasmServiceReplica (none in PartitionService's import closure, measured over 632
modules). Witness 2 needs four edges cut: core-base's selection import (A1);
`partition-service-shared.js:65` LiferaftProvider (unused by partitions);
`partition-service-shared.js:69-72` raft-timing-utils, where the partition needs only
`computeReplicaElectionTimeouts` (`raft-init-base.js:396,674`): move it to a neutral
`src/raft/replica-election-timeouts.js`, keep `applyRuntimeRaftTiming` in
raft-timing-utils (liferaft-object-only, used by message-group timing) and re-export
the neutral function there for message-group lifecycle until R3;
`partition-service-durability-fitness.js:4` tracked-leader-demotion: delete, replace
with a typed "demotion unsupported" outcome (`replica-handler-leader-handoff-methods.js:16`
keeps its import; outside the closure). Recorded for their own quests: message groups,
RaftGroup, RaftReplicaBase, WasmServiceReplica, the worker path, process RAFT_PROVIDER
control, snapshot catch-up/install, leader transfer, pre_vote/check_quorum.

## 5. Attempt sequencing (the quest lands once, at the end)

A1 - one propose, applied by the committed-entry application, rs-raft by construction.
11 src files changed (application-transaction-owner, raft-rs-operation-port,
core-base, partition-service-constants, raft-init-base, entry-apply-base,
write-metrics-base, raft-write-commit, partition-write-kernel, lifecycle-wiring,
transaction-base S14/S16), 2 deleted (raft-backend-selection, raft-backend-constants).
Red on revert: receipts 1, 3, 4, 6. Tests: the ten ControllablePartitionRaftProvider
suites move to the subclass seam; partition-service-write-commit (direct
`applyCommittedEntry(command)` at :131, DIRECT replay at :161-188) and
partition-write-kernel (DIRECT) migrate; the partition-node-cluster harness (raw-bytes
proposals, callback shape :180-184) and its six dependents; group-B dt6 fixtures propose
through the port and seed the prefix by proposing; group-C "absent is liferaft"
witnesses and partition-construction-seam (RecordingLiferaftProvider) are deleted as
superseded; `npm run test:metadata:refresh`; then re-run the census for group A.

A2 - committed-command readers consume the rs-raft store (about 6 files):
`RaftRsDurableStore.readCommittedEntries` (NORMAL entries up to hardState.commit), the
port codec export, partition-hlc-warmup, partition-mirror-replay-cursor,
transaction-base `reconstructPreparedState`, raft-init-base warm-up call. Red on
revert: partition-service-hlc-monotonicity "restart warms the HLC", durable-replay-cursor,
partition-transaction.property (reconstruct), migrated to rs-raft restart. Before A3
so no reader silently reads an empty legacy log.

A3 - legacy state off the partition path; detector; import closure (about 12 files):
raft-init-base, the detector module, raft-rs-durable-store (`hasDurableRecordIn`),
partition-service-shared, replica-election-timeouts.js, raft-timing-utils,
durability-fitness, lifecycle-methods, split-accessor-base, snapshot-cadence (typed
unsupported), partition-service.js re-export, transaction-base (`_transaction_outcomes`
DDL), delete partition-replication-handler + constants, README. Red on revert:
receipts 2 and 5. Tests: snapshot-cadence and snapshot-catchup-end-to-end become
explicit-unavailability witnesses or are deleted with a snapshot-quest finding;
dt6-ledger-leader-durability-fitness signal (b) gone (recorded); the 14 snapshot suites
building PartitionRaftStorage directly keep passing (module kept). Unresolved group B:
address-manager-peer-location-authority (rs probe reads status or ticks),
partition-service-transactions-query-routing (deferred joiner campaigns).

## 6. Decisions on the open questions (lead, 2026-09-23)

- Q1 durable raft writes inside an open user session transaction (F5): pre-existing
  on liferaft too (the commit slice ran as a savepoint inside the session; a later
  ROLLBACK erased committed entries). Not widened into this quest: recorded as epic
  finding F6 with its own quest (consensus persistence must never run inside a user
  session transaction) before certification item "acknowledged-write correctness".
- Q2 sync-or-Promise `readStatus`: await it in applyWrite and the transaction markers
  (in scope); the other sites are recorded (S25) for the convergence epic.
- Q3 transaction markers: stay fire-and-forget as today; `raftLogIndex` is no longer
  stored (no source at propose time); the TRANSACTION_COMMIT replay and commit-CDC
  ordering observations are recorded in F6's quest.
- Q4 UNRECOGNISED committed commands fail closed (typed error, RECOVERY_REQUIRED).
- Q5 detector scope stays exactly the sealed text (legacy content AND no rs record);
  legacy rows beside an rs record are tolerated as `restart-from-durable-record`
  pins; the boot-install writer (S27) is the snapshot quest's problem.
- Q6 no quarantine exists: every group-B/snapshot test is migrated or deleted with a
  finding; nothing is left red at land.
- Q7 JSON-only codec accepted: Lagrange proposals are JSON commands; liferaft stored
  JSON text in `_raft_log.command` with the same Buffer/BigInt lossiness.
- Q8 afterCommit effect failures are logged by the partition at error level with a
  typed message; the port is not widened.

## 7. Amendments after attempt A1 (lead, 2026-09-23)

- A7.1 `readStatus()` is a synchronous observation, never a Promise. The rs-raft
  runtime owner returns the fresh core read when the group's queue is idle and the
  frozen snapshot refreshed after the last completed core entry when the queue is
  busy. Measured cause: 22-35% of a busy seed's 135 replicas answered a Promise at
  any instant (F4), which made the sealed seed witness red and left twelve
  production sites reading undefined. The witness is not changed.
- A7.2 A failed SQL statement in a committed entry is a deterministic
  state-machine outcome (STATEMENT_FAILED in PARTITION_COMMITTED_COMMAND_OUTCOME):
  the entry is consumed, the applied index advances in the same transaction, and
  the proposer's pending write resolves in afterCommit with success: false (as the
  deleted DIRECT path reported it). Treating it as a host failure wedged a
  single-replica partition (RECOVERY_REQUIRED, reconstruction, no re-campaign).
  UNRECOGNISED types stay fail-closed.
- A7.3 F6 is no longer deferrable by itself: with the rs-raft store on the
  partition connection, a session ROLLBACK after a marker proposal erases
  committed rs-raft rows (log [1,3] with commit 3) and the restart traps in the
  core. A separate design (session-transaction isolation) decides whether the fix
  lands inside this quest or as its own quest before the default flip; this quest
  does not land with the corruption reachable.
- A7.4 The dt6 learner-promotion witnesses cannot run on rs-raft with cache-only
  "passive voters": the cache-driven membership reconcile proposes them as voters
  and the two-voter configuration has no live quorum. That is the R2 deletion
  target; the fixture is redesigned with live voters after integration.
