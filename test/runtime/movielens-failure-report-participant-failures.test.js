// Witness for the admin-query-participant-failures-surfaced quest: the
// examples admin websocket client attaches the typed error-envelope fields
// (errorCode, details, participantFailures, firstFailedParticipant,
// participantFailuresOmittedCount) to the rejected Error, and the MovieLens
// demo's failure reports serialise them beside the error message so a failed
// load names its partitions and per-participant errors. Fixture-level: no
// cluster. The client witness uses a real current-socket response frame.

import {once} from 'node:events';
import {WebSocketServer} from 'ws';
import {test} from '../../src/test-helpers/tap.js';
import {observeAdminOwner} from '../helpers/admin-owner-observation.js';
import {
  AdminWsClient, withAdminWsClient, getAdminCleanupFailure, getAdminCleanupFailureReport,
  rethrowIfAdminCleanupIncomplete,
} from '../../scripts/examples/admin-ws-client.js';
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

// Correlation and generation admission remain owned by the client, not a
// fabricated pending callback inserted around the real socket boundary.
async function rejectPendingQuery(t, frame) {
  const server = new WebSocketServer({host: '127.0.0.1', port: 0});
  let client = null;
  t.teardown(async () => {
    const closing = Promise.resolve().then(() => client?.close());
    for (const peer of server.clients) peer.terminate();
    const serverClosed = new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    const outcomes = await observeAdminOwner(Promise.allSettled([closing, serverClosed]),
      'participant fixture cleanup');
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') throw outcome.reason;
    }
  });
  await observeAdminOwner(once(server, 'listening'), 'participant server listening');
  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      const request = JSON.parse(data.toString());
      socket.send(JSON.stringify({...frame, queryId: request.queryId}));
    });
  });
  client = new AdminWsClient({
    target: `ws://127.0.0.1:${server.address().port}`, timeoutMs: 100,
  });
  const error = await observeAdminOwner(client.query('SELECT 1').catch((failure) => failure),
    'participant error response');
  await observeAdminOwner(client.close(), 'participant client close');
  return error;
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

function rejectPrimitive(value) {
  const result = Promise.withResolvers();
  result.reject(value);
  return result.promise;
}

test('admin cleanup evidence preserves and reports an exact frozen primary error', async (t) => {
  const primary = Object.freeze(Object.assign(new Error(PLAIN_ERROR_MESSAGE), ERROR_DETAILS));
  const cleanup = Object.assign(new Error('Admin close incomplete'), {
    code: 'ADMIN_CLOSE_TIMEOUT', timeoutMs: 100, generations: [{generation: 1}],
  });
  const result = await withAdminWsClient({close: async () => {
    throw cleanup;
  }}, async () => {
    throw primary;
  }).catch((error) => error);
  t.equal(result, primary);
  t.equal(getAdminCleanupFailure(primary), cleanup, 'one owner retains the secondary failure');
  t.equal(Object.isFrozen(primary), true);
  t.equal(primary.cleanupFailure, undefined, 'no second mutable-property authority exists');
  const report = buildAffinityDemoReportError(primary);
  t.equal(report.error, PLAIN_ERROR_MESSAGE);
  t.match(report.errorDetail.cleanupFailure, {
    code: cleanup.code, message: cleanup.message, timeoutMs: 100,
    generations: [{generation: 1}],
  });
  const projected = report.errorDetail.cleanupFailure.generations;
  t.not(projected, cleanup.generations, 'report is not a mutable view of retained evidence');
  t.equal(Object.isFrozen(projected), true);
  t.equal(Object.isFrozen(projected[0]), true);
  cleanup.generations[0].generation = 99;
  t.equal(projected[0].generation, 1, 'the frozen report snapshot does not follow source mutation');
});

test('admin cleanup failure is terminal even when the operation succeeded', async (t) => {
  const cleanup = Object.assign(new Error('Admin close incomplete'), {code: 'ADMIN_CLOSE_TIMEOUT'});
  const result = await withAdminWsClient({close: async () => {
    throw cleanup;
  }}, async () => 'ready')
    .catch((error) => error);
  t.equal(result, cleanup, 'successful body cannot hide failed cleanup');
  t.equal(getAdminCleanupFailure(result), cleanup);
  let veto;
  try {
    rethrowIfAdminCleanupIncomplete(result);
  } catch (error) {
    veto = error;
  }
  t.equal(veto, cleanup, 'the same canonical signal guards standalone failure');
});

test('primitive admin failures retain cleanup authority without a WeakMap TypeError', async (t) => {
  const cleanup = Object.assign(new Error('close incomplete'), {code: 'ADMIN_CLOSE_TIMEOUT'});
  const combined = await withAdminWsClient({close: async () => {
    throw cleanup;
  }}, () => rejectPrimitive('primitive-primary')).catch((error) => error);
  t.ok(combined instanceof AggregateError);
  t.same(combined.errors, ['primitive-primary', cleanup]);
  t.equal(getAdminCleanupFailure(combined), cleanup);
  let degraded = 0;
  try {
    rethrowIfAdminCleanupIncomplete(combined);
    degraded += 1;
  } catch (error) {
    t.equal(error, combined);
  }
  t.equal(degraded, 0, 'combined failure vetoes degradation before any redrive');
  const standalone = await withAdminWsClient({close: () => rejectPrimitive('primitive-cleanup')},
    async () => 'ready').catch((error) => error);
  t.equal(standalone.cause, 'primitive-cleanup', 'normalization retains the exact thrown cause');
  t.equal(getAdminCleanupFailure(standalone), standalone);
  t.not(standalone.name, 'TypeError', 'WeakMap admission never replaces the cleanup cause');
});

test('nested admin cleanup reports retain every typed generation failure', async (t) => {
  const primary = Object.freeze(new Error('query failed'));
  const cleanups = [1, 2].map((generation) => Object.assign(new Error(`close-${generation}`), {
    code: 'ADMIN_CLOSE_TIMEOUT', target: `ws://node-${generation}`,
    timeoutMs: 100, deadlineMs: 1234,
    generations: [{generation, target: `ws://node-${generation}`, readyState: 3}],
  }));
  const client = (index) => ({close: async () => {
    throw cleanups[index];
  }});
  const result = await withAdminWsClient(client(1), () =>
    withAdminWsClient(client(0), async () => {
      throw primary;
    })).catch((error) => error);
  t.equal(result, primary);
  t.same(getAdminCleanupFailure(primary).errors, cleanups);
  const report = JSON.parse(JSON.stringify(buildAffinityDemoReportError(primary)));
  t.same(report.errorDetail.cleanupFailure.failures, cleanups.map((error) => ({
    message: error.message, code: error.code, target: error.target,
    timeoutMs: error.timeoutMs, deadlineMs: error.deadlineMs, generations: error.generations,
  })), 'serialization preserves both owned-generation failure leaves');
});

async function retainCleanup(cleanup) {
  return withAdminWsClient({close: async () => {
    throw cleanup;
  }}, async () => 'ready').catch((error) => error);
}

test('admin cleanup reporting refuses accessors and ignores array iterators', async (t) => {
  const cleanup = new Error('close failed');
  let reads = 0;
  Object.defineProperty(cleanup, 'generations', {get() {
    reads += 1;
    if (reads > 1) throw new Error('second generation read');
    return [{generation: 7, readyState: 3}];
  }});
  const retained = await retainCleanup(cleanup);
  let report;
  t.doesNotThrow(() => {
    report = getAdminCleanupFailureReport(retained);
  });
  t.equal(reads, 0, 'diagnostics consume own data, never invoke collaborator accessors');
  t.equal(report?.code, 'ADMIN_CLEANUP_EVIDENCE_UNAVAILABLE');

  const aggregate = new AggregateError([new Error('first'), new Error('second')], 'both failed');
  aggregate.errors[Symbol.iterator] = () => {
    throw new Error('cleanup iterator must not execute');
  };
  await retainCleanup(aggregate);
  t.doesNotThrow(() => {
    report = getAdminCleanupFailureReport(aggregate);
  });
  t.same(report?.failures?.map((failure) => failure.message), ['first', 'second']);
});

test('admin cleanup projection failure cannot replace the retained primary', async (t) => {
  const cleanup = new Error('close failed');
  Object.defineProperty(cleanup, 'generations', {get() {
    throw new Error('opaque diagnostic accessor');
  }});
  await retainCleanup(cleanup);
  let report;
  t.doesNotThrow(() => {
    report = getAdminCleanupFailureReport(cleanup);
  });
  t.equal(report?.code, 'ADMIN_CLEANUP_EVIDENCE_UNAVAILABLE');
  t.equal(getAdminCleanupFailure(cleanup), cleanup);
  t.throws(() => rethrowIfAdminCleanupIncomplete(cleanup), cleanup);
});

test('admin cleanup projection bounds numeric and collection evidence before traversal', async (t) => {
  const inherited = Object.create({generation: 99});
  const sparse = [];
  sparse.length = 1;
  const cases = [
    {timeoutMs: Infinity}, {timeoutMs: NaN}, {deadlineMs: Number.MAX_SAFE_INTEGER + 1},
    {generations: new Proxy([], {get() {
      throw new Error('array proxy must not execute');
    }})},
    {generations: new Array(1000000000)},
    {generations: sparse}, {generations: [inherited]},
  ];
  for (const fields of cases) {
    const cleanup = Object.assign(new Error('invalid cleanup evidence'), fields);
    await retainCleanup(cleanup);
    const report = getAdminCleanupFailureReport(cleanup);
    t.equal(report.code, 'ADMIN_CLEANUP_EVIDENCE_UNAVAILABLE');
    t.equal(getAdminCleanupFailure(cleanup), cleanup, 'report rejection does not change cleanup veto');
  }
});

test('admin cleanup projection does not dispatch through mutable array stack methods', async (t) => {
  const cleanup = new AggregateError([new Error('first'), new Error('second')], 'both failed');
  await retainCleanup(cleanup);
  let calls = 0;
  const unexpected = () => {
    calls += 1;
    throw new Error('mutable array method must not run');
  };
  let report;
  // Node's mock.method rejects arrays, including Array.prototype. Keep this
  // synchronous adversarial window descriptor-exact and restore before TAP runs.
  const popDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'pop');
  const pushDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'push');
  try {
    Reflect.defineProperty(Array.prototype, 'pop', {...popDescriptor, value: unexpected});
    Reflect.defineProperty(Array.prototype, 'push', {...pushDescriptor, value: unexpected});
    report = getAdminCleanupFailureReport(cleanup);
  } finally {
    Reflect.defineProperty(Array.prototype, 'push', pushDescriptor);
    Reflect.defineProperty(Array.prototype, 'pop', popDescriptor);
  }
  t.equal(calls, 0);
  t.same(report.failures?.map((failure) => failure.message), ['first', 'second']);
});

test('AdminWsClient attaches the typed error-envelope fields to the ' +
  'rejected query Error', async (t) => {
  const error = await rejectPendingQuery(t, buildParticipantFailureFrame());

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
    const error = await rejectPendingQuery(t, {
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
  const error = await rejectPendingQuery(t, buildParticipantFailureFrame());

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
