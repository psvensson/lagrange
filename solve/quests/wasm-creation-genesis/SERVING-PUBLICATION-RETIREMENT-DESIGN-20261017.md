# Serving grant, receiver-local publication and RETIRED-before-CLOSED: design

Quest `wasm-creation-genesis`, stage after the event-to-reconciliation
connection (lab-accepted at `35d533b6b`, record
`EVENT-RECONCILIATION-STAGE-LAB-ACCEPTANCE-20261017.md`). Base for this stage:
branch `work/rs-raft-event-reconciliation-20261016` at `c6b1aa259`. Every
`file:line` below is from that tree. This note is structured by
`docs/development/verification-templates/design-note-template.md`; it is
proposed, not implemented. The design vet attacks each section separately.

## 0. Claim, frozen as behaviour

After a bound replica's genesis is observed, exactly one owner grants it the
right to serve: the metadata PUBLISHED compare-and-set on its exact admitted
resource slot, copied durably into the replica's own receiver-local record
before any user read, write, timer, role or leader publication is enabled.
Retiring that replica closes new user admission synchronously, joins its
owned continuations, records the local RETIRED tombstone durably while the
replica database is still open, and only then acknowledges the metadata CLOSED
compare-and-set; an unknown CLOSED answer keeps the tombstone and the stop
operation's custody. Orderly node shutdown never retires a resource. A
successor instance J cannot be granted while any resource of I is outstanding,
and the last CLOSED of I wakes J's continuation through the same wake surface
that genesis observation uses. Externally relevant outputs: the metadata slot
phase, the local record phase, whether `handleMessage`/`proposeEntry` admit
user work, the endpoint row, the `services` projection, the manager's creation
journal row state, and the typed outcome each caller receives.

Allowed nondeterminism: which founding replica is leader; message interleaving
of the queued loopback transport; the order in which the three replicas
publish. Excluded: physical multi-host metadata quorum, native SIGKILL and
power-loss recovery, intact restart after process loss (next stage), request
Cells, OCI, catalog activation.

## 1. Consumed surfaces (cite or it does not exist)

Metadata permission owner (exists, unchanged except where noted):

- `ServiceDefinitionsOwner.grantInstanceResource` /
  `closeInstanceResource` `src/control-plane/owners/service-definitions-owner.js:104-110`
  -> `transitionInstanceResource` `src/control-plane/owners/service-instance-metadata.js:163-177`
  -> `mutateResource` `:131-142` -> `commitState` `:45-72` (one conditional
  UPDATE; `affectedRows === 1` or one authoritative reread; `UNKNOWN` /
  `STATE_CHANGED` otherwise).
- Decision rules `changeResourceState`
  `src/control-plane/owners/service-instance-state.js:251-269`: PUBLISHED needs
  `instance === state.selected`, slot phase not CLOSED/RELEASING, and
  `!outstanding(state.retiring)` (`:38-41`); CLOSED is allowed from ADMITTED,
  PUBLISHED or RELEASING; the same phase answers `{outcome: phase, phase,
  token}` without a mutation (idempotent). `resolveResourceState` `:240-250`
  refuses a lower ordinal as HISTORY_UNAVAILABLE and a token mismatch as
  CONTENT_CONFLICT. Vocabulary `SERVICE_INSTANCE_PHASE` / `_OUTCOME`
  `src/constants/service-instance.js:11-24`.
- `selectionAdmission` `:153-166` holds a third selection TRANSITION_HELD while
  `retiring` is outstanding. This is the fact J's wake re-reads.

Receiver-local record owner (exists; becomes a phase machine):

- Table `_wasm_creation_local`, SQL `src/wasm-service/wasm-creation-opening.js:16-27`;
  written once as `{format, groupId, replicaId, nodeId, token, phase:
  ADMITTED, opening, storage}` by `openWasmCreationRecords` `:83-107`; a
  RETAINED reopen requires byte-equality with that ADMITTED encoding at `:106`.
- `resolveWasmCreationAdmission` `:41-58` requires metadata `phase ===
  PHASE.ADMITTED` at `:49` (must accept PUBLISHED; see 2.).
- `initializeWasmCreationContext` `:109-115` owns the replica's nullable
  creation fields. `readWasmCreationBinding` `:71-82` is the common-root read
  the writer owner uses (`src/wasm-service/wasm-writer-state.js:81,123-127`).
- Durable commit helper to reuse: `commitDurably(db, work)`
  `src/raft/raft-rs-durable-store.js:188-203` (exported `:727`): raises the
  connection to `synchronous=FULL` around one transaction. Replica databases
  open with WAL / NORMAL `src/storage/storage-constants.js:23-26`,
  `src/wasm-service/wasm-service-consensus-port.js:190-195`.

Serving gates to unify (seven guards on `consensusCreation` in
`src/wasm-service/wasm-service-replica.js`):

- `heldCreationRefusal()` `:285-288`, consumed by `handleMessage` `:358-359`,
  `_handleRead` `:382-383`, `_handleWrite` `:422-423`.
- `proposeEntry` admission choice `:463-464` ->
  `admitWasmBootstrapCommand` `src/wasm-service/wasm-service-committed-command-admission.js:60-67`.
- `queueRoleUpdate` `:490`, `queueLeaderNodeUpdate` `:512`, `onBecameLeader`
  `:545`, `flushRoleUpdate` `:584`, `flushLeaderNodeUpdate` `:594`.
- Publication transports (exist): role and leader-node helpers
  `src/wasm-service/wasm-service-metadata-mutation-helpers.js:57-135`
  (`AuthoritativeRowMutationHelper`, CAS on the cached `services` row keyed by
  `replica.replicaId`, which for a bound replica is already the
  instance-qualified physical id from `runtimeServiceConsensusIdentity`
  `src/rebalancer/runtime-service-replica-identity.js:78-88`).
- Native event wiring `wireReplicaLifecycleEvents`
  `src/wasm-service/wasm-service-replica-lifecycle.js:91-98` ->
  `onBecameLeader/onBecameFollower` `wasm-service-replica.js:544-576`.

Lifecycle and continuation (exist):

- `WasmServiceLifecycle.startReplica` bound branch
  `src/wasm-service/wasm-service-lifecycle.js:352-364` returns
  `{started:false, bootstrapped:true, status: CONSENSUS_BOOTSTRAP.HELD,
  consensusBinding, consensusResourceToken, genesis}` after
  `replica.creationReconciliation.request()`; `PortAllocator.allocate` is
  idempotent per serviceId `src/wasm-service/port-allocator.js:50-54`, so a
  re-entered START keeps the port.
- `stopReplica` `:504-517`, `stopOwnedReplica` `:524-537` (port release,
  `replica.shutdown()`, registry removal), `shutdownAll` `:632-647`.
- `WasmCreationReconciliation.request/reconcile`
  `src/wasm-service/wasm-creation-reconciliation.js:53-64`;
  `progressWasmCreationGenesis` and `WASM_CREATION_GENESIS`
  `src/wasm-service/wasm-creation-genesis.js:15-19,59-87`.
- Replica instance lifecycle: `openReplica` `:78-128` (`bind()` at `:99`),
  `retireReplica` `:165-211` (continuation shutdown `:172-177`, handler
  retirement `:181-192`, consensus release `:196`), `shutdownWasmServiceReplica`
  `:222-248` (`closeAdmission()` `:235`, `stopActivity()` `:240`).
- `closeWasmServiceConsensus` `wasm-service-consensus-port.js:229-267` closes
  port, KV store and database; after it `replica.db` is null, so any local
  record write must precede it.

Upper consumers that need an explicit PUBLISHED branch (exist; HELD-only now):

- `confirmConsensusBootstrapResult` `src/service/service-consensus-bootstrap.js:42-49`
  (vocabulary `CONSENSUS_BOOTSTRAP` `:12-16`); `bootstrapConsensusCreation`
  `:50-71` (manager; `_replicaStateById` STARTING at `:60`).
- `startConsensusBootstrap` `src/runtime/service-runtime-consensus-bootstrap.js:17-25`;
  `prepareConsensusBootstrap` `:8-16`.
- Runtime `start` bound branch `src/runtime/service-runtime-lifecycle-operation-methods.js:311-313`;
  endpoint write path `:371-405` (`validateEndpointIntent`
  `src/runtime/service-runtime-lifecycle.js` accepts extra fields);
  `_projectReplicaState(ACTIVE)` `:407-409` -> `src/runtime/service-runtime-lifecycle.js:474-497`
  (ACTIVE fails closed) with `buildReplicaStateProjectionRequest`
  `src/runtime/service-runtime-state-projection-handoff.js`; `_removeEndpoint` `:516+`.
- Runtime `stop` bound branch throws `SERVING_UNAVAILABLE` `:485-487`; unbound
  stop flow `:512-535` (driver.stop, journal, `_removeEndpoint`, STOPPED
  projection).
- Driver: `#projectConsensusStartResult` `src/runtime/wasm-component-driver.js:543-575`
  (HELD at `:550-554`; RUNNING + `endpointIntent` from `startResult.port`
  `:563-575`); `stop` `:593-631` -> `lifecycle.stopReplica`; node teardown
  `src/runtime/wasm-component-driver-shutdown-methods.js:27-45` ->
  `shutdownAll` (per-replica stop "is driven by the REMOVE_REPLICA workflow and
  never runs at whole-node shutdown", `:6-9`).
- Manager journal: retained creation row columns `WASM_OPERATION_COL`
  `src/wasm-service/wasm-meta-models-constants.js:67-80`; `transitionOperation`
  `src/wasm-service/operation-lifecycle.js:127-175` (IN_PROGRESS -> COMPLETED
  with `result`, WHERE `operation_id AND state`); `TERMINAL` and `LIVE_PHASES`
  `src/service/service-consensus-creation-intent.js:35-36`;
  `resolveRetainedAdmission` `:148-162` already accepts PUBLISHED.
- Recovery scan `recoverOperationRow` `src/service/service-lifecycle-recovery.js:96-99`
  routes creation rows to `recoverConsensusCreationRow` (unchanged).

Surfaces this design must create (none exist today): the local phase machine
functions in `wasm-creation-opening.js`; `WasmServiceLifecycle.publishReplica`
and `retireReplica`; the replica's `servingState` accessor and `enableServing`
effect; the `creationWake` dependency; the PUBLISHED branches listed above;
`retireConsensusBootstrap` in `service-runtime-consensus-bootstrap.js`; the
owner row in `architecture/current-owner-maps.md`.

## 2. Mechanism and decisions

D1. One grant path. `publishReplica(serviceId, exactToken)` runs only inside
`startReplica`'s bound branch after `creationReconciliation.request()` returns
`GENESIS_OBSERVED`. The event-driven continuation never grants; when its result
transitions to OBSERVED it calls the wake (D6). Rationale: `authority-and-recovery.md`
"one decision algorithm, multiple legitimate triggers"; HANDOFF-INTERFACES "a
repeated start of the original operation can perform this continuation".

Order inside `publishReplica`: (a) recheck exact replica/port/creation/READY;
(b) `writerState.classify(boundWasmInitialization(binding))` must be RECORDED
and accepted (reread, never the waiter answer); (c) `grantInstanceResource(B,
token)`; `UNKNOWN` -> one `resolveInstanceResource`; (d) on PUBLISHED, write the
local record phase PUBLISHED through `commitDurably`; (e) `replica.enableServing()`;
(f) return `{started: true, bootstrapped: true, status:
CONSENSUS_BOOTSTRAP.PUBLISHED, port, consensusBinding, consensusResourceToken,
genesis, grant}`. Any other grant outcome returns the existing HELD shape with
`grant: {outcome}` so the caller sees the typed hold (STALE_BINDING,
PREDECESSOR_OUTSTANDING, RESOURCE_CLOSED, HISTORY_UNAVAILABLE, CONTENT_CONFLICT,
UNKNOWN, UNAVAILABLE). Idempotent re-entry: metadata already PUBLISHED answers
PUBLISHED without a mutation; local already PUBLISHED is a no-op;
`enableServing` is idempotent.

D2. Local record = named phase machine, owner `wasm-creation-opening.js`.
Record shape keeps the seven identity fields and adds `phase` as a state:
ADMITTED -> PUBLISHED -> RETIRED, plus `grant: {token, at}` on PUBLISHED and
`retirement: {reason, at}` on RETIRED (bounded by the existing 8192 limit).
`readWasmCreationLocal(db)` validates shape and identity; `recordWasmCreationLocalPhase(db,
expectedPhase, nextPhase, detail)` is a CAS on the stored phase inside
`commitDurably`, answering RECORDED, ALREADY (same phase), or a typed refusal
(RETIRED is terminal; ADMITTED cannot skip to RETIRED? It can: an admitted,
never-published replica is retired directly). `openWasmCreationRecords`
RETAINED branch compares the identity projection and admits phase ADMITTED or
PUBLISHED; RETIRED refuses typed `CREATION_RETIRED` before any native handle
opens. `resolveWasmCreationAdmission` accepts metadata phase ADMITTED or
PUBLISHED (`LIVE_PHASES`); CLOSED or RELEASING refuse `RESOURCE_CLOSED`.

D3. One serving-admission state on the replica. `replica.servingState`:
`OPEN` when `consensusCreation === null` (unbound replicas keep today's
behaviour exactly), else derived from the local phase: `HELD` (ADMITTED),
`SERVING` (PUBLISHED), `RETIRED`. `replica.serving` is `servingState === OPEN
|| SERVING`. The seven guards consume `serving`; `heldCreationRefusal()`
returns the existing refusal unless `serving`; `proposeEntry` chooses bootstrap
admission unless `serving`. `enableServing()` sets the state from the durable
record and, exactly once, applies the leader-side effects the guards suppressed
while held: if `isLeader`, `onBecameLeader()`'s timer reconstruction and
safety broadcasts; then `queueRoleUpdate(role)` and, if leader,
`queueLeaderNodeUpdate(nodeId)`. No second publication path: the same helpers
and the same `services` row identity.

D4. Retirement is a distinct verb from orderly stop.
`WasmServiceLifecycle.retireReplica(serviceId, exactToken)`: (a) resolve the
exact registered bound replica and token (mismatch -> typed `CONTENT_CONFLICT`,
nothing stops); (b) `replica.shutdown()` through the existing path (admission
closes synchronously at `:235`, writer interest aborted, continuation joined,
handler retired); (c) inside `retireReplica` (the module function), after the
handler retirement and before `releaseWasmServiceReplicaConsensus`, write the
local phase RETIRED through `commitDurably` when the replica is bound and
`replica.db` is open; (d) after the shutdown settles and the port is released,
`closeInstanceResource(B, token)`; `UNKNOWN` -> one `resolveInstanceResource`;
(e) outcome CLOSED (or already CLOSED) -> wake (D6) with reason CLOSED and
return `{retired: true, closed: true}`; any other outcome returns `{retired:
true, closed: false, close: {outcome}}` (typed `CLOSE_UNRESOLVED`) and the
caller keeps custody. The retirement write (c) runs on the replica's own
connection with no await between the handler retirement and the write, so no
user work can be admitted between fence and tombstone. `stopReplica` and
`shutdownAll` are unchanged: an orderly stop leaves the local phase as it was.

D5. The metadata RELEASING phase is not written in this stage. PUBLISHED and
ADMITTED already block a successor's grant and a third selection; writing
RELEASING before local release would make a local stop depend on metadata
availability, which `authority-and-recovery.md` forbids ("recovery must not
depend on the condition it restores"). This leaves `PHASE.RELEASING` a
declared but unwritten state; recorded as an owner question (R17), not decided
here.

D6. One wake surface. `WasmServiceLifecycle` gains the optional dependency
`creationWake(serviceDefinitionId, {reason, binding, token})`, enqueue-only
(the lifecycle never awaits it and tolerates a throw by logging). It is called
when the continuation's result first becomes OBSERVED for a replica and when
`retireReplica` observes CLOSED. The consumer is the owner of the original
operation's continuation (`ServiceLifecycleManager.bootstrapConsensusCreation`
re-run for OBSERVED; the successor's bootstrap for CLOSED). In this stage the
test fixture is that consumer; production wiring into `RuntimeServiceHandler`
belongs to the open upstream-selection stage. An absent consumer is the typed
diagnostic `CREATION_WAKE_UNDELIVERED` on the lifecycle logger, never silence.

D7. Upper layers, each with an explicit PUBLISHED branch. Driver
`#projectConsensusStartResult`: `status === PUBLISHED && started === true` ->
`{status: START_STATUS.RUNNING, endpointIntent: {host, port, consensusBinding,
consensusResourceToken}, consensusBinding, consensusResourceToken}`; HELD
unchanged; any other shape FAILED as today. `confirmConsensusBootstrapResult`
accepts HELD or PUBLISHED, both with binding/token equality. Runtime
`startConsensusBootstrap`: on PUBLISHED, validate the endpoint intent, write it
through `_endpointWriter(serviceId, runtimeKind, endpointIntent, {causeId})`,
`_projectReplicaState(serviceId, descriptor, ACTIVE, null, {causeId,
consensusBinding, consensusResourceToken})` (ACTIVE still fails closed), no
nested journal row; on HELD return as today. Manager `bootstrapConsensusCreation`:
on PUBLISHED transition the retained creation row IN_PROGRESS -> COMPLETED
through `transitionOperation` with the result, observe the row once, set
`_replicaStateById` RUNNING; on HELD unchanged. Runtime `stop` bound branch:
`retireConsensusBootstrap(owner, definition, replicaContext)` -> driver.stop ->
`lifecycle.retireReplica(serviceId, token)` (driver passes the retained token
from the prepared definition); then `_removeEndpoint` and STOPPED projection as
the unbound flow does; the manager's STOP operation row completes only when
`closed === true`, otherwise it stays IN_PROGRESS with the typed outcome.

D8. The recorded decision-boundary findings in
`wasm-service-replica-lifecycle.js` (lines 80, 119, 205, 238) are repaired in
passing: `startupFailure` and `activityFailure` take a named no-failure state
object instead of `null`, and `openReplica`'s state assignments collapse into
one named-outcome resolution. Scoped audit of the touched files must report
zero findings; no baseline raise.

## 3. Typed failure edges

| Edge | Typed outcome | Fails closed? | Caller observes |
| --- | --- | --- | --- |
| grant while predecessor outstanding | `PREDECESSOR_OUTSTANDING` | yes | HELD result with `grant.outcome`; no local write, no serving |
| grant after a newer selection | `STALE_BINDING` | yes | HELD; exact cleanup owed (retire path) |
| grant on CLOSED/RELEASING slot | `RESOURCE_CLOSED` | yes | HELD |
| grant lower ordinal / token mismatch | `HISTORY_UNAVAILABLE` / `CONTENT_CONFLICT` | yes | HELD |
| grant answer lost | `UNKNOWN` then one resolve; still unresolved -> `UNKNOWN` | yes | HELD; re-entry retries the same CAS |
| metadata unavailable | `UNAVAILABLE` | yes | HELD |
| local PUBLISHED write fails | thrown SQLite error -> start refused `STOPPED_DURING_START`-class typed refusal `LOCAL_GRANT_NOT_RECORDED`; serving not enabled | yes | refused start; metadata already PUBLISHED counts (contract: grant overtakes selection stays counted); re-entry re-reads metadata and retries the local write |
| INIT not recorded/accepted at publish time | HELD (`WRITER_UNINITIALIZED` / `WRITER_RESPONSE_MISMATCH`) | yes | HELD |
| replica replaced/stopped during publish await | `STOPPED_DURING_START` | yes | refused start |
| reopen of a RETIRED local record | `CREATION_RETIRED` | yes | open refused before native handles |
| reopen with identity mismatch | `CONTENT_CONFLICT` | yes | open refused |
| retire with wrong token | `CONTENT_CONFLICT` | yes | nothing stopped |
| retire: local RETIRED write fails | shutdown reports cleanup failure (existing `CLEANUP_REQUIRED` path), CLOSED CAS not attempted | yes | `{retired:false, closed:false, failure}` and custody retained |
| retire: CLOSED CAS unknown/unavailable | `CLOSE_UNRESOLVED` with the owner outcome | yes | STOP operation stays IN_PROGRESS; explicit re-stop retries the exact CAS |
| retire: CLOSED already applied | `CLOSED` (idempotent) | n/a | `closed:true`, wake fired |
| wake consumer absent | `CREATION_WAKE_UNDELIVERED` logged | n/a | no autonomous publication; explicit START re-entry still works |
| orderly node shutdown | no phase change | n/a | local stays ADMITTED/PUBLISHED; reopen restores serving via idempotent re-grant |
| user write during retirement | existing `WRITER_SHUTDOWN` / `WRITER_NOT_READY` | yes | refused |
| event wake after retirement | `current()` false | yes | nothing enqueued |

## 4. Cached-view audit

- `replica.servingState` is an in-memory copy of the local record phase. It is
  set only from a durable write that just committed (`enableServing` after
  PUBLISHED; retirement after RETIRED) or from the record read at open. Stale
  risk: none within a process (single writer, the lifecycle); across restarts
  it is re-read from the record. It never grants by itself: metadata PUBLISHED
  came first.
- The metadata `services` row cache used by the role/leader helpers
  (`cachedServiceRow`) is a CAS hint only (existing behaviour).
- `WasmCreationReconciliation` captured `{port, creation}` is unchanged.
- `ServiceLifecycleManager._replicaStateById` is a presentation map; RUNNING is
  set only after the PUBLISHED result is confirmed.
- The endpoint row and the ACTIVE projection are routing/presentation; the
  contract says current-serving discovery uses the PUBLISHED resource identity,
  so a lagging projection cannot grant.
- No new cache, memo or timer is introduced.

## 5. Identity anchoring

Every new effect is pinned by: binding digest (`instanceDigest(B)`), the exact
resource token `{bindingDigest, slot, ordinal, operationId, bodyDigest}`, the
physical identity `{groupId, replicaId, nodeId}` from
`runtimeServiceConsensusIdentity`, and the storage identity already in the
local record. Grant and close CAS use the token; the local record compares all
identity fields; the endpoint intent and the ACTIVE projection context carry
binding and token; the wake carries binding and token. If the selection moves
mid-operation (J selected while I publishes), the grant CAS answers
STALE_BINDING and nothing local is written; if I's grant landed first, J's
grant answers PREDECESSOR_OUTSTANDING until I's CLOSED, which is the documented
non-instantaneous revocation.

## 6. Proof plan (lab-first)

New native RF3 file `test/wasm-service/wasm-creation-publication.integration.test.js`
on the existing retained-bootstrap fixture (component metadata adapter, real
native groups; the fixture gains `creationWake` wiring to
`host.manager.bootstrapConsensusCreation(host.intent)` and the endpoint/state
writers become recording sinks for this file only, keeping the old files'
throwing sinks):

- P1 autonomous publication: pre-election START on three hosts -> HELD; native
  events -> OBSERVED -> wake -> re-entered START -> PUBLISHED on every host:
  metadata slots PUBLISHED, local records PUBLISHED, creation rows COMPLETED,
  one endpoint write per replica carrying binding/token, ACTIVE projected, a
  strong user write through the leader is RECORDED and visible on followers
  (reuse `wasm-strong-write-v1-native-fixture.js` helpers).
- P2 predecessor outstanding: select J while an I slot is ADMITTED; J's
  publish returns HELD with `PREDECESSOR_OUTSTANDING`, no serving, no endpoint.
- P3 selection overtakes grant: select J before I publishes; I's grant answers
  STALE_BINDING; I stays held; nothing local written.
- P4 retirement order: `manager.stopReplica` on a PUBLISHED replica; a user
  write issued after the stop began is refused; the local RETIRED record is
  observed (by reading the replica database file) at the moment the
  intercepted `closeInstanceResource` is first called; metadata slot CLOSED;
  endpoint removed; STOPPED projected; wake fired with reason CLOSED; reopening
  the retired file is refused `CREATION_RETIRED`.
- P5 lost CLOSED reply (component `loseReplies`): stop reports
  `CLOSE_UNRESOLVED`; re-stop resolves CLOSED without a second mutation.
- P6 orderly shutdown keeps the grant: `runtime.shutdown()`; local and metadata
  PUBLISHED unchanged; reopen through the lifecycle restores serving with the
  grant answered idempotently and no second endpoint write.
- P7 stale callbacks after retirement enqueue nothing.
- P8 last CLOSED lifts TRANSITION_HELD: after I's third slot closes, J's
  bootstrap proceeds to PUBLISHED.

Component file `test/wasm-service/wasm-creation-local-record.test.js`: phase
CAS table, identity mismatch, RETIRED terminal, byte bound, durable helper used
(`commitDurably` observed raising the pragma).

Mutations, each measured once with unchanged tests: M1 skip the local PUBLISHED
write before `enableServing` (P6 reopen witness red); M2 drop the
`PREDECESSOR_OUTSTANDING` rule consumption (P2 red); M3 swap RETIRED and CLOSED
order (P4 order witness red); M4 move `closeAdmission` after the first await in
retirement (P4 write-during-stop red); M5 accept any non-failed driver status
as PUBLISHED (confirm-result witness red).

Neighbours to run: the retained 21-file selection plus the two new files, on
two lab hosts; scoped static (eslint, decision-boundaries on touched files,
literals, silent-catch, runtime grammar, complexity/cognitive strict for new
modules); `audit:shards` metadata refresh; impact contract
`service-consensus-retained-native-bootstrap` owners/tests updated.

## 7. Out of scope, recorded

Intact restart after process loss (consumes the COMPLETED creation row's
intent/admission/opening and the local PUBLISHED record), the
first-opening-claim/file gap, durable upstream selection request K in
`RuntimeServiceHandler`, artifact binding, physical multi-host metadata,
RELEASING semantics (D5), request Cells, OCI, catalog activation.
