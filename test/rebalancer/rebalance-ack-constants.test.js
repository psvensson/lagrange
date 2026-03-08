/**
 * Tests for rebalance participant acknowledgement constants.
 *
 * Validates structural integrity of typed acknowledgement payloads
 * for rebalance executors and their composition with the shared
 * PARTICIPANT_ACK_FIELD from workflow-constants.js.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  REBALANCE_ACK_STATUS,
  REBALANCE_ACK_TERMINAL_STATUSES,
  REBALANCE_ACK_FAILURE_STATUSES,
  REBALANCE_ACK_CHECKPOINT_FIELD,
  REBALANCE_ACK_LOG_MSG,
} from '../../src/rebalancer/rebalance-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';

test('REBALANCE_ACK_STATUS values are unique', async (t) => {
  const values = Object.values(REBALANCE_ACK_STATUS);
  const unique = new Set(values);
  t.equal(values.length, unique.size, 'no duplicate status values');
});

test('REBALANCE_ACK_STATUS is frozen', async (t) => {
  t.ok(Object.isFrozen(REBALANCE_ACK_STATUS), 'status enum is frozen');
});

test('terminal statuses contain only valid rebalance ack statuses', async (t) => {
  const allStatuses = new Set(Object.values(REBALANCE_ACK_STATUS));
  for (const status of REBALANCE_ACK_TERMINAL_STATUSES) {
    t.ok(allStatuses.has(status),
      `terminal status '${status}' exists in REBALANCE_ACK_STATUS`);
  }
});

test('failure statuses are a subset of terminal statuses', async (t) => {
  for (const status of REBALANCE_ACK_FAILURE_STATUSES) {
    t.ok(REBALANCE_ACK_TERMINAL_STATUSES.has(status),
      `failure status '${status}' is also terminal`);
  }
});

test('failure statuses contain only _failed suffixed values', async (t) => {
  for (const status of REBALANCE_ACK_FAILURE_STATUSES) {
    t.ok(status.endsWith('_failed'),
      `failure status '${status}' ends with _failed`);
  }
});

test('REBALANCE_ACK_CHECKPOINT_FIELD values are unique', async (t) => {
  const values = Object.values(REBALANCE_ACK_CHECKPOINT_FIELD);
  const unique = new Set(values);
  t.equal(values.length, unique.size, 'no duplicate checkpoint field names');
});

test('REBALANCE_ACK_CHECKPOINT_FIELD is frozen', async (t) => {
  t.ok(Object.isFrozen(REBALANCE_ACK_CHECKPOINT_FIELD),
    'checkpoint fields are frozen');
});

test('rebalance ack payload composes with PARTICIPANT_ACK_FIELD', async (t) => {
  const payload = {
    [PARTICIPANT_ACK_FIELD.WORKFLOW_ID]: 'op-123',
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]: 'replica-abc',
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: 42,
    [PARTICIPANT_ACK_FIELD.STATUS]:
      REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
    [PARTICIPANT_ACK_FIELD.CHECKPOINT]: {
      [REBALANCE_ACK_CHECKPOINT_FIELD.OPERATION_ID]: 'op-123',
      [REBALANCE_ACK_CHECKPOINT_FIELD.WORKFLOW_STEP]: 'ACTIVE',
      [REBALANCE_ACK_CHECKPOINT_FIELD.REPLICA_ID]: 'replica-abc',
    },
  };

  t.ok(payload[PARTICIPANT_ACK_FIELD.WORKFLOW_ID],
    'payload has workflowId');
  t.ok(payload[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY],
    'payload has participantKey');
  t.ok(payload[PARTICIPANT_ACK_FIELD.FENCE_TOKEN] !== undefined,
    'payload has fenceToken');
  t.equal(payload[PARTICIPANT_ACK_FIELD.STATUS],
    REBALANCE_ACK_STATUS.REPLICA_CREATE_ACTIVE,
    'payload status is a valid REBALANCE_ACK_STATUS');
  t.ok(payload[PARTICIPANT_ACK_FIELD.CHECKPOINT],
    'payload has checkpoint');
});

test('REBALANCE_ACK_LOG_MSG is frozen with expected keys', async (t) => {
  t.ok(Object.isFrozen(REBALANCE_ACK_LOG_MSG), 'log messages are frozen');
  t.ok(REBALANCE_ACK_LOG_MSG.ACK_RECEIVED, 'has ACK_RECEIVED');
  t.ok(REBALANCE_ACK_LOG_MSG.ACK_ACCEPTED, 'has ACK_ACCEPTED');
  t.ok(REBALANCE_ACK_LOG_MSG.ACK_STALE_FENCE, 'has ACK_STALE_FENCE');
  t.ok(REBALANCE_ACK_LOG_MSG.ACK_DUPLICATE, 'has ACK_DUPLICATE');
  t.ok(REBALANCE_ACK_LOG_MSG.ACK_NOT_FOUND, 'has ACK_NOT_FOUND');
});
