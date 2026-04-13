// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import {AdminCLI} from '../../src/cli/index.js';
import {ADMIN_ERROR_MESSAGE} from '../../src/admin/admin-constants.js';
import {EventEmitter} from 'events';

test('AdminCLI logs view switching', async (t) => {
  await t.test(
    'refreshCurrentView renders logs without triggering explicit fetch',
    async (t) => {
      const cli = new AdminCLI();
      const mockLogsView = {
        setData: () => {},
        render: () => ({
          headers: ['Timestamp'],
          rows: [],
          columns: [{key: 'timestamp', label: 'Timestamp', width: 24}],
          selectedIndex: 0,
        }),
      };

      let headerCalls = 0;
      let updateCalls = 0;
      let renderCalls = 0;
      cli.currentView = 'logs';
      cli.viewManager = {
        getCurrentView: () => mockLogsView,
      };
      cli.navigation = {
        getCurrentState: () => ({view: 'logs'}),
      };
      cli.updateHeader = () => {
        headerCalls += 1;
      };
      cli.updateMainTable = () => {
        updateCalls += 1;
      };
      cli.updateDetailPanel = () => {};
      cli.mainTable = {setData: () => {}};
      cli.statusBar = {setContent: () => {}};
      cli.helpOverlay = {
        getStatusBarHints: () => '',
      };
      cli.keyboardHandler = {
        getMode: () => 'normal',
      };
      cli.screen = {
        render: () => {
          renderCalls += 1;
        },
      };
      cli.showingDetail = false;

      cli.refreshCurrentView();

      t.equal(updateCalls, 1, 'should update table for logs view immediately');
      t.equal(headerCalls, 1, 'should update header for logs view immediately');
      t.ok(renderCalls > 0, 'should render screen');
    },
  );

  await t.test(
    'navigate in logs view re-renders selection without triggering refetch',
    async (t) => {
      const cli = new AdminCLI();
      let selectDownCalls = 0;
      let renderCalls = 0;
      let refreshCalls = 0;

      const mockLogsView = {
        selectDown: () => {
          selectDownCalls += 1;
        },
      };

      cli.currentView = 'logs';
      cli.viewManager = {
        getCurrentView: () => mockLogsView,
      };
      cli.renderCurrentView = () => {
        renderCalls += 1;
      };
      cli.refreshCurrentView = () => {
        refreshCalls += 1;
      };

      cli.navigateDown();

      t.equal(selectDownCalls, 1, 'should move selection');
      t.equal(renderCalls, 1, 'should re-render current rows');
      t.equal(refreshCalls, 0, 'should not refetch logs while navigating');
    },
  );
});

test('AdminCLI event handling', async (t) => {
  await t.test(
    're-renders current view when active view emits view:refresh',
    async (t) => {
      const {EventEmitter} = await import('events');
      const cli = new AdminCLI();
      const bus = new EventEmitter();
      const mockLogsView = {
        render: () => ({
          headers: ['Timestamp'],
          rows: [{
            values: ['2026-02-16 00:00:00.000', 'INFO', 'node-1', 'svc', 'hello'],
            status: 'normal',
            isChanged: false,
            isSelected: true,
          }],
          columns: [
            {key: 'timestamp', label: 'Timestamp', width: 24},
            {key: 'level', label: 'Level', width: 8},
            {key: 'node_id', label: 'Node ID', width: 15},
            {key: 'service_id', label: 'Service ID', width: 20},
            {key: 'message', label: 'Message', width: 60},
          ],
          selectedIndex: 0,
        }),
      };

      let updateCalls = 0;
      let headerCalls = 0;
      let renderCalls = 0;

      cli.eventBus = bus;
      cli.currentView = 'logs';
      cli.viewManager = {
        getCurrentView: () => mockLogsView,
      };
      cli.navigation = {
        getCurrentState: () => ({view: 'logs'}),
      };
      cli.updateMainTable = () => {
        updateCalls += 1;
      };
      cli.updateHeader = () => {
        headerCalls += 1;
      };
      cli.updateDetailPanel = () => {};
      cli.screen = {
        render: () => {
          renderCalls += 1;
        },
      };
      cli.showingDetail = false;

      cli.setupEventHandlers();
      bus.emit('view:refresh', {view: mockLogsView});

      t.equal(updateCalls, 1, 'should update table when active view refreshes');
      t.equal(headerCalls, 1, 'should update header when active view refreshes');
      t.equal(renderCalls, 1, 'should render screen when active view refreshes');
    },
  );

  await t.test(
    'does not trigger cache-driven refresh loop while viewing logs',
    async (t) => {
      const {EventEmitter} = await import('events');
      const cli = new AdminCLI();
      const bus = new EventEmitter();
      let refreshCalls = 0;

      cli.eventBus = bus;
      cli.currentView = 'logs';
      cli.cdcPaused = false;
      cli.refreshCurrentView = () => {
        refreshCalls += 1;
      };

      cli.setupEventHandlers();
      bus.emit('cache:update');

      t.equal(refreshCalls, 0, 'should ignore cache updates in logs view');
    },
  );

  await t.test(
    'continues refreshing cache-driven views outside logs',
    async (t) => {
      const {EventEmitter} = await import('events');
      const cli = new AdminCLI();
      const bus = new EventEmitter();
      let refreshCalls = 0;

      cli.eventBus = bus;
      cli.currentView = 'nodes';
      cli.cdcPaused = false;
      cli.refreshCurrentView = () => {
        refreshCalls += 1;
      };

      cli.setupEventHandlers();
      bus.emit('cache:update');

      t.equal(refreshCalls, 1, 'should refresh non-logs views on cache updates');
    },
  );
});

test('AdminCLI view registration', async (t) => {
  await t.test('enables live query updates for logs view', async (t) => {
    const cli = new AdminCLI();
    cli.initializeComponents();
    cli.screen = {render: () => {}};

    cli.registerViews();
    const logsView = cli.viewManager.getView('logs');

    t.ok(logsView, 'should register logs view');
    t.equal(
      logsView.liveQueryEnabled,
      true,
      'should enable live query updates for logs view',
    );
  });
});

test('AdminCLI status messaging', async (t) => {
  await t.test('labels services table count as replicas in connected status',
    async (t) => {
      const cli = new AdminCLI();
      let statusMessage = '';

      cli.screen = {render: () => {}};
      cli.cache = {
        loadFromDump: () => {},
        getStats: () => ({
          tableCounts: {
            nodes: 1,
            services: 93,
            tables: 12,
          },
        }),
      };
      cli.connectionManager = {
        connect: async () => {},
      };
      cli.updateStatus = (message) => {
        statusMessage = message;
      };
      cli.switchView = () => {};
      cli.refreshCurrentView = () => {};
      cli.initialCacheLoaded = false;

      await cli.connect('localhost:8081');
      cli.connectionManager.onCacheDump({});

      t.match(
        statusMessage,
        /93 replicas/,
        'should refer to replica inventory as replicas',
      );
    });
});

test('AdminCLI live query fallback', async (t) => {
  await t.test(
    'surfaces live-query-unavailable error in logs view',
    async (t) => {
      const cli = new AdminCLI();
      let shownErrors = 0;
      let lastErrorMessage = '';

      cli.currentView = 'logs';
      cli.viewManager = {
        getView: () => null,
      };
      cli.screen = {render: () => {}};
      cli.connectionManager = {
        connect: async () => {},
      };
      cli.showError = (message) => {
        shownErrors += 1;
        lastErrorMessage = message;
      };

      await cli.connect('localhost:8081');
      cli.connectionManager.onError(
        new Error(ADMIN_ERROR_MESSAGE.LIVE_QUERY_MANAGER_UNAVAILABLE),
      );

      t.equal(shownErrors, 1, 'should show error for missing live query manager');
      t.match(lastErrorMessage, /Live query manager .*not available/);
    },
  );
});

test('AdminCLI logs since command', async (t) => {
  await t.test('executes since command against logs view', async (t) => {
    const cli = new AdminCLI();
    let setSinceCalls = 0;
    let receivedValue = null;
    let refreshCalls = 0;
    const logsView = {
      setLiveWindowStartTime: (value) => {
        setSinceCalls += 1;
        receivedValue = value;
      },
    };

    cli.currentView = 'logs';
    cli.viewManager = {
      getView: () => logsView,
    };
    cli.refreshCurrentView = () => {
      refreshCalls += 1;
    };
    cli.showError = () => {};

    cli.executeCommand('since', ['-5m']);

    t.equal(setSinceCalls, 1, 'should update logs live window start');
    t.equal(receivedValue, '-5m', 'should pass since argument through');
    t.equal(refreshCalls, 1, 'should refresh logs view after changing since');
  });
});

test('AdminCLI node management commands', async (t) => {
  await t.test('drain command sends node status update and refreshes', async (t) => {
    const cli = new AdminCLI();
    const eventBus = new EventEmitter();
    let sentQuery = null;
    let refreshCalls = 0;
    let lastStatus = null;
    let shownError = null;

    cli.eventBus = eventBus;
    cli.connectionManager = {
      sendQuery: (queryId, sql, params) => {
        sentQuery = {queryId, sql, params};
        return true;
      },
    };
    cli.updateStatus = (message) => {
      lastStatus = message;
    };
    cli.forceRefresh = () => {
      refreshCalls += 1;
    };
    cli.showError = (message) => {
      shownError = message;
    };

    cli.executeCommand('drain', ['node-1']);

    t.match(sentQuery.sql, /UPDATE nodes SET status = \?1 WHERE node_id = \?2/);
    t.same(sentQuery.params, ['draining', 'node-1'], 'should send draining update');
    t.match(lastStatus, /draining node node-1/i, 'should show pending status');

    eventBus.emit('query:result', {
      queryId: sentQuery.queryId,
      affectedRows: 1,
    });

    t.equal(refreshCalls, 1, 'should refresh after successful mutation');
    t.equal(shownError, null, 'should not show error on success');
  });

  await t.test('remove-node command is blocked in read-only mode', async (t) => {
    const cli = new AdminCLI();
    let shownError = null;
    let sendCalls = 0;

    cli.readOnlyMode = true;
    cli.eventBus = new EventEmitter();
    cli.connectionManager = {
      sendQuery: () => {
        sendCalls += 1;
        return true;
      },
    };
    cli.showError = (message) => {
      shownError = message;
    };

    cli.executeCommand('remove-node', ['node-9']);

    t.equal(sendCalls, 0, 'should not send mutation in read-only mode');
    t.match(
        shownError,
        /read-only mode/,
        'should explain why node management command was rejected',
    );
  });
});
