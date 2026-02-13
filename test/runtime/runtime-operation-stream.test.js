/**
 * Tests for OperationStream event contracts and lifecycle journal
 * event integration.
 *
 * Validates: Requirements 11.4, 12.1
 *
 * OperationStream is an EventEmitter-based pub/sub mechanism for
 * operation state changes. Lifecycle journal events verify that
 * ServiceRuntimeLifecycle emits structured operation events with
 * runtime dimensions for observability.
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {
  OperationStream,
  OPERATION_STREAM_EVENT,
  OPERATION_STREAM_ERROR_MSG,
} from '../../src/wasm-service/operation-stream.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {RuntimeDriver} from '../../src/runtime/runtime-driver.js';
import {
  RUNTIME_KIND,
  OPERATION_JOURNAL_EVENT,
} from '../../src/constants/runtime.js';
import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';

// --- Stub driver for lifecycle tests ---

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

/**
 * Create a lifecycle instance with a spy operation writer.
 * @return {{lifecycle, writerCalls: Array}}
 */
function createLifecycle() {
  const registry = new RuntimeDriverRegistry();
  registry.register(new StubDriver());
  const lifecycle = new ServiceRuntimeLifecycle(registry);
  const writerCalls = [];
  lifecycle.setOperationWriter(async (sql, params) => {
    writerCalls.push({sql, params});
  });
  return {lifecycle, writerCalls};
}

const DEFINITION = Object.freeze({
  runtime_kind: RUNTIME_KIND.NATIVE_JS,
  serviceId: 'test-svc',
  tenantId: 'tenant-1',
});

// ============================================================
// OperationStream contract tests
// ============================================================

describe('OperationStream contract', () => {
  let stream;

  beforeEach(() => {
    stream = new OperationStream();
  });

  it('publish emits STATE_CHANGE event with frozen payload',
    () => {
      const received = [];
      stream.on(
        OPERATION_STREAM_EVENT.STATE_CHANGE,
        (p) => received.push(p),
      );

      stream.publish(
        'op-1',
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
        {tenantId: 'tenant-1'},
      );

      assert.equal(received.length, 1);
      const payload = received[0];
      assert.equal(payload.operationId, 'op-1');
      assert.equal(
        payload.fromState, WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        payload.toState, WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.deepStrictEqual(
        payload.metadata, {tenantId: 'tenant-1'},
      );
      assert.equal(typeof payload.timestamp, 'number');
      // Payload must be frozen
      assert.ok(Object.isFrozen(payload));
    });

  it('publish requires operationId', () => {
    assert.throws(
      () => stream.publish(
        null,
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
      ),
      (err) => {
        assert.equal(
          err.message,
          OPERATION_STREAM_ERROR_MSG.OPERATION_ID_REQUIRED,
        );
        return true;
      },
    );
  });

  it('publish requires toState', () => {
    assert.throws(
      () => stream.publish('op-1', WASM_OPERATION_STATE.PENDING, null),
      (err) => {
        assert.equal(
          err.message,
          OPERATION_STREAM_ERROR_MSG.TO_STATE_REQUIRED,
        );
        return true;
      },
    );
  });

  it('publish accepts null fromState for new operations', () => {
    const received = [];
    stream.on(
      OPERATION_STREAM_EVENT.STATE_CHANGE,
      (p) => received.push(p),
    );

    stream.publish(
      'op-new', null, WASM_OPERATION_STATE.PENDING,
    );

    assert.equal(received.length, 1);
    assert.equal(received[0].fromState, null);
    assert.equal(
      received[0].toState, WASM_OPERATION_STATE.PENDING,
    );
  });

  it('subscribe receives all state changes', () => {
    const received = [];
    stream.subscribe((p) => received.push(p));

    stream.publish(
      'op-a', null, WASM_OPERATION_STATE.PENDING,
    );
    stream.publish(
      'op-b',
      WASM_OPERATION_STATE.PENDING,
      WASM_OPERATION_STATE.IN_PROGRESS,
    );

    assert.equal(received.length, 2);
    assert.equal(received[0].operationId, 'op-a');
    assert.equal(received[1].operationId, 'op-b');
  });

  it('subscribe returns unsubscribe function', () => {
    const received = [];
    const unsub = stream.subscribe((p) => received.push(p));

    stream.publish(
      'op-1', null, WASM_OPERATION_STATE.PENDING,
    );
    assert.equal(received.length, 1);

    unsub();

    stream.publish(
      'op-2', null, WASM_OPERATION_STATE.PENDING,
    );
    // Should still be 1 after unsubscribe
    assert.equal(received.length, 1);
  });

  it('subscribeTenant filters by tenant', () => {
    const received = [];
    stream.subscribeTenant(
      'tenant-A', (p) => received.push(p),
    );

    // Event for tenant-A — should be delivered
    stream.publish(
      'op-1', null, WASM_OPERATION_STATE.PENDING,
      {tenantId: 'tenant-A'},
    );
    // Event for tenant-B — should be filtered out
    stream.publish(
      'op-2', null, WASM_OPERATION_STATE.PENDING,
      {tenantId: 'tenant-B'},
    );
    // Event with no metadata — should be filtered out
    stream.publish(
      'op-3', null, WASM_OPERATION_STATE.PENDING,
    );

    assert.equal(received.length, 1);
    assert.equal(received[0].operationId, 'op-1');
  });

  it('subscribeTenant requires tenantId', () => {
    assert.throws(
      () => stream.subscribeTenant(null, () => {}),
      (err) => {
        assert.equal(
          err.message,
          OPERATION_STREAM_ERROR_MSG.TENANT_ID_REQUIRED,
        );
        return true;
      },
    );
  });

  it('subscribe and subscribeTenant reject non-function', () => {
    assert.throws(
      () => stream.subscribe('not-a-function'),
      (err) => {
        assert.equal(
          err.message,
          OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED,
        );
        return true;
      },
    );
    assert.throws(
      () => stream.subscribeTenant('tenant-1', 42),
      (err) => {
        assert.equal(
          err.message,
          OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED,
        );
        return true;
      },
    );
  });

  it('getSubscriberCount tracks active listeners', () => {
    assert.equal(stream.getSubscriberCount(), 0);

    const unsub1 = stream.subscribe(() => {});
    assert.equal(stream.getSubscriberCount(), 1);

    const unsub2 = stream.subscribe(() => {});
    assert.equal(stream.getSubscriberCount(), 2);

    unsub1();
    assert.equal(stream.getSubscriberCount(), 1);

    unsub2();
    assert.equal(stream.getSubscriberCount(), 0);
  });

  it('multiple subscribers receive same event', () => {
    const received1 = [];
    const received2 = [];
    stream.subscribe((p) => received1.push(p));
    stream.subscribe((p) => received2.push(p));

    stream.publish(
      'op-shared', null, WASM_OPERATION_STATE.PENDING,
    );

    assert.equal(received1.length, 1);
    assert.equal(received2.length, 1);
    assert.equal(received1[0].operationId, 'op-shared');
    assert.equal(received2[0].operationId, 'op-shared');
  });
});

// ============================================================
// Lifecycle journal event contract tests
// ============================================================

describe('Lifecycle journal event contracts', () => {
  it('lifecycle emits OPERATION_CREATED on journal create',
    async () => {
      const {lifecycle} = createLifecycle();
      const events = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_CREATED,
        (e) => events.push(e),
      );

      await lifecycle.prepare(DEFINITION, {});

      assert.equal(events.length, 1);
      assert.equal(
        events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS,
      );
      assert.equal(events[0].serviceId, 'test-svc');
      assert.ok(events[0].command);
      assert.ok(events[0].operationId);
      assert.equal(
        events[0].state, WASM_OPERATION_STATE.PENDING,
      );
    });

  it('lifecycle emits OPERATION_TRANSITIONED on state changes',
    async () => {
      const {lifecycle} = createLifecycle();
      const events = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
        (e) => events.push(e),
      );

      await lifecycle.prepare(DEFINITION, {});

      assert.equal(events.length, 2);
      // PENDING -> IN_PROGRESS
      assert.equal(
        events[0].fromState, WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        events[0].toState, WASM_OPERATION_STATE.IN_PROGRESS,
      );
      // IN_PROGRESS -> COMPLETED
      assert.equal(
        events[1].fromState, WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        events[1].toState, WASM_OPERATION_STATE.COMPLETED,
      );
    });

  it('lifecycle emits OPERATION_JOURNAL_FAILED on writer error',
    async () => {
      const registry = new RuntimeDriverRegistry();
      registry.register(new StubDriver());
      const lifecycle = new ServiceRuntimeLifecycle(registry);
      let callCount = 0;
      lifecycle.setOperationWriter(async () => {
        callCount++;
        // Fail on second write (PENDING->IN_PROGRESS transition)
        if (callCount === 2) {
          throw new Error('transition write failed');
        }
      });

      const events = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_JOURNAL_FAILED,
        (e) => events.push(e),
      );

      await assert.rejects(
        () => lifecycle.prepare(DEFINITION, {}),
      );

      assert.equal(events.length, 1);
      assert.equal(
        events[0].runtimeKind, RUNTIME_KIND.NATIVE_JS,
      );
      assert.equal(events[0].serviceId, 'test-svc');
      assert.ok(events[0].error);
      assert.equal(
        events[0].fromState, WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        events[0].toState, WASM_OPERATION_STATE.IN_PROGRESS,
      );
    });

  it('lifecycle journal events include runtime dimensions',
    async () => {
      const {lifecycle} = createLifecycle();
      const created = [];
      const transitioned = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_CREATED,
        (e) => created.push(e),
      );
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
        (e) => transitioned.push(e),
      );

      await lifecycle.prepare(DEFINITION, {});

      // OPERATION_CREATED includes runtime dimensions
      assert.equal(
        created[0].runtimeKind, RUNTIME_KIND.NATIVE_JS,
      );
      assert.equal(created[0].serviceId, 'test-svc');

      // OPERATION_TRANSITIONED includes runtime dimensions
      for (const evt of transitioned) {
        assert.equal(
          evt.runtimeKind, RUNTIME_KIND.NATIVE_JS,
        );
        assert.equal(evt.serviceId, 'test-svc');
      }
    });

  it('lifecycle journal events follow monotonic state order',
    async () => {
      const {lifecycle} = createLifecycle();
      const allEvents = [];
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_CREATED,
        (e) => allEvents.push({
          type: OPERATION_JOURNAL_EVENT.OPERATION_CREATED,
          ...e,
        }),
      );
      lifecycle.on(
        OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
        (e) => allEvents.push({
          type: OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
          ...e,
        }),
      );

      await lifecycle.prepare(DEFINITION, {});

      // Exactly 3 events in monotonic order
      assert.equal(allEvents.length, 3);

      // 1. CREATED with PENDING
      assert.equal(
        allEvents[0].type,
        OPERATION_JOURNAL_EVENT.OPERATION_CREATED,
      );
      assert.equal(
        allEvents[0].state, WASM_OPERATION_STATE.PENDING,
      );

      // 2. TRANSITIONED PENDING -> IN_PROGRESS
      assert.equal(
        allEvents[1].type,
        OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
      );
      assert.equal(
        allEvents[1].fromState, WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        allEvents[1].toState, WASM_OPERATION_STATE.IN_PROGRESS,
      );

      // 3. TRANSITIONED IN_PROGRESS -> COMPLETED
      assert.equal(
        allEvents[2].type,
        OPERATION_JOURNAL_EVENT.OPERATION_TRANSITIONED,
      );
      assert.equal(
        allEvents[2].fromState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(
        allEvents[2].toState, WASM_OPERATION_STATE.COMPLETED,
      );
    });
});
