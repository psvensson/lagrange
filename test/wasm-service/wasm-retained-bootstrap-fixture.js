// Real native WASM replicas; metadata/journal remain explicit SQLite component adapters.
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
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {createOriginFixture} from '../service/service-consensus-creation-fixture.js';
import {deliverScheduled} from './wasm-strong-write-native-fixture.js';

const SETUP_ROUNDS = 200;
const MODULE_VERSION = '1.0.0';
const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
const PREFIX = {type: 'WASM_WRITER_V1', profile: 'wasm-writer-v1/1'};

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
    manifest: {namespace: 'retained-bootstrap', name: handler, version: MODULE_VERSION,
      digest: `sha256:${'a'.repeat(64)}`, runExport: 'run', exports: ['run'],
      dependencies: [], capabilities: []}, exports: {run: (_ctx, args) => args}});
  return owner;
}
async function fixture(t, {holdCreationReconciliation = false} = {}) {
  const cleanups = [];
  const metadata = await createOriginFixture({after: (fn) => cleanups.push(fn)});
  const directory = mkdtempSync(join(tmpdir(), 'wasm-retained-bootstrap-'));
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({level: 'error'});
  const f = {metadata, directory, hosts: [], replicas: [], queue: [], held: [], events: [],
    clocks: [], phase: 'setup', holdResponses: false};
  t.after(async () => {
    const failures = [];
    for (const host of f.hosts) {
      try {
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
  f.transport = createLoopbackTransport();
  f.deliver = f.transport.deliver;
  f.transport.deliver = (address, envelope, ...options) => {
    f.queue.push({address, envelope: structuredClone(envelope), options});
    return Promise.resolve({delivered: true});
  };
  f.addHost = async (slot) => {
    const intent = structuredClone(metadata.intent);
    intent.consensusSlotRequest = metadata.slotRequest(slot);
    intent.descriptor.replicaId = intent.consensusSlotRequest.replicaId;
    const nodeId = intent.consensusSlotRequest.nodeId;
    const definition = JSON.parse(intent.descriptor.runtimeConfig).definition;
    intent.descriptor.runtimeRef = definition.handlerFunctionId;
    const timeSource = new VirtualTimeSource({startMs: 1000});
    const dataDirectoryManager = directoryOwner(join(directory, nodeId), nodeId);
    const moduleMirror = await mirror(definition.handlerFunctionId);
    const processOwner = acquireDataDirectoryProcessOwner(dataDirectoryManager.getDataDir());
    const lifecycle = new WasmServiceLifecycle({nodeId, timeSource,
      messageRouter: f.transport, serviceDefinitionsOwner: metadata.primary,
      dataDirectoryManager, moduleMirror, portAllocator: new PortAllocator()});
    lifecycle.logger = QUIET;
    // Earlier bootstrap/genesis tests prescribe explicit reentry order. Hold
    // only the new event queue's delivery at its existing scheduling seam;
    // assertions and native event production are unchanged. Default is live.
    const reconciliationDrains = [];
    if (holdCreationReconciliation && lifecycle.creationReconcileQueue) {
      lifecycle.creationReconcileQueue.scheduleDrainFn = (drain) =>
        reconciliationDrains.push(drain);
    }
    const driver = new WasmComponentDriver({wasmServiceLifecycle: lifecycle});
    const registry = new RuntimeDriverRegistry();
    registry.register(driver);
    const runtime = new ServiceRuntimeLifecycle(registry);
    const publications = [];
    runtime.setOperationWriter(async (...args) => {
      publications.push({kind: 'nested-journal', args});
      throw new Error('BOUND_BOOTSTRAP_CREATED_NESTED_JOURNAL');
    });
    runtime.setEndpointWriter(async (...args) => {
      publications.push({kind: 'endpoint', args});
      throw new Error('BOUND_BOOTSTRAP_PUBLISHED_ENDPOINT');
    });
    runtime.setStateProjectionWriter(async (...args) => {
      publications.push({kind: 'projection', args});
      throw new Error('BOUND_BOOTSTRAP_PUBLISHED_STATE');
    });
    const manager = metadata.manager();
    manager.registerAdapter(new RuntimeServiceAdapter({serviceRuntimeLifecycle: runtime}));
    const host = {intent, nodeId, manager, runtime, driver, lifecycle, publications,
      timeSource, processOwner, reconciliationDrains};
    f.hosts.push(host);
    return host;
  };
  f.bootstrap = async (host) => {
    const result = await host.manager.bootstrapConsensusCreation(host.intent);
    host.result = result;
    host.replica = host.lifecycle.getReplica(metadata.serviceId);
    return result;
  };
  return f;
}
async function bootstrapGroup(f) {
  for (let slot = 0; slot < f.metadata.intent.consensusBinding.foundingPeers.length; slot += 1) {
    const host = await f.addHost(slot);
    const answer = await f.bootstrap(host);
    assert.equal(answer.status, 'BOOTSTRAPPED_HELD', JSON.stringify(answer));
    f.replicas.push(host.replica);
    f.clocks.push(host.timeSource);
  }
  for (let round = 0; round < SETUP_ROUNDS; round += 1) {
    await f.replicas[0].raft.tick();
    await deliverScheduled(f);
    const statuses = f.replicas.map((replica) => replica.raft.readStatus());
    if (statuses[0].role === 'leader' &&
        statuses.every((s) => s.leaderId === f.replicas[0].replicaId)) {
      f.groupId = statuses[0].groupId;
      f.leader = f.replicas[0];
      const records = f.replicas.map((r) =>
        RaftRsDurableStore.readDurableRecordIn(r.db, f.groupId));
      if (records.every((record) => BigInt(record.appliedIndex) > 0n)) return;
    }
  }
  assert.fail('native bootstrap setup did not form within the fixed schedule');
}
function initialization(binding) {
  return {...PREFIX, action: 'INIT', serviceId: binding.serviceDefinitionId,
    incarnation: binding.incarnation, nonce: binding.requestId.nonce};
}
async function administer(f, command) {
  let answer;
  const pending = f.hosts[0].lifecycle.administerWriter(f.metadata.serviceId, command);
  Promise.resolve(pending).then((value) => {
    answer = value;
  });
  await deliverScheduled(f);
  assert.ok(answer, 'native administration settled in the declared delivery schedule');
  return answer;
}
async function fixtureWithHeldReconciliation(t) {
  return fixture(t, {holdCreationReconciliation: true});
}
export {fixture, fixtureWithHeldReconciliation, bootstrapGroup, initialization,
  administer, deliverScheduled};
