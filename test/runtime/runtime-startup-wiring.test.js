import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {ENTRYPOINT_DEFAULT} from '../../src/constants/entrypoint.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {NodeJoiningService} from '../../src/bootstrap/node-joining-service.js';

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

describe('seed and joining startup integration', () => {
  const seedRestPort = ENTRYPOINT_DEFAULT.REST_API_PORT;
  const wsOffset = ENTRYPOINT_DEFAULT.WS_PORT_OFFSET;

  it('seed startup service initializes runtime ownership wiring', () => {
    const bootstrapService = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: `127.0.0.1:${seedRestPort}`,
      wsPort: seedRestPort + wsOffset,
    });

    assert.ok(bootstrapService.runtimeDriverRegistry);
    assert.ok(bootstrapService.serviceRuntimeLifecycle);
    assert.equal(bootstrapService.runtimeDriverRegistry.frozen, true);
  });

  it('joining startup service initializes runtime ownership wiring', () => {
    const joiningRestPort = seedRestPort + 1;
    const joiningService = new NodeJoiningService({
      nodeId: 'join-node',
      nodeAddress: `127.0.0.1:${joiningRestPort}`,
      seedNodeAddress: `http://127.0.0.1:${seedRestPort}`,
      wsPort: joiningRestPort + wsOffset,
    });

    assert.ok(joiningService.runtimeDriverRegistry);
    assert.ok(joiningService.serviceRuntimeLifecycle);
    assert.equal(joiningService.runtimeDriverRegistry.frozen, true);
  });

  it('seed runtime owner exposes control-plane readiness through rebalance coordinator ownership', () => {
    const bootstrapService = new BootstrapService({
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
    const source = readFileSync('src/index.js', 'utf8');
    const bootstrapApiCreates = source.match(/new BootstrapAPI\(/g) || [];
    const bootstrapApiInitializations =
      source.match(/await bootstrapAPI\.initialize\(\)/g) || [];
    const bootstrapApiSqlEngineHandoffs =
      source.match(/bootstrapAPI\.setSqlQueryEngine\(sqlQueryEngine\)/g) || [];
    const bootstrapApiShutdowns =
      source.match(/await bootstrapAPI\.shutdown\(\)/g) || [];
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
