// Actual manager-retained intent and metadata CAS, with explicitly component
// SQLite journal/read adapters. The physical WASM lifecycle and native ports
// are real; no services ACTIVE rows, local root, grant or closure are injected.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOriginFixture} from '../service/service-consensus-creation-fixture.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DataDirectoryManager} from '../../src/storage/data-directory-manager.js';
import {WasmServiceLifecycle} from '../../src/wasm-service/wasm-service-lifecycle.js';
import {ModuleMirror} from '../../src/wasm-service/module-mirror.js';
import {PortAllocator} from '../../src/wasm-service/port-allocator.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {createLoopbackTransport} from '../partition/partition-service-test-support.js';
import {deliverScheduled} from './wasm-strong-write-native-fixture.js';

const QUIET = {debug() {}, info() {}, warn() {}, error() {}};
function configure(directory, nodeId) {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: nodeId},
    storage: {dataDir: directory}, raft: {heartbeatIntervalMs: 50,
      electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300, tickIntervalMs: 10}});
  const directories = new DataDirectoryManager();
  directories.initialize();
  return directories;
}
async function fixture(t) {
  const cleanups = [];
  const origin = await createOriginFixture({after: (fn) => cleanups.push(fn)});
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wasm-admitted-bootstrap-'));
  LoggingService.resetInstance();
  LoggingService.getInstance().initialize({level: 'error'});
  const f = {origin, directory, hosts: [], replicas: [], clocks: [],
    queue: [], held: [], events: [], holdResponses: false, phase: 'setup'};
  f.transport = createLoopbackTransport();
  f.deliver = f.transport.deliver;
  f.transport.deliver = (address, envelope, ...options) => {
    f.queue.push({address, envelope: structuredClone(envelope), options});
    return Promise.resolve({delivered: true});
  };
  t.after(async () => {
    const errors = [];
    for (const host of f.hosts) {
      try {
        await host.lifecycle.shutdownAll();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const cleanup of cleanups) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, `retained evidence ${directory}`);
    fs.rmSync(directory, {force: true, recursive: true});
    LoggingService.resetInstance();
    ConfigurationManager.resetInstance();
  });
  return f;
}
async function host(f, slot = 0) {
  const request = f.origin.slotRequest(slot);
  const intent = structuredClone(f.origin.intent);
  intent.consensusSlotRequest = request;
  intent.descriptor.replicaId = request.replicaId;
  const preparation = await f.origin.lifecycle.prepareConsensusCreation(intent);
  assert.equal(preparation.outcome, 'ADMISSION_RETAINED');
  const directories = configure(path.join(f.directory, request.nodeId), request.nodeId);
  const mirror = new ModuleMirror();
  // Existing manifest validation and real mirror. No guest code is executed
  // in this held-bootstrap proof and artifact digest certification stays open.
  await mirror.setModule('creation-test-handler', {version: '1.0.0',
    wasmBytes: Buffer.from('0061736d01000000', 'hex'),
    manifest: {namespace: 'creation-bootstrap', name: 'creation-test-handler', version: '1.0.0',
      digest: `sha256:${'a'.repeat(64)}`, runExport: 'run', exports: ['run'],
      dependencies: [], capabilities: []}, exports: {run: (_context, args) => args}});
  const allocator = new PortAllocator();
  const effects = [];
  const allocate = allocator.allocate.bind(allocator);
  allocator.allocate = (...args) => {
    effects.push(['allocate', ...args]); return allocate(...args);
  };
  const lifecycle = new WasmServiceLifecycle({nodeId: request.nodeId,
    dataDirectoryManager: directories, messageRouter: f.transport,
    moduleMirror: mirror, portAllocator: allocator, serviceDefinitionsOwner: f.origin.primary});
  lifecycle.logger = QUIET;
  const h = {lifecycle, preparation, intent, directories, effects, allocator,
    startOptions: {handlerFunctionId: 'creation-test-handler', moduleVersion: '1.0.0',
      serviceDefinition: {...f.origin.request().definition, serviceId: f.origin.serviceId}}};
  const register = lifecycle.registerEndpoint.bind(lifecycle);
  lifecycle.registerEndpoint = (...args) => {
    effects.push(['endpoint', ...args]); return register(...args);
  };
  f.hosts.push(h);
  return h;
}
async function open(f, h) {
  assert.equal(typeof h.lifecycle.createAdmittedReplica, 'function', 'MISSING_ADMITTED_PHYSICAL_HANDOFF');
  const replica = await h.lifecycle.createAdmittedReplica(h.preparation);
  assert.ok(replica, 'actual lifecycle must return its held replica');
  replica.providedTimeSource = new VirtualTimeSource({startMs: 1000});
  f.clocks.push(replica.providedTimeSource);
  f.replicas.push(replica);
  h.replica = replica;
  h.started = await h.lifecycle.startReplica(f.origin.serviceId, h.startOptions);
  assert.equal(h.started.status, 'BOOTSTRAPPED_HELD');
  assert.equal(h.started.started, false);
  assert.equal(h.started.bootstrapped, true);
  assert.deepEqual(h.effects, [], 'HELD_BOOTSTRAP_PUBLISHED_OR_ALLOCATED_USER_PORT');
  return replica;
}
async function form(f) {
  for (let round = 0; round < 200; round += 1) {
    await f.replicas[0].raft.tick();
    await deliverScheduled(f);
    const statuses = f.replicas.map((r) => r.raft.readStatus());
    if (statuses[0].role === 'leader' && statuses.every((s) => s.leaderId === f.replicas[0].replicaId)) {
      f.leader = f.replicas[0];
      f.groupId = statuses[0].groupId;
      return;
    }
  }
  assert.fail('native admitted bootstrap did not form within declared setup');
}
function init(binding, incarnation = binding.incarnation) {
  return {type: 'WASM_WRITER_V1', profile: 'wasm-writer-v1/1', action: 'INIT',
    serviceId: binding.serviceDefinitionId, incarnation, nonce: '2'.repeat(64)};
}
export {fixture, host, open, form, init, deliverScheduled};
