# Snapshot/local-restart transition ownership (review 4217048521)

Source target: 82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af, unchanged in this
continuation. This is a source-bound classification of existing and missing
interactions, not successful intact-member catch-up evidence. The receipt
remains false pending review. No source changes or new runtime root.

## Concrete transition census

| Trigger | Authority and named existing method | Permitted action / actual durable point | Restart, lost answer, remaining owner |
| --- | --- | --- | --- |
| Partition boot, before opening SQLite | `partition-service-raft-init-base.js:init` closed-handle block calls `snapshot-install.js:resolvePendingSnapshotInstall` | Read the existing install marker. STAGING discards only matching staging; STAGED/INSTALLED resolve only matching install identity/generation. This is the existing whole-file/fresh-create install protocol, NOT intact application catch-up | Marker/installed-image binding decides replay; mismatches return INSTALL_STATE_CONFLICT, not a new replica. `recoverPendingSnapshotInstall` additionally executes under `ReplicaCreateAdmissionOwner.commitSnapshotInstall` for fresh-create remnants |
| Open an intact operation port | `raft-rs-operation-port.js:createRaftRsOperationPort` constructs peer registry and `RaftRsReplicaLifecycleOwner`, then `raft-rs-runtime-owner.js:readOpeningRecord`, `openingParticipationRefusal`, `createNodeArguments`, `openGroupInCurrentRuntime` | The exact local lifecycle row/identity reservation and `RaftRsDurableStore.readDurableRecord` supply the restore record. Native `create_node` reconstructs from local log/snapshot/HardState/applied/configuration. Opening is not a new write that certifies remote freshness | `ensureExecution` / `reconstructGroup` reread local durable state. No already-live leader requirement is added. Current source has no separately complete canonical validator for every cross-table contradiction requested by the draft; that validation is missing work at this opening boundary, not permission to default malformed fields |
| Current database readable, prior existence proved, durable history missing | `raft-rs-runtime-owner.js:openingParticipationRefusal` consumes `openingWithoutRecordRefusal` and calls the private operation port `holdForReseed` closure | `RaftRsReplicaLifecycleOwner.holdForReseed` -> `#writeRetired` -> `commitDurably` writes the exact `_raft_rs_replica_lifecycle` row `state=retired`, `reason=reseed-required`, timestamp and null retirement evidence in one synced transaction | Restart reads the same row and refuses core entry. The existing replacement/retirement owners must create a fresh identity when permitted. No same-voter empty-history repair. If the prerequisite record cannot be read, this absence transition is not entered |
| Durable record read fails | `RaftRsDurableStore.readDurableRecord` / `readRecordTable` throw a named table/SQLite error; `readOpeningRecord` -> `groupHostFailure` -> `groupFailed` | No fabricated absent record and no reseed write. The exact group is held RECOVERY_REQUIRED with failure phase/reason and retry deadline | `recoveryOutcome`/`retryAfterMsOf` explain the hold; the existing runtime's `ensureExecution` and `reconstructGroup` retry the local read. This recovery state is volatile, recreated by the same failed durable read after restart; it is not another durable ledger |
| Checkpoint creation requested | `snapshot-checkpoint-store.js:createSqliteStateMachineCheckpoint` -> backup -> `prepareRaftRsCheckpointCopy` / `prepareSqliteCheckpointCopy` -> descriptor validation | The copy is scrubbed/validated, payload fsynced and renamed to the generation directory, directory fsynced, then descriptor written by `writeAtomicDurable`. The descriptor published LAST is the generation's durable publication token | `readCheckpoint` validates descriptor/payload; `snapshot-retention.js` sweep retains generation pins. A half-created copy is not a published checkpoint. Current raft-rs replica-image descriptor is useful fresh-learner input, not by itself an intact-member application-image/Ready binding |
| Receive bulk bytes | `snapshot-transfer-receiver.js:createSnapshotTransferReceiver` owns accept/chunk/completion; transfer driver feeds it | Resumable progress is recorded only after corresponding payload fsync. Completed payload is renamed and directory fsynced before descriptor-last publication | The receiver's `resolveResumeBoundary` reads its durable progress marker and validates the prefix. Transfer completion only makes bytes available; it is not consensus INSTALL_ADMISSION. Transfer owner retains/resumes/releases its own staging and pins |
| Fresh committed learner with actual physical CREATE claim requests install | `snapshot-install.js:requestSnapshotInstall` -> `admitsRaftRsInstall`, `buildFreshCreateMarker`, `reconstructStagedRaftRsState`, `commitPreparedInstall`; last calls `ReplicaCreateAdmissionOwner.commitSnapshotInstall` | Exact existing CREATE/worker claim gates the swap. `swapPreparedInstall` records STAGED, `swapStagingIntoReplica` renames at closed-handle boundary and fsyncs parent, then records INSTALLED. Exact staged/main binding plus marker controls replay | `resolvePendingSnapshotInstall` / `recoverPendingSnapshotInstall` distinguish old/new file by exact binding, not by caller flags. Wrong or unavailable CREATE generation refuses. The physical claim/lifecycle owner remains responsible for this fresh learner; this permission is not reusable for an intact replica |
| Current registered bulk offer to an intact partition | `bootstrap/shared/snapshot-catchup-wiring.js:armSnapshotOfferRouting` -> `snapshot-catchup.js:orchestrateSnapshotCatchupInstall` | Current code receives bytes, shuts service down, then calls `requestSnapshotInstall` without an intact receiver-native Ready binding; fresh-image validation correctly refuses missing CREATE authority. **No valid intact-application commit point exists in this chain yet** | Current rejection returns INSTALL_REJECTED without reconstructing the just-shutdown service on that branch. This is classified missing/incorrect orchestration at this exact edge, not authorization to forge CREATE or weaken the installer. Pre-acceptance intact refusal must preserve the old service in the eventual repair |
| Native core emits storage-bearing Ready | `raft-rs-runtime-owner.js:drainReady` -> native `take_ready` -> `RaftRsDurableStore.persistReady` | Existing store transaction writes `_raft_rs_snapshot`, `_raft_rs_log`, `_raft_rs_hard_state`; durability follows native `mustSync`. `finishReady` then calls native `persist_ready`, sends messages and continues application | Failure goes through the existing runtime group recovery before further unsafe progress. The current Ready transaction does NOT import a file-backed application image or atomically update that image's applied boundary. Therefore it is not the missing intact install completion |
| Ordinary committed entry application | `raft-rs-runtime-owner.js:applyEntryDurablyOrFailure` -> `raft-rs-application-transaction-owner.js:applyCommittedEntryTransaction` | One `RaftRsDurableStore.transaction` calls captured synchronous application callback and membership-context registry applier, then `putAppliedState` (and admission index when relevant). `_raft_rs_applied_state` carries applied index, ConfState and membership generation in one row. Commit precedes afterCommit effects | A thrown/async callback rolls back; `applyTransactionRolledBack` repairs owned local state and `groupHostFailure` holds the runtime. Replay starts from durable applied state. This is the concrete EXISTING application transaction owner to extend for accepted snapshots; it does not currently apply whole application images |

The exact prior-existence fact comes through the existing bootstrap membership
contract (`raft-rs-bootstrap-membership.js:bootstrapOfRequest`) and identity
owner, not from a cache miss. Local `_raft_rs_replica_lifecycle.incarnation`,
peer reservations, node boot incarnation, publication epoch and membership
configuration generation remain separate dimensions.

## Specified repair boundary for intact accepted application images

This section identifies missing writes/operations; it does not pretend they
exist. The preserved snapshot-catchup Quest draft 9554f689 is the design input.
No branch here introduces an external snapshot database or second runtime.

1. **Capture/publication:** extend the existing checkpoint owner to publish a
   typed application image at exact historical boundary B, bound to its
   term/ConfState/membership generation/peer map and digest. Retain committed
   suffix after B. Source-local HardState/vote, lifecycle incarnation and
   runtime tables are excluded. Never require B to chase current applied
   equality under continuous writes. Prepared/staging transactions are drained
   or refused by their current transaction owner, not arbitrarily rolled back.
2. **Native publication:** the existing native storage wrapper/runtime owner
   exposes only the sealed image's native snapshot after its publication
   binding and permitted compaction boundary are durably recorded. It must
   not use receiver `MemStorage.apply_snapshot` to publish on a live sender.
   Current callback `snapshotCatchupNeeded` in the operation request has no
   inspected runtime consumer; wire the existing snapshot/runtime edge rather
   than claim a manually invoked dispatcher proves scheduling.
3. **Staging/admission:** `createSnapshotTransferReceiver` stages immutable
   bytes. `drainReady` retains sole authority to identify the exact snapshot
   accepted by THIS receiver's actual live core. Bind native metadata/data,
   index/term, ConfState/generation, group, target identity, executing lifecycle
   incarnation and payload digest before importing application state. A
   receiver without the matching bytes waits with its existing group-owned
   progression/deadline; transfer completion wakes that same owner. Neither
   a mock Ready, descriptor nor sender assertion is admission.
4. **Atomic application/Ready:** extend the existing module
   `raft-rs-application-transaction-owner.js` with a named accepted-snapshot
   transaction operation (not currently implemented). It invokes the existing
   `RaftRsDurableStore.transaction` once with synced durability, synchronously
   restores only the authorized application schema/data, writes the accepted
   Ready snapshot/log/HardState through the store's existing inner write
   operations, and writes exact applied/configuration/generation state.
   Preserve receiver election and lifecycle/identity facts. The exact
   accepted snapshot/image binding belongs in `_raft_rs_snapshot.data` plus
   its index/term/configuration columns, not a second install-progress store.
   Its commit, not staging or native acceptance alone, is completion. Do NOT
   nest `persistReady`'s separately synced `commitDurably` inside that outer
   transaction: the current store explicitly refuses that nesting. Split its
   owned inner writes from its standalone transaction entry as necessary.
5. **After commit:** only then may `finishReady` acknowledge, expose application
   state, advance native progress or replay suffix entries. The partition's
   captured application callback/session/cache owners rebuild their local
   projections; a successor service generation fences an old continuation.
   No source-election-state import and no fresh-CREATE permission substitution.
6. **Lost result/restart:** the same local store read must expose either the
   old complete state or the new complete state and its exact image binding.
   If B is installed and later entries replayed, completion is verified by the
   retained binding and monotonic applied state, not forced equality to B.
   Unknown read retains the group-owned hold; pre-commit rollback leaves the
   old application intact. Post-native-acceptance application failure must
   hold/reconstruct the runtime without acknowledging a half-applied Ready.

The boundaries above specify existing owners, data carriers and the missing
operations. They are implementation obligations with explicit first failure
points, not an assertion that the current callback/install path works. Source
repairs must have real accepted-Ready/application-image positives, refusal
controls, durable-crash tests and final multi-host catch-up; the earlier 72
component assertions remain only component/refusal evidence.
