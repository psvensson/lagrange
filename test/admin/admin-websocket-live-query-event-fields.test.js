/**
 * The client-facing live_query_event message names each fact once, with the
 * same names as the internal live-query event: `data` (the row the event is
 * about), `oldData` (the row before an update, update only) and `rows` (the
 * list of a snapshot or reset).
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  connectAndReceive,
  createPopulatedCache,
  createMockQueryEngine,
  waitForMessage,
} from './admin-websocket-api-test-support.js';
import {AdminWebSocketAPI, ErrorCode, MessageType} from
  '../../src/admin/admin-websocket-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LIVE_QUERY_EVENT} from '../../src/live-query/live-query-constants.js';
import {
  buildDeleteEvent,
  buildInsertEvent,
  buildResetNotification,
  buildUpdateEvent,
} from '../../src/live-query/live-query-group-helpers.js';

ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const ROW_FIELD_NAMES = Object.freeze(
  ['row', 'data', 'old', 'oldData', 'new', 'rows', 'results']);

function presentRowFields(message) {
  return ROW_FIELD_NAMES.filter((name) => Object.hasOwn(message, name));
}

test('live_query_event carries exactly the contract fields per event type', async (t) => {
  let liveClient = null;
  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: {
      initialized: true,
      isInitialized: () => true,
      registerLiveQuery: async (_parsedQuery, client) => {
        liveClient = client;
        return {queryId: 'lq-1', expiresAt: Date.now() + 30000, partitions: ['p1']};
      },
      sendSnapshotToClient: async () => {},
      unregisterLiveQuery: () => {},
      handleClientDisconnection: () => {},
    },
  });
  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    subscriptionId: 'sub-1',
    sql: 'LIVE SELECT * FROM logs',
  }));
  await waitForMessage(ws);
  t.ok(liveClient, 'registered a live client');

  const before = {id: 1, amount: 10};
  const after = {id: 1, amount: 20};
  const cases = [
    ['insert', buildInsertEvent({queryId: 'lq-1', row: after}), {data: after}],
    ['update', buildUpdateEvent({queryId: 'lq-1', oldRow: before, newRow: after}),
      {data: after, oldData: before}],
    ['delete', buildDeleteEvent({queryId: 'lq-1', row: before}), {data: before}],
    ['snapshot', {type: LIVE_QUERY_EVENT.SNAPSHOT, queryId: 'lq-1', rows: [after], count: 1},
      {rows: [after]}],
    ['reset', buildResetNotification({queryId: 'lq-1', newRows: [after], count: 1}),
      {rows: [after]}],
  ];

  for (const [label, event, expected] of cases) {
    const received = waitForMessage(ws);
    liveClient.send(JSON.stringify(event));
    const message = await received;
    t.equal(message.type, MessageType.LIVE_QUERY_EVENT, `${label}: message type`);
    t.equal(message.eventType, event.type, `${label}: eventType`);
    t.same(presentRowFields(message), Object.keys(expected), `${label}: exact row fields`);
    for (const [name, value] of Object.entries(expected)) {
      t.same(message[name], value, `${label}: ${name}`);
    }
  }

  ws.close();
  await api.shutdown();
});

// An error event names what failed in the admin websocket's own error
// fields: `error` (the message) and `errorCode`.
test('live_query_event error carries the typed error', async (t) => {
  let liveClient = null;
  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: {
      initialized: true,
      isInitialized: () => true,
      registerLiveQuery: async (_parsedQuery, client) => {
        liveClient = client;
        return {queryId: 'lq-2', expiresAt: Date.now() + 30000, partitions: []};
      },
      unregisterLiveQuery: () => {},
      handleClientDisconnection: () => {},
    },
  });
  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);
  ws.send(JSON.stringify({
    type: MessageType.LIVE_QUERY_SUBSCRIBE,
    subscriptionId: 'sub-2',
    sql: 'LIVE SELECT * FROM logs',
  }));
  await waitForMessage(ws);

  const cases = [
    ['Table not found: logs', ErrorCode.TABLE_NOT_FOUND],
    ['snapshot engine exploded', ErrorCode.INTERNAL_ERROR],
  ];
  for (const [errorMessage, errorCode] of cases) {
    const received = waitForMessage(ws);
    liveClient.send(JSON.stringify(
      {type: LIVE_QUERY_EVENT.ERROR, queryId: 'lq-2', error: errorMessage}));
    const message = await received;
    t.equal(message.type, MessageType.LIVE_QUERY_EVENT);
    t.equal(message.subscriptionId, 'sub-2');
    t.equal(message.eventType, LIVE_QUERY_EVENT.ERROR);
    t.equal(message.error, errorMessage, 'the error message travels');
    t.equal(message.errorCode, errorCode, 'the error is typed');
    t.same(presentRowFields(message), [], 'an error carries no row fields');
  }

  ws.close();
  await api.shutdown();
});

/**
 * Subscribe over a live query manager whose registration fails, and collect
 * every message the subscribe is answered with.
 * @param {Object} t
 * @param {Object} options
 * @return {Promise<Array<Object>>}
 */
async function answersToFailedSubscribe(t, {sql, registerLiveQuery}) {
  const api = new AdminWebSocketAPI({
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
    nodeId: 'test-node',
    liveQueryManager: {
      initialized: true,
      isInitialized: () => true,
      registerLiveQuery,
      unregisterLiveQuery: () => {},
      handleClientDisconnection: () => {},
    },
  });
  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);
  const answers = [];
  ws.on('message', (data) => answers.push(JSON.parse(data.toString())));
  ws.send(JSON.stringify({type: MessageType.LIVE_QUERY_SUBSCRIBE, subscriptionId: 'sub-f', sql}));
  await new Promise((resolve) => setTimeout(resolve, 100));
  ws.close();
  await api.shutdown();
  t.equal(answers.length, 1, 'one failure, one answer');
  return answers;
}

// One failure, one named answer: the subscribe is answered by one typed
// error event that names the subscription and the real cause.
test('a failed subscribe snapshot is answered once, typed, with its cause', async (t) => {
  const [answer] = await answersToFailedSubscribe(t, {
    sql: 'LIVE SELECT * FROM logs',
    registerLiveQuery: async (_parsedQuery, client) => {
      client.send(JSON.stringify(
        {type: LIVE_QUERY_EVENT.ERROR, queryId: 'lq-f', error: 'snapshot engine exploded'}));
      throw new Error('snapshot engine exploded');
    },
  });
  t.equal(answer.type, MessageType.LIVE_QUERY_EVENT);
  t.equal(answer.subscriptionId, 'sub-f');
  t.equal(answer.eventType, LIVE_QUERY_EVENT.ERROR);
  t.equal(answer.error, 'snapshot engine exploded', 'the real cause, not a parse failure');
  t.equal(answer.errorCode, ErrorCode.INTERNAL_ERROR);
});

test('a registration refused before any snapshot is answered once, typed', async (t) => {
  const [answer] = await answersToFailedSubscribe(t, {
    sql: 'LIVE SELECT * FROM logs',
    registerLiveQuery: async () => {
      throw new Error('Maximum 10 live queries per client exceeded');
    },
  });
  t.equal(answer.type, MessageType.LIVE_QUERY_EVENT);
  t.equal(answer.subscriptionId, 'sub-f');
  t.equal(answer.eventType, LIVE_QUERY_EVENT.ERROR);
  t.equal(answer.error, 'Maximum 10 live queries per client exceeded');
  t.equal(answer.errorCode, ErrorCode.INTERNAL_ERROR);
});

test('a subscribe whose SQL does not parse is answered once as a parse failure', async (t) => {
  let registered = false;
  const [answer] = await answersToFailedSubscribe(t, {
    sql: 'LIVE SELECT FROM WHERE',
    registerLiveQuery: async () => {
      registered = true;
      return {queryId: 'never', partitions: []};
    },
  });
  t.equal(registered, false, 'an unparsed query is never registered');
  t.equal(answer.type, MessageType.LIVE_QUERY_EVENT);
  t.equal(answer.subscriptionId, 'sub-f');
  t.equal(answer.eventType, LIVE_QUERY_EVENT.ERROR);
  t.match(answer.error, /^Failed to parse live query SQL: /, 'named a parse failure');
  t.equal(answer.errorCode, ErrorCode.SYNTAX_ERROR);
});
