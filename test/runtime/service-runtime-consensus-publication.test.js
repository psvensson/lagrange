// Stage-1c runtime projection witnesses (design ACTIVATION-DISCOVERY-DESIGN-20261017,
// Revision 3 governs: RV3.1 host, RV3.3 writer answers, RV3.4 token-keyed mark;
// Revision 2: RV2.3 binding-first remover; Revision 1: RV1.3 rows). Component
// scope: the real ServiceRuntimeLifecycle with the REAL writers over component
// SQLite (wireRuntimeEndpointPublication over a ServiceEndpointsOwner,
// projectRuntimeReplicaServicesRow over a ServicesOwner, production
// owner/gateway/CDC), a retained creation from the real manager journal and
// metadata owner, and a SCRIPTED wasm_component driver standing in for the
// native lifecycle (the native embedding is the C6 integration file).
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createOriginFixture} from '../service/service-consensus-creation-fixture.js';
import {SYSTEM_TABLE_SCHEMAS, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RuntimeDriver} from '../../src/runtime/runtime-driver.js';
import {RuntimeDriverRegistry} from '../../src/runtime/runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from '../../src/runtime/service-runtime-lifecycle.js';
import {wireRuntimeEndpointPublication} from
  '../../src/runtime/runtime-endpoint-publication-wiring.js';
import {projectRuntimeReplicaServicesRow} from
  '../../src/query/runtime-replica-state-projection.js';
import {consensusBootstrapDescriptor} from '../../src/service/service-consensus-bootstrap.js';
import {runtimeServiceConsensusIdentity} from
  '../../src/rebalancer/runtime-service-replica-identity.js';
import {instanceDigest} from '../../src/control-plane/owners/service-instance-contract.js';
import {createWasmServiceNodeDependencies} from '../../src/runtime/runtime-startup-wiring.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const NODE_ID = 'host-1';
const HOST = 'host-1.lab.test';
const PORT = 9101;
const BOOT_INCARNATION = 11;

function retainedOrigin(creation) {
  return creation ? {operationId: creation.operationId, intent: creation.intent,
    token: creation.token} : null;
}

class ScriptedConsensusDriver extends RuntimeDriver {
  constructor(creation) {
    super('wasm_component');
    this.starts = [];
    this.stops = [];
    this.marks = [];
    this.markAnswer = 'PRESENT';
    this.events = null;
    // This projection fixture starts with a prepared scripted physical
    // creation. Native custody and its state predicate have separate tests.
    this.currentCreation = structuredClone(retainedOrigin(creation));
  }
  async prepare() {
    return {status: 'ready'};
  }
  async start(context) {
    const origin = context.consensusCreation;
    const next = this.starts.shift() ?? 'PUBLISHED';
    const bound = {consensusBinding: origin.intent.consensusBinding,
      consensusResourceToken: origin.token, bootstrapped: true};
    if (next === 'HELD') return {status: 'BOOTSTRAPPED_HELD', started: false, ...bound};
    return {status: 'PUBLISHED', started: true, port: PORT,
      ...(next === 'NO_HOST' ? {} : {host: HOST}), ...bound};
  }
  observeCurrentCreation(context) {
    if (this.currentCreation === null) return {outcome: 'ABSENT'};
    return {outcome: isDeepStrictEqual(this.currentCreation,
      retainedOrigin(context.consensusCreation)) ? 'CURRENT' : 'DIFFERENT'};
  }
  async stop(context) {
    this.events?.push('driver-stop');
    const result = this.stops.shift() ??
      {outcome: 'CLOSED', retired: true, closed: true, finality: 'FINAL'};
    if (result.retired === true && isDeepStrictEqual(this.currentCreation,
      retainedOrigin(context.consensusCreation))) this.currentCreation = null;
    return result;
  }
  async health() {
    return {status: 'healthy'};
  }
  markServicesRowPresent(serviceId, serviceType, token) {
    this.marks.push({serviceId, serviceType, token});
    return {outcome: this.markAnswer};
  }
}

function cacheOf(definitions) {
  return {getAll: (table) => table === 'service_definitions' ? definitions : [],
    get: () => null};
}

async function world(t, {bootIncarnation = BOOT_INCARNATION, endpoints = true,
  projection = true} = {}) {
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'error'});
  const metadata = await createOriginFixture({after: (fn) => t.after(fn)},
    {canonicalFounders: true});
  for (const table of ['services', 'service_endpoints']) {
    metadata.db.exec(generateCreateTableSQL(SYSTEM_TABLE_SCHEMAS.find((schema) =>
      schema.tableName === table)));
  }
  const retained = await metadata.prepare();
  assert.equal(retained.outcome, 'ADMISSION_RETAINED');
  const owners = metadata.owner(NODE_ID);
  const driver = new ScriptedConsensusDriver(retained);
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  const runtime = new ServiceRuntimeLifecycle(registry);
  const cache = cacheOf([{service_id: metadata.serviceId}]);
  if (endpoints) {
    wireRuntimeEndpointPublication({bootIncarnation, nodeId: NODE_ID,
      serviceEndpointsOwner: owners.endpoints, serviceRuntimeLifecycle: runtime,
      systemTableCache: cache});
  }
  if (projection) {
    runtime.setStateProjectionWriter((serviceId, stateRow) =>
      projectRuntimeReplicaServicesRow(owners.services, NODE_ID, serviceId, stateRow));
  }
  const handle = {definition: consensusBootstrapDescriptor(retained), consensusCreation: retained,
    consensusOpeningOwner: metadata.lifecycle};
  const physical = runtimeServiceConsensusIdentity(retained.intent.consensusBinding,
    retained.intent.consensusSlotRequest);
  const rows = (table) => metadata.db.prepare(`SELECT * FROM ${table}`).all();
  return {metadata, retained, owners, driver, runtime, cache, handle, physical, rows};
}

describe('stage 1c: discovery rows of a PUBLISHED bound replica (RV1.3, RV2.3, RV3.1)', () => {
  test('PUBLISHED projects the services row and the endpoint row, then marks PRESENT by token',
    async (t) => {
      const w = await world(t);
      const answer = await w.runtime.start(w.handle);
      assert.equal(answer.status, 'PUBLISHED', JSON.stringify(answer));
      const [service] = w.rows('services');
      assert.deepEqual({service_id: service.service_id, service_type: service.service_type,
        replica_id: service.replica_id, group_id: service.group_id,
        create_attempt_token: service.create_attempt_token, node_id: service.node_id,
        address: service.address, status: service.status, cleanup_token: service.cleanup_token},
      {service_id: w.physical.replicaId, service_type: 'runtime_service',
        replica_id: w.retained.intent.consensusSlotRequest.replicaId,
        group_id: w.physical.groupId, create_attempt_token: w.retained.operationId,
        node_id: NODE_ID, address: HOST, status: 'active', cleanup_token: null});
      const [endpoint] = w.rows('service_endpoints');
      const meta = JSON.parse(endpoint.metadata);
      assert.deepEqual({id: endpoint.endpoint_id, service: endpoint.service_id,
        address: endpoint.address, port: endpoint.port, name: meta.service_name,
        binding: meta.binding_digest, token: meta.resource_token,
        incarnation: endpoint.boot_incarnation},
      {id: `${w.physical.replicaId}-ep-${NODE_ID}`, service: w.metadata.serviceId,
        address: HOST, port: PORT, name: w.metadata.serviceId,
        binding: instanceDigest(w.retained.intent.consensusBinding),
        token: instanceDigest(w.retained.token), incarnation: BOOT_INCARNATION});
      assert.deepEqual(w.driver.marks, [{serviceId: w.metadata.serviceId,
        serviceType: 'runtime_service', token: w.retained.token}],
      'one mark, keyed by the exact token, carrying the projected service_type');
    });

  test('HELD projects nothing and marks nothing (projection only after PUBLISHED)', async (t) => {
    const w = await world(t);
    w.driver.starts.push('HELD');
    const answer = await w.runtime.start(w.handle);
    assert.equal(answer.status, 'BOOTSTRAPPED_HELD');
    assert.deepEqual([w.rows('services'), w.rows('service_endpoints'), w.driver.marks], [[], [], []]);
  });

  test('cell (i) an absent endpoint or projection writer is typed PUBLISHED_UNPROJECTED, never PRESENT',
    async (t) => {
      for (const options of [{endpoints: false}, {projection: false}]) {
        const w = await world(t, options);
        const answer = await w.runtime.start(w.handle);
        assert.equal(answer.status, 'PUBLISHED_UNPROJECTED', JSON.stringify(options));
        assert.equal(answer.projection.outcome, 'PROJECTION_WRITER_ABSENT');
        assert.deepEqual(w.driver.marks, []);
      }
    });

  test('a refused endpoint write (incarnation required) and a missing host are PUBLISHED_UNPROJECTED',
    async (t) => {
      const refused = await world(t, {bootIncarnation: 0});
      const answer = await refused.runtime.start(refused.handle);
      assert.equal(answer.status, 'PUBLISHED_UNPROJECTED');
      assert.equal(answer.projection.outcome, 'refused_incarnation_required');
      assert.deepEqual(refused.driver.marks, []);
      const hostless = await world(t);
      hostless.driver.starts.push('NO_HOST');
      const unhosted = await hostless.runtime.start(hostless.handle);
      assert.equal(unhosted.status, 'PUBLISHED_UNPROJECTED');
      assert.equal(unhosted.projection.outcome, 'ENDPOINT_HOST_UNAVAILABLE');
      assert.deepEqual(hostless.rows('services'), [], 'no row carries a substituted address');
    });

  test('a mark that finds no matching creation is PUBLISHED_UNPROJECTED', async (t) => {
    const w = await world(t);
    w.driver.markAnswer = 'NOT_REGISTERED';
    const answer = await w.runtime.start(w.handle);
    assert.equal(answer.status, 'PUBLISHED_UNPROJECTED');
    assert.equal(answer.projection.outcome, 'SERVICES_ROW_NOT_MARKED');
  });

  test('C6-6 a re-drive after a failed endpoint write re-projects UPDATE-first and marks',
    async (t) => {
      const w = await world(t);
      const write = w.runtime._endpointWriter;
      let failOnce = true;
      w.runtime.setEndpointWriter(async (...args) => {
        if (failOnce) {
          failOnce = false;
          throw new Error('ENDPOINT_TRANSPORT_LOST');
        }
        return write(...args);
      });
      const first = await w.runtime.start(w.handle);
      assert.equal(first.status, 'PUBLISHED_UNPROJECTED');
      assert.equal(w.rows('services').length, 1, 'the services row applied before the endpoint');
      const second = await w.runtime.start(w.handle);
      assert.equal(second.status, 'PUBLISHED', JSON.stringify(second));
      assert.equal(w.rows('services').length, 1);
      assert.equal(w.rows('service_endpoints').length, 1);
      assert.equal(w.driver.marks.length, 1);
    });
});

describe('stage 1c: bound retirement withdraws exactly this replica\'s rows (RV1.1, RV2.3)', () => {
  test('cell (d) endpoint removed by physical id before the stop; services row deleted after CLOSED',
    async (t) => {
      const w = await world(t);
      assert.equal((await w.runtime.start(w.handle)).status, 'PUBLISHED');
      const events = [];
      w.driver.events = events;
      w.cache.getAll = () => {
        events.push('logical-resolution');
        return [];
      };
      const deleteWhere = w.owners.endpoints.deleteWhere.bind(w.owners.endpoints);
      w.owners.endpoints.deleteWhere = (...args) => {
        events.push('endpoint-delete');
        return deleteWhere(...args);
      };
      const result = await w.runtime.stop(w.handle);
      assert.equal(result.closed, true);
      assert.deepEqual(events, ['endpoint-delete', 'driver-stop'],
        'the remover derived the physical id with no logical resolution, before the stop');
      assert.deepEqual([w.rows('service_endpoints'), w.rows('services')], [[], []]);
    });

  test('closed:false keeps the services row (custody stays with the creation)', async (t) => {
    const w = await world(t);
    assert.equal((await w.runtime.start(w.handle)).status, 'PUBLISHED');
    w.driver.stops.push({outcome: 'CLOSE_UNRESOLVED', retired: true, closed: false,
      finality: 'UNRESOLVED'});
    const result = await w.runtime.stop(w.handle);
    assert.equal(result.closed, false);
    assert.equal(w.rows('services').length, 1);
    assert.equal(w.rows('service_endpoints').length, 0);
  });
});

describe('stage 1c: endpoint identity across incarnations (C6-11) and the unbound parse', () => {
  test('a late I endpoint write never touches J\'s row; a stale boot incarnation is refused',
    async (t) => {
      const w = await world(t);
      const prior = w.retained.intent.consensusBinding;
      const selected = await w.metadata.primary.selectConsensusInstance(
        w.metadata.request(1, 2, prior.incarnation));
      assert.equal(selected.outcome, 'SELECTED');
      const slot = w.retained.intent.consensusSlotRequest;
      const jPhysical = runtimeServiceConsensusIdentity(selected.binding, slot);
      assert.notEqual(jPhysical.replicaId, w.physical.replicaId);
      const reserved = await w.metadata.primary.reserveInstanceResource(selected.binding,
        w.metadata.slotRequest(0, 0, 'successor-operation-0'));
      assert.equal(reserved.outcome, 'ADMITTED', JSON.stringify(reserved));
      const jToken = reserved.token;
      const write = w.runtime._endpointWriter;
      assert.notEqual((await write(jPhysical.replicaId, 'wasm_component', {host: HOST, port: PORT,
        consensusBinding: selected.binding, consensusResourceToken: jToken})).success, false);
      const jRow = () => w.rows('service_endpoints').find((row) =>
        row.endpoint_id === `${jPhysical.replicaId}-ep-${NODE_ID}`);
      const before = jRow();
      await write(w.physical.replicaId, 'wasm_component', {host: 'late-i.lab.test', port: PORT + 1,
        consensusBinding: prior, consensusResourceToken: w.retained.token});
      assert.deepEqual(jRow(), before, 'the late I write landed on its own physical id only');
      const stale = new ServiceRuntimeLifecycle(new RuntimeDriverRegistry());
      wireRuntimeEndpointPublication({bootIncarnation: BOOT_INCARNATION - 1, nodeId: NODE_ID,
        serviceEndpointsOwner: w.owners.endpoints, serviceRuntimeLifecycle: stale,
        systemTableCache: w.cache});
      const refused = await stale._endpointWriter(jPhysical.replicaId, 'wasm_component',
        {host: 'stale.lab.test', port: PORT, consensusBinding: selected.binding,
          consensusResourceToken: jToken});
      assert.deepEqual(refused, {success: false, outcome: 'refused_stale_incarnation'});
      assert.deepEqual(jRow(), before);
    });

  test('an unbound replica id still resolves its logical service by the canonical parse',
    async (t) => {
      const w = await world(t);
      const replicaId = `${w.metadata.serviceId}-r2`;
      await w.runtime._endpointWriter(replicaId, 'native_js', {host: HOST, port: PORT});
      const [row] = w.rows('service_endpoints');
      assert.equal(row.endpoint_id, `${w.metadata.serviceId}-ep-${NODE_ID}`);
      assert.equal(JSON.parse(row.metadata).binding_digest, undefined);
      await w.runtime._endpointRemover(replicaId, NODE_ID);
      assert.deepEqual(w.rows('service_endpoints'), []);
    });
});

describe('stage 1c: node dependency getters (RV3.1, RV2.3, RV2.4)', () => {
  test('cell (e) endpointHost is the DERIVED host; advertised WS wins; never the raw host:port',
    () => {
      const plain = createWasmServiceNodeDependencies({nodeId: 'n1',
        nodeAddress: 'host-1.lab.test:8081'});
      assert.equal(plain.endpointHost, 'host-1.lab.test');
      const advertised = createWasmServiceNodeDependencies({nodeId: 'n3',
        nodeAddress: 'host-3.lab.test:8083', advertisedNodeWsAddress: 'ws://edge-3.lab.test:9003'});
      assert.equal(advertised.endpointHost, 'edge-3.lab.test');
      const url = createWasmServiceNodeDependencies({nodeId: 'n5',
        nodeAddress: 'http://10.0.0.5:8080'});
      assert.equal(url.endpointHost, '10.0.0.5');
      assert.equal(createWasmServiceNodeDependencies({nodeId: 'n0'}).endpointHost, null);
    });

  test('systemTableCache and creationWake resolve lazily from the node owner', () => {
    const cache = {};
    const node = {nodeId: 'n1', peekSystemTableCache: () => cache, runtimeServiceHandler: null};
    const dependencies = createWasmServiceNodeDependencies(node);
    assert.equal(dependencies.systemTableCache, cache);
    assert.equal(dependencies.creationWake, null, 'no handler yet: the typed CONSUMER_ABSENT');
    const wakes = [];
    node.runtimeServiceHandler = {onCreationWake: (...args) => {
      wakes.push(args);
      return {outcome: 'QUEUED'};
    }};
    assert.deepEqual(dependencies.creationWake('S', {reason: 'r'}), {outcome: 'QUEUED'});
    assert.deepEqual(wakes, [['S', {reason: 'r'}]]);
  });
});
