import {test} from '../../../src/test-helpers/tap.js';
import {LogsView, LOG_LEVELS, LOG_LEVEL_COLORS} from
  '../../../src/cli/views/logs-view.js';
import {ROW_STATUS} from '../../../src/cli/core/base-view.js';

/**
 * Create a sample log record
 * @param {Object} overrides - Field overrides
 * @return {Object} Log record
 */
function createLog(overrides = {}) {
  return {
    log_id: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    node_id: 'node-1',
    service_id: 'service-1',
    message: 'Test log message',
    ...overrides,
  };
}

test('LogsView', async (t) => {
  t.test('constructor initializes with default state', async (t) => {
    const view = new LogsView();

    t.equal(view.viewName, 'logs');
    t.equal(view.cache, null);
    t.equal(view.selectedIndex, 0);
    t.equal(view.levelFilter, null);
    t.equal(view.nodeFilter, null);
    t.equal(view.serviceFilter, null);
    t.equal(view.sortColumn, 'timestamp');
    t.equal(view.sortDirection, 'desc');
  });

  t.test('getColumns returns correct column definitions', async (t) => {
    const view = new LogsView();
    const columns = view.getColumns();

    t.equal(columns.length, 5);
    t.equal(columns[0].key, 'timestamp');
    t.equal(columns[0].label, 'Timestamp');
    t.equal(columns[1].key, 'level');
    t.equal(columns[2].key, 'node_id');
    t.equal(columns[3].key, 'service_id');
    t.equal(columns[4].key, 'message');
  });

  t.test('formatRow formats log data correctly', async (t) => {
    const view = new LogsView();
    const timestamp = new Date('2025-01-18T10:30:00.000Z').getTime();
    const log = createLog({timestamp, level: 'ERROR'});

    const row = view.formatRow(log);

    t.equal(row[0], '2025-01-18 10:30:00.000');
    t.equal(row[1], 'ERROR');
    t.equal(row[2], 'node-1');
    t.equal(row[3], 'service-1');
    t.equal(row[4], 'Test log message');
  });

  t.test('formatRow handles missing values', async (t) => {
    const view = new LogsView();
    const log = {
      log_id: 'log-1',
      timestamp: null,
      level: null,
      node_id: null,
      service_id: null,
      message: null,
    };

    const row = view.formatRow(log);

    t.equal(row[0], 'N/A');
    t.equal(row[1], 'INFO');
    t.equal(row[2], 'N/A');
    t.equal(row[3], 'N/A');
    t.equal(row[4], '');
  });

  t.test('formatRow falls back to created_at timestamp', async (t) => {
    const view = new LogsView();
    const createdAt = new Date('2025-01-18T10:30:00.000Z').getTime();
    const log = createLog({
      timestamp: null,
      created_at: createdAt,
    });

    const row = view.formatRow(log);

    t.equal(row[0], '2025-01-18 10:30:00.000');
  });

  t.test('formatTimestamp handles various formats', async (t) => {
    const view = new LogsView();

    // Numeric timestamp
    const ts1 = new Date('2025-01-18T10:30:00.000Z').getTime();
    t.equal(view.formatTimestamp(ts1), '2025-01-18 10:30:00.000');

    // Numeric-string timestamp (epoch ms)
    t.equal(
      view.formatTimestamp(String(ts1)),
      '2025-01-18 10:30:00.000',
    );

    // Epoch seconds (number and string) should be normalized to ms
    const tsSeconds = Math.floor(ts1 / 1000);
    t.equal(view.formatTimestamp(tsSeconds), '2025-01-18 10:30:00.000');
    t.equal(view.formatTimestamp(String(tsSeconds)), '2025-01-18 10:30:00.000');

    // ISO string
    t.equal(view.formatTimestamp('2025-01-18T10:30:00.000Z'),
      '2025-01-18 10:30:00.000');

    // Null/undefined
    t.equal(view.formatTimestamp(null), 'N/A');
    t.equal(view.formatTimestamp(undefined), 'N/A');

    // Invalid
    t.equal(view.formatTimestamp('invalid'), 'N/A');
  });

  t.test('truncateMessage truncates long messages', async (t) => {
    const view = new LogsView();

    // Short message
    t.equal(view.truncateMessage('Short'), 'Short');

    // Long message
    const longMsg = 'A'.repeat(100);
    const truncated = view.truncateMessage(longMsg, 80);
    t.equal(truncated.length, 80);
    t.ok(truncated.endsWith('...'));

    // Message with newlines
    t.equal(view.truncateMessage('Line1\nLine2\nLine3'), 'Line1 Line2 Line3');

    // Null/undefined
    t.equal(view.truncateMessage(null), '');
    t.equal(view.truncateMessage(undefined), '');
  });

  t.test('getRowStatus returns ERROR for ERROR level', async (t) => {
    const view = new LogsView();
    const log = createLog({level: 'ERROR'});

    t.equal(view.getRowStatus(log), ROW_STATUS.ERROR);
  });

  t.test('getRowStatus returns WARNING for WARN level', async (t) => {
    const view = new LogsView();
    const log = createLog({level: 'WARN'});

    t.equal(view.getRowStatus(log), ROW_STATUS.WARNING);
  });

  t.test('getRowStatus returns NORMAL for INFO level', async (t) => {
    const view = new LogsView();
    const log = createLog({level: 'INFO'});

    t.equal(view.getRowStatus(log), ROW_STATUS.NORMAL);
  });

  t.test('getRowStatus handles case insensitivity', async (t) => {
    const view = new LogsView();

    t.equal(view.getRowStatus(createLog({level: 'error'})), ROW_STATUS.ERROR);
    t.equal(view.getRowStatus(createLog({level: 'warn'})), ROW_STATUS.WARNING);
    t.equal(view.getRowStatus(createLog({level: 'info'})), ROW_STATUS.NORMAL);
  });

  t.test('getLevelColor returns correct colors', async (t) => {
    const view = new LogsView();

    t.equal(view.getLevelColor('ERROR'), 'red');
    t.equal(view.getLevelColor('WARN'), 'yellow');
    t.equal(view.getLevelColor('INFO'), 'white');
    t.equal(view.getLevelColor('DEBUG'), 'gray');
    t.equal(view.getLevelColor('TRACE'), 'gray');
    t.equal(view.getLevelColor(null), 'white');
  });

  t.test('getItemKey returns log_id', async (t) => {
    const view = new LogsView();
    const log = createLog({log_id: 'test-log-123'});

    t.equal(view.getItemKey(log), 'test-log-123');
  });

  t.test('setLevelFilter filters by level', async (t) => {
    const view = new LogsView();
    const logs = [
      createLog({log_id: 'log-1', level: 'ERROR'}),
      createLog({log_id: 'log-2', level: 'WARN'}),
      createLog({log_id: 'log-3', level: 'INFO'}),
    ];
    view.setData(logs);
    view.setLevelFilter('ERROR');

    t.equal(view.filteredData.length, 1);
    t.equal(view.filteredData[0].level, 'ERROR');
  });

  t.test('setNodeFilter filters by node_id', async (t) => {
    const view = new LogsView();
    const logs = [
      createLog({log_id: 'log-1', node_id: 'node-1'}),
      createLog({log_id: 'log-2', node_id: 'node-2'}),
      createLog({log_id: 'log-3', node_id: 'node-1'}),
    ];
    view.setData(logs);
    view.setNodeFilter('node-1');

    t.equal(view.filteredData.length, 2);
  });

  t.test('setServiceFilter filters by service_id', async (t) => {
    const view = new LogsView();
    const logs = [
      createLog({log_id: 'log-1', service_id: 'svc-1'}),
      createLog({log_id: 'log-2', service_id: 'svc-2'}),
      createLog({log_id: 'log-3', service_id: 'svc-1'}),
    ];
    view.setData(logs);
    view.setServiceFilter('svc-1');

    t.equal(view.filteredData.length, 2);
  });

  t.test('setTimeRangeFilter filters by time range', async (t) => {
    const view = new LogsView();
    const now = Date.now();
    const logs = [
      createLog({log_id: 'log-1', timestamp: now - 3000}),
      createLog({log_id: 'log-2', timestamp: now - 2000}),
      createLog({log_id: 'log-3', timestamp: now - 1000}),
    ];
    view.setData(logs);
    view.setTimeRangeFilter(now - 2500, now - 500);

    t.equal(view.filteredData.length, 2);
  });

  t.test('setMessageFilter filters by message content', async (t) => {
    const view = new LogsView();
    const logs = [
      createLog({log_id: 'log-1', message: 'Connection established'}),
      createLog({log_id: 'log-2', message: 'Error occurred'}),
      createLog({log_id: 'log-3', message: 'Connection closed'}),
    ];
    view.setData(logs);
    view.setMessageFilter('Connection');

    t.equal(view.filteredData.length, 2);
  });

  t.test('clearAllFilters clears all filters', async (t) => {
    const view = new LogsView();
    view.setLevelFilter('ERROR');
    view.setNodeFilter('node-1');
    view.setServiceFilter('svc-1');
    view.setMessageFilter('test');
    view.setTimeRangeFilter(1000, 2000);

    view.clearAllFilters();

    t.equal(view.levelFilter, null);
    t.equal(view.nodeFilter, null);
    t.equal(view.serviceFilter, null);
    t.equal(view.messageFilter, null);
    t.equal(view.startTimeFilter, null);
    t.equal(view.endTimeFilter, null);
  });

  t.test('applySort sorts by timestamp descending by default', async (t) => {
    const view = new LogsView();
    const now = Date.now();
    const logs = [
      createLog({log_id: 'log-1', timestamp: now - 2000}),
      createLog({log_id: 'log-2', timestamp: now - 1000}),
      createLog({log_id: 'log-3', timestamp: now - 3000}),
    ];
    view.setData(logs);

    // Default sort is timestamp desc
    t.equal(view.filteredData[0].log_id, 'log-2');
    t.equal(view.filteredData[1].log_id, 'log-1');
    t.equal(view.filteredData[2].log_id, 'log-3');
  });

  t.test('applySort sorts by timestamp ascending', async (t) => {
    const view = new LogsView();
    const now = Date.now();
    const logs = [
      createLog({log_id: 'log-1', timestamp: now - 2000}),
      createLog({log_id: 'log-2', timestamp: now - 1000}),
      createLog({log_id: 'log-3', timestamp: now - 3000}),
    ];
    view.setData(logs);
    view.setSort('timestamp', 'asc');

    t.equal(view.filteredData[0].log_id, 'log-3');
    t.equal(view.filteredData[1].log_id, 'log-1');
    t.equal(view.filteredData[2].log_id, 'log-2');
  });

  t.test('applySort normalizes mixed timestamp formats', async (t) => {
    const view = new LogsView();
    const baseMs = Date.parse('2025-01-18T10:30:00.000Z');
    const logs = [
      createLog({log_id: 'log-ms', timestamp: String(baseMs)}),
      createLog({
        log_id: 'log-seconds-string',
        timestamp: String(Math.floor((baseMs + 1000) / 1000)),
      }),
      createLog({
        log_id: 'log-seconds-number',
        timestamp: Math.floor((baseMs + 2000) / 1000),
      }),
    ];

    view.setData(logs);

    t.same(
      view.filteredData.map((log) => log.log_id),
      ['log-seconds-number', 'log-seconds-string', 'log-ms'],
    );
  });

  t.test('applySort uses deterministic tie-breakers for identical timestamps', async (t) => {
    const view = new LogsView();
    const ts = Date.parse('2025-01-18T10:30:00.000Z');
    const logs = [
      createLog({
        log_id: 'log-c',
        timestamp: ts,
        created_at: ts,
      }),
      createLog({
        log_id: 'log-a',
        timestamp: ts,
        created_at: ts + 1,
      }),
      createLog({
        log_id: 'log-b',
        timestamp: ts,
        created_at: ts + 1,
      }),
    ];

    view.setData(logs);

    t.same(
      view.filteredData.map((log) => log.log_id),
      ['log-b', 'log-a', 'log-c'],
    );
  });

  t.test('handleDrillDown returns detail action', async (t) => {
    const view = new LogsView();
    view.setData([createLog({log_id: 'log-1'})]);

    const action = view.handleDrillDown();

    t.equal(action.action, 'showDetail');
    t.equal(action.view, 'logs');
    t.equal(action.context.logId, 'log-1');
    t.ok(action.detail);
  });

  t.test('handleDrillDown returns null when no selection', async (t) => {
    const view = new LogsView();
    view.setData([]);

    const action = view.handleDrillDown();

    t.equal(action, null);
  });

  t.test('getSelectedDetails returns log details', async (t) => {
    const view = new LogsView();
    view.setData([createLog({
      log_id: 'log-1',
      metadata: {key1: 'value1', key2: 'value2'},
    })]);

    const details = view.getSelectedDetails();

    t.equal(details.title, 'Log: log-1');
    t.equal(details.sections.length, 3);
    t.equal(details.sections[0].title, 'Log Entry');
    t.equal(details.sections[1].title, 'Message');
    t.equal(details.sections[2].title, 'Metadata');
  });

  t.test('getSelectedDetails returns null when no selection', async (t) => {
    const view = new LogsView();
    view.setData([]);

    const details = view.getSelectedDetails();

    t.equal(details, null);
  });

  t.test('getSelectedDetails includes all log fields', async (t) => {
    const view = new LogsView();
    const timestamp = Date.now();
    view.setData([createLog({
      log_id: 'log-1',
      timestamp,
      level: 'ERROR',
      node_id: 'node-1',
      service_id: 'svc-1',
      message: 'Test error message',
    })]);

    const details = view.getSelectedDetails();

    t.equal(details.sections[0].fields.length, 5);
    t.equal(details.sections[0].fields[0].label, 'Log ID');
    t.equal(details.sections[0].fields[0].value, 'log-1');
    t.equal(details.sections[0].fields[2].label, 'Level');
    t.equal(details.sections[0].fields[2].value, 'ERROR');
  });

  t.test('getSelectedDetails handles nested metadata', async (t) => {
    const view = new LogsView();
    view.setData([createLog({
      log_id: 'log-1',
      metadata: {nested: {key: 'value'}},
    })]);

    const details = view.getSelectedDetails();

    t.equal(details.sections[2].title, 'Metadata');
    t.ok(details.sections[2].fields[0].value.includes('key'));
  });

  t.test('streaming is enabled by default', async (t) => {
    const view = new LogsView();

    t.equal(view.isStreamingEnabled(), true);
  });

  t.test('setStreamingEnabled toggles streaming', async (t) => {
    const view = new LogsView();

    view.setStreamingEnabled(false);
    t.equal(view.isStreamingEnabled(), false);

    view.setStreamingEnabled(true);
    t.equal(view.isStreamingEnabled(), true);
  });

  t.test('getTimeRange returns correct range', async (t) => {
    const view = new LogsView();
    const now = Date.now();
    const logs = [
      createLog({log_id: 'log-1', timestamp: now - 3000}),
      createLog({log_id: 'log-2', timestamp: now - 1000}),
      createLog({log_id: 'log-3', timestamp: now - 2000}),
    ];
    view.setData(logs);

    const range = view.getTimeRange();

    t.equal(range.start, now - 3000);
    t.equal(range.end, now - 1000);
  });

  t.test('getTimeRange falls back to created_at timestamps', async (t) => {
    const view = new LogsView();
    const baseMs = Date.parse('2025-01-18T10:30:00.000Z');
    const logs = [
      createLog({log_id: 'log-1', timestamp: null, created_at: baseMs}),
      createLog({
        log_id: 'log-2',
        timestamp: null,
        created_at: baseMs + 1000,
      }),
    ];
    view.setData(logs);

    const range = view.getTimeRange();

    t.equal(range.start, baseMs);
    t.equal(range.end, baseMs + 1000);
  });

  t.test('getTimeRange returns null for empty data', async (t) => {
    const view = new LogsView();
    view.setData([]);

    const range = view.getTimeRange();

    t.equal(range.start, null);
    t.equal(range.end, null);
  });

  t.test('getStatusBarInfo returns correct info', async (t) => {
    const view = new LogsView();
    const logs = [
      createLog({log_id: 'log-1'}),
      createLog({log_id: 'log-2'}),
    ];
    view.setData(logs);
    view.setLevelFilter('ERROR');

    const info = view.getStatusBarInfo();

    t.equal(info.totalCount, 2);
    t.ok(info.activeFilters.includes('Level: ERROR'));
  });

  t.test('render includes status bar info', async (t) => {
    const view = new LogsView();
    view.setData([createLog()]);

    const result = view.render();

    t.ok(result.statusBar);
    t.equal(result.statusBar.logCount, 1);
  });

  t.test('multiple filters combine correctly', async (t) => {
    const view = new LogsView();
    const logs = [
      createLog({log_id: 'log-1', level: 'ERROR', node_id: 'node-1'}),
      createLog({log_id: 'log-2', level: 'ERROR', node_id: 'node-2'}),
      createLog({log_id: 'log-3', level: 'WARN', node_id: 'node-1'}),
      createLog({log_id: 'log-4', level: 'INFO', node_id: 'node-1'}),
    ];
    view.setData(logs);
    view.setLevelFilter('ERROR');
    view.setNodeFilter('node-1');

    t.equal(view.filteredData.length, 1);
    t.equal(view.filteredData[0].log_id, 'log-1');
  });

  t.test('exportLogs exports as JSON by default', async (t) => {
    const view = new LogsView();
    const logs = [createLog({log_id: 'log-1', message: 'Test'})];
    view.setData(logs);

    const exported = view.exportLogs();
    const parsed = JSON.parse(exported);

    t.equal(parsed.length, 1);
    t.equal(parsed[0].log_id, 'log-1');
  });

  t.test('exportLogs exports as CSV', async (t) => {
    const view = new LogsView();
    const logs = [createLog({
      log_id: 'log-1',
      level: 'ERROR',
      node_id: 'node-1',
      service_id: 'svc-1',
      message: 'Test message',
    })];
    view.setData(logs);

    const exported = view.exportLogs('csv');
    const lines = exported.split('\n');

    t.equal(lines[0], 'timestamp,level,node_id,service_id,message');
    t.ok(lines[1].includes('ERROR'));
    t.ok(lines[1].includes('node-1'));
  });

  t.test('exportLogs CSV escapes special characters', async (t) => {
    const view = new LogsView();
    const logs = [createLog({
      log_id: 'log-1',
      message: 'Message with, comma and "quotes"',
    })];
    view.setData(logs);

    const exported = view.exportLogs('csv');

    t.ok(exported.includes('""'));
  });

  t.test('exportLogs exports as text', async (t) => {
    const view = new LogsView();
    const logs = [createLog({
      log_id: 'log-1',
      level: 'ERROR',
      node_id: 'node-1',
      service_id: 'svc-1',
      message: 'Test message',
    })];
    view.setData(logs);

    const exported = view.exportLogs('text');

    t.ok(exported.includes('ERROR'));
    t.ok(exported.includes('[node-1]'));
    t.ok(exported.includes('[svc-1]'));
    t.ok(exported.includes('Test message'));
  });

  t.test('exportLogs handles empty data', async (t) => {
    const view = new LogsView();
    view.setData([]);

    const jsonExport = view.exportLogs('json');
    t.equal(jsonExport, '[]');

    const csvExport = view.exportLogs('csv');
    t.equal(csvExport, 'timestamp,level,node_id,service_id,message');

    const textExport = view.exportLogs('text');
    t.equal(textExport, 'No logs to export');
  });

  t.test('getExportMetadata returns correct metadata', async (t) => {
    const view = new LogsView();
    const logs = [
      createLog({log_id: 'log-1'}),
      createLog({log_id: 'log-2'}),
    ];
    view.setData(logs);
    view.setLevelFilter('ERROR');

    const metadata = view.getExportMetadata();

    t.equal(metadata.totalLogs, 2);
    t.equal(metadata.filters.level, 'ERROR');
    t.ok(metadata.exportedAt);
  });
});

test('LOG_LEVELS constant', async (t) => {
  t.same(LOG_LEVELS, ['ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE']);
});

test('LOG_LEVEL_COLORS constant', async (t) => {
  t.equal(LOG_LEVEL_COLORS.ERROR, 'red');
  t.equal(LOG_LEVEL_COLORS.WARN, 'yellow');
  t.equal(LOG_LEVEL_COLORS.INFO, 'white');
  t.equal(LOG_LEVEL_COLORS.DEBUG, 'gray');
  t.equal(LOG_LEVEL_COLORS.TRACE, 'gray');
});

test('buildLogsQuery', async (t) => {
  t.test('returns unfiltered query with no filters', async (t) => {
    const view = new LogsView();
    const {sql, params} = view.buildLogsQuery();

    t.ok(sql.startsWith('SELECT * FROM logs'));
    t.ok(sql.includes('ORDER BY timestamp DESC, created_at DESC, log_id DESC'));
    t.ok(sql.includes('LIMIT'));
    t.equal(params.length, 0);
  });

  t.test('adds level WHERE clause', async (t) => {
    const view = new LogsView();
    view.levelFilter = 'ERROR';
    const {sql, params} = view.buildLogsQuery();

    t.ok(sql.includes('WHERE'));
    t.ok(sql.includes('level = ?1'));
    t.equal(params[0], 'ERROR');
  });

  t.test('adds node_id WHERE clause', async (t) => {
    const view = new LogsView();
    view.nodeFilter = 'node-1';
    const {sql, params} = view.buildLogsQuery();

    t.ok(sql.includes('node_id = ?1'));
    t.equal(params[0], 'node-1');
  });

  t.test('adds message LIKE clause', async (t) => {
    const view = new LogsView();
    view.messageFilter = 'timeout';
    const {sql, params} = view.buildLogsQuery();

    t.ok(sql.includes('message LIKE ?1'));
    t.equal(params[0], '%timeout%');
  });

  t.test('combines multiple filters with AND', async (t) => {
    const view = new LogsView();
    view.levelFilter = 'WARN';
    view.nodeFilter = 'node-2';
    const {sql, params} = view.buildLogsQuery();

    t.ok(sql.includes('level = ?1'));
    t.ok(sql.includes('node_id = ?2'));
    t.ok(sql.includes(' AND '));
    t.equal(params.length, 2);
    t.equal(params[0], 'WARN');
    t.equal(params[1], 'node-2');
  });
});

test('logs live query mode', async (t) => {
  t.test('show anchors logs window to view-entry time and starts subscription', async (t) => {
    const subscriptions = [];
    const mockLiveQueryManager = {
      subscribe: (sql) => {
        subscriptions.push(sql);
        return 'lq_0';
      },
      cancel: () => true,
    };
    const view = new LogsView({
      connectionManager: {sendQuery: () => true},
      liveQueryManager: mockLiveQueryManager,
      liveQueryEnabled: true,
    });
    const originalNow = Date.now;
    Date.now = () => 1771263051905;

    try {
      view.show();
    } finally {
      Date.now = originalNow;
    }

    t.equal(view.startTimeFilter, 1771263051905);
    t.equal(subscriptions.length, 1, 'should subscribe on view entry');
    t.match(subscriptions[0], /LIVE SELECT \* FROM logs/i);
    t.match(subscriptions[0], /timestamp >= 1771263051905/);
  });

  t.test('fetchLogs uses live query only and does not send one-shot SQL', async (t) => {
    const subscriptions = [];
    let sendQueryCalls = 0;
    const mockLiveQueryManager = {
      subscribe: (sql) => {
        subscriptions.push(sql);
        return 'lq_0';
      },
      cancel: () => true,
    };
    const view = new LogsView({
      connectionManager: {
        sendQuery: () => {
          sendQueryCalls += 1;
          return true;
        },
      },
      liveQueryManager: mockLiveQueryManager,
      liveQueryEnabled: true,
    });

    view.fetchLogs();

    t.equal(subscriptions.length, 1, 'should subscribe to live query');
    t.equal(sendQueryCalls, 0, 'should not run hybrid snapshot query path');
  });

  t.test('ignores external setData in live-query mode', async (t) => {
    const view = new LogsView({
      connectionManager: {},
      liveQueryManager: {
        subscribe: () => 'lq_0',
        cancel: () => true,
      },
      liveQueryEnabled: true,
    });

    view.setData([
      {log_id: 'cache-1', timestamp: 10, level: 'INFO', message: 'cache'},
    ]);
    t.equal(view.data.length, 0, 'should ignore non-live data injection');

    view.applySnapshotRows([
      {log_id: 'live-1', timestamp: 20, level: 'INFO', message: 'live'},
    ]);
    t.equal(view.data.length, 1, 'should accept live-query snapshot data');
    t.equal(view.data[0].log_id, 'live-1');
  });

  t.test('reuses live query subscription when filters are unchanged', async (t) => {
    const subscriptions = [];
    const cancelled = [];
    const mockLiveQueryManager = {
      subscribe: (sql) => {
        const id = `lq_${subscriptions.length}`;
        subscriptions.push({id, sql});
        return id;
      },
      cancel: (id) => {
        cancelled.push(id);
        return true;
      },
    };
    const view = new LogsView({
      connectionManager: {},
      liveQueryManager: mockLiveQueryManager,
      liveQueryEnabled: true,
    });

    view.fetchLogs();
    const firstSubscriptionId = view.activeSubscriptionId;
    view.fetchLogs();

    t.equal(subscriptions.length, 1, 'should avoid re-subscribing live query');
    t.equal(cancelled.length, 0, 'should avoid cancelling active live query');
    t.equal(view.activeSubscriptionId, firstSubscriptionId,
      'should keep existing live query subscription');
  });

  t.test('setLiveWindowStartTime updates live query start boundary', async (t) => {
    const subscriptions = [];
    const cancelled = [];
    let nextSubscriptionNumber = 0;
    const mockLiveQueryManager = {
      subscribe: (sql) => {
        subscriptions.push(sql);
        return `lq_${nextSubscriptionNumber++}`;
      },
      cancel: (id) => {
        cancelled.push(id);
        return true;
      },
    };
    const view = new LogsView({
      connectionManager: {},
      liveQueryManager: mockLiveQueryManager,
      liveQueryEnabled: true,
    });

    view.fetchLogs();
    view.setLiveWindowStartTime('-5m');

    t.equal(cancelled.length, 1, 'should replace previous subscription');
    t.equal(subscriptions.length, 2, 'should subscribe with updated time window');
  });

  t.test('hide cancels active live query subscription', async (t) => {
    const cancelled = [];
    const mockLiveQueryManager = {
      subscribe: () => 'lq_0',
      cancel: (id) => {
        cancelled.push(id);
        return true;
      },
    };
    const view = new LogsView({
      connectionManager: {},
      liveQueryManager: mockLiveQueryManager,
      liveQueryEnabled: true,
    });

    view.fetchLogs();
    view.hide();

    t.same(cancelled, ['lq_0']);
  });

  t.test('applies snapshot rows from live query snapshot events', async (t) => {
    const {EventBus} = await import('../../../src/cli/core/event-bus.js');
    const bus = new EventBus();
    const mockLiveQueryManager = {
      subscribe: () => 'lq_snapshot',
      cancel: () => true,
    };
    const view = new LogsView({
      connectionManager: {},
      liveQueryManager: mockLiveQueryManager,
      eventBus: bus,
      liveQueryEnabled: true,
    });

    view.fetchLogs();
    bus.emit('livequery:event', {
      subscriptionId: 'lq_snapshot',
      eventType: 'SNAPSHOT',
      data: [
        {log_id: 'l1', level: 'INFO', message: 'first', timestamp: 100},
        {log_id: 'l2', level: 'ERROR', message: 'second', timestamp: 90},
      ],
    });

    t.equal(view.data.length, 2);
    t.equal(view.data[0].log_id, 'l1');
  });

  t.test('handles livequery:event for incremental inserts', async (t) => {
    const {EventBus} = await import('../../../src/cli/core/event-bus.js');
    const bus = new EventBus();
    const mockLiveQueryManager = {
      subscribe: () => 'lq_event_test',
      cancel: () => true,
    };
    const view = new LogsView({
      connectionManager: {},
      liveQueryManager: mockLiveQueryManager,
      eventBus: bus,
      liveQueryEnabled: true,
    });

    view.fetchLogs();
    bus.emit('livequery:event', {
      subscriptionId: 'lq_event_test',
      eventType: 'SNAPSHOT',
      data: [
        {log_id: 'l1', level: 'INFO', message: 'first', timestamp: 100},
      ],
    });

    bus.emit('livequery:event', {
      subscriptionId: 'lq_event_test',
      eventType: 'INSERT',
      data: {log_id: 'l3', level: 'WARN', message: 'new', timestamp: 300},
    });

    t.equal(view.data.length, 2, 'should add new log entry');
    t.equal(view.filteredData[0].log_id, 'l3');
  });
});
