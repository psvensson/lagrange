/**
 * Contract tests proving no runtime driver can directly write
 * system metadata. Drivers return results/intents only; the
 * lifecycle owner coordinates all writes through SQL/CDC.
 *
 * Requirements: 6.2, 6.3
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeDriver, PREPARE_STATUS, START_STATUS, HEALTH_STATUS} from
  '../../src/runtime/runtime-driver.js';
import {NativeJsDriver} from '../../src/runtime/native-js-driver.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';
import {OciContainerDriver} from
  '../../src/runtime/oci-container-driver.js';
import {RUNTIME_FIELD} from
  '../../src/constants/runtime.js';

// --- Forbidden property names that indicate direct writes ---

const WRITE_PROPERTIES = [
  'sql',
  'params',
  'partition',
  'partitionId',
  'cache',
  'systemTableCache',
];

/**
 * Recursively checks that an object contains none of the
 * forbidden write-related properties.
 */
function assertNoWriteProperties(obj, label) {
  if (!obj || typeof obj !== 'object') return;
  for (const prop of WRITE_PROPERTIES) {
    assert.equal(
      prop in obj, false,
      `${label} must not contain '${prop}' property`,
    );
  }
  // Check nested objects one level deep
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const prop of WRITE_PROPERTIES) {
        assert.equal(
          prop in value, false,
          `${label}.${key} must not contain '${prop}' property`,
        );
      }
    }
  }
}

// --- Contract method names that RuntimeDriver exposes ---

const CONTRACT_METHODS = [
  'validateDescriptor',
  'prepare',
  'start',
  'stop',
  'health',
  'requiresRuntimeReconciliation',
  'invoke',
];

// --- Write/persist/save method names that must NOT exist ---

const FORBIDDEN_METHODS = [
  'write',
  'persist',
  'save',
  'insert',
  'update',
  'delete',
  'execute',
  'executeSql',
  'writeMetadata',
  'persistState',
  'saveState',
  'writeToCdc',
  'writeToPartition',
];

describe('RuntimeDriver base class has no write methods', () => {
  it('should only expose contract methods', () => {
    const proto = RuntimeDriver.prototype;
    const methods = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor');
    for (const method of methods) {
      assert.ok(
        CONTRACT_METHODS.includes(method),
        `unexpected method '${method}' on RuntimeDriver`,
      );
    }
  });

  it('should not expose any write/persist/save methods', () => {
    const proto = RuntimeDriver.prototype;
    const methods = Object.getOwnPropertyNames(proto);
    for (const forbidden of FORBIDDEN_METHODS) {
      assert.equal(
        methods.includes(forbidden), false,
        `RuntimeDriver must not have '${forbidden}' method`,
      );
    }
  });

  it('should not have sql, cache, or partition in contract', () => {
    const proto = RuntimeDriver.prototype;
    const allNames = Object.getOwnPropertyNames(proto);
    for (const prop of WRITE_PROPERTIES) {
      assert.equal(
        allNames.includes(prop), false,
        `RuntimeDriver must not have '${prop}' property`,
      );
    }
  });
});

describe('NativeJsDriver returns results only, no writes', () => {
  let driver;
  const serviceId = 'test-native-svc';
  const handlerFn = () => {};
  const definition = {
    serviceId,
    [RUNTIME_FIELD.RUNTIME_REF]: 'test-handler',
  };
  const replicaCtx = {serviceId};

  beforeEach(() => {
    driver = new NativeJsDriver();
  });

  it('prepare returns status only, no SQL or partition', async () => {
    const result = await driver.prepare(definition, {
      handlerMap: {'test-handler': handlerFn},
    });
    assert.equal(result.status, PREPARE_STATUS.READY);
    assertNoWriteProperties(result, 'NativeJsDriver.prepare');
  });

  it('start returns status and optional endpointIntent only',
    async () => {
      await driver.prepare(definition, {
        handlerMap: {'test-handler': handlerFn},
      });
      const result = await driver.start(replicaCtx);
      assert.equal(result.status, START_STATUS.RUNNING);
      assertNoWriteProperties(result, 'NativeJsDriver.start');
    },
  );

  it('start with endpoint config returns intent, no writes',
    async () => {
      await driver.prepare(definition, {
        handlerMap: {'test-handler': handlerFn},
      });
      const result = await driver.start({
        serviceId,
        endpointHost: 'localhost',
        endpointPort: 8080,
      });
      assert.equal(result.status, START_STATUS.RUNNING);
      assert.ok(result.endpointIntent);
      assertNoWriteProperties(result, 'NativeJsDriver.start+endpoint');
    },
  );

  it('stop returns void, no writes', async () => {
    await driver.prepare(definition, {
      handlerMap: {'test-handler': handlerFn},
    });
    await driver.start(replicaCtx);
    const result = await driver.stop(replicaCtx);
    assert.equal(result, undefined);
  });

  it('health returns status only, no writes', async () => {
    await driver.prepare(definition, {
      handlerMap: {'test-handler': handlerFn},
    });
    await driver.start(replicaCtx);
    const result = await driver.health(replicaCtx);
    assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    assertNoWriteProperties(result, 'NativeJsDriver.health');
  });

  it('should not have any write methods', () => {
    for (const forbidden of FORBIDDEN_METHODS) {
      assert.equal(
        typeof driver[forbidden], 'undefined',
        `NativeJsDriver must not have '${forbidden}' method`,
      );
    }
  });
});

describe('WasmComponentDriver returns results only, no writes', () => {
  let driver;
  const serviceId = 'test-wasm-svc';
  const definition = {
    serviceId,
    [RUNTIME_FIELD.RUNTIME_REF]: 'my-wasm-module',
  };
  const replicaCtx = {serviceId};

  beforeEach(() => {
    driver = new WasmComponentDriver();
  });

  it('prepare returns status only, no SQL or partition', async () => {
    const result = await driver.prepare(definition, {});
    assert.equal(result.status, PREPARE_STATUS.READY);
    assertNoWriteProperties(result, 'WasmComponentDriver.prepare');
  });

  it('start returns status only, no writes', async () => {
    await driver.prepare(definition, {});
    const result = await driver.start(replicaCtx);
    assert.equal(result.status, START_STATUS.RUNNING);
    assertNoWriteProperties(result, 'WasmComponentDriver.start');
  });

  it('stop returns void, no writes', async () => {
    await driver.prepare(definition, {});
    await driver.start(replicaCtx);
    const result = await driver.stop(replicaCtx);
    assert.equal(result, undefined);
  });

  it('health returns status only, no writes', async () => {
    await driver.prepare(definition, {});
    await driver.start(replicaCtx);
    const result = await driver.health(replicaCtx);
    assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    assertNoWriteProperties(result, 'WasmComponentDriver.health');
  });

  it('should not have any write methods', () => {
    for (const forbidden of FORBIDDEN_METHODS) {
      assert.equal(
        typeof driver[forbidden], 'undefined',
        `WasmComponentDriver must not have '${forbidden}' method`,
      );
    }
  });
});

describe('OciContainerDriver returns results only, no writes', () => {
  let driver;
  const serviceId = 'test-oci-svc';
  const definition = {
    serviceId,
    [RUNTIME_FIELD.RUNTIME_REF]:
      'registry.example.com/img@sha256:abc123',
  };
  const replicaCtx = {serviceId};

  beforeEach(() => {
    driver = new OciContainerDriver();
    driver.setFeatureGate(true);
  });

  it('prepare returns status only, no SQL or partition', async () => {
    const result = await driver.prepare(definition, {});
    assert.equal(result.status, PREPARE_STATUS.READY);
    assertNoWriteProperties(result, 'OciContainerDriver.prepare');
  });

  it('start returns status only, no writes', async () => {
    await driver.prepare(definition, {});
    const result = await driver.start(replicaCtx);
    assert.equal(result.status, START_STATUS.RUNNING);
    assertNoWriteProperties(result, 'OciContainerDriver.start');
  });

  it('stop returns void, no writes', async () => {
    await driver.prepare(definition, {});
    await driver.start(replicaCtx);
    const result = await driver.stop(replicaCtx);
    assert.equal(result, undefined);
  });

  it('health returns status only, no writes', async () => {
    await driver.prepare(definition, {});
    await driver.start(replicaCtx);
    const result = await driver.health(replicaCtx);
    assert.equal(result.status, HEALTH_STATUS.HEALTHY);
    assertNoWriteProperties(result, 'OciContainerDriver.health');
  });

  it('should not have any write methods', () => {
    for (const forbidden of FORBIDDEN_METHODS) {
      assert.equal(
        typeof driver[forbidden], 'undefined',
        `OciContainerDriver must not have '${forbidden}' method`,
      );
    }
  });
});

describe('Driver results never contain SQL or partition refs', () => {
  it('NativeJsDriver full lifecycle results are clean', async () => {
    const driver = new NativeJsDriver();
    const serviceId = 'clean-native';
    const def = {
      serviceId,
      [RUNTIME_FIELD.RUNTIME_REF]: 'handler-ref',
    };
    const handler = () => {};
    const ctx = {handlerMap: {'handler-ref': handler}};

    const prepResult = await driver.prepare(def, ctx);
    assertNoWriteProperties(prepResult, 'prepare');

    const startResult = await driver.start({serviceId});
    assertNoWriteProperties(startResult, 'start');

    const healthResult = await driver.health({serviceId});
    assertNoWriteProperties(healthResult, 'health');

    await driver.stop({serviceId});
  });

  it('WasmComponentDriver full lifecycle results are clean',
    async () => {
      const driver = new WasmComponentDriver();
      const serviceId = 'clean-wasm';
      const def = {
        serviceId,
        [RUNTIME_FIELD.RUNTIME_REF]: 'wasm-mod',
      };

      const prepResult = await driver.prepare(def, {});
      assertNoWriteProperties(prepResult, 'prepare');

      const startResult = await driver.start({serviceId});
      assertNoWriteProperties(startResult, 'start');

      const healthResult = await driver.health({serviceId});
      assertNoWriteProperties(healthResult, 'health');

      await driver.stop({serviceId});
    },
  );

  it('OciContainerDriver full lifecycle results are clean',
    async () => {
      const driver = new OciContainerDriver();
      driver.setFeatureGate(true);
      const serviceId = 'clean-oci';
      const def = {
        serviceId,
        [RUNTIME_FIELD.RUNTIME_REF]:
          'reg.io/img@sha256:def456',
      };

      const prepResult = await driver.prepare(def, {});
      assertNoWriteProperties(prepResult, 'prepare');

      const startResult = await driver.start({serviceId});
      assertNoWriteProperties(startResult, 'start');

      const healthResult = await driver.health({serviceId});
      assertNoWriteProperties(healthResult, 'health');

      await driver.stop({serviceId});
    },
  );
});
