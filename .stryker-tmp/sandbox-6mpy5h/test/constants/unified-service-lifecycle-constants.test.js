// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_UNIFIED_SERVICE_TYPES,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_LIFECYCLE_TRANSITIONS,
  SERVICE_MESSAGE_FIELD,
  SERVICE_MESSAGE_REQUIRED_FIELDS,
  SERVICE_OPERATION_STATE,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/unified-service-lifecycle.js';

describe('unified-service-lifecycle constants', () => {
  it('defines canonical unified service types', () => {
    assert.equal(UNIFIED_SERVICE_TYPE.PARTITION, 'partition');
    assert.equal(UNIFIED_SERVICE_TYPE.MESSAGE_GROUP, 'message_group');
    assert.equal(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE, 'runtime_service');
    assert.equal(ALLOWED_UNIFIED_SERVICE_TYPES.has('partition'), true);
    assert.equal(ALLOWED_UNIFIED_SERVICE_TYPES.has('runtime_service'), true);
    assert.equal(ALLOWED_UNIFIED_SERVICE_TYPES.has('unknown_kind'), false);
  });

  it('defines lifecycle states and transitions', () => {
    assert.equal(SERVICE_LIFECYCLE_STATE.CREATED, 'created');
    assert.equal(SERVICE_LIFECYCLE_STATE.RUNNING, 'running');
    assert.equal(SERVICE_LIFECYCLE_STATE.FAILED, 'failed');

    assert.deepEqual(
      SERVICE_LIFECYCLE_TRANSITIONS[SERVICE_LIFECYCLE_STATE.CREATED],
      ['starting', 'failed'],
    );
    assert.deepEqual(
      SERVICE_LIFECYCLE_TRANSITIONS[SERVICE_LIFECYCLE_STATE.STOPPED],
      ['starting'],
    );
  });

  it('maps canonical operation states', () => {
    assert.equal(SERVICE_OPERATION_STATE.PENDING, 'pending');
    assert.equal(SERVICE_OPERATION_STATE.IN_PROGRESS, 'in_progress');
    assert.equal(SERVICE_OPERATION_STATE.COMPLETED, 'completed');
    assert.equal(SERVICE_OPERATION_STATE.FAILED, 'failed');
    assert.equal(SERVICE_OPERATION_STATE.CANCELLED, 'cancelled');
  });

  it('defines canonical service message envelope fields', () => {
    assert.equal(SERVICE_MESSAGE_FIELD.MESSAGE_ID, 'messageId');
    assert.equal(SERVICE_MESSAGE_FIELD.SERVICE_ID, 'serviceId');
    assert.equal(SERVICE_MESSAGE_FIELD.OPERATION, 'operation');
    assert.equal(SERVICE_MESSAGE_FIELD.PAYLOAD, 'payload');

    assert.deepEqual(SERVICE_MESSAGE_REQUIRED_FIELDS, [
      'messageId',
      'serviceId',
      'operation',
      'payload',
    ]);
  });

  it('exposes frozen constants', () => {
    assert.equal(Object.isFrozen(UNIFIED_SERVICE_TYPE), true);
    assert.equal(Object.isFrozen(SERVICE_LIFECYCLE_STATE), true);
    assert.equal(Object.isFrozen(SERVICE_LIFECYCLE_TRANSITIONS), true);
    assert.equal(Object.isFrozen(SERVICE_OPERATION_STATE), true);
    assert.equal(Object.isFrozen(SERVICE_MESSAGE_FIELD), true);
    assert.equal(Object.isFrozen(SERVICE_MESSAGE_REQUIRED_FIELDS), true);
  });
});
