import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_SERVICE_OPERATION,
  adaptAdminMessageToServiceMessage,
  isAdminMessageDispatchable,
} from '../../src/admin/admin-service-message-adapter.js';
import {ADMIN_MESSAGE_TYPE} from '../../src/admin/admin-constants.js';
import {META_SERVICE_ID, UNIFIED_SERVICE_TYPE} from '../../src/constants/index.js';

describe('admin-service-message-adapter', () => {
  it('maps query messages into canonical service-message envelopes', () => {
    const envelope = adaptAdminMessageToServiceMessage(
      {
        type: ADMIN_MESSAGE_TYPE.QUERY,
        queryId: 'q-1',
        sql: 'SELECT 1',
        params: [1],
      },
      {
        clientId: 'client-1',
      },
    );

    assert.equal(envelope.messageId, 'q-1');
    assert.equal(envelope.serviceId, META_SERVICE_ID.ADMIN_META);
    assert.equal(envelope.serviceType, UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
    assert.equal(envelope.operation, ADMIN_SERVICE_OPERATION.EXECUTE_QUERY);
    assert.equal(envelope.payload.sql, 'SELECT 1');
    assert.deepEqual(envelope.payload.params, [1]);
    assert.equal(envelope.metadata.clientId, 'client-1');
    assert.equal(typeof envelope.traceId, 'string');
    assert.ok(envelope.traceId.length > 0);
  });

  it('maps optional per-query timeout override for dispatchable queries', () => {
    const envelope = adaptAdminMessageToServiceMessage({
      type: ADMIN_MESSAGE_TYPE.QUERY,
      queryId: 'q-timeout',
      sql: 'SELECT 1',
      params: [],
      timeoutMs: 1234,
    });

    assert.equal(envelope.payload.timeoutMs, 1234);
  });

  it('preserves explicit traceId from context', () => {
    const envelope = adaptAdminMessageToServiceMessage(
      {
        type: ADMIN_MESSAGE_TYPE.REFRESH,
      },
      {
        traceId: 'trace-context-1',
      },
    );

    assert.equal(envelope.traceId, 'trace-context-1');
  });

  it('maps partition callback messages into canonical operation payloads', () => {
    const envelope = adaptAdminMessageToServiceMessage({
      type: ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK,
      queryId: 'cb-1',
      statement: 'SELECT callback()',
      parameters: ['x'],
      callbackModuleRef: 'mod@sha256:abc',
      callbackExport: 'run',
      runtimeKind: 'wasm_component',
    });

    assert.equal(
      envelope.operation,
      ADMIN_SERVICE_OPERATION.EXECUTE_PARTITION_CALLBACK,
    );
    assert.equal(envelope.payload.callbackModuleRef, 'mod@sha256:abc');
    assert.equal(envelope.payload.callbackExport, 'run');
  });

  it('flags dispatchable admin websocket message types', () => {
    assert.equal(isAdminMessageDispatchable(ADMIN_MESSAGE_TYPE.QUERY), true);
    assert.equal(
      isAdminMessageDispatchable(ADMIN_MESSAGE_TYPE.PARTITION_CALLBACK),
      true,
    );
    assert.equal(isAdminMessageDispatchable(ADMIN_MESSAGE_TYPE.REFRESH), true);
    assert.equal(isAdminMessageDispatchable(ADMIN_MESSAGE_TYPE.ERROR), false);
  });

  it('rejects unsupported message types', () => {
    assert.throws(
      () => {
        adaptAdminMessageToServiceMessage({
          type: ADMIN_MESSAGE_TYPE.ERROR,
        });
      },
      /unsupported/,
    );
  });
});
