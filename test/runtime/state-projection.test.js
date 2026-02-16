/**
 * Tests for runtime replica state projection into the `services`
 * table via ServiceRuntimeLifecycle.
 *
 * Validates: Requirements 5.1, 5.2, 5.4, 13.1
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
  STATE_PROJECTION_EVENT,
  RUNTIME_REPLICA_STATUS,
} from '../../src/constants/runtime.js';
import {
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/unified-service-lifecycle.js';

// --- Test drivers ---

class StubDriver extends RuntimeDriver {
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
  async stop(_c) {}
  async health(_c) {
    return {status: HEALTH_STATUS.HEALTHY};
  }
}

class FailingStartDriver extends RuntimeDriver {
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
  async stop(_c) {
    throw new Error('stop boom');
  }
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

function makeDef(serviceId = 'svc-rt-1') {
  return {
    runtime_kind: RUNTIME_KIND.NATIVE_JS,
    serviceId,
    nodeId: 'node-1',
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
  };
}

function makeLifecycle(driver) {
  const registry = makeRegistry(driver);
  return new ServiceRuntimeLifecycle(registry);
}

// --- setStateProjectionWriter ---

describe('setStateProjectionWriter', () => {
  it('accepts a valid function', () => {
    const lifecycle = makeLifecycle(new StubDriver());
    lifecycle.setStateProjectionWriter(async () => {});
    assert.ok(true, 'no error thrown');
  });

  it('rejects non-function argument', () => {
    const lifecycle = makeLifecycle(new StubDriver());
    assert.throws(
      () => lifecycle.setStateProjectionWriter('not-a-fn'),
      (err) => err instanceof TypeError &&
        err.message.includes('state projection writer'),
    );
  });

  it('rejects null', () => {
    const lifecycle = makeLifecycle(new StubDriver());
    assert.throws(
      () => lifecycle.setStateProjectionWriter(null),
      (err) => err instanceof TypeError,
    );
  });
});

// --- prepare projects created status ---

describe('prepare projects replica state', () => {
  it('projects created status on successful prepare', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    await lifecycle.prepare(makeDef('svc-p1'), {});

    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'svc-p1');
    assert.equal(
      writes[0].row.status, RUNTIME_REPLICA_STATUS.CREATED,
    );
    assert.equal(
      writes[0].row.service_type,
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    );
    assert.equal(writes[0].row.node_id, 'node-1');
    assert.ok(writes[0].row.created_at > 0);
    assert.ok(writes[0].row.updated_at > 0);
  });

  it('projects failed status when prepare throws', async () => {
    const lifecycle = makeLifecycle(new FailingStartDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    // FailingStartDriver.prepare throws 'start boom' — override
    // We need a driver that fails on prepare
    const failPrepareDriver = new StubDriver();
    failPrepareDriver.prepare = async () => {
      throw new Error('prepare fail');
    };
    const reg = new RuntimeDriverRegistry();
    reg.register(failPrepareDriver);
    reg.freeze();
    const lc = new ServiceRuntimeLifecycle(reg);
    const failWrites = [];
    lc.setStateProjectionWriter(async (id, row) => {
      failWrites.push({id, row});
    });

    await assert.rejects(
      () => lc.prepare(makeDef('svc-fail'), {}),
    );

    assert.equal(failWrites.length, 1);
    assert.equal(failWrites[0].id, 'svc-fail');
    assert.equal(
      failWrites[0].row.status, RUNTIME_REPLICA_STATUS.FAILED,
    );
    assert.ok(failWrites[0].row.error_message);
  });

  it('skips projection when no writer is set', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    // No writer set — should not throw
    const result = await lifecycle.prepare(makeDef(), {});
    assert.equal(result.status, PREPARE_STATUS.READY);
  });
});

// --- start projects active status ---

describe('start projects replica state', () => {
  it('projects active status on successful start', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    const def = makeDef('svc-s1');
    await lifecycle.start({definition: def});

    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'svc-s1');
    assert.equal(
      writes[0].row.status, RUNTIME_REPLICA_STATUS.ACTIVE,
    );
    assert.equal(writes[0].row.node_id, 'node-1');
    assert.equal(
      writes[0].row.service_type,
      UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    );
  });

  it('projects failed status when start throws', async () => {
    const lifecycle = makeLifecycle(new FailingStartDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    await assert.rejects(
      () => lifecycle.start({definition: makeDef('svc-sf')}),
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'svc-sf');
    assert.equal(
      writes[0].row.status, RUNTIME_REPLICA_STATUS.FAILED,
    );
    assert.ok(writes[0].row.error_message);
  });
});

// --- stop projects stopped status ---

describe('stop projects replica state', () => {
  it('projects stopped status on successful stop', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    const def = makeDef('svc-st1');
    await lifecycle.stop({definition: def});

    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'svc-st1');
    assert.equal(
      writes[0].row.status, RUNTIME_REPLICA_STATUS.STOPPED,
    );
  });

  it('projects failed status when stop throws', async () => {
    const lifecycle = makeLifecycle(new FailingStartDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    await assert.rejects(
      () => lifecycle.stop({definition: makeDef('svc-stf')}),
    );

    assert.equal(writes.length, 1);
    assert.equal(writes[0].id, 'svc-stf');
    assert.equal(
      writes[0].row.status, RUNTIME_REPLICA_STATUS.FAILED,
    );
  });
});

// --- state projection events ---

describe('state projection events', () => {
  it('emits STATE_PROJECTED on successful projection', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    lifecycle.setStateProjectionWriter(async () => {});
    const events = [];
    lifecycle.on(
      STATE_PROJECTION_EVENT.STATE_PROJECTED, (e) => events.push(e),
    );

    await lifecycle.prepare(makeDef('svc-ev1'), {});

    assert.equal(events.length, 1);
    assert.equal(events[0].serviceId, 'svc-ev1');
    assert.equal(events[0].status, RUNTIME_REPLICA_STATUS.CREATED);
    assert.equal(events[0].nodeId, 'node-1');
  });

  it('emits STATE_PROJECTION_FAILED on writer error', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    lifecycle.setStateProjectionWriter(async () => {
      throw new Error('write fail');
    });
    const events = [];
    lifecycle.on(
      STATE_PROJECTION_EVENT.STATE_PROJECTION_FAILED,
      (e) => events.push(e),
    );

    // Projection failure should not block the lifecycle operation
    const result = await lifecycle.prepare(makeDef('svc-ev2'), {});
    assert.equal(result.status, PREPARE_STATUS.READY);

    assert.equal(events.length, 1);
    assert.equal(events[0].serviceId, 'svc-ev2');
    assert.ok(events[0].error);
  });
});

// --- row characteristics ---

describe('projected row characteristics', () => {
  it('includes partition_id=null and group_id=null', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    await lifecycle.start({definition: makeDef('svc-rc')});

    const row = writes[0].row;
    // partition_id and group_id should not be set (null by default)
    assert.equal(row.partition_id, undefined);
    assert.equal(row.group_id, undefined);
    assert.equal(
      row.service_type, UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    );
  });

  it('resolves node_id from snake_case definition', async () => {
    const lifecycle = makeLifecycle(new StubDriver());
    const writes = [];
    lifecycle.setStateProjectionWriter(async (id, row) => {
      writes.push({id, row});
    });

    const def = {
      runtime_kind: RUNTIME_KIND.NATIVE_JS,
      serviceId: 'svc-snake',
      node_id: 'node-snake',
    };
    await lifecycle.start({definition: def});

    assert.equal(writes[0].row.node_id, 'node-snake');
  });
});

// --- constants ---

describe('state projection constants', () => {
  it('RUNTIME_REPLICA_STATUS has expected values', () => {
    assert.equal(RUNTIME_REPLICA_STATUS.CREATED, 'created');
    assert.equal(RUNTIME_REPLICA_STATUS.ACTIVE, 'active');
    assert.equal(RUNTIME_REPLICA_STATUS.STOPPED, 'stopped');
    assert.equal(RUNTIME_REPLICA_STATUS.FAILED, 'failed');
  });

  it('STATE_PROJECTION_EVENT has expected values', () => {
    assert.equal(
      STATE_PROJECTION_EVENT.STATE_PROJECTED,
      'lifecycle:state:projected',
    );
    assert.equal(
      STATE_PROJECTION_EVENT.STATE_PROJECTION_FAILED,
      'lifecycle:state:projection_failed',
    );
  });
});
