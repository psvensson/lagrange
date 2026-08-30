// Witness for the admin-query-participant-failures-surfaced quest: the admin
// query-result envelope owner forwards the distributed write owner's
// per-participant failures under typed field names, bounded by
// ADMIN_QUERY_RESULT.PARTICIPANT_FAILURES_LIMIT with the omitted count
// recorded, and leaves every other envelope shape unchanged.

import {test} from '../../src/test-helpers/tap.js';
import {
  createAdminQueryResultMessageEnvelope,
} from '../../src/admin/admin-query-result-message-envelope.js';
import {ADMIN_WEBSOCKET_API_SHARED} from
  '../../src/admin/admin-websocket-api-shared.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';

const {ADMIN_QUERY_RESULT, ErrorCode, MessageType} =
  ADMIN_WEBSOCKET_API_SHARED;

const TEST_QUERY_ID = 'query-participant-failures-1';
const TEST_OPERATION = 'INSERT';
const TEST_TABLE_NAME = 'ratings';
const TEST_PARTICIPANT_ERROR_CODE = 'PARTITION_ROUTING_FAILED';
const TEST_PARTICIPANT_ERROR = 'Canonical partition leader metadata missing';
const TEST_HINT = 'retry the batch';
const TEST_DETAILS = Object.freeze({reason: 'split_transition'});
const OMITTED_ENTRY_COUNT = 3;
const TEST_AFFECTED_ROWS = 2;
const TEST_DURATION_MS = 15000;

function buildParticipantFailure(index) {
  return {
    partitionId: `tbl-ratings-p${index}`,
    participantNodeId: `node-${index}`,
    participantAddress: `10.0.0.${index}:7000`,
    errorCode: TEST_PARTICIPANT_ERROR_CODE,
    error: TEST_PARTICIPANT_ERROR,
    durationMs: TEST_DURATION_MS,
    retryAfterMs: null,
    deferRetry: false,
    backpressured: false,
    failedTable: TEST_TABLE_NAME,
  };
}

function buildParticipantFailureResult(count) {
  const participantFailures = Array.from(
    {length: count},
    (_entry, index) => buildParticipantFailure(index + 1),
  );
  return {
    success: false,
    operation: TEST_OPERATION,
    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    hint: TEST_HINT,
    details: TEST_DETAILS,
    failedPartitions: participantFailures.map((entry) => entry.partitionId),
    participantFailures,
    firstFailedParticipant: participantFailures[0],
  };
}

function projectParticipantFields(message) {
  return {
    error: message.error,
    errorCode: message.errorCode,
    participantFailures: message.participantFailures,
    firstFailedParticipant: message.firstFailedParticipant,
    participantFailuresOmittedCount: message.participantFailuresOmittedCount,
  };
}

test('admin error envelope carries typed participantFailures and ' +
  'firstFailedParticipant from the distributed write owner', async (t) => {
  const result = buildParticipantFailureResult(2);
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, result);

  t.equal(message.type, MessageType.QUERY_RESULT);
  t.equal(message.error, QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE);
  t.equal(
    message.errorCode,
    QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
  );
  t.same(
    message.participantFailures,
    result.participantFailures,
    'every failed participant rides on the envelope under its typed name',
  );
  t.same(
    message.firstFailedParticipant,
    result.participantFailures[0],
    'the first failed participant is named on the envelope',
  );
  t.equal(
    message.participantFailuresOmittedCount,
    ADMIN_QUERY_RESULT.PARTICIPANT_FAILURES_OMITTED_COUNT_DEFAULT,
    'a list within the bound records zero omitted entries',
  );
  t.equal(
    message.participantFailures[0].errorCode,
    TEST_PARTICIPANT_ERROR_CODE,
    'per-participant error codes survive the envelope',
  );
});

test('admin error envelope caps participantFailures at the typed limit ' +
  'and records the omitted count', async (t) => {
  const limit = ADMIN_QUERY_RESULT.PARTICIPANT_FAILURES_LIMIT;
  const result = buildParticipantFailureResult(limit + OMITTED_ENTRY_COUNT);
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, result);

  t.equal(
    message.participantFailures.length,
    limit,
    'the envelope never carries more entries than the typed bound',
  );
  t.same(
    message.participantFailures,
    result.participantFailures.slice(0, limit),
    'the bound keeps the leading entries in owner order',
  );
  t.equal(
    message.participantFailuresOmittedCount,
    OMITTED_ENTRY_COUNT,
    'the omitted count names how many entries the bound dropped',
  );
  t.same(
    message.firstFailedParticipant,
    result.participantFailures[0],
    'the first failed participant is unaffected by the bound',
  );
});

test('successful-result-envelope-unchanged', async (t) => {
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
    success: true,
    operation: TEST_OPERATION,
    affectedRows: TEST_AFFECTED_ROWS,
    partitions: ['tbl-ratings-p1'],
    tableName: TEST_TABLE_NAME,
  });

  t.equal(message.operation, TEST_OPERATION);
  t.equal(message.affectedRows, TEST_AFFECTED_ROWS);
  t.equal(message.error, undefined, 'a success envelope carries no error');
  t.equal(
    message.participantFailures,
    undefined,
    'a success envelope never carries participant failure fields',
  );
  t.equal(message.firstFailedParticipant, undefined);
  t.equal(message.participantFailuresOmittedCount, undefined);
});

test('error-without-participants-unchanged', async (t) => {
  const message = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, {
    success: false,
    error: TEST_PARTICIPANT_ERROR,
    hint: TEST_HINT,
    details: TEST_DETAILS,
    participantFailures: [],
  });

  t.equal(message.error, TEST_PARTICIPANT_ERROR);
  t.equal(message.errorCode, ErrorCode.INTERNAL_ERROR);
  t.equal(message.hint, TEST_HINT);
  t.same(message.details, TEST_DETAILS);
  t.equal(
    message.participantFailures,
    undefined,
    'an error without failed participants carries no participant fields',
  );
  t.equal(message.firstFailedParticipant, undefined);
  t.equal(message.participantFailuresOmittedCount, undefined);
});

test('witness-deterministic', async (t) => {
  const result = buildParticipantFailureResult(
    ADMIN_QUERY_RESULT.PARTICIPANT_FAILURES_LIMIT + OMITTED_ENTRY_COUNT,
  );
  const first = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, result);
  const second = createAdminQueryResultMessageEnvelope(TEST_QUERY_ID, result);

  t.same(
    projectParticipantFields(first),
    projectParticipantFields(second),
    'the same owner result projects the same participant fields every time',
  );
  t.equal(
    first.participantFailuresOmittedCount,
    OMITTED_ENTRY_COUNT,
    'the deterministic witness exercises the bound',
  );
});
