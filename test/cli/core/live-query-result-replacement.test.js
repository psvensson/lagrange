/**
 * The CLI's live-query consumers decide on the server's named outcomes:
 *
 * - `live_query_subscribed` acknowledges a subscription (its id and the
 *   partitions it monitors) and makes it active;
 * - a `snapshot` and a `reset` both carry a whole result as `rows`, and each
 *   replaces the result a view shows (a reset is the query re-executed);
 * - an `error` event names what failed (`error`, `errorCode`) and the views
 *   show it.
 */

import {test} from '../../../src/test-helpers/tap.js';
import {LiveQueryManager} from '../../../src/cli/core/live-query-manager.js';
import {EventBus} from '../../../src/cli/core/event-bus.js';
import {LogsView} from '../../../src/cli/views/logs-view.js';
import {SQLQueryView} from '../../../src/cli/sql/sql-query-view.js';

function createWiring() {
  const bus = new EventBus();
  const manager = new LiveQueryManager({
    subscribeLiveQuery: () => true,
    unsubscribeLiveQuery: () => true,
  }, bus);
  return {bus, manager};
}

function liveEvent(subscriptionId, fields) {
  return {type: 'live_query_event', subscriptionId, ...fields};
}

const log = (id) => ({log_id: id, level: 'INFO', message: id, timestamp: 100});

test('live_query_subscribed activates the subscription with its partitions', async (t) => {
  const {manager} = createWiring();
  const subscriptionId = manager.subscribe('LIVE SELECT * FROM logs');
  t.equal(manager.getSubscription(subscriptionId).status, 'pending');

  manager.handleLiveQueryEvent({type: 'live_query_subscribed', subscriptionId,
    queryId: 'q-1', partitions: ['p1', 'p2']});

  t.equal(manager.getSubscription(subscriptionId).status, 'active');
  t.same(manager.getSubscription(subscriptionId).partitions, ['p1', 'p2']);
  t.equal(manager.pause(subscriptionId), true, 'an acknowledged subscription pauses');
});

test('logs view: a reset replaces the result exactly like a snapshot', async (t) => {
  const {bus, manager} = createWiring();
  const view = new LogsView({connectionManager: {}, liveQueryManager: manager,
    eventBus: bus, liveQueryEnabled: true});
  view.fetchLogs();
  const subscriptionId = view.activeSubscriptionId;

  manager.handleLiveQueryEvent(liveEvent(subscriptionId,
    {eventType: 'snapshot', rows: [log('l1'), log('l2')]}));
  t.same(view.data.map((row) => row.log_id), ['l1', 'l2'], 'snapshot replaces');

  manager.handleLiveQueryEvent(liveEvent(subscriptionId,
    {eventType: 'reset', rows: [log('l3')]}));
  t.same(view.data.map((row) => row.log_id), ['l3'], 'reset replaces');
});

test('logs view shows a live-query error', async (t) => {
  const {bus, manager} = createWiring();
  const view = new LogsView({connectionManager: {}, liveQueryManager: manager,
    eventBus: bus, liveQueryEnabled: true});
  view.fetchLogs();
  manager.handleLiveQueryEvent(liveEvent(view.activeSubscriptionId,
    {eventType: 'error', error: 'Table not found: logs', errorCode: 'TABLE_NOT_FOUND'}));
  t.equal(view.data.length, 1, 'one error row');
  t.equal(view.data[0].level, 'ERROR');
  t.match(view.data[0].message, /TABLE_NOT_FOUND/);
  t.match(view.data[0].message, /Table not found: logs/);
  t.equal(manager.getSubscription(view.activeSubscriptionId).status, 'failed',
    'an error ends the subscription in a named state');
});

test('SQL view: a snapshot and a reset each replace the shown result', async (t) => {
  const {bus, manager} = createWiring();
  const view = new SQLQueryView({liveQueryManager: manager, eventBus: bus});
  view.initialize();
  await view.executeLiveQuery('LIVE SELECT * FROM orders');
  const subscriptionId = view.getActiveLiveQueryId();

  manager.handleLiveQueryEvent(liveEvent(subscriptionId,
    {eventType: 'snapshot', rows: [{id: 1}, {id: 2}]}));
  t.same(view.resultsPanel.currentResult.rows, [{id: 1}, {id: 2}], 'snapshot shown');

  manager.handleLiveQueryEvent(liveEvent(subscriptionId,
    {eventType: 'reset', rows: [{id: 3}]}));
  t.same(view.resultsPanel.currentResult.rows, [{id: 3}], 'reset replaces');
});

test('SQL view shows a live-query error', async (t) => {
  const {bus, manager} = createWiring();
  const view = new SQLQueryView({liveQueryManager: manager, eventBus: bus});
  view.initialize();
  await view.executeLiveQuery('LIVE SELECT * FROM orders');
  manager.handleLiveQueryEvent(liveEvent(view.getActiveLiveQueryId(),
    {eventType: 'error', error: 'Table not found: orders', errorCode: 'TABLE_NOT_FOUND'}));
  t.equal(view.resultsPanel.error.message, 'Table not found: orders');
  t.equal(view.resultsPanel.error.code, 'TABLE_NOT_FOUND');
  t.equal(view.getLiveQueryStatus(), 'failed');
});
