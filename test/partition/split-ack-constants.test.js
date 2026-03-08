/**
 * Tests for split participant acknowledgement constants.
 *
 * Validates structural integrity of typed acknowledgement payloads
 * for split executors and their composition with the shared
 * PARTICIPANT_ACK_FIELD from workflow-constants.js.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  SPLIT_ACK_STATUS,
  SPLIT_ACK_TERMINAL_STATUSES,
  SPLIT_ACK_FAILURE_STATUSES,
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_LOG_MSG,
} from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';

test('SPLIT_ACK_STATUS values are unique', async (t) => {
  const values = Object.values(SPLIT_ACK_STATUS);
  const unique = new Set(values);
  t.equal(values.length, unique.size, 'no duplicate status values');
});

test('SPLIT_ACK_STATUS is frozen', async (t) => {
  t.ok(Object.isFrozen(SPLIT_ACK_STATUS), 'status enum is frozen');
});

test('terminal statuses contain only valid split ack statuses', async (t) => {
  const allStatuses = new Set(Object.values(SPLIT_ACK_STATUS));
  for (const status of SPLIT_ACK_TERMINAL_STATUSES) {
    t.ok(allStatuses.has(status),
      `terminal status '${status}' exists in SPLIT_ACK_STATUS`);
  }
});

test('failure statuses are a subset of terminal statuses', async (t) => {
  for (const status of SPLIT_ACK_FAILURE_STATUSES) {
    t.ok(SPLIT_ACK_TERMINAL_STATUSES.has(status),
      `failure status '${status}' is also terminal`);
  }
});

test('failure statuses contain only _failed suffixed values', async (t) => {
  for (const status of SPLIT_ACK_FAILURE_STATUSES) {
    t.ok(status.endsWith('_failed'),
      `failure status '${status}' ends with _failed`);
  }
});

test('SPLIT_ACK_CHECKPOINT_FIELD values are unique', async (t) => {
  const values = Object.values(SPLIT_ACK_CHECKPOINT_FIELD);
  const unique = new Set(values);
  t.equal(values.length, unique.size, 'no duplicate checkpoint field names');
});

test('SPLIT_ACK_CHECKPOINT_FIELD is frozen', async (t) => {
  t.ok(Object.isFrozen(SPLIT_ACK_CHECKPOINT_FIELD),
    'checkpoint fields are frozen');
});

test('SPLIT_PARTICIPANT_PREFIX values are unique', async (t) => {
  const values = Object.values(SPLIT_PARTICIPANT_PREFIX);
  const unique = new Set(values);
  t.equal(values.length, unique.size, 'no duplicate participant prefixes');
});

test('SPLIT_PARTICIPANT_PREFIX is frozen', async (t) => {
  t.ok(Object.isFrozen(SPLIT_PARTICIPANT_PREFIX),
    'participant prefixes are frozen');
});

test('split ack payload composes with PARTICIPANT_ACK_FIELD', async (t) => {
  const payload = {
    [PARTICIPANT_ACK_FIELD.WORKFLOW_ID]: 'split-table1-p1-v2',
    [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
      SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION + '-p1',
    [PARTICIPANT_ACK_FIELD.FENCE_TOKEN]: 7,
    [PARTICIPANT_ACK_FIELD.STATUS]: SPLIT_ACK_STATUS.CATCHUP_READY,
    [PARTICIPANT_ACK_FIELD.CHECKPOINT]: {
      [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]: 123,
      [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]: 456,
    },
  };

  t.ok(payload[PARTICIPANT_ACK_FIELD.WORKFLOW_ID],
    'payload has workflowId');
  t.ok(payload[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY],
    'payload has participantKey');
  t.ok(payload[PARTICIPANT_ACK_FIELD.FENCE_TOKEN] !== undefined,
    'payload has fenceToken');
  t.equal(payload[PARTICIPANT_ACK_FIELD.STATUS],
    SPLIT_ACK_STATUS.CATCHUP_READY,
    'payload status is a valid SPLIT_ACK_STATUS');
  t.ok(payload[PARTICIPANT_ACK_FIELD.CHECKPOINT],
    'payload has checkpoint with split-specific fields');
});

test('SPLIT_ACK_LOG_MSG is frozen with expected keys', async (t) => {
  t.ok(Object.isFrozen(SPLIT_ACK_LOG_MSG), 'log messages are frozen');
  t.ok(SPLIT_ACK_LOG_MSG.ACK_RECEIVED, 'has ACK_RECEIVED');
  t.ok(SPLIT_ACK_LOG_MSG.ACK_ACCEPTED, 'has ACK_ACCEPTED');
  t.ok(SPLIT_ACK_LOG_MSG.ACK_STALE_FENCE, 'has ACK_STALE_FENCE');
  t.ok(SPLIT_ACK_LOG_MSG.ACK_DUPLICATE, 'has ACK_DUPLICATE');
  t.ok(SPLIT_ACK_LOG_MSG.ACK_NOT_FOUND, 'has ACK_NOT_FOUND');
});
