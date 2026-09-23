# Census: snapshot/catch-up ownership and legacy partition consensus state (2026-09-23)

Read-only census on main `e3ac0514b` for the epic gaps "Snapshot/catch-up
ownership" and "Legacy partition consensus state" (`raft-rs-full-cutover.md`).
Produced by a verifying agent; every claim carries a file:line citation. Classes:
(1) generic state-machine/snapshot concern to retain and re-own under rs-raft;
(2) rs-raft concern already owned by the durable store or runtime owner;
(3) legacy-backend-only concern to delete after cutover.

## 0. Headline findings

1. The rs-raft partition path STILL constructs `SQLiteLogAdapter` and
   `PartitionRaftStorage` on every init
   (`src/partition/partition-service-raft-init-base.js:367-373`), so
   `_raft_log`, `_raft_state` and `_transaction_outcomes` exist on a fresh
   rs-raft partition. The port consumes only `DURABLE_STORAGE`
   (`src/raft/raft-rs-operation-port.js:89-90`); `durableLog` is read only by
   `src/raft/liferaft-provider.js:191,241`. `_raft_log` rows can only be
   produced by the liferaft backend (or worker services, section 5).
2. `_raft_state.lastAppliedIndex` is DUAL-WRITTEN on the rs-raft path: the
   apply callback (`partition-service-raft-init-base.js:452-457`) calls
   `applyPartitionApplicationAndProgress`
   (`src/raft/raft-rs-application-transaction-owner.js:17-22`) which calls
   `storage.recordAppliedAdvance()` (`src/partition/partition-raft-storage.js:190-199`,
   writes `_raft_state.lastAppliedIndex`), while the enclosing
   `applyCommittedEntryTransaction` (`raft-rs-application-transaction-owner.js:4-15`)
   writes `_raft_rs_applied_state` (`src/raft/raft-rs-durable-store.js:214-222`).
3. On every rs-raft restart after at least one apply,
   `PartitionRaftStorage.loadAppliedWatermark` (`partition-raft-storage.js:118-137`)
   sees `lastAppliedIndex = N` vs `logAdapter.getCommittedIndex() = 0` (rs-raft
   never writes `_raft_state.committedIndex`) and durably writes
   `_raft_state.appliedGapMarker`, a sticky marker that makes checkpoint
   creation refuse forever (`src/raft/snapshot-checkpoint-store.js:108-132`).
4. Snapshot creation, cadence, compaction, HLC warm-up and the leader-side
   catch-up decision are all keyed on `_raft_state.committedIndex` /
   `_raft_log` / boundary keys. On rs-raft each is inert or fail-closed:
   cadence answers BELOW_THRESHOLD (`src/partition/partition-snapshot-cadence.js:139-153`),
   creation answers APPLY_WATERMARK_DIVERGENCE (`snapshot-checkpoint-store.js:85-132`),
   HLC warm-up skips the scan (`src/partition/partition-hlc-warmup.js:38-45`),
   and the install decision is emitted only by liferaft
   (`src/raft/liferaft-incoming-data.js:473-478, 485-491, 526-534`).
5. The rs-raft side handles `Ready.snapshot` only as durable bytes:
   `persistReady` stores it in `_raft_rs_snapshot` (`raft-rs-durable-store.js:138-148, 229-242`),
   `persist_ready` feeds it to MemStorage (`vendor/raft-rs-wasm/src/lib.rs:585-618`),
   restart feeds it back through `create_node` (`src/raft/raft-rs-runtime-owner.js:216-225`).
   No code applies `snapshot.data` to the partition SQLite state machine, and
   the binding exports no compaction or snapshot-creation primitive
   (`src/raft/raft-rs-core-constants.js:35-56`). On rs-raft the log never
   compacts and no follower can be caught up by snapshot.
6. The checkpoint payload scrub drops only `_raft_log` and `_raft_state`
   (`src/raft/snapshot-checkpoint-constants.js:38-41`; `snapshot-checkpoint-store.js:216-221`).
   A checkpoint taken from an rs-raft partition would ship the sender's
   `_raft_rs_log`, `_raft_rs_hard_state` (including its vote),
   `_raft_rs_applied_state`, `_raft_rs_snapshot`, `_raft_rs_replica_lifecycle`
   and `raft_rs_peer_identity` rows to the follower: an unsafe-reuse hazard.
7. No legacy-state detector exists (grep for "legacy" hits only the
   `ws_connection_state` migration). The only behaviour about legacy rows beside
   an rs-raft record is `test/raft/raft-rs-backend/restart-from-durable-record.test.js:129-146, 271-310`,
   which pins that poisoned `_raft_state.currentTerm/votedFor` and a `_raft_log`
   row are IGNORED when a valid rs-raft record exists.

## 1. SQLite tables: CREATE statements, writers, readers

### 1.1 Legacy family

`_raft_log` - CREATE `src/raft/sqlite-log-adapter.js:101-108` (constructor `:76`);
legacy-schema tripwire `:110-117`; also created in the install staging copy
`src/raft/snapshot-install.js:163-164`. Writers, all in the adapter ("single
`_raft_log` mutation owner", `:619-621`): `persistEntry` `:201-208` (via `put`
`:293-298`, `saveCommand` `:370-389`, `append` `:736-755`, `saveCommands`
`sqlite-log-adapter-batch-api.js:12-27`); `commandAck` `:456-458`; `commit`
`:528-530` (and `commitAndApplySlice` `batch-api.js:29-61` from
`liferaft-commit-scheduler.js:99`); `removeFrom` `:313-314`; `removeEntriesAfter`
`:606`; `truncateFrom` `:774-775`; `deleteCommittedPrefixRows` `:624-627` (only
from `snapshot-compaction.js:150`). Readers outside the adapter:
`snapshot-checkpoint-store.js:60,134-151,154-156,171-188,195-214`;
`snapshot-compaction.js:47-49,84-93,99-102,119-130`; `partition-hlc-warmup.js:40`;
`test/partition/partition-service-stale-topology-write-guard.test.js:62-74`;
`test/storage-load/storage-footprint.js:13`.

`_raft_state` (`key, value`) - CREATE in BOTH `sqlite-log-adapter.js:119-124` and
`src/partition/partition-service-constants.js:62-67` (executed at
`partition-raft-storage.js:76`): two DDL owners for one table. Keys:
- `committedIndex` (alias `commitIndex`): written only by `setCommittedIndex`
  `sqlite-log-adapter.js:708-728` (from `commit()` `:536`, the callback api
  `:140-142,194-200`) and by install reconstruction `snapshot-install.js:170`.
  Readers: `getCommittedIndex` `:675-693`;
  `partition-service-durability-fitness.js:60-61,184-188` (gated by
  `getLastDeclaredCommitIndex`, inert on rs-raft).
- `currentTerm`, `votedFor`: written ONLY by `snapshot-install.js:179-183`.
  `PartitionRaftStorage.persistTerm/persistVotedFor` (`:165-178`) have no callers
  in `src/`; the callback api `setTerm/setVotedFor` (`:162-182`) have no callers
  in `src/` or in `@markwylde/liferaft`. Read at `partition-raft-storage.js:88-101`;
  `storage.currentTerm` is set in memory by `partition-service-raft-lifecycle-wiring.js:68`
  and fed to `INITIAL_TERM` at `init-base.js:438-440`.
- `lastAppliedIndex`: `partition-raft-storage.js:190-199` from liferaft `onCommit`
  (`lifecycle-wiring.js:83-91`) AND from the rs-raft apply callback; also
  `snapshot-install.js:171`.
- `appliedGapMarker`: `partition-raft-storage.js:129-136` (backend-agnostic).
- `directApplyMarker`: `partition-raft-storage.js:207-214`, from
  `partition-replication-handler.js:319-323`.
- `snapshotLastIncludedIndex/Term`, `maxCommittedHlc`, `snapshotInstallId`
  (`snapshot-install-constants.js:11-16`): written by `snapshot-install.js:172-178`
  and `snapshot-compaction.js:139-150`; read by `snapshot-boundary.js:19-43,63-67`,
  `snapshot-checkpoint-store.js:146-150,181-183`, `snapshot-install.js:129-142,219-223`.

`_transaction_outcomes` - CREATE `partition-service-constants.js:68-76` (executed
at `partition-raft-storage.js:77`); application (2PC) state kept inside
checkpoint payloads (`snapshot-checkpoint-constants.js:22-25`). Not consensus state.

### 1.2 rs-raft family

`_raft_rs_log`, `_raft_rs_hard_state`, `_raft_rs_applied_state`, `_raft_rs_snapshot`:
CREATE `raft-rs-durable-store-constants.js:27-68`, executed by the store
constructor (`raft-rs-durable-store.js:101-104`), constructed per group
(`raft-rs-runtime-owner.js:705`). Writers: `appendEntries` `:156-177`;
`putHardState` `:184-192`; `putCommitIndex` `:199-203`; `putAppliedState`
`:214-222`; `putSnapshot` `:229-242`; `persistReady` `:138-148`. Readers:
`readDurableRecord` `:249-283`, `hasDurableRecord` `:294-298`. Bootstrap write:
on a non-restore open the runtime owner writes `_raft_rs_applied_state` with
applied 0 and the core's ConfState before any Ready (`runtime-owner.js:237-247`).
`_raft_rs_replica_lifecycle`: CREATE `raft-rs-replica-lifecycle-owner.js:43-54`;
its own "durable record exists" probe (`:57-66`) differs from `hasDurableRecord`.
`raft_rs_peer_identity`: CREATE `raft-rs-peer-identity-constants.js:9-14`.

### 1.3 Checkpoints are filesystem generations

`{checkpointsRoot}/{lastIncludedIndex}/payload.db + checkpoint.json`
(`snapshot-checkpoint-constants.js:9-15`; root `snapshot-install.js:71-77`);
install marker and staging (`snapshot-install-constants.js:21-23`); transfer
staging (`snapshot-transfer-constants.js:92-94`). `payload.db` is a `db.backup()`
of the whole partition database with only `_raft_log`/`_raft_state` dropped
(`snapshot-checkpoint-store.js:269-270,216-221`).

## 2. Rows on a fresh rs-raft partition versus a legacy one

Fresh rs-raft partition: `_raft_log` exists with ZERO rows; `_raft_state` exists
with `lastAppliedIndex` after the first apply, `appliedGapMarker` after the first
restart following an apply, `directApplyMarker` if single-replica direct apply
ran; NEVER `committedIndex`, `currentTerm`, `votedFor`, `snapshot*`,
`maxCommittedHlc`, `snapshotInstallId`. `_raft_rs_applied_state` one row from
open; other `_raft_rs_*` rows as Readies arrive; one lifecycle row; one peer
identity row per replica.

Legacy partition: `_raft_log` rows for every entry; `_raft_state.committedIndex`
> 0 once anything committed, `lastAppliedIndex`, possibly the markers, and the
install/compaction keys only if an install or compaction ran. No `_raft_rs_*`
unless the port was ever opened on that file.

## 3. Definition of "meaningful legacy partition consensus state"

A replica database holds meaningful legacy consensus state iff at least one of:
(a) `_raft_log` has at least one row; (b) `_raft_state.committedIndex` (or
`commitIndex`) > 0; (c) `_raft_state.snapshotLastIncludedIndex` > 0;
(d) `_raft_state` has `currentTerm` or `votedFor`. Explicitly NOT meaningful:
table existence; `lastAppliedIndex` (dual-written); `appliedGapMarker`;
`directApplyMarker`; `_transaction_outcomes` rows.

"No valid rs-raft durable record" must be defined once: today two probes exist
(`hasDurableRecord`, `durable-store.js:294-298`, and the lifecycle owner's row
probe, `:57-66`). The refusal `legacy_partition_consensus_state_detected` =
(a|b|c|d) AND NOT hasDurableRecord; conjunctive, as
`restart-from-durable-record.test.js:271-310` requires legacy rows WITH a valid
rs-raft record to be tolerated.

## 4. Mechanism census

### 4.1 Legacy log substrate (class 3 unless noted)
- `sqlite-log-adapter.js` (+ callback-api, batch-api): DDL `:100-125`, committed-prefix
  truncation guard `:580-669`, compacted-boundary answers `:223-255,547-569,344-359`,
  watermark cache `:675-728`. 31 pinning test files (`sqlite-log-adapter-*`,
  `sqlite-schema-migration`, `raft-log-write-owner`, `committed-entry-immutability*`,
  `log-truncation-correctness.property`, `liferaft-*`, snapshot fixtures,
  `raft-rs-backend/restart-from-durable-record.test.js:27,131` as a poison seeder).
- `partition-raft-storage.js`: `_transaction_outcomes` DDL is class 1 (needs a
  state-machine owner); applied watermark/markers class 1, already re-owned by
  `_raft_rs_applied_state` (dual write today); the rest class 3.
- `partition-hlc-warmup.js`: class 1 concern with class 3 inputs; no rs-raft owner
  (rs-raft restore skips re-apply, `runtime-owner.js:209`, so HLC regression after
  restart is unguarded).

### 4.2 Liferaft inbound path / append-fail vocabulary (class 3)
- `liferaft-incoming-data.js` `:438-547` append-fail handling, decisions
  `:473-478,485-491,526-534`, committed-prefix guards `:278-322`, match-index map
  `:52-85,373-394` (consumed by learner promotion). rs-raft owners: core Progress;
  match index via `runtime-owner.js:550-572`.
- `liferaft-follower-batch.js`, `committed-prefix-divergence.js` (partition
  subscribes on all backends at `init-base.js:482-494`; rs-raft never emits),
  `snapshot-catchup-constants.js` decision vocabulary `:17-20,67-75` (class 3);
  dispatch/install outcomes `:23-44` class 1.

### 4.3 Checkpoint creation / compaction / cadence
- `snapshot-checkpoint-constants.js`: envelope class 1; `EXCLUDED_TABLES` `:38-41`
  and `APPLIED_STATE_KEY` `:49-56` class 3 (re-key to the rs-raft family, widen the
  scrub to `_raft_rs_*`, lifecycle, peer identity).
- `snapshot-checkpoint-format.js`: class 1; descriptor carries NO ConfState
  (`:50-67`), which `putSnapshot` requires (`durable-store.js:236`).
- `snapshot-checkpoint-store.js` creation `:256-344`: concern class 1, every fact
  source class 3; dead (fail-closed) on rs-raft. `readCheckpoint` `:384-414` class 1.
- `snapshot-compaction.js`, `compaction-policy.js`: class 3; no rs-raft compaction
  primitive; `_raft_rs_log` grows unbounded; raft-rs never emits MsgSnapshot.
- `partition-snapshot-cadence.js`: policy class 1, inputs class 3; BELOW_THRESHOLD
  forever on rs-raft (`:152`).
- `snapshot-retention.js`: class 1, keep.

### 4.4 Transfer / offer routing (class 1, keep)
`snapshot-transfer*.js`, `snapshot-transfer-receiver.js`, `snapshot-offer-router.js`;
production arming `src/bootstrap/shared/snapshot-catchup-wiring.js:186-215`
(backend-agnostic).

### 4.5 Catch-up orchestration
`snapshot-catchup.js`: identity builder `:111-173` class 1 (also used by learner
promotion proof and bootstrap wiring); leader dispatch `:243-317` class 1 shape
with a class 3 trigger (`install_snapshot` decisions only, `:245-250`); follower
orchestration `:358-410` class 1.

### 4.6 Install
`snapshot-install-constants.js` boundary keys class 3, marker/state machine class 1.
`snapshot-install.js`: `requestSnapshotInstall` `:246-309` class 1;
`reconstructStagedRaftState` `:162-187` class 3 (writes liferaft rows only);
`resolveDurableElectionRule` `:200-208` class 1 Raft rule to re-own onto
`_raft_rs_hard_state`; `resolvePendingSnapshotInstall` `:352-384` class 1, called
on all backends at `init-base.js:341-353`. rs-raft owner for reconstruction:
write `_raft_rs_snapshot` + `_raft_rs_hard_state` + `_raft_rs_applied_state`,
truncate `_raft_rs_log` <= index, let `create_node` bootstrap apply it.
`snapshot-boundary.js`: class 3 (rs-raft boundary is `_raft_rs_snapshot.snapshot_index`);
its HLC witness is class 1 needing a new home.

### 4.7 rs-raft side (class 2)
`raft-rs-durable-store*.js`: owner of entries, hard state, applied+ConfState,
snapshot bytes; `data` stored base64 with no bound and never applied.
`raft-rs-runtime-owner.js`: Ready handling `:477-486,394-460`, restore
`:204-226`, `replaceRuntime` `:255-269`; no snapshot application, no creation,
no compaction; `status.progress[].matched` at `:550-572`.

## 5. Other `_raft_log` writers
`src/worker/partition-worker-service.js:242` and
`src/worker/message-group-worker-service.js:296` construct `SQLiteLogAdapter`
directly (the latter over `:memory:`).

## 6. Test pins
By legacy table name (15 files): `partition/partition-raft-storage.test.js`,
`partition/partition-service-stale-topology-write-guard.test.js:62-74`,
`raft/liferaft-committed-prefix-conflict-livelock`, `raft/raft-log-write-owner`,
`raft/raft-rs-backend/restart-from-durable-record.test.js:129-146,290-300`,
`raft/snapshot-boundary-observability`, `snapshot-catchup-end-to-end`,
`snapshot-checkpoint-sqlite-payload` (scrub), `snapshot-compaction-catchup-integration`,
`snapshot-install-restart-states`, `snapshot-install-transition`,
`snapshot-proof-gated-compaction`, `snapshot-recorded-gaps`,
`sqlite-schema-migration`, `storage-load/storage-footprint.js:13`.
By `_raft_rs_*` name (7): the raft-rs-backend suite. Snapshot suite importing
the legacy substrate as fixtures: 15 files (listed in the agent report).

## 7. Mechanism -> class -> rs-raft owner or gap

| Mechanism | Class | rs-raft owner today / gap |
|---|---|---|
| sqlite-log-adapter (+apis) | 3 | RaftRsDurableStore + core MemStorage; still constructed on rs-raft init |
| partition-raft-storage log facade, term/vote | 3 | `_raft_rs_hard_state`; `storage.currentTerm` still feeds INITIAL_TERM |
| partition-raft-storage applied watermark/markers | 1 | `_raft_rs_applied_state`; dual write + gap-marker poison on restart |
| partition-raft-storage `_transaction_outcomes` DDL | 1 | none: needs a state-machine DDL owner |
| partition-hlc-warmup | 1 (inputs 3) | none; HLC regression after restart unguarded |
| liferaft-incoming-data append-fail/catch-up | 3 | core Progress; no "follower needs snapshot" signal |
| liferaft-follower-batch, committed-prefix-divergence | 3 | core |
| snapshot-catchup decision vocabulary | 3 | none |
| snapshot-catchup dispatch + orchestration | 1 (trigger 3) | reusable shape; trigger must be rs-raft-derived |
| snapshot-checkpoint envelope/format | 1 | keep; scrub set and applied key re-keyed; descriptor lacks ConfState |
| snapshot-checkpoint-store creation | 1 (facts 3) | facts from `_raft_rs_*`; dead on rs-raft today |
| snapshot-compaction, compaction-policy | 3 | none; no compaction primitive in the binding |
| partition-snapshot-cadence | 1 (inputs 3) | none; BELOW_THRESHOLD forever |
| snapshot-retention, transfer, offer router | 1 | keep |
| snapshot-install marker/staging/election rule | 1 | keep; reconstruction rewritten to `_raft_rs_*` |
| snapshot-boundary | 3 (HLC witness 1) | `_raft_rs_snapshot.snapshot_index`; HLC witness needs a home |
| raft-rs durable store, runtime owner | 2 | owners; unbounded snapshot data, no application/creation/compaction |

## 8. Owner questions (each with evidence)
1. Who owns snapshot CREATION on rs-raft (cadence/creation read `_raft_state.committedIndex`, never written by rs-raft; gap marker on restarts)?
2. Who owns snapshot INSTALL on rs-raft (`reconstructStagedRaftState` writes liferaft rows; scrub drops only two legacy tables)?
3. Who DECIDES a follower needs a snapshot on rs-raft (no decision site; binding exposes no compaction/snapshot primitive; alternative: drive from `status.progress[].matched`)?
4. Who owns applied progress (dual write violates the epic's "never dual writes", line 112)?
5. Who owns the HLC restart witness (nobody)?
6. Who owns `_transaction_outcomes` DDL after PartitionRaftStorage is deleted?
7. Which probe defines "valid rs-raft durable record" (two today)?
8. Where does the legacy detector live (nothing today; conjunctive definition in section 3)?
9. What happens to the two observability tests that count `_raft_log` rows?
10. Are rs-raft `Ready.snapshot` bytes bounded and applied (no; unreachable in production today)?
