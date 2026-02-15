/**
 * Tests for CommandMetrics integration with lifecycle events
 * across runtime kinds — verifying action, latency, success,
 * and error dimensions.
 *
 * Validates: Requirements 12.1, 12.2
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  CommandMetrics, METRIC_TYPE,
} from '../../src/admin/admin-command-metrics.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from '../../src/runtime/runtime-driver.js';
import {RUNTIME_KIND, LIFECYCLE_EVENT} from
  '../../src/constants/runtime.js';
import {TYPEOF} from '../../src/constants/types.js';

// --- Stub drivers ---

class StubDriver extends RuntimeDriver {
  constructor(kind) {
    super(kind);
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

/**
 * Build a registry with stub drivers for all three kinds.
 * @return {RuntimeDriverRegistry}
 */
function buildRegistry() {
  const registry = new RuntimeDriverRegistry();
  registry.register(new StubDriver(RUNTIME_KIND.NATIVE_JS));
  registry.register(new StubDriver(RUNTIME_KIND.WASM_COMPONENT));
  registry.register(new StubDriver(RUNTIME_KIND.OCI_CONTAINER));
  return registry;
}

/**
 * Build a registry with a failing native_js driver.
 * @return {RuntimeDriverRegistry}
 */
function buildFailRegistry() {
  const registry = new RuntimeDriverRegistry();
  registry.register(new FailDriver());
  return registry;
}

/**
 * Build a service definition for a given runtime kind.
 * @param {string} kind
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

/**
 * Wire lifecycle success/failure events to CommandMetrics.
 * Uses runtimeKind + operation as the action dimension.
 * @param {ServiceRuntimeLifecycle} lifecycle
 * @param {CommandMetrics} metrics
 */
function wireMetrics(lifecycle, metrics) {
  lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (data) => {
    const action = `${data.runtimeKind}:prepare`;
    metrics.recordCommand(action, data.durationMs, true);
  });
  lifecycle.on(LIFECYCLE_EVENT.PREPARE_FAILURE, (data) => {
    const action = `${data.runtimeKind}:prepare`;
    metrics.recordCommand(action, data.durationMs, false);
  });
  lifecycle.on(LIFECYCLE_EVENT.START_SUCCESS, (data) => {
    const action = `${data.runtimeKind}:start`;
    metrics.recordCommand(action, data.durationMs, true);
  });
  lifecycle.on(LIFECYCLE_EVENT.START_FAILURE, (data) => {
    const action = `${data.runtimeKind}:start`;
    metrics.recordCommand(action, data.durationMs, false);
  });
  lifecycle.on(LIFECYCLE_EVENT.STOP_SUCCESS, (data) => {
    const action = `${data.runtimeKind}:stop`;
    metrics.recordCommand(action, data.durationMs, true);
  });
  lifecycle.on(LIFECYCLE_EVENT.STOP_FAILURE, (data) => {
    const action = `${data.runtimeKind}:stop`;
    metrics.recordCommand(action, data.durationMs, false);
  });
}

// --- CommandMetrics integration with lifecycle events ---

describe('CommandMetrics integration with lifecycle events', () => {
  let lifecycle;
  let metrics;

  beforeEach(() => {
    const registry = buildRegistry();
    lifecycle = new ServiceRuntimeLifecycle(registry);
    metrics = new CommandMetrics();
    wireMetrics(lifecycle, metrics);
  });

  it('record successful prepare as command metric', async () => {
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.prepare(def, {});
    const action = `${RUNTIME_KIND.NATIVE_JS}:prepare`;
    assert.equal(metrics.getCommandCount(action), 1);
    assert.equal(metrics.getErrorCount(action), 0);
    const snap = metrics.getSnapshot();
    assert.ok(snap.commands[action].totalLatencyMs >= 0);
  });

  it('record failed prepare as error metric', async () => {
    const failLifecycle = new ServiceRuntimeLifecycle(
      buildFailRegistry(),
    );
    const failMetrics = new CommandMetrics();
    wireMetrics(failLifecycle, failMetrics);
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await assert.rejects(() => failLifecycle.prepare(def, {}));
    const action = `${RUNTIME_KIND.NATIVE_JS}:prepare`;
    assert.equal(failMetrics.getCommandCount(action), 1);
    assert.equal(failMetrics.getErrorCount(action), 1);
  });

  it('record successful start as command metric', async () => {
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.start(def);
    const action = `${RUNTIME_KIND.NATIVE_JS}:start`;
    assert.equal(metrics.getCommandCount(action), 1);
    assert.equal(metrics.getErrorCount(action), 0);
  });

  it('record successful stop as command metric', async () => {
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.stop(def);
    const action = `${RUNTIME_KIND.NATIVE_JS}:stop`;
    assert.equal(metrics.getCommandCount(action), 1);
    assert.equal(metrics.getErrorCount(action), 0);
  });

  it('metrics track across multiple runtime kinds', async () => {
    const nativeDef = makeDef(RUNTIME_KIND.NATIVE_JS);
    const wasmDef = makeDef(RUNTIME_KIND.WASM_COMPONENT);
    await lifecycle.prepare(nativeDef, {});
    await lifecycle.prepare(wasmDef, {});
    const nativeAction = `${RUNTIME_KIND.NATIVE_JS}:prepare`;
    const wasmAction = `${RUNTIME_KIND.WASM_COMPONENT}:prepare`;
    assert.equal(metrics.getCommandCount(nativeAction), 1);
    assert.equal(metrics.getCommandCount(wasmAction), 1);
    assert.equal(metrics.getTotalCommandCount(), 2);
  });

  it('snapshot includes all recorded dimensions', async () => {
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.prepare(def, {});
    await lifecycle.start(def);
    const snap = metrics.getSnapshot();
    const prepAction = `${RUNTIME_KIND.NATIVE_JS}:prepare`;
    const startAction = `${RUNTIME_KIND.NATIVE_JS}:start`;
    assert.equal(snap.commands[prepAction].count, 1);
    assert.equal(snap.commands[prepAction].errors, 0);
    assert.equal(
      typeof snap.commands[prepAction].totalLatencyMs,
      TYPEOF.NUMBER,
    );
    assert.equal(snap.commands[startAction].count, 1);
    assert.equal(snap.commands[startAction].errors, 0);
    assert.equal(
      typeof snap.commands[startAction].totalLatencyMs,
      TYPEOF.NUMBER,
    );
  });

  it('operation duration tracked separately', () => {
    metrics.recordOperationDuration('op-abc', 250);
    metrics.recordOperationDuration('op-def', 400);
    const snap = metrics.getSnapshot();
    assert.equal(snap.operations['op-abc'], 250);
    assert.equal(snap.operations['op-def'], 400);
  });
});

// --- Lifecycle event -> metrics wiring pattern ---

describe('Lifecycle event -> metrics wiring pattern', () => {
  let lifecycle;

  beforeEach(() => {
    lifecycle = new ServiceRuntimeLifecycle(buildRegistry());
  });

  it('lifecycle success events provide durationMs', async () => {
    const captured = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (d) => {
      captured.push(d);
    });
    await lifecycle.prepare(makeDef(RUNTIME_KIND.NATIVE_JS), {});
    assert.equal(captured.length, 1);
    assert.equal(typeof captured[0].durationMs, TYPEOF.NUMBER);
    assert.ok(captured[0].durationMs >= 0);
  });

  it('lifecycle failure events provide durationMs', async () => {
    const failLifecycle = new ServiceRuntimeLifecycle(
      buildFailRegistry(),
    );
    const captured = [];
    failLifecycle.on(LIFECYCLE_EVENT.PREPARE_FAILURE, (d) => {
      captured.push(d);
    });
    await assert.rejects(
      () => failLifecycle.prepare(
        makeDef(RUNTIME_KIND.NATIVE_JS), {},
      ),
    );
    assert.equal(captured.length, 1);
    assert.equal(typeof captured[0].durationMs, TYPEOF.NUMBER);
    assert.ok(captured[0].durationMs >= 0);
  });

  it('lifecycle events provide runtimeKind for action', async () => {
    const captured = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (d) => {
      captured.push(d);
    });
    await lifecycle.prepare(
      makeDef(RUNTIME_KIND.WASM_COMPONENT), {},
    );
    assert.equal(captured.length, 1);
    assert.equal(
      captured[0].runtimeKind, RUNTIME_KIND.WASM_COMPONENT,
    );
  });

  it('metrics accumulate across repeated operations', async () => {
    const metrics = new CommandMetrics();
    wireMetrics(lifecycle, metrics);
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.prepare(def, {});
    await lifecycle.prepare(def, {});
    await lifecycle.prepare(def, {});
    const action = `${RUNTIME_KIND.NATIVE_JS}:prepare`;
    assert.equal(metrics.getCommandCount(action), 3);
    const snap = metrics.getSnapshot();
    assert.ok(snap.commands[action].totalLatencyMs >= 0);
  });

  it('reset clears all accumulated metrics', async () => {
    const metrics = new CommandMetrics();
    wireMetrics(lifecycle, metrics);
    const def = makeDef(RUNTIME_KIND.NATIVE_JS);
    await lifecycle.prepare(def, {});
    await lifecycle.start(def);
    metrics.recordOperationDuration('op-x', 100);
    metrics.reset();
    const action = `${RUNTIME_KIND.NATIVE_JS}:prepare`;
    assert.equal(metrics.getCommandCount(action), 0);
    assert.equal(metrics.getTotalCommandCount(), 0);
    assert.equal(metrics.getTotalErrorCount(), 0);
    const snap = metrics.getSnapshot();
    assert.deepEqual(snap.commands, {});
    assert.deepEqual(snap.operations, {});
  });

  it('METRIC_TYPE constants are available', () => {
    assert.equal(METRIC_TYPE.COMMAND_COUNT, 'commandCount');
    assert.equal(
      METRIC_TYPE.COMMAND_LATENCY_MS, 'commandLatencyMs',
    );
    assert.equal(METRIC_TYPE.COMMAND_ERROR, 'commandError');
    assert.equal(
      METRIC_TYPE.OPERATION_DURATION_MS, 'operationDurationMs',
    );
    assert.ok(Object.isFrozen(METRIC_TYPE));
  });
});
