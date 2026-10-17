// The C6 handler embedding of design ACTIVATION-DISCOVERY-DESIGN-20261017
// (RV1.6, RV2.6, RV3.1): three in-process hosts, each a real
// RuntimeServiceHandler + ServiceLifecycleManager (component SQLite journal and
// the production metadata owner) + ServiceRuntimeLifecycle with the REAL
// endpoint writer (wireRuntimeEndpointPublication over a ServiceEndpointsOwner,
// non-zero boot incarnation) and the REAL services projection
// (projectRuntimeReplicaServicesRow over a ServicesOwner) + WasmComponentDriver
// + WasmServiceLifecycle on native raft-rs with a port allocator, module mirror,
// virtual time source and data directory, + a real ExecutorOutcomeEmitter.
// No roleUpdateWriter/leaderNodeUpdateWriter is injected: the replica's role and
// leader CAS run through its production predicate over the component SQLite.
// The lifecycle dependency object is the production owner's
// (createWasmServiceNodeDependencies over a node-shaped owner: endpointHost,
// systemTableCache, creationWake are its getters), plus the owners CONTRACT-R2
// says the embedding supplies. CREATE/REMOVE payloads are authored from
// ReplicaOperationField keys (RV2.6); the producer-side retention before
// dispatch is the manager's prepareConsensusCreation, called by this fixture.
// Evidence ceiling: component SQLite metadata/journal/services/endpoints, a
// queued loopback transport, one process; not native metadata consensus.
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {acquireDataDirectoryProcessOwner} from '../../src/storage/data-directory-process-owner.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {ModuleMirror} from '../../src/wasm-service/module-mirror.js';
import {PortAllocator} from '../../src/wasm-service/port-allocator.js';
import {WasmServiceLifecycle} from '../../src/wasm-service/wasm-service-lifecycle.js';
import {RuntimeServiceAdapter} from '../../src/service/adapters/runtime-service-adapter.js';
import {ServiceRuntimeLifecycle} from '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from '../../src/runtime/runtime-driver-registry.js';
import {WasmComponentDriver} from '../../src/runtime/wasm-component-driver.js';
import {createWasmServiceNodeDependencies} from '../../src/runtime/runtime-startup-wiring.js';
import {wireRuntimeEndpointPublication} from
  '../../src/runtime/runtime-endpoint-publication-wiring.js';
import {projectRuntimeReplicaServicesRow} from
  '../../src/query/runtime-replica-state-projection.js';
import {RuntimeServiceHandler} from '../../src/node/runtime-service-handler.js';
import {ExecutorOutcomeEmitter, OUTCOME_EVENT_NAME} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {ReplicaOperationField, ReplicaOperationMessageType} from
  '../../src/rebalancer/replica-operation-constants.js';
import {SYSTEM_TABLE_SCHEMAS, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {serializeServiceDefinition} from '../../src/wasm-service/wasm-service-models.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {createOriginFixture} from '../service/service-consensus-creation-fixture.js';
import {deliverScheduled} from './wasm-strong-write-native-fixture.js';

const SETUP_ROUNDS = 200;
const SETTLE_ROUNDS = 120;
const MODULE_VERSION = '1.0.0';
const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
const BOOT_INCARNATION_BASE = 40;
const RETIRED_ADDRESS_ANSWER = Object.freeze({acknowledged: true, noHandler: true});
// The node address owners of the three hosts: the entrypoint's host:port
// NODE_ADDRESS (what nodes.node_address carries); host 3 also advertises a
// WebSocket address, which the endpoint host owner prefers (RV3.1, cell e).
const NODE_ADDRESSES = Object.freeze([
  {nodeAddress: 'host-1.lab.test:8081', advertisedNodeWsAddress: null},
  {nodeAddress: 'host-2.lab.test:8082', advertisedNodeWsAddress: null},
  {nodeAddress: 'host-3.lab.test:8083', advertisedNodeWsAddress: 'ws://edge-3.lab.test:9003'},
]);

function directoryOwner(directory, nodeId) {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: nodeId},
    storage: {dataDir: directory}, raft: {heartbeatIntervalMs: 50,
      electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300, tickIntervalMs: 10}});
  const owner = new DataDirectoryManager();
  owner.initialize();
  return owner;
}
async function mirror(handler) {
  const owner = new ModuleMirror();
  await owner.setModule(handler, {version: MODULE_VERSION,
    wasmBytes: Buffer.from('0061736d01000000', 'hex'),
    manifest: {namespace: 'handler-embedding', name: handler, version: MODULE_VERSION,
      digest: `sha256:${'a'.repeat(64)}`, runExport: 'run', exports: ['run'],
      dependencies: [], capabilities: []}, exports: {run: (_ctx, args) => args}});
  return owner;
}

// LABELLED SEAM (RV2.6, "no fabricated routing rows"): the node cache the
// handler and the replica read. services rows are READ THROUGH the component
// SQLite the real writers mutate, never authored. Two authored row kinds exist
// and are named: the service_definitions row of S (the handler classifies a
// definition only on the not-retained path) and the services-p1 write-readiness
// rows isSystemTableWriteReady requires (a partitions record and its canonical
// leader service row). Neither is a row of S or of any replica of S.
class EmbeddingCache {
  constructor(db, definitionRow) {
    this.db = db;
    this.definitions = [definitionRow];
    this.writeReady = {
      partitions: [{partition_id: 'services-p1', leader_node_id: 'host-1'}],
      services: [{service_id: 'services-p1-seam', service_type: 'partition',
        partition_id: 'services-p1', status: 'active', node_id: 'host-1'}],
    };
  }
  getAll(table) {
    if (table === 'services') {
      return [...this.db.prepare('SELECT * FROM services').all(), ...this.writeReady.services];
    }
    if (table === 'service_definitions') return [...this.definitions];
    if (table === 'partitions') return [...this.writeReady.partitions];
    return [];
  }
  get(table, key) {
    if (table === 'services') {
      return this.db.prepare('SELECT * FROM services WHERE service_id = ?').get(key) ??
        this.writeReady.services.find((row) => row.service_id === key) ?? null;
    }
    return this.getAll(table).find((row) => (row.service_id ?? row.partition_id) === key) ??
      null;
  }
  filter(table, predicate) {
    return this.getAll(table).filter(predicate);
  }
  find(table, predicate) {
    return this.getAll(table).find(predicate);
  }
}

function createHandler(host) {
  const handler = new RuntimeServiceHandler({nodeId: host.nodeId,
    systemTableCache: host.cache, cdcIntegrationService: host.owners.cdc,
    serviceLifecycleManager: host.manager, serviceRuntimeLifecycle: host.runtime,
    executorOutcomeEmitter: host.emitter});
  handler.logger = QUIET;
  handler.initialize();
  host.node.runtimeServiceHandler = handler;
  host.handler = handler;
  return handler;
}

async function embedding(t) {
  const cleanups = [];
  const metadata = await createOriginFixture({after: (fn) => cleanups.push(fn)},
    {canonicalFounders: true});
  for (const table of ['services', 'service_endpoints']) {
    metadata.db.exec(generateCreateTableSQL(SYSTEM_TABLE_SCHEMAS.find((schema) =>
      schema.tableName === table)));
  }
  const directory = mkdtempSync(join(tmpdir(), 'bound-handler-embedding-'));
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({level: 'error'});
  // `events` is the shared delivery helper's record sink (deliverScheduled).
  const e = {metadata, directory, hosts: [], replicas: [], queue: [], events: [], clocks: [],
    serviceId: metadata.serviceId};
  t.after(async () => {
    const failures = [];
    for (const host of e.hosts) {
      try {
        host.handler.shutdown();
        await host.lifecycle.shutdownAll();
        host.processOwner.release();
      } catch (error) {
        failures.push(error);
      }
    }
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, `retained evidence ${directory}`);
    rmSync(directory, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });
  e.transport = createLoopbackTransport();
  const loopbackDeliver = e.transport.deliver;
  e.deliver = function(address, envelope, ...options) {
    if (this.getRegisteredHandler(address) === null) return Promise.resolve(RETIRED_ADDRESS_ANSWER);
    return Reflect.apply(loopbackDeliver, this, [address, envelope, ...options]);
  };
  e.transport.deliver = (address, envelope, ...options) => {
    e.queue.push({address, envelope: structuredClone(envelope), options});
    return Promise.resolve({delivered: true});
  };
  e.intentFor = (slot, binding = metadata.intent.consensusBinding,
    operationId = metadata.slotRequest(slot).operationId) => {
    const intent = structuredClone(metadata.intent);
    intent.consensusBinding = structuredClone(binding);
    intent.consensusSlotRequest = metadata.slotRequest(slot, 0, operationId);
    intent.descriptor.replicaId = intent.consensusSlotRequest.replicaId;
    const definition = JSON.parse(intent.descriptor.runtimeConfig).definition;
    intent.descriptor.runtimeRef = definition.handlerFunctionId;
    return intent;
  };
  e.addHost = async (slot) => {
    const intent = e.intentFor(slot);
    const nodeId = intent.consensusSlotRequest.nodeId;
    const definition = JSON.parse(intent.descriptor.runtimeConfig).definition;
    const timeSource = new VirtualTimeSource({startMs: 1000});
    const dataDirectoryManager = directoryOwner(join(directory, nodeId), nodeId);
    const processOwner = acquireDataDirectoryProcessOwner(dataDirectoryManager.getDataDir());
    const owners = metadata.owner(nodeId);
    // The definition row as the serializer writes it (binding_* keys, null).
    const cache = new EmbeddingCache(metadata.db, serializeServiceDefinition({
      serviceId: metadata.serviceId, serviceName: metadata.serviceId,
      handlerFunctionId: definition.handlerFunctionId, runtimeKind: 'wasm_component',
      runtimeRef: intent.descriptor.runtimeRef, runtimeConfig: intent.descriptor.runtimeConfig},
    timeSource.now()));
    const node = {nodeId, ...NODE_ADDRESSES[slot], messageRouter: e.transport,
      cdcIntegrationService: owners.cdc, runtimeServiceHandler: null,
      peekSystemTableCache: () => cache};
    // The production dependency owner's getters, plus the owners the embedding
    // supplies (CONTRACT-R2): port allocator, module mirror, metadata owner,
    // time source, data directory. Getters are copied as getters (lazy).
    const dependencies = Object.defineProperties({},
      {...Object.getOwnPropertyDescriptors(createWasmServiceNodeDependencies(node)),
        portAllocator: {value: new PortAllocator(), enumerable: true},
        moduleMirror: {value: await mirror(definition.handlerFunctionId), enumerable: true},
        serviceDefinitionsOwner: {value: metadata.primary, enumerable: true},
        timeSource: {value: timeSource, enumerable: true},
        dataDirectoryManager: {value: dataDirectoryManager, enumerable: true}});
    const lifecycle = new WasmServiceLifecycle(dependencies);
    lifecycle.logger = QUIET;
    const driver = new WasmComponentDriver({wasmServiceLifecycle: lifecycle});
    const registry = new RuntimeDriverRegistry();
    registry.register(driver);
    const runtime = new ServiceRuntimeLifecycle(registry);
    runtime.setOperationWriter(async () => {
      throw new Error('BOUND_ROUTE_CREATED_NESTED_JOURNAL');
    });
    wireRuntimeEndpointPublication({bootIncarnation: BOOT_INCARNATION_BASE + slot, nodeId,
      serviceEndpointsOwner: owners.endpoints, serviceRuntimeLifecycle: runtime,
      systemTableCache: cache});
    runtime.setStateProjectionWriter((serviceId, stateRow) =>
      projectRuntimeReplicaServicesRow(owners.services, nodeId, serviceId, stateRow));
    const manager = metadata.manager();
    manager.registerAdapter(new RuntimeServiceAdapter({serviceRuntimeLifecycle: runtime}));
    const emitter = new ExecutorOutcomeEmitter({logger: QUIET});
    const host = {slot, intent, nodeId, node, timeSource, processOwner, owners, cache, lifecycle,
      driver, runtime, manager, emitter, outcomes: [], dependencies};
    emitter.on(OUTCOME_EVENT_NAME, (outcome) => host.outcomes.push(outcome));
    createHandler(host);
    e.hosts.push(host);
    e.clocks.push(timeSource);
    return host;
  };
  e.restartHandler = (host) => {
    host.handler.shutdown();
    return createHandler(host);
  };
  // Producer-side retention before dispatch (CONTRACT-R2): journal row,
  // reservation and the retained admission token, by the manager.
  e.retain = (host) => host.manager.prepareConsensusCreation(host.intent);
  e.request = (host, type, operationId = host.intent.consensusSlotRequest.operationId) => ({
    [ReplicaOperationField.TYPE]: type,
    [ReplicaOperationField.OPERATION_ID]: operationId,
    [ReplicaOperationField.OPERATION_TYPE]:
      type === ReplicaOperationMessageType.CREATE_REPLICA ? 'ADD' : 'REMOVE',
    [ReplicaOperationField.PARTITION_ID]: metadata.serviceId,
    [ReplicaOperationField.REPLICA_ID]: host.intent.consensusSlotRequest.replicaId,
    [ReplicaOperationField.ENTITY_TYPE]: 'runtime_service',
    [ReplicaOperationField.ENTITY_ID]: metadata.serviceId});
  e.dispatch = async (host, type, operationId) => {
    const answer = await host.handler.handleMessage({correlationId: `c-${host.nodeId}`,
      payload: e.request(host, type, operationId)});
    return answer;
  };
  e.idle = () => e.hosts.every((host) => host.handler.inProgressOperations.size === 0);
  // Deliver the queued native traffic and let the handlers' setImmediate work
  // run, for a declared number of rounds, until `until()` holds and no handler
  // has work in flight. No timer, no wall clock.
  e.settle = async (until = () => true, label = 'embedding settle') => {
    for (let round = 0; round < SETTLE_ROUNDS; round += 1) {
      await deliverScheduled(e);
      await new Promise((resolve) => setImmediate(resolve));
      if (e.idle() && e.queue.length === 0 && until()) return round;
    }
    assert.fail(`${label}: did not settle within the declared rounds`);
  };
  e.replicaOf = (host) => host.lifecycle.getReplica(metadata.serviceId);
  e.form = async () => {
    const replicas = e.hosts.map((host) => e.replicaOf(host));
    e.replicas = replicas;
    for (let round = 0; round < SETUP_ROUNDS; round += 1) {
      await replicas[0].raft.tick();
      await deliverScheduled(e);
      const statuses = replicas.map((replica) => replica.raft.readStatus());
      if (statuses[0].role === 'leader' &&
          statuses.every((status) => status.leaderId === replicas[0].replicaId)) {
        e.groupId = statuses[0].groupId;
        e.leader = replicas[0];
        const records = replicas.map((replica) =>
          RaftRsDurableStore.readDurableRecordIn(replica.db, e.groupId));
        if (records.every((record) => BigInt(record.appliedIndex) > 0n)) return;
      }
    }
    assert.fail('handler embedding: the bound group did not form within the fixed schedule');
  };
  e.rows = (table) => metadata.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all();
  e.outcomeTypes = (host) => host.outcomes.map((outcome) => outcome.outcomeType);
  return e;
}

export {embedding};
