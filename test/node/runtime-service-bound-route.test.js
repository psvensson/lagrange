// Stage-1c node-side routing witnesses (design ACTIVATION-DISCOVERY-DESIGN-20261017,
// Revision 3 governs, then Revision 2, Revision 1). Component scope: the real
// RuntimeServiceHandler, the real ServiceLifecycleManager over the component
// SQLite journal and metadata owner (production owner/gateway/CDC), a real
// ExecutorOutcomeEmitter, and a SCRIPTED runtime behind the real
// RuntimeServiceAdapter that answers the bound START/STOP result shapes the
// manager must map. No native WASM here: the native C6 embedding lives in
// test/wasm-service/bound-creation-handler-embedding.integration.test.js.
// CREATE/REMOVE payloads are authored from ReplicaOperationField keys (the
// coordinator literal at operation-workflow-dispatch-response-reconcile.js is
// the activation quest's owner; RV2.6 permits authoring from the keys).
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createOriginFixture} from '../service/service-consensus-creation-fixture.js';
import {RuntimeServiceHandler} from '../../src/node/runtime-service-handler.js';
import {RuntimeServiceAdapter} from '../../src/service/adapters/runtime-service-adapter.js';
import {ServiceLifecycleManager} from '../../src/service/service-lifecycle-manager.js';
import {ExecutorOutcomeEmitter, OUTCOME_EVENT_NAME} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {EXECUTOR_OUTCOME_ACTION, EXECUTOR_OUTCOME_ACTION_MAP, EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaOperationField, ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus, isPeerRowStatusAdmissible, isValidStatus} from
  '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {RUNTIME_SERVICE_HANDLER_ERROR_MSG, RUNTIME_SERVICE_CREATION_WAKE_OUTCOME} from
  '../../src/node/runtime-service-handler-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {serializeServiceDefinition} from '../../src/wasm-service/wasm-service-models.js';
import {selectInstanceState} from '../../src/control-plane/owners/service-instance-state.js';

const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
const NODE_ID = 'host-1';
const DRAIN_TURNS = 200;
const HELD_STATUS = 'BOOTSTRAPPED_HELD';
const NATIVE_ENTITY = 'sys-postgres-wire';
const NATIVE_ROW = Object.freeze({service_id: NATIVE_ENTITY, service_type: 'runtime_service',
  runtime_kind: 'native_js', runtime_ref: 'postgres-wire-runtime',
  runtime_config: JSON.stringify({host: '127.0.0.1', authMode: 'trust', tlsMode: 'disable'})});

function quietLogging() {
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'error'});
}

function cacheOf(rows) {
  const tables = new Map();
  for (const [table, list] of Object.entries(rows)) {
    tables.set(table, new Map(list.map((row) => [row.service_id, row])));
  }
  const all = (table) => [...(tables.get(table)?.values() ?? [])];
  return {
    get: (table, key) => tables.get(table)?.get(key) ?? null,
    getAll: all,
    filter: (table, predicate) => all(table).filter(predicate),
    find: (table, predicate) => all(table).find(predicate),
    put: (table, row) => {
      if (!tables.has(table)) tables.set(table, new Map());
      tables.get(table).set(row.service_id, row);
    },
  };
}

// A runtime that answers the scripted bound START/STOP shapes. Every answer
// echoes the exact binding/token the manager handed down, so the manager's own
// equality checks run unchanged.
function scriptedRuntime() {
  const runtime = {calls: [], starts: [], stops: []};
  let currentCreation = null;
  const origin = (handle) => {
    const creation = handle?.consensusCreation;
    return creation ? {operationId: creation.operationId, intent: creation.intent,
      token: creation.token} : null;
  };
  const bound = (handle) => ({consensusBinding: handle.consensusCreation.intent.consensusBinding,
    consensusResourceToken: handle.consensusCreation.token});
  const STARTS = {
    HELD: (handle) => ({status: HELD_STATUS, ...bound(handle)}),
    PUBLISHED: (handle) => ({status: 'PUBLISHED', started: true, bootstrapped: true, port: 9100,
      ...bound(handle)}),
    PUBLISHED_UNPROJECTED: (handle) => ({status: 'PUBLISHED_UNPROJECTED', started: true,
      bootstrapped: true, port: 9100, projection: {outcome: 'ENDPOINT_WRITE_FAILED'},
      ...bound(handle)}),
    FAILED: () => ({status: 'FAILED', error: 'port_allocator_unavailable'}),
    // A driver FAILED answer carrying the open's typed code (design
    // RECOVERY-DESIGN-20261017 R1-B): permanent, unavailable, transient.
    STORAGE_MISSING: () => ({status: 'failed', error: 'refused',
      outcome: 'CREATION_STORAGE_MISSING'}),
    OPEN_UNAVAILABLE: () => ({status: 'failed', error: 'refused', outcome: 'UNAVAILABLE'}),
    REPLICA_LIVE: () => ({status: 'failed', error: 'refused',
      outcome: 'wasm_service_replica_live'}),
  };
  Object.assign(runtime, {
    async prepare(definition, context) {
      runtime.calls.push({kind: 'prepare', bound: Boolean(context?.consensusCreation),
        definition});
      if (context?.consensusCreation) currentCreation = structuredClone(origin(context));
      return {status: 'READY'};
    },
    // Scripted physical-owner contract only. The independent native custody
    // file verifies the actual lifecycle's complete intent/token/state rules.
    observeCurrentCreation(handle) {
      if (currentCreation === null) return {outcome: 'ABSENT'};
      return {outcome: isDeepStrictEqual(currentCreation, origin(handle)) ? 'CURRENT' : 'DIFFERENT'};
    },
    async start(handle) {
      runtime.calls.push({kind: 'start', bound: Boolean(handle?.consensusCreation)});
      if (!handle?.consensusCreation) return {status: 'RUNNING'};
      return STARTS[runtime.starts.shift() ?? 'HELD'](handle);
    },
    async stop(handle) {
      runtime.calls.push({kind: 'stop', bound: Boolean(handle?.consensusCreation)});
      const result = runtime.stops.shift() ??
        {outcome: 'CLOSED', retired: true, closed: true, finality: 'FINAL'};
      if (result.retired === true && isDeepStrictEqual(currentCreation, origin(handle))) {
        currentCreation = null;
      }
      return result;
    },
    async health() {
      return {status: 'healthy'};
    },
  });
  return runtime;
}

function boundRow(serviceId) {
  // A real-shaped service_definitions row of an installed wasm_component package,
  // as the serializer writes it: the binding_* columns are present with null
  // values (finding F-3); not a request Cell, not a built-in meta service.
  return serializeServiceDefinition({serviceId, serviceName: serviceId,
    handlerFunctionId: 'handler', runtimeKind: 'wasm_component',
    runtimeRef: 'fixture/component@1.0.0', runtimeConfig: '{}'}, 1000);
}

function cellRow(serviceId) {
  return serializeServiceDefinition({serviceId, serviceName: serviceId,
    handlerFunctionId: 'handler', runtimeKind: 'wasm_component',
    runtimeRef: 'fixture/component@1.0.0', runtimeConfig: '{}',
    bindingVersionId: 'binding-version-1', bindingDigest: `sha256:${'b'.repeat(64)}`,
    bindingProjection: '{"binding_version_id":"binding-version-1"}'}, 1000);
}

async function world(t, {journal = true, rows = null} = {}) {
  quietLogging();
  const metadata = await createOriginFixture({after: (fn) => t.after(fn)},
    {canonicalFounders: true});
  const runtime = scriptedRuntime();
  const manager = journal ? metadata.manager() : new ServiceLifecycleManager({logger: QUIET});
  manager.registerAdapter(new RuntimeServiceAdapter({serviceRuntimeLifecycle: runtime}));
  const emitter = new ExecutorOutcomeEmitter({logger: QUIET});
  const outcomes = [];
  emitter.on(OUTCOME_EVENT_NAME, (outcome) => outcomes.push(outcome));
  const cache = cacheOf(rows ?? {service_definitions: [boundRow(metadata.serviceId), NATIVE_ROW],
    services: []});
  const handler = new RuntimeServiceHandler({nodeId: NODE_ID, systemTableCache: cache,
    cdcIntegrationService: {}, serviceLifecycleManager: manager, executorOutcomeEmitter: emitter});
  handler.logger = QUIET;
  handler.initialize();
  return {metadata, runtime, manager, emitter, outcomes, cache, handler,
    operationId: metadata.intent.consensusSlotRequest.operationId,
    replicaId: metadata.intent.consensusSlotRequest.replicaId};
}

function createRequest(entityId, replicaId, operationId) {
  return {[ReplicaOperationField.TYPE]: ReplicaOperationMessageType.CREATE_REPLICA,
    [ReplicaOperationField.OPERATION_ID]: operationId,
    [ReplicaOperationField.OPERATION_TYPE]: 'ADD',
    [ReplicaOperationField.PARTITION_ID]: entityId,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.ENTITY_TYPE]: 'runtime_service',
    [ReplicaOperationField.ENTITY_ID]: entityId};
}

function removeRequest(entityId, replicaId, operationId) {
  return {...createRequest(entityId, replicaId, operationId),
    [ReplicaOperationField.TYPE]: ReplicaOperationMessageType.REMOVE_REPLICA,
    [ReplicaOperationField.OPERATION_TYPE]: 'REMOVE'};
}

async function drain(handler) {
  for (let turn = 0; turn < DRAIN_TURNS; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    if (handler.inProgressOperations.size === 0) return;
  }
  assert.fail('handler async work did not settle in the declared turns');
}

async function create(w, entityId = w.metadata.serviceId, replicaId = w.replicaId,
  operationId = w.operationId) {
  const reply = await w.handler.handleCreateReplica(createRequest(entityId, replicaId,
    operationId));
  await drain(w.handler);
  return reply;
}

function lastOutcome(w) {
  return w.outcomes.at(-1) ?? null;
}

function assertRemoveCompleted(w) {
  assert.equal(lastOutcome(w).outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED);
}

describe('stage 1c: RuntimeServiceHandler bound CREATE route (RV2.2, RV3.2, RV3.3)', () => {
  test('C6-1 a retained creation answering HELD -> memo HELD + CREATE_HELD at the CREATING step',
    async (t) => {
      const w = await world(t);
      assert.equal((await w.metadata.prepare()).outcome, 'ADMISSION_RETAINED');
      const reply = await create(w);
      assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED);
      const memo = w.handler.getLocalReplica(w.replicaId);
      assert.equal(memo.status, ReplicaStatus.HELD);
      assert.equal(memo.operationId, w.operationId);
      assert.deepEqual(w.outcomes.map((o) => [o.outcomeType, o.workflowStep]),
        [[EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_HELD, WORKFLOW_STEP.CREATING]]);
      assert.equal(w.runtime.calls.filter((call) => call.kind === 'start' && call.bound).length, 1,
        'the bound START ran once; the generic create never ran');
      assert.equal(w.runtime.calls.some((call) => !call.bound), false);
    });

  test('PUBLISHED_UNPROJECTED keeps the memo HELD; a confirmed PUBLISHED answers ACTIVE',
    async (t) => {
      const w = await world(t);
      const retained = await w.metadata.prepare();
      const granted = await w.metadata.primary.grantInstanceResource(
        retained.intent.consensusBinding, retained.token);
      assert.equal(granted.outcome, 'PUBLISHED', JSON.stringify(granted));
      w.runtime.starts.push('PUBLISHED_UNPROJECTED');
      await create(w);
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.HELD);
      assert.equal(lastOutcome(w).outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_HELD);
      assert.equal(w.manager._replicaStateById.get(w.replicaId).state, 'starting',
        'a confirmed PUBLISHED_UNPROJECTED keeps STARTING (Revision 4)');
      w.runtime.starts.push('PUBLISHED');
      const reply = await create(w);
      assert.equal(reply.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'a duplicate CREATE while HELD re-enters and answers IN_PROGRESS (C6-3)');
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.ACTIVE);
      assert.equal(w.manager._replicaStateById.get(w.replicaId).state, 'running');
      assert.deepEqual([lastOutcome(w).outcomeType, lastOutcome(w).workflowStep],
        [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE, WORKFLOW_STEP.ACTIVE]);
    });

  test('Revision 4: a PUBLISHED_UNPROJECTED answer for an ungranted slot is contradicted and retired',
    async (t) => {
      const w = await world(t);
      await w.metadata.prepare();
      w.runtime.starts.push('PUBLISHED_UNPROJECTED');
      await create(w);
      const outcome = lastOutcome(w);
      assert.equal(outcome.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED);
      assert.equal(outcome.errorCode, 'CONTENT_CONFLICT');
      assert.ok(w.runtime.calls.some((call) => call.kind === 'stop' && call.bound),
        'the contradicted resource was retired by its creation');
      assert.notEqual(w.manager._replicaStateById.get(w.replicaId)?.state, 'running');
    });

  test('UNKNOWN after retention is the handler-typed deferral: CREATE_FAILED + deferRetry, memo FAILED',
    async (t) => {
      const w = await world(t);
      await w.metadata.prepare();
      w.runtime.starts.push('FAILED');
      await create(w);
      const outcome = lastOutcome(w);
      assert.equal(outcome.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED);
      assert.equal(outcome.deferRetry, true);
      assert.equal(outcome.errorCode, 'CONSENSUS_SERVING_NOT_IMPLEMENTED');
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.FAILED,
        'after a deferral the memo is FAILED (re-enterable), never CREATING');
    });

  test('TERMINAL_OPERATION is a permanent CREATE_FAILED with its code (slot not live)',
    async (t) => {
      const w = await world(t);
      await w.metadata.prepare();
      w.metadata.db.prepare('UPDATE wasm_operations SET state = ? WHERE operation_id = ?')
        .run('completed', w.operationId);
      await create(w);
      const outcome = lastOutcome(w);
      assert.equal(outcome.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED);
      assert.equal(outcome.errorCode, 'TERMINAL_OPERATION');
      assert.equal(outcome.deferRetry, undefined);
    });

  test('C6-4 a definitive INTENT_NOT_FOUND for a bound-class definition is BOUND_ROUTE_REQUIRED',
    async (t) => {
      const w = await world(t);
      await create(w);
      const outcome = lastOutcome(w);
      assert.equal(outcome.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED);
      assert.equal(outcome.errorCode, RUNTIME_SERVICE_HANDLER_ERROR_MSG.BOUND_ROUTE_REQUIRED);
      assert.equal(outcome.deferRetry, undefined, 'a definitive absence is not deferred');
      assert.equal(w.runtime.calls.length, 0, 'no generic create for a bound-class definition');
      assert.ok(Object.hasOwn(boundRow('x'), 'binding_projection'),
        'the refused row is real-shaped: binding_* keys present with null values');
    });

  test('C6-5 an unavailable journal read defers a bound-class CREATE; never NOT_FOUND',
    async (t) => {
      const w = await world(t);
      w.metadata.setReadFault('JOURNAL_READ_UNAVAILABLE');
      await create(w);
      const outcome = lastOutcome(w);
      assert.equal(outcome.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED);
      assert.equal(outcome.deferRetry, true);
      assert.equal(outcome.errorCode, 'UNAVAILABLE');
      assert.notEqual(outcome.errorCode, RUNTIME_SERVICE_HANDLER_ERROR_MSG.BOUND_ROUTE_REQUIRED);
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.FAILED);
    });

  test('a native_js definition with no retained creation takes the generic path, journal or not',
    async (t) => {
      for (const journal of [true, false]) {
        const w = await world(t, {journal});
        await create(w, NATIVE_ENTITY, `${NATIVE_ENTITY}-r1`, `native-op-${journal}`);
        assert.ok(w.runtime.calls.some((call) => call.kind === 'prepare' && !call.bound),
          `journal=${journal}: the generic create ran`);
        assert.equal(lastOutcome(w).outcomeType,
          EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE, JSON.stringify(w.outcomes));
      }
    });

  test('cell (a) production-shaped manager (no journal): native_js and Cell generic, bound-class deferred',
    async (t) => {
      const cellId = 'req-cell-a';
      const w = await world(t, {journal: false, rows: {services: [], service_definitions: [
        NATIVE_ROW, cellRow(cellId), boundRow('bound-a')]}});
      await create(w, NATIVE_ENTITY, `${NATIVE_ENTITY}-r1`, 'op-native');
      assert.equal(lastOutcome(w).outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE);
      await create(w, cellId, `${cellId}-r1`, 'op-cell');
      assert.equal(w.runtime.calls.filter((call) => call.kind === 'prepare' && !call.bound).length, 2,
        'the request Cell kept its generic path');
      await create(w, 'bound-a', 'bound-a-r1', 'op-bound');
      const deferred = lastOutcome(w);
      assert.deepEqual({type: deferred.outcomeType, deferRetry: deferred.deferRetry,
        errorCode: deferred.errorCode, step: deferred.workflowStep},
      {type: EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED, deferRetry: true,
        errorCode: 'UNAVAILABLE', step: WORKFLOW_STEP.FAILED},
      'the emitted payload is the handler-typed deferral (RV3.2); the coordinator FAILs it today');
      assert.equal(w.runtime.calls.filter((call) => call.kind === 'prepare').length, 2);
    });
});

describe('stage 1c: HELD re-entry and the node-local wake consumer (RV2.4, RV3.5)', () => {
  test('F9 a duplicate CREATE while a HELD re-entry is in flight starts no second resume',
    async (t) => {
      const w = await world(t);
      await w.metadata.prepare();
      await create(w);
      let resumes = 0;
      const resume = w.manager.resumeConsensusCreation.bind(w.manager);
      w.manager.resumeConsensusCreation = (...args) => {
        resumes += 1;
        return resume(...args);
      };
      const request = createRequest(w.metadata.serviceId, w.replicaId, w.operationId);
      const first = await w.handler.handleCreateReplica(request);
      const second = await w.handler.handleCreateReplica(request);
      assert.equal(first.status, ReplicaOperationResponseStatus.IN_PROGRESS);
      assert.equal(second.status, ReplicaOperationResponseStatus.IN_PROGRESS);
      await drain(w.handler);
      assert.equal(resumes, 1, 'exactly one re-entry for two duplicate CREATEs');
    });

  test('a wake naming the HELD operation re-enters once; a wake during it is recorded and consumed',
    async (t) => {
      const w = await world(t);
      const retained = await w.metadata.prepare();
      await create(w);
      const wake = {reason: 'creation_genesis_observed', binding: retained.intent.consensusBinding,
        token: retained.token};
      assert.equal(w.handler.onCreationWake(w.metadata.serviceId, wake).outcome,
        RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.QUEUED);
      assert.equal(w.handler.onCreationWake(w.metadata.serviceId, wake).outcome,
        RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.RECORDED,
        'a wake while the re-entry is in flight is recorded, not run twice');
      await drain(w.handler);
      const starts = w.runtime.calls.filter((call) => call.kind === 'start').length;
      assert.equal(starts, 3, 'CREATE, the wake re-entry, then the recorded wake once');
    });

  test('C6-10 a wake naming no local operation answers NO_LOCAL_OPERATION and runs nothing',
    async (t) => {
      const w = await world(t);
      const retained = await w.metadata.prepare();
      const answer = w.handler.onCreationWake(w.metadata.serviceId, {
        reason: 'creation_genesis_observed', binding: retained.intent.consensusBinding,
        token: retained.token});
      assert.equal(answer.outcome, RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.NO_LOCAL_OPERATION);
      await drain(w.handler);
      assert.equal(w.runtime.calls.length, 0);
    });
});

describe('stage 1c round 3: the HELD creation keeps custody (RV5.1, RV5.2, RV5.3)', () => {
  const OTHER_OPERATION = 'another-operation-id';
  const SUCCESSOR_OPERATION = 'successor-operation-0';

  // Every resume the manager answers: its operation id and the most resumes
  // that ran at once (a second resume beside an in-flight one is a bypassed guard).
  function trackResumes(w) {
    const seen = {ids: [], active: 0, maxActive: 0};
    const resume = w.manager.resumeConsensusCreation.bind(w.manager);
    w.manager.resumeConsensusCreation = async (operationId, ...rest) => {
      seen.ids.push(operationId);
      seen.active += 1;
      seen.maxActive = Math.max(seen.maxActive, seen.active);
      try {
        return await resume(operationId, ...rest);
      } finally {
        seen.active -= 1;
      }
    };
    return seen;
  }

  async function heldWorld(t) {
    const w = await world(t);
    const retained = await w.metadata.prepare();
    await create(w);
    const held = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([held.status, held.operationId], [ReplicaStatus.HELD, w.operationId]);
    return {w, retained, held};
  }

  function boundStarts(w) {
    return w.runtime.calls.filter((call) => call.kind === 'start' && call.bound).length;
  }

  test('RV5.1 a CREATE under another operation id for a HELD replica keeps the memo creation, ' +
    're-enters it once, emits under its id; the next REMOVE is bound', async (t) => {
    const {w} = await heldWorld(t);
    const resumed = trackResumes(w);
    const from = w.outcomes.length;
    const reply = await create(w, w.metadata.serviceId, w.replicaId, OTHER_OPERATION);
    assert.equal(reply.status, ReplicaOperationResponseStatus.IN_PROGRESS);
    assert.deepEqual(resumed.ids, [w.operationId], 'REENTRY_RESUMED_THE_REQUEST_ID');
    const memo = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([memo.status, memo.operationId], [ReplicaStatus.HELD, w.operationId],
      'CREATION_LINK_DROPPED');
    assert.deepEqual(w.outcomes.slice(from).map((o) => [o.outcomeType, o.operationId]),
      [[EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_HELD, w.operationId]],
      'the re-entry outcome names the creation, never the request');
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId,
      'remove-rv51'));
    await drain(w.handler);
    assert.deepEqual(w.runtime.calls.filter((call) => call.kind === 'stop').map((call) => call.bound),
      [true], 'REMOVE_TOOK_THE_GENERIC_STOP');
    assertRemoveCompleted(w);
  });

  test('RV5.1 a wake during that re-entry is RECORDED on the creation in-flight entry; ' +
    'no second resume runs beside it', async (t) => {
    const {w, retained} = await heldWorld(t);
    const resumed = trackResumes(w);
    const reply = await w.handler.handleCreateReplica(createRequest(w.metadata.serviceId,
      w.replicaId, OTHER_OPERATION));
    assert.equal(reply.status, ReplicaOperationResponseStatus.IN_PROGRESS);
    const wake = {reason: 'creation_genesis_observed', binding: retained.intent.consensusBinding,
      token: retained.token};
    assert.equal(w.handler.onCreationWake(w.metadata.serviceId, wake).outcome,
      RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.RECORDED, 'WAKE_MISSED_THE_IN_FLIGHT_CREATION');
    assert.equal(w.handler.inProgressOperations.get(w.operationId)?.wakePending, true);
    await drain(w.handler);
    assert.equal(resumed.maxActive, 1, 'A_SECOND_RESUME_RAN_BESIDE_THE_REENTRY');
    assert.deepEqual(resumed.ids, [w.operationId, w.operationId],
      'the re-entry, then the recorded wake consumed once, both under the creation id');
  });

  test('RV5.2 a BOUND_ROUTE_REQUIRED refusal for a request naming no creation leaves a HELD memo ' +
    'untouched (outcome under the request id)', async (t) => {
    const {w, held} = await heldWorld(t);
    await w.handler.createReplicaAsync({operationId: OTHER_OPERATION,
      entityId: w.metadata.serviceId, replicaId: w.replicaId});
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), held, 'NAMELESS_SETTLE_OVERWROTE_MEMO');
    const outcome = lastOutcome(w);
    assert.deepEqual([outcome.outcomeType, outcome.operationId, outcome.errorCode],
      [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED, OTHER_OPERATION,
        RUNTIME_SERVICE_HANDLER_ERROR_MSG.BOUND_ROUTE_REQUIRED]);
  });

  test('RV5.2 the catch path before the resume answers a retained class leaves a ' +
    'creation-naming memo untouched', async (t) => {
    const {w, held} = await heldWorld(t);
    const emit = w.handler.emitExecutorOutcome.bind(w.handler);
    let faulted = false;
    w.handler.emitExecutorOutcome = (...args) => {
      if (!faulted) {
        faulted = true;
        throw new Error('EMITTER_FAULT');
      }
      return emit(...args);
    };
    await w.handler.createReplicaAsync({operationId: OTHER_OPERATION,
      entityId: w.metadata.serviceId, replicaId: w.replicaId});
    assert.equal(faulted, true, 'the emitter fault was injected');
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), held, 'CATCH_PATH_NAMED_THE_REQUEST');
    const outcome = lastOutcome(w);
    assert.deepEqual([outcome.outcomeType, outcome.operationId, outcome.deferRetry],
      [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED, OTHER_OPERATION, true]);
  });

  test('RV5.3 a wake without a token operation id is NO_LOCAL_OPERATION, never matched to a ' +
    'nameless memo', async (t) => {
    const w = await world(t);
    await create(w, NATIVE_ENTITY, `${NATIVE_ENTITY}-r1`, 'native-op');
    const memo = w.handler.getLocalReplica(`${NATIVE_ENTITY}-r1`);
    assert.deepEqual([memo.status, memo.operationId], [ReplicaStatus.ACTIVE, undefined]);
    for (const wake of [{reason: 'creation_genesis_observed'},
      {reason: 'creation_genesis_observed', token: {}}]) {
      assert.equal(w.handler.onCreationWake(NATIVE_ENTITY, wake).outcome,
        RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.NO_LOCAL_OPERATION, JSON.stringify(wake));
    }
  });

  test('RV5.3 a RESOURCE_CLOSED wake during the first START is recorded and re-enters nothing',
    async (t) => {
      const w = await world(t);
      const retained = await w.metadata.prepare();
      const reply = await w.handler.handleCreateReplica(createRequest(w.metadata.serviceId,
        w.replicaId, w.operationId));
      assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED);
      assert.equal(w.handler.onCreationWake(w.metadata.serviceId, {
        reason: 'creation_resource_closed', binding: retained.intent.consensusBinding,
        token: retained.token}).outcome, RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.RECORDED);
      await drain(w.handler);
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.HELD);
      assert.equal(boundStarts(w), 1, 'CLOSED_WAKE_REENTERED');
    });

  // A named deferral memo (RV3.2): the retained creation's START answered FAILED.
  async function deferredWorld(t) {
    const w = await world(t);
    await w.metadata.prepare();
    w.runtime.starts.push('FAILED');
    await create(w);
    const deferred = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([deferred.status, deferred.operationId],
      [ReplicaStatus.FAILED, w.operationId]);
    return {w, deferred};
  }

  test('RV6.3 (P5) a CREATE under another id while the memo is REMOVING keeps the creation, is ' +
    'deferred typed with RETIREMENT_IN_PROGRESS, and the re-REMOVE is bound and completes',
  async (t) => {
    const {w} = await heldWorld(t);
    w.runtime.stops.push({outcome: 'CLOSE_UNRESOLVED', retired: true, closed: false,
      finality: 'UNRESOLVED', close: {outcome: 'UNKNOWN'}},
    {outcome: 'CLOSED', retired: true, closed: true, finality: 'FINAL'});
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-p5'));
    await drain(w.handler);
    const removing = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([removing.status, removing.operationId],
      [ReplicaStatus.REMOVING, w.operationId]);
    const resumed = trackResumes(w);
    const reply = await create(w, w.metadata.serviceId, w.replicaId, OTHER_OPERATION);
    assert.equal(reply.status, ReplicaOperationResponseStatus.IN_PROGRESS,
      'A_CREATE_WAS_ACCEPTED_OVER_A_RETIREMENT');
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), removing,
      'TRACKER_OVERWROTE_THE_REMOVING_MEMO');
    assert.deepEqual(resumed.ids, [], 'nothing was routed for the CREATE');
    const outcome = lastOutcome(w);
    assert.deepEqual([outcome.outcomeType, outcome.operationId, outcome.errorCode,
      outcome.deferRetry], [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED, OTHER_OPERATION,
      RUNTIME_SERVICE_HANDLER_ERROR_MSG.RETIREMENT_IN_PROGRESS, true]);
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-p5'));
    await drain(w.handler);
    assert.deepEqual(w.runtime.calls.filter((call) => call.kind === 'stop').map((call) => call.bound),
      [true, true], 'REMOVE_TOOK_THE_GENERIC_STOP');
    assertRemoveCompleted(w);
  });

  test('RV6.1 the in-progress tracker never writes a creation-naming memo: a CREATE after a ' +
    'completed bound REMOVE is tracked only and its refusal leaves the memo', async (t) => {
    const {w} = await heldWorld(t);
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-61'));
    await drain(w.handler);
    const removed = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([removed.status, removed.operationId], [ReplicaStatus.REMOVED, w.operationId]);
    const reply = await w.handler.handleCreateReplica(createRequest(w.metadata.serviceId,
      w.replicaId, OTHER_OPERATION));
    assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED);
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), removed,
      'TRACKER_OVERWROTE_A_NAMED_MEMO');
    assert.equal(w.handler.inProgressOperations.has(OTHER_OPERATION), true,
      'the request is tracked in flight');
    await drain(w.handler);
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), removed);
    assert.deepEqual([lastOutcome(w).operationId, lastOutcome(w).errorCode],
      [OTHER_OPERATION, RUNTIME_SERVICE_HANDLER_ERROR_MSG.BOUND_ROUTE_REQUIRED]);
  });

  test('RV6.2 (P6) a CREATE under another id while the memo is a named deferral keeps the ' +
    'creation, re-enters it once under its id, and the next REMOVE is bound', async (t) => {
    const {w} = await deferredWorld(t);
    const resumed = trackResumes(w);
    const from = w.outcomes.length;
    const reply = await create(w, w.metadata.serviceId, w.replicaId, OTHER_OPERATION);
    assert.equal(reply.status, ReplicaOperationResponseStatus.IN_PROGRESS);
    assert.deepEqual(resumed.ids, [w.operationId], 'NAMED_DEFERRAL_NOT_REENTERED_UNDER_ITS_ID');
    const memo = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([memo.status, memo.operationId], [ReplicaStatus.HELD, w.operationId]);
    assert.deepEqual(w.outcomes.slice(from).map((o) => [o.outcomeType, o.operationId]),
      [[EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_HELD, w.operationId]]);
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-p6'));
    await drain(w.handler);
    assert.deepEqual(w.runtime.calls.filter((call) => call.kind === 'stop').map((call) => call.bound),
      [true], 'REMOVE_TOOK_THE_GENERIC_STOP');
    assertRemoveCompleted(w);
  });

  test('RV6.2 the same-id retry of a named deferral re-enters it once', async (t) => {
    const {w} = await deferredWorld(t);
    const resumed = trackResumes(w);
    const request = createRequest(w.metadata.serviceId, w.replicaId, w.operationId);
    const replies = [await w.handler.handleCreateReplica(request),
      await w.handler.handleCreateReplica(request)];
    assert.deepEqual(replies.map((reply) => reply.status),
      [ReplicaOperationResponseStatus.IN_PROGRESS, ReplicaOperationResponseStatus.IN_PROGRESS]);
    await drain(w.handler);
    assert.deepEqual(resumed.ids, [w.operationId], 'exactly one re-entry for two retries');
    assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.HELD);
  });

  test('RV6.4 (P8) a nameless HELD memo answers the ERROR reply with CORRUPT_LOCAL_MEMO, memo ' +
    'untouched, nothing emitted', async (t) => {
    const w = await world(t);
    await w.metadata.prepare();
    w.handler.registerExistingReplica({replicaId: w.replicaId, entityId: w.metadata.serviceId,
      status: ReplicaStatus.HELD});
    const corrupt = w.handler.getLocalReplica(w.replicaId);
    const resumed = trackResumes(w);
    const reply = await create(w, w.metadata.serviceId, w.replicaId, OTHER_OPERATION);
    assert.deepEqual(
      {status: reply.status, errorCode: reply.errorCode, deferRetry: reply.deferRetry},
      {status: ReplicaOperationResponseStatus.ERROR,
        errorCode: RUNTIME_SERVICE_HANDLER_ERROR_MSG.CORRUPT_LOCAL_MEMO, deferRetry: false});
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), corrupt);
    assert.deepEqual([resumed.ids, w.outcomes, w.runtime.calls], [[], [], []],
      'NAMELESS_HELD_RESUMED_THE_REQUEST');
  });

  // A permanently failed named memo (RV7.1): the creation row is terminal.
  async function terminalWorld(t) {
    const w = await world(t);
    await w.metadata.prepare();
    w.metadata.db.prepare('UPDATE wasm_operations SET state = ? WHERE operation_id = ?')
      .run('completed', w.operationId);
    await create(w);
    const terminal = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([terminal.status, terminal.operationId, terminal.deferRetry],
      [ReplicaStatus.FAILED, w.operationId, undefined]);
    assert.equal(lastOutcome(w).errorCode, 'TERMINAL_OPERATION');
    return {w, terminal};
  }

  test('RV7.2 (P14) a permanently failed named memo does not capture a CREATE under another id: ' +
    'the request proceeds under its own id; an unrouted request is refused, memo untouched',
  async (t) => {
    const {w, terminal} = await terminalWorld(t);
    const resumed = trackResumes(w);
    const reply = await create(w, w.metadata.serviceId, w.replicaId, OTHER_OPERATION);
    assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED,
      'A_DEAD_CREATION_CAPTURED_THE_REQUEST');
    assert.deepEqual(resumed.ids, [OTHER_OPERATION], 'the request was routed under its own id');
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), terminal);
    assert.deepEqual([lastOutcome(w).outcomeType, lastOutcome(w).operationId,
      lastOutcome(w).errorCode], [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
      OTHER_OPERATION, RUNTIME_SERVICE_HANDLER_ERROR_MSG.BOUND_ROUTE_REQUIRED]);
  });

  test('RV7.2 (P15) I retired, a late duplicate of I answers RESOURCE_CLOSED, then J founder ' +
    'CREATE for the same canonical replica resumes J and the memo is named J', async (t) => {
    const {w, retained} = await heldWorld(t);
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-i'));
    await drain(w.handler);
    assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.REMOVED);
    const binding = retained.intent.consensusBinding;
    const owner = w.metadata.primary;
    assert.equal((await owner.releaseInstanceResource(binding, retained.token)).outcome,
      'RELEASING');
    assert.equal((await owner.closeInstanceResource(binding, retained.token)).outcome, 'CLOSED');
    const late = await create(w);
    assert.equal(late.status, ReplicaOperationResponseStatus.INITIATED);
    const dead = w.handler.getLocalReplica(w.replicaId);
    // SUPERSEDED (design RECOVERY-DESIGN-20261017 R1-D/D-R6: the REMOVE now
    // completes the creation row at CLOSED, so the late duplicate is the
    // permanent TERMINAL answer, RV7.1); successor line appended below.
    // assert.deepEqual([dead.status, dead.operationId, dead.deferRetry, lastOutcome(w).errorCode],
    //   [ReplicaStatus.FAILED, w.operationId, undefined, 'RESOURCE_CLOSED']);
    assert.deepEqual([dead.status, dead.operationId, dead.deferRetry, lastOutcome(w).errorCode],
      [ReplicaStatus.FAILED, w.operationId, undefined, 'TERMINAL_OPERATION']);
    assert.equal(w.metadata.row().state, 'completed', 'the REMOVE completed the creation row');
    const successor = await owner.selectConsensusInstance(
      w.metadata.request(1, 2, binding.incarnation));
    assert.equal(successor.outcome, 'SELECTED');
    const intentJ = structuredClone(w.metadata.intent);
    intentJ.consensusBinding = structuredClone(successor.binding);
    intentJ.consensusSlotRequest = w.metadata.slotRequest(0, 0, SUCCESSOR_OPERATION);
    assert.equal(intentJ.consensusSlotRequest.replicaId, w.replicaId, 'same canonical replica');
    assert.equal((await w.manager.prepareConsensusCreation(intentJ)).outcome,
      'ADMISSION_RETAINED');
    const resumed = trackResumes(w);
    const from = w.outcomes.length;
    const reply = await create(w, w.metadata.serviceId, w.replicaId, SUCCESSOR_OPERATION);
    assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED);
    assert.deepEqual(resumed.ids, [SUCCESSOR_OPERATION], 'J_REENTERED_AS_THE_DEAD_I');
    const memo = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([memo.status, memo.operationId], [ReplicaStatus.HELD, SUCCESSOR_OPERATION]);
    assert.deepEqual(w.outcomes.slice(from).map((o) => [o.outcomeType, o.operationId]),
      [[EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_HELD, SUCCESSOR_OPERATION]]);
  });

  test('RV7.1 a DEFERRED settle records deferRetry:true, a permanent one does not; only the ' +
    'flagged memo re-enters', async (t) => {
    const {w: d, deferred} = await deferredWorld(t);
    assert.equal(deferred.deferRetry, true, 'DEFERRAL_FLAG_NOT_RECORDED');
    const deferredResumes = trackResumes(d);
    assert.equal((await create(d)).status, ReplicaOperationResponseStatus.IN_PROGRESS);
    assert.deepEqual(deferredResumes.ids, [d.operationId]);
    const {w: p} = await terminalWorld(t);
    const permanentResumes = trackResumes(p);
    assert.equal((await create(p)).status, ReplicaOperationResponseStatus.INITIATED,
      'PERMANENT_FAILURE_REENTERED');
    assert.deepEqual(permanentResumes.ids, [p.operationId], 'routed under the request id');
    assert.equal(lastOutcome(p).errorCode, 'TERMINAL_OPERATION');
  });

  async function activeWorld(t) {
    const w = await world(t);
    const retained = await w.metadata.prepare();
    assert.equal((await w.metadata.primary.grantInstanceResource(retained.intent.consensusBinding,
      retained.token)).outcome, 'PUBLISHED');
    w.runtime.starts.push('PUBLISHED');
    await create(w);
    const active = w.handler.getLocalReplica(w.replicaId);
    assert.deepEqual([active.status, active.operationId], [ReplicaStatus.ACTIVE, w.operationId]);
    return {w, active};
  }

  test('RV7.3 a named ACTIVE memo and a request under a different id: ALREADY_EXISTS, ' +
    'CREATE_FAILED CONTENT_CONFLICT under the request, never CREATE_ACTIVE, memo untouched',
  async (t) => {
    const {w, active} = await activeWorld(t);
    const from = w.outcomes.length;
    const reply = await create(w, w.metadata.serviceId, w.replicaId, OTHER_OPERATION);
    assert.equal(reply.status, ReplicaOperationResponseStatus.ALREADY_EXISTS);
    assert.deepEqual(w.outcomes.slice(from).map((o) => [o.outcomeType, o.operationId, o.errorCode]),
      [[EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED, OTHER_OPERATION, 'CONTENT_CONFLICT']],
      'A_FOREIGN_REQUEST_EARNED_CREATE_ACTIVE');
    assert.strictEqual(w.handler.getLocalReplica(w.replicaId), active);
  });

  test('RV7.3 the same-id duplicate of a named ACTIVE memo still emits CREATE_ACTIVE',
    async (t) => {
      const {w, active} = await activeWorld(t);
      const from = w.outcomes.length;
      const reply = await create(w);
      assert.equal(reply.status, ReplicaOperationResponseStatus.ALREADY_EXISTS);
      assert.deepEqual(w.outcomes.slice(from).map((o) => [o.outcomeType, o.operationId]),
        [[EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE, w.operationId]]);
      assert.strictEqual(w.handler.getLocalReplica(w.replicaId), active);
    });

  test('RV6.3/RV6.4 codes at the handler constants owner', () => {
    assert.equal(RUNTIME_SERVICE_HANDLER_ERROR_MSG.RETIREMENT_IN_PROGRESS,
      'runtime_service_retirement_in_progress');
    assert.equal(RUNTIME_SERVICE_HANDLER_ERROR_MSG.CORRUPT_LOCAL_MEMO,
      'runtime_service_corrupt_local_memo');
  });
});

describe('stage 1c: bound REMOVE route (RV2.1, RV3.3 REMOVE table)', () => {
  async function heldThenRemove(t, stops) {
    const w = await world(t);
    await w.metadata.prepare();
    await create(w);
    w.runtime.stops.push(...stops);
    const reply = await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId,
      w.replicaId, 'remove-op-1'));
    await drain(w.handler);
    return {w, reply};
  }

  test('closed:true retires through the manager bound STOP and completes', async (t) => {
    const {w, reply} = await heldThenRemove(t, [{outcome: 'CLOSED', retired: true, closed: true,
      finality: 'FINAL'}]);
    assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED);
    assert.ok(w.runtime.calls.some((call) => call.kind === 'stop' && call.bound),
      'the REMOVE reached the bound retirement, never the generic stop');
    assertRemoveCompleted(w);
    assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.REMOVED);
  });

  test('a HISTORY_UNAVAILABLE close of a durable tombstone completes (slot reused later)',
    async (t) => {
      const {w} = await heldThenRemove(t, [{outcome: 'CLOSE_UNRESOLVED', retired: true,
        closed: false, finality: 'FINAL', tombstone: {outcome: 'ALREADY'},
        close: {outcome: 'HISTORY_UNAVAILABLE'}}]);
      assertRemoveCompleted(w);
    });

  test('a permanent refusal is REMOVE_FAILED with its code', async (t) => {
    const {w} = await heldThenRemove(t, [{outcome: 'INVALID_LINEAGE', retired: false,
      closed: false, finality: 'UNRESOLVED'}]);
    const outcome = lastOutcome(w);
    assert.equal(outcome.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED);
    assert.equal(outcome.errorCode, 'INVALID_LINEAGE');
  });

  test('C6-8/cell (b) closed:false -> REMOVE_HELD, memo REMOVING; the next REMOVE resolves',
    async (t) => {
      const {w} = await heldThenRemove(t, [{outcome: 'CLOSE_UNRESOLVED', retired: true,
        closed: false, finality: 'UNRESOLVED', close: {outcome: 'UNKNOWN'}},
      {outcome: 'CLOSED', retired: true, closed: true, finality: 'FINAL'}]);
      assert.deepEqual([lastOutcome(w).outcomeType, lastOutcome(w).workflowStep],
        [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_HELD, WORKFLOW_STEP.STOPPING]);
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.REMOVING);
      let reads = 0;
      const read = w.manager.readRetainedCreation.bind(w.manager);
      w.manager.readRetainedCreation = (...args) => {
        reads += 1;
        return read(...args);
      };
      let recovers = 0;
      w.manager.recoverConsensusCreation = () => {
        recovers += 1;
        return {outcome: 'UNAVAILABLE'};
      };
      const again = await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId,
        w.replicaId, 'remove-op-1'));
      assert.equal(again.status, ReplicaOperationResponseStatus.IN_PROGRESS);
      await drain(w.handler);
      assert.equal(reads, 1, 'the re-REMOVE recovered the creation through the journal-only read');
      assert.equal(recovers, 0, 'recoverConsensusCreation is never a REMOVE read');
      assertRemoveCompleted(w);
    });

  test('cell (c) a REMOVE whose creation row is PENDING completes and reserves nothing',
    async (t) => {
      const w = await world(t);
      const reserve = w.metadata.primary.reserveInstanceResource;
      w.metadata.primary.reserveInstanceResource = async () => {
        throw new Error('RESERVATION_NOT_REACHED');
      };
      assert.equal((await w.metadata.prepare()).outcome, 'UNKNOWN');
      w.metadata.primary.reserveInstanceResource = reserve;
      assert.equal(w.metadata.row().state, 'pending');
      w.handler.registerExistingReplica({replicaId: w.replicaId, entityId: w.metadata.serviceId,
        status: ReplicaStatus.HELD, operationId: w.operationId});
      const reserves = w.metadata.events.filter((event) => event.kind === 'reserve').length;
      await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-c'));
      await drain(w.handler);
      assertRemoveCompleted(w);
      // SUPERSEDED (design RECOVERY-DESIGN-20261017 R2-A, R3-E): a REMOVE of a
      // PENDING row first resolves the reservation with the SAME request; the
      // successor witness (P-R12, applied-now branch) is appended below.
      // assert.equal(w.metadata.events.filter((event) => event.kind === 'reserve').length, reserves,
      //   'the REMOVE minted no ordinal');
      // assert.equal(w.metadata.state().selected.resources[0].phase, 'CLOSED');
      // assert.equal(w.runtime.calls.length, 0, 'no physical effect for a PENDING creation');
      assert.equal(w.metadata.events.filter((event) => event.kind === 'reserve').length,
        reserves + 1, 'the REMOVE resolved the same request once');
      assert.deepEqual(w.metadata.events.filter((event) => event.kind === 'reserve').at(-1).request,
        w.metadata.intent.consensusSlotRequest);
      assert.ok(w.runtime.calls.some((call) => call.kind === 'stop' && call.bound),
        'the admitted slot is retired by the bound STOP');
      assert.equal(w.metadata.row().state, 'completed', 'row COMPLETED at CLOSED (R1-D)');
    });

  test('C6-9 after a handler restart the services row hint (replica_id, create_attempt_token) recovers the creation',
    async (t) => {
      const w = await world(t);
      await w.metadata.prepare();
      const physical = 'wasm-instance-0000-r1';
      const row = {service_id: physical, replica_id: w.replicaId, service_type: 'runtime_service',
        node_id: NODE_ID, status: 'active', create_attempt_token: w.operationId};
      w.cache.put('services', row);
      await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-9'));
      await drain(w.handler);
      assert.ok(w.runtime.calls.some((call) => call.kind === 'stop' && call.bound));
      assertRemoveCompleted(w);
    });
});

describe('stage 1c: readRetainedCreation, the journal-only REMOVE read (RV2.1, RV3.3 N2)', () => {
  test('result table over the real journal', async (t) => {
    const w = await world(t);
    assert.equal((await w.manager.readRetainedCreation(w.operationId)).outcome, 'INTENT_NOT_FOUND');
    const retained = await w.metadata.prepare();
    const read = await w.manager.readRetainedCreation(w.operationId);
    assert.equal(read.outcome, 'ADMISSION_RETAINED');
    assert.deepEqual(read.token, retained.token);
    assert.deepEqual(read.intent, retained.intent);
    w.metadata.db.prepare('UPDATE wasm_operations SET state = ? WHERE operation_id = ?')
      .run('completed', w.operationId);
    assert.equal((await w.manager.readRetainedCreation(w.operationId)).outcome,
      'TERMINAL_OPERATION', 'TERMINAL is decided before the admission token (N2)');
    const source = w.metadata.row();
    w.metadata.db.prepare('INSERT INTO wasm_operations (operation_id, tenant_id, command, ' +
      'state, intent_json, admission_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run('other-operation', source.tenant_id, source.command, 'in_progress', source.intent_json,
        source.admission_json, 1, 1);
    assert.equal((await w.manager.readRetainedCreation('other-operation')).outcome,
      'CONTENT_CONFLICT');
    w.metadata.setReadFault('JOURNAL_READ_UNAVAILABLE');
    assert.equal((await w.manager.readRetainedCreation(w.operationId)).outcome, 'UNAVAILABLE');
  });

  test('a PENDING row answers NOT_ADMITTED; an unwired manager answers UNAVAILABLE', async (t) => {
    const w = await world(t);
    w.metadata.primary.reserveInstanceResource = async () => {
      throw new Error('RESERVATION_NOT_REACHED');
    };
    await w.metadata.prepare();
    assert.equal((await w.manager.readRetainedCreation(w.operationId)).outcome, 'NOT_ADMITTED');
    const unwired = new ServiceLifecycleManager({logger: QUIET});
    assert.equal((await unwired.readRetainedCreation(w.operationId)).outcome, 'UNAVAILABLE');
    assert.equal((await unwired.resumeConsensusCreation(w.operationId)).outcome, 'UNAVAILABLE');
  });
});

describe('stage 1c: shared vocabulary (RV3.6, RV3.8)', () => {
  test('HELD is a valid, peer-excluded, non-terminal status; HELD outcomes are UPDATE_STEP', () => {
    assert.equal(ReplicaStatus.HELD, 'held');
    assert.equal(isValidStatus('held'), true);
    assert.equal(isPeerRowStatusAdmissible(ReplicaStatus.HELD), false);
    for (const type of [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_HELD,
      EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_HELD]) {
      assert.equal(EXECUTOR_OUTCOME_ACTION_MAP[type]?.action, EXECUTOR_OUTCOME_ACTION.UPDATE_STEP);
    }
  });
});

describe('recovery unit 1 (design RECOVERY-DESIGN-20261017): the handler side', () => {
  test('R1-H/R2-F a handler that awaits its restart inventory answers NOT_READY with ' +
    'deferRetry and emits nothing; after recoverRetainedCreations it routes normally',
  async (t) => {
    const w = await world(t);
    await w.metadata.prepare();
    const handler = new RuntimeServiceHandler({nodeId: NODE_ID, systemTableCache: w.cache,
      cdcIntegrationService: {}, serviceLifecycleManager: w.manager,
      executorOutcomeEmitter: w.emitter, awaitsRestartInventory: true});
    handler.logger = QUIET;
    handler.initialize();
    const envelope = {correlationId: 'c-1',
      payload: createRequest(w.metadata.serviceId, w.replicaId, w.operationId)};
    const refused = await handler.handleMessage(envelope);
    assert.deepEqual([refused.status, refused.errorCode, refused.deferRetry, refused.correlationId],
      [ReplicaOperationResponseStatus.ERROR, RUNTIME_SERVICE_HANDLER_ERROR_MSG.NOT_READY, true,
        'c-1']);
    assert.deepEqual(w.outcomes, [], 'NOT_READY emits no outcome');
    const plans = await handler.recoverRetainedCreations();
    await handler.ready;
    assert.deepEqual(plans.map((plan) => [plan.creation.operationId, plan.local, plan.action]),
      [[w.operationId, 'UNSUPPORTED', 'REENTER']], 'the scripted runtime has no local reader');
    await drain(handler);
    const memo = handler.getLocalReplica(w.replicaId);
    assert.deepEqual([memo.status, memo.operationId], [ReplicaStatus.HELD, w.operationId]);
    assert.equal((await handler.handleMessage(envelope)).status,
      ReplicaOperationResponseStatus.IN_PROGRESS, 'after ready: the HELD memo re-enters');
  });

  test('R4-A rule 2 / R5-A a GRANT_HELD wake whose grant is UNAVAILABLE is RECORDED for a ' +
    'HELD memo and leaves no pending wake in flight; another GRANT_HELD still re-enters',
  async (t) => {
    const w = await world(t);
    const retained = await w.metadata.prepare();
    await create(w);
    const wake = (outcome) => ({reason: 'creation_grant_held',
      binding: retained.intent.consensusBinding, token: retained.token, grant: {outcome}});
    const before = w.runtime.calls.filter((call) => call.kind === 'start').length;
    assert.equal(w.handler.onCreationWake(w.metadata.serviceId, wake('UNAVAILABLE')).outcome,
      RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.RECORDED, 'the HELD-target branch records it');
    await drain(w.handler);
    assert.equal(w.runtime.calls.filter((call) => call.kind === 'start').length, before,
      'NO_REENTRY_FOR_AN_UNAVAILABLE_GRANT');
    assert.equal(w.handler.onCreationWake(w.metadata.serviceId,
      wake('PREDECESSOR_OUTSTANDING')).outcome, RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.QUEUED);
    const entry = w.handler.inProgressOperations.get(w.operationId);
    assert.equal(w.handler.onCreationWake(w.metadata.serviceId, wake('UNAVAILABLE')).outcome,
      RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.RECORDED);
    assert.equal(entry.wakePending, false, 'NO_WAKE_PENDING_FOR_AN_UNAVAILABLE_GRANT');
    await drain(w.handler);
    assert.equal(w.runtime.calls.filter((call) => call.kind === 'start').length, before + 1,
      'one re-entry for the other GRANT_HELD, none after it');
  });

  test('R1-B/R3-C the open\'s typed code: a permanent code is a permanent CREATE_FAILED, ' +
    'UNAVAILABLE the named deferral, a transient lifecycle code stays today\'s deferral',
  async (t) => {
    const cases = [['STORAGE_MISSING', 'CREATION_STORAGE_MISSING', undefined],
      ['OPEN_UNAVAILABLE', 'UNAVAILABLE', true],
      ['REPLICA_LIVE', 'CONSENSUS_SERVING_NOT_IMPLEMENTED', true]];
    for (const [start, errorCode, deferRetry] of cases) {
      const w = await world(t);
      await w.metadata.prepare();
      w.runtime.starts.push(start);
      await create(w);
      assert.deepEqual([lastOutcome(w).outcomeType, lastOutcome(w).errorCode,
        lastOutcome(w).deferRetry], [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
        errorCode, deferRetry], start);
      const memo = w.handler.getLocalReplica(w.replicaId);
      assert.deepEqual([memo.status, memo.operationId, memo.deferRetry],
        [ReplicaStatus.FAILED, w.operationId, deferRetry], `${start}: named memo`);
    }
  });

  test('R3-D a REMOVE of a CANCELLED creation is REMOVE_COMPLETED; of a FAILED one ' +
    'REMOVE_FAILED typed', async (t) => {
    for (const [state, type] of [['cancelled', EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED],
      ['failed', EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED]]) {
      const w = await world(t);
      await w.metadata.prepare();
      w.metadata.db.prepare('UPDATE wasm_operations SET state = ? WHERE operation_id = ?')
        .run(state, w.operationId);
      w.handler.registerExistingReplica({replicaId: w.replicaId, entityId: w.metadata.serviceId,
        status: ReplicaStatus.FAILED, operationId: w.operationId});
      await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId,
        `rm-${state}`));
      await drain(w.handler);
      assert.equal(lastOutcome(w).outcomeType, type, state);
      assert.equal(w.runtime.calls.length, 0, `${state}: no physical effect`);
    }
  });

  test('R2-A/R3-E a REMOVE of a PENDING row whose owner seals the request CANCELS the row ' +
    '(never FAILED) and completes; an unreachable owner holds it PENDING', async (t) => {
    const w = await world(t);
    const reserve = w.metadata.primary.reserveInstanceResource;
    w.metadata.primary.reserveInstanceResource = async () => {
      throw new Error('RESERVATION_NOT_REACHED');
    };
    assert.equal((await w.metadata.prepare()).outcome, 'UNKNOWN');
    w.handler.registerExistingReplica({replicaId: w.replicaId, entityId: w.metadata.serviceId,
      status: ReplicaStatus.HELD, operationId: w.operationId});
    w.metadata.primary.reserveInstanceResource = async () => ({outcome: 'UNAVAILABLE'});
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-u'));
    await drain(w.handler);
    assert.deepEqual([lastOutcome(w).outcomeType, w.metadata.row().state,
      w.handler.getLocalReplica(w.replicaId).status],
    [EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_HELD, 'pending', ReplicaStatus.REMOVING]);
    w.metadata.primary.reserveInstanceResource = reserve;
    assert.equal((await reserve(w.metadata.intent.consensusBinding,
      w.metadata.slotRequest(0, 0, 'foreign-operation'))).outcome, 'ADMITTED');
    await w.handler.handleRemoveReplica(removeRequest(w.metadata.serviceId, w.replicaId, 'rm-u'));
    await drain(w.handler);
    assertRemoveCompleted(w);
    assert.equal(w.metadata.row().state, 'cancelled');
    assert.deepEqual(JSON.parse(w.metadata.row().error), {reason: 'CONFLICT'});
    assert.equal(w.runtime.calls.length, 0, 'nothing of the cancelled request is retired');
  });
});

async function temporaryReservationBlocker(w, condition) {
  const f = w.metadata;
  const binding = f.intent.consensusBinding;
  if (condition === 'STALE_BINDING') {
    const request = f.request(binding.selectionVersion, 73, binding.incarnation);
    const revision = await f.primary.catalogOwner.getCreationRevision(
      request.revisionId, request.tenantId);
    const future = selectInstanceState(f.state(), request, revision).result.binding;
    f.intent.consensusBinding = future;
    return async () => {
      const selected = await f.primary.selectConsensusInstance(request);
      assert.equal(selected.outcome, 'SELECTED');
      assert.deepEqual(selected.binding, future, 'future binding equals the real later receipt');
    };
  }
  const slot = condition === 'TARGET_ALREADY_OWNED' ? 3 : 0;
  if (condition === 'INVALID_EXPECTED_STATE') f.intent.consensusSlotRequest.expectedOrdinal = 1;
  const blocker = await f.primary.reserveInstanceResource(binding,
    f.slotRequest(slot, 0, 'f1-existing-blocker', 0));
  assert.equal(blocker.outcome, 'ADMITTED');
  return async () => {
    assert.equal((await f.primary.closeInstanceResource(binding, blocker.token)).outcome, 'CLOSED');
  };
}

for (const condition of ['TARGET_ALREADY_OWNED', 'INVALID_EXPECTED_STATE', 'STALE_BINDING']) {
  test(`F1 handler REMOVE holds ${condition} and retires only after original token persistence`,
    async (t) => {
      const w = await world(t);
      const f = w.metadata;
      const unblock = await temporaryReservationBlocker(w, condition);
      const reserve = f.primary.reserveInstanceResource.bind(f.primary);
      const arrived = Promise.withResolvers();
      const release = Promise.withResolvers();
      let delayed = false;
      f.primary.reserveInstanceResource = async (...args) => {
        if (args[1].operationId === w.operationId && !delayed) {
          delayed = true;
          arrived.resolve();
          await release.promise;
        }
        return reserve(...args);
      };
      t.after(release.resolve);
      const original = f.prepare();
      await arrived.promise;
      const before = f.row();
      w.handler.registerExistingReplica({replicaId: w.replicaId, entityId: f.serviceId,
        status: ReplicaStatus.HELD, operationId: w.operationId});
      const remove = removeRequest(f.serviceId, w.replicaId, 'f1-remove');
      await w.handler.handleRemoveReplica(remove);
      await drain(w.handler);
      const held = lastOutcome(w);
      const pending = f.row();
      const effectsBeforeAdmission = w.runtime.calls.length;
      await unblock();
      release.resolve();
      const admitted = await original;
      t.diagnostic(JSON.stringify({condition, held, pending, admitted, row: f.row()}));
      assert.equal(held.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_HELD,
        'NONFINAL_RESERVATION_DID_NOT_HOLD_REMOVE');
      assert.deepEqual(pending, before, 'REMOVE_LOST_OR_MUTATED_THE_ORIGINAL_PENDING_OBLIGATION');
      assert.equal(effectsBeforeAdmission, 0, 'REMOVE_RETIRED_AN_UNRESOLVED_RESERVATION');
      assert.equal(admitted.outcome, 'ADMISSION_RETAINED');
      assert.deepEqual(JSON.parse(f.row().admission_json), admitted.token);
      let retirements = 0;
      w.runtime.stop = async (handle) => {
        // The runtime is scripted; the token/row ordering and resource close
        // below use real owners. This is not native physical-retirement proof.
        retirements += 1;
        assert.deepEqual(handle.consensusCreation.token, admitted.token);
        assert.deepEqual(JSON.parse(f.row().admission_json), admitted.token,
          'RETIREMENT_PRECEDED_EXACT_TOKEN_PERSISTENCE');
        const closed = await f.primary.closeInstanceResource(f.intent.consensusBinding,
          admitted.token);
        assert.equal(closed.outcome, 'CLOSED');
        return {outcome: 'CLOSED', retired: true, closed: true, finality: 'FINAL'};
      };
      await w.handler.handleRemoveReplica(remove);
      await drain(w.handler);
      assertRemoveCompleted(w);
      assert.equal(retirements, 1);
      assert.equal(f.row().state, 'completed');
      assert.equal((await f.primary.resolveInstanceResource(f.intent.consensusBinding,
        admitted.token)).phase, 'CLOSED', 'AN_ADMITTED_RESOURCE_WAS_ABANDONED');
    });
}


// U1 v3 hydration addendum: these are journal/handler component witnesses.
// The scripted runtime is an explicit physical-owner stand-in; native custody
// and the actual process-directory join are witnessed in the restart embedding.
const HYDRATION_TURNS = 6;
async function hydrationTurns() {
  for (let index = 0; index < HYDRATION_TURNS; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('U1 v3 deferred immutable-origin hydration', () => {
  test('first ACK is nonblocking; pre-hydration wakes are absent, actual first-start wakes match',
    async (t) => {
      const w = await world(t);
      const retained = await w.metadata.prepare();
      const wake = {reason: 'creation_resource_closed', binding: retained.intent.consensusBinding,
        token: retained.token};
      const answers = [];
      const start = w.runtime.start;
      w.runtime.start = async (handle) => {
        answers.push(w.handler.onCreationWake(w.metadata.serviceId, wake).outcome);
        return start(handle);
      };
      const reply = await w.handler.handleCreateReplica(createRequest(w.metadata.serviceId,
        w.replicaId, w.operationId));
      assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED);
      assert.equal(w.handler.onCreationWake(w.metadata.serviceId, wake).outcome,
        RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.NO_LOCAL_OPERATION,
        'an operation ID alone is not a locally captured immutable origin');
      assert.equal(w.handler.inProgressOperations.get(w.operationId).wakePending, false);
      await drain(w.handler);
      assert.deepEqual(answers, [RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.RECORDED]);
      assert.equal(w.runtime.calls.filter((call) => call.kind === 'start').length, 1);
    });

  for (const fence of ['shutdown', 'replacement']) {
    test(`a hydration read settling after ${fence} cannot admit work or settle another entry`,
      async (t) => {
        const w = await world(t);
        await w.metadata.prepare();
        const released = Promise.withResolvers();
        t.after(() => released.resolve());
        const read = w.manager.readRetainedCreation.bind(w.manager);
        let entered = false;
        w.manager.readRetainedCreation = async (...args) => {
          const answer = await read(...args);
          entered = true;
          await released.promise;
          return answer;
        };
        let resumes = 0;
        const resume = w.manager.resumeConsensusCreation.bind(w.manager);
        w.manager.resumeConsensusCreation = (...args) => {
          resumes += 1; return resume(...args);
        };
        await w.handler.handleCreateReplica(createRequest(w.metadata.serviceId, w.replicaId,
          w.operationId));
        await hydrationTurns();
        assert.equal(entered, true, 'unknown first CREATE never hydrated its exact journal origin');
        const replacement = {operationId: w.operationId, replicaId: w.replicaId,
          entityId: w.metadata.serviceId, type: ReplicaOperationMessageType.REMOVE_REPLICA};
        if (fence === 'shutdown') w.handler.shutdown();
        else w.handler.inProgressOperations.set(w.operationId, replacement);
        const memo = w.handler.getLocalReplica(w.replicaId);
        released.resolve();
        await hydrationTurns();
        assert.equal(resumes, 0);
        assert.deepEqual(w.runtime.calls, []);
        assert.deepEqual(w.outcomes, []);
        assert.strictEqual(w.handler.getLocalReplica(w.replicaId), memo);
        if (fence === 'replacement') {
          assert.strictEqual(w.handler.inProgressOperations.get(w.operationId), replacement);
        }
      });
  }

  test('failed bound hydration retains the original row; explicit retry resumes after owner returns',
    async (t) => {
      const w = await world(t);
      const retained = await w.metadata.prepare();
      const before = w.metadata.db.prepare('SELECT * FROM wasm_operations WHERE operation_id = ?')
        .get(w.operationId);
      const reader = w.manager._idempotencyReader;
      w.manager._idempotencyReader = async () => {
        throw new Error('HYDRATION_READER_UNAVAILABLE');
      };
      let resumes = 0;
      const resume = w.manager.resumeConsensusCreation.bind(w.manager);
      w.manager.resumeConsensusCreation = (...args) => {
        resumes += 1; return resume(...args);
      };
      await create(w);
      assert.equal(resumes, 0, 'failed hydration was followed by a blind bound resume');
      assert.deepEqual(w.runtime.calls, []);
      assert.equal(lastOutcome(w).deferRetry, true);
      assert.deepEqual(w.metadata.db.prepare('SELECT * FROM wasm_operations WHERE operation_id = ?')
        .get(w.operationId), before);
      w.manager._idempotencyReader = reader;
      await create(w);
      assert.equal(resumes, 1);
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.HELD);
      assert.deepEqual((await w.manager.readRetainedCreation(w.operationId)).token, retained.token);
    });

  test('hydrated immutable envelope mismatch refuses before resume or physical preparation', async (t) => {
    const w = await world(t);
    const retained = await w.metadata.prepare();
    const request = {...createRequest(w.metadata.serviceId, w.replicaId, w.operationId),
      consensusBinding: {...retained.intent.consensusBinding, version: 999}};
    let resumes = 0;
    const resume = w.manager.resumeConsensusCreation.bind(w.manager);
    w.manager.resumeConsensusCreation = (...args) => {
      resumes += 1; return resume(...args);
    };
    await w.handler.handleCreateReplica(request);
    await drain(w.handler);
    assert.equal(resumes, 0);
    assert.deepEqual(w.runtime.calls, []);
    assert.equal(lastOutcome(w).errorCode, 'CONTENT_CONFLICT');
  });
});


test('U1 v3 hydration: a PENDING wake is only an immutable-request hint, never token adoption',
  async (t) => {
    const w = await world(t);
    w.metadata.setJournalFault('before-admission');
    await w.metadata.prepare();
    assert.equal(w.metadata.row().state, 'pending');
    const intent = w.metadata.intent;
    const admitted = await w.metadata.primary.reserveInstanceResource(intent.consensusBinding,
      intent.consensusSlotRequest);
    assert.equal(admitted.outcome, 'ADMITTED');
    const release = Promise.withResolvers();
    t.after(() => release.resolve());
    let entered = false;
    const resume = w.manager.resumeConsensusCreation.bind(w.manager);
    w.manager.resumeConsensusCreation = async (...args) => {
      entered = true;
      await release.promise;
      return resume(...args);
    };
    await w.handler.handleCreateReplica(createRequest(w.metadata.serviceId, w.replicaId,
      w.operationId));
    await hydrationTurns();
    assert.equal(entered, true);
    const execution = w.handler.inProgressOperations.get(w.operationId);
    assert.equal(execution.origin?.token, null, 'PENDING original was not hydrated before resume');
    const wake = {reason: 'creation_genesis_observed', binding: intent.consensusBinding,
      token: admitted.token};
    assert.equal(w.handler.onCreationWake(w.metadata.serviceId,
      {...wake, binding: {...wake.binding, version: 999}}).outcome,
    RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.NO_LOCAL_OPERATION);
    assert.equal(execution.wakePending, false);
    assert.equal(w.handler.onCreationWake(w.metadata.serviceId, wake).outcome,
      RUNTIME_SERVICE_CREATION_WAKE_OUTCOME.RECORDED);
    assert.equal(execution.origin.token, null);
    assert.equal(w.metadata.row().admission_json, null);
    w.metadata.setJournalFault(null);
    release.resolve();
    await drain(w.handler);
    assert.deepEqual((await w.manager.readRetainedCreation(w.operationId)).token, admitted.token);
  });
