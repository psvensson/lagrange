/**
 * Tests that logs and traces include runtime kind, service id,
 * and operation id dimensions.
 *
 * Validates: Requirements 12.3, 12.4
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  TRACE_FIELD,
  TRACE_CONTEXT_ERROR_MSG,
  createTraceContext,
  createChildSpan,
  extractTraceHeaders,
} from '../../src/admin/admin-trace-context.js';
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
  OPERATION_JOURNAL_EVENT,
} from '../../src/constants/runtime.js';

// --- Stub driver ---

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

// --- Helpers ---

function makeRegistry() {
  const registry = new RuntimeDriverRegistry();
  registry.register(new StubDriver());
  registry.freeze();
  return registry;
}

function nativeDef(serviceId = 'svc-1') {
  return {runtime_kind: RUNTIME_KIND.NATIVE_JS, serviceId};
}

// --- Trace context tests ---

describe('Trace context dimensions', () => {
  it('createTraceContext produces frozen context with all fields',
    () => {
      const ctx = createTraceContext('my-service', 'prepare');
      assert.ok(Object.isFrozen(ctx));
      assert.equal(typeof ctx[TRACE_FIELD.TRACE_ID], 'string');
      assert.equal(typeof ctx[TRACE_FIELD.SPAN_ID], 'string');
      assert.equal(ctx[TRACE_FIELD.PARENT_SPAN_ID], null);
      assert.equal(
        ctx[TRACE_FIELD.SERVICE_NAME], 'my-service',
      );
      assert.equal(ctx[TRACE_FIELD.OPERATION], 'prepare');
      assert.equal(typeof ctx[TRACE_FIELD.TIMESTAMP], 'number');
    });

  it('createTraceContext requires serviceName', () => {
    assert.throws(
      () => createTraceContext(null, 'op'),
      {message: TRACE_CONTEXT_ERROR_MSG.SERVICE_NAME_REQUIRED},
    );
  });

  it('createTraceContext requires operation', () => {
    assert.throws(
      () => createTraceContext('svc', null),
      {message: TRACE_CONTEXT_ERROR_MSG.OPERATION_REQUIRED},
    );
  });

  it('createTraceContext preserves parent traceId', () => {
    const parentId = 'parent-trace-abc';
    const ctx = createTraceContext('svc', 'op', parentId);
    assert.equal(ctx[TRACE_FIELD.TRACE_ID], parentId);
  });

  it('createChildSpan inherits traceId from parent', () => {
    const parent = createTraceContext('svc-a', 'op-a');
    const child = createChildSpan(parent, 'svc-b', 'op-b');
    assert.equal(
      child[TRACE_FIELD.TRACE_ID],
      parent[TRACE_FIELD.TRACE_ID],
    );
  });

  it('createChildSpan sets parentSpanId to parent spanId', () => {
    const parent = createTraceContext('svc-a', 'op-a');
    const child = createChildSpan(parent, 'svc-b', 'op-b');
    assert.equal(
      child[TRACE_FIELD.PARENT_SPAN_ID],
      parent[TRACE_FIELD.SPAN_ID],
    );
  });

  it('createChildSpan generates new spanId', () => {
    const parent = createTraceContext('svc-a', 'op-a');
    const child = createChildSpan(parent, 'svc-b', 'op-b');
    assert.notEqual(
      child[TRACE_FIELD.SPAN_ID],
      parent[TRACE_FIELD.SPAN_ID],
    );
  });

  it('createChildSpan requires parentContext', () => {
    assert.throws(
      () => createChildSpan(null, 'svc', 'op'),
      {message: TRACE_CONTEXT_ERROR_MSG.PARENT_CONTEXT_REQUIRED},
    );
  });

  it('extractTraceHeaders returns correlation and span headers',
    () => {
      const ctx = createTraceContext('svc', 'op');
      const headers = extractTraceHeaders(ctx);
      assert.equal(
        headers['x-correlation-id'],
        ctx[TRACE_FIELD.TRACE_ID],
      );
      assert.equal(
        headers['x-span-id'],
        ctx[TRACE_FIELD.SPAN_ID],
      );
    });
});

// --- Lifecycle event dimension tests ---

describe('Lifecycle event dimensions', () => {
  it('lifecycle events include runtimeKind dimension', async () => {
    const lifecycle = new ServiceRuntimeLifecycle(makeRegistry());
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_START, (e) => {
      events.push(e);
    });
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (e) => {
      events.push(e);
    });
    await lifecycle.prepare(nativeDef(), {});
    assert.ok(events.length >= 2);
    for (const e of events) {
      assert.equal(e.runtimeKind, RUNTIME_KIND.NATIVE_JS);
    }
  });

  it('lifecycle events include serviceId dimension', async () => {
    const lifecycle = new ServiceRuntimeLifecycle(makeRegistry());
    const events = [];
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_START, (e) => {
      events.push(e);
    });
    lifecycle.on(LIFECYCLE_EVENT.PREPARE_SUCCESS, (e) => {
      events.push(e);
    });
    await lifecycle.prepare(nativeDef('svc-42'), {});
    for (const e of events) {
      assert.equal(e.serviceId, 'svc-42');
    }
  });

  it('operation journal events include operationId', async () => {
    const lifecycle = new ServiceRuntimeLifecycle(makeRegistry());
    lifecycle.setOperationWriter(
      async (_sql, _params) => {},
    );
    const created = [];
    lifecycle.on(
      OPERATION_JOURNAL_EVENT.OPERATION_CREATED, (e) => {
        created.push(e);
      },
    );
    await lifecycle.prepare(nativeDef(), {});
    assert.equal(created.length, 1);
    assert.equal(typeof created[0].operationId, 'string');
    assert.ok(created[0].operationId.length > 0);
  });

  it('operation journal events include runtimeKind and serviceId',
    async () => {
      const lifecycle = new ServiceRuntimeLifecycle(makeRegistry());
      lifecycle.setOperationWriter(
        async (_sql, _params) => {},
      );
      const journal = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_CREATED, (e) => {
          journal.push(e);
        },
      );
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED, (e) => {
          journal.push(e);
        },
      );
      await lifecycle.prepare(nativeDef('svc-rt'), {});
      assert.ok(journal.length >= 1);
      for (const e of journal) {
        assert.equal(e.runtimeKind, RUNTIME_KIND.NATIVE_JS);
        assert.equal(e.serviceId, 'svc-rt');
      }
    });

  it('trace context can carry runtime kind as service name', () => {
    const ctx = createTraceContext(
      RUNTIME_KIND.NATIVE_JS, 'prepare',
    );
    assert.equal(
      ctx[TRACE_FIELD.SERVICE_NAME], RUNTIME_KIND.NATIVE_JS,
    );
    assert.equal(ctx[TRACE_FIELD.OPERATION], 'prepare');
    assert.ok(Object.isFrozen(ctx));
  });

  it('child spans preserve runtime context across hops', () => {
    const parent = createTraceContext(
      'admin-api-adapter', 'publishModule',
    );
    const child = createChildSpan(
      parent, 'sys-wasm-meta', 'publishModule',
    );
    assert.equal(
      child[TRACE_FIELD.TRACE_ID],
      parent[TRACE_FIELD.TRACE_ID],
    );
    assert.equal(
      child[TRACE_FIELD.SERVICE_NAME], 'sys-wasm-meta',
    );
    assert.equal(
      parent[TRACE_FIELD.SERVICE_NAME], 'admin-api-adapter',
    );
  });
});
