/**
 * Tests for monotonic operation state transitions.
 *
 * Validates: Requirements 11.3, 14.4
 *
 * Verifies that operation lifecycle transitions follow the valid
 * state machine graph and that terminal states are truly terminal.
 * Also verifies that ServiceRuntimeLifecycle produces monotonic
 * transition sequences for prepare/start/stop operations.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  createOperation,
  transitionOperation,
  OPERATION_LIFECYCLE_ERROR_MSG,
} from '../../src/wasm-service/operation-lifecycle.js';
import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from '../../src/runtime/runtime-driver.js';
import {
  RUNTIME_KIND,
  OPERATION_JOURNAL_EVENT,
} from '../../src/constants/runtime.js';

// --- Test drivers ---

class StubDriver extends RuntimeDriver {
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

class FailingDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);
  }
  validateDescriptor() {
    return {valid: true, errors: []};
  }
  async prepare() {
    throw new Error('prepare exploded');
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

// --- Helpers ---

function makeRegistry(...drivers) {
  const registry = new RuntimeDriverRegistry();
  for (const d of drivers) {
    registry.register(d);
  }
  registry.freeze();
  return registry;
}

function nativeDef(serviceId = 'svc-mono') {
  return {runtime_kind: RUNTIME_KIND.NATIVE_JS, serviceId};
}

function replicaCtx(definition) {
  return {definition};
}

/**
 * Create a lifecycle with a spy operation writer and event
 * collectors for OPERATION_CREATED and OPERATION_TRANSITIONED.
 */
function lifecycleWithEvents(...drivers) {
  const registry = makeRegistry(...drivers);
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  const writes = [];
  const created = [];
  const transitioned = [];
  lifecycle.setOperationWriter(async (sql, params) => {
    writes.push({sql, params});
  });
  lifecycle.on(
    OPERATION_JOURNAL_EVENT.OPERATION_CREATED,
    (e) => created.push(e),
  );
  lifecycle.on(
    OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
    (e) => transitioned.push(e),
  );
  return {lifecycle, writes, created, transitioned};
}

// --- Direct transitionOperation tests ---

describe('transitionOperation valid transitions', () => {
  it('PENDING -> IN_PROGRESS is valid', () => {
    const result = transitionOperation(
      'op-1',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.ok(result.params);
  });

  it('PENDING -> CANCELLED is valid', () => {
    const result = transitionOperation(
      'op-2',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.CANCELLED,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql);
  });

  it('IN_PROGRESS -> COMPLETED is valid with result', () => {
    const payload = {output: 'done'};
    const result = transitionOperation(
      'op-3',
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.COMPLETED,
      payload,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.ok(
      result.params.some((p) =>
        typeof p === 'string' && p.includes('done')),
    );
  });

  it('IN_PROGRESS -> FAILED is valid with error payload', () => {
    const payload = {message: 'boom'};
    const result = transitionOperation(
      'op-4',
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.FAILED,
      payload,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql);
    assert.ok(
      result.params.some((p) =>
        typeof p === 'string' && p.includes('boom')),
    );
  });

  it('IN_PROGRESS -> CANCELLED is valid', () => {
    const result = transitionOperation(
      'op-5',
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.CANCELLED,
    );
    assert.equal(result.success, true);
    assert.ok(result.sql);
  });
});

describe('transitionOperation invalid transitions', () => {
  it('PENDING -> COMPLETED is invalid (skips IN_PROGRESS)', () => {
    const result = transitionOperation(
      'op-6',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.COMPLETED,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.INVALID_TRANSITION,
    ));
  });

  it('PENDING -> FAILED is invalid', () => {
    const result = transitionOperation(
      'op-7',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.FAILED,
    );
    assert.equal(result.success, false);
  });

  it('COMPLETED -> any is invalid (terminal state)', () => {
    const states = [
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.FAILED,
      WASM_OPERATION_STATE.CANCELLED,
    ];
    for (const target of states) {
      const result = transitionOperation(
        'op-8', WASM_OPERATION_STATE.COMPLETED, target,
      );
      assert.equal(result.success, false);
    }
  });

  it('FAILED -> any is invalid (terminal state)', () => {
    const states = [
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.COMPLETED,
      WASM_OPERATION_STATE.CANCELLED,
    ];
    for (const target of states) {
      const result = transitionOperation(
        'op-9', WASM_OPERATION_STATE.FAILED, target,
      );
      assert.equal(result.success, false);
    }
  });

  it('CANCELLED -> any is invalid (terminal state)', () => {
    const states = [
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.COMPLETED,
      WASM_OPERATION_STATE.FAILED,
    ];
    for (const target of states) {
      const result = transitionOperation(
        'op-10', WASM_OPERATION_STATE.CANCELLED, target,
      );
      assert.equal(result.success, false);
    }
  });

  it('IN_PROGRESS -> PENDING is invalid (backward)', () => {
    const result = transitionOperation(
      'op-11',
      WASM_OPERATION_STATE.IN_PROGRESS,
      WASM_OPERATION_STATE.PENDING,
    );
    assert.equal(result.success, false);
  });

  it('COMPLETED -> PENDING is invalid (backward from terminal)',
    () => {
      const result = transitionOperation(
        'op-12',
        WASM_OPERATION_STATE.COMPLETED,
        WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(result.success, false);
    });

  it('requires operationId', () => {
    const result = transitionOperation(
      null,
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
    );
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.OPERATION_ID_REQUIRED,
    ));
  });
});

// --- createOperation tests ---

describe('createOperation monotonic start state', () => {
  it('produces PENDING state', () => {
    const result = createOperation('tenant-1', 'prepare');
    assert.equal(result.success, true);
    assert.equal(
      result.operation.state, WASM_OPERATION_STATE.PENDING,
    );
  });

  it('requires tenantId', () => {
    const result = createOperation(null, 'prepare');
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.TENANT_ID_REQUIRED,
    ));
  });

  it('requires command', () => {
    const result = createOperation('tenant-1', null);
    assert.equal(result.success, false);
    assert.ok(result.errors.includes(
      OPERATION_LIFECYCLE_ERROR_MSG.COMMAND_REQUIRED,
    ));
  });

  it('generates unique operationId per call', () => {
    const a = createOperation('tenant-1', 'prepare');
    const b = createOperation('tenant-1', 'prepare');
    assert.equal(a.success, true);
    assert.equal(b.success, true);
    assert.notEqual(
      a.operation.operationId, b.operation.operationId,
    );
  });

  it('includes idempotencyKey when provided', () => {
    const result = createOperation(
      'tenant-1', 'prepare', 'idem-key-1',
    );
    assert.equal(result.success, true);
    assert.equal(result.operation.idempotencyKey, 'idem-key-1');
    assert.ok(result.params.includes('idem-key-1'));
  });
});

// --- Lifecycle integration monotonic tests ---

describe('Lifecycle monotonic transition sequences', () => {
  it('successful prepare: PENDING -> IN_PROGRESS -> COMPLETED',
    async () => {
      const {lifecycle, transitioned, created} =
        lifecycleWithEvents(new StubDriver());

      await lifecycle.prepare(nativeDef('prep-svc'), {});

      assert.equal(created.length, 1);
      assert.equal(
        created[0].state, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(transitioned.length, 2);
      assert.equal(
        transitioned[0].fromState,
        WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        transitioned[0].toState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].fromState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].toState,
        WASM_OPERATION_STATE.COMPLETED,
      );
    });

  it('failed prepare: PENDING -> IN_PROGRESS -> FAILED',
    async () => {
      const {lifecycle, transitioned, created} =
        lifecycleWithEvents(new FailingDriver());

      await assert.rejects(
        () => lifecycle.prepare(nativeDef('fail-prep'), {}),
      );

      assert.equal(created.length, 1);
      assert.equal(
        created[0].state, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(transitioned.length, 2);
      assert.equal(
        transitioned[0].fromState,
        WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        transitioned[0].toState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].fromState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].toState,
        WASM_OPERATION_STATE.FAILED,
      );
    });

  it('successful start: PENDING -> IN_PROGRESS -> COMPLETED',
    async () => {
      const {lifecycle, transitioned, created} =
        lifecycleWithEvents(new StubDriver());

      await lifecycle.start(
        replicaCtx(nativeDef('start-svc')),
      );

      assert.equal(created.length, 1);
      assert.equal(
        created[0].state, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(transitioned.length, 2);
      assert.equal(
        transitioned[0].fromState,
        WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        transitioned[0].toState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].fromState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].toState,
        WASM_OPERATION_STATE.COMPLETED,
      );
    });

  it('successful stop: PENDING -> IN_PROGRESS -> COMPLETED',
    async () => {
      const {lifecycle, transitioned, created} =
        lifecycleWithEvents(new StubDriver());

      await lifecycle.stop(
        replicaCtx(nativeDef('stop-svc')),
      );

      assert.equal(created.length, 1);
      assert.equal(
        created[0].state, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(transitioned.length, 2);
      assert.equal(
        transitioned[0].fromState,
        WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        transitioned[0].toState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].fromState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        transitioned[1].toState,
        WASM_OPERATION_STATE.COMPLETED,
      );
    });
});
