# Design re-vet: ACTIVATION-DISCOVERY-DESIGN-20261017.md, Revision 2 (stage 1c, embedding scope)

Subject: section "Revision 2" (RV2.1-RV2.6) of
`solve/quests/wasm-creation-genesis/ACTIVATION-DISCOVERY-DESIGN-20261017.md` at
`e3e70fb3b` in `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
(the lead's docs commit; `git diff --stat 7e184b8aa..HEAD -- src test` is empty, so every
`file:line` the revision cites from `7e184b8aa` is the current tree). Read-only: nothing
touched, nothing run.

Read in full: the brief, the whole design note (draft, Revision 1, Revision 2), both prior
vet reports, CONTRACT-R2.md, HANDOFF-INTERFACES.md, and every source and fixture file the
brief lists, plus the collaborators the RV2 clauses reach: `service-instance-state.js`,
`service-instance-contract.js`, `wasm-creation-retirement.js`, `wasm-creation-wake.js`,
`wasm-creation-reconciliation.js`, `runtime-service-adapter.js`,
`wasm-service-metadata-mutation-helpers.js`, `runtime-service-replica-identity.js`,
`control-plane-runtime-bundle.js`, `node-address-resolution.js:352-373`,
`meta-service-definition-registration.js:40-215`, `entrypoint-runtime-options.js:112-136`,
`bootstrap-service.js:190-340`, `node-joining-owner-construction.js:80-225`,
`operation-workflow-executor-outcome-reconcile-methods.js:25-60, 200-275, 655-720, 785-830`,
`operation-workflow-dispatch-rearm-evidence.js` (`shouldDeferRetryableDispatchFailure`,
`isDispatchRetryableWorkflowStep`, `deferDispatchRetry`),
`system-partition-classification.js:209-226`, `control-plane-system-table-gateway-mutation-submission.js:161-205`,
`service-instance-creation-sqlite-fixture.js:80-140`, `wasm-creation-bound-native-fixture.js:1-12`,
`test/rebalancer/replica-status-completeness.property.test.js:40-80`,
`test/node/replica-state-delegation.test.js:15-70`, the quest `log.ndjson` tail.

## Verdict: REVISE (blocking: RB4 remains open as resolved; required: RB2 carrier, RR1/RR3 completeness, six new-surface items; recorded: N1-N8)

What Revision 2 gets right and this re-vet confirms on the tree: the REMOVE route now
recovers through a journal-only read and retires through `manager.stopReplica(handle)`
(the existing bound branch `service-lifecycle-operations.js:423-429` ->
`retireConsensusCreation` `service-consensus-bootstrap.js:85-103`, exactly the fixture's
shape `wasm-retained-bootstrap-fixture.js:211-221`); the CREATE route's recover-first /
classify-on-miss order removes the native_js regression; the remover is binding-first; the
PRESENT hop is named; option (a) for projection order matches the manager's actual control
flow (`bootstrapConsensusCreation :139-144`); the HELD outcomes' "carries" claims are
withdrawn and the same-step no-op is real (`updateStep :382-386`; reconcile `:677-690`);
`ReplicaStatus.HELD` goes into the exclusion set; the wake consumer is enqueue-only; the C6
prerequisites are the ones the handler and the replica actually require
(`runtime-service-handler.js:175-189`; `wasm-service-replica.js:144-145, 712-716`).

What it still gets wrong: the RB4 "owner" value is not a host. `nodeAddress` on both
dependency-owner hosts is the entrypoint's `nodeHttpAddress`, by default
`` `${LOCALHOST}:${restApiPort}` `` or the operator's `NODE_ADDRESS` (`host:port` or a URL),
while `service_endpoints.address` is a bare host paired with `port`. The existing owner that
derives the endpoint host from exactly these two node fields (`advertisedNodeWsAddress`,
`nodeAddress`) is not named. Everything else is precision: the "deferRetry" the revision
relies on in three places has no coordinator-side deferral channel for runtime-service
operations, two result-shape tables are under-enumerated, the PRESENT mark is keyed by S
against the module's own token-keying rule, and one shared-enum witness must be superseded.

---

## 1. Blocking findings of Revision 1 (RB1-RB5), each judged

### RB1 REMOVE route: RESOLVED (two required precisions, non-blocking: F3, F4)
- Journal-only read: `readJournal` (`service-consensus-creation-intent.js:65-70`) +
  `captureIntent` (`:40-57`) + `retainedToken` (`:103-119`) compose without
  `requireDependencies`' owner methods: `readJournal` needs only `_idempotencyReader`.
  `retainedToken` answers `null` for a PENDING row with no admission (`:105-108`) and
  CORRUPT_STATE for any admission on a non-IN_PROGRESS row (`:112-114`), so the TERMINAL
  check (`TERMINAL.has(row.state)`, as `continueIntent :166` does) must run before
  `retainedToken`, or a COMPLETED/FAILED row with an admission answers CORRUPT_STATE instead
  of TERMINAL_OPERATION (N2, record).
- Handle and stop: `{definition: consensusBootstrapDescriptor(retained), consensusCreation:
  retained, consensusOpeningOwner: manager}` passes `captureConsensusBootstrap`
  (`service-consensus-bootstrap.js:33-48`: requires `outcome === ADMISSION_RETAINED`,
  token match, `operationId === token.operationId`, digest equality of definition and
  descriptor), then `stopReplica` -> `isBoundConsensusDescriptor` -> `retireConsensusCreation`
  -> adapter -> runtime `stop` -> `retireConsensusBootstrap` -> `driver.stop` ->
  `retireBoundReplica` -> `retireWasmCreation`. Verified end to end.
- CLOSED slot still retires locally: `changeResourceState` for RELEASING on a CLOSED slot
  answers `{outcome: CLOSED}` without mutation (`service-instance-state.js:277 -> :295`),
  and for CLOSED on CLOSED answers SAME -> `{outcome: CLOSED}` (`:276, :293`), so
  `closeRetired` sees `close.outcome === CLOSED` -> `closed: true`
  (`wasm-creation-retirement.js:128-137`). Holds.
- `recoverConsensusCreation` never used for REMOVE: correct; it reserves on a PENDING row
  (`:168-172`), enforces CREATE policy (`:211-212`) and refuses RELEASING (`:159`).
- Row lookup: `find(table, predicate)` exists (`system-table-cache-observation-methods.js:401-408`).
  Wording nit: RV2.1 reads as if `find` replaces the `get` by `service_id`; Revision 1 said
  "as well as". Unbound rows have no `replica_id` (`service-runtime-state-projection-handoff.js:20-27`
  projects none), so the `get` must stay first and `find` is the miss path (N3).

### RB2 CREATE route: PARTIAL (required F1, non-blocking)
- The native_js / Cell / meta regression is resolved by the order: `recoverConsensusCreation`
  on a production-shaped manager answers UNAVAILABLE for every id (`requireDependencies :58-64`;
  `startup-service-lifecycle-owner.js:27-31` wires no journal), step (3) classifies the row,
  and only `runtime_kind === wasm_component AND NOT isRequestCellDefinition AND service_id
  not in META_SERVICE_ID` leaves the generic path. `isRequestCellDefinition` reads the
  `binding_*` columns (`request-cell-runtime-contract.js:220-224`); `sys-wasm-meta` is the only
  `wasm_component` built-in (`meta-service-factory.js:64, 88, 115`). Sound.
- WRONG at the consumer: "UNAVAILABLE -> typed deferral (`deferRetry: true`), never FAILED"
  (RV2.2 step 3, RV2.1 UNAVAILABLE, RV2.2 UNKNOWN). The coordinator honours an executor
  `deferRetry` only through `EXECUTOR_FAILURE_RECONCILE_STATE_TABLE`
  (`operation-workflow-executor-outcome-reconcile-methods.js:36-48`), whose DEFER_RETRY row
  requires `evidence.criticalSystemPartition === true` =
  `classifySystemPartition({partitionId: operation.partitionId}).systemTable`
  (`:222-230`; `system-partition-classification.js:224`). A runtime-service operation's
  `partitionId` is the service entity id, not a system table, so the state is
  FAIL_OPERATION and the operation is FAILED. The synchronous response channel is gated the
  same way: `shouldDeferRetryableDispatchFailure` returns
  `classifySystemPartition({partitionId}).systemTable`
  (`operation-workflow-dispatch-rearm-evidence.js:394-401`, `deferDispatchRetry :394-430`).
  There is no deferral channel for runtime-service operations today; `deferRetry` is read
  only off a FAIL-action outcome (`buildExecutorFailureOutcomeErrorLike :215-217`).
- Scenario -> wrong output: production node after 1c lands (no journal), an installed
  `wasm_component` package definition with `replica_count 3`: CREATE -> handler emits the
  "deferral" -> coordinator FAIL_OPERATION -> FAILED -> failed-create cleanup REMOVE ->
  retry churn. That equals today's outcome (REPLICA_SET_REQUIRED -> FAILED), so no
  regression, but RV2.2's sentence is false at the coordinator and RV2.5's "RB2 resolved
  inside 1c" holds only for the native_js half. In the activation quest's future, a bound
  CREATE whose slot is ADMITTED and whose bootstrap answered UNKNOWN (owner unreachable) is
  FAILED and its cleanup REMOVE retires the slot: the B9-class problem.
- Required (F1): (i) name the carrier: a deferral is `RUNTIME_SERVICE_CREATE_FAILED` /
  `RUNTIME_SERVICE_REMOVE_FAILED` with `errorCode` and `deferRetry: true` (the only fields
  `buildExecutorOutcome` keeps, `executor-outcome-emitter.js:59-76`); no new outcome type
  (an unmapped type is `OUTCOME_UNKNOWN_ACTION` and does nothing, reconcile `:667-675`);
  (ii) state the memo after a deferral: `localReplicas` FAILED (re-enterable: `handleCreateReplica
  :271-305` proceeds for any status other than ACTIVE/CREATING), never CREATING (a CREATING
  memo with no in-flight operation answers IN_PROGRESS forever); (iii) replace "never FAILED"
  with "typed at the handler; the coordinator FAILs runtime-service deferrals today
  (`:36-48`, `dispatch-rearm-evidence.js:394-401`); honouring them is the activation quest's,
  folded into B9 (held/deferred bound CREATE budget)"; (iv) RV2.6 cell (a) asserts the emitted
  payload, not a coordinator deferral.

### RB3 endpoint remover: RESOLVED (hop naming, N4)
- Binding-first for the remover with the physical id and no logical resolution is the right
  fix; `mutateEndpointAtIncarnation :195-219` unchanged. The remover's signature today is
  `(replicaId, _runtimeNodeId, mutationContext)` (`runtime-endpoint-publication-wiring.js:137-141`)
  and `_removeEndpoint(serviceId, definition)` passes only `(serviceId, nodeId)`
  (`service-runtime-lifecycle.js:519-526`). RV2.3 says "calls the remover with the physical
  id and the binding" but names no argument; name it (third argument `{consensusBinding}` or
  the bound descriptor) so the writer and remover share one resolution (R02).

### RB4 address owner: PARTIAL, BLOCKING (F2)
- Owner: right in kind. Both dependency-owner hosts carry it: `bootstrap-service.js:199`
  `this.nodeAddress = options.nodeAddress || null` and
  `node-joining-owner-construction.js:83`. Value: wrong in shape. It is the entrypoint's
  `nodeHttpAddress` (`lagrange-runtime-startup.js:409, 424, 582` seed; `:115-338` joiner;
  `entrypoint-runtime-options.js:124-126`:
  `config.get(CONFIG_KEY.NODE_ADDRESS) || `${LOCALHOST}:${restApiPort}``), i.e. `host:port`
  by default, or a URL/`host:port` from the operator. `NodeService.nodeAddress`
  (`node-service.js:149`) is irrelevant here (and a UUID when unsupplied:
  `address-manager.js:106-115`) because `createWasmServiceNodeDependencies(this)` is called
  with the BootstrapService / joining service (`bootstrap-service.js:291`,
  `node-joining-owner-construction.js:216`), not the NodeService. `nodes.node_address` is
  that same `host:port` string (`node-registration-owner.js:89`), joined by the CLI for
  display (`remote-cache-service-rows.js:58-66, 250`).
- `service_endpoints.address` is a HOST: `buildRuntimeEndpointRow` sets `ADDRESS = host`
  next to `PORT` (`runtime-endpoint-writer.js:42-60`); `endpoint-sync-source-query.js:174-211`
  reads `address` + `port` as a pair (its witness uses `'10.0.0.2'`, `:23`);
  `service-discovery-catalog.js:180-181` republishes `{address, port}`; pgwire writes
  `host: config.host` (`pgwire-runtime-module.js:423-424`); the built-in meta endpoints write
  a derived hostname. The existing owner that turns the node's two address fields into that
  host is `resolveEndpointAddress({nodeAddress, advertisedNodeWsAddress, nodeId})`
  (`meta-service-definition-registration.js:140-192`: advertised WS host first via
  `resolveAdvertisedEndpointHost`, `node-address-resolution.js:352-373`; else URL hostname;
  else `[v6]`; else strip the trailing `:port`), the same owner that writes the built-ins'
  `service_endpoints.address`.
- Scenario -> wrong output: `NODE_ADDRESS=10.0.0.5:8080`, founder port 9100: endpoint row
  `address = '10.0.0.5:8080', port = 9100`, services row `address = '10.0.0.5:8080'`; the
  catalog publishes a target no client can compose (`10.0.0.5:8080:9100`). RV2.6 cell (e)
  "`address` equals the node owner's value" passes on exactly that wrong row: the witness is
  vacuous as worded.
- Required (F2): `createWasmServiceNodeDependencies` exposes `endpointHost` (lazy) =
  `resolveEndpointAddress({nodeAddress: node.nodeAddress, advertisedNodeWsAddress:
  node.advertisedNodeWsAddress, nodeId: node.nodeId})` (both fields exist on both hosts:
  `bootstrap-service.js:199-200`, `node-joining-owner-construction.js:83-84`); the lifecycle
  reads `this.dependencies.endpointHost`; the embedding supplies the two node fields (or
  `endpointHost` built by the same owner) per host; cell (e) asserts the DERIVED host for a
  configured `host:port` NODE_ADDRESS (and the advertised-WS precedence). Mutation added:
  "raw `nodeAddress` written as host". Keep "never `'localhost'` or a context literal".

### RB5 C6 embedding: RESOLVED (R16 note F7 on the singleton replacement)
- Handler prerequisites match `initialize :175-189`; the replica's cache + CDC match
  `wasm-service-replica.js:144-146, 174-180, 712-716`; the gateway bundle takes
  `cdcIntegrationService.sqlQueryEngine` (`control-plane-runtime-bundle.js:36-39`), the shape
  the SQLite fixture already drives (`service-instance-creation-sqlite-fixture.js:108-121`);
  `isSystemTableWriteReady(cache, SERVICES)` needs a `services-p1` partition record and a
  canonical leader services row (`leader-readiness-gate.js:232-252`): a labelled seam under
  the fixture rule (`wasm-creation-bound-native-fixture.js:1-4`) as the prior vet proposed.
  "No `roleUpdateWriter`/`leaderNodeUpdateWriter`" is the right sentence
  (`wasm-service-replica.js:635-639` bypasses the predicate). The request literal is at
  `operation-workflow-dispatch-response-reconcile.js:636-646`; extracting it or authoring
  from `ReplicaOperationField` keys are both acceptable and said.

---

## 2. Required findings of Revision 1 (RR1-RR11), each judged

| Id | RV2 resolution | Judgement |
|---|---|---|
| RR1 | TERMINAL_OPERATION/RESOURCE_CLOSED -> FAILED; CONTENT_CONFLICT/CORRUPT_STATE -> FAILED+code; UNKNOWN -> deferRetry; one `resumeConsensusCreation` | PARTIAL: the recover-phase shapes are mapped; the bootstrap-phase shapes after ADMISSION_RETAINED are not (F5); "deferRetry" see F1 |
| RR2 | "carries" withdrawn; same-step no-op stated | RESOLVED; add: the HELD outcomes name the operation's CURRENT step (CREATING / STOPPING), else `isExecutorOutcomeStepBehindOperation` false -> `updateStep` to a different step is a real transition (reconcile `:677-684`) (N5) |
| RR3 | HELD into `PEER_ROW_EXCLUDED_STATUSES`; never projected | PARTIAL: `test/rebalancer/replica-status-completeness.property.test.js:63-67` pins `getAllStatusValues().length === 7` and `REQUIRED_STATUS_VALUES :42-50`; supersede by appending (F6). `terminal-status-sql-clause-consistency` and `replica-state-delegation` tolerate a new non-terminal member |
| RR4 | no `cleanup_token`; stable token meaning (schema `:246-249` confirmed); PRESENT hop named; R17 recorded | RESOLVED in substance; the hop must be keyed by token, not S (F8) |
| RR5 | option (a); CONTRADICTED retires through the bound STOP; PUBLISHED_UNPROJECTED returns before re-resolve, STARTING kept | RESOLVED: matches `bootstrapConsensusCreation :139-144` and `confirmPublishedAuthority :120-122`; `confirmConsensusBootstrapResult` must admit PUBLISHED_UNPROJECTED into `CONFIRMED_STATUSES` (`:52`) as Revision 1 said. Wording: "withdraws them" holds for the endpoint (removed before the stop) and for the services row only on `closed === true` |
| RR6 | (a) `stopReplica(handle)`; (b) `find` + guard; (c) clause dropped; (d) memo REMOVING; (e) CLOSED slot retires | RESOLVED; (b) wording N3; (c) consequence to record N6; (e) one more close outcome, F4 |
| RR7 | enqueue-only via setImmediate; scan over `localReplicas`; `NO_LOCAL_OPERATION` in handler constants | RESOLVED (delivery is synchronous inside the run: `wasm-creation-reconciliation.js:88-104`, `wasm-creation-wake.js:27-34`); add the concurrent re-entry guard (F9) |
| RR8 | class = wasm_component AND NOT Cell AND NOT META_SERVICE_ID; "routing keys on the journal; refusal class on the row" | RESOLVED (verified above) |
| RR9 | cells (a)-(i), five mutations | RESOLVED; (a) and (e) reworded per F1/F2 |
| RR10 | D0 supersession appended once decision (c) is ruled; implementation gated | RESOLVED as a gate (the log's line 21 is still the D0 entry; no supersession entry exists yet, consistent with the gate) |
| RR11 | writer returns `{success:false, outcome}` for three outcomes; absent writer typed; cache-lag note; driver S-keyed maps | RESOLVED; a fourth non-completed outcome exists: `REFUSED_INCARNATION_REQUIRED` (`endpoint-incarnation-authority.js:41, 298-301`): map it with the three (N7) |

---

## 3. New surfaces of Revision 2, attacked

### F3 (required) REMOVE on a PENDING row: "no slot" is not guaranteed
- RV2.1: "`NOT_ADMITTED` -> no slot and no physical effect: REMOVE_COMPLETED". No physical
  effect is true (`bootstrapConsensusCreation` reaches no adapter call before a retained
  token). No slot is not: a reservation can APPLY at the owner while its reply is lost
  (`reserveAndRetain :126-134` catches to UNKNOWN; the fixture has `loseReservation`,
  `service-consensus-creation-fixture.js:41-45, 77-79`), leaving the row PENDING with the
  slot ADMITTED. The journal-only read cannot tell (it must not reserve, CONTRACT-R2 :109-110).
- Required: keep REMOVE_COMPLETED (the handler cannot resolve an ordinal) but state the
  premise honestly and record the edge with its owner: "a PENDING row may hide an applied
  reservation; the recovery stage's restart scan (`recoverConsensusCreationRow :222-226`)
  re-reserves idempotently (`reserveResourceState :218-224`) and the outstanding slot is
  then retired by the planner's RELEASING row".

### F4 (required) REMOVE result shapes: enumerate; one `closed:false` is terminal
- `retireWasmCreation` answers (`wasm-creation-retirement.js:145-159`): `{outcome: CLOSED,
  closed: true}`; `{outcome: CLOSE_UNRESOLVED, retired: true, closed: false, close}`;
  `{outcome: RETIREMENT_BLOCKED_CLEANUP_REQUIRED, retired: false}`; `{outcome: <tombstone
  refusal>, retired: false}`; `{outcome: INVALID_REQUEST|CONTENT_CONFLICT|INVALID_LINEAGE|UNAVAILABLE,
  retired: false, closed: false}` (`captureOrRefuse :94-104`); plus the manager's
  `{outcome: UNKNOWN, reason, operationId}` on a throw (`retireConsensusCreation :98-102`).
  RV2.1 collapses every `closed === false` into REMOVE_HELD with the memo at REMOVING.
- Scenario -> wrong output 1: a late REMOVE for a creation whose slot was CLOSED and then
  re-used at ordinal g+1: `resolveResourceState` answers HISTORY_UNAVAILABLE
  (`service-instance-state.js:245`), so release and close both answer HISTORY_UNAVAILABLE ->
  CLOSE_UNRESOLVED with `retired: true` -> REMOVE_HELD -> every re-REMOVE repeats it; the
  operation never completes although the tombstone is durable and the owner no longer holds
  this ordinal. Scenario 2: INVALID_LINEAGE (token's node is not this node) or
  CONTENT_CONFLICT are permanent, yet answer REMOVE_HELD forever.
- Required: `closed === true` -> COMPLETED; `retired: true` with `close.outcome ===
  HISTORY_UNAVAILABLE` -> COMPLETED (nothing of this creation can be live; record it);
  INVALID_REQUEST/CONTENT_CONFLICT/INVALID_LINEAGE -> FAILED with the code; CLOSE_UNRESOLVED
  (other), RETIREMENT_BLOCKED, tombstone refusals, UNAVAILABLE, manager UNKNOWN -> REMOVE_HELD.

### F5 (required) `resumeConsensusCreation` result shapes after ADMISSION_RETAINED
- Once retained, every failure is `{outcome: UNKNOWN, reason, operationId}`
  (`bootstrapConsensusCreation :145-150`): a driver FAILED start (port allocator or module
  absent, REPLICA_LIVE, consensus refusal) surfaces as `confirmConsensusBootstrapResult`'s
  SERVING_UNAVAILABLE throw -> `UNKNOWN{reason: CONSENSUS_SERVING_NOT_IMPLEMENTED}`;
  CONTRADICTED authority -> `UNKNOWN{reason: CONTENT_CONFLICT, retirement}` (`:120-122`,
  the resource already retired); UNRESOLVED authority -> `UNKNOWN{reason}` while the
  replica serves locally and its rows are projected (option a). RV2.2 maps only the
  recover-phase `CONTENT_CONFLICT` (-> FAILED) and a bare `UNKNOWN` (-> deferRetry); RV1.2's
  "a refusal -> FAILED as today" has no shape to attach to. `INVALID_REQUEST`
  (`instanceIdentifier(operationId)` false, `:196`) is unmapped (UUIDs pass `LIMIT.IDENTIFIER
  256`, so it is a completeness item).
- Required: a shape table keyed on the actual result: `status` HELD / PUBLISHED /
  PUBLISHED_UNPROJECTED; `outcome` INTENT_NOT_FOUND / UNAVAILABLE (step 3); TERMINAL_OPERATION /
  RESOURCE_CLOSED / CONTENT_CONFLICT / CORRUPT_STATE / INVALID_REQUEST (FAILED with code);
  `UNKNOWN{reason}` for every reason including the three above (the handler-typed deferral of
  F1, never FAILED while the slot is live). Say that CONTRADICTED's next resume answers
  RESOURCE_CLOSED -> FAILED, which is the convergence.

### F6 (required) `ReplicaStatus.HELD`: the shared-enum completeness witness
- `test/rebalancer/replica-status-completeness.property.test.js:63-67` asserts exactly seven
  values and `:42-50` lists them. Adding HELD reds it. List the witness as superseded by
  appending (the count becomes eight; `'held'` joins REQUIRED_STATUS_VALUES), and note that
  `isValidStatus('held')` becomes true for every consumer of `src/rebalancer/index.js:46-47`.

### F7 (required, R16) the replica's cache: "replacing the singleton read"
- `wasm-service-replica.js:144-145` reads `options.systemTableCache ||
  NodeService.getInstance().getSystemTableCache()`; `getInstance()` constructs a NodeService
  when none exists (`node-service.js:112-117`). Eight test files construct
  `new WasmServiceReplica(` (`test/node/replica-transport-handler-identity.test.js`,
  `test/wasm-service/wasm-service-replica.test.js`, `wasm-strong-write-native-fixture.js`,
  `wasm-writer-completion-v1.test.js`, `test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js`,
  `durable-commit-replica-kinds.test.js`, `runtime-opening-refusal.integration.test.js`,
  `startup-cleanup-native-fixture.js`); only `wasm-service-replica.test.js` passes a cache.
  Removing the fallback changes the unbound construction path too (the alpha deletion unit's
  territory, RV1.0). Decide and say: keep the fallback (`options.systemTableCache ??
  NodeService...`, minimal: the lifecycle injects and production is unchanged) or remove it
  and list the eight sites as the impact. In production the injected value is the host's
  `peekSystemTableCache()` (`bootstrap-service.js:309-311`); state its equivalence to the
  singleton's cache or keep the fallback.

### F8 (required) the PRESENT mark is S-keyed against the module's token rule
- RV2.3: `markServicesRowPresent(serviceId, serviceType)` -> `lifecycle.enableServicesRowPublication(replica, serviceType)`.
  The driver reaches the replica through `_lifecycles.get(serviceId)` and
  `lifecycle.getReplica(serviceId)` = `activeReplicas.get(S)` (`wasm-service-lifecycle.js:602-604`),
  while `wasm-component-driver-consensus.js:1-7, 82-91` and `wasm-creation-retirement.js:42-54`
  key every bound effect by the retained token, "never serviceId-keyed driver bookkeeping".
- Scenario -> wrong output: the runtime awaits `_projectReplicaState` and `_endpointWriter`
  after I's PUBLISHED; under the allowed loopback interleaving I is REMOVEd (stop settles) and
  J's CREATE prepares under the same S before the mark runs (the successor fence admits J once
  I's stop settled, `wasm-service-lifecycle.js:213-227`); the mark hits J: J's serving-state
  record is PRESENT with no J row; J's later PUBLISHED projects its row and "a re-drive that
  finds PRESENT replays nothing", so J's `raft_role` stays null until the next role event.
- Required: `markServicesRowPresent(serviceId, serviceType, consensusResourceToken)`; the
  lifecycle marks only the replica whose `consensusCreation.token` digest equals it, else a
  typed no-op that the runtime maps to `PUBLISHED_UNPROJECTED`. Mutation: "mark keyed by S".

### F9 (required) concurrent re-entry of one HELD operation
- `existing.status === HELD` re-enters unconditionally (RV1.2/RV2.2) and the wake consumer
  schedules a re-entry (RV2.4); after HELD `inProgressOperations` holds no entry
  (`:442-444`), so a coordinator re-dispatch and a wake for the same operation run two
  `resumeConsensusCreation` calls at once. Every layer tolerates it (`createReplica`
  idempotent on `sameLiveCreation :90-93, 214`; `allocate` idempotent; `initialize` READY is
  a no-op, `wasm-service-replica-lifecycle.js:200-203`; `request()` coalesces on the key;
  UPDATE-first projection; endpoint birth resolves by readback), so the cost is a doubled
  bootstrap and two CREATE_ACTIVE emissions, not a wrong row.
- Required: the HELD re-entry and the wake re-entry both register an `inProgressOperations`
  entry and are skipped when one exists (answer IN_PROGRESS / record the wake); the order
  "HELD check before the in-progress check" (prior vet N6) stays for the memo, the guard
  lives inside the re-entry.

### F10 (required) hops the host rides on
- `boundStartResult(replica, run)` (`wasm-creation-publication.js:104-114`) has no host
  parameter; `projectBoundStart` copies `port: startResult.port` explicitly
  (`wasm-component-driver-consensus.js:54-55`), so a `host` on the lifecycle's result is
  dropped unless forwarded; `START_RESULT_FIELD` (`wasm-service-lifecycle.js:36-42`) has no
  HOST. Name the three hops: lifecycle `continueBoundStart` passes
  `this.dependencies.endpointHost` into `boundStartResult`; the driver forwards `host`;
  the runtime composes the intent and the services-row `address` from it. Same for the
  remover's binding argument (RB3 note).

### Checked and sound (no finding)
- `readRetainedCreation` cannot answer "no reservation" for a row it never reserved: right,
  by construction. Its `CONTENT_CONFLICT` edge (intent's `consensusSlotRequest.operationId !==
  operationId`, `:209-210`) is worth listing beside CORRUPT_STATE (N2).
- The three-step CREATE order: INTENT_NOT_FOUND is definitive only because `readJournal` is
  the authoritative routed read (RV1.5); a thrown read is UNAVAILABLE (`instanceFailure :107-109`).
- The REMOVE route's row-hint memo: `recoverLocalReplicaForRemoval` must copy
  `create_attempt_token` into the recovered memo as `operationId` (implied; say it).
- `PEER_ROW_EXCLUDED_STATUSES` membership is fail-closed as designed.
- The bound STOP branch order (remover, stop, STOPPED projection on `closed === true`) is
  consistent with RV1.1's "endpoint before the local stop, row after CLOSED"; the STOPPED
  projection on a HELD replica (no row) fails best-effort without throwing
  (`_projectReplicaState :494-501`).
- The bound descriptor carries no `nodeId` (fixture intent `service-consensus-creation-fixture.js:18-22`);
  `_removeEndpoint` passes `null` and the wiring uses its own `nodeId`; the STOPPED
  projection falls back to `hostNodeId` (`runtime-replica-state-projection.js:230-233`). Holds.
- `endpoint_id = ${physical}-ep-${nodeId}` with `service_id = S` and `metadata.service_name = S`
  gives one catalog group (prior vet N3) and is unaffected by this revision.
- The labelled write-ready seam: `isSystemTableWriteReady` is the only gate the helper reads
  (`wasm-service-metadata-mutation-helpers.js:71, 118`); the CAS itself rides
  `submitMutation` -> CDC -> the fixture's engine (`mutation-submission.js:161-205`,
  `control-plane-runtime-bundle.js:36-39`, `sqlite-fixture.js:108-111`).

---

## 4. Production behaviour changes outside the bound route (R16), named

1. `ReplicaStatus` gains `HELD` (shared enum; `isValidStatus('held')` true; completeness
   witness count, F6).
2. `WasmServiceReplica`'s cache source changes for UNBOUND replicas if the singleton
   fallback is removed (F7).
3. `createWasmServiceNodeDependencies` gains `nodeAddress`/`endpointHost`, `systemTableCache`,
   `creationWake` getters: inert for unbound replicas; `creationWake` resolves
   `node.runtimeServiceHandler`, present on both hosts (`bootstrap-service.js:336-337`,
   `node-joining-delegate-bundles.js:64-65`).
4. `recoverLocalReplicaForRemoval` adds an O(rows) `find` over SERVICES on every REMOVE whose
   `get` misses (today O(1) miss -> NOT_FOUND); semantics for unbound rows unchanged.
5. Every CREATE now calls `resumeConsensusCreation` first: in production today one
   synchronous UNAVAILABLE (`requireDependencies`) before the generic path; once the journal is
   wired (activation quest) one authoritative `wasm_operations` read per native_js/Cell CREATE.
   Record as the activation quest's accepted cost of RB2's order.
6. The endpoint writer and remover gain a binding-first branch; without a binding they parse
   as today.
7. `confirmConsensusBootstrapResult` admits PUBLISHED_UNPROJECTED; bound only.
8. Bound-class production CREATE: FAILED via REPLICA_SET_REQUIRED today -> CREATE_FAILED with
   `deferRetry: true` + code -> coordinator FAIL (F1): same terminal state, different code.

None of these alters the unbound route's outputs; 1 and 2 need the witness supersession and
the fallback decision named.

## 5. New state and its owner (R06/R07)

Owned: `servicesRow: {state, serviceType}` (serving-state module); memo HELD + `operationId`
(handler); `NOT_ADMITTED` (RESULT in `service-consensus-creation-intent.js`);
`RUNTIME_SERVICE_CREATE_HELD`/`REMOVE_HELD` + action-map rows (`executor-outcome-constants.js`);
`NO_LOCAL_OPERATION` (handler constants); `BOUND_ROUTE_REQUIRED` (handler error msg);
`PUBLISHED_UNPROJECTED` (`CONSENSUS_BOOTSTRAP`); EP_META `binding_digest`/`resource_token`
(`service-endpoint-builder.js`). Unowned in Revision 2: the deferral carrier (F1: it must be
the existing FAILED+`deferRetry`+`errorCode`, not a new type); the endpoint-host derivation
(F2: the existing `resolveEndpointAddress`); the `host` field of the bound start result (F10:
name `START_RESULT_FIELD.HOST` or the publication module as owner).

---

## Recorded (N)

- N1 Every `file:line` Revision 2 cites was checked against `e3e70fb3b` and is exact or
  within two lines (`META_SERVICE_ID` is `:54-58`; `PEER_ROW_EXCLUDED_STATUSES` is `:232-238`).
- N2 `readRetainedCreation`: TERMINAL before `retainedToken`; add CONTENT_CONFLICT.
- N3 `recoverLocalReplicaForRemoval`: `get` by `service_id` stays first; `find` by `replica_id`
  is the miss path; copy `create_attempt_token` into the memo.
- N4 Remover binding argument (RB3) and the host hops (F10) are R02 naming, not mechanism.
- N5 HELD outcomes name the operation's current step.
- N6 With the journal clause dropped, a founder HELD before a handler restart (no row, no
  memo) answers NOT_FOUND to its REMOVE; the coordinator treats that as stop-phase satisfied
  (`dispatch-response-reconcile.js:941-949`) while the slot stays ADMITTED until the restart
  scan: record as a typed edge with the recovery stage as owner.
- N7 `REFUSED_INCARNATION_REQUIRED` joins the three writer answers mapped to PUBLISHED_UNPROJECTED.
- N8 Line 21 of `log.ndjson` is still the D0 entry; RV2.5's gate is the right sequencing.

---

## Findings summary (one round)

| Id | Class | Subject | Required change |
|---|---|---|---|
| F2 (RB4) | BLOCKING | address owner value | expose `endpointHost` derived by `resolveEndpointAddress({nodeAddress, advertisedNodeWsAddress, nodeId})` (`meta-service-definition-registration.js:140-192`); never raw `nodeAddress`; cell (e) asserts the derived host for a `host:port` NODE_ADDRESS; mutation "raw nodeAddress as host" |
| F1 (RB2) | required | deferral carrier/consumer | carrier = `*_FAILED` + `errorCode` + `deferRetry: true`; memo FAILED after a deferral; "never FAILED" -> "handler-typed; coordinator FAILs runtime-service deferrals today (`reconcile-methods.js:36-48`, `dispatch-rearm-evidence.js:394-401`); honouring is B9's"; cell (a) asserts the emission |
| F3 (RB1) | required | REMOVE on PENDING | drop "no slot"; record the applied-reservation/lost-reply case and its recovery-stage owner |
| F4 (RB1/RR6e) | required | REMOVE result shapes | enumerate `retireWasmCreation`/manager shapes; HISTORY_UNAVAILABLE close with `retired:true` -> COMPLETED; permanent refusals -> FAILED; rest -> REMOVE_HELD |
| F5 (RR1) | required | resume result shapes | table keyed on `status` vs `outcome`; every `UNKNOWN{reason}` (driver FAILED, CONTRADICTED+retirement, UNRESOLVED) and INVALID_REQUEST mapped |
| F6 (RR3) | required | shared enum witness | supersede `replica-status-completeness.property.test.js:42-67` by appending |
| F7 | required (R16) | replica cache source | keep the singleton fallback or census the eight construction sites; state the production equivalence |
| F8 (RR4) | required | PRESENT mark key | `markServicesRowPresent(serviceId, serviceType, token)`; mark only the matching creation; mutation "mark keyed by S" |
| F9 (RR7) | required | HELD re-entry concurrency | `inProgressOperations` guard for the HELD and wake re-entries |
| F10 (RB3/RB4) | required | hop naming | `boundStartResult` host parameter, `projectBoundStart` forwards `host`, remover's binding argument; `START_RESULT_FIELD.HOST` owner |
| N1-N8 | record | - | confirmations and edges above |

What an implementer must not do from Revision 2: do not write `nodeAddress` (a `host:port`
string) into `address` (F2); do not invent a deferral outcome type or leave the memo CREATING
after a deferral (F1); do not mark PRESENT by S (F8); do not answer REMOVE_HELD to a
HISTORY_UNAVAILABLE close whose tombstone is durable (F4); do not remove the replica's
singleton fallback without naming the eight sites (F7).

## What I did not read or run (bounded, counted)

Not read in full: `control-plane-system-table-gateway-mutation-submission.js` beyond
`submitMutation`'s first 45 lines (whether the CDC path consults the cache for a leader route
is taken from the fixture's existing use, not re-derived); `owner-key-reconcile-queue.js`
beyond the `enqueueAndWait`/`completionWaiter` grep (coalescing of two waiters on one key is
inferred from `appendCompletionWaiter :256`, not read); `authoritative-row-mutation-helper.js`;
`node-address-resolution.js` beyond `:352-373`; `bootstrap-service-seed-delegates.js`;
`entrypoint-runtime-join-decision.js`; the activation quest charter and the closeout plan
(the brief did not list them); `quest.json`. Not run: anything.
