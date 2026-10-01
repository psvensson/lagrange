import {describe, it, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs, {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createRuntimeStartupWiring,
  createWasmServiceNodeDependencies,
} from '../../src/runtime/runtime-startup-wiring.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';
import {PREPARE_STATUS, START_STATUS} from
  '../../src/runtime/runtime-driver.js';
import {PortAllocator} from '../../src/wasm-service/port-allocator.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {DataDirectoryManager} from
  '../../src/storage/data-directory-manager.js';

const COMPOSED_SERVICE_ID = 'svc-wasm-composed';
const COMPOSED_REPLICA_ID = 'svc-wasm-composed-r1';

/**
 * A placed WASM consensus definition as the reconciler hands it to prepare.
 * @param {Object} [overrides] - Field overrides.
 * @return {Object} The definition.
 */
function placedWasmDefinition(overrides = {}) {
  return {
    serviceId: COMPOSED_SERVICE_ID,
    runtime_ref: 'composed-module-v1',
    replicaId: COMPOSED_REPLICA_ID,
    ...overrides,
  };
}

/**
 * @param {Object} wiring - A runtime startup wiring.
 * @return {Object} Its WASM component driver.
 */
function wasmDriverOf(wiring) {
  return wiring.runtimeDriverRegistry.getDriver(RUNTIME_KIND.WASM_COMPONENT);
}

describe('runtime startup wiring', () => {
  it('registers all runtime drivers in one startup-owned path', () => {
    const wiring = createRuntimeStartupWiring();
    const registry = wiring.runtimeDriverRegistry;

    assert.ok(registry);
    assert.equal(registry.frozen, true);
    assert.ok(registry.hasDriver(RUNTIME_KIND.NATIVE_JS));
    assert.ok(registry.hasDriver(RUNTIME_KIND.WASM_COMPONENT));
    assert.ok(registry.hasDriver(RUNTIME_KIND.OCI_CONTAINER));
  });

  it('creates unified ServiceRuntimeLifecycle from same registry', () => {
    const wiring = createRuntimeStartupWiring();
    const nativeDriver = wiring.runtimeDriverRegistry.getDriver(
      RUNTIME_KIND.NATIVE_JS,
    );
    const resolved = wiring.serviceRuntimeLifecycle
      ._resolveDriver(RUNTIME_KIND.NATIVE_JS);

    assert.equal(resolved, nativeDriver);
  });
});

describe('WASM service consensus composition', () => {
  let scratchDirectory = null;
  const lifecycles = [];

  /**
   * Compose the runtime wiring on a node dependency owner.
   * @param {Object} dependencies - The WASM service dependency owner.
   * @return {Object} The WASM driver and its composed lifecycle.
   */
  function compose(dependencies) {
    const driver = wasmDriverOf(createRuntimeStartupWiring({
      wasmServiceDependencies: dependencies,
    }));
    lifecycles.push(driver._wasmServiceLifecycle);
    return {driver, lifecycle: driver._wasmServiceLifecycle};
  }

  beforeEach(() => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    NodeService.resetInstance();
    AddressManager.resetInstance();
    DataDirectoryManager.resetInstance();
    scratchDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'wasm-service-composition-'));
    ConfigurationManager.getInstance().initialize({
      node: {id: 'composed-node'},
      logging: {level: 'error'},
      storage: {dataDir: scratchDirectory},
    });
    LoggingService.getInstance().initialize({level: 'error'});
    DataDirectoryManager.getInstance().initialize();
  });

  afterEach(async () => {
    for (const lifecycle of lifecycles.splice(0)) {
      await lifecycle.shutdownAll();
    }
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    AddressManager.resetInstance();
    DataDirectoryManager.resetInstance();
    fs.rmSync(scratchDirectory, {recursive: true, force: true});
  });

  it('reads node dependencies when used, never a local substitute', () => {
    const node = {nodeId: null, messageRouter: null};
    const {lifecycle} = compose(createWasmServiceNodeDependencies(node));
    const router = {register() {}};
    node.nodeId = 'composed-node';
    node.messageRouter = router;

    assert.equal(lifecycle.nodeId, 'composed-node');
    assert.equal(lifecycle.messageRouter, router);
    assert.equal(lifecycle.portAllocator, null);
    assert.equal(lifecycle.moduleMirror, null);
  });

  it('refuses a placed replica without its explicit replica set',
    async () => {
      const {driver, lifecycle} = compose(createWasmServiceNodeDependencies(
        {nodeId: 'composed-node', messageRouter: null}));

      const prepared = await driver.prepare(placedWasmDefinition(), {});

      assert.equal(prepared.status, PREPARE_STATUS.FAILED);
      assert.match(prepared.error, /^wasm_service_replica_set_required/);
      assert.equal(lifecycle.getReplica(COMPOSED_SERVICE_ID), null);
      const started = await driver.start({serviceId: COMPOSED_SERVICE_ID});
      assert.equal(started.status, START_STATUS.FAILED);
    });

  it('never reports a replica running without a port allocator owner',
    async () => {
      const {driver, lifecycle} = compose(createWasmServiceNodeDependencies(
        {nodeId: 'composed-node', messageRouter: null}));
      const definition = placedWasmDefinition(
        {replicaIds: [COMPOSED_REPLICA_ID]});

      const prepared = await driver.prepare(definition, {});
      const started = await driver.start({serviceId: COMPOSED_SERVICE_ID});

      assert.equal(prepared.status, PREPARE_STATUS.READY);
      assert.equal(lifecycle.getReplica(COMPOSED_SERVICE_ID).dbPath,
        DataDirectoryManager.getInstance().getWasmServiceDbPath(
          COMPOSED_SERVICE_ID, COMPOSED_REPLICA_ID));
      assert.equal(started.status, START_STATUS.FAILED);
      assert.equal(started.diagnostic.code, 'port_allocator_unavailable');
      assert.equal(
        lifecycle.getReplica(COMPOSED_SERVICE_ID).initialized, false);
    });

  it('starts an explicit replica set on its raft-rs operation port',
    async () => {
      const {driver, lifecycle} = compose({
        nodeId: 'composed-node',
        messageRouter: null,
        portAllocator: new PortAllocator(),
      });
      const definition = placedWasmDefinition(
        {replicaIds: [COMPOSED_REPLICA_ID]});

      await driver.prepare(definition, {});
      const started = await driver.start({serviceId: COMPOSED_SERVICE_ID});
      const replica = lifecycle.getReplica(COMPOSED_SERVICE_ID);

      assert.equal(started.status, START_STATUS.RUNNING);
      assert.equal(typeof started.endpointIntent.port, 'number');
      assert.equal(replica.initialized, true);
      assert.notEqual(replica.raft, null);
      await driver.stop({serviceId: COMPOSED_SERVICE_ID});
      assert.equal(lifecycle.getReplica(COMPOSED_SERVICE_ID), null);
    });
});

describe('seed and joining startup integration', () => {
  const seedRestPort = ENTRYPOINT_DEFAULT.REST_API_PORT;
  const wsOffset = ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;

  it('seed startup service initializes runtime ownership wiring', () => {
    const bootstrapService = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'seed-node',
      nodeAddress: `127.0.0.1:${seedRestPort}`,
      wsPort: seedRestPort + wsOffset,
    });

    assert.ok(bootstrapService.runtimeDriverRegistry);
    assert.ok(bootstrapService.serviceRuntimeLifecycle);
    assert.equal(bootstrapService.runtimeDriverRegistry.frozen, true);
    assert.equal(
      wasmDriverOf(bootstrapService)._wasmServiceLifecycle.nodeId,
      'seed-node');
  });

  it('joining startup service initializes runtime ownership wiring', () => {
    const joiningRestPort = seedRestPort + 1;
    const joiningService = new NodeJoiningService({
      bootIncarnation: 1,
      nodeId: 'join-node',
      nodeAddress: `127.0.0.1:${joiningRestPort}`,
      seedNodeAddress: `http://127.0.0.1:${seedRestPort}`,
      wsPort: joiningRestPort + wsOffset,
    });

    assert.ok(joiningService.runtimeDriverRegistry);
    assert.ok(joiningService.serviceRuntimeLifecycle);
    assert.equal(joiningService.runtimeDriverRegistry.frozen, true);
    assert.equal(
      wasmDriverOf(joiningService)._wasmServiceLifecycle.nodeId,
      'join-node');
  });

  it('seed runtime owner exposes control-plane readiness through rebalance coordinator ownership', () => {
    const bootstrapService = new BootstrapService({
      bootIncarnation: 1,
      nodeId: 'seed-node',
      nodeAddress: `127.0.0.1:${seedRestPort}`,
      wsPort: seedRestPort + wsOffset,
    });
    const controlPlaneReadinessService = {
      owner: 'control-plane-readiness',
    };

    bootstrapService.rebalanceCoordinator = {
      controlPlaneReadinessService,
    };

    assert.equal(
      bootstrapService.runtimeDependencyOwner.controlPlaneReadinessService,
      controlPlaneReadinessService,
    );
  });

  it('entrypoint initializes bootstrap readiness API for seed and joining nodes', () => {
    const source = readFileSync('src/lagrange-runtime-startup.js', 'utf8');
    const bootstrapApiCreates = source.match(/new BootstrapAPI\(/g) || [];
    const bootstrapApiInitializations =
      source.match(/bootstrapAPI\.initialize\(\)/g) || [];
    const bootstrapApiSqlEngineHandoffs =
      source.match(/bootstrapAPI\.setSqlQueryEngine\(sqlQueryEngine\)/g) || [];
    const bootstrapApiShutdowns =
      source.match(/bootstrapAPI\.shutdown\(\)/g) || [];
    const shutdownHandlerUses =
      source.match(/createShutdownSignalHandler\(/g) || [];

    assert.equal(bootstrapApiCreates.length, 2);
    assert.equal(bootstrapApiInitializations.length, 2);
    assert.equal(bootstrapApiSqlEngineHandoffs.length, 2);
    assert.ok(
      bootstrapApiShutdowns.length >= 2 ||
      (
        bootstrapApiShutdowns.length >= 1 &&
        shutdownHandlerUses.length >= 2
      ),
    );
  });
});
