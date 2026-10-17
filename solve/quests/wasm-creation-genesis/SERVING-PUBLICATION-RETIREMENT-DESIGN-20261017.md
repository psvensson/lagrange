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
