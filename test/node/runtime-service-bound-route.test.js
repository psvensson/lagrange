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
  };
  Object.assign(runtime, {
    async prepare(definition, context) {
      runtime.calls.push({kind: 'prepare', bound: Boolean(context?.consensusCreation),
        definition});
      return {status: 'READY'};
    },
    async start(handle) {
      runtime.calls.push({kind: 'start', bound: Boolean(handle?.consensusCreation)});
      if (!handle?.consensusCreation) return {status: 'RUNNING'};
      return STARTS[runtime.starts.shift() ?? 'HELD'](handle);
    },
    async stop(handle) {
      runtime.calls.push({kind: 'stop', bound: Boolean(handle?.consensusCreation)});
      return runtime.stops.shift() ?? {outcome: 'CLOSED', retired: true, closed: true};
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
      assert.equal(w.manager._replicaStateById.get(w.replicaId), 'starting',
        'a confirmed PUBLISHED_UNPROJECTED keeps STARTING (Revision 4)');
      w.runtime.starts.push('PUBLISHED');
      const reply = await create(w);
      assert.equal(reply.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'a duplicate CREATE while HELD re-enters and answers IN_PROGRESS (C6-3)');
      assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.ACTIVE);
      assert.equal(w.manager._replicaStateById.get(w.replicaId), 'running');
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
      assert.notEqual(w.manager._replicaStateById.get(w.replicaId), 'running');
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
      close: {outcome: 'UNKNOWN'}}, {outcome: 'CLOSED', retired: true, closed: true});
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
    const {w, reply} = await heldThenRemove(t, [{outcome: 'CLOSED', retired: true, closed: true}]);
    assert.equal(reply.status, ReplicaOperationResponseStatus.INITIATED);
    assert.ok(w.runtime.calls.some((call) => call.kind === 'stop' && call.bound),
      'the REMOVE reached the bound retirement, never the generic stop');
    assertRemoveCompleted(w);
    assert.equal(w.handler.getLocalReplica(w.replicaId).status, ReplicaStatus.REMOVED);
  });

  test('a HISTORY_UNAVAILABLE close of a durable tombstone completes (slot reused later)',
    async (t) => {
      const {w} = await heldThenRemove(t, [{outcome: 'CLOSE_UNRESOLVED', retired: true,
        closed: false, close: {outcome: 'HISTORY_UNAVAILABLE'}}]);
      assertRemoveCompleted(w);
    });

  test('a permanent refusal is REMOVE_FAILED with its code', async (t) => {
    const {w} = await heldThenRemove(t, [{outcome: 'INVALID_LINEAGE', retired: false,
      closed: false}]);
    const outcome = lastOutcome(w);
    assert.equal(outcome.outcomeType, EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED);
    assert.equal(outcome.errorCode, 'INVALID_LINEAGE');
  });

  test('C6-8/cell (b) closed:false -> REMOVE_HELD, memo REMOVING; the next REMOVE resolves',
    async (t) => {
      const {w} = await heldThenRemove(t, [{outcome: 'CLOSE_UNRESOLVED', retired: true,
        closed: false, close: {outcome: 'UNKNOWN'}}, {outcome: 'CLOSED', retired: true,
        closed: true}]);
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
      assert.equal(w.metadata.events.filter((event) => event.kind === 'reserve').length, reserves,
        'the REMOVE minted no ordinal');
      assert.equal(w.metadata.state().selected.resources[0].phase, 'CLOSED');
      assert.equal(w.runtime.calls.length, 0, 'no physical effect for a PENDING creation');
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
