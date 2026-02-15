import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
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

/**
 * Initialize singletons required by WasmServiceReplica.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Tear down singletons.
 */
function cleanEnv() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
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
  return {
    replicaId: 'svc-1-r1',
    replicaIds: ['svc-1-r1'],
    dbPath: ':memory:',
    transport: null,
    ...overrides,
  };
}

/**
 * Create a WasmServiceLifecycle with default dependencies.
 * @param {Object} [overrides] - Option overrides.
 * @return {WasmServiceLifecycle}
 */
function makeLifecycle(overrides = {}) {
  return new WasmServiceLifecycle({
    portAllocator: new PortAllocator(),
    moduleMirror: new ModuleMirror(),
    messageRouter: null,
    nodeId: 'test-node',
    ...overrides,
  });
}

describe('WasmServiceLifecycle', () => {
  beforeEach(() => {
    initEnv();
  });

  afterEach(() => {
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
      replica.kvStore.close();
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
      replica.kvStore.close();
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
      replica.kvStore.close();
    });

    it('should pass replicaId from config', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      const cfg = makeReplicaConfig({replicaId: 'r-99'});
      const replica = lifecycle.createReplica(def, cfg);
      assert.equal(replica.replicaId, 'r-99');
      replica.kvStore.close();
    });

    it('should pass readConsistency from definition', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef({
        readConsistency: 'eventual',
      });
      const cfg = makeReplicaConfig();
      const replica = lifecycle.createReplica(def, cfg);
      assert.equal(replica.readConsistency, 'eventual');
      replica.kvStore.close();
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
      r1.kvStore.close();
      r2.kvStore.close();
    });
  });

  describe('startReplica', () => {
    it('should allocate port and return result', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());
      const result = lifecycle.startReplica('svc-1');
      assert.equal(result.started, true);
      assert.equal(typeof result.port, 'number');
      assert.ok(result.port >= 30000);
      lifecycle.activeReplicas.get('svc-1').kvStore.close();
    });

    it('should set portAllocation on the replica', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());
      const result = lifecycle.startReplica('svc-1');
      const replica = lifecycle.getReplica('svc-1');
      assert.equal(replica.portAllocation, result.port);
      replica.kvStore.close();
    });

    it('should return null for unknown serviceId', () => {
      const lifecycle = makeLifecycle();
      const result = lifecycle.startReplica('nonexistent');
      assert.equal(result, null);
    });

    it('should check module mirror when handler provided',
      () => {
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
        lifecycle.startReplica('svc-1', {
          handlerFunctionId: 'fn-42',
          moduleVersion: 'v2',
        });
        assert.equal(checkedId, 'fn-42');
        assert.equal(checkedVersion, 'v2');
        lifecycle.getReplica('svc-1').kvStore.close();
      });

    it('fails closed when module is unavailable', () => {
      const mm = new ModuleMirror();
      mm.hasModule = () => false;

      const lifecycle = makeLifecycle({moduleMirror: mm});
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());

      const result = lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-missing',
        moduleVersion: 'v1',
      });

      assert.equal(result.started, false);
      assert.equal(result.error, 'WASM module not available on any node');
      assert.equal(result.diagnostic.serviceId, 'svc-1');
      assert.equal(result.diagnostic.handlerFunctionId, 'fn-missing');
      assert.equal(result.diagnostic.code, 'module_unavailable');
      lifecycle.getReplica('svc-1').kvStore.close();
    });

    it('fails closed when module mirror is missing', () => {
      const lifecycle = makeLifecycle({moduleMirror: null});
      lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());

      const result = lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-1',
        moduleVersion: 'v1',
      });

      assert.equal(result.started, false);
      assert.equal(result.diagnostic.code, 'module_mirror_missing');
      lifecycle.getReplica('svc-1').kvStore.close();
    });

    it('records and clears startup diagnostics', () => {
      const mm = new ModuleMirror();
      mm.hasModule = () => false;
      const lifecycle = makeLifecycle({moduleMirror: mm});
      lifecycle.createReplica(makeServiceDef(), makeReplicaConfig());

      lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-1',
        moduleVersion: 'v1',
      });
      assert.notEqual(lifecycle.getStartDiagnostic('svc-1'), null);

      mm.hasModule = () => true;
      lifecycle.startReplica('svc-1', {
        handlerFunctionId: 'fn-1',
        moduleVersion: 'v1',
      });
      assert.equal(lifecycle.getStartDiagnostic('svc-1'), null);
      lifecycle.getReplica('svc-1').kvStore.close();
    });

    it('should build endpoint when serviceDefinition ' +
      'provided', () => {
      const lifecycle = makeLifecycle();
      const def = makeServiceDef();
      lifecycle.createReplica(def, makeReplicaConfig());
      const result = lifecycle.startReplica('svc-1', {
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
      lifecycle.getReplica('svc-1').kvStore.close();
    });

    it('should return null endpoint when no ' +
      'serviceDefinition', () => {
      const lifecycle = makeLifecycle();
      lifecycle.createReplica(
        makeServiceDef(), makeReplicaConfig(),
      );
      const result = lifecycle.startReplica('svc-1');
      assert.equal(result.endpoint, null);
      lifecycle.getReplica('svc-1').kvStore.close();
    });

    it('should allocate different ports for different ' +
      'services', () => {
      const lifecycle = makeLifecycle();
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-a'}),
        makeReplicaConfig({replicaId: 'svc-a-r1'}),
      );
      lifecycle.createReplica(
        makeServiceDef({serviceId: 'svc-b'}),
        makeReplicaConfig({replicaId: 'svc-b-r1'}),
      );
      const r1 = lifecycle.startReplica('svc-a');
      const r2 = lifecycle.startReplica('svc-b');
      assert.notEqual(r1.port, r2.port);
      lifecycle.getReplica('svc-a').kvStore.close();
      lifecycle.getReplica('svc-b').kvStore.close();
    });
  });

  describe('stopReplica', () => {
    it('should release port and remove from map',
      async () => {
        const lifecycle = makeLifecycle();
        lifecycle.createReplica(
          makeServiceDef(), makeReplicaConfig(),
        );
        lifecycle.startReplica('svc-1');
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
        const startResult = lifecycle.startReplica('svc-1');
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
      created.kvStore.close();
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
      replicas.get('svc-a').kvStore.close();
      replicas.get('svc-b').kvStore.close();
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
      lifecycle.startReplica('svc-a');
      lifecycle.startReplica('svc-b');
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
      const r1 = lifecycle.startReplica('svc-a');
      const r2 = lifecycle.startReplica('svc-b');
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
