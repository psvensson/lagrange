import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATION_STREAM_EVENT,
  OPERATION_STREAM_ERROR_MSG,
  OperationStream,
} from '../../src/wasm-service/operation-stream.js';
import {WASM_OPERATION_STATE} from '../../src/constants/wasm-meta.js';

describe('OperationStream', () => {
  // --- publish ---

  describe('publish', () => {
    it('should emit event with correct payload', () => {
      const stream = new OperationStream();
      const received = [];
      stream.on(
        OPERATION_STREAM_EVENT.STATE_CHANGE,
        (p) => received.push(p),
      );

      stream.publish(
        'op-1',
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
        {tenantId: 't-1'},
      );

      assert.equal(received.length, 1);
      assert.equal(received[0].operationId, 'op-1');
      assert.equal(
        received[0].fromState,
        WASM_OPERATION_STATE.PENDING,
      );
      assert.equal(
        received[0].toState,
        WASM_OPERATION_STATE.IN_PROGRESS,
      );
      assert.equal(received[0].metadata.tenantId, 't-1');
      assert.equal(typeof received[0].timestamp, 'number');
    });

    it('should default fromState to null', () => {
      const stream = new OperationStream();
      const received = [];
      stream.on(
        OPERATION_STREAM_EVENT.STATE_CHANGE,
        (p) => received.push(p),
      );

      stream.publish(
        'op-2', null, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(received[0].fromState, null);
      assert.equal(received[0].metadata, null);
    });

    it('should throw when operationId is missing', () => {
      const stream = new OperationStream();
      assert.throws(
        () => stream.publish(
          null, null, WASM_OPERATION_STATE.PENDING,
        ),
        {message: OPERATION_STREAM_ERROR_MSG.OPERATION_ID_REQUIRED},
      );
    });

    it('should throw when toState is missing', () => {
      const stream = new OperationStream();
      assert.throws(
        () => stream.publish('op-1', null, null),
        {message: OPERATION_STREAM_ERROR_MSG.TO_STATE_REQUIRED},
      );
    });

    it('should freeze the emitted payload', () => {
      const stream = new OperationStream();
      let payload;
      stream.on(
        OPERATION_STREAM_EVENT.STATE_CHANGE,
        (p) => {
          payload = p;
        },
      );

      stream.publish(
        'op-3', null, WASM_OPERATION_STATE.PENDING,
      );

      assert.ok(Object.isFrozen(payload));
    });
  });

  // --- subscribe / unsubscribe ---

  describe('subscribe', () => {
    it('should receive events after subscribing', () => {
      const stream = new OperationStream();
      const received = [];
      stream.subscribe((p) => received.push(p));

      stream.publish(
        'op-1', null, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(received.length, 1);
    });

    it('should return an unsubscribe function', () => {
      const stream = new OperationStream();
      const received = [];
      const unsub = stream.subscribe(
        (p) => received.push(p),
      );

      stream.publish(
        'op-1', null, WASM_OPERATION_STATE.PENDING,
      );
      unsub();
      stream.publish(
        'op-2', null, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(received.length, 1);
      assert.equal(received[0].operationId, 'op-1');
    });

    it('should throw when listener is not a function', () => {
      const stream = new OperationStream();
      assert.throws(
        () => stream.subscribe('not-a-function'),
        {message: OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED},
      );
    });
  });

  // --- subscribeTenant ---

  describe('subscribeTenant', () => {
    it('should only receive events for matching tenant', () => {
      const stream = new OperationStream();
      const received = [];
      stream.subscribeTenant(
        't-1', (p) => received.push(p),
      );

      stream.publish(
        'op-1',
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
        {tenantId: 't-1'},
      );
      stream.publish(
        'op-2',
        WASM_OPERATION_STATE.PENDING,
        WASM_OPERATION_STATE.IN_PROGRESS,
        {tenantId: 't-2'},
      );

      assert.equal(received.length, 1);
      assert.equal(received[0].operationId, 'op-1');
    });

    it('should not receive events without metadata', () => {
      const stream = new OperationStream();
      const received = [];
      stream.subscribeTenant(
        't-1', (p) => received.push(p),
      );

      stream.publish(
        'op-1', null, WASM_OPERATION_STATE.PENDING,
      );

      assert.equal(received.length, 0);
    });

    it('should return an unsubscribe function', () => {
      const stream = new OperationStream();
      const received = [];
      const unsub = stream.subscribeTenant(
        't-1', (p) => received.push(p),
      );

      stream.publish(
        'op-1', null, WASM_OPERATION_STATE.IN_PROGRESS,
        {tenantId: 't-1'},
      );
      unsub();
      stream.publish(
        'op-2', null, WASM_OPERATION_STATE.IN_PROGRESS,
        {tenantId: 't-1'},
      );

      assert.equal(received.length, 1);
    });

    it('should throw when tenantId is missing', () => {
      const stream = new OperationStream();
      assert.throws(
        () => stream.subscribeTenant(null, () => {}),
        {message: OPERATION_STREAM_ERROR_MSG.TENANT_ID_REQUIRED},
      );
    });

    it('should throw when listener is not a function', () => {
      const stream = new OperationStream();
      assert.throws(
        () => stream.subscribeTenant('t-1', 42),
        {message: OPERATION_STREAM_ERROR_MSG.LISTENER_REQUIRED},
      );
    });
  });

  // --- getSubscriberCount ---

  describe('getSubscriberCount', () => {
    it('should return 0 with no subscribers', () => {
      const stream = new OperationStream();
      assert.equal(stream.getSubscriberCount(), 0);
    });

    it('should count global subscribers', () => {
      const stream = new OperationStream();
      stream.subscribe(() => {});
      stream.subscribe(() => {});
      assert.equal(stream.getSubscriberCount(), 2);
    });

    it('should count tenant subscribers', () => {
      const stream = new OperationStream();
      stream.subscribeTenant('t-1', () => {});
      assert.equal(stream.getSubscriberCount(), 1);
    });

    it('should count both global and tenant subscribers', () => {
      const stream = new OperationStream();
      stream.subscribe(() => {});
      stream.subscribeTenant('t-1', () => {});
      assert.equal(stream.getSubscriberCount(), 2);
    });

    it('should decrement after unsubscribe', () => {
      const stream = new OperationStream();
      const unsub1 = stream.subscribe(() => {});
      const unsub2 = stream.subscribeTenant('t-1', () => {});
      assert.equal(stream.getSubscriberCount(), 2);

      unsub1();
      assert.equal(stream.getSubscriberCount(), 1);

      unsub2();
      assert.equal(stream.getSubscriberCount(), 0);
    });
  });
});
