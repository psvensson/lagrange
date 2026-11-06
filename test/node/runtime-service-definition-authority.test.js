// Actual catalog/Binding/definition producer, policy, handler route and outcome
// emitter. Durable SQL and the lifecycle adapter are controlled boundaries.
// A caller-driven retry below proves recovery composition, not automatic scheduling.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {RuntimeServiceHandler} from '../../src/node/runtime-service-handler.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';
import {AUTHORITATIVE_DEFINITION_READ_AUTHORITY} from
  '../../src/node/runtime-service-definition-resolution.js';
import {ExecutorOutcomeEmitter, OUTCOME_EVENT_NAME} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {EXECUTOR_OUTCOME_TYPE as OUTCOME} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaOperationField as FIELD, ReplicaOperationMessageType as TYPE,
  ReplicaOperationResponseStatus as REPLY} from
  '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createPostgresWireDefinition} from '../../src/wasm-service/meta-service-factory.js';
import {serializeServiceDefinition} from '../../src/wasm-service/wasm-service-models.js';
import {TABLES} from '../../src/constants/index.js';
import {createRequestBindingFixture} from
  '../control-plane/request-binding-service-definition-fixture.js';
import {deriveRequestServiceDefinitionId} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';

const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
const NATIVE = serializeServiceDefinition({...createPostgresWireDefinition(), replicaCount: 1});
const ERROR = Object.freeze({ABSENT: 'service_definition_not_found',
  INELIGIBLE: 'service_definition_ineligible',
  UNAVAILABLE: 'service_definition_authority_unavailable'});

function placementPolicy(row) {
  const cache = new SystemTableCache();
  if (row !== null) cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', row);
  return UnifiedRebalancer.prototype.getRuntimeServicePolicy.call({
    entityId: row?.service_id ?? NATIVE.service_id, systemTableCache: cache,
  });
}

async function producedDefinition() {
  const producer = await createRequestBindingFixture();
  const {serviceDefinition} = await producer.owners.serviceDefinitionsOwner
    .reconcileRequestBinding(producer.bindingRow);
  return serviceDefinition;
}

function world(t, {row = NATIVE, response = {success: true, rows: [row]},
  missingPort = false} = {}) {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', row);
  const calls = [];
  const reads = [];
  const outcomes = [];
  const state = {response};
  const gateway = {async readAuthoritativeRows(table, sql, params, options) {
    reads.push({table, sql, params, options});
    if (state.response instanceof Error) throw state.response;
    return state.response;
  }};
  const manager = {
    async readRetainedCreation() {
      return {outcome: 'UNAVAILABLE'};
    },
    async createReplica(descriptor) {
      calls.push({kind: 'create', descriptor});
    },
    async startReplica(descriptor) {
      calls.push({kind: 'start', descriptor});
    },
  };
  const emitter = new ExecutorOutcomeEmitter({logger: QUIET});
  emitter.on(OUTCOME_EVENT_NAME, (outcome) => outcomes.push(outcome));
  const handler = new RuntimeServiceHandler({nodeId: 'definition-node',
    systemTableCache: cache, serviceLifecycleManager: manager,
    executorOutcomeEmitter: emitter,
    controlPlaneSystemTableGateway: missingPort ? {} : gateway,
    // Stale legacy alternatives must not grant permission when the declared
    // production port is absent or fails.
    cdcIntegrationService: {
      controlPlaneSystemTableGateway: gateway,
      async executeAuthoritativeSystemTableRead() {
        throw new Error('RETIRED_READ_CALLED');
      },
    },
  });
  handler.logger = QUIET;
  handler.initialize();
  t.after(() => handler.shutdown());
  return {handler, state, calls, reads, outcomes, cache, row, gateway};
}

async function create(w, operationId = 'definition-op') {
  const result = await w.handler.handleCreateReplica({
    [FIELD.TYPE]: TYPE.CREATE_REPLICA,
    [FIELD.OPERATION_ID]: operationId,
    [FIELD.ENTITY_ID]: w.row.service_id,
    [FIELD.REPLICA_ID]: `${w.row.service_id}-r1`,
  });
  assert.equal(result.status, REPLY.INITIATED);
  for (let turn = 0; turn < 20 && w.handler.inProgressOperations.size > 0; turn++) {
    await nextTurn();
  }
  assert.equal(w.handler.inProgressOperations.size, 0, 'bounded execution drained');
  return w.outcomes.at(-1);
}

test('producer Binding count zero has one placement and CREATE interpretation', async (t) => {
  const row = await producedDefinition();
  assert.equal(row.status, 'active');
  assert.equal(row.replica_count, 0, 'producer storage meaning remains unchanged');
  assert.equal(placementPolicy(row).targetReplicaCount, 3);
  const w = world(t, {row});
  const outcome = await create(w);
  assert.equal(outcome.outcomeType, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE);
  assert.deepEqual(w.calls.map((call) => call.kind), ['create', 'start']);
  assert.equal(w.calls[0].descriptor.replica_count, 0);
  assert.equal(w.calls[0].descriptor.binding_version_id, row.binding_version_id);
  assert.equal(w.reads.length, 1, 'routing and execution consume the same authority read');
  assert.strictEqual(w.reads[0].options.readAuthority, AUTHORITATIVE_DEFINITION_READ_AUTHORITY);
  assert.ok(Object.isFrozen(w.reads[0].options.readAuthority));
});

test('policy distinguishes valid zero, inactive, invalid and unavailable targets', async (t) => {
  const binding = await producedDefinition();
  const cases = [
    ['zero native', {...NATIVE, replica_count: 0}, 'ready', 0],
    ['inactive Binding', {...binding, status: 'inactive'}, 'inactive', null],
    ['partial lineage', {...NATIVE, binding_version_id: 'partial'}, 'invalid', null],
    ['reserved id', {...NATIVE, service_id: 'binding-service-incomplete'}, 'invalid', null],
    ['wrong derived id', {...binding, service_id: 'wrong-binding'}, 'invalid', null],
    ['projection mismatch', {...binding, binding_digest: 'changed'}, 'invalid', null],
    ['absent definition', null, 'unavailable', null],
    ...[undefined, null, '1', -1, 0.5, Number.MAX_SAFE_INTEGER + 1].map((count) =>
      [`invalid count ${String(count)}`, {...NATIVE, replica_count: count}, 'invalid', null]),
  ];
  for (const [name, row, state, target] of cases) {
    if (state === 'ready') {
      assert.equal(placementPolicy(row).targetReplicaCount, target, name);
    } else {
      assert.throws(() => placementPolicy(row),
        {code: 'runtime_service_policy_unavailable', reason: state, deferRetry: true}, name);
    }
    if (row === null) continue;
    const w = world(t, {row});
    const outcome = await create(w);
    assert.equal(outcome.errorCode, ERROR.INELIGIBLE, name);
    assert.notEqual(outcome.deferRetry, true, name);
    assert.equal(w.calls.length, 0, name);
  }
  const alias = {...NATIVE, replicaCount: 7};
  delete alias.replica_count;
  assert.throws(() => placementPolicy(alias),
    {code: 'runtime_service_policy_unavailable', reason: 'invalid'},
    'camelCase cannot supply stored count');
});

test('shared Binding lineage rejects invalid identities and declaration digests', async (t) => {
  const binding = await producedDefinition();
  const cases = [
    ...['', ' ', ` ${binding.binding_version_id} `, 'arbitrary'].map((value) => [
      `version ${JSON.stringify(value)}`, (row, projection) => {
        row.binding_version_id = projection.binding_version_id = value;
        row.service_id = deriveRequestServiceDefinitionId(value);
      },
    ]),
    ...['', ' ', 'arbitrary', `sha256:${'0'.repeat(64)}`].map((value) => [
      `digest ${JSON.stringify(value)}`, (row, projection) => {
        row.binding_digest = projection.binding_digest = value;
      },
    ]),
    ['missing tenant', (_row, projection) => {
      delete projection.tenant_id;
    }],
    ['empty tenant', (_row, projection) => {
      projection.tenant_id = '';
    }],
    ['changed declaration', (_row, projection) => {
      projection.declaration.name = 'another-binding';
    }],
  ];
  for (const [name, mutate] of cases) {
    const row = {...binding};
    const projection = JSON.parse(row.binding_projection);
    mutate(row, projection);
    row.binding_projection = JSON.stringify(projection);
    assert.throws(() => placementPolicy(row),
      {code: 'runtime_service_policy_unavailable', reason: 'invalid'}, name);
    const w = world(t, {row});
    const outcome = await create(w);
    assert.equal(outcome.errorCode, ERROR.INELIGIBLE, name);
    assert.notEqual(outcome.deferRetry, true, name);
    assert.equal(w.calls.length, 0, name);
  }
});

test('declared gateway population is validated before any row is selected', async (t) => {
  const sparse = new Array(1);
  const cases = [
    ['missing port', {missingPort: true}],
    ['throw', {response: new Error('finite authority failure')}],
    ['failed', {response: {success: false, rows: [NATIVE]}}],
    ['bare Array', {response: [NATIVE]}],
    ['missing rows', {response: {success: true}}],
    ['wrong id', {response: {success: true, rows: [{...NATIVE, service_id: 'other'}]}}],
    ['duplicate', {response: {success: true, rows: [NATIVE, NATIVE]}}],
    ['sparse', {response: {success: true, rows: sparse}}],
    ['null member', {response: {success: true, rows: [null]}}],
    ['array member', {response: {success: true, rows: [[]]}}],
  ];
  for (const [name, options] of cases) {
    const w = world(t, options);
    const outcome = await create(w);
    assert.equal(outcome.errorCode, ERROR.UNAVAILABLE, name);
    assert.equal(outcome.deferRetry, true, name);
    assert.equal(w.calls.length, 0, name);
    assert.equal(w.cache.get(TABLES.SERVICE_DEFINITIONS, NATIVE.service_id).replica_count, 1,
      `${name}: stale positive cache grants nothing and is not invalidly reconciled`);
  }
});

test('confirmed absence is permanent and evicts stale cache through the reconciliation owner',
  async (t) => {
    const w = world(t, {response: {success: true, rows: []}});
    const outcome = await create(w);
    assert.equal(outcome.errorCode, ERROR.ABSENT);
    assert.notEqual(outcome.deferRetry, true);
    assert.equal(w.calls.length, 0);
    assert.equal(w.cache.get(TABLES.SERVICE_DEFINITIONS, NATIVE.service_id), undefined);
  });

test('one resolved definition cannot route generic and then execute a changed bound class',
  async (t) => {
    const row = {...NATIVE, service_id: 'generic-class-change'};
    const w = world(t, {row});
    const changed = {...row, runtime_kind: 'wasm_component',
      runtime_ref: 'must-not-run'};
    const first = w.gateway.readAuthoritativeRows.bind(w.gateway);
    w.gateway.readAuthoritativeRows = async (...args) => {
      const answer = await first(...args);
      w.state.response = {success: true, rows: [changed]};
      return answer;
    };
    const outcome = await create(w);
    assert.equal(outcome.outcomeType, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE);
    assert.equal(w.reads.length, 1);
    assert.equal(w.calls[0].descriptor.runtimeKind, NATIVE.runtime_kind);
    assert.equal(w.calls[0].descriptor.runtimeRef, NATIVE.runtime_ref);
  });

test('an explicit handler retry with the same operation ID clears finite authority failure',
  async (t) => {
    const w = world(t, {response: new Error('held authority')});
    const failed = await create(w);
    assert.equal(failed.deferRetry, true);
    const replicaId = `${NATIVE.service_id}-r1`;
    assert.equal(w.handler.getLocalReplica(replicaId).status, ReplicaStatus.FAILED);
    assert.equal(w.calls.length, 0);
    w.state.response = {success: true, rows: [NATIVE]};
    const recovered = await create(w);
    assert.equal(recovered.operationId, failed.operationId);
    assert.equal(recovered.outcomeType, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE);
    assert.equal(w.reads.length, 2);
    assert.deepEqual(w.calls.map((call) => call.kind), ['create', 'start']);
    assert.equal(w.handler.getLocalReplica(replicaId).status, ReplicaStatus.ACTIVE);
  });

test('authoritative row cannot replace admitted execution identity through extra DTO fields', async (t) => {
  const row = {...NATIVE, serviceId: 'foreign', replicaId: 'foreign',
    entityId: 'foreign', nodeId: 'foreign', runtimeKind: 'foreign'};
  const w = world(t, {row});
  assert.equal((await create(w)).outcomeType, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE);
  const descriptor = w.calls[0].descriptor;
  assert.equal(descriptor.serviceId, `${NATIVE.service_id}-r1`);
  assert.equal(descriptor.replicaId, `${NATIVE.service_id}-r1`);
  assert.equal(descriptor.entityId, NATIVE.service_id);
  assert.equal(descriptor.nodeId, 'definition-node');
  assert.equal(descriptor.runtimeKind, NATIVE.runtime_kind);
});

test('projection failure cannot change authoritative CREATE eligibility or absence', async (t) => {
  for (const absent of [false, true]) {
    const w = world(t, {response: {success: true, rows: absent ? [] : [NATIVE]}});
    w.cache.applySystemTableChange = () => {
      throw new Error('projection unavailable');
    };
    const outcome = await create(w);
    if (absent) {
      assert.equal(outcome.errorCode, ERROR.ABSENT);
      assert.notEqual(outcome.deferRetry, true);
      assert.equal(w.calls.length, 0);
    } else {
      assert.equal(outcome.outcomeType, OUTCOME.RUNTIME_SERVICE_CREATE_ACTIVE);
      assert.equal(w.calls.length, 2);
    }
  }
});
