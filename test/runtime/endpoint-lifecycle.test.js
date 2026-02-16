/**
 * Tests for endpoint publication and cleanup through
 * ServiceRuntimeLifecycle.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {
  RuntimeDriver,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';
import {
  RUNTIME_KIND,
  LIFECYCLE_EVENT,
} from '../../src/constants/runtime.js';
import {
  WASM_SERVICE_PROTOCOL,
} from '../../src/wasm-service/wasm-service-constants.js';

// --- Test drivers ---

class EndpointDriver extends RuntimeDriver {
  constructor(intent) {
    super(RUNTIME_KIND.NATIVE_JS);
    this._intent = intent || {
      host: '127.0.0.1',
      port: 5432,
      protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    };
  }
  validateDescriptor(_d) {
    return {valid: true};
  }
  async prepare(_d, _c) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_c) {
    return {
      status: START_STATUS.RUNNING,
      endpointIntent: this._intent,
    };
  }
  async stop(_c) {}
  async health(_c) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class FailingStopDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor(_d) {
    return {valid: true};
  }
  async prepare(_d, _c) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_c) {
    return {status: START_STATUS.RUNNING};
  }
  async stop(_c) {
    throw new Error('stop failed');
  }
  async health(_c) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class FailingStartWithEndpointDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor(_d) {
    return {valid: true};
  }
  async prepare(_d, _c) {
    return {status: PREPARE_STATUS.READY};
  }
  async start(_c) {
    throw new Error('start boom');
  }
  async stop(_c) {}
  async health(_c) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

// --- Helpers ---

function makeRegistry(driver) {
  const registry = new RuntimeDriverRegistry();
  registry.register(driver);
  registry.freeze();
  return registry;
}

function makeDef(serviceId = 'sys-postgres-wire') {
  return {
    runtime_kind: RUNTIME_KIND.NATIVE_JS,
    serviceId,
    nodeId: 'node-1',
  };
}

function makeLifecycle(driver) {
  const registry = makeRegistry(driver);
  return new ServiceRuntimeLifecycle(registry);
}

// --- setEndpointRemover ---

describe('setEndpointRemover', () => {
  it('accepts a valid function', () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    lifecycle.setEndpointRemover(async () => {});
    assert.ok(true, 'no error thrown');
  });

  it('rejects non-function argument', () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    assert.throws(
      () => lifecycle.setEndpointRemover('not-a-fn'),
      (err) => err instanceof TypeError &&
        err.message.includes('endpoint remover'),
    );
  });

  it('rejects null', () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    assert.throws(
      () => lifecycle.setEndpointRemover(null),
      (err) => err instanceof TypeError,
    );
  });
});

// --- Endpoint publication on start ---

describe('endpoint publication on start', () => {
  it('calls endpoint writer with postgresql intent', async () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    const writes = [];
    lifecycle.setEndpointWriter(
      async (svcId, kind, intent) => {
        writes.push({svcId, kind, intent});
      },
    );

    await lifecycle.start({definition: makeDef()});

    assert.equal(writes.length, 1);
    assert.equal(writes[0].svcId, 'sys-postgres-wire');
    assert.equal(writes[0].kind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(
      writes[0].intent.protocol,
      WASM_SERVICE_PROTOCOL.POSTGRESQL,
    );
    assert.equal(writes[0].intent.port, 5432);
    assert.equal(writes[0].intent.host, '127.0.0.1');
  });

  it('emits ENDPOINT_REGISTERED on successful write', async () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    lifecycle.setEndpointWriter(async () => {});
    const events = [];
    lifecycle.on(
      LIFECYCLE_EVENT.ENDPOINT_REGISTERED, (e) => events.push(e),
    );

    await lifecycle.start({definition: makeDef()});

    assert.equal(events.length, 1);
    assert.equal(events[0].serviceId, 'sys-postgres-wire');
    assert.equal(
      events[0].endpointIntent.protocol,
      WASM_SERVICE_PROTOCOL.POSTGRESQL,
    );
  });

  it('skips endpoint write when no writer is set', async () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    const events = [];
    lifecycle.on(
      LIFECYCLE_EVENT.ENDPOINT_INTENT_RECEIVED,
      (e) => events.push(e),
    );

    await lifecycle.start({definition: makeDef()});

    // Intent received but no write attempted
    assert.equal(events.length, 1);
  });
});

// --- Endpoint cleanup on stop ---

describe('endpoint cleanup on stop', () => {
  it('calls endpoint remover on successful stop', async () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    const removals = [];
    lifecycle.setEndpointRemover(
      async (svcId, nodeId) => {
        removals.push({svcId, nodeId});
      },
    );

    await lifecycle.stop({definition: makeDef('svc-stop')});

    assert.equal(removals.length, 1);
    assert.equal(removals[0].svcId, 'svc-stop');
    assert.equal(removals[0].nodeId, 'node-1');
  });

  it('emits ENDPOINT_REMOVED on successful cleanup', async () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    lifecycle.setEndpointRemover(async () => {});
    const events = [];
    lifecycle.on(
      LIFECYCLE_EVENT.ENDPOINT_REMOVED, (e) => events.push(e),
    );

    await lifecycle.stop({definition: makeDef('svc-ev')});

    assert.equal(events.length, 1);
    assert.equal(events[0].serviceId, 'svc-ev');
    assert.equal(events[0].nodeId, 'node-1');
  });

  it('skips removal when no remover is set', async () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    // No remover set — should not throw
    await lifecycle.stop({definition: makeDef()});
    assert.ok(true);
  });

  it('emits ENDPOINT_REMOVAL_FAILED on remover error', async () => {
    const lifecycle = makeLifecycle(new EndpointDriver());
    lifecycle.setEndpointRemover(async () => {
      throw new Error('removal failed');
    });
    const events = [];
    lifecycle.on(
      LIFECYCLE_EVENT.ENDPOINT_REMOVAL_FAILED,
      (e) => events.push(e),
    );

    // Removal failure should not block stop
    await lifecycle.stop({definition: makeDef('svc-rf')});

    assert.equal(events.length, 1);
    assert.equal(events[0].serviceId, 'svc-rf');
    assert.ok(events[0].error);
  });
});

// --- Endpoint cleanup on stop failure ---

describe('endpoint cleanup on stop failure', () => {
  it('calls endpoint remover even when stop throws', async () => {
    const lifecycle = makeLifecycle(new FailingStopDriver());
    const removals = [];
    lifecycle.setEndpointRemover(
      async (svcId, nodeId) => {
        removals.push({svcId, nodeId});
      },
    );

    await assert.rejects(
      () => lifecycle.stop({definition: makeDef('svc-sf')}),
    );

    assert.equal(removals.length, 1);
    assert.equal(removals[0].svcId, 'svc-sf');
  });
});

// --- Endpoint cleanup on start failure ---

describe('endpoint cleanup on start failure', () => {
  it('calls endpoint remover when start throws', async () => {
    const lifecycle = makeLifecycle(
      new FailingStartWithEndpointDriver(),
    );
    const removals = [];
    lifecycle.setEndpointRemover(
      async (svcId, nodeId) => {
        removals.push({svcId, nodeId});
      },
    );

    await assert.rejects(
      () => lifecycle.start({definition: makeDef('svc-sf2')}),
    );

    assert.equal(removals.length, 1);
    assert.equal(removals[0].svcId, 'svc-sf2');
  });
});

// --- Lifecycle event constants ---

describe('endpoint lifecycle event constants', () => {
  it('ENDPOINT_REMOVED has expected value', () => {
    assert.equal(
      LIFECYCLE_EVENT.ENDPOINT_REMOVED,
      'lifecycle:endpoint:removed',
    );
  });

  it('ENDPOINT_REMOVAL_FAILED has expected value', () => {
    assert.equal(
      LIFECYCLE_EVENT.ENDPOINT_REMOVAL_FAILED,
      'lifecycle:endpoint:removal_failed',
    );
  });
});
