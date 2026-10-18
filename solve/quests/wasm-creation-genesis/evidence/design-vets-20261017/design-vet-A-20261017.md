# Design vet A: serving grant, receiver-local publication, RETIRED-before-CLOSED

Subject: `solve/quests/wasm-creation-genesis/SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md`
at `6cc314f53` (worktree `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`,
branch `work/rs-raft-event-reconciliation-20261016`). `src/` and `test/` are byte-identical to the
design's cited base `c6b1aa259` (`git diff --stat c6b1aa259..HEAD` = the design note only), so every
`file:line` in the design was checked against this tree. Read-only vet; no file in the worktree touched.

Templates applied: design-note-template (sections 1-4), owner-interaction, admission-gating,
recovery-replay, concurrency-serialization. Transport-delivery, harness-fidelity, formation-circularity
and timing belong to the other vet; incidental findings there are marked [other-vet].

## Verdict: REVISE (six blocking refutations, B1-B6; required changes R1-R14)

The metadata permission owner the design consumes is sound and idempotent as cited
(`service-instance-state.js:251-269`, `:265-268` same-phase answer without mutation;
`service-instance-metadata.js:45-72` one UPDATE + one reread). `commitDurably` is usable from the
designed call sites (better-sqlite3 is synchronous; no apply callback reaches `startReplica` or the
retire path, so the `inTransaction` refusal at `raft-rs-durable-store.js:190-194` is unreachable).
Role events fire only on a `raftState` transition (`raft-rs-runtime-owner.js:1274-1276`), so the
leader-effect replay in `enableServing` cannot be doubled by a same-tenure LEADER event. Those are the
load-bearing things the design gets right. Everything below is what it gets wrong or leaves open.

---

## Section 1. Consumed surfaces

Verified present at the cited lines: `grantInstanceResource`/`closeInstanceResource`
(`service-definitions-owner.js:104-110` -> `service-instance-metadata.js:163-177` -> `:131-142` ->
`:45-72`); `changeResourceState :251-269`, `resolveResourceState :240-250`, `selectionAdmission
:153-166`; `_wasm_creation_local` SQL `:16-27`, `openWasmCreationRecords :83-107` with byte equality at
`:106`, `resolveWasmCreationAdmission :41-58` (ADMITTED-only at `:49`); `commitDurably :189-203`;
the seven `consensusCreation` guards in `wasm-service-replica.js` (`:286, :463, :490, :512, :545,
:584, :594`); `startReplica` bound branch `:352-364`; `stopReplica :504-517`, `stopOwnedReplica
:524-537`, `shutdownAll :632-647`; `openReplica :78-128`, `retireReplica :165-211`,
`shutdownWasmServiceReplica :222-248`; `closeWasmServiceConsensus :229-267`;
`confirmConsensusBootstrapResult :42-49`, `bootstrapConsensusCreation :50-71`;
`startConsensusBootstrap :17-25`; runtime start/stop bound branches `:311-313`, `:485-487`; driver
`#projectConsensusStartResult :543-581` (design says 543-575), `stop :593-632`; shutdown methods
`:27-45`; `transitionOperation :127-175`; `TERMINAL`/`LIVE_PHASES :35-36`; `recoverOperationRow
:96-99`; `PortAllocator.allocate :50-54` idempotent; `validateEndpointIntent` ignores extra fields
(`service-runtime-lifecycle.js:134-155`). `resolveRetainedAdmission :148-162` accepts PUBLISHED.

### S1-1 (NEW MECHANISM, owner-interaction #2/#7) Production endpoint and services-row writers are not cited and contradict D3/D7
- Evidence: `src/runtime/runtime-endpoint-publication-wiring.js:105-134` (`writeRuntimeEndpointAtIncarnation(replicaId, _kind, endpointIntent)` -> `resolveLogicalServiceId(cache, replicaId)` `:57-80` requires `replicaId` to be `entity` or `entity-rN` via `runtimeServiceReplicaBelongsToEntity`; `buildRuntimeEndpointRow` `runtime-endpoint-writer.js:41-70` keys `endpoint_id = ${serviceId}:${nodeId}` and copies ONLY host/port/protocol); `src/query/runtime-replica-state-projection.js:221-250` (services row PK = `serviceId`, CAS `expectedIdentity = {service_type, node_id}`); `buildReplicaStateProjectionRequest` `service-runtime-state-projection-handoff.js:6-29` reads only `context.causeId`.
- Scenario: three founding replicas, `descriptor.serviceId = S` for all (fixture `service-consensus-creation-fixture.js:18-22`, `captureConsensusBootstrap` `service-consensus-bootstrap.js:22-25`). D7 calls `_projectReplicaState(S, ..., ACTIVE)` on each host -> one `services[S]` row; hosts 2 and 3 CAS with a different `node_id` -> zero rows -> ACTIVE "fails closed" -> `bootstrapConsensusCreation` returns UNKNOWN while the replica is already serving. Meanwhile `enableServing` -> `queueRoleUpdate` CASes `services[replica.replicaId]` (the physical `wasm-instance-<digest>-rN` id, `wasm-service-metadata-mutation-helpers.js:28-50`), a row nobody inserts -> `OBSERVED_STATE_CHANGED` retry forever (`authoritative-row-mutation-helper.js:380-397, 587-624`). D3's "No second publication path: the same helpers and the same `services` row identity" is false: two keys. The endpoint path with `serviceId = S` collides for I and J on the same node (`endpoint_id = S:node`); with the physical id it throws `LOGICAL_SERVICE_NOT_FOUND`. Binding/token on the intent and on the projection context are dropped by both writers.
- Contract: CONTRACT-R2 "Services/endpoints carry B and attempt identity. Physical replica IDs/routes are instance-qualified ... so late I publication cannot overwrite J's row"; HANDOFF "Endpoint/state writers receive binding/token as part of the exact effect".
- Change: name the row identity for the bound route (physical `creation.identity.replicaId` as PK; logical S resolved from the binding, not from `entity-rN` parsing), extend the endpoint row metadata / services projection to carry `bindingDigest` + token, and cite these writers as surfaces to change. The proof must run the real writers (`projectRuntimeReplicaServicesRow`, `wireRuntimeEndpointPublication`) at least once, not only recording sinks (see S6-4).

### S1-2 (NEW SHAPE) Existing frozen witness not reconciled
- Evidence: `test/wasm-service/wasm-creation-bound-native-fixture.js:305-347` already calls `host.lifecycle.publishReplica(serviceId, host.token)` expecting `{started: true}` and `retire(f)` expects `lifecycle.stopReplica` to yield metadata `CLOSED`; consumer `test/wasm-service/wasm-creation-bound-native.test.js` (C1 + two completion controls, HANDOVER.md:127-135 "REVISE, NOT RUN"), classified in `test/shards/subsystem-classes.json:2403`. Not in the lab's 21-file selection (LAB-RESULTS.json lists 7 wasm-service files, none of them this one).
- Conflict: D4 keeps `stopReplica` orderly (no CLOSED) and adds `retireReplica`; the retained fixture's `retire()` contract is the opposite. TEST-PLAN C1 ("select I, close I, select J; old INIT/ENROLL/WRITE first ... refuses") is CONTRACT-R2-required and is not in the design's P1-P8.
- Change: cite the frozen files, state the supersession of `retire()` semantics (R09/R21: append, do not silently rewrite), and either adopt C1 into the proof plan or name the frozen file as a neighbour that must go green at the new tip.

### S1-3 (NEW SHAPE, R06) Surfaces to create that are missing from "Surfaces this design must create"
- `CONSENSUS_BOOTSTRAP.PUBLISHED` (vocabulary at `service-consensus-bootstrap.js:12-16` has HELD only).
- Owner modules for `LOCAL_GRANT_NOT_RECORDED`, `CREATION_RETIRED`, `CLOSE_UNRESOLVED`, `CREATION_WAKE_UNDELIVERED` (WASM_SERVICE_LIFECYCLE_REFUSAL `wasm-service-constants.js:106-113`? SERVICE_INSTANCE_OUTCOME? neither named).
- A manager STOP branch: `runReplicaOperation` `service-lifecycle-operations.js:332-410` completes (`:389-397`) or FAILs (`:398-408`) the STOP row unconditionally; "stays IN_PROGRESS with the typed outcome" (D7) does not exist and is not listed.
- A retire-by-token path for a deregistered replica (see B3).
- Driver `stop` bookkeeping retention on `closed:false` (see B3).
- The wake consumer the contract names: CONTRACT-R2 "enqueue the existing runtime-service reconcile owner for the selected binding" = `RuntimeServiceRebalancerOwner` (`src/bootstrap/shared/runtime-service-rebalancer-setup.js`, `_wakeRebalancer :383-387` -> `enqueueRebalanceCheck(RECONCILE_REASON.RUNTIME_SERVICE_DESIRED_STATE)`). The design names `ServiceLifecycleManager.bootstrapConsensusCreation` instead (see D6).

### S1-4 Second production paths found by grep (answer to the explicit question)
- `grantInstanceResource`/`closeInstanceResource`: no production caller today (`service-instance-metadata.js:174-177` only). `resolveInstanceResource`: `wasm-creation-opening.js:46`, `service-consensus-creation-intent.js:151`.
- `heldCreationRefusal`: only `wasm-service-replica.js:358, 382, 422`. BUT `administerWriter` (`wasm-service-lifecycle.js:263-271`) and `TimerManager` (`timer-manager.js:87, 107, 168`) reach `proposeEntry` without it; they are gated only by the `proposeEntry` admission choice at `:463-464`. The design's D3 covers `proposeEntry`, so these are covered, but the table in section 3 must list "admin ENROLL/RECYCLE while held -> refused via bootstrap admission; after PUBLISHED -> admitted".
- `startReplica`/`stopReplica`/`shutdownAll`: `wasm-component-driver.js:528, 616`, `wasm-component-driver-shutdown-methods.js:35`, `meta-service-lifecycle.js:77` (unbound), `runtime-service-handler.js:399, 655` (manager-level), `service-reconciler.js:583-601` (manager-level, unbound). `service-lifecycle-recovery.js:190, 208, 227, 242` (adapter-level on restart) is a second production path into the bound stop (see B3).

---

## Section 2. Mechanism and decisions

### D1 One grant path

B-none here, but:

#### D1-1 (NEW SHAPE, concurrency #2 TOCTOU) Recheck only at (a); awaits at (c) and the metadata resolve are unguarded
- Evidence: design D1 order (a)-(f); `startReplica :355-359` rechecks after `request()` only. `closeWasmServiceConsensus :252-257` nulls `replica.db`; `shutdownWasmServiceReplica :234-235` sets STOPPING synchronously.
- Scenario: `grantInstanceResource` resolves PUBLISHED; during the await a `stopReplica`/`shutdownAll` runs: STOPPING, `stopActivity()` (timers, broadcasts, writer abort), handler retired, db closed. (d) `commitDurably(replica.db=null)` throws TypeError (not the designed `LOCAL_GRANT_NOT_RECORDED`), or if the db is still open, (d) writes PUBLISHED and (e) `enableServing` on a STOPPING replica runs `onBecameLeader` -> `_startSafetyBroadcasts` (`:703-722`) after `_stopSafetyBroadcasts` already ran -> leaked `setInterval`; `queueRoleUpdate` after `roleMutationHelper.shutdown()` is a no-op (`:143-145`) so no harm there.
- Change: recheck `lifecycleState === READY && activeReplicas.get(id) === replica && raft === port && consensusCreation === creation` after EVERY await (after grant, after resolve) and immediately before `enableServing`; a failed recheck returns `STOPPED_DURING_START` and leaves local ADMITTED (metadata PUBLISHED stays counted; reopen re-grants idempotently; state this edge).

#### D1-2 (NEW SHAPE, concurrency #1/#3) Two concurrent START re-entries both run `publishReplica`
- Evidence: `OwnerKeyReconcileQueue.enqueue :225-236` merges a second enqueue into the pending item; `enqueueAndWait :305-309` resolves both waiters with the same result (witness: `wasm-creation-genesis.integration.test.js:161-183` "concurrent genesis reentries join one native proposal"). `publishReplica` runs after `request()` returns, outside the key.
- Scenario: explicit START and wake-driven START both receive GENESIS_OBSERVED and interleave (c)/(d)/(e). Metadata CAS is idempotent; local CAS answers ALREADY; but `enableServing`'s "exactly once" leader effects need an explicit latch, and a race where A gets PUBLISHED and B gets STALE_BINDING (J selected between) returns two different typed results for one replica to two callers.
- Change: run `publishReplica` inside the per-replica `OwnerKeyReconcileQueue` key (same continuation that produced OBSERVED), or a per-replica single-flight promise; state that the second caller receives the first's result.

#### D1-3 (NEW SHAPE) `publishReplica` visibility
- HANDOFF names `WasmServiceLifecycle.publishReplica(serviceId, exactToken)` as the public continuation and the frozen fixture calls it directly (`wasm-creation-bound-native-fixture.js:315`); the design says it "runs only inside `startReplica`'s bound branch". Decide: public method (then it must carry the same (a) prechecks and the single-flight) or private (then supersede the frozen fixture).

### D2 Local record phase machine

#### D2-1 (NEW SHAPE) Identity projection vs byte equality
- Evidence: `openWasmCreationRecords :88-93, :106`. Fields pinned today by byte equality: `{format, groupId, replicaId, nodeId, token, phase, opening, storage}` where `storage = {path, device, inode}` (`data-directory-manager.js:178-182`) and `opening = creationOpening.record` (claimId-bearing, `service-consensus-creation-intent.js:231-249`).
- Weakening risk: a projection comparison that omits `storage` or `opening` would admit the copied-file case (`wasm-retained-bootstrap.integration.test.js:222-238`) and a file re-claimed under a different first-opening claim; a comparison that does not `exactFields` the stored record admits unknown extra keys and non-canonical encodings.
- Change: state the identity set explicitly as all seven non-phase fields, validate with `exactFields` + canonical re-encode equality of the identity projection, and keep the `storage` inode compare. Note `storage.path` is a realpath: a moved data directory legitimately fails (existing behaviour; record it).

#### D2-2 (correct) RETIRED bypass by deleting/copying the file
- Delete -> `openWasmServiceDatabase :180-186` `fileMustExist`/`STORAGE_MISSING` (witness `:118-130`); copy -> inode mismatch (witness `:222-238`). The design relies on these correctly. Missing: a FRESH opening at the same path after metadata CLOSED and a new ordinal g+1 on the same slot reaches `openWasmCreationRecords :95-96` `tables.length === 0` -> CONTENT_CONFLICT because the RETIRED file still occupies `{groupId, replicaId}` (same binding incarnation and slot index => same physical id and path, `runtime-service-replica-identity.js:78-88`, `getWasmServiceDbPath :192-202`). Slot reuse for the same instance is therefore permanently blocked and the tombstone's cleanup has no owner (CONTRACT-R2 "exact cleanup remains owed"). Record as R17 finding with an owner; do not absorb.

#### D2-3 (NEW SHAPE, R11) `commitDurably` and the `replica.db` open precondition
- `commitDurably` refuses inside a transaction (`:190-194`); not reachable from `startReplica`/retire (sync apply, no re-entrancy), so fine. But D4(c) "when the replica is bound and `replica.db` is open" is a silent skip: if the db is not open (CLEANUP_REQUIRED from a prior failed open at `openReplica :107-125`, or a never-opened RETAINED file), the tombstone is skipped and (d) still runs the CLOSED CAS -> CLOSED without local RETIRED, which the next stage's "intact restart without metadata quorum" (CONTRACT-R2 B1/B4) relies on. Change: db-not-open is a typed refusal (`LOCAL_TOMBSTONE_UNAVAILABLE`) that keeps custody and does NOT attempt CLOSED; or open the file read-write for the tombstone when it exists.

#### D2-4 (edge) PUBLISHED local write throws after the metadata CAS applied
- Design row exists (`LOCAL_GRANT_NOT_RECORDED`). Add: the replica must NOT be left READY-and-unserving silently; the START returns the refusal, metadata PUBLISHED remains counted, and the next re-entry's `publishReplica` re-reads metadata (idempotent PUBLISHED) and retries the local write. Also note `commitDurably`'s `finally` restores `synchronous` even on throw (`:198-202`): correct.

### D3 Single serving state

#### B2 (BLOCKING, admission-gating #1/#5, NEW MECHANISM) User admission is not closed synchronously at the fence
- Evidence: `handleMessage :350-371`, `_handleRead :381-410`, `_handleWrite :421-452` consult only `heldCreationRefusal()`; no `lifecycleState` check. `shutdownWasmServiceReplica :234-235` sets STOPPING and calls `creationReconciliation.closeAdmission()` which closes ONLY the reconciliation queue (`wasm-creation-reconciliation.js:66-68`), not user admission. The transport handler stays registered until `retireReplicaTransportHandler` at `:185`, after the awaits at `:170` and `:173`. Strong writes are refused only because `WasmWriterCompletion.submit :27` checks `initialized`; reads (`kvStore.get`) and ASYNC-mode writes (`_handleWrite :435-442` -> `proposeEntry` -> `raft.propose`, no writerCompletion) are NOT.
- Scenario: `servingState = SERVING` (set from the durable record; design section 4 says it changes "retirement after RETIRED", i.e. after awaits). Stop begins; a read or an ASYNC KV_SET arrives before handler retirement -> `serving` true -> read served / proposal committed to the group after the fence and before the tombstone. The design's section 0 claim "closes new user admission synchronously" and D4 "admission closes synchronously at `:235`" are false as designed; `:235` is the wrong gate.
- Change: `replica.serving` must be `servingState in {OPEN, SERVING} && lifecycleState === READY` (or `servingState` must transition to a named RETIRING at the synchronous fence inside `shutdown()`'s `stopActivity`), so reads, ASYNC proposals and timer proposals are refused from the fence. For unbound replicas this is a behaviour change only if `serving` includes the READY check for them too; say so explicitly (the design promises "unbound replicas keep today's behaviour exactly").

#### D3-1 Consumers enumerated (answer)
- The seven guards (`:286, :463, :490, :512, :545, :584, :594`): `serving` covers each; unbound = OPEN = today's values. `resolveWasmServicePeerAddress :121-126` and `wasmServiceConsensusRequest :150` branch on `consensusCreation` for identity, not serving: unaffected, correct to leave.
- `wireReplicaLifecycleEvents` sets `role/isLeader/leaderId` regardless of the guards (`replica-leadership-state.js:62-80, 94-103`), so `enableServing` can read a current `role`/`isLeader`: correct.
- `onBecameLeader` twice: a LEADER event is emitted only on `raftState` change (`raft-rs-runtime-owner.js:1274-1276`), so after `enableServing` replays the effects there is no same-tenure LEADER event; a later LEADER follows a FOLLOWER/CANDIDATE (`stopAll`), so `reconstructTimers` is not doubled. `_scheduleTimer :195-199` overwrites the handle without clearing (would leak on a true double); add an idempotence latch to `enableServing` for the re-entry case anyway (D1-2).
- `enableServing` on a follower that later leads: LEADER -> `applyReplicaLeadership` queues role+leader (now flushed) -> `onBecameLeader` normal: correct.
- `WasmWriterCompletion.submit` does not need the serving gate: `proposeEntry` is the choke point (`:462-467`); after PUBLISHED, INIT is still admitted by `admitWasmServiceCommand` but `proposeEntry :468-472` refuses a recorded/conflicting INIT via `classify` (RECORDED/CONFLICT != NEW). State this in section 3.
- Role publication before the services row exists: `queueRoleUpdate` from `enableServing` runs BEFORE the runtime projects the row (D7 order); with no `readAuthoritativeRow` the wasm helpers use legacy cache dedup (`authoritative-row-mutation-helper.js:199-209, 535-551`) and retry on zero rows. Converges only if the row key matches (it does not, S1-1).

### D4 Retirement vs orderly stop

#### B1 (BLOCKING, R07/R11, NEW MECHANISM) The RETIRED write is placed in the shared shutdown path with no discriminator
- Evidence: D4(c) puts the tombstone write "inside `retireReplica` (the module function), after the handler retirement and before `releaseWasmServiceReplicaConsensus`" = `wasm-service-replica-lifecycle.js:165-211`. That function runs for EVERY shutdown: `shutdownAll :632-637` -> `stopReplica` -> `stopOwnedReplica :530` -> `replica.shutdown()` -> `shutdownWasmServiceReplica :246` -> `retireReplica`. `replica.shutdown()` (`wasm-service-replica.js:744-752`) carries no intent.
- Contradiction: section 0 "Orderly node shutdown never retires a resource", D4 "`stopReplica` and `shutdownAll` are unchanged: an orderly stop leaves the local phase as it was", P6. As written, either node shutdown tombstones every bound replica (P6 red, intact restart impossible) or the retire path never tombstones (P4 red). The design does not say how the module function knows which path it is on.
- Change: a named retirement intent on the replica shutdown path (e.g. `replica.shutdown({retirement: RETIRE_RESOURCE | ORDERLY_STOP})` captured synchronously at `:234` before any await), consumed at the tombstone point; `retireReplica` (lifecycle) passes RETIRE, `stopOwnedReplica`/`shutdownAll` pass ORDERLY. A repeated `shutdown()` joins the in-flight one (`:224-225`): define that a retire joining an in-flight orderly stop must NOT assume the tombstone was written (see D4-2).

#### B3 (BLOCKING, recovery-replay #3/#5, NEW MECHANISM) CLOSE_UNRESOLVED custody is unreachable after the first attempt
- Evidence: `stopOwnedReplica :531-534` deletes the replica from `activeReplicas` and `retiringReplicas` after `shutdown()` settles; `WasmComponentDriver.stop :627-631` deletes `_running/_prepared/_lifecycles/_requestCells/_replicaContexts` unconditionally after `lifecycle.stopReplica`; `runReplicaOperation :389-397` completes the manager STOP row on any non-throw and `:398-408` FAILs it on throw (`recordLifecycleFailure :156-184`); the generic `STOP:S` row carries no token; on restart `recoverOperationRow :198-215` re-runs `adapter.stopReplica` -> runtime bound stop -> `driver.stop` with no lifecycle -> `_removeEndpoint`, STOPPED, row COMPLETED.
- Scenario: retire reaches (d), `closeInstanceResource` -> UNKNOWN, resolve -> UNAVAILABLE -> `{retired: true, closed: false}`. The design says "STOP operation stays IN_PROGRESS; explicit re-stop retries the exact CAS" (section 3). The re-stop goes manager -> runtime -> `driver.stop` -> `_lifecycles.get(S)` undefined -> no CAS; or, if the design keeps `_lifecycles`, `retireReplica(a)` "resolve the exact registered bound replica" finds none (deregistered) -> CONTENT_CONFLICT. Metadata slot stays PUBLISHED forever; J is `PREDECESSOR_OUTSTANDING` forever; `authority-and-recovery.md` "fail-closed without an owned continuation is not completion".
- Change: the CLOSED CAS custody must be durable and token-bearing and resolvable without a live replica: key it on the manager's creation row (`admission_json` holds the exact token, `service-consensus-creation-intent.js:103-119`) or on the local RETIRED record read back from the file, provide `retireReplica`-by-token for a deregistered replica, keep driver bookkeeping while `closed === false`, add the manager STOP branch (S1-3), and make the restart scan redo the CAS for an IN_PROGRESS retirement (contract C9 "crash on either side of local retirement/CLOSED").

#### D4-1 Reachability of `driver.stop` for a bound replica without the token
- Evidence: unbound runtime `start` catch calls `driver.stop(replicaContext)` (`service-runtime-lifecycle-operation-methods.js:427`) but the bound branch returns at `:311-313` before that try; `startConsensusBootstrap :17-25` has no stop-on-failure. `driver.stop :614-616` calls `lifecycle.stopReplica(serviceId)` (orderly) today. Node teardown `shutdown-methods.js:28-45` -> `shutdownAll`. So the only token-less bound stop is the orderly one: correct under B1's discriminator. But `health :644-694` deletes `_running` on a missing replica, and `#startRequestCell`/`invoke` catch paths call `_componentRuntime.stop` only. OK.

#### D4-2 (edge, concurrency) Retire racing an orderly stop or a second retire
- `stopReplica :505-511` stops all `retiringReplicas` for the serviceId; `shutdown()` joins (`:224-225`). A retire that joins an in-flight ORDERLY shutdown gets no tombstone (B1) and must not run the CLOSED CAS; two retires both resolve CLOSED (idempotent `:265-266`) and both fire the wake (dedup by the consumer queue). Neither edge is in section 3.

#### D4-3 (correct, with a caveat) Port release before CLOSED
- `stopOwnedReplica :526-529` releases the serviceId's port before `shutdown()`. A successor J for the same `serviceId` S can allocate the same number while I's raft port and handler are live. Transport is keyed by `unifiedAddress` (nodeId/type/physical replicaId), so no handler collision; the number only matters for the endpoint row, where S1-1 shows I's late `_removeEndpoint(S, node)` (`service-runtime-lifecycle.js:519-535`, remover `runtime-endpoint-publication-wiring.js:137-160`, predicate = same boot incarnation) deletes J's `S:node` endpoint if J started on the same node in the same boot. The port window is harmless; the endpoint identity is not (S1-1).

#### D4-4 "no await between the handler retirement and the write" is true but irrelevant
- The fence that matters is `:234` (STOPPING); between it and the tombstone are three awaits (`:170, :173, :185`). Correctness depends on B2's synchronous `serving` flip, not on this ordering claim.

### D5 RELEASING not written

#### D5-1 (REQUIRED CHANGE, R09, NEW SHAPE) Skipping RELEASING changes a guarantee and reinterprets the sealed contract
- Consumers today: only `changeResourceState :258` (refuses PUBLISHED on RELEASING); no reader (`grep RELEASING src/ test/`: constants and one rule). Contract: CONTRACT-R2 "A local failure retains RELEASING and the existing reconciliation owner" (implies PUBLISHED -> RELEASING -> CLOSED) and "Authoritative current-serving discovery uses PUBLISHED resource identity".
- Guarantee changed: with RELEASING never written, a replica that is locally RETIRED but whose CLOSED is unresolved reads PUBLISHED in metadata; discovery by PUBLISHED identity routes to a dead replica until CLOSED lands (and, with B3, forever). RELEASING is the metadata-visible "do not route; local owner retiring" state, i.e. visibility that discovery depends on, not cosmetic.
- The rationale conflates "attempt" with "depend": a non-blocking RELEASING CAS before the local stop (record outcome, proceed regardless) does not make the local stop depend on metadata.
- Change: either attempt RELEASING non-blocking before the local fence (typed outcome recorded in the retire result; `changeResourceState` already allows CLOSED from RELEASING `:265-268`), or obtain an explicit supersession of the sealed clause before implementation. Leaving it as "declared but unwritten, owner question" while implementing the rest is R09 reinterpretation.

### D6 Wake

#### D6-1 (REQUIRED CHANGE, R06/R11, NEW SHAPE) Callback shape, vocabulary and the named consumer
- Owner inversion: a lower owner (lifecycle) calling an injected callback is DI, acceptable; the existing idiom is enqueue-only into the consumer's `OwnerKeyReconcileQueue` with a `RECONCILE_REASON` member (`_wakeRebalancer :383-387`; `reconcile-queue-constants.js:11-54`). The design's `creationWake(serviceDefinitionId, {reason, binding, token})` with ad-hoc reasons OBSERVED/CLOSED (and the lab acceptance's recorded R06 nit: raw `RAFT_EVENT` names as queue reasons) needs `RECONCILE_REASON.CREATION_GENESIS_OBSERVED` / `CREATION_RESOURCE_CLOSED`.
- R11: "tolerates a throw by logging" and `CREATION_WAKE_UNDELIVERED` as a logged diagnostic make unavailability quieter, not typed. The START/retire result must carry `wake: {outcome: DELIVERED | UNDELIVERED | FAILED}`; the fixture asserts it.
- Consumer: CONTRACT-R2 names "the existing runtime-service reconcile owner for the selected binding" (RuntimeServiceRebalancerOwner). The design routes to `bootstrapConsensusCreation` (manager). For this stage with the fixture as consumer that is fine, but the design must either name the contract's consumer for production or record the deviation; "production wiring belongs to the upstream-selection stage" does not discharge R09.
- Re-entrancy: a wake fired from inside `reconcile()` -> `bootstrapConsensusCreation` -> `startReplica` -> `request()` -> `enqueueAndWait` on the same key while in flight is deferred/merged (`:238-246`, `:318-330`): safe because the wake is not awaited. State it.

### D7 Upper branches

#### B5 (BLOCKING, owner-interaction #7 projection-authority, R10/R19, NEW MECHANISM) A PUBLISHED result is accepted on shape, not on authority
- Evidence: `confirmConsensusBootstrapResult :42-49` checks status + binding/token digests; both are readable from `replicaContext.consensusCreation` by any driver (`#startConsensusReplica :524`). Existing witnesses refuse a RUNNING claim (`wasm-retained-bootstrap.integration.test.js:107-115`) and a wrong-ordinal HELD (`:281-289`); the design's PUBLISHED branch would accept `{status: PUBLISHED, started: true, consensusBinding, consensusResourceToken, port}` from a stale or forged driver result and then write the endpoint, project ACTIVE and COMPLETE the creation row with no grant having happened.
- Change: bind the PUBLISHED branch to durable authority: the runtime/manager re-resolves `resolveInstanceResource(B, token)` and requires `phase === PUBLISHED` before any endpoint/ACTIVE/COMPLETED effect, or the lifecycle returns a grant receipt the manager verifies against the owner. Add the forged-PUBLISHED negative to the proof (M5 as written only covers "any non-failed").

#### B6 (BLOCKING, recovery-replay #2/#5, NEW MECHANISM) COMPLETING the creation row makes every designed re-entry impossible
- Evidence: `continueIntent :163-166` returns `TERMINAL_OPERATION` for a COMPLETED row before resolving current permission; `prepareConsensusCreation :175-193` and `recoverConsensusCreation :194-217` both go through it; `bootstrapConsensusCreation :53-54` returns that outcome without touching the adapter; `_readRecoverableOperations :519-541` scans PENDING/IN_PROGRESS only.
- Scenario: D7 completes the row on the first PUBLISHED. Then: (i) the design's own idempotent re-entry ("metadata already PUBLISHED answers PUBLISHED ... re-entry re-reads metadata and retries the local write", section 3 rows for lost grant reply / local write failure) cannot run through the manager; (ii) P6 "reopen through the lifecycle restores serving" cannot use `f.bootstrap(host)` (the fixture's only re-entry); (iii) a lost COMPLETED reply leaves IN_PROGRESS + serving, and the next re-entry completes it, fine, but a landed COMPLETED followed by `_removeEndpoint`/projection failure has no retry path; (iv) B3's retirement custody cannot key on the creation row either if it is terminal.
- Contract: HANDOFF "Re-entry reads original intent and admission and resumes the phase; a historical COMPLETED row still requires current resource permission before any new effect" and "completes it only after the publication path completes". Both are satisfiable only if `continueIntent` treats a COMPLETED creation row as re-enterable under current permission, which is a contract-owner decision the design must name, or the row stays IN_PROGRESS until the restart stage lands. Decide and cite.

#### D7-1 Runtime stop branch (answer)
- `retireConsensusBootstrap` -> `driver.stop` -> `lifecycle.retireReplica(serviceId, token)`: the token is available from `_prepared.get(serviceId).consensusResourceToken` (`#prepareConsensusReplica :422-423`, descriptor from `consensusBootstrapDescriptor :22-25`): correct source. `driver.stop :627-631` must not clear bookkeeping on `closed:false` (B3). The runtime's `_removeEndpoint(S, definition)` and STOPPED projection run on `closed:false` too in the design's wording ("then `_removeEndpoint` and STOPPED projection as the unbound flow does") - STOPPED projection deletes the services row (`runtime-replica-state-projection.js:234-241`) while the slot is still PUBLISHED: define the order (remove endpoint first is right; STOPPED projection only after CLOSED, or keep a RELEASING-equivalent).

#### D7-2 Manager bootstrap branch (answer)
- `bootstrapConsensusCreation :60` sets STARTING on every re-entry; D7 sets RUNNING after PUBLISHED; a later wake-driven re-entry flips STARTING->RUNNING again: harmless but say so. `_replicaStateById` is keyed by `descriptor.replicaId` (`founder-N`), not the physical id: consistent with the manager's STOP `_assertTransition` (`service-lifecycle-operations.js:358-363`) only if the STOP handle uses the same `replicaId`: state it.

#### D7-3 Recovery scan (answer)
- `recoverOperationRow :96-99` routes creation rows to `recoverConsensusCreationRow`, unchanged: fine for IN_PROGRESS. Generic `STOP:S` rows from the bound retire are NOT recognised as consensus rows (`isConsensusCreationRow :218-221`) and take the generic path (B3).

### D8 Decision-boundary repair

#### D8-1 (REQUIRED CHANGE, R07) Real but under-specified
- A named no-failure object is a genuine R07 state (null-as-outcome is the ambiguity the rule names), not cosmetic, provided every consumer branches on the named state. Consumers: `initializeWasmServiceReplica :143` `throw replica.startupFailure ?? replicaRetiredError(replica)` would throw the sentinel object; `retireReplica :175, :197, :202` identity compares with `null`; `withRaftOpeningCleanupFailure :74-83` would wrap the sentinel as `cause` with `message: undefined`. Other `startupFailure` writers are in partition/message-group code (separate owners; untouched). No consumer of `activityFailure` outside the file. Change: enumerate and adjust those four sites; keep the sentinel frozen and module-owned (R06); scope widening is already recorded by the lab acceptance's finding list, so R16 is satisfied.

---

## Section 3. Typed failure edges: missing or wrong rows

1. Stop/replace between metadata PUBLISHED and local PUBLISHED (in-process): local ADMITTED, metadata PUBLISHED counted; reopen re-grants idempotently (D1-1). Missing.
2. Grant succeeds, local PUBLISHED written, `enableServing` throws (e.g. `reconstructTimers` on a kvStore read): serving state set but effects partial; define outcome (`SERVING_EFFECTS_INCOMPLETE`) and that re-entry replays effects. Missing.
3. Retire during an in-flight publish (see D1-1): publish after fence must refuse before `enableServing`; local CAS RETIRED vs PUBLISHED order defined by CAS expected-phase. Missing.
4. Retire joining an in-flight orderly stop (B1/D4-2). Missing.
5. Two retires racing: idempotent CLOSED, duplicate wake. Missing.
6. Publish on a file whose INIT was recorded by a previous incarnation of the same path (copied bytes): refused by `storage` identity at open, never reaches publish (D2-1). Missing as a row.
7. Selection J while I's retire is mid-flight: I is `retiring`, `findInstance :205-208` still finds it, CLOSED allowed; J's grant `PREDECESSOR_OUTSTANDING` until the last I slot. Covered implicitly; add the row.
8. CLOSED CAS unresolved then process restart / deregistered replica (B3). Row present but its claimed caller behaviour ("explicit re-stop retries the exact CAS") is unreachable.
9. Admin ENROLL/RECYCLE via `administerWriter` while held vs after PUBLISHED (S1-4). Missing.
10. User READ and ASYNC write during retirement (B2): design row says "existing WRITER_SHUTDOWN / WRITER_NOT_READY"; reads and async writes get neither today.
11. Wake fired but consumer throws: design logs; needs typed `wake.outcome` (D6-1).
12. `db` not open at tombstone time (D2-3): silent skip in the design; must be typed and must block CLOSED.
13. STOPPED projection / endpoint removal when `closed:false` (D7-1). Missing.
14. Endpoint write fails after serving enabled (`LifecycleOrchestrationError`): replica serves without a route; manager UNKNOWN; re-entry rewrites: acceptable, but missing from the table and from P1.
15. [other-vet, noted] `LOCAL_GRANT_NOT_RECORDED` labelled "`STOPPED_DURING_START`-class" is two codes for one edge (R07): pick one.

## Section 4. Cached-view audit (additions)

- `servingState` is set "retirement after RETIRED": that is the stale window B2 exploits. It must flip at the synchronous fence.
- `AuthoritativeRowMutationHelper` legacy cache dedup for the wasm shims (`:199-209`): a merged-cache `services` row equal to the pending role is taken as persisted; the design's "CAS hint only" understates it (existing behaviour, record).
- Driver `_running/_prepared/_lifecycles` are volatile and are the ONLY place the retained token is kept for stop (D7-1); they vanish on restart and on `driver.stop` (B3).
- `ServiceLifecycleManager._replicaStateById` RUNNING after PUBLISHED is the gate for STOP's `_assertTransition`; after a restart it is CREATED, so a STOP would be refused `CREATED -> STOPPING` (`unified-service-lifecycle.js:31-34`): restart retirement needs its own path (B3).

## Section 5. Identity anchoring (additions)

- The runtime-level identity of the bound replica is the logical S (`descriptor.serviceId`), the lifecycle-level identity is the physical `wasm-instance-<digest>-rN`, and the manager-level identity is `founder-N` (`descriptor.replicaId`). Endpoint and services rows are written under S (S1-1), the role/leader CAS under the physical id, the manager state under `founder-N`. The design's anchoring claim ("physical identity {groupId, replicaId, nodeId} ... the endpoint intent and the ACTIVE projection context carry binding and token") does not survive the production writers. Pin one identity per row and show which owner translates.

## Section 6. Proof plan

### S6-1 Claims in section 0 with no witness
- "copied durably into the receiver-local record before any user read, write, timer, role or leader publication is enabled": no ORDER witness. M1 (skip the write) is caught by P6's post-shutdown read, but "write local AFTER `enableServing`" passes P1/P6. Add: intercept `enableServing` (or the first admitted user message) and read the local phase at that instant.
- "an unknown CLOSED answer keeps the tombstone and the stop operation's custody": P5 asserts `CLOSE_UNRESOLVED` and a re-stop; with B3 the re-stop has no path; the witness as described cannot be green without the retire-by-token design.
- "Orderly node shutdown never retires a resource": P6 covers only if the fixture's `runtime.shutdown()` reaches `shutdownAll` on a PUBLISHED replica and the file is read after; fine, but B1 must be resolved first or P6 and P4 cannot both be green.
- "the last CLOSED of I wakes J's continuation through the same wake surface": P8 passes vacuously if the test calls J's bootstrap itself; assert J's PUBLISHED happened with no explicit test call after the third CLOSED and that the wake carried reason CLOSED with I's binding/token.
- Timer/role/leader publication enabled only after grant: no witness that `pendingLeaderNodeUpdate`/`persistedRole`/`activeTimers` are empty immediately before `enableServing` and populated after; the fixtures have no CDC so `queueRoleUpdate` returns at `:495-497` without flushing: the publication transports are never exercised (S1-1 vacuity).

### S6-2 Mutations that do not turn a test red
- M4 "move `closeAdmission` after the first await in retirement": P4's strong write is refused by `WasmWriterCompletion.submit :27` (`initialized` false from `:234`), not by `closeAdmission` (`:235`, reconciliation only). P4 stays green under M4. Use a READ and an ASYNC write in P4, and mutate the `serving` fence.
- M5 "accept any non-failed driver status as PUBLISHED": caught by the existing RUNNING witness (`wasm-retained-bootstrap.integration.test.js:107-115`), fine, but a forged PUBLISHED with correct binding/token (B5) is not a mutation in the plan and would pass.
- M2 is a metadata-owner rule (`:261-263`); if mutated in the owner, the owner's own component tests catch it; if the lifecycle ignores the outcome, P2 catches it: state which.
- Order witness P4 (reading the replica file during the intercepted `closeInstanceResource`): sound. By (d) the replica connection is closed (`:252-257`), WAL checkpointed on last close, a fresh connection sees the committed tombstone; if the connection were still open, WAL frames are visible to a second connection in the same process via the shm index. Not vacuous.

### S6-3 Coverage gaps versus the sealed test plan
- CONTRACT-R2 keeps TEST-PLAN C1-C13 required with corrections. P1-P8 map to C6 (P2/P3), C10 (P7, partial), last-CLOSED wake (P8). C1 (old INIT/ENROLL/WRITE refused after retire + new J serves) is the frozen `wasm-creation-bound-native.test.js` (S1-2) and is not named. C9's in-process half ("crash on either side of local retirement/CLOSED" has no same-process analogue; the design excludes process loss) should be stated as deferred, not silent.

### S6-4 Harness fidelity [other-vet, reported]
- Recording sinks for endpoint/state writers (section 6 "become recording sinks for this file only") prove nothing about the production writers that S1-1 shows will collide or throw. One witness must run `wireRuntimeEndpointPublication` and `projectRuntimeReplicaServicesRow` against the component SQLite gateway (both are plain owners over the gateway the fixture already has).

## Section 7. Out of scope: items that must move in or be explicitly deferred with an owner
- Retirement custody across restart (B3) is in scope the moment CLOSE_UNRESOLVED is a designed outcome.
- COMPLETED-row re-entry semantics (B6) cannot be deferred if D7 completes the row.
- Tombstoned-file cleanup / slot reuse (D2-2): record with an owner.

---

## Required changes (summary)

Blocking (REVISE):
- B1 Retirement intent discriminator on the shutdown path; `stopReplica`/`shutdownAll` never tombstone, `retireReplica` always does or refuses typed.
- B2 `serving` flips at the synchronous STOPPING fence; reads, ASYNC proposals and timer proposals refused from the fence; P4 witnesses reads/async.
- B3 Durable, token-bearing retirement custody resolvable without a live replica (creation row or local tombstone), retire-by-token path, driver bookkeeping retained on `closed:false`, manager STOP branch, restart scan redoes the CAS.
- B4 Row identity for the bound route: physical id as PK for services/endpoints with logical S resolved from B; binding/token carried in the rows; real writers in the proof.
- B5 PUBLISHED acceptance bound to durable authority (re-resolve PUBLISHED phase or verified grant receipt); forged-PUBLISHED negative witness.
- B6 Decide COMPLETED-row re-entry (contract-owner decision) or keep the creation row IN_PROGRESS this stage.

Required with the next revision:
- R1 Recheck after every await in `publishReplica`; refuse `enableServing` unless READY (D1-1).
- R2 Single-flight `publishReplica` per replica; idempotence latch for leader effects (D1-2).
- R3 Public vs private `publishReplica`; reconcile the frozen fixture (D1-3, S1-2).
- R4 Identity projection = all seven non-phase fields with `exactFields` + canonical equality (D2-1).
- R5 db-not-open at tombstone -> typed refusal, no CLOSED (D2-3).
- R6 RELEASING: non-blocking attempt or explicit supersession (D5-1).
- R7 Wake: `RECONCILE_REASON` members, typed `wake.outcome` in results, contract's consumer named (D6-1).
- R8 Order of `_removeEndpoint`/STOPPED projection relative to CLOSED (D7-1).
- R9 D8 consumer sites (`:143`, `:175`, `:197`, `:202`) adjusted for the sentinel (D8-1).
- R10 Vocabulary owners for the new codes and `CONSENSUS_BOOTSTRAP.PUBLISHED` (S1-3).
- R11 Section 3 rows 1-14 added; `LOCAL_GRANT_NOT_RECORDED` single code.
- R12 Section 6: order witness for local-before-serving, non-vacuous M4, P8 wake assertion, forged-PUBLISHED negative, C1 mapping.
- R13 Record D2-2 (tombstoned path blocks slot reuse; cleanup owner) as an R17 finding.
- R14 Cite the production writers and the frozen witness in section 1.
