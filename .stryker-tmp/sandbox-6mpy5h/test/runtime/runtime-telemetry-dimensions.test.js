/**
 * Tests for normalized runtime resource telemetry dimensions
 * across all runtime kinds and CommandMetrics tracking.
 *
 * Validates: Requirements 10.2, 12.2
 */
// @ts-nocheck


import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from '../../src/runtime/runtime-driver.js';
import {RUNTIME_KIND, LIFECYCLE_EVENT} from
  '../../src/constants/runtime.js';
import {CommandMetrics} from
  '../../src/admin/admin-command-metrics.js';
import {TYPEOF} from '../../src/constants/types.js';

// --- Stub drivers ---

class StubNativeDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor() {
    return {valid: true, errors: []};
  }
  async prepare() {
    return {status: 'prepared'};
  }
  async start() {
    return {status: 'started'};
  }
  async stop() {
    return undefined;
  }
  async health() {
    return {status: 'healthy'};
  }
}

class StubWasmDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.WASM_COMPONENT);
  }
  validateDescriptor() {
    return {valid: true, errors: []};
  }
  async prepare() {
    return {status: 'prepared'};
  }
  async start() {
    return {status: 'started'};
  }
  async stop() {
    return undefined;
  }
  async health() {
    return {status: 'healthy'};
  }
}

class StubOciDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.OCI_CONTAINER);
  }
  validateDescriptor() {
    return {valid: true, errors: []};
  }
  async prepare() {
    return {status: 'prepared'};
  }
  async start() {
    return {status: 'started'};
  }
  async stop() {
    return undefined;
  }
  async health() {
    return {status: 'healthy'};
  }
}

/**
 * Build a registry with all three stub drivers registered.
 * @return {RuntimeDriverRegistry}
 */
function buildRegistry() {
  const registry = new RuntimeDriverRegistry();
  registry.register(new StubNativeDriver());
  registry.register(new StubWasmDriver());
  registry.register(new StubOciDriver());
  return registry;
}

/**
 * Build a service definition for a given runtime kind.
 * @param {string} kind - Runtime kind constant.
 * @return {Object}
 */
function makeDef(kind) {
  const serviceId = `svc-${kind}`;
  const definition = {runtime_kind: kind, serviceId};
  if (kind === RUNTIME_KIND.WASM_COMPONENT) {
    definition.runtime_ref = `${serviceId}-module@sha256:test`;
  } else if (kind === RUNTIME_KIND.OCI_CONTAINER) {
    definition.runtime_ref = `registry.example/${serviceId}@sha256:test`;
  }
  return definition;
}

// --- Lifecycle telemetry dimension tests ---

describe('Lifecycle telemetry dimensions', () => {
  let lifecycle;
  let events;

  beforeEach(() => {
    const registry = buildRegistry();
    lifecycle = new ServiceRuntimeLifecycle(registry);
    events = [];
  });

  /**
   * Collect events matching a given event name.
   * @param {string} eventName
   */
  function collect(eventName) {
    lifecycle.on(eventName, (data) => events.push(data));
  }

  it('prepare events include runtimeKind dimension', async () => {
    collect(LIFECYCLE_EVENT.PREPARE_START);
    collect(LIFECYCLE_EVENT.PREPARE_SUCCESS);
    await lifecycle.prepare(makeDef(RUNTIME_KIND.NATIVE_JS), {});
    assert.equal(events.length, 2);
    for (const ev of events) {
      assert.equal(ev.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    }
  });

  it('start events include runtimeKind dimension', async () => {
    collect(LIFECYCLE_EVENT.START_START);
    collect(LIFECYCLE_EVENT.START_SUCCESS);
    await lifecycle.start(makeDef(RUNTIME_KIND.NATIVE_JS));
    assert.equal(events.length, 2);
    for (const ev of events) {
      assert.equal(ev.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    }
  });

  it('stop events include runtimeKind dimension', async () => {
    collect(LIFECYCLE_EVENT.STOP_START);
    collect(LIFECYCLE_EVENT.STOP_SUCCESS);
    await lifecycle.stop(makeDef(RUNTIME_KIND.NATIVE_JS));
    assert.equal(events.length, 2);
    for (const ev of events) {
      assert.equal(ev.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    }
  });

  it('health events include runtimeKind dimension', async () => {
    collect(LIFECYCLE_EVENT.HEALTH_CHECK);
    collect(LIFECYCLE_EVENT.HEALTH_RESULT);
    await lifecycle.health(makeDef(RUNTIME_KIND.NATIVE_JS));
    assert.equal(events.length, 2);
    for (const ev of events) {
      assert.equal(ev.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    }
  });

  it('all lifecycle events include serviceId dimension', async () => {
    const allEvents = [];
    for (const name of Object.values(LIFECYCLE_EVENT)) {
      lifecycle.on(name, (data) => allEvents.push(data));
    }
    const def = makeDef(RUNTIME_KIND.WASM_COMPONENT);
    await lifecycle.prepare(def, {});
    await lifecycle.start(def);
    await lifecycle.stop(def);
    await lifecycle.health(def);
    for (const ev of allEvents) {
      assert.equal(
        ev.serviceId, `svc-${RUNTIME_KIND.WASM_COMPONENT}`,
      );
    }
  });

  it('success events include durationMs as number', async () => {
    const successEvents = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (d) => {
      successEvents.push(d);
    });
    lifecycle.on(LIFECYCLE_EVENT.START_SUCCESS, (d) => {
      successEvents.push(d);
    });
    lifecycle.on(LIFECYCLE_EVENT.STOP_SUCCESS, (d) => {
      successEvents.push(d);
    });
    lifecycle.on(LIFECYCLE_EVENT.HEALTH_RESULT, (d) => {
      successEvents.push(d);
    });
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.prepare(def, {});
    await lifecycle.start(def);
    await lifecycle.stop(def);
    await lifecycle.health(def);
    assert.equal(successEvents.length, 4);
    for (const ev of successEvents) {
      assert.equal(typeof ev.durationMs, TYPEOF.NUMBER);
    }
  });

  it('failure events include error and durationMs', async () => {
    const failRegistry = new RuntimeDriverRegistry();
    class FailDriver extends RuntimeDriver {
      constructor() {
        super(RUNTIME_KIND.NATIVE_JS);
      }
      validateDescriptor() {
        return {valid: true, errors: []};
      }
      async prepare() {
        throw new Error('boom');
      }
      async start() {
        throw new Error('boom');
      }
      async stop() {
        throw new Error('boom');
      }
      async health() {
        throw new Error('boom');
      }
    }
    failRegistry.register(new FailDriver());
    const failLifecycle = new ServiceRuntimeLifecycle(failRegistry);
    const failEvents = [];
    failLifecycle.on(LIFECYCLE_EVENT.PREPARE_FAILURE, (d) => {
      failEvents.push(d);
    });
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await assert.rejects(
      () => failLifecycle.prepare(def, {}),
    );
    assert.equal(failEvents.length, 1);
    const ev = failEvents[0];
    assert.equal(typeof ev.durationMs, TYPEOF.NUMBER);
    assert.ok(ev.error instanceof Error);
  });

  it('dimensions consistent across native_js', async () => {
    collect(LIFECYCLE_EVENT.PREPARE_START);
    collect(LIFECYCLE_EVENT.PREPARE_SUCCESS);
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.prepare(def, {});
    assert.equal(events.length, 2);
    assert.equal(events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(events[0].serviceId, `svc-${RUNTIME_KIND.NATIVE_JS}`);
    assert.equal(events[1].runtimeKind, RUNTIME_KIND.NATIVE_JS);
    assert.equal(typeof events[1].durationMs, TYPEOF.NUMBER);
  });

  it('dimensions consistent across wasm_component', async () => {
    collect(LIFECYCLE_EVENT.PREPARE_START);
    collect(LIFECYCLE_EVENT.PREPARE_SUCCESS);
    const def = makeDef(RUNTIME_KIND.WASM_COMPONENT);
    await lifecycle.prepare(def, {});
    assert.equal(events.length, 2);
    assert.equal(
      events[0].runtimeKind, RUNTIME_KIND.WASM_COMPONENT,
    );
    assert.equal(
      events[0].serviceId, `svc-${RUNTIME_KIND.WASM_COMPONENT}`,
    );
    assert.equal(
      events[1].runtimeKind, RUNTIME_KIND.WASM_COMPONENT,
    );
    assert.equal(typeof events[1].durationMs, TYPEOF.NUMBER);
  });

  it('dimensions consistent across oci_container', async () => {
    collect(LIFECYCLE_EVENT.PREPARE_START);
    collect(LIFECYCLE_EVENT.PREPARE_SUCCESS);
    const def = makeDef(RUNTIME_KIND.OCI_CONTAINER);
    await lifecycle.prepare(def, {});
    assert.equal(events.length, 2);
    assert.equal(
      events[0].runtimeKind, RUNTIME_KIND.OCI_CONTAINER,
    );
    assert.equal(
      events[0].serviceId, `svc-${RUNTIME_KIND.OCI_CONTAINER}`,
    );
    assert.equal(
      events[1].runtimeKind, RUNTIME_KIND.OCI_CONTAINER,
    );
    assert.equal(typeof events[1].durationMs, TYPEOF.NUMBER);
  });
});

// --- CommandMetrics tests ---

describe('CommandMetrics telemetry dimensions', () => {
  let metrics;

  beforeEach(() => {
    metrics = new CommandMetrics();
  });

  it('recordCommand tracks count per action', () => {
    metrics.recordCommand('publish', 10, true);
    metrics.recordCommand('publish', 20, true);
    assert.equal(metrics.getCommandCount('publish'), 2);
  });

  it('recordCommand tracks errors separately', () => {
    metrics.recordCommand('create', 5, true);
    metrics.recordCommand('create', 8, false);
    assert.equal(metrics.getCommandCount('create'), 2);
    assert.equal(metrics.getErrorCount('create'), 1);
  });

  it('recordCommand accumulates latency', () => {
    metrics.recordCommand('scale', 15, true);
    metrics.recordCommand('scale', 25, true);
    const snap = metrics.getSnapshot();
    assert.equal(snap.commands.scale.totalLatencyMs, 40);
  });

  it('getSnapshot returns frozen object with all dimensions', () => {
    metrics.recordCommand('delete', 12, false);
    const snap = metrics.getSnapshot();
    assert.ok(Object.isFrozen(snap));
    assert.ok(Object.isFrozen(snap.commands));
    const entry = snap.commands.delete;
    assert.equal(entry.count, 1);
    assert.equal(entry.errors, 1);
    assert.equal(entry.totalLatencyMs, 12);
  });

  it('recordOperationDuration tracks by operationId', () => {
    metrics.recordOperationDuration('op-1', 500);
    const snap = metrics.getSnapshot();
    assert.equal(snap.operations['op-1'], 500);
  });

  it('reset clears all metrics', () => {
    metrics.recordCommand('publish', 10, true);
    metrics.recordOperationDuration('op-2', 300);
    metrics.reset();
    assert.equal(metrics.getCommandCount('publish'), 0);
    assert.equal(metrics.getTotalCommandCount(), 0);
    const snap = metrics.getSnapshot();
    assert.deepEqual(snap.operations, {});
  });

  it('getTotalCommandCount sums across actions', () => {
    metrics.recordCommand('publish', 10, true);
    metrics.recordCommand('create', 20, true);
    metrics.recordCommand('publish', 5, false);
    assert.equal(metrics.getTotalCommandCount(), 3);
  });

  it('getTotalErrorCount sums across actions', () => {
    metrics.recordCommand('publish', 10, false);
    metrics.recordCommand('create', 20, false);
    metrics.recordCommand('scale', 5, true);
    assert.equal(metrics.getTotalErrorCount(), 2);
  });
});
