import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeStartupWiring} from
  '../../src/runtime/runtime-startup-wiring.js';
import {RUNTIME_KIND} from '../../src/constants/runtime.js';
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
  it('seed startup service initializes runtime ownership wiring', () => {
    const bootstrapService = new BootstrapService({
      nodeId: 'seed-node',
      nodeAddress: '127.0.0.1:8080',
      wsPort: 9080,
    });

    assert.ok(bootstrapService.runtimeDriverRegistry);
    assert.ok(bootstrapService.serviceRuntimeLifecycle);
    assert.equal(bootstrapService.runtimeDriverRegistry.frozen, true);
  });

  it('joining startup service initializes runtime ownership wiring', () => {
    const joiningService = new NodeJoiningService({
      nodeId: 'join-node',
      nodeAddress: '127.0.0.1:8081',
      seedNodeAddress: 'http://127.0.0.1:8080',
      wsPort: 9081,
    });

    assert.ok(joiningService.runtimeDriverRegistry);
    assert.ok(joiningService.serviceRuntimeLifecycle);
    assert.equal(joiningService.runtimeDriverRegistry.frozen, true);
  });
});
