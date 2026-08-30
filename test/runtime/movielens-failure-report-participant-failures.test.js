// Witness for the admin-query-participant-failures-surfaced quest: the
// examples admin websocket client attaches the typed error-envelope fields
// (errorCode, details, participantFailures, firstFailedParticipant,
// participantFailuresOmittedCount) to the rejected Error, and the MovieLens
// demo's failure reports serialise them beside the error message so a failed
// load names its partitions and per-participant errors. Fixture-level: no
// cluster, no socket.

import {test} from '../../src/test-helpers/tap.js';
import {AdminWsClient} from '../../scripts/examples/admin-ws-client.js';
import {
  buildAffinityDemoLiveReport,
} from '../../examples/service-data-affinity/affinity-demo-live-report.js';
import {
  buildComparisonReport,
} from '../../examples/service-data-affinity/run-comparison.js';
import {
  buildAffinityDemoReportError,
} from '../../examples/service-data-affinity/affinity-demo-report-error.js';
import {
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';

const TIMESTAMP = '2026-08-30T12:07:55.000Z';
const QUERY_ID = 'query-participant-failure-report-1';
const MESSAGE_TYPE_QUERY_RESULT = 'query_result';
const PLAIN_ERROR_MESSAGE = 'Query execution failed';
const ERROR_DETAILS = Object.freeze({reason: 'split_transition'});
const OMITTED_COUNT = 2;
const PARTICIPANT_FAILURES = Object.freeze([
  Object.freeze({
    partitionId: 'tbl-ratings-p1',
    participantNodeId: 'node-0',
    participantAddress: '10.0.0.1:7000',
    errorCode: 'PARTITION_ROUTING_FAILED',
    error: 'Canonical partition leader metadata missing',
    failedTable: 'ratings',
  }),
  Object.freeze({
    partitionId: 'tbl-ratings-p1_p_788aff5c_right',
    participantNodeId: 'node-3',
    participantAddress: '10.0.0.3:7000',
    errorCode: 'STALE_PARTITION_EPOCH',
    error: 'planning_snapshot_refresh_pending',
    failedTable: 'ratings',
  }),
]);

function buildParticipantFailureFrame() {
  return {
    type: MESSAGE_TYPE_QUERY_RESULT,
    queryId: QUERY_ID,
    error: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    details: ERROR_DETAILS,
    participantFailures: [...PARTICIPANT_FAILURES],
    firstFailedParticipant: PARTICIPANT_FAILURES[0],
    participantFailuresOmittedCount: OMITTED_COUNT,
  };
}

// Drive the real _handleMessage routing seam with one pending request, the
// same way a socket frame reaches it, without opening a socket.
async function rejectPendingQuery(frame) {
  const client = new AdminWsClient();
  const rejection = new Promise((resolve, reject) => {
    client.pending.set(frame.queryId, {
      resolve,
      reject,
      timeout: setTimeout(() => {}, 0),
    });
  });
  client._handleMessage(frame);
  try {
    await rejection;
  } catch (error) {
    return error;
  }
  throw new Error('the error frame did not reject the pending query');
}

function reportDetail(report) {
  return report.standardSummary.scenarios[0].detail;
}

function expectedErrorDetail() {
  return {
    message: QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    errorCode: QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE,
    details: ERROR_DETAILS,
    participantFailures: [...PARTICIPANT_FAILURES],
    firstFailedParticipant: PARTICIPANT_FAILURES[0],
    participantFailuresOmittedCount: OMITTED_COUNT,
  };
}

test('AdminWsClient attaches the typed error-envelope fields to the ' +
  'rejected query Error', async (t) => {
  const error = await rejectPendingQuery(buildParticipantFailureFrame());

  t.ok(error instanceof Error, 'the client still rejects with an Error');
  t.equal(error.message, QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE);
  t.equal(error.errorCode, QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE);
  t.same(error.details, ERROR_DETAILS);
  t.same(error.participantFailures, [...PARTICIPANT_FAILURES],
    'the rejected Error names every forwarded participant failure');
  t.same(error.firstFailedParticipant, PARTICIPANT_FAILURES[0]);
  t.equal(error.participantFailuresOmittedCount, OMITTED_COUNT);
});

test('AdminWsClient rejects a plain error frame with only the message',
  async (t) => {
    const error = await rejectPendingQuery({
      type: MESSAGE_TYPE_QUERY_RESULT,
      queryId: QUERY_ID,
      error: PLAIN_ERROR_MESSAGE,
    });

    t.equal(error.message, PLAIN_ERROR_MESSAGE);
    t.equal(error.errorCode, undefined,
      'no field is fabricated when the frame does not carry it');
    t.equal(error.participantFailures, undefined);
    t.equal(error.firstFailedParticipant, undefined);
    t.equal(error.participantFailuresOmittedCount, undefined);
  });

test('MovieLens comparison and live failure reports serialise the ' +
  'participant failures beside the error message', async (t) => {
  const error = await rejectPendingQuery(buildParticipantFailureFrame());

  const comparisonReport = buildComparisonReport({
    timestamp: TIMESTAMP,
    error,
  });
  t.equal(comparisonReport.summary.failed, 1);
  t.equal(
    reportDetail(comparisonReport).error,
    QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
    'the comparison report keeps the error string every reader consumes',
  );
  t.same(
    reportDetail(comparisonReport).errorDetail,
    expectedErrorDetail(),
    'the comparison failure report names partitions and participant errors',
  );

  const liveReport = buildAffinityDemoLiveReport({
    timestamp: TIMESTAMP,
    error,
  });
  t.equal(liveReport.summary.failed, 1);
  t.equal(
    reportDetail(liveReport).error,
    QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE,
  );
  t.same(
    reportDetail(liveReport).errorDetail,
    expectedErrorDetail(),
    'the live failure report names partitions and participant errors',
  );
  t.equal(
    JSON.parse(JSON.stringify(reportDetail(liveReport).errorDetail))
      .participantFailures[1].errorCode,
    PARTICIPANT_FAILURES[1].errorCode,
    'the report survives JSON serialisation with the error codes intact',
  );
});

test('demo report error owner writes a plain error and a passing run ' +
  'unchanged', async (t) => {
  const plain = buildAffinityDemoReportError(new Error(PLAIN_ERROR_MESSAGE));
  t.equal(plain.error, PLAIN_ERROR_MESSAGE);
  t.same(plain.errorDetail, {message: PLAIN_ERROR_MESSAGE},
    'a plain error carries only its message');

  const passing = buildComparisonReport({
    timestamp: TIMESTAMP,
    comparison: {resultsIdentical: true},
  });
  t.equal(passing.summary.passed, 1);
  t.equal(reportDetail(passing).error, null);
  t.equal(reportDetail(passing).errorDetail, null,
    'a passing run carries no error detail');
});
