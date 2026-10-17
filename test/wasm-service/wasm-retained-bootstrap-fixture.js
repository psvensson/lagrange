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
import {consensusBootstrapDescriptor, CONSENSUS_BOOTSTRAP} from
  '../../src/service/service-consensus-bootstrap.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
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
// The production answer of the inbound dispatcher for an address whose handler
// retired (message-router-inbound-dispatch): acknowledged, no handler. The
// shared loopback throws instead, which no production consensus path does.
const RETIRED_ADDRESS_ANSWER = Object.freeze({acknowledged: true, noHandler: true});
const SUCCESSOR_OPERATION_PREFIX = 'successor-operation-';

// A wake consumer standing in for the operation owner of the original CREATE
// (design SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017 D6'/N7): a
// genesis-observed or resource-closed wake re-enters the host's original
// operation exactly once. A grant-held wake is recorded only; a test re-enters
// explicitly. Superseded by amendment A2 as revised by A2' (A2'.4, A2'.7):
// "this one re-drives only a grant whose single-row CAS lost to a sibling
// slot's concurrent grant (owner answer STATE_CHANGED)" - the metadata owner
// now re-decides a lost slot CAS itself, so STATE_CHANGED reaches this
// consumer only at bound exhaustion and is recorded like every other hold.
// Passed explicitly: without it the lifecycle has no consumer, exactly as in
// production today.
function reenterOnWake(f, host, wake) {
  if (wake.reason === RECONCILE_REASON.CREATION_GRANT_HELD) return undefined;
  host.reentries += 1;
  const reentry = f.bootstrap(host);
  host.reentryResults.push(reentry);
  return reentry;
}

async function fixture(t, {automaticReconciliation = false, creationWake = null,
  tolerateRetiredAddress = false} = {}) {
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
  const loopbackDeliver = f.transport.deliver;
  f.deliver = tolerateRetiredAddress ? function(address, envelope, ...options) {
    if (this.getRegisteredHandler(address) === null) return Promise.resolve(RETIRED_ADDRESS_ANSWER);
    return Reflect.apply(loopbackDeliver, this, [address, envelope, ...options]);
  } : loopbackDeliver;
  f.transport.deliver = (address, envelope, ...options) => {
    f.queue.push({address, envelope: structuredClone(envelope), options});
    return Promise.resolve({delivered: true});
  };
  // One original intent per (binding, slot): the retained creation of I, or a
  // successor J's with its own operation identity on the same founding peer.
  f.intentFor = (slot, binding = metadata.intent.consensusBinding,
    operationId = metadata.slotRequest(slot).operationId) => {
    const intent = structuredClone(metadata.intent);
    intent.consensusBinding = structuredClone(binding);
    intent.consensusSlotRequest = metadata.slotRequest(slot, 0, operationId);
    intent.descriptor.replicaId = intent.consensusSlotRequest.replicaId;
    const definition = JSON.parse(intent.descriptor.runtimeConfig).definition;
    intent.descriptor.runtimeRef = definition.handlerFunctionId;
    return intent;
  };
  f.successorIntent = (slot, binding) =>
    f.intentFor(slot, binding, `${SUCCESSOR_OPERATION_PREFIX}${slot}`);
  f.addHost = async (slot, intent = f.intentFor(slot)) => {
    const nodeId = intent.consensusSlotRequest.nodeId;
    const definition = JSON.parse(intent.descriptor.runtimeConfig).definition;
    const timeSource = new VirtualTimeSource({startMs: 1000});
    const dataDirectoryManager = directoryOwner(join(directory, nodeId), nodeId);
    const moduleMirror = await mirror(definition.handlerFunctionId);
    const processOwner = acquireDataDirectoryProcessOwner(dataDirectoryManager.getDataDir());
    const host = {intent, nodeId, timeSource, processOwner, wakes: [], reentries: 0,
      reentryResults: []};
    const dependencies = {nodeId, timeSource,
      messageRouter: f.transport, serviceDefinitionsOwner: metadata.primary,
      dataDirectoryManager, moduleMirror, portAllocator: new PortAllocator()};
    if (creationWake !== null) {
      dependencies.creationWake = (serviceDefinitionId, wake) => {
        host.wakes.push({serviceDefinitionId, ...structuredClone(wake)});
        return creationWake(f, host, wake);
      };
    }
    const lifecycle = new WasmServiceLifecycle(dependencies);
    lifecycle.logger = QUIET;
    // Historical manual-reentry witnesses control native-wake delivery. This
    // is a fixture-only queue boundary, not a product activation flag. New
    // autonomous witnesses pass automaticReconciliation=true and never install it.
    let deliverReconciliation = automaticReconciliation;
    const delayedWakes = new Map();
    const observed = new WeakSet();
    const createReplica = lifecycle.createReplica.bind(lifecycle);
    lifecycle.createReplica = (...args) => {
      const replica = createReplica(...args);
      const queue = replica.creationReconciliation?.queue;
      if (queue && !observed.has(queue)) {
        observed.add(queue);
        queue.logger = QUIET;
        if (!deliverReconciliation) {
          const enqueue = queue.enqueue.bind(queue);
          queue.enqueue = (...entry) => {
            if (!deliverReconciliation && !entry[3]?.completionWaiter) {
              delayedWakes.set(queue, () => enqueue(...entry));
              return true;
            }
            return enqueue(...entry);
          };
        }
      }
      return replica;
    };
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
    Object.assign(host, {manager, runtime, driver, lifecycle, publications,
      resumeReconciliation() {
        deliverReconciliation = true;
        for (const wake of delayedWakes.values()) wake();
        delayedWakes.clear();
      }});
    f.hosts.push(host);
    return host;
  };
  f.bootstrap = async (host) => {
    const result = await host.manager.bootstrapConsensusCreation(host.intent);
    host.result = result;
    host.replica = host.lifecycle.getReplica(metadata.serviceId);
    return result;
  };
  // Durable retirement custody is the creation row (design N4): the stop
  // handle is rebuilt from intent_json/admission_json, never from a live map.
  f.handle = (host, intent = host.intent) => {
    const row = metadata.db.prepare('SELECT * FROM wasm_operations WHERE operation_id = ?')
      .get(intent.consensusSlotRequest.operationId);
    assert.ok(row?.admission_json, 'the creation row retains the admitted token');
    const token = JSON.parse(row.admission_json);
    const retained = {intent: JSON.parse(row.intent_json), token, operationId: token.operationId,
      outcome: CONSENSUS_BOOTSTRAP.ADMISSION};
    return {definition: consensusBootstrapDescriptor(retained), consensusCreation: retained,
      consensusOpeningOwner: host.manager};
  };
  f.retire = (host, intent = host.intent) => host.manager.stopReplica(f.handle(host, intent));
  return f;
}
// Form the replicas in f.replicas: tick the first until it leads and every
// durable record has applied progress. No status-as-progress drive.
async function formGroup(f) {
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
async function bootstrapGroup(f) {
  for (let slot = 0; slot < f.metadata.intent.consensusBinding.foundingPeers.length; slot += 1) {
    const host = await f.addHost(slot);
    const answer = await f.bootstrap(host);
    assert.equal(answer.status, 'BOOTSTRAPPED_HELD', JSON.stringify(answer));
    f.replicas.push(host.replica);
    f.clocks.push(host.timeSource);
  }
  await formGroup(f);
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
export {fixture, bootstrapGroup, formGroup, initialization, administer, deliverScheduled,
  reenterOnWake};
