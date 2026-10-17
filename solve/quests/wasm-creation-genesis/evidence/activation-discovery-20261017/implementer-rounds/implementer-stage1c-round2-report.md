# Implementer report: stage 1c (wasm-creation-genesis), node-side bound routes and discovery rows

Worktree `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`, branch
`work/rs-raft-event-reconciliation-20261016`, base `b3793c7e5`. Nothing is committed, staged, stashed
or pushed, and no refs were touched. Everything is uncommitted in the worktree. This is not a claim
that the stage is done: the lead and an independent verifier decide that.

Not mine (another writer is active in this worktree, and I left these alone):
`solve/epics/raft-rs-full-cutover/closeout-plan-2026-10-17.md` (M), `composition-report-2026-10-17.md`
(??), `composition-verifier-verdict-2026-10-17.md` (??).

## Status in one paragraph

These are green as single files (`npm run test:file`, gated): the three new witness files, all
designed cells and witnesses C6-1..C6-11, cells (a)-(i), and every file I edited or superseded,
except one sealed stage-1 witness. **`wasm-creation-publication.integration.test.js` P11 is red**,
and that red follows from the design (finding F-1, which needs a lead decision). I measured
seventeen mutations, each once; all seventeen were killed and each source was restored
byte-identically (sha256-checked). Fast-static `--base b3793c7e5` is ok. Decision boundaries show 0
new. The remaining statics show no new violations; inherited reds were measured on the base (F-9).
I stopped there and did not run any multi-file selection. The lab list is at the end.

## Files changed and why

Source (in the order of the brief's dependencies):

- `src/service/service-consensus-creation-intent.js`
  - New `readRetainedCreation(manager, operationId)`, a journal-only read (RV2.1, RV3.3 N2). It does
    no policy check, no reserve and no metadata read. Its answers are ADMISSION_RETAINED,
    INTENT_NOT_FOUND, NOT_ADMITTED, TERMINAL_OPERATION (decided before the token), CORRUPT_STATE,
    CONTENT_CONFLICT and UNAVAILABLE.
  - New `RESULT.NOT_ADMITTED`. `RESULT` is now exported as `CONSENSUS_CREATION_RESULT` so the
    handler imports the names (R06).
  - Intent decoding was extracted into `journaledIntent` and is shared with
    `recoverConsensusCreation`. Behaviour is unchanged (F-7).
- `src/service/service-consensus-bootstrap.js`
  - New `CONSENSUS_BOOTSTRAP.PUBLISHED_UNPROJECTED`.
  - `confirmConsensusBootstrapResult` admits it, with `started === true` and the equality checks.
  - The bootstrap body became `continueRetainedCreation`. `bootstrapConsensusCreation` is now
    prepare + continue. The new `resumeConsensusCreation` is recover + continue, one pass (RV2.2).
  - The manager branch is unchanged: for anything other than PUBLISHED it returns before
    `confirmPublishedAuthority`, so the state stays STARTING and nothing is retired.
- `src/service/service-lifecycle-manager.js`: adds the methods `readRetainedCreation` and
  `resumeConsensusCreation`.
- `src/rebalancer/replica-operation-progress.js`: `ReplicaStatus.HELD = 'held'`.
- `src/rebalancer/replica-status.js`: HELD added to `PEER_ROW_EXCLUDED_STATUSES`.
- `src/rebalancer/executor-outcome-constants.js`: `RUNTIME_SERVICE_CREATE_HELD` and
  `RUNTIME_SERVICE_REMOVE_HELD`, each with an UPDATE_STEP action-map row.
- `src/node/runtime-service-handler-constants.js`
  - New `RUNTIME_SERVICE_HANDLER_ERROR_MSG.BOUND_ROUTE_REQUIRED`.
  - New `RUNTIME_SERVICE_CREATION_WAKE_OUTCOME {QUEUED, RECORDED, NO_LOCAL_OPERATION}`.
  - Three log messages.
- `src/node/runtime-service-bound-creation-route.js` (new owner module, explicit context, 317 lines):
  - CREATE order: resume first. Retained-class answers take the bound route regardless of the cache
    row. Unrouted answers classify the row. A bound class gets `BOUND_ROUTE_REQUIRED` or the
    existing CREATE_FAILED with `deferRetry`. Any other class takes the generic path unchanged.
  - The RV3.3 resume table and REMOVE table are decision tables.
  - HELD re-entry, and the `inProgressOperations` guard for both HELD and wake re-entries (RV3.5).
  - The enqueue-only wake consumer (`setImmediate`). A wake that arrives during an in-flight
    re-entry is recorded on that entry and consumed by exactly one further re-entry if the creation
    is still HELD.
  - The bound REMOVE: `readRetainedCreation`, then `manager.stopReplica(handle)`. On `closed:false`
    the memo stays REMOVING.
  - `rowCreationHint`, which turns `create_attempt_token` into the memo's `operationId`.
- `src/node/runtime-service-handler.js` (882 to 934 lines; F-6)
  - `createReplicaAsync` routes; the old body is unchanged as `createGenericReplicaAsync`.
  - `removeReplicaAsync` routes when the memo names a creation; the old body is unchanged as
    `removeGenericReplicaAsync`.
  - New `onCreationWake`.
  - The ACTIVE/HELD/CREATING memo replies were extracted into `replyToExistingReplica`, so the
    complexity of `handleCreateReplica` does not grow.
  - `recoverLocalReplicaForRemoval`: the `get` by service_id stays first. On a miss it does a `find`
    by `replica_id`; the guard accepts `replica_id`; the memo copies `create_attempt_token`.
- `src/runtime/service-runtime-consensus-publication.js` (new, 130 lines)
  - On PUBLISHED it projects the services row with existing columns only: physical `service_id`,
    `service_type` from the descriptor (runtime_service), `replica_id S-rN`, `group_id`,
    `create_attempt_token` = the creation's operation id, `node_id`, `address` = the derived host,
    status ACTIVE. No `cleanup_token`.
  - It then writes the endpoint (binding-first) and calls `driver.markServicesRowPresent(S,
    projectedServiceType, token)`.
  - Typed `PUBLISHED_UNPROJECTED` reasons: writer absent, host unavailable, services row failed or
    retained (F-4), the endpoint writer's `{success:false, outcome}` (stale, incarnation-required,
    authority-unavailable, not-applied) or a throw, and mark not registered.
  - Retire removes the endpoint by physical id with `{consensusBinding}` before `driver.stop`, then
    projects STOPPED only on `closed === true`.
- `src/runtime/service-runtime-consensus-bootstrap.js`: the bound START projects through the new
  module after confirmation. The bound STOP withdraws through it.
- `src/runtime/service-runtime-lifecycle.js`
  - `_projectReplicaState` returns `{stateRow, projectionResult}` when it writes.
  - `_removeEndpoint(serviceId, definition, removal)` passes the third argument through and returns
    the remover's answer (or `{success:false, error}`). Existing callers are unaffected.
- `src/runtime/runtime-endpoint-publication-wiring.js`: one `resolveRuntimeEndpointIdentity` shared
  by the writer and the remover. It is binding-first (S taken from the binding, the row key from the
  physical id, no logical resolution); without a binding it parses as before. The remover's third
  argument is `{consensusBinding, ...mutationContext}`.
- `src/runtime/runtime-endpoint-writer.js`
  - `buildRuntimeEndpointRow(serviceId, nodeId, intent, endpointKey = serviceId)`.
  - For a bound intent, metadata gains `binding_digest = instanceDigest(binding)` and
    `resource_token = instanceDigest(token)` (F-8).
- `src/wasm-service/service-endpoint-builder.js`: `EP_META.BINDING_DIGEST` and
  `EP_META.RESOURCE_TOKEN`.
- `src/runtime/wasm-component-driver-consensus.js`: `projectBoundStart` forwards `host`. New
  `markBoundServicesRowPresent`, which goes through the composition-root lifecycle and is keyed by
  token.
- `src/runtime/wasm-component-driver.js`: a `markServicesRowPresent(serviceId, serviceType, token)`
  method.
- `src/wasm-service/wasm-creation-publication.js`: `boundStartResult(replica, run, host)`.
- `src/wasm-service/wasm-service-lifecycle.js`
  - `START_RESULT_FIELD.HOST`, and the getters `endpointHost` and `systemTableCache`.
  - `continueBoundStart` passes `endpointHost`.
  - `enableServicesRowPublication(serviceId, serviceType, token)` marks only when the token digest
    matches; otherwise it answers NOT_REGISTERED.
  - The replica receives the lifecycle's `systemTableCache` through `replicaPublicationOwners()`.
    The replica keeps its singleton fallback (F-12).
- `src/wasm-service/wasm-service-serving-state.js`
  - `servicesRow {state: ABSENT|PRESENT, serviceType}`, `WASM_SERVICES_ROW_MARK`.
  - `publishesServicesRow` = unbound OR PRESENT.
  - `servicesRowServiceType`: unbound is unchanged (`wasm_service`, R17 defect recorded); bound
    takes it from the record.
  - `markServicesRowPresent`: one ABSENT-to-PRESENT edge that replays `queueRoleUpdate(role)`, and
    `queueLeaderNodeUpdate(nodeId)` if the replica leads.
- `src/wasm-service/wasm-service-replica.js`: the role and leader CAS predicates take `service_type`
  from `servicesRowServiceType(this)`. The singleton cache fallback is kept.
- `src/runtime/runtime-startup-wiring.js`: `createWasmServiceNodeDependencies` gains these lazy
  getters:
  - `endpointHost` = `resolveEndpointAddress({nodeAddress, advertisedNodeWsAddress, nodeId})`;
  - `systemTableCache` = `node.peekSystemTableCache?.() ?? null`;
  - `creationWake` = the delegate to `node.runtimeServiceHandler.onCreationWake`, or null.
- `src/bootstrap/shared/meta-service-definition-registration.js`: exports `resolveEndpointAddress`.

Tests (new):

- `test/node/runtime-service-bound-route.test.js` (component scope: real handler, real manager over
  the SQLite journal and metadata owner, real emitter, scripted runtime behind the real adapter).
  - C6-1, C6-3, C6-4, C6-5, C6-8 at unit level, C6-9 at unit level, C6-10.
  - Cells (a), (b), (c).
  - F9.
  - The RV3.3 resume and REMOVE tables.
  - The readRetainedCreation table.
  - Vocabulary.
- `test/runtime/service-runtime-consensus-publication.test.js` (real runtime and real writers over
  SQLite; scripted driver).
  - Rows and columns, and the token-keyed mark.
  - HELD projects nothing.
  - Cell (i) and the writer answers.
  - C6-6, which re-drives UPDATE-first.
  - Cell (d) with the withdrawal order.
  - C6-11 with a real J reservation, plus the stale incarnation case.
  - The unbound parse.
  - Getter cell (e).
- `test/wasm-service/bound-creation-handler-embedding-fixture.js` and
  `bound-creation-handler-embedding.integration.test.js` (the native C6 embedding on three hosts).
  - C6-1, C6-3, C6-2, (e), (f), (g), (h), and the RV3.4 token-keyed mark (C6 test 1).
  - C6-7, C6-8, C6-9 (C6 test 2).
  - The payloads are authored from `ReplicaOperationField` keys, as RV2.6 permits.

Tests (edited or superseded):

- `test/control-plane/service-instance-creation-sqlite-fixture.js`: `owner()` also returns `cdc`,
  `services` and `endpoints`. New option `canonicalFounders` (default off).
- `test/rebalancer/replica-status-completeness.property.test.js`: `'held'` appended (RV3.6 F6).
- `test/node/runtime-service-handler.test.js` and
  `test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js`: the mock managers gain
  `resumeConsensusCreation` answering `{outcome:'UNAVAILABLE'}`, the production-shaped answer
  (F-2).
- `test/runtime/wasm-driver-contract-conformance.test.js`: `'markServicesRowPresent'` appended to the
  prototype allowlist (F-2).
- `test/wasm-service/wasm-retained-bootstrap-fixture.js`, `wasm-creation-genesis.integration.test.js`
  and `wasm-creation-reconciliation.integration.test.js`: stage-1 supersessions (F-2).
- `test/shards/{primary,resource,subsystem}-classes.json`: regenerated by their producers. The diff
  is only the three new entries.

## Census

- RuntimeServiceHandler CREATE/REMOVE callers:
  - `handleCreateReplica` and `handleRemoveReplica` are called only by
    `dispatchRuntimeServiceMessage` (`handleMessage`), plus tests.
  - `createReplicaAsync` is called only from the `setImmediate` in `handleCreateReplica`.
  - `removeReplicaAsync` is called only by `startRemoveReplicaAsync`.
  - Other `handleCreateReplica` names in `src/` belong to the partition ReplicaHandler or the
    ReplicaLifecycleManager, which are unrelated.
  - RuntimeServiceHandler constructions: the 13 files under census. Only two use mocks that CREATE;
    both gained resume. Four construct with `serviceLifecycleManager: {}` and are call-cell only.
- `_removeEndpoint` callers:
  - `service-runtime-lifecycle-operation-methods.js:437`, `:528` and `:548` (unbound start failure,
    stop, stop failure), all with two arguments and unchanged.
  - The new `service-runtime-consensus-publication.js:119` (bound, with `{consensusBinding}`).
- `publishesServicesRow` consumers: `wasm-service-replica.js:504` (`queueRoleUpdate`), `:526`
  (`queueLeaderNodeUpdate`), `:606` (`flushRoleUpdate`) and `:616` (`flushLeaderNodeUpdate`).
- `systemTableCache` readers in the replica:
  - Constructor fallback `:144`, the getter and setter `:190-197`, the control-plane bundle `:178`,
    and `isServicesLeaderAvailable` `:714`.
  - `wasm-service-metadata-mutation-helpers.js:28-29, 67-73, 109-120`, which are `cachedServiceRow`
    by `replica.replicaId` (the physical id, matching the bound row key).

## Red-first outputs (`scratchpad/red-1c/`)

- `runtime-service-bound-route.red.txt`: SyntaxError, missing export
  `RUNTIME_SERVICE_CREATION_WAKE_OUTCOME`.
- `service-runtime-consensus-publication.red.txt`: 10 of 12 failed. Examples: a PUBLISHED row was
  absent; the remover hit `LOGICAL_SERVICE_NOT_FOUND: wasm-instance-...-r1`; the getters were
  absent.
- `bound-creation-handler-embedding.red.txt`: "founders held: did not settle within the declared
  rounds", because today the CREATE takes the generic path.
- `replica-status-completeness.red.txt`: "ReplicaStatus should contain 'held'".

## Mutations (`scratchpad/mutations-1c/`)

Each mutation was applied once, its catcher was run gated, and the source was restored and
sha-checked. The `src-sha-before.txt` diff after the runs was empty. Note: three export lists were
de-exported after the mutations ran. The mutated lines are unaffected, and A, D and C were rerun
green afterwards.

| Id | Mutation (design) | Catcher | First failure |
|---|---|---|---|
| M01 | HELD mapped to FAIL (RV1.6) | route unit | C6-1 memo HELD |
| M02 | REMOVE routed to generic stop (RV1.6) | route unit | closed:true reached generic stop |
| M03 | resume continues via prepare(result object) (RV1.6 "retained not .intent") | route unit | C6-1 |
| M04 | `service_type 'wasm_service'` in role CAS (RV1.6) | C6 native | `host-1 raft_role null !== 'leader'` |
| M05 | `metadata.service_name` = physical id (RV1.6) | publication unit | row deep-equal |
| M06 | endpoint id by S (RV1.6) | publication unit | row id; cell (d) |
| M07 | projection before PUBLISHED (RV1.6) | publication unit | HELD projects nothing |
| M08 | role publication before PRESENT (RV1.6) | C6 native | `ROLE_WRITE_BEFORE_ROW` |
| M09 | NOT_FOUND on unavailable read (RV1.6) | route unit | C6-5; cell (a) |
| M10 | `create_attempt_token` omitted (RV1.6) | publication unit | row deep-equal |
| M11 | recover-for-REMOVE (RV2.6) | route unit | C6-8/(b) recovers===0; cell (c) |
| M12 | UNAVAILABLE deferral for non-bound class (RV2.6) | route unit | native_js generic; cell (a) |
| M13 | remover parses S (RV2.6) | publication unit | cell (d) "no logical resolution" |
| M14 | address literal `'localhost'` (RV2.6) | C6 native | `SERVICES_ROW_ADDRESS_NOT_DERIVED` +'localhost' |
| M15 | absent writer treated as PRESENT (RV2.6) | publication unit | cell (i) |
| M16 | raw nodeAddress as host (RV3.1) | C6 native | `SERVICES_ROW_ADDRESS_NOT_DERIVED` +'host-1.lab.test:8081' |
| M17 | mark keyed by S (RV3.4) | C6 native | token-mismatch mark answered 'PRESENT' |

## Statics (verbatim summaries)

- `node scripts/check-fast-static.js --base b3793c7e5`: "fast-static: ok". All 14 stages are ok,
  including test:deps, audit:shards, audit:impact-contracts, eslint (35 changed), and
  audit:runtime-grammar.
- Decision boundaries `--json` over all 23 touched src files: "new 0 raw 6 inherited 6". My first
  pass had 4 new violations, all fixed: two independent-if functions became decision tables, the
  readRetainedCreation split, and the lifecycle `replicaPublicationOwners`.
- eslint on all 35 touched JS files: 0 problems.
- `test:complexity:scoped`: 5 violations. All of them are on the base (`resolveEndpointAddress` 14,
  `handleRemoveReplica` 14, `validateEndpointIntent` 15, `_buildLifecycleLogContext` 16, and the
  completeness test arrow at 14). I introduced 0 new. The new `handleCreateReplica` 13 was fixed by
  extraction.
- `test:complexity:cognitive:scoped`: 0 violations.
- Literals: "Found 0 new literal-guideline violations".
- Silent-catch: 1 violation, `service-consensus-creation-intent.js:93 writeAndObserve`. It is
  pre-existing; the base reports the identical result.
- Runtime grammar: "Found 0 runtime-grammar-contract violations"; state-machine pressure pass.
- `audit:shards` is ok after regeneration.
- `audit:file-size`: "Source oversized-file ratchet: 26/27, Test 21/21".
- `test:duplication`: src is ok at 47/47. The test ratchet FAILED with 698/26458 against 697/26369,
  but the **base fails with the identical numbers**. I add no new clone group: a diff of the clone
  lists against the base is empty.
- `test:unused:ratchet`: FAILED with 1456 against a baseline of 1416, and the **base also reports
  1456**. I had 3 new unused exports; I removed all 3, so the head equals the base.

## Open findings (where the design could not be followed, or a decision is needed)

- **F-1 (needs a lead decision): stage-1 P11 is red, and the design causes it.**
  - What happens: RR5 and RV2.3 say PUBLISHED_UNPROJECTED "returns before any re-resolve". So a
    forged PUBLISHED driver answer whose projection does not land (P11's forged answer has no host,
    so the reason is ENDPOINT_HOST_UNAVAILABLE) is never checked by `confirmPublishedAuthority`. It
    is never CONTRADICTED and never retired: the slot stays ADMITTED, and the handler would hold it
    as HELD.
  - What P11 asserts: `outcome UNKNOWN`, `reason CONTENT_CONFLICT`, slot CLOSED, no projection.
  - The first failure is at `wasm-creation-publication.integration.test.js:649`.
  - Option 1: the manager also confirms authority for PUBLISHED_UNPROJECTED, keeping STARTING on
    CONFIRMED and retiring on CONTRADICTED. This is the safer choice, but it deviates from RR5.
  - Option 2: supersede P11 explicitly.
  - I implemented the design as written and left P11 red.
- **F-2: supersessions of sealed witnesses that the design did not enumerate.** I applied them with
  recorded comments citing RV1.1, RV1.3 and RV2.3; the lead and verifier need to accept them.
  - The retained fixture's discovery sinks now record into `host.discovery` and answer applied, for
    exactly the replica that serves under the projected physical id. A nested journal, or an ACTIVE
    or endpoint write for a non-serving replica, still goes to `publications` and throws. Every
    `publications === []` assertion is therefore unchanged. The fixture also supplies `endpointHost`
    through `resolveEndpointAddress`.
  - genesis `assertHeld` and reconciliation `assertServed` had "no leader publication queued". That
    now holds only for replicas that are not PRESENT, because a PRESENT leader queues its node id
    (the fixture has no CDC).
  - The conformance prototype allowlist gains `markServicesRowPresent`, which RV2.3 names.
  - The handler-test mock managers gain the production-shaped `resumeConsensusCreation` answer
    UNAVAILABLE.
  - Without these edits, 17 of 23 publication tests, plus genesis 1/7/14, reconciliation 1 and
    retained-bootstrap 2/11, went red, all on `PUBLISHED_UNPROJECTED !== PUBLISHED`. The measured
    outputs are in `reports/pre-*.txt`, `run-pub1.txt` and `sup-*.txt`.
- **F-3: `isRequestCellDefinition` tests for presence of keys** (`binding_* !== undefined`).
  - Serialized `service_definitions` rows carry `binding_*: null` (`wasm-service-models.js:185`). So
    a real cache row for an installed `wasm_component` classifies as a request Cell, and the
    handler's bound-class refusal never fires for production-shaped rows: they take the generic path,
    as today.
  - The witness rows are authored without the `binding_*` keys and are labelled.
  - I did not change the request-cell owner (out of scope). The owner is the request-cell contract,
    or the activation quest.
- **F-4: the production projection writer may be `RuntimeReplicaStateProjectionOwner.submit`**, which
  answers `retained: true` and applies asynchronously.
  - The bound projection maps that to PUBLISHED_UNPROJECTED (SERVICES_ROW_PROJECTION_RETAINED). With
    that writer, a production replica therefore never reaches PRESENT.
  - The embedding wires the direct `projectRuntimeReplicaServicesRow` over a ServicesOwner.
  - The owner is the activation quest. I did not invent an owner.
- **F-5: decisions taken where the tables are silent.**
  - Resume outcomes not listed in the table go to FAILED with their code (the table's default row).
  - A memo that names a creation whose journal says INTENT_NOT_FOUND goes to REMOVE_FAILED with its
    code.
  - A throw inside the route goes to the CREATE deferral, or to REMOVE_HELD.
  - Unrouted answers record no `operationId` on the memo.
  - "The wake is recorded" (RV3.5) is implemented as a `wakePending` flag, consumed once.
  - A HELD re-entry uses the request's operation id.
  - GRANT_HELD wakes re-enter like OBSERVED (RV1.2).
  - The replay uses `replica.role` and `replica.nodeId`.
- **F-6:** `runtime-service-handler.js` grew from 882 to 934 lines. It was already oversized; the
  ratchet counts files and is unchanged at 26/27. The bound logic lives in a new owner module.
- **F-7:** the brief says "no change to recoverConsensusCreation". Its intent-decoding lines moved
  into the shared `journaledIntent`. This is behaviour-preserving (the R01 alternative was duplicating
  the code).
- **F-8:** the EP_META values are digests: `binding_digest` = digest of B, and `resource_token` =
  digest of the token, not the raw token. The design is ambiguous on this.
- **F-9: inherited reds, measured on the base** (`git archive b3793c7e5` into the scratchpad, since
  deleted; same files, same runner).
  - `wasm-service-replica.test.js`: 7 identical failing subtests.
  - `replica-transport-handler-identity.test.js`: 6.
  - `wasm-driver-contract-conformance.test.js`: 10 identical after the allowlist supersession.
  - `write-identity-instance.test.js`: 17 failing on both trees, and about 475 s per run.
  - The test-duplication and unused-export ratchets, as above.
- **F-10: process deviations.**
  - Once, I ran `node --test test/node/runtime-service-bound-route.test.js` directly: not through
    `npm run test:file` and without the gate. It is a light unit file. All other runs went through
    `scratchpad/bin/run1.sh`, which waits for thermal headroom and for no other runner, and ran
    strictly serially.
  - `write-identity-instance.test.js` (heavy, 475 s) ran twice, once on head and once on base, in
    sequence.
- **F-11:** I did not update the D0 or quest log.
- **F-12:** every replica, unbound too, now receives the lifecycle's `systemTableCache`. In
  production that is `peekSystemTableCache()`, and it falls back to the singleton when null. RV3.6
  accepts this; I claim no equivalence.
- **C6-12:** the request Cell and meta paths are untouched by routing, per cell (a). Their existing
  files pass singly: `minimal-deployment-request-cell-runtime-readiness`,
  `minimal-deployment-request-cell-routing`, `meta-service-lifecycle`.

## Single-file results (gated, serial)

Green:

- New: `runtime-service-bound-route`, `service-runtime-consensus-publication`, and
  `bound-creation-handler-embedding.integration` (about 1.4 s).
- Edited or superseded: `runtime-service-handler`, `runtime-service-replace-canonical-target-handoff`,
  `replica-status-completeness`, `wasm-retained-bootstrap.integration`,
  `wasm-creation-reconciliation.integration`, `wasm-creation-genesis.integration`,
  `wasm-creation-bound-native`.
- Others: `executor-outcome-emitter`, `runtime-startup-wiring`, `runtime-endpoint-writer`,
  `endpoint-lifecycle`, `wasm-service-lifecycle`, `wasm-component-driver`,
  `service-consensus-creation-intent`, `service-lifecycle-manager`,
  `service-consensus-creation-recovery.integration`,
  `formation-runtime-service-create-lane-budget-starvation`,
  `minimal-deployment-request-cell-runtime-readiness`, `minimal-deployment-request-cell-routing`,
  `incarnation-reuse-cross-owner-anchor`, `meta-service-endpoint-registration`,
  `service-runtime-lifecycle`, `state-projection`, `terminal-status-sql-clause-consistency`,
  `replica-state-delegation`, `endpoint-intent.property`, `runtime-replica-state-projection-wiring`,
  `meta-service-lifecycle`.

Red:

- `wasm-creation-publication.integration`: P11 only (F-1).
- Inherited (F-9): `wasm-service-replica`, `replica-transport-handler-identity`,
  `wasm-driver-contract-conformance` (identical to base), and `write-identity-instance`.

## Lab selection (the lead's multi-file run; 83 files; also at `scratchpad/reports/lab-selection.txt`)

```
test/bootstrap/message-group-activation-handler-boundary.test.js
test/bootstrap/meta-service-endpoint-registration.test.js
test/config/architecture-ownership-guardrails.test.js
test/control-plane/incarnation-reuse-cross-owner-anchor.test.js
test/control-plane/service-instance-creation-cas.test.js
test/control-plane/service-instance-selection-admission.test.js
test/integration/http-to-call-composition.integration.test.js
test/integration/minimal-deployment-call-cell-invocation-live.integration.test.js
test/integration/minimal-deployment-runtime-access-policy-live-validation.integration.test.js
test/integration/service-install-lifecycle-cli-pgwire.integration.test.js
test/node/replica-runtime-cleanup-custody.integration.test.js
test/node/replica-state-delegation.test.js
test/node/replica-transport-handler-identity.test.js
test/node/runtime-service-bound-route.test.js
test/node/runtime-service-call-cell-handler.test.js
test/node/runtime-service-handler.test.js
test/query/callback-execution-host.test.js
test/query/callback-execution-host-throughput-metrics.test.js
test/query/callback-runtime-driver-registry.test.js
test/query/execute-request.test.js
test/query/partition-callback-integration.test.js
test/query/write-identity-instance.test.js
test/raft/raft-rs-backend/durable-commit-replica-kinds.test.js
test/raft/raft-rs-backend/runtime-opening-refusal.integration.test.js
test/raft/raft-rs-backend/startup-cleanup.integration.test.js
test/raft/raft-rs-backend/wasm-service-group-on-raft-rs.test.js
test/rebalancer/executor-outcome-emitter.test.js
test/rebalancer/formation-runtime-service-create-lane-budget-starvation.test.js
test/rebalancer/replica-operations-single-writer.test.js
test/rebalancer/replica-status-completeness.property.test.js
test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js
test/rebalancer/terminal-status-sql-clause-consistency.property.test.js
test/runtime/endpoint-intent.property.test.js
test/runtime/endpoint-lifecycle.test.js
test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js
test/runtime/movielens-affinity-demo-wiring.test.js
test/runtime/node-shutdown-cell-worker-teardown.test.js
test/runtime/pgwire-password-authentication-cutover.test.js
test/runtime/pgwire-tls-policy-cutover.test.js
test/runtime/runtime-callback-fail-closed.test.js
test/runtime/runtime-callback-invocation-contract.test.js
test/runtime/runtime-callback-lifecycle-routing.test.js
test/runtime/runtime-callback-runtime-adapter-parity.test.js
test/runtime/runtime-callback-unified-integration.test.js
test/runtime/runtime-command-metrics.test.js
test/runtime/runtime-driver-no-writes.test.js
test/runtime/runtime-endpoint-writer.test.js
test/runtime/runtime-idempotency-key.test.js
test/runtime/runtime-log-trace-dimensions.test.js
test/runtime/runtime-monotonic-transitions.test.js
test/runtime/runtime-mutation-path.test.js
test/runtime/runtime-operation-stream.test.js
test/runtime/runtime-policy-gates.test.js
test/runtime/runtime-replica-state-projection-retained-reconcile.test.js
test/runtime/runtime-replica-state-projection-wiring.test.js
test/runtime/runtime-selection-diagnostics.test.js
test/runtime/runtime-startup-wiring.test.js
test/runtime/runtime-telemetry-dimensions.test.js
test/runtime/service-cell-bridge-roundtrip.test.js
test/runtime/service-lifecycle-pgwire-executor-handoff.test.js
test/runtime/service-runtime-consensus-publication.test.js
test/runtime/service-runtime-lifecycle-idempotency.test.js
test/runtime/service-runtime-lifecycle-journal.test.js
test/runtime/service-runtime-lifecycle.test.js
test/runtime/state-projection.test.js
test/runtime/wasm-api-compat.test.js
test/runtime/wasm-component-driver.test.js
test/runtime/wasm-driver-contract-conformance.test.js
test/service/minimal-deployment-request-cell-routing.test.js
test/service/service-consensus-creation-intent.test.js
test/service/service-consensus-creation-recovery.integration.test.js
test/service/service-lifecycle-manager.test.js
test/wasm-service/bound-creation-handler-embedding.integration.test.js
test/wasm-service/meta-service-lifecycle.test.js
test/wasm-service/wasm-creation-bound-native.test.js
test/wasm-service/wasm-creation-genesis.integration.test.js
test/wasm-service/wasm-creation-local-record.test.js
test/wasm-service/wasm-creation-publication.integration.test.js
test/wasm-service/wasm-creation-reconciliation.integration.test.js
test/wasm-service/wasm-retained-bootstrap.integration.test.js
test/wasm-service/wasm-service-lifecycle.test.js
test/wasm-service/wasm-service-replica.test.js
test/wasm-service/wasm-writer-completion-v1.test.js
```

How the list was built: every test that imports a touched behaviour module, plus the importers of
the two edited fixtures, plus the edited and new tests, plus the consumers of ReplicaStatus and the
executor outcomes. The constants alone are imported by 343 test files, so a wider cone is the lab's
call.

Evidence paths (scratchpad):

- `red-1c/*.red.txt`
- `mutations-1c/M01..M17*.txt`, `summary-{1,2,3}.txt`, `src-sha-before.txt`
- `reports/run-*.txt`, `b-final-*.txt`, `fast-static-3.txt`, `decision-boundaries.json`,
  `complexity.txt`, `cognitive.txt`, `literals.txt`, `silent-catch.txt`, `duplication.txt`
- `reports/base-*.txt` (the base comparisons)

---

# Round 2 (after the coordinator's decisions on F-1..F-8)

This round was applied in the same worktree. Nothing is committed, hooks are untouched, and I did
not touch the design note or the closeout plan. Every run in this round went through `npm run
test:file`, gated and serial.

## F-1, the safer option (design Revision 4 per the lead): P11 is green

- `src/service/service-consensus-bootstrap.js` `continueRetainedCreation` now runs
  `confirmPublishedAuthority` for both serving statuses, PUBLISHED and PUBLISHED_UNPROJECTED. The
  line is `if (!SERVING_STATUSES.has(confirmed.status)) return confirmed;`.
- The CONFIRMED branch sets `_replicaStateById` to RUNNING only for PUBLISHED. A confirmed
  PUBLISHED_UNPROJECTED is returned unchanged and stays STARTING.
- CONTRADICTED goes through the existing retire-by-creation branch, answering `{UNKNOWN,
  CONTENT_CONFLICT, retirement}`. UNRESOLVED answers `{UNKNOWN, reason}`.
- The code comment cites Revision 4, which supersedes RR5's "returns before any re-resolve", and
  A-B5.
- Unit witness changes in `test/node/runtime-service-bound-route.test.js`:
  - The PUBLISHED_UNPROJECTED case now grants first, then asserts memo HELD and manager state
    `starting`; then PUBLISHED, with memo ACTIVE and state `running`.
  - New test "Revision 4: a PUBLISHED_UNPROJECTED answer for an ungranted slot is contradicted and
    retired". It expects CREATE_FAILED with `CONTENT_CONFLICT`, a bound stop, and a state that is not
    running.
- `wasm-creation-publication.integration.test.js` is now fully green (23/23, P11 included).
- M18, "skip the authority confirmation for PUBLISHED_UNPROJECTED" (the old line restored):
  - Against the publication file: `not ok 13 - P11 a forged PUBLISHED ...`, with outcome `undefined`
    where `'UNKNOWN'` was expected.
  - Against the route unit file (M18b): `not ok 3 - Revision 4: ... contradicted and retired`.
  - Restored byte-identically.

## F-3: the predicate is fixed at its owner

- `src/runtime/request-cell-runtime-contract.js`: `isRequestCellDefinition` now treats a `null` or
  `undefined` value as absent, over the named list `REQUEST_CELL_LINEAGE_FIELDS`.
  `REQUEST_CELL_CONTRACT_FIELD` gains `BINDING_VERSION_ID`.
- Census of `isRequestCellDefinition` and of sibling predicates that test these keys, and whether
  each could have misclassified a serialized row before the fix:

| Site | Use | Could it misclassify a serialized row before? |
|---|---|---|
| `src/node/runtime-service-bound-creation-route.js:54` `isBoundClassDefinition` (new this stage) | handler bound-class refusal on the raw cache row | **Yes.** Every serialized wasm_component row was a "Cell", so `BOUND_ROUTE_REQUIRED` and the deferral never fired (F-3). Fixed. |
| `src/runtime/wasm-component-driver.js:286` and `:294` `prepare` | bound guard; Cell versus consensus prepare | **Yes, before this stage.** The handler's generic `replicaHandle` spreads the raw cache row (null `binding_*`) into the definition, so an installed package's generic CREATE was routed to `#prepareRequestCell`. Now, under 1c, such a row is refused at the handler (bound class). The only built-in `wasm_component`, `sys-wasm-meta` (serialized, null `binding_*`), would now take `#prepareConsensusReplica` instead of `#prepareRequestCell` if ever placed; it ships with `replica_count 0`. Recorded for the alpha deletion and activation owners. |
| `src/runtime/wasm-component-driver.js:214` `requiresRuntimeReconciliation` (caller `service-runtime-lifecycle-operation-methods.js:83`, idempotent-START reconcile) | decides whether an idempotent hit re-runs the driver | **Yes, same input.** A null-valued row was a "Cell", so idempotent STARTs were re-run. Now false, which matches `RuntimeDriver`'s default. |
| `src/control-plane/owners/request-binding-service-definition-contract.js:105-109` `hasRequestBindingServiceDefinitionLineage` | lineage presence | **No.** It already tests `!== null && !== undefined`. |
| `src/service/service-descriptor.js:43-58` `runtimeExtensionFields` | copies the values via `firstDefined` (`??`) | **No.** It copies values and does not classify (null becomes undefined). |
| `src/service/binding-route-actuals.js:30-37`, `src/runtime/request-cell-invocation-owner.js:104`, `src/service/{request,call}-binding-route-resolver.js` (`binding_digest` reads), `runtime-access-policy-owner.js:327`, `deployment-binding-*` | value equality and parsing on known Cell/Binding rows | **No.** They compare or parse values and do not test for presence. |

- Owner witness, new file `test/runtime/request-cell-definition-classification.test.js`:
  - A `serializeServiceDefinition` row (keys present, null) is not a Cell, and asserts the keys are
    present.
  - A row with the keys absent is not a Cell.
  - A serialized Cell row (lineage values) is a Cell, and each single lineage field alone also
    classifies it as a Cell.
- Handler witnesses: `boundRow` is now a real `serializeServiceDefinition` row (keys present, null),
  and `cellRow` is a serialized Cell row.
  - C6-4 (`BOUND_ROUTE_REQUIRED`), C6-5 (deferral) and cell (a) (deferral) fire on real rows.
  - Cell (a)'s request Cell row still takes the generic path.
  - The C6 embedding fixture's cache row is also serialized.
- M19, "predicate by key presence" (the old body restored), run once per catcher:
  - M19a, owner witness: `not ok 1 - a serialized installed-package row ... is not a request Cell`.
  - M19b, handler: `not ok 6 - C6-4 ...`, `not ok 7 - C6-5 ...`, `not ok 9 - cell (a) ...`.
  - Restored byte-identically (`mutations-1c/summary-4.txt`; the sha diff of every touched src file
    was empty).

## F-2 (accepted provisionally): every superseded line

Every supersession comment now cites "ACTIVATION-DISCOVERY-DESIGN-20261017 Revision 3". Line
numbers are b3793c7e5 to the worktree:

- `test/wasm-service/wasm-retained-bootstrap-fixture.js`
  - Old `:140` dependency literal becomes `:143-144`, adding `endpointHost` via
    `resolveEndpointAddress`; the import is added at `:25-26`.
  - Old `:185-186` endpoint sink (`publications.push` + throw unconditionally) becomes `:203-208`:
    refused and recorded only for a replica that is not serving, otherwise recorded in `discovery`
    and answering `{success:true}`.
  - Old `:189-190` projection sink becomes `:211-216`: an ACTIVE row for a non-serving replica is
    refused and recorded; otherwise it goes to `discovery` and answers `{applied:true}`.
  - Old `:194` `Object.assign` becomes `:220`, adding `discovery`.
  - The comment is at `:183-191` and the helper `serves` at `:193-197`.
- `test/wasm-service/wasm-creation-genesis.integration.test.js`: old `:50`
  `assert.equal(host.replica.pendingLeaderNodeUpdate, null)` becomes `:54-56` (null unless the
  replica is PRESENT and leading; then its nodeId). The comment is at `:47-50`.
- `test/wasm-service/wasm-creation-reconciliation.integration.test.js`: old `:54` (same assertion,
  in `assertServed`) becomes `:62-63`, through `expectedLeaderPublication`. The comment and helper
  are at `:50-57`.
- `test/runtime/wasm-driver-contract-conformance.test.js`: appended at `:295-298`
  (`'markServicesRowPresent'` added to the prototype allowlist).
- `test/rebalancer/replica-status-completeness.property.test.js`: appended at `:50-53` (`'held'`).
- `test/node/runtime-service-handler.test.js`: appended at `:76-81` (mock
  `resumeConsensusCreation` returns UNAVAILABLE).
- `test/rebalancer/runtime-service-replace-canonical-target-handoff.test.js`: appended at `:167-171`
  (the same mock answer).

## F-4

Recorded for the activation quest; no change.

## F-7: the helper and its call sites

The helper is `journaledIntent(row, operationId)` in `src/service/service-consensus-creation-intent.js`.

- Old, inside `recoverConsensusCreation`, after `if (row === null) return {outcome:
  RESULT.INTENT_NOT_FOUND};`, these statements ran inline:
  - `const encoded = row[COL.INTENT_JSON];`
  - `requireInstance(typeof encoded === 'string' && Buffer.byteLength(encoded) <= INTENT_BYTES,
    OUTCOME.CORRUPT_STATE);`
  - `let intent;`
  - `try { intent = captureIntent(JSON.parse(encoded)); } catch { requireInstance(false,
    OUTCOME.CORRUPT_STATE); }`
  - `requireInstance(intent.consensusSlotRequest.operationId === operationId,
    OUTCOME.CONTENT_CONFLICT);`
- New: those same statements, in the same order, are the body of `journaledIntent`, which returns
  `intent`.
- The call sites are `recoverConsensusCreation`
  (`const intent = journaledIntent(row, operationId);`, inside the same try/`instanceFailure`) and
  `retainedRowAnswer`, the second half of `readRetainedCreation`.
- Behaviour is byte-equivalent: the same reads, the same thrown contract errors in the same order,
  and the same caller try.

## F-8

The choice is recorded in a comment at the EP_META owner (`src/wasm-service/service-endpoint-builder.js`).

## Process

Every run in this round went through `npm run test:file`, behind `run1.sh` (thermal gate plus a
check that no other runner is active), serially.

## Round-2 single-file results (all `rc=0`, except one)

- New or changed for this round:
  - `request-cell-definition-classification`, `runtime-service-bound-route`,
    `service-runtime-consensus-publication`, `bound-creation-handler-embedding.integration`.
  - `wasm-creation-publication.integration` (23/23).
- Stage-1 natives: `wasm-retained-bootstrap.integration`, `wasm-creation-reconciliation.integration`,
  `wasm-creation-genesis.integration`, `wasm-creation-bound-native`.
- Driver and request-Cell paths: `wasm-component-driver`,
  `minimal-deployment-request-cell-runtime-readiness`, `minimal-deployment-request-cell-routing`,
  `minimal-deployment-single-contract-owner-guard`.
- Manager and handler: `service-lifecycle-manager`, `service-consensus-creation-intent`,
  `runtime-service-handler`, `replica-status-completeness`,
  `runtime-service-replace-canonical-target-handoff`.
- Runtime: `wasm-api-compat`, `runtime-startup-wiring`, `service-runtime-lifecycle`.
- The exception: `wasm-driver-contract-conformance` is `rc=1` with a failing set identical to the
  base's (F-9).

## Round-2 statics

- fast-static `--base b3793c7e5`: "fast-static: ok", all stages ok.
- Decision boundaries `--json` over the 24 touched src files: "new 0 raw 6 inherited 6".
- eslint on the 37 touched JS files: 0 problems.
- Scoped complexity: 5 violations, the same 5 as on the base, 0 new.
- Cognitive: 0 violations.
- Literals: 0 new.
- Silent-catch: the same single violation as on the base (`writeAndObserve:93`).
- Runtime grammar: 0 violations; pressure check pass.
- audit:shards: OK at 2409 tests, after regenerating with the producers to add the new owner
  witness.
- Unused-export ratchet: 1456, equal to the base (which already exceeds 1416). No new unused
  exports.
- File size: 26/27.

## Lab selection

85 files (`scratchpad/reports/lab-selection.txt`): the round-1 83 plus
`test/runtime/request-cell-definition-classification.test.js` and
`test/service/minimal-deployment-single-contract-owner-guard.test.js`.

## New files this round

- `test/runtime/request-cell-definition-classification.test.js`

## New evidence this round

- `mutations-1c/M18-*`, `M18b-*`, `M19a-*`, `M19b-*`, `summary-4.txt`, `src-sha-before-r4.txt`
- `reports/b-r4-*.txt`, `b-r4b-*.txt`, `fast-static-4.txt`
