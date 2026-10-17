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

---

# Revision 2 (2026-10-17, after design vets A and B)

Both independent vets returned REVISE (`evidence/design-vets-20261017/`). This
revision supersedes the clauses named below; every other clause of the original
note stands. Finding ids: A-* from vet A, B-* from vet B.

## Superseded clauses

- D1 "publishReplica runs only inside startReplica's bound branch after
  request()". Superseded by D1'. (A-D1-1, A-D1-2, A-D1-3, B-R1, B-R2)
- D3 "`serving` is `servingState === OPEN || SERVING`"; "`enableServing` ...
  `queueRoleUpdate(role)` and, if leader, `queueLeaderNodeUpdate`". Superseded by
  D3'. (A-B2, B-R3, A-S1-1, B-R7)
- D4 (c) "inside `retireReplica` ... write the local phase RETIRED ... when the
  replica is bound and `replica.db` is open"; D4 "`stopReplica` and `shutdownAll`
  are unchanged" as the mechanism that keeps orderly stop from tombstoning.
  Superseded by D4'. (A-B1, A-D2-3, A-B3, B-R4, B-R5)
- D5 "RELEASING is not written in this stage". Superseded by D5'. (A-D5-1)
- D6 "tolerates a throw by logging"; "`CREATION_WAKE_UNDELIVERED` on the
  lifecycle logger"; wake fired "when the continuation's result first becomes
  OBSERVED". Superseded by D6'. (A-D6-1, B-R2, B-R6)
- D7 endpoint write, ACTIVE projection and creation-row COMPLETED on PUBLISHED.
  Superseded by D7'. (A-S1-1, A-B4, A-B5, A-B6, B-R5, B-R7)
- Section 4 "`servingState` ... set ... from the record read at open" without
  the metadata condition. Superseded by D2' (R8). (B-R8)
- HANDOFF-INTERFACES clause "START/publish continues that same row and
  completes it only after the publication path completes" is superseded for this
  stage: the creation row stays IN_PROGRESS until the recovery stage defines
  COMPLETED-row re-entry (A-B6). Recorded here as the reason; the HANDOFF text is
  historical and is not rewritten.
- HANDOFF-INTERFACES clause "`publishReplica` ... returns the endpoint intent"
  and CONTRACT-R2's endpoint/services-row publication for bound replicas are
  deferred to a discovery stage with its own design (A-B4); see 7'.

## D1'. Publication is owned by the keyed continuation

The per-replica `OwnerKeyReconcileQueue` continuation (`WasmCreationReconciliation.reconcile`)
owns genesis AND publication as one decision algorithm: after
`progressWasmCreationGenesis` answers OBSERVED, the same run continues with the
grant steps (b)-(e) of D1, each await followed by the exact recheck (`current()`
plus `lifecycleState === READY`, same port, same creation, registry identity,
`!consensusClosing`). Consequences: explicit START (`request()`), wake-driven
START and native events coalesce on the key (single flight); the shutdown join
`awaitCurrentWorkIdle()` covers an in-flight grant (HANDOFF "joins the owned
outstanding start/publication work"); a failed recheck after the grant CAS
returns `{outcome: GENESIS_HELD, reason: WRITER_SHUTDOWN}` and skips the local
write and `enableServing` (metadata PUBLISHED stays counted; re-entry re-grants
idempotently). `WasmServiceLifecycle.publishReplica(serviceId, exactToken)` is
public (HANDOFF; the frozen bound-native fixture calls it): it validates the
token against the registered replica (mismatch -> CONTENT_CONFLICT, nothing
runs) and returns `request()`'s result; `startReplica`'s bound branch maps the
same result. The reconcile result vocabulary gains `PUBLISHED` (served) beside
OBSERVED/HELD/UNKNOWN; `WASM_CREATION_GENESIS` stays the owner module.

Leader-effect replay happens inside `enableServing`, synchronously, under a
per-replica latch (A-D3-1, B-N2); the latch is the local phase itself: effects
run only on the ADMITTED -> PUBLISHED transition this process performed, never
on a re-entry that finds PUBLISHED already recorded.

## D2'. Local record: identity projection, open-time serving, tombstone by path

Identity on RETAINED reopen = all seven non-phase fields `{format, groupId,
replicaId, nodeId, token, opening, storage}` checked with `exactFields` and
canonical re-encode equality (A-D2-1); `phase` and the phase-detail fields are
the only variable part. At open, `servingState` is SERVING only when the local
phase is PUBLISHED AND `resolveWasmCreationAdmission` (which already runs before
the database opens) answered metadata phase PUBLISHED for the exact token;
metadata ADMITTED with local PUBLISHED is HELD (re-grant on re-entry); metadata
CLOSED/RELEASING refuses the open as today (`RESOURCE_CLOSED`), and the stop
owner retires the file by token (D4'). (B-R8)

One tombstone function, `tombstoneWasmCreationLocal({db | dbPath}, identity,
token, reason)`, writes ADMITTED|PUBLISHED -> RETIRED through `commitDurably`,
on an open connection when the replica is live, or by opening the file at
`dataDirectoryManager.getWasmServiceDbPath(groupId, replicaId)` under this
node's data-directory process owner when no replica is live. Identity mismatch
-> CONTENT_CONFLICT; missing file -> `CREATION_STORAGE_MISSING` (no tombstone
can be written, CLOSED is still allowed: there is nothing local to retire);
RETIRED already -> `ALREADY`. (A-D2-3, A-B3)

R17 finding recorded, not absorbed: after CLOSED and a new ordinal on the same
slot, the FRESH open at the same path hits the tombstoned file
(`openWasmCreationRecords :95-96`); tombstoned-path cleanup and slot reuse need
an owner (A-D2-2).

## D3'. One serving fence, bound and unbound

`replica.serving = (servingState === OPEN || servingState === SERVING) &&
lifecycleState === READY`. The READY term is the synchronous fence that
`shutdownWasmServiceReplica` already sets at call (`:234`); from that instant
`handleMessage`, `_handleRead`, `_handleWrite`, `proposeEntry` (and through it
`TimerManager` and `administerWriter`, A-S1-4) refuse user work typed
(`WRITER_SHUTDOWN` for a bound replica after STOPPING; the existing
`SERVICE_NOT_READY` shape for unbound). This is a deliberate behaviour change
for unbound replicas too: a stopping replica must not answer reads or accept
ASYNC proposals (R04; A-B2, B-R3). `enableServing` replays only the
admission-independent leader effects: `timerManager.reconstructTimers()` and
`_startSafetyBroadcasts()` when `isLeader`. Role and leader-node services-row
publication for bound replicas stays held behind one named predicate
`publishesServicesRow` (`consensusCreation === null`), because the row it would
CAS is owned by the deferred discovery stage (A-S1-1, B-R7); the five guards
collapse into that one predicate and `serving`.

## D4'. Retirement intent, custody and order

`replica.shutdown({retirement})` captures a named intent synchronously at the
STOPPING fence: `RETIRE_RESOURCE` or `ORDERLY_STOP` (default). `stopReplica`,
`shutdownAll` and node teardown pass ORDERLY_STOP and never tombstone (A-B1).
`WasmServiceLifecycle.retireReplica(serviceId, exactToken)`:

1. Resolve the registered replica for `serviceId`. If one exists, require its
   `consensusCreation.token` to equal the given token (else CONTENT_CONFLICT);
   if none exists, continue as retire-by-token (A-B3).
2. Fence: if the replica is live, `shutdown({retirement: RETIRE_RESOURCE})`
   (STOPPING set synchronously; user admission closed by D3'). A retire that
   joins an in-flight ORDERLY_STOP settlement does not assume a tombstone: after
   the join it falls through to step 4 with the file path (A-D4-2).
3. Non-blocking RELEASING: `releaseInstanceResource(B, token)` (new owner method
   on `ServiceDefinitionsOwner`, `transitionInstanceResource(..., RELEASING)`);
   any outcome is recorded in the result as `release: {outcome}` and never
   blocks the local stop; `changeResourceState` allows CLOSED from RELEASING,
   PUBLISHED or ADMITTED (A-D5-1 / D5').
4. Tombstone: inside the shutdown path, after handler retirement and before
   `releaseWasmServiceReplicaConsensus`, when intent is RETIRE_RESOURCE and the
   connection is open; otherwise (no live replica, orderly stop joined,
   CLEANUP_REQUIRED with the database already released) by path through
   `tombstoneWasmCreationLocal`. A tombstone that cannot be written while the
   file exists (CLEANUP_REQUIRED with handles still open) is the typed refusal
   `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`; no CLOSED CAS follows (A-D2-3).
5. CLOSED: `closeInstanceResource(B, token)`; the owner resolves a lost reply
   itself (`commitState`); UNKNOWN/UNAVAILABLE -> `{retired: true, closed:
   false, close: {outcome}}` typed `CLOSE_UNRESOLVED`.
6. Wake (D6') on CLOSED or already-CLOSED; result `{retired, closed, release,
   close, wake}`.

Custody while `closed === false`: the driver keeps `_prepared`/`_lifecycles`
for the serviceId (retains the token), the runtime's bound STOP branch does not
remove the endpoint or project STOPPED, and the manager's bound STOP branch
(new, mirroring `bootstrapConsensusCreation`: no `_assertTransition` to STOPPED,
no row completion) leaves the STOP operation row IN_PROGRESS with the typed
outcome in `result`; an explicit re-stop re-enters `retireReplica` by token and
redoes only the CAS (A-B3, B-R5). Retirement custody across a process restart
(restart scan redoing the CAS from the creation row's `admission_json`) belongs
to the recovery stage and is recorded as deferred with that owner (7').

Successor fence: `createReplica` refuses a BOUND creation typed `REPLICA_LIVE`
while any replica for the serviceId is in `retiringReplicas` (today only the
current STOPPING replica is exempt); a bound successor opens only after the
predecessor instance's stop has settled (B-R4).

## D5'. RELEASING is written, non-blocking

See D4' step 3. Rationale: visibility for current-serving discovery during
release, as CONTRACT-R2 names ("a local failure retains RELEASING"), without
making the local stop depend on metadata availability.

## D6'. Wake: typed, latched, reason-vocabularied, in-process

`RECONCILE_REASON` gains `CREATION_GENESIS_OBSERVED` and
`CREATION_RESOURCE_CLOSED` (A-D6-1; also replaces the raw `RAFT_EVENT` reason
the adapter enqueues today, closing the lab acceptance's R06 nit). The wake
dependency `creationWake(serviceDefinitionId, {reason, binding, token})` is
enqueue-only; its outcome is returned in the START/retire result as `wake:
{outcome: DELIVERED | UNDELIVERED | CONSUMER_ABSENT}`, never only logged
(R11). Predicate: the continuation fires the OBSERVED wake exactly once per
replica, on the run that performs the ADMITTED -> PUBLISHED local transition
(the latch is the durable phase; a run that finds PUBLISHED already recorded
does not wake), and the run must not carry the `PROGRESS_RECONCILE` reason of
an explicit START (a waited START collects its own result; B-R2). After local
PUBLISHED the adapter retires its native event subscriptions (`unbind()`):
events have no further work (B-R2 interleaving B). The CLOSED wake fires per
retired replica; "last" is decided by the metadata owner's `outstanding()` at
J's grant, so duplicates are idempotent. Production consumer named by the
contract: `RuntimeServiceRebalancerOwner._wakeRebalancer` (desired-state
reconcile) and, for the publication re-entry, the operation owner of the
original CREATE; in this stage the fixture consumer re-runs
`bootstrapConsensusCreation`; cross-node delivery is the services/currentness
cache notification and is out of scope (B-R6).

## D7'. Upper layers: accept PUBLISHED only against authority; no projections yet

`CONSENSUS_BOOTSTRAP.PUBLISHED` is added in `service-consensus-bootstrap.js`.
`confirmConsensusBootstrapResult` accepts HELD or PUBLISHED with binding/token
equality; for PUBLISHED, `bootstrapConsensusCreation` additionally re-resolves
`resolveInstanceResource(B, token)` and requires `phase === PUBLISHED` before
treating the result as serving (A-B5); mismatch -> `{outcome: UNKNOWN, reason:
CONTENT_CONFLICT}` and the replica is retired by token. On PUBLISHED the manager
sets `_replicaStateById` RUNNING and returns the result; the creation row stays
IN_PROGRESS (A-B6). The runtime's bound START branch returns the confirmed
result; it writes no endpoint and projects no state for bound replicas (A-B4):
those rows need the identity design of the deferred discovery stage (physical
replica id as row key, logical service resolved from B, binding/token carried).
The driver's `#projectConsensusStartResult` adds the explicit PUBLISHED branch
(`{status: PUBLISHED, consensusBinding, consensusResourceToken, port}`), never
RUNNING. Runtime `stop` bound branch -> `retireConsensusBootstrap` -> driver
`stop` with the retained token -> `lifecycle.retireReplica`; the typed result
flows back unchanged; endpoint removal and STOPPED projection are not performed
for bound replicas in this stage (nothing published them).

## 3'. Edges added (A-section 3, B-table)

| Edge | Typed outcome |
| --- | --- |
| stop/replace between metadata PUBLISHED and local PUBLISHED | continuation `GENESIS_HELD/WRITER_SHUTDOWN`; local ADMITTED; metadata counted; re-entry re-grants |
| local PUBLISHED write throws after CAS | `LOCAL_GRANT_NOT_RECORDED` (one code); serving not enabled; re-entry retries the write |
| `enableServing` throws after local PUBLISHED | `SERVING_ENABLE_FAILED`; local PUBLISHED stands; re-entry replays effects |
| retire during in-flight grant | grant run rechecks fail -> HELD; retire proceeds; P9 |
| retire joining in-flight orderly stop | tombstone by path after the join |
| two retires racing | second joins the first's settlement; CLOSED idempotent; one wake |
| read / ASYNC write / timer proposal after STOPPING | refused by `serving` |
| admin ENROLL/RECYCLE while held | refused `WRITER_NOT_READY` via `proposeEntry` |
| wake consumer throws / absent | `wake.outcome` UNDELIVERED / CONSUMER_ABSENT in the result |
| database not open at tombstone, file exists | by-path tombstone; CLEANUP_REQUIRED with handles open -> `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`, no CLOSED |
| file missing at by-path tombstone | `CREATION_STORAGE_MISSING`; CLOSED allowed |
| RELEASING CAS fails/unknown | recorded `release.outcome`; retirement continues |
| J selected while I retire mid-flight | CLOSED allowed on `retiring`; J held until last CLOSED |
| forged/stale PUBLISHED driver result | manager re-resolve fails -> UNKNOWN/CONTENT_CONFLICT; retire by token |
| reopen with local PUBLISHED, metadata CLOSED | open refused `RESOURCE_CLOSED`; file retired by token on the next stop |
| reopen with local PUBLISHED, metadata ADMITTED | HELD at open; re-grant on re-entry |

## 6'. Proof plan (replaces P1-P8 / M1-M5)

New native file `test/wasm-service/wasm-creation-publication.integration.test.js`
on the retained-bootstrap fixture extended with: a `creationWake` consumer that
re-runs `bootstrapConsensusCreation` and counts invocations; a fixture-local
transport wrapper that answers `{acknowledged: true, noHandler: true}` for a
retired address (production shape; B-H1) instead of the shared loopback throw;
a gateway read fault on the SQLite fixture for the CLOSE UNKNOWN case (B-H3);
`holdNext` on the grant UPDATE for mid-CAS cases (B-H2, B-P9). The nested
journal, endpoint and state sinks keep throwing (no projection may be written
for bound replicas in this stage).

- P1 autonomous publication, `automaticReconciliation: true`, no explicit
  re-entry: three hosts HELD after pre-election START; events -> OBSERVED ->
  PUBLISHED inside the continuation; exactly one wake per replica with reason
  CREATION_GENESIS_OBSERVED; the consumer's re-run returns PUBLISHED; metadata
  three slots PUBLISHED; local records PUBLISHED; creation rows IN_PROGRESS; a
  strong write through the leader RECORDED and visible on followers; no
  endpoint/state/journal sink called; adapter subscriptions retired.
- P2 predecessor outstanding (PREDECESSOR_OUTSTANDING, held, no serving).
- P3a selection J before I's grant; P3b J selected inside I's grant CAS window
  (holdNext): STALE_BINDING both; nothing local written.
- P4 retirement: `manager.stopReplica` on PUBLISHED; after the stop began a
  READ and an ASYNC write are refused; RELEASING observed on the slot before
  the tombstone; local RETIRED observed (second connection) at the first
  intercepted `closeInstanceResource`; slot CLOSED; wake CREATION_RESOURCE_CLOSED
  with I's binding/token; reopen of the file refused `CREATION_RETIRED`.
- P5a lost CLOSED reply resolves to CLOSED inside the owner; P5b CLOSED with the
  gateway read faulted -> `CLOSE_UNRESOLVED`, STOP row IN_PROGRESS, driver
  bookkeeping retained; re-stop by token resolves CLOSED with no second
  mutation; one wake.
- P6a orderly `runtime.shutdown()` keeps local and metadata PUBLISHED; reopen
  through the lifecycle serves after the open-time metadata PUBLISHED check,
  re-entry re-grants idempotently (no metadata mutation), one wake total; P6b
  reopen after the slot was CLOSED is refused `RESOURCE_CLOSED` and the next
  retire by token tombstones the file.
- P7 stale callbacks after retirement enqueue nothing.
- P8 last CLOSED lifts TRANSITION_HELD: after I's third slot closes J's
  bootstrap proceeds to PUBLISHED with no explicit call after the third CLOSED
  wake.
- P9 retire during in-flight grant (holdNext on the grant UPDATE): no serving
  enabled, no leaked safety-broadcast interval, local RETIRED, slot CLOSED,
  continuation result HELD.
- P10 successor fence: START re-entry while retire in flight -> typed
  REPLICA_LIVE / REPLICA_RETIRED, no second instance on the file.
- P11 forged PUBLISHED from a stub driver -> manager UNKNOWN/CONTENT_CONFLICT,
  no RUNNING state.
- P12 order witness: intercept the first admitted user message and assert the
  local phase is already PUBLISHED (A-S6-1).

Frozen C1 file `wasm-creation-bound-native.test.js` and its fixture
(`wasm-creation-bound-native-fixture.js:305-347` `publishReplica`, `retire()`)
are adopted as neighbours: `retire()` is superseded to call `retireReplica` by
token (recorded supersession; A-S1-2) and the file must run green in the lane
selection.

Component file `wasm-creation-local-record.test.js`: phase CAS table (including
by-path tombstone, missing file, identity mismatch via `exactFields`, RETIRED
terminal, byte bound, `commitDurably` observed).

Mutations: M1 skip local PUBLISHED before `enableServing` (P12 red); M2 drop
PREDECESSOR_OUTSTANDING consumption (P2 red); M3 swap tombstone and CLOSED
(P4 red); M4 remove the READY term from `serving` (P4 read/async red); M5
accept RUNNING as PUBLISHED (existing witness red); M6 disconnect OBSERVED ->
wake (P1 red); M7 remove the wake latch (P1 wake count red); M8 remove the
post-grant recheck (P9 red); M9 remove the manager's re-resolve (P11 red).

Neighbours: retained 21 files + the frozen C1 file + the new files on two lab
hosts; scoped static as before; `audit:shards` refresh; impact contract
`service-consensus-retained-native-bootstrap` extended.

## 7'. Deferred with named owners (R17)

- Discovery stage: endpoint and services-row publication for bound replicas
  with one identity per row (A-S1-1/B4); role/leader publication (B-R7); the
  production wake path across nodes (B-R6).
- Recovery stage: COMPLETED-row re-entry under current permission (A-B6);
  restart-scan retirement custody redoing the CLOSED CAS from `admission_json`
  (A-B3 restart half); intact restart with metadata unavailable (contract B1 vs
  `openReplica`'s mandatory metadata read, B-§4).
- Timer owner: `TimerManager.reconstructTimers` idempotence (B-N2).
- Tombstoned-path cleanup and slot reuse (A-D2-2).

---

# Revision 3 (2026-10-17, after the re-vet of Revision 2)

The re-vet (`evidence/design-vets-20261017/design-revet-R2-20261017.md`) found
every mechanism refutation of vets A and B closed or legitimately deferred, and
four new defects introduced by Revision 2 (N1-N4) plus required items N5-N16.
This revision supersedes the Revision 2 clauses named below; everything else in
Revision 2 stands.

## Superseded clauses of Revision 2

- 6' "retained 21 files ... must run green" as if unchanged (N1).
- D1'/D6' "the latch is the durable phase" (N2).
- D4' step 3 as written against today's `changeResourceState` (N3).
- D4' "driver keeps `_prepared`/`_lifecycles` for the serviceId (retains the
  token)" and D4' step 1 "if none exists, continue as retire-by-token" keyed by
  serviceId/token; `retireReplica(serviceId, exactToken)` as the only entry (N4).
- D6' "wakes only on the local transition" as the sole wake (N7).
- D2'/D6' silence on binding native events for a replica that opens SERVING (N16).

## N1. Retained witnesses that Revision 2 flips, and their supersession

With D1' the continuation grants as soon as genesis is observed and the metadata
owner admits it. The lab-accepted witnesses that asserted the intermediate
"OBSERVED but HELD" state therefore observe the stage's intended end state and
are superseded, by appending (R21), never by a fixture seam that withholds the
grant (R11):

- `test/wasm-service/wasm-creation-genesis.integration.test.js`: assertions at
  `:58-59, :85, :90, :105, :113, :179, :198, :217, :313` and `assertHeld :39-46`
  become: where INIT is recorded and the committed founding membership covers
  it, the START/re-entry result is `PUBLISHED`, the slot phase is PUBLISHED,
  `heldCreationRefusal()` is null (serving), and no endpoint/state/journal sink
  is called. Cases whose fault schedule keeps INIT unrecorded or the membership
  read refused stay HELD with their existing reasons.
- `test/wasm-service/wasm-creation-reconciliation.integration.test.js`: the
  automatic positive (`:45-66`) and `assertNoServing :35-41` become: after the
  wake-driven re-entry the replica serves (refusal null), slots PUBLISHED,
  `host.publications` still `[]`; the shutdown case keeps "no late PUBLISHED".
- The new behaviour is recorded in the quest log at implementation as a finding
  (`decision`) naming these lines; the lab acceptance record of `35d533b6b` is
  not rewritten.

## N2. Latch and wake predicate are process-local

The single-fire latch is the per-instance in-memory edge `servingState: HELD ->
SERVING` on THIS replica object, set by the run that performs it (grant +
local PUBLISHED + `enableServing`) or by the open-time check (D2'). Re-entry
replays the leader effects iff `servingState !== SERVING` at that moment, so a
failed `enableServing` (`SERVING_ENABLE_FAILED`, local already PUBLISHED) and a
HELD-at-open replica whose re-grant lands both get their effects exactly once.
The durable phase is only the restart latch: a restarted process re-enters
through its own START and collects its own result. Wake predicate
(`CREATION_GENESIS_OBSERVED`): this run flipped `servingState` to SERVING AND
the run's reasons carry no `PROGRESS_RECONCILE` (no waited START); a waited
START collects its result and fires no wake. `reconcileFn` therefore consumes
its `reasons` argument (N13); a re-entrant `request()` while the key is in
flight is deferred and merged, and the queue's `STALE_CLAIM_IN_FLIGHT`
diagnostic is expected, not asserted absent.

## N3. RELEASING is a guarded transition; slots are monotonic after CLOSED

`changeResourceState` gains an explicit allowed-from table (R07):
PUBLISHED from ADMITTED only (existing conditions); RELEASING from ADMITTED or
PUBLISHED; CLOSED from ADMITTED, PUBLISHED or RELEASING; any target on a CLOSED
slot answers `{outcome: CLOSED, phase: CLOSED, token}` without mutation; the
same phase answers idempotently as today. A re-stop that finds the slot CLOSED
skips the RELEASING step and proceeds to the wake. Owner component witness:
`test/control-plane/service-instance-creation-cas.test.js` gains the table.

## N4. Retirement custody is keyed by the creation identity, never by serviceId

`WasmServiceLifecycle.retireReplica(creation)` takes the retained creation
descriptor (intent `consensusBinding` + `consensusSlotRequest` + `token`, the
same `owned.consensusCreation` object the manager passes to create/start), from
which `runtimeServiceConsensusIdentity` derives `{groupId, replicaId, nodeId}`
and `getWasmServiceDbPath` the file path. Step 1 matches a registered replica
by `instanceDigest(consensusCreation)`; a different live replica under the same
serviceId (a successor J) is not a conflict: the retire falls to the by-path
branch for I's file while J stays untouched. Durable custody is the caller's
retained creation (the creation row's `intent_json`/`admission_json`); the
driver's `stop(replicaContext)` reads `replicaContext.consensusCreation`
exactly as `start` does and never consults `_prepared` for a bound stop; no
driver bookkeeping retention is needed. The manager's bound STOP branch takes
the handle's `consensusCreation`, calls the adapter, returns the typed result,
and performs no `_assertTransition`/row transition when `closed === false`
(the STOP row stays IN_PROGRESS; no new SQL: nothing is written, N14).

## N5-N16, resolved

- N5 Unit witnesses driving user paths on CREATED unbound replicas
  (`test/wasm-service/wasm-service-replica.test.js:273, :291, :306, :389, :405,
  :427-430, :439, :462, :480`) are a fixture gap: the unit helper sets
  `lifecycleState = READY` (as `wasm-writer-completion-v1.test.js:53` does);
  assertions unchanged. `:683` must additionally assert the refusal shape so it
  cannot pass vacuously.
- N6 `publishReplica(serviceId, exactToken)` returns the mapped start shape
  (identical to `startReplica`'s bound branch). The frozen C1 fixture
  `wasm-creation-bound-native-fixture.js:305-347` is superseded, recorded: INIT
  is no longer issued manually (nonce mismatch at `:308`; the continuation
  authors it), ENROLL runs after publish, `retire()` calls `retireReplica` with
  the creation. The C1 discriminator (old INIT refuses, valid J path completes)
  is kept and the file joins the lane selection.
- N7 A run that reaches OBSERVED but cannot grant (UNAVAILABLE, UNKNOWN,
  STALE/PREDECESSOR/CLOSED holds, `LOCAL_GRANT_NOT_RECORDED`) fires one wake
  with reason `CREATION_GRANT_HELD` carrying the typed grant outcome, exactly
  once per run. The consumer owns the re-drive cadence: in production the
  desired-state reconcile (`RUNTIME_SERVICE_DESIRED_STATE`); in this stage's
  fixture the consumer records the wake and re-enters only when the test says.
  No lifecycle-side retry.
- N8 `RETIREMENT_BLOCKED_CLEANUP_REQUIRED` is decided on `replica.db?.open ===
  true` for a replica in CLEANUP_REQUIRED after one re-entered `shutdown()`
  (allowed by the lifecycle); if that re-entry releases the handles the retire
  proceeds by path, else the typed refusal and no CLOSED. In-process a second
  better-sqlite3 connection to the WAL file cannot corrupt; the data-directory
  process owner is per directory and already held by this node.
- N9 Manager acceptance of PUBLISHED requires `started === true`, binding and
  token equality AND the re-resolved metadata phase PUBLISHED; RUNNING is
  presentation only.
- N10 The continuation is total: the grant steps are wrapped like
  `progressWasmCreationGenesis` and every failure maps to a typed outcome in 3';
  `reconcileFn` never throws, so `request()` never rejects and `startReplica`'s
  bound branch needs no new catch.
- N11 P4 drives a READ and an ASYNC proposal in the same synchronous turn as the
  stop begins, via `replica.handleMessage` and `replica.proposeEntry` (the
  retained origin is strong; the ASYNC proposal goes through `proposeEntry`
  directly), so the refusal is the `serving` fence, not the retired handler.
- N12 P12 also asserts that a user message WAS admitted and served after
  publication (no vacuous pass).
- N13 see N2.
- N14 Vocabulary owners: `WASM_SERVICE_LIFECYCLE_REFUSAL`
  (`wasm-service-constants.js`) gains `LOCAL_GRANT_NOT_RECORDED`,
  `SERVING_ENABLE_FAILED`, `CREATION_RETIRED`,
  `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`; `WASM_CREATION_RETIREMENT` (outcomes
  `RETIRED`, `CLOSE_UNRESOLVED`, `ALREADY`, `CREATION_STORAGE_MISSING`) lives in
  `wasm-creation-opening.js` beside the local phase machine;
  `CONSENSUS_BOOTSTRAP.PUBLISHED` and `CREATION_WAKE_OUTCOME` in
  `service-consensus-bootstrap.js`; `RECONCILE_REASON.CREATION_GENESIS_OBSERVED`,
  `CREATION_GRANT_HELD`, `CREATION_RESOURCE_CLOSED` in
  `reconcile-queue-constants.js`. D8 consumer sites adjusted for the named
  no-failure state: `wasm-service-replica-lifecycle.js:143, :175, :197, :202`
  and `withRaftOpeningCleanupFailure` callers.
- N15 Recorded supersession of CONTRACT-R2's order ("closes native port and
  local handles, then durably marks RETIRED"): the tombstone is written on the
  open connection before the handles close because the record lives in that
  database; the intent (RETIRED durable before CLOSED acknowledged) is kept.
- N16 A replica that opens SERVING (D2') does not `bind()` native events;
  `current()` is false once `servingState === SERVING`, so no genesis read or
  grant CAS runs per committed user write.

## 6''. Proof plan additions (beyond 6')

- P13 grant UNAVAILABLE (gateway read fault during the grant): one
  `CREATION_GRANT_HELD` wake with outcome UNAVAILABLE, replica HELD, no retry
  by the lifecycle; after the fault clears an explicit re-entry publishes.
- P14 LEADER -> FOLLOWER -> LEADER across a held grant (`holdNext` on the grant
  UPDATE while the fixture drives an election change): effects replayed once;
  timers and safety broadcasts exist on the final leader only.
- P15 grant lost reply (`loseReply` on the grant UPDATE): owner resolves to
  PUBLISHED; one local write; one wake.
- P16 local RETIRED write fails (fault on the replica connection): shutdown
  reports cleanup failure, CLOSED not attempted, `RETIREMENT_BLOCKED_CLEANUP_REQUIRED`
  on the next retire while handles are open.
- P17 explicit START that reaches OBSERVED publishes and fires no wake.
- P18 absent wake consumer: result `wake.outcome === CONSUMER_ABSENT`.
- P1 additionally asserts, on the leader after publication,
  `_safetyBroadcastTimer !== null` and `timerManager.activeTimers` reconstructed,
  and on every host that the adapter's subscriptions are retired and a later
  committed write triggers no genesis read.
- Component CAS table (N3) and the by-path tombstone cases in the local-record
  file.
- M7 is retargeted to the waiter term of the wake predicate (P17 red); M10
  removes the RELEASING allowed-from guard (CAS table red); M11 keys the
  retire match by serviceId instead of creation digest (P10/P5b successor
  variant red).

Still uncovered and recorded: cell 29 (committed user writes applied between
the tombstone and `port.close` are benign: the local record is not touched by
apply); cross-node wake delivery (7').

## Revision 3 amendment A1 (recorded after independent verification, 2026-10-17)

Appended by the lead (R09/R21: the earlier text stands as written; this
clause supersedes one sentence of it). Independent verification of the
stage-1 implementation (verifier verdict APPROVE, finding F-A1;
`evidence/serving-publication-20261017/verifier/verifier-verdict-stage1.md`)
found a tension inside D4'/D5': D4' step 3 and D5' say the metadata RELEASING
attempt "never blocks the local stop", while 6' P4 demands RELEASING observed
on the slot before the local RETIRED tombstone, which only a wait can satisfy.
The implementation resolves it as follows, and this is now the design:

- The RELEASING attempt is never a precondition of the fence. The STOPPING
  transition, the synchronous close of user admission, the activity stop and
  the exact-handler retirement happen at `shutdown()` call, before any await
  (`wasm-service-replica-lifecycle.js shutdownWasmServiceReplica`).
- The in-path tombstone (N15) waits for the RELEASING attempt to settle with
  any answer (RELEASING, CLOSED, STALE_BINDING, UNKNOWN, UNAVAILABLE), so the
  handle release (tombstone, port close, database close) and the shutdown
  settlement depend on the attempt terminating, bounded by the metadata
  owner's own routed-mutation budget. It never depends on the attempt
  succeeding (`wasm-creation-retirement.js retireLocally`, `tombstoneRetiringReplica`).
- Superseded sentence: D4' step 3 "never blocks the local stop" and D5''s
  "non-blocking" now read "never a precondition of the fence; the handle
  release waits for the attempt to settle, whatever it answered". P4's order
  (RELEASING before RETIRED before CLOSED) stands and is witnessed
  (`TOMBSTONE_PRECEDED_RELEASING`, `CLOSED_REQUESTED_BEFORE_LOCAL_RETIRED`;
  mutation V10).

Non-blocking findings of the same verification, recorded for the next stages
(owners in 7'): F-W1 an event run's `CONSUMER_ABSENT` wake outcome is typed
in the run result but logged only at debug while production wires no
consumer (discovery stage owns the consumer; raise the log level or record it
in queue diagnostics there); F-M1 the designed property "a HELD replica keeps
its native subscriptions until the local grant lands" has no witness (add one
assertion in P13 or P2); F-W2 `assertOneOwnerWake` and REC `reentries === 1`
over-constrain a legal two-wake interleaving (GRANT_HELD then OBSERVED from a
native event that runs before the consumer's re-entry): relax to "at most one
OBSERVED, every wake OBSERVED or GRANT_HELD(STATE_CHANGED)"; typed edges
`LOCAL_GRANT_NOT_RECORDED` and `SERVING_ENABLE_FAILED` and cells 21/22 of
the coverage model are traced but unwitnessed; F-A2 `resolveGrant` issues a
second authoritative read on UNKNOWN after the owner's own (harmless);
F-R1 the by-path tombstone identity carries five fields (adds `storage` when
the recovery stage defines restart-scan retirement).
