import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  WasmServiceLifecycle,
  REPLICA_LIFECYCLE_STATE,
} from '../../src/wasm-service/wasm-service-lifecycle.js';
import {PortAllocator} from
  '../../src/wasm-service/port-allocator.js';
import {ModuleMirror} from
  '../../src/wasm-service/module-mirror.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from
  '../../src/logging/logging-service.js';
import {NodeService} from
  '../../src/node/node-service.js';
import {AddressManager} from
  '../../src/address/address-manager.js';
import {DataDirectoryManager} from
  '../../src/storage/data-directory-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {WASM_SERVICE_LIFECYCLE_REFUSAL} from
  '../../src/wasm-service/wasm-service-constants.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

// Each test's data directory owns its replicas' durable database paths.
let scratchDirectory = null;
/** Lifecycles a test built; each is shut down before its scratch is removed. */
const lifecycles = [];

/**
 * Initialize singletons required by WasmServiceReplica.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  DataDirectoryManager.resetInstance();
  scratchDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'wasm-service-lifecycle-'));

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    storage: {dataDir: scratchDirectory},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
  DataDirectoryManager.getInstance().initialize();
}

/**
 * Tear down singletons and the test's replica database directory.
 */
function cleanEnv() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
  DataDirectoryManager.resetInstance();
  fs.rmSync(scratchDirectory, {recursive: true, force: true});
  scratchDirectory = null;
}

/**
 * Build a minimal service definition for tests.
 * @param {Object} [overrides] - Field overrides.
 * @return {Object} Service definition.
 */
function makeServiceDef(overrides = {}) {
  return {
    serviceId: 'svc-1',
    serviceName: 'test-service',
    handlerFunctionId: 'handler-fn-1',
    readConsistency: 'strong',
    writeConsistency: 'strong',
    safetyIntervalMs: 500,
    protocol: 'websocket',
    ...overrides,
  };
}

/**
 * Build a minimal replica config for tests.
 * @param {Object} [overrides] - Field overrides.
 * @return {Object} Replica config.
 */
function makeReplicaConfig(overrides = {}) {
  const replicaId = overrides.replicaId ?? 'svc-1-r1';
  return {
    replicaId,
    replicaIds: [replicaId],
    ...overrides,
  };
}

/**
 * Create a WasmServiceLifecycle with default dependencies.
 * @param {Object} [overrides] - Option overrides.
 * @return {WasmServiceLifecycle}
 */
function makeLifecycle(overrides = {}) {
  const lifecycle = new WasmServiceLifecycle({
    portAllocator: new PortAllocator(),
    moduleMirror: new ModuleMirror(),
    messageRouter: null,
    nodeId: 'test-node',
    ...overrides,
  });
  lifecycles.push(lifecycle);
  return lifecycle;
}

describe('WasmServiceLifecycle', () => {
  beforeEach(() => {
    initEnv();
  });

  afterEach(async () => {
    for (const lifecycle of lifecycles.splice(0)) {
      await lifecycle.shutdownAll();
    }
    cleanEnv();
  });

  describe('exports', () => {
    it('should export WasmServiceLifecycle class', () => {
      assert.equal(
        typeof WasmServiceLifecycle, 'function',
      );
    });

    it('should export REPLICA_LIFECYCLE_STATE enum', () => {
      assert.equal(
        REPLICA_LIFECYCLE_STATE.CREATED, 'created',
      );
      assert.equal(
        REPLICA_LIFECYCLE_STATE.READY, 'ready',
      );
      assert.equal(
        REPLICA_LIFECYCLE_STATE.STOPPED, 'stopped',
      );
    });
  });

  describe('constructor', () => {
    it('should initialize with empty active replicas', () => {
      const lifecycle = makeLifecycle();
      assert.equal(lifecycle.activeReplicas.size, 0);
    });

    it('should store portAllocator reference', () => {
      const pa = new PortAllocator();
      const lifecycle = makeLifecycle({portAllocator: pa});
      assert.strictEqual(lifecycle.portAllocator, pa);
    });

    it('should store moduleMirror reference', () => {
      const mm = new ModuleMirror();
      const lifecycle = makeLifecycle({moduleMirror: mm});
      assert.strictEqual(lifecycle.moduleMirror, mm);
    });

    it('should store nodeId', () => {
      const lifecycle = makeLifecycle({nodeId: 'node-42'});
      assert.equal(lifecycle.nodeId, 'node-42');
    });

    it('binds module mirror to cdc integration service',
      () => {
        let bound = false;
        const moduleMirror = {
          bindCdcIntegrationService: () => {
            bound = true;
          },
        };
        makeLifecycle({
          moduleMirror,
          cdcIntegrationService: {on() {}, off() {}},
        });
        assert.equal(bound, true);
      });
  });

  describe('createReplica', () => {
    it('should store replica in active replicas map', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      const cfg = makeReplicaConfig();
      const replica = lifecycle.createReplica(def, cfg);
      assert.strictEqual(
        lifecycle.activeReplicas.get('svc-1'), replica,
      );
    });

    it('should return the created replica', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      const cfg = makeReplicaConfig();
      const replica = lifecycle.createReplica(def, cfg);
      assert.notEqual(replica, null);
      assert.equal(
        replica.serviceDefinitionId, 'svc-1',
      );
    });

    it('derives the durable path from the data directory owner', () => {
      const lifecycle = makeLifecycle();
      const replica = lifecycle.createReplica(
        makeServiceDef(),
        makeReplicaConfig({dbPath: path.join(os.tmpdir(), 'caller.db')}),
      );
      const ownedPath = DataDirectoryManager.getInstance()
        .getWasmServiceDbPath('svc-1', 'svc-1-r1');
      assert.equal(replica.dbPath, ownedPath);
      assert.equal(ownedPath, path.join(
        scratchDirectory, 'wasm-services', 'svc-1', 'svc-1-r1.db',
      ));
      assert.equal(fs.existsSync(path.dirname(ownedPath)), true);
    });

    it('should pass serviceDefinitionId to replica', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef({serviceId: 'svc-abc'});
      const cfg = makeReplicaConfig();
      const replica = lifecycle.createReplica(def, cfg);
      assert.equal(
        replica.serviceDefinitionId, 'svc-abc',
      );
      assert.strictEqual(
        lifecycle.activeReplicas.get('svc-abc'), replica,
      );
    });

    it('should pass replicaId from config', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      const cfg = makeReplicaConfig({replicaId: 'r-99'});
      const replica = lifecycle.createReplica(def, cfg);
      assert.equal(replica.replicaId, 'r-99');
    });

    it('should pass readConsistency from definition', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef({
        readConsistency: 'eventual',
      });
      const cfg = makeReplicaConfig();
      const replica = lifecycle.createReplica(def, cfg);
      assert.equal(replica.readConsistency, 'eventual');
    });

    it('should create multiple replicas for different ' +
      'services', () => {
      const lifecycle = makeLifecycle();
      const r1 = lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-a'}),
        makeReplicaConfig({replicaId: 'svc-a-r1'}),
      );
      const r2 = lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-b'}),
        makeReplicaConfig({replicaId: 'svc-b-r1'}),
      );
      assert.equal(lifecycle.activeReplicas.size, 2);
      assert.strictEqual(
        lifecycle.activeReplicas.get('svc-a'), r1,
      );
      assert.strictEqual(
        lifecycle.activeReplicas.get('svc-b'), r2,
      );
    });
  });

  describe('founding replica set', () => {
    it('refuses a replica without its explicit replica set', () => {
      const lifecycle = makeLifecycle();
      const dbPath = DataDirectoryManager.getInstance()
        .getWasmServiceDbPath('svc-1', 'svc-1-r1');
      assert.throws(
        () => lifecycle.createReplica(makeServiceDef(),
          {replicaId: 'svc-1-r1'}),
        {code: 'wasm_service_replica_set_required'});
      assert.throws(
        () => lifecycle.createReplica(makeServiceDef(),
          {replicaId: 'svc-1-r1', replicaIds: []}),
        {code: 'wasm_service_replica_set_required'});
      assert.equal(lifecycle.getReplica('svc-1'), null);
      assert.equal(fs.existsSync(path.dirname(dbPath)), false);
    });

    it('refuses a replica outside or a set without distinct ids', () => {
      const lifecycle = makeLifecycle();
      assert.throws(
        () => lifecycle.createReplica(makeServiceDef(),
          {replicaId: 'svc-1-r1', replicaIds: ['svc-1-r2', 'svc-1-r3']}),
        {code: 'wasm_service_replica_not_in_set'});
      assert.throws(
        () => lifecycle.createReplica(makeServiceDef(),
          {replicaId: 'svc-1-r1', replicaIds: ['svc-1-r1', 'svc-1-r1']}),
        {code: 'wasm_service_replica_set_invalid'});
      assert.equal(lifecycle.getReplica('svc-1'), null);
    });
  });

  describe('startReplica', () => {
    it('should allocate port and return result', async () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());
      const result = await lifecycle.startReplica('svc-1');
      assert.equal(result.started, true);
      assert.equal(typeof result.port, 'number');
      assert.ok(result.port >= 30000);
    });

    it('should set portAllocation on the replica', async () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());
      const result = await lifecycle.startReplica('svc-1');
      const replica = lifecycle.getReplica('svc-1');
      assert.equal(replica.portAllocation, result.port);
    });

    it('should return null for unknown serviceId', async () => {
      const lifecycle = makeLifecycle();
      const result = await lifecycle.startReplica('nonexistent');
      assert.equal(result, null);
    });

    it('should check module mirror when handler provided',
      async () => {
        const mm = new ModuleMirror();
        let checkedId = null;
        let checkedVersion = null;
        mm.hasModule = (fid, ver) => {
          checkedId = fid;
          checkedVersion = ver;
          return true;
        };
        const lifecycle = makeLifecycle({moduleMirror: mm});
        const def = makeServiceDef();
        lifecycle.createReplica(def, makeReplicaConfig());
        await lifecycle.startReplica('svc-1', {
          handlerFunctionId: 'fn-42',
          moduleVersion: 'v2',
        });
        assert.equal(checkedId, 'fn-42');
        assert.equal(checkedVersion, 'v2');
      });

    it('fails closed when module is unavailable', async () => {
      const mm = new ModuleMirror();
      mm.hasModule = () => false;

      const lifecycle = makeLifecycle({moduleMirror: mm});
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());

      const result = await lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-missing',
        moduleVersion: 'v1',
      });

      assert.equal(result.started, false);
      assert.equal(result.error, 'WASM module not available on any node');
      assert.equal(result.diagnostic.serviceId, 'svc-1');
      assert.equal(result.diagnostic.handlerFunctionId, 'fn-missing');
      assert.equal(result.diagnostic.code, 'module_unavailable');
    });

    it('fails closed when module mirror is missing', async () => {
      const lifecycle = makeLifecycle({moduleMirror: null});
      lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());

      const result = await lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-1',
        moduleVersion: 'v1',
      });

      assert.equal(result.started, false);
      assert.equal(result.diagnostic.code, 'module_mirror_missing');
    });

    it('records and clears startup diagnostics', async () => {
      const mm = new ModuleMirror();
      mm.hasModule = () => false;
      const lifecycle = makeLifecycle({moduleMirror: mm});
      lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());

      await lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-1',
        moduleVersion: 'v1',
      });
      assert.notEqual(lifecycle.getStartDiagnostic('svc-1'), null);

      mm.hasModule = () => true;
      await lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-1',
        moduleVersion: 'v1',
      });
      assert.equal(lifecycle.getStartDiagnostic('svc-1'), null);
    });

    it('should build endpoint when serviceDefinition ' +
      'provided', async () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());
      const result = await lifecycle.startReplica('svc-1', {
        serviceDefinition: def,
        address: '127.0.0.1',
      });
      assert.notEqual(result.endpoint, null);
      assert.equal(
        result.endpoint.service_id, 'svc-1',
      );
      assert.equal(
        result.endpoint.node_id, 'test-node',
      );
      assert.equal(result.endpoint.port, result.port);
    });

    it('should return null endpoint when no ' +
      'serviceDefinition', async () => {
      const lifecycle = makeLifecycle();
      lifecycle.createReplica(
        makeServiceDef(), makeReplicaConfig(),
      );
      const result = await lifecycle.startReplica('svc-1');
      assert.equal(result.endpoint, null);
    });

    it('should allocate different ports for different ' +
      'services', async () => {
      const lifecycle = makeLifecycle();
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-a'}),
        makeReplicaConfig({replicaId: 'svc-a-r1'}),
      );
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-b'}),
        makeReplicaConfig({replicaId: 'svc-b-r1'}),
      );
      const r1 = await lifecycle.startReplica('svc-a');
      const r2 = await lifecycle.startReplica('svc-b');
      assert.notEqual(r1.port, r2.port);
    });
    it('opens the replica consensus on the raft-rs operation port',
      async () => {
        const lifecycle = makeLifecycle();
        lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());
        const result = await lifecycle.startReplica('svc-1');
        const replica = lifecycle.getReplica('svc-1');
        assert.equal(result.started, true);
        assert.equal(replica.initialized, true);
        assert.notEqual(replica.raft, null);
      });

    it('refuses start typed when the node owns no port allocator',
      async () => {
        const lifecycle = makeLifecycle({portAllocator: null});
        lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());
        const result = await lifecycle.startReplica('svc-1');
        assert.equal(result.started, false);
        assert.equal(result.diagnostic.code, 'port_allocator_unavailable');
        assert.equal(lifecycle.getReplica('svc-1').initialized, false);
      });

    it('releases the port when its consensus refuses to start',
      async () => {
        const pa = new PortAllocator();
        const lifecycle = makeLifecycle({portAllocator: pa});
        lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());
        let port = null;
        const allocate = pa.allocate.bind(pa);
        pa.allocate = (serviceId) => (port = allocate(serviceId));
        lifecycle.getReplica('svc-1').initialize = async () => {
          throw new Error('consensus refused');
        };
        const result = await lifecycle.startReplica('svc-1');
        assert.equal(result.started, false);
        assert.equal(result.error, 'consensus refused');
        assert.equal(result.diagnostic.code, 'consensus_start_refused');
        assert.equal(pa.isAvailable(port), true);
      });
  });

  describe('stopReplica', () => {
    it('should release port and remove from map',
      async () => {
        const lifecycle = makeLifecycle();
        lifecycle.createReplica(
          makeServiceDef(), makeReplicaConfig(),
        );
        await lifecycle.startReplica('svc-1');
        const result = await lifecycle.stopReplica('svc-1');
        assert.equal(result.stopped, true);
        assert.equal(lifecycle.activeReplicas.size, 0);
      });

    it('should return stopped false for unknown serviceId',
      async () => {
        const lifecycle = makeLifecycle();
        const result = await lifecycle.stopReplica('unknown');
        assert.equal(result.stopped, false);
      });

    it('should make port available again after release',
      async () => {
        const pa = new PortAllocator();
        const lifecycle = makeLifecycle({portAllocator: pa});
        lifecycle.createReplica(
          makeServiceDef(), makeReplicaConfig(),
        );
        const startResult = await lifecycle.startReplica('svc-1');
        const allocatedPort = startResult.port;
        assert.equal(pa.isAvailable(allocatedPort), false);
        await lifecycle.stopReplica('svc-1');
        assert.equal(pa.isAvailable(allocatedPort), true);
      });

    it('should call replica shutdown', async () => {
      const lifecycle = makeLifecycle();
      lifecycle.createReplica(
        makeServiceDef(), makeReplicaConfig(),
      );
      const replica = lifecycle.getReplica('svc-1');
      let shutdownCalled = false;
      const origShutdown = replica.shutdown.bind(replica);
      replica.shutdown = async () => {
        shutdownCalled = true;
        await origShutdown();
      };
      await lifecycle.stopReplica('svc-1');
      assert.equal(shutdownCalled, true);
    });

    // The delayed-retirement hazard one level up (owner decision N2): the
    // map entry and the address belong to the replica that holds them, so a
    // late stop of an old replica never removes its successor.
    describe('stop and start overlapping for one serviceId', () => {
      let router = null;
      beforeEach(async () => {
        router = new MessageRouter({
          bootIncarnation: TEST_BOOT_INCARNATION,
          nodeId: 'test-node',
          wsPort: 0,
        });
        await router.initialize({startServer: false});
      });
      afterEach(async () => {
        await router.shutdown?.();
        router = null;
      });

      const startedReplica = async (lifecycle) => {
        lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());
        assert.equal((await lifecycle.startReplica('svc-1')).started, true);
        return lifecycle.getReplica('svc-1');
      };

      it('a stop in flight leaves the successor created and started for ' +
        'the same serviceId owned, registered and stoppable', async () => {
        const lifecycle = makeLifecycle({messageRouter: router});
        const old = await startedReplica(lifecycle);
        const stopping = lifecycle.stopReplica('svc-1');
        const successor = lifecycle.createReplica(makeServiceDef(),
          makeReplicaConfig());
        const started = await lifecycle.startReplica('svc-1');
        assert.equal(started.started, true, 'the successor starts');
        assert.deepEqual(await stopping, {stopped: true});
        assert.notEqual(successor, old);
        assert.equal(lifecycle.getReplica('svc-1'), successor,
          'the old stop leaves the successor in the map');
        assert.equal(router.getRegisteredHandler(successor.unifiedAddress),
          successor.transportHandler);
        assert.equal(typeof successor.transportHandler, 'function');
        assert.equal(successor.initialized, true);
        assert.equal(old.db, null, 'the old replica released its database');
        assert.deepEqual(await lifecycle.stopReplica('svc-1'),
          {stopped: true}, 'the successor is stoppable through its owner');
        assert.equal(lifecycle.getReplica('svc-1'), null);
        assert.equal(router.getRegisteredHandler(successor.unifiedAddress),
          null, 'nothing leaks at the address');
        assert.equal(successor.db, null);
      });

      it('a start of a replica whose stop is in flight is refused typed',
        async () => {
          const lifecycle = makeLifecycle({messageRouter: router});
          const replica = await startedReplica(lifecycle);
          const stopping = lifecycle.stopReplica('svc-1');
          const started = await lifecycle.startReplica('svc-1');
          assert.equal(started.started, false);
          assert.equal(started.diagnostic.code,
            WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_RETIRED);
          assert.deepEqual(await stopping, {stopped: true});
          assert.equal(lifecycle.getReplica('svc-1'), null);
          assert.equal(router.getRegisteredHandler(replica.unifiedAddress),
            null);
          assert.equal(replica.initialized, false);
          assert.equal(replica.db, null);
        });

      it('a stop that begins while a start awaits refuses that start typed',
        async () => {
          const lifecycle = makeLifecycle({messageRouter: router});
          lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());
          const replica = lifecycle.getReplica('svc-1');
          const starting = lifecycle.startReplica('svc-1');
          const stopping = lifecycle.stopReplica('svc-1');
          const started = await starting;
          assert.equal(started.started, false);
          assert.equal(started.diagnostic.code,
            WASM_SERVICE_LIFECYCLE_REFUSAL.STOPPED_DURING_START);
          assert.deepEqual(await stopping, {stopped: true});
          assert.equal(router.getRegisteredHandler(replica.unifiedAddress),
            null);
          assert.equal(replica.db, null);
        });

      // A refused start's after-await effects are keyed by serviceId. Once
      // a stop removed the replica or a successor replaced it, the port and
      // the start diagnostic belong to them (verification
      // cutover-repairs-review-2, RA4).
      const assertSuccessorOwnsServiceId = (lifecycle, allocator, successor,
        successorStart) => {
        assert.equal(successorStart.started, true, 'the successor starts');
        assert.equal(lifecycle.getReplica('svc-1'), successor);
        assert.equal(successor.initialized, true);
        assert.equal(allocator.allocatedPorts.get('svc-1'), successorStart.port,
          'the successor keeps its port');
        assert.equal(allocator.isAvailable(successorStart.port), false,
          'the successor\'s port is not free for another service');
        assert.equal(lifecycle.getStartDiagnostic('svc-1'), null,
          'the live successor carries no refusal of its predecessor');
      };

      it('a start refused on a stopping replica leaves a successor\'s port ' +
        'and diagnostic alone', async () => {
        const allocator = new PortAllocator();
        const lifecycle = makeLifecycle({messageRouter: router,
          portAllocator: allocator});
        lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());
        const stopping = lifecycle.stopReplica('svc-1');
        const retiredStart = lifecycle.startReplica('svc-1');
        const successor = lifecycle.createReplica(makeServiceDef(),
          makeReplicaConfig());
        const successorStart = await lifecycle.startReplica('svc-1');
        const refused = await retiredStart;
        await stopping;
        assert.equal(refused.started, false);
        assert.equal(refused.diagnostic.code,
          WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_RETIRED);
        assertSuccessorOwnsServiceId(lifecycle, allocator, successor,
          successorStart);
      });

      it('a failing start overlapped by a stop leaves a successor\'s port ' +
        'and diagnostic alone', async () => {
        const allocator = new PortAllocator();
        const blocker = path.join(scratchDirectory, 'blocker');
        fs.writeFileSync(blocker, 'not a directory');
        const directories = DataDirectoryManager.getInstance();
        let failOpen = true;
        const lifecycle = makeLifecycle({messageRouter: router,
          portAllocator: allocator,
          dataDirectoryManager: {
            getWasmServiceDbPath: (serviceId, replicaId) => (failOpen ?
              path.join(blocker, `${replicaId}.db`) :
              directories.getWasmServiceDbPath(serviceId, replicaId)),
            ensureWasmServiceDirExists: (serviceId) =>
              directories.ensureWasmServiceDirExists(serviceId),
          }});
        lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());
        failOpen = false;
        const failingStart = lifecycle.startReplica('svc-1');
        const stopping = lifecycle.stopReplica('svc-1');
        const successor = lifecycle.createReplica(makeServiceDef(),
          makeReplicaConfig());
        const successorStart = await lifecycle.startReplica('svc-1');
        const refused = await failingStart;
        await stopping;
        assert.equal(refused.started, false, 'the failing open is refused');
        assertSuccessorOwnsServiceId(lifecycle, allocator, successor,
          successorStart);
      });

      it('a refused start leaves no diagnostic once its stop removed the ' +
        'replica', async () => {
        const allocator = new PortAllocator();
        const lifecycle = makeLifecycle({messageRouter: router,
          portAllocator: allocator});
        const replica = lifecycle.createReplica(makeServiceDef(),
          makeReplicaConfig());
        // Hold the start inside its await until the stop has removed the
        // replica: the refusal then arrives after the entry is gone.
        let admitInitialize = null;
        const gate = new Promise((resolve) => {
          admitInitialize = resolve;
        });
        const initialize = replica.initialize.bind(replica);
        replica.initialize = async () => {
          await gate;
          return initialize();
        };
        const starting = lifecycle.startReplica('svc-1');
        assert.deepEqual(await lifecycle.stopReplica('svc-1'),
          {stopped: true});
        assert.equal(lifecycle.getReplica('svc-1'), null);
        admitInitialize();
        const refused = await starting;
        assert.equal(refused.started, false);
        assert.equal(refused.diagnostic.code,
          WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_RETIRED);
        assert.equal(lifecycle.getStartDiagnostic('svc-1'), null,
          'no diagnostic outlives the entry it described');
        assert.equal(allocator.allocatedPorts.has('svc-1'), false);
      });

      it('a replica is never created over a live one for its serviceId',
        async () => {
          const lifecycle = makeLifecycle({messageRouter: router});
          const live = await startedReplica(lifecycle);
          assert.throws(() => lifecycle.createReplica(makeServiceDef(),
            makeReplicaConfig()),
          {code: WASM_SERVICE_LIFECYCLE_REFUSAL.REPLICA_LIVE});
          assert.equal(lifecycle.getReplica('svc-1'), live);
          assert.equal(router.getRegisteredHandler(live.unifiedAddress),
            live.transportHandler);
        });
    });
  });

  describe('getReplica', () => {
    it('should return active replica by serviceId', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      const created = lifecycle.createReplica(
        def, makeReplicaConfig(),
      );
      const found = lifecycle.getReplica('svc-1');
      assert.strictEqual(found, created);
    });

    it('should return null for unknown serviceId', () => {
      const lifecycle = makeLifecycle();
      const result = lifecycle.getReplica('nonexistent');
      assert.equal(result, null);
    });
  });

  describe('getActiveReplicas', () => {
    it('should return empty map when no replicas', () => {
      const lifecycle = makeLifecycle();
      const replicas = lifecycle.getActiveReplicas();
      assert.equal(replicas.size, 0);
    });

    it('should return all active replicas', () => {
      const lifecycle = makeLifecycle();
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-a'}),
        makeReplicaConfig({replicaId: 'svc-a-r1'}),
      );
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-b'}),
        makeReplicaConfig({replicaId: 'svc-b-r1'}),
      );
      const replicas = lifecycle.getActiveReplicas();
      assert.equal(replicas.size, 2);
      assert.ok(replicas.has('svc-a'));
      assert.ok(replicas.has('svc-b'));
    });
  });

  describe('shutdownAll', () => {
    it('should stop all active replicas', async () => {
      const lifecycle = makeLifecycle();
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-a'}),
        makeReplicaConfig({replicaId: 'svc-a-r1'}),
      );
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-b'}),
        makeReplicaConfig({replicaId: 'svc-b-r1'}),
      );
      await lifecycle.startReplica('svc-a');
      await lifecycle.startReplica('svc-b');
      assert.equal(lifecycle.activeReplicas.size, 2);
      await lifecycle.shutdownAll();
      assert.equal(lifecycle.activeReplicas.size, 0);
    });

    it('should release all ports', async () => {
      const pa = new PortAllocator();
      const lifecycle = makeLifecycle({portAllocator: pa});
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-a'}),
        makeReplicaConfig({replicaId: 'svc-a-r1'}),
      );
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-b'}),
        makeReplicaConfig({replicaId: 'svc-b-r1'}),
      );
      const r1 = await lifecycle.startReplica('svc-a');
      const r2 = await lifecycle.startReplica('svc-b');
      await lifecycle.shutdownAll();
      assert.equal(pa.isAvailable(r1.port), true);
      assert.equal(pa.isAvailable(r2.port), true);
    });

    it('should handle empty replicas map gracefully',
      async () => {
        const lifecycle = makeLifecycle();
        await lifecycle.shutdownAll();
        assert.equal(lifecycle.activeReplicas.size, 0);
      });

    it('unbinds module mirror CDC listeners on shutdown',
      async () => {
        let unbound = false;
        const lifecycle = makeLifecycle({
          moduleMirror: {
            unbindCdcIntegrationService: () => {
              unbound = true;
            },
          },
        });

        await lifecycle.shutdownAll();
        assert.equal(unbound, true);
      });
  });
});
