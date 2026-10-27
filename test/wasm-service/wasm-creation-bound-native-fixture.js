// Native WASM RF3 with COMPONENT metadata selection/CAS. The metadata fixture
// uses production owner/gateway/CDC over SQLite, not native metadata consensus.
// No fabricated ACTIVE routing rows, writer root, serving grant or closure:
// the grant and the closure are the production owners' (Revision 3 N6).
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCreationSqliteFixture} from '../control-plane/service-instance-creation-sqlite-fixture.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {ModuleMirror} from '../../src/wasm-service/module-mirror.js';
import {PortAllocator} from '../../src/wasm-service/port-allocator.js';
import {WasmServiceLifecycle} from '../../src/wasm-service/wasm-service-lifecycle.js';
import {ServiceLifecycleManager} from '../../src/service/service-lifecycle-manager.js';
import {RuntimeServiceAdapter} from '../../src/service/adapters/runtime-service-adapter.js';
import {ServiceRuntimeLifecycle} from '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from '../../src/runtime/runtime-driver-registry.js';
import {SYSTEM_TABLE_SCHEMAS, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {WasmComponentDriver} from '../../src/runtime/wasm-component-driver.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {deliverScheduled} from './wasm-strong-write-native-fixture.js';
import {assertRecordedWrite, proposalEntries} from './wasm-strong-write-v1-native-fixture.js';

const PREFIX = {type: 'WASM_WRITER_V1', profile: 'wasm-writer-v1/1'};
const SETUP_ROUNDS = 200;
const MODULE_VERSION = '1.0.0';

function json(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

function record(f, kind, detail = {}) {
  f.events.push({ordinal: f.events.length + 1, phase: f.phase, kind, ...detail});
}

function views(f) {
  return f.replicas.map((replica) => ({replicaId: replica.replicaId,
    durable: RaftRsDurableStore.readDurableRecordIn(replica.db, f.groupId),
    writerMeta: replica.writerState.meta(),
    writerSlots: replica.db.prepare('SELECT * FROM _wasm_writer_slots ORDER BY slot').all(),
    value: replica.kvStore.get(f.request.sessionId, f.request.key)?.toString() ?? null}));
}

function evidence(t, f, stage) {
  const result = {stage, binding: f.binding, tokens: f.hosts.map((host) => host.token),
    groupId: f.groupId, request: f.request, response: structuredClone(f.response),
    views: views(f), events: structuredClone(f.events), held: structuredClone(f.held),
    metadata: f.world.metadata.state(),
    scope: 'native WASM RF3; production metadata owners with component SQLite CAS; no guest execution'};
  t.diagnostic(json(result));
  return result;
}

async function world(t) {
  const metadataCleanup = [];
  const metadata = await createCreationSqliteFixture({after: (fn) => metadataCleanup.push(fn)});
  const operationSchema = SYSTEM_TABLE_SCHEMAS.find((schema) => schema.tableName === 'wasm_operations');
  assert.ok(operationSchema);
  metadata.db.exec(generateCreateTableSQL(operationSchema));
  const directory = mkdtempSync(join(tmpdir(), 'wasm-creation-native-'));
  const w = {metadata, directory, groups: []};
  t.after(async () => {
    setActualCoreEntryObserver(null);
    const errors = [];
    for (const group of w.groups) {
      for (const host of group.hosts) {
        try {
          await host.lifecycle.stopReplica(metadata.serviceId);
        } catch (error) {
          errors.push(error);
        }
      }
    }
    for (const cleanup of metadataCleanup) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, `retained fixture evidence: ${directory}`);
    rmSync(directory, {recursive: true, force: true});
  });
  return w;
}

async function moduleMirror(handler) {
  const mirror = new ModuleMirror();
  // Actual normal in-process adapter and manifest validation; no guest-code
  // execution claim. No injected validator or fabricated hasModule result.
  await mirror.setModule(handler, {version: MODULE_VERSION,
    wasmBytes: Buffer.from('0061736d01000000', 'hex'),
    manifest: {namespace: 'creation-native', name: handler, version: MODULE_VERSION,
      digest: `sha256:${'a'.repeat(64)}`, runExport: 'run', exports: ['run'],
      dependencies: [], capabilities: []}, exports: {run: (_context, args) => args}});
  return mirror;
}

function ownedDirectory(directory, nodeId) {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: nodeId},
    storage: {dataDir: directory}, raft: {heartbeatIntervalMs: 50,
      electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300, tickIntervalMs: 10}});
  const owner = new DataDirectoryManager();
  owner.initialize();
  return owner;
}

async function form(f) {
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await f.replicas[0].raft.tick();
    await deliverScheduled(f);
    const statuses = f.replicas.map((replica) => replica.raft.readStatus());
    if (statuses[0].role !== 'leader' ||
        !statuses.every((status) => status.leaderId === f.replicas[0].replicaId)) continue;
    f.groupId = statuses[0].groupId;
    assert.equal(typeof f.groupId, 'string');
    if (!views(f).every((view) => BigInt(view.durable.appliedIndex) > 0n)) continue;
    f.leader = f.replicas[0];
    await deliverScheduled(f);
    assert.equal(f.queue.length, 0);
    assert.equal(f.leader.isLeader, true);
    return;
  }
  assert.fail('setup seam: creation-bound RF3 did not form in declared rounds');
}

// Superseded by design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017
// Revision 3 N6 (recorded supersession; the frozen bytes stay in 45293b471).
// Measured first failure of the frozen fixture at 7696c3d8e: createGroup:237,
// the normalized descriptor no longer carries consensusBinding, and the
// manager refuses a bound descriptor through createReplica (R2 retained
// creation route). Superseded here: (1) creation runs the production route,
// ServiceLifecycleManager.bootstrapConsensusCreation of a retained K-bearing
// intent; (2) INIT is never issued manually (the frozen nonce '22'*32 is not
// the binding's): the keyed continuation authors it and grants the slot;
// (3) ENROLL runs after publication; (4) retire() retires each resource by
// its retained creation (WasmServiceLifecycle.retireReplica). The C1
// discriminator is unchanged: the old instance's actual INIT/ENROLL/WRITE are
// refused on the recreated service, and its own valid path completes.
const OPERATION_ROW = 'SELECT * FROM wasm_operations WHERE operation_id=?';

function originIntent(f, slot, peer, request) {
  return {format: 1, descriptor: {serviceId: f.world.metadata.serviceId,
    tenantId: request.tenantId, serviceType: 'runtime_service', replicaId: peer.replicaId,
    replicaCount: f.binding.foundingPeers.length, runtimeKind: 'wasm_component',
    runtimeRef: request.definition.handlerFunctionId,
    runtimeConfig: JSON.stringify({definition: request.definition})},
  consensusBinding: f.binding, consensusSlotRequest: {slot, expectedOrdinal: 0,
    operationId: `${request.requestId.nonce}-${slot}`, ...peer}};
}

function journalRow(f, host) {
  const row = f.world.metadata.db.prepare(OPERATION_ROW)
    .get(host.intent.consensusSlotRequest.operationId);
  assert.ok(row, 'real operation journal exists before owner handoff');
  return row;
}

function bindManager(f, host) {
  const db = f.world.metadata.db;
  // Component SQL backing for the existing production journal SQL generator.
  // This is distinct from native metadata/operation-log replication proof.
  const bind = (params) => Object.fromEntries(params.map((value, index) => [index + 1, value]));
  const writer = async (sql, params) => {
    const result = db.prepare(sql).run(bind(params));
    record(f, 'operation-journal-write', {sql, params, changes: result.changes});
    return {success: true, affectedRows: result.changes};
  };
  const reader = async (sql, params) => db.prepare(sql).all(bind(params));
  const registry = new RuntimeDriverRegistry();
  registry.register(host.driver);
  const runtime = new ServiceRuntimeLifecycle(registry);
  host.publications = [];
  runtime.setOperationWriter(async (...args) => {
    host.publications.push({kind: 'nested-journal', args});
    throw new Error('BOUND_BOOTSTRAP_CREATED_NESTED_JOURNAL');
  });
  runtime.setEndpointWriter(async (...args) => {
    host.publications.push({kind: 'endpoint', args});
    throw new Error('BOOTSTRAP_ENDPOINT_PUBLICATION');
  });
  runtime.setStateProjectionWriter(async (...args) => {
    if (args[1].status === 'active') host.publications.push({kind: 'ACTIVE', args});
    throw new Error('PROJECTION_OWNER_NOT_IN_NATIVE_SCOPE');
  });
  host.manager = new ServiceLifecycleManager({serviceDefinitionsOwner: f.world.metadata.primary});
  host.manager.setOperationWriter(writer);
  host.manager.setIdempotencyReader(reader);
  host.manager.registerAdapter(new RuntimeServiceAdapter({serviceRuntimeLifecycle: runtime}));
  const realReserve = f.world.metadata.primary.reserveInstanceResource;
  f.world.metadata.primary.reserveInstanceResource = async function(...args) {
    const row = journalRow(f, host);
    assert.equal(row.admission_json, null);
    assert.deepEqual(JSON.parse(row.intent_json), host.intent);
    host.originalIntentBytes = row.intent_json;
    record(f, 'reservation-entered', {intent: host.intent, admission: null});
    return Reflect.apply(realReserve, this, args);
  };
  const realPrepare = host.driver.prepare;
  host.driver.prepare = async function(...args) {
    const row = journalRow(f, host);
    assert.equal(row.intent_json, host.originalIntentBytes);
    assert.deepEqual(JSON.parse(row.admission_json), args[0].consensusResourceToken);
    // Restore observation wrapper before another host installs its own.
    f.world.metadata.primary.reserveInstanceResource = realReserve;
    return Reflect.apply(realPrepare, this, args);
  };
}

async function createGroup(t, w, request) {
  // Caller custody before first delivery; no receiver rebuild from current metadata.
  const path = join(w.directory, `request-${request.requestId.nonce}.json`);
  writeFileSync(path, json(request), {flag: 'wx'});
  const selected = await w.metadata.primary.selectConsensusInstance(request);
  assert.equal(selected.outcome, 'SELECTED');
  const f = {world: w, binding: selected.binding, selection: selected,
    request: {operation: 'write', sessionId: 'session', key: 'creation-key', value: 'creation-value'},
    phase: 'setup', events: [], replicas: [], clocks: [], hosts: [],
    queue: [], held: [], holdResponses: false, leader: null, groupId: null,
    response: {state: 'not-called'}};
  w.groups.push(f);
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({level: 'error'});
  f.transport = createLoopbackTransport();
  f.deliver = f.transport.deliver;
  f.transport.deliver = function(address, envelope, ...options) {
    const item = {address, envelope: structuredClone(envelope), options};
    f.queue.push(item);
    record(f, 'transport-custody', item);
    return Promise.resolve(buildDeliveryEnvelope({acknowledged: true}));
  };
  setActualCoreEntryObserver((event) => record(f, 'native-entry', event));
  const priorRows = w.metadata.db.prepare('SELECT count(*) AS n FROM wasm_operations').get().n;
  for (let slot = 0; slot < f.binding.foundingPeers.length; slot += 1) {
    const peer = f.binding.foundingPeers[slot];
    const timeSource = new VirtualTimeSource({startMs: 1000});
    const lifecycle = new WasmServiceLifecycle({nodeId: peer.nodeId, timeSource,
      messageRouter: f.transport, serviceDefinitionsOwner: w.metadata.primary,
      dataDirectoryManager: ownedDirectory(join(w.directory, peer.nodeId), peer.nodeId),
      moduleMirror: await moduleMirror(request.definition.handlerFunctionId),
      portAllocator: new PortAllocator()});
    const host = {lifecycle, token: null, intent: originIntent(f, slot, peer, request)};
    f.hosts.push(host);
    host.driver = new WasmComponentDriver({wasmServiceLifecycle: lifecycle});
    bindManager(f, host);
    const started = await host.manager.bootstrapConsensusCreation(host.intent);
    assert.equal(started.status, 'BOOTSTRAPPED_HELD', JSON.stringify(started));
    const row = journalRow(f, host);
    assert.equal(started.operationId, row.operation_id, 'START continues original CREATE row');
    assert.equal(row.state, 'in_progress');
    host.token = JSON.parse(row.admission_json);
    assert.deepEqual(started.consensusResourceToken, host.token);
    assert.equal(w.metadata.db.prepare('SELECT count(*) AS n FROM wasm_operations').get().n,
      priorRows + slot + 1, 'one manager-owned journal row per creation, no nested journal');
    writeFileSync(join(w.directory, `token-${request.requestId.nonce}-${slot}.json`),
      json(host.token), {flag: 'wx'});
    host.replica = lifecycle.activeReplicas.get(w.metadata.serviceId);
    assert.ok(host.replica, 'the real lifecycle creates the replica');
    f.replicas.push(host.replica);
    f.clocks.push(timeSource);
    assert.equal(host.publications.length, 0, 'held operation cannot publish serving or endpoint');
  }
  await form(f);
  f.phase = 'measured';
  return f;
}

async function administer(f, command) {
  let result = {state: 'pending'};
  const host = f.hosts.find((item) => item.replica === f.leader);
  const pending = host.lifecycle.administerWriter(f.world.metadata.serviceId, command);
  Promise.resolve(pending).then((value) => {
    result = {state: 'fulfilled', value};
  }, (error) => {
    result = {state: 'rejected', error: {code: error.code, message: error.message}};
  });
  await deliverScheduled(f);
  assert.equal(result.state, 'fulfilled');
  return result.value;
}

async function publish(f, host) {
  let result = null;
  const pending = host.lifecycle.publishReplica(f.world.metadata.serviceId, host.token);
  Promise.resolve(pending).then((value) => {
    result = value;
  });
  await deliverScheduled(f);
  assert.ok(result, 'publication settled in the declared delivery schedule');
  return result;
}

async function initializeAndPublish(t, f) {
  const serviceId = f.binding.serviceDefinitionId;
  const incarnation = f.binding.incarnation;
  // The production-authored INIT of this binding (never a test nonce).
  f.init = {...PREFIX, action: 'INIT', serviceId, incarnation, nonce: f.binding.requestId.nonce};
  f.enroll = {...PREFIX, action: 'ENROLL', serviceId, incarnation, slot: 0,
    expectedGeneration: 0, expectedCompletedSequence: 0, expectedReceiptDigest: null,
    newGeneration: 1, nonce: '33'.repeat(32)};
  // Native events drive the same keyed continuation (no delayed wakes in
  // this fixture): the leader's run authors and commits INIT, and each run
  // that observes covered genesis grants its slot. The explicit, token-bound
  // publishReplica then answers PUBLISHED for every founder, idempotently.
  // (Superseded with amendment A2' of SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017:
  // the former text "or as the grant of one whose event-run CAS lost to a
  // sibling slot's concurrent grant" no longer applies; the metadata owner
  // re-decides a sibling-slot CAS loss itself, so every founder's event run
  // grants its own slot.)
  await deliverScheduled(f);
  for (const host of f.hosts) {
    const published = await publish(f, host);
    assert.equal(published.status, 'PUBLISHED', JSON.stringify(published));
    assert.equal(published.started, true);
    const current = await f.world.metadata.primary.resolveInstanceResource(f.binding, host.token);
    assert.equal(current.phase, 'PUBLISHED');
    // Positive ACTIVE/endpoint projection belongs to the deferred discovery
    // stage. This native proof stops at the durable local grant.
  }
  assert.deepEqual(f.leader.writerState.meta().initialization.command, f.init);
  assert.equal((await administer(f, f.enroll)).status, 'RECORDED');
  f.request = {...f.request, requestId: {serviceId, incarnation, slot: 0,
    generation: 1, sequence: 1}, ack: null};
  evidence(t, f, 'initialized-and-published');
  f.events.length = 0;
}

function startWrite(f, request = f.request) {
  f.response = {state: 'pending'};
  record(f, 'strong-call', {request});
  f.write = f.leader.handleMessage({payload: request}).then((value) => {
    f.response = {state: 'fulfilled', value};
    record(f, 'caller-settlement', {response: f.response, views: views(f)});
    return value;
  }, (error) => {
    f.response = {state: 'rejected', error: {code: error.code, message: error.message}};
    record(f, 'caller-settlement', {response: f.response});
  });
}

async function retire(f) {
  for (const host of f.hosts) {
    const row = journalRow(f, host);
    const retired = await host.lifecycle.retireReplica({intent: JSON.parse(row.intent_json),
      token: JSON.parse(row.admission_json), operationId: row.operation_id,
      outcome: 'ADMISSION_RETAINED'});
    assert.equal(retired.closed, true, JSON.stringify(retired));
    const resource = await f.world.metadata.primary.resolveInstanceResource(f.binding, host.token);
    assert.equal(resource.phase, 'CLOSED');
  }
}

export {world, createGroup, initializeAndPublish, administer, retire, startWrite,
  deliverScheduled, evidence, assertRecordedWrite, proposalEntries};
