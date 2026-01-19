import {test} from 'tap';
import {SQLQueryView, QUERY_TYPE} from '../../../src/cli/sql/sql-query-view.js';

test('SQLQueryView', async (t) => {
  t.test('constructor initializes with defaults', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.screen, null);
    t.equal(view.connectionManager, null);
    t.equal(view.cache, null);
    t.equal(view.readOnlyMode, false);
    t.equal(view.eventBus, null);
    t.equal(view.visible, false);
  });

  t.test('constructor accepts options', async (t) => {
    const mockScreen = {};
    const mockConnectionManager = {};
    const mockCache = {};
    const mockEventBus = {};

    const view = new SQLQueryView({
      screen: mockScreen,
      connectionManager: mockConnectionManager,
      cache: mockCache,
      readOnlyMode: true,
      eventBus: mockEventBus,
    });

    t.equal(view.screen, mockScreen);
    t.equal(view.connectionManager, mockConnectionManager);
    t.equal(view.cache, mockCache);
    t.equal(view.readOnlyMode, true);
    t.equal(view.eventBus, mockEventBus);
  });

  t.test('initialize creates components', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.ok(view.queryInput, 'queryInput created');
    t.ok(view.resultsPanel, 'resultsPanel created');
    t.ok(view.queryHistory, 'queryHistory created');
    t.ok(view.syntaxHighlighter, 'syntaxHighlighter created');
  });

  t.test('initialize creates autocomplete when cache provided', async (t) => {
    const mockCache = {
      getTables: () => [{table_name: 'users'}],
    };

    const view = new SQLQueryView({cache: mockCache});
    view.initialize();

    t.ok(view.autocomplete, 'autocomplete created');
  });

  t.test('isSelectQuery identifies SELECT queries', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isSelectQuery('SELECT * FROM users'), true);
    t.equal(view.isSelectQuery('  select id from users'), true);
    t.equal(view.isSelectQuery('SELECT'), true);
    t.equal(view.isSelectQuery('INSERT INTO users'), false);
    t.equal(view.isSelectQuery('UPDATE users SET'), false);
    t.equal(view.isSelectQuery('DELETE FROM users'), false);
  });

  t.test('isWriteQuery identifies write queries', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isWriteQuery('INSERT INTO users'), true);
    t.equal(view.isWriteQuery('UPDATE users SET'), true);
    t.equal(view.isWriteQuery('DELETE FROM users'), true);
    t.equal(view.isWriteQuery('SELECT * FROM users'), false);
  });

  t.test('isDangerousQuery detects DELETE without WHERE', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isDangerousQuery('DELETE FROM users'), true);
    t.equal(view.isDangerousQuery('DELETE FROM users;'), true);
    t.equal(view.isDangerousQuery('delete from users'), true);
    t.equal(view.isDangerousQuery('DELETE FROM users WHERE id = 1'), false);
  });

  t.test('isDangerousQuery detects UPDATE without WHERE', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isDangerousQuery('UPDATE users SET name = "test"'), true);
    t.equal(view.isDangerousQuery('update users set active = false'), true);
    t.equal(view.isDangerousQuery('UPDATE users SET name = "test" WHERE id = 1'), false);
  });

  t.test('classifyQuery returns correct query types', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.classifyQuery('SELECT * FROM users'), QUERY_TYPE.SELECT);
    t.equal(view.classifyQuery('INSERT INTO users'), QUERY_TYPE.INSERT);
    t.equal(view.classifyQuery('UPDATE users SET'), QUERY_TYPE.UPDATE);
    t.equal(view.classifyQuery('DELETE FROM users'), QUERY_TYPE.DELETE);
    t.equal(view.classifyQuery('CREATE TABLE users'), QUERY_TYPE.OTHER);
  });

  t.test('read-only mode getters and setters', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isReadOnly(), false);

    view.setReadOnly(true);
    t.equal(view.isReadOnly(), true);

    view.setReadOnly(false);
    t.equal(view.isReadOnly(), false);
  });

  t.test('toggleReadOnly toggles mode', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isReadOnly(), false);

    const result1 = view.toggleReadOnly();
    t.equal(result1, true);
    t.equal(view.isReadOnly(), true);

    const result2 = view.toggleReadOnly();
    t.equal(result2, false);
    t.equal(view.isReadOnly(), false);
  });

  t.test('generateQueryId creates unique IDs', async (t) => {
    const view = new SQLQueryView();

    const id1 = view.generateQueryId();
    const id2 = view.generateQueryId();

    t.ok(id1.startsWith('query_'));
    t.ok(id2.startsWith('query_'));
    t.not(id1, id2, 'IDs should be unique');
  });

  t.test('show and hide toggle visibility', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isVisible(), false);

    view.show();
    t.equal(view.isVisible(), true);

    view.hide();
    t.equal(view.isVisible(), false);
  });

  t.test('getQuery and setQuery work with initialized input', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    view.setQuery('SELECT * FROM users');
    t.equal(view.getQuery(), 'SELECT * FROM users');

    view.clearInput();
    t.equal(view.getQuery(), '');
  });

  t.test('pending queries tracking', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.hasPendingQueries(), false);
    t.equal(view.getPendingQueryCount(), 0);

    // Manually add a pending query for testing
    view.pendingQueries.set('test_query', {sql: 'SELECT 1', startTime: Date.now()});

    t.equal(view.hasPendingQueries(), true);
    t.equal(view.getPendingQueryCount(), 1);

    view.cancelPendingQueries();

    t.equal(view.hasPendingQueries(), false);
    t.equal(view.getPendingQueryCount(), 0);
  });

  t.test('handleQueryResult processes success', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    const queryId = 'test_query_1';
    view.pendingQueries.set(queryId, {sql: 'SELECT 1', startTime: Date.now()});

    view.handleQueryResult({
      queryId,
      result: {rows: [{id: 1}]},
    });

    t.equal(view.pendingQueries.has(queryId), false);
    t.equal(view.resultsPanel.resultType, 'select');
  });

  t.test('handleQueryResult processes error', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    const queryId = 'test_query_2';
    view.pendingQueries.set(queryId, {sql: 'SELECT 1', startTime: Date.now()});

    view.handleQueryResult({
      queryId,
      error: 'Test error',
    });

    t.equal(view.pendingQueries.has(queryId), false);
    t.equal(view.resultsPanel.resultType, 'error');
    t.equal(view.resultsPanel.error.message, 'Test error');
  });

  t.test('handleQueryResult ignores unknown query IDs', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    // Should not throw
    view.handleQueryResult({
      queryId: 'unknown_query',
      result: {rows: []},
    });

    t.pass('handled unknown query ID gracefully');
  });

  t.test('executeQuery rejects write in read-only mode', async (t) => {
    const view = new SQLQueryView({readOnlyMode: true});
    view.initialize();

    view.setQuery('INSERT INTO users VALUES (1)');
    const result = await view.executeQuery();

    t.equal(result, false);
    t.equal(view.resultsPanel.resultType, 'error');
    t.ok(view.resultsPanel.error.message.includes('Read-only'));
  });

  t.test('executeQuery allows SELECT in read-only mode', async (t) => {
    const view = new SQLQueryView({readOnlyMode: true});
    view.initialize();

    view.setQuery('SELECT * FROM users');
    const result = await view.executeQuery();

    // Will return true but fail due to no connection
    t.equal(result, true);
  });

  t.test('executeQuery rejects empty query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    view.setQuery('');
    const result = await view.executeQuery();

    t.equal(result, false);
  });

  t.test('executeQuery rejects whitespace-only query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    view.setQuery('   \n\t  ');
    const result = await view.executeQuery();

    t.equal(result, false);
  });

  t.test('getHistory returns query history', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    const history = view.getHistory();
    t.ok(history, 'history returned');
    t.equal(typeof history.add, 'function');
  });

  t.test('getResultsPanel returns results panel', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    const panel = view.getResultsPanel();
    t.ok(panel, 'panel returned');
    t.equal(typeof panel.displayError, 'function');
  });

  t.test('getQueryInput returns query input', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    const input = view.getQueryInput();
    t.ok(input, 'input returned');
    t.equal(typeof input.getValue, 'function');
  });

  t.test('destroy cleans up resources', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    view.pendingQueries.set('test', {sql: 'SELECT 1', startTime: Date.now()});

    view.destroy();

    t.equal(view.queryInput, null);
    t.equal(view.resultsPanel, null);
    t.equal(view.queryHistory, null);
    t.equal(view.pendingQueries.size, 0);
  });

  t.test('handleConfirmation resolves pending confirmation', async (t) => {
    const view = new SQLQueryView();

    let resolved = false;
    let resolvedValue = null;

    view.confirmationCallback = (value) => {
      resolved = true;
      resolvedValue = value;
    };

    view.handleConfirmation(true);

    t.equal(resolved, true);
    t.equal(resolvedValue, true);
    t.equal(view.confirmationCallback, null);
  });

  t.test('handleConfirmation does nothing without callback', async (t) => {
    const view = new SQLQueryView();

    // Should not throw
    view.handleConfirmation(true);
    t.pass('handled missing callback gracefully');
  });

  // Live Query Tests
  t.test('isLiveSelectQuery identifies LIVE SELECT queries', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.isLiveSelectQuery('LIVE SELECT * FROM users'), true);
    t.equal(view.isLiveSelectQuery('  live select id from users'), true);
    t.equal(view.isLiveSelectQuery('LIVE  SELECT * FROM users'), true);
    t.equal(view.isLiveSelectQuery('SELECT * FROM users'), false);
    t.equal(view.isLiveSelectQuery('INSERT INTO users'), false);
  });

  t.test('classifyQuery identifies LIVE SELECT', async (t) => {
    const view = new SQLQueryView();

    t.equal(view.classifyQuery('LIVE SELECT * FROM users'), 'live_select');
    t.equal(view.classifyQuery('live select * from users'), 'live_select');
  });

  t.test('hasActiveLiveQuery returns false when no live query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.equal(view.hasActiveLiveQuery(), false);
    t.equal(view.getActiveLiveQueryId(), null);
    t.equal(view.getLiveQueryStatus(), null);
  });

  t.test('getLiveQueryEventRate returns 0 when no live query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.equal(view.getLiveQueryEventRate(), 0);
  });

  t.test('getLiveQueryPartitions returns empty array when no live query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.same(view.getLiveQueryPartitions(), []);
  });

  t.test('pauseLiveQuery returns false when no live query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.equal(view.pauseLiveQuery(), false);
  });

  t.test('resumeLiveQuery returns false when no live query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.equal(view.resumeLiveQuery(), false);
  });

  t.test('cancelLiveQuery returns false when no live query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.equal(view.cancelLiveQuery(), false);
  });

  t.test('renewLiveQuery returns false when no live query', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.equal(view.renewLiveQuery(), false);
  });

  t.test('getLiveStreamPanel returns panel instance', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.ok(view.getLiveStreamPanel());
  });

  t.test('initialize creates liveStreamPanel', async (t) => {
    const view = new SQLQueryView();
    view.initialize();

    t.ok(view.liveStreamPanel, 'liveStreamPanel created');
  });
});
