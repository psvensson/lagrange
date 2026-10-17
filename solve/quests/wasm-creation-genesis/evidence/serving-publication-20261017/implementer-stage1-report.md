# Implementer report: serving grant, receiver-local publication, RETIRED-before-CLOSED (stage 1)

Worktree `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`, branch
`work/rs-raft-event-reconciliation-20261016` at `7696c3d8e`. Everything is uncommitted. I did not
commit, land, push, stash, reset or touch any ref or other worktree, and ran nothing on lab hosts.
This is not a claim that the stage is done. The multi-file lab selection below still has to run, and
the lead and the independent verifier decide.

## Previous implementer's partial work (kept, fixed or redone)
- CAS table test: kept. One assertion was wrong (a grant on a *retiring* instance answers STALE_BINDING before any slot phase is consulted, which is the existing rule order). I corrected it and added a no-mutation check. I also fixed a line-length issue.
- `service-instance-creation-sqlite-fixture.js`: kept the read fault but renamed it `setGatewayReadFault`. The old name `setReadFault` collided with `createOriginFixture`'s journal-reader fault and silently faulted the journal instead, so P13 and P5b were vacuous. I also added `holdNext(writer, {afterApply})` and `loseReply(writer, onLost)`.
- `wasm-retained-bootstrap-fixture.js`: the wake consumer used to be installed by default (`creationWake !== null` with an undefined default), which changed every historical file. It is now opt-in through the exported `reenterOnWake`, and without it the consumer is absent, as in production. I added `addHost(slot, intent)`, `reentryResults`, `handle/retire` from the creation row, and removed `rebind`.
- `wasm-service-replica.test.js` N5 READY helper and the refusal-shape assertion: kept.
- `wasm-creation-local-record.test.js`: kept as written. The source was implemented to its API.

## Per file
Source:
- `src/control-plane/owners/service-instance-state.js`: an R07 allowed-from table for `changeResourceState` (PUBLISHED←ADMITTED; RELEASING←ADMITTED|PUBLISHED; CLOSED←ADMITTED|PUBLISHED|RELEASING). A CLOSED slot answers CLOSED without mutation, and the PUBLISHED refusal order is unchanged (N3).
- `service-instance-metadata.js`, `service-definitions-owner.js`: `releaseInstanceResource` (RELEASING) (D5'/D4' step 3).
- `src/wasm-service/wasm-creation-opening.js`: the local record is now a named phase machine (ADMITTED→PUBLISHED→RETIRED, ADMITTED→RETIRED) with explicit `grant`/`retirement` detail. It adds `readWasmCreationLocal`, `recordWasmCreationLocalPhase` (a CAS inside `commitDurably`), `tombstoneWasmCreationLocal({db}|{dbPath})`, `wasmCreationLocalIdentity`, and the vocabularies `WASM_CREATION_LOCAL_PHASE/RECORD/RETIREMENT`. A RETAINED reopen checks the seven-field identity with exactFields and canonical bytes; RETIRED refuses with `CREATION_RETIRED`. Admission accepts metadata ADMITTED|PUBLISHED and returns the phase (D2', N14).
- `src/wasm-service/wasm-service-serving-state.js` (new owner): `WASM_SERVICE_SERVING_STATE` OPEN/HELD/SERVING/RETIRED; one fence `isServing` = state AND READY; `servingRefusal` (WRITER_SHUTDOWN after STOPPING, WRITER_NOT_READY while held, the existing `{error: SERVICE_NOT_READY}` when unbound); `boundProposalAdmission`; the open-time decision; `enableServing` as the process-local HELD→SERVING latch that replays leader effects once; `publishesServicesRow` (D3', N2, N16).
- `src/wasm-service/wasm-service-replica.js`: the seven guards now route through `serving`/`publishesServicesRow`; `applyLeaderEffects()` is extracted from `onBecameLeader`; `shutdown(retirement)` carries the intent; `startupFailure` is the named no-failure state. 781 lines.
- `src/wasm-service/wasm-service-replica-lifecycle.js`: D8 R07 repairs. The opening is now one named settlement table; startupFailure and activityFailure use `WASM_SERVICE_NO_FAILURE` at the `:143/:175/:197/:202` consumer sites through `joinFailure`. The shutdown captures its retirement intent at the STOPPING fence. A RETIRE_RESOURCE shutdown waits for the RELEASING attempt to settle, then writes the tombstone on the open connection after handler retirement and before the database closes (N15); a failed tombstone leaves the handles open (CLEANUP_REQUIRED). It decides SERVING at open and does not bind events when it opens SERVING (N16). The unbound open stays synchronous up to READY (see finding F1).
- `src/wasm-service/wasm-creation-publication.js` (new): the total grant step (CAS, one resolve on UNKNOWN, exact recheck, local durable PUBLISHED, `enableServing`) and `boundStartResult` mapping (D1', N10).
- `src/wasm-service/wasm-creation-wake.js` (new): typed, enqueue-only `deliverWasmCreationWake` returning DELIVERED/UNDELIVERED/CONSUMER_ABSENT (D6').
- `src/wasm-service/wasm-creation-reconciliation.js`: one keyed run owns genesis plus publication. `reconcileFn` consumes `reasons`. The wake predicate is: the flip happened in this run and the run carries no `PROGRESS_RECONCILE`. A held grant wakes once with `CREATION_GRANT_HELD` and the same waiter exclusion. The adapter unbinds after publication, and native enqueues use `RECONCILE_REASON.CREATION_NATIVE_PROGRESS` (D1', N2, N7, N13).
- `src/wasm-service/wasm-creation-retirement.js` (new): `retireWasmCreation(lifecycle, creation)` is keyed by the creation digest and never by serviceId. It fences at call, runs a non-blocking RELEASING, refuses RETIREMENT_BLOCKED_CLEANUP_REQUIRED while the database is still open, verifies the tombstone by path, and then runs CLOSED and wakes, or returns CLOSE_UNRESOLVED (D4', N4, N8).
- `src/wasm-service/wasm-service-lifecycle.js`: `continueBoundStart`, `publishReplica(serviceId, token)` (same shape as the bound START), `retireReplica(creation)`, a `creationWake` dependency, the successor fence (a bound creation is refused while any instance for the serviceId is still retiring), and `stopOwnedReplica(…, retirement)`. 706 lines.
- `src/wasm-service/wasm-creation-genesis.js`: `WASM_CREATION_GENESIS.PUBLISHED`.
- `src/wasm-service/wasm-service-constants.js`: the refusals LOCAL_GRANT_NOT_RECORDED, SERVING_ENABLE_FAILED, CREATION_RETIRED and RETIREMENT_BLOCKED_CLEANUP_REQUIRED; `WASM_SERVICE_SHUTDOWN_INTENT`; `WASM_SERVICE_NO_FAILURE`; four log messages.
- `src/workflow/reconcile-queue-constants.js`: CREATION_NATIVE_PROGRESS, CREATION_GENESIS_OBSERVED, CREATION_GRANT_HELD, CREATION_RESOURCE_CLOSED.
- `src/service/service-consensus-bootstrap.js`: `CONSENSUS_BOOTSTRAP.PUBLISHED`, `CREATION_WAKE_OUTCOME`. The confirm step accepts only HELD, or PUBLISHED with `started === true`, plus binding and token equality. The manager re-resolves PUBLISHED authority: confirmed sets RUNNING, a contradiction returns UNKNOWN/CONTENT_CONFLICT and retires by creation, and an unreachable owner returns UNKNOWN. The creation row stays IN_PROGRESS. Adds `retireConsensusCreation` (no generic STOP row, no transition assertion) (D7', N9, N4).
- `src/service/service-lifecycle-operations.js`: a bound STOP handle is dispatched to `retireConsensusCreation`.
- `src/runtime/service-runtime-consensus-bootstrap.js` plus `service-runtime-lifecycle-operation-methods.js`: `retireConsensusBootstrap` replaces the SERVING_UNAVAILABLE throw. There is no endpoint, projection or journal for a bound replica.
- `src/runtime/wasm-component-driver-consensus.js` (new) and `wasm-component-driver-vocabulary.js` (new, the driver's errors, actions and status-result shape moved out unchanged): the bound start projection (HELD | PUBLISHED, never RUNNING), and a bound stop that reads `replicaContext.consensusCreation` → `lifecycle.retireReplica`. `wasm-component-driver.js` went from 801 to 734 lines.
- `architecture/current-owner-maps.md`: an owner row in the Active Boundary Catalog (existing seven-column shape).

Tests and metadata:
- New `test/wasm-service/wasm-creation-publication.integration.test.js` (881 lines): `6prime` covers P1–P12 (with P5a/b/c, P6a/b, P11/P11b) and `6double-prime` covers P13–P18. Native RF3 on the retained-bootstrap fixture.
- New `test/wasm-service/wasm-creation-local-record.test.js` (component).
- N1 supersessions, appended with comments citing Revision 3 N1: `wasm-creation-genesis.integration.test.js` (assertHeld now checks that the slot phase, the local phase and serving agree), `wasm-creation-reconciliation.integration.test.js` (assertServed; the consumer is wired for tests 1–3; the shut-down replica refuses WRITER_SHUTDOWN), and `wasm-retained-bootstrap.integration.test.js` (two lines in the same class that N1 did not list, :60 and :211, plus `notEqual PUBLISHED` added to every "notEqual HELD" negative).
- N6: `wasm-creation-bound-native-fixture.js`, a recorded supersession. Creation now runs through `bootstrapConsensusCreation`, the INIT is authored by the continuation, ENROLL runs after publish, and `retire()` calls `retireReplica(creation)`. The C1 discriminator is kept. `wasm-creation-bound-native.test.js` is unchanged.
- `test/shards/impact-contracts.json`: hand-curated, for owners, tests and witnesses of `service-consensus-retained-native-bootstrap`. `primary/resource/subsystem-classes.json` were regenerated by their producers (`generate-test-*-classes.js`).

## Census (history pass: `git log -S/-L`; all guards date from 8200dd452, closeAdmission from e221c8c63, lifecycle from fcbd2694f/e2c7435b7)
- The seven `consensusCreation` guards are `heldCreationRefusal` (consumed by handleMessage, `_handleRead`, `_handleWrite`), the proposeEntry admission (reached through writerCompletion.submit, `_handleWrite` ASYNC, TimerManager:87/107/168 and administerWriter), and queueRoleUpdate, queueLeaderNodeUpdate (via replica-leadership-state.js:71/78/100), onBecameLeader (wireReplicaLifecycleEvents), flushRoleUpdate and flushLeaderNodeUpdate. All of them now go through `serving` or `publishesServicesRow`.
- Callers of `stopReplica`/`shutdownAll`: `wasm-component-driver.js` stop (unbound path), driver-shutdown-methods:35 (orderly), `shutdownAll`→`stopReplica`→`stopOwnedReplica`→`replica.shutdown()`. Manager-level callers are `runtime-service-handler.js:655`, `service-reconciler.js:583` and `service-lifecycle-recovery.js:208/227` (generic rows, out of scope). The only `driver.stop` callers are runtime ops :427 (unbound start catch) and :519. `replica.shutdown` is called only by `stopOwnedReplica` and by tests.
- Readers of `startupFailure`/`activityFailure`: only `wasm-service-replica-lifecycle.js`, plus the replica.js constructor.
- `changeResourceState` callers: `transitionInstanceResource` only (grant, close, and now release). Owner-method callers: lifecycle publication and retirement, the manager re-resolve, and tests.
- Tests that drive user paths on a replica that is not READY: `wasm-service-replica.test.js` unit helper (N5). The other WasmServiceReplica tests (`raft-rs-backend/*`, strong-write fixtures, writer-completion-v1) use initialized replicas, and the timer-manager tests use mocks.
- Mechanism class: "user/leader admission decided on creation presence instead of a serving fence" in the seven guards above, and "retirement keyed by serviceId" in driver `_prepared/_lifecycles` and lifecycle `activeReplicas`. Both are resolved inside scope. Nothing in either class leaves the scope.

## Red-first outputs (logs under `.../scratchpad/red/`)
- CAS: 9 pass / 1 fail, `releaseInstanceResource is not a function` (cas-red.log).
- local-record: `SyntaxError … does not provide an export named 'WASM_CREATION_LOCAL_PHASE'` (local-record-red.log).
- replica unit: the new :694 `serving` assertion is red (`undefined` vs `false`). The file is already red at HEAD for 5 pre-existing cases (see F2; replica-unit-HEAD.log).
- publication: 20 fail / 1 pass. P1, P4–P6, P10 and P16: `host-1 did not publish`. P2/P13: `undefined !== 'HELD'`. P3a: `reading 'outcome'`. P3b/P9/P14: `GRANT_CAS_NEVER_ATTEMPTED`. P11: `CONSENSUS_SERVING_NOT_IMPLEMENTED !== CONTENT_CONFLICT`. P12/P18: `undefined !== 'SERVING'`. P15: `0 !== 1`. P17: BOOTSTRAPPED_HELD result. P11b already passed (it guards M5) (publication-red.log).
- genesis N1: 8 fail / 6 pass. reconciliation-integration N1: 4 fail. retained: still green (the appended negatives hold before source).
- Frozen C1 before supersession: all 3 red at `createGroup:237` (the normalized descriptor dropped `consensusBinding`), an earlier point than the re-vet recorded (c1-frozen-red.log).

## Mutations (each measured once; source restored in `finally` and verified byte-identical; logs `.../scratchpad/mutations/`)
| M | Mutation | First failing assertion |
| --- | --- | --- |
| M1 | skip the local PUBLISHED write | P1 `LOCAL_GRANT_NOT_DURABLE`; P12 `USER_WORK_ADMITTED_BEFORE_THE_LOCAL_GRANT` |
| M2 | drop the PREDECESSOR_OUTSTANDING rule | P2 `the successor reservation exists` (actual PUBLISHED) |
| M3 | CLOSED before the tombstone | P4 order deepEqual; P16 `CLOSED_ATTEMPTED_WITHOUT_A_DURABLE_TOMBSTONE` |
| M4 | remove READY from `serving` | P4 `READ_ADMITTED_AFTER_THE_STOP_FENCE` |
| M5 | accept `running` as confirmed | P11b (the RUNNING claim was accepted) |
| M6 | disconnect the OBSERVED wake | P1 (no owner wake; held result) |
| M7 | drop the waiter term | P17 `A_WAITED_START_ALSO_WOKE_ITS_OWNER` (also P1/P2/P15) |
| M8 | remove the post-grant recheck | P9 `A_GRANT_LANDED_LOCALLY_AFTER_THE_STOP_FENCE` |
| M9 | remove the manager re-resolve | P11 (forged PUBLISHED accepted) |
| M10 | remove the RELEASING/CLOSED guards | CAS `RELEASING_REGRESSED_A_CLOSED_SLOT` |
| M11 | match the retire target by serviceId | P2/P8 (successor shut down), P5c `PREDECESSOR_RETIREMENT_TOUCHED_THE_SUCCESSOR` |
All 11 mutations engage. The design said M5 would be caught by an existing witness. It is not: `wasm-retained-bootstrap:107` stays green under M5, so P11b was added.

## Local single-file witnesses on the final tree (classified runner)
All green: publication (21 cases), genesis, reconciliation-integration, retained-bootstrap, C1 bound-native, CAS, selection-admission, local-record, reconciliation unit, wasm-service-lifecycle, driver, service-runtime-lifecycle, creation-intent. `wasm-service-replica.test.js` has exactly the 5 HEAD failures with an identical failure set (diffed), and the new assertion passes.

## Static (verbatim summaries)
- `check-fast-static --base 7696c3d8e`: `fast-static: ok in 17036ms`.
- decision boundaries over the 22 touched src files: `total 0, inherited 5`. `wasm-service-replica-lifecycle.js` and every new module have 0. No baseline update.
- eslint on all touched src and test files: clean.
- complexity `--scoped`: 3 violations, all inherited and unchanged against HEAD (runtime ops `prepare` 16, `start` 26, `stop` 14). New modules have 0. Whole-tree complexity is `1793 > 1755` (F4). Cognitive `--scoped`: 0. Whole-tree cognitive: 152/152 OK.
- literals: 0 new, 0 inherited. silent-catch: 0. runtime-grammar: 0. circular deps: 0/0. file-size: OK (source oversized 26/27; the driver dropped below 800 and no tightening hint was printed). doc-ascii: OK.
- `audit:shards`: current/OK after the regeneration. `audit:impact-contracts`: the service-consensus warnings are gone; other contracts still have pre-existing "not primary-classified" warnings.
- test duplication: `[test] … 698 > 697 groups`. None of the touched test files appears in any clone group in the jscpd report, so this is inherited (F5).
- Not run (lead or land): the impact-graph seal refresh (`solve land`), the whole-repo gates, the corpus.

## Multi-file selection for the lab (stop point)
The retained 21:
test/bootstrap/wasm-meta-table-schemas.test.js, test/control-plane/service-instance-creation-cas.test.js,
test/control-plane/service-instance-selection-admission.test.js, test/runtime/node-shutdown-cell-worker-teardown.test.js,
test/runtime/service-runtime-lifecycle-idempotency.test.js, test/runtime/service-runtime-lifecycle-journal.test.js,
test/runtime/service-runtime-lifecycle.test.js, test/runtime/wasm-component-driver.test.js,
test/service/service-consensus-creation-intent.test.js, test/service/service-consensus-creation-recovery.integration.test.js,
test/wasm-service/wasm-creation-genesis.integration.test.js, test/wasm-service/wasm-creation-reconciliation.integration.test.js,
test/wasm-service/wasm-creation-reconciliation.test.js, test/wasm-service/wasm-retained-bootstrap.integration.test.js,
test/wasm-service/wasm-service-lifecycle.test.js, test/wasm-service/wasm-strong-write-v1-native-completion.test.js,
test/wasm-service/wasm-writer-state-v1.test.js, test/workflow/owner-key-reconcile-queue-current-work.test.js,
test/workflow/owner-key-reconcile-queue-failure-atomicity.test.js, test/workflow/owner-key-reconcile-queue.test.js,
test/workflow/reconcile-queue-retry-wait-bound-spent.test.js

Plus C1 and the new files: test/wasm-service/wasm-creation-bound-native.test.js,
test/wasm-service/wasm-creation-publication.integration.test.js, test/wasm-service/wasm-creation-local-record.test.js.

Recommended neighbours for the serving fence (unbound replicas now refuse when not READY):
test/wasm-service/wasm-service-replica.test.js (red at base, 5 cases, F2), test/wasm-service/wasm-writer-completion-v1.test.js,
test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js, test/raft/raft-rs-backend/durable-commit-replica-kinds.test.js,
test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js, test/wasm-service/timer-manager.test.js.

## Findings, deviations and surprises (R17, not absorbed)
- F0 (a design gap; surfaced, not invented around). All sibling slots share one `service_instances` row, so concurrent founder grants race on the single-row CAS. The losers get `STATE_CHANGED` (the owner does no semantic CAS loop by design). The continuation reports this as a typed GRANT_HELD wake, and the operation owner re-drives it. The fixture consumer re-drives only STATE_CHANGED. P1, P15 and P18 assert "one owner wake per replica: OBSERVED or a STATE_CHANGED hold", not "OBSERVED on every replica". In production this costs a desired-state reconcile cycle per raced founder. It is latency, not correctness. Row granularity and sibling-grant collisions need an owner decision.
- F1. My first D8 restructure added an `await` that made the unbound open asynchronous up to READY, and the unit interleaving model caught it (164/1884 deviations against 112 at HEAD). I fixed it so the bound path awaits only admission. Interleaving deviations are back to the identical HEAD set.
- F2. `wasm-service-replica.test.js` is red at base 7696c3d8e: 4 `applyCommittedEntry` cases pass no `effects`, and the interleaving model has 112/1884 deviations ("registered handler is not the model's"). This is pre-existing, outside the 21, and untouched.
- F3 (deviations). (a) N3 "any target on a CLOSED slot answers CLOSED" is applied to RELEASING and CLOSED targets only. PUBLISHED keeps its sealed refusals (`RESOURCE_CLOSED`, with STALE_BINDING first for a retiring instance; CAS :136 is unchanged). (b) The N7 GRANT_HELD wake also excludes waited runs, the same waiter term as N2, because a waited START collects its own typed result. (c) Native events enqueue with a new member, `RECONCILE_REASON.CREATION_NATIVE_PROGRESS`; the design named only the three wake members. (d) Every retire wakes on CLOSED or already-CLOSED (D4' step 6), while the 3' row says "two retires racing: one wake". (e) The retire verifies the tombstone by path after the shutdown (it answers ALREADY after an in-path tombstone). (f) A by-path tombstone matches the five fields derivable from the retained creation, because a tombstone is fail-closed; a live tombstone matches all seven. (g) The in-path tombstone waits for the RELEASING attempt to settle (any answer), so RELEASING is observed before RETIRED (P4). (h) D7' "retire by token" on a contradicted PUBLISHED claim is implemented only for a definitive contradiction (resolved non-PUBLISHED, HISTORY_UNAVAILABLE, CONTENT_CONFLICT). An unreachable owner returns UNKNOWN without retiring.
- F4. Whole-tree complexity is `1793 > 1755` at this tree. The touched files contribute only the 3 inherited violations, unchanged against HEAD. The base is presumably already red; this is unverified at HEAD tree-wide.
- F5. Test duplication is `698 > 697 groups` and no touched test file is involved.
- F6. `safetyIntervalMs: 0` in the fixture definition gives `setInterval(…, 0)`, about 1 ms broadcasts, on a serving leader. `SafetyInterval` accepts 0. This is a pre-existing hazard.
- F7. N1's list missed retained-bootstrap :60 and :211 (same class); I superseded them with a comment. The N1 quest-log `decision` entry naming the superseded lines (genesis :39-46 assertHeld, :58-59, :85-90, :105, :113, :129-148 appended, :179, :198, :217, :313; reconciliation :35-41, :45-66, :68-116, :118-143 appended; retained :60, :211 and the appended negatives; C1 fixture createGroup/initializeAndPublish/retire) is the lead's to append. I wrote no quest log.
- F8. The frozen C1 fixture was red before this stage at `createGroup:237`, earlier than the re-vet stated. The N6 supersession had to cover its creation route as well.
- F9 (out of scope, as the brief lists): endpoint/services/ACTIVE publication for bound replicas; COMPLETED-row re-entry; restart-scan retirement custody; intact restart with metadata unavailable (reopen still reads metadata); tombstoned-path slot reuse; `reconstructTimers` idempotence; `handleMessage` ACK on a null port; cross-node wake delivery (P8: only the J replica on the node of the last CLOSED publishes autonomously, and the others need their own re-entry).
- Evidence ceiling: native RF3 on one host, component SQLite metadata/journal, queued loopback transport, virtual clocks.
